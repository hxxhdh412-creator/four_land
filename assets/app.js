const state={page:1,pageSize:24,total:0,rows:[],facets:null,requestId:0,authRole:null,adminUnlocked:false,ctvUnlocked:false,canViewFullAddress:false,currentPropertyId:null,filterTab:'all',selectedIds:new Set()};const $=id=>document.getElementById(id);const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const phoneHref=value=>String(value||'').replace(/[^\d+]/g,'');
const slugify=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'ho-so-bat-dong-san';
const COMPANY_HOTLINE='084.2222.813';
const FAVORITES_KEY='fourland_favorites_v1';
const DEVICE_ID_KEY='fourland_device_id_v1';
const ACCESS_SESSION_KEY='fourland_access_session_v1';
const ACCESS_BACKUP_COOKIE='fourland_access_backup';
const DEVICE_COOKIE='fourland_device_id';
const DEVICE_SESSION_TTL_MS=365*24*60*60*1000;

const deviceAuthStore = {
  readCookie(name) {
    try {
      const raw = String(document.cookie || '');
      const item = raw.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
      return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
    } catch {
      return '';
    }
  },
  writeCookie(name, value, maxAgeSeconds = 31536000) {
    try {
      const expires = new Date(Date.now() + maxAgeSeconds * 1000).toUTCString();
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}; Expires=${expires}${secure}`;
    } catch (_) {}
  },
  getDeviceId() {
    let id = '';
    try { id = localStorage.getItem(DEVICE_ID_KEY) || ''; } catch (_) {}
    if (!id) {
      try { id = sessionStorage.getItem(DEVICE_ID_KEY) || ''; } catch (_) {}
    }
    if (!id) {
      id = this.readCookie(DEVICE_COOKIE);
    }
    id = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    if (!id || id.length < 6) {
      const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID().replace(/-/g, '')
        : (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
      id = `fl_dev_${Date.now().toString(36)}_${rand.slice(0, 16)}`;
    }
    try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (_) {}
    try { sessionStorage.setItem(DEVICE_ID_KEY, id); } catch (_) {}
    this.writeCookie(DEVICE_COOKIE, id, 31536000);
    return id;
  },
  getSession() {
    let parsed = null;
    const sources = [
      () => { try { return localStorage.getItem(ACCESS_SESSION_KEY); } catch { return null; } },
      () => { try { return sessionStorage.getItem(ACCESS_SESSION_KEY); } catch { return null; } },
      () => this.readCookie(ACCESS_BACKUP_COOKIE)
    ];
    for (const readSource of sources) {
      try {
        const raw = readSource();
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (data && (data.role === 'admin' || data.role === 'ctv')) {
          if (data.expiresAt && Number(data.expiresAt) <= Date.now()) continue;
          parsed = data;
          break;
        }
      } catch (_) {}
    }
    if (parsed) {
      this.saveSession(parsed, false);
    }
    return parsed;
  },
  getToken() {
    const s = this.getSession();
    return s && s.token ? String(s.token) : '';
  },
  getRole() {
    const s = this.getSession();
    return s && (s.role === 'admin' || s.role === 'ctv') ? s.role : null;
  },
  saveSession({ role, token, deviceId, expiresAt } = {}, updateTimestamp = true) {
    if (role !== 'admin' && role !== 'ctv') return null;
    const prev = (() => {
      try {
        const raw = localStorage.getItem(ACCESS_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    })();
    const payload = {
      role,
      token: String(token || prev?.token || ''),
      deviceId: String(deviceId || prev?.deviceId || this.getDeviceId()),
      expiresAt: Number(expiresAt) > Date.now() ? Number(expiresAt) : (Date.now() + DEVICE_SESSION_TTL_MS),
      updatedAt: updateTimestamp ? Date.now() : (prev?.updatedAt || Date.now())
    };
    const serialized = JSON.stringify(payload);
    try { localStorage.setItem(ACCESS_SESSION_KEY, serialized); } catch (_) {}
    try { sessionStorage.setItem(ACCESS_SESSION_KEY, serialized); } catch (_) {}
    this.writeCookie(ACCESS_BACKUP_COOKIE, serialized, 31536000);
    return payload;
  },
  clearSession() {
    try { localStorage.removeItem(ACCESS_SESSION_KEY); } catch (_) {}
    try { sessionStorage.removeItem(ACCESS_SESSION_KEY); } catch (_) {}
    this.writeCookie(ACCESS_BACKUP_COOKIE, '', 0);
  }
};

(function bootstrapSavedDeviceAuth() {
  const savedRole = deviceAuthStore.getRole();
  if (savedRole === 'admin' || savedRole === 'ctv') {
    state.authRole = savedRole;
    state.adminUnlocked = savedRole === 'admin';
    state.ctvUnlocked = savedRole === 'ctv';
    state.canViewFullAddress = true;
  }
})();

const favoriteStore = {
  getIds() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  },
  has(id) {
    if (!id) return false;
    return this.getIds().includes(String(id));
  },
  add(id) {
    if (!id) return false;
    const strId = String(id);
    let ids = this.getIds();
    if (!ids.includes(strId)) {
      ids.unshift(strId);
      if (ids.length > 300) ids = ids.slice(0, 300);
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids)); } catch (_) {}
      updateFavoritesUI();
      return true;
    }
    return false;
  },
  remove(id) {
    if (!id) return false;
    const strId = String(id);
    let ids = this.getIds();
    if (ids.includes(strId)) {
      ids = ids.filter(x => x !== strId);
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids)); } catch (_) {}
      updateFavoritesUI();
      return true;
    }
    return false;
  },
  toggle(id) {
    if (this.has(id)) {
      this.remove(id);
      return false;
    } else {
      this.add(id);
      return true;
    }
  }
};

function fallbackCopyText(textToCopy) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = textToCopy;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showToast('📋 Đã sao chép danh sách nhà! Bạn có thể dán vào Zalo/Messenger.', 3200);
  } catch (err) {
    showToast('Không thể tự động sao chép: ' + err.message, 3500);
  }
}

function triggerImageDownload(url, filename) {
  if (!url) return;
  const savedToken = deviceAuthStore.getToken();
  const tokenParam = savedToken ? `&access_token=${encodeURIComponent(savedToken)}` : '';
  const downloadUrl = `/api/download-image?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename || 'fourland-bds-image.jpg')}${tokenParam}`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename || 'fourland-bds-image.jpg';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function updateFavoritesUI() {
  const ids = favoriteStore.getIds();
  const count = ids.length;

  // Topbar button badge
  const topBadge = $('topFavBadge');
  if (topBadge) {
    topBadge.textContent = count;
    topBadge.hidden = count === 0;
  }
  const topBtn = $('topFavBtn');
  if (topBtn) {
    topBtn.classList.toggle('has-favorites', count > 0);
  }

  // Quick tab badge
  const tabBadge = $('favCountBadge');
  if (tabBadge) {
    tabBadge.textContent = count;
    tabBadge.hidden = count === 0;
  }

  // Active cards in grid
  document.querySelectorAll('.card-favorite-btn').forEach(btn => {
    const id = btn.dataset.favId;
    const isFav = ids.includes(id);
    btn.classList.toggle('is-favorited', isFav);
    btn.setAttribute('aria-label', isFav ? 'Bỏ lưu căn này' : 'Lưu vào danh sách quan tâm');
    btn.setAttribute('title', isFav ? 'Bỏ lưu' : 'Lưu tin quan tâm');
  });

  // Modal detail chip if open
  const detailFavBtn = $('actionFavBtn');
  if (detailFavBtn) {
    const id = detailFavBtn.dataset.favId;
    const isFav = ids.includes(id);
    detailFavBtn.classList.toggle('is-favorited', isFav);
    const span = detailFavBtn.querySelector('span');
    if (span) span.textContent = isFav ? 'Đã lưu' : 'Lưu tin';
    const svg = detailFavBtn.querySelector('svg');
    if (svg) {
      svg.style.fill = isFav ? '#dc2626' : 'none';
      svg.style.stroke = isFav ? '#dc2626' : 'currentColor';
    }
  }

  updateFavoritesBanner();
}

function updateFavoritesBanner() {
  const banner = $('favBanner');
  if (!banner) return;
  if (state.filterTab !== 'favorites' || !state.rows.length) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }

  const count = state.rows.length;
  let zaloMsg = `Chào Fourland, tôi đang quan tâm ${count} căn nhà sau trên website:\n`;
  state.rows.slice(0, 10).forEach((r, idx) => {
    const addr = formatPublicAddress(r, false);
    const price = r.price_text || 'Liên hệ';
    zaloMsg += `${idx + 1}. [${r.property_id}] ${addr} (${price})\n`;
  });
  zaloMsg += `Nhờ Fourland kiểm tra tình trạng còn phòng và tư vấn xếp lịch xem nhà giúp tôi nhé!`;

  const cleanPhone = phoneHref(COMPANY_HOTLINE);
  const zaloUrl = `https://zalo.me/${cleanPhone}`;

  banner.hidden = false;
  banner.innerHTML = `
    <div class="fav-banner-card">
      <div class="fav-banner-visual">
        <span class="fav-banner-icon">❤️</span>
      </div>
      <div class="fav-banner-info">
        <h3 class="fav-banner-title">Danh sách ${count} căn bạn đang quan tâm</h3>
        <p class="fav-banner-sub">Gửi danh sách này cho đội ngũ Fourland để kiểm tra nhanh tình trạng trống, pháp lý và đặt lịch hẹn xem nhà thực tế.</p>
      </div>
      <div class="fav-banner-actions">
        <a href="${zaloUrl}" target="_blank" rel="noopener noreferrer" class="fav-zalo-cta" id="favZaloCta">
          <svg viewBox="0 0 40 40" width="20" height="20" fill="none" aria-hidden="true">
            <path d="M20 3C10.61 3 3 10.16 3 19c0 3.4 1.13 6.54 3.06 9.1L4.1 36.1c-.24.78.48 1.5 1.26 1.26L13.1 34.9A17.2 17.2 0 0 0 20 35c9.39 0 17-7.16 17-16S29.39 3 20 3z" fill="#0068FF"/>
            <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="'Manrope', sans-serif" font-weight="900" font-size="11" letter-spacing="-0.02em">Zalo</text>
          </svg>
          <span>Tư vấn qua Zalo</span>
        </a>
        <button type="button" class="fav-copy-cta" id="favCopyCta" title="Sao chép danh sách vào bộ nhớ tạm">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy danh sách</span>
        </button>
      </div>
    </div>
  `;

  const copyBtn = $('favCopyCta');
  if (copyBtn) {
    copyBtn.onclick = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(zaloMsg).then(() => {
          showToast('📋 Đã sao chép danh sách nhà! Bạn có thể dán vào Zalo/Messenger.', 3200);
        }).catch(() => fallbackCopyText(zaloMsg));
      } else {
        fallbackCopyText(zaloMsg);
      }
    };
  }

  const zaloCta = $('favZaloCta');
  if (zaloCta) {
    zaloCta.onclick = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(zaloMsg).catch(() => {});
      }
      showToast('Đang mở Zalo tư vấn Fourland… (Đã copy sẵn danh sách nhà)', 3000);
    };
  }
}

function stripHouseNumber(address){
  let addr=String(address||'').trim();
  if(!addr)return'';
  addr=addr.split(/,(?:\s*(?:P\.?|Phường|Q\.?|Quận|H\.?|Huyện|TP\.?))/i)[0].trim();
  return addr.replace(/^(?:(?:số|căn|phòng|p\.?|lô|kho|nhà|hẻm|hxh|hbt)\s+)?(?:[\dA-Za-z]+[\/\.-])*[\dA-Za-z]+[a-zA-Z]?\s+/i,'').trim();
}
function formatPublicAddress(property,isAdmin=false){
  if(isAdmin||state.adminUnlocked||state.authRole==='ctv'||state.canViewFullAddress){
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

function driveImage(url,width=1400){const value=String(url||'');const match=value.match(/\/d\/([\w-]+)/)||value.match(/[?&]id=([\w-]+)/);return match?`https://drive.google.com/thumbnail?id=${match[1]}&sz=w${width}`:value}
// Ảnh thẻ: dùng bản 320/480/720px theo màn hình thay vì 1400px; 4 ảnh đầu ưu tiên tải ngay
function cardImageAttrs(url,index){
  const src=driveImage(url,480);
  const isDrive=/drive\.google\.com\/thumbnail\?id=/.test(src);
  const srcset=isDrive?` srcset="${escapeHtml(driveImage(url,320))} 320w, ${escapeHtml(src)} 480w, ${escapeHtml(driveImage(url,720))} 720w" sizes="(max-width: 640px) 50vw, (max-width: 1100px) 34vw, 320px"`:'';
  const eager=index<4;
  return `src="${escapeHtml(src)}"${srcset} loading="${eager?'eager':'lazy'}" decoding="async"${eager?' fetchpriority="high"':''}`;
}
function values(){
  const isFavTab = state.filterTab === 'favorites';
  const favIds = isFavTab ? favoriteStore.getIds() : [];
  return {
    q:$('q').value,
    district:$('district').value,
    ward:$('ward').value,
    street:$('street').value,
    type:$('type').value,
    timeRange:$('timeRange')?$('timeRange').value:'',
    sortBy:$('sortBy')?$('sortBy').value:'',
    rentalStatus:$('rentalStatus')?$('rentalStatus').value:'',
    minPrice:$('minPrice').value,
    maxPrice:$('maxPrice').value,
    minArea:$('minArea').value,
    maxArea:$('maxArea').value,
    page:state.page,
    pageSize:state.pageSize,
    archived:state.viewArchived?'only':'',
    featured:state.filterTab==='featured'?'1':'',
    ids:isFavTab?favIds.join(','):'',
    _t:state.adminUnlocked?Date.now():'' // Chỉ admin cần bỏ qua cache; khách dùng CDN + cache trình duyệt
  };
}
function params(input){const search=new URLSearchParams();Object.entries(input).forEach(([key,value])=>{if(value!==''&&value!=null)search.set(key,value)});return search}
async function api(path,options={},retries=1){
  try{
    const deviceId=deviceAuthStore.getDeviceId();
    const savedToken=deviceAuthStore.getToken();
    const mergedHeaders={
      'X-Fourland-Device':deviceId,
      ...(savedToken?{'X-Fourland-Access':savedToken}:{}),
      ...(options.headers||{})
    };
    const response=await fetch(path,{
      credentials:'same-origin',
      ...options,
      headers:mergedHeaders
    });
    const rawText=await response.text();
    let body={};
    try{body=rawText?JSON.parse(rawText):{}}catch{
      if(!response.ok){throw new Error(`Lỗi máy chủ (${response.status}): ${rawText.slice(0,100)||response.statusText}`);}
      throw new Error('Phản hồi từ máy chủ không hợp lệ');
    }
    if(!response.ok||body.ok===false){
      const errText=typeof body.error==='object'&&body.error!==null?(body.error.message||JSON.stringify(body.error)):(body.error||'Không tải được dữ liệu');
      throw new Error(errText);
    }
    return body;
  }catch(err){
    if(err&&err.name==='AbortError')throw err;
    if(retries>0){
      await new Promise(r=>setTimeout(r,1000));
      return api(path,options,retries-1);
    }
    throw err;
  }
}
function setOptions(id,items,label){const select=$(id);if(!select)return;const current=select.value;const seen=new Set();const list=[];for(const item of(items||[])){const s=String(item||'').trim();if(!s)continue;const k=s.toLowerCase();if(!seen.has(k)){seen.add(k);list.push(s);}}select.innerHTML=`<option value="">${label}</option>`+list.map(item=>`<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');select.value=current}

const selectedDistricts = new Set();

function syncDistrictInputAndLabel(triggerLoad = false) {
  const hiddenInput = $('district');
  const textEl = $('districtTriggerText');
  const badgeEl = $('districtCountBadge');
  const triggerBtn = $('districtTrigger');
  const listEl = $('districtOptionsList');
  const arr = Array.from(selectedDistricts);

  if (hiddenInput) hiddenInput.value = arr.join(',');

  if (textEl) {
    if (arr.length === 0) {
      textEl.textContent = 'Tất cả quận huyện';
    } else if (arr.length <= 2) {
      textEl.textContent = arr.join(', ');
    } else {
      textEl.textContent = `${arr.slice(0, 2).join(', ')} (+${arr.length - 2})`;
    }
  }
  if (badgeEl) {
    badgeEl.textContent = String(arr.length);
    badgeEl.hidden = arr.length === 0;
  }
  if (triggerBtn) {
    triggerBtn.classList.toggle('has-selection', arr.length > 0);
    triggerBtn.title = arr.length ? `Đã chọn: ${arr.join(', ')}` : 'Tất cả quận huyện';
  }
  if (listEl) {
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const checked = selectedDistricts.has(cb.value);
      cb.checked = checked;
      const row = cb.closest('.multi-select-option');
      if (row) row.classList.toggle('is-selected', checked);
    });
  }
  if (triggerLoad && typeof scheduleLoad === 'function') {
    scheduleLoad(0);
  }
}

function setDistrictOptions(items) {
  const listEl = $('districtOptionsList');
  const select = $('district');
  if (!listEl) {
    if (select && select.tagName === 'SELECT') setOptions('district', items, 'Tất cả quận huyện');
    return;
  }
  const seen = new Set();
  const list = [];
  for (const item of (items || [])) {
    const s = String(item || '').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      list.push(s);
    }
  }
  listEl.innerHTML = list.map(item => {
    const checked = selectedDistricts.has(item);
    return `<label class="multi-select-option ${checked ? 'is-selected' : ''}">
      <input type="checkbox" value="${escapeHtml(item)}" ${checked ? 'checked' : ''}>
      <span class="multi-select-box"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
      <span class="multi-select-name">${escapeHtml(item)}</span>
    </label>`;
  }).join('');

  listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) selectedDistricts.add(cb.value);
      else selectedDistricts.delete(cb.value);
      syncDistrictInputAndLabel(true);
    };
  });
  syncDistrictInputAndLabel(false);
}

(function setupMultiDistrictDropdown() {
  const field = $('districtMultiField');
  const trigger = $('districtTrigger');
  const popover = $('districtPopover');
  const clearBtn = $('districtClearBtn');
  if (!field || !trigger || !popover) return;

  function closePopover() {
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    field.classList.remove('is-open');
  }

  trigger.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const willOpen = popover.hidden;
    popover.hidden = !willOpen;
    trigger.setAttribute('aria-expanded', String(willOpen));
    field.classList.toggle('is-open', willOpen);
  };

  if (clearBtn) {
    clearBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (selectedDistricts.size === 0) return;
      selectedDistricts.clear();
      syncDistrictInputAndLabel(true);
    };
  }

  document.addEventListener('click', (e) => {
    if (!popover.hidden && !field.contains(e.target)) {
      closePopover();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) {
      closePopover();
    }
  });
})();

async function loadFacets(){try{const data=await api('/api/facets');state.facets=data;setDistrictOptions(data.districts);setOptions('ward',data.wards,'Tất cả phường xã');setOptions('street',data.streets,'Tất cả tuyến đường');setOptions('type',data.types,'Tất cả loại hình')}catch{}}
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

// ===== Lớp dữ liệu kiểu SaaS: Stale-While-Revalidate + prefetch =====
const LIST_CACHE_TTL=120000;      // giữ kết quả bộ lọc 2 phút
const LIST_FRESH_MS=20000;        // dưới 20s coi là mới, không cần gọi lại
const DETAIL_PREFETCH_TTL=60000;
const listCache=new Map();
const detailPrefetchCache=new Map();
let listController=null;
function listKey(query){const copy={...query};delete copy._t;return params(copy).toString()}
function readListCache(key){
  const now=Date.now();
  const hit=listCache.get(key);
  if(hit&&now-hit.time<LIST_CACHE_TTL)return hit;
  try{
    const raw=sessionStorage.getItem('fl:list:'+key);
    if(raw){const parsed=JSON.parse(raw);if(parsed&&now-parsed.time<LIST_CACHE_TTL){listCache.set(key,parsed);return parsed}}
  }catch{}
  return null;
}
function writeListCache(key,data){
  const entry={data,time:Date.now()};
  listCache.set(key,entry);
  if(listCache.size>40)listCache.delete(listCache.keys().next().value);
  try{sessionStorage.setItem('fl:list:'+key,JSON.stringify(entry))}catch{}
}
function canUseListCache(){return !state.adminUnlocked&&!state.viewArchived}
function saveDataMode(){try{return Boolean(navigator.connection&&navigator.connection.saveData)}catch{return false}}
function topProgress(active){
  let bar=$('topProgress');
  if(!bar){bar=document.createElement('div');bar.id='topProgress';bar.className='top-progress';bar.setAttribute('aria-hidden','true');document.body.appendChild(bar)}
  if(active){bar.classList.remove('done');void bar.offsetWidth;bar.classList.add('active')}
  else if(bar.classList.contains('active')){bar.classList.remove('active');bar.classList.add('done')}
}
function applyListData(data){
  state.rows=data.rows||[];
  state.total=data.total||0;
  $('total').textContent=state.total.toLocaleString('vi-VN');
  $('withImages').textContent=state.rows.filter(row=>Number(row.image_count)>0).length;
  if (state.filterTab === 'favorites') {
    $('resultLabel').textContent = `${state.total.toLocaleString('vi-VN')} hồ sơ đã lưu`;
  } else {
    $('resultLabel').textContent=state.viewArchived?`${state.total.toLocaleString('vi-VN')} hồ sơ đã ẩn`:`${state.total.toLocaleString('vi-VN')} hồ sơ phù hợp`;
  }
  $('pageLabel').textContent=`Trang ${state.page} / ${Math.max(1,Math.ceil(state.total/state.pageSize))}`;
  $('pageNumber').textContent=state.page;
  $('prev').disabled=state.page<=1;
  $('next').disabled=state.page*state.pageSize>=state.total;
  render();
  state.hasRenderedList=true;
  dismissSplash();
}
function prefetchNextPage(query){
  if(!canUseListCache()||saveDataMode())return;
  if(state.page*state.pageSize>=state.total)return;
  const next={...query,page:state.page+1};
  const key=listKey(next);
  if(readListCache(key))return;
  const run=()=>api('/api/properties?'+params(next),{},0).then(data=>writeListCache(key,data)).catch(()=>{});
  (window.requestIdleCallback||(fn=>setTimeout(fn,600)))(run);
}
function prefetchDetail(id){
  if(!id||state.adminUnlocked||saveDataMode())return;
  const hit=detailPrefetchCache.get(id);
  if(hit&&Date.now()-hit.time<DETAIL_PREFETCH_TTL)return;
  const promise=api('/api/property?prefetch=1&id='+encodeURIComponent(id),{},0).catch(()=>null);
  detailPrefetchCache.set(id,{promise,time:Date.now()});
  if(detailPrefetchCache.size>30)detailPrefetchCache.delete(detailPrefetchCache.keys().next().value);
}
async function takePrefetchedDetail(id){
  const hit=detailPrefetchCache.get(id);
  detailPrefetchCache.delete(id);
  if(!hit||Date.now()-hit.time>=DETAIL_PREFETCH_TTL)return null;
  return hit.promise;
}

async function load(){
  const requestId=++state.requestId;$('error').hidden=true;
  if (state.filterTab === 'favorites') {
    const favIds = favoriteStore.getIds();
    if (!favIds.length) {
      state.rows = [];
      state.total = 0;
      $('total').textContent = '0';
      $('withImages').textContent = '0';
      $('resultLabel').textContent = '0 hồ sơ đã lưu';
      $('pageLabel').textContent = '';
      $('pageNumber').textContent = '1';
      $('prev').disabled = true;
      $('next').disabled = true;
      render();
      dismissSplash();
      return;
    }
  }
  const query=values();
  const key=listKey(query);
  const useCache=canUseListCache();
  const cached=useCache?readListCache(key):null;
  const grid=$('grid');
  if(cached){
    // Hiện ngay dữ liệu đã có (SWR), làm mới ngầm nếu đã cũ
    applyListData(cached.data);
    if(Date.now()-cached.time<LIST_FRESH_MS){prefetchNextPage(query);return}
  }else if(state.hasRenderedList){
    // Giữ lưới cũ, làm mờ nhẹ thay vì xoá trắng
    grid.classList.add('is-refreshing');
    topProgress(true);
  }else{
    grid.innerHTML=skeleton();
  }
  if(listController)listController.abort();
  const controller=new AbortController();
  listController=controller;
  try{
    const data=await api('/api/properties?'+params(query),{signal:controller.signal});
    if(requestId!==state.requestId)return;
    if(useCache)writeListCache(key,data);
    if(!cached||JSON.stringify(cached.data)!==JSON.stringify(data))applyListData(data);
    prefetchNextPage(query);
  }catch(error){
    if((error&&error.name==='AbortError')||requestId!==state.requestId)return;
    if(cached)return; // đang hiển thị bản cache, không cần báo lỗi
    grid.innerHTML='<div class="empty"><b>Đang kết nối lại máy chủ dữ liệu...</b><br><button type="button" class="primary" style="margin-top:14px;min-width:140px;display:inline-block;padding:0 20px;" onclick="load()">Thử tải lại ngay</button></div>';
    $('resultLabel').textContent='Tạm thời không tải được kho dữ liệu';
    $('error').textContent=error.message;
    $('error').hidden=false;
    dismissSplash();
  }finally{
    if(requestId===state.requestId){grid.classList.remove('is-refreshing');topProgress(false)}
    if(listController===controller)listController=null;
  }
}

// Tải trước trang chi tiết khi rê chuột (120ms) hoặc chạm vào thẻ
(function setupDetailPrefetch(){
  const grid=$('grid');
  if(!grid)return;
  let hoverTimer=null,hoverId=null;
  grid.addEventListener('mouseover',event=>{
    const card=event.target.closest&&event.target.closest('a.card[data-id]');
    if(!card||card.dataset.id===hoverId)return;
    hoverId=card.dataset.id;
    clearTimeout(hoverTimer);
    hoverTimer=setTimeout(()=>prefetchDetail(hoverId),120);
  });
  grid.addEventListener('mouseout',event=>{
    const card=event.target.closest&&event.target.closest('a.card[data-id]');
    if(card&&!card.contains(event.relatedTarget)){clearTimeout(hoverTimer);hoverId=null}
  });
  grid.addEventListener('touchstart',event=>{
    const card=event.target.closest&&event.target.closest('a.card[data-id]');
    if(card)prefetchDetail(card.dataset.id);
  },{passive:true});
})();
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
  if (state.filterTab === 'favorites' && !state.rows.length) {
    $('grid').innerHTML = `
      <div class="empty empty-favorites">
        <div class="empty-fav-icon">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#e53935" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </div>
        <h3>Chưa có bất động sản nào được lưu</h3>
        <p>Bấm vào biểu tượng trái tim trên các căn nhà bạn ưng ý để lưu lại danh sách quan tâm và nhận tư vấn nhanh qua Zalo bất cứ lúc nào.</p>
        <button type="button" class="btn-explore-warehouse" id="btnExploreWarehouse">
          Khám phá kho nhà ngay
        </button>
      </div>
    `;
    const exploreBtn = $('btnExploreWarehouse');
    if (exploreBtn) {
      exploreBtn.onclick = () => {
        const allTab = document.querySelector('.quick-tab[data-filter="all"]');
        if (allTab) allTab.click();
      };
    }
    updateBulkBar();
    updateFavoritesBanner();
    return;
  }
  if(!state.rows.length){$('grid').innerHTML='<div class="empty">Không tìm thấy hồ sơ phù hợp.</div>';updateBulkBar();updateFavoritesBanner();return}
  $('grid').innerHTML=state.rows.map((row,index)=>{
    const isFeatured = row.status === 'featured' || Boolean(row.is_featured);
    const isRented = row.status === 'rented' || Boolean(row.is_rented);
    const isFav = favoriteStore.has(row.property_id);
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
    const { area: cardArea, dimensions: cardDim } = resolveAreaAndDimensions(row);
    const primarySpec = cardDim || cardArea;
    if(primarySpec){
      specs.push(`<span class="spec-tag" title="Kích thước / Diện tích"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.7"/></svg>${escapeHtml(primarySpec)}</span>`);
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

    const favoriteBtnHtml = `
      <button type="button" class="card-favorite-btn ${isFav ? 'is-favorited' : ''}" data-fav-id="${escapeHtml(row.property_id)}" aria-label="${isFav ? 'Bỏ lưu căn này' : 'Lưu vào danh sách quan tâm'}" title="${isFav ? 'Bỏ lưu' : 'Lưu tin quan tâm'}">
        <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      </button>
    `;

    return`<a class="card ${isFeatured?'is-featured':''} ${isRented?'is-rented':''} ${row.status==='archived'?'archived-card':''} ${state.selectedIds.has(row.property_id)?'is-selected':''}" href="${escapeHtml(propertyPath(row))}" data-id="${escapeHtml(row.property_id)}" aria-label="Xem ${escapeHtml(displayAddress)}">
      <div class="photo ${!image?'no-photo':''}">
        ${image?`<img ${cardImageAttrs(images[0]?.public_url,index)} referrerpolicy="no-referrer" alt="${escapeHtml(imgAlt)}" title="${escapeHtml(imgAlt)}" onerror="handleCardImgError(this)">`:`
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
        ${favoriteBtnHtml}
      </div>
    </a>`;
  }).join('');

  let isTouchDevice = false;

  document.querySelectorAll('.card-favorite-btn').forEach(btn => {
    btn.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favId;
      const isSaved = favoriteStore.toggle(id);
      if (isSaved) {
        showToast('❤️ Đã lưu căn nhà vào danh sách quan tâm!');
        try { if (navigator.vibrate) navigator.vibrate(35); } catch (_) {}
      } else {
        showToast('Đã bỏ lưu khỏi danh sách quan tâm.');
        if (state.filterTab === 'favorites') {
          load();
        }
      }
    };
  });

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
      if(event.target.closest('.card-favorite-btn')){
        event.preventDefault();
        event.stopPropagation();
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
  updateFavoritesBanner();
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
  if(isAdmin||state.adminUnlocked||state.authRole==='ctv'||state.canViewFullAddress)return output;
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

function extractClientPriceNumber(priceText) {
  if (!priceText) return null;
  const clean = String(priceText).toLowerCase().replace(',', '.');
  const billionMatch = clean.match(/([\d.]+)\s*(?:ty|tỷ)/i);
  if (billionMatch) return parseFloat(billionMatch[1]) * 1000000000;
  const millionMatch = clean.match(/([\d.]+)\s*(?:trieu|triệu|tr)/i);
  if (millionMatch) return parseFloat(millionMatch[1]) * 1000000;
  const numberOnly = clean.replace(/[^\d.]/g, '');
  const num = parseFloat(numberOnly);
  return Number.isNaN(num) ? null : num;
}

function normalizeClientStreet(street) {
  return String(street || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/^(?:duong|pho|hem|ngo)\s+/i, '')
    .trim();
}

function findClientSimilarProperties(target, allRows) {
  if (!Array.isArray(allRows) || allRows.length === 0) return [];
  const targetStreet = normalizeClientStreet(target.street);
  const targetWard = String(target.ward || '').trim().toLowerCase();
  const targetDist = String(target.district || '').trim().toLowerCase();
  const targetPrice = extractClientPriceNumber(target.price_text);
  const targetType = String(target.property_type || '').trim().toLowerCase();

  const scored = allRows
    .filter(c => c && c.property_id !== target.property_id && c.status !== 'archived')
    .map(c => {
      let score = 0;
      let badge = '';

      const cStreet = normalizeClientStreet(c.street);
      const cWard = String(c.ward || '').trim().toLowerCase();
      const cDist = String(c.district || '').trim().toLowerCase();
      const cPrice = extractClientPriceNumber(c.price_text);
      const cType = String(c.property_type || '').trim().toLowerCase();

      if (targetStreet && cStreet && (targetStreet === cStreet || targetStreet.includes(cStreet) || cStreet.includes(targetStreet))) {
        score += 60;
        badge = 'Cùng tuyến đường';
      } else if (targetWard && cWard && targetDist === cDist && (targetWard === cWard || targetWard.includes(cWard) || cWard.includes(targetWard))) {
        score += 40;
        badge = `Cùng ${target.ward || 'phường'}`;
      } else if (targetDist && cDist && targetDist === cDist) {
        score += 20;
        badge = c.district || 'Cùng khu vực';
      }

      if (targetPrice && cPrice) {
        const ratio = Math.abs(cPrice - targetPrice) / targetPrice;
        if (ratio <= 0.20) score += 25;
        else if (ratio <= 0.40) score += 15;
      }

      if (targetType && cType && targetType === cType) {
        score += 10;
      }

      const imgItem = (c.property_images || []).sort((a, b) => a.position - b.position)[0];
      const thumbnail = imgItem ? (imgItem.public_url || imgItem.source_url) : null;

      return {
        property_id: c.property_id,
        address: c.address || c.property_id,
        street: c.street,
        ward: c.ward,
        district: c.district,
        price_text: c.price_text || 'Thương lượng',
        dimensions: c.dimensions || c.area_text,
        area_text: c.area_text,
        property_type: c.property_type,
        bedrooms: c.bedrooms,
        bathrooms: c.bathrooms,
        structure: c.structure,
        status: c.status,
        is_rented: Boolean(c.is_rented || c.status === 'rented'),
        thumbnail,
        badge: badge || c.district || 'Gần đây',
        score
      };
    });

  return scored.sort((a, b) => b.score - a.score).filter(s => s.score > 0);
}

function renderSimilarPropertiesHtml(similarList) {
  if (!Array.isArray(similarList) || similarList.length === 0) return '';

  const cardsHtml = similarList.map(item => {
    const rawThumb = item.thumbnail || (item.property_images?.[0]?.public_url) || (item.property_images?.[0]?.source_url);
    const thumb = rawThumb ? driveImage(rawThumb, 400) : '';
    const dispAddr = formatPublicAddress(item, state.adminUnlocked);
    const price = item.price_text || 'Liên hệ';
    const specs = [item.dimensions || item.area_text, item.structure, item.bedrooms ? `${item.bedrooms} PN` : ''].filter(Boolean).join(' · ');
    const loc = [item.street, item.ward, item.district].filter(Boolean).join(' · ');
    const badgeText = item.badge || item.district || 'Gần đây';

    return `
      <article class="similar-card" data-similar-id="${escapeHtml(item.property_id)}" title="Xem chi tiết: ${escapeHtml(dispAddr)}">
        <div class="similar-card-thumb ${!thumb ? 'no-photo' : ''}">
          ${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(dispAddr)}" onerror="this.parentElement.classList.add('no-photo');this.remove();">` : ''}
          <span class="similar-card-badge">${escapeHtml(badgeText)}</span>
          ${item.is_rented ? '<span class="similar-rented-tag">Đã thuê</span>' : ''}
        </div>
        <div class="similar-card-info">
          <div class="similar-card-price">${escapeHtml(price)}</div>
          <h4 class="similar-card-title">${escapeHtml(dispAddr)}</h4>
          <div class="similar-card-loc">${escapeHtml(loc)}</div>
          ${specs ? `<div class="similar-card-specs">${escapeHtml(specs)}</div>` : ''}
        </div>
      </article>
    `;
  }).join('');

  return `
    <section class="similar-properties-section" id="similarPropertiesSection">
      <div class="similar-section-header">
        <div class="similar-header-title">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <h3>BĐS tương tự cùng khu vực</h3>
        </div>
        <span class="similar-header-count">${similarList.length} căn phù hợp</span>
      </div>
      <div class="similar-carousel" id="similarCarousel">
        ${cardsHtml}
      </div>
    </section>
  `;
}

function resolveAreaAndDimensions(p) {
  if (!p) return { area: null, dimensions: null };
  const rawArea = p.area_text || p.data_json?.property?.area || null;
  const rawDim = p.dimensions || p.data_json?.property?.dimensions || null;

  // Format dimensions (e.g. "5x15" -> "5x15m")
  let dimFormatted = rawDim ? String(rawDim).trim() : null;
  if (dimFormatted && /^(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)$/.test(dimFormatted)) {
    dimFormatted = dimFormatted.replace(/\s+/g, '') + 'm';
  }

  // Calculate area from dimensions if available (e.g. 5x15 -> 75 m²)
  let calculatedArea = null;
  const dimSource = rawDim || rawArea;
  if (dimSource) {
    const m = String(dimSource).match(/(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)/);
    if (m) {
      const w = parseFloat(m[1].replace(',', '.'));
      const l = parseFloat(m[2].replace(',', '.'));
      if (w > 0 && l > 0) {
        const areaVal = Math.round(w * l * 10) / 10;
        calculatedArea = `${areaVal} m²`;
      }
    }
  }

  // Determine display area
  let areaFormatted = null;
  if (rawArea) {
    const areaStr = String(rawArea).trim();
    // If rawArea is just dimensions like "5x15"
    if (/^(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)(?:m)?$/i.test(areaStr)) {
      if (!dimFormatted) {
        dimFormatted = areaStr.replace(/\s+/g, '');
        if (!dimFormatted.endsWith('m')) dimFormatted += 'm';
      }
      areaFormatted = calculatedArea || null;
    } else if (/\d+\s*(?:m2|m²)/i.test(areaStr)) {
      areaFormatted = areaStr.replace(/m2/i, 'm²');
    } else if (/^\d+(?:[.,]\d+)?$/.test(areaStr)) {
      areaFormatted = `${areaStr} m²`;
    } else {
      areaFormatted = areaStr;
    }
  } else if (calculatedArea) {
    areaFormatted = calculatedArea;
  }

  // Anti-duplication check: if area and dim string are identical, suppress duplicate
  if (areaFormatted && dimFormatted && areaFormatted.toLowerCase().replace(/[\s.m²]/g, '') === dimFormatted.toLowerCase().replace(/[\s.m]/g, '')) {
    areaFormatted = calculatedArea && calculatedArea !== dimFormatted ? calculatedArea : null;
  }

  return {
    area: areaFormatted,
    dimensions: dimFormatted
  };
}

async function openDetail(id,seoPath=''){
  const dialog=$('detail');state.currentPropertyId=id;$('detailId').textContent=id;
  document.body.classList.add('detail-modal-open');
  const floatingWidget = $('floatingContactWidget');
  if (floatingWidget) floatingWidget.classList.remove('active');
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
    // Dùng dữ liệu đã tải trước khi rê chuột/chạm (nếu có), rồi ghi lượt xem ngầm
    let detailData=await takePrefetchedDetail(id);
    if(detailData&&detailData.property){
      api('/api/property?id='+encodeURIComponent(id),{},0).catch(()=>{});
    }else{
      detailData=await api('/api/property?id='+encodeURIComponent(id));
    }
    const {property:p, similar:serverSimilar=[]}=detailData;
    let similarList = Array.isArray(serverSimilar) && serverSimilar.length > 0 ? serverSimilar : [];
    if (similarList.length === 0 && Array.isArray(state.rows) && state.rows.length > 0) {
      similarList = findClientSimilarProperties(p, state.rows).slice(0, 5);
    }
    const similarHtml = renderSimilarPropertiesHtml(similarList);
    const nextPath=(seoPath||propertyPath(p))+(window.location.search||'');history.pushState({id},'',nextPath);
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
    const isCtv = state.authRole === 'ctv';
    let phoneCellContent = '—';
    if (state.adminUnlocked) {
      phoneCellContent = customerPhone
        ? `<a href="tel:${escapeHtml(phoneHref(customerPhone))}" class="phone-link-call" title="Bấm để gọi số khách / chủ nhà">${escapeHtml(customerPhone)}</a>`
        : '—';
    } else if (isCtv) {
      phoneCellContent = customerPhone
        ? `<span class="phone-ctv-masked" title="Tài khoản Cộng tác viên được xem trọn vẹn địa chỉ nhà nhưng được bảo mật số điện thoại">${escapeHtml(maskPhone(customerPhone))}<small class="phone-ctv-badge">Quyền CTV: Ẩn SĐT</small></span>`
        : '—';
    } else {
      phoneCellContent = customerPhone
        ? `<button type="button" class="phone-link-unlock" id="unlockPhoneInline" title="Bấm để nhập mã truy cập xem SĐT">${escapeHtml(maskPhone(customerPhone))}</button>`
        : '—';
    }
    const displayRawText=maskDescriptionText(p.raw_text||p.notes||'Chưa có nội dung mô tả.',p.address,p.street,state.adminUnlocked);
    const propNameAlt=`${p.property_type||'Nhà'} ${displayAddress}`;
    const thumbsHtml=images.map((src,index)=>`<img class="${index===0?'active':''}" referrerpolicy="no-referrer" src="${escapeHtml(src)}" alt="${escapeHtml(propNameAlt)} - Ảnh ${index+1}" onerror="this.style.display='none';">`).join('')+
      (state.adminUnlocked?`<label class="admin-thumb-add" for="adminQuickUpload" title="Bổ sung hình ảnh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></label><input id="adminQuickUpload" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden style="display:none!important">`:'');
    const displayBedrooms = p.data_json?.property?.bedrooms || (p.bedrooms ? `${p.bedrooms} PN` : null);
    const displayBathrooms = p.data_json?.property?.bathrooms || (p.bathrooms ? `${p.bathrooms} WC` : null);
    const { area: displayArea, dimensions: displayDimensions } = resolveAreaAndDimensions(p);
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
      ['Kích thước', displayDimensions],
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

    const isFav = favoriteStore.has(p.property_id);
    // Đã bỏ nút "Tải ảnh" và "Tải cả bộ" khỏi giao diện chi tiết theo yêu cầu (04/10/2026)
    const downloadBtnsHtml = '';

    const quickActionsHtml = `
      <div class="property-quick-actions">
        <button type="button" class="action-chip share-chip" id="actionShareBtn" title="Chia sẻ căn nhà này">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          <span>Chia sẻ</span>
        </button>
        <button type="button" class="action-chip fav-chip ${isFav ? 'is-favorited' : ''}" id="actionFavBtn" data-fav-id="${escapeHtml(p.property_id)}" title="${isFav ? 'Bỏ lưu căn này' : 'Lưu vào danh sách quan tâm'}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="${isFav ? '#dc2626' : 'none'}" stroke="${isFav ? '#dc2626' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span>${isFav ? 'Đã lưu' : 'Lưu tin'}</span>
        </button>
        ${downloadBtnsHtml}
        ${state.adminUnlocked ? `
        <button type="button" class="action-chip fb-chip" id="actionFbBtn" title="Đăng lên Facebook Studio">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          <span>Đăng Facebook</span>
        </button>
        ` : ''}
      </div>
    `;

    $('detailBody').innerHTML=`<div><div class="gallery-main ${!images[0]?'no-photo':''}">${images[0]?`<img id="mainImage" referrerpolicy="no-referrer" src="${escapeHtml(images[0])}" alt="${escapeHtml(propNameAlt)}" onerror="handleDetailImgError(this)">`:`<div class="placeholder-watermark watermark-detail"><img src="/assets/brand/fourland-logo.png" alt="Fourland" class="watermark-logo"><span class="watermark-text">Hình ảnh đang cập nhật</span></div>`}${galleryNavHtml}</div><div class="thumbs">${thumbsHtml}</div></div><div><section class="info-panel"><div class="price">${escapeHtml(p.price_text||'Liên hệ')}</div><h2>${escapeHtml(displayAddress)}</h2><div class="meta">${escapeHtml([p.street,p.ward,p.district].filter(Boolean).join(' · '))}</div>${quickActionsHtml}<div class="info-grid">${infoGridHtml}</div></section><section class="content-panel"><h3>Nội dung nhà</h3><p>${escapeHtml(displayRawText)}</p></section>${state.adminUnlocked?adminToolsHtml(p):''}<section class="direct-contact"><div><span>Hotline hỗ trợ Fourland</span><strong>${escapeHtml(COMPANY_HOTLINE)}</strong></div><a href="tel:${escapeHtml(phoneHref(COMPANY_HOTLINE))}" aria-label="Gọi Hotline Fourland"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 9.6 7c.35.5.28 1.18-.16 1.62l-1.3 1.3a14.5 14.5 0 0 0 5.94 5.94l1.3-1.3c.44-.44 1.12-.51 1.62-.16l3.5 2.4c.55.38.72 1.11.39 1.69l-1 1.75c-.34.59-.98.95-1.66.93C10.1 20.95 3.05 13.9 2.83 5.77c-.02-.68.34-1.32.93-1.66l1.75-1c.58-.33 1.31-.16 1.69.39Z"/></svg>Gọi ngay</a></section></div>${similarHtml}`;

    // Event listener cho các thẻ gợi ý BĐS tương tự
    document.querySelectorAll('.similar-card').forEach(card => {
      card.onclick = (e) => {
        e.preventDefault();
        const propId = card.dataset.similarId;
        if (propId) {
          openDetail(propId);
          const dialog = $('detail');
          if (dialog) dialog.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
    });
    
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

    const actionFav=$('actionFavBtn');
    if(actionFav){
      actionFav.onclick=()=>{
        const id=actionFav.dataset.favId;
        const isSaved=favoriteStore.toggle(id);
        if(isSaved){
          showToast('❤️ Đã lưu căn nhà vào danh sách quan tâm!');
          try { if (navigator.vibrate) navigator.vibrate(35); } catch (_) {}
        }else{
          showToast('Đã bỏ lưu khỏi danh sách quan tâm.');
        }
      };
    }

    const actionDownload = $('actionDownloadBtn');
    if (actionDownload) {
      actionDownload.onclick = () => {
        const currentUrl = images[currentImgIdx] || images[0];
        if (!currentUrl) return;
        const cleanId = (p.property_id || 'BDS').replace(/[^\w-]/g, '_');
        const cleanAddr = slugify(p.address || p.street || 'nha').slice(0, 30);
        const filename = `${cleanId}_${cleanAddr}_anh_${currentImgIdx + 1}.jpg`;
        showToast(`📥 Đang tải ảnh ${currentImgIdx + 1} về máy...`, 2000);
        triggerImageDownload(currentUrl, filename);
      };
    }

    const actionDownloadAll = $('actionDownloadAllBtn');
    if (actionDownloadAll) {
      actionDownloadAll.onclick = async () => {
        if (!images.length) return;
        const count = images.length;
        showToast(`📥 Bắt đầu tải trọn bộ ${count} ảnh...`, 2500);
        actionDownloadAll.disabled = true;
        const cleanId = (p.property_id || 'BDS').replace(/[^\w-]/g, '_');
        const cleanAddr = slugify(p.address || p.street || 'nha').slice(0, 30);
        for (let i = 0; i < count; i++) {
          const filename = `${cleanId}_${cleanAddr}_anh_${i + 1}.jpg`;
          triggerImageDownload(images[i], filename);
          if (i < count - 1) {
            await new Promise(r => setTimeout(r, 450));
          }
        }
        setTimeout(() => {
          actionDownloadAll.disabled = false;
          showToast(`✅ Đã gửi lệnh tải trọn bộ ${count} ảnh về máy!`, 3000);
        }, 800);
      };
    }

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
  deviceAuthStore.clearSession();
  try{await api('/api/admin-login',{method:'DELETE'})}catch(_){}
  setAdminState(false, null);
  showToast('🔒 Đã thoát quyền truy cập trên thiết bị này');
}
function setAdminState(unlocked, role = null, options = {}){
  const prevRole = state.authRole;
  if (role) {
    state.authRole = role;
  } else if (unlocked) {
    state.authRole = 'admin';
  } else {
    state.authRole = null;
  }
  state.adminUnlocked = state.authRole === 'admin';
  state.ctvUnlocked = state.authRole === 'ctv';
  state.canViewFullAddress = state.adminUnlocked || state.ctvUnlocked;

  if (document.body) {
    document.body.classList.toggle('role-unlocked', Boolean(state.canViewFullAddress));
    document.body.classList.toggle('role-ctv', Boolean(state.ctvUnlocked));
    document.body.classList.toggle('role-admin', Boolean(state.adminUnlocked));
  }

  if(!state.adminUnlocked){
    state.selectedIds.clear();
  }
  const profile=document.querySelector('.profile'),toggle=$('archivedToggle');
  if (profile) {
    profile.classList.toggle('admin-active',state.adminUnlocked);
    profile.classList.toggle('ctv-active',state.ctvUnlocked);

    if (state.adminUnlocked) {
      profile.setAttribute('aria-label','Đang là Quản trị viên (Bấm để thoát Admin)');
      profile.title='Đang là Quản trị viên (Đã lưu trên máy này - Bấm để thoát)';
    } else if (state.ctvUnlocked) {
      profile.setAttribute('aria-label','Đang là Cộng tác viên (Bấm để thoát CTV)');
      profile.title='Đang là Cộng tác viên (Xem trọn vẹn địa chỉ - Đã lưu trên máy này)';
    } else {
      profile.setAttribute('aria-label','Mở quyền truy cập');
      profile.title='Mở quyền truy cập (Admin / CTV)';
    }
  }

  if (toggle) {
    toggle.hidden=!state.adminUnlocked;
    if(!state.adminUnlocked&&state.viewArchived){state.viewArchived=false;toggle.classList.remove('active');load()}
  }
  if (!options.uiOnly) {
    const roleChanged = prevRole !== state.authRole;
    if((roleChanged || options.forceDetailRefresh) && state.currentPropertyId && $('detail')?.open){
      openDetail(state.currentPropertyId);
    }
    if (state.hasRenderedList || state.rows.length > 0) {
      render();
    }
  }
  updateBulkBar();
}
async function checkAdminSession(){
  const savedSession=deviceAuthStore.getSession();
  if(savedSession&&savedSession.role){
    setAdminState(true, savedSession.role, { uiOnly: !state.hasRenderedList });
  }
  try{
    const deviceId=deviceAuthStore.getDeviceId();
    const result=await api('/api/admin-login?deviceId='+encodeURIComponent(deviceId));
    if(result&&result.authenticated&&result.role){
      deviceAuthStore.saveSession({
        role:result.role,
        token:result.token||deviceAuthStore.getToken(),
        deviceId:result.deviceId||deviceId,
        expiresAt:result.expiresAt
      });
      setAdminState(true, result.role);
    }else if(result&&result.authenticated===false){
      deviceAuthStore.clearSession();
      setAdminState(false, null);
    }
  }catch{
    if(savedSession&&savedSession.role){
      setAdminState(true, savedSession.role);
    }else{
      setAdminState(false, null);
    }
  }
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
  if(state.ctvUnlocked){
    if(confirm('Bạn đang ở chế độ Cộng tác viên (Xem trọn vẹn địa chỉ). Bạn có muốn THOÁT quyền CTV không?')){
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
$('adminAccessForm').onsubmit=async event=>{
  event.preventDefault();
  const status=$('adminAccessStatus'),button=event.currentTarget.querySelector('.access-submit');
  button.disabled=true;
  button.textContent='Đang kiểm tra…';
  status.className='access-status';
  status.textContent='';
  try{
    const deviceId=deviceAuthStore.getDeviceId();
    const result=await api('/api/admin-login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code:$('adminCode').value.trim(),deviceId})
    });
    deviceAuthStore.saveSession({
      role:result.role,
      token:result.token,
      deviceId:result.deviceId||deviceId,
      expiresAt:result.expiresAt
    });
    setAdminState(true, result.role, { forceDetailRefresh: true });
    status.className='access-status success-text';
    status.textContent=result.message || (result.role==='ctv'?'Đã mở quyền Cộng tác viên (Đã lưu trên thiết bị này).':'Đã mở toàn quyền Quản trị viên (Đã lưu trên thiết bị này).');
    setTimeout(()=>{
      $('adminAccess').close();
      if(state.currentPropertyId&&$('detail').open)openDetail(state.currentPropertyId);
    },300);
  }catch(error){
    status.className='access-status error-text';
    status.textContent=error.message;
    $('adminCode').select();
  }finally{
    button.disabled=false;
    button.textContent='Mở quyền truy cập';
  }
};
$('archivedToggle').onclick=()=>{state.viewArchived=!state.viewArchived;state.page=1;state.selectedIds.clear();$('archivedToggle').classList.toggle('active',state.viewArchived);$('archivedToggle').textContent=state.viewArchived?'Quay lại kho nhà':'Hồ sơ đã ẩn';load();updateBulkBar()};
let searchTimer;
const scheduleLoad = (delay = 250) => {
  clearTimeout(searchTimer);
  state.page = 1;
  searchTimer = setTimeout(load, delay);
};

const searchInputEl = $('q');
const searchClearBtn = $('searchClearBtn');

function updateSearchClearVisibility() {
  if (searchClearBtn && searchInputEl) {
    searchClearBtn.hidden = !searchInputEl.value.trim();
  }
}

if (searchInputEl) {
  searchInputEl.addEventListener('input', () => {
    updateSearchClearVisibility();
    scheduleLoad(320);
  });
}

if (searchClearBtn) {
  searchClearBtn.onclick = () => {
    if (searchInputEl) {
      searchInputEl.value = '';
      searchInputEl.focus();
    }
    searchClearBtn.hidden = true;
    if (window.location.hash && window.location.hash.startsWith('#q=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    clearTimeout(searchTimer);
    state.page = 1;
    load();
    showToast('✓ Đã xóa từ khóa tìm kiếm', 1600);
  };
}

['district', 'ward', 'street', 'type', 'timeRange', 'rentalStatus', 'sortBy', 'minPrice', 'maxPrice', 'minArea', 'maxArea'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('change', () => scheduleLoad(0));
});

$('searchForm').onsubmit = event => {
  event.preventDefault();
  scheduleLoad(0);
};

function resetAllFilters(event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  if (searchInputEl) searchInputEl.value = '';
  if (searchClearBtn) searchClearBtn.hidden = true;

  selectedDistricts.clear();
  syncDistrictInputAndLabel(false);
  const districtPopover = $('districtPopover');
  const districtTrigger = $('districtTrigger');
  const districtField = $('districtMultiField');
  if (districtPopover) districtPopover.hidden = true;
  if (districtTrigger) districtTrigger.setAttribute('aria-expanded', 'false');
  if (districtField) districtField.classList.remove('is-open');

  ['district', 'ward', 'street', 'type', 'rentalStatus', 'timeRange'].forEach(id => {
    const el = $(id);
    if (el) {
      el.selectedIndex = 0;
      el.value = '';
      if (el.options && el.options.length > 0) {
        for (let i = 0; i < el.options.length; i++) {
          el.options[i].selected = (i === 0);
        }
      }
    }
  });

  const sortEl = $('sortBy');
  if (sortEl) {
    sortEl.value = 'newest';
    sortEl.selectedIndex = 0;
    if (sortEl.options && sortEl.options.length > 0) {
      for (let i = 0; i < sortEl.options.length; i++) {
        sortEl.options[i].selected = (sortEl.options[i].value === 'newest' || i === 0);
      }
    }
  }

  ['minPrice', 'maxPrice', 'minArea', 'maxArea'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });

  state.filterTab = 'all';
  document.querySelectorAll('.quick-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === 'all');
  });

  if (window.location.hash && window.location.hash.startsWith('#q=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  const filtersEl = $('filters');
  const formEl = $('searchForm');
  const filterToggleEl = $('filterToggle');
  if (filtersEl && filtersEl.classList.contains('open')) {
    filtersEl.classList.remove('open');
    if (formEl) formEl.classList.remove('filter-open');
    if (filterToggleEl) filterToggleEl.setAttribute('aria-expanded', 'false');
  }

  clearTimeout(searchTimer);
  state.page = 1;
  load();

  showToast('✓ Đã xóa toàn bộ bộ lọc', 2000);
}

const resetBtn = $('reset');
if (resetBtn) {
  resetBtn.onclick = resetAllFilters;
  resetBtn.addEventListener('click', resetAllFilters);
}

const searchFormElem = $('searchForm');
if (searchFormElem) {
  searchFormElem.addEventListener('reset', (e) => {
    e.preventDefault();
    resetAllFilters(e);
  });
}

$('prev').onclick = () => {
  if (state.page > 1) {
    state.page--;
    load();
    scrollTo({ top: 0, behavior: 'smooth' });
  }
};

$('next').onclick = () => {
  if (state.page * state.pageSize < state.total) {
    state.page++;
    load();
    scrollTo({ top: 0, behavior: 'smooth' });
  }
};

$('filterToggle').onclick = () => {
  const open = $('filters').classList.toggle('open');
  $('searchForm').classList.toggle('filter-open', open);
  $('filterToggle').setAttribute('aria-expanded', open);
};

function closeDetailModal(){
  $('detail').close();
  document.body.classList.remove('detail-modal-open');
  state.currentPropertyId=null;
  document.title=DEFAULT_PAGE_TITLE;
  const script=$('propertyJsonLd');
  if(script)script.remove();
  history.pushState({},'','/');
}
$('closeDetail').onclick=closeDetailModal;
$('detail').onclick=event=>{if(event.target===$('detail'))closeDetailModal()};
$('detail').addEventListener('close',()=>document.body.classList.remove('detail-modal-open'));

// Floating Contact Speed Dial Widget
const floatingWidget = $('floatingContactWidget');
const floatingTrigger = $('floatingContactTrigger');
if (floatingWidget && floatingTrigger) {
  floatingTrigger.onclick = (e) => {
    e.stopPropagation();
    const isActive = floatingWidget.classList.toggle('active');
    floatingTrigger.setAttribute('aria-expanded', String(isActive));
  };
  document.addEventListener('click', (e) => {
    if (floatingWidget.classList.contains('active') && !floatingWidget.contains(e.target)) {
      floatingWidget.classList.remove('active');
      floatingTrigger.setAttribute('aria-expanded', 'false');
    }
  });
}

function handleSearchFromHash(){
  const hash=window.location.hash;
  if(hash){
    let rawHash = hash.replace(/^#/, '');
    if (rawHash.startsWith('q=')) rawHash = rawHash.slice(2);
    const decodedVal = decodeURIComponent(rawHash.replace(/\+/g, ' ')).trim();
    if (/^BDS-/i.test(decodedVal)) {
      setTimeout(() => openDetail(decodedVal, window.location.pathname), 50);
      return;
    }
    if(hash.startsWith('#q=')){
      const qValue=decodeURIComponent(hash.slice(3).replace(/\+/g,' '));
      $('q').value=qValue;
      updateSearchClearVisibility();
      state.page=1;
      load();
      const grid=$('grid');
      if(grid)grid.scrollIntoView({behavior:'smooth'});
    }
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

const topFavBtn = $('topFavBtn');
if (topFavBtn) {
  topFavBtn.onclick = () => {
    const tabFav = $('tabFavorites');
    if (tabFav) tabFav.click();
    const grid = $('grid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

updateFavoritesUI();
updateSearchClearVisibility();
if (state.authRole) setAdminState(true, state.authRole, { uiOnly: true });
loadFacets();
load();
checkAdminSession();

const pathSlug = window.location.pathname.startsWith('/bat-dong-san/') ? window.location.pathname.slice('/bat-dong-san/'.length) : '';
const markerIdx = pathSlug.lastIndexOf('--');
const extractedSlugId = markerIdx >= 0 ? pathSlug.slice(markerIdx + 2) : '';

let rawHash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
if (rawHash.startsWith('q=')) rawHash = rawHash.slice(2);
const decodedHash = decodeURIComponent(rawHash.replace(/\+/g, ' ')).trim();

const urlSearchParams = new URLSearchParams(window.location.search);
const urlSearchId = urlSearchParams.get('id') || urlSearchParams.get('bds');
const urlSearchFb = urlSearchParams.get('fb');
const initUrlId = extractedSlugId || urlSearchId || (/^BDS-/i.test(decodedHash) ? decodedHash : '');

if (initUrlId && /^BDS-/i.test(initUrlId)) {
  setTimeout(async () => {
    await openDetail(initUrlId, window.location.pathname);
    if (urlSearchFb) {
      fbPortalState.mode = urlSearchFb === 'group' ? 'group' : 'page';
      openFacebookStudio(initUrlId, false);
    }
  }, 150);
} else {
  handleSearchFromHash();
}

// ==========================================================================
// ==========================================================================
// PUBLIC PORTAL FACEBOOK STUDIO & COMPOSIO CLIENT
// ==========================================================================
const DEFAULT_SERVER50_TUNNEL_URL = 'https://drink-owners-prayer-partnerships.trycloudflare.com';
const DEFAULT_SERVER50_LAN_URL = 'http://192.168.1.50:8889';
const DEFAULT_LOCAL_ENGINE_URL = 'http://127.0.0.1:8788';

const fbPortalState = {
  propertyId: null,
  mode: 'page', // 'page' | 'group'
  tone: 'hot',
  content: '',
  variants: ['', '', '', ''],
  activeVariantIdx: 0,
  allImages: [],
  selectedImages: new Set(),
  selectedPageIds: new Set(['104363431784609']),
  selectedPageId: '104363431784609',
  pageName: 'FourLand',
  pages: [],
  // RevidAPI Social Group Rotation State (Server 50 Port 8889 / Local 8788)
  nodeMode: 'auto', // 'auto' | 'server50' | 'local'
  posterNode: {
    tunnelUrl: DEFAULT_SERVER50_TUNNEL_URL,
    lanUrl: DEFAULT_SERVER50_LAN_URL,
    localUrl: DEFAULT_LOCAL_ENGINE_URL
  },
  activeEngineUrl: DEFAULT_SERVER50_TUNNEL_URL,
  activeEngineLabel: 'Máy chủ 50 · Nhánh Fourland 24/7 (8889)',
  engineOnline: false,
  fbAccounts: [],
  selectedAccountId: '',
  selectedActAs: '',
  groups: [],
  groupApprovals: {},
  selectedGroups: new Map()
};

function resolveSpintaxPreview(text) {
  let out = String(text || '');
  let guard = 0;
  while (/\{[^{}]+\}/.test(out) && guard++ < 8) {
    out = out.replace(/\{([^{}]+)\}/g, (_, choices) => {
      const parts = choices.split('|').map(s => s.trim()).filter(Boolean);
      return parts[0] || '';
    });
  }
  return out;
}

function countPortalThreadsChars(str) {
  const s = String(str || '');
  return Math.max([...s].length, s.length);
}

function condensePortalThreadsText(rawText, maxChars = 465) {
  const expanded = resolveSpintaxPreview(rawText).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!expanded) return '';
  if (countPortalThreadsChars(expanded) <= maxChars) return expanded;

  const rawLines = expanded.split('\n').map(l => l.trim()).filter(Boolean);
  if (!rawLines.length) return '';

  let linkLine = '';
  let phoneLine = '';
  let priceLine = '';
  const bodyCandidates = [];
  const headline = rawLines[0].replace(/\s+/g, ' ');
  const headlineHasPrice = /\d+(?:[.,]\d+)?\s*(?:tỷ|triệu)/i.test(headline);

  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/^(?:✨|🌿|🤝)?\s*(?:Hỗ trợ tìm nhà|Đồng hành tìm nhà|Chào anh chị trong nhóm)/i.test(line)) continue;
    const urlMatch = line.match(/https?:\/\/[^\s)]+/i);
    if (urlMatch || /fourland\.vn/i.test(line)) {
      if (!linkLine) linkLine = `🌐 ${urlMatch ? urlMatch[0] : 'https://www.fourland.vn'}`;
      continue;
    }
    if (/(?:0|\+84)\d[\d.\s-]{7,11}/.test(line)) {
      if (!phoneLine) phoneLine = line.length <= 42 ? line : `📲 ${line.match(/(?:Ngọc[^:]*:\s*)?(?:0|\+84)\d[\d.\s-]{7,11}/i)?.[0] || line.slice(0, 36)}`;
      continue;
    }
    if (/^💰|^(?:▪️|•|🌿|👉)?\s*(?:Mức giá|Giá\s*(?:bán|thuê|chào|làm việc|mong muốn)?)\s*:/i.test(line)) {
      if (!priceLine) priceLine = line.replace(/\.$/, '');
      continue;
    }
    bodyCandidates.push({ index: i, text: line });
  }

  const tailParts = [(!headlineHasPrice && priceLine) ? priceLine : '', linkLine, phoneLine].filter(Boolean);
  const tailBlock = tailParts.length ? `\n\n${tailParts.join('\n')}` : '';
  const bodyBudget = Math.max(90, maxChars - countPortalThreadsChars(tailBlock));

  const scored = bodyCandidates.map(item => {
    let t = item.text;
    if (t.length > 95 && /\d/.test(t) && t.includes('. ')) {
      const firstSent = t.split('. ')[0].trim();
      if (firstSent.length >= 20) t = `${firstSent}.`;
    }
    let score = 1;
    if (/(?:diện tích|kích thước|khuôn đất|kết cấu|quy mô|phòng ngủ|\bpn\b|\bwc\b|\d+\s*[x×*]\s*\d+|\d+\s*m²|trệt|lầu|tầng)/i.test(t)) score = 4;
    else if (/(?:pháp lý|sổ hồng|hẻm xe hơi|mặt tiền|thang máy|nội thất|sân thượng|gara)/i.test(t)) score = 3;
    else if (/(?:đường|phường|quận|vị trí|đang bán|cho thuê)/i.test(t)) score = 2;
    return { ...item, text: t, score };
  });

  let headOut = headline;
  if (countPortalThreadsChars(headOut) > bodyBudget) {
    headOut = [...headOut].slice(0, Math.max(40, bodyBudget - 1)).join('').trim() + '…';
  }
  const picked = new Set();
  let curLen = countPortalThreadsChars(headOut);
  [...scored].sort((a, b) => b.score - a.score || a.index - b.index).forEach(cand => {
    const sepLen = picked.size === 0 ? 2 : 1;
    if (curLen + sepLen + countPortalThreadsChars(cand.text) <= bodyBudget) {
      picked.add(cand.index);
      curLen += sepLen + countPortalThreadsChars(cand.text);
    }
  });
  const orderedBody = scored.filter(c => picked.has(c.index)).sort((a, b) => a.index - b.index).map(c => c.text);
  const mainText = orderedBody.length ? `${headOut}\n\n${orderedBody.join('\n')}` : headOut;
  let result = `${mainText}${tailBlock}`.trim();
  if (countPortalThreadsChars(result) > maxChars) {
    const allowedMain = Math.max(60, maxChars - countPortalThreadsChars(tailBlock) - 1);
    result = `${[...mainText].slice(0, allowedMain).join('').replace(/\s+\S*$/, '').trim()}…${tailBlock}`.trim();
  }
  return result;
}

function syncPortalThreadsEditorState() {
  const badge = $('fbThreadsCharBadge');
  const contentInput = $('fbPostContent');
  const previewText = $('fbPreviewText');
  if (fbPortalState.mode === 'group') {
    if (badge) badge.hidden = true;
    return;
  }
  const ids = Array.from(fbPortalState.selectedPageIds || []);
  const hasThreads = ids.some(id => String(id).startsWith('threads:'));
  const isThreadsOnly = ids.length === 1 && hasThreads;

  if (isThreadsOnly && !fbPortalState.isThreadsEditorActive) {
    if (fbPortalState.content) fbPortalState.fullContent = fbPortalState.content;
    const nextThreads = fbPortalState.threadsContent || condensePortalThreadsText(fbPortalState.fullContent || fbPortalState.content, 465);
    fbPortalState.threadsContent = nextThreads;
    fbPortalState.content = nextThreads;
    fbPortalState.isThreadsEditorActive = true;
    if (contentInput) contentInput.value = nextThreads;
    if (previewText) previewText.textContent = nextThreads;
  } else if (!isThreadsOnly && fbPortalState.isThreadsEditorActive) {
    if (fbPortalState.fullContent) fbPortalState.content = fbPortalState.fullContent;
    fbPortalState.isThreadsEditorActive = false;
    if (contentInput) contentInput.value = fbPortalState.content || '';
    if (previewText) previewText.textContent = fbPortalState.content || '';
  }

  if (badge) {
    if (isThreadsOnly) {
      const len = countPortalThreadsChars(fbPortalState.content || '');
      badge.hidden = false;
      badge.textContent = `Threads · ${len}/500`;
      badge.classList.toggle('is-over', len > 500);
    } else if (hasThreads) {
      badge.hidden = false;
      badge.textContent = 'Threads tự tối ưu <500 ký tự';
      badge.classList.remove('is-over');
    } else {
      badge.hidden = true;
    }
  }
}

async function revidEngineApi(method, path, body, baseUrl = fbPortalState.activeEngineUrl) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await res.text();
  let data = {};
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(data.error || `Engine HTTP ${res.status}`);
  return data;
}

async function resolveRevidEngineCandidates() {
  try {
    const nodeRes = await fetch('/api/admin/v1/facebook/poster-node').then(r => r.json());
    if (nodeRes?.ok && nodeRes.data) {
      fbPortalState.posterNode = { ...fbPortalState.posterNode, ...nodeRes.data };
    }
  } catch (_) {}
  const { tunnelUrl, lanUrl, localUrl } = fbPortalState.posterNode;
  const isHttpsPage = window.location.protocol === 'https:';
  const server50Candidates = [
    ...(tunnelUrl ? [{ url: tunnelUrl, label: 'Máy chủ 50 · Nhánh Fourland 24/7 (Cloud 8889)' }] : []),
    ...(!isHttpsPage && lanUrl ? [{ url: lanUrl, label: 'Máy chủ 50 · LAN (192.168.1.50:8889)' }] : [])
  ];
  const localCandidates = [
    { url: localUrl || DEFAULT_LOCAL_ENGINE_URL, label: 'Máy cá nhân (Local 8788)' }
  ];
  const mode = $('fbGroupNodeSelect')?.value || fbPortalState.nodeMode || 'auto';
  fbPortalState.nodeMode = mode;
  if (mode === 'server50') return server50Candidates;
  if (mode === 'local') return localCandidates;
  return [...server50Candidates, ...localCandidates];
}

function populatePortalActAsOptions(account) {
  const actSel = $('fbGroupActAsSelect');
  if (!actSel) return;
  const allAccounts = Array.isArray(fbPortalState.fbAccounts) && fbPortalState.fbAccounts.length
    ? fbPortalState.fbAccounts
    : (account ? [account] : []);
  if (!allAccounts.length) {
    actSel.innerHTML = '<option value="">Nick Facebook cá nhân</option>';
    fbPortalState.selectedActAs = '';
    return;
  }
  const activeAccId = fbPortalState.selectedAccountId || allAccounts[0].id;
  const opts = [];
  const seenPages = new Set();

  // 1. Liệt kê tất cả Nick Facebook cá nhân đã kết nối (Nguyễn Ngọc, Nguyễn Bích Ngọc...)
  for (const acc of allAccounts) {
    const isSelected = acc.id === activeAccId && !fbPortalState.selectedActAs;
    const gCount = acc.groupCount || (acc.groupsCache?.groups?.length) || 500;
    opts.push(
      `<option value="${escapeHtml(acc.id)}::" data-account-id="${escapeHtml(acc.id)}" data-act-as="" ${isSelected ? 'selected' : ''}>Cá nhân: ${escapeHtml(acc.profileName || acc.label)} (${gCount} nhóm)</option>`
    );
  }

  // 2. Liệt kê toàn bộ Fanpage (chống trùng theo ID/tên) gắn với tài khoản sở hữu
  for (const acc of allAccounts) {
    const pages = Array.isArray(acc.pages) && acc.pages.length ? acc.pages : [];
    for (const p of pages) {
      const pid = String(p.id || p.pageId || '').trim();
      const pName = String(p.name || '').trim();
      const nameKey = pName.toLowerCase();
      if (!pid || !pName || seenPages.has(pid) || seenPages.has(nameKey)) continue;
      seenPages.add(pid);
      seenPages.add(nameKey);
      const isSelected = String(fbPortalState.selectedActAs) === pid;
      opts.push(
        `<option value="${escapeHtml(acc.id)}::${escapeHtml(pid)}" data-account-id="${escapeHtml(acc.id)}" data-act-as="${escapeHtml(pid)}" ${isSelected ? 'selected' : ''}>Fanpage: ${escapeHtml(pName)}</option>`
      );
    }
  }

  actSel.innerHTML = opts.join('');
}

async function initRevidGroupEngine(forceGroups = false) {
  const dot = $('fbGroupEngineDot');
  const statusBadge = $('fbGroupStatusBadge');
  const statusEl = $('fbGroupEngineStatus');
  const accSel = $('fbGroupAccountSelect');
  const dashLink = $('fbGroupDashboardLink');
  const candidates = await resolveRevidEngineCandidates();

  let connectedSt = null;
  for (const cand of candidates) {
    try {
      const st = await revidEngineApi('GET', '/api/state', undefined, cand.url);
      fbPortalState.activeEngineUrl = cand.url;
      fbPortalState.activeEngineLabel = cand.label;
      connectedSt = st;
      break;
    } catch (_) {}
  }

  if (dashLink) dashLink.href = fbPortalState.activeEngineUrl || DEFAULT_SERVER50_TUNNEL_URL;

  if (connectedSt) {
    fbPortalState.engineOnline = true;
    const fbs = (connectedSt.accounts || []).filter(a => a.platform === 'facebook');
    fbPortalState.fbAccounts = fbs;
    if (dot) dot.className = fbs.length ? 'fb-mode-dot online' : 'fb-mode-dot warn';
    if (statusBadge) statusBadge.className = fbs.length ? 'fb-status-indicator online' : 'fb-status-indicator warn';
    if (statusEl) {
      statusEl.innerHTML = fbs.length
        ? `<b>${escapeHtml(fbPortalState.activeEngineLabel)}</b> · ${fbs.length} tài khoản sẵn sàng`
        : `<b>${escapeHtml(fbPortalState.activeEngineLabel)}</b> · Chưa có tài khoản Facebook`;
    }
    if (accSel) {
      if (!fbs.length) {
        accSel.innerHTML = '<option value="">Chưa có tài khoản Facebook</option>';
        populatePortalActAsOptions(null);
        const box = $('fbGroupListBox');
        if (box) box.innerHTML = `<div class="fb-group-empty">Chưa có tài khoản Facebook trong hệ thống.</div>`;
      } else {
        if (!fbPortalState.selectedAccountId || !fbs.some(a => a.id === fbPortalState.selectedAccountId)) {
          fbPortalState.selectedAccountId = fbs[0].id;
        }
        accSel.innerHTML = fbs.map(a => `<option value="${escapeHtml(a.id)}" ${a.id === fbPortalState.selectedAccountId ? 'selected' : ''}>${escapeHtml(a.profileName || a.label)}</option>`).join('');
        const currentAcc = fbs.find(a => a.id === fbPortalState.selectedAccountId) || fbs[0];
        if (!Array.isArray(currentAcc.pages) || !currentAcc.pages.length) {
          try {
            const dest = await revidEngineApi('GET', `/api/accounts/${encodeURIComponent(currentAcc.id)}/destinations?cached=1`);
            if (Array.isArray(dest?.pages) && dest.pages.length) currentAcc.pages = dest.pages;
          } catch (_) {}
        }
        populatePortalActAsOptions(currentAcc);
        await loadRevidAccountGroups(fbPortalState.selectedAccountId, forceGroups);
      }
    }
  } else {
    fbPortalState.engineOnline = false;
    if (dot) dot.className = 'fb-mode-dot offline';
    if (statusBadge) statusBadge.className = 'fb-status-indicator offline';
    if (statusEl) {
      statusEl.innerHTML = `Chưa kết nối được Máy chủ 50 (8889) hoặc Local (8788)`;
    }
    if (accSel) accSel.innerHTML = '<option value="">Mất kết nối máy chủ</option>';
    const box = $('fbGroupListBox');
    if (box) box.innerHTML = `<div class="fb-group-empty">Không kết nối được dịch vụ đăng nhóm trên <b>Máy chủ 50 (8889)</b> hoặc <b>Máy cá nhân (8788)</b>.</div>`;
  }
  updatePortalPublishButtonState();
}

async function loadRevidAccountGroups(accountId, fresh = false) {
  const box = $('fbGroupListBox');
  if (!accountId || !box) return;
  box.innerHTML = `<div class="fb-group-empty">Đang tải danh sách nhóm Facebook đã tham gia…</div>`;
  try {
    const actAs = fbPortalState.selectedActAs || '';
    const actParam = actAs ? `&actAs=${encodeURIComponent(actAs)}` : '';
    const base = `/api/accounts/${encodeURIComponent(accountId)}/groups`;
    let d = await revidEngineApi('GET', `${base}?cached=${fresh ? '0' : '1'}${actParam}`);
    if (fresh || !(d.groups || []).length) {
      d = await revidEngineApi('GET', `${base}?cached=0${actParam}`);
    }
    fbPortalState.groups = d.groups || [];
    fbPortalState.groupApprovals = await revidEngineApi('GET', `/api/mk/approvals/${encodeURIComponent(accountId)}`).catch(() => ({}));
    if (fbPortalState.selectedGroups.size === 0 && fbPortalState.groups.length > 0) {
      const bdsRe = /bất động sản|bds|nhà đất|nhà phố|cho thuê|mua bán nhà|căn hộ|mặt bằng|phòng trọ/i;
      const autoCandidates = fbPortalState.groups.filter(g => {
        const gid = String(g.id);
        return fbPortalState.groupApprovals?.[gid]?.approval !== 'required' && bdsRe.test(String(g.name || ''));
      });
      const pickPool = autoCandidates.length >= 3
        ? autoCandidates.slice(0, 15)
        : fbPortalState.groups.filter(g => fbPortalState.groupApprovals?.[String(g.id)]?.approval !== 'required').slice(0, 10);
      pickPool.forEach(g => fbPortalState.selectedGroups.set(String(g.id), { id: g.id, name: g.name }));
    }
    renderRevidGroupsList();
    updatePortalPreviewFromChannels();
  } catch (err) {
    box.innerHTML = `<div class="fb-group-empty">Không tải được danh sách nhóm: ${escapeHtml(err.message)}</div>`;
  }
}

function renderRevidGroupsList() {
  const box = $('fbGroupListBox');
  const countEl = $('fbGroupPickedCount');
  const q = ($('fbGroupSearchInput')?.value || '').trim().toLowerCase();
  if (!box) return;
  if (countEl) countEl.textContent = String(fbPortalState.selectedGroups.size);

  const groups = (fbPortalState.groups || []).filter(g => !q || String(g.name || '').toLowerCase().includes(q));
  if (!groups.length) {
    box.innerHTML = `<div class="fb-group-empty social-group-empty">${q ? 'Không có nhóm nào khớp từ khóa tìm kiếm.' : 'Tài khoản này chưa có nhóm nào. Bấm Tải lại để đồng bộ danh sách.'}</div>`;
    updateGroupRotationEta();
    updatePortalPublishButtonState();
    return;
  }

  box.innerHTML = groups.map(g => {
    const gid = String(g.id);
    const isChecked = fbPortalState.selectedGroups.has(gid);
    const appr = fbPortalState.groupApprovals?.[gid]?.approval;
    const badgeHtml = appr === 'required'
      ? `<span class="fb-grp-tag social-group-tag warn" title="Nhóm cần Quản trị viên duyệt bài">cần duyệt</span>`
      : appr === 'instant'
        ? `<span class="fb-grp-tag social-group-tag ok">đăng ngay</span>`
        : '';
    return `
      <label class="fb-group-item social-group-item ${isChecked ? 'checked' : ''}" data-gid="${escapeHtml(gid)}" title="${escapeHtml(g.name)}">
        <input type="checkbox" value="${escapeHtml(gid)}" ${isChecked ? 'checked' : ''}>
        ${g.picture ? `<img src="${escapeHtml(g.picture)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : `<span class="fb-grp-ph">G</span>`}
        <span class="fb-grp-name social-group-name">${escapeHtml(g.name)}</span>
        ${badgeHtml}
      </label>
    `;
  }).join('');

  box.querySelectorAll('.fb-group-item').forEach(row => {
    const cb = row.querySelector('input[type="checkbox"]');
    cb.onchange = () => {
      const gid = row.dataset.gid;
      const gObj = (fbPortalState.groups || []).find(x => String(x.id) === gid);
      if (cb.checked && gObj) {
        fbPortalState.selectedGroups.set(gid, { id: gObj.id, name: gObj.name });
      } else {
        fbPortalState.selectedGroups.delete(gid);
      }
      row.classList.toggle('checked', cb.checked);
      if (countEl) countEl.textContent = String(fbPortalState.selectedGroups.size);
      updateGroupRotationEta();
      updatePortalPublishButtonState();
      updatePortalPreviewFromChannels();
    };
  });

  updateGroupRotationEta();
  updatePortalPublishButtonState();
}

function resolveScheduleTimeInput(rawVal) {
  const val = String(rawVal || '').trim();
  if (!val) return { iso: '', label: 'Chạy ngay' };
  const timeMatch = val.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    let dayLabel = 'Hôm nay';
    if (target.getTime() <= now.getTime() - 60000) {
      target.setDate(target.getDate() + 1);
      dayLabel = 'Ngày mai';
    }
    const dd = String(target.getDate()).padStart(2, '0');
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    return {
      iso: target.toISOString(),
      label: `⏰ ${timeMatch[1].padStart(2, '0')}:${timeMatch[2]} · ${dayLabel} (${dd}/${mm})`
    };
  }
  const parsed = Date.parse(val);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return {
      iso: d.toISOString(),
      label: `⏰ ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${d.toLocaleDateString('vi-VN')}`
    };
  }
  return { iso: '', label: 'Chạy ngay' };
}

function updateGroupRotationEta() {
  const etaEl = $('fbGroupEtaText');
  const sched = resolveScheduleTimeInput($('fbGroupStartAt')?.value);
  const schedBtn = $('btnFbGroupSchedToggle');
  const advDetails = $('fbGroupAdvDetails');
  if (schedBtn) {
    schedBtn.classList.toggle('has-schedule', Boolean(sched.iso));
    schedBtn.classList.toggle('active', Boolean(advDetails?.open));
  }

  const gapMinEl = $('fbGroupGapMin');
  const gapMaxEl = $('fbGroupGapMax');
  if (gapMinEl && gapMaxEl && gapMinEl.dataset.userEdited !== '1' && gapMaxEl.dataset.userEdited !== '1') {
    gapMinEl.value = sched.iso ? '75' : '15';
    gapMaxEl.value = sched.iso ? '150' : '25';
  }

  updatePortalPublishButtonState();
  if (!etaEl) return;
  const n = fbPortalState.selectedGroups.size;
  const a = Number(gapMinEl?.value) || (sched.iso ? 75 : 15);
  const b = Math.max(a, Number(gapMaxEl?.value) || (sched.iso ? 150 : 25));
  const filledVars = (fbPortalState.variants || []).filter(v => String(v || '').trim()).length || 1;
  if (!n) {
    etaEl.textContent = 'Chọn ít nhất 1 nhóm để rải xoay vòng';
    return;
  }
  const perGroupExec = sched.iso ? 40 : 22;
  const mins = Math.max(1, Math.round((n * perGroupExec + (n - 1) * (a + b) / 2) / 60));
  etaEl.textContent = `Đã chọn ${n} nhóm · Xáo ảnh & Spin ${filledVars} góc · ${sched.iso ? `~${mins}p · ${sched.label}` : `Tăng tốc ~${mins}p`}`;
}

function syncPortalFbUrl(propertyId, fbMode) {
  try {
    const url = new URL(window.location.href);
    if (fbMode) {
      url.searchParams.set('fb', fbMode);
      if (!url.pathname.startsWith('/bat-dong-san/') && propertyId) {
        url.searchParams.set('id', propertyId);
      }
    } else {
      url.searchParams.delete('fb');
    }
    const newUrl = url.pathname + (url.search ? url.search : '');
    if (window.location.pathname + window.location.search !== newUrl) {
      history.replaceState(null, '', newUrl);
    }
  } catch (_) {}
}

function setFacebookPortalMode(mode) {
  fbPortalState.mode = mode === 'group' ? 'group' : 'page';
  if ($('facebookPostDialog')?.open && fbPortalState.propertyId) {
    syncPortalFbUrl(fbPortalState.propertyId, fbPortalState.mode);
  }
  const groupPicker = $('fbGroupPicker');
  if (fbPortalState.mode === 'group' && groupPicker && !groupPicker.hasAttribute('data-ready')) {
    groupPicker.open = !window.matchMedia('(max-width: 760px)').matches;
    groupPicker.setAttribute('data-ready', '');
  }
  const isGroup = fbPortalState.mode === 'group';
  document.querySelectorAll('[data-fb-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.fbMode === fbPortalState.mode);
    btn.setAttribute('aria-pressed', String(btn.dataset.fbMode === fbPortalState.mode));
  });
  const pageSec = $('fbPortalPageSection');
  const groupSec = $('fbPortalGroupSection');
  const varTabs = $('fbVariantTabs');
  const toneRow = $('fbToneChipsRow');
  const toneLabel = $('fbToneSectionLabel');
  if (pageSec) pageSec.hidden = isGroup;
  if (groupSec) groupSec.hidden = !isGroup;
  if (varTabs) varTabs.hidden = !isGroup;
  if (toneRow) toneRow.hidden = isGroup;
  if (toneLabel) {
    const labelSpan = toneLabel.querySelector('span');
    if (labelSpan) labelSpan.textContent = 'Nội dung';
  }

  const contentInput = $('fbPostContent');
  const previewText = $('fbPreviewText');
  if (isGroup) {
    if ($('fbThreadsCharBadge')) $('fbThreadsCharBadge').hidden = true;
    const activeText = fbPortalState.variants[fbPortalState.activeVariantIdx] || fbPortalState.fullContent || fbPortalState.content || '';
    if (contentInput) contentInput.value = activeText;
    if (previewText) previewText.textContent = resolveSpintaxPreview(activeText);
    initRevidGroupEngine(false);
  } else {
    if (contentInput) contentInput.value = fbPortalState.content || '';
    if (previewText) previewText.textContent = fbPortalState.content || '';
    syncPortalThreadsEditorState();
  }
  updatePortalPublishButtonState();
  updatePortalPreviewFromChannels();
}

function dedupePortalPages(rawPages = []) {
  const seenNames = new Set();
  const seenIds = new Set();
  const out = [];
  for (const p of rawPages) {
    if (!p) continue;
    const pid = String(p.pageId || p.id || '').trim();
    const s50 = String(p.server50PageId || '').trim();
    const nameKey = String(p.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!pid || !nameKey) continue;
    if (seenIds.has(pid) || (s50 && seenIds.has(s50)) || seenNames.has(nameKey)) continue;
    seenIds.add(pid);
    if (s50) seenIds.add(s50);
    seenNames.add(nameKey);
    out.push(p);
  }
  return out;
}

function renderFacebookPortalChannels() {
  const container = $('fbPortalChannelList');
  if (!container) return;
  const rawPages = Array.isArray(fbPortalState.pages) && fbPortalState.pages.length > 0
    ? fbPortalState.pages
    : [
        { pageId: '104363431784609', name: 'FourLand', isDefault: true },
        { pageId: '106656702112510', name: 'Ngọc Nhà Tốt', isDefault: false },
        { pageId: 'profile:acc_7d96c28078d8a956', name: 'FB · Nguyễn Ngọc', avatarUrl: 'https://graph.facebook.com/100023413875667/picture?type=large', isDefault: false },
        { pageId: 'profile:acc_4285d32cedffb51f', name: 'FB · Nguyễn Bích Ngọc', avatarUrl: 'https://graph.facebook.com/100004410069738/picture?type=large', isDefault: false },
        { pageId: '100063820399874', name: 'Vinhomes Green Paradise', isDefault: false },
        { pageId: '61560150341552', name: 'Alpha - Giải Pháp Không Gian Sáng Tạo', isDefault: false },
        { pageId: '61566534021649', name: 'AI Business Hub', isDefault: false },
        { pageId: 'threads:acc_f36e9f891e8afc27', name: 'Threads · @peter.digital_art', avatarUrl: '/assets/brand/threads-icon.svg', isDefault: false }
      ];
  const pages = dedupePortalPages(rawPages);
  fbPortalState.pages = pages;

  if (fbPortalState.selectedPageIds.size === 0 && pages.length > 0) {
    const defaultPage = pages.find(p => p.isDefault) || pages[0];
    fbPortalState.selectedPageIds.add(String(defaultPage.pageId));
    fbPortalState.selectedPageId = String(defaultPage.pageId);
    fbPortalState.pageName = defaultPage.name;
  }

  container.innerHTML = pages.map(p => {
    const pid = String(p.pageId);
    const isChecked = fbPortalState.selectedPageIds.has(pid);
    const avatarSrc = p.avatarUrl || `https://graph.facebook.com/${pid}/picture?type=large`;
    return `
      <label class="fb-portal-channel-card ${isChecked ? 'checked' : ''}" data-fb-channel-id="${escapeHtml(pid)}" title="${escapeHtml(p.name)}">
        <input type="checkbox" name="fbPortalChannel" value="${escapeHtml(pid)}" ${isChecked ? 'checked' : ''}>
        <img class="fb-portal-card-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(p.name)}" referrerpolicy="no-referrer" onerror="this.src='/assets/brand/fourland-icon-192.png'">
        <div class="fb-portal-card-info">
          <div class="fb-portal-card-name">
            <strong>${escapeHtml(p.name)}</strong>
          </div>
        </div>
        <span class="fb-portal-check-indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('.fb-portal-channel-card').forEach(card => {
    card.onclick = (e) => {
      e.preventDefault();
      const pid = card.dataset.fbChannelId;
      if (fbPortalState.selectedPageIds.has(pid)) {
        fbPortalState.selectedPageIds.delete(pid);
      } else {
        fbPortalState.selectedPageIds.add(pid);
      }
      card.classList.toggle('checked', fbPortalState.selectedPageIds.has(pid));
      const checkbox = card.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = fbPortalState.selectedPageIds.has(pid);
      syncPortalThreadsEditorState();
      updatePortalPublishButtonState();
      updatePortalPreviewFromChannels();
    };
  });

  syncPortalThreadsEditorState();
  updatePortalPublishButtonState();
  updatePortalPreviewFromChannels();
}

function updatePortalPublishButtonState() {
  const submitBtn = $('fbSubmitBtn');
  if (!submitBtn) return;
  const span = submitBtn.querySelector('span');
  const pageId = fbPortalState.selectedPageIds.values().next().value;
  const groupId = fbPortalState.selectedGroups.keys().next().value;
  const groups = fbPortalState.groups || [];
  const group = groupId ? groups.find(item => String(item.id) === groupId) : groups.find(item => item.picture);
  for (const [id, url] of [
    ['fbPageDestinationPhoto', /^\d+$/.test(pageId) ? `https://graph.facebook.com/${pageId}/picture?type=large` : ''],
    ['fbGroupDestinationPhoto', group?.picture || '']
  ]) {
    const photo = $(id);
    if (!photo || photo.getAttribute('src') === (url || null)) continue;
    photo.hidden = true;
    if (/^https?:\/\//i.test(url)) photo.src = url;
    else photo.removeAttribute('src');
  }

  if (fbPortalState.mode === 'group') {
    const gCount = fbPortalState.selectedGroups.size;
    const grpSched = resolveScheduleTimeInput($('fbGroupStartAt')?.value);
    if (!fbPortalState.engineOnline) {
      submitBtn.disabled = true;
      if (span) span.textContent = 'Chưa kết nối dịch vụ đăng bài';
    } else if (gCount === 0) {
      submitBtn.disabled = true;
      if (span) span.textContent = 'Chọn nhóm để đăng';
    } else {
      submitBtn.disabled = false;
      if (span) span.textContent = grpSched.iso ? `Hẹn lịch đăng vào ${gCount} nhóm` : `Đăng ngay vào ${gCount} nhóm`;
    }
    return;
  }

  const count = fbPortalState.selectedPageIds.size;
  const pageTimeVal = ($('fbPageStartAt')?.value || '').trim();
  const pageSched = resolveScheduleTimeInput(pageTimeVal);
  const shortTime = pageTimeVal ? ` · ${pageTimeVal}` : '';

  if (count === 0) {
    submitBtn.disabled = true;
    if (span) span.textContent = 'Vui lòng chọn ít nhất 1 Fanpage';
  } else if (count === 1) {
    submitBtn.disabled = false;
    const selectedPid = Array.from(fbPortalState.selectedPageIds)[0];
    const pageObj = (fbPortalState.pages || []).find(p => String(p.pageId) === selectedPid);
    const rawName = pageObj?.name || fbPortalState.pageName || 'FourLand';
    const pName = /^fanpage\b/i.test(rawName) ? 'FourLand' : rawName;
    const isNonPage = String(selectedPid).startsWith('threads:') || String(selectedPid).startsWith('profile:') || /^(threads|fb\s*·)/i.test(pName);
    if (span) span.textContent = pageSched.iso ? `Hẹn lịch ${pName}${shortTime}` : (isNonPage ? `Đăng lên ${pName}` : `Đăng lên Fanpage ${pName}`);
  } else {
    submitBtn.disabled = false;
    if (span) span.textContent = pageSched.iso ? `Hẹn lịch ${count} kênh${shortTime}` : `Đăng đồng thời lên ${count} kênh`;
  }

  const btnSelectAll = $('btnFbPortalSelectAll');
  if (btnSelectAll) {
    const total = (fbPortalState.pages || []).length || 1;
    if (btnSelectAll.type === 'checkbox') {
      btnSelectAll.checked = count === total && total > 0;
      btnSelectAll.indeterminate = count > 0 && count < total;
    } else {
      btnSelectAll.textContent = (count === total && total > 0) ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
    }
  }
}

function updatePortalPreviewFromChannels() {
  const titleEl = $('fbDialogTitle');
  const nameEl = $('fbMockName') || document.querySelector('.fb-mock-name strong');
  const avatarImg = $('fbMockAvatar') || document.querySelector('.fb-mock-avatar img');

  if (fbPortalState.mode === 'group') {
    const acc = (fbPortalState.fbAccounts || []).find(a => a.id === fbPortalState.selectedAccountId) || fbPortalState.fbAccounts?.[0];
    const actAsId = fbPortalState.selectedActAs || '';
    const actAsPage = actAsId && acc?.pages ? acc.pages.find(p => String(p.id) === String(actAsId)) : null;
    const firstGrp = Array.from(fbPortalState.selectedGroups.values())[0];
    const accLabel = actAsPage ? actAsPage.name : (acc ? (acc.profileName || acc.label) : 'Tài khoản Facebook');
    const actorPic = actAsPage?.picture || acc?.picture || '';
    if (nameEl) nameEl.textContent = firstGrp ? `${accLabel} ▸ ${firstGrp.name}` : accLabel;
    if (avatarImg && actorPic) {
      avatarImg.src = actorPic;
      avatarImg.style.display = 'block';
    }
    if (titleEl) {
      const gCount = fbPortalState.selectedGroups.size;
      titleEl.textContent = gCount > 0
        ? `Đăng vào ${gCount} nhóm Facebook`
        : 'Đăng nhóm Facebook';
    }
    return;
  }

  const selectedPid = Array.from(fbPortalState.selectedPageIds)[0];
  if (!selectedPid) return;
  const pageObj = (fbPortalState.pages || []).find(p => String(p.pageId) === selectedPid);
  const pName = pageObj?.name || 'Fanpage Facebook';
  fbPortalState.pageName = pName;
  fbPortalState.selectedPageId = selectedPid;

  if (avatarImg) {
    avatarImg.src = pageObj?.avatarUrl || `https://graph.facebook.com/${selectedPid}/picture?type=large`;
    avatarImg.alt = `Avatar ${pName}`;
    avatarImg.style.display = 'block';
  }
  if (nameEl) nameEl.textContent = pName;

  if (titleEl) {
    const count = fbPortalState.selectedPageIds.size;
    titleEl.textContent = count > 1 
      ? `Đăng bài đồng thời lên ${count} Fanpage Facebook`
      : `Đăng bài lên Fanpage ${pName}`;
  }
}

async function openFacebookStudio(propertyId, updateUrl = true) {
  fbPortalState.propertyId = propertyId;
  const dialog = $('facebookPostDialog');
  if (!dialog) return;
  if (updateUrl) syncPortalFbUrl(propertyId, fbPortalState.mode || 'page');

  const statusNote = $('fbPublishStatus');
  if (statusNote) statusNote.textContent = 'Đang chuẩn bị bài viết…';
  const submitBtn = $('fbSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<svg aria-hidden="true" class="social-studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg><span>Đăng lên Facebook</span>`;
  }

  if (!dialog.open) dialog.showModal();
  renderFacebookPortalChannels();
  setFacebookPortalMode(fbPortalState.mode);
  refreshPortalQueueBadge();
  await loadFacebookDraft(propertyId, fbPortalState.tone);
}

function closeFacebookStudio() {
  const dialog = $('facebookPostDialog');
  if (dialog && dialog.open) dialog.close();
  syncPortalFbUrl(fbPortalState.propertyId, null);
}

async function loadFacebookDraft(propertyId, tone = 'hot', targetPageId = null, regenerate = false) {
  fbPortalState.tone = tone;
  const contentInput = $('fbPostContent');
  const previewText = $('fbPreviewText');
  const waitText = regenerate ? 'AI đang viết phiên bản mới… (khoảng 15–30 giây)' : 'Đang sinh nội dung bài viết với AI… (khoảng 15–30 giây, lần sau mở lại sẽ có ngay)';
  if (contentInput) contentInput.value = waitText;
  if (previewText) previewText.textContent = waitText;

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
        includeLink,
        regenerate,
        pageId: targetPageId || fbPortalState.selectedPageId || undefined
      })
    });
    const data = res.data || {};

    if (data.posterNode && typeof data.posterNode === 'object') {
      fbPortalState.posterNode = { ...fbPortalState.posterNode, ...data.posterNode };
    }
    fbPortalState.content = data.content || '';
    fbPortalState.fullContent = data.content || '';
    fbPortalState.threadsContent = data.threadsContent || condensePortalThreadsText(data.content || '', 465);
    fbPortalState.isThreadsEditorActive = false;
    fbPortalState.variants = Array.isArray(data.variants) && data.variants.length >= 4
      ? data.variants.slice(0, 4)
      : [data.content || '', data.content || '', data.content || '', data.content || ''];
    fbPortalState.activeVariantIdx = 0;
    fbPortalState.allImages = data.images || [];
    fbPortalState.pages = Array.isArray(data.pages) && data.pages.length > 0 ? data.pages : [];

    const rotNameInput = $('fbGroupRotName');
    if (rotNameInput && !rotNameInput.value.trim()) {
      rotNameInput.value = `BĐS Fourland · ${propertyId}`;
    }

    // Nếu chưa có page nào được chọn hoặc page ID từ server
    if (data.pageId && fbPortalState.selectedPageIds.size === 0) {
      fbPortalState.selectedPageIds.add(String(data.pageId));
      fbPortalState.selectedPageId = String(data.pageId);
    }
    fbPortalState.pageName = data.pageName || 'Fanpage Facebook';

    renderFacebookPortalChannels();

    // Default: select ALL images automatically
    fbPortalState.selectedImages = new Set(fbPortalState.allImages);

    const activeText = fbPortalState.mode === 'group'
      ? (fbPortalState.variants[fbPortalState.activeVariantIdx] || fbPortalState.content)
      : fbPortalState.content;
    if (contentInput) contentInput.value = activeText;
    if (previewText) {
      previewText.textContent = fbPortalState.mode === 'group'
        ? resolveSpintaxPreview(activeText)
        : activeText;
    }
    syncPortalThreadsEditorState();
    document.querySelectorAll('[data-fb-var]').forEach(tab => {
      tab.classList.toggle('active', Number(tab.dataset.fbVar) === fbPortalState.activeVariantIdx);
    });

    renderFacebookPhotoGrid();
    renderFacebookPreviewGallery();

    const statusNote = $('fbPublishStatus');
    if (statusNote) {
      const pName = fbPortalState.pageName || 'Fanpage';
      statusNote.textContent = `Sẵn sàng đăng lên Fanpage ${pName}`;
    }
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

  // Nút tải thêm ảnh (+)
  const addBtn = document.createElement('label');
  addBtn.className = 'fb-portal-photo-add';
  addBtn.title = 'Tải thêm ảnh từ thiết bị';
  addBtn.setAttribute('aria-label', 'Tải thêm ảnh từ thiết bị');
  addBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
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
      if (statusNote) {
        const pName = fbPortalState.pageName || 'Fanpage';
        statusNote.textContent = `Sẵn sàng đăng lên Fanpage ${pName}`;
      }
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

async function handlePublishGroupRotation() {
  if (!fbPortalState.engineOnline) {
    alert('Chưa kết nối được hệ thống đăng nhóm RevidAPI Social (http://127.0.0.1:8788). Vui lòng bật phần mềm trên máy tính trước!');
    return;
  }
  const groups = Array.from(fbPortalState.selectedGroups.values());
  if (!groups.length) {
    alert('Vui lòng chọn ít nhất 1 Nhóm Facebook để rải bài!');
    return;
  }
  const accountId = $('fbGroupAccountSelect')?.value || fbPortalState.selectedAccountId;
  if (!accountId) {
    alert('Vui lòng chọn tài khoản Facebook đăng nhóm!');
    return;
  }
  const variants = (fbPortalState.variants || []).map(v => String(v || '').trim()).filter(Boolean);
  if (!variants.length) {
    const currentVal = ($('fbPostContent')?.value || '').trim();
    if (!currentVal) {
      alert('Vui lòng nhập nội dung bài đăng');
      return;
    }
    variants.push(currentVal);
  }

  const startAtIso = resolveScheduleTimeInput($('fbGroupStartAt')?.value).iso;
  const submitBtn = $('fbSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>${startAtIso ? `Đang đặt lịch hẹn ${groups.length} nhóm trên Máy 50…` : `Đang kích hoạt đăng tăng tốc ${groups.length} nhóm…`}</span>`;
  }

  try {
    const selectedImgs = Array.from(fbPortalState.selectedImages);
    const defaultMin = startAtIso ? 75 : 15;
    const defaultMax = startAtIso ? 150 : 25;
    const gapMin = Math.max(10, Number($('fbGroupGapMin')?.value) || defaultMin);
    const gapMax = Math.max(gapMin, Number($('fbGroupGapMax')?.value) || defaultMax);
    const rotPayload = {
      action: 'publish-group',
      name: ($('fbGroupRotName')?.value || '').trim() || `BĐS Fourland · ${fbPortalState.propertyId || Date.now()}`,
      accountId,
      actAs: fbPortalState.selectedActAs || '',
      groups,
      variants,
      imageUrls: selectedImgs.slice(0, 10),
      link: ($('fbIncludeLink')?.checked ?? true) ? 'https://www.fourland.vn' : '',
      gapMin,
      gapMax,
      skipApproval: $('fbGroupSkipApproval')?.checked !== false,
      autoLike: $('fbGroupAutoLike')?.checked !== false,
      firstComment: ($('fbGroupFirstComment')?.value || '').trim(),
      startAt: startAtIso
    };

    // Gửi 1 gói JSON gọn nhẹ với keepalive:true để dù lỡ đóng/thoát trang ngay sau khi bấm thì Máy 50 vẫn nhận lệnh và tự tải ảnh + chạy 24/7 không bị ngắt!
    const apiRes = await api('/api/admin/v1/facebook/publish', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fourland-preview-cms'
      },
      body: JSON.stringify(rotPayload)
    });
    const saved = apiRes?.data || {};
    if (!saved?.id) throw new Error('Không tạo được chiến dịch đăng nhóm trên Máy 50 (8889)');

    if (!startAtIso && groups.length <= 2) {
      if (submitBtn) {
        submitBtn.innerHTML = `<span>⏳ Đang đăng tăng tốc vào ${groups.length} nhóm (vẫn chạy ngầm nếu thoát trang)…</span>`;
      }
      const deadline = Date.now() + 45000;
      let finalRot = null;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000));
        const rots = await revidEngineApi('GET', '/api/mk/rotations').catch(() => []);
        const cur = (Array.isArray(rots) ? rots : []).find(x => x.id === saved.id);
        if (cur && (!cur.running || cur.status === 'done')) {
          finalRot = cur;
          break;
        }
      }
      if (finalRot) {
        const resValues = Object.values(finalRot.results || {});
        const okItems = resValues.filter(r => r.status === 'ok' || r.status === 'pending');
        const failItems = resValues.filter(r => r.status === 'failed');
        if (failItems.length && !okItems.length) {
          throw new Error(failItems.map(f => f.error || 'Đăng nhóm thất bại').join(' | '));
        }
        const msg = `✅ Đã đăng thành công vào ${okItems.length}/${groups.length} nhóm Facebook!`;
        if (submitBtn) {
          submitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>${msg}</span>`;
        }
        showToast(msg, 4500);
        alert(`${msg}\n\nNhóm đã đăng:\n${groups.map(g => `• ${g.name}`).join('\n')}`);
        setTimeout(closeFacebookStudio, 800);
        return;
      }
    }

    const doneMsg = saved.message || (startAtIso
      ? `⏰ Đã hẹn lịch đăng tự động 24/7 vào ${groups.length} nhóm Facebook trên Máy 50!`
      : `🚀 Đã kích hoạt đăng tăng tốc vào ${groups.length} nhóm Facebook trên Máy 50!`);
    if (submitBtn) {
      submitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>${startAtIso ? `Đã hẹn lịch ${groups.length} nhóm!` : `Đang rải tăng tốc ${groups.length} nhóm!`}</span>`;
    }
    showToast(doneMsg, 4500);
    alert(doneMsg);
    setTimeout(closeFacebookStudio, 1000);
  } catch (error) {
    if (submitBtn) {
      submitBtn.disabled = false;
      updatePortalPublishButtonState();
    }
    alert(`Không thể kích hoạt đăng nhóm: ${error.message}`);
  }
}

async function handlePublishFacebook() {
  if (fbPortalState.mode === 'group') {
    return handlePublishGroupRotation();
  }
  const content = ($('fbPostContent')?.value || '').trim();
  if (!content) {
    alert('Vui lòng nhập nội dung bài viết');
    return;
  }

  const selectedPages = Array.from(fbPortalState.selectedPageIds);
  if (selectedPages.length === 0) {
    alert('Vui lòng chọn ít nhất 1 Fanpage để đăng bài');
    return;
  }

  const pageSched = resolveScheduleTimeInput($('fbPageStartAt')?.value);
  const submitBtn = $('fbSubmitBtn');
  const statusNote = $('fbPublishStatus');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>${pageSched.iso ? 'Đang đặt lịch hẹn 24/7 trên Máy 50…' : 'Đang đăng lên Facebook…'}</span>`;
  }
  if (statusNote) statusNote.textContent = pageSched.iso ? 'Đang lưu lịch hẹn đăng tự động…' : 'Đang xuất bản bài viết…';

  try {
    const selectedList = Array.from(fbPortalState.selectedImages);
    const imagesToPublish = selectedList.length > 0 ? selectedList : (fbPortalState.allImages || []);
    const result = await api('/api/admin/v1/facebook/publish', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fourland-preview-cms'
      },
      body: JSON.stringify({
        propertyId: fbPortalState.propertyId,
        content: fbPortalState.isThreadsEditorActive ? (fbPortalState.fullContent || content) : content,
        threadsContent: fbPortalState.isThreadsEditorActive ? content : (fbPortalState.threadsContent || condensePortalThreadsText(content, 465)),
        images: imagesToPublish,
        pageIds: selectedPages,
        pageId: selectedPages[0],
        pageName: fbPortalState.pageName,
        scheduledAt: pageSched.iso || undefined
      })
    });

    if (statusNote) statusNote.textContent = result.message || 'Đã xử lý thành công!';
    if (submitBtn) submitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>${result.data?.scheduled ? 'Đã đặt lịch hẹn 24/7 thành công' : 'Đã xuất bản & Lưu thành công'}</span>`;

    // Update open detail view
    if (fbPortalState.propertyId && $('detail').open) {
      openDetail(fbPortalState.propertyId);
    }

    if (result.data?.scheduled) {
      showToast(result.message || '⏰ Đã đặt lịch hẹn đăng Fanpage tự động 24/7!', 4500);
      alert(result.message || '⏰ Đã đặt lịch hẹn đăng Fanpage tự động 24/7 trên Máy 50!');
    } else if (result.data?.postUrl) {
      const reportMsg = result.message || 'Đã xuất bản bài viết thành công lên Facebook!';
      if (confirm(`${reportMsg}\n\nBạn có muốn mở xem bài viết trên Facebook không?`)) {
        window.open(result.data.postUrl, '_blank');
      }
    } else {
      alert(result.message || 'Đã đăng bài thành công lên Facebook!');
    }

    setTimeout(closeFacebookStudio, 1500);
  } catch (error) {
    if (submitBtn) {
      submitBtn.disabled = false;
      updatePortalPublishButtonState();
    }
    if (statusNote) statusNote.textContent = `Lỗi: ${error.message}`;
    alert(`Không thể đăng bài: ${error.message}`);
  }
}

// Facebook Studio Event Listeners
if ($('fbDialogClose')) $('fbDialogClose').onclick = closeFacebookStudio;
if ($('fbCancelBtn')) $('fbCancelBtn').onclick = closeFacebookStudio;
if ($('fbSubmitBtn')) $('fbSubmitBtn').onclick = handlePublishFacebook;

const btnPortalSelectAll = $('btnFbPortalSelectAll');
if (btnPortalSelectAll) {
  const toggleAllPortalPages = () => {
    const pages = fbPortalState.pages || [];
    if (!pages.length) return;
    const shouldSelectAll = btnPortalSelectAll.type === 'checkbox'
      ? btnPortalSelectAll.checked
      : (fbPortalState.selectedPageIds.size !== pages.length);
    if (!shouldSelectAll) {
      fbPortalState.selectedPageIds.clear();
      const defaultPage = pages.find(p => p.isDefault) || pages[0];
      if (defaultPage) fbPortalState.selectedPageIds.add(String(defaultPage.pageId));
    } else {
      pages.forEach(p => fbPortalState.selectedPageIds.add(String(p.pageId)));
    }
    renderFacebookPortalChannels();
  };
  if (btnPortalSelectAll.type === 'checkbox') btnPortalSelectAll.onchange = toggleAllPortalPages;
  else btnPortalSelectAll.onclick = toggleAllPortalPages;
}

document.querySelectorAll('[data-fb-tone]').forEach(chip => {
  chip.title = 'Bấm lại vào phong cách đang chọn để AI viết phiên bản mới';
  chip.onclick = () => {
    const tone = chip.dataset.fbTone;
    if (fbPortalState.propertyId) {
      const regenerate = chip.classList.contains('active') && tone === fbPortalState.tone;
      loadFacebookDraft(fbPortalState.propertyId, tone, fbPortalState.selectedPageId, regenerate);
    }
  };
});

if ($('fbPostContent')) {
  $('fbPostContent').oninput = function() {
    if (fbPortalState.mode === 'group') {
      fbPortalState.variants[fbPortalState.activeVariantIdx] = this.value;
      if ($('fbPreviewText')) $('fbPreviewText').textContent = resolveSpintaxPreview(this.value);
      updateGroupRotationEta();
    } else {
      fbPortalState.content = this.value;
      if (fbPortalState.isThreadsEditorActive) {
        fbPortalState.threadsContent = this.value;
      } else {
        fbPortalState.fullContent = this.value;
        fbPortalState.threadsContent = condensePortalThreadsText(this.value, 465);
      }
      if ($('fbPreviewText')) $('fbPreviewText').textContent = this.value;
      syncPortalThreadsEditorState();
    }
  };
}

if ($('btnFbGroupSchedToggle')) {
  $('btnFbGroupSchedToggle').onclick = () => {
    const adv = $('fbGroupAdvDetails');
    const btn = $('btnFbGroupSchedToggle');
    if (!adv) return;
    adv.open = !adv.open;
    if (btn) {
      btn.classList.toggle('active', adv.open);
      btn.setAttribute('aria-expanded', String(adv.open));
    }
  };
}

// ============================================================================
// POPUP FULL MÀN HÌNH QUẢN LÝ LUỒNG ĐĂNG BÀI & ƯU TIÊN LÊN TRƯỚC (PORTAL)
// ============================================================================
const portalQueueState = {
  filter: 'active',
  items: [],
  summary: null,
  timer: null,
  loading: false
};

function formatPortalQueueTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

function updatePortalQueueBadges(summary) {
  const activeCount = Number(summary?.activeTotal || 0);
  document.querySelectorAll('[data-fb-queue-badge]').forEach(el => {
    el.textContent = String(activeCount);
    el.hidden = activeCount <= 0;
  });
}

async function refreshPortalQueueBadge() {
  try {
    const res = await api('/api/admin/v1/facebook/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer fourland-preview-cms' },
      body: JSON.stringify({ action: 'queue-list' })
    });
    const ov = res?.data || {};
    portalQueueState.items = Array.isArray(ov.items) ? ov.items : [];
    portalQueueState.summary = ov.summary || null;
    updatePortalQueueBadges(portalQueueState.summary);
    if ($('fbQueueManagerDialog')?.open) renderPortalQueueTable();
  } catch (_) {}
}

function renderPortalQueueTable() {
  const tbody = $('fbQueueTableBody');
  const sub = $('fbQueueSummarySub');
  if (!tbody) return;

  const s = portalQueueState.summary || { runningCount: 0, waitingCount: 0, doneCount: 0, failedCount: 0 };
  if (sub) {
    sub.textContent = `Đang chạy: ${s.runningCount || 0} · Chờ đăng/Hẹn lịch: ${s.waitingCount || 0} · Đã xong: ${s.doneCount || 0}${s.failedCount ? ` · Lỗi: ${s.failedCount}` : ''} (Tự làm mới mỗi 6 giây)`;
  }

  const f = portalQueueState.filter;
  const filtered = (portalQueueState.items || []).filter(it => {
    if (f === 'active') return ['running', 'queued', 'scheduled', 'paused', 'draft'].includes(it.status);
    if (f === 'done') return ['done', 'failed', 'partial'].includes(it.status);
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="social-queue-empty">${f === 'active' ? 'Hiện không có bài đăng nào đang chờ trong luồng. Bấm tab "Tất cả" để xem lịch sử các bài vừa chạy.' : 'Chưa có bài đăng nào trong mục này.'}</td></tr>`;
    return;
  }

  const statusMeta = {
    running: { label: '🟢 Đang đăng...', cls: 'st-running' },
    queued: { label: '⏳ Chờ luồng', cls: 'st-queued' },
    scheduled: { label: '⏰ Hẹn lịch', cls: 'st-scheduled' },
    paused: { label: '⏸ Tạm dừng', cls: 'st-paused' },
    draft: { label: '⏸ Tạm hoãn', cls: 'st-draft' },
    done: { label: '✅ Hoàn tất', cls: 'st-done' },
    partial: { label: '⚠️ Xong một phần', cls: 'st-partial' },
    failed: { label: '❌ Lỗi', cls: 'st-failed' }
  };

  tbody.innerHTML = filtered.map((it, idx) => {
    const st = statusMeta[it.status] || { label: it.status, cls: 'st-queued' };
    const prog = it.progress || { done: 0, total: 1 };
    const pct = Math.min(100, Math.round(((prog.done || 0) / Math.max(1, prog.total || 1)) * 100));
    const isPrio = Boolean(it.priorityAt && ['running', 'queued', 'scheduled'].includes(it.status));
    const rowCls = it.status === 'running' ? 'is-running-row' : (isPrio ? 'is-priority-row' : '');
    const linkHtml = it.postUrl
      ? ` <a href="${escapeHtml(it.postUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;font-weight:700;color:var(--forest);">Mở bài ↗</a>`
      : '';
    return `
      <tr class="${rowCls}">
        <td>
          <span class="social-q-status ${st.cls}">${st.label}</span>
          ${it.queuePosition ? `<div class="social-q-chan-sub">Vị trí #${it.queuePosition}</div>` : ''}
          ${isPrio ? `<div class="social-q-prio-tag">⚡ Ưu tiên lên trước</div>` : ''}
        </td>
        <td>
          <div class="social-q-chan-title">${escapeHtml(it.channelLabel || 'Kênh xuất bản')}</div>
          <div class="social-q-chan-sub">${escapeHtml(it.targetSummary || '')}${linkHtml}</div>
        </td>
        <td>
          <div class="social-q-post-title" title="${escapeHtml(it.title || '')}">${escapeHtml(it.title || '(Bài đăng)')}</div>
          <div class="social-q-post-snip">${escapeHtml(it.error ? `Lỗi: ${it.error}` : (it.snippet || ''))}</div>
        </td>
        <td>
          <div class="social-q-chan-title">${prog.done || 0}/${prog.total || 1} (${pct}%)</div>
          <div class="social-q-prog-bar"><span style="width:${pct}%"></span></div>
          <div class="social-q-chan-sub" style="margin-top:4px;">${escapeHtml(formatPortalQueueTime(it.scheduledAt))}</div>
        </td>
        <td>
          <div class="social-q-actions">
            ${it.canPrioritize && idx > 0 ? `<button type="button" class="social-q-btn btn-prioritize" data-q-op="prioritize" data-q-type="${escapeHtml(it.itemType)}" data-q-id="${escapeHtml(it.id)}">⚡ Ưu tiên lên trước</button>` : (it.canPrioritize && it.status === 'scheduled' ? `<button type="button" class="social-q-btn btn-prioritize" data-q-op="prioritize" data-q-type="${escapeHtml(it.itemType)}" data-q-id="${escapeHtml(it.id)}">⚡ Chạy ngay trước</button>` : '')}
            ${it.canPause ? `<button type="button" class="social-q-btn" data-q-op="pause" data-q-type="${escapeHtml(it.itemType)}" data-q-id="${escapeHtml(it.id)}">⏸ Dừng</button>` : ''}
            ${it.canResume ? `<button type="button" class="social-q-btn" data-q-op="resume" data-q-type="${escapeHtml(it.itemType)}" data-q-id="${escapeHtml(it.id)}">▶ Chạy tiếp</button>` : ''}
            ${it.canRetry ? `<button type="button" class="social-q-btn" data-q-op="retry" data-q-type="${escapeHtml(it.itemType)}" data-q-id="${escapeHtml(it.id)}">↻ Thử lại</button>` : ''}
            <button type="button" class="social-q-btn btn-danger" data-q-op="delete" data-q-type="${escapeHtml(it.itemType)}" data-q-id="${escapeHtml(it.id)}" title="Xoá khỏi danh sách">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function handlePortalQueueAction(itemType, id, op, btnEl) {
  if (op === 'delete' && !confirm('Bạn chắc chắn muốn xoá bài/chiến dịch này khỏi luồng đăng?')) return;
  if (btnEl) btnEl.disabled = true;
  try {
    const res = await api('/api/admin/v1/facebook/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer fourland-preview-cms' },
      body: JSON.stringify({ action: 'queue-action', itemType, id, op })
    });
    const ov = res?.data || {};
    if (Array.isArray(ov.items)) portalQueueState.items = ov.items;
    if (ov.summary) portalQueueState.summary = ov.summary;
    updatePortalQueueBadges(portalQueueState.summary);
    renderPortalQueueTable();
    if (res?.message) showToast(res.message, 3500);
  } catch (err) {
    alert(`Không thực hiện được thao tác: ${err.message}`);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

function openPortalQueueDialog() {
  const dlg = $('fbQueueManagerDialog');
  if (!dlg) return;
  if (!dlg.open) dlg.showModal();
  renderPortalQueueTable();
  refreshPortalQueueBadge();
  clearInterval(portalQueueState.timer);
  portalQueueState.timer = setInterval(() => {
    if (!dlg.open) {
      clearInterval(portalQueueState.timer);
      return;
    }
    refreshPortalQueueBadge();
  }, 6000);
}

function closePortalQueueDialog() {
  const dlg = $('fbQueueManagerDialog');
  clearInterval(portalQueueState.timer);
  if (dlg && dlg.open) dlg.close();
}

document.querySelectorAll('[data-open-fb-queue]').forEach(btn => {
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPortalQueueDialog();
  };
});
if ($('btnFbQueueClose')) $('btnFbQueueClose').onclick = closePortalQueueDialog;
if ($('btnFbQueueRefresh')) $('btnFbQueueRefresh').onclick = () => refreshPortalQueueBadge();
document.querySelectorAll('[data-fb-q-filter]').forEach(tab => {
  tab.onclick = () => {
    portalQueueState.filter = tab.dataset.fbQFilter || 'active';
    document.querySelectorAll('[data-fb-q-filter]').forEach(t => t.classList.toggle('active', t === tab));
    renderPortalQueueTable();
  };
});
if ($('fbQueueTableBody')) {
  $('fbQueueTableBody').onclick = (e) => {
    const btn = e.target.closest('[data-q-op]');
    if (!btn) return;
    handlePortalQueueAction(btn.dataset.qType, btn.dataset.qId, btn.dataset.qOp, btn);
  };
}
if ($('fbQueueManagerDialog')) {
  $('fbQueueManagerDialog').onclick = (e) => {
    if (e.target === $('fbQueueManagerDialog')) closePortalQueueDialog();
  };
}

document.querySelectorAll('[data-fb-mode]').forEach(tab => {
  tab.onclick = () => setFacebookPortalMode(tab.dataset.fbMode);
});
if ($('fbGroupActAsSelect')) {
  $('fbGroupActAsSelect').onchange = () => {
    const sel = $('fbGroupActAsSelect');
    const opt = sel.selectedOptions?.[0];
    const rawVal = sel.value || '';
    const [parsedAccId, parsedActAs] = rawVal.includes('::') ? rawVal.split('::') : [fbPortalState.selectedAccountId, rawVal];
    const nextAccId = opt?.dataset?.accountId || parsedAccId || fbPortalState.selectedAccountId;
    const nextActAs = opt?.dataset?.actAs !== undefined ? opt.dataset.actAs : (parsedActAs || '');
    fbPortalState.selectedAccountId = nextAccId;
    fbPortalState.selectedActAs = nextActAs;
    if ($('fbGroupAccountSelect') && nextAccId) $('fbGroupAccountSelect').value = nextAccId;
    fbPortalState.selectedGroups.clear();
    if (fbPortalState.selectedAccountId) {
      loadRevidAccountGroups(fbPortalState.selectedAccountId, false);
    }
    updatePortalPreviewFromChannels();
  };
}
if ($('fbGroupNodeSelect')) {
  $('fbGroupNodeSelect').onchange = () => {
    fbPortalState.nodeMode = $('fbGroupNodeSelect').value;
    fbPortalState.selectedGroups.clear();
    initRevidGroupEngine(false);
  };
}

document.querySelectorAll('[data-fb-var]').forEach(tab => {
  tab.onclick = () => {
    const idx = Number(tab.dataset.fbVar) || 0;
    fbPortalState.activeVariantIdx = idx;
    document.querySelectorAll('[data-fb-var]').forEach(t => t.classList.toggle('active', t === tab));
    const val = fbPortalState.variants[idx] || '';
    if ($('fbPostContent')) $('fbPostContent').value = val;
    if ($('fbPreviewText')) $('fbPreviewText').textContent = resolveSpintaxPreview(val);
  };
});

if ($('fbGroupAccountSelect')) {
  $('fbGroupAccountSelect').onchange = (e) => {
    fbPortalState.selectedAccountId = e.target.value;
    fbPortalState.selectedGroups.clear();
    loadRevidAccountGroups(fbPortalState.selectedAccountId, false);
    updatePortalPreviewFromChannels();
  };
}
if ($('fbGroupSearchInput')) {
  $('fbGroupSearchInput').oninput = () => renderRevidGroupsList();
}
if ($('btnFbGroupPickAll')) {
  $('btnFbGroupPickAll').onclick = () => {
    const q = ($('fbGroupSearchInput')?.value || '').trim().toLowerCase();
    const visible = (fbPortalState.groups || []).filter(g => !q || String(g.name || '').toLowerCase().includes(q));
    visible.forEach(g => {
      fbPortalState.selectedGroups.set(String(g.id), { id: g.id, name: g.name });
    });
    renderRevidGroupsList();
    updatePortalPreviewFromChannels();
  };
}
if ($('btnFbGroupPickInstant')) {
  $('btnFbGroupPickInstant').onclick = () => {
    const q = ($('fbGroupSearchInput')?.value || '').trim().toLowerCase();
    const visible = (fbPortalState.groups || []).filter(g => !q || String(g.name || '').toLowerCase().includes(q));
    visible.forEach(g => {
      const gid = String(g.id);
      if (fbPortalState.groupApprovals?.[gid]?.approval !== 'required') {
        fbPortalState.selectedGroups.set(gid, { id: g.id, name: g.name });
      }
    });
    renderRevidGroupsList();
    updatePortalPreviewFromChannels();
  };
}
if ($('btnFbGroupPickNone')) {
  $('btnFbGroupPickNone').onclick = () => {
    fbPortalState.selectedGroups.clear();
    renderRevidGroupsList();
    updatePortalPreviewFromChannels();
  };
}
if ($('fbPageStartAt')) {
  $('fbPageStartAt').oninput = () => {
    const curVal = ($('fbPageStartAt')?.value || '').trim();
    let matchedPreset = false;
    document.querySelectorAll('[data-fb-page-time]').forEach(btn => {
      const isMatch = btn.dataset.fbPageTime === curVal;
      btn.classList.toggle('active', isMatch);
      if (isMatch) matchedPreset = true;
    });
    const customChip = $('fbPageCustomTimeChip');
    const customLbl = $('fbPageCustomTimeLabel');
    if (customChip) customChip.classList.toggle('active', Boolean(curVal && !matchedPreset));
    if (customLbl) customLbl.textContent = (curVal && !matchedPreset) ? curVal : 'Khác';
    updatePortalPublishButtonState();
  };
}
document.querySelectorAll('[data-fb-page-time]').forEach(btn => {
  btn.onclick = () => {
    const raw = btn.dataset.fbPageTime || '';
    const input = $('fbPageStartAt');
    if (!input) return;
    if (!raw) {
      input.value = '';
    } else if (raw.startsWith('+')) {
      const addMins = Number(raw.slice(1)) || 30;
      const d = new Date(Date.now() + addMins * 60000);
      input.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } else {
      input.value = raw;
    }
    document.querySelectorAll('[data-fb-page-time]').forEach(b => b.classList.toggle('active', b === btn));
    if ($('fbPageCustomTimeChip')) $('fbPageCustomTimeChip').classList.remove('active');
    if ($('fbPageCustomTimeLabel')) $('fbPageCustomTimeLabel').textContent = 'Khác';
    updatePortalPublishButtonState();
  };
});
if ($('fbGroupGapMin')) {
  $('fbGroupGapMin').oninput = () => {
    $('fbGroupGapMin').dataset.userEdited = '1';
    updateGroupRotationEta();
  };
}
if ($('fbGroupGapMax')) {
  $('fbGroupGapMax').oninput = () => {
    $('fbGroupGapMax').dataset.userEdited = '1';
    updateGroupRotationEta();
  };
}
if ($('fbGroupStartAt')) {
  $('fbGroupStartAt').oninput = () => {
    const curVal = ($('fbGroupStartAt')?.value || '').trim();
    let matchedPreset = false;
    document.querySelectorAll('[data-fb-time]').forEach(btn => {
      const isMatch = btn.dataset.fbTime === curVal;
      btn.classList.toggle('active', isMatch);
      if (isMatch) matchedPreset = true;
    });
    if ($('fbGroupCustomTimeChip')) $('fbGroupCustomTimeChip').classList.toggle('active', Boolean(curVal && !matchedPreset));
    if ($('fbGroupCustomTimeLabel')) $('fbGroupCustomTimeLabel').textContent = (curVal && !matchedPreset) ? curVal : 'Khác';
    updateGroupRotationEta();
  };
}
document.querySelectorAll('[data-fb-time]').forEach(btn => {
  btn.onclick = () => {
    const raw = btn.dataset.fbTime || '';
    const input = $('fbGroupStartAt');
    if (!input) return;
    if (!raw) {
      input.value = '';
    } else if (raw.startsWith('+')) {
      const addMins = Number(raw.slice(1)) || 30;
      const d = new Date(Date.now() + addMins * 60000);
      input.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } else {
      input.value = raw;
    }
    document.querySelectorAll('[data-fb-time]').forEach(b => b.classList.toggle('active', b === btn));
    if ($('fbGroupCustomTimeChip')) $('fbGroupCustomTimeChip').classList.remove('active');
    if ($('fbGroupCustomTimeLabel')) $('fbGroupCustomTimeLabel').textContent = 'Khác';
    updateGroupRotationEta();
  };
});

if ($('fbIncludeLink')) {
  $('fbIncludeLink').onchange = () => {
    if (fbPortalState.propertyId) {
      loadFacebookDraft(fbPortalState.propertyId, fbPortalState.tone, fbPortalState.selectedPageId);
    }
  };
}

if ($('facebookPostDialog')) {
  $('facebookPostDialog').onclick = event => {
    if (event.target === $('facebookPostDialog')) closeFacebookStudio();
  };
}

// ==========================================================================
// ONESIGNAL WEB PUSH NOTIFICATIONS
// ==========================================================================
function initOneSignalPush() {
  const ONE_SIGNAL_APP_ID = window.FOURLAND_ONESIGNAL_APP_ID || "";
  if (!ONE_SIGNAL_APP_ID || ONE_SIGNAL_APP_ID === "YOUR_ONESIGNAL_APP_ID") {
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      await OneSignal.init({
        appId: ONE_SIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerParam: { scope: "/" },
        serviceWorkerPath: "OneSignalSDKWorker.js"
      });

      console.log("[OneSignal] Khởi tạo OneSignal thành công cho Fourland");
    } catch (err) {
      console.warn("[OneSignal] Init warning:", err);
    }
  });

  // Tự động hiển thị giao diện Luxury Soft Prompt nếu chưa cấp quyền
  setupLuxuryPushPrompt();
}

function setupLuxuryPushPrompt() {
  const modal = $('fourlandPushModal');
  const btnAccept = $('pushSheetAccept');
  const btnDismiss = $('pushSheetDismiss');
  const btnClose = $('pushSheetClose');
  const backdrop = $('pushSheetBackdrop');
  if (!modal) return;

  const hideModal = () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  };

  const showModal = () => {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  };

  // Kiểm tra trạng thái cấp quyền hiện tại của trình duyệt
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    const lastDismissed = Number(localStorage.getItem('fourland_push_dismissed') || 0);
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    if (!lastDismissed || (Date.now() - lastDismissed > threeDays)) {
      setTimeout(() => {
        if (Notification.permission === 'default') {
          showModal();
        }
      }, 2000);
    }
  }

  if (btnAccept) {
    btnAccept.onclick = async () => {
      hideModal();
      localStorage.setItem('fourland_push_dismissed', Date.now());

      if (window.OneSignal && window.OneSignal.Notifications) {
        try {
          await window.OneSignal.Notifications.requestPermission();
          if (Notification.permission === 'granted') {
            showToast('✓ Cảm ơn bạn! Đã bật nhận thông báo Fourland thành công.', 3200);
          }
        } catch (e) {
          console.warn('[OneSignal] Request permission error:', e);
        }
      } else if (typeof Notification !== 'undefined') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            showToast('✓ Cảm ơn bạn! Đã bật nhận thông báo Fourland thành công.', 3200);
          }
        });
      }
    };
  }

  const dismissPrompt = () => {
    hideModal();
    localStorage.setItem('fourland_push_dismissed', Date.now());
  };

  if (btnDismiss) btnDismiss.onclick = dismissPrompt;
  if (btnClose) btnClose.onclick = dismissPrompt;
  if (backdrop) backdrop.onclick = dismissPrompt;
}

window.triggerPushNotification = function() {
  const modal = $('fourlandPushModal');
  if (modal) {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  } else if (window.OneSignal && window.OneSignal.Notifications) {
    window.OneSignal.Notifications.requestPermission();
  }
};

initOneSignalPush();

// ==========================================================================
// CHỐNG TẢI VÀ SAO CHÉP HÌNH ẢNH BĐS (ANTI-IMAGE DOWNLOAD PROTECTION)
// Khách vãng lai: Bị chặn chuột phải, kéo thả, phím tắt Ctrl+S
// CTV & Admin: Được quyền lưu ảnh và tải ảnh tự do
// ==========================================================================
(function initImageProtection() {
  function isProtectedTarget(target) {
    if (!target) return false;
    return (
      target.tagName === 'IMG' ||
      Boolean(
        target.closest &&
        target.closest('img, .photo, .gallery-main, .thumbs, .lightbox-image-wrap, .listing-photo, .gallery-hero-wrap, .similar-card')
      )
    );
  }

  function canBypassProtection() {
    return Boolean(state.adminUnlocked || state.ctvUnlocked || state.canViewFullAddress);
  }

  // 1. Chặn chuột phải (Context Menu) trên toàn bộ ảnh với khách, cho phép CTV & Admin
  document.addEventListener('contextmenu', function (e) {
    if (isProtectedTarget(e.target)) {
      if (canBypassProtection()) return;
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, { capture: true, passive: false });

  // 2. Chặn kéo thả ảnh (Drag and Drop) ra ngoài Desktop với khách, cho phép CTV & Admin
  document.addEventListener('dragstart', function (e) {
    if (isProtectedTarget(e.target)) {
      if (canBypassProtection()) return;
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, { capture: true, passive: false });

  // 3. Chặn lưu trang / ảnh bằng phím tắt Ctrl+S / Cmd+S khi tương tác với ảnh với khách
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      if (canBypassProtection()) return;
      const detailDialog = document.getElementById('detail');
      if (isProtectedTarget(document.activeElement) || (detailDialog && detailDialog.open)) {
        e.preventDefault();
      }
    }
  });
})();



