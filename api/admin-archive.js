const { requireAdmin } = require("./_admin");
const { sendError, supabaseRequest, text } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  if (!requireAdmin(req, res)) return;
  try {
    const archived = Boolean(req.body?.archived);
    let propertyIds = [];
    if (Array.isArray(req.body?.propertyIds)) {
      propertyIds = req.body.propertyIds.map(id => text(id, 100)).filter(Boolean);
    } else if (req.body?.propertyId) {
      const single = text(req.body.propertyId, 100);
      if (single) propertyIds = [single];
    }
    if (!propertyIds.length) return res.status(400).json({ ok: false, error: "Thiếu mã bất động sản" });

    const nextStatus = archived ? "archived" : "partial";
    const result = await supabaseRequest(`properties?property_id=in.(${propertyIds.map(id => encodeURIComponent(id)).join(",")})`, {
      method: "PATCH",
      body: { status: nextStatus, updated_at: new Date().toISOString() },
      prefer: "return=representation"
    });
    const updatedCount = result.data?.length || propertyIds.length;
    res.status(200).json({
      ok: true,
      updatedCount,
      message: archived ? `Đã ẩn ${updatedCount} hồ sơ khỏi website` : `Đã khôi phục ${updatedCount} hồ sơ lên website`
    });
  } catch (error) { sendError(res, error); }
};
