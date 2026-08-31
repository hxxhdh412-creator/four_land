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

module.exports = async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const url = new URL(req.url, `https://${host}`);
  const pathname = url.pathname;

  try {
    // 1. Auth & Session
    if (pathname === "/api/admin/v1/login" || pathname === "/api/cms-login") return cmsLogin(req, res);
    if (pathname === "/api/admin/v1/logout" || pathname === "/api/cms-logout") return cmsLogin(req, res);
    if (pathname === "/api/admin/v1/switch-role") return cmsLogin(req, res);
    if (pathname === "/api/admin/v1/me" || pathname === "/api/cms-me") return cmsMe(req, res);

    // 2. Users Management
    if (pathname === "/api/admin/v1/users" || pathname === "/api/cms-users") return cmsUsers(req, res);

    // 3. Smart Matching AI
    if (pathname === "/api/admin/v1/smart-match" || pathname === "/api/cms-smart-match") return cmsSmartMatch(req, res);

    // 4. Dashboard Summary
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
