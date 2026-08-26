const state={page:1,pageSize:24,total:0,rows:[],facets:null,requestId:0,adminUnlocked:false,currentPropertyId:null};const $=id=>document.getElementById(id);const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const phoneHref=value=>String(value||'').replace(/[^\d+]/g,'');
state.viewArchived=false;
function driveImage(url){const value=String(url||'');const match=value.match(/\/d\/([\w-]+)/)||value.match(/[?&]id=([\w-]+)/);return match?`https://drive.google.com/thumbnail?id=${match[1]}&sz=w1400`:value}
function values(){return{q:$('q').value,district:$('district').value,ward:$('ward').value,street:$('street').value,type:$('type').value,minPrice:$('minPrice').value,maxPrice:$('maxPrice').value,minArea:$('minArea').value,maxArea:$('maxArea').value,page:state.page,pageSize:state.pageSize,archived:state.viewArchived?'only':''}}
function params(input){const search=new URLSearchParams();Object.entries(input).forEach(([key,value])=>{if(value!==''&&value!=null)search.set(key,value)});return search}
async function api(path,options={}){const response=await fetch(path,options);const body=await response.json();if(!response.ok||body.ok===false)throw new Error(body.error||'Không tải được dữ liệu');return body}
function setOptions(id,items,label){const select=$(id),current=select.value;select.innerHTML=`<option value="">${label}</option>`+(items||[]).map(item=>`<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');select.value=current}
async function loadFacets(){try{const data=await api('/api/facets');state.facets=data;setOptions('district',data.districts,'Tất cả quận huyện');setOptions('ward',data.wards,'Tất cả phường xã');setOptions('street',data.streets,'Tất cả tuyến đường');setOptions('type',data.types,'Tất cả loại hình')}catch{}}
function skeleton(){return Array.from({length:8},()=>'<div class="skeleton"></div>').join('')}
async function load(){
  const requestId=++state.requestId;$('error').hidden=true;$('grid').innerHTML=skeleton();
  try{const data=await api('/api/properties?'+params(values()));if(requestId!==state.requestId)return;state.rows=data.rows||[];state.total=data.total||0;$('total').textContent=state.total.toLocaleString('vi-VN');$('withImages').textContent=state.rows.filter(row=>Number(row.image_count)>0).length;$('resultLabel').textContent=state.viewArchived?`${state.total.toLocaleString('vi-VN')} hồ sơ đã ẩn`:`${state.total.toLocaleString('vi-VN')} hồ sơ phù hợp`;$('pageLabel').textContent=`Trang ${state.page} / ${Math.max(1,Math.ceil(state.total/state.pageSize))}`;$('pageNumber').textContent=state.page;$('prev').disabled=state.page<=1;$('next').disabled=state.page*state.pageSize>=state.total;render()}
  catch(error){if(requestId!==state.requestId)return;$('grid').innerHTML='<div class="empty">Chưa có dữ liệu để hiển thị.</div>';$('resultLabel').textContent='Không tải được kho dữ liệu';$('error').textContent=error.message;$('error').hidden=false}
}
function render(){
  if(!state.rows.length){$('grid').innerHTML='<div class="empty">Không tìm thấy hồ sơ phù hợp.</div>';return}
  $('grid').innerHTML=state.rows.map(row=>{const images=(row.property_images||[]).filter(item=>item.public_url).sort((a,b)=>a.position-b.position),image=driveImage(images[0]?.public_url);return`<article class="card ${row.status==='archived'?'archived-card':''}" data-id="${escapeHtml(row.property_id)}" tabindex="0" role="button" aria-label="Xem ${escapeHtml(row.address||row.property_id)}"><div class="photo">${image?`<img loading="lazy" src="${escapeHtml(image)}" alt="Ảnh bất động sản">`:''}<span class="badge">${images.length} ảnh</span></div><div class="card-body"><div class="price">${escapeHtml(row.status==='archived'?'Đã ẩn':row.price_text||'Liên hệ')}</div><h2>${escapeHtml(row.address||String(row.raw_text||'').slice(0,80)||row.property_id)}</h2><div class="meta"><span>${escapeHtml([row.street,row.ward,row.district].filter(Boolean).join(' · '))}</span><span>${escapeHtml([row.area_text,row.bedrooms&&row.bedrooms+' PN'].filter(Boolean).join(' · '))}</span></div></div></article>`}).join('');
  document.querySelectorAll('.card').forEach(card=>{card.addEventListener('click',()=>openDetail(card.dataset.id));card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openDetail(card.dataset.id)}})});
}
function adminToolsHtml(p){return`<details class="admin-panel"><summary><span>Quản trị hồ sơ</span><small>Sửa thông tin · Thêm ảnh</small></summary><form id="propertyEditForm"><div class="admin-fields"><label class="wide">Nội dung nhà<textarea name="raw_text" rows="5">${escapeHtml(p.raw_text||'')}</textarea></label><label class="wide">Địa chỉ<input name="address" value="${escapeHtml(p.address||'')}"></label><label>Quận/Huyện<input name="district" value="${escapeHtml(p.district||'')}"></label><label>Phường/Xã<input name="ward" value="${escapeHtml(p.ward||'')}"></label><label>Tên đường<input name="street" value="${escapeHtml(p.street||'')}"></label><label>Giá<input name="price_text" value="${escapeHtml(p.price_text||'')}"></label><label>Diện tích<input name="area_text" value="${escapeHtml(p.area_text||'')}"></label><label>Kích thước<input name="dimensions" value="${escapeHtml(p.dimensions||'')}"></label><label>Phòng ngủ<input name="bedrooms" type="number" min="0" value="${escapeHtml(p.bedrooms??'')}"></label><label>Phòng tắm<input name="bathrooms" type="number" min="0" value="${escapeHtml(p.bathrooms??'')}"></label><label>Kết cấu<input name="structure" value="${escapeHtml(p.structure||'')}"></label><label>Pháp lý<input name="legal" value="${escapeHtml(p.legal||'')}"></label><label>Số liên hệ<input name="phone" inputmode="tel" value="${escapeHtml(p.phone||'')}"></label><label>Loại BĐS<input name="property_type" value="${escapeHtml(p.property_type||'')}"></label></div><button class="admin-save" type="submit">Lưu thay đổi</button><div id="adminEditStatus" class="admin-status" role="status"></div></form><div class="admin-upload"><label class="upload-button" for="adminImages"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>+ Bổ sung hình ảnh</span></label><input id="adminImages" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden style="display:none!important"><div id="adminUploadStatus" class="admin-status" role="status"></div></div></details>`}
function showToast(message,duration=2400){const toast=$('toast');if(!toast)return;toast.textContent=message;toast.classList.add('active');clearTimeout(toast._timer);toast._timer=setTimeout(()=>toast.classList.remove('active'),duration)}
function maskPhone(phone){if(!phone)return'Chưa có SĐT';const clean=String(phone).trim();if(clean.length>=9)return clean.slice(0,4)+' ••• •••';return clean.slice(0,Math.max(3,clean.length-4))+' •••'}
function maskTextPhones(text){if(!text)return'';const phonePattern=/(?:\+?84|0)(?:3|5|7|8|9)(?:[.\s-]?\d){7,8}/g;return String(text).replace(phonePattern,match=>{const clean=match.replace(/[.\s-]/g,'');return clean.slice(0,4)+' ••• •••'})}

async function openDetail(id){
  const dialog=$('detail');state.currentPropertyId=id;$('detailId').textContent=id;$('detailBody').innerHTML='<div class="empty">Đang tải chi tiết…</div>';if(!dialog.open)dialog.showModal();
  try{
    const shareUrl=new URL(window.location.href);shareUrl.searchParams.set('id',id);history.replaceState({id},'',shareUrl.toString());
    const {property:p}=await api('/api/property?id='+encodeURIComponent(id));
    const imageItems=(p.property_images||[]).filter(i=>i.public_url||i.source_url).sort((a,b)=>a.position-b.position);
    const images=imageItems.map(i=>driveImage(i.public_url||i.source_url)).filter(Boolean);
    const displayPhone=state.adminUnlocked?(p.phone||'Chưa có số điện thoại'):(p.phone?maskPhone(p.phone):'Chưa có số điện thoại');
    const displayRawText=state.adminUnlocked?(p.raw_text||p.notes||'Chưa có nội dung mô tả.'):maskTextPhones(p.raw_text||p.notes||'Chưa có nội dung mô tả.');
    const contactActionHtml=state.adminUnlocked
      ?(p.phone?`<a href="tel:${escapeHtml(phoneHref(p.phone))}" aria-label="Gọi ${escapeHtml(p.phone)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 9.6 7c.35.5.28 1.18-.16 1.62l-1.3 1.3a14.5 14.5 0 0 0 5.94 5.94l1.3-1.3c.44-.44 1.12-.51 1.62-.16l3.5 2.4c.55.38.72 1.11.39 1.69l-1 1.75c-.34.59-.98.95-1.66.93C10.1 20.95 3.05 13.9 2.83 5.77c-.02-.68.34-1.32.93-1.66l1.75-1c.58-.33 1.31-.16 1.69.39Z"/></svg>Gọi ngay</a>`:'')
      :`<button type="button" class="btn-unlock-phone" id="unlockPhoneBtn" title="Nhập mã quản trị để xem SĐT"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>Mở số liên hệ</span></button>`;
    $('detailBody').innerHTML=`<div><div class="gallery-main">${images[0]?`<img id="mainImage" src="${escapeHtml(images[0])}" alt="Ảnh nhà">`:''}<button type="button" class="gallery-share-badge" id="shareDetail" title="Chia sẻ căn nhà này"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg><span>Chia sẻ</span></button></div><div class="thumbs">${images.map((src,index)=>`<img class="${index===0?'active':''}" src="${escapeHtml(src)}" alt="Ảnh ${index+1}">`).join('')}</div></div><div><section class="content-panel"><h3>Nội dung nhà</h3><p>${escapeHtml(displayRawText)}</p></section><section class="info-panel"><div class="price">${escapeHtml(p.price_text||'Liên hệ')}</div><h2>${escapeHtml(p.address||p.property_id)}</h2><div class="meta">${escapeHtml([p.street,p.ward,p.district].filter(Boolean).join(' · '))}</div><div class="info-grid">${[['Diện tích',p.area_text],['Kích thước',p.dimensions],['Phòng ngủ',p.bedrooms],['Phòng tắm',p.bathrooms],['Kết cấu',p.structure],['Pháp lý',p.legal],['Liên hệ',displayPhone],['Loại BĐS',p.property_type]].map(([label,value])=>`<div><small>${label}</small><strong>${escapeHtml(value||'—')}</strong></div>`).join('')}</div></section>${state.adminUnlocked?adminToolsHtml(p):''}<section class="direct-contact"><div><span>Liên hệ trực tiếp</span><strong>${escapeHtml(displayPhone)}</strong></div>${contactActionHtml}</section></div>`;
    document.querySelectorAll('.thumbs img').forEach(img=>img.onclick=()=>{document.querySelectorAll('.thumbs img').forEach(i=>i.classList.remove('active'));img.classList.add('active');$('mainImage').src=img.src});
    const shareBtn=$('shareDetail');
    if(shareBtn){
      shareBtn.onclick=async()=>{
        const link=window.location.href;
        const title=p.address||p.property_id||'Chi tiết bất động sản · Fourland';
        const price=p.price_text||'';
        if(navigator.share&&/mobile|android|iphone|ipad/i.test(navigator.userAgent)){
          try{
            await navigator.share({title:`${price?price+' · ':''}${title}`,url:link});
            return;
          }catch(_){}
        }
        if(navigator.clipboard&&navigator.clipboard.writeText){
          navigator.clipboard.writeText(link).then(()=>showToast('🔗 Đã sao chép link căn nhà thành công!')).catch(()=>prompt('Sao chép link này gửi cho khách:',link));
        }else{
          prompt('Sao chép link này gửi cho khách:',link);
        }
      };
    }
    const unlockBtn=$('unlockPhoneBtn');
    if(unlockBtn){
      unlockBtn.onclick=()=>{
        const dialog=$('adminAccess');
        $('adminAccessStatus').textContent='';
        $('adminCode').value='';
        dialog.showModal();
        setTimeout(()=>$('adminCode').focus(),50);
      };
    }
    if(state.adminUnlocked){
      $('propertyEditForm').onsubmit=event=>saveProperty(event,p.property_id);$('adminImages').onchange=event=>uploadImages(event,p.property_id);
      document.querySelectorAll('.thumbs img').forEach((img,index)=>{const wrap=document.createElement('span');wrap.className='admin-thumb';img.parentNode.insertBefore(wrap,img);wrap.appendChild(img);const remove=document.createElement('button');remove.type='button';remove.className='image-remove';remove.setAttribute('aria-label',`Xóa ảnh ${index+1}`);remove.title='Xóa ảnh này';remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>';remove.onclick=event=>{event.stopPropagation();deleteImage(p.property_id,imageItems[index].position)};wrap.appendChild(remove)});
      const panel=document.querySelector('.admin-panel');const archive=document.createElement('button');archive.type='button';archive.className=p.status==='archived'?'admin-restore':'admin-archive';archive.textContent=p.status==='archived'?'Khôi phục hồ sơ lên web':'Ẩn hồ sơ khỏi web';archive.onclick=()=>setPropertyArchived(p.property_id,p.status!=='archived');panel.appendChild(archive)
    }
  }catch(error){$('detailBody').innerHTML=`<div class="error">${escapeHtml(error.message)}</div>`}
}

async function saveProperty(event,propertyId){
  event.preventDefault();const form=event.currentTarget,status=$('adminEditStatus'),button=form.querySelector('.admin-save');
  const payload={propertyId};new FormData(form).forEach((value,key)=>payload[key]=value);
  button.disabled=true;button.textContent='Đang lưu…';status.className='admin-status';status.textContent='';
  try{const result=await api('/api/admin-property',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});status.className='admin-status success-text';status.textContent=result.message||'Đã cập nhật hồ sơ.';await load();setTimeout(()=>openDetail(propertyId),350)}
  catch(error){status.className='admin-status error-text';status.textContent=error.message;button.disabled=false;button.textContent='Lưu thay đổi'}
}
function imageElement(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Không đọc được hình ảnh'))};img.src=url})}
async function compressImage(file){
  const img=await imageElement(file),maxEdge=1600,scale=Math.min(1,maxEdge/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);
  let quality=.84,dataUrl=canvas.toDataURL('image/jpeg',quality);while(dataUrl.length>3.7*1024*1024&&quality>.52){quality-=.08;dataUrl=canvas.toDataURL('image/jpeg',quality)}return dataUrl
}
async function uploadImages(event,propertyId){
  const input=event.currentTarget,files=[...input.files],status=$('adminUploadStatus');if(!files.length)return;input.disabled=true;status.className='admin-status';
  try{for(let index=0;index<files.length;index++){status.textContent=`Đang xử lý ảnh ${index+1}/${files.length}…`;const dataUrl=await compressImage(files[index]);await api('/api/admin-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId,dataUrl})})}status.className='admin-status success-text';status.textContent=`Đã thêm ${files.length} hình ảnh.`;await load();setTimeout(()=>openDetail(propertyId),350)}
  catch(error){status.className='admin-status error-text';status.textContent=error.message;input.disabled=false}
}
async function deleteImage(propertyId,position){
  if(!confirm('Xóa ảnh này khỏi hồ sơ? Ảnh sẽ không còn hiển thị trên web.'))return;
  try{await api('/api/admin-image',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId,position})});await load();await openDetail(propertyId)}catch(error){alert(error.message)}
}
async function setPropertyArchived(propertyId,archived){
  const question=archived?'Ẩn hồ sơ này khỏi kho web? Bạn vẫn có thể khôi phục sau.':'Khôi phục hồ sơ này lên kho web?';if(!confirm(question))return;
  try{await api('/api/admin-archive',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId,archived})});closeDetailModal();await load()}catch(error){alert(error.message)}
}
function setAdminState(unlocked){state.adminUnlocked=Boolean(unlocked);const profile=document.querySelector('.profile'),toggle=$('archivedToggle');profile.classList.toggle('admin-active',state.adminUnlocked);profile.setAttribute('aria-label',state.adminUnlocked?'Quản trị viên đang mở quyền':'Mở quyền quản trị');profile.title=state.adminUnlocked?'Đã mở quyền quản trị':'Mở quyền quản trị';toggle.hidden=!state.adminUnlocked;if(!state.adminUnlocked&&state.viewArchived){state.viewArchived=false;toggle.classList.remove('active');load()}if(state.currentPropertyId&&$('detail').open){openDetail(state.currentPropertyId)}}
async function checkAdminSession(){try{const result=await api('/api/admin-login');setAdminState(result.authenticated)}catch{setAdminState(false)}}
document.querySelector('.profile').onclick=()=>{if(state.adminUnlocked){if(state.currentPropertyId&&$('detail').open)openDetail(state.currentPropertyId);return}const dialog=$('adminAccess');$('adminAccessStatus').textContent='';$('adminCode').value='';dialog.showModal();setTimeout(()=>$('adminCode').focus(),50)};
$('closeAdminAccess').onclick=()=>$('adminAccess').close();
$('adminAccess').onclick=event=>{if(event.target===$('adminAccess'))$('adminAccess').close()};
$('adminAccessForm').onsubmit=async event=>{event.preventDefault();const status=$('adminAccessStatus'),button=event.currentTarget.querySelector('.access-submit');button.disabled=true;button.textContent='Đang kiểm tra…';status.className='access-status';status.textContent='';try{await api('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('adminCode').value.trim()})});setAdminState(true);status.className='access-status success-text';status.textContent='Đã mở quyền quản trị.';setTimeout(()=>{$('adminAccess').close();if(state.currentPropertyId&&$('detail').open)openDetail(state.currentPropertyId)},300)}catch(error){status.className='access-status error-text';status.textContent=error.message;$('adminCode').select()}finally{button.disabled=false;button.textContent='Mở quyền chỉnh sửa'}};
$('archivedToggle').onclick=()=>{state.viewArchived=!state.viewArchived;state.page=1;$('archivedToggle').classList.toggle('active',state.viewArchived);$('archivedToggle').textContent=state.viewArchived?'Quay lại kho nhà':'Hồ sơ đã ẩn';load()};
let searchTimer;const scheduleLoad=(delay=250)=>{clearTimeout(searchTimer);state.page=1;searchTimer=setTimeout(load,delay)};$('q').addEventListener('input',()=>scheduleLoad(320));['district','ward','street','type','minPrice','maxPrice','minArea','maxArea'].forEach(id=>$(id).addEventListener('change',()=>scheduleLoad(0)));$('searchForm').onsubmit=event=>{event.preventDefault();scheduleLoad(0)};$('reset').onclick=()=>{$('searchForm').reset();scheduleLoad(0)};$('prev').onclick=()=>{if(state.page>1){state.page--;load();scrollTo({top:0,behavior:'smooth'})}};$('next').onclick=()=>{if(state.page*state.pageSize<state.total){state.page++;load();scrollTo({top:0,behavior:'smooth'})}};$('filterToggle').onclick=()=>{const open=$('filters').classList.toggle('open');$('searchForm').classList.toggle('filter-open',open);$('filterToggle').setAttribute('aria-expanded',open)};

function closeDetailModal(){
  $('detail').close();
  state.currentPropertyId=null;
  const cleanUrl=new URL(window.location.href);
  cleanUrl.searchParams.delete('id');
  history.replaceState({},'',cleanUrl.pathname+(cleanUrl.search?cleanUrl.search:''));
}
$('closeDetail').onclick=closeDetailModal;
$('detail').onclick=event=>{if(event.target===$('detail'))closeDetailModal()};

loadFacets();
load();
checkAdminSession();

const initUrlId=new URLSearchParams(window.location.search).get('id')||(window.location.hash?window.location.hash.replace(/^#/,''):'');
if(initUrlId&&/^BDS-/i.test(initUrlId)){
  setTimeout(()=>openDetail(initUrlId),200);
}
