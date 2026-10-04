const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COPYWRITER_PROMPT,
  buildPropertyFacts,
  finalizePost,
  resolveAiConfig,
  writeFacebookCopy
} = require("../server/ai-copywriter");

const rental = {
  property_id: "BDS-20261004-E2B688EB",
  address: "280 Nguyễn Trọng Tuyển, Phường 8, Phú Nhuận",
  street: "Nguyễn Trọng Tuyển",
  ward: "Phường 8",
  district: "Phú Nhuận",
  property_type: "Nhà thuê",
  price_text: "55 triệu",
  price_number: 55000000,
  area_text: "70 m²",
  dimensions: "5x14m",
  structure: "Trệt 3 lầu sân thượng",
  bedrooms: 4,
  bathrooms: 5,
  commission: "Thị trường",
  phone: "0909123456",
  raw_text: "280 Nguyễn Trọng Tuyển P8 Phú Nhuận\n5x14 trệt 3 lầu, ban công, hẻm xe hơi\n55tr hhtt 0909123456"
};

test("copywriter prompt keeps the user's required rules and CTA slot", () => {
  assert.match(COPYWRITER_PROMPT, /copywriter chuyên viết bài bất động sản nhà phố TP\.HCM/);
  assert.match(COPYWRITER_PROMPT, /Độ dài khoảng 120 đến 180 từ/);
  assert.match(COPYWRITER_PROMPT, /\{\{CTA\}\}/);
  assert.match(COPYWRITER_PROMPT, /không tự bịa/);
});

test("buildPropertyFacts uses only real fields and hides house number, owner phone, commission", () => {
  const facts = buildPropertyFacts(rental);
  assert.equal(facts.transaction, "Cho thuê");
  assert.equal(facts.street, "Nguyễn Trọng Tuyển");
  assert.equal(facts.price, "55 triệu/tháng");
  assert.equal(facts.legal, "");
  const dump = JSON.stringify(facts);
  assert.doesNotMatch(dump, /280 Nguyễn/);
  assert.doesNotMatch(dump, /0909123456/);
  assert.doesNotMatch(dump, /hhtt|Thị trường/);
  assert.match(facts.description, /ban công, hẻm xe hơi/);
});

test("rule-based fallback follows the style: caps headline, price near end, fixed CTA last", async () => {
  const { content, generator } = await writeFacebookCopy(rental, { tone: "hot", aiConfig: null });
  assert.equal(generator, "rules");
  const lines = content.split("\n").filter(Boolean);
  assert.equal(lines[0], lines[0].toUpperCase());
  assert.match(lines[0], /NGANG 5M/);
  assert.match(content, /ban công/i);
  assert.match(content, /Hẻm xe hơi/);
  assert.ok(content.endsWith("📲 Ngọc: 0376789808\n🌿 Hỗ trợ tìm nhà theo khu vực & ngân sách, làm việc chính chủ."));
  assert.ok(content.indexOf("55 triệu/tháng") > content.length * 0.6, "giá phải nằm gần cuối bài");
  assert.doesNotMatch(content, /280 Nguyễn|0909123456|Pháp lý/);
  assert.doesNotMatch(content, /trường học|siêu thị|bệnh viện|tăng giá/i);
});

test("AI path sends the prompt + facts and post-processes the answer", async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), headers: init.headers };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "**NGANG 5M GIỮA PHÚ NHUẬN – ĐẮT HAY ĐÁNG TIỀN? 🏡**\n\nCăn nhà 280 Nguyễn Trọng Tuyển rộng 70 m², trệt 3 lầu, 4 phòng ngủ, 5 WC. Ban công đón gió, hẻm xe hơi đậu thoải mái. Gọi chủ 0909123456. " + "Không gian sống thoáng đãng. ".repeat(12) + "\n\nGiá thuê 55 triệu/tháng.\n\n📲 Ngọc: 0376789808" } }]
      })
    };
  };
  const result = await writeFacebookCopy(rental, {
    tone: "hot",
    aiConfig: { provider: "openai", model: "test-model", key: "test-key" },
    fetchImpl
  });
  assert.equal(result.generator, "ai");
  assert.match(captured.url, /chat\/completions/);
  assert.match(captured.body.messages[0].content, /copywriter chuyên viết bài/);
  assert.match(captured.body.messages[1].content, /Giá: 55 triệu\/tháng/);
  assert.doesNotMatch(captured.body.messages[1].content, /0909123456/);
  assert.doesNotMatch(result.content, /\*\*/);
  assert.doesNotMatch(result.content, /280 Nguyễn/);
  assert.doesNotMatch(result.content, /0909123456/);
  assert.equal((result.content.match(/0376789808/g) || []).length, 1);
});

test("AI failure falls back to rules without throwing", async () => {
  const result = await writeFacebookCopy(rental, {
    aiConfig: { provider: "gemini", model: "test-model", key: "k" },
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "quota" } }) })
  });
  assert.equal(result.generator, "rules");
  assert.match(result.aiError, /429/);
  assert.match(result.content, /0376789808/);
});

test("resolveAiConfig requires a model and a key from env", () => {
  assert.equal(resolveAiConfig({}), null);
  assert.equal(resolveAiConfig({ GEMINI_API_KEY: "k" }), null);
  assert.deepEqual(resolveAiConfig({ AI_CONTENT_MODEL: "m", OPENAI_API_KEY: "o" }), { provider: "openai", model: "m", key: "o" });
  assert.equal(resolveAiConfig({ AI_CONTENT_MODEL: "m", GEMINI_API_KEY: "g", OPENAI_API_KEY: "o" }).provider, "gemini");
});

test("finalizePost keeps prices that share digits with the house number", () => {
  const out = finalizePost("Giá 280 triệu, nhà 280 Nguyễn Trọng Tuyển", { address: "280 Nguyễn Trọng Tuyển" });
  assert.match(out, /Giá 280 triệu/);
  assert.doesNotMatch(out, /280 Nguyễn/);
});

test("rule-based fallback does not repeat dimensions stored as area", async () => {
  const { content } = await writeFacebookCopy({ ...rental, area_text: "5x14", dimensions: "5x14", raw_text: "" }, { aiConfig: null });
  assert.equal((content.match(/5x14/g) || []).length, 1);
});
test("AI result is cached per property/tone and regenerate bypasses the cache", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ choices: [{ message: { content: "NGANG 5M PHÚ NHUẬN – ĐẮT HAY ĐÁNG TIỀN? " + "Nhà thoáng, hẻm xe hơi, ban công đón gió. ".repeat(10) + "Giá thuê 55 triệu/tháng." } }] }) }; };
  const cfg = { provider: "openai", model: "cache-test", key: "k" };
  const prop = { ...rental, property_id: "BDS-CACHE-1" };
  const a = await writeFacebookCopy(prop, { aiConfig: cfg, fetchImpl });
  const b = await writeFacebookCopy(prop, { aiConfig: cfg, fetchImpl, includeLink: true });
  assert.equal(calls, 1);
  assert.equal(b.cached, true);
  assert.match(b.content, /fourland\.vn/);
  assert.doesNotMatch(a.content, /fourland\.vn/);
  await writeFacebookCopy(prop, { aiConfig: cfg, fetchImpl, regenerate: true });
  assert.equal(calls, 2);
});