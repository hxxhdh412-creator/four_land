const { sendError, supabaseRequest } = require("./_supabase");

let cachedFacets = null;
let cachedFacetsTime = 0;
const FACETS_TTL_MS = 60000; // 1 phút cache RAM

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  try {
    const now = Date.now();
    if (cachedFacets && (now - cachedFacetsTime < FACETS_TTL_MS)) {
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
      return res.status(200).json(cachedFacets);
    }

const CANONICAL_DISTRICTS = [
  "Quận 1", "Quận 2", "Quận 3", "Quận 4", "Quận 5", "Quận 6",
  "Quận 7", "Quận 8", "Quận 9", "Quận 10", "Quận 11", "Quận 12",
  "Bình Thạnh", "Gò Vấp", "Phú Nhuận", "Tân Bình", "Tân Phú",
  "Bình Tân", "Thủ Đức", "Nhà Bè", "Hóc Môn", "Củ Chi", "Cần Giờ", "Bình Chánh"
];

function normalizeDistrictFacet(raw) {
  const str = String(raw || "").trim();
  if (!str) return "";
  const lower = str.toLowerCase();
  const stripped = lower.replace(/^(?:quận|huyện|thành\s*phố|tp\.?)\s+/iu, "").trim();

  for (const canon of CANONICAL_DISTRICTS) {
    const cLower = canon.toLowerCase();
    const cStripped = cLower.replace(/^(?:quận|huyện|thành\s*phố|tp\.?)\s+/iu, "").trim();
    if (lower === cLower || stripped === cStripped || stripped === cLower) {
      return canon;
    }
  }
  const numMatch = str.match(/^(?:quận|q)?\s*\.?\s*(1[0-2]|[1-9])$/iu);
  if (numMatch) return `Quận ${numMatch[1]}`;
  return str;
}

function toTitleCase(str) {
  return str.split(/\s+/).map(word => {
    if (!word) return "";
    if (/^[0-9]/.test(word) || (/^[A-Z0-9]+$/.test(word) && word.length <= 4)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(" ");
}

const JUNK_STREET_PATTERNS = [
  /dán\s*bảng/i,
  /bàn\s*giao/i,
  /chdv/i,
  /hhtt/i,
  /nhận\s*nhà/i,
  /view\s*sông/i,
  /siêu\s*rộng/i,
  /thông\s*từ/i,
  /huyết\s*mạch/i,
  /^(?:lầu|trệt|trống|lớn|năm|rộng)$/i,
  /^(?:a|anh|chị|c|em)\s+[A-ZÀ-Ỹ]/i
];

function normalizeStreetFacet(raw) {
  let str = String(raw || "").trim();
  if (!str) return "";
  str = str.replace(/[.,;]+$/, "").trim();
  if (str.length <= 2) return "";
  for (const pattern of JUNK_STREET_PATTERNS) {
    if (pattern.test(str)) return "";
  }
  str = str.replace(/[,/]?\s*(?:q\.|quận|p\.|phường)\s*.*$/iu, "").trim();
  if (!str || str.length <= 2) return "";

  if (/^(?:đường\s+)?số\s+(\d+.*)$/i.test(str)) {
    const num = str.match(/^(?:đường\s+)?số\s+(\d+.*)$/i)[1];
    return "Đường Số " + toTitleCase(num);
  }

  return toTitleCase(str);
}

function uniqueCaseInsensitive(items, normalizer = (x) => String(x || "").trim()) {
  const map = new Map();
  for (const item of items || []) {
    const normalized = normalizer(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!map.has(key)) {
      map.set(key, normalized);
    } else {
      const existing = map.get(key);
      if (normalized !== existing && normalized[0] === normalized[0].toUpperCase() && existing[0] !== existing[0].toUpperCase()) {
        map.set(key, normalized);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "vi"));
}

    const result = await supabaseRequest("properties?select=district,ward,street,property_type&status=neq.archived&order=district.asc&limit=5000");
    
    cachedFacets = {
      ok: true,
      districts: uniqueCaseInsensitive((result.data || []).map(r => r.district), normalizeDistrictFacet),
      wards: uniqueCaseInsensitive((result.data || []).map(r => r.ward)),
      streets: uniqueCaseInsensitive((result.data || []).map(r => r.street), normalizeStreetFacet),
      types: uniqueCaseInsensitive((result.data || []).map(r => r.property_type))
    };
    cachedFacetsTime = now;

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
    res.status(200).json(cachedFacets);
  } catch (error) {
    if (cachedFacets) {
      return res.status(200).json(cachedFacets);
    }
    sendError(res, error);
  }
};

