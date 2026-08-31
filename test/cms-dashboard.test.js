const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('../api/cms-dashboard');
const { ACTIONS } = require('../server/cms-authorization');
const { buildDashboardSummary } = require('../server/cms-dashboard');

function responseRecorder() {
  return { statusCode: 200, headers: {}, body: null, status(code) { this.statusCode = code; return this; }, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, json(body) { this.body = body; return this; } };
}

test('builds dashboard counts from legacy properties without PII', () => {
  const now = new Date('2026-08-29T12:00:00+07:00');
  const summary = buildDashboardSummary([
    { status: 'partial', address: 'A', price_text: '10 triệu', image_count: 2, received_at: '2026-08-29T08:00:00+07:00' },
    { status: 'featured', address: '', price_text: '20 triệu', image_count: 0, received_at: '2026-08-28T08:00:00+07:00' },
    { status: 'rented', address: 'C', price_text: '', image_count: 1, data_json: { is_rented: true } },
    { status: 'archived', address: 'D', price_text: '30 triệu', image_count: 3 }
  ], now);
  assert.deepEqual(summary, { total: 4, published: 3, pendingReview: 0, missingData: 2, available: 2, archived: 1, receivedToday: 1, withoutImages: 1, schemaMode: 'legacy' });
  assert.doesNotMatch(JSON.stringify(summary), /10 triệu|address|phone/);
});

test('uses CMS workflow columns when present', () => {
  const summary = buildDashboardSummary([
    { status: 'partial', content_status: 'pending_review', availability_status: 'available', address: 'A', price_text: '1', image_count: 2 },
    { status: 'partial', content_status: 'published', availability_status: 'rented', address: 'B', price_text: '2', image_count: 2 }
  ]);
  assert.equal(summary.pendingReview, 1);
  assert.equal(summary.published, 1);
  assert.equal(summary.available, 1);
  assert.equal(summary.schemaMode, 'cms');
});

test('dashboard endpoint requires dashboard permission and returns aggregate only', async () => {
  let action;
  const handler = createHandler({
    requireCmsImpl: async (_req, _res, requestedAction) => { action = requestedAction; return { id: 'u1', role: 'viewer', isActive: true }; },
    listProperties: async () => [{ status: 'partial', address: 'A', price_text: '1', image_count: 2, phone: '0900000000' }]
  });
  const res = responseRecorder();
  await handler({ method: 'GET' }, res);
  assert.equal(action, ACTIONS.DASHBOARD_READ);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.equal(res.body.data.summary.published, 1);
  assert.doesNotMatch(JSON.stringify(res.body), /0900000000|phone/);
});

test('dashboard endpoint rejects non-GET methods', async () => {
  const res = responseRecorder();
  await createHandler()({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
});
