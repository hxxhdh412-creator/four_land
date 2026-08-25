const { sendError, supabaseRequest, text } = require("./_supabase");

function normalizePhone(value) {
  let phone = String(value || "").replace(/\D/g, "");
  if (phone.startsWith("84") && phone.length === 11) phone = `0${phone.slice(2)}`;
  return phone;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  try {
    const propertyId = text(req.body?.propertyId, 100);
    const phone = normalizePhone(req.body?.phone);
    const sourceUrl = text(req.body?.sourceUrl, 500);
    if (!propertyId) return res.status(400).json({ ok: false, error: "Thiếu mã bất động sản" });
    if (!/^0(?:3|5|7|8|9)\d{8}$/.test(phone)) return res.status(400).json({ ok: false, error: "Số điện thoại chưa đúng định dạng" });

    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const duplicate = new URLSearchParams({ select: "id", property_id: `eq.${propertyId}`, phone: `eq.${phone}`, created_at: `gte.${since}`, limit: "1" });
    const existing = await supabaseRequest(`property_inquiries?${duplicate}`);
    if (existing.data.length) return res.status(200).json({ ok: true, duplicate: true, message: "Yêu cầu của bạn đã được ghi nhận" });

    const result = await supabaseRequest("property_inquiries", {
      method: "POST",
      prefer: "return=representation",
      body: { property_id: propertyId, phone, source_url: sourceUrl || null, status: "new" }
    });
    res.status(201).json({ ok: true, inquiryId: result.data[0]?.id, message: "Đã gửi yêu cầu. Four Land sẽ liên hệ bạn sớm." });
  } catch (error) { sendError(res, error); }
};
