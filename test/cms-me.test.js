const test = require('node:test');
const assert = require('node:assert/strict');

const { ACTIONS } = require('../server/cms-authorization');
const { createHandler } = require('../api/cms-me');

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    json(body) { this.body = body; return this; }
  };
}

test('GET CMS me returns only safe principal fields', async () => {
  let requiredAction;
  const handler = createHandler({
    requireCmsImpl: async (_req, _res, action) => {
      requiredAction = action;
      return { id: 'user-1', email: 'private@fourland.vn', displayName: 'Nguyễn An', role: 'manager', isActive: true };
    }
  });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(requiredAction, ACTIONS.DASHBOARD_READ);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.deepEqual(res.body, { ok: true, data: { user: { id: 'user-1', displayName: 'Nguyễn An', role: 'manager' } } });
  assert.doesNotMatch(JSON.stringify(res.body), /private@fourland\.vn|isActive/);
});

test('CMS me stops when auth adapter already sent an error', async () => {
  const handler = createHandler({ requireCmsImpl: async (_req, res) => { res.status(401).json({ ok: false, error: { code: 'AUTH_REQUIRED' } }); return null; } });
  const res = responseRecorder();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { ok: false, error: { code: 'AUTH_REQUIRED' } });
});

test('CMS me rejects non-GET methods', async () => {
  const handler = createHandler({ requireCmsImpl: async () => { throw new Error('must not authenticate'); } });
  const res = responseRecorder();
  await handler({ method: 'POST', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error.code, 'METHOD_NOT_ALLOWED');
});
