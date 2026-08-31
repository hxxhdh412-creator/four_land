const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260829080000_cms_core_additive.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const mutationMigration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260829090000_cms_mutation_functions.sql'), 'utf8');

test('CMS core migration is additive and keeps legacy property columns', () => {
  assert.doesNotMatch(migration, /drop\s+(?:table|column)/i);
  assert.doesNotMatch(migration, /delete\s+from/i);
  assert.doesNotMatch(migration, /truncate\s+/i);
  assert.match(migration, /alter table public\.properties[\s\S]*add column if not exists content_status text/i);
  assert.match(migration, /public API continues to use legacy properties\.status/i);
});

test('CMS mutation functions are atomic, versioned and service-role only', () => {
  assert.match(mutationMigration, /for update/i);
  assert.match(mutationMigration, /VERSION_CONFLICT/);
  assert.match(mutationMigration, /insert into public\.audit_logs/i);
  assert.match(mutationMigration, /revoke all on function[\s\S]+authenticated/i);
  assert.match(mutationMigration, /grant execute[\s\S]+service_role/i);
});

test('CMS core migration defines workflow constraints and optimistic versioning', () => {
  assert.match(migration, /properties_content_status_check/i);
  assert.match(migration, /properties_availability_status_check/i);
  assert.match(migration, /properties_quality_status_check/i);
  assert.match(migration, /properties_version_positive_check/i);
  assert.match(migration, /alter column version set not null/i);
});

test('CMS core migration creates individual profiles and append-oriented audit storage', () => {
  assert.match(migration, /create table if not exists public\.profiles/i);
  assert.match(migration, /references auth\.users\(id\)/i);
  assert.match(migration, /create table if not exists public\.audit_logs/i);
  assert.match(migration, /revoke update, delete on table public\.audit_logs from anon, authenticated/i);
  assert.match(migration, /enable row level security/i);
});
