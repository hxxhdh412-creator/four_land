// ============================================================================
// FOURLAND CMS — FACEBOOK PAGES API HANDLER
// ============================================================================

const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const {
  getFacebookPages,
  addFacebookPage,
  updateFacebookPage,
  deleteFacebookPage
} = require("../server/cms-facebook-pages");
const { sendError } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms } = {}) {
  return async function handler(req, res) {
    const authHeader = String(req?.headers?.authorization || "").trim();
    if (authHeader) {
      const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_READ);
      if (!principal) return;
    }

    try {
      if (req.method === "GET") {
        const pages = await getFacebookPages();
        return res.status(200).json({ ok: true, data: pages });
      }

      if (req.method === "POST") {
        const body = req.body || {};
        const { name, pageId, token, isDefault } = body;
        if (!name || !pageId) {
          return res.status(400).json({ ok: false, error: { message: "Vui lòng nhập đầy đủ Tên Fanpage và Page ID" } });
        }
        const newPage = await addFacebookPage({ name, pageId, token, isDefault });
        return res.status(201).json({ ok: true, data: newPage, message: "Đã thêm Fanpage thành công!" });
      }

      if (req.method === "PATCH") {
        const body = req.body || {};
        const pageId = body.pageId || req.query?.id;
        if (!pageId) {
          return res.status(400).json({ ok: false, error: { message: "Thiếu mã Page ID cần cập nhật" } });
        }
        const updated = await updateFacebookPage(pageId, body);
        return res.status(200).json({ ok: true, data: updated, message: "Đã cập nhật Fanpage thành công!" });
      }

      if (req.method === "DELETE") {
        const body = req.body || {};
        const pageId = body.pageId || req.query?.id;
        if (!pageId) {
          return res.status(400).json({ ok: false, error: { message: "Thiếu mã Page ID cần xóa" } });
        }
        const result = await deleteFacebookPage(pageId);
        return res.status(200).json({ ok: true, message: result.message });
      }

      return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

module.exports = { createHandler, handler: createHandler() };
