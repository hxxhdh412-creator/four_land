const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePropertyDraft } = require("../server/cms-property-validation");
const { createHandler } = require('../api/_cms-property-validate');

function responseRecorder() { return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(body) { this.body = body; return this; } }; }

test("validates and normalizes a safe property draft without accepting unknown fields", () => {
  const result = validatePropertyDraft({ address: "Cũ", image_count: 1 }, { address: "  Mới  ", phone: "0909123456", secret: "no" });
  assert.equal(result.valid, true);
  assert.equal(result.normalized.address, "Mới");
  assert.equal(Object.hasOwn(result.normalized, "secret"), false);
  assert.deepEqual(result.changedFields.sort(), ["address", "phone"]);
  assert.ok(result.warnings.some(warning => warning.field === "images"));
});

test("rejects invalid phone, bedroom count and unchanged drafts", () => {
  const invalid = validatePropertyDraft({}, { phone: "abc", bedrooms: 2.5 });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.phone);
  assert.ok(invalid.errors.bedrooms);
  const unchanged = validatePropertyDraft({ address: "A" }, { address: "A" });
  assert.ok(unchanged.errors._form);
});

test("validation endpoint detects optimistic version conflicts", async () => {
  const handler = createHandler({ requireCmsImpl: async () => ({ id: "u", role: "editor", isActive: true }), request: async () => ({ data: [{ property_id: "BDS-1", updated_at: "new" }] }) });
  const res = responseRecorder();
  await handler({ method: "POST", url: "/api/admin/v1/properties/BDS-1/validate", query: { id: "BDS-1" }, body: { expectedUpdatedAt: "old", fields: { address: "A" } } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error.code, "VERSION_CONFLICT");
});

test("validation endpoint returns preview-only changes and never mutates", async () => {
  const handler = createHandler({ requireCmsImpl: async () => ({ id: "u", role: "editor", isActive: true }), request: async () => ({ data: [{ property_id: "BDS-1", address: "A", updated_at: "v1", image_count: 3 }] }) });
  const res = responseRecorder();
  await handler({ method: "POST", url: "/api/admin/v1/properties/BDS-1/validate", query: { id: "BDS-1" }, body: { expectedUpdatedAt: "v1", fields: { address: "B" } } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.mode, "preview-only");
  assert.deepEqual(res.body.data.validation.changedFields, ["address"]);
});
