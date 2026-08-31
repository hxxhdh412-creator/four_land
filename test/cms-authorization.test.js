const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACTIONS,
  ROLES,
  can,
  maskSensitiveProperty,
  requirePermission
} = require('../server/cms-authorization');

test('super admin has every CMS permission', () => {
  Object.values(ACTIONS).forEach(action => assert.equal(can(ROLES.SUPER_ADMIN, action), true));
});

test('manager can publish and audit but cannot manage users', () => {
  assert.equal(can(ROLES.MANAGER, ACTIONS.PROPERTY_PUBLISH), true);
  assert.equal(can(ROLES.MANAGER, ACTIONS.AUDIT_READ), true);
  assert.equal(can(ROLES.MANAGER, ACTIONS.USER_MANAGE), false);
});

test('editor can edit and submit but cannot publish or archive', () => {
  assert.equal(can(ROLES.EDITOR, ACTIONS.PROPERTY_EDIT), true);
  assert.equal(can(ROLES.EDITOR, ACTIONS.PROPERTY_SUBMIT_REVIEW), true);
  assert.equal(can(ROLES.EDITOR, ACTIONS.PROPERTY_PUBLISH), false);
  assert.equal(can(ROLES.EDITOR, ACTIONS.PROPERTY_ARCHIVE), false);
});

test('viewer receives property data without sensitive source fields', () => {
  const masked = maskSensitiveProperty({ property_id: 'BDS-1', address: 'Đường A', phone: '0900000000', raw_text: 'Nguồn', data_json: { secret: true } }, ROLES.VIEWER);
  assert.deepEqual(masked, { property_id: 'BDS-1', address: 'Đường A' });
});

test('sales can read sensitive contact data', () => {
  const property = { property_id: 'BDS-1', phone: '0900000000' };
  assert.deepEqual(maskSensitiveProperty(property, ROLES.SALES), property);
});

test('permission guard distinguishes unauthenticated, disabled and forbidden users', () => {
  assert.throws(() => requirePermission(null, ACTIONS.PROPERTY_READ), error => error.statusCode === 401 && error.code === 'AUTH_REQUIRED');
  assert.throws(() => requirePermission({ id: 'u1', role: ROLES.MANAGER, isActive: false }, ACTIONS.PROPERTY_READ), error => error.statusCode === 403);
  assert.throws(() => requirePermission({ id: 'u2', role: ROLES.VIEWER, isActive: true }, ACTIONS.PROPERTY_EDIT), error => error.code === 'FORBIDDEN');
  assert.equal(requirePermission({ id: 'u3', role: ROLES.EDITOR, isActive: true }, ACTIONS.PROPERTY_EDIT), true);
});

const { createHandler: createUsersHandler } = require('../api/_cms-users');

test('users management endpoint allows super admin to list, add and update users', async () => {
  let mockDb = [
    { id: 'usr_1', display_name: 'Super Admin User', role: 'super_admin', is_active: true, created_at: new Date().toISOString() }
  ];

  const handler = createUsersHandler({
    requireCmsImpl: async (_req, _res, requestedAction) => {
      if (requestedAction !== ACTIONS.USER_MANAGE) return null;
      return { id: 'usr_1', role: 'super_admin', isActive: true };
    },
    request: async (path, opts) => {
      if (!opts || opts.method === 'GET' || !opts.method) {
        return { data: mockDb };
      }
      if (opts.method === 'POST') {
        mockDb.push(opts.body);
        return { data: [opts.body] };
      }
      if (opts.method === 'PATCH') {
        const id = path.split('eq.')[1];
        const user = mockDb.find(u => u.id === id);
        if (user) Object.assign(user, opts.body);
        return { data: [user] };
      }
      return { data: [] };
    }
  });

  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };

  // 1. GET users
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.users.length, 1);
  assert.equal(res.body.data.summary.superAdmin, 1);

  // 2. POST create user
  await handler({ method: 'POST', body: { displayName: 'New Sales Member', role: 'sales' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(mockDb.length, 2);

  // 3. PATCH update user
  await handler({ method: 'PATCH', query: { id: 'usr_1' }, body: { role: 'super_admin', is_active: false } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(mockDb[0].is_active, false);
});

