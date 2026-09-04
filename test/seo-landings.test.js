const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require("../api/seo-landing");
const { renderSitemap } = require("../server/seo");
const {
  buildLandingSitemapEntries, houseInventory, landingPath, renderLandingPage, resolveLanding
} = require("../server/seo-landings");

const base = {
  status: "ready", property_type: "Nhà phố", district: "Bình Thạnh", ward: "Phường 25",
  price_text: "12 tỷ", area_text: "72 m²", bedrooms: 4, bathrooms: 4,
  received_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-04T01:02:03.000Z",
  property_images: [{ position: 1, public_url: "https://example.com/house.jpg" }]
};
const samples = [
  { ...base, property_id: "BDS-LAND-001", address: "12 Nguyễn Hữu Cảnh", street: "Nguyễn Hữu Cảnh", raw_text: "Bán nhà, gọi 0931161682" },
  { ...base, property_id: "BDS-LAND-002", address: "24 Xô Viết Nghệ Tĩnh", street: "Xô Viết Nghệ Tĩnh", price_text: "10 tỷ" },
  { ...base, property_id: "BDS-LAND-003", address: "88 Điện Biên Phủ", street: "Điện Biên Phủ", price_text: "14 tỷ" },
  { ...base, property_id: "BDS-LAND-004", address: "10 Phan Xích Long", street: "Phan Xích Long", district: "Phú Nhuận", price_text: "25tr/tháng", raw_text: "Cho thuê nhà" },
  { ...base, property_id: "BDS-LAND-005", address: "20 Phan Xích Long", street: "Phan Xích Long", district: "Phú Nhuận", price_text: "28tr/tháng", raw_text: "Cho thuê nhà" },
  { ...base, property_id: "BDS-LAND-006", address: "1 Nguyễn Văn Linh", street: "Nguyễn Văn Linh", district: "Quận 7", property_type: "Căn hộ", price_text: "5 tỷ" }
];

function responseRecorder() {
  return {
    headers: {}, statusCode: 200, body: "",
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; }
  };
}

test("house inventory excludes apartments and keeps active unique houses", () => {
  const archived = { ...samples[0], property_id: "BDS-ARCHIVED", status: "archived" };
  assert.equal(houseInventory([...samples, archived]).length, 5);
});

test("SSR landing exposes useful inventory facts and protects source privacy", () => {
  const html = renderLandingPage(samples);
  assert.match(html, /<h1>Nhà phố tại TP\.HCM<\/h1>/);
  assert.match(html, /<strong>5<\/strong><span>nguồn nhà phù hợp<\/span>/);
  assert.match(html, /CollectionPage|ItemList|FAQPage|BreadcrumbList/);
  assert.match(html, /href="\/bat-dong-san\//);
  assert.match(html, /href="\/nha-pho\/ban"/);
  assert.match(html, /href="\/nha-pho\/cho-thue"/);
  assert.doesNotMatch(html, /0931161682|12 Nguyễn Hữu Cảnh|24 Xô Viết Nghệ Tĩnh/);
});

test("district pages require three matching unique records", () => {
  const eligible = resolveLanding(samples, { intent: "ban", districtSlug: "binh-thanh" });
  assert.equal(eligible.found, true);
  assert.equal(eligible.pageProperties.length, 3);
  assert.equal(eligible.path, landingPath("ban", "binh-thanh"));
  assert.equal(resolveLanding(samples, { intent: "cho-thue", districtSlug: "phu-nhuan" }).found, false);
});

test("landing API serves eligible pages and noindexes thin pages", async () => {
  const handler = createHandler({ request: async () => ({ data: samples }) });
  const ok = responseRecorder();
  await handler({ method: "GET", query: { intent: "ban", district: "binh-thanh" } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(ok.body, /Nhà phố bán tại Bình Thạnh/);

  const thin = responseRecorder();
  await handler({ method: "GET", query: { intent: "cho-thue", district: "phu-nhuan" } }, thin);
  assert.equal(thin.statusCode, 404);
  assert.equal(thin.headers["X-Robots-Tag"], "noindex");
});

test("sitemap includes robust landing routes and excludes thin district routes", () => {
  const entries = buildLandingSitemapEntries(samples);
  const xml = renderSitemap(samples, new Date("2026-09-04T00:00:00.000Z"), entries);
  assert.match(xml, /https:\/\/www\.fourland\.vn\/nha-pho<\/loc>/);
  assert.match(xml, /https:\/\/www\.fourland\.vn\/nha-pho\/ban\/binh-thanh<\/loc>/);
  assert.doesNotMatch(xml, /nha-pho\/cho-thue\/phu-nhuan<\/loc>/);
});
