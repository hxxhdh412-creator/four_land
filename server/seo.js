const SITE_ORIGIN = "https://www.fourland.vn";
const COMPANY_PHONE = "084 2222 813";
const COMPANY_PHONE_HREF = "0842222813";

function value(input) { return String(input ?? "").trim(); }

function escapeHtml(input) {
  return value(input).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeXml(input) { return escapeHtml(input); }

function slugify(input) {
  return value(input).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "ho-so-bat-dong-san";
}

function stripHouseNumber(address) {
  let addr = value(address);
  if (!addr) return "";
  addr = addr.split(/,(?:\s*(?:P\.?|Phường|Q\.?|Quận|H\.?|Huyện|TP\.?))/i)[0].trim();
  return addr.replace(/^(?:(?:số|căn|phòng|p\.?|lô|kho|nhà|hẻm|hxh|hbt)\s+)?(?:[\dA-Za-z]+[\/\.-])*[\dA-Za-z]+[a-zA-Z]?\s+/i, "").trim();
}

function isSafePublicLabel(input) {
  const text = value(input);
  return text.length >= 3 && text.length <= 90 && !/\b(?:triệu|tỷ|hh|(?:\+?84|0)[35789](?:[\s.-]*\d){7,9})\b/i.test(text);
}

function prefixStreet(input) {
  const text = value(input);
  if (/^(?:đường|phố|hẻm|ngõ|chung\s*cư|căn\s*hộ|toà|tòa|khu|dự\s*án|vinhomes|landmark|masteri|sunrise|novaland|sala|ecogreen)/i.test(text)) return text;
  return `Đường ${text}`;
}

function formatPublicAddress(property) {
  const strippedAddress = stripHouseNumber(property.address);
  if (isSafePublicLabel(strippedAddress)) return prefixStreet(strippedAddress);

  const street = value(property.street);
  if (isSafePublicLabel(street) && street.length <= 50) return prefixStreet(street);

  const location = [property.ward, property.district].map(value).filter(isSafePublicLabel).join(", ");
  return location ? `Bất động sản ${location}` : (value(property.property_id) || "Bất động sản TP.HCM");
}

function maskTextPhones(text) {
  if (!text) return "";
  const phonePattern = /(?:\+?84|0)(?:[35789])(?:[\s.-]*\d){7,9}/g;
  return String(text).replace(phonePattern, match => {
    const clean = match.replace(/[\s.-]/g, "");
    return `${clean.slice(0, 4)} ••• •••`;
  });
}

function maskDescriptionText(text, address, street) {
  if (!text) return "Chưa có nội dung mô tả.";
  let output = maskTextPhones(text);
  const publicStreet = stripHouseNumber(address) || value(street);

  if (address && publicStreet) {
    const exactAddress = value(address).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(exactAddress, "gi"), prefixStreet(publicStreet));
  }

  if (publicStreet && publicStreet.length >= 3) {
    const escapedStreet = publicStreet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const addressPattern = new RegExp(`(?:(?:số|căn|phòng|p\\.?|lô|kho|nhà|hẻm|hxh|hbt)\\s+)?(?:[\\dA-Za-z]+[\\/\\.-])*[\\dA-Za-z]+[a-zA-Z]?\\s*(?:,\\s*)?(?:đường\\s+)?${escapedStreet}`, "gi");
    output = output.replace(addressPattern, prefixStreet(publicStreet));
  }

  return output;
}

function propertyPath(property) {
  return `/bat-dong-san/${slugify(formatPublicAddress(property))}--${encodeURIComponent(value(property.property_id))}`;
}

function propertyIdFromSlug(slug) {
  let decoded = "";
  try { decoded = decodeURIComponent(value(slug)); } catch { return ""; }
  const marker = decoded.lastIndexOf("--");
  return marker >= 0 ? decoded.slice(marker + 2).slice(0, 100) : "";
}

function driveImage(url) {
  const input = value(url);
  const match = input.match(/\/d\/([\w-]+)/) || input.match(/[?&]id=([\w-]+)/);
  return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1600` : input;
}

function jsonLd(input) { return JSON.stringify(input).replace(/</g, "\\u003c"); }

function publicImages(property) {
  return (property.property_images || [])
    .filter(image => /^https?:\/\//i.test(value(image.public_url || image.source_url)))
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map(image => driveImage(image.public_url || image.source_url));
}

function inferListingAction(property) {
  const explicit = value(property.listing_type || property.transaction_type || property.data_json?.listing_type);
  const text = [explicit, property.property_type, property.price_text, property.normalized_text, property.raw_text].map(value).join(" ");
  if (/\b(?:cho\s*thuê|thuê|rental|rent)\b|\/(?:th|tháng)\b/i.test(text)) return "Cho thuê";
  if (/\b(?:cần\s*bán|bán|sale)\b|\b(?:tỷ|ty)\b/i.test(text)) return "Bán";
  return "";
}

function formatDate(input) {
  const date = new Date(input || "");
  if (Number.isNaN(date.getTime())) return null;
  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
  };
}

function propertyPresentation(property) {
  const publicAddress = formatPublicAddress(property);
  const propertyType = value(property.property_type) || "Bất động sản";
  const action = inferListingAction(property);
  const district = value(property.district);
  const ward = value(property.ward);
  const subject = [action, propertyType].filter(Boolean).join(" ") || "Bất động sản";
  const normalizedAddress = publicAddress.toLocaleLowerCase("vi");
  const normalizedDistrict = district.toLocaleLowerCase("vi");
  const headlineLocation = [publicAddress, district && !normalizedAddress.includes(normalizedDistrict) ? district : ""].filter(Boolean).join(", ");
  const headline = `${subject} tại ${headlineLocation}`;
  const location = [ward, district, "TP.HCM"].filter(Boolean).join(", ");
  const summary = [
    headline,
    property.area_text ? `diện tích ${value(property.area_text)}` : "",
    property.bedrooms ? `${value(property.bedrooms)} phòng ngủ` : "",
    property.structure ? `kết cấu ${value(property.structure)}` : "",
    property.price_text ? `giá ${value(property.price_text)}` : ""
  ].filter(Boolean).join(", ");
  return { action, district, headline, location, propertyType, publicAddress, summary: `${summary}.` };
}

function renderPropertyPage(property) {
  const images = publicImages(property);
  const presentation = propertyPresentation(property);
  const pageTitle = `${presentation.headline}${property.price_text ? ` · ${value(property.price_text)}` : ""} | Fourland`;
  const description = value(presentation.summary).slice(0, 160);
  const rawDescription = maskDescriptionText(property.raw_text || property.notes || presentation.summary, property.address, property.street);
  const canonical = SITE_ORIGIN + propertyPath(property);
  const hero = images[0] || `${SITE_ORIGIN}/assets/brand/fourland-logo.png`;
  const updated = formatDate(property.updated_at || property.received_at);
  const facts = [
    ["Quận/Huyện", property.district], ["Phường/Xã", property.ward], ["Tên đường", stripHouseNumber(property.street) || property.street],
    ["Diện tích", property.area_text], ["Kích thước", property.dimensions], ["Phòng ngủ", property.bedrooms],
    ["Phòng tắm", property.bathrooms], ["Kết cấu", property.structure], ["Pháp lý", property.legal], ["Loại BĐS", property.property_type]
  ].filter(([, factValue]) => value(factValue));
  const residenceId = `${canonical}#property`;
  const organizationId = `${SITE_ORIGIN}/#organization`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RealEstateAgent", "@id": organizationId, "name": "FOURLAND Property Intelligence",
        "url": SITE_ORIGIN, "telephone": `+84${COMPANY_PHONE_HREF.slice(1)}`,
        "areaServed": { "@type": "City", "name": "Thành phố Hồ Chí Minh" }
      },
      {
        "@type": "WebPage", "@id": canonical, "url": canonical, "name": pageTitle, "description": description,
        "inLanguage": "vi-VN", "mainEntity": { "@id": residenceId }, "publisher": { "@id": organizationId },
        "primaryImageOfPage": { "@type": "ImageObject", "url": hero },
        ...(updated ? { "dateModified": updated.iso } : {})
      },
      {
        "@type": "Residence", "@id": residenceId, "name": presentation.headline, "description": description,
        "url": canonical, "image": images, "address": {
          "@type": "PostalAddress", "streetAddress": presentation.publicAddress,
          "addressLocality": presentation.district || "Thành phố Hồ Chí Minh", "addressRegion": "Hồ Chí Minh", "addressCountry": "VN"
        },
        ...(property.bedrooms ? { "numberOfBedrooms": property.bedrooms } : {}),
        ...(property.bathrooms ? { "numberOfBathroomsTotal": property.bathrooms } : {})
      },
      {
        "@type": "BreadcrumbList", "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Kho bất động sản", "item": `${SITE_ORIGIN}/` },
          { "@type": "ListItem", "position": 2, "name": presentation.headline, "item": canonical }
        ]
      }
    ]
  };

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-BS0X1F8NSD"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-BS0X1F8NSD');</script><title>${escapeHtml(pageTitle)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="Fourland"><meta property="og:title" content="${escapeHtml(pageTitle)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(hero)}"><meta property="og:image:alt" content="${escapeHtml(presentation.headline)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(pageTitle)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(hero)}"><link rel="icon" href="/assets/brand/fourland-logo.png"><link rel="stylesheet" href="/assets/property.css"><script type="application/ld+json">${jsonLd(schema)}</script></head><body><header class="top"><a href="/" aria-label="Về kho Fourland"><img src="/assets/brand/fourland-logo.png" width="76" height="70" alt="Fourland"></a><a href="/">Kho bất động sản</a></header><main><nav aria-label="Đường dẫn"><a href="/">Kho nhà</a><span>›</span><span>${escapeHtml(presentation.headline)}</span></nav><article><header class="property-head"><p>FOURLAND COLLECTION</p><h1>${escapeHtml(presentation.headline)}</h1><strong>${escapeHtml(property.price_text || "Liên hệ")}</strong><div>${escapeHtml(presentation.location)}</div>${updated ? `<small>Cập nhật <time datetime="${escapeHtml(updated.iso)}">${escapeHtml(updated.label)}</time></small>` : ""}</header><section class="gallery">${images.length ? `<img class="hero" src="${escapeHtml(hero)}" width="1200" height="900" alt="${escapeHtml(presentation.headline)}" fetchpriority="high"><div class="thumbs">${images.slice(1, 8).map((url, index) => `<img src="${escapeHtml(url)}" width="180" height="135" loading="lazy" alt="Ảnh ${index + 2} của ${escapeHtml(presentation.headline)}">`).join("")}</div>` : `<div class="empty-photo">Hồ sơ chưa có hình ảnh</div>`}</section><section class="content"><div><h2>Thông tin bất động sản</h2><p>${escapeHtml(presentation.summary)}</p><dl>${facts.map(([key, factValue]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(factValue)}</dd></div>`).join("")}</dl></div><aside><h2>Mô tả nguồn nhà</h2><p>${escapeHtml(rawDescription)}</p><a class="call" href="tel:${COMPANY_PHONE_HREF}">Gọi Fourland · ${COMPANY_PHONE}</a></aside></section></article></main><footer>© Fourland · Kho bất động sản chọn lọc TP.HCM</footer></body></html>`;
}

function renderSitemap(properties, generatedAt = new Date()) {
  const fallbackDate = generatedAt.toISOString().slice(0, 10);
  const urls = [{ loc: `${SITE_ORIGIN}/`, lastmod: fallbackDate, changefreq: "daily", priority: "1.0" }];
  const seen = new Set(urls.map(item => item.loc));

  for (const property of properties || []) {
    if (!value(property.property_id) || value(property.status).toLowerCase() === "archived") continue;
    const loc = SITE_ORIGIN + propertyPath(property);
    if (seen.has(loc)) continue;
    seen.add(loc);
    const modified = formatDate(property.updated_at || property.received_at);
    urls.push({ loc, lastmod: modified ? modified.iso.slice(0, 10) : fallbackDate, changefreq: "weekly", priority: "0.7" });
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(item => `  <url>\n    <loc>${escapeXml(item.loc)}</loc>\n    <lastmod>${item.lastmod}</lastmod>\n    <changefreq>${item.changefreq}</changefreq>\n    <priority>${item.priority}</priority>\n  </url>`),
    "</urlset>", ""
  ].join("\n");
}

module.exports = {
  SITE_ORIGIN, driveImage, escapeHtml, escapeXml, formatPublicAddress, inferListingAction, jsonLd,
  maskDescriptionText, maskTextPhones, propertyIdFromSlug, propertyPath, propertyPresentation,
  publicImages, renderPropertyPage, renderSitemap, slugify, stripHouseNumber, value
};
