const { sendError, supabaseRequest } = require("./_supabase");
const { propertyIdFromSlug, renderPropertyPage } = require("../server/seo");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
  try {
    const id = propertyIdFromSlug(req.query.slug);
    if (!id) return res.status(404).send("Không tìm thấy hồ sơ");
    const query = new URLSearchParams({ select: "*,property_images(position,public_url,source_url)", property_id: `eq.${id}`, status: "neq.archived", limit: "1" });
    const result = await supabaseRequest(`properties?${query}`);
    if (!result.data[0]) return res.status(404).send("Không tìm thấy hồ sơ");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).send(renderPropertyPage(result.data[0]));
  } catch (error) { return sendError(res, error); }
};
