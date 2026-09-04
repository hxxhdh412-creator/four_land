const test = require("node:test");
const assert = require("node:assert/strict");
const { getPushStatus, sendPushNotification, getOneSignalConfig } = require("../server/cms-push");

test("cms push config retrieves configured or default OneSignal credentials", () => {
  const config = getOneSignalConfig();
  assert.ok(config.appId, "appId should be defined");
  assert.ok(config.apiKey, "apiKey should be defined");
  assert.ok(config.appId.includes("-"), "appId should look like a UUID");
});

test("sendPushNotification validates required title and message", async () => {
  await assert.rejects(
    async () => {
      await sendPushNotification({ title: "", message: "Hello" });
    },
    { message: /tiêu đề/i }
  );

  await assert.rejects(
    async () => {
      await sendPushNotification({ title: "Nhà đẹp", message: "" });
    },
    { message: /nội dung/i }
  );
});

test("cms push status queries OneSignal apps endpoint", async () => {
  const status = await getPushStatus();
  assert.equal(typeof status, "object");
  assert.equal(typeof status.ok, "boolean");
  if (status.ok) {
    assert.equal(status.enabled, true);
    assert.ok(status.appId);
    assert.equal(typeof status.subscribers, "number");
  }
});

test("sendPushNotification normalizes #q=BDS-... URLs to direct canonical property paths", async () => {
  // Mock global fetch to inspect payload
  const originalFetch = globalThis.fetch;
  let sentPayload = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/notifications")) {
      sentPayload = JSON.parse(options.body);
      return {
        ok: true,
        text: async () => JSON.stringify({ id: "mock-push-id-123", recipients: 1 })
      };
    }
    return originalFetch(url, options);
  };

  try {
    const res = await sendPushNotification({
      title: "Test BĐS",
      message: "Nhà đẹp Võ Văn Tần",
      url: "https://www.fourland.vn/#q=BDS-20260904-410EBD11"
    });

    assert.equal(res.ok, true);
    assert.ok(sentPayload);
    assert.equal(sentPayload.url, "https://www.fourland.vn/bat-dong-san/bds--BDS-20260904-410EBD11");
    assert.equal(sentPayload.web_url, "https://www.fourland.vn/bat-dong-san/bds--BDS-20260904-410EBD11");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
