const {
  SESSION_TTL_MS,
  clearSessionCookie,
  createSession,
  getAuthSession,
  normalizeDeviceId,
  safeEqual,
  secrets,
  sessionCookie
} = require("./_admin");
const { getDynamicPins, rotateCtvPin } = require("./_admin-pin-settings");
const { sendError } = require("./_supabase");

module.exports = async function handler(req, res) {
  try {
    if (typeof res.setHeader === "function") {
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    }

    const requestDeviceId = normalizeDeviceId(
      req.body?.deviceId || req.headers?.["x-fourland-device"] || req.query?.deviceId
    );
    const currentSession = getAuthSession(req);
    const currentRole = currentSession ? currentSession.role : null;

    if (req.method === "GET") {
      if (currentRole) {
        const effectiveDeviceId = requestDeviceId || currentSession.deviceId || null;
        const refreshedToken = createSession(currentRole, { deviceId: effectiveDeviceId });
        res.setHeader("Set-Cookie", sessionCookie(refreshedToken, req));
        return res.status(200).json({
          ok: true,
          authenticated: true,
          role: currentRole,
          token: refreshedToken,
          deviceId: effectiveDeviceId,
          expiresAt: Date.now() + SESSION_TTL_MS
        });
      }
      return res.status(200).json({ ok: true, authenticated: false, role: null });
    }

    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", clearSessionCookie(req));
      return res.status(200).json({ ok: true, authenticated: false, role: null, message: "Đã thoát quyền truy cập" });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const inputCode = String(req.body?.code || "").trim();
    const dynamicPins = await getDynamicPins(true).catch(() => ({}));
    const envPins = secrets();

    const adminCode = dynamicPins.adminCode || envPins.code;
    const ctvCode = dynamicPins.ctvCode || envPins.ctvCode;

    let authenticatedRole = null;
    let successMessage = "";

    if (safeEqual(inputCode, adminCode)) {
      authenticatedRole = "admin";
      successMessage = "Đã mở toàn quyền Quản trị viên (Đã lưu trên thiết bị này).";
    } else if (safeEqual(inputCode, ctvCode)) {
      authenticatedRole = "ctv";
      await rotateCtvPin().catch(() => null);
      successMessage = "Đã mở quyền Cộng tác viên (Xem trọn vẹn địa chỉ nhà · Đã lưu trên thiết bị này).";
    } else {
      return res.status(401).json({ ok: false, error: "Mã truy cập không đúng" });
    }

    const token = createSession(authenticatedRole, { deviceId: requestDeviceId });
    res.setHeader("Set-Cookie", sessionCookie(token, req));
    return res.status(200).json({
      ok: true,
      authenticated: true,
      role: authenticatedRole,
      token,
      deviceId: requestDeviceId || null,
      expiresAt: Date.now() + SESSION_TTL_MS,
      message: successMessage
    });
  } catch (error) {
    sendError(res, error);
  }
};


