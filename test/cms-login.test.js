const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, DEMO_USERS } = require('../api/_cms-login');

test('DEMO_USERS defines all 5 operational roles', () => {
  assert.ok(DEMO_USERS['admin@fourland.vn']);
  assert.equal(DEMO_USERS['admin@fourland.vn'].role, 'super_admin');
  assert.equal(DEMO_USERS['manager@fourland.vn'].role, 'manager');
  assert.equal(DEMO_USERS['sales@fourland.vn'].role, 'sales');
  assert.equal(DEMO_USERS['editor@fourland.vn'].role, 'editor');
  assert.equal(DEMO_USERS['viewer@fourland.vn'].role, 'viewer');
});

test('cms login handler logs in valid demo user', async () => {
  const handler = createHandler();
  let status = 0;
  let data = null;
  const mockRes = {
    status(s) { status = s; return this; },
    json(d) { data = d; return this; },
    setHeader() {}
  };

  const mockReq = {
    method: 'POST',
    body: {
      email: 'admin@fourland.vn',
      password: 'password123'
    }
  };

  await handler(mockReq, mockRes);
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.data.user.role, 'super_admin');
  assert.equal(data.data.token, 'fourland-preview-cms');
});

test('cms login handler supports quick role selection', async () => {
  const handler = createHandler();
  let status = 0;
  let data = null;
  const mockRes = {
    status(s) { status = s; return this; },
    json(d) { data = d; return this; },
    setHeader() {}
  };

  const mockReq = {
    method: 'POST',
    body: {
      role: 'sales'
    }
  };

  await handler(mockReq, mockRes);
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.data.user.role, 'sales');
});

test('cms logout handler clears session cookie and confirms logout', async () => {
  const handler = createHandler();
  let status = 0;
  let data = null;
  let setCookieHeader = '';
  const mockRes = {
    status(s) { status = s; return this; },
    json(d) { data = d; return this; },
    setHeader(k, v) { if (k === 'Set-Cookie') setCookieHeader = v; }
  };

  const mockReq = {
    method: 'POST',
    url: '/api/admin/v1/logout',
    body: { action: 'logout' }
  };

  await handler(mockReq, mockRes);
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.match(setCookieHeader, /Max-Age=0/);
});
