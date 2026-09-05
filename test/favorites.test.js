const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('index.html contains all essential favorites DOM nodes', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  
  assert.ok(html.includes('id="tabFavorites"'), 'Must have tab #tabFavorites');
  assert.ok(html.includes('id="favCountBadge"'), 'Must have tab badge #favCountBadge');
  assert.ok(html.includes('id="favBanner"'), 'Must have lead-gen banner container #favBanner');
});

test('app.js declares favoriteStore and handles IDs properly', () => {
  const js = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');
  
  assert.ok(js.includes('FAVORITES_KEY'), 'Must declare FAVORITES_KEY');
  assert.ok(js.includes('favoriteStore'), 'Must define favoriteStore object');
  assert.ok(js.includes('updateFavoritesUI'), 'Must define updateFavoritesUI');
  assert.ok(js.includes('updateFavoritesBanner'), 'Must define updateFavoritesBanner');
  assert.ok(js.includes('card-favorite-btn'), 'Must render card-favorite-btn on property cards');
  assert.ok(js.includes('data-fav-id'), 'Must attach data-fav-id');
});

test('app.css contains favorites animations and styling', () => {
  const css = fs.readFileSync(path.join(__dirname, '../assets/app.css'), 'utf8');
  
  assert.ok(css.includes('.card-favorite-btn'), 'Must have .card-favorite-btn CSS');
  assert.ok(css.includes('.tab-favorites'), 'Must have .tab-favorites CSS');
  assert.ok(css.includes('.fav-action-banner'), 'Must have .fav-action-banner CSS');
  assert.ok(css.includes('@keyframes heartPop'), 'Must have heartPop keyframes animation');
  assert.ok(css.includes('.empty-favorites'), 'Must have .empty-favorites empty state');
});
