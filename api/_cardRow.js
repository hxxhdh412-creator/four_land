// Rút gọn bản ghi BĐS cho danh sách thẻ (card) – học theo GraphQL fragment:
// danh sách chỉ nhận đúng trường thẻ cần, chi tiết lấy riêng qua /api/property.
// Giảm payload ~75% (data_json đầy đủ chiếm phần lớn dung lượng).

const CARD_PROPERTY_KEYS = ["bedrooms", "bathrooms", "area", "dimensions"];

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function pickCoverImage(images) {
  if (!Array.isArray(images)) return [];
  const valid = images
    .filter(item => item && isHttpUrl(item.public_url))
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  return valid.length ? [{ position: valid[0].position, public_url: valid[0].public_url }] : [];
}

function toCardRow(row) {
  if (!row || typeof row !== "object") return row;
  const { data_json: dataJson, property_images: images, ...rest } = row;
  const source = dataJson && typeof dataJson === "object" && dataJson.property && typeof dataJson.property === "object"
    ? dataJson.property
    : null;
  const slimProperty = {};
  if (source) {
    for (const key of CARD_PROPERTY_KEYS) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== "") slimProperty[key] = value;
    }
  }
  return {
    ...rest,
    data_json: Object.keys(slimProperty).length ? { property: slimProperty } : null,
    property_images: pickCoverImage(images)
  };
}

module.exports = { toCardRow, pickCoverImage, CARD_PROPERTY_KEYS };
