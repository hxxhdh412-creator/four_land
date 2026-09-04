const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require("../api/_cms-facebook-pages");
const {
  getFacebookPages,
  addFacebookPage,
  updateFacebookPage,
  deleteFacebookPage,
  getDefaultFacebookPage
} = require("../server/cms-facebook-pages");

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

test("getFacebookPages returns initial default Fanpage", async () => {
  const pages = await getFacebookPages();
  assert.ok(Array.isArray(pages));
  assert.ok(pages.length >= 1);
  const defaultPage = pages.find(p => p.isDefault);
  assert.ok(defaultPage);
  assert.equal(defaultPage.name, "Ngọc Nhà Tốt");
});

test("addFacebookPage adds a new Fanpage and allows setting it as default", async () => {
  const newPage = await addFacebookPage({
    name: "Fourland - Bất Động Sản Sài Gòn",
    pageId: "9988776655",
    token: "TEST_TOKEN_123",
    isDefault: true
  });

  assert.equal(newPage.name, "Fourland - Bất Động Sản Sài Gòn");
  assert.equal(newPage.pageId, "9988776655");
  assert.equal(newPage.isDefault, true);

  const defaultPage = await getDefaultFacebookPage();
  assert.equal(defaultPage.pageId, "9988776655");
});

test("facebook pages API handler handles GET, POST, PATCH, and DELETE", async () => {
  const handler = createHandler({ requireCmsImpl: async () => ({ id: "admin-1", role: "super_admin" }) });

  // 1. GET
  const resGet = mockResponse();
  await handler({ method: "GET" }, resGet);
  assert.equal(resGet.statusCode, 200);
  assert.ok(resGet.body.ok);
  assert.ok(Array.isArray(resGet.body.data));

  // 2. POST
  const resPost = mockResponse();
  await handler({
    method: "POST",
    body: {
      name: "Nhà Đất Quận 1 Giá Tốt",
      pageId: "1122334455",
      token: "PAGE_TOKEN_Q1"
    }
  }, resPost);
  assert.equal(resPost.statusCode, 201);
  assert.ok(resPost.body.ok);
  assert.equal(resPost.body.data.name, "Nhà Đất Quận 1 Giá Tốt");

  // 3. PATCH (set default)
  const resPatch = mockResponse();
  await handler({
    method: "PATCH",
    body: {
      pageId: "1122334455",
      isDefault: true
    }
  }, resPatch);
  assert.equal(resPatch.statusCode, 200);
  assert.equal(resPatch.body.data.isDefault, true);

  // 4. DELETE
  const resDelete = mockResponse();
  await handler({
    method: "DELETE",
    body: { pageId: "1122334455" }
  }, resDelete);
  assert.equal(resDelete.statusCode, 200);
  assert.ok(resDelete.body.ok);
});

test("loadPersistentPages and savePersistentPages preserve custom default page", async () => {
  const { loadPersistentPages, savePersistentPages, getDefaultFacebookPage } = require("../server/cms-facebook-pages");
  const testPages = [
    {
      id: "106656702112510",
      pageId: "106656702112510",
      name: "Ngọc Nhà Tốt",
      isDefault: false
    },
    {
      id: "9999999999",
      pageId: "9999999999",
      name: "BĐS TP.HCM Mới",
      isDefault: true
    }
  ];

  await savePersistentPages(testPages);
  const loaded = await loadPersistentPages();
  assert.equal(loaded.length, 2);
  const defPage = await getDefaultFacebookPage();
  assert.equal(defPage.pageId, "9999999999");
  assert.equal(defPage.name, "BĐS TP.HCM Mới");
});
