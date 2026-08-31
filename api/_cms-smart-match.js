const { requireCms } = require('./_cms-auth');
const { ACTIONS } = require('../server/cms-authorization');
const { parseNaturalQuery } = require('./_smartSearch');
const { rankPropertiesForLead, extractPriceNumber, extractAreaNumber } = require('../server/smart-matcher');
const { sendError, supabaseRequest } = require('./_supabase');

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' } });
    }

    const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_READ);
    if (!principal) return;

    try {
      const body = req.body || {};
      const rawQuery = String(body.query || '').trim();

      // Phân tích tiêu chí từ câu văn tự nhiên hoặc body params
      let criteria = {};
      if (rawQuery) {
        const parsed = parseNaturalQuery(rawQuery);
        criteria = {
          district: parsed.district || body.district || null,
          propertyType: parsed.propertyType || body.propertyType || null,
          minPrice: parsed.minPrice || (body.minPrice ? Number(body.minPrice) : null),
          maxPrice: parsed.maxPrice || (body.maxPrice ? Number(body.maxPrice) : null),
          minArea: parsed.minArea || (body.minArea ? Number(body.minArea) : null),
          maxArea: parsed.maxArea || (body.maxArea ? Number(body.maxArea) : null),
          bedrooms: parsed.bedrooms || (body.bedrooms ? Number(body.bedrooms) : null),
          dimensions: parsed.dimensions || body.dimensions || null
        };
      } else {
        criteria = {
          district: body.district || null,
          propertyType: body.propertyType || null,
          minPrice: body.minPrice ? Number(body.minPrice) : null,
          maxPrice: body.maxPrice ? Number(body.maxPrice) : null,
          minArea: body.minArea ? Number(body.minArea) : null,
          maxArea: body.maxArea ? Number(body.maxArea) : null,
          bedrooms: body.bedrooms ? Number(body.bedrooms) : null,
          dimensions: body.dimensions || null
        };
      }

      // Lấy danh sách hồ sơ BĐS từ Supabase
      const result = await request('properties?status=neq.archived&order=received_at.desc&limit=150', {
        prefer: 'count=exact'
      });

      const rawProperties = result.data || [];
      const rankedItems = rankPropertiesForLead(rawProperties, criteria);

      // Phân quyền hiển thị SĐT (Viewer bị mask, Sales/Manager/Admin xem đầy đủ)
      const canSeePhone = ['super_admin', 'manager', 'editor', 'sales'].includes(principal.role);

      const items = rankedItems.slice(0, 20).map(item => ({
        id: item.property_id,
        address: item.address || `Khu vực ${item.district || 'TP.HCM'}`,
        district: item.district,
        ward: item.ward,
        street: item.street,
        propertyType: item.property_type || 'Nhà phố',
        price: item.price_text,
        priceNumber: item.price_number || extractPriceNumber(item.price_text),
        area: item.area_text || item.dimensions,
        areaNumber: item.area_number || extractAreaNumber(item.area_text, item.dimensions),
        dimensions: item.dimensions,
        bedrooms: item.bedrooms,
        bathrooms: item.bathrooms,
        structure: item.structure,
        legal: item.legal,
        commission: canSeePhone ? item.commission : null,
        phone: canSeePhone ? item.phone : (item.phone ? String(item.phone).slice(0, 3) + '******* (Ẩn)' : null),
        imageCount: item.image_count || 0,
        matchScore: item.matchScore,
        isTopMatch: item.isTopMatch,
        reasons: item.reasons,
        highlights: item.highlights,
        pitchText: item.pitchText,
        receivedAt: item.received_at
      }));

      return res.status(200).json({
        ok: true,
        data: {
          items,
          criteriaUsed: criteria,
          totalAvailable: rawProperties.length,
          totalMatched: rankedItems.length
        },
        message: `Đã tìm thấy ${items.length} căn nhà phù hợp nhất trong kho`
      });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
