const { ACTIONS } = require("./cms-authorization");

const WORKFLOW_COMMANDS = Object.freeze({
  submit_review: { action: ACTIONS.PROPERTY_SUBMIT_REVIEW, from: ["draft", "rejected"], to: "pending_review" },
  publish: { action: ACTIONS.PROPERTY_PUBLISH, from: ["pending_review"], to: "published" },
  reject: { action: ACTIONS.PROPERTY_PUBLISH, from: ["pending_review"], to: "rejected" },
  archive: { action: ACTIONS.PROPERTY_ARCHIVE, from: ["draft", "pending_review", "published", "rejected"], to: "archived" },
  restore: { action: ACTIONS.PROPERTY_ARCHIVE, from: ["archived"], to: "draft" }
});

function mutationsEnabled(env = process.env) {
  return ["1", "true", "yes"].includes(String(env.CMS_MUTATIONS_ENABLED || "").toLowerCase());
}

function requireMutationsEnabled(env) {
  if (mutationsEnabled(env)) return true;
  const error = new Error("CMS mutations chưa được bật cho môi trường này");
  error.statusCode = 503;
  error.code = "MUTATIONS_DISABLED";
  throw error;
}

function workflowCommand(value) {
  const command = String(value || "");
  const definition = WORKFLOW_COMMANDS[command];
  if (!definition) {
    const error = new Error("Lệnh workflow không hợp lệ");
    error.statusCode = 400;
    error.code = "VALIDATION_FAILED";
    throw error;
  }
  return { command, ...definition };
}

function assertTransition(currentStatus, definition) {
  if (definition.from.includes(String(currentStatus || ""))) return true;
  const error = new Error(`Không thể chuyển từ ${currentStatus || "unknown"} sang ${definition.to}`);
  error.statusCode = 409;
  error.code = "INVALID_TRANSITION";
  throw error;
}

module.exports = { WORKFLOW_COMMANDS, assertTransition, mutationsEnabled, requireMutationsEnabled, workflowCommand };
