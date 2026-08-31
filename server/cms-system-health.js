function buildSystemHealth({ properties = [], imageCount = 0, mutationsEnabled = false, syncWritesEnabled = false, inspectedAt = new Date().toISOString() } = {}) {
  const rows = Array.isArray(properties) ? properties : [];
  const statusCounts = {};
  rows.forEach(row => { const status = String(row?.status || "unknown"); statusCounts[status] = (statusCounts[status] || 0) + 1; });
  const cmsSchemaReady = rows.some(row => Object.hasOwn(row || {}, "content_status"));
  const blockers = [];
  if (!cmsSchemaReady) blockers.push("Chưa áp dụng migration CMS core");
  if (!mutationsEnabled) blockers.push("CMS mutations đang khóa");
  if (!syncWritesEnabled) blockers.push("Sheet sync write đang khóa");
  return {
    inspectedAt,
    database: { connected: true, propertyCount: rows.length, imageCount: Number(imageCount || 0), statusCounts },
    cms: { schemaMode: cmsSchemaReady ? "cms" : "legacy", mutationsEnabled: Boolean(mutationsEnabled), readyForWrite: cmsSchemaReady && Boolean(mutationsEnabled) },
    sync: { writesEnabled: Boolean(syncWritesEnabled), mode: syncWritesEnabled ? "write-enabled" : "dry-run-only" },
    blockers
  };
}

module.exports = { buildSystemHealth };
