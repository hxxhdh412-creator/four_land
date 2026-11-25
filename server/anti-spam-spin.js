// ============================================================================
// FOURLAND ZERO-AI ANTI-SPAM SPIN & IMAGE SHUFFLE ENGINE
// ----------------------------------------------------------------------------
// Dựa trên kho kiến thức AI Copywriter BĐS nhà phố TP.HCM của hệ thống:
// - Xáo trộn vị trí hình ảnh thông minh cho từng nhóm (xoay ảnh bìa + Fisher-Yates)
// - Spin nội dung đa tầng (cú pháp {a|b|c} + từ điển văn phong môi giới BĐS tự nhiên)
// - KHÔNG gọi API AI (0đ chi phí, < 1ms/nhóm), bảo toàn 100% số liệu thật, giá, SĐT, link.
// ============================================================================

function expandSpintax(input, rng = Math.random) {
  let s = String(input || "");
  const re = /\{([^{}]+)\}/;
  let guard = 0;
  while (re.test(s) && guard++ < 200) {
    s = s.replace(re, (_, body) => {
      const opts = body.split("|");
      return opts[Math.floor(rng() * opts.length)];
    });
  }
  return s;
}

// Từ điển đồng nghĩa văn phong môi giới BĐS (chỉ thay cụm từ dẫn dắt, tuyệt đối KHÔNG chạm số liệu/địa danh)
const BDS_PHRASE_FAMILIES = [
  [/\bGửi anh chị một\b/gi, ["Gửi anh chị một", "Chia sẻ tới anh chị một", "Giới thiệu anh chị một", "Mời anh chị xem qua một"]],
  [/\bAi đang tìm\b/gi, ["Ai đang tìm", "Anh chị nào đang tìm", "Khách đang cần tìm", "Gia đình mình đang tìm"]],
  [/\bđang cho thuê\b/gi, ["đang cho thuê", "hiện cho thuê", "cần cho thuê", "chính chủ gửi thuê"]],
  [/\bđang bán\b/gi, ["đang bán", "chính chủ gửi bán", "hiện chào bán", "đang tìm chủ mới"]],
  [/\bkết cấu\b/gi, ["kết cấu", "thiết kế xây dựng", "hiện trạng kết cấu", "quy mô xây dựng"]],
  [/\bphòng ngủ\b/gi, ["phòng ngủ", "PN", "phòng ngủ thoáng", "phòng ngủ riêng"]],
  [/\bHẻm xe hơi\b/g, ["Hẻm xe hơi", "Đường xe hơi vào thoải mái", "Hẻm ô tô di chuyển tiện", "Ngõ xe hơi ra vào dễ dàng"]],
  [/\bhẻm xe hơi\b/g, ["hẻm xe hơi", "đường xe hơi vào tận nơi", "hẻm ô tô đi lại tiện", "lối vào xe hơi thoải mái"]],
  [/\bxách vali vào ở\b/gi, ["xách vali vào ở", "dọn vào ở ngay", "vào sử dụng ngay", "nhận nhà ở liền"]],
  [/\blàm việc chính chủ\b/gi, ["làm việc chính chủ", "thương lượng trực tiếp chính chủ", "gặp trực tiếp chủ nhà", "làm việc thẳng với chủ"]],
  [/\bxem nhà thực tế\b/gi, ["xem nhà thực tế", "ghé xem trực tiếp", "đi xem thực tế căn này", "hẹn xem nhà trực tiếp"]],
  [/\bXem thêm nhà tại:/gi, ["Xem thêm nhà tại:", "Kho nhà chọn lọc tại:", "Tham khảo thêm kho nhà:", "Xem chi tiết kho nhà:"]],
  [/\bHỗ trợ tìm nhà theo khu vực & ngân sách\b/gi, [
    "Hỗ trợ tìm nhà theo khu vực & ngân sách",
    "Nhận tìm nhà đúng khu vực & tầm tài chính",
    "Đồng hành tìm nhà chuẩn nhu cầu & ngân sách",
    "Hỗ trợ lọc nhà đẹp đúng quận & tài chính"
  ]],
  [/\bĐẮT HAY ĐÁNG TIỀN\?/g, ["ĐẮT HAY ĐÁNG TIỀN?", "CÓ ĐÁNG ĐI XEM NGAY?", "LỰA CHỌN ĐÁNG CÂN NHẮC!", "XEM THỰC TẾ DỄ ƯNG NGAY!"]],
  [/\bCĂN NÀY MÀ BỎ QUA THÌ HƠI TIẾC\b/g, [
    "CĂN NÀY MÀ BỎ QUA THÌ HƠI TIẾC",
    "CĂN NÀY XEM NGOÀI ĐỜI CÒN ƯNG HƠN",
    "HIẾM KHI CÓ CĂN NGANG RỘNG NHƯ VẬY",
    "ĐÁNG ĐỂ ANH CHỊ GHÉ XEM TRỰC TIẾP"
  ]]
];

const HEADLINE_ICONS = ["🏡", "✨", "🌿", "🔥", "📍", "🔑"];
const BULLET_STYLES = ["•", "▪️", "🌿", "👉", "✦"];

function simpleHash(str) {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Biến đổi văn bản chống Spam Facebook dựa trên kiến thức copywriting BĐS (0đ AI).
 * - stepIndex === 0 và không có {a|b}: vẫn giải {a|b} nếu có, giữ giọng tự nhiên.
 * - stepIndex >= 1: xoay từ vựng tương đương, đổi bộ bullet/icon đầu dòng, đảm bảo không trùng hash với các nhóm trước.
 */
function smartBdsAntiSpamSpin(rawText, { stepIndex = 0, recentHashes = [], rng = Math.random } = {}) {
  const base = String(rawText || "").trim();
  if (!base) return "";

  const seen = new Set(Array.isArray(recentHashes) ? recentHashes : []);
  let best = "";

  for (let attempt = 0; attempt < 16; attempt++) {
    let candidate = expandSpintax(base, rng);

    // Từ nhóm thứ 2 trở đi (hoặc khi cần tránh trùng hash), áp dụng biến tấu cụm từ môi giới BĐS
    if (stepIndex > 0 || attempt > 0) {
      for (const [pattern, choices] of BDS_PHRASE_FAMILIES) {
        if (rng() < 0.78 || attempt > 2) {
          candidate = candidate.replace(pattern, (matched) => {
            const pick = choices[Math.floor(rng() * choices.length)];
            // Bảo toàn viết hoa chữ đầu nếu từ gốc viết hoa chữ đầu câu
            if (matched[0] === matched[0].toUpperCase() && matched[0] !== matched[0].toLowerCase()) {
              return pick.charAt(0).toUpperCase() + pick.slice(1);
            }
            return pick;
          });
        }
      }

      // Xoay icon mở đầu dòng tiêu đề
      const lines = candidate.split("\n");
      if (lines.length > 0) {
        const icon = HEADLINE_ICONS[(stepIndex + attempt) % HEADLINE_ICONS.length];
        lines[0] = lines[0].replace(/^(?:🏡|✨|🌿|🔥|📍|🔑|⚡|💥)\s*/u, `${icon} `);
      }

      // Đồng bộ kiểu dấu đầu dòng (bullet) riêng cho lượt này
      const bullet = BULLET_STYLES[(stepIndex + attempt) % BULLET_STYLES.length];
      for (let i = 1; i < lines.length; i++) {
        if (/^(?:•|▪️|▫|👉|✦)\s+/.test(lines[i])) {
          lines[i] = lines[i].replace(/^(?:•|▪️|▫|👉|✦)\s+/, `${bullet} `);
        }
      }

      // Xoay nhẹ nhãn liên hệ cuối bài mà giữ nguyên 100% số điện thoại
      const ctaIcons = ["📲", "📞", "☎️", "📩"];
      const ctaIcon = ctaIcons[(stepIndex + attempt) % ctaIcons.length];
      for (let i = Math.max(1, lines.length - 4); i < lines.length; i++) {
        lines[i] = lines[i].replace(/^📲\s*Ngọc:/u, () => {
          const labels = ["Ngọc:", "Liên hệ Ngọc:", "Zalo/Call Ngọc:", "Gặp Ngọc:"];
          return `${ctaIcon} ${labels[(stepIndex + attempt) % labels.length]}`;
        });
      }

      candidate = lines.join("\n");
    }

    const h = simpleHash(candidate);
    best = candidate;
    if (!seen.has(h)) {
      seen.add(h);
      break;
    }
  }

  return best;
}

/**
 * Xáo trộn vị trí hình ảnh chống trùng lặp Album trên Facebook:
 * - Nhóm đầu tiên (stepIndex === 0): giữ nguyên thứ tự gốc (ảnh bìa chuẩn).
 * - Từ nhóm thứ 2 trở đi (stepIndex >= 1):
 *   + Đổi ảnh bìa dẫn đầu xoay vòng theo (stepIndex % N) để không lặp ảnh đầu tiên.
 *   + Xáo ngẫu nhiên Fisher-Yates toàn bộ các ảnh còn lại.
 *   + Tránh trùng chữ ký thứ tự với lượt ngay trước đó (lastSignature).
 */
function shuffleImagesForGroup(items = [], { stepIndex = 0, lastSignature = "", rng = Math.random } = {}) {
  const arr = Array.isArray(items) ? [...items] : [];
  if (arr.length <= 1 || stepIndex <= 0) {
    const sig = arr.map((_, idx) => idx).join(",");
    return { items: arr, signature: sig };
  }

  const indices = arr.map((_, idx) => idx);
  let chosen = indices;

  for (let attempt = 0; attempt < 12; attempt++) {
    const leadIdx = (stepIndex + attempt) % arr.length;
    const rest = indices.filter((i) => i !== leadIdx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const cand = [leadIdx, ...rest];
    const sig = cand.join(",");
    chosen = cand;
    if (sig !== lastSignature) {
      return { items: cand.map((i) => arr[i]), signature: sig };
    }
  }

  return { items: chosen.map((i) => arr[i]), signature: chosen.join(",") };
}

module.exports = {
  expandSpintax,
  smartBdsAntiSpamSpin,
  shuffleImagesForGroup,
  simpleHash
};
