const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require('../api/_cms-property-detail');
const { normalizePropertyDetail, validPropertyId } = require("../server/cms-property-detail");

function responseRecorder() { return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(body) { this.body = body; return this; } }; }

test("validates bounded property identifiers", () => {
  assert.equal(validPropertyId("BDS-2026_01"), "BDS-2026_01");
  assert.equal(validPropertyId("../../secret"), "");
});

test("detail DTO masks sensitive data by default", () => {
  const row = { property_id: "BDS-1", phone: "0900", commission: "1 tháng", raw_text: "nguồn", property_images: [{ position: 2, public_url: "b" }, { position: 1, public_url: "a" }] };
  const safe = normalizePropertyDetail(row);
  assert.equal(Object.hasOwn(safe, "phone"), false);
  assert.deepEqual(safe.images.map(image => image.url), ["a", "b"]);
  const sensitive = normalizePropertyDetail(row, { includeSensitive: true });
  assert.equal(sensitive.phone, "0900");
});

test("detail endpoint masks PII for viewer", async () => {
  const handler = createHandler({ requireCmsImpl: async () => ({ id: "u", role: "viewer", isActive: true }), request: async () => ({ data: [{ property_id: "BDS-1", phone: "0900", raw_text: "source" }] }) });
  const res = responseRecorder();
  await handler({ method: "GET", url: "/api/admin/v1/properties/BDS-1", query: { id: "BDS-1" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(Object.hasOwn(res.body.data.property, "phone"), false);
  assert.equal(Object.hasOwn(res.body.data.property, "rawText"), false);
});

test("detail endpoint returns not found", async () => {
  const handler = createHandler({ requireCmsImpl: async () => ({ id: "u", role: "manager", isActive: true }), request: async () => ({ data: [] }) });
  const res = responseRecorder();
  await handler({ method: "GET", url: "/api/admin/v1/properties/MISSING", query: { id: "MISSING" } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
});
