// ============================================================================
// FOURLAND CMS FACEBOOK STUDIO & COMPOSIO POSTING ENDPOINT
// ============================================================================

const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { publishToComposioFacebook } = require("../server/cms-facebook");
const { writeFacebookCopy, buildRuleBasedVariants } = require("../server/ai-copywriter");
const {
  getFacebookPages,
  getFacebookPageById,
  getDefaultFacebookPage
} = require("../server/cms-facebook-pages");
const { sendError, supabaseRequest } = require("./_supabase");
const { invalidatePropertiesCache } = require("./properties");

const DEFAULT_POSTER_NODE = {
  tunnelUrl: process.env.FOURLAND_SOCIAL_TUNNEL_URL || "https://drink-owners-prayer-partnerships.trycloudflare.com",
  lanUrl: process.env.FOURLAND_SOCIAL_LAN_URL || "http://192.168.1.50:8889",
  localUrl: "http://127.0.0.1:8788",
  port: 8889,
  host: "hbs-server-50",
  label: "Máy chủ 50 · Nhánh Fourland 24/7 (8889)"
};

async function publishViaServer50Poster({ content, imageUrls = [], pageId, pageName, scheduledAt = "", posterNode, waitMs = 35000 }) {
  const isMockFixture = (Array.isArray(imageUrls) ? imageUrls : []).some((u) => {
    try { return new URL(String(u)).hostname === "example.com"; } catch { return false; }
  });
  if (isMockFixture) {
    throw new Error("SKIP_SERVER50_FOR_MOCK_FIXTURE");
  }

  const node = posterNode || DEFAULT_POSTER_NODE;
  const endpoints = [node.tunnelUrl, node.lanUrl].filter(Boolean).map((u) => String(u).replace(/\/+$/, ""));
  let lastErr = null;

  for (const baseUrl of endpoints) {
    try {
      const res = await fetch(`${baseUrl}/api/fourland/publish-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          imageUrls,
          pageId,
          pageName,
          scheduledAt: scheduledAt || undefined,
          waitMs
        }),
        signal: AbortSignal.timeout(waitMs + 7000)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || `Máy 50 (8889) trả về HTTP ${res.status}`);
      }
      return {
        ok: true,
        engine: "server50-8889",
        queued: Boolean(data.queued),
        scheduled: Boolean(data.scheduled),
        scheduledAt: data.scheduledAt || null,
        postId: data.postId,
        postUrl: data.postUrl || `https://www.facebook.com/profile.php?id=${pageId}`,
        pageName: data.pageName || pageName,
        message: data.message || `Đã đăng bài thành công lên Fanpage ${pageName} (Logic mới Máy 50 · 8889)!`
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Không kết nối được Nhánh Fourland trên Máy 50 (8889)");
}

let cachedPosterNode = null;
let cachedPosterNodeAt = 0;

async function getPosterNodeConfig(request = supabaseRequest) {
  if (cachedPosterNode && Date.now() - cachedPosterNodeAt < 60_000) {
    return cachedPosterNode;
  }
  try {
    const res = await request("cms_settings?select=setting_value&setting_key=eq.facebook_poster_node&limit=1");
    const raw = res?.data?.[0]?.setting_value;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object") {
        cachedPosterNode = { ...DEFAULT_POSTER_NODE, ...parsed };
        cachedPosterNodeAt = Date.now();
        return cachedPosterNode;
      }
    }
  } catch (_) {}
  cachedPosterNode = { ...DEFAULT_POSTER_NODE };
  cachedPosterNodeAt = Date.now();
  return cachedPosterNode;
}

async function savePosterNodeConfig(patch = {}, request = supabaseRequest) {
  const current = await getPosterNodeConfig(request);
  const next = {
    ...current,
    ...(patch.tunnelUrl ? { tunnelUrl: String(patch.tunnelUrl).trim().replace(/\/+$/, "") } : {}),
    ...(patch.lanUrl ? { lanUrl: String(patch.lanUrl).trim().replace(/\/+$/, "") } : {}),
    ...(patch.port ? { port: Number(patch.port) || 8889 } : {}),
    ...(patch.host ? { host: String(patch.host).trim() } : {}),
    updatedAt: new Date().toISOString()
  };
  cachedPosterNode = next;
  cachedPosterNodeAt = Date.now();
  try {
    await request("cms_settings?on_conflict=setting_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: {
        setting_key: "facebook_poster_node",
        setting_value: JSON.stringify(next),
        updated_at: next.updatedAt
      }
    });
  } catch (_) {}
  return next;
}

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest, writer = writeFacebookCopy, posterPublisher = publishViaServer50Poster } = {}) {
  return async function handler(req, res) {
    if (req.url?.includes("/poster-node")) {
      if (req.method === "GET") {
        const node = await getPosterNodeConfig(request);
        return res.status(200).json({ ok: true, data: node });
      }
      if (req.method === "POST") {
        const posterKey = String(req.headers?.["x-poster-key"] || "").trim();
        if (posterKey !== "fourland-server50-8889") {
          const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_READ);
          if (!principal) return;
        }
        const saved = await savePosterNodeConfig(req.body || {}, request);
        return res.status(200).json({ ok: true, data: saved });
      }
      return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    }

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
        const includeLink = body.includeLink !== false;
        const variants = buildRuleBasedVariants(property, {
          link: includeLink ? "https://www.fourland.vn" : ""
        });
        variants[0] = copy.content;

        const posterNode = await getPosterNodeConfig(request);

        return res.status(200).json({
          ok: true,
          data: {
            propertyId,
            tone,
            content: copy.content,
            variants,
            generator: copy.generator,
            cached: Boolean(copy.cached),
            aiWarning: copy.aiError ? "AI tạm lỗi, đã dùng bộ viết dự phòng" : undefined,
            images,
            pageId: targetPage?.pageId,
            pageName: targetPage?.name,
            pages: availablePages,
            posterNode
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
          })
            .then(() => invalidatePropertiesCache())
            .catch(err => console.warn("Update property content notice:", err.message));
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
            else targetPages.push({ pageId: String(pid), name: body.pageName || "FourLand", token: "" });
          }
        }
        if (targetPages.length === 0) {
          const defaultPage = await getDefaultFacebookPage();
          if (defaultPage) targetPages.push(defaultPage);
        }

        const posterNode = await getPosterNodeConfig(request);
        const requestedSchedule = String(body.scheduledAt || "").trim();
        const isFutureSchedule = Boolean(requestedSchedule && !Number.isNaN(Date.parse(requestedSchedule)) && Date.parse(requestedSchedule) > Date.now() + 15000);
        const perPageWaitMs = isFutureSchedule ? 8000 : (targetPages.length > 1 ? 15000 : 35000);

        // Publish across all target pages:
        // BƯỚC 1 (CHÍNH): Đăng / hẹn lịch 24/7 qua Nhánh riêng Máy 50 (Cổng 8889 - tài khoản Nguyễn Ngọc)
        // BƯỚC 2 (DỰ PHÒNG): Chỉ khi đăng ngay (không hẹn giờ) mà Máy 50 lỗi mới fallback qua Composio
        const publishResults = [];
        for (const page of targetPages) {
          const targetPageId = page.server50PageId || page.pageId || process.env.FACEBOOK_PAGE_ID || "104363431784609";
          const targetPageName = page.name || body.pageName || "FourLand";
          try {
            let resPublish = null;
            let usedEngine = "server50-8889";
            try {
              resPublish = await posterPublisher({
                content,
                imageUrls: photoUrls,
                pageId: targetPageId,
                pageName: targetPageName,
                scheduledAt: isFutureSchedule ? requestedSchedule : "",
                posterNode,
                waitMs: perPageWaitMs
              });
            } catch (server50Err) {
              if (isFutureSchedule) {
                throw new Error(`Không đặt được lịch hẹn 24/7 trên Máy 50 (8889): ${server50Err.message}`);
              }
              // Fallback dự phòng qua Composio / Graph API
              usedEngine = "composio-fallback";
              try {
                resPublish = await publishToComposioFacebook({
                  content,
                  imageUrls: photoUrls,
                  pageName: targetPageName,
                  pageId: page.pageId || process.env.FACEBOOK_PAGE_ID || "104363431784609",
                  pageToken: page.token || ""
                });
              } catch (firstErr) {
                const errMsg = String(firstErr?.message || "");
                if (/access token|session has been invalidated|mã lỗi:\s*(?:190|460|463|467)/i.test(errMsg)) {
                  const refreshedPage = await getFacebookPageById(
                    page.pageId || process.env.FACEBOOK_PAGE_ID || "104363431784609",
                    { forceRefresh: true }
                  );
                  if (refreshedPage && refreshedPage.token && refreshedPage.token !== page.token) {
                    resPublish = await publishToComposioFacebook({
                      content,
                      imageUrls: photoUrls,
                      pageName: refreshedPage.name || targetPageName,
                      pageId: refreshedPage.pageId || page.pageId || "104363431784609",
                      pageToken: refreshedPage.token
                    });
                  } else {
                    throw new Error(`Máy 50 (8889): ${server50Err.message} | Dự phòng Composio: ${firstErr.message}`);
                  }
                } else {
                  if (server50Err.message === "SKIP_SERVER50_FOR_MOCK_FIXTURE") throw firstErr;
                  throw new Error(`Máy 50 (8889): ${server50Err.message} | Dự phòng Composio: ${firstErr.message}`);
                }
              }
            }
            publishResults.push({
              pageId: page.pageId,
              pageName: targetPageName,
              engine: resPublish.engine || usedEngine,
              queued: Boolean(resPublish.queued),
              scheduled: Boolean(resPublish.scheduled),
              scheduledAt: resPublish.scheduledAt || null,
              success: true,
              postUrl: resPublish.postUrl,
              message: resPublish.message
            });
          } catch (err) {
            publishResults.push({
              pageId: page.pageId,
              pageName: targetPageName,
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
              ? (isFutureSchedule
                  ? `⏰ Đã hẹn lịch đăng tự động 24/7 lên ${successCount}/${publishResults.length} Fanpage trên Máy 50!`
                  : `Đã xuất bản thành công lên ${successCount}/${publishResults.length} Fanpage! (Đã lưu nội dung vào kho nhà)`)
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
