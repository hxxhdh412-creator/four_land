const { sendError, supabaseRequest } = require("./_supabase");
const { propertyIdFromSlug, propertyPath, renderPropertyPage, value } = require("../server/seo");

function createHandler({ request = supabaseRequest, render = renderPropertyPage } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    try {
      const requestSlug = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
      const id = propertyIdFromSlug(requestSlug);
      if (!id) {
        res.setHeader("X-Robots-Tag", "noindex");
        return res.status(404).send("Không tìm thấy hồ sơ");
      }

      const query = new URLSearchParams({
        select: "*,property_images(position,public_url,source_url)",
        property_id: `eq.${id}`,
        status: "neq.archived",
        limit: "1"
      });
      const result = await request(`properties?${query}`);
      const property = result.data?.[0];
      if (!property) {
        res.setHeader("X-Robots-Tag", "noindex");
        return res.status(404).send("Không tìm thấy hồ sơ");
      }

      const canonicalPath = propertyPath(property);
      const canonicalSlug = canonicalPath.slice(canonicalPath.lastIndexOf("/") + 1);
      if (value(requestSlug) !== canonicalSlug) return res.redirect(308, canonicalPath);

      let similarProperties = [];
      try {
        const districtFilter = property.district ? `district=eq.${encodeURIComponent(property.district)}&` : "";
        const simQuery = `properties?select=property_id,address,street,ward,district,price_text,area_text,dimensions,structure,property_type,property_images(position,public_url,source_url)&${districtFilter}property_id=neq.${encodeURIComponent(property.property_id)}&status=neq.archived&order=updated_at.desc&limit=4`;
        const simResult = await request(simQuery);
        similarProperties = simResult.data || [];
        if (similarProperties.length < 2) {
          const fallbackRes = await request(`properties?select=property_id,address,street,ward,district,price_text,area_text,dimensions,structure,property_type,property_images(position,public_url,source_url)&property_id=neq.${encodeURIComponent(property.property_id)}&status=neq.archived&order=updated_at.desc&limit=4`);
          similarProperties = fallbackRes.data || [];
        }
      } catch (_) {}

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
      return res.status(200).send(render(property, { similarProperties }));
    } catch (error) {
      return sendError(res, error);
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports.createHandler = createHandler;
