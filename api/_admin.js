const crypto = require("crypto");

const COOKIE_NAME = "fourland_admin";
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // Lưu phiên theo thiết bị 365 ngày
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 31536000 giây (1 năm)

function secrets() {
  const code = String(process.env.ADMIN_ACCESS_CODE || "246810");
  const ctvCode = String(process.env.CTV_ACCESS_CODE || "135790");
  const secret = String(process.env.ADMIN_SESSION_SECRET || "fourland-warehouse-production-session-secret-key-32chars");
  return { code, ctvCode, secret };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function normalizeDeviceId(input) {
  const clean = String(input || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return clean.length >= 6 ? clean : "";
}

function createSession(role = "admin", options = {}) {
  const { secret } = secrets();
  const validRole = role === "ctv" ? "ctv" : "admin";
  const rawDeviceId = typeof options === "string" ? options : options?.deviceId;
  const deviceId = normalizeDeviceId(rawDeviceId);
  const exp = Date.now() + SESSION_TTL_MS;
  const sessionData = { role: validRole, exp };
  if (deviceId) sessionData.did = deviceId;
  const payload = Buffer.from(JSON.stringify(sessionData)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

function cookieValue(req) {
  const raw = String(req?.headers?.cookie || "");
  const item = raw.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
  return item ? decodeURIComponent(item.slice(COOKIE_NAME.length + 1)) : "";
}

function headerTokenValue(req) {
  const headers = req?.headers || {};
  const direct = String(headers["x-fourland-access"] || headers["x-admin-token"] || "").trim();
  if (direct && direct.includes(".")) return direct;

  const authHeader = String(headers.authorization || "").trim();
  const bearerMatch = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  if (bearerMatch && bearerMatch[1].includes(".")) return bearerMatch[1];

  const queryToken = String(req?.query?.access_token || "").trim();
  if (queryToken && queryToken.includes(".")) return queryToken;

  return "";
}

function verifyToken(token) {
  try {
    const rawToken = String(token || "").trim();
    if (!rawToken) return null;
    const { secret } = secrets();
    const [payload, supplied] = rawToken.split(".");
    if (!payload || !supplied || !safeEqual(supplied, signature(payload, secret))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Number(data.exp) <= Date.now()) return null;
    if (!["admin", "ctv"].includes(data.role)) return null;
    return {
      role: data.role,
      deviceId: normalizeDeviceId(data.did) || null,
      exp: Number(data.exp),
      token: rawToken
    };
  } catch {
    return null;
  }
}

function getAuthSession(req) {
  // Ưu tiên kiểm tra cả header token (lưu theo ID máy ở localStorage) và cookie trình duyệt
  const candidates = [headerTokenValue(req), cookieValue(req)].filter(Boolean);
  for (const candidate of candidates) {
    const verified = verifyToken(candidate);
    if (verified) return verified;
  }
  return null;
}

function getAuthRole(req) {
  const session = getAuthSession(req);
  return session ? session.role : null;
}

function isAdmin(req) {
  return getAuthRole(req) === "admin";
}

function isCtv(req) {
  return getAuthRole(req) === "ctv";
}

function canViewAddress(req) {
  const role = getAuthRole(req);
  return role === "admin" || role === "ctv";
}

function canDownloadImages(req) {
  const role = getAuthRole(req);
  return role === "admin" || role === "ctv";
}

function requireAdmin(req, res) {
  const role = getAuthRole(req);
  if (role === "admin") return true;
  if (role === "ctv") {
    res.status(403).json({ ok: false, error: "Tài khoản Cộng tác viên không có quyền thực hiện thao tác này" });
    return false;
  }
  res.status(401).json({ ok: false, error: "Phiên quản trị đã hết hạn" });
  return false;
}

function isInsecureLocalRequest(req) {
  if (!req || !req.headers) return false;
  const proto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  if (proto === "https") return false;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function sessionCookie(token, req) {
  const expires = new Date(Date.now() + SESSION_TTL_MS).toUTCString();
  const secureFlag = isInsecureLocalRequest(req) ? "" : "; Secure";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Expires=${expires}`;
}

function clearSessionCookie(req) {
  const secureFlag = isInsecureLocalRequest(req) ? "" : "; Secure";
  return `${COOKIE_NAME}=; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

module.exports = {
  COOKIE_MAX_AGE,
  SESSION_TTL_MS,
  canDownloadImages,
  canViewAddress,
  clearSessionCookie,
  createSession,
  getAuthRole,
  getAuthSession,
  isAdmin,
  isCtv,
  normalizeDeviceId,
  requireAdmin,
  safeEqual,
  secrets,
  sessionCookie,
  verifyToken
};

