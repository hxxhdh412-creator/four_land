const { createSession, getAuthRole, safeEqual, secrets, sessionCookie } = require("./_admin");
const { getDynamicPins } = require("./_admin-pin-settings");
const { sendError } = require("./_supabase");

module.exports = async function handler(req, res) {
  try {
    const currentRole = getAuthRole(req);
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, authenticated: Boolean(currentRole), role: currentRole });
    }
    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", "fourland_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure");
      return res.status(200).json({ ok: true, authenticated: false, role: null, message: "Đã thoát quyền truy cập" });
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const inputCode = String(req.body?.code || "").trim();
    const dynamicPins = await getDynamicPins().catch(() => ({}));
    const envPins = secrets();

    const adminCode = dynamicPins.adminCode || envPins.code;
    const ctvCode = dynamicPins.ctvCode || envPins.ctvCode;

    let authenticatedRole = null;
    let successMessage = "";

    if (safeEqual(inputCode, adminCode)) {
      authenticatedRole = "admin";
      successMessage = "Đã mở toàn quyền Quản trị viên.";
    } else if (safeEqual(inputCode, ctvCode)) {
      authenticatedRole = "ctv";
      successMessage = "Đã mở quyền Cộng tác viên (Xem trọn vẹn địa chỉ nhà).";
    } else {
      return res.status(401).json({ ok: false, error: "Mã truy cập không đúng" });
    }

    res.setHeader("Set-Cookie", sessionCookie(createSession(authenticatedRole)));
    return res.status(200).json({ ok: true, authenticated: true, role: authenticatedRole, message: successMessage });
  } catch (error) { sendError(res, error); }
};


