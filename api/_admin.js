const crypto = require("crypto");

const COOKIE_NAME = "fourland_admin";

function secrets() {
  const code = String(process.env.ADMIN_ACCESS_CODE || "246810");
  const secret = String(process.env.ADMIN_SESSION_SECRET || "fourland-warehouse-production-session-secret-key-32chars");
  return { code, secret };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSession() {
  const { secret } = secrets();
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

function cookieValue(req) {
  const raw = String(req.headers.cookie || "");
  const item = raw.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
  return item ? decodeURIComponent(item.slice(COOKIE_NAME.length + 1)) : "";
}

function isAdmin(req) {
  try {
    const { secret } = secrets();
    const [payload, supplied] = cookieValue(req).split(".");
    if (!payload || !supplied || !safeEqual(supplied, signature(payload, secret))) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.role === "admin" && Number(data.exp) > Date.now();
  } catch { return false; }
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.status(401).json({ ok: false, error: "Phiên quản trị đã hết hạn" });
  return false;
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}

module.exports = { createSession, isAdmin, requireAdmin, safeEqual, secrets, sessionCookie };
