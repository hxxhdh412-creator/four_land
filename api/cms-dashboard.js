const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { buildDashboardSummary } = require("../server/cms-dashboard");
const { sendError, supabaseRequest } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, listProperties = async () => {
  const result = await supabaseRequest("properties?select=status,address,price_text,image_count,received_at,data_json&limit=10000");
  return result.data;
} } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    const principal = await requireCmsImpl(req, res, ACTIONS.DASHBOARD_READ);
    if (!principal) return;
    try {
      const rows = await listProperties();
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok: true, data: { summary: buildDashboardSummary(rows) } });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
