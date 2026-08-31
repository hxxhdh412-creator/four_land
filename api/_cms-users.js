const { requireCms } = require("./_cms-auth");
const { ACTIONS, ROLES, validRole } = require("../server/cms-authorization");
const { sendError, supabaseRequest, text } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    // 1. GET /api/admin/v1/users
    if (req.method === "GET") {
      const principal = await requireCmsImpl(req, res, ACTIONS.USER_MANAGE);
      if (!principal) return;
      try {
        const result = await request("profiles?select=id,display_name,role,is_active,created_at,updated_at&order=created_at.desc");
        const rows = result.data || [];
        const users = rows.map(r => ({
          id: String(r.id),
          displayName: r.display_name || "Chưa đặt tên",
          role: r.role || "viewer",
          isActive: Boolean(r.is_active),
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
        const summary = {
          total: users.length,
          superAdmin: users.filter(u => u.role === ROLES.SUPER_ADMIN).length,
          manager: users.filter(u => u.role === ROLES.MANAGER).length,
          editor: users.filter(u => u.role === ROLES.EDITOR).length,
          sales: users.filter(u => u.role === ROLES.SALES).length,
          viewer: users.filter(u => u.role === ROLES.VIEWER).length,
          active: users.filter(u => u.isActive).length
        };
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json({ ok: true, data: { users, summary } });
      } catch (error) {
        return sendError(res, error);
      }
    }

    // 2. POST /api/admin/v1/users (Add/Invite User)
    if (req.method === "POST") {
      const principal = await requireCmsImpl(req, res, ACTIONS.USER_MANAGE);
      if (!principal) return;
      try {
        const body = req.body || {};
        const displayName = text(body.displayName || body.display_name, 150);
        const role = String(body.role || "viewer").toLowerCase();
        const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;
        const userId = text(body.id, 64) || require("crypto").randomUUID();

        if (!displayName) {
          return res.status(422).json({
            ok: false,
            error: { code: "VALIDATION_FAILED", message: "Họ và tên không được để trống" }
          });
        }
        if (!validRole(role)) {
          return res.status(422).json({
            ok: false,
            error: { code: "VALIDATION_FAILED", message: "Vai trò không hợp lệ" }
          });
        }

        const now = new Date().toISOString();
        const profileRow = {
          id: userId,
          display_name: displayName,
          role: role,
          is_active: isActive,
          created_at: now,
          updated_at: now
        };

        const result = await request("profiles", {
          method: "POST",
          body: profileRow,
          prefer: "return=representation"
        });

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(201).json({
          ok: true,
          data: { user: result.data?.[0] || profileRow },
          message: "Đã tạo tài khoản thành viên thành công"
        });
      } catch (error) {
        return sendError(res, error);
      }
    }

    // 3. PATCH /api/admin/v1/users (Update Role / Active Status)
    if (req.method === "PATCH") {
      const principal = await requireCmsImpl(req, res, ACTIONS.USER_MANAGE);
      if (!principal) return;
      try {
        const body = req.body || {};
        const userId = text(req.query?.id || body.id, 64);
        if (!userId) {
          return res.status(400).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Thiếu ID người dùng" } });
        }

        const update = { updated_at: new Date().toISOString() };
        if (body.displayName || body.display_name) update.display_name = text(body.displayName || body.display_name, 150);
        if (body.role) {
          const role = String(body.role).toLowerCase();
          if (!validRole(role)) return res.status(422).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Vai trò không hợp lệ" } });
          update.role = role;
        }
        if (body.isActive !== undefined || body.is_active !== undefined) {
          update.is_active = Boolean(body.isActive !== undefined ? body.isActive : body.is_active);
        }

        const query = new URLSearchParams({ id: `eq.${userId}` });
        const result = await request(`profiles?${query}`, {
          method: "PATCH",
          body: update,
          prefer: "return=representation"
        });

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json({
          ok: true,
          data: { user: result.data?.[0] || { id: userId, ...update } },
          message: "Đã cập nhật thông tin thành viên thành công"
        });
      } catch (error) {
        return sendError(res, error);
      }
    }

    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
