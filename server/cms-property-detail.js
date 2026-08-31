const DETAIL_FIELDS = [
  "property_id", "status", "property_type", "address", "district", "ward", "street",
  "area_text", "area_number", "dimensions", "bedrooms", "bathrooms", "structure",
  "price_text", "legal", "commission", "notes", "phone", "raw_text", "image_count",
  "received_at", "updated_at", "property_images(position,public_url)"
].join(",");

function validPropertyId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/.test(id) ? id : "";
}

function buildPropertyDetailRoute(id) {
  return `properties?select=${DETAIL_FIELDS}&property_id=eq.${encodeURIComponent(id)}&limit=1`;
}

function driveImage(url) {
  if (!url) return null;
  const str = String(url).trim();
  if (!str) return null;
  const match = str.match(/\/d\/([\w-]+)/) || str.match(/[?&]id=([\w-]+)/) || str.match(/googleusercontent\.com\/d\/([\w-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200`;
  }
  return str;
}

function normalizePropertyDetail(row, { includeSensitive = false } = {}) {
  const images = Array.isArray(row?.property_images)
    ? [...row.property_images]
        .sort((a, b) => Number(a.position) - Number(b.position))
        .map(image => ({ position: Number(image.position), url: driveImage(image.public_url || image.source_url) }))
        .filter(image => image.url)
    : [];
  const detail = {
    id: String(row?.property_id || ""), status: String(row?.status || "partial"),
    propertyType: row?.property_type || "Bất động sản", address: row?.address || "Chưa có địa chỉ",
    district: row?.district || "", ward: row?.ward || "", street: row?.street || "",
    area: row?.area_text || "", areaNumber: row?.area_number ?? null, dimensions: row?.dimensions || "",
    bedrooms: Number(row?.bedrooms) > 0 ? Number(row.bedrooms) : null,
    bathrooms: Number(row?.bathrooms) > 0 ? Number(row.bathrooms) : null,
    structure: row?.structure || "", price: row?.price_text || "Liên hệ", legal: row?.legal || "",
    notes: row?.notes || "", imageCount: Number(row?.image_count || images.length || 0), images,
    receivedAt: row?.received_at || null, updatedAt: row?.updated_at || null
  };
  if (includeSensitive) {
    detail.phone = row?.phone || "";
    detail.commission = row?.commission || "";
    detail.rawText = row?.raw_text || "";
  }
  return detail;
}

module.exports = { DETAIL_FIELDS, buildPropertyDetailRoute, normalizePropertyDetail, validPropertyId };
