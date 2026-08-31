const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDiffReport, parseCsv, recordParts } = require('../scripts/sync-sheet-to-supabase');

test('reads property and source metadata from the Data JSON column', () => {
  const parts = recordParts(JSON.stringify({
    property: { dimensions: '4 x 16', commission: '1 tháng' },
    source: { accountId: 'zalo-1', receivedAt: '2026-08-29T08:00:00.000Z' },
    media: { images: [{ url: 'https://example.com/1.jpg' }] }
  }));

  assert.equal(parts.property.dimensions, '4 x 16');
  assert.equal(parts.property.commission, '1 tháng');
  assert.equal(parts.source.accountId, 'zalo-1');
  assert.equal(parts.record.media.images.length, 1);
});

test('uses safe empty objects when Data JSON is missing or invalid', () => {
  assert.deepEqual(recordParts('not-json'), { record: {}, property: {}, source: {} });
  assert.deepEqual(recordParts(''), { record: {}, property: {}, source: {} });
});

test('parses quoted CSV cells used by the Sheet relay', () => {
  const rows = parseCsv('PropertyId,RawText\r\nBDS-1,"Nhà đẹp, 2 phòng"\r\n');

  assert.deepEqual(rows, [
    ['PropertyId', 'RawText'],
    ['BDS-1', 'Nhà đẹp, 2 phòng']
  ]);
});

test('builds an aggregate diff without exposing property identifiers', () => {
  const report = buildDiffReport(
    [
      { property_id: 'SOURCE-ONLY', status: 'partial' },
      { property_id: 'COMMON', status: 'partial', address: 'A', image_count: 2 }
    ],
    [
      { property_id: 'SOURCE-ONLY', position: 1 },
      { property_id: 'COMMON', position: 1 }
    ],
    [
      { property_id: 'PRODUCTION-ONLY', status: 'ready' },
      { property_id: 'COMMON', status: 'featured', address: 'B', image_count: 2 }
    ],
    [
      { property_id: 'PRODUCTION-ONLY', position: 1, storage_path: 'drive:1' },
      { property_id: 'COMMON', position: 1, storage_path: 'drive:2' },
      { property_id: 'COMMON', position: 2, storage_path: 'hidden:old' }
    ],
    ['PRODUCTION-ONLY', 'NOT-IN-PRODUCTION']
  );

  assert.deepEqual(report, {
    mode: 'read-only-diff',
    properties: {
      source: 2,
      production: 2,
      common: 1,
      sourceOnly: 1,
      productionOnly: 1,
      statusMismatches: 1,
      duplicateDeletionCandidatesInProduction: 1,
      fieldMismatchCounts: { status: 1, address: 1, district: 0, ward: 0, street: 0, price_text: 0, area_text: 0, phone: 0, image_count: 0 }
    },
    images: { source: 2, productionVisible: 2, productionHiddenTombstones: 1, common: 1, sourceOnly: 1, productionOnly: 1 }
  });
  assert.doesNotMatch(JSON.stringify(report), /SOURCE-ONLY|PRODUCTION-ONLY|COMMON/);
});
