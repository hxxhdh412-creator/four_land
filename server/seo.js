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
  const heroImg = cardImages[0] || "";
  const price = value(item.price_text) || "Liên hệ";
  const dispAddr = formatPublicAddress(item);
  const loc = [item.street, item.ward, item.district].map(value).filter(Boolean).join(" · ");
  const specs = [item.dimensions || item.area_text, item.structure, item.bedrooms ? `${item.bedrooms} PN` : ""].map(value).filter(Boolean).join(" · ");
  const badgeText = value(item.badge) || value(item.district) || inferListingAction(item) || "Gần đây";
  const isRented = Boolean(item.is_rented || String(item.status).toLowerCase() === "rented");

  return `<a href="${escapeHtml(cardPath)}" class="similar-card" data-similar-id="${escapeHtml(item.property_id)}" title="Xem chi tiết: ${escapeHtml(dispAddr)}">` +
    `<div class="similar-card-thumb ${!heroImg ? "no-photo" : ""}">` +
      (heroImg ? `<img src="${escapeHtml(heroImg)}" alt="${escapeHtml(dispAddr)}" loading="lazy" width="360" height="225" onerror="this.parentElement.classList.add('no-photo');this.remove();">` : "") +
      `<span class="similar-card-badge">${escapeHtml(badgeText)}</span>` +
      (isRented ? `<span class="similar-rented-tag">Đã thuê</span>` : "") +
    `</div>` +
    `<div class="similar-card-info">` +
      `<div class="similar-card-price">${escapeHtml(price)}</div>` +
      `<h4 class="similar-card-title">${escapeHtml(dispAddr)}</h4>` +
      `<div class="similar-card-loc">${escapeHtml(loc || "TP. Hồ Chí Minh")}</div>` +
      (specs ? `<div class="similar-card-specs">${escapeHtml(specs)}</div>` : "") +
    `</div>` +
  `</a>`;
}

function renderSimilarPropertiesSection(similarCardsHtml, count = 0) {
  const countBadge = count > 0
    ? `<span class="similar-header-count" id="similarHeaderCount">${count} căn phù hợp</span>`
    : `<span class="similar-header-count" id="similarHeaderCount" style="display:none"></span>`;

  return `<section class="similar-properties-section" id="similarPropertiesSection">` +
    `<div class="similar-section-header">` +
      `<div class="similar-header-title">` +
        `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` +
        `<h3>BĐS tương tự cùng khu vực</h3>` +
      `</div>` +
      countBadge +
    `</div>` +
    `<div class="similar-carousel" id="similarCarousel">` +
      similarCardsHtml +
    `</div>` +
    `<div class="similar-cta">` +
      `<a href="/" class="btn-more-properties">` +
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>` +
        `<span>Mở kho BĐS Fourland xem thêm</span>` +
        `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>` +
      `</a>` +
    `</div>` +
  `</section>`;
}

function renderSystemFooter() {
  return `<footer class="site-footer">` +
    `<div class="footer-card">` +
      `<div class="footer-header">` +
        `<div class="footer-brand-wrap">` +
          `<img class="footer-logo" src="/assets/brand/fourland-logo.png" alt="Fourland">` +
          `<div class="footer-titles">` +
            `<span class="footer-name">FOURLAND</span>` +
            `<span class="footer-subtitle">PROPERTY INTELLIGENCE</span>` +
          `</div>` +
        `</div>` +
      `</div>` +
      `<p class="footer-intro">` +
        `Nền tảng tra cứu và phân phối kho bất động sản chọn lọc — Đồng bộ dữ liệu chuẩn xác, tối ưu hiệu quả nguồn hàng cho đội ngũ kinh doanh.` +
      `</p>` +
      `<div class="footer-grid">` +
        `<div class="footer-info-block">` +
          `<span class="footer-block-label">Liên hệ & Trụ sở</span>` +
          `<div class="footer-contact-items">` +
            `<div class="footer-item">` +
              `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>` +
              `<span>TP. Hồ Chí Minh, Việt Nam</span>` +
            `</div>` +
            `<div class="footer-item">` +
              `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>` +
              `<a href="tel:${COMPANY_PHONE_HREF}" class="footer-link-hotline">Hotline: ${COMPANY_PHONE}</a>` +
            `</div>` +
            `<div class="footer-item">` +
              `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>` +
              `<a href="mailto:contact@fourland.vn">contact@fourland.vn</a>` +
            `</div>` +
            `<div class="footer-item">` +
              `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>` +
              `<a href="https://www.facebook.com/profile.php?id=100066639715025" target="_blank" rel="noopener noreferrer">Facebook: Fourland</a>` +
            `</div>` +
            `<div class="footer-item">` +
              `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>` +
              `<span>08:00 – 18:00 (Thứ 2 – Thứ 7)</span>` +
            `</div>` +
          `</div>` +
        `</div>` +
        `<div class="footer-tags-block">` +
          `<span class="footer-block-label">Phân loại kho nhà</span>` +
          `<div class="footer-pill-tags">` +
            `<a href="/#q=Nhà+phố">Nhà phố TP.HCM</a>` +
            `<a href="/#q=Biệt+thự">Biệt thự & Villa</a>` +
            `<a href="/#q=Mặt+tiền">Mặt tiền kinh doanh</a>` +
            `<a href="/#q=Căn+hộ">Căn hộ cao cấp</a>` +
            `<a href="/#q=Thuê">Nhà cho thuê</a>` +
          `</div>` +
        `</div>` +
      `</div>` +
      `<div class="footer-meta-strip">` +
        `<span>© 2026 FOURLAND. All rights reserved.</span>` +
        `<span>Nền tảng nội bộ Fourland</span>` +
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

  const similarList = Array.isArray(similarProperties) ? similarProperties : [];
  const similarCardsHtml = similarList.map(renderSimilarCard).join("");

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-BS0X1F8NSD"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-BS0X1F8NSD');</script><title>${escapeHtml(pageTitle)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="Fourland"><meta property="og:title" content="${escapeHtml(pageTitle)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(hero)}"><meta property="og:image:alt" content="${escapeHtml(presentation.headline)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(pageTitle)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(hero)}"><link rel="icon" href="/assets/brand/fourland-logo.png"><link rel="stylesheet" href="/assets/property.css?v=20260905-gallery-fix-v1"><script type="application/ld+json">${jsonLd(schema)}</script></head><body>` +
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
    `<main class="shell">` +
      `<nav aria-label="Đường dẫn" class="breadcrumbs"><a href="/">Kho nhà</a><span>›</span><span>${escapeHtml(presentation.headline)}</span></nav>` +
      `<article>` +
        `<header class="property-head">` +
          `<p>FOURLAND COLLECTION</p>` +
          `<h1>${escapeHtml(presentation.headline)}</h1>` +
          `<strong>${escapeHtml(property.price_text || "Liên hệ")}</strong>` +
          `<div>${escapeHtml(presentation.location)}</div>` +
          (updated ? `<small>Cập nhật <time datetime="${escapeHtml(updated.iso)}">${escapeHtml(updated.label)}</time></small>` : "") +
        `</header>` +
        `<section class="gallery" id="propertyGallery">` +
          (images.length ?
            `<div class="gallery-hero-wrap" title="Bấm để phóng to xem trọn bộ ảnh">` +
              `<img class="hero" id="mainHeroImage" src="${escapeHtml(hero)}" width="1200" height="900" alt="${escapeHtml(presentation.headline)}" fetchpriority="high">` +
              (images.length > 1 ?
                `<button type="button" class="gallery-nav gallery-prev" id="galleryPrevBtn" aria-label="Ảnh trước">` +
                  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>` +
                `</button>` +
                `<button type="button" class="gallery-nav gallery-next" id="galleryNextBtn" aria-label="Ảnh kế tiếp">` +
                  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>` +
                `</button>` +
                `<span class="gallery-counter"><span id="galleryCurrentIdx">1</span> / ${images.length}</span>` +
                `<button type="button" class="gallery-zoom-btn" id="galleryZoomBtn" aria-label="Xem toàn màn hình" title="Phóng to ảnh">` +
                  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>` +
                  `<span>Phóng to</span>` +
                `</button>` : "") +
            `</div>` +
            (images.length > 1 ?
              `<div class="thumbs" id="galleryThumbs">` +
                images.map((url, index) =>
                  `<button type="button" class="thumb-btn ${index === 0 ? "active" : ""}" data-idx="${index}" aria-label="Ảnh ${index + 1}">` +
                    `<img src="${escapeHtml(url)}" width="180" height="135" loading="lazy" alt="Thumbnail ${index + 1}">` +
                  `</button>`
                ).join("") +
              `</div>` : "")
            : `<div class="empty-photo">Hồ sơ chưa có hình ảnh</div>`) +
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
        renderSimilarPropertiesSection(similarCardsHtml, similarList.length) +
      `</article>` +
      renderSystemFooter() +
    `</main>` +
    (images.length ?
      `<div id="lightboxModal" class="lightbox-modal" aria-hidden="true" role="dialog" aria-label="Xem ảnh phóng to">` +
        `<div class="lightbox-backdrop" id="lightboxBackdrop"></div>` +
        `<div class="lightbox-content">` +
          `<button type="button" class="lightbox-close" id="lightboxCloseBtn" aria-label="Đóng">` +
            `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>` +
          `</button>` +
          (images.length > 1 ?
            `<button type="button" class="lightbox-nav lightbox-prev" id="lightboxPrevBtn" aria-label="Ảnh trước">` +
              `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>` +
            `</button>` : "") +
          `<div class="lightbox-image-wrap">` +
            `<img id="lightboxImage" src="${escapeHtml(hero)}" alt="${escapeHtml(presentation.headline)}">` +
          `</div>` +
          (images.length > 1 ?
            `<button type="button" class="lightbox-nav lightbox-next" id="lightboxNextBtn" aria-label="Ảnh kế tiếp">` +
              `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>` +
            `</button>` : "") +
          `<div class="lightbox-footer">` +
            `<span class="lightbox-counter"><span id="lightboxCurrentIdx">1</span> / ${images.length}</span>` +
            `<span class="lightbox-title">${escapeHtml(presentation.headline)}</span>` +
          `</div>` +
        `</div>` +
      `</div>` : "") +
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
        `const images=${JSON.stringify(images)};` +
        `if(images&&images.length){` +
          `let currentIdx=0;` +
          `const mainImg=document.getElementById("mainHeroImage");` +
          `const currentIdxEl=document.getElementById("galleryCurrentIdx");` +
          `const thumbs=document.querySelectorAll(".thumb-btn");` +
          `const prevBtn=document.getElementById("galleryPrevBtn");` +
          `const nextBtn=document.getElementById("galleryNextBtn");` +
          `const zoomBtn=document.getElementById("galleryZoomBtn");` +
          `const heroWrap=document.querySelector(".gallery-hero-wrap");` +
          `const lightbox=document.getElementById("lightboxModal");` +
          `const lbImg=document.getElementById("lightboxImage");` +
          `const lbCurrentIdxEl=document.getElementById("lightboxCurrentIdx");` +
          `const lbPrevBtn=document.getElementById("lightboxPrevBtn");` +
          `const lbNextBtn=document.getElementById("lightboxNextBtn");` +
          `const lbCloseBtn=document.getElementById("lightboxCloseBtn");` +
          `const lbBackdrop=document.getElementById("lightboxBackdrop");` +
          `function showImage(idx,scroll=true){` +
            `currentIdx=(idx+images.length)%images.length;` +
            `const src=images[currentIdx];` +
            `if(mainImg)mainImg.src=src;` +
            `if(currentIdxEl)currentIdxEl.textContent=currentIdx+1;` +
            `if(lbImg)lbImg.src=src;` +
            `if(lbCurrentIdxEl)lbCurrentIdxEl.textContent=currentIdx+1;` +
            `thumbs.forEach((btn,i)=>{` +
              `const active=i===currentIdx;` +
              `btn.classList.toggle("active",active);` +
              `if(active&&scroll)btn.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"});` +
            `});` +
          `}` +
          `thumbs.forEach((btn,i)=>btn.addEventListener("click",(e)=>{e.preventDefault();showImage(i);}));` +
          `if(prevBtn)prevBtn.addEventListener("click",(e)=>{e.preventDefault();showImage(currentIdx-1);});` +
          `if(nextBtn)nextBtn.addEventListener("click",(e)=>{e.preventDefault();showImage(currentIdx+1);});` +
          `function openLightbox(idx){if(!lightbox)return;showImage(idx,false);lightbox.classList.add("open");lightbox.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";}` +
          `function closeLightbox(){if(!lightbox)return;lightbox.classList.remove("open");lightbox.setAttribute("aria-hidden","true");document.body.style.overflow="";}` +
          `if(heroWrap)heroWrap.addEventListener("click",(e)=>{if(e.target.closest(".gallery-nav")||e.target.closest(".gallery-zoom-btn"))return;openLightbox(currentIdx);});` +
          `if(zoomBtn)zoomBtn.addEventListener("click",(e)=>{e.stopPropagation();openLightbox(currentIdx);});` +
          `if(lbCloseBtn)lbCloseBtn.addEventListener("click",closeLightbox);` +
          `if(lbBackdrop)lbBackdrop.addEventListener("click",closeLightbox);` +
          `if(lbPrevBtn)lbPrevBtn.addEventListener("click",(e)=>{e.stopPropagation();showImage(currentIdx-1);});` +
          `if(lbNextBtn)lbNextBtn.addEventListener("click",(e)=>{e.stopPropagation();showImage(currentIdx+1);});` +
          `window.addEventListener("keydown",(e)=>{` +
            `if(lightbox&&lightbox.classList.contains("open")){` +
              `if(e.key==="Escape")closeLightbox();` +
              `if(e.key==="ArrowLeft")showImage(currentIdx-1);` +
              `if(e.key==="ArrowRight")showImage(currentIdx+1);` +
            `}else{` +
              `if(e.key==="ArrowLeft")showImage(currentIdx-1);` +
              `if(e.key==="ArrowRight")showImage(currentIdx+1);` +
            `}` +
          `});` +
          `function addSwipe(el,onL,onR){` +
            `if(!el)return;let sx=0,sy=0;` +
            `el.addEventListener("touchstart",(e)=>{sx=e.changedTouches[0].screenX;sy=e.changedTouches[0].screenY;},{passive:true});` +
            `el.addEventListener("touchend",(e)=>{const dx=e.changedTouches[0].screenX-sx,dy=e.changedTouches[0].screenY-sy;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5){if(dx<0)onL();else onR();}},{passive:true});` +
          `}` +
          `addSwipe(heroWrap,()=>showImage(currentIdx+1),()=>showImage(currentIdx-1));` +
          `addSwipe(lightbox,()=>showImage(currentIdx+1),()=>showImage(currentIdx-1));` +
        `}` +
        `const carousel=document.getElementById("similarCarousel");` +
        `if(!carousel||carousel.children.length>0)return;` +
        `const curId=${JSON.stringify(value(property.property_id))};` +
        `fetch("/api/properties?limit=6")` +
          `.then(r=>r.json())` +
          `.then(res=>{` +
            `const items=(res.data||[]).filter(i=>i.property_id!==curId).slice(0,4);` +
            `if(!items.length)return;` +
            `const countEl=document.getElementById("similarHeaderCount");` +
            `if(countEl){countEl.textContent=items.length+" căn phù hợp";countEl.style.display="";}` +
            `carousel.innerHTML=items.map(i=>{` +
              `const rawThumb=(i.property_images&&i.property_images[0]&&(i.property_images[0].public_url||i.property_images[0].source_url))||"";` +
              `const addr=i.address||i.street||"Bất động sản chọn lọc";` +
              `const price=i.price_text||"Liên hệ";` +
              `const loc=[i.street,i.ward,i.district].filter(Boolean).join(" · ");` +
              `const specs=[i.dimensions||i.area_text,i.structure].filter(Boolean).join(" · ");` +
              `const badge=i.district||i.property_type||"Gần đây";` +
              `const path="/bat-dong-san/"+encodeURIComponent(i.property_id);` +
              `return '<a href="'+path+'" class="similar-card" title="Xem chi tiết: '+addr+'">'+` +
                `'<div class="similar-card-thumb '+(rawThumb?'':'no-photo')+'">'+` +
                  `(rawThumb?'<img src="'+rawThumb+'" alt="'+addr+'" loading="lazy">':'')+` +
                  `'<span class="similar-card-badge">'+badge+'</span>'+` +
                `'</div>'+` +
                `'<div class="similar-card-info">'+` +
                  `'<div class="similar-card-price">'+price+'</div>'+` +
                  `'<h4 class="similar-card-title">'+addr+'</h4>'+` +
                  `'<div class="similar-card-loc">'+(loc||"TP. Hồ Chí Minh")+'</div>'+` +
                  `(specs?'<div class="similar-card-specs">'+specs+'</div>':'')+` +
                `'</div>'+` +
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
