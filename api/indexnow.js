const { supabaseRequest } = require("./_supabase");
const { fetchPublicProperties } = require("./sitemap");
const {
  INDEXNOW_KEY,
  INDEXNOW_HOST,
  INDEXNOW_KEY_LOCATION,
  INDEXNOW_ENDPOINT,
  collectIndexNowUrls,
  submitToIndexNow
} = require("../server/indexnow");

function createHandler({ request = supabaseRequest, submitFn = submitToIndexNow, fetchFn = globalThis.fetch } = {}) {
  return async function handler(req, res) {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      return res.status(200).json({
        ok: true,
        host: INDEXNOW_HOST,
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        endpoint: INDEXNOW_ENDPOINT,
        description: "Giao thức IndexNow giúp thông báo URL mới và cập nhật cho các công cụ tìm kiếm và AI (Bing, Perplexity, Copilot)."
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    try {
      let urlsToSubmit = [];
      let customUrls = null;

      if (req.body && typeof req.body === "object" && Array.isArray(req.body.urls)) {
        customUrls = req.body.urls;
      }

      if (customUrls && customUrls.length > 0) {
        urlsToSubmit = customUrls;
      } else {
        const properties = await fetchPublicProperties(request);
        urlsToSubmit = collectIndexNowUrls(properties);
      }

      const result = await submitFn(urlsToSubmit, { fetchFn });
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(result.ok ? 200 : 502).json({
        ...result,
        key: INDEXNOW_KEY,
        host: INDEXNOW_HOST
      });
    } catch (error) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(500).json({
        ok: false,
        error: error.message || "Lỗi xử lý gửi IndexNow"
      });
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports.createHandler = createHandler;
