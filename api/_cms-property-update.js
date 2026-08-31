const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { requireMutationsEnabled } = require("../server/cms-mutations");
const { validPropertyId } = require("../server/cms-property-detail");
const { validatePropertyDraft } = require("../server/cms-property-validation");
const { sendError, supabaseRequest } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest, env = process.env } = {}) {
  return async function handler(req, res) {
    if (req.method !== "PATCH") return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_EDIT);
    if (!principal) return;
    try {
      requireMutationsEnabled(env);
      const id = validPropertyId(req.query?.id);
      const expectedVersion = Number(req.body?.expectedVersion);
      if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 1) return res.status(400).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Thiếu mã hồ sơ hoặc version hợp lệ" } });
      const validation = validatePropertyDraft({}, req.body?.fields);
      if (!validation.valid) return res.status(422).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Dữ liệu chưa hợp lệ", fieldErrors: validation.errors } });
      const result = await request("rpc/cms_save_property_draft", { method: "POST", body: { p_property_id: id, p_expected_version: expectedVersion, p_changes: validation.normalized, p_actor_id: principal.id, p_request_id: req.headers?.["x-request-id"] || null } });
      return res.status(200).json({ ok: true, data: { property: result.data?.[0] || result.data } });
    } catch (error) { if (error.code) error.statusCode ||= 503; return sendError(res, error); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
