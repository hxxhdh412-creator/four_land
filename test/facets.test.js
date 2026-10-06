const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeWardFacet, uniqueCaseInsensitive } = require("../api/facets");
const { matchAndScoreProperty } = require("../api/_smartSearch");

test("normalizeWardFacet formats raw numbers and abbreviations into standard ward names", () => {
  assert.equal(normalizeWardFacet("26"), "Phường 26");
  assert.equal(normalizeWardFacet("1"), "Phường 1");
  assert.equal(normalizeWardFacet("02"), "Phường 2");
  assert.equal(normalizeWardFacet("p.26"), "Phường 26");
  assert.equal(normalizeWardFacet("P 14"), "Phường 14");
  assert.equal(normalizeWardFacet("phường 26"), "Phường 26");
  assert.equal(normalizeWardFacet("Phường Bến Nghé"), "Phường Bến Nghé");
  assert.equal(normalizeWardFacet("Phường Bến Nghé Q"), "Phường Bến Nghé");
  assert.equal(normalizeWardFacet("Phường Bến Ngh"), "Phường Bến Nghé");
  assert.equal(normalizeWardFacet("Phường Đa Kao"), "Phường Đa Kao");
  assert.equal(normalizeWardFacet("Phường Đa Kao Q"), "Phường Đa Kao");
  assert.equal(normalizeWardFacet("Phường Đakao"), "Phường Đa Kao");
  assert.equal(normalizeWardFacet("Phường Tân Định Q"), "Phường Tân Định");
  assert.equal(normalizeWardFacet("Phường HBC Thủ Đức"), "Phường Hiệp Bình Chánh");
  assert.equal(normalizeWardFacet("Phường hường 11"), "Phường 11");
  assert.equal(normalizeWardFacet("Phường giặt phơi"), "");
  assert.equal(normalizeWardFacet("Phường ở gia đình"), "");
  assert.equal(normalizeWardFacet("Phường sạch s"), "");
  assert.equal(normalizeWardFacet("Phường Cầu Kho"), "Phường Cầu Kho");
  assert.equal(normalizeWardFacet("Phường MB"), "");
  assert.equal(normalizeWardFacet("xã bà điểm"), "Xã Bà Điểm");
  assert.equal(normalizeWardFacet("thị trấn củ chi"), "Thị trấn Củ Chi");
  assert.equal(normalizeWardFacet(""), "");
  assert.equal(normalizeWardFacet(null), "");
});

test("uniqueCaseInsensitive dedupes raw numbers with Phường and sorts naturally", () => {
  const rawWards = ["Phường 10", "26", "Phường 1", "Phường 2", "Phường 26", "p. 3"];
  const result = uniqueCaseInsensitive(rawWards, normalizeWardFacet);
  
  // Should deduplicate "26" and "Phường 26" into a single "Phường 26"
  // And natural sort order: Phường 1, Phường 2, Phường 3, Phường 10, Phường 26
  assert.deepEqual(result, [
    "Phường 1",
    "Phường 2",
    "Phường 3",
    "Phường 10",
    "Phường 26"
  ]);
});

test("matchAndScoreProperty matches ward with or without Phường prefix", () => {
  const propertyA = { property_id: "A", ward: "26", status: "ready" };
  const propertyB = { property_id: "B", ward: "Phường 26", status: "ready" };

  const scoreA = matchAndScoreProperty(propertyA, { filters: {}, tokens: [] }, { ward: "Phường 26" });
  assert.ok(scoreA >= 0, "Property with ward '26' should match filter 'Phường 26'");

  const scoreB = matchAndScoreProperty(propertyB, { filters: {}, tokens: [] }, { ward: "26" });
  assert.ok(scoreB >= 0, "Property with ward 'Phường 26' should match filter '26'");
});

const { normalizeStreetFacet, normalizePropertyTypeFacet } = require("../api/facets");

test("normalizeStreetFacet strips house numbers and rejects prices/dimensions", () => {
  assert.equal(normalizeStreetFacet("5TR/THÁNG"), "");
  assert.equal(normalizeStreetFacet("5x8m"), "");
  assert.equal(normalizeStreetFacet("6/2"), "");
  assert.equal(normalizeStreetFacet("TRIỆU/THÁNG"), "");
  assert.equal(normalizeStreetFacet("8m"), "");
  assert.equal(normalizeStreetFacet("4 - 106 - 108 Yersin"), "Yersin");
  assert.equal(normalizeStreetFacet("4/6/ Thống Nhất"), "Thống Nhất");
  assert.equal(normalizeStreetFacet("4/B17 Nguyễn Trãi"), "Nguyễn Trãi");
  assert.equal(normalizeStreetFacet("5 - 425A Nguyễn Văn Luông"), "Nguyễn Văn Luông");
  assert.equal(normalizeStreetFacet("5/ Nguyên Hồng"), "Nguyên Hồng");
  assert.equal(normalizeStreetFacet("5/ Phạm Văn Chiêu"), "Phạm Văn Chiêu");
  assert.equal(normalizeStreetFacet("7 Nam Kỳ Khởi Nghĩa"), "Nam Kỳ Khởi Nghĩa");
  assert.equal(normalizeStreetFacet("7/ Phan Xích Long"), "Phan Xích Long");
  assert.equal(normalizeStreetFacet("8 - 710 Cách Mạng Tháng 8"), "Cách Mạng Tháng 8");
  assert.equal(normalizeStreetFacet("8 Khu Dân Cư Savimex"), "Khu Dân Cư Savimex");
  assert.equal(normalizeStreetFacet("8- 110 Châu Văn Liêm"), "Châu Văn Liêm");
  assert.equal(normalizeStreetFacet("8/ Xô Viết Nghệ Tĩnh"), "Xô Viết Nghệ Tĩnh");
  assert.equal(normalizeStreetFacet("82/10A Đinh Bộ Lĩnh"), "Đinh Bộ Lĩnh");
  assert.equal(normalizeStreetFacet("9 - 31 Trần Nhật Duật"), "Trần Nhật Duật");
  assert.equal(normalizeStreetFacet("9/ Tôn Thất Thuyết"), "Tôn Thất Thuyết");
  assert.equal(normalizeStreetFacet("3/2"), "Đường 3/2");
  assert.equal(normalizeStreetFacet("741 Đường 3/2"), "Đường 3/2");
  assert.equal(normalizeStreetFacet("328 Ter Trần Hưng Đạo"), "Trần Hưng Đạo");
  assert.equal(normalizeStreetFacet("Phan Văn Trị"), "Phan Văn Trị");
  assert.equal(normalizeStreetFacet("Trần Đình Xu"), "Trần Đình Xu");
  assert.equal(normalizeStreetFacet("Đường Số 12"), "Đường Số 12");
  assert.equal(normalizeStreetFacet("Đường 49B"), "Đường 49B");
  assert.equal(normalizeStreetFacet("D5"), "Đường D5");
});

test("normalizePropertyTypeFacet standardizes property types and consolidates rentals", () => {
  assert.equal(normalizePropertyTypeFacet("nhà"), "Nhà thuê");
  assert.equal(normalizePropertyTypeFacet("THUÊ"), "Nhà thuê");
  assert.equal(normalizePropertyTypeFacet("Nhà thuê"), "Nhà thuê");
  assert.equal(normalizePropertyTypeFacet("cho thuê"), "Nhà thuê");
  assert.equal(normalizePropertyTypeFacet("nhà nguyên căn"), "Nhà thuê");
  assert.equal(normalizePropertyTypeFacet("căn hộ"), "Căn hộ");
  assert.equal(normalizePropertyTypeFacet("chung cư"), "Căn hộ");
  assert.equal(normalizePropertyTypeFacet("mặt tiền kinh doanh"), "Mặt tiền kinh doanh");
  assert.equal(normalizePropertyTypeFacet("MB"), "Mặt tiền kinh doanh");
  assert.equal(normalizePropertyTypeFacet("biệt thự"), "Biệt thự");
  assert.equal(normalizePropertyTypeFacet("villa"), "Biệt thự");
  assert.equal(normalizePropertyTypeFacet("đất"), "Đất");

  const rawList = ["Biệt thự", "Căn hộ", "căn hộ", "Mặt tiền kinh doanh", "nhà", "Nhà thuê", "THUÊ", "Đất", null, ""];
  const deduped = uniqueCaseInsensitive(rawList, normalizePropertyTypeFacet);
  assert.deepEqual(deduped, [
    "Biệt thự",
    "Căn hộ",
    "Đất",
    "Mặt tiền kinh doanh",
    "Nhà thuê"
  ]);
});


