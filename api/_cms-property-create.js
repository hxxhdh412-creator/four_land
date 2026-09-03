const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { sendError, supabaseRequest, text } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    }
    const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_EDIT);
    if (!principal) return;

    try {
      const body = req.body || {};
      const address = text(body.address, 300);
      if (!address) {
        return res.status(422).json({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Địa chỉ bất động sản không được để trống",
            fieldErrors: { address: "Địa chỉ là bắt buộc" }
          }
        });
      }

      const now = new Date().toISOString();
      const propertyId = `FL_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      
      const rawImageUrls = Array.isArray(body.images)
        ? body.images
        : String(body.image_urls || "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

      const propertyRow = {
        property_id: propertyId,
        address: address,
        district: text(body.district, 100) || null,
        ward: text(body.ward, 100) || null,
        street: text(body.street, 150) || null,
        property_type: text(body.property_type, 120) || "Nhà phố",
        price_text: text(body.price_text, 100) || null,
        area_text: text(body.area_text, 100) || null,
        dimensions: text(body.dimensions, 100) || null,
        structure: text(body.structure, 1000) || null,
        bedrooms: Number.isInteger(Number(body.bedrooms)) && Number(body.bedrooms) >= 0 ? Number(body.bedrooms) : null,
        bathrooms: Number.isInteger(Number(body.bathrooms)) && Number(body.bathrooms) >= 0 ? Number(body.bathrooms) : null,
        legal: text(body.legal, 150) || null,
        phone: text(body.phone, 30) || null,
        commission: text(body.commission, 150) || null,
        notes: text(body.notes, 2000) || null,
        raw_text: text(body.notes, 2000) || `Hồ sơ tạo trực tiếp: ${address}`,
        status: body.status || "ready",
        content_status: "published",
        availability_status: "available",
        quality_status: "complete",
        is_featured: Boolean(body.is_featured),
        image_count: rawImageUrls.length,
        received_at: now,
        updated_at: now,
        data_json: {
          source: "manual_cms",
          created_by: principal.displayName || principal.id,
          created_at: now,
          listing_type: text(body.listing_type, 30) || (String(body.price_text || "").includes("tỷ") ? "sale" : "rent"),
          owner_name: text(body.owner_name, 120) || null,
          owner_role: text(body.owner_role, 80) || "Chủ nhà trực tiếp",
          owner: {
            name: text(body.owner_name, 120) || null,
            role: text(body.owner_role, 80) || "Chủ nhà trực tiếp",
            phone: text(body.phone, 30) || null
          }
        }
      };

      const result = await request("properties", {
        method: "POST",
        body: propertyRow,
        prefer: "return=representation"
      });

      const inserted = result.data?.[0] || propertyRow;

      // Insert image records if provided
      if (rawImageUrls.length > 0) {
        const imageRows = rawImageUrls.map((url, idx) => ({
          property_id: propertyId,
          position: idx + 1,
          public_url: url,
          file_name: `img_${idx + 1}.jpg`,
          file_path: url
        }));
        await request("property_images", {
          method: "POST",
          body: imageRows
        }).catch(err => console.error("CMS image insert warning:", err.message));
      }

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(201).json({
        ok: true,
        data: { property: inserted },
        message: "Đã tạo hồ sơ bất động sản thành công"
      });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
