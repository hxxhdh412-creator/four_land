const fs = require("fs");
const path = require("path");
const { collectIndexNowUrls, submitToIndexNow, INDEXNOW_HOST, INDEXNOW_KEY } = require("../server/indexnow");

function loadEnvironment() {
  const file = path.join(__dirname, "..", ".env.local");
  const values = {};
  if (fs.existsSync(file)) {
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(line => {
      const separator = line.indexOf("=");
      if (separator > 0 && !line.trim().startsWith("#")) {
        values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
      }
    });
  }
  return values;
}

async function fetchSupabaseProperties(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(env.SUPABASE_SECRET_KEY || "");
  if (!url || !key) return [];

  const query = "properties?select=property_id,address,street,ward,district,status,property_type,price_text,updated_at,received_at&status=neq.archived&order=updated_at.desc&limit=2000";
  const response = await fetch(`${url}/rest/v1/${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });

  if (!response.ok) {
    throw new Error(`Lỗi Supabase: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function main() {
  const env = loadEnvironment();
  console.log(`[IndexNow] Khởi động gửi thông báo URL tới mạng lưới tìm kiếm AI (${INDEXNOW_HOST})...`);
  console.log(`[IndexNow] Mã khóa: ${INDEXNOW_KEY}`);

  let properties = [];
  try {
    properties = await fetchSupabaseProperties(env);
    console.log(`[IndexNow] Đã tải ${properties.length} bất động sản hoạt động từ Supabase.`);
  } catch (error) {
    console.warn(`[IndexNow] Cảnh báo khi tải Supabase: ${error.message}. Sử dụng danh sách URL cơ bản.`);
  }

  const urls = collectIndexNowUrls(properties);
  console.log(`[IndexNow] Đã thu thập ${urls.length} URL canonical để gửi.`);
  if (urls.length > 0) {
    console.log(`[IndexNow] URL mẫu:\n - ${urls.slice(0, 5).join("\n - ")}`);
    if (urls.length > 5) {
      console.log(`   ... và ${urls.length - 5} URL khác.`);
    }
  }

  const result = await submitToIndexNow(urls);
  console.log("[IndexNow] Kết quả:", JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error("[IndexNow] Lỗi nghiêm trọng:", err);
    process.exit(1);
  });
}

module.exports = { main, fetchSupabaseProperties };
