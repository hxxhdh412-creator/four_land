const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  MANAGER: "manager",
  EDITOR: "editor",
  SALES: "sales",
  VIEWER: "viewer"
});

const ACTIONS = Object.freeze({
  DASHBOARD_READ: "dashboard.read",
  PROPERTY_READ: "property.read",
  PROPERTY_SENSITIVE_READ: "property.sensitive.read",
  PROPERTY_EDIT: "property.edit",
  PROPERTY_SUBMIT_REVIEW: "property.submit_review",
  PROPERTY_PUBLISH: "property.publish",
  PROPERTY_ARCHIVE: "property.archive",
  PROPERTY_ASSIGN: "property.assign",
  PROPERTY_EXPORT: "property.export",
  MEDIA_EDIT: "media.edit",
  AUDIT_READ: "audit.read",
  USER_MANAGE: "user.manage"
});

const ALL_ACTIONS = Object.freeze(Object.values(ACTIONS));

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: new Set(ALL_ACTIONS),
  [ROLES.MANAGER]: new Set(ALL_ACTIONS.filter(action => action !== ACTIONS.USER_MANAGE)),
  [ROLES.EDITOR]: new Set([
    ACTIONS.DASHBOARD_READ,
    ACTIONS.PROPERTY_READ,
    ACTIONS.PROPERTY_SENSITIVE_READ,
    ACTIONS.PROPERTY_EDIT,
    ACTIONS.PROPERTY_SUBMIT_REVIEW,
    ACTIONS.MEDIA_EDIT
  ]),
  [ROLES.SALES]: new Set([
    ACTIONS.DASHBOARD_READ,
    ACTIONS.PROPERTY_READ,
    ACTIONS.PROPERTY_SENSITIVE_READ
  ]),
  [ROLES.VIEWER]: new Set([
    ACTIONS.DASHBOARD_READ,
    ACTIONS.PROPERTY_READ
  ])
});

const SENSITIVE_PROPERTY_FIELDS = Object.freeze([
  "phone", "sender_id", "sender_name", "account_id", "group_id", "group_name",
  "raw_text", "normalized_text", "data_json"
]);

function validRole(role) {
  return Object.values(ROLES).includes(String(role || ""));
}

function can(role, action) {
  if (!validRole(role) || !ALL_ACTIONS.includes(action)) return false;
  return ROLE_PERMISSIONS[role].has(action);
}

function requirePermission(principal, action) {
  if (!principal?.id) {
    const error = new Error("Cần đăng nhập CMS");
    error.statusCode = 401;
    error.code = "AUTH_REQUIRED";
    throw error;
  }
  if (!principal.isActive || !can(principal.role, action)) {
    const error = new Error("Bạn không có quyền thực hiện thao tác này");
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
  return true;
}

function maskSensitiveProperty(property, role) {
  const output = { ...(property || {}) };
  if (can(role, ACTIONS.PROPERTY_SENSITIVE_READ)) return output;
  SENSITIVE_PROPERTY_FIELDS.forEach(field => { delete output[field]; });
  return output;
}

module.exports = {
  ACTIONS,
  ALL_ACTIONS,
  ROLES,
  ROLE_PERMISSIONS,
  SENSITIVE_PROPERTY_FIELDS,
  can,
  maskSensitiveProperty,
  requirePermission,
  validRole
};
