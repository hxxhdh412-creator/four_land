const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOwnerDirectory, cleanPhone, extractOwnerProfile } = require("../server/cms-owners");
const { createHandler } = require("../api/_cms-owners");
const { ACTIONS } = require("../server/cms-authorization");

test("cleanPhone extracts only numeric and plus characters", () => {
  assert.equal(cleanPhone("0903.123.456"), "0903123456");
  assert.equal(cleanPhone("+84 90 888 9999"), "+84908889999");
  assert.equal(cleanPhone(""), "");
});

test("extractOwnerProfile reads owner from property row and data_json", () => {
  const profile1 = extractOwnerProfile({
    phone: "0901234567",
    owner_name: "Anh Hoàng",
    owner_role: "Đầu chủ / Nguồn nội bộ"
  });
  assert.equal(profile1.phone, "0901234567");
  assert.equal(profile1.name, "Anh Hoàng");
  assert.equal(profile1.role, "Đầu chủ / Nguồn nội bộ");

  const profile2 = extractOwnerProfile({
    data_json: {
      owner: {
        phone: "0988776655",
        name: "Chị Thảo",
        role: "Chủ nhà trực tiếp"
      }
    }
  });
  assert.equal(profile2.phone, "0988776655");
  assert.equal(profile2.name, "Chị Thảo");
});

test("buildOwnerDirectory aggregates properties by unique phone and counts metrics", () => {
  const mockProps = [
    { property_id: "P1", address: "123 Lê Lợi, Q1", district: "Quận 1", price_text: "50 triệu/tháng", phone: "0901111222", owner_name: "Anh Tuấn" },
    { property_id: "P2", address: "456 Nguyễn Huệ, Q1", district: "Quận 1", price_text: "12.5 tỷ", phone: "0901111222", owner_name: "Anh Tuấn" },
    { property_id: "P3", address: "789 Hai Bà Trưng, Q3", district: "Quận 3", price_text: "30 triệu/tháng", phone: "0909999888", owner_name: "Chị Lan", owner_role: "Môi giới F1" }
  ];

  const result = buildOwnerDirectory(mockProps, { includeSensitive: true });
  assert.equal(result.items.length, 2);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.multiCount, 1); // Anh Tuấn has 2 properties

  const tuan = result.items.find(o => o.phone === "0901111222");
  assert.equal(tuan.name, "Anh Tuấn");
  assert.equal(tuan.propertyCount, 2);
  assert.equal(tuan.properties[0].listingType, "rent");
  assert.equal(tuan.properties[1].listingType, "sale");
});

test("buildOwnerDirectory masks phone and name when sensitive access is disabled", () => {
  const mockProps = [
    { property_id: "P1", address: "123 Lê Lợi", phone: "0901111222", owner_name: "Anh Tuấn" }
  ];

  const result = buildOwnerDirectory(mockProps, { includeSensitive: false });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].phone, "090*******");
  assert.equal(result.items[0].name, "Chủ sở hữu Fourland");
  assert.equal(result.items[0].rawPhone, "");
});

test("owners API endpoint checks permission and returns directory", async () => {
  let requestedAction;
  const handler = createHandler({
    requireCmsImpl: async (_req, _res, action) => {
      requestedAction = action;
      return { id: "u1", role: "sales", isActive: true };
    },
    request: async () => ({
      data: [
        { property_id: "P1", address: "123 Lê Lợi", phone: "0901111222", owner_name: "Anh Tuấn" }
      ]
    })
  });

  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(k, v) { headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  await handler({ method: "GET", url: "/api/admin/v1/owners" }, res);
  assert.equal(requestedAction, ACTIONS.PROPERTY_READ);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.items.length, 1);
  assert.equal(res.body.data.items[0].phone, "0901111222");
});
