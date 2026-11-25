// ============================================================================
// FOURLAND CMS — FACEBOOK PAGES STORE (SERVER 50 · 8889 NATIVE SYNC)
// ============================================================================

const DEFAULT_PAGE_ID = process.env.FACEBOOK_PAGE_ID || "104363431784609";
const DEFAULT_PAGE_NAME = process.env.FACEBOOK_PAGE_NAME || "FourLand";

const INITIAL_PAGES = [
  {
    id: DEFAULT_PAGE_ID,
    pageId: DEFAULT_PAGE_ID,
    server50PageId: "100066639715025",
    name: DEFAULT_PAGE_NAME,
    token: "",
    isDefault: true,
    source: "server50-8889",
    category: "Công ty phát triển bất động sản",
    avatarUrl: `https://graph.facebook.com/${DEFAULT_PAGE_ID}/picture?type=large`,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z"
  },
  {
    id: "106656702112510",
    pageId: "106656702112510",
    server50PageId: "100083339924743",
    name: "Ngọc Nhà Tốt",
    token: "",
    isDefault: false,
    source: "server50-8889",
    category: "Người môi giới bất động sản",
    avatarUrl: "https://graph.facebook.com/106656702112510/picture?type=large",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z"
  },
  {
    id: "profile:acc_7d96c28078d8a956",
    pageId: "profile:acc_7d96c28078d8a956",
    server50PageId: "profile:acc_7d96c28078d8a956",
    platform: "fb_profile",
    name: "FB · Nguyễn Ngọc",
    token: "",
    isDefault: false,
    source: "server50-8889",
    category: "Trang cá nhân Facebook",
    avatarUrl: "https://graph.facebook.com/100023413875667/picture?type=large",
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z"
  },
  {
    id: "profile:acc_4285d32cedffb51f",
    pageId: "profile:acc_4285d32cedffb51f",
    server50PageId: "profile:acc_4285d32cedffb51f",
    platform: "fb_profile",
    name: "FB · Nguyễn Bích Ngọc",
    token: "",
    isDefault: false,
    source: "server50-8889",
    category: "Trang cá nhân Facebook",
    avatarUrl: "https://graph.facebook.com/100004410069738/picture?type=large",
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z"
  },
  {
    id: "100063820399874",
    pageId: "100063820399874",
    server50PageId: "100063820399874",
    name: "Vinhomes Green Paradise",
    token: "",
    isDefault: false,
    source: "server50-8889",
    category: "Bất động sản",
    avatarUrl: "https://graph.facebook.com/100063820399874/picture?type=large",
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z"
  },
  {
    id: "61560150341552",
    pageId: "61560150341552",
    server50PageId: "61560150341552",
    name: "Alpha - Giải Pháp Không Gian Sáng Tạo",
    token: "",
    isDefault: false,
    source: "server50-8889",
    category: "Thiết kế & Kiến trúc",
    avatarUrl: "/assets/brand/fourland-icon-192.png",
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z"
  },
  {
    id: "61566534021649",
    pageId: "61566534021649",
    server50PageId: "61566534021649",
    name: "AI Business Hub",
    token: "",
    isDefault: false,
    source: "server50-8889",
    category: "Doanh nghiệp & Công nghệ",
    avatarUrl: "/assets/brand/fourland-icon-192.png",
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z"
  },
  {
    id: "threads:acc_f36e9f891e8afc27",
    pageId: "threads:acc_f36e9f891e8afc27",
    server50PageId: "threads:acc_f36e9f891e8afc27",
    platform: "threads",
    name: "Threads · @peter.digital_art",
    token: "",
    isDefault: false,
    source: "server50-8889",
    category: "Kênh Threads",
    avatarUrl: "/assets/brand/threads-icon.svg",
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z"
  }
];

function normalizePageNameKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function dedupePages(rawPages = []) {
  const list = Array.isArray(rawPages) ? rawPages.filter(Boolean) : [];
  const byName = new Map();
  const byId = new Set();

  // Sort so server50-8889 and custom pages win over any legacy composio entries
  const prioritized = [...list].sort((a, b) => {
    const score = (p) => (p.source === "composio" ? 0 : p.source === "custom" ? 2 : 3);
    return score(b) - score(a);
  });

  const result = [];
  for (const item of prioritized) {
    // Skip legacy composio-synced duplicates when we already have canonical pages
    const pid = String(item.pageId || item.id || "").trim();
    const s50Id = String(item.server50PageId || "").trim();
    const nameKey = normalizePageNameKey(item.name);
    if (!pid || !nameKey) continue;

    // Skip stale removed threads account if replaced
    if (pid === "threads:acc_bad950fd100190ff") continue;
    const builtin = INITIAL_PAGES.find(
      (ip) =>
        ip.pageId === pid ||
        ip.server50PageId === pid ||
        (s50Id && ip.server50PageId === s50Id) ||
        normalizePageNameKey(ip.name) === nameKey
    );

    const canonicalId = builtin ? builtin.pageId : pid;
    const canonicalS50 = builtin ? builtin.server50PageId : (s50Id || pid);

    if (byId.has(canonicalId) || (canonicalS50 && byId.has(canonicalS50)) || byName.has(nameKey)) {
      // Preserve isDefault or fresh avatarUrl if merging
      const existing = byName.get(nameKey);
      if (existing) {
        if (item.isDefault) existing.isDefault = true;
        if (item.avatarUrl && item.source === "server50-8889" && (!existing.avatarUrl || existing.avatarUrl.startsWith("/assets/"))) {
          existing.avatarUrl = item.avatarUrl;
        }
      }
      continue;
    }

    if (item.source === "composio" && !builtin) {
      continue;
    }

    const merged = {
      ...(builtin || {}),
      ...item,
      id: canonicalId,
      pageId: canonicalId,
      server50PageId: canonicalS50,
      name: String(item.name || builtin?.name || "Fanpage").trim(),
      source: item.source === "composio" ? "server50-8889" : (item.source || "server50-8889"),
      avatarUrl: item.avatarUrl || builtin?.avatarUrl || `https://graph.facebook.com/${canonicalId}/picture?type=large`
    };

    byId.add(canonicalId);
    if (canonicalS50) byId.add(canonicalS50);
    byName.set(nameKey, merged);
    result.push(merged);
  }

  // Keep stable order: INITIAL_PAGES order first, then any custom pages
  const ordered = [];
  for (const initPg of INITIAL_PAGES) {
    const found = result.find((p) => p.pageId === initPg.pageId);
    if (found) ordered.push(found);
  }
  for (const p of result) {
    if (!ordered.includes(p)) ordered.push(p);
  }

  if (ordered.length > 0 && !ordered.some((p) => p.isDefault)) {
    const fl = ordered.find((p) => normalizePageNameKey(p.name) === "fourland") || ordered[0];
    fl.isDefault = true;
  }

  return ordered;
}

let dynamicPagesStore = dedupePages(INITIAL_PAGES);
let lastSyncTime = 0;
const SYNC_TTL_MS = 60000; // 1 minute cache
let memoryCachedPages = null;
let lastPersistentLoadTime = 0;
const PERSISTENT_CACHE_TTL_MS = 15000;

async function loadPersistentPages() {
  const now = Date.now();
  if (memoryCachedPages && (now - lastPersistentLoadTime < PERSISTENT_CACHE_TTL_MS)) {
    return memoryCachedPages;
  }

  try {
    const { supabaseRequest } = require("../api/_supabase");
    const appRes = await supabaseRequest("app_settings?select=key,value,updated_at&key=eq.facebook_pages_config").catch(() => null);
    if (appRes && Array.isArray(appRes.data) && appRes.data.length > 0 && appRes.data[0].value) {
      let pages = null;
      try {
        pages = typeof appRes.data[0].value === "string" ? JSON.parse(appRes.data[0].value) : appRes.data[0].value;
      } catch (_) {}
      if (Array.isArray(pages) && pages.length > 0) {
        const cleaned = dedupePages(pages);
        memoryCachedPages = cleaned;
        dynamicPagesStore = [...cleaned];
        lastPersistentLoadTime = now;
        if (cleaned.length !== pages.length) {
          savePersistentPages(cleaned).catch(() => {});
        }
        return memoryCachedPages;
      }
    }

    const sysRowRes = await supabaseRequest("properties?select=property_id,data_json,updated_at&property_id=eq.SYSTEM_APP_SETTINGS&limit=1").catch(() => null);
    if (sysRowRes && Array.isArray(sysRowRes.data) && sysRowRes.data.length > 0) {
      const data = sysRowRes.data[0].data_json || {};
      if (Array.isArray(data.facebook_pages_config) && data.facebook_pages_config.length > 0) {
        const cleaned = dedupePages(data.facebook_pages_config);
        memoryCachedPages = cleaned;
        dynamicPagesStore = [...cleaned];
        lastPersistentLoadTime = now;
        if (cleaned.length !== data.facebook_pages_config.length) {
          savePersistentPages(cleaned).catch(() => {});
        }
        return memoryCachedPages;
      }
    }
  } catch (_) {}

  if (!memoryCachedPages) {
    memoryCachedPages = dedupePages(dynamicPagesStore.length > 0 ? dynamicPagesStore : INITIAL_PAGES);
  }
  lastPersistentLoadTime = now;
  return memoryCachedPages;
}

async function savePersistentPages(pages) {
  if (!Array.isArray(pages)) return;
  const cleaned = dedupePages(pages);
  memoryCachedPages = [...cleaned];
  dynamicPagesStore = [...cleaned];
  lastPersistentLoadTime = Date.now();

  try {
    const { supabaseRequest } = require("../api/_supabase");
    const now = new Date().toISOString();
    let saved = false;

    const appSettingsRes = await supabaseRequest("app_settings", {
      method: "POST",
      body: [{
        key: "facebook_pages_config",
        value: JSON.stringify(cleaned),
        updated_at: now
      }],
      prefer: "resolution=merge-duplicates"
    }).catch(() => null);

    if (appSettingsRes) saved = true;

    if (!saved) {
      const sysRow = await supabaseRequest("properties?select=property_id,data_json&property_id=eq.SYSTEM_APP_SETTINGS&limit=1").catch(() => null);
      const existingData = (sysRow?.data?.[0]?.data_json) || {};
      const nextDataJson = {
        ...existingData,
        facebook_pages_config: cleaned,
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
  } catch (_) {}
}

function sanitizePage(page) {
  if (!page) return null;
  return {
    id: String(page.id || page.pageId),
    pageId: String(page.pageId || page.id),
    ...(page.server50PageId ? { server50PageId: String(page.server50PageId) } : {}),
    name: String(page.name || "Fanpage").trim(),
    isDefault: Boolean(page.isDefault),
    hasToken: Boolean(page.token && page.token.trim()),
    source: page.source || "server50-8889",
    category: page.category || "Trang Facebook",
    avatarUrl: page.avatarUrl || `https://graph.facebook.com/${page.pageId || page.id}/picture?type=large`,
    createdAt: page.createdAt || new Date().toISOString(),
    updatedAt: page.updatedAt || new Date().toISOString()
  };
}

async function fetchServer50Pages({ fetchImpl = fetch } = {}) {
  const candidates = [
    process.env.FOURLAND_SOCIAL_TUNNEL_URL || "https://drink-owners-prayer-partnerships.trycloudflare.com",
    process.env.FOURLAND_SOCIAL_LAN_URL || "http://192.168.1.50:8889"
  ].filter(Boolean);

  try {
    const { supabaseRequest } = require("../api/_supabase");
    const res = await supabaseRequest("cms_settings?select=setting_value&setting_key=eq.facebook_poster_node&limit=1").catch(() => null);
    const raw = res?.data?.[0]?.setting_value;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed?.tunnelUrl && !candidates.includes(parsed.tunnelUrl)) candidates.unshift(parsed.tunnelUrl);
    }
  } catch (_) {}

  for (const baseUrl of candidates) {
    try {
      const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/api/accounts`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res || !res.ok) continue;
      const accounts = await res.json();
      if (!Array.isArray(accounts) || !accounts.length) continue;
      const allPages = [];
      for (const acc of accounts) {
        if (acc.platform === "facebook" && acc.id) {
          const pName = String(acc.profileName || acc.label || "Cá nhân").trim();
          allPages.push({
            id: `profile:${acc.id}`,
            name: `FB · ${pName}`,
            picture: acc.picture || "/assets/brand/fourland-icon-192.png",
            platform: "fb_profile"
          });
          for (const pg of acc.pages || []) {
            if (pg?.id && pg?.name) allPages.push({ ...pg, platform: "facebook" });
          }
        } else if (acc.platform === "threads" && acc.id) {
          const handleMatch = String(acc.label || "").match(/@([\w.]+)/);
          const display = handleMatch ? `Threads · @${handleMatch[1]}` : (acc.label || "Threads");
          allPages.push({
            id: `threads:${acc.id}`,
            name: display,
            picture: acc.picture || "/assets/brand/threads-icon.svg",
            platform: "threads"
          });
        }
      }
      if (!allPages.length) continue;

      allPages.forEach((sp) => {
        const pid = String(sp.id);
        const normName = normalizePageNameKey(sp.name);
        const existingIndex = dynamicPagesStore.findIndex(
          (p) =>
            String(p.pageId) === pid ||
            String(p.id) === pid ||
            String(p.server50PageId || "") === pid ||
            normalizePageNameKey(p.name) === normName
        );
        const keepId = existingIndex >= 0 ? dynamicPagesStore[existingIndex].pageId : pid;
        const pageObj = {
          id: keepId,
          pageId: keepId,
          server50PageId: pid,
          name: String(sp.name || "").trim(),
          token: existingIndex >= 0 ? dynamicPagesStore[existingIndex].token : "",
          source: "server50-8889",
          category: "Fanpage kết nối Máy 50 (8889)",
          avatarUrl: sp.picture || `https://graph.facebook.com/${keepId}/picture?type=large`,
          isDefault: existingIndex >= 0 ? dynamicPagesStore[existingIndex].isDefault : normName === "fourland",
          createdAt: existingIndex >= 0 ? dynamicPagesStore[existingIndex].createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        if (existingIndex >= 0) {
          dynamicPagesStore[existingIndex] = { ...dynamicPagesStore[existingIndex], ...pageObj };
        } else {
          dynamicPagesStore.push(pageObj);
        }
      });

      dynamicPagesStore = dedupePages(dynamicPagesStore);
      lastSyncTime = Date.now();
      return { syncedFrom: "server50-8889", pages: dynamicPagesStore.map(sanitizePage) };
    } catch (_) {}
  }
  return { syncedFrom: null, pages: null };
}

async function getFacebookPages({ forceRefresh = false, fetchImpl = fetch } = {}) {
  await loadPersistentPages();
  const isNodeTest = Array.isArray(process.execArgv) && process.execArgv.includes("--test");
  const shouldSync = forceRefresh || (!isNodeTest && (Date.now() - lastSyncTime > SYNC_TTL_MS));
  if (shouldSync) {
    await fetchServer50Pages({ fetchImpl });
  }
  for (const initPg of INITIAL_PAGES) {
    const pid = String(initPg.pageId);
    const norm = normalizePageNameKey(initPg.name);
    const exists = dynamicPagesStore.some(
      (p) =>
        String(p.pageId) === pid ||
        String(p.id) === pid ||
        String(p.server50PageId || "") === String(initPg.server50PageId || "") ||
        normalizePageNameKey(p.name) === norm
    );
    if (!exists) {
      dynamicPagesStore.push({ ...initPg, isDefault: false });
    }
  }
  dynamicPagesStore = dedupePages(dynamicPagesStore);
  if (shouldSync) {
    await savePersistentPages(dynamicPagesStore);
  }
  return dynamicPagesStore.map(sanitizePage);
}

async function getFacebookPageById(pageId) {
  if (!pageId) return null;
  await loadPersistentPages();
  const target = String(pageId).trim();
  const found = dynamicPagesStore.find(
    (p) =>
      String(p.pageId) === target ||
      String(p.id) === target ||
      String(p.server50PageId || "") === target
  );
  if (found) return found;
  const initMatch = INITIAL_PAGES.find(
    (p) => String(p.pageId) === target || String(p.server50PageId || "") === target
  );
  return initMatch || null;
}

async function getDefaultFacebookPage() {
  await loadPersistentPages();
  const defaultPage = dynamicPagesStore.find((p) => p.isDefault) || dynamicPagesStore[0] || INITIAL_PAGES[0];
  return defaultPage;
}

async function addFacebookPage({ name, pageId, token = "", isDefault = false }) {
  await loadPersistentPages();
  const cleanId = String(pageId || "").trim();
  const cleanName = String(name || "").trim();
  const cleanToken = String(token || "").trim();

  if (!cleanId) throw new Error("Mã Page ID không được để trống");
  if (!cleanName) throw new Error("Tên Fanpage không được để trống");

  const normName = normalizePageNameKey(cleanName);
  const existingIndex = dynamicPagesStore.findIndex(
    (p) => String(p.pageId) === cleanId || normalizePageNameKey(p.name) === normName
  );
  const now = new Date().toISOString();

  if (isDefault) {
    dynamicPagesStore.forEach((p) => { p.isDefault = false; });
  }

  const newPage = {
    id: cleanId,
    pageId: cleanId,
    server50PageId: cleanId,
    name: cleanName,
    token: cleanToken || (existingIndex >= 0 ? dynamicPagesStore[existingIndex].token : ""),
    source: "custom",
    isDefault: isDefault || dynamicPagesStore.length === 0,
    avatarUrl: `https://graph.facebook.com/${cleanId}/picture?type=large`,
    createdAt: now,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    dynamicPagesStore[existingIndex] = { ...dynamicPagesStore[existingIndex], ...newPage, updatedAt: now };
    await savePersistentPages(dynamicPagesStore);
    return sanitizePage(dynamicPagesStore.find((p) => String(p.pageId) === cleanId) || newPage);
  }

  dynamicPagesStore.push(newPage);
  await savePersistentPages(dynamicPagesStore);
  return sanitizePage(newPage);
}

async function updateFacebookPage(pageId, updates = {}) {
  await loadPersistentPages();
  const cleanId = String(pageId || "").trim();
  const page = dynamicPagesStore.find((p) => String(p.pageId) === cleanId || String(p.id) === cleanId);
  if (!page) throw new Error("Không tìm thấy Fanpage");

  const now = new Date().toISOString();

  if (updates.isDefault) {
    dynamicPagesStore.forEach((p) => { p.isDefault = false; });
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
  dynamicPagesStore = dynamicPagesStore.filter((p) => String(p.pageId) !== cleanId && String(p.id) !== cleanId);
  if (dynamicPagesStore.length === initialLength) {
    throw new Error("Không tìm thấy Fanpage để xóa");
  }

  if (!dynamicPagesStore.some((p) => p.isDefault) && dynamicPagesStore.length > 0) {
    dynamicPagesStore[0].isDefault = true;
  }

  await savePersistentPages(dynamicPagesStore);
  return { ok: true, message: "Đã xóa Fanpage thành công" };
}

module.exports = {
  getFacebookPages,
  getFacebookPageById,
  getDefaultFacebookPage,
  dedupePages,
  addFacebookPage,
  updateFacebookPage,
  deleteFacebookPage,
  sanitizePage,
  loadPersistentPages,
  savePersistentPages
};
