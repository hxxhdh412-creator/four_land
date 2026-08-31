// ============================================================================
// FOURLAND SMART MATCHING ENGINE (Real Estate Intelligence)
// Multi-Criteria Weighted Scoring Algorithm & One-Click Zalo Pitch Generator
// ============================================================================

const { removeVietnameseTones } = require('../api/_smartSearch');

/**
 * Danh sách quận lân cận trong TP.HCM để tính điểm gần đúng
 */
const NEIGHBOR_DISTRICTS = {
  'Quận 1': ['Quận 3', 'Quận 4', 'Quận 5', 'Bình Thạnh', 'Phú Nhuận'],
  'Quận 3': ['Quận 1', 'Quận 10', 'Phú Nhuận', 'Tân Bình'],
  'Quận 10': ['Quận 3', 'Quận 5', 'Quận 11', 'Tân Bình'],
  'Tân Bình': ['Phú Nhuận', 'Quận 3', 'Quận 10', 'Tân Phú', 'Gò Vấp', 'Quận 12'],
  'Tân Phú': ['Tân Bình', 'Bình Tân', 'Quận 11', 'Quận 6', 'Quận 12'],
  'Gò Vấp': ['Bình Thạnh', 'Phú Nhuận', 'Tân Bình', 'Quận 12', 'Thủ Đức'],
  'Bình Thạnh': ['Quận 1', 'Phú Nhuận', 'Gò Vấp', 'Thủ Đức'],
  'Phú Nhuận': ['Quận 1', 'Quận 3', 'Bình Thạnh', 'Gò Vấp', 'Tân Bình'],
  'Thủ Đức': ['Bình Thạnh', 'Gò Vấp', 'Quận 9', 'Quận 2'],
  'Quận 7': ['Quận 4', 'Quận 8', 'Nhà Bè', 'Bình Chánh']
};

/**
 * Trích xuất giá trị số từ chuỗi giá (ví dụ: "20 triệu" -> 20000000, "15 tỷ" -> 15000000000)
 */
function extractPriceNumber(priceText) {
  if (!priceText) return null;
  const clean = String(priceText).toLowerCase().replace(',', '.');
  const billionMatch = clean.match(/([\d.]+)\s*(?:ty|tỷ)/i);
  if (billionMatch) return parseFloat(billionMatch[1]) * 1000000000;
  const millionMatch = clean.match(/([\d.]+)\s*(?:trieu|triệu|tr)/i);
  if (millionMatch) return parseFloat(millionMatch[1]) * 1000000;
  const numberOnly = clean.replace(/[^\d.]/g, '');
  const num = parseFloat(numberOnly);
  return Number.isNaN(num) ? null : num;
}

/**
 * Trích xuất diện tích từ chuỗi (ví dụ: "4x20" -> 80m2, "100m2" -> 100)
 */
function extractAreaNumber(areaText, dimensions) {
  if (dimensions) {
    const dimMatch = String(dimensions).match(/([\d.]+)\s*[xX*×]\s*([\d.]+)/);
    if (dimMatch) return parseFloat(dimMatch[1]) * parseFloat(dimMatch[2]);
  }
  if (!areaText) return null;
  const dimMatch = String(areaText).match(/([\d.]+)\s*[xX*×]\s*([\d.]+)/);
  if (dimMatch) return parseFloat(dimMatch[1]) * parseFloat(dimMatch[2]);
  const areaMatch = String(areaText).match(/([\d.]+)\s*(?:m2|m²|met)?/i);
  if (areaMatch) return parseFloat(areaMatch[1]);
  return null;
}

/**
 * Tính toán điểm khớp (Match Score: 0 - 100) giữa một BĐS và yêu cầu của khách
 */
function scorePropertyMatch(property, criteria = {}) {
  let score = 0;
  const reasons = [];
  const highlights = [];

  // Chuẩn bị dữ liệu BĐS
  const propDistrict = property.district || '';
  const propType = property.property_type || property.propertyType || '';
  const propPrice = property.price_number || extractPriceNumber(property.price_text || property.price);
  const propArea = property.area_number || extractAreaNumber(property.area_text || property.area, property.dimensions);
  const propBedrooms = Number(property.bedrooms || 0);

  // 1. TIÊU CHÍ KHU VỰC (Trọng số 30%)
  if (criteria.district) {
    const targetNorm = removeVietnameseTones(criteria.district);
    const propNorm = removeVietnameseTones(propDistrict);
    
    if (propNorm && propNorm.includes(targetNorm)) {
      score += 30;
      reasons.push({ pass: true, label: `Đúng quận yêu cầu: ${criteria.district}` });
      highlights.push(`Đúng ${criteria.district}`);
    } else {
      // Kiểm tra quận lân cận
      const neighbors = NEIGHBOR_DISTRICTS[criteria.district] || [];
      const isNeighbor = neighbors.some(n => removeVietnameseTones(n) === propNorm);
      if (isNeighbor) {
        score += 18;
        reasons.push({ pass: true, label: `Khu vực lân cận (${propDistrict}) tiếp giáp ${criteria.district}` });
        highlights.push(`Khu vực ${propDistrict}`);
      } else {
        reasons.push({ pass: false, label: `Khác quận yêu cầu (${propDistrict || 'Chưa rõ quận'})` });
      }
    }
  } else {
    // Không yêu cầu quận cụ thể
    score += 20;
  }

  // 2. TIÊU CHÍ NGÂN SÁCH (Trọng số 25%)
  const minPrice = criteria.minPrice || 0;
  const maxPrice = criteria.maxPrice || Infinity;
  
  if (propPrice && maxPrice !== Infinity) {
    if (propPrice >= minPrice && propPrice <= maxPrice) {
      score += 25;
      reasons.push({ pass: true, label: `Giá trong ngân sách (${property.price_text || property.price})` });
      highlights.push(`Giá đúng ngân sách`);
    } else if (propPrice > maxPrice && propPrice <= maxPrice * 1.12) {
      score += 16;
      reasons.push({ pass: true, label: `Giá vượt nhẹ ${Math.round((propPrice / maxPrice - 1) * 100)}% (${property.price_text || property.price}), có thể thương lượng` });
    } else if (propPrice < minPrice && minPrice > 0) {
      score += 25; // Rẻ hơn ngân sách là điểm cộng
      reasons.push({ pass: true, label: `Giá rẻ hơn ngân sách dự kiến (${property.price_text || property.price})` });
      highlights.push(`Giá siêu tiết kiệm`);
    } else {
      reasons.push({ pass: false, label: `Giá ngoài khoảng ngân sách (${property.price_text || property.price})` });
    }
  } else if (!maxPrice || maxPrice === Infinity) {
    score += 20;
  }

  // 3. TIÊU CHÍ DIỆN TÍCH / KÍCH THƯỚC (Trọng số 20%)
  const minArea = criteria.minArea || 0;
  const maxArea = criteria.maxArea || Infinity;

  if (propArea && (minArea > 0 || maxArea !== Infinity)) {
    if (propArea >= minArea * 0.85 && (maxArea === Infinity || propArea <= maxArea * 1.2)) {
      score += 20;
      reasons.push({ pass: true, label: `Diện tích phù hợp: ~${Math.round(propArea)}m²` });
      highlights.push(`Diện tích ~${Math.round(propArea)}m²`);
    } else {
      reasons.push({ pass: false, label: `Diện tích ~${Math.round(propArea)}m² (yêu cầu từ ${minArea || 0}m²)` });
    }
  } else {
    score += 15;
  }

  // 4. TIÊU CHÍ LOẠI BẤT ĐỘNG SẢN (Trọng số 15%)
  if (criteria.propertyType) {
    const targetTypeNorm = removeVietnameseTones(criteria.propertyType);
    const propTypeNorm = removeVietnameseTones(propType);
    if (propTypeNorm.includes(targetTypeNorm) || targetTypeNorm.includes(propTypeNorm)) {
      score += 15;
      reasons.push({ pass: true, label: `Đúng loại BĐS: ${propType}` });
      highlights.push(propType);
    } else {
      score += 5;
      reasons.push({ pass: false, label: `Loại BĐS: ${propType || 'Nhà đất'} (yêu cầu: ${criteria.propertyType})` });
    }
  } else {
    score += 15;
  }

  // 5. TIÊU CHÍ PHÒNG NGỦ / KẾT CẤU (Trọng số 10%)
  if (criteria.bedrooms && criteria.bedrooms > 0) {
    if (propBedrooms >= criteria.bedrooms) {
      score += 10;
      reasons.push({ pass: true, label: `Đủ ${propBedrooms} phòng ngủ` });
      highlights.push(`${propBedrooms} PN`);
    } else {
      reasons.push({ pass: false, label: `Chỉ có ${propBedrooms || 'chưa rõ'} PN (yêu cầu ${criteria.bedrooms} PN)` });
    }
  } else {
    score += 10;
  }

  // Bonus cho hồ sơ có hình ảnh đầy đủ
  const imageCount = Number(property.image_count || property.imageCount || 0);
  if (imageCount >= 3) {
    score = Math.min(100, score + 5);
    highlights.push(`${imageCount} ảnh thực tế`);
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));

  return {
    matchScore: finalScore,
    isTopMatch: finalScore >= 80,
    reasons,
    highlights: highlights.slice(0, 4)
  };
}

/**
 * Sinh văn bản giới thiệu BĐS gửi cho khách hàng qua Zalo
 */
function generateCustomerPitch(property, options = {}) {
  const agentName = options.agentName || 'Chuyên viên Tư vấn Fourland';
  const agentPhone = options.agentPhone || '090.xxx.xxxx';
  const address = property.address || `Khu vực ${property.district || 'TP.HCM'}`;
  const price = property.price_text || property.price || 'Thỏa thuận';
  const area = property.area_text || property.area || property.dimensions || '';
  const structure = property.structure || '';
  const legal = property.legal ? `\n- Pháp lý: ${property.legal}` : '';
  const notes = property.notes ? `\n- Điểm nổi bật: ${property.notes}` : '';

  return `[FOURLAND] THÔNG TIN BẤT ĐỘNG SẢN PHÙ HỢP

- Vị trí: ${address}
- Mức giá: ${price}
- Diện tích: ${area}
- Kết cấu: ${structure || 'Đang cập nhật'}${legal}${notes}

Nhà thực tế đúng thông tin và hình ảnh. Quý khách cần thêm thông tin chi tiết hoặc đặt lịch khảo sát thực tế, vui lòng liên hệ:
--------------------------
Tư vấn Fourland: ${agentName} - ${agentPhone}`;
}

/**
 * Xếp hạng danh sách BĐS theo độ khớp với nhu cầu
 */
function rankPropertiesForLead(properties, criteria = {}) {
  if (!Array.isArray(properties)) return [];

  return properties
    .map(property => {
      const match = scorePropertyMatch(property, criteria);
      return {
        ...property,
        matchScore: match.matchScore,
        isTopMatch: match.isTopMatch,
        reasons: match.reasons,
        highlights: match.highlights,
        pitchText: generateCustomerPitch(property)
      };
    })
    .filter(item => item.matchScore >= 40) // Chỉ giữ lại các căn có điểm khớp từ 40% trở lên
    .sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = {
  scorePropertyMatch,
  generateCustomerPitch,
  rankPropertiesForLead,
  extractPriceNumber,
  extractAreaNumber,
  NEIGHBOR_DISTRICTS
};
