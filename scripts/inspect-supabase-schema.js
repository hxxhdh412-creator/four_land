const fs = require("fs");
const path = require("path");

const EXPECTED_TABLES = ["properties", "property_images", "property_inquiries"];

function loadEnvironment() {
  const file = path.join(__dirname, "..", ".env.local");
  const values = {};
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(line => {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.trim().startsWith("#")) {
      values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  });
  return values;
}

function configuration(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(env.SUPABASE_SECRET_KEY || "");
  if (!/^https:\/\/.+\.supabase\.co$/i.test(url) || key.length < 20) {
    throw new Error("Thiếu cấu hình Supabase hợp lệ");
  }
  return { url, key };
}

function headers(config, extra = {}) {
  return {
    apikey: config.key,
    ...(!/^sb_(?:secret|publishable)_/i.test(config.key) ? { Authorization: `Bearer ${config.key}` } : {}),
    ...extra
  };
}

async function readOpenApi(config) {
  const response = await fetch(`${config.url}/rest/v1/`, {
    headers: headers(config, { Accept: "application/openapi+json" }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Không đọc được OpenAPI schema (${response.status})`);
  return response.json();
}

function schemaDefinitions(document) {
  return document.definitions || document.components?.schemas || {};
}

function summarizeTable(definition = {}) {
  const required = new Set(definition.required || []);
  return Object.entries(definition.properties || {}).map(([name, property]) => ({
    name,
    type: property.format || property.type || (property.$ref ? property.$ref.split("/").pop() : "unknown"),
    nullable: !required.has(name),
    default: property.default === undefined ? null : property.default,
    description: String(property.description || "").slice(0, 160) || null
  }));
}

async function exactCount(config, table, query = "") {
  const suffix = query ? `&${query}` : "";
  const response = await fetch(`${config.url}/rest/v1/${table}?select=*&limit=1${suffix}`, {
    headers: headers(config, { Prefer: "count=exact", Range: "0-0" }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Không đếm được ${table} (${response.status})`);
  return Number((response.headers.get("content-range") || "/0").split("/")[1]) || 0;
}

async function statusCounts(config) {
  const response = await fetch(`${config.url}/rest/v1/properties?select=status&limit=10000`, {
    headers: headers(config),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Không đọc được thống kê status (${response.status})`);
  const rows = await response.json();
  const counts = {};
  rows.forEach(row => {
    const status = String(row.status || "(null)");
    counts[status] = (counts[status] || 0) + 1;
  });
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

async function inspect(config) {
  const document = await readOpenApi(config);
  const definitions = schemaDefinitions(document);
  const tables = {};
  for (const table of EXPECTED_TABLES) {
    tables[table] = {
      exists: Boolean(definitions[table]),
      columns: summarizeTable(definitions[table]),
      rowCount: definitions[table] ? await exactCount(config, table) : null
    };
  }
  return {
    ok: true,
    inspectedAt: new Date().toISOString(),
    mode: "read-only",
    tables,
    propertyStatusCounts: definitions.properties ? await statusCounts(config) : {}
  };
}

async function main() {
  const report = await inspect(configuration(loadEnvironment()));
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { configuration, inspect, schemaDefinitions, summarizeTable };
