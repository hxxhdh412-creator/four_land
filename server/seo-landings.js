const {
  SITE_ORIGIN, COMPANY_PHONE, COMPANY_PHONE_HREF, escapeHtml, formatDate, formatPublicAddress,
  inferListingAction, jsonLd, propertyPath, publicImages, slugify, value
} = require("./seo");

const MIN_DISTRICT_PROPERTIES = 3;
const INTENTS = {
  all: { label: "Nhà phố", phrase: "nhà phố" },
  ban: { label: "Nhà phố bán", phrase: "nhà phố bán" },
  "cho-thue": { label: "Nhà phố cho thuê", phrase: "nhà phố cho thuê" }
};

function plain(input) {
  return value(input).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
}

function isHouseProperty(property) {
  const type = plain(property.property_type);
  const excluded = /\b(can ho|chung cu|dat|phong tro|kho|van phong|mat bang)\b/;
  if (excluded.test(type)) return false;
  if (/\b(nha|nha pho|biet thu|villa|shophouse)\b/.test(type)) return true;
  const source = plain([property.normalized_text, property.raw_text].map(value).join(" "));
  return /\b(nha|nha pho|biet thu|villa|shophouse)\b/.test(source) && !excluded.test(source);
}

function intentKey(property) {
  const action = inferListingAction(property);
  const source = plain([
    property.listing_type, property.transaction_type, property.data_json?.listing_type,
    property.property_type, property.price_text, property.normalized_text, property.raw_text
  ].map(value).join(" "));
  if (action === "Cho thuê" || /\b(cho thue|thue|rental|rent)\b|\/(th|thang)\b/.test(source)) return "cho-thue";
  if (action === "Bán" || /\b(can ban|ban|sale|ty)\b/.test(source)) return "ban";
  return "";
}

function dedupeProperties(properties) {
  const seenIds = new Set();
  const seenAddresses = new Set();
  return (properties || []).filter(property => {
    const id = value(property.property_id);
    if (!id || seenIds.has(id) || value(property.status).toLowerCase() === "archived") return false;
    seenIds.add(id);
    const addressKey = plain([property.address, property.district].map(value).join("|"));
    if (addressKey && seenAddresses.has(addressKey)) return false;
    if (addressKey) seenAddresses.add(addressKey);
    return true;
  });
}

function sorted(properties) {
  return [...properties].sort((a, b) => new Date(b.updated_at || b.received_at || 0) - new Date(a.updated_at || a.received_at || 0));
}

function houseInventory(properties) {
  return sorted(dedupeProperties(properties).filter(isHouseProperty));
}

function filterByIntent(properties, intent = "all") {
  return intent === "all" ? properties : properties.filter(property => intentKey(property) === intent);
}

function districtGroups(properties, minimum = MIN_DISTRICT_PROPERTIES) {
  const groups = new Map();
  for (const property of properties) {
    const name = value(property.district);
    if (!name) continue;
    const key = slugify(name);
    const current = groups.get(key) || { key, name, properties: [] };
    current.properties.push(property);
    groups.set(key, current);
  }
  return [...groups.values()].filter(group => group.properties.length >= minimum)
    .sort((a, b) => b.properties.length - a.properties.length || a.name.localeCompare(b.name, "vi"));
}

function landingPath(intent = "all", districtSlug = "") {
  if (districtSlug) return intent === "all" ? `/nha-pho/khu-vuc/${districtSlug}` : `/nha-pho/${intent}/${districtSlug}`;
  return intent === "all" ? "/nha-pho" : `/nha-pho/${intent}`;
}

function resolveLanding(properties, { intent = "all", districtSlug = "" } = {}) {
  if (!INTENTS[intent]) return { found: false };
  const allHouses = houseInventory(properties);
  const intentProperties = filterByIntent(allHouses, intent);
  let district = null;
  let pageProperties = intentProperties;

  if (districtSlug) {
    district = districtGroups(intentProperties, 1).find(group => group.key === districtSlug) || null;
    if (!district || district.properties.length < MIN_DISTRICT_PROPERTIES) return { found: false };
    pageProperties = district.properties;
  }
  if (!pageProperties.length) return { found: false };

  const location = district ? district.name : "TP.HCM";
  const phrase = INTENTS[intent].phrase;
  const title = `${INTENTS[intent].label} tại ${location} cập nhật mới | Fourland`;
  const description = `Khám phá ${pageProperties.length} ${phrase} đang hoạt động tại ${location}, có giá, diện tích, hình ảnh và thông tin khu vực được Fourland cập nhật.`;
  const path = landingPath(intent, district?.key || "");
  return {
    found: true, allHouses, intent, district, pageProperties: sorted(pageProperties), path,
    canonical: SITE_ORIGIN + path, title, description, heading: `${INTENTS[intent].label} tại ${location}`
  };
}

function buildLandingSitemapEntries(properties) {
  const allHouses = houseInventory(properties);
  const entries = [];
  for (const intent of Object.keys(INTENTS)) {
    const intentProperties = filterByIntent(allHouses, intent);
    if (!intentProperties.length) continue;
    const latest = formatDate(intentProperties[0].updated_at || intentProperties[0].received_at);
    entries.push({ path: landingPath(intent), lastmod: latest?.iso.slice(0, 10), changefreq: "daily", priority: intent === "all" ? "0.9" : "0.8" });
    for (const group of districtGroups(intentProperties)) {
      const groupLatest = formatDate(sorted(group.properties)[0].updated_at || sorted(group.properties)[0].received_at);
      entries.push({ path: landingPath(intent, group.key), lastmod: groupLatest?.iso.slice(0, 10), changefreq: "daily", priority: "0.7" });
    }
  }
  return entries;
}

function renderLandingPage(properties, options = {}) {
  const page = resolveLanding(properties, options);
  if (!page.found) return null;

  const cards = page.pageProperties.slice(0, 24);
  const districtLinks = districtGroups(filterByIntent(page.allHouses, page.intent));
  const latest = formatDate(page.pageProperties[0].updated_at || page.pageProperties[0].received_at);
  const heroImage = publicImages(cards[0] || {})[0] || `${SITE_ORIGIN}/assets/brand/fourland-logo.png`;
  const intentLinks = ["all", "ban", "cho-thue"].map(intent => {
    const count = filterByIntent(page.allHouses, intent).length;
    if (!count) return "";
    return `<a${page.intent === intent && !page.district ? ' aria-current="page"' : ""} href="${landingPath(intent)}">${escapeHtml(INTENTS[intent].label)} <span>${count}</span></a>`;
  }).join("");
  const districtNav = districtLinks.map(group => `<a href="${landingPath(page.intent, group.key)}">${escapeHtml(group.name)} <span>${group.properties.length}</span></a>`).join("");
  const cardHtml = cards.map(property => {
    const image = publicImages(property)[0];
    const address = formatPublicAddress(property);
    const action = inferListingAction(property);
    const district = value(property.district);
    const heading = `${action ? `${action} ` : ""}${value(property.property_type) || "Nhà phố"} tại ${address}${district && !plain(address).includes(plain(district)) ? `, ${district}` : ""}`;
    const facts = [property.area_text, property.bedrooms ? `${property.bedrooms} PN` : "", property.bathrooms ? `${property.bathrooms} WC` : ""].map(value).filter(Boolean);
    return `<article class="listing-card"><a class="listing-photo" href="${propertyPath(property)}" aria-label="${escapeHtml(heading)}">${image ? `<img src="${escapeHtml(image)}" width="640" height="480" loading="lazy" alt="${escapeHtml(heading)}">` : `<span>FOURLAND</span>`}</a><div class="listing-body"><p>${escapeHtml(value(property.property_type) || "Nhà phố")}</p><h2><a href="${propertyPath(property)}">${escapeHtml(heading)}</a></h2><strong>${escapeHtml(property.price_text || "Liên hệ")}</strong>${facts.length ? `<ul>${facts.map(fact => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>` : ""}</div></article>`;
  }).join("");
  const items = cards.map((property, index) => ({ "@type": "ListItem", position: index + 1, url: SITE_ORIGIN + propertyPath(property) }));
  const breadcrumbs = [
    { name: "Kho bất động sản", item: `${SITE_ORIGIN}/` },
    { name: "Nhà phố", item: `${SITE_ORIGIN}/nha-pho` }
  ];
  if (page.intent !== "all") breadcrumbs.push({ name: INTENTS[page.intent].label, item: SITE_ORIGIN + landingPath(page.intent) });
  if (page.district) breadcrumbs.push({ name: page.district.name, item: page.canonical });
  const schema = {
    "@context": "https://schema.org", "@graph": [
      { "@type": "RealEstateAgent", "@id": `${SITE_ORIGIN}/#organization`, name: "FOURLAND Property Intelligence", url: SITE_ORIGIN, telephone: `+84${COMPANY_PHONE_HREF.slice(1)}`, areaServed: { "@type": "City", name: "Thành phố Hồ Chí Minh" } },
      { "@type": "CollectionPage", "@id": page.canonical, url: page.canonical, name: page.title, description: page.description, inLanguage: "vi-VN", publisher: { "@id": `${SITE_ORIGIN}/#organization` }, mainEntity: { "@type": "ItemList", numberOfItems: page.pageProperties.length, itemListElement: items }, ...(latest ? { dateModified: latest.iso } : {}) },
      { "@type": "BreadcrumbList", itemListElement: breadcrumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.item })) },
      { "@type": "FAQPage", mainEntity: [
        { "@type": "Question", name: "Dữ liệu nhà phố Fourland được cập nhật thế nào?", acceptedAnswer: { "@type": "Answer", text: "Fourland hiển thị các hồ sơ đang hoạt động và ghi rõ thời điểm cập nhật gần nhất của nguồn nhà." } },
        { "@type": "Question", name: "Địa chỉ chủ nhà có được công khai không?", acceptedAnswer: { "@type": "Answer", text: "Không. Trang công khai chỉ hiển thị tên đường và khu vực; số nhà và số điện thoại nguồn được ẩn để bảo vệ riêng tư." } }
      ] }
    ]
  };

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-BS0X1F8NSD"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-BS0X1F8NSD');</script><title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="${escapeHtml(page.canonical)}"><meta property="og:type" content="website"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="Fourland"><meta property="og:title" content="${escapeHtml(page.title)}"><meta property="og:description" content="${escapeHtml(page.description)}"><meta property="og:url" content="${escapeHtml(page.canonical)}"><meta property="og:image" content="${escapeHtml(heroImage)}"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/assets/brand/fourland-logo.png"><link rel="stylesheet" href="/assets/landing.css?v=20260904-seo-hubs-v1"><script type="application/ld+json">${jsonLd(schema)}</script></head><body><header class="top"><a class="brand" href="/"><img src="/assets/brand/fourland-logo.png" width="76" height="70" alt="Fourland"><span>FOURLAND<small>Property Intelligence</small></span></a><a class="warehouse" href="/">Mở kho bất động sản</a></header><main><nav class="crumbs" aria-label="Đường dẫn">${breadcrumbs.map((crumb, index) => index === breadcrumbs.length - 1 ? `<span>${escapeHtml(crumb.name)}</span>` : `<a href="${escapeHtml(new URL(crumb.item).pathname)}">${escapeHtml(crumb.name)}</a><b>›</b>`).join("")}</nav><section class="hero"><p>FOURLAND · DỮ LIỆU ĐANG HOẠT ĐỘNG</p><h1>${escapeHtml(page.heading)}</h1><div class="lead">${escapeHtml(page.description)}</div><div class="metrics"><div><strong>${page.pageProperties.length}</strong><span>nguồn nhà phù hợp</span></div><div><strong>${page.district ? 1 : districtGroups(page.pageProperties, 1).length}</strong><span>khu vực có dữ liệu</span></div>${latest ? `<div><strong>${escapeHtml(latest.label)}</strong><span>cập nhật gần nhất</span></div>` : ""}</div></section><nav class="intent-nav" aria-label="Loại giao dịch">${intentLinks}</nav>${districtNav ? `<section class="districts"><div><p>KHÁM PHÁ THEO KHU VỰC</p><h2>Quận, huyện có đủ nguồn nhà</h2></div><nav>${districtNav}</nav></section>` : ""}<section class="results"><header><div><p>DANH SÁCH CHỌN LỌC</p><h2>Nguồn nhà cập nhật gần đây</h2></div><span>Hiển thị ${cards.length}/${page.pageProperties.length} hồ sơ</span></header><div class="listing-grid">${cardHtml}</div></section><section class="faq"><p>THÔNG TIN HỮU ÍCH</p><h2>Câu hỏi thường gặp</h2><details open><summary>Dữ liệu nhà phố Fourland được cập nhật thế nào?</summary><p>Fourland chỉ đưa vào trang này các hồ sơ đang hoạt động và ghi rõ thời điểm cập nhật gần nhất của nguồn nhà.</p></details><details><summary>Địa chỉ chủ nhà có được công khai không?</summary><p>Không. Trang công khai chỉ hiển thị tên đường và khu vực; số nhà và số điện thoại nguồn được ẩn để bảo vệ riêng tư.</p></details><details><summary>Làm sao nhận thông tin chi tiết?</summary><p>Liên hệ Fourland để được kiểm tra tình trạng nguồn nhà trước khi xem thực tế.</p></details></section><aside class="contact"><div><p>CẦN TÌM NGUỒN NHÀ PHÙ HỢP?</p><h2>Fourland hỗ trợ kiểm tra và kết nối nguồn nhà.</h2></div><a href="tel:${COMPANY_PHONE_HREF}">Gọi ${COMPANY_PHONE}</a></aside></main><footer>© Fourland · Kho bất động sản chọn lọc TP.HCM</footer></body></html>`;
}

module.exports = {
  MIN_DISTRICT_PROPERTIES, buildLandingSitemapEntries, districtGroups, filterByIntent,
  houseInventory, intentKey, isHouseProperty, landingPath, renderLandingPage, resolveLanding
};
