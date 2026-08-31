const crypto = require("crypto");
const { requireAdmin } = require("./_admin");
const { configuration, sendError, supabaseRequest, text } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!requireAdmin(req, res)) return;
  try {
    const propertyId = text(req.body?.propertyId, 100);
    if (req.method === "DELETE") {
      const position = Number.parseInt(req.body?.position, 10);
      if (!propertyId || !Number.isInteger(position) || position < 1) return res.status(400).json({ ok: false, error: "Thiếu thông tin hình ảnh" });
      const imageQuery = new URLSearchParams({ select: "position,storage_path", property_id: `eq.${propertyId}`, position: `eq.${position}`, limit: "1" });
      const current = await supabaseRequest(`property_images?${imageQuery}`);
      const image = current.data[0];
      if (!image) return res.status(404).json({ ok: false, error: "Không tìm thấy hình ảnh" });
      const storagePath = String(image.storage_path || "");
      if (storagePath && !/^(?:drive|external|hidden):/i.test(storagePath)) {
        const config = configuration();
        const removal = await fetch(`${config.url}/storage/v1/object/property-images/${storagePath.split("/").map(encodeURIComponent).join("/")}`, {
          method: "DELETE",
          headers: { apikey: config.key, ...(!/^sb_(?:secret|publishable)_/i.test(config.key) ? { Authorization: `Bearer ${config.key}` } : {}) },
          signal: AbortSignal.timeout(15000)
        });
        if (!removal.ok && removal.status !== 404) throw new Error(`Không xóa được tệp ảnh (${removal.status})`);
      }
      await supabaseRequest(`property_images?property_id=eq.${encodeURIComponent(propertyId)}&position=eq.${position}`, { method: "PATCH", body: { storage_path: `hidden:${storagePath || `${propertyId}:${position}`}`, public_url: null, source_url: null } });
      const visible = await supabaseRequest(`property_images?select=position&property_id=eq.${encodeURIComponent(propertyId)}&public_url=not.is.null`);
      await supabaseRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`, { method: "PATCH", body: { image_count: visible.data.length, updated_at: new Date().toISOString() } });
      return res.status(200).json({ ok: true, message: "Đã xóa hình ảnh khỏi web" });
    }
    const match = String(req.body?.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!propertyId || !match) return res.status(400).json({ ok: false, error: "Ảnh tải lên không hợp lệ" });
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > 3 * 1024 * 1024) return res.status(413).json({ ok: false, error: "Ảnh phải nhỏ hơn 3 MB" });
    const currentQuery = new URLSearchParams({ select: "position,public_url", property_id: `eq.${propertyId}`, order: "position.desc", limit: "1000" });
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
    const visibleCount = current.data.filter(item => item.public_url).length + 1;
    await supabaseRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`, { method: "PATCH", body: { image_count: visibleCount, updated_at: new Date().toISOString() } });
    res.status(201).json({ ok: true, image: { position, public_url: publicUrl }, message: "Đã thêm hình ảnh" });
  } catch (error) { sendError(res, error); }
};
