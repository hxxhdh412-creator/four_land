const LEGACY_CMS_STATUSES = new Set(["ready", "featured", "rented", "archived"]);

const OVERRIDABLE_FIELDS = new Set([
  "address", "district", "ward", "street",
  "property_type", "area_text", "area_number", "dimensions",
  "bedrooms", "bathrooms", "structure", "legal",
  "price_text", "price_number", "commission",
  "phone", "notes", "raw_text", "normalized_text"
]);

const PROTECTED_DATA_JSON_KEYS = new Set([
  "cms", "cms_override_fields", "is_featured", "is_rented", "view_count"
]);

function overrideFields(property) {
  const direct = property?.cms_override_fields;
  const fromJson = property?.data_json?.cms_override_fields;
  const fromCms = property?.data_json?.cms?.overrideFields;
  const values = [direct, fromJson, fromCms].find(Array.isArray) || [];
  return [...new Set(values.map(value => String(value || "").trim()).filter(value => OVERRIDABLE_FIELDS.has(value)))];
}

function mergeDataJson(sourceJson, existingJson) {
  const incoming = sourceJson && typeof sourceJson === "object" ? sourceJson : {};
  const existing = existingJson && typeof existingJson === "object" ? existingJson : {};
  const merged = { ...incoming };
  PROTECTED_DATA_JSON_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(existing, key)) merged[key] = existing[key];
  });
  return merged;
}

function markOverrideFields(dataJson, fields) {
  const current = dataJson && typeof dataJson === "object" ? dataJson : {};
  const accepted = fields.map(value => String(value || "").trim()).filter(value => OVERRIDABLE_FIELDS.has(value));
  const existing = overrideFields({ data_json: current });
  return { ...current, cms_override_fields: [...new Set([...existing, ...accepted])] };
}

function mergeSourceProperty(sourceProperty, existingProperty) {
  if (!existingProperty) return { ...sourceProperty };
  const merged = {
    ...sourceProperty,
    data_json: mergeDataJson(sourceProperty.data_json, existingProperty.data_json)
  };

  const fields = overrideFields(existingProperty);
  fields.forEach(field => {
    merged[field] = existingProperty[field] ?? null;
  });

  if (LEGACY_CMS_STATUSES.has(String(existingProperty.status || ""))) {
    merged.status = existingProperty.status;
  }

  return merged;
}

module.exports = {
  LEGACY_CMS_STATUSES,
  OVERRIDABLE_FIELDS,
  PROTECTED_DATA_JSON_KEYS,
  markOverrideFields,
  mergeDataJson,
  mergeSourceProperty,
  overrideFields
};
