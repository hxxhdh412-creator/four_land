const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'admin', 'admin.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'admin', 'admin.js'), 'utf8');

test('CMS shell is noindex and uses Fourland brand assets', () => {
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.match(html, /\/assets\/brand\/fourland-logo\.png/);
  assert.match(css, /Be Vietnam Pro/);
  assert.match(css, /--forest:#283d34/);
  assert.match(css, /--orange:#ef6509/);
});

test('CMS shell exposes loading, auth error and empty states', () => {
  assert.match(html, /id="authGate"/);
  assert.match(html, /id="authError"/);
  assert.match(html, /cms-empty/);
  assert.match(html, /id="cmsContent"/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
});

test('CMS shell authenticates through the versioned me endpoint', () => {
  assert.match(js, /cmsApi\('\/api\/admin\/v1\/me'\)/);
  assert.match(js, /Authorization: `Bearer \$\{cmsState\.accessToken\}`/);
  assert.doesNotMatch(js, /SUPABASE_SECRET_KEY|ADMIN_ACCESS_CODE/);
});

test('CMS preview token is restricted to localhost hostnames', () => {
  assert.match(js, /\['127\.0\.0\.1', 'localhost'\]\.includes\(window\.location\.hostname\)/);
  assert.match(js, /isLocalPreview \? 'fourland-preview-cms'/);
});

test('CMS shell has a mobile layout without a global horizontal scroller', () => {
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /grid-template-columns:repeat\(6,1fr\)/);
  assert.doesNotMatch(css, /width:\s*100vw/);
});

test('CMS shell exposes read-only property list and detail states', () => {
  assert.match(html, /id="propertyFilters"/);
  assert.match(html, /id="propertyMobileFilterToggle"[^>]+aria-controls="propertyAdvancedFilters"/);
  assert.match(html, /id="propertyActiveFilterCount"/);
  assert.match(css, /#propertyAdvancedFilters\.mobile-open/);
  assert.match(js, /function updateMobilePropertyFilters\(\)/);
  assert.match(html, /id="propertyLoading"/);
  assert.match(html, /id="propertyEmpty"/);
  assert.match(html, /id="propertyDetail"/);
  assert.match(html, /id="detailEditForm"/);
  assert.match(html, /Chế độ biên tập hồ sơ/);
  assert.match(js, /\/api\/admin\/v1\/properties\//);
  assert.match(js, /\/update/);
  assert.match(html, /id="reviewQueue"/);
  assert.match(html, /id="reviewLoading"/);
  assert.match(js, /\/api\/admin\/v1\/review-queue/);
  assert.match(html, /id="healthContent"/);
  assert.match(html, /id="healthBlockers"/);
  assert.match(js, /\/api\/admin\/v1\/system\/health/);
});

test('CMS Smart Match exposes a compact mobile decision flow', () => {
  assert.match(html, /class="cms-match-helper"/);
  assert.match(html, /Mẫu tìm kiếm nhanh/);
  assert.match(css, /Smart Match: premium mobile decision flow/);
  assert.match(css, /\.cms-match-quick-chips \.chip-title \{[\s\S]*position: absolute !important/);
  assert.match(css, /\.cms-match-price \{[\s\S]*display: none/);
});

test('CMS property pagination controls have active event listeners and DOM elements', () => {
  assert.match(html, /id="propertyPagination"/);
  assert.match(html, /id="propertyPrev"/);
  assert.match(html, /id="propertyNext"/);
  assert.match(html, /id="propertyPage"/);
  assert.match(js, /byId\('propertyPrev'\)\.addEventListener\('click'/);
  assert.match(js, /byId\('propertyNext'\)\.addEventListener\('click'/);
});

test('CMS property detail modal has mobile-optimized hero, tabs, and sticky bottom bar', () => {
  assert.match(html, /id="detailMobileHero"/);
  assert.match(html, /id="detailMobileTabs"/);
  assert.match(html, /id="detailMobileBottomBar"/);
  assert.match(html, /id="detailMobileActionMenu"/);
  assert.match(html, /id="btnMobileDetailCopy"/);
  assert.match(html, /id="btnMobileDetailCall"/);
  assert.match(css, /\.cms-detail-mobile-hero/);
  assert.match(css, /\.cms-detail-mobile-bottom-bar/);
  assert.match(css, /\.cms-detail-mobile-tabs/);
  assert.match(js, /setMobileDetailTab/);
});
