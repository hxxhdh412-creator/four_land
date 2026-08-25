const crypto = require("crypto");
const { requireAdmin } = require("./_admin");
const { configuration, sendError, supabaseRequest, text } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!requireAdmin(req, res)) return;
  try {
    const propertyId = text(req.body?.propertyId, 100);
    const match = String(req.body?.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!propertyId || !match) return res.status(400).json({ ok: false, error: "Ảnh tải lên không hợp lệ" });
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > 3 * 1024 * 1024) return res.status(413).json({ ok: false, error: "Ảnh phải nhỏ hơn 3 MB" });
    const currentQuery = new URLSearchParams({ select: "position", property_id: `eq.${propertyId}`, order: "position.desc", limit: "1" });
    const current = await supabaseRequest(`property_images?${currentQuery}`);
    const position = Number(current.data[0]?.position || 0) + 1;
    const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
    const storagePath = `${propertyId}/${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${extension}`;
    const config = configuration();
    const upload = await fetch(`${config.url}/storage/v1/object/property-images/${encodeURI(storagePath)}`, {
      method: "POST",
      headers: { apikey: config.key, ...(!/^sb_(?:secret|publishable)_/i.test(config.key) ? { Authorization: `Bearer ${config.key}` } : {}), "Content-Type": match[1], "x-upsert": "false" },
      body: buffer,
      signal: AbortSignal.timeout(15000)
    });
    if (!upload.ok) throw new Error(`Không tải được ảnh (${upload.status})`);
    const publicUrl = `${config.url}/storage/v1/object/public/property-images/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
    await supabaseRequest("property_images", { method: "POST", body: { property_id: propertyId, position, storage_path: storagePath, public_url: publicUrl }, prefer: "return=representation" });
    await supabaseRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`, { method: "PATCH", body: { image_count: position, updated_at: new Date().toISOString() } });
    res.status(201).json({ ok: true, image: { position, public_url: publicUrl }, message: "Đã thêm hình ảnh" });
  } catch (error) { sendError(res, error); }
};
