const { SITE_ORIGIN, propertyPath } = require("./seo");
const { buildLandingSitemapEntries } = require("./seo-landings");

const INDEXNOW_KEY = "c489fd81e9b247f79b63b4f65c1926da";
const INDEXNOW_HOST = "www.fourland.vn";
const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

function normalizeUrl(input, host = INDEXNOW_HOST) {
  const text = String(input || "").trim();
  if (!text) return "";
  if (text.startsWith("/")) {
    return `https://${host}${text}`;
  }
  try {
    const parsed = new URL(text);
    if (parsed.hostname === "fourland.vn" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      parsed.protocol = "https:";
      parsed.hostname = host;
      parsed.port = "";
    }
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

function buildIndexNowPayload(urls = [], { key = INDEXNOW_KEY, host = INDEXNOW_HOST, keyLocation = INDEXNOW_KEY_LOCATION } = {}) {
  const seen = new Set();
  const normalized = [];

  for (const item of urls) {
    const url = normalizeUrl(item, host);
    if (url && !seen.has(url)) {
      seen.add(url);
      normalized.push(url);
      if (normalized.length >= 10000) break;
    }
  }

  return {
    host,
    key,
    keyLocation,
    urlList: normalized
  };
}

function collectIndexNowUrls(properties = [], { limit = 2000, host = INDEXNOW_HOST } = {}) {
  const urls = [`https://${host}/`];

  const landingEntries = buildLandingSitemapEntries(properties);
  for (const entry of landingEntries) {
    if (entry && entry.path) {
      urls.push(`https://${host}${entry.path}`);
    }
  }

  const activeProperties = (properties || [])
    .filter(item => item && item.property_id && String(item.status || "").toLowerCase() !== "archived")
    .sort((a, b) => {
      const timeA = new Date(a.updated_at || a.received_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.received_at || 0).getTime();
      return timeB - timeA;
    })
    .slice(0, limit);

  for (const prop of activeProperties) {
    const rel = propertyPath(prop);
    if (rel) {
      urls.push(`https://${host}${rel}`);
    }
  }

  const payload = buildIndexNowPayload(urls, { host });
  return payload.urlList;
}

async function submitToIndexNow(urls = [], { fetchFn = globalThis.fetch, timeoutMs = 10000, key = INDEXNOW_KEY, host = INDEXNOW_HOST, keyLocation = INDEXNOW_KEY_LOCATION } = {}) {
  const payload = buildIndexNowPayload(urls, { key, host, keyLocation });
  if (payload.urlList.length === 0) {
    return { ok: true, status: 200, submitted: 0, message: "Không có URL hợp lệ nào cần gửi" };
  }

  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer = null;
    if (controller && timeoutMs > 0) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    const response = await fetchFn(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    });

    if (timer) clearTimeout(timer);

    const isSuccess = response.status === 200 || response.status === 202 || response.ok;
    return {
      ok: isSuccess,
      status: response.status,
      submitted: payload.urlList.length,
      message: isSuccess
        ? `Đã gửi thành công ${payload.urlList.length} URL tới IndexNow (mã ${response.status})`
        : `IndexNow trả về phản hồi mã ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      submitted: payload.urlList.length,
      error: error.message || "Lỗi kết nối mạng IndexNow"
    };
  }
}

module.exports = {
  INDEXNOW_KEY,
  INDEXNOW_HOST,
  INDEXNOW_KEY_LOCATION,
  INDEXNOW_ENDPOINT,
  normalizeUrl,
  buildIndexNowPayload,
  collectIndexNowUrls,
  submitToIndexNow
};
