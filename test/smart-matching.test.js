const test = require('node:test');
const assert = require('node:assert/strict');
const { scorePropertyMatch, generateCustomerPitch, rankPropertiesForLead } = require('../server/smart-matcher');
const { createHandler } = require('../api/_cms-smart-match');

const sampleProperties = [
  {
    property_id: 'BDS-TEST-001',
    address: '120 Nguyễn Hồng Đào, Phường 14, Quận Tân Bình',
    district: 'Tân Bình',
    ward: 'Phường 14',
    property_type: 'Mặt bằng',
    price_text: '18 triệu',
    price_number: 18000000,
    area_text: '4x20',
    dimensions: '4x20',
    bedrooms: 0,
    bathrooms: 1,
    structure: 'Trệt trống suốt',
    image_count: 5,
    status: 'ready'
  },
  {
    property_id: 'BDS-TEST-002',
    address: '45 Lê Văn Sỹ, Phường 13, Quận 3',
    district: 'Quận 3',
    ward: 'Phường 13',
    property_type: 'Nhà phố',
    price_text: '14 tỷ',
    price_number: 14000000000,
    area_text: '5x18',
    dimensions: '5x18',
    bedrooms: 4,
    bathrooms: 4,
    structure: 'Trệt 3 lầu',
    image_count: 4,
    status: 'ready'
  },
  {
    property_id: 'BDS-TEST-003',
    address: '88 Quang Trung, Phường 10, Gò Vấp',
    district: 'Gò Vấp',
    ward: 'Phường 10',
    property_type: 'Nhà thuê',
    price_text: '12 triệu',
    price_number: 12000000,
    area_text: '60m2',
    bedrooms: 3,
    bathrooms: 2,
    structure: 'Trệt 1 lầu',
    image_count: 2,
    status: 'ready'
  }
];

test('scorePropertyMatch scores high for exact district, price range and dimensions match', () => {
  const criteria = {
    district: 'Tân Bình',
    minPrice: 15000000,
    maxPrice: 20000000,
    propertyType: 'Mặt bằng',
    minArea: 70
  };

  const result = scorePropertyMatch(sampleProperties[0], criteria);
  assert.ok(result.matchScore >= 85, `Expected high match score >= 85, got ${result.matchScore}`);
  assert.equal(result.isTopMatch, true);
  assert.ok(result.reasons.some(r => r.pass && r.label.includes('Tân Bình')));
  assert.ok(result.reasons.some(r => r.pass && r.label.includes('ngân sách')));
});

test('scorePropertyMatch awards neighbor district points when exact match is not found', () => {
  const criteria = {
    district: 'Phú Nhuận', // Neighbor to Tân Bình
    minPrice: 15000000,
    maxPrice: 20000000
  };

  const result = scorePropertyMatch(sampleProperties[0], criteria);
  assert.ok(result.matchScore >= 50, `Expected moderate match score for neighbor district, got ${result.matchScore}`);
  assert.ok(result.reasons.some(r => r.pass && r.label.includes('lân cận')));
});

test('generateCustomerPitch produces clean customer-facing pitch text', () => {
  const pitch = generateCustomerPitch(sampleProperties[0], {
    agentName: 'Lê Tư Vấn',
    agentPhone: '0909123456'
  });

  assert.match(pitch, /\[FOURLAND\]/);
  assert.match(pitch, /120 Nguyễn Hồng Đào/);
  assert.match(pitch, /18 triệu/);
  assert.match(pitch, /Lê Tư Vấn - 0909123456/);
  assert.doesNotMatch(pitch, /BDS-TEST-001/);
});

test('rankPropertiesForLead orders properties by highest match score first', () => {
  const criteria = {
    district: 'Tân Bình',
    minPrice: 15000000,
    maxPrice: 20000000
  };

  const ranked = rankPropertiesForLead(sampleProperties, criteria);
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].property_id, 'BDS-TEST-001');
  assert.ok(ranked[0].matchScore >= (ranked[1]?.matchScore || 0));
  assert.ok(ranked[0].pitchText.length > 0);
});

test('smart match API handler filters and ranks properties securely', async () => {
  const handler = createHandler({
    requireCmsImpl: async () => ({ id: 'u1', role: 'sales' }),
    request: async () => ({ data: sampleProperties })
  });

  let responseStatus = 0;
  let responseData = null;
  const mockRes = {
    status(s) { responseStatus = s; return this; },
    json(d) { responseData = d; return this; }
  };

  const mockReq = {
    method: 'POST',
    body: {
      query: 'Thuê mặt bằng Tân Bình 15-20 triệu 4x20'
    }
  };

  await handler(mockReq, mockRes);
  assert.equal(responseStatus, 200);
  assert.equal(responseData.ok, true);
  assert.ok(responseData.data.items.length > 0);
  assert.equal(responseData.data.items[0].id, 'BDS-TEST-001');
  assert.ok(responseData.data.items[0].matchScore >= 80);
  assert.equal(responseData.data.criteriaUsed.district, 'Tân Bình');
  assert.equal(responseData.data.criteriaUsed.minPrice, 15000000);
  assert.equal(responseData.data.criteriaUsed.maxPrice, 20000000);
});
