const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPropertyListRoute, normalizePropertyListItem, parsePropertyListQuery } = require("../server/cms-properties");
const { createHandler } = require('../api/_cms-properties');

test("property list query is bounded and sanitized", () => {
  const filters = parsePropertyListQuery("q=Nh%C3%A0%2C%20Qu%E1%BA%ADn%201&status=bad&page=-2&pageSize=500");
  assert.equal(filters.q, "Nhà Quận 1");
  assert.equal(filters.status, "active");
  assert.equal(filters.page, 1);
  assert.equal(filters.pageSize, 50);
});

test("property list route applies pagination and server filters", () => {
  const route = buildPropertyListRoute(parsePropertyListQuery("q=G%C3%B2%20V%E1%BA%A5p&district=G%C3%B2%20V%E1%BA%A5p&page=2&pageSize=12"));
  assert.match(route, /offset=12/);
  assert.match(route, /limit=12/);
  assert.match(route, /status=neq.archived/);
  const query = new URL(route, "http://cms.local").searchParams;
  assert.equal(query.get("district"), "ilike.*Gò Vấp*");
});

test("normalizes a safe CMS list item without contact or raw source", () => {
  const item = normalizePropertyListItem({ property_id: "BDS-1", address: "123 Lê Lợi", phone: "0900", raw_text: "secret", image_count: 1, property_images: [{ position: 1, public_url: "https://img" }] });
  assert.equal(item.id, "BDS-1");
  assert.equal(item.coverImage, "https://img");
  assert.equal(item.bedrooms, null);
  assert.equal(Object.hasOwn(item, "phone"), false);
  assert.equal(Object.hasOwn(item, "raw_text"), false);
});

test("property list endpoint is permission guarded and paginated", async () => {
  let action;
  const handler = createHandler({
    requireCmsImpl: async (_req, _res, requestedAction) => { action = requestedAction; return { id: "u1", role: "viewer", isActive: true }; },
    request: async () => ({ data: [{ property_id: "BDS-1", address: "A", price_text: "1 tỷ", image_count: 2 }], count: 13 })
  });
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "GET", url: "/api/admin/v1/properties?page=1&pageSize=12" }, response);
  assert.equal(action, ACTIONS.PROPERTY_READ);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.items.length, 1);
  assert.equal(response.body.meta.hasNext, true);
});

const { createHandler: createPropertyHandler } = require('../api/_cms-property-create');

test("property create endpoint validates required address and inserts property", async () => {
  let action;
  let insertedPayload;
  const handler = createPropertyHandler({
    requireCmsImpl: async (_req, _res, requestedAction) => { action = requestedAction; return { id: "u1", displayName: "Admin User", role: "manager", isActive: true }; },
    request: async (path, opts) => {
      if (path === "properties") {
        insertedPayload = opts.body;
        return { data: [opts.body] };
      }
      return { data: [] };
    }
  });
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  
  // Missing address fails validation
  await handler({ method: "POST", body: { address: "   " } }, response);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.ok, false);

  // Valid address succeeds
  await handler({ method: "POST", body: { address: "123 Lê Lợi, P. Bến Nghé, Q.1", price_text: "50 tỷ", bedrooms: "4" } }, response);
  assert.equal(action, ACTIONS.PROPERTY_EDIT);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.ok, true);
  assert.equal(insertedPayload.address, "123 Lê Lợi, P. Bến Nghé, Q.1");
  assert.equal(insertedPayload.price_text, "50 tỷ");
  assert.equal(insertedPayload.bedrooms, 4);
});

const { ACTIONS } = require("../server/cms-authorization");
