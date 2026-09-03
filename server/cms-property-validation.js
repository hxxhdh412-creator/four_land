const EDITABLE_FIELDS = Object.freeze([
  "address", "district", "ward", "street", "property_type", "listing_type", "price_text", "area_text",
  "dimensions", "bedrooms", "bathrooms", "structure", "legal", "commission", "notes", "phone"
]);

const FIELD_LIMITS = Object.freeze({ address: 300, district: 120, ward: 120, street: 160, property_type: 120, listing_type: 30, price_text: 100, area_text: 100, dimensions: 100, structure: 1000, legal: 500, commission: 300, notes: 2000, phone: 30 });

function normalizeValue(field, value) {
  if (field === "bedrooms" || field === "bathrooms") {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) ? number : value;
  }
  return String(value ?? "").trim();
}

function validatePropertyDraft(current, input) {
  const source = input && typeof input === "object" ? input : {};
  const normalized = {};
  const errors = {};
  const warnings = [];
  for (const field of Object.keys(source)) {
    if (!EDITABLE_FIELDS.includes(field)) continue;
    const value = normalizeValue(field, source[field]);
    normalized[field] = value;
    if ((field === "bedrooms" || field === "bathrooms") && value !== null && (!Number.isInteger(value) || value < 0 || value > 50)) errors[field] = "Giá trị phải là số nguyên từ 0 đến 50";
    if (FIELD_LIMITS[field] && String(value ?? "").length > FIELD_LIMITS[field]) errors[field] = `Tối đa ${FIELD_LIMITS[field]} ký tự`;
  }
  if (normalized.phone && !/^(?:\+?84|0)[0-9 .-]{8,14}$/.test(normalized.phone)) errors.phone = "Số điện thoại chưa đúng định dạng Việt Nam";
  const changedFields = Object.keys(normalized).filter(field => String(normalized[field] ?? "") !== String(current?.[field] ?? ""));
  if (!changedFields.length) errors._form = "Chưa có thay đổi nào để kiểm tra";
  const preview = { ...(current || {}), ...normalized };
  if (!preview.address) warnings.push({ field: "address", message: "Hồ sơ chưa có địa chỉ" });
  if (!preview.price_text) warnings.push({ field: "price_text", message: "Hồ sơ chưa có giá" });
  if (Number(preview.image_count || 0) < 2) warnings.push({ field: "images", message: "Nên có ít nhất 2 hình ảnh" });
  return { valid: Object.keys(errors).length === 0, normalized, changedFields, errors, warnings };
}

module.exports = { EDITABLE_FIELDS, FIELD_LIMITS, validatePropertyDraft };
