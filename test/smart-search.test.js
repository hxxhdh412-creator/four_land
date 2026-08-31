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
