const { validRole } = require("./cms-authorization");

function authError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function bearerToken(req) {
  const header = String(req?.headers?.authorization || "").trim();
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw authError("Cần đăng nhập CMS", 401, "AUTH_REQUIRED");
  const token = match[1];
  if (token.length < 20 || token.length > 8192) throw authError("Access token không hợp lệ", 401, "AUTH_INVALID");
  return token;
}

async function verifySupabaseUser(token, config, fetchImpl = fetch) {
  const response = await fetchImpl(`${config.url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.publishableKey || config.key,
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-store"
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw authError("Phiên đăng nhập không hợp lệ hoặc đã hết hạn", 401, "AUTH_INVALID");
  const user = await response.json();
  if (!user?.id) throw authError("Không xác định được người dùng", 401, "AUTH_INVALID");
  return { id: String(user.id), email: user.email ? String(user.email) : null };
}

async function authenticateCmsRequest(req, { config, fetchImpl = fetch, loadProfile }) {
  if (typeof loadProfile !== "function") throw new Error("Thiếu profile loader");
  const token = bearerToken(req);
  const user = await verifySupabaseUser(token, config, fetchImpl);
  const profile = await loadProfile(user.id);
  if (!profile) throw authError("Tài khoản chưa được cấp quyền CMS", 403, "PROFILE_REQUIRED");
  if (!profile.is_active) throw authError("Tài khoản CMS đã bị khóa", 403, "ACCOUNT_DISABLED");
  if (!validRole(profile.role)) throw authError("Vai trò CMS không hợp lệ", 403, "ROLE_INVALID");
  return {
    id: user.id,
    email: user.email,
    displayName: String(profile.display_name || user.email || "Người dùng CMS"),
    role: profile.role,
    isActive: true
  };
}

module.exports = { authError, authenticateCmsRequest, bearerToken, verifySupabaseUser };
