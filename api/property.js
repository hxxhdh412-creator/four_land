const { isAdmin } = require("./_admin");
const { sendError, supabaseRequest, text } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  try {
    const id = text(req.query.id, 100);
    if (!id) return res.status(400).json({ ok: false, error: "Thiếu mã hồ sơ" });
    const params = new URLSearchParams({ select: "*,property_images(position,public_url,source_url)", property_id: `eq.${id}`, limit: "1" });
    const result = await supabaseRequest(`properties?${params}`);
    if (!result.data[0]) return res.status(404).json({ ok: false, error: "Không tìm thấy hồ sơ" });
    if (result.data[0].status === "archived" && !isAdmin(req)) return res.status(404).json({ ok: false, error: "Không tìm thấy hồ sơ" });
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    res.status(200).json({ ok: true, property: result.data[0] });
  } catch (error) { sendError(res, error); }
};
