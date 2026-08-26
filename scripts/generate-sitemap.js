const fs = require('fs');
const path = require('path');
const { supabaseRequest } = require('../api/_supabase');

async function generateSitemap() {
  const root = path.resolve(__dirname, '..');
  const today = new Date().toISOString().split('T')[0];
  let properties = [];

  try {
    const result = await supabaseRequest('properties?select=property_id,received_at&status=neq.archived&order=received_at.desc&limit=2000');
    properties = result.data || [];
  } catch (err) {
    console.warn('Could not fetch properties for sitemap, using fallback list:', err.message);
  }

  const staticUrls = [
    { loc: 'https://www.fourland.vn/', priority: '1.0', changefreq: 'daily' },
    { loc: 'https://www.fourland.vn/#q=Nhà+phố', priority: '0.8', changefreq: 'daily' },
    { loc: 'https://www.fourland.vn/#q=Biệt+thự', priority: '0.8', changefreq: 'daily' },
    { loc: 'https://www.fourland.vn/#q=Mặt+tiền', priority: '0.8', changefreq: 'daily' },
    { loc: 'https://www.fourland.vn/#q=Căn+hộ', priority: '0.8', changefreq: 'daily' },
    { loc: 'https://www.fourland.vn/#q=Thuê', priority: '0.8', changefreq: 'daily' }
  ];

  const propUrls = properties.map((p) => ({
    loc: `https://www.fourland.vn/?id=${encodeURIComponent(p.property_id)}`,
    lastmod: p.received_at ? new Date(p.received_at).toISOString().split('T')[0] : today,
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
