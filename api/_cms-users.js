const { requireCms } = require("./_cms-auth");
const { ACTIONS, ROLES, validRole } = require("../server/cms-authorization");
const { sendError, supabaseRequest, text } = require("./_supabase");

const INITIAL_DEMO_USERS = [
  { id: "usr-admin-01", displayName: "Lê Fourland (Super Admin)", role: ROLES.SUPER_ADMIN, isActive: true, createdAt: new Date("2026-08-01T00:00:00.000Z").toISOString(), updatedAt: new Date("2026-08-01T00:00:00.000Z").toISOString() },
  { id: "usr-mgr-02", displayName: "Trần Quản Lý (Manager)", role: ROLES.MANAGER, isActive: true, createdAt: new Date("2026-08-10T00:00:00.000Z").toISOString(), updatedAt: new Date("2026-08-10T00:00:00.000Z").toISOString() },
  { id: "usr-sales-03", displayName: "Nguyễn Bất Động Sản (Sales)", role: ROLES.SALES, isActive: true, createdAt: new Date("2026-08-15T00:00:00.000Z").toISOString(), updatedAt: new Date("2026-08-15T00:00:00.000Z").toISOString() },
  { id: "usr-edit-04", displayName: "Phạm Biên Tập (Editor)", role: ROLES.EDITOR, isActive: true, createdAt: new Date("2026-08-20T00:00:00.000Z").toISOString(), updatedAt: new Date("2026-08-20T00:00:00.000Z").toISOString() },
  { id: "usr-view-05", displayName: "Khách Xem Kho (Viewer)", role: ROLES.VIEWER, isActive: true, createdAt: new Date("2026-08-25T00:00:00.000Z").toISOString(), updatedAt: new Date("2026-08-25T00:00:00.000Z").toISOString() }
];

let dynamicUsersStore = [...INITIAL_DEMO_USERS];

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    // 1. GET /api/admin/v1/users
    if (req.method === "GET") {
      const principal = await requireCmsImpl(req, res, ACTIONS.USER_MANAGE);
      if (!principal) return;
      try {
        let users = [];
        try {
          const result = await request("profiles?select=id,display_name,role,is_active,created_at,updated_at&order=created_at.desc");
          const rows = Array.isArray(result?.data) ? result.data : [];
          if (rows.length > 0) {
            users = rows.map(r => ({
              id: String(r.id),
              displayName: r.display_name || "Chưa đặt tên",
              role: r.role || "viewer",
              isActive: Boolean(r.is_active),
              createdAt: r.created_at,
              updatedAt: r.updated_at
            }));
          }
        } catch (_) {
          // Fallback to dynamic users store when DB table is not yet migrated
        }

        if (users.length === 0) {
          users = [...dynamicUsersStore];
        }

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
        const userId = text(body.id, 64) || `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

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
        const userObj = {
          id: userId,
          displayName: displayName,
          role: role,
          isActive: isActive,
          createdAt: now,
          updatedAt: now
        };

        // Add to local dynamic store
        dynamicUsersStore.unshift(userObj);

        // Best-effort write to Supabase if table exists
        try {
          await request("profiles", {
            method: "POST",
            body: {
              id: userId,
              display_name: displayName,
              role: role,
              is_active: isActive,
              created_at: now,
              updated_at: now
            },
            prefer: "return=representation"
          });
        } catch (_) {
          // Safe fallback for unmigrated Supabase DB
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(201).json({
          ok: true,
          data: { user: userObj },
          message: `Đã thêm thành viên ${displayName} thành công`
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

        const now = new Date().toISOString();
        let targetUser = dynamicUsersStore.find(u => u.id === userId);
        if (!targetUser) {
          targetUser = { id: userId, displayName: "Thành viên", role: "viewer", isActive: true, createdAt: now };
          dynamicUsersStore.push(targetUser);
        }

        if (body.displayName || body.display_name) {
          targetUser.displayName = text(body.displayName || body.display_name, 150);
        }
        if (body.role) {
          const role = String(body.role).toLowerCase();
          if (!validRole(role)) return res.status(422).json({ ok: false, error: { code: "VALIDATION_FAILED", message: "Vai trò không hợp lệ" } });
          targetUser.role = role;
        }
        if (body.isActive !== undefined || body.is_active !== undefined) {
          targetUser.isActive = Boolean(body.isActive !== undefined ? body.isActive : body.is_active);
        }
        targetUser.updatedAt = now;

        // Best-effort write to Supabase
        try {
          const update = { updated_at: now };
          if (body.displayName || body.display_name) update.display_name = targetUser.displayName;
          if (body.role) update.role = targetUser.role;
          if (body.isActive !== undefined || body.is_active !== undefined) update.is_active = targetUser.isActive;

          const query = new URLSearchParams({ id: `eq.${userId}` });
          await request(`profiles?${query}`, {
            method: "PATCH",
            body: update,
            prefer: "return=representation"
          });
        } catch (_) {
          // Safe fallback
        }

        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json({
          ok: true,
          data: { user: targetUser },
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

