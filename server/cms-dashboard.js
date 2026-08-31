function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function buildDashboardSummary(properties, now = new Date()) {
  const rows = Array.isArray(properties) ? properties : [];
  const active = rows.filter(row => row.status !== "archived");
  const published = active.filter(row => row.content_status ? row.content_status === "published" : true);
  const pendingReview = active.filter(row => row.content_status === "pending_review");
  const missingData = active.filter(row => !row.address || !row.price_text || Number(row.image_count || 0) < 2);
  const available = active.filter(row => {
    if (row.availability_status) return row.availability_status === "available";
    return row.status !== "rented" && !Boolean(row.data_json?.is_rented);
  });
  const today = startOfToday(now);
  const receivedToday = active.filter(row => {
    const value = new Date(row.received_at || 0).getTime();
    return Number.isFinite(value) && value >= today;
  });
  const withoutImages = active.filter(row => Number(row.image_count || 0) < 1);
  return {
    total: rows.length,
    published: published.length,
    pendingReview: pendingReview.length,
    missingData: missingData.length,
    available: available.length,
    archived: rows.length - active.length,
    receivedToday: receivedToday.length,
    withoutImages: withoutImages.length,
    schemaMode: rows.some(row => row.content_status !== undefined) ? "cms" : "legacy"
  };
}

module.exports = { buildDashboardSummary, startOfToday };
