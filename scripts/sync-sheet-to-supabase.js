const fs = require("fs");
const path = require("path");

function loadEnvironment() {
  const file = path.join(__dirname, "..", ".env.local");
  const values = {};
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(line => {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.trim().startsWith("#")) values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  });
  return values;
}

function parseCsv(text) {
  const rows = []; let row = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ""; }
    else if (char === '\n') { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

const normalizedHeader = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const emptyToNull = value => { const result = String(value == null ? "" : value).trim(); return result || null; };
const numberOrNull = value => { if (value == null || value === "") return null; const result = Number(String(value).replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".")); return Number.isFinite(result) ? result : null; };
const integerOrNull = value => { const result = numberOrNull(value); return result == null ? null : Math.round(result); };
const parseJson = value => { try { const parsed = JSON.parse(String(value || "")); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; } };
const isoDate = value => { const parsed = new Date(String(value || "").replace(" ", "T")); return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(); };

async function request(config, route, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${config.url}/rest/v1/${route}`, {
    method,
    headers: {
      apikey: config.key,
      "User-Agent": "fourland-sheet-relay/1.0",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${responseText.slice(0, 500)}`);
  return responseText ? JSON.parse(responseText) : null;
}

async function main() {
  const env = loadEnvironment();
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.GOOGLE_SHEET_ID) throw new Error("Thiếu cấu hình đồng bộ");
  const exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(env.GOOGLE_SHEET_ID)}/export?format=csv&gid=${encodeURIComponent(env.GOOGLE_SHEET_GID || "0")}`;
  const csvResponse = await fetch(exportUrl, { headers: { "User-Agent": "fourland-sheet-relay/1.0" } });
  if (!csvResponse.ok) throw new Error(`Không tải được Google Sheet (${csvResponse.status})`);
  const rows = parseCsv(await csvResponse.text());
  if (rows.length < 2) throw new Error("Google Sheet chưa có dữ liệu");
  const headers = {}; rows[0].forEach((header, index) => headers[normalizedHeader(header)] = index);
  const get = (row, name) => { const index = headers[normalizedHeader(name)]; return index == null ? "" : String(row[index] || "").trim(); };
  const properties = [], images = [];
  for (const row of rows.slice(1)) {
    const propertyId = get(row, "PropertyId"); if (!propertyId) continue;
    const record = parseJson(get(row, "Data JSON")), property = record.property || {}, source = record.source || {};
    properties.push({
      property_id: propertyId, send_id: emptyToNull(get(row, "SendId")), status: get(row, "Status") || "raw",
      account_id: emptyToNull(source.accountId), group_id: emptyToNull(get(row, "GroupId")), group_name: emptyToNull(get(row, "GroupName")),
      sender_id: emptyToNull(get(row, "SenderId")), sender_name: emptyToNull(get(row, "SenderName")), phone: emptyToNull(get(row, "Phone")),
      property_type: emptyToNull(get(row, "PropertyType")), address: emptyToNull(get(row, "Address")), district: emptyToNull(get(row, "District")),
      ward: emptyToNull(get(row, "Ward")), street: emptyToNull(get(row, "Street")), area_text: emptyToNull(get(row, "Area")),
      area_number: numberOrNull(get(row, "AreaNumber")), dimensions: emptyToNull(property.dimensions), bedrooms: integerOrNull(get(row, "Bedrooms")),
      bathrooms: integerOrNull(get(row, "Bathrooms")), structure: emptyToNull(get(row, "Structure")), price_text: emptyToNull(get(row, "Price")),
      price_number: numberOrNull(String(get(row, "PriceNumber")).replace(/[^0-9.,-]/g, "")), legal: emptyToNull(get(row, "Legal")),
      commission: emptyToNull(property.commission), notes: emptyToNull(get(row, "Notes")), raw_text: emptyToNull(get(row, "RawText")),
      normalized_text: emptyToNull(get(row, "NormalizedText")), image_count: Number(get(row, "ImageCount") || 0),
      received_at: source.receivedAt ? isoDate(source.receivedAt) : isoDate(get(row, "CreatedAt")), updated_at: new Date().toISOString(), data_json: record
    });
    let rowImages = parseJson(get(row, "Images JSON"));
    if (!Array.isArray(rowImages) || !rowImages.length) rowImages = record.media?.images || [];
    rowImages.forEach((image, index) => {
      const url = String(image.url || image.sourceUrl || "");
      images.push({ property_id: propertyId, position: Number(image.position || index + 1), storage_path: image.fileId ? `drive:${image.fileId}` : `external:${propertyId}:${index + 1}`, public_url: url || null, source_url: url || null });
    });
  }
  const uniqueProperties = [...new Map(properties.map(item => [item.property_id, item])).values()];
  const seenSendIds = new Set();
  uniqueProperties.forEach(item => { if (item.send_id && seenSendIds.has(item.send_id)) item.send_id = null; else if (item.send_id) seenSendIds.add(item.send_id); });
  const uniqueImages = [...new Map(images.map(item => [`${item.property_id}:${item.position}`, item])).values()];
  if (process.argv.includes("--dry-run")) return console.log(JSON.stringify({ ok: true, sheetRows: rows.length - 1, properties: uniqueProperties.length, duplicateProperties: properties.length - uniqueProperties.length, images: uniqueImages.length, duplicateImages: images.length - uniqueImages.length, mode: "dry-run" }));
  const config = { url: env.SUPABASE_URL.replace(/\/+$/, ""), key: env.SUPABASE_SECRET_KEY };
  for (let offset = 0; offset < uniqueProperties.length; offset += 100) await request(config, "properties?on_conflict=property_id", { method: "POST", body: uniqueProperties.slice(offset, offset + 100), prefer: "resolution=merge-duplicates,return=minimal" });
  for (let offset = 0; offset < uniqueImages.length; offset += 100) await request(config, "property_images?on_conflict=property_id,position", { method: "POST", body: uniqueImages.slice(offset, offset + 100), prefer: "resolution=merge-duplicates,return=minimal" });
  console.log(JSON.stringify({ ok: true, synced: uniqueProperties.length, skippedDuplicateProperties: properties.length - uniqueProperties.length, images: uniqueImages.length }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
