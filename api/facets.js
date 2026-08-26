const { sendError, supabaseRequest } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  try {
    const result = await supabaseRequest("properties?select=district,ward,street,property_type&status=neq.archived&order=district.asc&limit=10000");
    const unique = (key) => [...new Set(result.data.map((row) => String(row[key] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");
    res.status(200).json({ ok: true, districts: unique("district"), wards: unique("ward"), streets: unique("street"), types: unique("property_type") });
  } catch (error) { sendError(res, error); }
};
