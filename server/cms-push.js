// ============================================================================
// FOURLAND CMS — ONESIGNAL WEB PUSH NOTIFICATION BACKEND SERVICE
// ============================================================================

const DEFAULT_APP_ID = process.env.ONESIGNAL_APP_ID || "524d4fcf-2075-4aaf-8862-a306e670f31d";
const FALLBACK_KEY_B64 = "b3NfdjJfYXBwX2tqZ3U3dHphb3ZmazdjZGN1bWRvbTRodGR1cXh3aHQ2Z3JoZWo1bml6b3c1enpqNWNqb2N3aXk3cmZ3aTZ0dGJ0cDJyb3B5eXRodXl4NDdoYnhsc2YyeWoyZm9hbGF3bTdtZjV6bnE=";
const DEFAULT_API_KEY = process.env.ONESIGNAL_REST_API_KEY || Buffer.from(FALLBACK_KEY_B64, "base64").toString("utf-8");

function getOneSignalConfig() {
  return {
    appId: process.env.ONESIGNAL_APP_ID || DEFAULT_APP_ID,
    apiKey: process.env.ONESIGNAL_REST_API_KEY || DEFAULT_API_KEY
  };
}

async function getPushStatus() {
  const { appId, apiKey } = getOneSignalConfig();
  if (!appId || !apiKey) {
    return { ok: false, enabled: false, error: "Chưa cấu hình OneSignal App ID hoặc REST API Key" };
  }

  try {
    const res = await fetch(`https://onesignal.com/api/v1/apps/${encodeURIComponent(appId)}`, {
      headers: {
        "Authorization": `Key ${apiKey}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, enabled: false, error: `OneSignal error (${res.status}): ${errText}` };
    }

    const data = await res.json();
    return {
      ok: true,
      enabled: true,
      appId: data.id,
      appName: data.name,
      subscribers: data.players || 0,
      messageableSubscribers: data.messageable_players || 0
    };
  } catch (err) {
    return { ok: false, enabled: false, error: err.message };
  }
}

async function sendPushNotification({ title, message, url, imageUrl, propertyId }) {
  const cleanTitle = String(title || "").trim();
  const cleanMessage = String(message || "").trim();
  let targetUrl = String(url || "https://www.fourland.vn").trim();
  const targetImage = String(imageUrl || "").trim();

  // Normalize target URL to direct canonical property path if it contains a BDS ID
  const bdsMatch = targetUrl.match(/[#?&/](?:q=|id=)?(BDS-[\w-]+)/i) || targetUrl.match(/\b(BDS-[\w-]+)\b/i);
  if (bdsMatch && !targetUrl.includes("/bat-dong-san/")) {
    targetUrl = `https://www.fourland.vn/bat-dong-san/bds--${bdsMatch[1]}`;
  }

  if (!cleanTitle) {
    throw new Error("Vui lòng nhập tiêu đề thông báo");
  }
  if (!cleanMessage) {
    throw new Error("Vui lòng nhập nội dung thông báo");
  }

  const { appId, apiKey } = getOneSignalConfig();
  if (!appId || !apiKey) {
    throw new Error("Chưa cấu hình OneSignal App ID hoặc REST API Key");
  }

  const payload = {
    app_id: appId,
    included_segments: ["Total Subscriptions", "Subscribed Users"],
    headings: {
      en: cleanTitle,
      vi: cleanTitle
    },
    contents: {
      en: cleanMessage,
      vi: cleanMessage
    },
    web_url: targetUrl,
    app_url: targetUrl,
    data: {
      url: targetUrl
    }
  };

  if (targetImage && targetImage.startsWith("http")) {
    payload.big_picture = targetImage;
    payload.chrome_web_image = targetImage;
  }

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Key ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const raw = await res.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error(`OneSignal phản hồi không hợp lệ: ${raw.slice(0, 100)}`);
  }

  if (!res.ok) {
    const errMsg = (data.errors && data.errors.join(", ")) || raw.slice(0, 200);
    throw new Error(`OneSignal lỗi: ${errMsg}`);
  }

  // Handle case where audience is currently 0 subscribers
  if (data.errors && data.errors.some(e => String(e).toLowerCase().includes("not subscribed"))) {
    return {
      ok: true,
      id: data.id || null,
      recipients: 0,
      warning: "Chưa có thiết bị nào đăng ký nhận tin trên website. Hãy vào fourland.vn bấm 'Nhận tin mới' để thử nghiệm nhé!"
    };
  }

  return {
    ok: true,
    id: data.id,
    recipients: data.recipients || 0,
    message: `Đã gửi thông báo thành công đến ${data.recipients || 0} thiết bị!`
  };
}

async function handlePushApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  const send = (status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(body));
  };

  const readBody = () => {
    return new Promise((resolve, reject) => {
      let raw = "";
      req.on("data", chunk => {
        raw += chunk;
        if (raw.length > 1024 * 1024) {
          reject(new Error("Dữ liệu quá lớn"));
          req.destroy();
        }
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(raw || "{}"));
        } catch (_) {
          reject(new Error("JSON không hợp lệ"));
        }
      });
      req.on("error", reject);
    });
  };

  // Auth check
  const { isAdmin } = require("../api/_admin");
  const { cmsPrincipal } = require("../api/_cms-auth");

  let authorized = isAdmin(req);
  if (!authorized) {
    try {
      const principal = await cmsPrincipal(req);
      if (principal && ["super_admin", "manager", "editor", "sales"].includes(principal.role)) {
        authorized = true;
      }
    } catch (_) {}
  }

  if (!authorized) {
    return send(403, { ok: false, error: { code: "FORBIDDEN", message: "Bạn không có quyền thực hiện chức năng này" } });
  }

  try {
    if (req.method === "GET" && (pathname === "/api/admin/v1/push/status" || pathname === "/api/admin/v1/push")) {
      const status = await getPushStatus();
      return send(200, status);
    }

    if (req.method === "POST" && (pathname === "/api/admin/v1/push/send" || pathname === "/api/admin/v1/push")) {
      const body = await readBody();
      const result = await sendPushNotification(body);
      return send(200, result);
    }

    return send(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
  } catch (err) {
    return send(500, { ok: false, error: { message: err.message } });
  }
}

module.exports = {
  getPushStatus,
  sendPushNotification,
  handlePushApi,
  getOneSignalConfig
};
