const { requireCms } = require("./_cms-auth");
const { requireMutationsEnabled, workflowCommand } = require("../server/cms-mutations");
const { validPropertyId } = require("../server/cms-property-detail");
const { sendError, supabaseRequest } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest, env = process.env } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    let definition;
    try { definition = workflowCommand(req.body?.command); } catch (error) { return res.status(error.statusCode).json({ ok: false, error: { code: error.code, message: error.message } }); }
    const principal = await requireCmsImpl(req, res, definition.action);
    if (!principal) return;
    try {
      requireMutationsEnabled(env);
      const id = validPropertyId(req.query?.id);
      const expectedVersion = Number(req.body?.expectedVersion);
      if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 1) return res.status(400).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Thiếu mã hồ sơ hoặc version hợp lệ" } });
      const result = await request("rpc/cms_transition_property", { method: "POST", body: { p_property_id: id, p_expected_version: expectedVersion, p_command: definition.command, p_actor_id: principal.id, p_request_id: req.headers?.["x-request-id"] || null } });
      return res.status(200).json({ ok: true, data: { property: result.data?.[0] || result.data } });
    } catch (error) { if (error.code) error.statusCode ||= 503; return sendError(res, error); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
