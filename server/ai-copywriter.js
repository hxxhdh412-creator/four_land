// ============================================================================
// FOURLAND AI COPYWRITER – bài đăng Facebook phong cách môi giới cá nhân
// ----------------------------------------------------------------------------
// - Có cấu hình AI (biến môi trường) -> gọi mô hình theo prompt chuẩn của Fourland.
// - Không có / lỗi AI -> bộ viết theo quy tắc cùng phong cách, KHÔNG bịa dữ liệu.
// - Luôn: ẩn số nhà, ẩn SĐT chủ nhà, ẩn hoa hồng, giá đặt gần cuối, giữ CTA cố định.
//
// Biến môi trường (không hard-code key/model trong mã nguồn):
//   AI_CONTENT_MODEL      bắt buộc để bật AI (vd. tên model của nhà cung cấp)
//   AI_CONTENT_PROVIDER   "gemini" | "openai" (tuỳ chọn, tự nhận theo key)
//   AI_CONTENT_BASE_URL   tuỳ chọn, endpoint tương thích OpenAI (dùng chung proxy với AI tách dữ liệu Zalo)
//   GEMINI_API_KEY / OPENAI_API_KEY
//   FACEBOOK_CTA          tuỳ chọn, ghi đè khối CTA cuối bài
// ============================================================================

const { stripHouseNumber, isRentalProperty } = require("./cms-facebook");

const DEFAULT_CTA = "📲 Ngọc: 0376789808\n🌿 Hỗ trợ tìm nhà theo khu vực & ngân sách, làm việc chính chủ.";
const CTA_PHONE_DIGITS = "0376789808";

const COPYWRITER_PROMPT = `Bạn là copywriter chuyên viết bài bất động sản nhà phố TP.HCM.

Hãy dựa trên thông tin căn nhà tôi cung cấp để viết một bài đăng Facebook theo phong cách môi giới cá nhân, cuốn hút, có cảm giác người thật đang chia sẻ một căn nhà đáng xem.

Yêu cầu:

• Mở đầu bằng 1 headline thật mạnh, viết IN HOA, có thể dùng emoji phù hợp.
• Headline ưu tiên khai thác điểm nổi bật nhất như: giá, diện tích, ngang lớn, vị trí, thiết kế đẹp, hẻm xe hơi, công viên, nhà mới, villa…
• Có thể dùng kiểu tạo tò mò như: “ĐẮT HAY ĐÁNG TIỀN?”, “CĂN NÀY MÀ BỎ QUA THÌ HƠI TIẾC”, “HIẾM KHI GẶP CĂN…”
• Không viết theo kiểu liệt kê khô cứng.
• Miêu tả căn nhà bằng ngôn ngữ đời thường, có hình dung không gian và trải nghiệm sống.
• Nhấn mạnh 2 đến 4 lợi thế đáng tiền nhất của căn nhà.
• Các thông số như diện tích, kết cấu, phòng ngủ, WC, đường/hẻm, chỗ đậu xe phải được đưa vào tự nhiên.
• Nếu có yếu tố thiết kế đẹp, ngang lớn, nhiều ánh sáng, sân vườn, ban công, quầy bar, nội thất đẹp… hãy biến thành điểm tạo cảm xúc.
• Vị trí chỉ mô tả đúng thông tin được cung cấp, tuyệt đối không tự bịa khoảng cách hoặc tiện ích.
• Không dùng các câu quá phóng đại như “rẻ nhất thị trường”, “đầu tư chắc thắng”, “tăng giá chắc chắn”.
• Giá nên được đặt gần cuối bài để tạo điểm rơi.
• Văn phong ngắn, sang, dễ đọc trên Facebook, có khoảng trắng giữa các đoạn.
• Độ dài khoảng 120 đến 180 từ.
• Có thể dùng emoji 🌿🌳✨🏡🚘 nhưng không lạm dụng.

Cuối bài luôn giữ CTA:

{{CTA}}

Nếu thông tin đầu vào chưa đủ, không tự bịa. Chỉ sử dụng dữ liệu tôi cung cấp.

Quy tắc bổ sung của hệ thống:
• Không ghi số nhà cụ thể, không ghi số điện thoại chủ nhà, không ghi hoa hồng/phí môi giới.
• Không thêm nhận định không có trong dữ liệu (ví dụ: vuông vức, thuận tiện kết nối, an ninh, khu dân trí cao, gần trung tâm); cảm xúc chỉ được xây trên chi tiết có thật.
• Không dùng markdown (không **, không #), chỉ trả về đúng nội dung bài đăng hoàn chỉnh, không giải thích thêm.
• Nếu là nhà cho thuê, ghi rõ là cho thuê và giá thuê theo tháng; nếu là nhà bán, ghi giá bán.`;

const TONE_HINTS = {
  hot: "Phong cách: thu hút, tạo tò mò mạnh ở headline.",
  detail: "Phong cách: miêu tả không gian kỹ hơn, độ dài gần 180 từ.",
  quick: "Phong cách: súc tích, độ dài gần 120 từ."
};

// ---------------------------------------------------------------------------
// Chuẩn hoá dữ liệu đầu vào (chỉ dùng trường có thật)
// ---------------------------------------------------------------------------
function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function houseNumberPrefix(address) {
  const raw = cleanText(address).split(",")[0];
  const street = stripHouseNumber(raw);
  if (!street || street === raw) return "";
  const idx = raw.lastIndexOf(street);
  return idx > 0 ? raw.slice(0, idx).trim() : "";
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

// Chỉ xoá số nhà khi nó đứng ngay trước tên đường (không đụng tới giá hay diện tích)
function stripHouseNumberMentions(text, address) {
  const raw = cleanText(address).split(",")[0];
  const prefix = houseNumberPrefix(address);
  if (!prefix) return String(text || "");
  const street = stripHouseNumber(raw);
  const re = new RegExp(`${escapeRegex(prefix)}\\s*(?=${escapeRegex(street)})`, "gi");
  return String(text || "").replace(re, "");
}

function removePhones(text, keepDigits = CTA_PHONE_DIGITS) {
  return String(text || "").replace(/(?<![\d.,])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?![\d])/g, match => {
    const digits = match.replace(/\D/g, "").replace(/^84/, "0");
    return digits === keepDigits ? match : "";
  });
}

function sanitizeSourceDescription(property = {}) {
  const raw = [
    property.raw_text,
    property.data_json?.content?.rawText,
    property.data_json?.raw_text,
    property.notes,
    property.data_json?.property?.notes
  ].map(v => String(v || "").trim()).find(Boolean) || "";
  if (!raw) return "";
  const lines = raw.split(/\r?\n/)
    .map(line => removePhones(line, "__none__"))
    .filter(line => !/\b(?:hh|hhtt|hoa\s*hồng|phí\s*mg|commission)\b/i.test(line))
    .filter(line => !/thuê\s+và\s+bán/i.test(line))
    .map(line => stripHouseNumberMentions(line, property.address))
    .map(cleanText)
    .filter(Boolean);
  return lines.join("\n").slice(0, 1200);
}

function pick(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text && text !== "0" && text.toLowerCase() !== "null") return text;
  }
  return "";
}

function buildPropertyFacts(property = {}) {
  const isRent = isRentalProperty(property);
  const p = property.data_json?.property || {};
  const street = pick(stripHouseNumber(cleanText(property.address).split(",")[0]), property.street, p.street);
  let price = pick(property.price_text, p.price?.text);
  if (price && isRent && !/(?:tháng|\/th)/i.test(price) && !/liên hệ|thỏa thuận|thoả thuận/i.test(price)) {
    price = `${price}/tháng`;
  }
  return {
    transaction: isRent ? "Cho thuê" : "Bán",
    propertyType: pick(property.property_type, p.type),
    street,
    ward: pick(property.ward, p.ward),
    district: pick(property.district, p.district),
    area: pick(property.area_text, p.area),
    dimensions: pick(property.dimensions, p.dimensions),
    structure: pick(property.structure, p.structure),
    bedrooms: pick(property.bedrooms, p.bedrooms),
    bathrooms: pick(property.bathrooms, p.bathrooms),
    legal: pick(property.legal, p.legal),
    price,
    description: sanitizeSourceDescription(property)
  };
}

function factsToPrompt(facts) {
  const rows = [
    ["Hình thức", facts.transaction],
    ["Loại nhà", facts.propertyType],
    ["Đường", facts.street],
    ["Phường", facts.ward],
    ["Quận", facts.district],
    ["Diện tích", facts.area],
    ["Kích thước", facts.dimensions],
    ["Kết cấu", facts.structure],
    ["Phòng ngủ", facts.bedrooms],
    ["WC", facts.bathrooms],
    ["Pháp lý", facts.legal],
    ["Giá", facts.price]
  ].filter(([, value]) => value);
  let text = "THÔNG TIN CĂN NHÀ:\n" + rows.map(([k, v]) => `- ${k}: ${v}`).join("\n");
  if (facts.description) text += `\n\nMÔ TẢ GỐC TỪ NGUỒN (chỉ dùng thông tin có trong đây):\n${facts.description}`;
  return text;
}

// ---------------------------------------------------------------------------
// Hậu kiểm đầu ra: ẩn số nhà / SĐT lạ, bỏ markdown, đảm bảo CTA cuối bài
// ---------------------------------------------------------------------------
function finalizePost(text, property = {}, { cta = DEFAULT_CTA, link = "" } = {}) {
  let out = String(text || "").replace(/\r/g, "");
  out = out.replace(/\*\*|__|^#+\s*/gm, "");
  out = stripHouseNumberMentions(out, property.address);
  out = out.split("\n").filter(line => !line.includes(CTA_PHONE_DIGITS) && !/Hỗ trợ tìm nhà theo khu vực/i.test(line)).join("\n");
  out = removePhones(out);
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const tail = [link ? `🌐 Xem thêm nhà tại: ${link}` : "", cta].filter(Boolean).join("\n\n");
  return `${out}\n\n${tail}`.trim();
}

function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Bộ viết theo quy tắc (dự phòng khi chưa bật AI) – cùng phong cách, không bịa
// ---------------------------------------------------------------------------
function parseFrontWidth(dimensions) {
  const m = String(dimensions || "").match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
  return m ? Number(m[1].replace(",", ".")) : 0;
}

function detectFeatures(corpus) {
  const t = corpus.toLowerCase();
  const has = re => re.test(t);
  return {
    villa: has(/biệt thự|villa/),
    frontage: has(/mặt tiền|\bmt\b/),
    carAlley: has(/hẻm xe hơi|hxh|ô tô|oto|xe hơi/),
    park: has(/công viên/),
    newHouse: has(/nhà mới|mới xây|mới tinh|xây mới/),
    balcony: has(/ban công/),
    garden: has(/sân vườn|cây xanh/),
    rooftop: has(/sân thượng/),
    furnished: has(/nội thất|full nt|ntcc/),
    bar: has(/quầy bar/),
    light: has(/ánh sáng|thoáng|giếng trời/),
    elevator: has(/thang máy/),
    parking: has(/đậu xe|để xe|gara|garage|chỗ đậu/)
  };
}

function buildRuleBasedBody(facts, tone = "hot") {
  const corpus = [facts.propertyType, facts.structure, facts.description].join(" ");
  const f = detectFeatures(corpus);
  const width = parseFrontWidth(facts.dimensions);
  const place = [facts.street ? `đường ${facts.street.replace(/^đường\s+/i, "")}` : "", facts.district].filter(Boolean).join(", ");
  const placeUpper = place.toUpperCase();
  const isRent = facts.transaction === "Cho thuê";

  let headline;
  if (f.villa) headline = `🏡 HIẾM KHI GẶP CĂN VILLA${placeUpper ? ` NGAY ${placeUpper}` : ""}`;
  else if (width >= 5) headline = `✨ NGANG ${String(width).replace(".", ",")}M${placeUpper ? ` – ${placeUpper}` : ""}: CĂN NÀY MÀ BỎ QUA THÌ HƠI TIẾC`;
  else if (f.carAlley) headline = `🚘 HẺM XE HƠI${placeUpper ? ` – ${placeUpper}` : ""}: ĐẮT HAY ĐÁNG TIỀN?`;
  else if (f.frontage) headline = `🏡 MẶT TIỀN${placeUpper ? ` ${placeUpper}` : ""} – ĐẮT HAY ĐÁNG TIỀN?`;
  else headline = `🏡 ${(facts.area ? facts.area + " " : "").toUpperCase()}${placeUpper ? `NGAY ${placeUpper}` : "NHÀ PHỐ ĐÁNG XEM"} – ĐẮT HAY ĐÁNG TIỀN?`;

  const paragraphs = [];
  const rawType = cleanText(facts.propertyType);
  const typeText = !rawType || /thuê|bán/i.test(rawType) ? "căn nhà" : rawType.toLowerCase();
  const loc = [facts.street ? `đường ${facts.street.replace(/^đường\s+/i, "")}` : "", facts.ward, facts.district].filter(Boolean).join(", ");
  paragraphs.push(`Gửi anh chị một ${typeText} ${isRent ? "đang cho thuê" : "đang bán"}${loc ? ` trên ${loc}` : ""} – kiểu nhà xem rồi là muốn tính chuyện dọn vào ngay.`);

  const space = [];
  const norm = v => String(v || "").toLowerCase().replace(/[\sm²]/g, "").replace(/×|\*/g, "x");
  const areaIsDims = facts.area && /\d\s*[x×*]\s*\d/i.test(facts.area);
  if (facts.area && facts.dimensions && norm(facts.area) !== norm(facts.dimensions) && !areaIsDims) space.push(`Diện tích ${facts.area}, kích thước ${facts.dimensions}`);
  else if (facts.dimensions || areaIsDims) space.push(`Kích thước ${facts.dimensions || facts.area}`);
  else if (facts.area) space.push(`Diện tích ${facts.area}`);
  if (facts.structure) space.push(`kết cấu ${facts.structure.toLowerCase()}`);
  const rooms = [facts.bedrooms ? `${facts.bedrooms.replace(/\s*pn$/i, "")} phòng ngủ` : "", facts.bathrooms ? `${facts.bathrooms.replace(/\s*wc$/i, "")} WC` : ""].filter(Boolean).join(", ");
  if (space.length || rooms) {
    paragraphs.push(`${space.join(", ")}${rooms ? `${space.length ? " – " : ""}${rooms}` : ""}. Không gian đủ rộng để mỗi thành viên có góc riêng mà cả nhà vẫn gần nhau.`);
  }

  const highlights = [];
  if (width >= 5) highlights.push(`🌿 Ngang ${String(width).replace(".", ",")}m – bề ngang rộng nên nhà thoáng, bố trí nội thất rất dễ chịu.`);
  if (f.carAlley) highlights.push("🚘 Hẻm xe hơi, đi lại và đón khách đều tiện.");
  if (f.frontage) highlights.push("✨ Mặt tiền, nhận diện tốt, vừa ở vừa có thể tính chuyện kinh doanh.");
  if (f.parking) highlights.push("🚘 Có chỗ để xe, khỏi lo chuyện gửi xe mỗi ngày.");
  if (f.park) highlights.push("🌳 Gần công viên, sáng chiều có chỗ đi dạo hít thở.");
  if (f.balcony || f.garden || f.rooftop) highlights.push(`🌿 ${[f.balcony ? "ban công" : "", f.garden ? "sân vườn" : "", f.rooftop ? "sân thượng" : ""].filter(Boolean).join(", ").replace(/^./, c => c.toUpperCase())} – góc thư giãn cuối ngày với ly cà phê.`);
  if (f.light) highlights.push("✨ Nhà đón sáng tốt, không gian lúc nào cũng thoáng.");
  if (f.furnished) highlights.push("🏡 Có nội thất, xách vali vào ở là được.");
  if (f.newHouse) highlights.push("✨ Nhà mới, sạch sẽ, không phải sửa sang.");
  if (f.elevator) highlights.push("✨ Có thang máy, lên xuống nhẹ nhàng cho cả nhà.");
  const maxHighlights = tone === "quick" ? 2 : 4;
  if (highlights.length) paragraphs.push(highlights.slice(0, maxHighlights).join("\n"));

  if (facts.legal) paragraphs.push(`Pháp lý: ${facts.legal}.`);
  if (facts.price) paragraphs.push(`💰 ${isRent ? "Giá thuê" : "Giá bán"}: ${facts.price}.`);
  else paragraphs.push("💰 Giá: anh chị inbox để mình gửi thông tin chi tiết.");

  return [headline, ...paragraphs].join("\n\n");
}

// ---------------------------------------------------------------------------
// Gọi mô hình AI
// ---------------------------------------------------------------------------
function resolveAiConfig(env = process.env) {
  const model = cleanText(env.AI_CONTENT_MODEL);
  const preferred = cleanText(env.AI_CONTENT_PROVIDER).toLowerCase();
  const geminiKey = cleanText(env.GEMINI_API_KEY);
  const openaiKey = cleanText(env.OPENAI_API_KEY);
  const baseUrl = cleanText(env.AI_CONTENT_BASE_URL).replace(/\/+$/, "");
  if (!model) return null;
  const openai = () => ({ provider: "openai", model, key: openaiKey, ...(baseUrl ? { baseUrl } : {}) });
  const gemini = () => ({ provider: "gemini", model, key: geminiKey });
  if ((preferred === "gemini" || !preferred) && geminiKey) return gemini();
  if ((preferred === "openai" || !preferred) && openaiKey) return openai();
  if (geminiKey) return gemini();
  if (openaiKey) return openai();
  return null;
}

async function callModel(config, systemPrompt, userPrompt, fetchImpl = fetch) {
  const signal = AbortSignal.timeout(55000);
  if (config.provider === "gemini") {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 2048 }
      }),
      signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`AI ${res.status}: ${data?.error?.message || "lỗi không xác định"}`);
    return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
  }
  const base = String(config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` };
  // 1. Chuẩn /chat/completions (giống AI tách dữ liệu Zalo)
  const res = await fetchImpl(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    }),
    signal
  });
  const data = await res.json().catch(() => ({}));
  const chatText = String(data.choices?.[0]?.message?.content || "").trim();
  if (res.ok && chatText) return chatText;
  // 2. Dự phòng /responses cho proxy không hỗ trợ chat/completions
  if (!res.ok && ![400, 404, 405].includes(res.status)) {
    throw new Error(`AI ${res.status}: ${data?.error?.message || "lỗi không xác định"}`);
  }
  const res2 = await fetchImpl(`${base}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: config.model, instructions: systemPrompt, input: userPrompt, max_output_tokens: 1500 }),
    signal
  });
  const data2 = await res2.json().catch(() => ({}));
  if (!res2.ok) throw new Error(`AI ${res2.status}: ${data2?.error?.message || data?.error?.message || "lỗi không xác định"}`);
  const text = data2.output_text
    || (data2.output || []).flatMap(item => item.content || []).map(part => part.text || "").join("");
  return String(text || "").trim();
}

// Cache kết quả AI (chưa gắn link/CTA) để mở lại nháp hoặc bật/tắt link là có ngay
const AI_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const aiCache = new Map();
function aiCacheKey(property, tone, userPrompt, config) {
  const hash = require("crypto").createHash("sha1").update(userPrompt).digest("hex").slice(0, 16);
  return `${property.property_id || ""}|${tone}|${config.provider}:${config.model}|${hash}`;
}

async function writeFacebookCopy(property = {}, options = {}) {
  const tone = TONE_HINTS[options.tone] ? options.tone : "hot";
  const cta = cleanText(options.cta || process.env.FACEBOOK_CTA) ? String(options.cta || process.env.FACEBOOK_CTA).replace(/\\n/g, "\n") : DEFAULT_CTA;
  const link = options.includeLink ? "https://www.fourland.vn" : "";
  const facts = buildPropertyFacts(property);
  const config = options.aiConfig === undefined ? resolveAiConfig(options.env || process.env) : options.aiConfig;

  if (config) {
    const system = COPYWRITER_PROMPT.replace("{{CTA}}", cta);
    const user = `${factsToPrompt(facts)}\n\n${TONE_HINTS[tone]}`;
    const key = aiCacheKey(property, tone, user, config);
    const hit = aiCache.get(key);
    if (!options.regenerate && hit && Date.now() - hit.time < AI_CACHE_TTL_MS) {
      return { content: finalizePost(hit.raw, property, { cta, link }), generator: "ai", provider: config.provider, model: config.model, cached: true };
    }
    try {
      const raw = await callModel(config, system, user, options.fetchImpl || fetch);
      if (raw && countWords(raw) >= 40) {
        aiCache.set(key, { raw, time: Date.now() });
        if (aiCache.size > 300) aiCache.delete(aiCache.keys().next().value);
        return { content: finalizePost(raw, property, { cta, link }), generator: "ai", provider: config.provider, model: config.model };
      }
      throw new Error("AI trả về nội dung quá ngắn");
    } catch (error) {
      const content = finalizePost(buildRuleBasedBody(facts, tone), property, { cta, link });
      return { content, generator: "rules", aiError: String(error.message || error).slice(0, 200) };
    }
  }
  return { content: finalizePost(buildRuleBasedBody(facts, tone), property, { cta, link }), generator: "rules" };
}

module.exports = {
  COPYWRITER_PROMPT,
  DEFAULT_CTA,
  buildPropertyFacts,
  buildRuleBasedBody,
  factsToPrompt,
  finalizePost,
  resolveAiConfig,
  sanitizeSourceDescription,
  writeFacebookCopy
};
