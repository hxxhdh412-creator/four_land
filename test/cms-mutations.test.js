const test = require("node:test");
const assert = require("node:assert/strict");
const { assertTransition, mutationsEnabled, requireMutationsEnabled, workflowCommand } = require("../server/cms-mutations");
const { createHandler: createUpdateHandler } = require('../api/_cms-property-update');

function responseRecorder() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, setHeader() {}, json(body) { this.body = body; return this; } }; }

test("mutations require an explicit environment flag", () => {
  assert.equal(mutationsEnabled({}), false);
  assert.equal(mutationsEnabled({ CMS_MUTATIONS_ENABLED: "true" }), true);
  assert.throws(() => requireMutationsEnabled({}), error => error.code === "MUTATIONS_DISABLED");
});

test("workflow commands map to permissions and valid transitions", () => {
  const publish = workflowCommand("publish");
  assert.equal(publish.to, "published");
  assert.equal(assertTransition("pending_review", publish), true);
  assert.throws(() => assertTransition("draft", publish), error => error.code === "INVALID_TRANSITION");
});

test("update endpoint cannot call RPC while mutations are disabled", async () => {
  let called = false;
  const handler = createUpdateHandler({ requireCmsImpl: async () => ({ id: "u", role: "editor", isActive: true }), request: async () => { called = true; }, env: {} });
  const res = responseRecorder();
  await handler({ method: "PATCH", query: { id: "BDS-1" }, body: { expectedVersion: 1, fields: { address: "A" } }, headers: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(called, false);
});
