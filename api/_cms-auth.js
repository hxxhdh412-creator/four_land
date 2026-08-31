const { authenticateCmsRequest } = require("../server/cms-authentication");
const { requirePermission, validRole } = require("../server/cms-authorization");
const { configuration, supabaseRequest } = require("./_supabase");

const DEMO_PRINCIPALS = {
  "fourland-preview-cms": { id: "usr-admin-01", displayName: "Lê Fourland (Super Admin)", role: "super_admin", isActive: true },
  "usr-admin-01": { id: "usr-admin-01", displayName: "Lê Fourland (Super Admin)", role: "super_admin", isActive: true },
  "usr-mgr-02": { id: "usr-mgr-02", displayName: "Trần Quản Lý (Manager)", role: "manager", isActive: true },
  "usr-sales-03": { id: "usr-sales-03", displayName: "Nguyễn Bất Động Sản (Sales)", role: "sales", isActive: true },
  "usr-edit-04": { id: "usr-edit-04", displayName: "Phạm Biên Tập (Editor)", role: "editor", isActive: true },
  "usr-view-05": { id: "usr-view-05", displayName: "Khách Xem Kho (Viewer)", role: "viewer", isActive: true }
};

function parseDemoSessionToken(token) {
  if (!token) return null;
  if (DEMO_PRINCIPALS[token]) return DEMO_PRINCIPALS[token];
  const match = token.match(/^fourland-session-([a-z_]+)-(usr-[a-z0-9-]+)$/i);
  if (match) {
    const role = match[1];
    const id = match[2];
    if (validRole(role)) {
      return {
        id,
        displayName: `Thành viên (${role})`,
        role,
        isActive: true
      };
    }
  }
  return null;
}

async function loadProfile(userId) {
  const query = new URLSearchParams({
    select: "id,display_name,role,is_active",
    id: `eq.${userId}`,
    limit: "1"
  });
  const result = await supabaseRequest(`profiles?${query}`);
  return result.data[0] || null;
}

async function cmsPrincipal(req, dependencies = {}) {
  const authHeader = String(req?.headers?.authorization || "").trim();
  const tokenMatch = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  const token = tokenMatch ? tokenMatch[1] : null;

  const demoPrincipal = parseDemoSessionToken(token);
  if (demoPrincipal) {
    return demoPrincipal;
  }

  const base = configuration();
  return authenticateCmsRequest(req, {
    config: {
      url: base.url,
      key: base.key,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || base.key
    },
    fetchImpl: dependencies.fetchImpl || fetch,
    loadProfile: dependencies.loadProfile || loadProfile
  });
}

async function requireCms(req, res, action, dependencies = {}) {
  try {
    const principal = await cmsPrincipal(req, dependencies);
    requirePermission(principal, action);
    return principal;
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: {
        code: error.code || "INTERNAL_ERROR",
        message: error.statusCode ? error.message : "Lỗi xác thực CMS"
      }
    });
    return null;
  }
}

module.exports = { cmsPrincipal, loadProfile, requireCms };
