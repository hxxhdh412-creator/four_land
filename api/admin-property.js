const { requireAdmin } = require("./_admin");
const { sendError, supabaseRequest, text } = require("./_supabase");

const TEXT_FIELDS = ["address","district","ward","street","price_text","area_text","dimensions","structure","legal","phone","property_type","raw_text","notes"];
const NUMBER_FIELDS = ["bedrooms","bathrooms"];

module.exports = async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!requireAdmin(req, res)) return;
  try {
    const propertyId = text(req.body?.propertyId, 100);
    if (!propertyId) return res.status(400).json({ ok: false, error: "Thiếu mã bất động sản" });
    const update = {};
    TEXT_FIELDS.forEach(field => { if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) update[field] = text(req.body[field], field === "raw_text" || field === "notes" ? 5000 : 300); });
    NUMBER_FIELDS.forEach(field => { if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) { const value = Number(req.body[field]); update[field] = Number.isFinite(value) && value >= 0 ? Math.round(value) : null; } });
    if (!Object.keys(update).length) return res.status(400).json({ ok: false, error: "Không có thông tin cần cập nhật" });
    update.updated_at = new Date().toISOString();
    const query = new URLSearchParams({ property_id: `eq.${propertyId}` });
    const result = await supabaseRequest(`properties?${query}`, { method: "PATCH", body: update, prefer: "return=representation" });
    if (!result.data[0]) return res.status(404).json({ ok: false, error: "Không tìm thấy bất động sản" });
    res.status(200).json({ ok: true, property: result.data[0], message: "Đã cập nhật thông tin nhà" });
  } catch (error) { sendError(res, error); }
};
