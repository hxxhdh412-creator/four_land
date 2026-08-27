const { requireAdmin } = require("./_admin");
const { sendError, supabaseRequest, text } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (!["PATCH", "DELETE"].includes(req.method)) {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  if (!requireAdmin(req, res)) return;
  try {
    let propertyIds = [];
    if (Array.isArray(req.body?.propertyIds)) {
      propertyIds = req.body.propertyIds.map(id => text(id, 100)).filter(Boolean);
    } else if (req.body?.propertyId) {
      const single = text(req.body.propertyId, 100);
      if (single) propertyIds = [single];
    }
    if (!propertyIds.length) return res.status(400).json({ ok: false, error: "Thiếu mã bất động sản" });

    const inList = propertyIds.map(id => encodeURIComponent(id)).join(",");

    // XÓA VĨNH VIỄN (HARD DELETE)
    if (req.method === "DELETE") {
      await supabaseRequest(`property_images?property_id=in.(${inList})`, { method: "DELETE" }).catch(() => {});
      await supabaseRequest(`properties?property_id=in.(${inList})`, { method: "DELETE" });
      return res.status(200).json({
        ok: true,
        deletedCount: propertyIds.length,
        message: propertyIds.length === 1 ? "Đã xóa vĩnh viễn hồ sơ thành công!" : `Đã xóa vĩnh viễn ${propertyIds.length} hồ sơ!`
      });
    }

    // ẨN / KHÔI PHỤC (SOFT DELETE / RESTORE)
    const archived = Boolean(req.body?.archived);
    const nextStatus = archived ? "archived" : "partial";
    const result = await supabaseRequest(`properties?property_id=in.(${inList})`, {
      method: "PATCH",
      body: { status: nextStatus, updated_at: new Date().toISOString() },
      prefer: "return=representation"
    });
    const updatedCount = result.data?.length || propertyIds.length;
    res.status(200).json({
      ok: true,
      updatedCount,
      message: archived
        ? (updatedCount === 1 ? "Đã ẩn hồ sơ khỏi website" : `Đã ẩn ${updatedCount} hồ sơ khỏi website`)
        : (updatedCount === 1 ? "Đã khôi phục hồ sơ lên website" : `Đã khôi phục ${updatedCount} hồ sơ lên website`)
    });
  } catch (error) { sendError(res, error); }
};

