const test = require("node:test");
const assert = require("node:assert/strict");
const { canDownloadImages, createSession } = require("../api/_admin");
const downloadImageHandler = require("../api/download-image");

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
    },
    send(buffer) {
      this.sentBuffer = buffer;
      return this;
    }
  };
  return res;
}

test("canDownloadImages grants permission to CTV and Admin, but rejects Guest", () => {
  const adminToken = createSession("admin");
  const ctvToken = createSession("ctv");

  const adminReq = { headers: { cookie: `fourland_admin=${encodeURIComponent(adminToken)}` } };
  const ctvReq = { headers: { cookie: `fourland_admin=${encodeURIComponent(ctvToken)}` } };
  const guestReq = { headers: {} };

  assert.equal(canDownloadImages(adminReq), true, "Admin must be allowed to download");
  assert.equal(canDownloadImages(ctvReq), true, "CTV must be allowed to download");
  assert.equal(canDownloadImages(guestReq), false, "Guest must NOT be allowed to download");
});

test("/api/download-image blocks Guest with 403 Forbidden", async () => {
  const guestReq = {
    method: "GET",
    headers: {},
    query: { url: "https://example.com/test.jpg" }
  };
  const res = mockResponse();

  await downloadImageHandler(guestReq, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /Cộng tác viên.*hoặc.*Quản trị viên/i);
});

test("/api/download-image rejects non-GET methods with 405", async () => {
  const adminToken = createSession("admin");
  const req = {
    method: "POST",
    headers: { cookie: `fourland_admin=${encodeURIComponent(adminToken)}` }
  };
  const res = mockResponse();

  await downloadImageHandler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.body.ok, false);
});

test("/api/download-image validates image URL parameter for CTV", async () => {
  const ctvToken = createSession("ctv");
  const reqWithoutUrl = {
    method: "GET",
    headers: { cookie: `fourland_admin=${encodeURIComponent(ctvToken)}` },
    query: {}
  };
  const res1 = mockResponse();
  await downloadImageHandler(reqWithoutUrl, res1);
  assert.equal(res1.statusCode, 400);
  assert.match(res1.body.error, /URL hình ảnh không hợp lệ/i);

  const reqInvalidUrl = {
    method: "GET",
    headers: { cookie: `fourland_admin=${encodeURIComponent(ctvToken)}` },
    query: { url: "javascript:alert(1)" }
  };
  const res2 = mockResponse();
  await downloadImageHandler(reqInvalidUrl, res2);
  assert.equal(res2.statusCode, 400);
  assert.match(res2.body.error, /URL hình ảnh không hợp lệ/i);
});
