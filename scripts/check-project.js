const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const required = [
  "AGENTS.md",
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/BRAND_SYSTEM.md",
  "docs/DATA_MODEL.md",
  "docs/DEVELOPMENT.md",
  "index.html",
  "assets/app.css",
  "assets/app.js",
  "assets/property.css",
  "api/_admin.js",
  "api/_supabase.js",
  "api/seo-property.js",
  "server/seo.js",
  "preview-server.js"
];

const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Thiếu file bắt buộc:\n- ${missing.join("\n- ")}`);
  process.exit(1);
}

const javascriptFiles = [
  ...fs.readdirSync(path.join(root, "api")).filter(file => file.endsWith(".js")).map(file => path.join("api", file)),
  "assets/app.js",
  "preview-server.js",
  "scripts/sync-sheet-to-supabase.js",
  "scripts/inspect-supabase-schema.js",
  "scripts/generate-sitemap.js",
  "scripts/check-project.js",
  "server/seo.js",
  "server/property-field-ownership.js",
  "server/cms-authorization.js",
  "server/cms-audit.js",
  "server/cms-authentication.js",
  "server/cms-dashboard.js",
  "server/cms-properties.js",
  "server/cms-property-detail.js",
  "server/cms-property-validation.js",
  "server/cms-review-queue.js",
  "server/cms-system-health.js",
  "server/cms-mutations.js",
  "server/cms-owners.js",
  "server/smart-matcher.js",
  "admin/admin.js"
];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`Lỗi cú pháp: ${file}\n${result.stderr || result.stdout}`);
    process.exit(result.status || 1);
  }
}

const css = fs.readFileSync(path.join(root, "assets/app.css"), "utf8");
if (!css.includes("Be Vietnam Pro")) {
  console.error("Không tìm thấy font thương hiệu Be Vietnam Pro");
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checkedJavaScript: javascriptFiles.length, requiredFiles: required.length }));
