const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { buildReviewQueue, buildReviewQueueRoute } = require("../server/cms-review-queue");
const { sendError, supabaseRequest } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_READ);
    if (!principal) return;
    try {
      const result = await request(buildReviewQueueRoute(30));
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok: true, data: buildReviewQueue(result.data) });
    } catch (error) { return sendError(res, error); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
