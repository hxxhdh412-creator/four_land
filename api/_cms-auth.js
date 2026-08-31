const { authenticateCmsRequest } = require("../server/cms-authentication");
const { requirePermission } = require("../server/cms-authorization");
const { configuration, supabaseRequest } = require("./_supabase");

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
