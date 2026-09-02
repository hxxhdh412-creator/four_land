const test = require("node:test");
const assert = require("node:assert/strict");
const { canViewAddress, createSession, getAuthRole, isAdmin, isCtv, requireAdmin, secrets } = require("../api/_admin");
const adminLoginHandler = require("../api/_admin-login");

function mockResponse() {
  const headers = {};
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  return res;
}

test("Admin and CTV session creation and role detection", () => {
  const adminToken = createSession("admin");
  const ctvToken = createSession("ctv");

  const adminReq = { headers: { cookie: `fourland_admin=${encodeURIComponent(adminToken)}` } };
  const ctvReq = { headers: { cookie: `fourland_admin=${encodeURIComponent(ctvToken)}` } };
  const guestReq = { headers: {} };

  assert.equal(getAuthRole(adminReq), "admin");
  assert.equal(isAdmin(adminReq), true);
  assert.equal(isCtv(adminReq), false);
  assert.equal(canViewAddress(adminReq), true);

  assert.equal(getAuthRole(ctvReq), "ctv");
  assert.equal(isAdmin(ctvReq), false);
  assert.equal(isCtv(ctvReq), true);
  assert.equal(canViewAddress(ctvReq), true);

  assert.equal(getAuthRole(guestReq), null);
  assert.equal(isAdmin(guestReq), false);
  assert.equal(isCtv(guestReq), false);
  assert.equal(canViewAddress(guestReq), false);
});

test("requireAdmin allows admin but rejects CTV with 403 Forbidden", () => {
  const adminToken = createSession("admin");
  const ctvToken = createSession("ctv");

  const adminReq = { headers: { cookie: `fourland_admin=${encodeURIComponent(adminToken)}` } };
  const ctvReq = { headers: { cookie: `fourland_admin=${encodeURIComponent(ctvToken)}` } };
  const guestReq = { headers: {} };

  const adminRes = mockResponse();
  assert.equal(requireAdmin(adminReq, adminRes), true);

  const ctvRes = mockResponse();
  assert.equal(requireAdmin(ctvReq, ctvRes), false);
  assert.equal(ctvRes.statusCode, 403);
  assert.match(ctvRes.body.error, /Cộng tác viên/i);

  const guestRes = mockResponse();
  assert.equal(requireAdmin(guestReq, guestRes), false);
  assert.equal(guestRes.statusCode, 401);
});

test("POST /api/admin-login logs in with Admin and CTV PIN codes correctly", async () => {
  const { code: adminCode, ctvCode } = secrets();

  // 1. Admin login
  const adminReq = { method: "POST", body: { code: adminCode } };
  const adminRes = mockResponse();
  await adminLoginHandler(adminReq, adminRes);
  assert.equal(adminRes.statusCode, 200);
  assert.equal(adminRes.body.ok, true);
  assert.equal(adminRes.body.role, "admin");
  assert.match(adminRes.getHeader("set-cookie"), /fourland_admin=/);

  // 2. CTV login
  const ctvReq = { method: "POST", body: { code: ctvCode } };
  const ctvRes = mockResponse();
  await adminLoginHandler(ctvReq, ctvRes);
  assert.equal(ctvRes.statusCode, 200);
  assert.equal(ctvRes.body.ok, true);
  assert.equal(ctvRes.body.role, "ctv");
  assert.match(ctvRes.body.message, /Cộng tác viên/i);

  // 3. Invalid code login
  const invalidReq = { method: "POST", body: { code: "999999" } };
  const invalidRes = mockResponse();
  await adminLoginHandler(invalidReq, invalidRes);
  assert.equal(invalidRes.statusCode, 401);
  assert.equal(invalidRes.body.ok, false);
});

test("GET and DELETE /api/admin-login manage session state", async () => {
  const ctvToken = createSession("ctv");
  const getReq = { method: "GET", headers: { cookie: `fourland_admin=${encodeURIComponent(ctvToken)}` } };
  const getRes = mockResponse();
  await adminLoginHandler(getReq, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.authenticated, true);
  assert.equal(getRes.body.role, "ctv");

  const deleteReq = { method: "DELETE" };
  const deleteRes = mockResponse();
  await adminLoginHandler(deleteReq, deleteRes);
  assert.equal(deleteRes.statusCode, 200);
  assert.equal(deleteRes.body.authenticated, false);
  assert.match(deleteRes.getHeader("set-cookie"), /Max-Age=0/);
});
