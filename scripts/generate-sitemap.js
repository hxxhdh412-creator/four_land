const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    const sep = line.indexOf('=');
    if (sep > 0 && !line.trim().startsWith('#')) {
      const k = line.slice(0, sep).trim();
      const v = line.slice(sep + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  });
}
const { supabaseRequest } = require('../api/_supabase');
const { SITE_ORIGIN, propertyPath } = require('../server/seo');

async function generateSitemap() {
  const today = new Date().toISOString().split('T')[0];
  let properties = [];

  try {
    const result = await supabaseRequest('properties?select=property_id,address,street,property_type,received_at,updated_at&status=neq.archived&order=received_at.desc&limit=2000');
    properties = result.data || [];
  } catch (err) {
    console.warn('Could not fetch properties for sitemap, using fallback list:', err.message);
  }

  const staticUrls = [
    { loc: `${SITE_ORIGIN}/`, priority: '1.0', changefreq: 'daily' }
  ];

  const propUrls = properties.map((p) => ({
    loc: SITE_ORIGIN + propertyPath(p),
    lastmod: (p.updated_at || p.received_at) ? new Date(p.updated_at || p.received_at).toISOString().split('T')[0] : today,
    priority: '0.7',
    changefreq: 'weekly'
  }));

  const allUrls = [...staticUrls, ...propUrls];

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...allUrls.map((u) => [
      '  <url>',
      `    <loc>${u.loc}</loc>`,
      `    <lastmod>${u.lastmod || today}</lastmod>`,
      `    <changefreq>${u.changefreq || 'weekly'}</changefreq>`,
      `    <priority>${u.priority || '0.5'}</priority>`,
      '  </url>'
    ].join('\n')),
    '</urlset>',
    ''
  ];

  const targetPath = path.join(root, 'sitemap.xml');
  fs.writeFileSync(targetPath, lines.join('\n'), 'utf8');
  console.log(`Generated ${targetPath} with ${allUrls.length} URLs.`);
}

if (require.main === module) {
  generateSitemap();
}

module.exports = { generateSitemap };
