const test = require("node:test");
const assert = require("node:assert/strict");
const { generateFacebookPost, buildKillerHeadline, formatSafeLocation, stripHouseNumber, publishToComposioFacebook } = require("../server/cms-facebook");
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

test("buildKillerHeadline generates killer headline with exact real estate pattern", () => {
  const nguyenXiProperty = {
    address: "Mặt tiền Nguyễn Xí, Phường 26, Quận Bình Thạnh",
    district: "Bình Thạnh",
    ward: "Phường 26",
    street: "Nguyễn Xí",
    area_text: "50m²",
    structure: "3 tầng",
    bedrooms: 4,
    bathrooms: 3,
    price_text: "9.5 tỷ"
  };
  const headline = buildKillerHeadline(nguyenXiProperty, { tone: "hot" });
  assert.match(headline, /🔥 MẶT TIỀN KINH DOANH • NGUYỄN XÍ, P\. 26, BÌNH THẠNH - 50M² ❌ 3 TẦNG • 4PN 3WC • 9\.5 TỶ 🔥/);

  const post = generateFacebookPost(nguyenXiProperty, { tone: "hot", pageName: "Ngọc Nhà Tốt" });
  assert.match(post, /MẶT TIỀN KINH DOANH • NGUYỄN XÍ/);
  assert.match(post, /50M² ❌ 3 TẦNG • 4PN 3WC/);
  assert.match(post, /9\.5 TỶ/);
});

test("generateFacebookPost differentiates rent and deduplicates identical dimensions", () => {
  const rentalProperty = {
    address: "1199 Hoàng Sa, Phường 5, Quận Tân Bình",
    district: "Tân Bình",
    ward: "Phường 5",
    street: "Hoàng Sa",
    area_text: "10x10",
    dimensions: "10x10",
    structure: "trệt lửng LDR",
    price_text: "30 triệu",
    property_type: "Nhà thuê",
    notes: "Mặt tiền kinh doanh"
  };

  const post = generateFacebookPost(rentalProperty, { tone: "hot", pageName: "FourLand" });
  assert.match(post, /MẶT TIỀN KINH DOANH CHO THUÊ • HOÀNG SA, P\. 5, TÂN BÌNH - 10x10m ❌ TRỆT LỬNG • 30 TRIỆU\/THÁNG/);
  assert.doesNotMatch(post, /mua an cư hoặc đầu tư giữ tiền/);
  assert.doesNotMatch(post, /công chứng sang tên/);
  assert.match(post, /Giá thuê: 30 triệu\/tháng/);
  assert.match(post, /nhận diện thương hiệu/);
  assert.match(post, /#ChoThueNha/);
  const dimMatches = post.match(/10x10/g) || [];
  assert.equal(dimMatches.length, 2);
});

test("isRentalProperty correctly identifies raw Zalo rental post with broker signature", () => {
  const zaloRental = {
    property_id: "BDS-20260904-6E92FD54",
    property_type: "Nhà thuê",
    group_name: "THUÊ 4 LAND TB- GV-TP",
    address: "MB 1199 Hoàng Sa",
    street: "Hoàng Sa",
    district: "Tân Bình",
    ward: "Phường 5",
    price_text: "30 triệu",
    price_number: 30000000,
    area_text: "10x10",
    dimensions: "10x10",
    structure: "trệt lửng LDR",
    raw_text: "MB 1199 Hoàng Sa, P.5, Q.Tân Bình\n10x10 trệt lửng LDR \n30tr hhtt 0922570579\nNgọc Nhà Thuê Và Bán"
  };

  const post = generateFacebookPost(zaloRental, { tone: "hot", pageName: "Ngọc Nhà Tốt" });
  assert.match(post, /🔥 CHO THUÊ MẶT BẰNG KINH DOANH • HOÀNG SA, P\. 5, TÂN BÌNH - 10x10m ❌ TRỆT LỬNG • 30 TRIỆU\/THÁNG 🔥/);
  assert.match(post, /💥 Vị trí kinh doanh đắc địa - Mặt bằng đẹp thông thoáng/);
  assert.match(post, /Giá thuê: 30 triệu\/tháng \(thương lượng chính chủ\)/);
  assert.match(post, /Hợp đồng thuê: Ký lâu dài ổn định/);
  assert.match(post, /THƯƠNG LƯỢNG GIÁ THUÊ/);
  assert.doesNotMatch(post, /mua an cư/);
  assert.doesNotMatch(post, /đầu tư giữ tiền/);
  assert.doesNotMatch(post, /công chứng sang tên/);
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
