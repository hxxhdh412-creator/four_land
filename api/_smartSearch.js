// ============================================================================
// FOURLAND SMART SEARCH NLP ENGINE (Real Estate Intelligence)
// Ultra-smart Vietnamese Natural Language & Multi-Param Search Parser
// ============================================================================

function removeVietnameseTones(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const DISTRICT_MAP = [
  { name: 'Quận 1', patterns: [/\b(q\.?\s*1|quan\s*1|district\s*1)\b/i] },
  { name: 'Quận 2', patterns: [/\b(q\.?\s*2|quan\s*2|district\s*2)\b/i] },
  { name: 'Quận 3', patterns: [/\b(q\.?\s*3|quan\s*3|district\s*3)\b/i] },
  { name: 'Quận 4', patterns: [/\b(q\.?\s*4|quan\s*4|district\s*4)\b/i] },
  { name: 'Quận 5', patterns: [/\b(q\.?\s*5|quan\s*5|district\s*5)\b/i] },
  { name: 'Quận 6', patterns: [/\b(q\.?\s*6|quan\s*6|district\s*6)\b/i] },
  { name: 'Quận 7', patterns: [/\b(q\.?\s*7|quan\s*7|district\s*7)\b/i] },
  { name: 'Quận 8', patterns: [/\b(q\.?\s*8|quan\s*8|district\s*8)\b/i] },
  { name: 'Quận 9', patterns: [/\b(q\.?\s*9|quan\s*9|district\s*9)\b/i] },
  { name: 'Quận 10', patterns: [/\b(q\.?\s*10|quan\s*10|district\s*10)\b/i] },
  { name: 'Quận 11', patterns: [/\b(q\.?\s*11|quan\s*11|district\s*11)\b/i] },
  { name: 'Quận 12', patterns: [/\b(q\.?\s*12|quan\s*12|district\s*12)\b/i] },
  { name: 'Gò Vấp', patterns: [/\b(go\s*vap|gò\s*vấp|gv)\b/i] },
  { name: 'Bình Thạnh', patterns: [/\b(binh\s*thanh|bình\s*thạnh|bt)\b/i] },
  { name: 'Tân Bình', patterns: [/\b(tan\s*binh|tân\s*bình|tb)\b/i] },
  { name: 'Tân Phú', patterns: [/\b(tan\s*phu|tân\s*phú|tp)\b/i] },
  { name: 'Phú Nhuận', patterns: [/\b(phu\s*nhuan|phú\s*nhuận|pn)\b/i] },
  { name: 'Thủ Đức', patterns: [/\b(thu\s*duc|thủ\s*đức|tp\.?\s*thu\s*duc)\b/i] },
  { name: 'Bình Tân', patterns: [/\b(binh\s*tan|bình\s*tân)\b/i] },
  { name: 'Bình Chánh', patterns: [/\b(binh\s*chanh|bình\s*chánh)\b/i] },
  { name: 'Hóc Môn', patterns: [/\b(hoc\s*mon|hóc\s*môn|hm)\b/i] },
  { name: 'Nhà Bè', patterns: [/\b(nha\s*be|nhà\s*bè)\b/i] },
  { name: 'Củ Chi', patterns: [/\b(cu\s*chi|củ\s*chi)\b/i] },
  { name: 'Cần Giờ', patterns: [/\b(can\s*gio|cần\s*giờ)\b/i] }
];

const TYPE_MAP = [
  { name: 'Nhà phố', patterns: [/\b(nha\s*pho|nhà\s*phố|nha\s*o|nhà\s*ở)\b/i] },
  { name: 'Biệt thự', patterns: [/\b(biet\s*thu|biệt\s*thự|villa|dinh\s*thu)\b/i] },
  { name: 'Căn hộ', patterns: [/\b(can\s*ho|căn\s*hộ|chung\s*cu|chung\s*cư|condo|apartment)\b/i] },
  { name: 'Mặt tiền', patterns: [/\b(mat\s*tien|mặt\s*tiền|shophouse|kinh\s*doanh|mbkd)\b/i] },
  { name: 'Đất nền', patterns: [/\b(dat\s*nen|đất\s*nền|dat\s*tho\s*cu|lô\s*đất)\b/i] }
];

/**
 * Phân tích câu truy vấn tự nhiên tiếng Việt thành các bộ lọc chính xác
 */
function parseNaturalQuery(rawInput) {
  let text = String(rawInput || '').trim();
  if (!text) return { rawQuery: '', tokens: [], filters: {} };

  const parsed = {
    district: null,
    ward: null,
    propertyType: null,
    bedrooms: null,
    bathrooms: null,
    minPrice: null,
    maxPrice: null,
    minArea: null,
    maxArea: null,
    dimensions: null,
    phone: null,
    propertyId: null
  };

  let working = text;

  // 1. Nhận diện Mã hồ sơ (BDS-...)
  const idMatch = working.match(/\b(BDS[-\w]+)\b/i);
  if (idMatch) {
    parsed.propertyId = idMatch[1].toUpperCase();
    working = working.replace(idMatch[0], ' ');
  }

  // 2. Nhận diện Số điện thoại
  const phoneMatch = working.match(/(?:\+?84|0)(?:3|5|7|8|9)[0-9\s.-]{7,10}\b/);
  if (phoneMatch) {
    const cleanPhone = phoneMatch[0].replace(/\D/g, '');
    if (cleanPhone.length >= 9) {
      parsed.phone = cleanPhone.startsWith('84') ? '0' + cleanPhone.slice(2) : cleanPhone;
      working = working.replace(phoneMatch[0], ' ');
    }
  }

  // 3. Nhận diện Kích thước (4x15, 4.5x20, 5*18, 4 x 18m)
  const dimMatch = working.match(/\b(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)\s*(?:m|met)?\b/i);
  if (dimMatch) {
    parsed.dimensions = `${dimMatch[1].replace(',', '.')} × ${dimMatch[2].replace(',', '.')}`;
    working = working.replace(dimMatch[0], ' ');
  }

  // 4. Nhận diện Quận / Huyện
  for (const item of DISTRICT_MAP) {
    for (const pat of item.patterns) {
      if (pat.test(working)) {
        parsed.district = item.name;
        working = working.replace(pat, ' ');
        break;
      }
    }
    if (parsed.district) break;
  }

  // 5. Nhận diện Phường / Xã (P3, P.12, Phường 5, Phường Linh Đông...)
  const wardNumMatch = working.match(/\b(?:p\.?|phuong|phường)\s*(\d{1,2})\b/i);
  if (wardNumMatch) {
    parsed.ward = `Phường ${wardNumMatch[1]}`;
    working = working.replace(wardNumMatch[0], ' ');
  }

  // 6. Nhận diện Loại BĐS
  for (const item of TYPE_MAP) {
    for (const pat of item.patterns) {
      if (pat.test(working)) {
        parsed.propertyType = item.name;
        working = working.replace(pat, ' ');
        break;
      }
    }
    if (parsed.propertyType) break;
  }

  // 7. Nhận diện Phòng ngủ (2pn, 3 phòng ngủ, 4 phòng)
  const bedMatch = working.match(/\b(\d+)\s*(?:pn|phong\s*ngu|phòng\s*ngủ|phong|phòng)(?=\s|$|[,.;])/i);
  if (bedMatch) {
    parsed.bedrooms = parseInt(bedMatch[1], 10);
    working = working.replace(bedMatch[0], ' ');
  }

  // 8. Nhận diện Giá Tiền (Khoảng giá: 10-20tr, Dưới 15tr, Trên 5 tỷ...)
  // 8a. Dải giá: 10-20tr, 10 - 20 triệu, 5-10 tỷ
  const rangePriceMatch = working.match(/\b(\d+(?:[.,]\d+)?)\s*(?:-|den|đến|to)\s*(\d+(?:[.,]\d+)?)\s*(tr|trieu|triệu|ty|tỷ|k|m(?!2|²))\b/i);
  if (rangePriceMatch) {
    const unit = rangePriceMatch[3].toLowerCase();
    const mult = (unit === 'ty' || unit === 'tỷ') ? 1000000000 : 1000000;
    parsed.minPrice = parseFloat(rangePriceMatch[1].replace(',', '.')) * mult;
    parsed.maxPrice = parseFloat(rangePriceMatch[2].replace(',', '.')) * mult;
    working = working.replace(rangePriceMatch[0], ' ');
  } else {
    // 8b. Giá cận trên: dưới 15tr, < 15tr, toi da 15 trieu
    const maxPriceMatch = working.match(/\b(?:duoi|dưới|<|<=|den|đến|toi\s*da|tối\s*đa|tam|tầm)\s*(\d+(?:[.,]\d+)?)\s*(tr|trieu|triệu|ty|tỷ|k)?\b/i);
    if (maxPriceMatch && (maxPriceMatch[2] || parseFloat(maxPriceMatch[1]) >= 1000000)) {
      const unit = (maxPriceMatch[2] || '').toLowerCase();
      const mult = (unit === 'ty' || unit === 'tỷ') ? 1000000000 : (unit === 'tr' || unit === 'trieu' || unit === 'triệu') ? 1000000 : 1;
      parsed.maxPrice = parseFloat(maxPriceMatch[1].replace(',', '.')) * mult;
      working = working.replace(maxPriceMatch[0], ' ');
    }

    // 8c. Giá cận dưới: tren 10tr, > 10tr, tu 10 trieu
    const minPriceMatch = working.match(/\b(?:tren|trên|>|>=|tu|từ|khoang|khoảng)\s*(\d+(?:[.,]\d+)?)\s*(tr|trieu|triệu|ty|tỷ|k)\b/i);
    if (minPriceMatch) {
      const unit = minPriceMatch[2].toLowerCase();
      const mult = (unit === 'ty' || unit === 'tỷ') ? 1000000000 : 1000000;
      parsed.minPrice = parseFloat(minPriceMatch[1].replace(',', '.')) * mult;
      working = working.replace(minPriceMatch[0], ' ');
    }

    // 8d. Giá đơn lẻ: 14tr, 14 triệu, 5 tỷ
    if (!parsed.minPrice && !parsed.maxPrice) {
      const singlePriceMatch = working.match(/\b(\d+(?:[.,]\d+)?)\s*(tr|trieu|triệu|ty|tỷ)\b/i);
      if (singlePriceMatch) {
        const unit = singlePriceMatch[2].toLowerCase();
        const mult = (unit === 'ty' || unit === 'tỷ') ? 1000000000 : 1000000;
        const val = parseFloat(singlePriceMatch[1].replace(',', '.')) * mult;
        parsed.minPrice = val * 0.85;
        parsed.maxPrice = val * 1.15;
        working = working.replace(singlePriceMatch[0], ' ');
      }
    }
  }

  // 9. Nhận diện Diện tích (50m2, tren 50m, 50 - 100 m2)
  const areaRangeMatch = working.match(/\b(\d+(?:[.,]\d+)?)\s*(?:-|den|đến)\s*(\d+(?:[.,]\d+)?)\s*(?:m2|m²|m)(?=\s|$|[,.;])/i);
  if (areaRangeMatch) {
    parsed.minArea = parseFloat(areaRangeMatch[1].replace(',', '.'));
    parsed.maxArea = parseFloat(areaRangeMatch[2].replace(',', '.'));
    working = working.replace(areaRangeMatch[0], ' ');
  } else {
    const maxAreaMatch = working.match(/\b(?:duoi|dưới|<|<=)\s*(\d+(?:[.,]\d+)?)\s*(?:m2|m²|m)?\b/i);
    if (maxAreaMatch && parseFloat(maxAreaMatch[1]) > 10) {
      parsed.maxArea = parseFloat(maxAreaMatch[1].replace(',', '.'));
      working = working.replace(maxAreaMatch[0], ' ');
    }
    const minAreaMatch = working.match(/\b(?:tren|trên|>|>=|tu|từ)\s*(\d+(?:[.,]\d+)?)\s*(?:m2|m²|m)?\b/i);
    if (minAreaMatch && parseFloat(minAreaMatch[1]) > 10) {
      parsed.minArea = parseFloat(minAreaMatch[1].replace(',', '.'));
      working = working.replace(minAreaMatch[0], ' ');
    }
    const singleAreaMatch = working.match(/\b(\d+(?:[.,]\d+)?)\s*(?:m2|m²)\b/i);
    if (singleAreaMatch) {
      const val = parseFloat(singleAreaMatch[1].replace(',', '.'));
      parsed.minArea = Math.max(0, val - 10);
      parsed.maxArea = val + 15;
      working = working.replace(singleAreaMatch[0], ' ');
    }
  }

  // 10. Tách từ khóa còn lại (Tokens) để tìm kiếm không dấu đa trường
  const cleanRemaining = working.replace(/[,*()"']/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = cleanRemaining
    ? cleanRemaining.split(' ').map(t => removeVietnameseTones(t)).filter(t => t.length > 0)
    : [];

  return {
    rawQuery: text,
    cleanQuery: cleanRemaining,
    tokens,
    filters: parsed
  };
}

/**
 * Thuật toán tính điểm liên quan & lọc hồ sơ đa tầng
 */
function matchAndScoreProperty(property, parsedNlp, explicitFilters = {}) {
  // 1. Kiểm tra các bộ lọc cứng (Explicit Filters hoặc NLP Filters)
  const district = explicitFilters.district || parsedNlp.filters.district;
  if (district) {
    const propDist = removeVietnameseTones(property.district || '');
    const searchDist = removeVietnameseTones(district);
    if (!propDist.includes(searchDist)) return -1;
  }

  const ward = explicitFilters.ward || parsedNlp.filters.ward;
  if (ward) {
    const propWard = removeVietnameseTones(property.ward || '');
    const searchWard = removeVietnameseTones(ward);
    if (!propWard.includes(searchWard)) return -1;
  }

  const street = explicitFilters.street;
  if (street) {
    const propStreet = removeVietnameseTones(property.street || '');
    const searchStreet = removeVietnameseTones(street);
    if (!propStreet.includes(searchStreet)) return -1;
  }

  const pType = explicitFilters.property_type || parsedNlp.filters.propertyType;
  if (pType) {
    const propType = removeVietnameseTones(property.property_type || '');
    const searchType = removeVietnameseTones(pType);
    if (!propType.includes(searchType)) return -1;
  }

  const bedrooms = explicitFilters.bedrooms || parsedNlp.filters.bedrooms;
  if (bedrooms !== undefined && bedrooms !== null && bedrooms !== '') {
    const num = Number(bedrooms);
    if (Number.isFinite(num) && property.bedrooms !== null && property.bedrooms !== undefined) {
      if (property.bedrooms < num) return -1;
    }
  }

  const minPrice = explicitFilters.minPrice || parsedNlp.filters.minPrice;
  if (minPrice && Number.isFinite(Number(minPrice))) {
    if (property.price_number && property.price_number < Number(minPrice)) return -1;
  }

  const maxPrice = explicitFilters.maxPrice || parsedNlp.filters.maxPrice;
  if (maxPrice && Number.isFinite(Number(maxPrice))) {
    if (property.price_number && property.price_number > Number(maxPrice)) return -1;
  }

  const minArea = explicitFilters.minArea || parsedNlp.filters.minArea;
  if (minArea && Number.isFinite(Number(minArea))) {
    if (property.area_number && property.area_number < Number(minArea)) return -1;
  }

  const maxArea = explicitFilters.maxArea || parsedNlp.filters.maxArea;
  if (maxArea && Number.isFinite(Number(maxArea))) {
    if (property.area_number && property.area_number > Number(maxArea)) return -1;
  }

  // 1.5 Lọc theo khoảng thời gian đăng / cập nhật
  if (explicitFilters.timeRange) {
    const rawTime = property.received_at || property.updated_at || property.created_at;
    const received = rawTime ? new Date(rawTime).getTime() : 0;
    if (!received || Number.isNaN(received)) return -1;
    const now = Date.now();
    if (explicitFilters.timeRange === 'today') {
      if (now - received > 24 * 3600 * 1000) return -1;
    } else if (explicitFilters.timeRange === '3days') {
      if (now - received > 3 * 24 * 3600 * 1000) return -1;
    } else if (explicitFilters.timeRange === '7days') {
      if (now - received > 7 * 24 * 3600 * 1000) return -1;
    } else if (explicitFilters.timeRange === '30days') {
      if (now - received > 30 * 24 * 3600 * 1000) return -1;
    } else if (explicitFilters.timeRange === 'this_month') {
      const nowD = new Date();
      const startOfMonth = new Date(nowD.getFullYear(), nowD.getMonth(), 1).getTime();
      if (received < startOfMonth) return -1;
    }
  }

  // 1.6 Lọc theo tình trạng cho thuê (Đã thuê / Đang mở thuê)
  if (explicitFilters.rentalStatus) {
    const isRented = property.status === 'rented' || Boolean(property.data_json?.is_rented);
    if (explicitFilters.rentalStatus === 'rented' && !isRented) return -1;
    if (explicitFilters.rentalStatus === 'available' && isRented) return -1;
  }

  // 2. So khớp Tokens từ khóa không dấu (AND logic across all fields)
  let score = 100;
  if (parsedNlp.tokens.length > 0) {
    const searchableFields = [
      property.address,
      property.street,
      property.ward,
      property.district,
      property.property_type,
      property.phone,
      property.property_id,
      property.dimensions,
      property.structure,
      property.price_text,
      property.raw_text,
      property.notes,
      property.normalized_text
    ].filter(Boolean).map(f => removeVietnameseTones(f)).join(' ');

    const rawNormalized = removeVietnameseTones(parsedNlp.cleanQuery);
    
    // Exact phrase match bonus
    if (rawNormalized && searchableFields.includes(rawNormalized)) {
      score += 150;
    }

    // Address prefix match bonus
    if (rawNormalized && removeVietnameseTones(property.address || '').includes(rawNormalized)) {
      score += 200;
    }

    // Verify all tokens exist
    for (const token of parsedNlp.tokens) {
      if (!searchableFields.includes(token)) {
        return -1; // Token missing -> exclude
      }
      score += 20;
    }
  }

  // Boost properties with images and active status
  if (property.image_count > 0) score += 15;
  if (property.status === 'complete') score += 10;

  return score;
}

module.exports = {
  DISTRICT_MAP,
  TYPE_MAP,
  matchAndScoreProperty,
  parseNaturalQuery,
  removeVietnameseTones
};
