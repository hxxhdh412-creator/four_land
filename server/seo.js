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

function renderSimilarCard(item) {
  if (!item || !value(item.property_id)) return "";
  const cardPath = propertyPath(item);
  const cardImages = publicImages(item);
  const heroImg = cardImages[0] || `${SITE_ORIGIN}/assets/brand/fourland-logo.png`;
  const action = inferListingAction(item) || value(item.property_type) || "Bất động sản";
  const price = value(item.price_text) || "Liên hệ";
  const address = formatPublicAddress(item);
  const location = [item.ward, item.district].map(value).filter(Boolean).join(", ");
  const specs = [item.area_text, item.dimensions, item.structure].map(value).filter(Boolean).slice(0, 2).join(" · ");

  return `<a href="${escapeHtml(cardPath)}" class="similar-card" title="${escapeHtml(address)}">` +
    `<div class="similar-card-thumb">` +
      `<img src="${escapeHtml(heroImg)}" alt="${escapeHtml(address)}" loading="lazy" width="360" height="270">` +
      `<span class="similar-badge-action">${escapeHtml(action)}</span>` +
      `<span class="similar-badge-price">${escapeHtml(price)}</span>` +
    `</div>` +
    `<div class="similar-card-body">` +
      `<h3 class="similar-card-title">${escapeHtml(address)}</h3>` +
      `<div class="similar-card-loc">${escapeHtml(location || "TP. Hồ Chí Minh")}</div>` +
      (specs ? `<div class="similar-card-specs">${escapeHtml(specs)}</div>` : "") +
    `</div>` +
  `</a>`;
}

function renderSystemFooter() {
  return `<footer class="system-footer">` +
    `<div class="footer-container">` +
      `<div class="footer-grid">` +
        `<div class="footer-col brand-col">` +
          `<a href="/" class="footer-brand" aria-label="Fourland Trang Chủ">` +
            `<img src="/assets/brand/fourland-logo.png" width="68" height="63" alt="Fourland" class="footer-logo">` +
            `<div class="footer-brand-text">` +
              `<strong class="brand-title">FOURLAND</strong>` +
              `<span class="brand-sub">PROPERTY INTELLIGENCE</span>` +
            `</div>` +
          `</a>` +
          `<p class="brand-desc">Nền tảng tra cứu và phân phối kho bất động sản chọn lọc hàng đầu TP.HCM. Cập nhật nhà phố, biệt thự, mặt tiền kinh doanh chính chủ 24/7.</p>` +
          `<div class="footer-contacts">` +
            `<div class="contact-row">` +
              `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>` +
              `<a href="tel:${COMPANY_PHONE_HREF}">Hotline: ${COMPANY_PHONE} (24/7)</a>` +
            `</div>` +
            `<div class="contact-row">` +
              `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>` +
              `<a href="mailto:contact@fourland.vn">contact@fourland.vn</a>` +
            `</div>` +
            `<div class="contact-row">` +
              `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>` +
              `<span>Phục vụ toàn bộ Quận / Huyện TP. Hồ Chí Minh</span>` +
            `</div>` +
          `</div>` +
        `</div>` +
        `<div class="footer-col links-col">` +
          `<h4 class="footer-heading">Kho Bất Động Sản</h4>` +
          `<ul class="footer-menu">` +
            `<li><a href="/#q=cho-thue">Nhà thuê & Mặt bằng kinh doanh</a></li>` +
            `<li><a href="/#q=nha-ban">Nhà phố chính chủ cần bán</a></li>` +
            `<li><a href="/#q=mat-tien">Mặt tiền kinh doanh sầm uất</a></li>` +
            `<li><a href="/#q=toa-nha">Tòa nhà văn phòng & CHDV</a></li>` +
            `<li><a href="/#q=biet-thu">Biệt thự & Shophouse đẳng cấp</a></li>` +
          `</ul>` +
        `</div>` +
        `<div class="footer-col links-col">` +
          `<h4 class="footer-heading">Khu Vực Trọng Điểm</h4>` +
          `<ul class="footer-menu">` +
            `<li><a href="/#q=Tan+Binh">Bất động sản Tân Bình</a></li>` +
            `<li><a href="/#q=Binh+Thanh">Bất động sản Bình Thạnh</a></li>` +
            `<li><a href="/#q=Go+Vap">Bất động sản Gò Vấp</a></li>` +
            `<li><a href="/#q=Phu+Nhuan">Bất động sản Phú Nhuận</a></li>` +
            `<li><a href="/#q=Quan+1">Bất động sản Quận 1 & Quận 3</a></li>` +
            `<li><a href="/#q=Quan+10">Bất động sản Quận 10 & Quận 11</a></li>` +
          `</ul>` +
        `</div>` +
        `<div class="footer-col action-col">` +
          `<h4 class="footer-heading">Kết Nối Với Fourland</h4>` +
          `<p class="action-desc">Cần hỗ trợ khảo sát thực tế hoặc đàm phán giá tốt nhất?</p>` +
          `<div class="footer-buttons">` +
            `<a href="https://zalo.me/${COMPANY_PHONE_HREF}" target="_blank" rel="noopener noreferrer" class="btn-footer btn-zalo">` +
              `<span>Chat Zalo tư vấn 24/7</span>` +
            `</a>` +
            `<a href="https://www.facebook.com/profile.php?id=100066639715025" target="_blank" rel="noopener noreferrer" class="btn-footer btn-facebook">` +
              `<span>Theo dõi Fanpage Fourland</span>` +
            `</a>` +
          `</div>` +
          `<div class="footer-hotline-card">` +
            `<span class="hotline-badge">TỔNG ĐÀI HỖ TRỢ</span>` +
            `<a href="tel:${COMPANY_PHONE_HREF}" class="hotline-number">${COMPANY_PHONE}</a>` +
          `</div>` +
        `</div>` +
      `</div>` +
      `<div class="footer-bottom">` +
        `<p class="copyright">© 2026 FOURLAND Property Intelligence. Tất cả các quyền được bảo lưu.</p>` +
        `<div class="bottom-links">` +
          `<a href="/">Trang chủ kho nhà</a>` +
          `<span>·</span>` +
          `<a href="/sitemap.xml">Sitemap</a>` +
          `<span>·</span>` +
          `<a href="tel:${COMPANY_PHONE_HREF}">Liên hệ hỗ trợ</a>` +
        `</div>` +
      `</div>` +
    `</div>` +
  `</footer>`;
}

function renderPropertyPage(property, { similarProperties = [] } = {}) {
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

  const similarCardsHtml = (Array.isArray(similarProperties) ? similarProperties : []).map(renderSimilarCard).join("");
  const locationName = value(property.district) || value(property.ward) || "TP.HCM";

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-BS0X1F8NSD"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-BS0X1F8NSD');</script><title>${escapeHtml(pageTitle)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="Fourland"><meta property="og:title" content="${escapeHtml(pageTitle)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(hero)}"><meta property="og:image:alt" content="${escapeHtml(presentation.headline)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(pageTitle)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(hero)}"><link rel="icon" href="/assets/brand/fourland-logo.png"><link rel="stylesheet" href="/assets/property.css?v=20260905-similar-footer-v92"><script type="application/ld+json">${jsonLd(schema)}</script></head><body>` +
    `<header class="top">` +
      `<div class="top-inner">` +
        `<a href="/" class="top-brand" aria-label="Về kho Fourland">` +
          `<img src="/assets/brand/fourland-logo.png" width="56" height="52" alt="Fourland">` +
          `<div class="top-brand-text">` +
            `<span class="top-brand-title">FOURLAND</span>` +
            `<span class="top-brand-sub">PROPERTY INTELLIGENCE</span>` +
          `</div>` +
        `</a>` +
        `<nav class="top-nav">` +
          `<a href="/" class="top-nav-link">Kho nhà</a>` +
          `<a href="/#q=cho-thue" class="top-nav-link">Cho thuê</a>` +
          `<a href="/#q=nha-ban" class="top-nav-link">Nhà bán</a>` +
        `</nav>` +
        `<div class="top-right">` +
          `<a href="tel:${COMPANY_PHONE_HREF}" class="top-hotline-btn">` +
            `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>` +
            `<span>${COMPANY_PHONE}</span>` +
          `</a>` +
          `<a href="/" class="top-back-btn">← Quay lại kho</a>` +
        `</div>` +
      `</div>` +
    `</header>` +
    `<main>` +
      `<nav aria-label="Đường dẫn" class="breadcrumbs"><a href="/">Kho nhà</a><span>›</span><span>${escapeHtml(presentation.headline)}</span></nav>` +
      `<article>` +
        `<header class="property-head">` +
          `<p>FOURLAND COLLECTION</p>` +
          `<h1>${escapeHtml(presentation.headline)}</h1>` +
          `<strong>${escapeHtml(property.price_text || "Liên hệ")}</strong>` +
          `<div>${escapeHtml(presentation.location)}</div>` +
          (updated ? `<small>Cập nhật <time datetime="${escapeHtml(updated.iso)}">${escapeHtml(updated.label)}</time></small>` : "") +
        `</header>` +
        `<section class="gallery">` +
          (images.length ? `<img class="hero" src="${escapeHtml(hero)}" width="1200" height="900" alt="${escapeHtml(presentation.headline)}" fetchpriority="high"><div class="thumbs">${images.slice(1, 8).map((url, index) => `<img src="${escapeHtml(url)}" width="180" height="135" loading="lazy" alt="Ảnh ${index + 2} của ${escapeHtml(presentation.headline)}">`).join("")}</div>` : `<div class="empty-photo">Hồ sơ chưa có hình ảnh</div>`) +
        `</section>` +
        `<section class="content">` +
          `<div>` +
            `<h2>Thông tin bất động sản</h2>` +
            `<p>${escapeHtml(presentation.summary)}</p>` +
            `<dl>${facts.map(([key, factValue]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(factValue)}</dd></div>`).join("")}</dl>` +
          `</div>` +
          `<aside>` +
            `<h2>Mô tả nguồn nhà</h2>` +
            `<p>${escapeHtml(rawDescription)}</p>` +
            `<a class="call" href="tel:${COMPANY_PHONE_HREF}">Gọi Fourland · ${COMPANY_PHONE}</a>` +
          `</aside>` +
        `</section>` +
        `<section class="similar-section" id="similarSection">` +
          `<div class="similar-head">` +
            `<span class="similar-badge">GỢI Ý DÀNH CHO BẠN</span>` +
            `<h2>Bất động sản tương tự tại ${escapeHtml(locationName)}</h2>` +
            `<p>Các bất động sản chọn lọc khác cùng khu vực và phân khúc có thể bạn quan tâm</p>` +
          `</div>` +
          `<div class="similar-grid" id="similarGrid">` +
            similarCardsHtml +
          `</div>` +
          `<div class="similar-cta">` +
            `<a href="/" class="btn-more-properties">` +
              `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>` +
              `<span>Xem thêm hàng ngàn BĐS khác trong Kho Fourland</span>` +
              `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>` +
            `</a>` +
          `</div>` +
        `</section>` +
      `</article>` +
    `</main>` +
    renderSystemFooter() +
    `<aside class="floating-contact-pills" aria-label="Liên hệ nhanh">` +
      `<a href="https://zalo.me/${COMPANY_PHONE_HREF}" target="_blank" rel="noopener noreferrer" class="float-pill pill-zalo" title="Chat Zalo tư vấn">` +
        `<span>Zalo</span>` +
      `</a>` +
      `<a href="tel:${COMPANY_PHONE_HREF}" class="float-pill pill-phone" title="Gọi Hotline: ${COMPANY_PHONE}">` +
        `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>` +
      `</a>` +
    `</aside>` +
    `<script>` +
      `(()=>{` +
        `const grid=document.getElementById("similarGrid");` +
        `if(!grid||grid.children.length>0)return;` +
        `const curId=${JSON.stringify(value(property.property_id))};` +
        `fetch("/api/properties?limit=6")` +
          `.then(r=>r.json())` +
          `.then(res=>{` +
            `const items=(res.data||[]).filter(i=>i.property_id!==curId).slice(0,4);` +
            `if(!items.length)return;` +
            `grid.innerHTML=items.map(i=>{` +
              `const img=(i.property_images&&i.property_images[0]&&i.property_images[0].public_url)||"/assets/brand/fourland-logo.png";` +
              `const addr=i.address||i.street||"Bất động sản chọn lọc";` +
              `const price=i.price_text||"Liên hệ";` +
              `const loc=[i.ward,i.district].filter(Boolean).join(", ");` +
              `const specs=[i.area_text,i.structure].filter(Boolean).join(" · ");` +
              `const path="/bat-dong-san/"+encodeURIComponent(i.property_id);` +
              `return '<a href="'+path+'" class="similar-card">'+` +
                `'<div class="similar-card-thumb"><img src="'+img+'" alt="'+addr+'" loading="lazy"><span class="similar-badge-price">'+price+'</span></div>'+` +
                `'<div class="similar-card-body"><h3 class="similar-card-title">'+addr+'</h3><div class="similar-card-loc">'+(loc||"TP.HCM")+'</div>'+(specs?'<div class="similar-card-specs">'+specs+'</div>':'')+'</div>'+` +
              `'</a>';` +
            `}).join("");` +
          `}).catch(()=>{});` +
      `})();` +
    `</script>` +
  `</body></html>`;
}

function renderSitemap(properties, generatedAt = new Date(), landingEntries = []) {
  const fallbackDate = generatedAt.toISOString().slice(0, 10);
  const urls = [{ loc: `${SITE_ORIGIN}/`, lastmod: fallbackDate, changefreq: "daily", priority: "1.0" }];
  const seen = new Set(urls.map(item => item.loc));

  for (const entry of landingEntries || []) {
    const loc = entry.loc || `${SITE_ORIGIN}${entry.path}`;
    if ((!entry.path && !entry.loc) || seen.has(loc)) continue;
    seen.add(loc);
    urls.push({
      loc, lastmod: entry.lastmod || fallbackDate,
      changefreq: entry.changefreq || "daily", priority: entry.priority || "0.8"
    });
  }

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
  SITE_ORIGIN, COMPANY_PHONE, COMPANY_PHONE_HREF, driveImage, escapeHtml, escapeXml, formatDate, formatPublicAddress, inferListingAction, jsonLd,
  maskDescriptionText, maskTextPhones, propertyIdFromSlug, propertyPath, propertyPresentation,
  publicImages, renderPropertyPage, renderSitemap, slugify, stripHouseNumber, value
};
