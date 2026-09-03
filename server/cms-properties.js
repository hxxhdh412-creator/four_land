const { safeSearch } = require("../api/_supabase");

const LIST_FIELDS = [
  "property_id", "status", "property_type", "address", "district", "ward", "street",
  "area_text", "bedrooms", "bathrooms", "structure", "price_text", "image_count",
  "received_at", "updated_at", "data_json", "property_images(position,public_url)"
].join(",");

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function inferListingType(row) {
  const explicit = String(
    row?.listing_type ||
    row?.data_json?.listing_type ||
    row?.data_json?.cms?.listing_type ||
    ""
  ).trim().toLowerCase();

  if (explicit === "rent" || explicit === "sale") return explicit;

  const price = String(row?.price_text || "").toLowerCase();
  const raw = String(row?.raw_text || row?.property_type || "").toLowerCase();

  // If explicit rent keywords in price
  if (/(?:cho thuê|thuê|tháng|\/th)/i.test(price)) {
    return "rent";
  }

  // If price contains "tỷ" or "ty"
  if (/(?:tỷ|ty)/i.test(price)) {
    return "sale";
  }

  // If raw or property_type contains sale keywords
  if (/(?:cần bán|chuyển nhượng|bán gấp|bán nhà|\bbán\b)/i.test(raw)) {
    return "sale";
  }

  return "rent";
}

function parsePropertyListQuery(searchParams) {
  const params = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || "");
  const listingTypeParam = params.get("listingType") || params.get("listing_type");
  return {
    q: safeSearch(params.get("q")),
    status: ["active", "archived", "all"].includes(params.get("status")) ? params.get("status") : "active",
    quality: ["all", "missing_data", "without_images"].includes(params.get("quality")) ? params.get("quality") : "all",
    listingType: ["rent", "sale", "all"].includes(listingTypeParam) ? listingTypeParam : "all",
    district: safeSearch(params.get("district")),
    page: boundedInteger(params.get("page"), 1, 1, 100000),
    pageSize: boundedInteger(params.get("pageSize"), 12, 1, 50)
  };
}

function buildPropertyListRoute(filters) {
  const disjunctions = [];
  const query = new URLSearchParams({
    select: LIST_FIELDS,
    order: "received_at.desc",
    offset: String((filters.page - 1) * filters.pageSize),
    limit: String(filters.pageSize)
  });
  if (filters.status === "active") query.set("status", "neq.archived");
  if (filters.status === "archived") query.set("status", "eq.archived");
  if (filters.district) query.set("district", `ilike.*${filters.district}*`);
  if (filters.quality === "without_images") query.set("image_count", "eq.0");
  if (filters.quality === "missing_data") disjunctions.push("(address.is.null,price_text.is.null,image_count.lt.2)");

  if (filters.listingType === "sale") {
    disjunctions.push("(price_text.ilike.*tỷ*,price_text.ilike.*ty*,property_type.ilike.*bán*)");
  } else if (filters.listingType === "rent") {
    disjunctions.push("(price_text.ilike.*tháng*,price_text.ilike.*triệu*,price_text.ilike.*\/th*,price_text.ilike.*\/thg*)");
  }

  if (filters.q) {
    const pattern = `*${filters.q}*`;
    disjunctions.push(`(address.ilike.${pattern},district.ilike.${pattern},ward.ilike.${pattern},street.ilike.${pattern},property_type.ilike.${pattern},price_text.ilike.${pattern})`);
  }
  if (disjunctions.length === 1) query.set("or", disjunctions[0]);
  if (disjunctions.length > 1) query.set("and", `(${disjunctions.map(value => `or${value}`).join(",")})`);
  return `properties?${query}`;
}

function driveImage(url) {
  if (!url) return null;
  const str = String(url).trim();
  if (!str) return null;
  const match = str.match(/\/d\/([\w-]+)/) || str.match(/[?&]id=([\w-]+)/) || str.match(/googleusercontent\.com\/d\/([\w-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  }
  return str;
}

function normalizePropertyListItem(row) {
  const images = Array.isArray(row?.property_images) ? [...row.property_images].sort((a, b) => a.position - b.position) : [];
  const rawCover = images[0]?.public_url || images[0]?.source_url || null;
  const listingType = inferListingType(row);
  return {
    id: String(row?.property_id || ""),
    status: String(row?.status || "partial"),
    propertyType: row?.property_type || "Bất động sản",
    listingType,
    listingTypeLabel: listingType === "sale" ? "Bán" : "Cho thuê",
    address: row?.address || "Chưa có địa chỉ",
    district: row?.district || "",
    ward: row?.ward || "",
    street: row?.street || "",
    area: row?.area_text || "Chưa cập nhật",
    bedrooms: row?.bedrooms !== null && row?.bedrooms !== undefined && Number(row.bedrooms) > 0 ? Number(row.bedrooms) : null,
    bathrooms: row?.bathrooms !== null && row?.bathrooms !== undefined && Number(row.bathrooms) > 0 ? Number(row.bathrooms) : null,
    structure: row?.structure || "",
    price: row?.price_text || "Liên hệ",
    imageCount: Number(row?.image_count || images.length || 0),
    coverImage: driveImage(rawCover),
    receivedAt: row?.received_at || null,
    updatedAt: row?.updated_at || null,
    missingData: !row?.address || !row?.price_text || Number(row?.image_count || images.length || 0) < 2
  };
}

module.exports = { LIST_FIELDS, buildPropertyListRoute, inferListingType, normalizePropertyListItem, parsePropertyListQuery, driveImage };

