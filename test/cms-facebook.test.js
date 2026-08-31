const test = require("node:test");
const assert = require("node:assert/strict");
const { generateFacebookPost, formatSafeLocation, stripHouseNumber, publishToComposioFacebook } = require("../server/cms-facebook");
const { createHandler } = require("../api/_cms-facebook");

const fixtureProperty = {
  property_id: "BDS-TEST-001",
  address: "123/45 Lê Văn Sỹ, Phường 1, Quận Tân Bình",
  district: "Tân Bình",
  ward: "Phường 1",
  street: "Lê Văn Sỹ",
  property_type: "Nhà phố",
  price_text: "15 tỷ",
  area_text: "80m²",
  dimensions: "4x20m",
  structure: "1 trệt 3 lầu sân thượng",
  legal: "Sổ hồng riêng",
  phone: "0901234567",
  bedrooms: 4,
  bathrooms: 4
};

test("stripHouseNumber removes exact house number prefix", () => {
  assert.equal(stripHouseNumber("123/45 Lê Văn Sỹ, Phường 1, Quận Tân Bình"), "Lê Văn Sỹ");
  assert.equal(stripHouseNumber("Số 10 Nguyễn Huệ"), "Nguyễn Huệ");
  assert.equal(stripHouseNumber("Hẻm 456 Hai Bà Trưng"), "Hai Bà Trưng");
});

test("formatSafeLocation formats location without exact house number", () => {
  const loc = formatSafeLocation(fixtureProperty);
  assert.match(loc, /Đường Lê Văn Sỹ/);
  assert.match(loc, /Tân Bình/);
  assert.doesNotMatch(loc, /123\/45/);
});

test("generateFacebookPost generates 3 distinct tones for Vietnamese real estate", () => {
  const hotPost = generateFacebookPost(fixtureProperty, { tone: "hot", pageName: "Ngọc Ngà Tốt" });
  assert.match(hotPost, /🔥 SIÊU PHẨM/);
  assert.match(hotPost, /15 tỷ/);
  assert.match(hotPost, /Ngọc Ngà Tốt/);
  assert.match(hotPost, /#NgocNgaTot/);

  const quickPost = generateFacebookPost(fixtureProperty, { tone: "quick", pageName: "Ngọc Ngà Tốt" });
  assert.match(quickPost, /⚡ CHÍNH CHỦ GỬI BÁN/);
  assert.match(quickPost, /Hotline\/Zalo/);

  const detailPost = generateFacebookPost(fixtureProperty, { tone: "detail", pageName: "Ngọc Ngà Tốt" });
  assert.match(detailPost, /🏡 \[BẤT ĐỘNG SẢN CHỌN LỌC\]/);
  assert.match(detailPost, /THÔNG TIN CHI TIẾT/);
});

test("publishToComposioFacebook provides clean simulation when API key is not configured", async () => {
  const result = await publishToComposioFacebook({
    content: "Test bài đăng Fourland",
    imageUrls: ["https://example.com/img1.jpg"],
    pageName: "Ngọc Ngà Tốt"
  });

  assert.equal(result.ok, true);
  assert.match(result.postUrl, /https:\/\/www\.facebook\.com\//);
  assert.equal(result.pageName, "Ngọc Ngà Tốt");
});

test("Facebook Studio API handler creates draft with safe property facts", async () => {
  const handler = createHandler({
    requireCmsImpl: async () => ({ id: "usr-admin-01", role: "super_admin" }),
    request: async () => ({
      data: [{ ...fixtureProperty, property_images: [{ public_url: "https://example.com/photo1.jpg" }] }]
    })
  });

  const req = {
    method: "POST",
    body: { action: "draft", propertyId: "BDS-TEST-001", tone: "hot" },
    headers: {}
  };

  let statusCode = 0;
  let jsonBody = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { jsonBody = body; return this; }
  };

  await handler(req, res);
  assert.equal(statusCode, 200);
  assert.equal(jsonBody.ok, true);
  assert.match(jsonBody.data.content, /SIÊU PHẨM/);
  assert.equal(jsonBody.data.images.length, 1);
});

test("Facebook Studio API handler publishes post successfully", async () => {
  const handler = createHandler({
    requireCmsImpl: async () => ({ id: "usr-admin-01", role: "super_admin" })
  });

  const req = {
    method: "POST",
    body: {
      action: "publish",
      content: "Nhà đẹp Tân Bình cần bán gấp",
      images: ["https://example.com/img1.jpg"],
      pageName: "Ngọc Ngà Tốt"
    },
    headers: {}
  };

  let statusCode = 0;
  let jsonBody = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { jsonBody = body; return this; }
  };

  await handler(req, res);
  assert.equal(statusCode, 200);
  assert.equal(jsonBody.ok, true);
  assert.match(jsonBody.data.postUrl, /facebook\.com/);
});
