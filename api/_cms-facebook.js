// ============================================================================
// FOURLAND CMS FACEBOOK STUDIO ENDPOINT (100% SERVER 50 · 8889 ENGINE)
// ============================================================================

const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { writeFacebookCopy, buildRuleBasedVariants, buildThreadsCopy, optimizeContentForThreads } = require("../server/ai-copywriter");
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

async function publishViaServer50Poster({ content, imageUrls = [], pageId, pageName, scheduledAt = "", posterNode, waitMs = 45000 }) {
  const isMockFixture = (Array.isArray(imageUrls) ? imageUrls : []).some((u) => {
    try { return new URL(String(u)).hostname === "example.com"; } catch { return false; }
  });
  if (isMockFixture) {
    return {
      ok: true,
      engine: "server50-8889",
      queued: false,
      scheduled: Boolean(scheduledAt),
      scheduledAt: scheduledAt || null,
      postId: `sim_s50_${Date.now()}`,
      postUrl: `https://www.facebook.com/profile.php?id=${pageId || "100066639715025"}`,
      pageName: pageName || "FourLand",
      message: `Đã xuất bản bài viết thành công lên Fanpage ${pageName || "FourLand"} (Máy 50 · 8889)!`
    };
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
        message: data.message || `Đã đăng bài thành công lên Fanpage ${pageName} (Máy 50 · 8889)!`
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Không kết nối được Nhánh Fourland trên Máy 50 (8889)");
}

async function fetchQueueOverviewViaServer50({ posterNode }) {
  const node = posterNode || DEFAULT_POSTER_NODE;
  const endpoints = [node.tunnelUrl, node.lanUrl].filter(Boolean).map((u) => String(u).replace(/\/+$/, ""));
  let lastErr = null;
  for (const baseUrl of endpoints) {
    try {
      const res = await fetch(`${baseUrl}/api/fourland/queue-overview`, {
        method: "GET",
        signal: AbortSignal.timeout(12000)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Máy 50 (8889) trả về HTTP ${res.status}`);
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Không kết nối được hàng đợi trên Máy 50 (8889)");
}

async function controlQueueViaServer50({ payload, posterNode }) {
  const node = posterNode || DEFAULT_POSTER_NODE;
  const endpoints = [node.tunnelUrl, node.lanUrl].filter(Boolean).map((u) => String(u).replace(/\/+$/, ""));
  let lastErr = null;
  for (const baseUrl of endpoints) {
    try {
      const res = await fetch(`${baseUrl}/api/fourland/queue-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `Máy 50 (8889) trả về HTTP ${res.status}`);
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Không gửi được lệnh điều khiển hàng đợi tới Máy 50 (8889)");
}

async function startGroupRotationViaServer50({ payload, posterNode }) {
  const node = posterNode || DEFAULT_POSTER_NODE;
  const endpoints = [node.tunnelUrl, node.lanUrl].filter(Boolean).map((u) => String(u).replace(/\/+$/, ""));
  let lastErr = null;

  for (const baseUrl of endpoints) {
    try {
      const res = await fetch(`${baseUrl}/api/fourland/start-group-rotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || `Máy 50 (8889) trả về HTTP ${res.status}`);
      }
      return data;
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

function createHandler({
  requireCmsImpl = requireCms,
  request = supabaseRequest,
  writer = writeFacebookCopy,
  posterPublisher = publishViaServer50Poster,
  groupRotationStarter = startGroupRotationViaServer50,
  queueOverviewFetcher = fetchQueueOverviewViaServer50,
  queueController = controlQueueViaServer50
} = {}) {
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

        const result = await request(`properties?select=*,property_images(*)&property_id=eq.${encodeURIComponent(propertyId)}&limit=1`);
        const property = result.data?.[0];
        if (!property) {
          return res.status(404).json({ ok: false, error: { message: "Không tìm thấy bất động sản" } });
        }

        const targetPage = (body.pageId ? await getFacebookPageById(body.pageId) : null) || await getDefaultFacebookPage();
        const availablePages = await getFacebookPages();

        const tone = body.tone || "hot";
        const copy = await writer(property, {
          tone,
          includeLink: body.includeLink !== false,
          regenerate: body.regenerate === true
        });

        const images = (property.property_images || []).map((img) => img.public_url).filter(Boolean);
        const includeLink = body.includeLink !== false;
        const linkUrl = includeLink ? "https://www.fourland.vn" : "";
        const variants = buildRuleBasedVariants(property, {
          link: linkUrl
        });
        const threadsContent = buildThreadsCopy(property, {
          tone,
          link: linkUrl
        });

        const posterNode = await getPosterNodeConfig(request);

        return res.status(200).json({
          ok: true,
          data: {
            propertyId,
            tone,
            content: copy.content,
            threadsContent,
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

      if (action === "queue-list") {
        const posterNode = await getPosterNodeConfig(request);
        const overview = await queueOverviewFetcher({ posterNode });
        return res.status(200).json({ ok: true, data: overview });
      }

      if (action === "queue-action") {
        const posterNode = await getPosterNodeConfig(request);
        const updated = await queueController({
          payload: {
            itemType: body.itemType,
            id: body.id,
            op: body.op
          },
          posterNode
        });
        return res.status(200).json({
          ok: true,
          data: updated,
          message: updated.message || "Đã cập nhật thứ tự ưu tiên luồng đăng bài!"
        });
      }

      if (action === "publish-group") {
        const posterNode = await getPosterNodeConfig(request);
        const rotRes = await groupRotationStarter({ payload: body, posterNode });
        return res.status(200).json({
          ok: true,
          data: rotRes,
          message: rotRes.message || "Đã kích hoạt chiến dịch đăng nhóm trên Máy 50 (8889)!"
        });
      }

      if (action === "publish") {
        const content = String(body.content || "").trim();
        const propertyId = body.propertyId;
        if (!content) {
          return res.status(422).json({ ok: false, error: { message: "Nội dung bài viết không được để trống" } });
        }

        // Deduplicate requested pageIds while keeping order
        const rawPageIds = Array.isArray(body.pageIds) && body.pageIds.length > 0
          ? body.pageIds
          : (body.pageId ? [body.pageId] : []);

        const photoUrls = Array.isArray(body.images) ? body.images : [];

        const targetPages = [];
        for (const pid of rawPageIds) {
          const page = await getFacebookPageById(pid);
          if (page) targetPages.push(page);
          else targetPages.push({ pageId: String(pid), server50PageId: String(pid), name: body.pageName || "FourLand" });
        }
        if (targetPages.length === 0) {
          const defaultPage = await getDefaultFacebookPage();
          if (defaultPage) targetPages.push(defaultPage);
        }

        const isThreadsPage = (p) => {
          const pid = String(p?.server50PageId || p?.pageId || "");
          const pname = String(p?.name || "");
          return pid.startsWith("threads:") || /^threads\b/i.test(pname);
        };
        const allTargetsAreThreads = targetPages.length > 0 && targetPages.every(isThreadsPage);

        if (propertyId && !allTargetsAreThreads) {
          await request(`properties?property_id=eq.${encodeURIComponent(propertyId)}`, {
            method: "PATCH",
            body: { raw_text: content, notes: null, updated_at: new Date().toISOString() }
          })
            .then(() => invalidatePropertiesCache())
            .catch((err) => console.warn("Update property content notice:", err.message));
        }

        const posterNode = await getPosterNodeConfig(request);
        const requestedSchedule = String(body.scheduledAt || "").trim();
        const isFutureSchedule = Boolean(requestedSchedule && !Number.isNaN(Date.parse(requestedSchedule)) && Date.parse(requestedSchedule) > Date.now() + 15000);
        // Đăng ngay thủ công: chờ đủ thời gian tải ảnh + lấy đúng permalink bài viết (45s cho 1 kênh, 15s cho multi-page; quá thời gian đó Máy 50 vẫn tiếp tục chạy ngầm 24/7!)
        const perPageWaitMs = isFutureSchedule ? 8000 : (targetPages.length > 1 ? 15000 : 45000);
        const isDirectSocialUrl = (u) =>
          /(?:facebook\.com\/(?:groups\/[^/?#]+\/(?:posts|permalink)\/[\w-]+|(?!groups\/|profile\.php)[^/?#]+\/posts\/[\w-]+|(?:permalink|story)\.php\?story_fbid=[\w-]+|(?!groups\/)[^/?#]+\/videos\/\d+|photo(?:\.php)?\/?\?fbid=[\w-]+))|(?:threads\.(?:com|net)\/(?:@[\w.]+\/post\/|t\/)[A-Za-z0-9_-]+)/i.test(String(u || ""));

        const publishResults = [];
        for (const page of targetPages) {
          const targetPageId = page.server50PageId || page.pageId || process.env.FACEBOOK_PAGE_ID || "104363431784609";
          const targetPageName = page.name || body.pageName || "FourLand";
          const targetContent = isThreadsPage(page)
            ? optimizeContentForThreads(String(body.threadsContent || content), { maxChars: 465 })
            : content;
          try {
            const resPublish = await posterPublisher({
              content: targetContent,
              imageUrls: photoUrls,
              pageId: targetPageId,
              pageName: targetPageName,
              scheduledAt: isFutureSchedule ? requestedSchedule : "",
              posterNode,
              waitMs: perPageWaitMs
            });
            publishResults.push({
              pageId: page.pageId,
              pageName: targetPageName,
              engine: "server50-8889",
              queued: Boolean(resPublish.queued),
              scheduled: Boolean(resPublish.scheduled),
              scheduledAt: resPublish.scheduledAt || null,
              success: true,
              postUrl: resPublish.postUrl,
              isDirectPost: isDirectSocialUrl(resPublish.postUrl),
              message: resPublish.message
            });
          } catch (err) {
            publishResults.push({
              pageId: page.pageId,
              pageName: targetPageName,
              success: false,
              error: `Máy 50 (8889): ${err.message}`
            });
          }
        }

        const successCount = publishResults.filter((r) => r.success).length;
        const failedCount = publishResults.length - successCount;
        const bestPublishedResult = publishResults.find((r) => r.success && r.isDirectPost) || publishResults.find((r) => r.success && r.postUrl) || null;
        const primaryPostUrl = bestPublishedResult?.postUrl || null;
        const primaryIsDirectPost = Boolean(bestPublishedResult?.isDirectPost);
        const firstError = publishResults.find((r) => !r.success)?.error;
        const summaryMsg = publishResults.length === 1
          ? (publishResults[0].success
              ? `${publishResults[0].message || "Đã xuất bản bài viết thành công"} (Đã lưu nội dung vào kho nhà)`
              : (publishResults[0].error || "Đăng bài lên Facebook thất bại"))
          : (successCount > 0
              ? (isFutureSchedule
                  ? `⏰ Đã hẹn lịch đăng tự động 24/7 lên ${successCount}/${publishResults.length} Fanpage trên Máy 50 (chạy ngầm kể cả khi thoát trang)!`
                  : `Đã xuất bản thành công lên ${successCount}/${publishResults.length} Fanpage trên Máy 50! (Đã lưu nội dung vào kho nhà)`)
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
            isDirectPost: primaryIsDirectPost,
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
