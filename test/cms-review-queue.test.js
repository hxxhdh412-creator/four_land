const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReviewQueue, buildReviewQueueRoute, reviewIssues } = require("../server/cms-review-queue");
const { createHandler } = require("../api/cms-review-queue");

function responseRecorder() { return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(body) { this.body = body; return this; } }; }

test("review issues assign deterministic quality weights", () => {
  const issues = reviewIssues({ address: null, price_text: null, image_count: 0 });
  assert.deepEqual(issues.map(issue => issue.code), ["missing_address", "missing_price", "missing_images"]);
  assert.equal(issues.reduce((sum, issue) => sum + issue.weight, 0), 10);
});

test("review queue sorts critical records first and returns aggregate only", () => {
  const queue = buildReviewQueue([
    { property_id: "LOW", address: "A", price_text: "1 tỷ", image_count: 1 },
    { property_id: "HIGH", address: null, price_text: null, image_count: 0 }
  ]);
  assert.equal(queue.items[0].id, "HIGH");
  assert.equal(queue.summary.total, 2);
  assert.equal(queue.summary.imageIssues, 2);
});

test("review queue route is bounded and excludes archived records", () => {
  const route = buildReviewQueueRoute(999);
  assert.match(route, /limit=50/);
  assert.match(route, /status=neq.archived/);
});

test("review queue endpoint is permission guarded", async () => {
  let action;
  const handler = createHandler({ requireCmsImpl: async (_req, _res, value) => { action = value; return { id: "u", role: "viewer", isActive: true }; }, request: async () => ({ data: [{ property_id: "A", image_count: 0 }] }) });
  const res = responseRecorder();
  await handler({ method: "GET" }, res);
  assert.equal(action, ACTIONS.PROPERTY_READ);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.summary.total, 1);
});

const { ACTIONS } = require("../server/cms-authorization");
