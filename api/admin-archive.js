const { requireAdmin } = require("./_admin");
const { sendError, supabaseRequest, text } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!requireAdmin(req, res)) return;
  try {
    const propertyId = text(req.body?.propertyId, 100);
    const archived = Boolean(req.body?.archived);
    if (!propertyId) return res.status(400).json({ ok: false, error: "Thiếu mã bất động sản" });
    const result = await supabaseRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`, {
      method: "PATCH",
      body: { status: archived ? "archived" : "partial", updated_at: new Date().toISOString() },
      prefer: "return=representation"
    });
    if (!result.data[0]) return res.status(404).json({ ok: false, error: "Không tìm thấy bất động sản" });
    res.status(200).json({ ok: true, property: result.data[0], message: archived ? "Đã ẩn hồ sơ khỏi web" : "Đã khôi phục hồ sơ" });
  } catch (error) { sendError(res, error); }
};
