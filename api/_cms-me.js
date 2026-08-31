const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");

function createHandler({ requireCmsImpl = requireCms } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    }
    const principal = await requireCmsImpl(req, res, ACTIONS.DASHBOARD_READ);
    if (!principal) return;
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      data: {
        user: {
          id: principal.id,
          displayName: principal.displayName,
          role: principal.role
        }
      }
    });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
