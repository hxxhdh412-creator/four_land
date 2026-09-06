const {
  SITE_ORIGIN, COMPANY_PHONE, COMPANY_PHONE_HREF, escapeHtml, formatDate, formatPublicAddress,
  inferListingAction, jsonLd, propertyPath, publicImages, slugify, value, stripHouseNumber, resolveAreaAndDimensions
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

function extractPriceNumber(priceText, intent = "all") {
  if (!priceText) return null;
  const clean = String(priceText).toLowerCase().replace(",", ".");
  if (/\b(tang|lau|phong|pn|wc|st|lung|m2|m²|thuong luong|lien he)\b/i.test(clean)) return null;

  const billionMatch = clean.match(/([\d.]+)\s*(?:ty|tỷ)/i);
  if (billionMatch) {
    const val = parseFloat(billionMatch[1]);
    return val > 0 ? val * 1000000000 : null;
  }
  const millionMatch = clean.match(/([\d.]+)\s*(?:trieu|triệu|tr)\b/i);
  if (millionMatch) {
    const val = parseFloat(millionMatch[1]);
    return val > 0 ? val * 1000000 : null;
  }
  const numberOnly = clean.replace(/[^\d.]/g, "");
  const num = parseFloat(numberOnly);
  if (Number.isNaN(num) || num <= 0) return null;
  if (num >= 1000000) return num;
  if (num >= 1 && num <= 500) {
    if (intent === "ban" && num <= 100) return num * 1000000000;
    return num * 1000000;
  }
  return null;
}

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

function formatVnCurrency(num, intent = "all") {
  if (!num || num <= 0) return "";
  const suffix = intent === "cho-thue" ? "/tháng" : "";
  if (num >= 1e9) {
    const val = Math.round(num / 1e8) / 10;
    return `${val.toLocaleString("vi-VN")} tỷ${suffix}`;
  }
  const val = Math.round(num / 1e5) / 10;
  return `${val.toLocaleString("vi-VN")} triệu${suffix}`;
}

function calculateMarketStats(properties = [], intent = "all", locationName = "TP.HCM") {
  const prices = [];
  const areas = [];
  const streetCounts = new Map();

  for (const p of properties) {
    const priceNum = extractPriceNumber(p.price_text || p.price);
    if (priceNum && priceNum > 0) prices.push(priceNum);

    const areaNum = extractAreaNumber(p.area_text, p.dimensions);
    if (areaNum && areaNum > 0) areas.push(areaNum);

    const rawStreet = stripHouseNumber ? stripHouseNumber(p.street || p.address) : value(p.street);
    const street = value(rawStreet).replace(/^(?:đường|phố|hẻm)\s+/i, "");
    if (street && street.length >= 3 && street.length <= 40) {
      streetCounts.set(street, (streetCounts.get(street) || 0) + 1);
    }
  }

  prices.sort((a, b) => a - b);
  areas.sort((a, b) => a - b);

  const lowPrice = prices.length ? prices[0] : null;
  const highPrice = prices.length ? prices[prices.length - 1] : null;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;

  let priceRangeLabel = "Liên hệ";
  if (lowPrice && highPrice) {
    priceRangeLabel = lowPrice === highPrice
      ? formatVnCurrency(lowPrice, intent)
      : `${formatVnCurrency(lowPrice, intent)} – ${formatVnCurrency(highPrice, intent)}`;
  } else if (lowPrice) {
    priceRangeLabel = `Từ ${formatVnCurrency(lowPrice, intent)}`;
  }

  const minArea = areas.length ? Math.round(areas[0]) : null;
  const maxArea = areas.length ? Math.round(areas[areas.length - 1]) : null;
  let areaRangeLabel = "Đa dạng";
  if (minArea && maxArea) {
    areaRangeLabel = minArea === maxArea ? `${minArea} m²` : `${minArea} – ${maxArea} m²`;
  } else if (minArea) {
    areaRangeLabel = `Từ ${minArea} m²`;
  }

  const sortedStreets = [...streetCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([st]) => st);
  const popularStreets = sortedStreets.join(", ");

  let summaryText = "";
  if (intent === "cho-thue") {
    summaryText = `Thị trường nhà phố cho thuê tại ${locationName} hiện ghi nhận ${properties.length} nguồn nhà đang hoạt động với mức giá thuê dao động từ ${priceRangeLabel}, diện tích phổ biến ${areaRangeLabel}.${popularStreets ? ` Các trục đường tập trung nhiều nguồn nhà gồm: ${popularStreets}.` : ""}`;
  } else if (intent === "ban") {
    summaryText = `Kho nhà phố bán tại ${locationName} hiện có ${properties.length} căn nhà chọn lọc với giá bán từ ${priceRangeLabel}, diện tích từ ${areaRangeLabel}.${popularStreets ? ` Nguồn nhà chính chủ tập trung trên các tuyến đường: ${popularStreets}.` : ""}`;
  } else {
    summaryText = `Hệ thống Fourland đang phân phối ${properties.length} nhà phố chọn lọc tại ${locationName} gồm cả mua bán và cho thuê, với khoảng giá ${priceRangeLabel}, diện tích ${areaRangeLabel}, đáp ứng đa dạng nhu cầu an cư và kinh doanh.`;
  }

  return {
    lowPrice, highPrice, avgPrice, priceRangeLabel,
    minArea, maxArea, areaRangeLabel,
    popularStreets, summaryText,
    totalCount: properties.length
  };
}

function generateLandingFAQs(page, stats) {
  const location = page.district ? page.district.name : "TP.HCM";
  const intent = page.intent || "all";
  const faqs = [];

  if (intent === "cho-thue") {
    faqs.push({
      question: `Giá thuê nhà nguyên căn tại ${location} hiện nay khoảng bao nhiêu?`,
      answer: `Theo dữ liệu cập nhật mới nhất từ kho nhà Fourland, giá thuê nhà nguyên căn tại ${location} hiện dao động trong khoảng ${stats.priceRangeLabel}, diện tích phổ biến từ ${stats.areaRangeLabel}. Mức giá cụ thể phụ thuộc vào vị trí mặt tiền kinh doanh hay hẻm xe hơi và quy mô kết cấu số tầng.`
    });
  } else if (intent === "ban") {
    faqs.push({
      question: `Giá mua bán nhà phố tại ${location} hiện nay dao động ở mức nào?`,
      answer: `Giá bán nhà phố tại ${location} trên hệ thống Fourland hiện dao động từ ${stats.priceRangeLabel}, với diện tích đa dạng từ ${stats.areaRangeLabel}. Tất cả các căn nhà đều có sổ hồng riêng, pháp lý rõ ràng và thông tin giá chuẩn xác từ chính chủ.`
    });
  } else {
    faqs.push({
      question: `Mặt bằng giá nhà phố tại ${location} hiện nay thế nào?`,
      answer: `Tại ${location}, giá nhà phố phân phối trên hệ thống Fourland dao động trong khoảng ${stats.priceRangeLabel}. Nguồn nhà bao gồm cả nhà cho thuê kinh doanh và nhà bán an cư với thông tin được kiểm chứng thực địa.`
    });
  }

  faqs.push({
    question: `Nên tìm thuê hoặc mua nhà ở những tuyến đường nào tại ${location}?`,
    answer: `Tại ${location}, các tuyến đường có nhiều nguồn nhà đẹp và thuận tiện di chuyển gồm: ${stats.popularStreets || "các trục đường huyết mạch của khu vực"}. Tùy vào mục đích để ở hay kinh doanh buôn bán, Fourland sẽ tư vấn vị trí hẻm thông hoặc mặt tiền phù hợp nhất.`
  });

  if (intent === "cho-thue") {
    faqs.push({
      question: `Hợp đồng thuê nhà nguyên căn tại ${location} cần lưu ý những điều khoản gì?`,
      answer: `Khi ký hợp đồng thuê nhà, khách hàng nên thỏa thuận rõ: mức đặt cọc (thường từ 1 - 2 tháng), thời hạn hợp đồng tối thiểu, chu kỳ thanh toán, điều khoản giữ giá thuê ổn định và trách nhiệm bảo dưỡng các thiết bị cơ bản đi kèm nhà.`
    });
  } else {
    faqs.push({
      question: `Quy trình kiểm tra pháp lý khi giao dịch nhà phố tại ${location} gồm những gì?`,
      answer: `Khách hàng cần kiểm tra sổ hồng bản gốc, tra cứu quy hoạch - lộ giới tại phòng tài nguyên môi trường hoặc UBND quận, xác minh tình trạng tranh chấp và tiến hành công chứng chuyển nhượng hợp pháp tại phòng công chứng trước khi giao đủ tiền.`
    });
  }

  faqs.push({
    question: `Làm thế nào để kiểm tra tình trạng còn trống và đặt lịch xem nhà tại ${location}?`,
    answer: `Quý khách chỉ cần liên hệ Hotline Fourland qua số ${COMPANY_PHONE} (hỗ trợ 24/7). Đội ngũ chuyên viên Fourland sẽ lập tức kiểm tra tình trạng thực tế của nguồn nhà và sắp xếp lịch xem nhà trực tiếp hoàn toàn miễn phí.`
  });

  return faqs;
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
  const stats = calculateMarketStats(pageProperties, intent, location);

  let title = "";
  let description = "";
  let heading = "";

  if (intent === "cho-thue") {
    title = `Thuê Nhà Nguyên Căn ${location} Giá Tốt Nhất | Kho BĐS Fourland`;
    heading = `Cho thuê nhà phố tại ${location}`;
    description = `Khám phá ${pageProperties.length} nhà phố cho thuê tại ${location} giá từ ${stats.priceRangeLabel}, diện tích ${stats.areaRangeLabel}. Dữ liệu nguồn nhà thật, hình ảnh chi tiết, cập nhật liên tục 24/7.`;
  } else if (intent === "ban") {
    title = `Bán Nhà Phố ${location} Chính Chủ, Sổ Hồng Riêng | Fourland`;
    heading = `Nhà phố bán tại ${location}`;
    description = `Tổng hợp ${pageProperties.length} căn nhà phố bán tại ${location} giá từ ${stats.priceRangeLabel}, diện tích ${stats.areaRangeLabel}. Thông tin pháp lý chuẩn xác, hỗ trợ xem nhà thực tế miễn phí.`;
  } else {
    title = `Kho Nhà Phố ${location} | Mua Bán & Cho Thuê Mới Nhất · Fourland`;
    heading = `Nhà phố tại ${location}`;
    description = `Danh sách ${pageProperties.length} ${phrase} mua bán & cho thuê chọn lọc tại ${location} từ ${stats.priceRangeLabel}. Nền tảng tra cứu BĐS thông minh Fourland Property Intelligence.`;
  }

  const path = landingPath(intent, district?.key || "");
  return {
    found: true, allHouses, intent, district, pageProperties: sorted(pageProperties), path,
    canonical: SITE_ORIGIN + path, title, description, heading, stats
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

  const location = page.district ? page.district.name : "TP.HCM";
  const stats = page.stats || calculateMarketStats(page.pageProperties, page.intent, location);
  const faqs = generateLandingFAQs(page, stats);

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
    const { area: resolvedArea, dimensions: resolvedDim } = resolveAreaAndDimensions ? resolveAreaAndDimensions(property) : { area: property.area_text, dimensions: property.dimensions };
    const facts = [resolvedArea || resolvedDim, property.bedrooms ? `${property.bedrooms} PN` : "", property.bathrooms ? `${property.bathrooms} WC` : ""].map(value).filter(Boolean);
    return `<article class="listing-card"><a class="listing-photo" href="${propertyPath(property)}" aria-label="${escapeHtml(heading)}">${image ? `<img src="${escapeHtml(image)}" width="640" height="480" loading="lazy" alt="${escapeHtml(heading)}">` : `<span>FOURLAND</span>`}</a><div class="listing-body"><p>${escapeHtml(value(property.property_type) || "Nhà phố")}</p><h2><a href="${propertyPath(property)}">${escapeHtml(heading)}</a></h2><strong>${escapeHtml(property.price_text || "Liên hệ")}</strong>${facts.length ? `<ul>${facts.map(fact => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>` : ""}</div></article>`;
  }).join("");
  const items = cards.map((property, index) => ({ "@type": "ListItem", position: index + 1, url: SITE_ORIGIN + propertyPath(property) }));
  const breadcrumbs = [
    { name: "Kho bất động sản", item: `${SITE_ORIGIN}/` },
    { name: "Nhà phố", item: `${SITE_ORIGIN}/nha-pho` }
  ];
  if (page.intent !== "all") breadcrumbs.push({ name: INTENTS[page.intent].label, item: SITE_ORIGIN + landingPath(page.intent) });
  if (page.district) breadcrumbs.push({ name: page.district.name, item: page.canonical });

  const offersSchema = stats.lowPrice && stats.highPrice ? {
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "VND",
      lowPrice: stats.lowPrice,
      highPrice: stats.highPrice,
      offerCount: page.pageProperties.length
    }
  } : {};

  const schema = {
    "@context": "https://schema.org", "@graph": [
      { "@type": "RealEstateAgent", "@id": `${SITE_ORIGIN}/#organization`, name: "FOURLAND Property Intelligence", url: SITE_ORIGIN, telephone: `+84${COMPANY_PHONE_HREF.slice(1)}`, areaServed: { "@type": "City", name: "Thành phố Hồ Chí Minh" } },
      {
        "@type": "CollectionPage", "@id": page.canonical, url: page.canonical, name: page.title, description: page.description,
        inLanguage: "vi-VN", publisher: { "@id": `${SITE_ORIGIN}/#organization` },
        mainEntity: { "@type": "ItemList", numberOfItems: page.pageProperties.length, itemListElement: items },
        ...offersSchema,
        ...(latest ? { dateModified: latest.iso } : {})
      },
      { "@type": "BreadcrumbList", itemListElement: breadcrumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.item })) },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(faq => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer
          }
        }))
      }
    ]
  };

  const marketInsightsHtml = `
    <section class="market-insights" aria-label="Thống kê thị trường ${escapeHtml(location)}">
      <div>
        <p>THỐNG KÊ THỊ TRƯỜNG BĐS</p>
        <h2>Tổng quan giá & nguồn nhà tại ${escapeHtml(location)}</h2>
      </div>
      <div class="insights-grid">
        <div class="insight-card">
          <div class="insight-kicker">Khoảng giá niêm yết</div>
          <div class="insight-value">${escapeHtml(stats.priceRangeLabel)}</div>
          <div class="insight-desc">Phổ biến theo phân khúc thực tế</div>
        </div>
        <div class="insight-card">
          <div class="insight-kicker">Diện tích phổ biến</div>
          <div class="insight-value">${escapeHtml(stats.areaRangeLabel)}</div>
          <div class="insight-desc">Tính toán theo chuẩn sàn xây dựng</div>
        </div>
        <div class="insight-card">
          <div class="insight-kicker">Tuyến đường trọng điểm</div>
          <div class="insight-value insight-streets">${escapeHtml(stats.popularStreets || "Trục đường chính")}</div>
          <div class="insight-desc">Khu vực tập trung nhiều nguồn nhà</div>
        </div>
        <div class="insight-card">
          <div class="insight-kicker">Nguồn hàng hoạt động</div>
          <div class="insight-value">${page.pageProperties.length} căn</div>
          <div class="insight-desc">Được xác thực & cập nhật 24/7</div>
        </div>
      </div>
      <div class="market-summary-box">
        <strong>Nhận định thị trường Fourland:</strong> ${escapeHtml(stats.summaryText)}
      </div>
    </section>
  `;

  const faqItemsHtml = faqs.map((faq, index) =>
    `<details${index === 0 ? " open" : ""}><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p></details>`
  ).join("");

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-BS0X1F8NSD"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-BS0X1F8NSD');</script><title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="${escapeHtml(page.canonical)}"><meta property="og:type" content="website"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="Fourland"><meta property="og:title" content="${escapeHtml(page.title)}"><meta property="og:description" content="${escapeHtml(page.description)}"><meta property="og:url" content="${escapeHtml(page.canonical)}"><meta property="og:image" content="${escapeHtml(heroImage)}"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/assets/brand/fourland-logo.png"><link rel="stylesheet" href="/assets/landing.css?v=20260906-seo-insights-v2"><script type="application/ld+json">${jsonLd(schema)}</script></head><body><header class="top"><a class="brand" href="/"><img src="/assets/brand/fourland-logo.png" width="76" height="70" alt="Fourland"><span>FOURLAND<small>Property Intelligence</small></span></a><a class="warehouse" href="/">Mở kho bất động sản</a></header><main><nav class="crumbs" aria-label="Đường dẫn">${breadcrumbs.map((crumb, index) => index === breadcrumbs.length - 1 ? `<span>${escapeHtml(crumb.name)}</span>` : `<a href="${escapeHtml(new URL(crumb.item).pathname)}">${escapeHtml(crumb.name)}</a><b>›</b>`).join("")}</nav><section class="hero"><p>FOURLAND · DỮ LIỆU ĐANG HOẠT ĐỘNG</p><h1>${escapeHtml(page.heading)}</h1><div class="lead">${escapeHtml(page.description)}</div><div class="metrics"><div><strong>${page.pageProperties.length}</strong><span>nguồn nhà phù hợp</span></div><div><strong>${page.district ? 1 : districtGroups(page.pageProperties, 1).length}</strong><span>khu vực có dữ liệu</span></div>${latest ? `<div><strong>${escapeHtml(latest.label)}</strong><span>cập nhật gần nhất</span></div>` : ""}</div></section><nav class="intent-nav" aria-label="Loại giao dịch">${intentLinks}</nav>${districtNav ? `<section class="districts"><div><p>KHÁM PHÁ THEO KHU VỰC</p><h2>Quận, huyện có đủ nguồn nhà</h2></div><nav>${districtNav}</nav></section>` : ""}${marketInsightsHtml}<section class="results"><header><div><p>DANH SÁCH CHỌN LỌC</p><h2>Nguồn nhà cập nhật gần đây</h2></div><span>Hiển thị ${cards.length}/${page.pageProperties.length} hồ sơ</span></header><div class="listing-grid">${cardHtml}</div></section><section class="faq"><p>THÔNG TIN HỮU ÍCH</p><h2>Câu hỏi thường gặp</h2>${faqItemsHtml}</section><aside class="contact"><div><p>CẦN TÌM NGUỒN NHÀ PHÙ HỢP?</p><h2>Fourland hỗ trợ kiểm tra và kết nối nguồn nhà.</h2></div><a href="tel:${COMPANY_PHONE_HREF}">Gọi ${COMPANY_PHONE}</a></aside></main><footer>© Fourland · Kho bất động sản chọn lọc TP.HCM</footer></body></html>`;
}

module.exports = {
  MIN_DISTRICT_PROPERTIES, buildLandingSitemapEntries, calculateMarketStats, districtGroups, filterByIntent,
  generateLandingFAQs, houseInventory, intentKey, isHouseProperty, landingPath, renderLandingPage, resolveLanding
};
