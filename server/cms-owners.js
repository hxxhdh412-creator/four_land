const { inferListingType } = require("./cms-properties");

function cleanPhone(raw) {
  if (!raw) return "";
  return String(raw).replace(/[^0-9+]/g, "").trim();
}

function extractOwnerProfile(property) {
  const data = property?.data_json || {};
  const ownerData = data.owner || {};
  
  const phone = cleanPhone(property?.phone || ownerData.phone || "");
  const name = String(property?.owner_name || data.owner_name || ownerData.name || "").trim();
  const role = String(property?.owner_role || data.owner_role || ownerData.role || "Chủ nhà trực tiếp").trim();
  
  return {
    phone,
    name: name || (phone ? `Chủ nhà (${phone})` : "Chưa có thông tin liên hệ"),
    role: role || "Chủ nhà trực tiếp"
  };
}

function buildOwnerDirectory(properties = [], {
  includeSensitive = false,
  search = "",
  role = "",
  sort = "properties_desc"
} = {}) {
  const ownersMap = new Map();
  const lowerSearch = String(search || "").trim().toLowerCase();
  const targetRole = String(role || "").trim().toLowerCase();

  for (const prop of properties) {
    const { phone, name, role: ownerRole } = extractOwnerProfile(prop);
    if (!phone && !name) continue;

    // Use standardized phone as primary key, or name if no phone
    const key = phone || `name_${name.toLowerCase()}`;

    let entry = ownersMap.get(key);
    if (!entry) {
      entry = {
        key,
        phone,
        name,
        role: ownerRole,
        districts: new Set(),
        properties: [],
        lastActive: prop.received_at || prop.updated_at || null
      };
      ownersMap.set(key, entry);
    }

    // Keep the best name and role if previously defaulted
    if (name && (!entry.name || entry.name.startsWith("Chủ nhà ("))) {
      entry.name = name;
    }
    if (ownerRole && ownerRole !== "Chủ nhà trực tiếp") {
      entry.role = ownerRole;
    }

    if (prop.district) entry.districts.add(prop.district);

    const propDate = prop.received_at || prop.updated_at;
    if (propDate && (!entry.lastActive || new Date(propDate) > new Date(entry.lastActive))) {
      entry.lastActive = propDate;
    }

    const listingType = inferListingType(prop);
    entry.properties.push({
      id: prop.property_id,
      address: prop.address || "Chưa có địa chỉ",
      district: prop.district || "",
      ward: prop.ward || "",
      price: prop.price_text || "Liên hệ",
      area: prop.area_text || "",
      propertyType: prop.property_type || "Bất động sản",
      listingType,
      listingTypeLabel: listingType === "sale" ? "Bán" : "Cho thuê",
      status: prop.status || "active"
    });
  }

  let ownersList = Array.from(ownersMap.values()).map(owner => {
    const districtsArr = Array.from(owner.districts);
    const maskedPhone = owner.phone
      ? (includeSensitive ? owner.phone : `${owner.phone.slice(0, 3)}*******`)
      : "Chưa cập nhật";
    const maskedName = includeSensitive ? owner.name : "Chủ sở hữu Fourland";

    return {
      key: owner.key,
      phone: maskedPhone,
      rawPhone: includeSensitive ? owner.phone : "",
      name: maskedName,
      role: owner.role,
      districts: districtsArr,
      districtLabel: districtsArr.slice(0, 3).join(", ") + (districtsArr.length > 3 ? ` (+${districtsArr.length - 3})` : ""),
      propertyCount: owner.properties.length,
      properties: owner.properties,
      lastActive: owner.lastActive
    };
  });

  // Calculate summary counts before search filtering
  const total = ownersList.length;
  let directCount = 0;
  let brokerCount = 0;
  let multiCount = 0;

  for (const o of ownersList) {
    if (o.role.toLowerCase().includes("trực tiếp")) directCount++;
    else brokerCount++;
    if (o.propertyCount > 1) multiCount++;
  }

  // Filter by search
  if (lowerSearch) {
    ownersList = ownersList.filter(o =>
      o.name.toLowerCase().includes(lowerSearch) ||
      o.phone.toLowerCase().includes(lowerSearch) ||
      o.districts.some(d => d.toLowerCase().includes(lowerSearch)) ||
      o.properties.some(p => p.address.toLowerCase().includes(lowerSearch))
    );
  }

  // Filter by role
  if (targetRole && targetRole !== "all") {
    ownersList = ownersList.filter(o => o.role.toLowerCase() === targetRole);
  }

  // Sort
  if (sort === "properties_desc") {
    ownersList.sort((a, b) => b.propertyCount - a.propertyCount);
  } else if (sort === "newest") {
    ownersList.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));
  } else if (sort === "name_asc") {
    ownersList.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }

  return {
    items: ownersList,
    summary: {
      total,
      directCount,
      brokerCount,
      multiCount
    }
  };
}

module.exports = {
  cleanPhone,
  extractOwnerProfile,
  buildOwnerDirectory
};
