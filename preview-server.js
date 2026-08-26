const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseNaturalQuery, matchAndScoreProperty, removeVietnameseTones } = require("./api/_smartSearch");
const { propertyIdFromSlug, renderPropertyPage } = require("./server/seo");

const root = __dirname;
const port = Number(process.env.PORT || 4175);
const env = {};
const envFile = path.join(root, ".env.local");
if (fs.existsSync(envFile)) fs.readFileSync(envFile, "utf8").split(/\r?\n/).forEach(line => { const index=line.indexOf("=");if(index>0&&!line.trim().startsWith("#"))env[line.slice(0,index).trim()]=line.slice(index+1).trim() });
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
const inquiries = [];
const adminCode = env.ADMIN_ACCESS_CODE || process.env.ADMIN_ACCESS_CODE || "246810";
const previewAdminToken = "fourland-preview-admin";
const isAdmin = req => String(req.headers.cookie||"").split(";").map(v=>v.trim()).includes(`fourland_admin=${previewAdminToken}`);

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

  const explicitFilters = {
    district: url.searchParams.get("district"),
    ward: url.searchParams.get("ward"),
    street: url.searchParams.get("street"),
    property_type: url.searchParams.get("type"),
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
      return {
        row: {
          ...row,
          is_featured: isFeatured,
          view_count: Number(row.data_json?.view_count) || 0
        },
        score: matchAndScoreProperty(row, nlp, explicitFilters),
        isFeatured
      };
    })
    .filter(item => {
      if (item.score <= 0) return false;
      if (featuredOnly && !item.isFeatured) return false;
      if (withImagesOnly && !(Number(item.row.image_count) > 0 || item.row.property_images?.length > 0)) return false;
      return true;
    })
    .sort((a, b) => {
      if (!rawQ && a.isFeatured !== b.isFeatured) {
        return b.isFeatured ? 1 : -1;
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

http.createServer(async (req,res)=>{
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if(url.pathname==="/api/admin-login") {
    if(req.method==="GET") return send(res,200,{ok:true,authenticated:isAdmin(req)});
    if(req.method==="DELETE") {
      res.setHeader("Set-Cookie","fourland_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
      return send(res,200,{ok:true,authenticated:false,message:"Đã thoát quyền quản trị"});
    }
    if(req.method!=="POST") return send(res,405,{ok:false,error:"Method Not Allowed"});
    let raw="";req.on("data",chunk=>raw+=chunk);req.on("end",()=>{try{const body=JSON.parse(raw||"{}");if(String(body.code||"").trim()!==adminCode)return send(res,401,{ok:false,error:"Mã truy cập không đúng"});res.setHeader("Set-Cookie",`fourland_admin=${previewAdminToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);return send(res,200,{ok:true,authenticated:true})}catch{return send(res,400,{ok:false,error:"Dữ liệu không hợp lệ"})}});return;
  }
  if(url.pathname==="/api/admin-archive") {
    if(req.method!=="PATCH")return send(res,405,{ok:false,error:"Method Not Allowed"});if(!isAdmin(req))return send(res,401,{ok:false,error:"Phiên quản trị chưa được mở"});
    try{const body=await readBody(req),propertyId=String(body.propertyId||""),status=body.archived?"archived":"partial";if(!propertyId)return send(res,400,{ok:false,error:"Thiếu mã bất động sản"});if(databaseEnabled){const result=await dbRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`,{method:"PATCH",body:{status,updated_at:new Date().toISOString()},prefer:"return=representation"});return send(res,result.data[0]?200:404,result.data[0]?{ok:true,property:result.data[0],message:body.archived?"Đã ẩn hồ sơ khỏi web":"Đã khôi phục hồ sơ"}:{ok:false,error:"Không tìm thấy bất động sản"})}const row=rows.find(item=>item.property_id===propertyId);if(!row)return send(res,404,{ok:false,error:"Không tìm thấy bất động sản"});row.status=status;return send(res,200,{ok:true,property:row,message:body.archived?"Đã ẩn hồ sơ khỏi web":"Đã khôi phục hồ sơ"})}catch(error){return send(res,500,{ok:false,error:error.message})}
  }
  if(url.pathname==="/api/admin-property") {
    if(req.method!=="PATCH") return send(res,405,{ok:false,error:"Method Not Allowed"});if(!isAdmin(req))return send(res,401,{ok:false,error:"Phiên quản trị chưa được mở"});
    if(databaseEnabled){try{const body=await readBody(req),propertyId=String(body.propertyId||"");if(!propertyId)return send(res,400,{ok:false,error:"Thiếu mã bất động sản"});const update={};["address","district","ward","street","price_text","area_text","dimensions","structure","legal","phone","property_type","raw_text","notes","bedrooms","bathrooms"].forEach(key=>{if(Object.prototype.hasOwnProperty.call(body,key))update[key]=body[key]===""?null:body[key]});if(Object.prototype.hasOwnProperty.call(body,"is_featured"))update.status=body.is_featured?"featured":"ready";update.updated_at=new Date().toISOString();const result=await dbRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`,{method:"PATCH",body:update,prefer:"return=representation"});return send(res,200,{ok:true,property:result.data[0],message:body.is_featured!==undefined?(body.is_featured?"Đã ghim bất động sản lên mục Nổi Bật":"Đã bỏ ghim nổi bật"):"Đã cập nhật thông tin nhà"})}catch(error){return send(res,500,{ok:false,error:error.message})}}
    let raw="";req.on("data",chunk=>raw+=chunk);req.on("end",()=>{try{const body=JSON.parse(raw||"{}"),row=rows.find(item=>item.property_id===body.propertyId);if(!row)return send(res,404,{ok:false,error:"Không tìm thấy bất động sản"});["address","district","ward","street","price_text","area_text","dimensions","structure","legal","phone","property_type","raw_text","notes","bedrooms","bathrooms"].forEach(key=>{if(Object.prototype.hasOwnProperty.call(body,key))row[key]=body[key]});return send(res,200,{ok:true,property:row,message:"Đã cập nhật thông tin nhà"})}catch{return send(res,400,{ok:false,error:"Dữ liệu không hợp lệ"})}});return;
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
  if(url.pathname==="/api/admin-archive") {
    if(!isAdmin(req)) return send(res,401,{ok:false,error:"Cần quyền quản trị"});
    if(req.method!=="PATCH") return send(res,405,{ok:false,error:"Method Not Allowed"});
    try{
      const body=await readBody(req),propertyId=String(body.propertyId||"").slice(0,100),archived=Boolean(body.archived);
      const nextStatus=archived?"archived":"complete";
      if(databaseEnabled){
        await dbRequest(`properties?property_id=eq.${encodeURIComponent(propertyId)}`,{method:"PATCH",body:{status:nextStatus,updated_at:new Date().toISOString()}});
        return send(res,200,{ok:true,message:archived?"Đã ẩn hồ sơ khỏi kho web":"Đã khôi phục hồ sơ lên kho web"});
      }
      const row=rows.find(item=>item.property_id===propertyId);if(!row)return send(res,404,{ok:false,error:"Không tìm thấy hồ sơ"});
      row.status=nextStatus;
      return send(res,200,{ok:true,message:archived?"Đã ẩn hồ sơ (preview mode)":"Đã khôi phục hồ sơ (preview mode)"});
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
  const requestPath=url.pathname==="/"?"/index.html":url.pathname;
  const filePath=path.resolve(root,"."+requestPath);
  if(!filePath.startsWith(root)||!fs.existsSync(filePath)||fs.statSync(filePath).isDirectory()) return send(res,404,"Not Found","text/plain; charset=utf-8");
  const ext=path.extname(filePath);
  const type=ext===".html"?"text/html; charset=utf-8":ext===".css"?"text/css; charset=utf-8":ext===".js"?"application/javascript; charset=utf-8":ext===".xml"?"application/xml; charset=utf-8":ext===".txt"?"text/plain; charset=utf-8":ext===".json"?"application/json; charset=utf-8":"application/octet-stream";
  send(res,200,fs.readFileSync(filePath),type);
}).listen(port,"127.0.0.1",()=>console.log(`Kho nhà preview: http://127.0.0.1:${port} · ${databaseEnabled?"Supabase":"dữ liệu mẫu"}`));
