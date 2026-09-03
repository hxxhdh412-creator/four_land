// ============================================================================
// FOURLAND CMS — FACEBOOK PAGES STORE & DYNAMIC CONFIGURATION
// ============================================================================

const DEFAULT_PAGE_ID = process.env.FACEBOOK_PAGE_ID || "106656702112510";
const DEFAULT_PAGE_NAME = process.env.FACEBOOK_PAGE_NAME || "Ngọc Nhà Tốt";
const DEFAULT_PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "EAAM4uULUpAUBSU9xH13NOrCzer4tEqkAWJHV3PGIZAd9pZBjViOBMBTbm8e7OscvgBbXpCQiZC7hyrwURaPrkZCoBo03MXWLXn6vWVZA1i23bZCZCwZBlZAimnrtVyHBDd1eTvc8O50b4ZAK9nukLumlvYkkcTAfBeNIDRbyCVhsiwz36ZCN2SkjaSyeYbNxnpfDusasdAB4sux9FBL3dHiTZCsZD";

const INITIAL_PAGES = [
  {
    id: DEFAULT_PAGE_ID,
    pageId: DEFAULT_PAGE_ID,
    name: DEFAULT_PAGE_NAME,
    token: DEFAULT_PAGE_TOKEN,
    isDefault: true,
    avatarUrl: `https://graph.facebook.com/${DEFAULT_PAGE_ID}/picture?type=large`,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  }
];

let dynamicPagesStore = [...INITIAL_PAGES];

function sanitizePage(page) {
  if (!page) return null;
  return {
    id: String(page.id || page.pageId),
    pageId: String(page.pageId || page.id),
    name: String(page.name || "Fanpage").trim(),
    isDefault: Boolean(page.isDefault),
    hasToken: Boolean(page.token && page.token.trim()),
    avatarUrl: page.avatarUrl || `https://graph.facebook.com/${page.pageId || page.id}/picture?type=large`,
    createdAt: page.createdAt || new Date().toISOString(),
    updatedAt: page.updatedAt || new Date().toISOString()
  };
}

async function getFacebookPages() {
  return dynamicPagesStore.map(sanitizePage);
}

async function getFacebookPageById(pageId) {
  if (!pageId) return null;
  const page = dynamicPagesStore.find(p => String(p.pageId) === String(pageId) || String(p.id) === String(pageId));
  return page || null;
}

async function getDefaultFacebookPage() {
  const defaultPage = dynamicPagesStore.find(p => p.isDefault) || dynamicPagesStore[0] || INITIAL_PAGES[0];
  return defaultPage;
}

async function addFacebookPage({ name, pageId, token = "", isDefault = false }) {
  const cleanId = String(pageId || "").trim();
  const cleanName = String(name || "").trim();
  const cleanToken = String(token || "").trim();

  if (!cleanId) throw new Error("Mã Page ID không được để trống");
  if (!cleanName) throw new Error("Tên Fanpage không được để trống");

  const existingIndex = dynamicPagesStore.findIndex(p => String(p.pageId) === cleanId);
  const now = new Date().toISOString();

  if (isDefault) {
    dynamicPagesStore.forEach(p => { p.isDefault = false; });
  }

  const newPage = {
    id: cleanId,
    pageId: cleanId,
    name: cleanName,
    token: cleanToken || DEFAULT_PAGE_TOKEN,
    isDefault: isDefault || dynamicPagesStore.length === 0,
    avatarUrl: `https://graph.facebook.com/${cleanId}/picture?type=large`,
    createdAt: now,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    dynamicPagesStore[existingIndex] = { ...dynamicPagesStore[existingIndex], ...newPage, updatedAt: now };
    return sanitizePage(dynamicPagesStore[existingIndex]);
  }

  dynamicPagesStore.push(newPage);
  return sanitizePage(newPage);
}

async function updateFacebookPage(pageId, updates = {}) {
  const cleanId = String(pageId || "").trim();
  const page = dynamicPagesStore.find(p => String(p.pageId) === cleanId || String(p.id) === cleanId);
  if (!page) throw new Error("Không tìm thấy Fanpage");

  const now = new Date().toISOString();

  if (updates.isDefault) {
    dynamicPagesStore.forEach(p => { p.isDefault = false; });
    page.isDefault = true;
  }

  if (updates.name && updates.name.trim()) {
    page.name = updates.name.trim();
  }

  if (updates.token !== undefined && updates.token.trim()) {
    page.token = updates.token.trim();
  }

  page.updatedAt = now;
  return sanitizePage(page);
}

async function deleteFacebookPage(pageId) {
  const cleanId = String(pageId || "").trim();
  if (cleanId === DEFAULT_PAGE_ID) {
    throw new Error("Không thể xóa Fanpage mặc định của hệ thống");
  }

  const initialLength = dynamicPagesStore.length;
  dynamicPagesStore = dynamicPagesStore.filter(p => String(p.pageId) !== cleanId && String(p.id) !== cleanId);
  if (dynamicPagesStore.length === initialLength) {
    throw new Error("Không tìm thấy Fanpage để xóa");
  }

  // Ensure there is always a default page
  if (!dynamicPagesStore.some(p => p.isDefault) && dynamicPagesStore.length > 0) {
    dynamicPagesStore[0].isDefault = true;
  }

  return { ok: true, message: "Đã xóa Fanpage thành công" };
}

module.exports = {
  getFacebookPages,
  getFacebookPageById,
  getDefaultFacebookPage,
  addFacebookPage,
  updateFacebookPage,
  deleteFacebookPage,
  sanitizePage
};
