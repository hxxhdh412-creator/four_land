const { requireAdmin } = require("./_admin");
const { sendError, supabaseRequest, text } = require("./_supabase");
const { markOverrideFields } = require("../server/property-field-ownership");

const TEXT_FIELDS = ["address","district","ward","street","price_text","area_text","dimensions","structure","legal","phone","property_type","raw_text","notes"];
const NUMBER_FIELDS = ["bedrooms","bathrooms"];

module.exports = async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!requireAdmin(req, res)) return;
  try {
    const propertyId = text(req.body?.propertyId, 100);
    if (!propertyId) return res.status(400).json({ ok: false, error: "Thiếu mã bất động sản" });
    const update = {};
    const editedFields = [];
    TEXT_FIELDS.forEach(field => { if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) { update[field] = text(req.body[field], field === "raw_text" || field === "notes" ? 5000 : 300); editedFields.push(field); } });
    NUMBER_FIELDS.forEach(field => { if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) { const value = Number(req.body[field]); update[field] = Number.isFinite(value) && value >= 0 ? Math.round(value) : null; editedFields.push(field); } });

    if (editedFields.length) {
      const currentQuery = new URLSearchParams({ select: "data_json", property_id: `eq.${propertyId}`, limit: "1" });
      const current = await supabaseRequest(`properties?${currentQuery}`);
      if (!current.data[0]) return res.status(404).json({ ok: false, error: "Không tìm thấy bất động sản" });
      update.data_json = markOverrideFields(current.data[0].data_json, editedFields);
    }
    
    // Status management: featured, rented, ready, archived
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "is_rented")) {
      const isRented = Boolean(req.body.is_rented);
      const isFeatured = Boolean(req.body.is_featured);
      update.status = isRented ? "rented" : (isFeatured ? "featured" : "ready");
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, "is_featured")) {
      update.status = req.body.is_featured ? "featured" : "ready";
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, "archived")) {
      update.status = req.body.archived ? "archived" : "partial";
    }

    if (!Object.keys(update).length) return res.status(400).json({ ok: false, error: "Không có thông tin cần cập nhật" });
    update.updated_at = new Date().toISOString();
    const query = new URLSearchParams({ property_id: `eq.${propertyId}` });
    const result = await supabaseRequest(`properties?${query}`, { method: "PATCH", body: update, prefer: "return=representation" });
    if (!result.data[0]) return res.status(404).json({ ok: false, error: "Không tìm thấy bất động sản" });
    
    let message = "Đã cập nhật thông tin nhà";
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "is_rented")) {
      message = req.body.is_rented ? "Đã chuyển sang trạng thái: [Đã cho thuê]" : "Đã chuyển sang trạng thái: [Đang mở thuê]";
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, "is_featured")) {
      message = req.body.is_featured ? "Đã ghim bất động sản lên mục Nổi Bật" : "Đã bỏ ghim nổi bật";
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, "archived")) {
      message = req.body.archived ? "Đã ẩn hồ sơ khỏi web" : "Đã khôi phục hồ sơ";
    }
    res.status(200).json({ ok: true, property: result.data[0], message });
  } catch (error) { sendError(res, error); }
};
