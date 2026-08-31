const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSystemHealth } = require("../server/cms-system-health");
const { createHandler } = require('../api/_cms-system-health');

function responseRecorder() { return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(body) { this.body = body; return this; } }; }

test("system health reports legacy write blockers without exposing records", () => {
  const health = buildSystemHealth({ properties: [{ status: "partial" }, { status: "ready" }], imageCount: 9 });
  assert.equal(health.database.propertyCount, 2);
  assert.deepEqual(health.database.statusCounts, { partial: 1, ready: 1 });
  assert.equal(health.cms.readyForWrite, false);
  assert.equal(health.blockers.length, 3);
});

test("system health becomes write-ready only with CMS schema and explicit flag", () => {
  const health = buildSystemHealth({ properties: [{ status: "ready", content_status: "published" }], mutationsEnabled: true, syncWritesEnabled: true });
  assert.equal(health.cms.schemaMode, "cms");
  assert.equal(health.cms.readyForWrite, true);
  assert.deepEqual(health.blockers, []);
});

test("system health endpoint reads aggregate counts in parallel", async () => {
  const routes = [];
  const handler = createHandler({ requireCmsImpl: async () => ({ id: "u", role: "manager", isActive: true }), request: async (route) => { routes.push(route); return route.startsWith("properties?") ? { data: [{ status: "partial" }] } : { data: [], count: 4 }; }, env: {} });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.health.database.imageCount, 4);
  assert.equal(routes.length, 2);
});
