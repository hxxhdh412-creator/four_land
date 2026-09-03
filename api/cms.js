const { sendError } = require("./_supabase");

// Internal CMS Handlers
const cmsLogin = require("./_cms-login");
const cmsMe = require("./_cms-me");
const cmsDashboard = require("./_cms-dashboard");
const cmsProperties = require("./_cms-properties");
const cmsPropertyCreate = require("./_cms-property-create");
const cmsPropertyDetail = require("./_cms-property-detail");
const cmsPropertyValidate = require("./_cms-property-validate");
const cmsPropertyUpdate = require("./_cms-property-update");
const cmsPropertyWorkflow = require("./_cms-property-workflow");
const cmsReviewQueue = require("./_cms-review-queue");
const cmsSystemHealth = require("./_cms-system-health");
const cmsUsers = require("./_cms-users");
const cmsSmartMatch = require("./_cms-smart-match");
const cmsFacebook = require("./_cms-facebook");
const cmsFacebookPages = require("./_cms-facebook-pages");

// Classic In-Page Admin Handlers
const adminLogin = require("./_admin-login");
const adminArchive = require("./_admin-archive");
const adminProperty = require("./_admin-property");
const adminImage = require("./_admin-image");

module.exports = async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const url = new URL(req.url, `https://${host}`);
  const pathname = url.pathname;

  try {
    // 0. Classic In-Page Admin APIs
    if (pathname === "/api/admin-login") return adminLogin(req, res);
    if (pathname === "/api/admin-archive") return adminArchive(req, res);
    if (pathname === "/api/admin-property") return adminProperty(req, res);
    if (pathname === "/api/admin-image") return adminImage(req, res);

    // 1. Auth & Session
    if (pathname === "/api/admin/v1/login" || pathname === "/api/cms-login") return cmsLogin(req, res);
    if (pathname === "/api/admin/v1/logout" || pathname === "/api/cms-logout") return cmsLogin(req, res);
    if (pathname === "/api/admin/v1/switch-role") return cmsLogin(req, res);
    if (pathname === "/api/admin/v1/me" || pathname === "/api/cms-me") return cmsMe(req, res);

    // 2. Users Management & PIN Access Settings
    if (pathname === "/api/admin/v1/users" || pathname === "/api/cms-users") return cmsUsers(req, res);
    if (pathname === "/api/admin/v1/access-pins" || pathname === "/api/admin-pin-settings") {
      const { handleAccessPins } = require("./_admin-pin-settings");
      const { isAdmin } = require("./_admin");
      const { requireCms } = require("./_cms-auth");
      const { ACTIONS } = require("../server/cms-authorization");

      let authorized = isAdmin(req);
      if (!authorized) {
        try {
          const principal = await requireCms(req, res, ACTIONS.USER_MANAGE);
          if (principal) authorized = true;
        } catch (_) {}
      }
      return handleAccessPins(req, res, { isAuthorized: authorized });
    }

    // 3. Smart Matching AI
    if (pathname === "/api/admin/v1/smart-match" || pathname === "/api/cms-smart-match") return cmsSmartMatch(req, res);

    // 4. Facebook Studio & Composio MCP
    if (pathname === "/api/admin/v1/facebook/pages") {
      return cmsFacebookPages.handler(req, res);
    }
    if (pathname === "/api/admin/v1/facebook" || pathname === "/api/admin/v1/facebook/draft" || pathname === "/api/admin/v1/facebook/publish") {
      return cmsFacebook(req, res);
    }

    // 5. Dashboard Summary
    if (pathname === "/api/admin/v1/dashboard/summary" || pathname === "/api/cms-dashboard") return cmsDashboard(req, res);

    // 5. Review Queue
    if (pathname === "/api/admin/v1/review-queue" || pathname === "/api/cms-review-queue") return cmsReviewQueue(req, res);

    // 6. System Health
    if (pathname === "/api/admin/v1/system/health" || pathname === "/api/cms-system-health") return cmsSystemHealth(req, res);

    // 7. Properties List & Create
    if (pathname === "/api/admin/v1/properties" || pathname === "/api/cms-properties") {
      if (req.method === "POST") return cmsPropertyCreate(req, res);
      return cmsProperties(req, res);
    }

    // 8. Single Property Sub-routes
    const propMatch = pathname.match(/^\/api\/admin\/v1\/properties\/([^/]+)(?:\/(validate|update|workflow))?$/);
    if (propMatch) {
      const id = decodeURIComponent(propMatch[1]);
      const action = propMatch[2];
      url.searchParams.set("id", id);
      req.query = Object.assign(req.query || {}, { id });

      if (action === "validate") return cmsPropertyValidate(req, res);
      if (action === "update") return cmsPropertyUpdate(req, res);
      if (action === "workflow") return cmsPropertyWorkflow(req, res);
      return cmsPropertyDetail(req, res);
    }

    // 9. Fallback
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: `CMS endpoint '${pathname}' không tồn tại` } });
  } catch (error) {
    return sendError(res, error);
  }
};
