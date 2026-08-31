const { LIST_FIELDS, normalizePropertyListItem } = require("./cms-properties");

function buildReviewQueueRoute(limit = 30) {
  const query = new URLSearchParams({
    select: LIST_FIELDS,
    status: "neq.archived",
    or: "(address.is.null,address.eq.,price_text.is.null,price_text.eq.,image_count.lt.2)",
    order: "received_at.desc",
    limit: String(Math.min(50, Math.max(1, Number(limit) || 30)))
  });
  return `properties?${query}`;
}

function reviewIssues(row) {
  const issues = [];
  if (!row?.address) issues.push({ code: "missing_address", label: "Thiếu địa chỉ", weight: 4 });
  if (!row?.price_text) issues.push({ code: "missing_price", label: "Thiếu giá", weight: 3 });
  const imageCount = Number(row?.image_count || row?.property_images?.length || 0);
  if (imageCount < 1) issues.push({ code: "missing_images", label: "Chưa có ảnh", weight: 3 });
  else if (imageCount < 2) issues.push({ code: "few_images", label: "Chỉ có 1 ảnh", weight: 1 });
  return issues;
}

function buildReviewQueue(rows) {
  const items = (Array.isArray(rows) ? rows : []).map(row => {
    const issues = reviewIssues(row);
    return { ...normalizePropertyListItem(row), issues, priorityScore: issues.reduce((sum, issue) => sum + issue.weight, 0) };
  }).filter(item => item.issues.length).sort((a, b) => b.priorityScore - a.priorityScore || new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
  return {
    items,
    summary: {
      total: items.length,
      missingAddress: items.filter(item => item.issues.some(issue => issue.code === "missing_address")).length,
      missingPrice: items.filter(item => item.issues.some(issue => issue.code === "missing_price")).length,
      imageIssues: items.filter(item => item.issues.some(issue => ["missing_images", "few_images"].includes(issue.code))).length
    }
  };
}

module.exports = { buildReviewQueue, buildReviewQueueRoute, reviewIssues };
