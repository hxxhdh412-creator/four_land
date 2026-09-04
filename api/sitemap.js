const { supabaseRequest } = require("./_supabase");
const { renderSitemap } = require("../server/seo");
const { buildLandingSitemapEntries } = require("../server/seo-landings");

const PAGE_SIZE = 1000;
const MAX_PROPERTIES = 50000;

async function fetchPublicProperties(request = supabaseRequest) {
  const properties = [];
  for (let offset = 0; offset < MAX_PROPERTIES; offset += PAGE_SIZE) {
    const query = new URLSearchParams({
      select: "property_id,address,street,ward,district,status,property_type,price_text,normalized_text,received_at,updated_at",
      status: "neq.archived",
      order: "updated_at.desc",
      limit: String(PAGE_SIZE),
      offset: String(offset)
    });
    const result = await request(`properties?${query}`);
    const page = result.data || [];
    properties.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return properties;
}

function createHandler({ request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
    try {
      const properties = await fetchPublicProperties(request);
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
      return res.status(200).send(renderSitemap(properties, new Date(), buildLandingSitemapEntries(properties)));
    } catch (_) {
      res.setHeader("X-Robots-Tag", "noindex");
      return res.status(503).send("Sitemap tạm thời chưa khả dụng");
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports.createHandler = createHandler;
module.exports.fetchPublicProperties = fetchPublicProperties;
