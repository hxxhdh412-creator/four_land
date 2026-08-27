const fs = require("fs");
const path = require("path");
const { sendError, supabaseRequest } = require("./_supabase");
const { propertyIdFromSlug, propertyPath, jsonLd, driveImage, SITE_ORIGIN, value, escapeHtml } = require("../server/seo");

let indexHtmlTemplate = "";
try {
  indexHtmlTemplate = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
} catch (_) {}

function maskTextPhones(text) {
  if (!text) return "";
  const phonePattern = /(?:\+?84|0)(?:[35789])(?:[\s.-]*\d){7,9}/g;
  return String(text).replace(phonePattern, match => {
    const clean = match.replace(/[\s.-]/g, "");
    return clean.slice(0, 4) + " ••• •••";
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
  try {
    const id = propertyIdFromSlug(req.query.slug);
    if (!id) return res.status(404).send("Không tìm thấy hồ sơ");
    const query = new URLSearchParams({ select: "*,property_images(position,public_url,source_url)", property_id: `eq.${id}`, status: "neq.archived", limit: "1" });
    const result = await supabaseRequest(`properties?${query}`);
    const property = result.data?.[0];
    if (!property) return res.status(404).send("Không tìm thấy hồ sơ");

    const images = (property.property_images || []).filter(i => i.public_url || i.source_url).sort((a,b) => a.position - b.position).map(i => driveImage(i.public_url || i.source_url));
    const titleBase = property.address || property.street || property.property_id;
    const location = [property.ward, property.district, "TP.HCM"].filter(Boolean).join(", ");
    const pageTitle = `${titleBase}${property.price_text ? ` · ${property.price_text}` : ""} | FOURLAND`;
    const maskedRaw = maskTextPhones(property.raw_text || property.notes || "");
    const description = value(maskedRaw || `${property.property_type || "Bất động sản"} tại ${titleBase}, ${location}`).slice(0, 160);
    const canonical = SITE_ORIGIN + propertyPath(property);
    const heroImage = images[0] || `${SITE_ORIGIN}/assets/brand/fourland-logo.png`;

    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": canonical,
          "url": canonical,
          "name": pageTitle,
          "description": description,
          "inLanguage": "vi-VN",
          "primaryImageOfPage": { "@type": "ImageObject", "url": heroImage }
        },
        {
          "@type": "Residence",
          "name": titleBase,
          "description": description,
          "image": images,
          "address": {
            "@type": "PostalAddress",
            "streetAddress": property.address || property.street || "",
            "addressLocality": property.district || "Thành phố Hồ Chí Minh",
            "addressRegion": "Hồ Chí Minh",
            "addressCountry": "VN"
          },
          "numberOfBedrooms": property.bedrooms || undefined,
          "numberOfBathroomsTotal": property.bathrooms || undefined
        }
      ]
    };

    let html = indexHtmlTemplate || fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

    // Thay thế Title & Description
    html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);
    html = html.replace(/<meta name="description"[\s\S]*?>/i, `<meta name="description" content="${escapeHtml(description)}">`);
    html = html.replace(/<link rel="canonical"[\s\S]*?>/i, `<link rel="canonical" href="${canonical}">`);
    
    // Thay thế OpenGraph
    html = html.replace(/<meta property="og:title"[\s\S]*?>/i, `<meta property="og:title" content="${escapeHtml(pageTitle)}">`);
    html = html.replace(/<meta property="og:description"[\s\S]*?>/i, `<meta property="og:description" content="${escapeHtml(description)}">`);
    html = html.replace(/<meta property="og:image"[\s\S]*?>/i, `<meta property="og:image" content="${escapeHtml(heroImage)}">`);
    html = html.replace(/<meta property="og:url"[\s\S]*?>/i, `<meta property="og:url" content="${canonical}">`);

    // Thay thế Twitter Card
    html = html.replace(/<meta name="twitter:title"[\s\S]*?>/i, `<meta name="twitter:title" content="${escapeHtml(pageTitle)}">`);
    html = html.replace(/<meta name="twitter:description"[\s\S]*?>/i, `<meta name="twitter:description" content="${escapeHtml(description)}">`);
    html = html.replace(/<meta name="twitter:image"[\s\S]*?>/i, `<meta name="twitter:image" content="${escapeHtml(heroImage)}">`);

    // Thay thế Schema.org JSON-LD
    html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${jsonLd(schema)}</script>`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    return res.status(200).send(html);
  } catch (error) {
    return sendError(res, error);
  }
};
