const test = require("node:test");
const assert = require("node:assert/strict");
const { rankSimilarProperties, extractPriceNumber } = require("../api/property");

test("extractPriceNumber parses Vietnamese real estate prices accurately", () => {
  assert.equal(extractPriceNumber("14 triệu"), 14000000);
  assert.equal(extractPriceNumber("25.5 triệu/tháng"), 25500000);
  assert.equal(extractPriceNumber("3.5 tỷ"), 3500000000);
  assert.equal(extractPriceNumber("12 tỷ 500"), 12000000000);
  assert.equal(extractPriceNumber("Thương lượng"), null);
  assert.equal(extractPriceNumber(""), null);
});

test("rankSimilarProperties prioritizes same street over same ward and same district", () => {
  const target = {
    property_id: "TARGET-01",
    street: "Hoàng Hoa Thám",
    ward: "Phường 7",
    district: "Bình Thạnh",
    price_text: "15 triệu",
    property_type: "Nhà phố"
  };

  const candidates = [
    {
      property_id: "DISTRICT-ONLY",
      street: "Bạch Đằng",
      ward: "Phường 14",
      district: "Bình Thạnh",
      price_text: "15 triệu",
      property_type: "Nhà phố",
      status: "active"
    },
    {
      property_id: "SAME-STREET",
      street: "Đường Hoàng Hoa Thám",
      ward: "Phường 7",
      district: "Bình Thạnh",
      price_text: "16 triệu",
      property_type: "Nhà phố",
      status: "active"
    },
    {
      property_id: "SAME-WARD",
      street: "Lê Trực",
      ward: "Phường 7",
      district: "Bình Thạnh",
      price_text: "14 triệu",
      property_type: "Nhà phố",
      status: "active"
    },
    {
      property_id: "TARGET-01",
      street: "Hoàng Hoa Thám",
      ward: "Phường 7",
      district: "Bình Thạnh",
      price_text: "15 triệu",
      property_type: "Nhà phố",
      status: "active"
    },
    {
      property_id: "ARCHIVED-ONE",
      street: "Hoàng Hoa Thám",
      ward: "Phường 7",
      district: "Bình Thạnh",
      price_text: "15 triệu",
      property_type: "Nhà phố",
      status: "archived"
    }
  ];

  const ranked = rankSimilarProperties(target, candidates);

  assert.equal(ranked.length, 3);
  assert.ok(!ranked.some(r => r.property_id === "TARGET-01"));
  assert.ok(!ranked.some(r => r.property_id === "ARCHIVED-ONE"));

  assert.equal(ranked[0].property_id, "SAME-STREET");
  assert.equal(ranked[0].badge, "Cùng tuyến đường");

  assert.equal(ranked[1].property_id, "SAME-WARD");
  assert.equal(ranked[1].badge, "Cùng Phường 7");

  assert.equal(ranked[2].property_id, "DISTRICT-ONLY");
});
