const { supabaseRequest } = require("./_supabase");
const { renderLandingPage } = require("../server/seo-landings");

let cache = { expiresAt: 0, properties: [] };
const CACHE_MS = 5 * 60 * 1000;

async function fetchLandingProperties(request = supabaseRequest) {
  if (request === supabaseRequest && cache.expiresAt > Date.now()) return cache.properties;
  const query = new URLSearchParams({
    select: "property_id,status,property_type,address,district,ward,street,area_text,bedrooms,bathrooms,price_text,received_at,updated_at,data_json,normalized_text,raw_text,property_images(position,public_url,source_url)",
    status: "neq.archived", order: "updated_at.desc", limit: "2000"
  });
  const result = await request(`properties?${query}`);
  const properties = result.data || [];
  if (request === supabaseRequest) cache = { expiresAt: Date.now() + CACHE_MS, properties };
  return properties;
}

function queryValue(input) { return Array.isArray(input) ? input[0] : input; }

function createHandler({ request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
    try {
      const properties = await fetchLandingProperties(request);
      const html = renderLandingPage(properties, {
        intent: queryValue(req.query?.intent) || "all",
        districtSlug: queryValue(req.query?.district) || ""
      });
      if (!html) {
        res.setHeader("X-Robots-Tag", "noindex");
        return res.status(404).send("Trang khu vực chưa có đủ dữ liệu đang hoạt động");
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
      return res.status(200).send(html);
    } catch (_) {
      res.setHeader("X-Robots-Tag", "noindex");
      return res.status(503).send("Trang nhà phố tạm thời chưa khả dụng");
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports.createHandler = createHandler;
module.exports.fetchLandingProperties = fetchLandingProperties;
