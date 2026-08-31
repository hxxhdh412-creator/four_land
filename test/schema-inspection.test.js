const test = require('node:test');
const assert = require('node:assert/strict');

const { configuration, schemaDefinitions, summarizeTable } = require('../scripts/inspect-supabase-schema');

test('rejects invalid Supabase inspection configuration', () => {
  assert.throws(() => configuration({ SUPABASE_URL: 'http://localhost', SUPABASE_SECRET_KEY: 'short' }));
});

test('summarizes OpenAPI columns without values from database rows', () => {
  const definitions = schemaDefinitions({
    definitions: {
      properties: {
        required: ['property_id'],
        properties: {
          property_id: { type: 'string', description: 'Primary key' },
          price_number: { type: 'number', format: 'double', default: 0 }
        }
      }
    }
  });

  assert.deepEqual(summarizeTable(definitions.properties), [
    { name: 'property_id', type: 'string', nullable: false, default: null, description: 'Primary key' },
    { name: 'price_number', type: 'double', nullable: true, default: 0, description: null }
  ]);
});
