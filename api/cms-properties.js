const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { buildPropertyListRoute, normalizePropertyListItem, parsePropertyListQuery } = require("../server/cms-properties");
const { sendError, supabaseRequest } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_READ);
    if (!principal) return;
    try {
      const filters = parsePropertyListQuery(new URL(req.url, "http://cms.local").searchParams);
      const result = await request(buildPropertyListRoute(filters), { count: true });
      const items = (result.data || []).map(normalizePropertyListItem);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok: true, data: { items }, meta: { page: filters.page, pageSize: filters.pageSize, total: result.count, hasNext: filters.page * filters.pageSize < result.count } });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
