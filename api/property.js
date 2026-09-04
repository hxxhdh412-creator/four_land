const { isAdmin } = require("./_admin");
const { sendError, supabaseRequest, text } = require("./_supabase");

function extractPriceNumber(priceText) {
  if (!priceText) return null;
  const clean = String(priceText).toLowerCase().replace(",", ".");
  const billionMatch = clean.match(/([\d.]+)\s*(?:ty|tỷ)/i);
  if (billionMatch) return parseFloat(billionMatch[1]) * 1000000000;
  const millionMatch = clean.match(/([\d.]+)\s*(?:trieu|triệu|tr)/i);
  if (millionMatch) return parseFloat(millionMatch[1]) * 1000000;
  const numberOnly = clean.replace(/[^\d.]/g, "");
  const num = parseFloat(numberOnly);
  return Number.isNaN(num) ? null : num;
}

function normalizeStreetName(street) {
  return String(street || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/^(?:duong|pho|hem|ngo)\s+/i, "")
    .trim();
}

function rankSimilarProperties(target, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const targetStreet = normalizeStreetName(target.street);
  const targetWard = String(target.ward || "").trim().toLowerCase();
  const targetPrice = extractPriceNumber(target.price_text);
  const targetType = String(target.property_type || "").trim().toLowerCase();

  const scored = candidates
    .filter(c => c && c.property_id !== target.property_id && c.status !== "archived")
    .map(c => {
      let score = 0;
      let badge = "";

      const cStreet = normalizeStreetName(c.street);
      const cWard = String(c.ward || "").trim().toLowerCase();
      const cPrice = extractPriceNumber(c.price_text);
      const cType = String(c.property_type || "").trim().toLowerCase();

      if (targetStreet && cStreet && (targetStreet === cStreet || targetStreet.includes(cStreet) || cStreet.includes(targetStreet))) {
        score += 60;
        badge = "Cùng tuyến đường";
      } else if (targetWard && cWard && (targetWard === cWard || targetWard.includes(cWard) || cWard.includes(targetWard))) {
        score += 40;
        badge = `Cùng ${target.ward || "phường"}`;
      } else if (c.district) {
        score += 20;
        badge = `${c.district}`;
      }

      if (targetPrice && cPrice) {
        const ratio = Math.abs(cPrice - targetPrice) / targetPrice;
        if (ratio <= 0.20) {
          score += 25;
        } else if (ratio <= 0.40) {
          score += 15;
        }
      }

      if (targetType && cType && targetType === cType) {
        score += 10;
      }

      const imgItem = (c.property_images || []).sort((a, b) => a.position - b.position)[0];
      const thumbnail = imgItem ? (imgItem.public_url || imgItem.source_url) : null;

      return {
        property_id: c.property_id,
        address: c.address || c.property_id,
        street: c.street,
        ward: c.ward,
        district: c.district,
        price_text: c.price_text || "Thương lượng",
        dimensions: c.dimensions || c.area_text,
        area_text: c.area_text,
        property_type: c.property_type,
        bedrooms: c.bedrooms,
        bathrooms: c.bathrooms,
        structure: c.structure,
        status: c.status,
        is_rented: Boolean(c.is_rented || c.status === "rented"),
        thumbnail,
        badge: badge || c.district || "Gần đây",
        score
      };
    });

  return scored.sort((a, b) => b.score - a.score);
}

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

    // Increment view count in Supabase
    const updatedDataJson = { ...(property.data_json || {}), view_count: newViews };
    try {
      await supabaseRequest(`properties?property_id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { data_json: updatedDataJson }
      });
    } catch (_) {}

    // Fetch similar nearby properties
    let similar = [];
    if (property.district) {
      try {
        const simParams = new URLSearchParams({
          select: "property_id,address,street,ward,district,price_text,dimensions,area_text,property_type,bedrooms,bathrooms,structure,status,is_rented,property_images(position,public_url,source_url)",
          district: `eq.${property.district}`,
          property_id: `neq.${property.property_id}`,
          status: "neq.archived",
          limit: "15"
        });
        const simResult = await supabaseRequest(`properties?${simParams}`).catch(() => null);
        if (simResult && Array.isArray(simResult.data)) {
          similar = rankSimilarProperties(property, simResult.data).slice(0, 5);
        }
      } catch (_) {}
    }

    res.setHeader("Cache-Control", "no-cache");
    res.status(200).json({ ok: true, property, similar });
  } catch (error) { sendError(res, error); }
};

module.exports.rankSimilarProperties = rankSimilarProperties;
module.exports.extractPriceNumber = extractPriceNumber;


