// ============================================================================
// FOURLAND CMS — FACEBOOK PAGES STORE & COMPOSIO DYNAMIC CONFIGURATION
// ============================================================================

const DEFAULT_PAGE_ID = process.env.FACEBOOK_PAGE_ID || "106656702112510";
const DEFAULT_PAGE_NAME = process.env.FACEBOOK_PAGE_NAME || "Ngọc Nhà Tốt";
const DEFAULT_PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "EAAM4uULUpAUBSU9xH13NOrCzer4tEqkAWJHV3PGIZAd9pZBjViOBMBTbm8e7OscvgBbXpCQiZC7hyrwURaPrkZCoBo03MXWLXn6vWVZA1i23bZCZCwZBlZAimnrtVyHBDd1eTvc8O50b4ZAK9nukLumlvYkkcTAfBeNIDRbyCVhsiwz36ZCN2SkjaSyeYbNxnpfDusasdAB4sux9FBL3dHiTZCsZD";
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || "ck_e4AHzIDYFZKwFT8XrkwX";

const INITIAL_PAGES = [
  {
    id: DEFAULT_PAGE_ID,
    pageId: DEFAULT_PAGE_ID,
    name: DEFAULT_PAGE_NAME,
    token: DEFAULT_PAGE_TOKEN,
    isDefault: true,
    source: "composio",
    category: "Bất động sản",
    avatarUrl: `https://graph.facebook.com/${DEFAULT_PAGE_ID}/picture?type=large`,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  }
];

let dynamicPagesStore = [...INITIAL_PAGES];
let lastSyncTime = 0;
const SYNC_TTL_MS = 60000; // 1 minute cache
let memoryCachedPages = null;
let lastPersistentLoadTime = 0;
const PERSISTENT_CACHE_TTL_MS = 15000; // 15 seconds in-memory cache

async function loadPersistentPages() {
  const now = Date.now();
  if (memoryCachedPages && (now - lastPersistentLoadTime < PERSISTENT_CACHE_TTL_MS)) {
    return memoryCachedPages;
  }

  try {
    const { supabaseRequest } = require("../api/_supabase");
    // 1. Thử đọc từ bảng app_settings nếu có
    const appRes = await supabaseRequest("app_settings?select=key,value,updated_at&key=eq.facebook_pages_config").catch(() => null);
    if (appRes && Array.isArray(appRes.data) && appRes.data.length > 0 && appRes.data[0].value) {
      let pages = null;
      try {
        pages = typeof appRes.data[0].value === "string" ? JSON.parse(appRes.data[0].value) : appRes.data[0].value;
      } catch (_) {}
      if (Array.isArray(pages) && pages.length > 0) {
        memoryCachedPages = pages;
        dynamicPagesStore = [...pages];
        lastPersistentLoadTime = now;
        return memoryCachedPages;
      }
    }

    // 2. Fallback an toàn: Thử đọc từ properties row SYSTEM_APP_SETTINGS
    const sysRowRes = await supabaseRequest("properties?select=property_id,data_json,updated_at&property_id=eq.SYSTEM_APP_SETTINGS&limit=1").catch(() => null);
    if (sysRowRes && Array.isArray(sysRowRes.data) && sysRowRes.data.length > 0) {
      const data = sysRowRes.data[0].data_json || {};
      if (Array.isArray(data.facebook_pages_config) && data.facebook_pages_config.length > 0) {
        memoryCachedPages = data.facebook_pages_config;
        dynamicPagesStore = [...data.facebook_pages_config];
        lastPersistentLoadTime = now;
        return memoryCachedPages;
      }
    }
  } catch (_) {
    // Môi trường test hoặc không có Supabase credentials -> dùng dynamicPagesStore
  }

  if (!memoryCachedPages) {
    memoryCachedPages = dynamicPagesStore.length > 0 ? dynamicPagesStore : [...INITIAL_PAGES];
  }
  lastPersistentLoadTime = now;
  return memoryCachedPages;
}

async function savePersistentPages(pages) {
  if (!Array.isArray(pages)) return;
  memoryCachedPages = [...pages];
  dynamicPagesStore = [...pages];
  lastPersistentLoadTime = Date.now();

  try {
    const { supabaseRequest } = require("../api/_supabase");
    const now = new Date().toISOString();
    let saved = false;

    // 1. Thử lưu vào app_settings
    const appSettingsRes = await supabaseRequest("app_settings", {
      method: "POST",
      body: [{
        key: "facebook_pages_config",
        value: JSON.stringify(pages),
        updated_at: now
      }],
      prefer: "resolution=merge-duplicates"
    }).catch(() => null);

    if (appSettingsRes) saved = true;

    if (!saved) {
      // 2. Fallback: Lưu vào properties SYSTEM_APP_SETTINGS
      const sysRow = await supabaseRequest("properties?select=property_id,data_json&property_id=eq.SYSTEM_APP_SETTINGS&limit=1").catch(() => null);
      const existingData = (sysRow?.data?.[0]?.data_json) || {};
      const nextDataJson = {
        ...existingData,
        facebook_pages_config: pages,
        updated_at: now
      };

      const sysPayload = {
        property_id: "SYSTEM_APP_SETTINGS",
        address: "Cấu hình hệ thống Fourland",
        status: "archived",
        content_status: "archived",
        data_json: nextDataJson,
        updated_at: now
      };

      await supabaseRequest("properties", {
        method: "POST",
        body: sysPayload,
        prefer: "resolution=merge-duplicates"
      }).catch(async () => {
        await supabaseRequest("properties?property_id=eq.SYSTEM_APP_SETTINGS", {
          method: "PATCH",
          body: {
            data_json: nextDataJson,
            updated_at: now
          }
        });
      });
    }
  } catch (_) {
    // Môi trường test hoặc không có Supabase credentials
  }
}

function sanitizePage(page) {
  if (!page) return null;
  return {
    id: String(page.id || page.pageId),
    pageId: String(page.pageId || page.id),
    name: String(page.name || "Fanpage").trim(),
    isDefault: Boolean(page.isDefault),
    hasToken: Boolean(page.token && page.token.trim()),
    source: page.source || "custom",
    category: page.category || "Trang Facebook",
    avatarUrl: page.avatarUrl || `https://graph.facebook.com/${page.pageId || page.id}/picture?type=large`,
    createdAt: page.createdAt || new Date().toISOString(),
    updatedAt: page.updatedAt || new Date().toISOString()
  };
}

async function fetchComposioPages({ apiKey = COMPOSIO_API_KEY, fetchImpl = fetch } = {}) {
  const candidateKeys = Array.from(new Set([apiKey, "ck_e4AHzIDYFZKwFT8XrkwX", process.env.COMPOSIO_API_KEY])).filter(k => k && k !== "pending");
  if (!candidateKeys.length) return dynamicPagesStore.map(sanitizePage);

  for (const candidateKey of candidateKeys) {
    try {
      const res = await fetchImpl("https://connect.composio.dev/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "x-consumer-api-key": candidateKey,
          "Mcp-Session-Id": "fourland_sync_" + Date.now()
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "COMPOSIO_MULTI_EXECUTE_TOOL",
            arguments: {
              tools: [{ tool_slug: "FACEBOOK_LIST_MANAGED_PAGES", arguments: { fields: "id,name,access_token,category" } }]
            }
          }
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (res.ok) {
        const text = await res.text();
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const j = JSON.parse(line.slice(6));
            const txt = j.result?.content?.[0]?.text;
            if (txt) {
              const parsed = JSON.parse(txt);
              const composioPages = parsed.data?.results?.[0]?.response?.data?.data || [];
              if (Array.isArray(composioPages) && composioPages.length > 0) {
                composioPages.forEach(cp => {
                  const pid = String(cp.id);
                  const existingIndex = dynamicPagesStore.findIndex(p => String(p.pageId) === pid || String(p.id) === pid);
                  const pageObj = {
                    id: pid,
                    pageId: pid,
                    name: cp.name,
                    token: cp.access_token || DEFAULT_PAGE_TOKEN,
                    source: "composio",
                    category: cp.category || "Trang Facebook",
                    avatarUrl: `https://graph.facebook.com/${pid}/picture?type=large`,
                    isDefault: existingIndex >= 0 ? dynamicPagesStore[existingIndex].isDefault : (pid === DEFAULT_PAGE_ID),
                    createdAt: existingIndex >= 0 ? dynamicPagesStore[existingIndex].createdAt : new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  };

                  if (existingIndex >= 0) {
                    dynamicPagesStore[existingIndex] = { ...dynamicPagesStore[existingIndex], ...pageObj };
                  } else {
                    dynamicPagesStore.push(pageObj);
                  }
                });

                // Ensure default page
                if (!dynamicPagesStore.some(p => p.isDefault)) {
                  const ngocNhaTot = dynamicPagesStore.find(p => p.pageId === DEFAULT_PAGE_ID);
                  if (ngocNhaTot) ngocNhaTot.isDefault = true;
                  else if (dynamicPagesStore.length > 0) dynamicPagesStore[0].isDefault = true;
                }

                lastSyncTime = Date.now();
                return dynamicPagesStore.map(sanitizePage);
              }
            }
          } catch {}
        }
      }
    }
  } catch (err) {
      console.warn("Composio pages fetch notice for key:", err.message);
    }
  }

  return dynamicPagesStore.map(sanitizePage);
}

async function getFacebookPages({ forceRefresh = false, fetchImpl = fetch } = {}) {
  await loadPersistentPages();
  const shouldSync = forceRefresh || (dynamicPagesStore.length <= 1 && (Date.now() - lastSyncTime > SYNC_TTL_MS));
  if (shouldSync) {
    await fetchComposioPages({ fetchImpl });
    await savePersistentPages(dynamicPagesStore);
  }
  return dynamicPagesStore.map(sanitizePage);
}

async function getFacebookPageById(pageId) {
  if (!pageId) return null;
  await loadPersistentPages();
  let page = dynamicPagesStore.find(p => String(p.pageId) === String(pageId) || String(p.id) === String(pageId));
  if (!page) {
    await fetchComposioPages();
    await savePersistentPages(dynamicPagesStore);
    page = dynamicPagesStore.find(p => String(p.pageId) === String(pageId) || String(p.id) === String(pageId));
  }
  return page || null;
}

async function getDefaultFacebookPage() {
  await loadPersistentPages();
  if (dynamicPagesStore.length <= 1) {
    await fetchComposioPages();
    await savePersistentPages(dynamicPagesStore);
  }
  const defaultPage = dynamicPagesStore.find(p => p.isDefault) || dynamicPagesStore[0] || INITIAL_PAGES[0];
  return defaultPage;
}

async function addFacebookPage({ name, pageId, token = "", isDefault = false }) {
  await loadPersistentPages();
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
    source: "custom",
    isDefault: isDefault || dynamicPagesStore.length === 0,
    avatarUrl: `https://graph.facebook.com/${cleanId}/picture?type=large`,
    createdAt: now,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    dynamicPagesStore[existingIndex] = { ...dynamicPagesStore[existingIndex], ...newPage, updatedAt: now };
    await savePersistentPages(dynamicPagesStore);
    return sanitizePage(dynamicPagesStore[existingIndex]);
  }

  dynamicPagesStore.push(newPage);
  await savePersistentPages(dynamicPagesStore);
  return sanitizePage(newPage);
}

async function updateFacebookPage(pageId, updates = {}) {
  await loadPersistentPages();
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
  await savePersistentPages(dynamicPagesStore);
  return sanitizePage(page);
}

async function deleteFacebookPage(pageId) {
  await loadPersistentPages();
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

  await savePersistentPages(dynamicPagesStore);
  return { ok: true, message: "Đã xóa Fanpage thành công" };
}

module.exports = {
  getFacebookPages,
  getFacebookPageById,
  getDefaultFacebookPage,
  fetchComposioPages,
  addFacebookPage,
  updateFacebookPage,
  deleteFacebookPage,
  sanitizePage,
  loadPersistentPages,
  savePersistentPages
};
