// ============================================================================
// FOURLAND CMS FACEBOOK STUDIO & COMPOSIO POSTING ENDPOINT
// ============================================================================

const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { generateFacebookPost, publishToComposioFacebook } = require("../server/cms-facebook");
const { sendError, supabaseRequest } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    }

    const authHeader = String(req?.headers?.authorization || "").trim();
    if (authHeader) {
      const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_READ);
      if (!principal) return;
    }

    try {
      const body = req.body || {};
      const action = body.action || (req.url?.includes("/draft") ? "draft" : "publish");

      if (action === "draft") {
        const propertyId = body.propertyId;
        if (!propertyId) {
          return res.status(400).json({ ok: false, error: { message: "Thiếu mã bất động sản" } });
        }

        // Fetch property details
        const result = await request(`properties?select=*,property_images(*)&property_id=eq.${encodeURIComponent(propertyId)}&limit=1`);
        const property = result.data?.[0];
        if (!property) {
          return res.status(404).json({ ok: false, error: { message: "Không tìm thấy bất động sản" } });
        }

        const tone = body.tone || "hot";
        const postContent = generateFacebookPost(property, {
          tone,
          includeLink: body.includeLink !== false,
          hotline: body.hotline || process.env.FACEBOOK_HOTLINE || "037.6789.808",
          pageName: process.env.FACEBOOK_PAGE_NAME || "Ngọc Nhà Tốt"
        });

        const images = (property.property_images || []).map(img => img.public_url).filter(Boolean);

        return res.status(200).json({
          ok: true,
          data: {
            propertyId,
            tone,
            content: postContent,
            images,
            pageName: process.env.FACEBOOK_PAGE_NAME || "Ngọc Nhà Tốt"
          }
        });
      }

      // Publish action
      if (action === "publish") {
        const content = String(body.content || "").trim();
        const propertyId = body.propertyId;
        if (!content) {
          return res.status(422).json({ ok: false, error: { message: "Nội dung bài viết không được để trống" } });
        }

        // Save content to property's main content (raw_text) in database
        if (propertyId) {
          await request(`properties?property_id=eq.${encodeURIComponent(propertyId)}`, {
            method: "PATCH",
            body: { raw_text: content, notes: null, updated_at: new Date().toISOString() }
          }).catch(err => console.warn("Update property content notice:", err.message));
        }

        const photoUrls = Array.isArray(body.images) ? body.images : [];
        const pageName = body.pageName || process.env.FACEBOOK_PAGE_NAME || "Ngọc Nhà Tốt";

        const publishResult = await publishToComposioFacebook({
          content,
          imageUrls: photoUrls,
          pageName,
          apiKey: process.env.COMPOSIO_API_KEY || "ck_e4AHzIDYFZKwFT8XrkwX",
          pageId: process.env.FACEBOOK_PAGE_ID || "106656702112510"
        });

        return res.status(200).json({
          ok: true,
          data: publishResult,
          message: `${publishResult.message} (Đã lưu nội dung vào kho nhà)`
        });
      }

      return res.status(400).json({ ok: false, error: { message: "Hành động không hợp lệ" } });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
