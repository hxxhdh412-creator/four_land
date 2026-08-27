const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { propertyIdFromSlug, propertyPath, renderPropertyPage } = require('../server/seo');
const sample = { property_id:'BDS-20260826-ABC123', address:'160/34/13 Phan Huy Ích', ward:'Phường 12', district:'Gò Vấp', price_text:'15tr', raw_text:'Nhà hẻm xe hơi, 3 phòng ngủ.', property_images:[{position:1,public_url:'https://example.com/nha.jpg'}] };
test('property URL is stable and reversible',()=>{const route=propertyPath(sample);assert.match(route,/^\/bat-dong-san\//);assert.equal(propertyIdFromSlug(route.split('/').pop()),sample.property_id)});
test('SSR page contains indexable SEO and content',()=>{const html=renderPropertyPage(sample);assert.match(html,/<link rel="canonical" href="https:\/\/www\.fourland\.vn\/bat-dong-san\//);assert.match(html,/<h1>Đường Phan Huy Ích<\/h1>/);assert.match(html,/application\/ld\+json/);assert.match(html,/og:image/)});
test('sitemap contains no fragments or legacy detail queries',()=>{const xml=fs.readFileSync(path.join(__dirname,'..','sitemap.xml'),'utf8');assert.doesNotMatch(xml,/#q=|\?id=/)});
