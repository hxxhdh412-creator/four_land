const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHandler: createPropertySeoHandler } = require("../api/seo-property");
const { createHandler: createSitemapHandler } = require("../api/sitemap");
const {
  propertyIdFromSlug, propertyPath, renderPropertyPage, renderSitemap
} = require("../server/seo");

const sample = {
  property_id: "BDS-20260826-ABC123",
  address: "160/34/13 Phan Huy Ích",
  street: "Phan Huy Ích",
  ward: "Phường 12",
  district: "Gò Vấp",
  property_type: "Nhà phố",
  price_text: "15tr/tháng",
  area_text: "40 m²",
  bedrooms: 3,
  raw_text: "Cho thuê nhà 160/34/13 Phan Huy Ích, liên hệ 0931161682, hẻm xe hơi.",
  updated_at: "2026-09-04T01:02:03.000Z",
  property_images: [{ position: 1, public_url: "https://example.com/nha.jpg" }]
};

function responseRecorder() {
  return {
    headers: {}, statusCode: 200, body: "", redirectValue: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
    redirect(code, location) { this.statusCode = code; this.redirectValue = location; return this; }
  };
}

test("property URL is stable, reversible and excludes private address details", () => {
  const route = propertyPath(sample);
  assert.match(route, /^\/bat-dong-san\/duong-phan-huy-ich--/);
  assert.equal(propertyIdFromSlug(route.split("/").pop()), sample.property_id);
  assert.doesNotMatch(route, /160|0931161682/);
});

test("SSR page contains visible indexable facts without owner phone or exact house number", () => {
  const html = renderPropertyPage(sample);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.fourland\.vn\/bat-dong-san\//);
  assert.match(html, /<h1>Cho thuê Nhà phố tại Đường Phan Huy Ích, Gò Vấp<\/h1>/);
  assert.match(html, /<meta name="robots" content="index,follow/);
  assert.match(html, /<time datetime="2026-09-04T01:02:03.000Z">/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /RealEstateAgent/);
  assert.match(html, /BreadcrumbList/);
  assert.match(html, /og:image/);
  assert.doesNotMatch(html, /160\/34\/13|0931161682/);
  assert.match(html, /0931 ••• •••/);
});

test("production SEO handler returns the shared SSR document", async () => {
  const handler = createPropertySeoHandler({ request: async () => ({ data: [sample] }) });
  const slug = propertyPath(sample).split("/").pop();
  const response = responseRecorder();
  await handler({ method: "GET", query: { slug } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(response.body, /<h1>Cho thuê Nhà phố/);
  assert.doesNotMatch(response.body, /0931161682|160\/34\/13/);
});

test("legacy or unsafe property slug redirects to its clean canonical URL", async () => {
  const handler = createPropertySeoHandler({ request: async () => ({ data: [sample] }) });
  const response = responseRecorder();
  await handler({ method: "GET", query: { slug: `160-34-13-phan-huy-ich--${sample.property_id}` } }, response);
  assert.equal(response.statusCode, 308);
  assert.equal(response.redirectValue, propertyPath(sample));
});

test("missing public property is noindex and returns 404", async () => {
  const handler = createPropertySeoHandler({ request: async () => ({ data: [] }) });
  const response = responseRecorder();
  await handler({ method: "GET", query: { slug: `nha-pho--${sample.property_id}` } }, response);
  assert.equal(response.statusCode, 404);
  assert.equal(response.headers["X-Robots-Tag"], "noindex");
});

test("dynamic sitemap includes clean public canonicals and excludes archived records", async () => {
  const archived = { ...sample, property_id: "BDS-ARCHIVED", status: "archived" };
  const xml = renderSitemap([sample, archived], new Date("2026-09-04T00:00:00.000Z"));
  assert.match(xml, new RegExp(propertyPath(sample).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(xml, /BDS-ARCHIVED|160\/34\/13|0931161682|#q=|\?id=/);

  const handler = createSitemapHandler({ request: async () => ({ data: [sample] }) });
  const response = responseRecorder();
  await handler({ method: "GET" }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "application/xml; charset=utf-8");
  assert.match(response.body, /<urlset/);
});

test("dynamic sitemap path has no conflicting static file and allows AI search crawler", () => {
  const staticSitemap = path.join(__dirname, "..", "sitemap.xml");
  const robots = fs.readFileSync(path.join(__dirname, "..", "robots.txt"), "utf8");
  assert.equal(fs.existsSync(staticSitemap), false);
  assert.match(robots, /User-agent: OAI-SearchBot[\s\S]*?Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/www\.fourland\.vn\/sitemap\.xml/);
});
