const { sendError, supabaseRequest } = require("./_supabase");

let cachedFacets = null;
let cachedFacetsTime = 0;
const FACETS_TTL_MS = 300000; // 5 phút cache RAM

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  try {
    const now = Date.now();
    if (cachedFacets && (now - cachedFacetsTime < FACETS_TTL_MS)) {
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");
      return res.status(200).json(cachedFacets);
    }

    const result = await supabaseRequest("properties?select=district,ward,street,property_type&status=neq.archived&order=district.asc&limit=5000");
    const unique = (key) => [...new Set((result.data || []).map((row) => String(row[key] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
    
    cachedFacets = {
      ok: true,
      districts: unique("district"),
      wards: unique("ward"),
      streets: unique("street"),
      types: unique("property_type")
    };
    cachedFacetsTime = now;

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");
    res.status(200).json(cachedFacets);
  } catch (error) {
    if (cachedFacets) {
      return res.status(200).json(cachedFacets);
    }
    sendError(res, error);
  }
};

