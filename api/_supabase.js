function configuration() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!/^https:\/\/.+\.supabase\.co$/i.test(url) || key.length < 20) {
    const error = new Error("Kho dữ liệu chưa được cấu hình");
    error.statusCode = 503;
    throw error;
  }
  return { url, key };
}

async function supabaseRequest(route, { count = false, method = "GET", body, prefer = "" } = {}) {
  const config = configuration();
  try {
    const response = await fetch(`${config.url}/rest/v1/${route}`, {
      method,
      headers: {
        apikey: config.key,
        ...(!/^sb_(?:secret|publishable)_/i.test(config.key) ? { Authorization: `Bearer ${config.key}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...((count || prefer) ? { Prefer: [count ? "count=exact" : "", prefer].filter(Boolean).join(",") } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000)
    });
    const text = await response.text();
    if (!response.ok) {
      let message = text;
      try { const parsed = JSON.parse(text); message = parsed.message || parsed.error || text; } catch {}
      const error = new Error(`Không truy vấn được dữ liệu (${response.status}): ${String(message).slice(0, 240)}`);
      error.statusCode = 502;
      throw error;
    }
    return {
      data: text ? JSON.parse(text) : [],
      count: Number((response.headers.get("content-range") || "/0").split("/")[1]) || 0
    };
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError" || String(error.message || "").toLowerCase().includes("timeout") || String(error.message || "").toLowerCase().includes("aborted")) {
      const err = new Error("Máy chủ dữ liệu phản hồi chậm, đang tự động kết nối lại...");
      err.statusCode = 504;
      throw err;
    }
    throw error;
  }
}


function text(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function safeSearch(value) {
  return text(value).replace(/[,*()"']/g, " ").replace(/\s+/g, " ").trim();
}

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ ok: false, error: error.message || "Lỗi máy chủ" });
}

module.exports = { configuration, safeSearch, sendError, supabaseRequest, text };
