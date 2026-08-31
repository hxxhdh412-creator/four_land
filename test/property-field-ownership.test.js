const test = require('node:test');
const assert = require('node:assert/strict');

const {
  markOverrideFields,
  mergeDataJson,
  mergeSourceProperty,
  overrideFields
} = require('../server/property-field-ownership');

test('marks edited CMS fields without discarding existing JSON metadata', () => {
  const result = markOverrideFields(
    { view_count: 12, cms_override_fields: ['address'] },
    ['price_text', 'status', 'address']
  );

  assert.deepEqual(result, {
    view_count: 12,
    cms_override_fields: ['address', 'price_text']
  });
});

test('accepts only known CMS override fields', () => {
  const fields = overrideFields({
    data_json: { cms_override_fields: ['address', 'price_text', 'status', 'unknown', 'address'] }
  });

  assert.deepEqual(fields, ['address', 'price_text']);
});

test('preserves CMS-owned JSON metadata while refreshing source JSON', () => {
  const merged = mergeDataJson(
    { source: { receivedAt: 'new' }, view_count: 1 },
    { view_count: 27, is_featured: true, cms: { editedBy: 'user-1' } }
  );

  assert.deepEqual(merged, {
    source: { receivedAt: 'new' },
    view_count: 27,
    is_featured: true,
    cms: { editedBy: 'user-1' }
  });
});

test('keeps overridden fields and legacy admin status during source sync', () => {
  const merged = mergeSourceProperty(
    {
      property_id: 'BDS-1',
      status: 'partial',
      address: 'Địa chỉ từ Sheet',
      price_text: '20 triệu',
      ward: 'Phường nguồn',
      data_json: { source: { receivedAt: 'new' } }
    },
    {
      property_id: 'BDS-1',
      status: 'featured',
      address: 'Địa chỉ đã duyệt',
      price_text: '18 triệu',
      ward: 'Phường cũ',
      data_json: { cms_override_fields: ['address', 'price_text'], view_count: 9 }
    }
  );

  assert.equal(merged.status, 'featured');
  assert.equal(merged.address, 'Địa chỉ đã duyệt');
  assert.equal(merged.price_text, '18 triệu');
  assert.equal(merged.ward, 'Phường nguồn');
  assert.equal(merged.data_json.view_count, 9);
  assert.deepEqual(merged.data_json.cms_override_fields, ['address', 'price_text']);
});

test('allows source status to refresh when existing status is source-owned', () => {
  const merged = mergeSourceProperty(
    { property_id: 'BDS-1', status: 'complete', data_json: {} },
    { property_id: 'BDS-1', status: 'partial', data_json: {} }
  );

  assert.equal(merged.status, 'complete');
});
