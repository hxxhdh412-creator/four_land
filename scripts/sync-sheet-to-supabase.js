const fs = require("fs");
const path = require("path");
const { mergeSourceProperty } = require("../server/property-field-ownership");

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

function recordParts(value) {
  const record = parseJson(value);
  return {
    record,
    property: record.property && typeof record.property === "object" ? record.property : {},
    source: record.source && typeof record.source === "object" ? record.source : {}
  };
}

function buildDiffReport(sourceProperties, sourceImages, productionProperties, productionImages, duplicatePropertyIds = []) {
  const sourcePropertyIds = new Set(sourceProperties.map(item => item.property_id));
  const productionPropertyIds = new Set(productionProperties.map(item => item.property_id));
  const commonPropertyIds = new Set([...sourcePropertyIds].filter(id => productionPropertyIds.has(id)));
  const sourceImageKeys = new Set(sourceImages.map(item => `${item.property_id}:${item.position}`));
  const visibleProductionImages = productionImages.filter(item => !String(item.storage_path || "").startsWith("hidden:"));
  const hiddenProductionImages = productionImages.filter(item => String(item.storage_path || "").startsWith("hidden:"));
  const visibleProductionImageKeys = new Set(visibleProductionImages.map(item => `${item.property_id}:${item.position}`));
  const commonImageKeys = [...sourceImageKeys].filter(key => visibleProductionImageKeys.has(key));
  const sourceStatusById = new Map(sourceProperties.map(item => [item.property_id, String(item.status || "(null)")]));
  const productionStatusById = new Map(productionProperties.map(item => [item.property_id, String(item.status || "(null)")]));
  const statusMismatches = [...commonPropertyIds].filter(id => sourceStatusById.get(id) !== productionStatusById.get(id));
  const sourceById = new Map(sourceProperties.map(item => [item.property_id, item]));
  const productionById = new Map(productionProperties.map(item => [item.property_id, item]));
  const comparedFields = ["status", "address", "district", "ward", "street", "price_text", "area_text", "phone", "image_count"];
  const fieldMismatchCounts = Object.fromEntries(comparedFields.map(field => [field, [...commonPropertyIds].filter(id => {
    const sourceValue = sourceById.get(id)?.[field];
    const productionValue = productionById.get(id)?.[field];
    return String(sourceValue ?? "") !== String(productionValue ?? "");
  }).length]));

  return {
    mode: "read-only-diff",
    properties: {
      source: sourcePropertyIds.size,
      production: productionPropertyIds.size,
      common: commonPropertyIds.size,
      sourceOnly: [...sourcePropertyIds].filter(id => !productionPropertyIds.has(id)).length,
      productionOnly: [...productionPropertyIds].filter(id => !sourcePropertyIds.has(id)).length,
      statusMismatches: statusMismatches.length,
      duplicateDeletionCandidatesInProduction: [...duplicatePropertyIds].filter(id => productionPropertyIds.has(id)).length,
      fieldMismatchCounts
    },
    images: {
      source: sourceImageKeys.size,
      productionVisible: visibleProductionImageKeys.size,
      productionHiddenTombstones: hiddenProductionImages.length,
      common: commonImageKeys.length,
      sourceOnly: [...sourceImageKeys].filter(key => !visibleProductionImageKeys.has(key)).length,
      productionOnly: [...visibleProductionImageKeys].filter(key => !sourceImageKeys.has(key)).length
    }
  };
}

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
    const { record, property, source } = recordParts(get(row, "Data JSON"));
    const raw = String(get(row, "RawText") || "").trim();
    const addressVal = String(get(row, "Address") || "").trim();
    if (raw.startsWith("Tin nhắn thử nghiệm") || raw === "||||||||||||" || raw === "1") continue;
    if (!addressVal && raw.length < 15) continue;
    if (addressVal === "2026 trống" || addressVal === "2PN view sông" || addressVal === "1 ngày" || addressVal === "2 phòng ngủ 2 wc") continue;
    let rowImages = parseJson(get(row, "Images JSON"));
    if (!Array.isArray(rowImages) || !rowImages.length) rowImages = record.media?.images || [];
    const validImages = rowImages.filter(i => String(i.url || i.sourceUrl || "").trim());
    if (validImages.length < 2) continue; // Chỉ nhận hồ sơ có từ 2 ảnh trở lên

    properties.push({
      property_id: propertyId, send_id: emptyToNull(get(row, "SendId")), status: get(row, "Status") || "raw",
      account_id: emptyToNull(source.accountId), group_id: emptyToNull(get(row, "GroupId")), group_name: emptyToNull(get(row, "GroupName")),
      sender_id: emptyToNull(get(row, "SenderId")), sender_name: emptyToNull(get(row, "SenderName")), phone: emptyToNull(get(row, "Phone")),
      property_type: emptyToNull(get(row, "PropertyType")) || "Nhà thuê", address: emptyToNull(get(row, "Address")), district: emptyToNull(get(row, "District")),
      ward: emptyToNull(get(row, "Ward")), street: emptyToNull(get(row, "Street")), area_text: emptyToNull(get(row, "Area")),
      area_number: numberOrNull(get(row, "AreaNumber")), dimensions: emptyToNull(property.dimensions), bedrooms: integerOrNull(get(row, "Bedrooms")),
      bathrooms: integerOrNull(get(row, "Bathrooms")), structure: emptyToNull(get(row, "Structure")), price_text: emptyToNull(get(row, "Price")),
      price_number: numberOrNull(String(get(row, "PriceNumber")).replace(/[^0-9.,-]/g, "")), legal: emptyToNull(get(row, "Legal")),
      commission: emptyToNull(property.commission), notes: emptyToNull(get(row, "Notes")), raw_text: emptyToNull(get(row, "RawText")),
      normalized_text: emptyToNull(get(row, "NormalizedText")), image_count: validImages.length,
      received_at: source.receivedAt ? isoDate(source.receivedAt) : isoDate(get(row, "CreatedAt")), updated_at: new Date().toISOString(), data_json: record
    });
    validImages.forEach((image, index) => {
      const url = String(image.url || image.sourceUrl || "");
      images.push({ property_id: propertyId, position: Number(image.position || index + 1), storage_path: image.fileId ? `drive:${image.fileId}` : `external:${propertyId}:${index + 1}`, public_url: url || null, source_url: url || null });
    });
  }
  const normAddress = addr => {
    if (!addr) return '';
    return String(addr).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Group properties by normalized address to eliminate duplicates
  const initialProperties = [...new Map(properties.map(item => [item.property_id, item])).values()];
  const addressGroups = new Map();
  const duplicateIdsToDelete = new Set();

  initialProperties.forEach(prop => {
    const key = normAddress(prop.address);
    if (key && key.length >= 4) {
      if (!addressGroups.has(key)) addressGroups.set(key, []);
      addressGroups.get(key).push(prop);
    }
  });

  const propertyIdRemap = new Map();
  const finalPropertiesMap = new Map();

  initialProperties.forEach(prop => {
    const key = normAddress(prop.address);
    if (!key || key.length < 4) {
      finalPropertiesMap.set(prop.property_id, prop);
      return;
    }
    const group = addressGroups.get(key);
    if (group.length === 1) {
      finalPropertiesMap.set(prop.property_id, prop);
      return;
    }
    // Sort group: prioritize properties with images, then newest date
    group.sort((a, b) => {
      const imgDiff = Number(b.image_count || 0) - Number(a.image_count || 0);
      if (imgDiff !== 0) return imgDiff;
      return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
    });
    const winner = group[0];
    finalPropertiesMap.set(winner.property_id, winner);
    group.slice(1).forEach(loser => {
      propertyIdRemap.set(loser.property_id, winner.property_id);
      duplicateIdsToDelete.add(loser.property_id);
    });
  });

  let uniqueProperties = [...finalPropertiesMap.values()];
  const seenSendIds = new Set();
  uniqueProperties.forEach(item => { if (item.send_id && seenSendIds.has(item.send_id)) item.send_id = null; else if (item.send_id) seenSendIds.add(item.send_id); });

  // Remap image property_ids from duplicates to the preserved property
  const remappedImages = images.map(img => {
    const targetId = propertyIdRemap.get(img.property_id) || img.property_id;
    return { ...img, property_id: targetId };
  });

  // Re-index image positions per property
  const imagesByProp = new Map();
  remappedImages.forEach(img => {
    if (!img.public_url && !img.source_url) return;
    if (!imagesByProp.has(img.property_id)) imagesByProp.set(img.property_id, []);
    const list = imagesByProp.get(img.property_id);
    // Deduplicate identical URLs within the same property
    if (!list.some(existing => (existing.public_url === img.public_url || existing.source_url === img.source_url))) {
      list.push(img);
    }
  });

  const uniqueImages = [];
  imagesByProp.forEach((list, propId) => {
    list.forEach((img, idx) => {
      uniqueImages.push({
        property_id: propId,
        position: idx + 1,
        storage_path: img.storage_path || `external:${propId}:${idx + 1}`,
        public_url: img.public_url,
        source_url: img.source_url
      });
    });
  });

  if (process.argv.includes("--dry-run")) return console.log(JSON.stringify({
    ok: true,
    sheetRows: rows.length - 1,
    properties: uniqueProperties.length,
    duplicatePropertiesRemoved: properties.length - uniqueProperties.length,
    duplicateIdsCount: duplicateIdsToDelete.size,
    images: uniqueImages.length,
    mode: "dry-run"
  }));

  const config = { url: env.SUPABASE_URL.replace(/\/+$/, ""), key: env.SUPABASE_SECRET_KEY };

  if (process.argv.includes("--diff")) {
    const productionProperties = await request(config, "properties?select=property_id,status,address,district,ward,street,price_text,area_text,phone,image_count&limit=10000");
    const productionImages = await request(config, "property_images?select=property_id,position,storage_path&limit=10000");
    return console.log(JSON.stringify({
      ok: true,
      sheetRows: rows.length - 1,
      duplicatePropertiesRemoved: properties.length - uniqueProperties.length,
      duplicateIdsCount: duplicateIdsToDelete.size,
      ...buildDiffReport(uniqueProperties, uniqueImages, productionProperties || [], productionImages || [], duplicateIdsToDelete)
    }));
  }

  // Duplicate source rows are skipped, never hard-deleted from production.
  const existingProperties = await request(config, "properties?select=*&limit=10000");
  const existingById = new Map((existingProperties || []).map(item => [item.property_id, item]));
  uniqueProperties = uniqueProperties.map(item => mergeSourceProperty(item, existingById.get(item.property_id)));
  const hiddenImages = await request(config, "property_images?select=property_id,position&storage_path=like.hidden:*&limit=10000");
  const hiddenImageKeys = new Set((hiddenImages || []).map(item => `${item.property_id}:${item.position}`));
  const filteredImages = uniqueImages.filter(item => !hiddenImageKeys.has(`${item.property_id}:${item.position}`));
  
  const visibleCounts = new Map();
  filteredImages.forEach(img => {
    if (img.public_url) visibleCounts.set(img.property_id, (visibleCounts.get(img.property_id) || 0) + 1);
  });
  uniqueProperties = uniqueProperties.map(item => ({ ...item, image_count: visibleCounts.get(item.property_id) || 0 }));

  for (let offset = 0; offset < uniqueProperties.length; offset += 100) await request(config, "properties?on_conflict=property_id", { method: "POST", body: uniqueProperties.slice(offset, offset + 100), prefer: "resolution=merge-duplicates,return=minimal" });
  for (let offset = 0; offset < filteredImages.length; offset += 100) await request(config, "property_images?on_conflict=property_id,position", { method: "POST", body: filteredImages.slice(offset, offset + 100), prefer: "resolution=merge-duplicates,return=minimal" });
  console.log(JSON.stringify({ ok: true, synced: uniqueProperties.length, skippedDuplicateIds: duplicateIdsToDelete.size, images: filteredImages.length }));
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { buildDiffReport, parseCsv, parseJson, recordParts };
