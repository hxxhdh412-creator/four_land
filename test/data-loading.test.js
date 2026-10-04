const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { toCardRow, pickCoverImage } = require('../api/_cardRow');

test('toCardRow keeps card fields, slims data_json and keeps only the first valid image', () => {
  const row = {
    property_id: 'BDS-1',
    address: '12 Nguyễn Trãi',
    price_text: '15 triệu',
    price_number: 15000000,
    image_count: 3,
    is_featured: true,
    data_json: {
      raw_text: 'x'.repeat(5000),
      view_count: 12,
      property: { bedrooms: '3 PN', area: '60 m²', dimensions: '4x15', notes: 'dài', legal: 'Sổ hồng' }
    },
    property_images: [
      { position: 3, public_url: 'https://drive.google.com/thumbnail?id=c' },
      { position: 1, public_url: '' },
      { position: 2, public_url: 'https://drive.google.com/thumbnail?id=b' }
    ]
  };
  const card = toCardRow(row);
  assert.equal(card.property_id, 'BDS-1');
  assert.equal(card.price_number, 15000000);
  assert.equal(card.image_count, 3);
  assert.equal(card.is_featured, true);
  assert.deepEqual(card.data_json, { property: { bedrooms: '3 PN', area: '60 m²', dimensions: '4x15' } });
  assert.deepEqual(card.property_images, [{ position: 2, public_url: 'https://drive.google.com/thumbnail?id=b' }]);
  assert.ok(JSON.stringify(card).length < JSON.stringify(row).length / 3);
});

test('toCardRow handles missing data_json and images safely', () => {
  const card = toCardRow({ property_id: 'BDS-2', data_json: null });
  assert.equal(card.data_json, null);
  assert.deepEqual(card.property_images, []);
  assert.deepEqual(pickCoverImage([{ position: 1, public_url: 'hidden:abc' }]), []);
  assert.equal(toCardRow(null), null);
});

test('public listing no longer busts CDN cache and uses responsive card images', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /api\('\/api\/facets\?t='/);
  assert.match(app, /_t:state\.adminUnlocked\?Date\.now\(\):''/);
  assert.match(app, /function cardImageAttrs\(/);
  assert.match(app, /prefetch=1&id=/);
  assert.match(app, /new AbortController\(\)/);
});

test('detail API skips view counting for prefetch requests', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'property.js'), 'utf8');
  assert.match(source, /req\.query\.prefetch === "1"/);
  assert.match(source, /Promise\.all\(\[viewTask, similarTask\]\)/);
});
