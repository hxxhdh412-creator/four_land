const test = require('node:test');
const assert = require('node:assert/strict');

const {
  authenticateCmsRequest,
  bearerToken,
  verifySupabaseUser
} = require('../server/cms-authentication');

const token = 'header.payload.signature-with-safe-length';
const request = { headers: { authorization: `Bearer ${token}` } };
const config = { url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test' };

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('extracts only a bounded Bearer access token', () => {
  assert.equal(bearerToken(request), token);
  assert.throws(() => bearerToken({ headers: {} }), error => error.code === 'AUTH_REQUIRED');
  assert.throws(() => bearerToken({ headers: { authorization: 'Basic abc' } }), error => error.statusCode === 401);
  assert.throws(() => bearerToken({ headers: { authorization: 'Bearer short' } }), error => error.code === 'AUTH_INVALID');
});

test('verifies the token against Supabase Auth user endpoint', async () => {
  let captured;
  const user = await verifySupabaseUser(token, config, async (url, options) => {
    captured = { url, options };
    return response(200, { id: 'user-1', email: 'admin@fourland.vn' });
  });
  assert.deepEqual(user, { id: 'user-1', email: 'admin@fourland.vn' });
  assert.equal(captured.url, 'https://project.supabase.co/auth/v1/user');
  assert.equal(captured.options.headers.apikey, 'sb_publishable_test');
  assert.equal(captured.options.headers.Authorization, `Bearer ${token}`);
  assert.equal(captured.options.headers['Cache-Control'], 'no-store');
});

test('rejects invalid or expired Supabase access tokens', async () => {
  await assert.rejects(
    () => verifySupabaseUser(token, config, async () => response(401, { message: 'invalid' })),
    error => error.code === 'AUTH_INVALID' && error.statusCode === 401
  );
});

test('creates an active CMS principal from verified user and profile', async () => {
  const principal = await authenticateCmsRequest(request, {
    config,
    fetchImpl: async () => response(200, { id: 'user-1', email: 'admin@fourland.vn' }),
    loadProfile: async id => ({ id, display_name: 'Nguyễn An', role: 'manager', is_active: true })
  });
  assert.deepEqual(principal, {
    id: 'user-1',
    email: 'admin@fourland.vn',
    displayName: 'Nguyễn An',
    role: 'manager',
    isActive: true
  });
});

test('rejects missing, disabled and invalid-role profiles', async () => {
  const base = { config, fetchImpl: async () => response(200, { id: 'user-1' }) };
  await assert.rejects(() => authenticateCmsRequest(request, { ...base, loadProfile: async () => null }), error => error.code === 'PROFILE_REQUIRED');
  await assert.rejects(() => authenticateCmsRequest(request, { ...base, loadProfile: async () => ({ role: 'viewer', is_active: false }) }), error => error.code === 'ACCOUNT_DISABLED');
  await assert.rejects(() => authenticateCmsRequest(request, { ...base, loadProfile: async () => ({ role: 'owner', is_active: true }) }), error => error.code === 'ROLE_INVALID');
});
