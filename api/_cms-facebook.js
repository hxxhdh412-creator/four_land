// ============================================================================
// FOURLAND CMS FACEBOOK STUDIO & COMPOSIO POSTING ENDPOINT
// ============================================================================

const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { publishToComposioFacebook } = require("../server/cms-facebook");
const { writeFacebookCopy } = require("../server/ai-copywriter");
const {
  getFacebookPages,
  getFacebookPageById,
  getDefaultFacebookPage
} = require("../server/cms-facebook-pages");
const { sendError, supabaseRequest } = require("./_supabase");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest, writer = writeFacebookCopy } = {}) {
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
        // Viết bài theo prompt copywriter Fourland (AI nếu đã cấu hình, ngược lại bộ quy tắc cùng phong cách)
        const copy = await writer(property, {
          tone,
          includeLink: body.includeLink !== false,
          regenerate: body.regenerate === true
        });

        const images = (property.property_images || []).map(img => img.public_url).filter(Boolean);

        return res.status(200).json({
          ok: true,
          data: {
            propertyId,
            tone,
            content: copy.content,
            generator: copy.generator,
            cached: Boolean(copy.cached),
            aiWarning: copy.aiError ? "AI tạm lỗi, đã dùng bộ viết dự phòng" : undefined,
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
              pageName: page.name || body.pageName || "FourLand",
              pageId: page.pageId || process.env.FACEBOOK_PAGE_ID || "104363431784609",
              pageToken: page.token || ""
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
        const firstError = publishResults.find(r => !r.success)?.error;
        const summaryMsg = publishResults.length === 1
          ? (publishResults[0].success
              ? `${publishResults[0].message || "Đã xuất bản bài viết thành công"} (Đã lưu nội dung vào kho nhà)`
              : (publishResults[0].error || "Đăng bài lên Facebook thất bại"))
          : (successCount > 0
              ? `Đã xuất bản thành công lên ${successCount}/${publishResults.length} Fanpage! (Đã lưu nội dung vào kho nhà)`
              : `Đăng bài thất bại trên toàn bộ ${publishResults.length} Fanpage!`);

        return res.status(200).json({
          ok: successCount > 0,
          error: successCount === 0 ? { message: firstError || summaryMsg } : undefined,
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
