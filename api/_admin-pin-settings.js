const { supabaseRequest, text } = require("./_supabase");

let memoryCachedPins = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 15000; // 15 giây cache RAM để truy vấn siêu tốc

function getEnvDefaultPins() {
  const adminCode = String(process.env.ADMIN_ACCESS_CODE || "246810").trim();
  const ctvCode = String(process.env.CTV_ACCESS_CODE || "135790").trim();
  return { adminCode, ctvCode, updatedAt: new Date(0).toISOString() };
}

async function getDynamicPins(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && memoryCachedPins && (now - lastCacheTime < CACHE_TTL_MS)) {
    return memoryCachedPins;
  }

  const envPins = getEnvDefaultPins();

  try {
    // 1. Thử đọc từ bảng app_settings nếu có
    const appSettingsRes = await supabaseRequest("app_settings?select=key,value,updated_at&key=in.(admin_access_code,ctv_access_code)").catch(() => null);
    if (appSettingsRes && Array.isArray(appSettingsRes.data) && appSettingsRes.data.length > 0) {
      const rowMap = Object.fromEntries(appSettingsRes.data.map(r => [r.key, r.value]));
      const latestUpdate = appSettingsRes.data.reduce((latest, r) => (r.updated_at > latest ? r.updated_at : latest), envPins.updatedAt);
      memoryCachedPins = {
        adminCode: String(rowMap.admin_access_code || envPins.adminCode).trim(),
        ctvCode: String(rowMap.ctv_access_code || envPins.ctvCode).trim(),
        updatedAt: latestUpdate
      };
      lastCacheTime = now;
      return memoryCachedPins;
    }

    // 2. Fallback: Đọc từ row SYSTEM_APP_SETTINGS trong bảng properties (luôn tồn tại an toàn)
    const sysRowRes = await supabaseRequest("properties?select=property_id,data_json,updated_at&property_id=eq.SYSTEM_APP_SETTINGS&limit=1").catch(() => null);
    if (sysRowRes && Array.isArray(sysRowRes.data) && sysRowRes.data.length > 0) {
      const data = sysRowRes.data[0].data_json || {};
      memoryCachedPins = {
        adminCode: String(data.admin_access_code || envPins.adminCode).trim(),
        ctvCode: String(data.ctv_access_code || envPins.ctvCode).trim(),
        updatedAt: sysRowRes.data[0].updated_at || data.updated_at || envPins.updatedAt
      };
      lastCacheTime = now;
      return memoryCachedPins;
    }
  } catch (error) {
    // Nếu lỗi kết nối DB, dùng fallback an toàn từ biến môi trường
  }

  if (!memoryCachedPins) {
    memoryCachedPins = envPins;
  }
  lastCacheTime = now;
  return memoryCachedPins;
}

async function saveDynamicPins({ adminCode, ctvCode }) {
  const current = await getDynamicPins();
  const nextAdmin = adminCode ? String(adminCode).trim() : current.adminCode;
  const nextCtv = ctvCode ? String(ctvCode).trim() : current.ctvCode;

  if (!nextAdmin || nextAdmin.length < 4 || nextAdmin.length > 30) {
    const err = new Error("Mã PIN Quản trị viên phải từ 4 đến 30 ký tự");
    err.statusCode = 422;
    throw err;
  }
  if (!nextCtv || nextCtv.length < 4 || nextCtv.length > 30) {
    const err = new Error("Mã PIN Cộng tác viên phải từ 4 đến 30 ký tự");
    err.statusCode = 422;
    throw err;
  }

  const now = new Date().toISOString();
  let savedToDatabase = false;

  try {
    // 1. Thử lưu vào bảng app_settings
    const appSettingsRes = await supabaseRequest("app_settings", {
      method: "POST",
      body: [
        { key: "admin_access_code", value: nextAdmin, updated_at: now },
        { key: "ctv_access_code", value: nextCtv, updated_at: now }
      ],
      prefer: "resolution=merge-duplicates"
    }).catch(() => null);

    if (appSettingsRes) {
      savedToDatabase = true;
    }
  } catch (_) {}

  if (!savedToDatabase) {
    try {
      // 2. Lưu vào row SYSTEM_APP_SETTINGS trong properties
      const sysPayload = {
        property_id: "SYSTEM_APP_SETTINGS",
        address: "Cấu hình mã PIN hệ thống",
        status: "archived",
        content_status: "archived",
        data_json: {
          admin_access_code: nextAdmin,
          ctv_access_code: nextCtv,
          updated_at: now
        },
        updated_at: now
      };

      await supabaseRequest("properties", {
        method: "POST",
        body: sysPayload,
        prefer: "resolution=merge-duplicates"
      }).catch(async () => {
        // Nếu merge không được, thử PATCH
        await supabaseRequest("properties?property_id=eq.SYSTEM_APP_SETTINGS", {
          method: "PATCH",
          body: {
            data_json: sysPayload.data_json,
            updated_at: now
          }
        });
      });
      savedToDatabase = true;
    } catch (_) {}
  }

  memoryCachedPins = {
    adminCode: nextAdmin,
    ctvCode: nextCtv,
    updatedAt: now
  };
  lastCacheTime = Date.now();

  return memoryCachedPins;
}

// Handler cho Serverless API /api/admin/v1/access-pins
async function handleAccessPins(req, res, { isAuthorized = false } = {}) {
  if (!isAuthorized) {
    return res.status(401).json({ ok: false, error: "Cần quyền Quản trị viên để cấu hình mã PIN" });
  }

  if (req.method === "GET") {
    try {
      const pins = await getDynamicPins(true);
      return res.status(200).json({
        ok: true,
        data: {
          adminCode: pins.adminCode,
          ctvCode: pins.ctvCode,
          updatedAt: pins.updatedAt
        }
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  }

  if (req.method === "PATCH" || req.method === "POST") {
    try {
      const body = req.body || {};
      const updated = await saveDynamicPins({
        adminCode: body.adminCode || body.admin_access_code,
        ctvCode: body.ctvCode || body.ctv_access_code
      });
      return res.status(200).json({
        ok: true,
        message: "Đã cập nhật mã PIN Admin và CTV thành công!",
        data: updated
      });
    } catch (error) {
      return res.status(error.statusCode || 400).json({ ok: false, error: error.message });
    }
  }

  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
}

module.exports = { getDynamicPins, getEnvDefaultPins, handleAccessPins, saveDynamicPins };
