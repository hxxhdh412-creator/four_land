const SITE_ORIGIN = "https://www.fourland.vn";

function value(input) { return String(input ?? "").trim(); }
function escapeHtml(input) {
  return value(input).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function slugify(input) {
  return value(input).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "ho-so-bat-dong-san";
}
function propertyPath(property) {
  const label = property.address || property.street || property.property_type || "ho-so-bat-dong-san";
  return `/bat-dong-san/${slugify(label)}--${encodeURIComponent(value(property.property_id))}`;
}
function propertyIdFromSlug(slug) {
  const decoded = decodeURIComponent(value(slug));
  const marker = decoded.lastIndexOf("--");
  return marker >= 0 ? decoded.slice(marker + 2).slice(0, 100) : "";
}
function driveImage(url) {
  const input = value(url); const match = input.match(/\/d\/([\w-]+)/) || input.match(/[?&]id=([\w-]+)/);
  return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1600` : input;
}
function jsonLd(value) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
function renderPropertyPage(property) {
  const images = (property.property_images || []).filter(i => (i.public_url || i.source_url) && String(i.public_url || i.source_url).startsWith('http')).sort((a,b) => a.position-b.position).map(i => driveImage(i.public_url || i.source_url));
  const titleBase = property.address || property.street || property.property_id;
  const location = [property.ward, property.district, "TP.HCM"].filter(Boolean).join(", ");
  const title = `${titleBase}${property.price_text ? ` · ${property.price_text}` : ""} | Fourland`;
  const description = value(property.raw_text || `${property.property_type || "Bất động sản"} tại ${titleBase}, ${location}`).slice(0, 158);
  const canonical = SITE_ORIGIN + propertyPath(property);
  const hero = images[0] || `${SITE_ORIGIN}/assets/brand/fourland-logo.png`;
  const facts = [["Quận/Huyện",property.district],["Phường/Xã",property.ward],["Tên đường",property.street],["Diện tích",property.area_text],["Kích thước",property.dimensions],["Phòng ngủ",property.bedrooms],["Phòng tắm",property.bathrooms],["Kết cấu",property.structure],["Pháp lý",property.legal],["Loại BĐS",property.property_type]].filter(([,v])=>value(v));
  const schema = {"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":canonical,"url":canonical,"name":title,"description":description,"inLanguage":"vi-VN","primaryImageOfPage":{"@type":"ImageObject","url":hero}},{"@type":"Residence","name":titleBase,"description":description,"image":images,"address":{"@type":"PostalAddress","streetAddress":property.address||property.street||"","addressLocality":property.district||"Thành phố Hồ Chí Minh","addressRegion":"Hồ Chí Minh","addressCountry":"VN"},"numberOfBedrooms":property.bedrooms||undefined,"numberOfBathroomsTotal":property.bathrooms||undefined},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Kho bất động sản","item":SITE_ORIGIN+"/"},{"@type":"ListItem","position":2,"name":titleBase,"item":canonical}]}]};
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-BS0X1F8NSD"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-BS0X1F8NSD');</script><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="Fourland"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${escapeHtml(hero)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(hero)}"><link rel="icon" href="/assets/brand/fourland-logo.png"><link rel="stylesheet" href="/assets/property.css"><script type="application/ld+json">${jsonLd(schema)}</script></head><body><header class="top"><a href="/" aria-label="Về kho Fourland"><img src="/assets/brand/fourland-logo.png" width="76" height="70" alt="Fourland"></a><a href="/">Kho bất động sản</a></header><main><nav aria-label="Đường dẫn"><a href="/">Kho nhà</a><span>›</span><span>${escapeHtml(titleBase)}</span></nav><article><header class="property-head"><p>FOURLAND COLLECTION</p><h1>${escapeHtml(titleBase)}</h1><strong>${escapeHtml(property.price_text || "Liên hệ")}</strong><div>${escapeHtml(location)}</div></header><section class="gallery">${images.length ? `<img class="hero" src="${escapeHtml(hero)}" width="1200" height="900" alt="${escapeHtml(titleBase)}" fetchpriority="high"><div class="thumbs">${images.slice(1,8).map((url,i)=>`<img src="${escapeHtml(url)}" width="180" height="135" loading="lazy" alt="Ảnh ${i+2} của ${escapeHtml(titleBase)}">`).join("")}</div>` : `<div class="empty-photo">Hồ sơ chưa có hình ảnh</div>`}</section><section class="content"><div><h2>Thông tin bất động sản</h2><dl>${facts.map(([k,v])=>`<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl></div><aside><h2>Nội dung nhà</h2><p>${escapeHtml(property.raw_text || property.notes || description)}</p><a class="call" href="tel:0842222813">Gọi Fourland · 084 2222 813</a></aside></section></article></main><footer>© Fourland · Kho bất động sản chọn lọc TP.HCM</footer></body></html>`;
}

module.exports = { SITE_ORIGIN, escapeHtml, propertyIdFromSlug, propertyPath, renderPropertyPage, slugify, driveImage, jsonLd, value };
