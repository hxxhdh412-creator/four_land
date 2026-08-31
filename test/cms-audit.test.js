const test = require('node:test');
const assert = require('node:assert/strict');

const { changedFields, createAuditEvent, sanitize } = require('../server/cms-audit');

test('audit sanitizer recursively redacts secrets and credentials', () => {
  const safe = sanitize({ address: 'Đường A', authorization: 'Bearer abc', nested: { apiKey: 'key', note: 'ok' } });
  assert.deepEqual(safe, { address: 'Đường A', authorization: '[REDACTED]', nested: { apiKey: '[REDACTED]', note: 'ok' } });
});

test('audit changed fields are stable and include additions and removals', () => {
  assert.deepEqual(changedFields({ address: 'A', price: 10, removed: true }, { address: 'B', price: 10, added: true }), ['added', 'address', 'removed']);
});

test('creates database-shaped audit event without a timestamp invented by the client', () => {
  const event = createAuditEvent({
    actorId: 'user-1',
    action: 'property.publish',
    entityType: 'property',
    entityId: 'BDS-1',
    beforeData: { content_status: 'pending_review', sessionToken: 'secret' },
    afterData: { content_status: 'published', sessionToken: 'secret-2' },
    requestId: 'req-1'
  });
  assert.deepEqual(event.changed_fields, ['content_status']);
  assert.equal(event.before_data.sessionToken, '[REDACTED]');
  assert.equal(event.after_data.sessionToken, '[REDACTED]');
  assert.equal(event.created_at, undefined);
  assert.equal(event.source, 'cms');
});

test('rejects incomplete audit events', () => {
  assert.throws(() => createAuditEvent({ action: 'property.edit' }), error => error.code === 'AUDIT_EVENT_INVALID');
});
