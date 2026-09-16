const { requireCms } = require("./_cms-auth");
const { requireMutationsEnabled, workflowCommand } = require("../server/cms-mutations");
const { validPropertyId } = require("../server/cms-property-detail");
const { sendError, supabaseRequest } = require("./_supabase");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      if (!id) return res.status(400).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Thiếu mã hồ sơ hợp lệ" } });

      let expectedVersion = Number(req.body?.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        const currentRes = await request(`properties?select=version&property_id=eq.${encodeURIComponent(id)}&limit=1`);
        const currentVersion = Number(currentRes.data?.[0]?.version);
        expectedVersion = Number.isInteger(currentVersion) && currentVersion >= 1 ? currentVersion : 1;
      }

      const actorId = principal?.id && UUID_REGEX.test(String(principal.id)) ? principal.id : null;
      const result = await request("rpc/cms_transition_property", {
        method: "POST",
        body: {
          p_property_id: id,
          p_expected_version: expectedVersion,
          p_command: definition.command,
          p_actor_id: actorId,
          p_request_id: req.headers?.["x-request-id"] || null
        }
      });
      const updated = result.data?.[0] || result.data;
      return res.status(200).json({ ok: true, data: { property: updated }, message: `Đã thực hiện lệnh '${definition.command}' thành công` });
    } catch (error) { if (error.code) error.statusCode ||= 503; return sendError(res, error); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
