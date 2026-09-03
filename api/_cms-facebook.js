// ============================================================================
// FOURLAND CMS FACEBOOK STUDIO & COMPOSIO POSTING ENDPOINT
// ============================================================================

const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { generateFacebookPost, publishToComposioFacebook } = require("../server/cms-facebook");
const {
  getFacebookPages,
  getFacebookPageById,
  getDefaultFacebookPage
} = require("../server/cms-facebook-pages");
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

        // Resolve Target Facebook Page
        const targetPage = (body.pageId ? await getFacebookPageById(body.pageId) : null) || await getDefaultFacebookPage();
        const availablePages = await getFacebookPages();

        const tone = body.tone || "hot";
        const postContent = generateFacebookPost(property, {
          tone,
          includeLink: body.includeLink !== false,
          hotline: body.hotline || process.env.FACEBOOK_HOTLINE || "037.6789.808",
          pageName: targetPage?.name || "Ngọc Nhà Tốt"
        });

        const images = (property.property_images || []).map(img => img.public_url).filter(Boolean);

        return res.status(200).json({
          ok: true,
          data: {
            propertyId,
            tone,
            content: postContent,
            images,
            pageId: targetPage?.pageId,
            pageName: targetPage?.name,
            pages: availablePages
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

        // Resolve Target Facebook Pages for Publishing (Single or Multiple)
        const rawPageIds = Array.isArray(body.pageIds) && body.pageIds.length > 0
          ? body.pageIds
          : (body.pageId ? [body.pageId] : []);

        const photoUrls = Array.isArray(body.images) ? body.images : [];
        const apiKey = process.env.COMPOSIO_API_KEY || "ck_e4AHzIDYFZKwFT8XrkwX";

        let targetPages = [];
        if (rawPageIds.length > 0) {
          for (const pid of rawPageIds) {
            const page = await getFacebookPageById(pid);
            if (page) targetPages.push(page);
          }
        }
        if (targetPages.length === 0) {
          const defaultPage = await getDefaultFacebookPage();
          if (defaultPage) targetPages.push(defaultPage);
        }

        // Publish across all target pages
        const publishResults = [];
        for (const page of targetPages) {
          try {
            const resPublish = await publishToComposioFacebook({
              content,
              imageUrls: photoUrls,
              pageName: page.name || body.pageName || "Ngọc Nhà Tốt",
              pageId: page.pageId || process.env.FACEBOOK_PAGE_ID || "106656702112510",
              pageToken: page.token || "",
              apiKey
            });
            publishResults.push({
              pageId: page.pageId,
              pageName: page.name,
              success: true,
              postUrl: resPublish.postUrl,
              message: resPublish.message
            });
          } catch (err) {
            publishResults.push({
              pageId: page.pageId,
              pageName: page.name,
              success: false,
              error: err.message
            });
          }
        }

        const successCount = publishResults.filter(r => r.success).length;
        const failedCount = publishResults.length - successCount;
        const primaryPostUrl = publishResults.find(r => r.success && r.postUrl)?.postUrl || null;

        const summaryMsg = publishResults.length === 1
          ? `${publishResults[0].message || "Đã xuất bản bài viết thành công"} (Đã lưu nội dung vào kho nhà)`
          : `Đã xuất bản thành công lên ${successCount}/${publishResults.length} Fanpage! (Đã lưu nội dung vào kho nhà)`;

        return res.status(200).json({
          ok: successCount > 0,
          data: {
            ...(publishResults[0] || {}),
            total: publishResults.length,
            successCount,
            failedCount,
            postUrl: primaryPostUrl,
            results: publishResults
          },
          message: summaryMsg
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
