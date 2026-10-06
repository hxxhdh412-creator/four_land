const { sendError, supabaseRequest } = require("./_supabase");

let cachedFacets = null;
let cachedFacetsTime = 0;
const FACETS_TTL_MS = 60000; // 1 phút cache RAM

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
  /^(?:a|anh|chị|c|em)\s+[A-ZÀ-Ỹ]/i,
  /(?:^|[^\p{L}])\d+(?:[.,]\d+)?\s*(?:tr|triệu|tỷ|k|usd|\$)(?!\p{L})/iu,
  /^(?:triệu|tr|tỷ)\/(?:tháng|th|m2)\b|\/tháng\b/iu,
  /\b(?:cho\s*thuê|mặt\s*bằng|lối\s*đi|xe\s*máy|nguyên\s*căn)\b/iu,
  /^\d+(?:[.,]\d+)?\s*x\s*\d+/iu,
  /^\d+\s*m$/iu,
  /^(?:q\.?\d*|quận\s*\d*|trệt|lầu|hxh|hbt|diệ)$/iu
];

function normalizeStreetFacet(raw) {
  let str = String(raw || "").trim();
  if (!str) return "";
  str = str.replace(/[.,;]+$/, "").trim();

  for (const pattern of JUNK_STREET_PATTERNS) {
    if (pattern.test(str)) return "";
  }

  // Preserve Đường 3/2
  if (/^(?:đường\s+)?(?:3[\/-]2|3\s+tháng\s+2)$/i.test(str)) return "Đường 3/2";

  // Strip trailing district/ward annotations e.g. ", P.25, Q.Bình Thạnh", "Q.Tân Phú"
  str = str.replace(/[,/]?\s*(?:q\.|quận|p\.|phường)\s*.*$/iu, "").trim();

  // Strip multi-number ranges e.g. "4 - 106 - 108 Yersin", "29 - 31 Trần Nhật Duật"
  str = str.replace(/^(?:\d+[A-Za-z]?\s*[-–—/]\s*)+\d+[A-Za-z]?\s+/iu, "");

  // Strip house numbers with slashes e.g. "82/10A Đinh Bộ Lĩnh", "285/ Phạm Văn Chiêu", "4/6/ Thống Nhất"
  str = str.replace(/^(?:(?:số|căn|nhà|hẻm|hxh|hbt)\s+)?\d+[A-Za-z]?(?:\/\d*[A-Za-z]?)+\s*/iu, "");

  // Strip isolated trailing slash e.g. "7/ Phan Xích Long", "5/ Phạm Văn Chiêu"
  str = str.replace(/^\d+[A-Za-z]?\/\s*/iu, "");

  // Strip "328 Ter Trần Hưng Đạo" -> "Trần Hưng Đạo"
  str = str.replace(/^(?:\d+[A-Za-z]?\s+)?(?:ter|bis)\s+/iu, "");

  // Strip single leading house number e.g. "7 Nam Kỳ Khởi Nghĩa", "8 Khu Dân Cư Savimex"
  if (!/^(?:đường\s+)?(?:số\s+\d+|3[\/-]2|[A-Za-z]?\d+[A-Za-z]?$)/i.test(str)) {
    str = str.replace(/^\d+[a-zA-Z]?\s+(?=[A-ZÀ-Ỹa-zà-ỹ])/iu, "");
  }

  // Normalize Đường Số X
  if (/^(?:đường\s+)?số\s+(\d+.*)$/iu.test(str)) {
    const num = str.match(/^(?:đường\s+)?số\s+(\d+.*)$/iu)[1];
    return "Đường Số " + toTitleCase(num);
  }

  // Normalize Đường A4, Đường D5, Đường C1, Đường S2
  if (/^(?:đường\s+)?([A-Za-z]\d+)$/iu.test(str)) {
    return "Đường " + str.match(/^(?:đường\s+)?([A-Za-z]\d+)$/iu)[1].toUpperCase();
  }

  // Normalize Đường 49B, Đường 41
  if (/^(?:đường\s+)?(\d+[A-Za-z]?)$/iu.test(str)) {
    return "Đường " + str.match(/^(?:đường\s+)?(\d+[A-Za-z]?)$/iu)[1].toUpperCase();
  }

  if (/^(?:đường\s+)?(?:3[\/-]2|3\s+tháng\s+2)$/i.test(str)) return "Đường 3/2";

  // Strip leading 'Đường ' so standard streets are clean (e.g. 'Nguyễn Trãi', 'Lê Văn Sỹ')
  str = str.replace(/^đường\s+/iu, "").trim();

  // If pure numbers or slashes remaining (like "6/2"), reject
  if (/^[\d\/\s\.-]+$/iu.test(str)) return "";
  if (str.length <= 2) return "";

  return toTitleCase(str);
}

const JUNK_WARD_PATTERNS = [
  /giặt\s*phơi/i,
  /ở\s*gia\s*đình/i,
  /gia\s*đình/i,
  /kinh\s*doanh/i,
  /rộng\s*rãi/i,
  /sạch\s*s/i,
  /phù\s*hợp/i,
  /kín\s*giá/i,
  /mái\s*có/i,
  /thiết\s*kế/i,
  /thông\s*tây\s*hội/i,
  /minh\s*châu/i,
  /\b(?:ngủ|khách|bếp|thờ|tắm|giặt|kín|mái|trọ|làm\s*việc|sinh\s*hoạt|master|tiếp\s*khách|phơi|wc)\b/i,
  /^(?:kho|nha|mb|hxh|là|đồng|đồng\s+thu|đức\s+nhuận|hường\s+hường)$/i
];

function normalizeWardFacet(raw) {
  let str = String(raw || "").trim();
  if (!str) return "";
  let core = str.replace(/^(?:phường|p(?!\p{L})\s*\.?)\s*/iu, "").trim();
  if (!core) return "";

  core = core.replace(/[,/]?\s*(?:q\b|quận|tp\b|thành phố|thủ đức|huyện)\.?\s*.*$/iu, "").trim();

  for (const p of JUNK_WARD_PATTERNS) {
    if (p.test(core)) return "";
  }

  if (/^đakao$/i.test(core)) core = "Đa Kao";
  else if (/^bến ngh$/i.test(core)) core = "Bến Nghé";
  else if (/^sơn k$/i.test(core)) core = "Sơn Kỳ";
  else if (/^tân sơn nh$/i.test(core)) core = "Tân Sơn Nhì";
  else if (/^phạm ngữ lão$/i.test(core)) core = "Phạm Ngũ Lão";
  else if (/^hbc$/i.test(core)) core = "Hiệp Bình Chánh";
  else if (/^hường\s*(\d+)$/i.test(core)) core = core.match(/\d+/)[0];

  if (/^\d+$/.test(core)) return `Phường ${parseInt(core, 10)}`;
  if (/^xã\s+/iu.test(core)) return `Xã ${toTitleCase(core.replace(/^xã\s+/iu, "").trim())}`;
  if (/^thị\s*trấn\s+/iu.test(core)) return `Thị trấn ${toTitleCase(core.replace(/^thị\s*trấn\s+/iu, "").trim())}`;

  if (core.length < 2 || core.length > 30) return "";
  return `Phường ${toTitleCase(core)}`;
}

function normalizePropertyTypeFacet(raw) {
  const str = String(raw || "").trim();
  if (!str) return "";
  const lower = str.toLowerCase();
  if (lower.includes("căn hộ") || lower.includes("chung cư") || lower.includes("chdv")) return "Căn hộ";
  if (lower.includes("biệt thự") || lower.includes("villa")) return "Biệt thự";
  if (lower.includes("mặt tiền") || lower.includes("shophouse") || lower.includes("mặt bằng") || lower.startsWith("mb")) return "Mặt tiền kinh doanh";
  if (lower.includes("đất")) return "Đất";
  if (lower.includes("nhà phố")) return "Nhà phố";
  if (lower.includes("tòa nhà") || lower.includes("văn phòng")) return "Tòa nhà";
  if (lower.includes("kho") || lower.includes("xưởng")) return "Kho xưởng";
  if (/^(?:nhà|thuê|nhà\s*thuê|cho\s*thuê|nguyên\s*căn|nhà\s*nguyên\s*căn)$/iu.test(lower) || lower.includes("thuê")) {
    return "Nhà thuê";
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
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
}

async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  try {
    const now = Date.now();
    if (cachedFacets && (now - cachedFacetsTime < FACETS_TTL_MS)) {
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
      return res.status(200).json(cachedFacets);
    }

    const result = await supabaseRequest("properties?select=district,ward,street,property_type&status=neq.archived&order=district.asc&limit=5000");
    
    cachedFacets = {
      ok: true,
      districts: uniqueCaseInsensitive((result.data || []).map(r => r.district), normalizeDistrictFacet),
      wards: uniqueCaseInsensitive((result.data || []).map(r => r.ward), normalizeWardFacet),
      streets: uniqueCaseInsensitive((result.data || []).map(r => r.street), normalizeStreetFacet),
      types: uniqueCaseInsensitive((result.data || []).map(r => r.property_type), normalizePropertyTypeFacet)
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
}

module.exports = handler;
module.exports.normalizeWardFacet = normalizeWardFacet;
module.exports.normalizeDistrictFacet = normalizeDistrictFacet;
module.exports.normalizeStreetFacet = normalizeStreetFacet;
module.exports.normalizePropertyTypeFacet = normalizePropertyTypeFacet;
module.exports.uniqueCaseInsensitive = uniqueCaseInsensitive;
