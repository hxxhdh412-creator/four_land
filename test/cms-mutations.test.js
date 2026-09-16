const test = require("node:test");
const assert = require("node:assert/strict");
const { assertTransition, mutationsEnabled, requireMutationsEnabled, workflowCommand } = require("../server/cms-mutations");
const { createHandler: createUpdateHandler } = require('../api/_cms-property-update');
const { createHandler: createWorkflowHandler } = require('../api/_cms-property-workflow');

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

test("update endpoint accepts POST and PATCH, rejects GET with 405", async () => {
  const handler = createUpdateHandler({ requireCmsImpl: async () => ({ id: "u", role: "editor", isActive: true }), request: async () => {}, env: {} });
  const resGet = responseRecorder();
  await handler({ method: "GET", query: { id: "BDS-1" } }, resGet);
  assert.equal(resGet.statusCode, 405);
});

test("update endpoint auto-fetches version and normalizes non-UUID actor ID to null", async () => {
  let capturedBody = null;
  const handler = createUpdateHandler({
    requireCmsImpl: async () => ({ id: "usr-admin-01", role: "editor", isActive: true }),
    request: async (route, options) => {
      if (route.startsWith("properties?")) {
        return { data: [{ version: 4 }] };
      }
      if (route === "rpc/cms_save_property_draft") {
        capturedBody = options.body;
        return { data: [{ property_id: "BDS-1", version: 5 }] };
      }
    },
    env: { CMS_MUTATIONS_ENABLED: "true" }
  });
  const res = responseRecorder();
  await handler({ method: "POST", query: { id: "BDS-1" }, body: { fields: { address: "123 New Street" } }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(capturedBody.p_expected_version, 4);
  assert.equal(capturedBody.p_actor_id, null);
});

test("workflow endpoint auto-fetches version and normalizes non-UUID actor ID to null", async () => {
  let capturedBody = null;
  const handler = createWorkflowHandler({
    requireCmsImpl: async () => ({ id: "usr-admin-01", role: "super_admin", isActive: true }),
    request: async (route, options) => {
      if (route.startsWith("properties?")) {
        return { data: [{ version: 2 }] };
      }
      if (route === "rpc/cms_transition_property") {
        capturedBody = options.body;
        return { data: [{ property_id: "BDS-1", status: "published" }] };
      }
    },
    env: { CMS_MUTATIONS_ENABLED: "true" }
  });
  const res = responseRecorder();
  await handler({ method: "POST", query: { id: "BDS-1" }, body: { command: "publish" }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(capturedBody.p_expected_version, 2);
  assert.equal(capturedBody.p_actor_id, null);
});
