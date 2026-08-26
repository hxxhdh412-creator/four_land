const { isAdmin } = require("./_admin");
const { safeSearch, sendError, supabaseRequest, text } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(48, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 24));
    const query = safeSearch(req.query.q);
    const archivedOnly = req.query.archived === "only";
    if (archivedOnly && !isAdmin(req)) return res.status(401).json({ ok: false, error: "Cần mở quyền quản trị" });
    const params = new URLSearchParams({
      select: "property_id,status,phone,property_type,address,district,ward,street,area_text,area_number,dimensions,bedrooms,bathrooms,structure,price_text,price_number,legal,notes,raw_text,image_count,received_at,data_json,property_images(position,public_url)",
      order: "received_at.desc",
      limit: String(pageSize),
      offset: String((page - 1) * pageSize)
    });
    params.set("status", archivedOnly ? "eq.archived" : "neq.archived");
    const equals = { district: req.query.district, ward: req.query.ward, street: req.query.street, property_type: req.query.type };
    Object.entries(equals).forEach(([key, value]) => { if (text(value)) params.set(key, `eq.${text(value)}`); });
    if (req.query.minPrice) params.set("price_number", `gte.${Number(req.query.minPrice) || 0}`);
    if (req.query.maxPrice) params.append("price_number", `lte.${Number(req.query.maxPrice) || 0}`);
    if (req.query.minArea) params.set("area_number", `gte.${Number(req.query.minArea) || 0}`);
    if (req.query.maxArea) params.append("area_number", `lte.${Number(req.query.maxArea) || 0}`);
    if (query) params.set("or", `(property_id.ilike.*${query}*,address.ilike.*${query}*,phone.ilike.*${query}*,raw_text.ilike.*${query}*,normalized_text.ilike.*${query}*)`);
    const result = await supabaseRequest(`properties?${params}`, { count: true });
    const rows = (result.data || []).map(row => ({
      ...row,
      view_count: Number(row.data_json?.view_count) || 0
    }));
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({ ok: true, rows, total: result.count, page, pageSize });
  } catch (error) { sendError(res, error); }
};
