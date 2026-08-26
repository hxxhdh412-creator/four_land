const { isAdmin } = require("./_admin");
const { parseNaturalQuery, matchAndScoreProperty } = require("./_smartSearch");
const { sendError, supabaseRequest, text } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(48, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 24));
    const archivedOnly = req.query.archived === "only";
    if (archivedOnly && !isAdmin(req)) return res.status(401).json({ ok: false, error: "Cần mở quyền quản trị" });

    // 1. Phân tích ngữ nghĩa tự nhiên tiếng Việt (AI NLP Parser)
    const rawQ = String(req.query.q || "").trim();
    const nlp = parseNaturalQuery(rawQ);
    const featuredOnly = req.query.featured === "1" || req.query.featured === "true";
    const sortBy = text(req.query.sortBy) || "newest";

    const explicitFilters = {
      district: text(req.query.district),
      ward: text(req.query.ward),
      street: text(req.query.street),
      property_type: text(req.query.type),
      timeRange: text(req.query.timeRange),
      rentalStatus: text(req.query.rentalStatus || req.query.status),
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : null,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : null,
      minArea: req.query.minArea ? Number(req.query.minArea) : null,
      maxArea: req.query.maxArea ? Number(req.query.maxArea) : null,
      bedrooms: req.query.bedrooms ? Number(req.query.bedrooms) : null
    };

    // Query properties from Supabase
    const params = new URLSearchParams({
      select: "property_id,status,phone,property_type,address,district,ward,street,area_text,area_number,dimensions,bedrooms,bathrooms,structure,price_text,price_number,legal,notes,raw_text,normalized_text,image_count,received_at,data_json,property_images(position,public_url)",
      order: "received_at.desc",
      limit: "5000"
    });
    params.set("status", archivedOnly ? "eq.archived" : "neq.archived");

    const result = await supabaseRequest(`properties?${params}`);
    const allRows = result.data || [];

    // 2. Chấm điểm liên quan, lọc đa tầng và ghim nhà nổi bật lên đầu
    const scoredRows = allRows
      .map(row => {
        const isFeatured = row.status === "featured" || Boolean(row.data_json?.is_featured);
        const isRented = row.status === "rented" || Boolean(row.data_json?.is_rented);
        return {
          row: {
            ...row,
            is_featured: isFeatured,
            is_rented: isRented,
            view_count: Number(row.data_json?.view_count) || 0
          },
          score: matchAndScoreProperty(row, nlp, explicitFilters),
          isFeatured,
          isRented
        };
      })
      .filter(item => {
        if (item.score <= 0) return false;
        if (featuredOnly && !item.isFeatured) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "price_asc") {
          const pa = a.row.price_number || 999999999999;
          const pb = b.row.price_number || 999999999999;
          return pa - pb;
        }
        if (sortBy === "price_desc") {
          const pa = a.row.price_number || 0;
          const pb = b.row.price_number || 0;
          return pb - pa;
        }
        if (sortBy === "area_desc") {
          const aa = a.row.area_number || 0;
          const ab = b.row.area_number || 0;
          return ab - aa;
        }
        if (sortBy === "oldest") {
          return new Date(a.row.received_at || 0) - new Date(b.row.received_at || 0);
        }
        // Mặc định: Ưu tiên nhà nổi bật lên đầu trang khi duyệt danh sách
        if (!rawQ && a.isFeatured !== b.isFeatured) {
          return b.isFeatured ? 1 : -1;
        }
        if (b.score !== a.score) return b.score - a.score;
        if (a.isFeatured !== b.isFeatured) return b.isFeatured ? 1 : -1;
        return new Date(b.row.received_at || 0) - new Date(a.row.received_at || 0);
      });

    // Lọc trùng địa chỉ: Chỉ giữ lại đúng 1 bản ghi tốt nhất / mới nhất cho mỗi căn nhà
    const seenAddresses = new Set();
    const uniqueScoredRows = [];
    for (const item of scoredRows) {
      const addrKey = item.row.address
        ? String(item.row.address).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
        : item.row.property_id;
      if (seenAddresses.has(addrKey)) continue;
      seenAddresses.add(addrKey);
      uniqueScoredRows.push(item);
    }

    const total = uniqueScoredRows.length;
    const paginatedRows = uniqueScoredRows
      .slice((page - 1) * pageSize, page * pageSize)
      .map(item => item.row);

    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({ ok: true, rows: paginatedRows, total, page, pageSize, parsedNlp: nlp.filters });
  } catch (error) { sendError(res, error); }
};

