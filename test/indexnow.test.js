const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  INDEXNOW_KEY,
  INDEXNOW_HOST,
  INDEXNOW_KEY_LOCATION,
  INDEXNOW_ENDPOINT,
  normalizeUrl,
  buildIndexNowPayload,
  collectIndexNowUrls,
  submitToIndexNow
} = require("../server/indexnow");
const { createHandler } = require("../api/indexnow");

test("IndexNow verification file exists and matches constant key", () => {
  const keyFile = path.resolve(__dirname, "..", `${INDEXNOW_KEY}.txt`);
  assert.equal(fs.existsSync(keyFile), true, "File khóa xác thực IndexNow phải tồn tại ở thư mục gốc");
  const fileContent = fs.readFileSync(keyFile, "utf8").trim();
  assert.equal(fileContent, INDEXNOW_KEY, "Nội dung file phải khớp chính xác với INDEXNOW_KEY");
});

test("normalizeUrl converts paths and non-canonical hosts to canonical www.fourland.vn", () => {
  assert.equal(normalizeUrl("/nha-pho"), "https://www.fourland.vn/nha-pho");
  assert.equal(normalizeUrl("/bat-dong-san/demo-123"), "https://www.fourland.vn/bat-dong-san/demo-123");
  assert.equal(normalizeUrl("https://fourland.vn/nha-pho/ban"), "https://www.fourland.vn/nha-pho/ban");
  assert.equal(normalizeUrl("http://localhost:4175/nha-pho/cho-thue"), "https://www.fourland.vn/nha-pho/cho-thue");
  assert.equal(normalizeUrl(""), "");
  assert.equal(normalizeUrl(null), "");
});

test("buildIndexNowPayload constructs valid JSON payload and deduplicates URLs", () => {
  const inputUrls = [
    "/nha-pho",
    "https://www.fourland.vn/nha-pho", // duplicate
    "/nha-pho/ban",
    "https://fourland.vn/nha-pho/ban", // duplicate
    "/nha-pho/cho-thue"
  ];
  const payload = buildIndexNowPayload(inputUrls);
  assert.equal(payload.host, "www.fourland.vn");
  assert.equal(payload.key, INDEXNOW_KEY);
  assert.equal(payload.keyLocation, INDEXNOW_KEY_LOCATION);
  assert.deepEqual(payload.urlList, [
    "https://www.fourland.vn/nha-pho",
    "https://www.fourland.vn/nha-pho/ban",
    "https://www.fourland.vn/nha-pho/cho-thue"
  ]);
});

test("collectIndexNowUrls gathers home, active hubs and non-archived property pages", () => {
  const sampleProperties = [
    {
      property_id: "BDS-TB-001",
      status: "available",
      property_type: "Nhà phố",
      price_text: "25tr/tháng",
      street: "Hoàng Hoa Thám",
      ward: "Phường 13",
      district: "Tân Bình",
      address: "123 Hoàng Hoa Thám, P13, Tân Bình",
      received_at: "2026-09-01T10:00:00.000Z"
    },
    {
      property_id: "BDS-TB-002",
      status: "available",
      property_type: "Nhà phố",
      price_text: "30tr/tháng",
      street: "Cộng Hòa",
      ward: "Phường 12",
      district: "Tân Bình",
      address: "456 Cộng Hòa, P12, Tân Bình",
      received_at: "2026-09-02T10:00:00.000Z"
    },
    {
      property_id: "BDS-TB-003",
      status: "available",
      property_type: "Nhà phố",
      price_text: "40tr/tháng",
      street: "Trường Chinh",
      ward: "Phường 14",
      district: "Tân Bình",
      address: "789 Trường Chinh, P14, Tân Bình",
      received_at: "2026-09-03T10:00:00.000Z"
    },
    {
      property_id: "BDS-ARCHIVED-001",
      status: "archived",
      property_type: "Nhà",
      district: "Quận 1",
      address: "Kho cũ",
      received_at: "2026-08-01T10:00:00.000Z"
    }
  ];

  const urls = collectIndexNowUrls(sampleProperties);
  assert.equal(urls.includes("https://www.fourland.vn/"), true);
  assert.equal(urls.includes("https://www.fourland.vn/nha-pho"), true);
  assert.equal(urls.includes("https://www.fourland.vn/nha-pho/cho-thue"), true);

  // Since Tân Bình has 3 available houses, district landing hubs must be included
  assert.equal(urls.some(u => u.includes("tan-binh")), true);

  // Active properties should be present
  assert.equal(urls.some(u => u.includes("BDS-TB-001") || u.includes("hoang-hoa-tham")), true);

  // Archived property must NOT be present
  assert.equal(urls.some(u => u.includes("BDS-ARCHIVED-001")), false);
});

test("submitToIndexNow handles empty URLs, successful 200/202 responses and network errors", async () => {
  // Case 1: Empty URLs
  const emptyRes = await submitToIndexNow([]);
  assert.equal(emptyRes.ok, true);
  assert.equal(emptyRes.submitted, 0);

  // Case 2: Successful 200 response
  let capturedBody = null;
  const mockFetchSuccess = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      status: 200,
      ok: true
    };
  };

  const successRes = await submitToIndexNow(["/nha-pho", "/nha-pho/ban"], { fetchFn: mockFetchSuccess });
  assert.equal(successRes.ok, true);
  assert.equal(successRes.status, 200);
  assert.equal(successRes.submitted, 2);
  assert.equal(capturedBody.host, "www.fourland.vn");
  assert.equal(capturedBody.key, INDEXNOW_KEY);

  // Case 3: Network Error
  const mockFetchError = async () => {
    throw new Error("DNS resolution failed");
  };

  const errorRes = await submitToIndexNow(["/nha-pho"], { fetchFn: mockFetchError });
  assert.equal(errorRes.ok, false);
  assert.equal(errorRes.status, 0);
  assert.match(errorRes.error, /DNS resolution failed/);
});

test("API /api/indexnow serves GET status and POST execution cleanly", async () => {
  const handler = createHandler({
    request: async () => ({ data: [] }),
    submitFn: async (urls) => ({ ok: true, status: 200, submitted: urls.length, message: "OK" })
  });

  // Test GET
  const getReq = { method: "GET" };
  let getStatus = 0, getHeaders = {}, getBody = null;
  const getRes = {
    setHeader: (k, v) => { getHeaders[k] = v; },
    status: (code) => {
      getStatus = code;
      return {
        json: (data) => { getBody = data; return data; }
      };
    }
  };
  await handler(getReq, getRes);
  assert.equal(getStatus, 200);
  assert.equal(getBody.ok, true);
  assert.equal(getBody.host, "www.fourland.vn");
  assert.equal(getBody.key, INDEXNOW_KEY);

  // Test POST
  const postReq = {
    method: "POST",
    body: { urls: ["https://www.fourland.vn/nha-pho", "https://www.fourland.vn/nha-pho/cho-thue"] }
  };
  let postStatus = 0, postBody = null;
  const postRes = {
    setHeader: () => {},
    status: (code) => {
      postStatus = code;
      return {
        json: (data) => { postBody = data; return data; }
      };
    }
  };
  await handler(postReq, postRes);
  assert.equal(postStatus, 200);
  assert.equal(postBody.ok, true);
  assert.equal(postBody.submitted, 2);

  // Test 405 Method Not Allowed
  const putReq = { method: "PUT" };
  let putStatus = 0;
  const putRes = {
    setHeader: () => {},
    status: (code) => {
      putStatus = code;
      return { json: (d) => d };
    }
  };
  await handler(putReq, putRes);
  assert.equal(putStatus, 405);
});
