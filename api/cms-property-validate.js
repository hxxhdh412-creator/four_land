const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { buildPropertyDetailRoute, validPropertyId } = require("../server/cms-property-detail");
const { validatePropertyDraft } = require("../server/cms-property-validation");
const { sendError, supabaseRequest } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_EDIT);
    if (!principal) return;
    const id = validPropertyId(req.query?.id || new URL(req.url, "http://cms.local").searchParams.get("id"));
    if (!id) return res.status(400).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Mã hồ sơ không hợp lệ" } });
    try {
      const result = await request(buildPropertyDetailRoute(id));
      const current = result.data?.[0];
      if (!current) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ" } });
      if (req.body?.expectedUpdatedAt && String(req.body.expectedUpdatedAt) !== String(current.updated_at || "")) {
        return res.status(409).json({ ok: false, error: { code: "VERSION_CONFLICT", message: "Hồ sơ đã thay đổi, cần tải lại trước khi tiếp tục" } });
      }
      const validation = validatePropertyDraft(current, req.body?.fields);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(validation.valid ? 200 : 422).json({ ok: validation.valid, data: { validation, mode: "preview-only" }, ...(validation.valid ? {} : { error: { code: "VALIDATION_FAILED", message: "Dữ liệu biên tập chưa hợp lệ", fieldErrors: validation.errors } }) });
    } catch (error) { return sendError(res, error); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
