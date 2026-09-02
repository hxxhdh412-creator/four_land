const test = require("node:test");
const assert = require("node:assert/strict");
const { getDynamicPins, handleAccessPins, saveDynamicPins } = require("../api/_admin-pin-settings");
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

test("getDynamicPins returns valid admin and ctv codes", async () => {
  const pins = await getDynamicPins(true);
  assert.ok(pins.adminCode && pins.adminCode.length >= 4);
  assert.ok(pins.ctvCode && pins.ctvCode.length >= 4);
});

test("saveDynamicPins validates pin length and updates cache", async () => {
  await assert.rejects(
    async () => saveDynamicPins({ adminCode: "12" }),
    { statusCode: 422 }
  );

  const updated = await saveDynamicPins({
    adminCode: "888888",
    ctvCode: "999999"
  });

  assert.equal(updated.adminCode, "888888");
  assert.equal(updated.ctvCode, "999999");

  const current = await getDynamicPins();
  assert.equal(current.adminCode, "888888");
  assert.equal(current.ctvCode, "999999");
});

test("handleAccessPins requires authorization and handles GET/PATCH", async () => {
  const unauthRes = mockResponse();
  await handleAccessPins({ method: "GET" }, unauthRes, { isAuthorized: false });
  assert.equal(unauthRes.statusCode, 401);

  const getRes = mockResponse();
  await handleAccessPins({ method: "GET" }, getRes, { isAuthorized: true });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.ok, true);
  assert.equal(getRes.body.data.adminCode, "888888");

  const patchRes = mockResponse();
  await handleAccessPins({
    method: "PATCH",
    body: { adminCode: "246810", ctvCode: "135790" }
  }, patchRes, { isAuthorized: true });
  assert.equal(patchRes.statusCode, 200);
  assert.equal(patchRes.body.data.adminCode, "246810");
  assert.equal(patchRes.body.data.ctvCode, "135790");
});

test("admin-login verifies dynamic pins dynamically", async () => {
  // Set custom PINs
  await saveDynamicPins({ adminCode: "777888", ctvCode: "111222" });

  // 1. Login with new CTV PIN
  const ctvReq = { method: "POST", body: { code: "111222" } };
  const ctvRes = mockResponse();
  await adminLoginHandler(ctvReq, ctvRes);
  assert.equal(ctvRes.statusCode, 200);
  assert.equal(ctvRes.body.role, "ctv");

  // 2. Login with new Admin PIN
  const adminReq = { method: "POST", body: { code: "777888" } };
  const adminRes = mockResponse();
  await adminLoginHandler(adminReq, adminRes);
  assert.equal(adminRes.statusCode, 200);
  assert.equal(adminRes.body.role, "admin");

  // 3. Login with wrong PIN fails
  const wrongReq = { method: "POST", body: { code: "000000" } };
  const wrongRes = mockResponse();
  await adminLoginHandler(wrongReq, wrongRes);
  assert.equal(wrongRes.statusCode, 401);

  // Reset back to standard default
  await saveDynamicPins({ adminCode: "246810", ctvCode: "135790" });
});
