const state={page:1,pageSize:24,total:0,rows:[],facets:null,requestId:0,adminUnlocked:false,currentPropertyId:null,filterTab:'all',selectedIds:new Set()};const $=id=>document.getElementById(id);const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const phoneHref=value=>String(value||'').replace(/[^\d+]/g,'');
const slugify=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'ho-so-bat-dong-san';
const propertyPath=row=>`/bat-dong-san/${slugify(row.address||row.street||row.property_type)}--${encodeURIComponent(row.property_id)}`;
state.viewArchived=false;

function formatVietnamRelativeTime(isoString){
  if(!isoString)return'';
  const date=new Date(isoString);
  if(Number.isNaN(date.getTime()))return'';
  const now=new Date();
  const diffMs=now.getTime()-date.getTime();
  if(diffMs<0)return'Vừa xong';
  const diffMins=Math.floor(diffMs/60000);
  const diffHours=Math.floor(diffMs/3600000);
  const diffDays=Math.floor(diffMs/86400000);
  const timeStr=date.toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hour12:false});
  const dateStr=date.toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit'});
  if(diffMins<5)return'Vừa xong';
  if(diffMins<60)return`${diffMins}p trước`;
  if(diffHours<24&&date.getDate()===now.getDate()&&date.getMonth()===now.getMonth()){
    return`Hôm nay ${timeStr}`;
  }
  if(diffDays<=1||(diffHours<48&&(now.getDate()-date.getDate()===1||now.getDate()-date.getDate()<0))){
    return`Hôm qua ${timeStr}`;
  }
  if(diffDays<7){
    return`${diffDays} ngày trước`;
  }
  return dateStr;
}

function formatVietnamFullDateTime(isoString){
  if(!isoString)return'Đang cập nhật';
  const date=new Date(isoString);
  if(Number.isNaN(date.getTime()))return'Đang cập nhật';
  const timeStr=date.toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hour12:false});
  const dateStr=date.toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'});
  return`${timeStr} - ${dateStr}`;
}

function driveImage(url){const value=String(url||'');const match=value.match(/\/d\/([\w-]+)/)||value.match(/[?&]id=([\w-]+)/);return match?`https://drive.google.com/thumbnail?id=${match[1]}&sz=w1400`:value}
function values(){return{q:$('q').value,district:$('district').value,ward:$('ward').value,street:$('street').value,type:$('type').value,timeRange:$('timeRange')?$('timeRange').value:'',sortBy:$('sortBy')?$('sortBy').value:'',rentalStatus:$('rentalStatus')?$('rentalStatus').value:'',minPrice:$('minPrice').value,maxPrice:$('maxPrice').value,minArea:$('minArea').value,maxArea:$('maxArea').value,page:state.page,pageSize:state.pageSize,archived:state.viewArchived?'only':'',featured:state.filterTab==='featured'?'1':''}}
function params(input){const search=new URLSearchParams();Object.entries(input).forEach(([key,value])=>{if(value!==''&&value!=null)search.set(key,value)});return search}
async function api(path,options={}){const response=await fetch(path,options);const body=await response.json();if(!response.ok||body.ok===false)throw new Error(body.error||'Không tải được dữ liệu');return body}
function setOptions(id,items,label){const select=$(id);if(!select)return;const current=select.value;select.innerHTML=`<option value="">${label}</option>`+(items||[]).map(item=>`<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');select.value=current}
async function loadFacets(){try{const data=await api('/api/facets');state.facets=data;setOptions('district',data.districts,'Tất cả quận huyện');setOptions('ward',data.wards,'Tất cả phường xã');setOptions('street',data.streets,'Tất cả tuyến đường');setOptions('type',data.types,'Tất cả loại hình')}catch{}}
function skeleton(){
  return Array.from({length:8},()=>`
    <div class="skeleton">
      <div class="skeleton-photo">
        <img src="/assets/brand/fourland-logo.png" alt="Fourland" class="skeleton-logo">
      </div>
      <div class="skeleton-body">
        <div class="skeleton-line skeleton-price"></div>
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-meta"></div>
      </div>
    </div>
  `).join('')
}
async function load(){
  const requestId=++state.requestId;$('error').hidden=true;$('grid').innerHTML=skeleton();
  try{const data=await api('/api/properties?'+params(values()));if(requestId!==state.requestId)return;state.rows=data.rows||[];state.total=data.total||0;$('total').textContent=state.total.toLocaleString('vi-VN');$('withImages').textContent=state.rows.filter(row=>Number(row.image_count)>0).length;$('resultLabel').textContent=state.viewArchived?`${state.total.toLocaleString('vi-VN')} hồ sơ đã ẩn`:`${state.total.toLocaleString('vi-VN')} hồ sơ phù hợp`;$('pageLabel').textContent=`Trang ${state.page} / ${Math.max(1,Math.ceil(state.total/state.pageSize))}`;$('pageNumber').textContent=state.page;$('prev').disabled=state.page<=1;$('next').disabled=state.page*state.pageSize>=state.total;render()}
  catch(error){if(requestId!==state.requestId)return;$('grid').innerHTML='<div class="empty">Chưa có dữ liệu để hiển thị.</div>';$('resultLabel').textContent='Không tải được kho dữ liệu';$('error').textContent=error.message;$('error').hidden=false}
}
function formatCardPrice(row){
  if(row.status === 'archived') return `<span class="price-val price-archived">Đã ẩn</span>`;
  let text = String(row.price_text || '').trim();
  if(!text || text.toLowerCase() === 'liên hệ') return `<span class="price-val price-contact">Liên hệ</span>`;
  
  // 1. Loại bỏ hoa hồng, sđt hoặc ghi chú dài nằm trong trường giá
  text = text.replace(/\b(?:hh|hoa\s*hồng|phí|commission)[\s\d/.,:-]+.*$/i, '').trim();
  text = text.replace(/(?:\+?84|0)(?:3|5|7|8|9)[0-9\s.-]{7,10}.*$/i, '').trim();
  text = text.replace(/^(?:chào\s*thuê|giá\s*thuê|giá\s*bán|giá)\s*[:：]?\s*/i, '').trim();
  
  // 2. Định dạng chuẩn đơn vị: hiển thị đầy đủ "triệu", "tỷ"
  text = text.replace(/(\d+)\s*(?:tr|triệu|trieu)\b/gi, '$1 triệu');
  text = text.replace(/(\d+)\s*(?:tỷ|ty)\b/gi, '$1 tỷ');
  text = text.replace(/(\d+)\s*(?:nghìn|ngàn|k)\b/gi, '$1k');

  // 3. Tách chu kỳ thuê (VD: /tháng, /th)
  const match = text.match(/^(.*?)(\s*[\/\.]\s*(?:tháng|th|năm|m2|m²))$/i);
  if(match){
    return `<span class="price-val" title="${escapeHtml(text)}">${escapeHtml(match[1].trim())}</span><span class="price-period">${escapeHtml(match[2].trim())}</span>`;
  }
  return `<span class="price-val" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

function updateBulkBar(){
  const bar=$('bulkBar');
  if(!bar)return;
  if(!state.adminUnlocked||state.selectedIds.size===0){
    bar.hidden=true;
    document.body.classList.remove('selection-mode-active');
    return;
  }
  document.body.classList.add('selection-mode-active');
  bar.hidden=false;
  $('bulkCount').textContent=state.selectedIds.size;
  const archiveBtn=$('bulkArchiveBtn');
  if(archiveBtn){
    if(state.viewArchived){
      archiveBtn.textContent=`Khôi phục ${state.selectedIds.size} căn đã chọn lên web`;
      archiveBtn.className='bulk-btn bulk-btn-success';
    }else{
      archiveBtn.textContent=`Ẩn ${state.selectedIds.size} căn đã chọn khỏi web`;
      archiveBtn.className='bulk-btn bulk-btn-danger';
    }
  }
}

function render(){
  if(!state.rows.length){$('grid').innerHTML='<div class="empty">Không tìm thấy hồ sơ phù hợp.</div>';updateBulkBar();return}
  $('grid').innerHTML=state.rows.map(row=>{
    const isFeatured = row.status === 'featured' || Boolean(row.is_featured);
    const isRented = row.status === 'rented' || Boolean(row.is_rented);
    const images = (row.property_images || []).filter(item => item.public_url).sort((a, b) => a.position - b.position);
    const image = driveImage(images[0]?.public_url);
    let typeBadgeHtml = '';
    if (isFeatured) {
      typeBadgeHtml = `<span class="badge-type badge-featured"><svg class="star-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>${escapeHtml(row.property_type || 'Nổi bật')}</span>`;
    } else if (row.property_type) {
      typeBadgeHtml = `<span class="badge-type">${escapeHtml(row.property_type)}</span>`;
    }
    const imgAlt = `${row.property_type||'Bất động sản'} ${[row.address,row.district].filter(Boolean).join(', ')} - Fourland`;
    const locationParts = [row.ward, row.district].filter(Boolean);
    const locationText = locationParts.length ? locationParts.join(', ') : (row.district || 'TP. Hồ Chí Minh');
    const timeRel = formatVietnamRelativeTime(row.received_at || row.updated_at || row.created_at);
    const timeFull = formatVietnamFullDateTime(row.received_at || row.updated_at || row.created_at);
    const timeHtml = timeRel ? `<div class="card-time" title="Thời gian cập nhật: ${escapeHtml(timeFull)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${escapeHtml(timeRel)}</span></div>` : '';
    
    // Specs pills with luxury vector line SVGs
    const specs = [];
    if(row.area_text){
      specs.push(`<span class="spec-tag" title="Diện tích"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.7"/></svg>${escapeHtml(row.area_text)}</span>`);
    }
    if(row.bedrooms){
      specs.push(`<span class="spec-tag" title="Số phòng ngủ"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 19h20M2 17v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6M6 9V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>${escapeHtml(row.bedrooms)} PN</span>`);
    }
    const specsHtml = specs.length ? `<div class="card-specs">${specs.join('')}</div>` : '';

    const selectCheckboxHtml = state.adminUnlocked ? `
      <label class="card-select-wrap" onclick="event.stopPropagation();" title="Chọn căn này">
        <input type="checkbox" class="card-select-input" data-id="${escapeHtml(row.property_id)}" ${state.selectedIds.has(row.property_id)?'checked':''}>
        <span class="card-select-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></span>
      </label>
    ` : '';

    const statusPillHtml = `<span class="photo-status-pill ${isRented ? 'is-rented' : 'is-available'}" title="${isRented ? 'Đã cho thuê' : 'Đang mở thuê (Còn phòng)'}"><i class="photo-status-dot"></i></span>`;

    return`<a class="card ${isFeatured?'is-featured':''} ${isRented?'is-rented':''} ${row.status==='archived'?'archived-card':''} ${state.selectedIds.has(row.property_id)?'is-selected':''}" href="${escapeHtml(propertyPath(row))}" data-id="${escapeHtml(row.property_id)}" aria-label="Xem ${escapeHtml(row.address||row.property_id)}">
      <div class="photo ${!image?'no-photo':''}">
        ${image?`<img loading="lazy" referrerpolicy="no-referrer" src="${escapeHtml(image)}" alt="${escapeHtml(imgAlt)}" title="${escapeHtml(imgAlt)}" onerror="handleCardImgError(this)">`:`
          <div class="placeholder-watermark">
            <img src="/assets/brand/fourland-logo.png" alt="Fourland" class="watermark-logo">
            <span class="watermark-text">Hình ảnh đang cập nhật</span>
          </div>
        `}
        ${typeBadgeHtml}
        ${statusPillHtml}
        ${selectCheckboxHtml}
      </div>
      <div class="card-body">
        <div class="price-row">
          <div class="price">${formatCardPrice(row)}</div>
        </div>
        <h2 class="card-title" title="${escapeHtml(row.address||row.property_id)}">${escapeHtml(row.address||String(row.raw_text||'').slice(0,75)||row.property_id)}</h2>
        <div class="card-location">
          <svg class="icon-pin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>
          <span class="card-loc-name">${escapeHtml(locationText)}</span>
        </div>
        ${timeRel ? `<div class="card-time" title="Cập nhật lúc: ${escapeHtml(timeFull)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${escapeHtml(timeRel)}</span></div>` : ''}
        ${specsHtml}
      </div>
    </a>`;
  }).join('');

  document.querySelectorAll('.card-select-input').forEach(cb=>{
    cb.onchange=event=>{
      event.stopPropagation();
      const id=cb.dataset.id;
      const card=cb.closest('.card');
      if(cb.checked){
        state.selectedIds.add(id);
        if(card)card.classList.add('is-selected');
      }else{
        state.selectedIds.delete(id);
        if(card)card.classList.remove('is-selected');
      }
      updateBulkBar();
    };
  });

  document.querySelectorAll('.card').forEach(card=>{
    let pressTimer=null;
    let isLongPress=false;
    let startX=0,startY=0;

    const startPress=(e)=>{
      if(!state.adminUnlocked)return;
      if(e.target.closest('.card-select-wrap'))return;
      isLongPress=false;
      if(e.touches&&e.touches[0]){
        startX=e.touches[0].clientX;
        startY=e.touches[0].clientY;
      }
      pressTimer=setTimeout(()=>{
        isLongPress=true;
        const id=card.dataset.id;
        if(!state.selectedIds.has(id)){
          state.selectedIds.add(id);
          card.classList.add('is-selected');
          const cb=card.querySelector('.card-select-input');
          if(cb)cb.checked=true;
        }
        if(navigator.vibrate)navigator.vibrate(50);
        showToast('Đã bật chế độ chọn nhiều căn');
        updateBulkBar();
      },750);
    };

    const cancelPress=(e)=>{
      if(e&&e.touches&&e.touches[0]){
        const dx=Math.abs(e.touches[0].clientX-startX);
        const dy=Math.abs(e.touches[0].clientY-startY);
        if(dx>10||dy>10){
          if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}
        }
      }else{
        if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}
      }
    };

    card.addEventListener('touchstart',startPress,{passive:true});
    card.addEventListener('touchend',()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});
    card.addEventListener('touchmove',cancelPress,{passive:true});

    card.addEventListener('mousedown',startPress);
    card.addEventListener('mouseup',()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});
    card.addEventListener('mouseleave',()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});

    card.addEventListener('click',event=>{
      if(isLongPress){
        event.preventDefault();
        event.stopPropagation();
        isLongPress=false;
        return;
      }
      if(state.selectedIds.size>0&&state.adminUnlocked){
        event.preventDefault();
        event.stopPropagation();
        const id=card.dataset.id;
        const cb=card.querySelector('.card-select-input');
        if(state.selectedIds.has(id)){
          state.selectedIds.delete(id);
          card.classList.remove('is-selected');
          if(cb)cb.checked=false;
        }else{
          state.selectedIds.add(id);
          card.classList.add('is-selected');
          if(cb)cb.checked=true;
        }
        updateBulkBar();
        return;
      }
      if(event.target.closest('.card-select-wrap'))return;
      if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();
      openDetail(card.dataset.id,card.getAttribute('href'))
    });
  });
  updateBulkBar();
}

function handleCardImgError(img){
  if(!img)return;
  img.style.display='none';
  const parent=img.parentElement;
  if(!parent)return;
  parent.classList.add('no-photo');
  if(!parent.querySelector('.placeholder-watermark')){
    const wm=document.createElement('div');
    wm.className='placeholder-watermark';
    wm.innerHTML='<img src="/assets/brand/fourland-logo.png" alt="Fourland" class="watermark-logo"><span class="watermark-text">Hình ảnh đang cập nhật</span>';
    parent.insertBefore(wm,parent.firstChild);
  }
}
window.handleCardImgError=handleCardImgError;

function handleDetailImgError(img){
  if(!img)return;
  img.style.display='none';
  const parent=img.parentElement;
  if(!parent)return;
  parent.classList.add('no-photo');
  if(!parent.querySelector('.placeholder-watermark')){
    const wm=document.createElement('div');
    wm.className='placeholder-watermark watermark-detail';
    wm.innerHTML='<img src="/assets/brand/fourland-logo.png" alt="Fourland" class="watermark-logo"><span class="watermark-text">Hình ảnh đang cập nhật</span>';
    parent.insertBefore(wm,parent.firstChild);
  }
}
function adminToolsHtml(p){
  const isFeatured = p.status === 'featured' || Boolean(p.is_featured);
  const isRented = p.status === 'rented' || Boolean(p.is_rented);
  return`<details class="admin-panel"><summary><span>Quản trị hồ sơ</span><small>Sửa thông tin nhà</small></summary><form id="propertyEditForm"><div class="admin-toggles-grid"><label class="admin-featured-toggle"><div class="toggle-content"><svg class="star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><strong>Ghim Nổi Bật</strong></div><input type="checkbox" name="is_featured" id="adminFeaturedInput" ${isFeatured?'checked':''}><span class="toggle-switch"></span></label><label class="admin-featured-toggle admin-rented-toggle"><div class="toggle-content"><svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><strong>Đã Cho Thuê</strong></div><input type="checkbox" name="is_rented" id="adminRentedInput" ${isRented?'checked':''}><span class="toggle-switch toggle-switch-rented"></span></label></div><div class="admin-fields"><label class="wide">Nội dung nhà<textarea name="raw_text" rows="5">${escapeHtml(p.raw_text||'')}</textarea></label><label class="wide">Địa chỉ<input name="address" value="${escapeHtml(p.address||'')}"></label><label>Quận/Huyện<input name="district" value="${escapeHtml(p.district||'')}"></label><label>Phường/Xã<input name="ward" value="${escapeHtml(p.ward||'')}"></label><label>Tên đường<input name="street" value="${escapeHtml(p.street||'')}"></label><label>Giá<input name="price_text" value="${escapeHtml(p.price_text||'')}"></label><label>Diện tích<input name="area_text" value="${escapeHtml(p.area_text||'')}"></label><label>Kích thước<input name="dimensions" value="${escapeHtml(p.dimensions||'')}"></label><label>Phòng ngủ<input name="bedrooms" type="number" min="0" value="${escapeHtml(p.bedrooms??'')}"></label><label>Phòng tắm<input name="bathrooms" type="number" min="0" value="${escapeHtml(p.bathrooms??'')}"></label><label>Kết cấu<input name="structure" value="${escapeHtml(p.structure||'')}"></label><label>Pháp lý<input name="legal" value="${escapeHtml(p.legal||'')}"></label><label>Số liên hệ<input name="phone" inputmode="tel" value="${escapeHtml(p.phone||'')}"></label><label>Loại BĐS<input name="property_type" value="${escapeHtml(p.property_type||'')}"></label></div><div class="admin-actions"><button class="admin-save" type="submit">Lưu thay đổi</button><button type="button" class="${p.status==='archived'?'admin-restore':'admin-archive'}" id="adminArchiveBtn">${p.status==='archived'?'Khôi phục hồ sơ lên web':'Ẩn hồ sơ khỏi web'}</button></div><div id="adminEditStatus" class="admin-status" role="status"></div></form></details>`
}
function showToast(message,duration=2400){const toast=$('toast');if(!toast)return;toast.textContent=message;toast.classList.add('active');clearTimeout(toast._timer);toast._timer=setTimeout(()=>toast.classList.remove('active'),duration)}
function maskPhone(phone){if(!phone)return'Chưa có SĐT';const clean=String(phone).trim();if(clean.length>=9)return clean.slice(0,4)+' ••• •••';return clean.slice(0,Math.max(3,clean.length-4))+' •••'}
function maskTextPhones(text){if(!text)return'';const phonePattern=/(?:\+?84|0)(?:3|5|7|8|9)(?:[.\s-]?\d){7,8}/g;return String(text).replace(phonePattern,match=>{const clean=match.replace(/[.\s-]/g,'');return clean.slice(0,4)+' ••• •••'})}

const COMPANY_HOTLINE='084.2222.813';
const DEFAULT_PAGE_TITLE='FOURLAND · Kho Bất Động Sản Chọn Lọc TP.HCM | Mua Bán & Cho Thuê Nhà Đất';

function injectPropertySchema(p, images){
  let script=$('propertyJsonLd');
  if(!script){
    script=document.createElement('script');
    script.id='propertyJsonLd';
    script.type='application/ld+json';
    document.head.appendChild(script);
  }
  const schema={
    "@context":"https://schema.org",
    "@type":"SingleFamilyResidence",
    "name":p.address||p.property_id,
    "description":p.raw_text||p.notes||`${p.property_type||'Bất động sản'} tại ${p.address||''}, ${p.district||'TP.HCM'}`,
    "url":window.location.href,
    "image":images.length?images:['https://www.fourland.vn/assets/brand/fourland-logo.png'],
    "address":{
      "@type":"PostalAddress",
      "streetAddress":p.address||p.street||'',
      "addressLocality":p.district||'Thành phố Hồ Chí Minh',
      "addressRegion":"Hồ Chí Minh",
      "addressCountry":"VN"
    },
    "numberOfRooms":p.bedrooms||undefined,
    "numberOfBathroomsTotal":p.bathrooms||undefined,
    "floorSize":p.area_number?{"@type":"QuantitativeValue","value":p.area_number,"unitCode":"MTK"}:undefined
  };
  script.textContent=JSON.stringify(schema);
}

async function openDetail(id,seoPath=''){
  const dialog=$('detail');state.currentPropertyId=id;$('detailId').textContent=id;
  $('detailBody').innerHTML=`
    <div class="detail-loader">
      <div class="luxury-spinner-wrap">
        <div class="spinner-ring"></div>
        <div class="spinner-brand">
          <img src="/assets/brand/fourland-logo.png" alt="Fourland" class="spinner-logo">
        </div>
      </div>
    </div>
  `;
  if(!dialog.open)dialog.showModal();
  try{
    const {property:p}=await api('/api/property?id='+encodeURIComponent(id));
    const nextPath=seoPath||propertyPath(p);history.pushState({id},'',nextPath);
    const imageItems=(p.property_images||[]).filter(i=>i.public_url||i.source_url).sort((a,b)=>a.position-b.position);
    const images=imageItems.map(i=>driveImage(i.public_url||i.source_url)).filter(Boolean);
    const customerPhone=p.phone||'';
    const views=Number(p.view_count)||1;
    const isRented=p.status==='rented'||Boolean(p.is_rented);
    
    // SEO: Dynamic Document Title & Schema
    const propTitle=`${p.address||p.property_id} · ${p.price_text?p.price_text+' · ':''}FOURLAND`;
    document.title=propTitle;
    injectPropertySchema(p, images);

    const updatedRel = formatVietnamRelativeTime(p.received_at || p.updated_at || p.created_at);
    const updatedFull = formatVietnamFullDateTime(p.received_at || p.updated_at || p.created_at);
    const updatedBadgeHtml = updatedRel ? `<span class="detail-header-sep">·</span><span class="detail-header-time" title="Thời gian cập nhật: ${escapeHtml(updatedFull)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(updatedRel)}</span>` : '';
    $('detailId').innerHTML=`<span class="detail-header-id">${escapeHtml(id)}</span>${updatedBadgeHtml}<span class="detail-header-sep">·</span><span class="detail-header-views" title="${views} lượt xem"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${views}</span>`;
    const phoneCellContent=state.adminUnlocked
      ?(customerPhone?`<a href="tel:${escapeHtml(phoneHref(customerPhone))}" class="phone-link-call" title="Bấm để gọi số khách / chủ nhà">${escapeHtml(customerPhone)}</a>`:'—')
      :(customerPhone?`<button type="button" class="phone-link-unlock" id="unlockPhoneInline" title="Bấm để nhập mã Admin xem SĐT">${escapeHtml(maskPhone(customerPhone))}</button>`:'—');
    const displayRawText=state.adminUnlocked?(p.raw_text||p.notes||'Chưa có nội dung mô tả.'):maskTextPhones(p.raw_text||p.notes||'Chưa có nội dung mô tả.');
    const propNameAlt=`${p.property_type||'Nhà'} ${p.address||p.property_id}`;
    const thumbsHtml=images.map((src,index)=>`<img class="${index===0?'active':''}" referrerpolicy="no-referrer" src="${escapeHtml(src)}" alt="${escapeHtml(propNameAlt)} - Ảnh ${index+1}" onerror="this.style.display='none';">`).join('')+
      (state.adminUnlocked?`<label class="admin-thumb-add" for="adminQuickUpload" title="Bổ sung hình ảnh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></label><input id="adminQuickUpload" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden style="display:none!important">`:'');
    const infoGridHtml=[
      ['Tình trạng', isRented ? '<span class="status-rented-pill">🔒 Đã cho thuê</span>' : '<span class="status-available-pill">🟢 Đang mở thuê</span>', true],
      ['Giá niêm yết',p.price_text||'Liên hệ'],
      ['Cập nhật lúc',formatVietnamFullDateTime(p.received_at||p.updated_at||p.created_at)],
      ['Diện tích',p.area_text],
      ['Kích thước',p.dimensions],
      ['Phòng ngủ',p.bedrooms?`${p.bedrooms} PN`:null],
      ['Phòng tắm',p.bathrooms?`${p.bathrooms} WC`:null],
      ['Kết cấu',p.structure],
      ['Pháp lý',p.legal],
      ['Liên hệ',phoneCellContent,true],
      ['Loại BĐS',p.property_type]
    ].map(([label,value,isRaw])=>`<div><small>${label}</small><strong>${isRaw?value:escapeHtml(value||'—')}</strong></div>`).join('');

    const galleryNavHtml = images.length > 1 ? `
      <button type="button" class="gallery-nav gallery-prev" id="galleryPrev" aria-label="Ảnh trước"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <button type="button" class="gallery-nav gallery-next" id="galleryNext" aria-label="Ảnh kế tiếp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>
      <span class="gallery-counter"><span id="activeImgIndex">1</span> / ${images.length}</span>
    ` : '';

    $('detailBody').innerHTML=`<div><div class="gallery-main ${!images[0]?'no-photo':''}">${images[0]?`<img id="mainImage" referrerpolicy="no-referrer" src="${escapeHtml(images[0])}" alt="${escapeHtml(propNameAlt)}" onerror="handleDetailImgError(this)">`:`<div class="placeholder-watermark watermark-detail"><img src="/assets/brand/fourland-logo.png" alt="Fourland" class="watermark-logo"><span class="watermark-text">Hình ảnh đang cập nhật</span></div>`}${galleryNavHtml}<button type="button" class="gallery-share-badge" id="shareDetail" title="Chia sẻ căn nhà này"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg><span>Chia sẻ</span></button></div><div class="thumbs">${thumbsHtml}</div></div><div><section class="content-panel"><h3>Nội dung nhà</h3><p>${escapeHtml(displayRawText)}</p></section><section class="info-panel"><div class="price">${escapeHtml(p.price_text||'Liên hệ')}</div><h2>${escapeHtml(p.address||p.property_id)}</h2><div class="meta">${escapeHtml([p.street,p.ward,p.district].filter(Boolean).join(' · '))}</div><div class="info-grid">${infoGridHtml}</div></section>${state.adminUnlocked?adminToolsHtml(p):''}<section class="direct-contact"><div><span>Hotline hỗ trợ Fourland</span><strong>${escapeHtml(COMPANY_HOTLINE)}</strong></div><a href="tel:${escapeHtml(phoneHref(COMPANY_HOTLINE))}" aria-label="Gọi Hotline Fourland"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 9.6 7c.35.5.28 1.18-.16 1.62l-1.3 1.3a14.5 14.5 0 0 0 5.94 5.94l1.3-1.3c.44-.44 1.12-.51 1.62-.16l3.5 2.4c.55.38.72 1.11.39 1.69l-1 1.75c-.34.59-.98.95-1.66.93C10.1 20.95 3.05 13.9 2.83 5.77c-.02-.68.34-1.32.93-1.66l1.75-1c.58-.33 1.31-.16 1.69.39Z"/></svg>Gọi ngay</a></section></div>`;
    
    let currentImgIdx=0;
    function setActiveImage(idx){
      if(!images.length)return;
      currentImgIdx=(idx+images.length)%images.length;
      const allThumbs=document.querySelectorAll('.thumbs img');
      allThumbs.forEach((t,i)=>t.classList.toggle('active',i===currentImgIdx));
      if(allThumbs[currentImgIdx]){
        allThumbs[currentImgIdx].scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
      }
      const counter=$('activeImgIndex');
      if(counter)counter.textContent=currentImgIdx+1;
      const main=$('mainImage');
      if(main){
        const existingWm=main.parentElement.querySelector('.placeholder-watermark');
        if(existingWm)existingWm.remove();
        main.style.display='block';
        main.parentElement.classList.remove('no-photo');
        main.src=images[currentImgIdx];
      }
    }
    document.querySelectorAll('.thumbs img').forEach((img,idx)=>{img.onclick=()=>setActiveImage(idx)});
    const prevBtn=$('galleryPrev');if(prevBtn)prevBtn.onclick=()=>setActiveImage(currentImgIdx-1);
    const nextBtn=$('galleryNext');if(nextBtn)nextBtn.onclick=()=>setActiveImage(currentImgIdx+1);
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
    const unlockInlineBtn=$('unlockPhoneInline');
    if(unlockInlineBtn){
      unlockInlineBtn.onclick=()=>{
        const dialog=$('adminAccess');
        $('adminAccessStatus').textContent='';
        $('adminCode').value='';
        dialog.showModal();
        setTimeout(()=>$('adminCode').focus(),50);
      };
    }
    if(state.adminUnlocked){
      $('propertyEditForm').onsubmit=event=>saveProperty(event,p.property_id);
      const quickUpload=$('adminQuickUpload');if(quickUpload)quickUpload.onchange=event=>uploadImages(event,p.property_id);
      document.querySelectorAll('.thumbs img').forEach((img,index)=>{const wrap=document.createElement('span');wrap.className='admin-thumb';img.parentNode.insertBefore(wrap,img);wrap.appendChild(img);const remove=document.createElement('button');remove.type='button';remove.className='image-remove';remove.setAttribute('aria-label',`Xóa ảnh ${index+1}`);remove.title='Xóa ảnh này';remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>';remove.onclick=event=>{event.stopPropagation();deleteImage(p.property_id,imageItems[index].position)};wrap.appendChild(remove)});
      const archiveBtn=document.getElementById('adminArchiveBtn');if(archiveBtn){archiveBtn.onclick=()=>setPropertyArchived(p.property_id,p.status!=='archived')}
    }
  }catch(error){$('detailBody').innerHTML=`<div class="error">${escapeHtml(error.message)}</div>`}
}

async function saveProperty(event,propertyId){
  event.preventDefault();const form=event.currentTarget,status=$('adminEditStatus'),button=form.querySelector('.admin-save');
  const payload={propertyId};new FormData(form).forEach((value,key)=>payload[key]=value);
  payload.is_featured=Boolean(form.querySelector('[name="is_featured"]')?.checked);
  payload.is_rented=Boolean(form.querySelector('[name="is_rented"]')?.checked);
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
  const input=event.currentTarget,files=[...input.files],status=$('adminUploadStatus');if(!files.length)return;
  input.disabled=true;
  showToast(`Đang nén và tải lên ${files.length} ảnh…`,4000);
  if(status)status.className='admin-status';
  try{
    for(let index=0;index<files.length;index++){
      if(status)status.textContent=`Đang xử lý ảnh ${index+1}/${files.length}…`;
      showToast(`Đang tải ảnh ${index+1}/${files.length}…`,3000);
      const dataUrl=await compressImage(files[index]);
      await api('/api/admin-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId,dataUrl})});
    }
    if(status){status.className='admin-status success-text';status.textContent=`Đã thêm ${files.length} hình ảnh.`}
    showToast(`✅ Đã thêm ${files.length} hình ảnh thành công!`);
    await load();
    setTimeout(()=>openDetail(propertyId),350);
  }catch(error){
    if(status){status.className='admin-status error-text';status.textContent=error.message}
    showToast('❌ Lỗi tải ảnh: '+error.message,4000);
    input.disabled=false;
  }
}
async function deleteImage(propertyId,position){
  if(!confirm('Xóa ảnh này khỏi hồ sơ? Ảnh sẽ không còn hiển thị trên web.'))return;
  try{await api('/api/admin-image',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId,position})});await load();await openDetail(propertyId)}catch(error){alert(error.message)}
}
async function setPropertyArchived(propertyId,archived){
  const question=archived?'Ẩn hồ sơ này khỏi kho web? Bạn vẫn có thể khôi phục sau.':'Khôi phục hồ sơ này lên kho web?';if(!confirm(question))return;
  try{await api('/api/admin-archive',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId,archived})});closeDetailModal();await load()}catch(error){alert(error.message)}
}
async function logoutAdmin(){
  try{await api('/api/admin-login',{method:'DELETE'})}catch(_){}
  setAdminState(false);
  showToast('🔒 Đã thoát quyền Quản trị');
}
function setAdminState(unlocked){
  state.adminUnlocked=Boolean(unlocked);
  if(!state.adminUnlocked){
    state.selectedIds.clear();
  }
  const profile=document.querySelector('.profile'),toggle=$('archivedToggle'),logoutBtn=$('logoutAdminBtn');
  profile.classList.toggle('admin-active',state.adminUnlocked);
  profile.setAttribute('aria-label',state.adminUnlocked?'Đang mở quyền Admin (Bấm để thoát)':'Mở quyền quản trị');
  profile.title=state.adminUnlocked?'Đang mở quyền Admin (Bấm để thoát)':'Mở quyền quản trị';
  toggle.hidden=!state.adminUnlocked;
  if(logoutBtn)logoutBtn.hidden=!state.adminUnlocked;
  if(!state.adminUnlocked&&state.viewArchived){state.viewArchived=false;toggle.classList.remove('active');load()}
  if(state.currentPropertyId&&$('detail').open){openDetail(state.currentPropertyId)}
  render();
  updateBulkBar();
}
async function checkAdminSession(){try{const result=await api('/api/admin-login');setAdminState(result.authenticated)}catch{setAdminState(false)}}
const logoutBtn=$('logoutAdminBtn');
if(logoutBtn){
  logoutBtn.onclick=()=>{
    if(confirm('Bạn có muốn thoát chế độ Quản trị viên (Khóa quyền sửa và che lại SĐT)?')){
      logoutAdmin();
    }
  };
}

const bulkSelectAllBtn=$('bulkSelectAll');
if(bulkSelectAllBtn){
  bulkSelectAllBtn.onclick=()=>{
    state.rows.forEach(row=>state.selectedIds.add(row.property_id));
    render();
  };
}
const bulkDeselectBtn=$('bulkDeselect');
if(bulkDeselectBtn){
  bulkDeselectBtn.onclick=()=>{
    state.selectedIds.clear();
    render();
  };
}
const bulkArchiveBtn=$('bulkArchiveBtn');
if(bulkArchiveBtn){
  bulkArchiveBtn.onclick=async()=>{
    if(!state.selectedIds.size)return;
    const isRestoring=state.viewArchived;
    const actionName=isRestoring?'KHÔI PHỤC lên website':'ẨN khỏi website';
    if(!confirm(`Bạn có chắc chắn muốn ${actionName} ${state.selectedIds.size} căn bất động sản đã chọn không?`))return;
    bulkArchiveBtn.disabled=true;
    bulkArchiveBtn.textContent='Đang xử lý…';
    try{
      const result=await api('/api/admin-archive',{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          propertyIds:Array.from(state.selectedIds),
          archived:!isRestoring
        })
      });
      showToast(result.message||'Thao tác thành công!');
      state.selectedIds.clear();
      updateBulkBar();
      await load();
    }catch(error){
      showToast('❌ Lỗi: '+error.message,4000);
    }finally{
      bulkArchiveBtn.disabled=false;
      updateBulkBar();
    }
  };
}

document.querySelector('.profile').onclick=()=>{
  if(state.adminUnlocked){
    if(confirm('Bạn đang ở chế độ Quản trị viên. Bạn có muốn THOÁT quyền quản trị không?')){
      logoutAdmin();
    }
    return;
  }
  const dialog=$('adminAccess');
  $('adminAccessStatus').textContent='';
  $('adminCode').value='';
  dialog.showModal();
  setTimeout(()=>$('adminCode').focus(),50);
};
$('closeAdminAccess').onclick=()=>$('adminAccess').close();
$('adminAccess').onclick=event=>{if(event.target===$('adminAccess'))$('adminAccess').close()};
$('adminAccessForm').onsubmit=async event=>{event.preventDefault();const status=$('adminAccessStatus'),button=event.currentTarget.querySelector('.access-submit');button.disabled=true;button.textContent='Đang kiểm tra…';status.className='access-status';status.textContent='';try{await api('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('adminCode').value.trim()})});setAdminState(true);status.className='access-status success-text';status.textContent='Đã mở quyền quản trị.';setTimeout(()=>{$('adminAccess').close();if(state.currentPropertyId&&$('detail').open)openDetail(state.currentPropertyId)},300)}catch(error){status.className='access-status error-text';status.textContent=error.message;$('adminCode').select()}finally{button.disabled=false;button.textContent='Mở quyền chỉnh sửa'}};
$('archivedToggle').onclick=()=>{state.viewArchived=!state.viewArchived;state.page=1;state.selectedIds.clear();$('archivedToggle').classList.toggle('active',state.viewArchived);$('archivedToggle').textContent=state.viewArchived?'Quay lại kho nhà':'Hồ sơ đã ẩn';load();updateBulkBar()};
let searchTimer;const scheduleLoad=(delay=250)=>{clearTimeout(searchTimer);state.page=1;searchTimer=setTimeout(load,delay)};$('q').addEventListener('input',()=>scheduleLoad(320));['district','ward','street','type','timeRange','rentalStatus','sortBy','minPrice','maxPrice','minArea','maxArea'].forEach(id=>{const el=$(id);if(el)el.addEventListener('change',()=>scheduleLoad(0))});$('searchForm').onsubmit=event=>{event.preventDefault();scheduleLoad(0)};$('reset').onclick=()=>{$('searchForm').reset();scheduleLoad(0)};$('prev').onclick=()=>{if(state.page>1){state.page--;load();scrollTo({top:0,behavior:'smooth'})}};$('next').onclick=()=>{if(state.page*state.pageSize<state.total){state.page++;load();scrollTo({top:0,behavior:'smooth'})}};$('filterToggle').onclick=()=>{const open=$('filters').classList.toggle('open');$('searchForm').classList.toggle('filter-open',open);$('filterToggle').setAttribute('aria-expanded',open)};

function closeDetailModal(){
  $('detail').close();
  state.currentPropertyId=null;
  document.title=DEFAULT_PAGE_TITLE;
  const script=$('propertyJsonLd');
  if(script)script.remove();
  history.pushState({},'','/');
}
$('closeDetail').onclick=closeDetailModal;
$('detail').onclick=event=>{if(event.target===$('detail'))closeDetailModal()};

function handleSearchFromHash(){
  const hash=window.location.hash;
  if(hash&&hash.startsWith('#q=')){
    const qValue=decodeURIComponent(hash.slice(3).replace(/\+/g,' '));
    $('q').value=qValue;
    state.page=1;
    load();
    const grid=$('grid');
    if(grid)grid.scrollIntoView({behavior:'smooth'});
  }
}
window.addEventListener('hashchange',handleSearchFromHash);
window.addEventListener('popstate',()=>{if($('detail').open){$('detail').close();state.currentPropertyId=null;document.title=DEFAULT_PAGE_TITLE}});

document.querySelectorAll('.quick-tab').forEach(tab=>{
  tab.onclick=()=>{
    document.querySelectorAll('.quick-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    state.filterTab=tab.dataset.filter||'all';
    state.page=1;
    load();
  };
});

loadFacets();
load();
checkAdminSession();

const initUrlId=new URLSearchParams(window.location.search).get('id')||(window.location.hash?window.location.hash.replace(/^#/,''):'');
if(initUrlId&&/^BDS-/i.test(initUrlId)){
  setTimeout(()=>openDetail(initUrlId),200);
}else{
  handleSearchFromHash();
}
