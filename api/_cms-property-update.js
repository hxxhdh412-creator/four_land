const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { requireMutationsEnabled } = require("../server/cms-mutations");
const { validPropertyId } = require("../server/cms-property-detail");
const { validatePropertyDraft } = require("../server/cms-property-validation");
const { sendError, supabaseRequest } = require("./_supabase");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest, env = process.env } = {}) {
  return async function handler(req, res) {
    if (!["PATCH", "POST"].includes(req.method)) return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_EDIT);
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

      const inputFields = req.body?.fields || req.body || {};
      const validation = validatePropertyDraft({}, inputFields);
      if (!validation.valid) return res.status(422).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Dữ liệu chưa hợp lệ", fieldErrors: validation.errors } });

      const actorId = principal?.id && UUID_REGEX.test(String(principal.id)) ? principal.id : null;
      const result = await request("rpc/cms_save_property_draft", {
        method: "POST",
        body: {
          p_property_id: id,
          p_expected_version: expectedVersion,
          p_changes: validation.normalized,
          p_actor_id: actorId,
          p_request_id: req.headers?.["x-request-id"] || null
        }
      });
      const updated = result.data?.[0] || result.data;
      return res.status(200).json({ ok: true, data: { property: updated }, message: "Đã lưu thay đổi hồ sơ thành công" });
    } catch (error) { if (error.code) error.statusCode ||= 503; return sendError(res, error); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
