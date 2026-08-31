const state={page:1,pageSize:24,total:0,rows:[],facets:null,requestId:0,adminUnlocked:false,currentPropertyId:null,filterTab:'all',selectedIds:new Set()};const $=id=>document.getElementById(id);const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const phoneHref=value=>String(value||'').replace(/[^\d+]/g,'');
const slugify=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'ho-so-bat-dong-san';
function stripHouseNumber(address){
  let addr=String(address||'').trim();
  if(!addr)return'';
  addr=addr.split(/,(?:\s*(?:P\.?|Phường|Q\.?|Quận|H\.?|Huyện|TP\.?))/i)[0].trim();
  return addr.replace(/^(?:(?:số|căn|phòng|p\.?|lô|kho|nhà|hẻm|hxh|hbt)\s+)?(?:[\dA-Za-z]+[\/\.-])*[\dA-Za-z]+[a-zA-Z]?\s+/i,'').trim();
}
function formatPublicAddress(property,isAdmin=false){
  if(isAdmin||state.adminUnlocked){
    return property.address||property.property_id;
  }
  const strippedAddr=stripHouseNumber(property.address);
  if(strippedAddr&&strippedAddr.length>=3&&!/\b(?:triệu|tỷ|hh|0\d{8,9})\b/i.test(strippedAddr)){
    if(/^(?:đường|phố|hẻm|ngõ|chung\s*cư|căn\s*hộ|toà|tòa|khu|dự\s*án|vinhomes|landmark|masteri|sunrise|novaland|sala|ecogreen)/i.test(strippedAddr)){
      return strippedAddr;
    }
    return 'Đường '+strippedAddr;
  }
  const s=String(property.street||'').trim();
  if(s&&s.length>=3&&s.length<=40&&!/\b(?:triệu|tỷ|hh|0\d{8,9})\b/i.test(s)){
    if(/^(?:đường|phố|hẻm|ngõ|chung\s*cư|căn\s*hộ|toà|tòa|khu|dự\s*án|vinhomes|landmark|masteri|sunrise|novaland|sala|ecogreen)/i.test(s)){
      return s;
    }
    return 'Đường '+s;
  }
  const loc=[property.ward,property.district].filter(Boolean).join(', ');
  return loc?('Bất động sản '+loc):(property.property_id||'Bất động sản TP.HCM');
}
const propertyPath=row=>`/bat-dong-san/${slugify(formatPublicAddress(row,false))}--${encodeURIComponent(row.property_id)}`;
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
  const dateStr=date.toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'2-digit'});
  return`${timeStr} - ${dateStr}`;
}

function driveImage(url){const value=String(url||'');const match=value.match(/\/d\/([\w-]+)/)||value.match(/[?&]id=([\w-]+)/);return match?`https://drive.google.com/thumbnail?id=${match[1]}&sz=w1400`:value}
function values(){return{q:$('q').value,district:$('district').value,ward:$('ward').value,street:$('street').value,type:$('type').value,timeRange:$('timeRange')?$('timeRange').value:'',sortBy:$('sortBy')?$('sortBy').value:'',rentalStatus:$('rentalStatus')?$('rentalStatus').value:'',minPrice:$('minPrice').value,maxPrice:$('maxPrice').value,minArea:$('minArea').value,maxArea:$('maxArea').value,page:state.page,pageSize:state.pageSize,archived:state.viewArchived?'only':'',featured:state.filterTab==='featured'?'1':'',_t:Date.now()}}
function params(input){const search=new URLSearchParams();Object.entries(input).forEach(([key,value])=>{if(value!==''&&value!=null)search.set(key,value)});return search}
async function api(path,options={}){const response=await fetch(path,options);const rawText=await response.text();let body={};try{body=rawText?JSON.parse(rawText):{}}catch{if(!response.ok){throw new Error(`Lỗi máy chủ (${response.status}): ${rawText.slice(0,100)||response.statusText}`);}throw new Error('Phản hồi từ máy chủ không hợp lệ');}if(!response.ok||body.ok===false){const errText=typeof body.error==='object'&&body.error!==null?(body.error.message||JSON.stringify(body.error)):(body.error||'Không tải được dữ liệu');throw new Error(errText);}return body;}
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
function dismissSplash(){
  const splash=$('brandSplash');
  if(!splash||splash.classList.contains('splash-fade-out'))return;
  splash.classList.add('splash-fade-out');
  setTimeout(()=>{
    if(splash&&splash.parentNode)splash.parentNode.removeChild(splash);
  },500);
}
setTimeout(dismissSplash,900);

async function load(){
  const requestId=++state.requestId;$('error').hidden=true;$('grid').innerHTML=skeleton();
  try{const data=await api('/api/properties?'+params(values()));if(requestId!==state.requestId)return;state.rows=data.rows||[];state.total=data.total||0;$('total').textContent=state.total.toLocaleString('vi-VN');$('withImages').textContent=state.rows.filter(row=>Number(row.image_count)>0).length;$('resultLabel').textContent=state.viewArchived?`${state.total.toLocaleString('vi-VN')} hồ sơ đã ẩn`:`${state.total.toLocaleString('vi-VN')} hồ sơ phù hợp`;$('pageLabel').textContent=`Trang ${state.page} / ${Math.max(1,Math.ceil(state.total/state.pageSize))}`;$('pageNumber').textContent=state.page;$('prev').disabled=state.page<=1;$('next').disabled=state.page*state.pageSize>=state.total;render();dismissSplash()}
  catch(error){if(requestId!==state.requestId)return;$('grid').innerHTML='<div class="empty">Chưa có dữ liệu để hiển thị.</div>';$('resultLabel').textContent='Không tải được kho dữ liệu';$('error').textContent=error.message;$('error').hidden=false;dismissSplash()}
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
    const images = (row.property_images || []).filter(item => item.public_url && String(item.public_url).startsWith('http')).sort((a, b) => a.position - b.position);
    const image = driveImage(images[0]?.public_url);
    let typeBadgeHtml = '';
    const displayType = row.property_type || 'Nhà thuê';
    if (isFeatured) {
      typeBadgeHtml = `<span class="badge-type badge-featured"><svg class="star-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>${escapeHtml(displayType)}</span>`;
    } else {
      typeBadgeHtml = `<span class="badge-type">${escapeHtml(displayType)}</span>`;
    }
    const displayAddress = formatPublicAddress(row, state.adminUnlocked);
    const imgAlt = `${displayType} ${[displayAddress,row.district].filter(Boolean).join(', ')} - Fourland`;
    const locationParts = [row.ward, row.district].filter(Boolean);
    const locationText = locationParts.length ? locationParts.join(', ') : (row.district || 'TP. Hồ Chí Minh');
    const timeRel = formatVietnamRelativeTime(row.received_at || row.updated_at || row.created_at);
    const timeFull = formatVietnamFullDateTime(row.received_at || row.updated_at || row.created_at);
    const timeHtml = timeRel ? `<div class="card-time" title="Thời gian cập nhật: ${escapeHtml(timeFull)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${escapeHtml(timeRel)}</span></div>` : '';
    
    // Specs pills with luxury vector line SVGs
    const specs = [];
    const cardArea = row.area_text || row.data_json?.property?.area || row.dimensions;
    if(cardArea){
      specs.push(`<span class="spec-tag" title="Diện tích / Kích thước"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.7"/></svg>${escapeHtml(cardArea)}</span>`);
    }
    const cardBedrooms = row.data_json?.property?.bedrooms || (row.bedrooms ? `${row.bedrooms} PN` : null);
    if(cardBedrooms){
      const bedLabel = (typeof cardBedrooms === 'number' || /^\d+$/.test(cardBedrooms)) ? `${cardBedrooms} PN` : cardBedrooms;
      specs.push(`<span class="spec-tag" title="Phòng ngủ"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 19h20M2 17v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6M6 9V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>${escapeHtml(bedLabel)}</span>`);
    }
    const specsHtml = specs.length ? `<div class="card-specs">${specs.join('')}</div>` : '';

    const selectCheckboxHtml = state.adminUnlocked ? `
      <div class="card-select-wrap ${state.selectedIds.has(row.property_id)?'is-checked':''}" data-id="${escapeHtml(row.property_id)}" title="Chọn căn này" role="checkbox" aria-checked="${state.selectedIds.has(row.property_id)}">
        <span class="card-select-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></span>
      </div>
    ` : '';

    const statusPillHtml = `<span class="photo-status-pill ${isRented ? 'is-rented' : 'is-available'}" title="${isRented ? 'Đã cho thuê' : 'Đang mở thuê (Còn phòng)'}"><i class="photo-status-dot"></i></span>`;

    return`<a class="card ${isFeatured?'is-featured':''} ${isRented?'is-rented':''} ${row.status==='archived'?'archived-card':''} ${state.selectedIds.has(row.property_id)?'is-selected':''}" href="${escapeHtml(propertyPath(row))}" data-id="${escapeHtml(row.property_id)}" aria-label="Xem ${escapeHtml(displayAddress)}">
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
        <h2 class="card-title" title="${escapeHtml(displayAddress)}">${escapeHtml(displayAddress)}</h2>
        <div class="card-location">
          <svg class="icon-pin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>
          <span class="card-loc-name">${escapeHtml(locationText)}</span>
        </div>
        ${timeRel ? `<div class="card-time" title="Cập nhật lúc: ${escapeHtml(timeFull)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${escapeHtml(timeRel)}</span></div>` : ''}
        ${specsHtml}
      </div>
    </a>`;
  }).join('');

  let isTouchDevice = false;

  document.querySelectorAll('.card-select-wrap').forEach(wrap=>{
    wrap.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();
      toggleCardSelection(wrap.dataset.id);
    };
  });

  document.querySelectorAll('.card').forEach(card=>{
    let pressTimer=null;
    let isLongPress=false;
    let startX=0,startY=0;
    let isScrolling=false;

    const onTouchStart=(e)=>{
      isTouchDevice=true;
      if(!state.adminUnlocked)return;
      isLongPress=false;
      isScrolling=false;
      if(e.touches&&e.touches[0]){
        startX=e.touches[0].clientX;
        startY=e.touches[0].clientY;
      }
      pressTimer=setTimeout(()=>{
        if(isScrolling)return;
        isLongPress=true;
        const id=card.dataset.id;
        if(!state.selectedIds.has(id)){
          toggleCardSelection(id);
        }
        try { if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(50); } catch (_) {}
        showToast('Đã bật chế độ chọn nhiều căn');
      },550);
    };

    const onTouchMove=(e)=>{
      if(e.touches&&e.touches[0]){
        const dx=Math.abs(e.touches[0].clientX-startX);
        const dy=Math.abs(e.touches[0].clientY-startY);
        if(dx>8||dy>8){
          isScrolling=true;
          if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}
        }
      }
    };

    const onTouchEnd=()=>{
      if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}
    };

    card.addEventListener('touchstart',onTouchStart,{passive:true});
    card.addEventListener('touchmove',onTouchMove,{passive:true});
    card.addEventListener('touchend',onTouchEnd);

    // Mouse events for desktop
    card.addEventListener('mousedown',()=>{
      if(isTouchDevice||!state.adminUnlocked)return;
      isLongPress=false;
      pressTimer=setTimeout(()=>{
        isLongPress=true;
        const id=card.dataset.id;
        if(!state.selectedIds.has(id)){
          toggleCardSelection(id);
        }
        showToast('Đã bật chế độ chọn nhiều căn');
      },550);
    });
    card.addEventListener('mouseup',()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});
    card.addEventListener('mouseleave',()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}});

    card.addEventListener('click',event=>{
      if(isLongPress){
        event.preventDefault();
        event.stopPropagation();
        isLongPress=false;
        return;
      }
      if(event.target.closest('.card-select-wrap')){
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if(state.selectedIds.size>0&&state.adminUnlocked){
        event.preventDefault();
        event.stopPropagation();
        toggleCardSelection(card.dataset.id);
        return;
      }
      if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();
      openDetail(card.dataset.id,card.getAttribute('href'))
    });
  });
  updateBulkBar();
}

function toggleCardSelection(id){
  if(!state.adminUnlocked||!id)return;
  const card=document.querySelector(`.card[data-id="${id}"]`);
  const wrap=card?card.querySelector('.card-select-wrap'):null;
  if(state.selectedIds.has(id)){
    state.selectedIds.delete(id);
    if(card)card.classList.remove('is-selected');
    if(wrap){
      wrap.classList.remove('is-checked');
      wrap.setAttribute('aria-checked','false');
    }
  }else{
    state.selectedIds.add(id);
    if(card)card.classList.add('is-selected');
    if(wrap){
      wrap.classList.add('is-checked');
      wrap.setAttribute('aria-checked','true');
    }
  }
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
  return`<details class="admin-panel"><summary><span>Quản trị hồ sơ</span><small>Sửa thông tin nhà</small></summary><form id="propertyEditForm"><div class="admin-toggles-grid"><label class="admin-featured-toggle"><div class="toggle-content"><svg class="star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><strong>Ghim Nổi Bật</strong></div><input type="checkbox" name="is_featured" id="adminFeaturedInput" ${isFeatured?'checked':''}><span class="toggle-switch"></span></label><label class="admin-featured-toggle admin-rented-toggle"><div class="toggle-content"><svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><strong>Đã Cho Thuê</strong></div><input type="checkbox" name="is_rented" id="adminRentedInput" ${isRented?'checked':''}><span class="toggle-switch toggle-switch-rented"></span></label></div><div class="admin-fields"><label class="wide">Nội dung nhà<textarea name="raw_text" rows="5">${escapeHtml(p.raw_text||'')}</textarea></label><label class="wide">Địa chỉ<input name="address" value="${escapeHtml(p.address||'')}"></label><label>Quận/Huyện<input name="district" value="${escapeHtml(p.district||'')}"></label><label>Phường/Xã<input name="ward" value="${escapeHtml(p.ward||'')}"></label><label>Tên đường<input name="street" value="${escapeHtml(p.street||'')}"></label><label>Giá<input name="price_text" value="${escapeHtml(p.price_text||'')}"></label><label>Diện tích<input name="area_text" value="${escapeHtml(p.area_text||'')}"></label><label>Kích thước<input name="dimensions" value="${escapeHtml(p.dimensions||'')}"></label><label>Phòng ngủ<input name="bedrooms" type="number" min="0" value="${escapeHtml(p.bedrooms??'')}"></label><label>Phòng tắm<input name="bathrooms" type="number" min="0" value="${escapeHtml(p.bathrooms??'')}"></label><label>Kết cấu<input name="structure" value="${escapeHtml(p.structure||'')}"></label><label>Pháp lý<input name="legal" value="${escapeHtml(p.legal||'')}"></label><label>Số liên hệ<input name="phone" inputmode="tel" value="${escapeHtml(p.phone||'')}"></label><label>Loại BĐS<input name="property_type" value="${escapeHtml(p.property_type||'')}"></label></div><div class="admin-actions"><button class="admin-save" type="submit">Lưu thay đổi</button><button type="button" class="${p.status==='archived'?'admin-restore':'admin-archive'}" id="adminArchiveBtn">${p.status==='archived'?'Khôi phục hồ sơ lên web':'Ẩn hồ sơ khỏi web'}</button><button type="button" class="admin-hard-delete" id="adminHardDeleteBtn" title="Xóa hoàn toàn khỏi cơ sở dữ liệu">🗑️ Xóa vĩnh viễn</button></div><div id="adminEditStatus" class="admin-status" role="status"></div></form></details>`
}
function showToast(message,duration=2400){const toast=$('toast');if(!toast)return;toast.textContent=message;toast.classList.add('active');clearTimeout(toast._timer);toast._timer=setTimeout(()=>toast.classList.remove('active'),duration)}
function maskPhone(phone){if(!phone)return'Chưa có SĐT';const clean=String(phone).trim();if(clean.length>=9)return clean.slice(0,4)+' ••• •••';return clean.slice(0,Math.max(3,clean.length-4))+' •••'}
function maskTextPhones(text){
  if(!text)return'';
  const phonePattern=/(?:\+?84|0)(?:[35789])(?:[\s.-]*\d){7,9}/g;
  return String(text).replace(phonePattern,match=>{
    const clean=match.replace(/[\s.-]/g,'');
    return clean.slice(0,4)+' ••• •••';
  });
}
function maskDescriptionText(text,address,street,isAdmin=false){
  if(!text)return'Chưa có nội dung mô tả.';
  let output=maskTextPhones(text);
  if(isAdmin||state.adminUnlocked)return output;
  if(address){
    const rawAddr=String(address).trim();
    const streetName=stripHouseNumber(rawAddr)||String(street||'').trim();
    if(streetName&&streetName.length>=3){
      const escapedStreet=streetName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const addrPattern=new RegExp('(?:(?:số|căn|phòng|p\\.?|lô|kho|nhà|hẻm|hxh|hbt)\\s+)?(?:[\\dA-Za-z]+[\\/\\.-])*[\\dA-Za-z]+[a-zA-Z]?\\s*(?:,\\s*)?(?:đường\\s+)?'+escapedStreet,'gi');
      output=output.replace(addrPattern,()=>{
        return /^(?:chung\s*cư|căn\s*hộ|toà|tòa|khu|dự\s*án|vinhomes|landmark|masteri|sunrise|novaland|sala|ecogreen)/i.test(streetName)?streetName:('Đường '+streetName);
      });
    }
  }
  return output;
}

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
  const displayAddress=formatPublicAddress(p,state.adminUnlocked);
  const schema={
    "@context":"https://schema.org",
    "@type":"SingleFamilyResidence",
    "name":displayAddress,
    "description":p.raw_text||p.notes||`${p.property_type||'Bất động sản'} tại ${displayAddress}, ${p.district||'TP.HCM'}`,
    "url":window.location.href,
    "image":images.length?images:['https://www.fourland.vn/assets/brand/fourland-logo.png'],
    "address":{
      "@type":"PostalAddress",
      "streetAddress":p.street?('Đường '+p.street):(p.address||''),
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
    const imageItems=(p.property_images||[]).filter(i=>(i.public_url||i.source_url)&&String(i.public_url||i.source_url).startsWith('http')).sort((a,b)=>a.position-b.position);
    const images=imageItems.map(i=>driveImage(i.public_url||i.source_url)).filter(Boolean);
    const customerPhone=p.phone||'';
    const views=Number(p.view_count)||1;
    const isRented=p.status==='rented'||Boolean(p.is_rented);
    const displayAddress=formatPublicAddress(p,state.adminUnlocked);
    
    // SEO: Dynamic Document Title & Schema
    const propTitle=`${displayAddress} · ${p.price_text?p.price_text+' · ':''}FOURLAND`;
    document.title=propTitle;
    injectPropertySchema(p, images);

    const updatedRel = formatVietnamRelativeTime(p.received_at || p.updated_at || p.created_at);
    const updatedFull = formatVietnamFullDateTime(p.received_at || p.updated_at || p.created_at);
    const updatedBadgeHtml = updatedRel ? `<span class="detail-header-sep">·</span><span class="detail-header-time" title="Thời gian cập nhật: ${escapeHtml(updatedFull)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(updatedRel)}</span>` : '';
    $('detailId').innerHTML=`<span class="detail-header-id">${escapeHtml(id)}</span>${updatedBadgeHtml}<span class="detail-header-sep">·</span><span class="detail-header-views" title="${views} lượt xem"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${views}</span>`;
    const phoneCellContent=state.adminUnlocked
      ?(customerPhone?`<a href="tel:${escapeHtml(phoneHref(customerPhone))}" class="phone-link-call" title="Bấm để gọi số khách / chủ nhà">${escapeHtml(customerPhone)}</a>`:'—')
      :(customerPhone?`<button type="button" class="phone-link-unlock" id="unlockPhoneInline" title="Bấm để nhập mã Admin xem SĐT">${escapeHtml(maskPhone(customerPhone))}</button>`:'—');
    const displayRawText=maskDescriptionText(p.raw_text||p.notes||'Chưa có nội dung mô tả.',p.address,p.street,state.adminUnlocked);
    const propNameAlt=`${p.property_type||'Nhà'} ${displayAddress}`;
    const thumbsHtml=images.map((src,index)=>`<img class="${index===0?'active':''}" referrerpolicy="no-referrer" src="${escapeHtml(src)}" alt="${escapeHtml(propNameAlt)} - Ảnh ${index+1}" onerror="this.style.display='none';">`).join('')+
      (state.adminUnlocked?`<label class="admin-thumb-add" for="adminQuickUpload" title="Bổ sung hình ảnh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></label><input id="adminQuickUpload" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden style="display:none!important">`:'');
    const displayBedrooms = p.data_json?.property?.bedrooms || (p.bedrooms ? `${p.bedrooms} PN` : null);
    const displayBathrooms = p.data_json?.property?.bathrooms || (p.bathrooms ? `${p.bathrooms} WC` : null);
    const displayArea = p.area_text || p.data_json?.property?.area || p.dimensions || null;
    const displayLegal = p.legal || p.data_json?.property?.legal || null;
    const displayStructure = p.structure || p.data_json?.property?.structure || null;
    const displayCommission = p.commission || p.data_json?.property?.commission || null;
    const displayNotes = p.notes || p.data_json?.property?.notes || null;

    const infoGridHtml=[
      ['Tình trạng', isRented ? '<span class="status-rented-pill">🔒 Đã cho thuê</span>' : '<span class="status-available-pill">🟢 Đang mở thuê</span>', true],
      ['Giá niêm yết', p.price_text||'Liên hệ'],
      ['Cập nhật lúc', formatVietnamFullDateTime(p.received_at||p.updated_at||p.created_at)],
      ['Hoa hồng', displayCommission],
      ['Diện tích', displayArea],
      ['Kích thước', p.dimensions],
      ['Phòng ngủ', displayBedrooms],
      ['Phòng tắm', displayBathrooms],
      ['Kết cấu', displayStructure],
      ['Pháp lý', displayLegal],
      ['Ghi chú', displayNotes],
      ['Liên hệ', phoneCellContent, true],
      ['Loại BĐS', p.property_type||'Nhà thuê']
    ].map(([label,value,isRaw])=>`<div><small>${label}</small><strong>${isRaw?value:escapeHtml(value||'—')}</strong></div>`).join('');

    const galleryNavHtml = images.length > 1 ? `
      <button type="button" class="gallery-nav gallery-prev" id="galleryPrev" aria-label="Ảnh trước"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <button type="button" class="gallery-nav gallery-next" id="galleryNext" aria-label="Ảnh kế tiếp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>
      <span class="gallery-counter"><span id="activeImgIndex">1</span> / ${images.length}</span>
    ` : '';

    const quickActionsHtml = `
      <div class="property-quick-actions">
        <button type="button" class="action-chip share-chip" id="actionShareBtn" title="Chia sẻ căn nhà này">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          <span>Chia sẻ</span>
        </button>
        ${state.adminUnlocked ? `
        <button type="button" class="action-chip fb-chip" id="actionFbBtn" title="Đăng lên Fanpage Ngọc Nhà Tốt">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          <span>Đăng Facebook</span>
        </button>
        ` : ''}
      </div>
    `;

    $('detailBody').innerHTML=`<div><div class="gallery-main ${!images[0]?'no-photo':''}">${images[0]?`<img id="mainImage" referrerpolicy="no-referrer" src="${escapeHtml(images[0])}" alt="${escapeHtml(propNameAlt)}" onerror="handleDetailImgError(this)">`:`<div class="placeholder-watermark watermark-detail"><img src="/assets/brand/fourland-logo.png" alt="Fourland" class="watermark-logo"><span class="watermark-text">Hình ảnh đang cập nhật</span></div>`}${galleryNavHtml}</div><div class="thumbs">${thumbsHtml}</div></div><div><section class="info-panel"><div class="price">${escapeHtml(p.price_text||'Liên hệ')}</div><h2>${escapeHtml(displayAddress)}</h2><div class="meta">${escapeHtml([p.street,p.ward,p.district].filter(Boolean).join(' · '))}</div>${quickActionsHtml}<div class="info-grid">${infoGridHtml}</div></section><section class="content-panel"><h3>Nội dung nhà</h3><p>${escapeHtml(displayRawText)}</p></section>${state.adminUnlocked?adminToolsHtml(p):''}<section class="direct-contact"><div><span>Hotline hỗ trợ Fourland</span><strong>${escapeHtml(COMPANY_HOTLINE)}</strong></div><a href="tel:${escapeHtml(phoneHref(COMPANY_HOTLINE))}" aria-label="Gọi Hotline Fourland"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 9.6 7c.35.5.28 1.18-.16 1.62l-1.3 1.3a14.5 14.5 0 0 0 5.94 5.94l1.3-1.3c.44-.44 1.12-.51 1.62-.16l3.5 2.4c.55.38.72 1.11.39 1.69l-1 1.75c-.34.59-.98.95-1.66.93C10.1 20.95 3.05 13.9 2.83 5.77c-.02-.68.34-1.32.93-1.66l1.75-1c.58-.33 1.31-.16 1.69.39Z"/></svg>Gọi ngay</a></section></div>`;
    
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
    
    const actionShare=$('actionShareBtn');
    if(actionShare)actionShare.onclick=()=>handleShareProperty(p);

    const actionFb=$('actionFbBtn');
    if(actionFb)actionFb.onclick=()=>openFacebookStudio(p.property_id);

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
      const hardDeleteBtn=document.getElementById('adminHardDeleteBtn');if(hardDeleteBtn){hardDeleteBtn.onclick=()=>deletePropertyPermanent(p.property_id)}
      const panelFbBtn=$('adminPanelFbBtn');if(panelFbBtn)panelFbBtn.onclick=()=>openFacebookStudio(p.property_id);
    }
  }catch(error){$('detailBody').innerHTML=`<div class="error">${escapeHtml(error.message)}</div>`}
}

function handleShareProperty(p) {
  const link = window.location.href;
  const title = p.address || p.property_id || 'Chi tiết bất động sản · Fourland';
  const price = p.price_text || '';
  if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
    try {
      navigator.share({ title: `${price ? price + ' · ' : ''}${title}`, url: link });
      return;
    } catch (_) {}
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(() => showToast('🔗 Đã sao chép link căn nhà thành công!')).catch(() => prompt('Sao chép link này gửi cho khách:', link));
  } else {
    prompt('Sao chép link này gửi cho khách:', link);
  }
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
  state.rows=state.rows.filter(r=>r.property_id!==propertyId);
  state.total=Math.max(0,state.total-1);
  $('total').textContent=state.total.toLocaleString('vi-VN');
  render();
  closeDetailModal();
  showToast(archived?'✅ Đã ẩn hồ sơ khỏi web!':'✅ Đã khôi phục hồ sơ lên web!');
  try{
    await api('/api/admin-archive',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId,archived})});
    await load();
  }catch(error){
    alert('Lỗi: '+error.message);
    await load();
  }
}

async function deletePropertyPermanent(propertyId){
  if(!confirm('⚠️ CẢNH BÁO NGUY HIỂM:\nHành động này sẽ XÓA VĨNH VIỄN căn nhà này và toàn bộ hình ảnh khỏi Database và không thể hoàn tác!\n\nBạn có chắc chắn 100% muốn xóa?'))return;
  state.rows=state.rows.filter(r=>r.property_id!==propertyId);
  state.total=Math.max(0,state.total-1);
  $('total').textContent=state.total.toLocaleString('vi-VN');
  render();
  closeDetailModal();
  showToast('🗑️ Đang xóa vĩnh viễn...');
  try{
    const result=await api('/api/admin-archive',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({propertyId})});
    showToast(result.message||'✅ Đã xóa vĩnh viễn!');
    await load();
  }catch(error){
    alert('Lỗi: '+error.message);
    await load();
  }
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
  const profile=document.querySelector('.profile'),toggle=$('archivedToggle');
  profile.classList.toggle('admin-active',state.adminUnlocked);
  profile.setAttribute('aria-label',state.adminUnlocked?'Đang là Quản trị viên (Bấm để thoát Admin)':'Mở quyền quản trị');
  profile.title=state.adminUnlocked?'Đang là Quản trị viên (Bấm để thoát Admin)':'Mở quyền quản trị';
  toggle.hidden=!state.adminUnlocked;
  if(!state.adminUnlocked&&state.viewArchived){state.viewArchived=false;toggle.classList.remove('active');load()}
  if(state.currentPropertyId&&$('detail').open){openDetail(state.currentPropertyId)}
  render();
  updateBulkBar();
}
async function checkAdminSession(){try{const result=await api('/api/admin-login');setAdminState(result.authenticated)}catch{setAdminState(false)}}

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
    const count=state.selectedIds.size;
    if(!confirm(`Bạn có chắc chắn muốn ${actionName} ${count} căn bất động sản đã chọn không?`))return;
    const selectedArray=Array.from(state.selectedIds);
    state.rows=state.rows.filter(r=>!state.selectedIds.has(r.property_id));
    state.total=Math.max(0,state.total-count);
    $('total').textContent=state.total.toLocaleString('vi-VN');
    state.selectedIds.clear();
    updateBulkBar();
    render();
    showToast(isRestoring?'✅ Đang khôi phục...':'✅ Đang ẩn hồ sơ...');
    try{
      const result=await api('/api/admin-archive',{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          propertyIds:selectedArray,
          archived:!isRestoring
        })
      });
      showToast(result.message||'Thao tác thành công!');
      await load();
    }catch(error){
      showToast('❌ Lỗi: '+error.message,4000);
      await load();
    }
  };
}
const bulkHardDeleteBtn=$('bulkHardDeleteBtn');
if(bulkHardDeleteBtn){
  bulkHardDeleteBtn.onclick=async()=>{
    if(!state.selectedIds.size)return;
    const count=state.selectedIds.size;
    if(!confirm(`⚠️ CẢNH BÁO NGUY HIỂM:\n\nBạn có chắc chắn muốn XÓA VĨNH VIỄN ${count} căn bất động sản đã chọn và toàn bộ hình ảnh khỏi Database không?\n\nHành động này KHÔNG THỂ HOÀN TÁC!`))return;
    const selectedArray=Array.from(state.selectedIds);
    state.rows=state.rows.filter(r=>!state.selectedIds.has(r.property_id));
    state.total=Math.max(0,state.total-count);
    $('total').textContent=state.total.toLocaleString('vi-VN');
    state.selectedIds.clear();
    updateBulkBar();
    render();
    showToast('🗑️ Đang xóa vĩnh viễn...');
    try{
      const result=await api('/api/admin-archive',{
        method:'DELETE',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({propertyIds:selectedArray})
      });
      showToast(result.message||'✅ Đã xóa vĩnh viễn!');
      await load();
    }catch(error){
      alert('Lỗi: '+error.message);
      await load();
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

const pathSlug = window.location.pathname.startsWith('/bat-dong-san/') ? window.location.pathname.slice('/bat-dong-san/'.length) : '';
const markerIdx = pathSlug.lastIndexOf('--');
const extractedSlugId = markerIdx >= 0 ? pathSlug.slice(markerIdx + 2) : '';
const initUrlId = extractedSlugId || new URLSearchParams(window.location.search).get('id') || (window.location.hash ? window.location.hash.replace(/^#/, '') : '');

if (initUrlId && /^BDS-/i.test(initUrlId)) {
  setTimeout(() => openDetail(initUrlId, window.location.pathname), 150);
} else {
  handleSearchFromHash();
}

// ==========================================================================
// PUBLIC PORTAL FACEBOOK STUDIO & COMPOSIO CLIENT
// ==========================================================================
const fbPortalState = {
  propertyId: null,
  tone: 'hot',
  content: '',
  allImages: [],
  selectedImages: new Set(),
  pageName: 'Ngọc Nhà Tốt'
};

async function openFacebookStudio(propertyId) {
  fbPortalState.propertyId = propertyId;
  const dialog = $('facebookPostDialog');
  if (!dialog) return;

  const statusNote = $('fbPublishStatus');
  if (statusNote) statusNote.textContent = 'Đang chuẩn bị bài viết…';
  const submitBtn = $('fbSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg><span>Đăng lên Facebook</span>`;
  }

  dialog.showModal();
  await loadFacebookDraft(propertyId, fbPortalState.tone);
}

function closeFacebookStudio() {
  const dialog = $('facebookPostDialog');
  if (dialog) dialog.close();
}

async function loadFacebookDraft(propertyId, tone = 'hot') {
  fbPortalState.tone = tone;
  const contentInput = $('fbPostContent');
  const previewText = $('fbPreviewText');
  if (contentInput) contentInput.value = 'Đang sinh nội dung bài viết với AI…';
  if (previewText) previewText.textContent = 'Đang sinh nội dung bài viết với AI…';

  document.querySelectorAll('[data-fb-tone]').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.fbTone === tone);
  });

  try {
    const includeLink = $('fbIncludeLink')?.checked ?? true;
    const res = await api('/api/admin/v1/facebook/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fourland-preview-cms'
      },
      body: JSON.stringify({
        action: 'draft',
        propertyId,
        tone,
        includeLink
      })
    });
    const data = res.data || {};

    fbPortalState.content = data.content || '';
    fbPortalState.allImages = data.images || [];
    fbPortalState.pageName = data.pageName || 'Ngọc Nhà Tốt';

    // Default: select ALL images automatically
    fbPortalState.selectedImages = new Set(fbPortalState.allImages);

    if (contentInput) contentInput.value = fbPortalState.content;
    if (previewText) previewText.textContent = fbPortalState.content;

    renderFacebookPhotoGrid();
    renderFacebookPreviewGallery();

    const statusNote = $('fbPublishStatus');
    if (statusNote) statusNote.textContent = 'Sẵn sàng đăng lên Fanpage Ngọc Nhà Tốt';
  } catch (error) {
    if (contentInput) contentInput.value = `Lỗi tải nội dung: ${error.message}`;
    if (previewText) previewText.textContent = `Lỗi tải nội dung: ${error.message}`;
  }
}

function renderFacebookPhotoGrid() {
  const grid = $('fbPhotoGrid');
  const countLabel = $('fbPhotoCount');
  if (!grid) return;

  grid.innerHTML = '';
  if (countLabel) countLabel.textContent = `Đã chọn ${fbPortalState.selectedImages.size}/${fbPortalState.allImages.length} ảnh`;

  fbPortalState.allImages.forEach((imgUrl, index) => {
    const item = document.createElement('div');
    const isSelected = fbPortalState.selectedImages.has(imgUrl);
    item.className = `fb-portal-photo-item ${isSelected ? 'selected' : ''}`;
    item.innerHTML = `
      <img src="${escapeHtml(imgUrl)}" alt="Ảnh ${index + 1}">
      <div class="fb-portal-photo-check">✓</div>
    `;

    item.onclick = () => {
      if (fbPortalState.selectedImages.has(imgUrl)) {
        fbPortalState.selectedImages.delete(imgUrl);
      } else {
        fbPortalState.selectedImages.add(imgUrl);
      }
      renderFacebookPhotoGrid();
      renderFacebookPreviewGallery();
    };

    grid.appendChild(item);
  });

  // Nút tải thêm ảnh (+ Thêm ảnh)
  const addBtn = document.createElement('label');
  addBtn.className = 'fb-portal-photo-add';
  addBtn.title = 'Tải thêm ảnh từ thiết bị';
  addBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
    <span>Thêm ảnh</span>
    <input type="file" accept="image/jpeg,image/png,image/webp" multiple style="display:none!important">
  `;

  const fileInput = addBtn.querySelector('input');
  fileInput.onchange = async (e) => {
    const files = [...e.target.files];
    if (!files.length || !fbPortalState.propertyId) return;

    fileInput.disabled = true;
    showToast(`Đang nén và tải lên ${files.length} ảnh…`, 4000);
    const statusNote = $('fbPublishStatus');
    if (statusNote) statusNote.textContent = `Đang tải ${files.length} ảnh lên hồ sơ nhà…`;

    try {
      for (let i = 0; i < files.length; i++) {
        if (statusNote) statusNote.textContent = `Đang tải ảnh ${i + 1}/${files.length}…`;
        const dataUrl = await compressImage(files[i]);
        const res = await api('/api/admin-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer fourland-preview-cms'
          },
          body: JSON.stringify({ propertyId: fbPortalState.propertyId, dataUrl })
        });
        if (res.image?.public_url) {
          const newUrl = res.image.public_url;
          if (!fbPortalState.allImages.includes(newUrl)) {
            fbPortalState.allImages.push(newUrl);
          }
          fbPortalState.selectedImages.add(newUrl);
        }
      }
      showToast(`✅ Đã thêm ${files.length} ảnh vào hồ sơ nhà!`);
      if (statusNote) statusNote.textContent = 'Sẵn sàng đăng lên Fanpage Ngọc Nhà Tốt';
      renderFacebookPhotoGrid();
      renderFacebookPreviewGallery();
      await load();
      if ($('detail')?.open) {
        openDetail(fbPortalState.propertyId);
      }
    } catch (err) {
      showToast('❌ Lỗi tải ảnh: ' + err.message, 4000);
      if (statusNote) statusNote.textContent = 'Lỗi tải ảnh: ' + err.message;
    } finally {
      fileInput.disabled = false;
      fileInput.value = '';
    }
  };

  grid.appendChild(addBtn);
}

function renderFacebookPreviewGallery() {
  const gallery = $('fbPreviewGallery');
  if (!gallery) return;

  const images = Array.from(fbPortalState.selectedImages);
  gallery.className = `fb-mock-gallery layout-${Math.min(images.length, 4)}`;
  gallery.innerHTML = '';

  if (!images.length) {
    gallery.style.display = 'none';
    return;
  }

  gallery.style.display = 'grid';
  images.slice(0, 4).forEach((imgUrl, index) => {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = `Facebook Preview Photo ${index + 1}`;
    gallery.appendChild(img);
  });
}

async function handlePublishFacebook() {
  const content = ($('fbPostContent')?.value || '').trim();
  if (!content) {
    alert('Vui lòng nhập nội dung bài viết');
    return;
  }

  const submitBtn = $('fbSubmitBtn');
  const statusNote = $('fbPublishStatus');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Đang đăng lên Facebook…</span>`;
  }
  if (statusNote) statusNote.textContent = 'Đang xuất bản bài viết…';

  try {
    const selectedList = Array.from(fbPortalState.selectedImages);
    const imagesToPublish = selectedList.length > 0 ? selectedList : (fbPortalState.allImages || []);
    const result = await api('/api/admin/v1/facebook/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fourland-preview-cms'
      },
      body: JSON.stringify({
        propertyId: fbPortalState.propertyId,
        content,
        images: imagesToPublish,
        pageName: fbPortalState.pageName
      })
    });

    if (statusNote) statusNote.textContent = result.message || 'Đã đăng thành công!';
    if (submitBtn) submitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Đã xuất bản & Lưu thành công</span>`;

    // Update open detail view
    if (fbPortalState.propertyId && $('detail').open) {
      openDetail(fbPortalState.propertyId);
    }

    if (result.data?.postUrl) {
      if (confirm(`${result.message || 'Đã xuất bản thành công lên Fanpage Ngọc Nhà Tốt!'}\n\nBạn có muốn mở xem bài viết trên Facebook không?`)) {
        window.open(result.data.postUrl, '_blank');
      }
    } else {
      alert(result.message || 'Đã đăng bài thành công lên Facebook!');
    }

    setTimeout(closeFacebookStudio, 1500);
  } catch (error) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Thử lại</span>`;
    }
    if (statusNote) statusNote.textContent = `Lỗi: ${error.message}`;
    alert(`Không thể đăng bài: ${error.message}`);
  }
}

// Facebook Studio Event Listeners
if ($('fbDialogClose')) $('fbDialogClose').onclick = closeFacebookStudio;
if ($('fbCancelBtn')) $('fbCancelBtn').onclick = closeFacebookStudio;
if ($('fbSubmitBtn')) $('fbSubmitBtn').onclick = handlePublishFacebook;

document.querySelectorAll('[data-fb-tone]').forEach(chip => {
  chip.onclick = () => {
    const tone = chip.dataset.fbTone;
    if (fbPortalState.propertyId) {
      loadFacebookDraft(fbPortalState.propertyId, tone);
    }
  };
});

if ($('fbPostContent')) {
  $('fbPostContent').oninput = function() {
    fbPortalState.content = this.value;
    if ($('fbPreviewText')) $('fbPreviewText').textContent = this.value;
  };
}

if ($('fbIncludeLink')) {
  $('fbIncludeLink').onchange = () => {
    if (fbPortalState.propertyId) {
      loadFacebookDraft(fbPortalState.propertyId, fbPortalState.tone);
    }
  };
}

if ($('facebookPostDialog')) {
  $('facebookPostDialog').onclick = event => {
    if (event.target === $('facebookPostDialog')) closeFacebookStudio();
  };
}

