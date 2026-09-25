const { canDownloadImages } = require("./_admin");
const { sendError } = require("./_supabase");

function sanitizeFilename(name) {
  const clean = String(name || "")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.{2,}/g, ".")
    .trim();
  return clean || "fourland-bds-image.jpg";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // Bảo vệ phân quyền: Chỉ CTV hoặc Admin mới được phép tải ảnh
  if (!canDownloadImages(req)) {
    return res.status(403).json({
      ok: false,
      error: "Chỉ Cộng tác viên (CTV) hoặc Quản trị viên mới có quyền tải hình ảnh này về máy."
    });
  }

  const rawUrl = String(req.query?.url || "").trim();
  if (!rawUrl || (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://"))) {
    return res.status(400).json({ ok: false, error: "URL hình ảnh không hợp lệ" });
  }

  const filename = sanitizeFilename(req.query?.filename);

  try {
    const upstreamRes = await fetch(rawUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FourlandWarehouse/1.0"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!upstreamRes.ok) {
      return res.status(502).json({
        ok: false,
        error: `Không thể tải hình ảnh từ máy chủ nguồn (${upstreamRes.status})`
      });
    }

    const contentType = upstreamRes.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await upstreamRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "private, no-transform, max-age=3600");

    return res.status(200).send(buffer);
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({ ok: false, error: "Quá thời gian kết nối tới máy chủ ảnh" });
    }
    return sendError(res, error);
  }
};
