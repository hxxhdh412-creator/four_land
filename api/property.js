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

    const property = result.data[0];
    const currentViews = Number(property.data_json?.view_count) || 0;
    const newViews = currentViews + 1;
    property.view_count = newViews;

    // Increment view count asynchronously in Supabase
    const updatedDataJson = { ...(property.data_json || {}), view_count: newViews };
    supabaseRequest(`properties?property_id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { data_json: updatedDataJson }
    }).catch(err => console.error("Error updating view_count:", err.message));

    res.setHeader("Cache-Control", "no-cache");
    res.status(200).json({ ok: true, property });
  } catch (error) { sendError(res, error); }
};

