const { requireCms } = require("./_cms-auth");
const { ACTIONS } = require("../server/cms-authorization");
const { buildOwnerDirectory } = require("../server/cms-owners");
const { sendError, supabaseRequest } = require("./_supabase");

const PROPS_FOR_OWNERS = [
  "property_id", "status", "property_type", "address", "district", "ward",
  "price_text", "area_text", "phone", "notes", "data_json", "received_at", "updated_at"
].join(",");

function createHandler({ requireCmsImpl = requireCms, request = supabaseRequest } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" } });
    }

    const principal = await requireCmsImpl(req, res, ACTIONS.PROPERTY_READ);
    if (!principal) return;

    try {
      const url = new URL(req.url, "http://cms.local");
      const search = url.searchParams.get("q") || url.searchParams.get("search") || "";
      const role = url.searchParams.get("role") || "";
      const sort = url.searchParams.get("sort") || "properties_desc";

      const canSeeSensitive = ["super_admin", "manager", "editor", "sales"].includes(principal.role);

      const result = await request(`properties?select=${PROPS_FOR_OWNERS}&status=neq.archived&order=received_at.desc&limit=5000`);
      const properties = result.data || [];

      const directory = buildOwnerDirectory(properties, {
        includeSensitive: canSeeSensitive,
        search,
        role,
        sort
      });

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({
        ok: true,
        data: directory
      });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
