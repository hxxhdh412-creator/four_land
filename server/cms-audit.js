const SECRET_KEY_PATTERN = /(?:authorization|cookie|password|secret|session|token|api[_-]?key)/i;

function sanitize(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => sanitize(item, seen));
  const output = {};
  Object.entries(value).forEach(([key, item]) => {
    output[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitize(item, seen);
  });
  return output;
}

function changedFields(beforeData, afterData) {
  const before = beforeData && typeof beforeData === "object" ? beforeData : {};
  const after = afterData && typeof afterData === "object" ? afterData : {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .sort();
}

function createAuditEvent({ actorId = null, action, entityType, entityId, beforeData = null, afterData = null, requestId = null, source = "cms", ipHash = null }) {
  if (!action || !entityType || !entityId) {
    const error = new Error("Audit event thiếu action, entityType hoặc entityId");
    error.code = "AUDIT_EVENT_INVALID";
    throw error;
  }
  const safeBefore = beforeData == null ? null : sanitize(beforeData);
  const safeAfter = afterData == null ? null : sanitize(afterData);
  return {
    actor_id: actorId,
    action: String(action),
    entity_type: String(entityType),
    entity_id: String(entityId),
    before_data: safeBefore,
    after_data: safeAfter,
    changed_fields: changedFields(safeBefore, safeAfter),
    request_id: requestId ? String(requestId) : null,
    source: String(source || "cms"),
    ip_hash: ipHash ? String(ipHash) : null
  };
}

module.exports = { SECRET_KEY_PATTERN, changedFields, createAuditEvent, sanitize };
