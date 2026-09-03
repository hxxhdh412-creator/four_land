const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require("../api/_cms-facebook");

test("Facebook Studio API handler publishes post to multiple pages simultaneously", async () => {
  const handler = createHandler({
    requireCmsImpl: async () => ({ id: "usr-admin-01", role: "super_admin" }),
    request: async () => ({ data: [] })
  });

  const req = {
    method: "POST",
    body: {
      action: "publish",
      content: "Nhà đẹp phố cổ cần bán gấp",
      images: ["https://example.com/img1.jpg"],
      pageIds: ["106656702112510", "106656702112510"]
    },
    headers: {}
  };

  let statusCode = 0;
  let jsonBody = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { jsonBody = body; return this; }
  };

  await handler(req, res);
  assert.equal(statusCode, 200);
  assert.equal(jsonBody.ok, true);
  assert.equal(jsonBody.data.total, 2);
  assert.equal(jsonBody.data.successCount, 2);
  assert.equal(jsonBody.data.results.length, 2);
  assert.match(jsonBody.data.results[0].postUrl, /facebook\.com/);
  assert.match(jsonBody.message, /Đã xuất bản thành công lên 2\/2 Fanpage/);
});
