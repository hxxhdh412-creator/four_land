const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseNaturalQuery, matchAndScoreProperty, removeVietnameseTones } = require("./api/_smartSearch");
const { propertyIdFromSlug, renderPropertyPage } = require("./server/seo");
const { buildDashboardSummary } = require("./server/cms-dashboard");
const { buildPropertyListRoute, normalizePropertyListItem, parsePropertyListQuery } = require("./server/cms-properties");
const { buildPropertyDetailRoute, normalizePropertyDetail, validPropertyId } = require("./server/cms-property-detail");
const { validatePropertyDraft } = require("./server/cms-property-validation");
const { buildReviewQueue, buildReviewQueueRoute } = require("./server/cms-review-queue");
const { buildSystemHealth } = require("./server/cms-system-health");
const { rankPropertiesForLead } = require("./server/smart-matcher");
const { generateFacebookPost, publishToComposioFacebook } = require("./server/cms-facebook");

const root = __dirname;
const port = Number(process.env.PORT || 4175);
const env = {};
const envFile = path.join(root, ".env.local");
if (fs.existsSync(envFile)) fs.readFileSync(envFile, "utf8").split(/\r?\n/).forEach(line => { const index=line.indexOf("=");if(index>0&&!line.trim().startsWith("#"))env[line.slice(0,index).trim()]=line.slice(index+1).trim() });
Object.assign(process.env, env);
const database = { url:String(env.SUPABASE_URL||"").replace(/\/+$/, ""), key:String(env.SUPABASE_SECRET_KEY||"") };
const databaseEnabled = /^https:\/\/.+\.supabase\.co$/i.test(database.url) && database.key.length > 20;
const photo = (id) => `https://drive.google.com/thumbnail?id=${id}&sz=w1400`;
const sampleImages = [
  photo("1lc-L-ix0w6W89xTvIPtgn7uNsHwoC_pE"),
  photo("1PHbaTeL8u71j6ay54BFDyCgOCAh6nher"),
  photo("1rW1PfvnFlKvPsEFm_yabRg6OYEZZedfR")
];
const rows = [
  {property_id:"BDS-DEMO-001",price_text:"15tr",address:"160/34/13 Phan Huy Ích",street:"Phan Huy Ích",ward:"Phường 12",district:"Gò Vấp",area_text:"4.5 × 9m",bedrooms:3,bathrooms:3,structure:"Trệt 3 lầu",phone:"0931161682",property_type:"Nhà",raw_text:"Nhà hẻm xe hơi, trệt 3 lầu, 3 phòng ngủ, 3 WC.",image_count:3,received_at:new Date().toISOString(),property_images:sampleImages.map((url,index)=>({position:index+1,public_url:url}))},
  {property_id:"BDS-DEMO-002",price_text:"18 tỷ",address:"1C Tống Văn Hên",street:"Tống Văn Hên",ward:"Phường 15",district:"Tân Bình",area_text:"4 × 17m",bedrooms:2,bathrooms:2,structure:"Trệt, lầu",phone:"0913922733",property_type:"Nhà",raw_text:"Nhà Tân Bình 4x17m, trệt lầu, 2 phòng ngủ, 2 WC.",image_count:1,received_at:new Date(Date.now()-3600000).toISOString(),property_images:[{position:1,public_url:sampleImages[1]}]},
  {property_id:"BDS-DEMO-003",price_text:"39tr/th",address:"119 Phổ Quang",street:"Phổ Quang",ward:"Phường 9",district:"Phú Nhuận",area_text:"92.8 m²",bedrooms:5,bathrooms:4,structure:"Trệt 2 lầu 1 tum",phone:"0523825888",property_type:"Biệt thự nguyên căn",raw_text:"Nhà nguyên căn phù hợp kinh doanh, gần trường học và trung tâm thương mại.",image_count:1,received_at:new Date(Date.now()-7200000).toISOString(),property_images:[{position:1,public_url:sampleImages[2]}]}
];
const adminCode = env.ADMIN_ACCESS_CODE || process.env.ADMIN_ACCESS_CODE || "246810";
const ctvCode = env.CTV_ACCESS_CODE || process.env.CTV_ACCESS_CODE || "135790";
let dynamicAdminCode = adminCode;
let dynamicCtvCode = ctvCode;
let dynamicPinsUpdatedAt = new Date().toISOString();
const previewAdminToken = "fourland-preview-admin";
const previewCtvToken = "fourland-preview-ctv";
const getAuthRole = req => {
  const cookies = String(req.headers.cookie||"").split(";").map(v=>v.trim());
  if (cookies.includes(`fourland_admin=${previewAdminToken}`)) return "admin";
  if (cookies.includes(`fourland_admin=${previewCtvToken}`)) return "ctv";
  return null;
};
const isAdmin = req => getAuthRole(req) === "admin";
const isCtv = req => getAuthRole(req) === "ctv";

// High-Speed In-Memory Cache for CMS Admin
let cachedDashboardSummary = null;
let cachedDashboardSummaryTime = 0;
const propertyListCache = new Map();
let cachedReviewQueue = null;
let cachedReviewQueueTime = 0;

function invalidateCmsCache() {
  cachedDashboardSummary = null;
  cachedDashboardSummaryTime = 0;
  propertyListCache.clear();
  cachedReviewQueue = null;
  cachedReviewQueueTime = 0;
}

function send(res, status, body, contentType="application/json; charset=utf-8") {
  res.writeHead(status,{"Content-Type":contentType,"Cache-Control":"no-store"});
  res.end(contentType.startsWith("application/json")?JSON.stringify(body):body);
}

async function dbRequest(route,{method="GET",body,prefer="",contentType="application/json"}={}){
  const response=await fetch(`${database.url}/rest/v1/${route}`,{method,headers:{apikey:database.key,"User-Agent":"fourland-local-server/1.0",...(body!==undefined?{"Content-Type":contentType}:{}),...(prefer?{Prefer:prefer}:{})},...(body!==undefined?{body:contentType==="application/json"?JSON.stringify(body):body}:{})});
  const raw=await response.text();if(!response.ok)throw new Error(`Database ${response.status}: ${raw.slice(0,300)}`);return{data:raw?JSON.parse(raw):[],count:Number((response.headers.get("content-range")||"/0").split("/")[1])||0};
}

function readBody(req,max=5*1024*1024){return new Promise((resolve,reject)=>{let raw="";req.on("data",chunk=>{raw+=chunk;if(raw.length>max){reject(new Error("Dữ liệu quá lớn"));req.destroy()}});req.on("end",()=>{try{resolve(JSON.parse(raw||"{}"))}catch{reject(new Error("Dữ liệu không hợp lệ"))}});req.on("error",reject)})}

async function listDatabaseProperties(url){
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(60, Math.max(1, Number(url.searchParams.get("pageSize") || 24)));
  
  const rawQ = String(url.searchParams.get("q") || "").trim();
  const nlp = parseNaturalQuery(rawQ);

  const sortBy = url.searchParams.get("sortBy") || "newest";
  const explicitFilters = {
    district: url.searchParams.get("district"),
    ward: url.searchParams.get("ward"),
    street: url.searchParams.get("street"),
    property_type: url.searchParams.get("type"),
    timeRange: url.searchParams.get("timeRange"),
    rentalStatus: url.searchParams.get("rentalStatus") || url.searchParams.get("status"),
    minPrice: url.searchParams.get("minPrice") ? Number(url.searchParams.get("minPrice")) : null,
    maxPrice: url.searchParams.get("maxPrice") ? Number(url.searchParams.get("maxPrice")) : null,
    minArea: url.searchParams.get("minArea") ? Number(url.searchParams.get("minArea")) : null,
    maxArea: url.searchParams.get("maxArea") ? Number(url.searchParams.get("maxArea")) : null,
    bedrooms: url.searchParams.get("bedrooms") ? Number(url.searchParams.get("bedrooms")) : null
  };

  const query = new URLSearchParams({
    select: "*,property_images(position,public_url,source_url)",
    order: "received_at.desc",
    limit: "5000"
  });
  query.set("status", url.searchParams.get("archived") === "only" ? "eq.archived" : "neq.archived");

  const result = await dbRequest(`properties?${query}`);
  const allRows = result.data || [];

  const featuredOnly = url.searchParams.get("featured") === "1" || url.searchParams.get("featured") === "true";
  const withImagesOnly = url.searchParams.get("withImages") === "1" || url.searchParams.get("withImages") === "true";

  const scoredRows = allRows
    .map(row => {
      const isFeatured = row.status === "featured" || Boolean(row.data_json?.is_featured);
      const isRented = row.status === "rented" || Boolean(row.data_json?.is_rented);
      return {
        row: {
          ...row,
          is_featured: isFeatured,
          is_rented: isRented,
          view_count: Number(row.data_json?.view_count) || 0
        },
        score: matchAndScoreProperty(row, nlp, explicitFilters),
        isFeatured,
        isRented
      };
    })
    .filter(item => {
      if (item.score <= 0) return false;
      if (featuredOnly && !item.isFeatured) return false;
      if (withImagesOnly && !(Number(item.row.image_count) > 0 || item.row.property_images?.length > 0)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "price_asc") {
        const pa = a.row.price_number || 999999999999;
        const pb = b.row.price_number || 999999999999;
        return pa - pb;
      }
      if (sortBy === "price_desc") {
        const pa = a.row.price_number || 0;
        const pb = b.row.price_number || 0;
        return pb - pa;
      }
      if (sortBy === "area_desc") {
        const aa = a.row.area_number || 0;
        const ab = b.row.area_number || 0;
        return ab - aa;
      }
      if (sortBy === "oldest") {
        return new Date(a.row.received_at || 0) - new Date(b.row.received_at || 0);
      }
      // Mặc định khi không có từ khóa tìm kiếm: Luôn ưu tiên tin MỚI NHẤT lên đầu trang!
      if (!rawQ) {
        if (a.isFeatured !== b.isFeatured) return b.isFeatured ? 1 : -1;
        return new Date(b.row.received_at || 0) - new Date(a.row.received_at || 0);
      }
      if (b.score !== a.score) return b.score - a.score;
      if (a.isFeatured !== b.isFeatured) return b.isFeatured ? 1 : -1;
      return new Date(b.row.received_at || 0) - new Date(a.row.received_at || 0);
    });

  const total = scoredRows.length;
  const paginatedRows = scoredRows
    .slice((page - 1) * pageSize, page * pageSize)
    .map(item => item.row);

  return { ok: true, rows: paginatedRows, total, page, pageSize, parsedNlp: nlp.filters };
}

let currentSimulatedRole = "super_admin";
let currentDisplayName = "Lê Fourland";
let mockUsers = [
  { id: "usr_superadmin", display_name: "Lê Fourland (Super Admin)", role: "super_admin", is_active: true, created_at: new Date(Date.now() - 86400000 * 30).toISOString(), updated_at: new Date().toISOString() },
  { id: "usr_manager", display_name: "Trần Quản Lý (Manager)", role: "manager", is_active: true, created_at: new Date(Date.now() - 86400000 * 20).toISOString(), updated_at: new Date().toISOString() },
  { id: "usr_editor", display_name: "Nguyễn Biên Tập (Editor)", role: "editor", is_active: true, created_at: new Date(Date.now() - 86400000 * 15).toISOString(), updated_at: new Date().toISOString() },
  { id: "usr_sales", display_name: "Phạm Môi Giới (Sales)", role: "sales", is_active: true, created_at: new Date(Date.now() - 86400000 * 10).toISOString(), updated_at: new Date().toISOString() },
  { id: "usr_viewer", display_name: "Khách Xem Kho (Viewer)", role: "viewer", is_active: true, created_at: new Date(Date.now() - 86400000 * 5).toISOString(), updated_at: new Date().toISOString() }
];

http.createServer(async (req,res)=>{
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if(url.pathname==="/api/admin/v1/login") {
    if(req.method!=="POST") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    try {
      const body=await readBody(req);
      const email=String(body.email||body.username||"").toLowerCase().trim();
      const selectedRole=body.role;
      const DEMO_MAP={
        "admin@fourland.vn": { id:"usr_superadmin", displayName:"Lê Fourland (Super Admin)", role:"super_admin" },
        "manager@fourland.vn": { id:"usr_manager", displayName:"Trần Quản Lý (Manager)", role:"manager" },
        "sales@fourland.vn": { id:"usr_sales", displayName:"Phạm Môi Giới (Sales)", role:"sales" },
        "editor@fourland.vn": { id:"usr_editor", displayName:"Nguyễn Biên Tập (Editor)", role:"editor" },
        "viewer@fourland.vn": { id:"usr_viewer", displayName:"Khách Xem Kho (Viewer)", role:"viewer" }
      };
      let user = null;
      if(selectedRole && ["super_admin","manager","editor","sales","viewer"].includes(selectedRole)) {
        user = Object.values(DEMO_MAP).find(u=>u.role===selectedRole) || { id:`usr_${selectedRole}`, displayName:`Tài khoản ${selectedRole}`, role:selectedRole };
      } else if(DEMO_MAP[email]) {
        user = DEMO_MAP[email];
      } else if(email) {
        user = { id:`usr_${Date.now().toString(36)}`, displayName:email.split("@")[0].toUpperCase(), role:"sales" };
      }
      if(!user) return send(res,401,{ok:false,error:{code:"INVALID_CREDENTIALS",message:"Tài khoản hoặc mật khẩu không chính xác"}});
      currentSimulatedRole=user.role;
      currentDisplayName=user.displayName;
      return send(res,200,{ok:true,data:{user,token:"fourland-preview-cms",expiresIn:86400},message:`Đăng nhập thành công với vai trò ${user.role}`});
    } catch(error){ return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
  }
  if(url.pathname==="/api/admin/v1/logout") {
    if(req.method!=="POST") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    return send(res,200,{ok:true,message:"Đã đăng xuất thành công"});
  }
  if(url.pathname==="/api/admin/v1/me") {
    if(req.method!=="GET") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    return send(res,200,{ok:true,data:{user:{id:"preview-user",displayName:currentDisplayName,role:currentSimulatedRole}}});
  }
  if(url.pathname==="/api/admin/v1/switch-role") {
    if(req.method!=="POST") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    try {
      const body=await readBody(req);
      const requestedRole=String(body.role||"").toLowerCase();
      const validRoles=["super_admin","manager","editor","sales","viewer"];
      if(!validRoles.includes(requestedRole)) return send(res,422,{ok:false,error:{code:"VALIDATION_FAILED",message:"Vai trò không hợp lệ"}});
      currentSimulatedRole=requestedRole;
      const roleTitles={super_admin:"Lê Fourland (Super Admin)",manager:"Lê Fourland (Manager)",editor:"Lê Fourland (Editor)",sales:"Lê Fourland (Sales)",viewer:"Lê Fourland (Viewer)"};
      currentDisplayName=roleTitles[requestedRole]||"Lê Fourland";
      return send(res,200,{ok:true,data:{user:{id:"preview-user",displayName:currentDisplayName,role:currentSimulatedRole}},message:`Đã chuyển sang vai trò: ${requestedRole}`});
    } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
  }
  if(url.pathname==="/api/admin/v1/users") {
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    if(req.method==="GET") {
      try {
        let userList = mockUsers;
        if(databaseEnabled) {
          const dbUsers = await dbRequest("profiles?select=id,display_name,role,is_active,created_at,updated_at&order=created_at.desc");
          if(dbUsers.data && dbUsers.data.length > 0) userList = dbUsers.data;
        }
        const users = userList.map(r => ({
          id: String(r.id),
          displayName: r.display_name || "Chưa đặt tên",
          role: r.role || "viewer",
          isActive: r.is_active !== undefined ? Boolean(r.is_active) : true,
          createdAt: r.created_at || new Date().toISOString(),
          updatedAt: r.updated_at || new Date().toISOString()
        }));
        const summary = {
          total: users.length,
          superAdmin: users.filter(u => u.role === "super_admin").length,
          manager: users.filter(u => u.role === "manager").length,
          editor: users.filter(u => u.role === "editor").length,
          sales: users.filter(u => u.role === "sales").length,
          viewer: users.filter(u => u.role === "viewer").length,
          active: users.filter(u => u.isActive).length
        };
        return send(res,200,{ok:true,data:{users,summary}});
      } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
    }
    if(req.method==="POST") {
      try {
        const body=await readBody(req);
        const displayName=String(body.displayName||body.display_name||"").trim();
        const role=String(body.role||"viewer").toLowerCase();
        if(!displayName) return send(res,422,{ok:false,error:{code:"VALIDATION_FAILED",message:"Họ và tên không được để trống"}});
        const newUser={
          id:`usr_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
          display_name:displayName,
          role:role,
          is_active:body.isActive!==undefined?Boolean(body.isActive):true,
          created_at:new Date().toISOString(),
          updated_at:new Date().toISOString()
        };
        mockUsers.unshift(newUser);
        return send(res,201,{ok:true,data:{user:newUser},message:"Đã tạo tài khoản thành viên thành công"});
      } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
    }
    if(req.method==="PATCH") {
      try {
        const body=await readBody(req);
        const userId=String(url.searchParams.get("id")||body.id||"");
        if(!userId) return send(res,400,{ok:false,error:{code:"VALIDATION_FAILED",message:"Thiếu ID người dùng"}});
        const target=mockUsers.find(u=>u.id===userId);
        if(!target) return send(res,404,{ok:false,error:{code:"NOT_FOUND",message:"Không tìm thấy người dùng"}});
        if(body.role) target.role=String(body.role).toLowerCase();
        if(body.displayName||body.display_name) target.display_name=String(body.displayName||body.display_name).trim();
        if(body.isActive!==undefined) target.is_active=Boolean(body.isActive);
        target.updated_at=new Date().toISOString();
        return send(res,200,{ok:true,data:{user:target},message:"Đã cập nhật tài khoản thành công"});
      } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
    }
  }
  if(url.pathname==="/api/admin/v1/smart-match") {
    if(req.method!=="POST") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    try {
      const body=await readBody(req);
      const rawQuery=String(body.query||"").trim();
      let criteria={};
      if(rawQuery){
        const parsed=parseNaturalQuery(rawQuery);
        const filters=parsed.filters||{};
        criteria={
          district:filters.district||body.district||null,
          propertyType:filters.propertyType||body.propertyType||null,
          minPrice:filters.minPrice||(body.minPrice?Number(body.minPrice):null),
          maxPrice:filters.maxPrice||(body.maxPrice?Number(body.maxPrice):null),
          minArea:filters.minArea||(body.minArea?Number(body.minArea):null),
          maxArea:filters.maxArea||(body.maxArea?Number(body.maxArea):null),
          bedrooms:filters.bedrooms||(body.bedrooms?Number(body.bedrooms):null),
          dimensions:filters.dimensions||body.dimensions||null
        };
      } else {
        criteria={
          district:body.district||null,
          propertyType:body.propertyType||null,
          minPrice:body.minPrice?Number(body.minPrice):null,
          maxPrice:body.maxPrice?Number(body.maxPrice):null,
          minArea:body.minArea?Number(body.minArea):null,
          maxArea:body.maxArea?Number(body.maxArea):null,
          bedrooms:body.bedrooms?Number(body.bedrooms):null,
          dimensions:body.dimensions||null
        };
      }
      const rawProperties=databaseEnabled
        ? (await dbRequest("properties?status=neq.archived&order=received_at.desc&limit=150")).data
        : rows.filter(r=>r.status!=="archived");
      const rankedItems=rankPropertiesForLead(rawProperties,criteria);
      const items=rankedItems.slice(0,20).map(item=>({
        id:item.property_id,
        address:item.address||`Khu vực ${item.district||"TP.HCM"}`,
        district:item.district,
        ward:item.ward,
        street:item.street,
        propertyType:item.property_type||"Nhà phố",
        price:item.price_text,
        priceNumber:item.price_number,
        area:item.area_text||item.dimensions,
        dimensions:item.dimensions,
        bedrooms:item.bedrooms,
        bathrooms:item.bathrooms,
        structure:item.structure,
        legal:item.legal,
        commission:item.commission,
        phone:item.phone,
        imageCount:item.image_count||0,
        matchScore:item.matchScore,
        isTopMatch:item.isTopMatch,
        reasons:item.reasons,
        highlights:item.highlights,
        pitchText:item.pitchText,
        receivedAt:item.received_at
      }));
      return send(res,200,{ok:true,data:{items,criteriaUsed:criteria,totalAvailable:rawProperties.length,totalMatched:rankedItems.length},message:`Đã tìm thấy ${items.length} căn nhà phù hợp nhất trong kho`});
    } catch(error){ return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
  }
  if(url.pathname==="/api/admin/v1/dashboard/summary") {
    if(req.method!=="GET") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    try {
      if (cachedDashboardSummary && (Date.now() - cachedDashboardSummaryTime < 30000)) {
        return send(res,200,{ok:true,data:{summary:cachedDashboardSummary}});
      }
      const sourceRows=databaseEnabled
        ? (await dbRequest("properties?select=status,content_status,availability_status,address,price_text,image_count,received_at&limit=5000")).data
        : rows;
      const summary = buildDashboardSummary(sourceRows);
      cachedDashboardSummary = summary;
      cachedDashboardSummaryTime = Date.now();
      return send(res,200,{ok:true,data:{summary}});
    } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
  }
  if(url.pathname==="/api/admin/v1/properties") {
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    if(req.method==="POST") {
      try {
        const body=await readBody(req);
        const address=String(body.address||"").trim();
        if(!address) return send(res,422,{ok:false,error:{code:"VALIDATION_FAILED",message:"Địa chỉ bất động sản không được để trống",fieldErrors:{address:"Địa chỉ là bắt buộc"}}});
        const now=new Date().toISOString();
        const propertyId=`FL_${Date.now()}_${Math.random().toString(36).slice(2,6).toUpperCase()}`;
        const rawImageUrls=Array.isArray(body.images)?body.images:String(body.image_urls||"").split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
        const propertyRow={
          property_id:propertyId,
          address:address,
          district:String(body.district||"").trim()||null,
          ward:String(body.ward||"").trim()||null,
          street:String(body.street||"").trim()||null,
          property_type:String(body.property_type||"").trim()||"Nhà phố",
          price_text:String(body.price_text||"").trim()||null,
          area_text:String(body.area_text||"").trim()||null,
          dimensions:String(body.dimensions||"").trim()||null,
          structure:String(body.structure||"").trim()||null,
          bedrooms:Number.isInteger(Number(body.bedrooms))&&Number(body.bedrooms)>=0?Number(body.bedrooms):null,
          bathrooms:Number.isInteger(Number(body.bathrooms))&&Number(body.bathrooms)>=0?Number(body.bathrooms):null,
          legal:String(body.legal||"").trim()||null,
          phone:String(body.phone||"").trim()||null,
          commission:String(body.commission||"").trim()||null,
          notes:String(body.notes||"").trim()||null,
          raw_text:String(body.notes||"").trim()||`Hồ sơ tạo trực tiếp: ${address}`,
          status:body.status||"ready",
          content_status:"published",
          availability_status:"available",
          quality_status:"complete",
          is_featured:Boolean(body.is_featured),
          image_count:rawImageUrls.length,
          received_at:now,
          updated_at:now,
          data_json:{
            source:"manual_cms",
            created_by:"manager",
            created_at:now
          }
        };
        invalidateCmsCache();
        if(databaseEnabled){
          const result=await dbRequest("properties",{method:"POST",body:propertyRow,prefer:"return=representation"});
          if(rawImageUrls.length>0){
            const imageRows=rawImageUrls.map((url,idx)=>({property_id:propertyId,position:idx+1,public_url:url,file_name:`img_${idx+1}.jpg`,file_path:url}));
            await dbRequest("property_images",{method:"POST",body:imageRows}).catch(err=>console.error("Image insert error:",err.message));
          }
          return send(res,201,{ok:true,data:{property:result.data?.[0]||propertyRow},message:"Đã tạo hồ sơ bất động sản thành công"});
        }else{
          rows.unshift(propertyRow);
          return send(res,201,{ok:true,data:{property:propertyRow},message:"Đã tạo hồ sơ bất động sản thành công (môi trường giả lập)"});
        }
      } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
    }
    if(req.method!=="GET") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    try {
      const filters=parsePropertyListQuery(url.searchParams);
      const cacheKey = url.searchParams.toString();
      const cached = propertyListCache.get(cacheKey);
      if (cached && (Date.now() - cached.time < 15000)) {
        return send(res,200,cached.response);
      }

      if(databaseEnabled){
        const result=await dbRequest(buildPropertyListRoute(filters),{prefer:"count=exact"});
        const responseData = {ok:true,data:{items:result.data.map(normalizePropertyListItem)},meta:{page:filters.page,pageSize:filters.pageSize,total:result.count,hasNext:filters.page*filters.pageSize<result.count}};
        propertyListCache.set(cacheKey, { time: Date.now(), response: responseData });
        return send(res,200,responseData);
      }
      let filtered=rows.filter(row=>filters.status==="all"||(filters.status==="archived"?row.status==="archived":row.status!=="archived"));
      if(filters.q){const query=removeVietnameseTones(filters.q).toLowerCase();filtered=filtered.filter(row=>removeVietnameseTones([row.address,row.district,row.ward,row.street,row.property_type,row.price_text].join(" ")).toLowerCase().includes(query))}
      if(filters.district)filtered=filtered.filter(row=>removeVietnameseTones(row.district).toLowerCase().includes(removeVietnameseTones(filters.district).toLowerCase()));
      if(filters.quality==="without_images")filtered=filtered.filter(row=>Number(row.image_count||0)===0);
      if(filters.quality==="missing_data")filtered=filtered.filter(row=>!row.address||!row.price_text||Number(row.image_count||0)<2);
      const total=filtered.length,start=(filters.page-1)*filters.pageSize;
      const responseData = {ok:true,data:{items:filtered.slice(start,start+filters.pageSize).map(normalizePropertyListItem)},meta:{page:filters.page,pageSize:filters.pageSize,total,hasNext:filters.page*filters.pageSize<total}};
      propertyListCache.set(cacheKey, { time: Date.now(), response: responseData });
      return send(res,200,responseData);
    } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
  }
  if(url.pathname==="/api/admin/v1/review-queue") {
    if(req.method!=="GET") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    try {
      if (cachedReviewQueue && (Date.now() - cachedReviewQueueTime < 30000)) {
        return send(res,200,{ok:true,data:cachedReviewQueue});
      }
      const sourceRows=databaseEnabled?(await dbRequest(buildReviewQueueRoute(30))).data:rows;
      const data = buildReviewQueue(sourceRows);
      cachedReviewQueue = data;
      cachedReviewQueueTime = Date.now();
      return send(res,200,{ok:true,data});
    } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
  }
  if(url.pathname==="/api/admin/v1/system/health") {
    if(req.method!=="GET") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    try {
      const propertyRows=databaseEnabled?(await dbRequest("properties?select=status,content_status&limit=5000")).data:rows;
      const imageCount=databaseEnabled?(await dbRequest("property_images?select=property_id&limit=1",{prefer:"count=exact"})).count:rows.reduce((sum,row)=>sum+Number(row.image_count||0),0);
      return send(res,200,{ok:true,data:{health:buildSystemHealth({
        properties:propertyRows,
        imageCount,
        mutationsEnabled: env.CMS_MUTATIONS_ENABLED === "true" || process.env.CMS_MUTATIONS_ENABLED === "true",
        syncWritesEnabled: env.SYNC_WRITES_ENABLED === "true" || process.env.SYNC_WRITES_ENABLED === "true"
      })}});
    } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
  }
  const cmsPropertyMatch=url.pathname.match(/^\/api\/admin\/v1\/properties\/([^/]+)$/);
  if(cmsPropertyMatch) {
    if(req.method!=="GET") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    const id=validPropertyId(decodeURIComponent(cmsPropertyMatch[1]));
    if(!id)return send(res,400,{ok:false,error:{code:"VALIDATION_FAILED",message:"Mã hồ sơ không hợp lệ"}});
    try {
      const row=databaseEnabled?(await dbRequest(buildPropertyDetailRoute(id))).data[0]:rows.find(item=>item.property_id===id);
      if(!row)return send(res,404,{ok:false,error:{code:"NOT_FOUND",message:"Không tìm thấy hồ sơ"}});
      return send(res,200,{ok:true,data:{property:normalizePropertyDetail(row,{includeSensitive:true})}});
    } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
  }
  const cmsValidateMatch=url.pathname.match(/^\/api\/admin\/v1\/properties\/([^/]+)\/validate$/);
  if(cmsValidateMatch) {
    if(req.method!=="POST") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    const id=validPropertyId(decodeURIComponent(cmsValidateMatch[1]));
    if(!id)return send(res,400,{ok:false,error:{code:"VALIDATION_FAILED",message:"Mã hồ sơ không hợp lệ"}});
    try {
      const body=await readBody(req);
      const current=databaseEnabled?(await dbRequest(buildPropertyDetailRoute(id))).data[0]:rows.find(item=>item.property_id===id);
      if(!current)return send(res,404,{ok:false,error:{code:"NOT_FOUND",message:"Không tìm thấy hồ sơ"}});
      if(body.expectedUpdatedAt&&String(body.expectedUpdatedAt)!==String(current.updated_at||""))return send(res,409,{ok:false,error:{code:"VERSION_CONFLICT",message:"Hồ sơ đã thay đổi, cần tải lại trước khi tiếp tục"}});
      const validation=validatePropertyDraft(current,body.fields);
      return send(res,validation.valid?200:422,{ok:validation.valid,data:{validation,mode:"preview-only"},...(validation.valid?{}:{error:{code:"VALIDATION_FAILED",message:"Dữ liệu biên tập chưa hợp lệ",fieldErrors:validation.errors}})});
    } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
  }
  const cmsMutationMatch=url.pathname.match(/^\/api\/admin\/v1\/properties\/([^/]+)\/(update|workflow)$/);
  if(cmsMutationMatch) {
    if(String(req.headers.authorization||"")!=="Bearer fourland-preview-cms") return send(res,401,{ok:false,error:{code:"AUTH_REQUIRED",message:"Cần đăng nhập CMS"}});
    const id=validPropertyId(decodeURIComponent(cmsMutationMatch[1]));
    const action=cmsMutationMatch[2];
    if(!id) return send(res,400,{ok:false,error:{code:"VALIDATION_FAILED",message:"Mã hồ sơ không hợp lệ"}});
    
    if(action==="update") {
      try {
        const body=await readBody(req);
        const fields=body.fields||body;
        const now=new Date().toISOString();
        const updateData={
          updated_at: now
        };
        if(fields.address!==undefined) updateData.address=String(fields.address||"").trim();
        if(fields.district!==undefined) updateData.district=String(fields.district||"").trim()||null;
        if(fields.ward!==undefined) updateData.ward=String(fields.ward||"").trim()||null;
        if(fields.street!==undefined) updateData.street=String(fields.street||"").trim()||null;
        if(fields.property_type!==undefined) updateData.property_type=String(fields.property_type||"").trim()||null;
        if(fields.price_text!==undefined) updateData.price_text=String(fields.price_text||"").trim()||null;
        if(fields.area_text!==undefined) updateData.area_text=String(fields.area_text||"").trim()||null;
        if(fields.dimensions!==undefined) updateData.dimensions=String(fields.dimensions||"").trim()||null;
        if(fields.structure!==undefined) updateData.structure=String(fields.structure||"").trim()||null;
        if(fields.bedrooms!==undefined) updateData.bedrooms=Number.isInteger(Number(fields.bedrooms))?Number(fields.bedrooms):null;
        if(fields.bathrooms!==undefined) updateData.bathrooms=Number.isInteger(Number(fields.bathrooms))?Number(fields.bathrooms):null;
        if(fields.legal!==undefined) updateData.legal=String(fields.legal||"").trim()||null;
        if(fields.phone!==undefined) updateData.phone=String(fields.phone||"").trim()||null;
        if(fields.commission!==undefined) updateData.commission=String(fields.commission||"").trim()||null;
        if(fields.notes!==undefined) updateData.notes=String(fields.notes||"").trim()||null;
        
        invalidateCmsCache();
        if(databaseEnabled){
          const result=await dbRequest(`properties?property_id=eq.${encodeURIComponent(id)}`,{method:"PATCH",body:updateData,prefer:"return=representation"});
          return send(res,200,{ok:true,data:{property:result.data?.[0]||{property_id:id,...updateData}},message:"Đã lưu thay đổi hồ sơ bất động sản thành công"});
        }else{
          const target=rows.find(item=>item.property_id===id);
          if(target) Object.assign(target,updateData);
          return send(res,200,{ok:true,data:{property:target||{property_id:id,...updateData}},message:"Đã lưu thay đổi hồ sơ bất động sản thành công"});
        }
      } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
    }
    
    if(action==="workflow") {
      try {
        const body=await readBody(req);
        const command=String(body.command||"").toLowerCase();
        const now=new Date().toISOString();
        let updateData={ updated_at: now };
        if(command==="publish") {
          updateData.status="ready";
          updateData.content_status="published";
          updateData.availability_status="available";
        } else if(command==="archive") {
          updateData.status="archived";
          updateData.content_status="archived";
          updateData.availability_status="rented";
        } else if(command==="restore") {
          updateData.status="ready";
          updateData.content_status="published";
          updateData.availability_status="available";
        } else if(command==="submit_review") {
          updateData.content_status="pending_review";
        } else {
          return send(res,400,{ok:false,error:{code:"VALIDATION_FAILED",message:"Lệnh workflow không hợp lệ"}});
        }
        
        invalidateCmsCache();
        if(databaseEnabled){
          const result=await dbRequest(`properties?property_id=eq.${encodeURIComponent(id)}`,{method:"PATCH",body:updateData,prefer:"return=representation"});
          return send(res,200,{ok:true,data:{property:result.data?.[0]||{property_id:id,...updateData}},message:`Đã cập nhật trạng thái hồ sơ: ${command}`});
        }else{
          const target=rows.find(item=>item.property_id===id);
          if(target) Object.assign(target,updateData);
          return send(res,200,{ok:true,data:{property:target||{property_id:id,...updateData}},message:`Đã cập nhật trạng thái hồ sơ: ${command}`});
        }
      } catch(error) { return send(res,500,{ok:false,error:{code:"DEPENDENCY_UNAVAILABLE",message:error.message}}); }
    }
  }
  if(url.pathname==="/api/admin/v1/facebook/draft" || url.pathname==="/api/admin/v1/facebook/publish" || url.pathname==="/api/admin/v1/facebook") {
    if(req.method!=="POST") return send(res,405,{ok:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method Not Allowed"}});
    try {
      const body=await readBody(req);
      const action = body.action || (url.pathname.includes("/draft") ? "draft" : "publish");
      if (action === "draft") {
        const propertyId = body.propertyId;
        const current = databaseEnabled ? (await dbRequest(buildPropertyDetailRoute(propertyId))).data[0] : rows.find(item => item.property_id === propertyId);
        if (!current) return send(res, 404, { ok: false, error: { message: "Không tìm thấy bất động sản" } });
        const tone = body.tone || "hot";
        const content = generateFacebookPost(current, {
          tone,
          includeLink: body.includeLink !== false,
          hotline: body.hotline || process.env.FACEBOOK_HOTLINE || "037.6789.808",
          pageName: process.env.FACEBOOK_PAGE_NAME || "Ngọc Nhà Tốt"
        });
        const images = (current.property_images || []).map(img => img.public_url).filter(Boolean);
        return send(res, 200, { ok: true, data: { propertyId, tone, content, images, pageName: process.env.FACEBOOK_PAGE_NAME || "Ngọc Nhà Tốt" } });
      }
      if (action === "publish") {
        const content = String(body.content || "").trim();
        const propertyId = body.propertyId;
        const photoUrls = Array.isArray(body.images) ? body.images : [];
        const pageName = body.pageName || process.env.FACEBOOK_PAGE_NAME || "Ngọc Nhà Tốt";

        if (propertyId) {
          invalidateCmsCache();
          if (databaseEnabled) {
            await dbRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`, {
              method: "PATCH",
              body: { raw_text: content, notes: null, updated_at: new Date().toISOString() }
            }).catch(err => console.warn("Update property content notice:", err.message));
        } else {
            const target = rows.find(item => item.property_id === propertyId);
            if (target) {
              target.raw_text = content;
              target.notes = null;
              target.updated_at = new Date().toISOString();
            }
          }
        }

        const publishResult = await publishToComposioFacebook({
          content,
          imageUrls: photoUrls,
          pageName,
          apiKey: process.env.COMPOSIO_API_KEY || "ck_e4AHzIDYFZKwFT8XrkwX",
          pageId: process.env.FACEBOOK_PAGE_ID || "106656702112510"
        });
        return send(res, 200, { ok: true, data: publishResult, message: `${publishResult.message} (Đã lưu nội dung vào kho nhà)` });
      }
    } catch(error) {
      return send(res, 500, { ok: false, error: { message: error.message } });
    }
  }
  if(url.pathname==="/api/admin/v1/access-pins" || url.pathname==="/api/admin-pin-settings") {
    if(req.method==="GET") {
      return send(res, 200, {
        ok: true,
        data: {
          adminCode: dynamicAdminCode,
          ctvCode: dynamicCtvCode,
          updatedAt: dynamicPinsUpdatedAt
        }
      });
    }
    if(req.method==="PATCH" || req.method==="POST") {
      try {
        const body = await readBody(req);
        const nextAdmin = body.adminCode || body.admin_access_code;
        const nextCtv = body.ctvCode || body.ctv_access_code;
        if(nextAdmin) dynamicAdminCode = String(nextAdmin).trim();
        if(nextCtv) dynamicCtvCode = String(nextCtv).trim();
        dynamicPinsUpdatedAt = new Date().toISOString();
        return send(res, 200, {
          ok: true,
          message: "Đã cập nhật mã PIN Admin và CTV thành công!",
          data: {
            adminCode: dynamicAdminCode,
            ctvCode: dynamicCtvCode,
            updatedAt: dynamicPinsUpdatedAt
          }
        });
      } catch(err) {
        return send(res, 400, { ok: false, error: err.message });
      }
    }
    return send(res, 405, { ok: false, error: "Method Not Allowed" });
  }
  if(url.pathname==="/api/admin-login") {
    if(req.method==="GET") {
      const currentRole = getAuthRole(req);
      return send(res,200,{ok:true,authenticated:Boolean(currentRole),role:currentRole});
    }
    if(req.method==="DELETE") {
      res.setHeader("Set-Cookie","fourland_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
      return send(res,200,{ok:true,authenticated:false,role:null,message:"Đã thoát quyền truy cập"});
    }
    if(req.method!=="POST") return send(res,405,{ok:false,error:"Method Not Allowed"});
    let raw="";req.on("data",chunk=>raw+=chunk);req.on("end",()=>{
      try{
        const body=JSON.parse(raw||"{}");
        const inputCode = String(body.code||"").trim();
        let role = null;
        let token = "";
        let message = "";
        if (inputCode === dynamicAdminCode || inputCode === adminCode) {
          role = "admin";
          token = previewAdminToken;
          message = "Đã mở toàn quyền Quản trị viên.";
        } else if (inputCode === dynamicCtvCode || inputCode === ctvCode) {
          role = "ctv";
          token = previewCtvToken;
          message = "Đã mở quyền Cộng tác viên (Xem trọn vẹn địa chỉ nhà).";
        } else {
          return send(res,401,{ok:false,error:"Mã truy cập không đúng"});
        }
        res.setHeader("Set-Cookie",`fourland_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);
        return send(res,200,{ok:true,authenticated:true,role,message});
      }catch{
        return send(res,400,{ok:false,error:"Dữ liệu không hợp lệ"});
      }
    });
    return;
  }
  if(url.pathname==="/api/admin-archive") {
    if(req.method!=="PATCH") return send(res,405,{ok:false,error:"Method Not Allowed"});
    if(!isAdmin(req)) return send(res,401,{ok:false,error:"Phiên quản trị chưa được mở"});
    try{
      const body=await readBody(req);
      const archived=Boolean(body.archived);
      let propertyIds=[];
      if(Array.isArray(body.propertyIds)){
        propertyIds=body.propertyIds.map(id=>String(id||"").slice(0,100)).filter(Boolean);
      }else if(body.propertyId){
        const single=String(body.propertyId||"").slice(0,100);
        if(single) propertyIds=[single];
      }
      if(!propertyIds.length) return send(res,400,{ok:false,error:"Thiếu mã bất động sản"});
      const nextStatus=archived?"archived":"partial";
      if(databaseEnabled){
        await dbRequest(`properties?property_id=in.(${propertyIds.map(encodeURIComponent).join(",")})`,{method:"PATCH",body:{status:nextStatus,updated_at:new Date().toISOString()}});
        return send(res,200,{ok:true,updatedCount:propertyIds.length,message:archived?`Đã ẩn ${propertyIds.length} hồ sơ khỏi kho web`:`Đã khôi phục ${propertyIds.length} hồ sơ lên kho web`});
      }
      const matched=rows.filter(item=>propertyIds.includes(item.property_id));
      matched.forEach(row=>row.status=nextStatus);
      return send(res,200,{ok:true,updatedCount:matched.length,message:archived?`Đã ẩn ${matched.length} hồ sơ (preview mode)`:`Đã khôi phục ${matched.length} hồ sơ (preview mode)`});
    }catch(error){return send(res,500,{ok:false,error:error.message})}
  }
  if(url.pathname==="/api/admin-property") {
    if(req.method!=="PATCH") return send(res,405,{ok:false,error:"Method Not Allowed"});
    if(!isAdmin(req)) return send(res,401,{ok:false,error:"Phiên quản trị chưa được mở"});
    try{
      const body=await readBody(req),propertyId=String(body.propertyId||"");
      if(!propertyId)return send(res,400,{ok:false,error:"Thiếu mã bất động sản"});
      const update={};
      ["address","district","ward","street","price_text","area_text","dimensions","structure","legal","phone","property_type","raw_text","notes","bedrooms","bathrooms"].forEach(key=>{if(Object.prototype.hasOwnProperty.call(body,key))update[key]=body[key]===""?null:body[key]});
      if(Object.prototype.hasOwnProperty.call(body,"is_rented")){
        update.status=body.is_rented?"rented":(body.is_featured?"featured":"ready");
      }else if(Object.prototype.hasOwnProperty.call(body,"is_featured")){
        update.status=body.is_featured?"featured":"ready";
      }
      update.updated_at=new Date().toISOString();
      if(databaseEnabled){
        const result=await dbRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`,{method:"PATCH",body:update,prefer:"return=representation"});
        return send(res,200,{ok:true,property:result.data[0],message:"Đã cập nhật thông tin nhà"});
      }
      const row=rows.find(item=>item.property_id===propertyId);
      if(!row)return send(res,404,{ok:false,error:"Không tìm thấy bất động sản"});
      Object.assign(row,update);
      return send(res,200,{ok:true,property:row,message:"Đã cập nhật thông tin nhà"});
    }catch(error){return send(res,500,{ok:false,error:error.message})}
  }
  if(url.pathname==="/api/admin-image"&&req.method==="DELETE") {
    if(!isAdmin(req)) return send(res,401,{ok:false,error:"Cần quyền quản trị"});
    if(req.method!=="PATCH") return send(res,405,{ok:false,error:"Method Not Allowed"});
    try{
      const body=await readBody(req),propertyId=String(body.propertyId||"").slice(0,100);
      if(!propertyId) return send(res,400,{ok:false,error:"Thiếu propertyId"});
      const payload={};
      ["address","district","ward","street","property_type","price_text","area_text","dimensions","structure","legal","phone","raw_text"].forEach(key=>{if(body[key]!==undefined)payload[key]=String(body[key]||"").trim()});
      if(body.bedrooms!==undefined)payload.bedrooms=body.bedrooms===""?null:Number(body.bedrooms);
      if(body.bathrooms!==undefined)payload.bathrooms=body.bathrooms===""?null:Number(body.bathrooms);
      payload.updated_at=new Date().toISOString();
      if(databaseEnabled){await dbRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`,{method:"PATCH",body:payload});return send(res,200,{ok:true,message:"Đã cập nhật hồ sơ thành công"})}
      const row=rows.find(item=>item.property_id===propertyId);if(!row)return send(res,404,{ok:false,error:"Không tìm thấy hồ sơ"});
      Object.assign(row,payload);return send(res,200,{ok:true,message:"Đã cập nhật hồ sơ (preview mode)"});
    }catch(error){return send(res,500,{ok:false,error:error.message})}
  }
  if(url.pathname==="/api/admin-image") {
    if(!isAdmin(req)) return send(res,401,{ok:false,error:"Cần quyền quản trị"});
    if(req.method==="DELETE") {
      try{
        const body=await readBody(req),propertyId=String(body.propertyId||"").slice(0,100),position=Number(body.position);
        if(!propertyId||!Number.isInteger(position)) return send(res,400,{ok:false,error:"Thiếu propertyId hoặc position"});
        if(databaseEnabled){
          await dbRequest(`property_images?property_id=eq.${encodeURIComponent(propertyId)}&position=eq.${position}`,{method:"DELETE"});
          const remain=await dbRequest(`property_images?select=*&property_id=eq.${encodeURIComponent(propertyId)}&order=position.asc`);
          await dbRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`,{method:"PATCH",body:{image_count:remain.data.length,updated_at:new Date().toISOString()}});
          return send(res,200,{ok:true,message:"Đã xóa ảnh thành công"});
        }
        const row=rows.find(item=>item.property_id===propertyId);if(!row)return send(res,404,{ok:false,error:"Không tìm thấy hồ sơ"});
        row.property_images=(row.property_images||[]).filter(item=>item.position!==position);
        row.image_count=row.property_images.length;
        return send(res,200,{ok:true,message:"Đã xóa ảnh (preview mode)"});
      }catch(error){return send(res,500,{ok:false,error:error.message})}
    }
    if(req.method!=="POST") return send(res,405,{ok:false,error:"Method Not Allowed"});
    try{
      const body=await readBody(req),propertyId=String(body.propertyId||"").slice(0,100),dataUrl=String(body.dataUrl||"");
      if(!propertyId||!dataUrl.startsWith("data:image/")) return send(res,400,{ok:false,error:"Dữ liệu ảnh không hợp lệ"});
      if(databaseEnabled){
        const exist=await dbRequest(`property_images?select=position&property_id=eq.${encodeURIComponent(propertyId)}&order=position.desc&limit=1`);
        const nextPos=exist.data[0]?(Number(exist.data[0].position)||0)+1:1;
        await dbRequest("property_images",{method:"POST",body:{property_id:propertyId,position:nextPos,source_url:dataUrl,public_url:dataUrl,created_at:new Date().toISOString()}});
        const countRes=await dbRequest(`property_images?select=position&property_id=eq.${encodeURIComponent(propertyId)}`);
        await dbRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`,{method:"PATCH",body:{image_count:countRes.data.length,updated_at:new Date().toISOString()}});
        return send(res,200,{ok:true,message:"Đã thêm ảnh vào hồ sơ"});
      }
      const row=rows.find(item=>item.property_id===propertyId);if(!row)return send(res,404,{ok:false,error:"Không tìm thấy hồ sơ"});
      if(!Array.isArray(row.property_images))row.property_images=[];
      const nextPos=row.property_images.length?Math.max(...row.property_images.map(i=>i.position||0))+1:1;
      row.property_images.push({position:nextPos,public_url:dataUrl,source_url:dataUrl});
      row.image_count=row.property_images.length;
      return send(res,200,{ok:true,message:"Đã thêm ảnh (preview mode)"});
    }catch(error){return send(res,500,{ok:false,error:error.message})}
  }
  if(url.pathname==="/api/inquiries") {
    if(req.method!=="POST") return send(res,405,{ok:false,error:"Method Not Allowed"});
    let raw="";req.on("data",chunk=>{raw+=chunk;if(raw.length>10000)req.destroy()});req.on("end",()=>{
      try{
        const body=JSON.parse(raw||"{}"),propertyId=String(body.propertyId||"").slice(0,100);let phone=String(body.phone||"").replace(/\D/g,"");
        if(phone.startsWith("84")&&phone.length===11)phone=`0${phone.slice(2)}`;
        if(!rows.some(row=>row.property_id===propertyId))return send(res,404,{ok:false,error:"Không tìm thấy bất động sản"});
        if(!/^0(?:3|5|7|8|9)\d{8}$/.test(phone))return send(res,400,{ok:false,error:"Số điện thoại chưa đúng định dạng"});
        const duplicate=inquiries.find(item=>item.property_id===propertyId&&item.phone===phone&&Date.now()-new Date(item.created_at).getTime()<300000);
        if(duplicate)return send(res,200,{ok:true,duplicate:true,message:"Yêu cầu của bạn đã được ghi nhận"});
        const inquiry={id:inquiries.length+1,property_id:propertyId,phone,source_url:String(body.sourceUrl||"").slice(0,500),status:"new",created_at:new Date().toISOString()};inquiries.push(inquiry);
        return send(res,201,{ok:true,inquiryId:inquiry.id,message:"Đã gửi yêu cầu. Four Land sẽ liên hệ bạn sớm."});
      }catch{return send(res,400,{ok:false,error:"Dữ liệu gửi lên không hợp lệ"})}
    });return;
  }
  if(url.pathname==="/api/facets") {if(databaseEnabled){try{const result=await dbRequest("properties?select=district,ward,street,property_type&status=neq.archived&limit=10000"),values=key=>[...new Set(result.data.map(item=>item[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"vi"));return send(res,200,{ok:true,districts:values("district"),wards:values("ward"),streets:values("street"),types:values("property_type")})}catch(error){return send(res,500,{ok:false,error:error.message})}}const activeRows=rows.filter(item=>item.status!=="archived");return send(res,200,{ok:true,districts:[...new Set(activeRows.map(x=>x.district))],wards:[...new Set(activeRows.map(x=>x.ward))],streets:[...new Set(activeRows.map(x=>x.street))],types:[...new Set(activeRows.map(x=>x.property_type))]});}
  if(url.pathname==="/api/properties") {
    if(url.searchParams.get("archived")==="only"&&!isAdmin(req))return send(res,401,{ok:false,error:"Cần mở quyền quản trị"});
    if(databaseEnabled){try{return send(res,200,await listDatabaseProperties(url))}catch(error){return send(res,500,{ok:false,error:error.message})}}
    const q=String(url.searchParams.get("q")||"").toLowerCase();
    const archivedOnly=url.searchParams.get("archived")==="only";const filtered=rows.filter(row=>(archivedOnly?row.status==="archived":row.status!=="archived")&&(!q||JSON.stringify(row).toLowerCase().includes(q))&&["district","ward","street"].every(key=>!url.searchParams.get(key)||row[key]===url.searchParams.get(key))&&(!url.searchParams.get("type")||row.property_type===url.searchParams.get("type")));
    return send(res,200,{ok:true,rows:filtered,total:filtered.length,page:1,pageSize:24});
  }
  if(url.pathname==="/api/property") {
    if(databaseEnabled){
      try{
        const id=url.searchParams.get("id")||"";
        const result=await dbRequest(`properties?select=*,property_images(*)&property_id=eq.${encodeURIComponent(id)}&limit=1`),property=result.data[0];
        if(!property)return send(res,404,{ok:false,error:"Không tìm thấy hồ sơ"});
        if(property.status==="archived"&&!isAdmin(req))return send(res,404,{ok:false,error:"Không tìm thấy hồ sơ"});
        const views=(Number(property.data_json?.view_count)||0)+1;
        property.view_count=views;
        const updatedDataJson={...(property.data_json||{}),view_count:views};
        dbRequest(`properties?property_id=eq.${encodeURIComponent(id)}`,{method:"PATCH",body:{data_json:updatedDataJson}}).catch(()=>{});
        return send(res,200,{ok:true,property});
      }catch(error){return send(res,500,{ok:false,error:error.message})}
    }
    const row=rows.find(item=>item.property_id===url.searchParams.get("id"));
    if(!row)return send(res,404,{ok:false,error:"Không tìm thấy hồ sơ"});
    if(row.status==="archived"&&!isAdmin(req))return send(res,404,{ok:false,error:"Không tìm thấy hồ sơ"});
    row.view_count=(Number(row.view_count)||0)+1;
    return send(res,200,{ok:true,property:row});
  }
  if(url.pathname.startsWith("/bat-dong-san/")) {
    try {
      const id=propertyIdFromSlug(url.pathname.slice("/bat-dong-san/".length));
      let property;
      if(databaseEnabled){const result=await dbRequest(`properties?select=*,property_images(*)&property_id=eq.${encodeURIComponent(id)}&status=neq.archived&limit=1`);property=result.data[0]}
      else property=rows.find(item=>item.property_id===id&&item.status!=="archived");
      if(!property)return send(res,404,"Không tìm thấy hồ sơ","text/plain; charset=utf-8");
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});res.end(renderPropertyPage(property));return;
    } catch(error) { return send(res,500,error.message,"text/plain; charset=utf-8") }
  }
  const requestPath=url.pathname==="/"?"/index.html":(url.pathname==="/admin"||url.pathname==="/admin/"?"/admin/index.html":url.pathname);
  const filePath=path.resolve(root,"."+requestPath);
  if(!filePath.startsWith(root)||!fs.existsSync(filePath)||fs.statSync(filePath).isDirectory()) return send(res,404,"Not Found","text/plain; charset=utf-8");
  const ext=path.extname(filePath);
  const type=ext===".html"?"text/html; charset=utf-8":ext===".css"?"text/css; charset=utf-8":ext===".js"?"application/javascript; charset=utf-8":ext===".xml"?"application/xml; charset=utf-8":ext===".txt"?"text/plain; charset=utf-8":ext===".json"?"application/json; charset=utf-8":"application/octet-stream";
  send(res,200,fs.readFileSync(filePath),type);
}).listen(port,"127.0.0.1",()=>console.log(`Kho nhà preview: http://127.0.0.1:${port} · ${databaseEnabled?"Supabase":"dữ liệu mẫu"}`));
