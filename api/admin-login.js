const { createSession, isAdmin, safeEqual, secrets, sessionCookie } = require("./_admin");
const { sendError } = require("./_supabase");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") return res.status(200).json({ ok: true, authenticated: isAdmin(req) });
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    const code = String(req.body?.code || "");
    if (!safeEqual(code, secrets().code)) return res.status(401).json({ ok: false, error: "Mã truy cập không đúng" });
    res.setHeader("Set-Cookie", sessionCookie(createSession()));
    return res.status(200).json({ ok: true, authenticated: true });
  } catch (error) { sendError(res, error); }
};
