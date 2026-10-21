const test = require("node:test");
const assert = require("node:assert/strict");
const { canViewAddress, createSession, getAuthRole, isAdmin, isCtv, requireAdmin, secrets } = require("../api/_admin");
const { getDynamicPins, saveDynamicPins } = require("../api/_admin-pin-settings");
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

test("POST /api/admin-login logs in with Admin and CTV PIN codes and auto-rotates CTV PIN after each login", async () => {
  const { code: adminCode, ctvCode: initialCtvCode } = secrets();
  await saveDynamicPins({ adminCode, ctvCode: initialCtvCode });

  // 1. Admin login (does not rotate adminCode)
  const adminReq = { method: "POST", body: { code: adminCode } };
  const adminRes = mockResponse();
  await adminLoginHandler(adminReq, adminRes);
  assert.equal(adminRes.statusCode, 200);
  assert.equal(adminRes.body.ok, true);
  assert.equal(adminRes.body.role, "admin");
  assert.match(adminRes.getHeader("set-cookie"), /fourland_admin=/);

  // 2. CTV login succeeds and immediately rotates CTV PIN to a new 6-digit code
  const ctvReq = { method: "POST", body: { code: initialCtvCode } };
  const ctvRes = mockResponse();
  await adminLoginHandler(ctvReq, ctvRes);
  assert.equal(ctvRes.statusCode, 200);
  assert.equal(ctvRes.body.ok, true);
  assert.equal(ctvRes.body.role, "ctv");
  assert.match(ctvRes.body.message, /Cộng tác viên/i);

  const afterCtvLoginPins = await getDynamicPins();
  assert.notEqual(afterCtvLoginPins.ctvCode, initialCtvCode);
  assert.match(afterCtvLoginPins.ctvCode, /^\d{6}$/);

  // 3. Reusing the old CTV code on another machine is rejected with 401
  const reusedOldCtvReq = { method: "POST", body: { code: initialCtvCode } };
  const reusedOldCtvRes = mockResponse();
  await adminLoginHandler(reusedOldCtvReq, reusedOldCtvRes);
  assert.equal(reusedOldCtvRes.statusCode, 401);
  assert.equal(reusedOldCtvRes.body.ok, false);

  // 4. Using the newly rotated CTV code succeeds and rotates again
  const secondCtvReq = { method: "POST", body: { code: afterCtvLoginPins.ctvCode } };
  const secondCtvRes = mockResponse();
  await adminLoginHandler(secondCtvReq, secondCtvRes);
  assert.equal(secondCtvRes.statusCode, 200);
  assert.equal(secondCtvRes.body.role, "ctv");

  // Reset back to default for subsequent tests
  await saveDynamicPins({ adminCode, ctvCode: initialCtvCode });
});

test("Device-bound token persists across cookie loss and CTV PIN rotation via X-Fourland-Access header", async () => {
  const { code: adminCode, ctvCode: initialCtvCode } = secrets();
  await saveDynamicPins({ adminCode, ctvCode: initialCtvCode });
  const deviceId = "fl_dev_machine_001";

  // 1. Login with deviceId returns signed token, 365-day SameSite=Lax cookie, and rotates CTV PIN
  const loginReq = {
    method: "POST",
    headers: { "x-fourland-device": deviceId },
    body: { code: initialCtvCode, deviceId }
  };
  const loginRes = mockResponse();
  await adminLoginHandler(loginReq, loginRes);
  assert.equal(loginRes.statusCode, 200);
  assert.equal(loginRes.body.authenticated, true);
  assert.equal(loginRes.body.role, "ctv");
  assert.equal(loginRes.body.deviceId, deviceId);
  assert.ok(loginRes.body.token && loginRes.body.token.includes("."));
  assert.match(loginRes.getHeader("set-cookie"), /SameSite=Lax/);
  assert.match(loginRes.getHeader("set-cookie"), /Max-Age=31536000/);

  // 2. Even after CTV PIN rotated, the logged-in device stays authenticated via X-Fourland-Access
  const headerOnlyReq = {
    method: "GET",
    headers: {
      "x-fourland-access": loginRes.body.token,
      "x-fourland-device": deviceId
    },
    query: { deviceId }
  };
  assert.equal(getAuthRole(headerOnlyReq), "ctv");

  const getRes = mockResponse();
  await adminLoginHandler(headerOnlyReq, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.authenticated, true);
  assert.equal(getRes.body.role, "ctv");
  assert.equal(getRes.body.deviceId, deviceId);
  assert.ok(getRes.body.token && getRes.body.token.includes("."));
  assert.match(getRes.getHeader("set-cookie"), /fourland_admin=/);

  await saveDynamicPins({ adminCode, ctvCode: initialCtvCode });
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
