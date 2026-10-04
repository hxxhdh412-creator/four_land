const test = require('node:test');
const assert = require('node:assert/strict');

const {
  matchAndScoreProperty,
  parseNaturalQuery,
  removeVietnameseTones
} = require('../api/_smartSearch');

test('normalizes Vietnamese text for search matching', () => {
  assert.equal(removeVietnameseTones('Đường Nguyễn Văn Đậu'), 'duong nguyen van dau');
});

test('parses an area range without throwing and removes it from free-text tokens', () => {
  const parsed = parseNaturalQuery('nhà Gò Vấp 50-80m2 3 phòng ngủ');

  assert.equal(parsed.filters.district, 'Gò Vấp');
  assert.equal(parsed.filters.bedrooms, 3);
  assert.equal(parsed.filters.minArea, 50);
  assert.equal(parsed.filters.maxArea, 80);
  assert.deepEqual(parsed.tokens, ['nha']);
});

test('parses decimal area ranges written with Vietnamese decimal commas', () => {
  const parsed = parseNaturalQuery('45,5 đến 72,25 m²');

  assert.equal(parsed.filters.minArea, 45.5);
  assert.equal(parsed.filters.maxArea, 72.25);
});

test('filters properties outside the parsed area range', () => {
  const parsed = parseNaturalQuery('50-80m2');
  const matching = { property_id: 'BDS-1', area_number: 65, image_count: 1, status: 'complete' };
  const tooSmall = { property_id: 'BDS-2', area_number: 40, image_count: 1, status: 'complete' };
  const tooLarge = { property_id: 'BDS-3', area_number: 90, image_count: 1, status: 'complete' };

  assert.ok(matchAndScoreProperty(matching, parsed) > 0);
  assert.equal(matchAndScoreProperty(tooSmall, parsed), -1);
  assert.equal(matchAndScoreProperty(tooLarge, parsed), -1);
});


// ---- Bộ lọc giá (ô "Giá từ / Giá đến") ----
const { parsePriceInput } = require('../api/_smartSearch');

test('parsePriceInput hiểu cách nhập phổ biến của người dùng', () => {
  assert.equal(parsePriceInput('15'), 15000000, 'số trần < 1000 = triệu');
  assert.equal(parsePriceInput('15tr'), 15000000);
  assert.equal(parsePriceInput('15 triệu'), 15000000);
  assert.equal(parsePriceInput('15,5'), 15500000);
  assert.equal(parsePriceInput('1.5 tỷ'), 1500000000);
  assert.equal(parsePriceInput('2ty'), 2000000000);
  assert.equal(parsePriceInput('500k'), 500000);
  assert.equal(parsePriceInput('15.000.000'), 15000000);
  assert.equal(parsePriceInput('15000000'), 15000000);
  assert.equal(parsePriceInput('15000'), 15000000, '1.000–999.999 = nghìn');
  assert.equal(parsePriceInput(15000000), 15000000);
  for (const bad of ['', '  ', 'abc', 'liên hệ', '0', null, undefined]) assert.equal(parsePriceInput(bad), null, String(bad));
});

test('lọc giá 15–20 triệu: đúng khoảng, loại tin không có giá VNĐ', () => {
  const nlp = parseNaturalQuery('');
  const rows = {
    inRange: { price_number: 18000000 },
    low: { price_number: 12000000 },
    high: { price_number: 25000000 },
    contact: { price_number: null, price_text: 'Liên hệ' },
    usd: { price_number: 15, price_text: '15.000$' }
  };
  for (const [min, max] of [['15', '20'], ['15tr', '20tr'], ['15.000.000', '20.000.000'], ['15000000', '20000000']]) {
    const pass = Object.entries(rows).filter(([, r]) => matchAndScoreProperty(r, nlp, { minPrice: min, maxPrice: max }) > 0).map(([k]) => k);
    assert.deepEqual(pass, ['inRange'], `${min} -> ${max}`);
  }
  const onlyMax = Object.entries(rows).filter(([, r]) => matchAndScoreProperty(r, nlp, { maxPrice: '20' }) > 0).map(([k]) => k);
  assert.deepEqual(onlyMax, ['inRange', 'low']);
  const noFilter = Object.entries(rows).filter(([, r]) => matchAndScoreProperty(r, nlp, {}) > 0).map(([k]) => k);
  assert.equal(noFilter.length, 5, 'không lọc giá thì vẫn hiện tin Liên hệ / USD');
});