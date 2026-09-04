const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const envFile = path.join(root, ".env.local");

if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, "utf8").split(/\r?\n/).forEach(line => {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.trim().startsWith("#")) {
      const key = line.slice(0, separator).trim();
      const envValue = line.slice(separator + 1).trim();
      if (!process.env[key]) process.env[key] = envValue;
    }
  });
}

const { fetchPublicProperties } = require("../api/sitemap");
const { renderSitemap } = require("../server/seo");

async function generateSitemap() {
  const properties = await fetchPublicProperties();
  const sitemap = renderSitemap(properties);
  if (!sitemap.includes("<urlset") || !sitemap.includes("<loc>")) throw new Error("Sitemap sinh ra không hợp lệ");
  console.log(`Validated dynamic sitemap with ${properties.length + 1} URLs.`);
  return sitemap;
}

if (require.main === module) {
  generateSitemap().catch(error => {
    console.error(`Không thể tạo sitemap: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { generateSitemap };
