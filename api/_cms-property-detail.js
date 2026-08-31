const { requireCms } = require("./_cms-auth");
const { ACTIONS, can } = require("../server/cms-authorization");
const { buildPropertyDetailRoute, normalizePropertyDetail, validPropertyId } = require("../server/cms-property-detail");
const { sendError, supabaseRequest } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_READ);
    if (!principal) return;
    const id = validPropertyId(req.query?.id || new URL(req.url, "http://cms.local").searchParams.get("id"));
    if (!id) return res.status(400).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Mã hồ sơ không hợp lệ" } });
    try {
      const result = await request(buildPropertyDetailRoute(id));
      if (!result.data?.[0]) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ" } });
      const includeSensitive = can(principal.role, ACTIONS.PROPERTY_SENSITIVE_READ);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok: true, data: { property: normalizePropertyDetail(result.data[0], { includeSensitive }) } });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
