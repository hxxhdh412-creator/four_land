const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { buildSystemHealth } = require("../server/cms-system-health");
const { sendError, supabaseRequest } = require("./_supabase");

function enabled(value) { return ["1", "true", "yes"].includes(String(value || "").toLowerCase()); }

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest, env = process.env } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    const principal = await requireCmsImpl(req, res, ACTIONS.DASHBOARD_READ);
    if (!principal) return;
    try {
      const [properties, images] = await Promise.all([
        request("properties?select=status&limit=10000"),
        request("property_images?select=property_id&limit=1", { count: true })
      ]);
      const health = buildSystemHealth({ properties: properties.data, imageCount: images.count, mutationsEnabled: enabled(env.CMS_MUTATIONS_ENABLED), syncWritesEnabled: enabled(env.SYNC_WRITE_ENABLED) });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok: true, data: { health } });
    } catch (error) { return sendError(res, error); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
