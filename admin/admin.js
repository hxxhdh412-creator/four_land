const isLocalPreview = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
const cmsState = {
  user: null,
  accessToken: isLocalPreview ? 'fourland-preview-cms' : (localStorage.getItem('fourland_cms_access_token') || sessionStorage.getItem('fourland_cms_access_token') || ''),
  propertiesLoaded: false,
  propertyPage: 1,
  propertyMeta: null,
  currentProperty: null,
  currentPropertyItems: [],
  viewMode: window.matchMedia('(max-width: 600px)').matches
    ? 'grid'
    : (localStorage.getItem('fourland_cms_view_mode') || 'grid'),
  selectedPropertyIds: new Set(),
  lightbox: { images: [], currentIndex: 0, rotation: 0, caption: '' },
  reviewLoaded: false,
  healthLoaded: false,
  usersLoaded: false
};
const byId = id => document.getElementById(id);
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function getPageFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') || params.get('page');
    const validPages = ['dashboard', 'match', 'properties', 'owners', 'editor', 'web-pins', 'users', 'sync', 'facebook-pages'];
    if (tab && validPages.includes(tab.toLowerCase())) return tab.toLowerCase();

    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    if (validPages.includes(hash)) return hash;

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1]?.toLowerCase();
    if (lastPart && validPages.includes(lastPart)) return lastPart;

    const savedTab = localStorage.getItem('fourland_cms_last_tab');
    if (savedTab && validPages.includes(savedTab)) return savedTab;
  } catch (_) {}

  return 'dashboard';
}

function setActivePage(page, updateUrl = true) {
  const validPages = ['dashboard', 'match', 'properties', 'owners', 'editor', 'web-pins', 'users', 'sync', 'facebook-pages'];
  const targetPage = validPages.includes(page) ? page : 'dashboard';

  document.querySelectorAll('[data-page-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.pagePanel === targetPage));
  document.querySelectorAll('[data-page]').forEach(item => item.classList.toggle('active', item.dataset.page === targetPage));

  try {
    localStorage.setItem('fourland_cms_last_tab', targetPage);
  } catch (_) {}

  if (updateUrl) {
    const url = new URL(window.location.href);
    if (targetPage === 'dashboard') {
      url.searchParams.delete('tab');
      url.searchParams.delete('page');
    } else {
      url.searchParams.set('tab', targetPage);
    }
    url.hash = '';
    const newUrl = url.pathname + (url.search ? url.search : '');
    if (window.location.pathname + window.location.search !== newUrl || window.location.hash) {
      history.replaceState(null, '', newUrl);
    }
  }

  if (targetPage === 'web-pins') loadAccessPins();
  if (targetPage === 'facebook-pages') loadFacebookPages();
  if (targetPage === 'properties' && cmsState.user && !cmsState.propertiesLoaded) loadProperties();
  if (targetPage === 'owners' && cmsState.user && !cmsState.ownersLoaded) loadOwners();
  if (targetPage === 'match' && cmsState.user && !cmsState.matchLoaded) {
    const queryInput = byId('smartMatchQuery');
    if (queryInput && !queryInput.value.trim()) {
      queryInput.value = 'Thuê mặt bằng Tân Bình 15-20 triệu 4x20';
    }
    loadSmartMatch();
  }
  if (targetPage === 'editor' && cmsState.user && !cmsState.reviewLoaded) loadReviewQueue();
  if (targetPage === 'users' && cmsState.user && !cmsState.usersLoaded) loadUsers();
  if (targetPage === 'sync' && cmsState.user && !cmsState.healthLoaded) loadSystemHealth();
}


async function cmsApi(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      ...(cmsState.accessToken ? { Authorization: `Bearer ${cmsState.accessToken}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: 'no-store'
  });
  const body = await response.json().catch(() => ({ ok: false, error: { message: 'Phản hồi CMS không hợp lệ' } }));
  if (!response.ok || body.ok === false) {
    const error = new Error(body.error?.message || 'Không truy cập được CMS');
    error.code = body.error?.code || 'REQUEST_FAILED';
    error.payload = body;
    throw error;
  }
  return body;
}

function showAuthError(error) {
  byId('cmsApp').setAttribute('aria-busy', 'false');
  if (error.code === 'AUTH_REQUIRED') {
    byId('authMessage').textContent = 'Nhập thông tin tài khoản hoặc chọn nhanh vai trò để truy cập kho dữ liệu.';
    byId('authError').hidden = true;
  } else {
    byId('authMessage').textContent = 'Không thể xác minh quyền truy cập CMS.';
    byId('authError').hidden = false;
    byId('authError').textContent = `${error.code || 'AUTH_ERROR'} · ${error.message}`;
  }
  byId('retryAuth').hidden = true;
  byId('systemState').querySelector('span').textContent = 'Chưa đăng nhập';
}

function getUserInitials(name) {
  if (!name) return 'FL';
  const cleanName = String(name).replace(/\([^)]*\)/g, '').replace(/[^a-zA-ZÀ-ỹ0-9\s]/g, '').trim();
  const words = cleanName.split(/\s+/).filter(Boolean);
  if (!words.length) return 'FL';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const first = words[0][0];
  const last = words[words.length - 1][0];
  return (first + last).toUpperCase();
}

function updateHeaderUser() {
  if (!cmsState.user) return;
  byId('welcomeTitle').textContent = `Chào mừng, ${cmsState.user.displayName}`;
  byId('profileButton').textContent = getUserInitials(cmsState.user.displayName);
  byId('profileButton').disabled = false;
  if (byId('btnLogoutTopbar')) byId('btnLogoutTopbar').hidden = false;
  byId('systemState').classList.add('ready');
  byId('systemState').querySelector('span').textContent = `Đã xác thực · ${cmsState.user.role}`;
  if (byId('btnQuickPushHeader')) {
    byId('btnQuickPushHeader').hidden = !['super_admin', 'manager', 'editor', 'sales'].includes(cmsState.user.role);
  }
}

async function handleLogin(credentials = {}) {
  const errorBox = byId('authError');
  const submitBtn = byId('btnLoginSubmit');
  errorBox.hidden = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Đang đăng nhập…';
  }

  try {
    const result = await cmsApi('/api/admin/v1/login', {
      method: 'POST',
      body: credentials
    });

    const { user, token } = result.data;
    cmsState.user = user;
    cmsState.accessToken = token;

    const remember = byId('loginRemember')?.checked ?? true;
    if (remember) {
      localStorage.setItem('fourland_cms_access_token', token);
      localStorage.setItem('fourland_cms_user', JSON.stringify(user));
    } else {
      sessionStorage.setItem('fourland_cms_access_token', token);
      sessionStorage.setItem('fourland_cms_user', JSON.stringify(user));
    }

    byId('authGate').hidden = true;
    byId('cmsContent').hidden = false;
    if (byId('cmsSidebar')) byId('cmsSidebar').hidden = false;
    document.body.classList.add('authenticated');
    updateHeaderUser();
    byId('cmsApp').setAttribute('aria-busy', 'false');
    showToast(`Chào mừng ${user.displayName} đã đăng nhập!`);
    const initialPage = getPageFromUrl();
    setActivePage(initialPage, false);
    loadDashboard().catch(() => {});
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = error.message || 'Đăng nhập thất bại';
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'Đăng nhập hệ thống';
    }
  }
}

async function handleLogout() {
  if (!confirm('Bạn có chắc muốn đăng xuất khỏi hệ thống quản trị?')) return;
  try {
    await cmsApi('/api/admin/v1/logout', { method: 'POST' }).catch(() => {});
  } finally {
    cmsState.user = null;
    cmsState.accessToken = '';
    cmsState.propertiesLoaded = false;
    cmsState.usersLoaded = false;
    cmsState.matchLoaded = false;
    localStorage.removeItem('fourland_cms_access_token');
    localStorage.removeItem('fourland_cms_user');
    sessionStorage.removeItem('fourland_cms_access_token');
    sessionStorage.removeItem('fourland_cms_user');

    if (byId('profileDialog')) byId('profileDialog').close();
    byId('cmsContent').hidden = true;
    byId('authGate').hidden = false;
    if (byId('cmsSidebar')) byId('cmsSidebar').hidden = true;
    document.body.classList.remove('authenticated');
    if (byId('btnLogoutTopbar')) byId('btnLogoutTopbar').hidden = true;
    byId('systemState').classList.remove('ready');
    byId('systemState').querySelector('span').textContent = 'Chưa đăng nhập';
    showToast('Đã đăng xuất thành công!');
  }
}

async function bootstrapCms() {
  const savedToken = isLocalPreview ? 'fourland-preview-cms' : (localStorage.getItem('fourland_cms_access_token') || sessionStorage.getItem('fourland_cms_access_token') || '');
  if (savedToken) {
    cmsState.accessToken = savedToken;
  }

  if (!cmsState.accessToken) {
    byId('cmsApp').setAttribute('aria-busy', 'false');
    byId('authGate').hidden = false;
    byId('cmsContent').hidden = true;
    if (byId('cmsSidebar')) byId('cmsSidebar').hidden = true;
    document.body.classList.remove('authenticated');
    byId('authError').hidden = true;
    byId('retryAuth').hidden = true;
    byId('authMessage').textContent = 'Nhập thông tin tài khoản hoặc chọn nhanh vai trò để truy cập kho dữ liệu.';
    byId('systemState').querySelector('span').textContent = 'Chưa đăng nhập';
    return;
  }

  byId('authError').hidden = true;
  byId('retryAuth').hidden = true;
  byId('authMessage').textContent = 'Đang xác minh quyền truy cập…';
  try {
    const result = await cmsApi('/api/admin/v1/me');
    cmsState.user = result.data.user;
    byId('authGate').hidden = true;
    byId('cmsContent').hidden = false;
    if (byId('cmsSidebar')) byId('cmsSidebar').hidden = false;
    document.body.classList.add('authenticated');
    updateHeaderUser();
    byId('cmsApp').setAttribute('aria-busy', 'false');
    const initialPage = getPageFromUrl();
    setActivePage(initialPage, false);
    loadDashboard().catch(err => console.warn('Dashboard summary error:', err));
  } catch (error) {
    cmsState.accessToken = '';
    localStorage.removeItem('fourland_cms_access_token');
    sessionStorage.removeItem('fourland_cms_access_token');
    if (byId('cmsSidebar')) byId('cmsSidebar').hidden = true;
    document.body.classList.remove('authenticated');
    showAuthError(error);
  }
}

async function loadDashboard() {
  try {
    const result = await cmsApi('/api/admin/v1/dashboard/summary');
    const summary = result.data.summary;
    byId('metricPublished').textContent = summary.published.toLocaleString('vi-VN');
    byId('metricReview').textContent = summary.pendingReview.toLocaleString('vi-VN');
    byId('metricMissing').textContent = summary.missingData.toLocaleString('vi-VN');
    byId('metricAvailable').textContent = summary.available.toLocaleString('vi-VN');
    byId('metricToday').textContent = summary.receivedToday.toLocaleString('vi-VN');
    byId('metricNoImages').textContent = summary.withoutImages.toLocaleString('vi-VN');
    byId('metricArchived').textContent = summary.archived.toLocaleString('vi-VN');
    byId('metricPublishedNote').textContent = summary.schemaMode === 'cms' ? 'CMS workflow' : 'Tương thích schema legacy';
    byId('dashboardUpdated').textContent = 'Dữ liệu trực tiếp';

    const badgeReview = byId('navBadgeReview');
    if (badgeReview) {
      badgeReview.textContent = summary.pendingReview || 0;
      badgeReview.hidden = !summary.pendingReview;
    }
    const badgeProps = byId('navBadgeProperties');
    if (badgeProps) {
      const totalCount = summary.available || summary.published || 0;
      badgeProps.textContent = totalCount > 999 ? '999+' : totalCount;
      badgeProps.hidden = !totalCount;
    }
  } catch (error) {
    byId('dashboardUpdated').textContent = `Không tải được · ${error.code}`;
  }
}

function formatDate(value) {
  if (!value) return 'Chưa rõ thời gian';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa rõ thời gian' : date.toLocaleDateString('vi-VN');
}

function statusLabel(value) {
  return ({ partial: 'Đang xử lý', ready: 'Sẵn sàng', featured: 'Nổi bật', archived: 'Đã lưu trữ', rented: 'Đã giao dịch' })[value] || value || 'Chưa phân loại';
}

function roleLabel(role) {
  return ({
    super_admin: 'Super Admin',
    manager: 'Manager',
    editor: 'Editor',
    sales: 'Sales',
    viewer: 'Viewer'
  })[role] || role;
}

function driveImage(url) {
  if (!url) return '';
  const str = String(url).trim();
  if (!str) return '';
  const match = str.match(/\/d\/([\w-]+)/) || str.match(/[?&]id=([\w-]+)/) || str.match(/googleusercontent\.com\/d\/([\w-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  }
  return str;
}

function formatPropertyPitch(item) {
  const parts = [];
  parts.push(`🏠 [BĐS FOURLAND] ${item.address || 'Nhà cho thuê'}`);
  if (item.district) parts.push(`📍 Khu vực: ${[item.ward, item.district].filter(Boolean).join(', ')}`);
  if (item.propertyType) parts.push(`🏢 Loại hình: ${item.propertyType}`);
  if (item.area || item.dimensions) parts.push(`📐 Diện tích: ${[item.dimensions, item.area].filter(Boolean).join(' - ')}`);
  if (item.structure) parts.push(`🧱 Kết cấu: ${item.structure}`);
  if (item.bedrooms) parts.push(`🛏️ Phòng ngủ: ${item.bedrooms} PN`);
  if (item.price) parts.push(`💰 Giá thuê: ${item.price}`);
  if (item.phone) parts.push(`📞 Liên hệ / Zalo: ${item.phone}`);
  parts.push(`✨ Hỗ trợ xem nhà 24/7 trực tiếp Fourland`);
  return parts.join('\n');
}

function openLightbox(images, startIndex = 0, caption = '') {
  if (!images || !images.length) return;
  cmsState.lightbox.images = images;
  cmsState.lightbox.currentIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  cmsState.lightbox.rotation = 0;
  cmsState.lightbox.caption = caption;
  updateLightbox();
  const dlg = byId('imageLightbox');
  if (dlg && !dlg.open) dlg.showModal();
}

function closeLightbox() {
  const dlg = byId('imageLightbox');
  if (dlg && dlg.open) dlg.close();
}

function updateLightbox() {
  const { images, currentIndex, rotation, caption } = cmsState.lightbox;
  const imgElem = byId('lightboxImg');
  const captionElem = byId('lightboxCaption');
  const downloadLink = byId('lightboxDownload');
  const prevBtn = byId('lightboxPrev');
  const nextBtn = byId('lightboxNext');

  if (!imgElem || !images.length) return;
  const currentUrl = images[currentIndex];
  imgElem.src = currentUrl;
  imgElem.style.transform = `rotate(${rotation}deg)`;

  if (captionElem) {
    captionElem.textContent = `${caption ? caption + ' · ' : ''}Ảnh ${currentIndex + 1} / ${images.length}`;
  }
  if (downloadLink) {
    downloadLink.href = currentUrl;
  }
  if (prevBtn) prevBtn.style.visibility = images.length > 1 ? 'visible' : 'hidden';
  if (nextBtn) nextBtn.style.visibility = images.length > 1 ? 'visible' : 'hidden';
}

function createPropertyCard(item) {
  const article = document.createElement('article');
  article.className = 'cms-property-card';
  if (cmsState.selectedPropertyIds.has(item.id)) {
    article.classList.add('selected');
  }

  const cover = document.createElement('div');
  cover.className = 'cms-property-cover';
  const imgSrc = driveImage(item.coverImage);
  if (imgSrc) {
    const image = document.createElement('img');
    image.src = imgSrc;
    image.alt = item.address || 'Ảnh bất động sản';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.style.cursor = 'pointer';
    image.addEventListener('click', (e) => {
      e.stopPropagation();
      const allImgs = item.images && item.images.length ? item.images.map(x => driveImage(x.url)) : [imgSrc];
      openLightbox(allImgs, 0, item.address);
    });
    image.onerror = () => {
      cover.innerHTML = '<div class="cms-no-photo-placeholder"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Hình ảnh đang xử lý</span></div>';
    };
    cover.append(image);
  } else {
    cover.innerHTML = '<div class="cms-no-photo-placeholder"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Chưa có hình ảnh</span></div>';
  }

  const body = document.createElement('div');
  body.className = 'cms-property-body';
  const badges = document.createElement('div');
  badges.className = 'cms-property-badges';
  const typeBadge = document.createElement('span');
  const isSale = item.listingType === 'sale';
  typeBadge.className = isSale ? 'cms-badge cms-badge-sale' : 'cms-badge cms-badge-rent';
  typeBadge.textContent = isSale ? 'Cần bán' : 'Cho thuê';
  badges.append(typeBadge);
  const status = document.createElement('span');
  status.className = 'cms-badge';
  status.textContent = statusLabel(item.status);
  badges.append(status);
  if (item.missingData) {
    const warning = document.createElement('span');
    warning.className = 'cms-badge warn';
    warning.textContent = 'Thiếu dữ liệu';
    badges.append(warning);
  }
  const title = document.createElement('h2');
  title.textContent = item.address || 'Hồ sơ chưa có địa chỉ';
  const location = document.createElement('p');
  location.className = 'cms-property-location';
  location.innerHTML = `<svg class="cms-fact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${[item.ward, item.district].filter(Boolean).join(' · ') || item.propertyType || 'Chưa rõ khu vực'}</span>`;

  const facts = document.createElement('div');
  facts.className = 'cms-property-facts';

  if (item.area) {
    const fact = document.createElement('span');
    fact.innerHTML = `<svg class="cms-fact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span>${item.area}</span>`;
    facts.append(fact);
  }

  if (item.bedrooms !== null && item.bedrooms !== undefined && Number(item.bedrooms) > 0) {
    const fact = document.createElement('span');
    fact.innerHTML = `<svg class="cms-fact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 19h20M2 17v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6M6 9V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/></svg><span>${item.bedrooms} PN</span>`;
    facts.append(fact);
  }

  const imgFact = document.createElement('span');
  imgFact.innerHTML = `<svg class="cms-fact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>${item.imageCount || 0} ảnh</span>`;
  facts.append(imgFact);

  const footer = document.createElement('div');
  footer.className = 'cms-property-footer';
  const price = document.createElement('strong');
  price.textContent = item.price || 'Liên hệ';

  const btnGroup = document.createElement('div');
  btnGroup.style.display = 'flex';
  btnGroup.style.gap = '6px';
  btnGroup.style.alignItems = 'center';

  const pitchBtn = document.createElement('button');
  pitchBtn.className = 'cms-pitch-btn';
  pitchBtn.type = 'button';
  pitchBtn.title = 'Sao chép tin Zalo gửi khách';
  pitchBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Chép tin</span>';
  pitchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleCopyPitch(formatPropertyPitch(item));
  });

  const detailButton = document.createElement('button');
  detailButton.className = 'cms-card-action';
  detailButton.type = 'button';
  detailButton.textContent = 'Xem chi tiết';
  detailButton.addEventListener('click', () => openPropertyDetail(item.id));

  btnGroup.append(pitchBtn, detailButton);
  footer.append(price, btnGroup);
  body.append(badges, title, location, facts, footer);
  article.append(cover, body);
  return article;
}

function createPropertyTableRow(item) {
  const tr = document.createElement('tr');
  if (cmsState.selectedPropertyIds.has(item.id)) {
    tr.classList.add('selected');
  }

  // Checkbox
  const tdCb = document.createElement('td');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = cmsState.selectedPropertyIds.has(item.id);
  cb.addEventListener('change', () => {
    if (cb.checked) {
      cmsState.selectedPropertyIds.add(item.id);
      tr.classList.add('selected');
    } else {
      cmsState.selectedPropertyIds.delete(item.id);
      tr.classList.remove('selected');
    }
    updateBulkActionBar();
  });
  tdCb.append(cb);

  // Thumbnail
  const tdThumb = document.createElement('td');
  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'cms-table-thumb-wrap';
  const img = document.createElement('img');
  img.className = 'cms-table-thumb';
  const imgSrc = driveImage(item.coverImage);
  img.src = imgSrc || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="%23eef2ed"><rect width="48" height="48"/></svg>';
  img.alt = item.address || 'BĐS';
  img.loading = 'lazy';
  img.addEventListener('click', () => {
    const allImgs = item.images && item.images.length ? item.images.map(x => driveImage(x.url)) : (imgSrc ? [imgSrc] : []);
    if (allImgs.length) openLightbox(allImgs, 0, item.address);
  });
  thumbWrap.append(img);
  if (item.imageCount > 1) {
    const cnt = document.createElement('span');
    cnt.className = 'cms-table-thumb-count';
    cnt.textContent = item.imageCount;
    thumbWrap.append(cnt);
  }
  tdThumb.append(thumbWrap);

  // Address & District
  const tdAddr = document.createElement('td');
  tdAddr.innerHTML = `
    <div class="cms-table-addr-title">${item.address || 'Hồ sơ chưa có địa chỉ'}</div>
    <div class="cms-table-addr-sub">${[item.ward, item.district].filter(Boolean).join(', ') || 'Chưa rõ khu vực'}</div>
  `;

  // Type
  const tdType = document.createElement('td');
  const isSaleRow = item.listingType === 'sale';
  tdType.innerHTML = `
    <div>${escapeHtml(item.propertyType || 'Chưa rõ')}</div>
    <span class="cms-badge ${isSaleRow ? 'cms-badge-sale' : 'cms-badge-rent'}" style="font-size: 10.5px; padding: 2px 7px; margin-top: 4px; display: inline-block;">${isSaleRow ? 'Cần bán' : 'Cho thuê'}</span>
  `;

  // Specs
  const tdSpecs = document.createElement('td');
  tdSpecs.innerHTML = `<div>${item.dimensions || item.area || '—'}</div><small style="color:var(--muted);">${item.structure || (item.bedrooms ? item.bedrooms + ' PN' : '')}</small>`;

  // Price
  const tdPrice = document.createElement('td');
  tdPrice.className = 'cms-table-price';
  tdPrice.textContent = item.price || 'Liên hệ';

  // Status
  const tdStatus = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'cms-badge';
  badge.textContent = statusLabel(item.status);
  tdStatus.append(badge);

  // Actions
  const tdActions = document.createElement('td');
  tdActions.className = 'cms-table-actions';

  const pitchBtn = document.createElement('button');
  pitchBtn.className = 'cms-table-btn';
  pitchBtn.title = 'Sao chép tin gửi khách';
  pitchBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Chép</span>';
  pitchBtn.addEventListener('click', () => handleCopyPitch(formatPropertyPitch(item)));

  const detailBtn = document.createElement('button');
  detailBtn.className = 'cms-table-btn primary';
  detailBtn.textContent = 'Chi tiết';
  detailBtn.addEventListener('click', () => openPropertyDetail(item.id));

  tdActions.append(pitchBtn, detailBtn);

  tr.append(tdCb, tdThumb, tdAddr, tdType, tdSpecs, tdPrice, tdStatus, tdActions);
  return tr;
}

function updateBulkActionBar() {
  const bar = byId('bulkActionBar');
  const countElem = byId('bulkSelectedCount');
  if (!bar || !countElem) return;
  const count = cmsState.selectedPropertyIds.size;
  countElem.textContent = count;
  bar.hidden = count === 0;
}

function detailRow(label, value) {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  const textVal = value === null || value === undefined || value === '' ? 'Chưa cập nhật' : String(value);
  if (label === 'Điện thoại' && textVal !== 'Chưa cập nhật' && !textVal.includes('*')) {
    const cleanNum = textVal.replace(/[^0-9+]/g, '');
    const displayPhone = formatPhoneDisplay(cleanNum) || textVal;
    const callLink = document.createElement('a');
    callLink.href = `tel:${cleanNum}`;
    callLink.className = 'cms-phone-call-link';
    callLink.title = `Số điện thoại: ${displayPhone}`;
    callLink.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> <strong style="letter-spacing: 0.3px;">${escapeHtml(displayPhone)}</strong> <span class="cms-phone-badge">Gọi ngay</span>`;
    description.appendChild(callLink);
  } else {
    description.textContent = textVal;
  }
  wrapper.append(term, description);
  return wrapper;
}

async function openPropertyDetail(id) {
  const dialog = byId('propertyDetail');
  byId('detailTitle').textContent = 'Đang tải hồ sơ…';
  byId('detailLoading').hidden = false;
  byId('detailError').hidden = true;
  byId('detailContent').hidden = true;
  byId('detailEdit').hidden = true;
  byId('detailEditForm').hidden = true;
  dialog.showModal();
  try {
    const result = await cmsApi(`/api/admin/v1/properties/${encodeURIComponent(id)}`);
    const item = result.data.property;
    cmsState.currentProperty = item;
    byId('detailTitle').textContent = item.address || 'Hồ sơ chưa có địa chỉ';
    const gallery = byId('detailGallery');
    if (item.images && item.images.length) {
      const allUrls = item.images.map(entry => driveImage(entry.url));
      gallery.replaceChildren(...item.images.slice(0, 8).map((entry, index) => {
        const image = document.createElement('img');
        image.src = driveImage(entry.url);
        image.alt = `Ảnh bất động sản ${index + 1}`;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.style.cursor = 'pointer';
        image.title = 'Nhấn để phóng to ảnh';
        image.addEventListener('click', () => openLightbox(allUrls, index, item.address));
        image.onerror = () => { image.style.opacity = '0.4'; };
        return image;
      }));
    } else {
      const empty = document.createElement('div');
      empty.className = 'cms-detail-no-image';
      empty.textContent = 'Hồ sơ chưa có hình ảnh';
      gallery.replaceChildren(empty);
    }
    byId('detailFacts').replaceChildren(
      detailRow('Hình thức', item.listingType === 'sale' ? 'Cần bán' : 'Cho thuê'),
      detailRow('Loại bất động sản', item.propertyType), detailRow('Giá', item.price),
      detailRow('Diện tích', item.area), detailRow('Kích thước', item.dimensions),
      detailRow('Phòng ngủ', item.bedrooms), detailRow('Phòng tắm', item.bathrooms),
      detailRow('Kết cấu', item.structure), detailRow('Pháp lý', item.legal),
      detailRow('Phường / xã', item.ward), detailRow('Quận / huyện', item.district)
    );

    // RBAC: Sales, Editor, Manager, Super Admin see full phone. Viewer gets masked phone.
    const canSeeSensitive = ['super_admin', 'manager', 'editor', 'sales'].includes(cmsState.user?.role);
    const displayPhone = canSeeSensitive
      ? (item.phone || 'Chưa cập nhật')
      : (item.phone ? String(item.phone).slice(0, 3) + '******* (Ẩn)' : 'Chưa cập nhật');

    const displayOwnerName = canSeeSensitive ? (item.ownerName || 'Chưa cập nhật tên') : 'Chủ nhà';
    const displayOwnerRole = canSeeSensitive ? (item.ownerRole || 'Chủ nhà trực tiếp') : 'Bảo mật';

    byId('detailOperations').replaceChildren(
      detailRow('Tên chủ nhà', displayOwnerName),
      detailRow('Vai trò', displayOwnerRole),
      detailRow('Điện thoại', displayPhone),
      detailRow('Hoa hồng', item.commission),
      detailRow('Trạng thái', statusLabel(item.status)),
      detailRow('Số ảnh', item.imageCount),
      detailRow('Ngày tiếp nhận', formatDate(item.receivedAt)),
      detailRow('Cập nhật', formatDate(item.updatedAt)),
      detailRow('Ghi chú', item.notes)
    );

    // Cross-Property Linking: Giỏ hàng cùng chủ nhà
    const relatedBox = byId('detailOwnerRelated');
    if (relatedBox) {
      if (canSeeSensitive && item.phone && item.phone.length >= 8) {
        relatedBox.hidden = false;
        relatedBox.innerHTML = `
          <div style="margin-top: 14px; padding: 12px 14px; background: #f6f9f6; border: 1px solid #dce8dd; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
            <div style="font-size: 13px; color: var(--forest);">
              <strong style="display: flex; align-items: center; gap: 6px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                <span>Giỏ hàng cùng chủ:</span>
              </strong>
              <span style="color: var(--muted); font-size: 12px;">Tra cứu các căn khác cùng SĐT này</span>
            </div>
            <button type="button" class="cms-page-btn" id="btnFindOwnerProperties" style="height: 32px; padding: 0 12px; font-size: 12px; font-weight: 600;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Xem các căn cùng SĐT</span>
            </button>
          </div>
        `;
        const btnFind = byId('btnFindOwnerProperties');
        if (btnFind) {
          btnFind.onclick = () => {
            byId('propertyDetail').close();
            const searchInput = byId('propertySearch');
            if (searchInput) {
              searchInput.value = item.phone;
              if (byId('propertySearchClear')) byId('propertySearchClear').hidden = false;
            }
            setActivePage('properties');
            loadProperties(1);
          };
        }
      } else {
        relatedBox.hidden = true;
      }
    }
    const hasSource = Boolean(item.rawText) && canSeeSensitive;
    byId('detailSourceSection').hidden = !hasSource;
    byId('detailSource').textContent = hasSource ? item.rawText : '';
    byId('detailLoading').hidden = true;
    byId('detailContent').hidden = false;
    byId('detailEdit').hidden = !['super_admin', 'manager', 'editor'].includes(cmsState.user?.role);
    if (byId('btnPostFacebook')) {
      byId('btnPostFacebook').hidden = !['super_admin', 'manager', 'editor', 'sales'].includes(cmsState.user?.role);
      byId('btnPostFacebook').onclick = () => openFacebookStudio(item.id);
    }
    if (byId('btnPushNotification')) {
      byId('btnPushNotification').hidden = !['super_admin', 'manager', 'editor', 'sales'].includes(cmsState.user?.role);
      byId('btnPushNotification').onclick = () => openPushStudio(item);
    }

    // Workflow actions
    const canManageWorkflow = ['super_admin', 'manager'].includes(cmsState.user?.role);
    if (byId('btnWorkflowPublish')) byId('btnWorkflowPublish').hidden = !canManageWorkflow || item.status === 'ready';
    if (byId('btnWorkflowArchive')) byId('btnWorkflowArchive').hidden = !canManageWorkflow || item.status === 'archived';
    if (byId('btnWorkflowRestore')) byId('btnWorkflowRestore').hidden = !canManageWorkflow || item.status !== 'archived';
  } catch (error) {
    byId('detailLoading').hidden = true;
    byId('detailError').hidden = false;
    byId('detailError').textContent = `${error.code || 'REQUEST_FAILED'} · ${error.message}`;
  }
}

function setEditFormVisible(visible) {
  const form = byId('detailEditForm');
  form.hidden = !visible;
  byId('editValidationResult').hidden = true;
  if (!visible || !cmsState.currentProperty) return;
  const item = cmsState.currentProperty;
  for (const [name, value] of Object.entries({
    address: item.address, property_type: item.propertyType,
    listing_type: item.listingType || (String(item.price || '').includes('tỷ') ? 'sale' : 'rent'),
    owner_name: item.ownerName, owner_role: item.ownerRole,
    price_text: item.price, area_text: item.area, dimensions: item.dimensions, phone: item.phone,
    bedrooms: item.bedrooms, bathrooms: item.bathrooms, legal: item.legal, structure: item.structure, notes: item.notes
  })) {
    if (form.elements[name]) form.elements[name].value = value ?? '';
  }
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleSavePropertyEdit() {
  const item = cmsState.currentProperty;
  if (!item) return;
  const form = byId('detailEditForm');
  const resultBox = byId('editValidationResult');
  const submitBtn = byId('editSave');
  resultBox.hidden = false;
  resultBox.className = 'cms-validation-result';
  resultBox.textContent = 'Đang lưu thay đổi vào cơ sở dữ liệu…';
  submitBtn.disabled = true;

  const fields = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await cmsApi(`/api/admin/v1/properties/${encodeURIComponent(item.id)}/update`, {
      method: 'POST',
      body: { fields }
    });
    resultBox.classList.add('ok');
    resultBox.textContent = result.message || 'Đã lưu thay đổi hồ sơ thành công!';
    submitBtn.disabled = false;
    
    // Reload detail and list
    await openPropertyDetail(item.id);
    cmsState.propertiesLoaded = false;
    loadProperties(cmsState.propertyPage);
    loadDashboard();
  } catch (error) {
    submitBtn.disabled = false;
    resultBox.classList.add('error');
    resultBox.textContent = error.message || 'Không thể lưu thay đổi';
  }
}

async function handlePropertyWorkflow(command) {
  const item = cmsState.currentProperty;
  if (!item) return;
  const commandLabels = { publish: 'Xuất bản', archive: 'Lưu trữ (Đã giao dịch)', restore: 'Mở lại giao dịch' };
  if (!confirm(`Bạn có chắc muốn ${commandLabels[command] || command} hồ sơ này?`)) return;
  try {
    await cmsApi(`/api/admin/v1/properties/${encodeURIComponent(item.id)}/workflow`, {
      method: 'POST',
      body: { command }
    });
    await openPropertyDetail(item.id);
    cmsState.propertiesLoaded = false;
    loadProperties(cmsState.propertyPage);
    loadDashboard();
  } catch (error) {
    alert(`Không thể chuyển trạng thái: ${error.message}`);
  }
}

async function validateEditPreview(event) {
  event.preventDefault();
  handleSavePropertyEdit();
}

async function loadProperties(page = cmsState.propertyPage) {
  cmsState.propertyPage = page;
  byId('propertyLoading').hidden = false;
  byId('propertyGrid').hidden = true;
  if (byId('propertyTableWrap')) byId('propertyTableWrap').hidden = true;
  byId('propertyEmpty').hidden = true;
  byId('propertyPagination').hidden = true;
  byId('propertyError').hidden = true;

  // Render skeleton cards while loading
  const loadingContainer = byId('propertyLoading');
  if (loadingContainer) {
    loadingContainer.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:20px;width:100%;">
        ${Array.from({ length: 6 }).map(() => `
          <div class="cms-skeleton-card">
            <div class="cms-skeleton-img"></div>
            <div class="cms-skeleton-body">
              <div class="cms-skeleton-line w-80"></div>
              <div class="cms-skeleton-line w-50"></div>
              <div class="cms-skeleton-line w-30"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const districtFilter = byId('propertyDistrict')?.value || '';
  const propertyTypeFilter = byId('propertyTypeFilter')?.value || '';
  const priceRangeFilter = byId('propertyPriceRange')?.value || '';
  const listingTypeFilter = cmsState.currentListingType || 'all';
  const params = new URLSearchParams({
    q: (byId('propertySearch')?.value || '').trim(),
    district: districtFilter,
    propertyType: propertyTypeFilter,
    priceRange: priceRangeFilter,
    listingType: listingTypeFilter,
    status: byId('propertyStatus')?.value || 'active',
    quality: byId('propertyQuality')?.value || 'all',
    page: String(page),
    pageSize: '12'
  });

  try {
    const result = await cmsApi(`/api/admin/v1/properties?${params}`);
    cmsState.propertiesLoaded = true;
    cmsState.propertyMeta = result.meta;
    byId('propertyLoading').hidden = true;
    byId('propertyCount').textContent = `${result.meta.total.toLocaleString('vi-VN')} hồ sơ phù hợp`;

    const badgeProps = byId('navBadgeProperties');
    if (badgeProps) {
      badgeProps.textContent = result.meta.total > 999 ? '999+' : result.meta.total;
      badgeProps.hidden = result.meta.total === 0;
    }

    if (!result.data.items.length) {
      byId('propertyEmpty').hidden = false;
      return;
    }

    let items = [...result.data.items];
    cmsState.currentPropertyItems = items;

    const sortVal = byId('propertySort')?.value || 'newest';
    if (sortVal === 'price_asc') {
      items.sort((a, b) => (a.priceNumber || 0) - (b.priceNumber || 0));
    } else if (sortVal === 'price_desc') {
      items.sort((a, b) => (b.priceNumber || 0) - (a.priceNumber || 0));
    } else if (sortVal === 'images_desc') {
      items.sort((a, b) => (b.imageCount || 0) - (a.imageCount || 0));
    }

    const grid = byId('propertyGrid');
    grid.replaceChildren(...items.map(createPropertyCard));

    const tableBody = byId('propertyTableBody');
    if (tableBody) {
      tableBody.replaceChildren(...items.map(createPropertyTableRow));
    }

    const isGrid = cmsState.viewMode === 'grid';
    grid.hidden = !isGrid;
    if (byId('propertyTableWrap')) byId('propertyTableWrap').hidden = isGrid;

    byId('propertyPagination').hidden = false;
    byId('propertyPage').textContent = `Trang ${result.meta.page} / ${Math.max(1, Math.ceil(result.meta.total / result.meta.pageSize))}`;
    byId('propertyPrev').disabled = result.meta.page <= 1;
    byId('propertyNext').disabled = !result.meta.hasNext;

    const selectAllCb = byId('selectAllProperties');
    if (selectAllCb) selectAllCb.checked = false;
    updateBulkActionBar();
  } catch (error) {
    byId('propertyLoading').hidden = true;
    byId('propertyError').hidden = false;
    byId('propertyError').textContent = `${error.code || 'REQUEST_FAILED'} · ${error.message}`;
  }
}

function formatMatchCriteria(criteria = {}) {
  const parts = [];
  if (criteria.district) parts.push(criteria.district);
  if (criteria.propertyType) parts.push(criteria.propertyType);
  if (criteria.minPrice || criteria.maxPrice) {
    const formatMoney = value => value ? `${Number(value / 1000000).toLocaleString('vi-VN')} triệu` : '';
    const range = criteria.minPrice && criteria.maxPrice
      ? `${formatMoney(criteria.minPrice)} – ${formatMoney(criteria.maxPrice)}`
      : criteria.maxPrice ? `Tối đa ${formatMoney(criteria.maxPrice)}` : `Từ ${formatMoney(criteria.minPrice)}`;
    parts.push(range);
  }
  if (criteria.dimensions) parts.push(criteria.dimensions);
  if (criteria.bedrooms) parts.push(`${criteria.bedrooms} phòng ngủ`);
  return parts.length ? parts.join(' · ') : 'Đang xếp hạng theo độ đầy đủ của hồ sơ';
}

function createMatchItem(item) {
  const article = document.createElement('article');
  article.className = 'cms-match-item';

  const header = document.createElement('header');
  header.className = 'cms-match-header';
  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = item.address || 'Hồ sơ chưa có địa chỉ';
  const location = document.createElement('p');
  location.textContent = [item.propertyType, item.ward, item.district].filter(Boolean).join(' · ') || 'TP.HCM';
  heading.append(title, location);
  const score = document.createElement('span');
  score.className = `cms-score-badge ${item.matchScore >= 80 ? 'top' : item.matchScore >= 60 ? 'medium' : 'low'}`;
  score.textContent = `${item.matchScore || 0}% khớp`;
  header.append(heading, score);

  const body = document.createElement('div');
  body.className = 'cms-match-body';
  const facts = document.createElement('div');
  facts.className = 'cms-match-facts';
  [
    ['Giá', item.price || 'Liên hệ'],
    ['Diện tích', item.area || item.dimensions || 'Chưa rõ'],
    ['Hình ảnh', `${item.imageCount || 0} ảnh`]
  ].forEach(([label, value]) => {
    const fact = document.createElement('div');
    const factLabel = document.createElement('span');
    const factValue = document.createElement('strong');
    factLabel.textContent = label;
    factValue.textContent = value;
    fact.append(factLabel, factValue);
    facts.append(fact);
  });

  const reasons = document.createElement('div');
  reasons.className = 'cms-match-reasons';
  (item.reasons || []).slice(0, 5).forEach(reason => {
    const row = document.createElement('div');
    row.className = `cms-match-reason-item ${reason.pass ? 'pass' : 'fail'}`;
    const dot = document.createElement('i');
    dot.className = 'cms-match-reason-dot';
    const label = document.createElement('span');
    label.textContent = reason.label;
    row.append(dot, label);
    reasons.append(row);
  });
  body.append(facts, reasons);

  const footer = document.createElement('footer');
  footer.className = 'cms-match-footer';
  const price = document.createElement('strong');
  price.className = 'cms-match-price';
  price.textContent = item.price || 'Liên hệ';
  const actions = document.createElement('div');
  actions.className = 'cms-match-card-actions';
  const copyButton = document.createElement('button');
  copyButton.className = 'cms-copy-pitch-btn';
  copyButton.type = 'button';
  copyButton.textContent = 'Chép tin gửi khách';
  copyButton.addEventListener('click', () => handleCopyPitch(item.pitchText || formatPropertyPitch(item)));
  const detailButton = document.createElement('button');
  detailButton.className = 'cms-card-action';
  detailButton.type = 'button';
  detailButton.textContent = 'Xem hồ sơ';
  detailButton.addEventListener('click', () => openPropertyDetail(item.id));
  actions.append(copyButton, detailButton);
  footer.append(price, actions);
  article.append(header, body, footer);
  return article;
}

async function loadSmartMatch(queryOverride = '') {
  const queryInput = byId('smartMatchQuery');
  const query = String(queryOverride || queryInput?.value || '').trim();
  const submitButton = byId('smartMatchForm')?.querySelector('[type="submit"]');
  const errorBox = byId('matchError');

  if (!query) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = 'Nhập nhu cầu của khách trước khi tìm nhà phù hợp.';
    }
    showToast('Vui lòng nhập nhu cầu tìm nhà của khách', 'warning');
    queryInput?.focus();
    return;
  }

  if (errorBox) errorBox.hidden = true;
  if (byId('matchMeta')) byId('matchMeta').hidden = true;
  if (byId('matchGrid')) byId('matchGrid').hidden = true;
  if (byId('matchEmpty')) byId('matchEmpty').hidden = true;
  if (byId('matchLoading')) byId('matchLoading').hidden = false;
  if (submitButton) {
    submitButton.disabled = true;
    const span = submitButton.querySelector('span');
    if (span) span.textContent = 'Đang quét kho nhà…';
  }

  try {
    const result = await cmsApi('/api/admin/v1/smart-match', {
      method: 'POST',
      body: { query }
    });
    const data = result.data || {};
    const items = Array.isArray(data.items) ? data.items : [];
    cmsState.matchLoaded = true;
    if (byId('matchLoading')) byId('matchLoading').hidden = true;
    if (byId('matchCount')) byId('matchCount').textContent = `${items.length} gợi ý phù hợp nhất`;
    if (byId('matchCriteriaSummary')) byId('matchCriteriaSummary').textContent = formatMatchCriteria(data.criteriaUsed);
    if (byId('matchMeta')) byId('matchMeta').hidden = false;

    if (!items.length) {
      if (byId('matchEmpty')) byId('matchEmpty').hidden = false;
      return;
    }

    const grid = byId('matchGrid');
    if (grid) {
      grid.replaceChildren(...items.map(createMatchItem));
      grid.hidden = false;
    }
  } catch (error) {
    if (byId('matchLoading')) byId('matchLoading').hidden = true;
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = `${error.code || 'MATCH_FAILED'} · ${error.message}`;
    }
    showToast(`Không thể khớp nhu cầu: ${error.message}`, 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      const span = submitButton.querySelector('span');
      if (span) span.textContent = 'Quét & Chấm Điểm Kho Nhà';
    }
  }
}

function createReviewItem(item) {
  const article = document.createElement('article');
  article.className = 'cms-review-item';
  const main = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = item.address;
  const location = document.createElement('p');
  location.textContent = [item.propertyType, item.ward, item.district].filter(Boolean).join(' · ');
  const issues = document.createElement('div');
  issues.className = 'cms-review-issues';
  item.issues.forEach(issue => { const badge = document.createElement('span'); badge.textContent = issue.label; issues.append(badge); });
  main.append(title, location, issues);
  const side = document.createElement('div');
  side.className = 'cms-review-side';
  const price = document.createElement('strong');
  price.textContent = item.price;
  const date = document.createElement('small');
  date.textContent = formatDate(item.receivedAt);
  const button = document.createElement('button');
  button.className = 'cms-card-action';
  button.type = 'button';
  button.textContent = 'Kiểm tra hồ sơ';
  button.addEventListener('click', () => openPropertyDetail(item.id));
  side.append(price, date, button);
  article.append(main, side);
  return article;
}

async function loadReviewQueue() {
  byId('reviewLoading').hidden = false;
  byId('reviewQueue').hidden = true;
  byId('reviewEmpty').hidden = true;
  byId('reviewError').hidden = true;
  try {
    const result = await cmsApi('/api/admin/v1/review-queue');
    cmsState.reviewLoaded = true;
    const { items, summary } = result.data;
    byId('reviewTotal').textContent = summary.total.toLocaleString('vi-VN');
    byId('reviewAddress').textContent = summary.missingAddress.toLocaleString('vi-VN');
    byId('reviewPrice').textContent = summary.missingPrice.toLocaleString('vi-VN');
    byId('reviewImages').textContent = summary.imageIssues.toLocaleString('vi-VN');
    byId('reviewLoading').hidden = true;

    const badgeReview = byId('navBadgeReview');
    if (badgeReview) {
      badgeReview.textContent = summary.total || 0;
      badgeReview.hidden = !summary.total;
    }

    if (!items.length) { byId('reviewEmpty').hidden = false; return; }
    byId('reviewQueue').replaceChildren(...items.map(createReviewItem));
    byId('reviewQueue').hidden = false;
  } catch (error) {
    byId('reviewLoading').hidden = true;
    byId('reviewError').hidden = false;
    byId('reviewError').textContent = `${error.code || 'REQUEST_FAILED'} · ${error.message}`;
  }
}

function healthRow(label, value, tone = '') {
  const row = document.createElement('div');
  const name = document.createElement('span');
  const status = document.createElement('b');
  name.textContent = label;
  status.textContent = value;
  if (tone) status.className = tone;
  row.append(name, status);
  return row;
}

async function loadSystemHealth() {
  byId('healthLoading').hidden = false;
  byId('healthContent').hidden = true;
  byId('healthError').hidden = true;
  try {
    const result = await cmsApi('/api/admin/v1/system/health');
    const health = result.data.health;
    cmsState.healthLoaded = true;
    byId('healthProperties').textContent = health.database.propertyCount.toLocaleString('vi-VN');
    byId('healthImages').textContent = health.database.imageCount.toLocaleString('vi-VN');
    byId('healthSchema').textContent = health.cms.schemaMode === 'cms' ? 'CMS' : 'Legacy';
    byId('healthWrites').textContent = health.cms.readyForWrite ? 'Sẵn sàng' : 'Đang khóa';
    byId('healthInspectedAt').textContent = new Date(health.inspectedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const statusNames = { partial: 'Đang xử lý', ready: 'Sẵn sàng', featured: 'Nổi bật', archived: 'Đã lưu trữ', rented: 'Đã giao dịch', raw: 'Dữ liệu thô', unknown: 'Chưa phân loại' };
    const statusRows = Object.entries(health.database.statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => healthRow(statusNames[status] || status, count.toLocaleString('vi-VN'), 'ok'));
    byId('healthStatuses').replaceChildren(...statusRows);
    const blockerRows = health.blockers.length
      ? health.blockers.map(blocker => healthRow(blocker, 'Chưa đạt', 'warn'))
      : [healthRow('Các điều kiện rollout', 'Đã đạt', 'ok')];
    byId('healthBlockers').replaceChildren(...blockerRows);
    byId('healthLoading').hidden = true;
    byId('healthContent').hidden = false;
  } catch (error) {
    byId('healthLoading').hidden = true;
    byId('healthError').hidden = false;
    byId('healthError').textContent = `${error.code || 'REQUEST_FAILED'} · ${error.message}`;
  }
}

async function loadOwners(force = false) {
  if (cmsState.ownersLoaded && !force) return;
  const loading = byId('ownersLoading');
  const errorBox = byId('ownersError');
  const emptyBox = byId('ownersEmpty');
  const container = byId('ownersContainer');
  if (!container) return;

  if (loading) loading.hidden = false;
  if (errorBox) errorBox.hidden = true;
  if (emptyBox) emptyBox.hidden = true;
  container.hidden = true;

  const search = (byId('ownersSearchInput')?.value || '').trim();
  const role = byId('ownersRoleFilter')?.value || 'all';
  const sort = byId('ownersSortSelect')?.value || 'properties_desc';

  const params = new URLSearchParams({
    q: search,
    role,
    sort
  });

  try {
    const res = await cmsApi(`/api/admin/v1/owners?${params}`);
    cmsState.ownersLoaded = true;
    cmsState.ownersData = res.data || { items: [], summary: {} };

    const summary = res.data?.summary || {};
    if (byId('ownersStatTotal')) byId('ownersStatTotal').textContent = summary.total ?? 0;
    if (byId('ownersStatDirect')) byId('ownersStatDirect').textContent = summary.directCount ?? 0;
    if (byId('ownersStatBroker')) byId('ownersStatBroker').textContent = summary.brokerCount ?? 0;
    if (byId('ownersStatMulti')) byId('ownersStatMulti').textContent = summary.multiCount ?? 0;

    const navBadge = byId('navBadgeOwners');
    if (navBadge) {
      navBadge.textContent = summary.total || 0;
      navBadge.hidden = false;
    }

    const items = res.data?.items || [];
    if (loading) loading.hidden = true;
    if (items.length === 0) {
      if (emptyBox) emptyBox.hidden = false;
      container.hidden = true;
      return;
    }

    if (emptyBox) emptyBox.hidden = true;
    container.hidden = false;
    container.replaceChildren(...items.map(createOwnerCard));
  } catch (err) {
    if (loading) loading.hidden = true;
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;flex-wrap:wrap;font-size:12.5px;">
          <span>Lỗi tải danh bạ chủ nhà: ${escapeHtml(err.message || 'Không thể kết nối')}</span>
          <button type="button" class="cms-page-btn" onclick="loadOwners(true)" style="height:28px;padding:0 8px;font-size:11.5px;">Thử lại</button>
        </div>
      `;
    }
  }
}

function formatPhoneDisplay(raw) {
  if (!raw) return '';
  const cleaned = String(raw).replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
  }
  return raw;
}

function createOwnerCard(owner) {
  const card = document.createElement('article');
  card.className = 'cms-owner-card';

  // Format phone
  const rawPhone = owner.rawPhone || owner.phone || '';
  const formattedPhone = formatPhoneDisplay(rawPhone);

  // Check if owner name is default fallback (e.g. "Chủ nhà (0797156570)" or starts with "Chủ nhà")
  const isDefaultOwnerName = !owner.name || owner.name.startsWith('Chủ nhà (') || owner.name.startsWith('Chủ nhà') || owner.name.startsWith('Chưa có');
  const displayName = isDefaultOwnerName
    ? (formattedPhone ? `Chủ sở hữu · ${formattedPhone}` : 'Chủ sở hữu BĐS')
    : owner.name;

  // Header: Avatar, Name, Role badge
  const header = document.createElement('div');
  header.className = 'cms-owner-header';

  const avatarGroup = document.createElement('div');
  avatarGroup.className = 'cms-owner-avatar-group';

  const avatar = document.createElement('div');
  avatar.className = 'cms-owner-avatar';

  if (!isDefaultOwnerName) {
    const cleanWords = String(owner.name)
      .replace(/[()0-9_.-]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (cleanWords.length >= 2) {
      const w1 = cleanWords[cleanWords.length - 2][0].toUpperCase();
      const w2 = cleanWords[cleanWords.length - 1][0].toUpperCase();
      avatar.textContent = `${w1}${w2}`;
    } else if (cleanWords.length === 1 && cleanWords[0].length > 0) {
      avatar.textContent = cleanWords[0].slice(0, 2).toUpperCase();
    } else {
      avatar.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  } else {
    avatar.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }

  const meta = document.createElement('div');
  meta.className = 'cms-owner-meta';

  const name = document.createElement('h3');
  name.className = 'cms-owner-name';
  name.textContent = displayName;

  const roleBadge = document.createElement('span');
  let roleClass = 'cms-owner-role-direct';
  if (owner.role.includes('Môi giới')) roleClass = 'cms-owner-role-broker';
  else if (owner.role.includes('Đầu chủ')) roleClass = 'cms-owner-role-internal';
  roleBadge.className = `cms-owner-role-badge ${roleClass}`;
  roleBadge.textContent = owner.role;

  meta.append(name, roleBadge);
  avatarGroup.append(avatar, meta);
  header.append(avatarGroup);

  // Contact box (Phone & Touch-friendly Action buttons)
  const contact = document.createElement('div');
  contact.className = 'cms-owner-contact-block';

  const phoneRow = document.createElement('div');
  phoneRow.className = 'cms-owner-phone-row';
  phoneRow.innerHTML = `
    <div class="cms-owner-phone-text">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="cms-phone-icon"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      <span class="cms-owner-phone">${escapeHtml(formattedPhone || owner.phone || 'Chưa cập nhật')}</span>
    </div>
  `;

  const canSeeSensitive = ['super_admin', 'manager', 'editor', 'sales'].includes(cmsState.user?.role);
  if (canSeeSensitive && rawPhone) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'cms-owner-copy-btn';
    copyBtn.title = 'Sao chép số điện thoại';
    copyBtn.setAttribute('aria-label', 'Sao chép số điện thoại');
    copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Chép</span>`;
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(rawPhone);
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Đã chép</span>`;
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Chép</span>`;
        }, 1500);
      }
    };
    phoneRow.append(copyBtn);
  }
  contact.append(phoneRow);

  if (canSeeSensitive && rawPhone) {
    const actionRow = document.createElement('div');
    actionRow.className = 'cms-owner-action-row';

    const callBtn = document.createElement('a');
    callBtn.className = 'cms-owner-btn-call';
    callBtn.href = `tel:${rawPhone}`;
    callBtn.setAttribute('aria-label', `Gọi cho ${formattedPhone}`);
    callBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      <span>Gọi ngay</span>
    `;

    const zaloBtn = document.createElement('a');
    zaloBtn.className = 'cms-owner-btn-zalo';
    zaloBtn.href = `https://zalo.me/${rawPhone}`;
    zaloBtn.target = '_blank';
    zaloBtn.rel = 'noopener';
    zaloBtn.setAttribute('aria-label', `Nhắn tin Zalo ${formattedPhone}`);
    zaloBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 40 40" fill="none"><path d="M20 3C10.61 3 3 10.16 3 19c0 3.4 1.13 6.54 3.06 9.1L4.1 36.1c-.24.78.48 1.5 1.26 1.26L13.1 34.9A17.2 17.2 0 0 0 20 35c9.39 0 17-7.16 17-16S29.39 3 20 3z" fill="#ffffff"/></svg>
      <span>Chat Zalo</span>
    `;

    actionRow.append(callBtn, zaloBtn);
    contact.append(actionRow);
  }

  // Summary of properties
  const summary = document.createElement('div');
  summary.className = 'cms-owner-props-summary';
  summary.innerHTML = `
    <span>Khu vực: <strong>${escapeHtml(owner.districtLabel || 'Chưa rõ')}</strong></span>
    <span>Ký gửi: <strong class="cms-owner-count-highlight">${owner.propertyCount} căn</strong></span>
  `;

  // Mini Property List
  const propsList = document.createElement('div');
  propsList.className = 'cms-owner-props-list';

  owner.properties.slice(0, 3).forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'cms-owner-prop-chip';
    const isSale = p.listingType === 'sale';
    const displayAddr = (!p.address || p.address === 'Chưa có địa chỉ')
      ? (p.district ? `BĐS tại ${p.ward ? p.ward + ', ' : ''}${p.district}` : 'Bất động sản')
      : p.address;

    chip.innerHTML = `
      <div class="cms-owner-prop-main">
        <span class="cms-owner-prop-addr">${escapeHtml(displayAddr)}</span>
      </div>
      <div class="cms-owner-prop-meta">
        <span class="cms-badge ${isSale ? 'cms-badge-sale' : 'cms-badge-rent'}">${isSale ? 'Bán' : 'Thuê'}</span>
        <span class="cms-owner-prop-price">${escapeHtml(p.price)}</span>
        <svg class="cms-owner-prop-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;
    chip.onclick = () => openPropertyDetail(p.id);
    propsList.append(chip);
  });

  if (owner.properties.length > 3) {
    const moreChip = document.createElement('div');
    moreChip.style.cssText = 'font-size: 11.5px; color: var(--muted); text-align: center; padding: 4px;';
    moreChip.textContent = `+ và ${owner.properties.length - 3} căn nhà khác`;
    propsList.append(moreChip);
  }

  // Footer Button: View all properties of this owner
  const footer = document.createElement('div');
  footer.className = 'cms-owner-card-footer';

  const viewAllBtn = document.createElement('button');
  viewAllBtn.type = 'button';
  viewAllBtn.className = 'cms-owner-view-btn';
  viewAllBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    <span>Xem toàn bộ giỏ hàng (${owner.propertyCount} căn)</span>
  `;
  viewAllBtn.onclick = () => {
    const searchInput = byId('propertySearch');
    if (searchInput) {
      searchInput.value = owner.rawPhone || owner.phone || owner.name;
      if (byId('propertySearchClear')) byId('propertySearchClear').hidden = false;
    }
    setActivePage('properties');
    loadProperties(1);
  };
  footer.append(viewAllBtn);

  card.append(header, contact, summary, propsList, footer);
  return card;
}

function openCreatePropertyModal() {
  const dialog = byId('createPropertyDialog');
  if (!dialog) return;
  byId('createPropertyError').hidden = true;
  byId('createPropertySuccess').hidden = true;
  byId('createPropertyForm').reset();
  byId('createSubmitBtn').disabled = false;
  byId('createSubmitBtn').textContent = 'Lưu hồ sơ vào kho';
  dialog.showModal();
}

function closeCreatePropertyModal() {
  const dialog = byId('createPropertyDialog');
  if (dialog) dialog.close();
}

async function handleCreateProperty(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = byId('createSubmitBtn');
  const errorBox = byId('createPropertyError');
  const successBox = byId('createPropertySuccess');
  errorBox.hidden = true;
  successBox.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang lưu vào kho…';

  const formData = new FormData(form);
  const fields = Object.fromEntries(formData.entries());

  try {
    const result = await cmsApi('/api/admin/v1/properties', {
      method: 'POST',
      body: fields
    });
    successBox.hidden = false;
    successBox.textContent = result.message || 'Đã thêm hồ sơ bất động sản vào kho thành công!';
    submitBtn.textContent = 'Đã lưu thành công ✓';
    
    // Refresh properties list and dashboard
    cmsState.propertiesLoaded = false;
    loadProperties(1);
    loadDashboard();
    
    setTimeout(() => {
      closeCreatePropertyModal();
    }, 1200);
  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Lưu hồ sơ vào kho';
    errorBox.hidden = false;
    errorBox.textContent = error.message || 'Không thể lưu hồ sơ';
  }
}

// ==========================================================================
// USER MANAGEMENT & RBAC FUNCTIONS
// ==========================================================================

async function loadUsers() {
  byId('userLoading').hidden = false;
  byId('userTableWrapper').hidden = true;
  byId('userError').hidden = true;
  loadAccessPins();
  try {
    const result = await cmsApi('/api/admin/v1/users');
    cmsState.usersLoaded = true;
    const { users, summary } = result.data;
    byId('userMetricTotal').textContent = summary.total.toLocaleString('vi-VN');
    byId('userMetricAdmins').textContent = (summary.superAdmin + summary.manager).toLocaleString('vi-VN');
    byId('userMetricSales').textContent = summary.sales.toLocaleString('vi-VN');
    byId('userMetricEditors').textContent = summary.editor.toLocaleString('vi-VN');

    const tbody = byId('userTableBody');
    tbody.replaceChildren(...users.map(createUserRow));
    byId('userLoading').hidden = true;
    byId('userTableWrapper').hidden = false;
  } catch (error) {
    byId('userLoading').hidden = true;
    byId('userError').hidden = false;
    byId('userError').textContent = `${error.code || 'REQUEST_FAILED'} · ${error.message}`;
  }
}

// ==========================================================================
// QUICK ACCESS PINS MANAGEMENT (ADMIN & CTV)
// ==========================================================================

async function loadAccessPins() {
  const alertBox = byId('pinSettingsAlert');
  const successBox = byId('pinSettingsSuccess');
  const lastUpdatedEl = byId('pinLastUpdated');
  const adminInput = byId('inputAdminPin');
  const ctvInput = byId('inputCtvPin');
  if (!adminInput || !ctvInput) return;

  if (alertBox) alertBox.hidden = true;
  if (successBox) successBox.hidden = true;
  if (lastUpdatedEl) lastUpdatedEl.textContent = 'Đang tải…';

  try {
    const result = await cmsApi('/api/admin/v1/access-pins');
    const { adminCode, ctvCode, updatedAt } = result.data || {};
    adminInput.value = adminCode || '246810';
    ctvInput.value = ctvCode || '135790';
    if (lastUpdatedEl) {
      if (updatedAt && updatedAt !== new Date(0).toISOString()) {
        const d = new Date(updatedAt);
        lastUpdatedEl.textContent = `Cập nhật: ${d.toLocaleTimeString('vi-VN')} ${d.toLocaleDateString('vi-VN')}`;
      } else {
        lastUpdatedEl.textContent = 'Mã mặc định';
      }
    }
  } catch (error) {
    if (lastUpdatedEl) lastUpdatedEl.textContent = 'Chưa tải được';
    if (alertBox) {
      alertBox.textContent = `Không thể tải mã PIN: ${error.message}`;
      alertBox.hidden = false;
    }
  }
}

async function handleSaveAccessPins(event) {
  if (event) event.preventDefault();
  const alertBox = byId('pinSettingsAlert');
  const successBox = byId('pinSettingsSuccess');
  const submitBtn = byId('btnSavePins');
  const lastUpdatedEl = byId('pinLastUpdated');
  const adminInput = byId('inputAdminPin');
  const ctvInput = byId('inputCtvPin');

  if (alertBox) alertBox.hidden = true;
  if (successBox) successBox.hidden = true;

  const adminCode = (adminInput?.value || '').trim();
  const ctvCode = (ctvInput?.value || '').trim();

  if (!adminCode || adminCode.length < 4) {
    if (alertBox) {
      alertBox.textContent = 'Mã PIN Quản trị viên phải từ 4 ký tự trở lên';
      alertBox.hidden = false;
    }
    adminInput?.focus();
    return;
  }
  if (!ctvCode || ctvCode.length < 4) {
    if (alertBox) {
      alertBox.textContent = 'Mã PIN Cộng tác viên phải từ 4 ký tự trở lên';
      alertBox.hidden = false;
    }
    ctvInput?.focus();
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Đang lưu…';
  }

  try {
    const result = await cmsApi('/api/admin/v1/access-pins', {
      method: 'PATCH',
      body: { adminCode, ctvCode }
    });

    if (successBox) {
      successBox.textContent = result.message || 'Đã cập nhật mã PIN Admin và CTV thành công!';
      successBox.hidden = false;
    }
    if (lastUpdatedEl) {
      const d = new Date();
      lastUpdatedEl.textContent = `Vừa xong (${d.toLocaleTimeString('vi-VN')})`;
    }
    showToast('Đã lưu thay đổi mã PIN Admin & CTV thành công!');
  } catch (error) {
    if (alertBox) {
      alertBox.textContent = `Lỗi: ${error.message}`;
      alertBox.hidden = false;
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'Lưu thay đổi mã PIN';
    }
  }
}

if (byId('pinSettingsForm')) {
  byId('pinSettingsForm').addEventListener('submit', handleSaveAccessPins);
}

document.querySelectorAll('.btn-toggle-pin').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = byId(targetId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.innerHTML = isPass
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });
});

if (byId('btnRandomPins')) {
  byId('btnRandomPins').addEventListener('click', () => {
    const generate6Digits = () => Math.floor(100000 + Math.random() * 900000).toString();
    const ctvInput = byId('inputCtvPin');
    if (ctvInput) {
      ctvInput.value = generate6Digits();
      ctvInput.type = 'text';
      showToast('Đã tạo ngẫu nhiên mã CTV mới!');
    }
  });
}


function createUserRow(user) {
  const tr = document.createElement('tr');
  
  // User cell
  const userTd = document.createElement('td');
  const userCell = document.createElement('div');
  userCell.className = 'cms-user-cell';
  const avatar = document.createElement('div');
  avatar.className = 'cms-user-avatar';
  avatar.textContent = getUserInitials(user.displayName);
  const info = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'cms-user-name';
  name.textContent = user.displayName;
  const id = document.createElement('div');
  id.className = 'cms-user-id';
  id.textContent = user.id;
  info.append(name, id);
  userCell.append(avatar, info);
  userTd.append(userCell);

  // Role cell
  const roleTd = document.createElement('td');
  const roleBadge = document.createElement('span');
  roleBadge.className = `cms-badge ${user.role}`;
  roleBadge.textContent = roleLabel(user.role);
  roleTd.append(roleBadge);

  // Status cell
  const statusTd = document.createElement('td');
  const statusBadge = document.createElement('span');
  statusBadge.className = `cms-badge ${user.isActive ? 'status-active' : 'status-disabled'}`;
  statusBadge.textContent = user.isActive ? 'Hoạt động' : 'Tạm khóa';
  statusTd.append(statusBadge);

  // Date cell
  const dateTd = document.createElement('td');
  dateTd.textContent = formatDate(user.createdAt);

  // Action cell
  const actionTd = document.createElement('td');
  actionTd.className = 'text-right';
  const editBtn = document.createElement('button');
  editBtn.className = 'cms-table-action-btn';
  editBtn.textContent = 'Sửa vai trò';
  editBtn.type = 'button';
  editBtn.addEventListener('click', () => openUserModal(user));

  const toggleBtn = document.createElement('button');
  toggleBtn.className = `cms-table-action-btn ${user.isActive ? 'danger' : ''}`;
  toggleBtn.textContent = user.isActive ? 'Khóa' : 'Mở khóa';
  toggleBtn.type = 'button';
  toggleBtn.addEventListener('click', () => toggleUserActive(user.id, user.isActive));

  actionTd.append(editBtn, toggleBtn);

  tr.append(userTd, roleTd, statusTd, dateTd, actionTd);
  return tr;
}

function openUserModal(user = null) {
  const dialog = byId('userDialog');
  byId('userFormError').hidden = true;
  byId('userForm').reset();
  if (user) {
    byId('userDialogTitle').textContent = 'Chỉnh sửa tài khoản & vai trò';
    byId('userIdInput').value = user.id;
    byId('userDisplayNameInput').value = user.displayName;
    byId('userRoleSelect').value = user.role;
    byId('userStatusSelect').value = String(user.isActive);
  } else {
    byId('userDialogTitle').textContent = 'Thêm thành viên mới';
    byId('userIdInput').value = '';
    byId('userDisplayNameInput').value = '';
    byId('userRoleSelect').value = 'sales';
    byId('userStatusSelect').value = 'true';
  }
  dialog.showModal();
}

function closeUserModal() {
  const dialog = byId('userDialog');
  if (dialog) dialog.close();
}

async function handleSaveUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = byId('userFormError');
  const submitBtn = byId('userSubmitBtn');
  errorBox.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang lưu…';

  const formData = new FormData(form);
  const fields = Object.fromEntries(formData.entries());
  const isEditing = Boolean(fields.id);

  try {
    await cmsApi(isEditing ? `/api/admin/v1/users?id=${encodeURIComponent(fields.id)}` : '/api/admin/v1/users', {
      method: isEditing ? 'PATCH' : 'POST',
      body: {
        id: fields.id || undefined,
        displayName: fields.displayName,
        role: fields.role,
        isActive: fields.isActive === 'true'
      }
    });
    closeUserModal();
    loadUsers();
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = error.message || 'Không thể lưu tài khoản';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Lưu thông tin';
  }
}

async function toggleUserActive(userId, currentStatus) {
  if (!confirm(`Bạn có chắc muốn ${currentStatus ? 'khóa' : 'mở khóa'} tài khoản này?`)) return;
  try {
    await cmsApi(`/api/admin/v1/users?id=${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: { isActive: !currentStatus }
    });
    loadUsers();
  } catch (error) {
    alert(`Không thể cập nhật trạng thái: ${error.message}`);
  }
}

// ==========================================================================
// ROLE SWITCHER & PROFILE POPUP
// ==========================================================================

function openProfileDialog() {
  const dialog = byId('profileDialog');
  if (!dialog || !cmsState.user) return;
  byId('profileModalName').textContent = cmsState.user.displayName;
  byId('profileModalRole').textContent = roleLabel(cmsState.user.role);
  byId('profileModalRole').className = `cms-badge ${cmsState.user.role}`;
  byId('profileModalAvatar').textContent = getUserInitials(cmsState.user.displayName);

  // Highlight current active role
  document.querySelectorAll('[data-switch-role]').forEach(card => {
    card.classList.toggle('active', card.dataset.switchRole === cmsState.user.role);
  });
  dialog.showModal();
}

function closeProfileDialog() {
  const dialog = byId('profileDialog');
  if (dialog) dialog.close();
}

async function handleSwitchRole(newRole) {
  try {
    const result = await cmsApi('/api/admin/v1/switch-role', {
      method: 'POST',
      body: { role: newRole }
    });
    cmsState.user = result.data.user;
    updateHeaderUser();
    closeProfileDialog();
    
    // Refresh current view with new permissions
    cmsState.propertiesLoaded = false;
    cmsState.usersLoaded = false;
    const activePanel = document.querySelector('[data-page-panel].active')?.dataset.pagePanel || 'dashboard';
    setActivePage(activePanel);
  } catch (error) {
    alert(`Không thể chuyển vai trò: ${error.message}`);
  }
}

byId('retryAuth').addEventListener('click', bootstrapCms);

// Property Filters & Live Reactive Search
let searchDebounceTimer = null;
const searchInput = byId('propertySearch');
const clearBtn = byId('propertySearchClear');

function updateMobilePropertyFilters() {
  const panel = byId('propertyAdvancedFilters');
  const toggle = byId('propertyMobileFilterToggle');
  const countBadge = byId('propertyActiveFilterCount');
  if (!panel || !toggle || !countBadge) return;

  const activeCount = [
    byId('propertyDistrict')?.value,
    byId('propertyTypeFilter')?.value,
    byId('propertyPriceRange')?.value,
    byId('propertyStatus')?.value !== 'active' ? byId('propertyStatus')?.value : '',
    byId('propertyQuality')?.value !== 'all' ? byId('propertyQuality')?.value : ''
  ].filter(Boolean).length;
  countBadge.textContent = String(activeCount);
  countBadge.hidden = activeCount === 0;
  toggle.classList.toggle('has-filters', activeCount > 0);
}

if (byId('propertyMobileFilterToggle')) {
  byId('propertyMobileFilterToggle').addEventListener('click', () => {
    const panel = byId('propertyAdvancedFilters');
    const isOpen = panel?.classList.toggle('mobile-open') || false;
    byId('propertyMobileFilterToggle').setAttribute('aria-expanded', String(isOpen));
  });
}

if (byId('btnMobileResetFilters')) {
  byId('btnMobileResetFilters').addEventListener('click', () => {
    byId('propertyResetFilters')?.click();
  });
}

if (byId('btnMobileApplyFilters')) {
  byId('btnMobileApplyFilters').addEventListener('click', () => {
    byId('propertyMobileFilterToggle')?.click();
  });
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    if (clearBtn) clearBtn.hidden = !searchInput.value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => loadProperties(1), 320);
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    clearBtn.hidden = true;
    loadProperties(1);
  });
}

if (byId('propertyFilters')) {
  byId('propertyFilters').addEventListener('submit', event => {
    event.preventDefault();
    loadProperties(1);
  });
}

if (byId('propertyDistrict')) byId('propertyDistrict').addEventListener('change', () => { updateMobilePropertyFilters(); loadProperties(1); });
if (byId('propertyTypeFilter')) byId('propertyTypeFilter').addEventListener('change', () => { updateMobilePropertyFilters(); loadProperties(1); });
if (byId('propertyPriceRange')) byId('propertyPriceRange').addEventListener('change', () => { updateMobilePropertyFilters(); loadProperties(1); });
if (byId('propertyStatus')) byId('propertyStatus').addEventListener('change', () => { updateMobilePropertyFilters(); loadProperties(1); });
if (byId('propertyQuality')) byId('propertyQuality').addEventListener('change', () => { updateMobilePropertyFilters(); loadProperties(1); });
if (byId('propertySort')) byId('propertySort').addEventListener('change', () => loadProperties(1));

document.querySelectorAll('.cms-listing-seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.listingFilter || 'all';
    cmsState.currentListingType = val;
    document.querySelectorAll('.cms-listing-seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('[data-filter-chip]').forEach(c => {
      if (['rent', 'sale', 'all'].includes(c.dataset.filterChip)) {
        c.classList.toggle('active', c.dataset.filterChip === val);
      }
    });
    updateMobilePropertyFilters();
    loadProperties(1);
  });
});

if (byId('propertyResetFilters')) {
  byId('propertyResetFilters').addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.hidden = true;
    if (byId('propertyDistrict')) byId('propertyDistrict').value = '';
    if (byId('propertyTypeFilter')) byId('propertyTypeFilter').value = '';
    if (byId('propertyPriceRange')) byId('propertyPriceRange').value = '';
    if (byId('propertyStatus')) byId('propertyStatus').value = 'active';
    if (byId('propertyQuality')) byId('propertyQuality').value = 'all';
    if (byId('propertySort')) byId('propertySort').value = 'newest';
    cmsState.currentListingType = 'all';
    document.querySelectorAll('.cms-listing-seg-btn').forEach(b => b.classList.toggle('active', (b.dataset.listingFilter || 'all') === 'all'));
    updateMobilePropertyFilters();
    loadProperties(1);
  });
}

updateMobilePropertyFilters();

// View Switcher (Grid / Table)
function setViewMode(mode) {
  cmsState.viewMode = mode;
  localStorage.setItem('fourland_cms_view_mode', mode);
  const isGrid = mode === 'grid';
  if (byId('btnViewGrid')) byId('btnViewGrid').classList.toggle('active', isGrid);
  if (byId('btnViewTable')) byId('btnViewTable').classList.toggle('active', !isGrid);
  if (byId('propertyGrid')) byId('propertyGrid').hidden = !isGrid;
  if (byId('propertyTableWrap')) byId('propertyTableWrap').hidden = isGrid;
}

if (byId('btnViewGrid')) byId('btnViewGrid').addEventListener('click', () => setViewMode('grid'));
if (byId('btnViewTable')) byId('btnViewTable').addEventListener('click', () => setViewMode('table'));

// Bulk Actions
if (byId('selectAllProperties')) {
  byId('selectAllProperties').addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    cmsState.selectedPropertyIds.clear();
    if (isChecked && cmsState.currentPropertyItems) {
      cmsState.currentPropertyItems.forEach(item => cmsState.selectedPropertyIds.add(item.id));
    }
    document.querySelectorAll('.cms-card-checkbox, .cms-table-responsive tbody input[type="checkbox"]').forEach(cb => {
      cb.checked = isChecked;
    });
    document.querySelectorAll('.cms-property-card, .cms-data-table tbody tr').forEach(el => {
      el.classList.toggle('selected', isChecked);
    });
    updateBulkActionBar();
  });
}

if (byId('bulkDeselectBtn')) {
  byId('bulkDeselectBtn').addEventListener('click', () => {
    cmsState.selectedPropertyIds.clear();
    const selectAllCb = byId('selectAllProperties');
    if (selectAllCb) selectAllCb.checked = false;
    document.querySelectorAll('.cms-card-checkbox, .cms-table-responsive tbody input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    document.querySelectorAll('.cms-property-card, .cms-data-table tbody tr').forEach(el => {
      el.classList.remove('selected');
    });
    updateBulkActionBar();
  });
}

if (byId('bulkPublishBtn')) {
  byId('bulkPublishBtn').addEventListener('click', async () => {
    const ids = Array.from(cmsState.selectedPropertyIds);
    if (!ids.length) return;
    if (!confirm(`Bạn có chắc muốn xuất bản ${ids.length} bất động sản đã chọn?`)) return;
    try {
      for (const id of ids) {
        await cmsApi(`/api/admin/v1/properties/${encodeURIComponent(id)}/workflow`, {
          method: 'POST',
          body: { command: 'publish' }
        });
      }
      showToast(`Đã xuất bản thành công ${ids.length} bất động sản!`, 'success');
      cmsState.selectedPropertyIds.clear();
      loadProperties(cmsState.propertyPage);
      loadDashboard();
    } catch (error) {
      showToast(`Lỗi xuất bản hàng loạt: ${error.message}`, 'error');
    }
  });
}

if (byId('bulkArchiveBtn')) {
  byId('bulkArchiveBtn').addEventListener('click', async () => {
    const ids = Array.from(cmsState.selectedPropertyIds);
    if (!ids.length) return;
    if (!confirm(`Bạn có chắc muốn lưu trữ ${ids.length} bất động sản đã chọn?`)) return;
    try {
      for (const id of ids) {
        await cmsApi(`/api/admin/v1/properties/${encodeURIComponent(id)}/workflow`, {
          method: 'POST',
          body: { command: 'archive' }
        });
      }
      showToast(`Đã lưu trữ ${ids.length} bất động sản!`, 'warning');
      cmsState.selectedPropertyIds.clear();
      loadProperties(cmsState.propertyPage);
      loadDashboard();
    } catch (error) {
      showToast(`Lỗi lưu trữ hàng loạt: ${error.message}`, 'error');
    }
  });
}

// Lightbox Navigation Events
if (byId('lightboxClose')) byId('lightboxClose').addEventListener('click', closeLightbox);
if (byId('lightboxPrev')) {
  byId('lightboxPrev').addEventListener('click', () => {
    if (!cmsState.lightbox.images.length) return;
    cmsState.lightbox.currentIndex = (cmsState.lightbox.currentIndex - 1 + cmsState.lightbox.images.length) % cmsState.lightbox.images.length;
    cmsState.lightbox.rotation = 0;
    updateLightbox();
  });
}
if (byId('lightboxNext')) {
  byId('lightboxNext').addEventListener('click', () => {
    if (!cmsState.lightbox.images.length) return;
    cmsState.lightbox.currentIndex = (cmsState.lightbox.currentIndex + 1) % cmsState.lightbox.images.length;
    cmsState.lightbox.rotation = 0;
    updateLightbox();
  });
}
if (byId('lightboxRotate')) {
  byId('lightboxRotate').addEventListener('click', () => {
    cmsState.lightbox.rotation = (cmsState.lightbox.rotation + 90) % 360;
    updateLightbox();
  });
}
if (byId('imageLightbox')) {
  byId('imageLightbox').addEventListener('click', (e) => {
    if (e.target === byId('imageLightbox')) closeLightbox();
  });
}

// Sidebar Toggle & Shortcuts Dialog
if (byId('btnToggleSidebar')) {
  byId('btnToggleSidebar').addEventListener('click', () => {
    const sidebar = byId('cmsSidebar');
    if (!sidebar) return;
    if (window.matchMedia('(max-width: 600px)').matches) {
      const isOpen = sidebar.classList.toggle('mobile-open');
      document.body.classList.toggle('cms-mobile-menu-open', isOpen);
      byId('btnToggleSidebar').setAttribute('aria-expanded', String(isOpen));
      return;
    }
    sidebar.classList.toggle('collapsed');
  });
}

document.querySelectorAll('#cmsSidebar [data-page]').forEach((item) => {
  item.addEventListener('click', () => {
    if (!window.matchMedia('(max-width: 600px)').matches) return;
    byId('cmsSidebar')?.classList.remove('mobile-open');
    document.body.classList.remove('cms-mobile-menu-open');
    byId('btnToggleSidebar')?.setAttribute('aria-expanded', 'false');
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  byId('cmsSidebar')?.classList.remove('mobile-open');
  document.body.classList.remove('cms-mobile-menu-open');
  byId('btnToggleSidebar')?.setAttribute('aria-expanded', 'false');
});

if (byId('btnShortcuts')) {
  byId('btnShortcuts').addEventListener('click', () => {
    const dlg = byId('shortcutDialog');
    if (dlg) dlg.showModal();
  });
}
if (byId('shortcutClose')) {
  byId('shortcutClose').addEventListener('click', () => {
    const dlg = byId('shortcutDialog');
    if (dlg) dlg.close();
  });
}
byId('shortcutDialog')?.addEventListener('click', (e) => {
  if (e.target === byId('shortcutDialog')) byId('shortcutDialog').close();
});

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  // Ignore inside inputs/textareas for normal characters
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  const isInput = ['input', 'textarea', 'select'].includes(activeTag);

  // Esc closes open dialogs / lightbox
  if (e.key === 'Escape') {
    const openDialogs = document.querySelectorAll('dialog[open]');
    openDialogs.forEach(d => d.close());
    return;
  }

  // Lightbox Arrow Keys
  const lb = byId('imageLightbox');
  if (lb && lb.open) {
    if (e.key === 'ArrowLeft') {
      byId('lightboxPrev')?.click();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      byId('lightboxNext')?.click();
      e.preventDefault();
    }
    return;
  }

  // Ctrl+S / Cmd+S: Save edit form if open
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const editForm = byId('detailEditForm');
    if (editForm && !editForm.hidden) {
      e.preventDefault();
      handleSavePropertyEdit();
    }
    return;
  }

  // Focus Search with / or Ctrl+K
  if ((e.key === '/' && !isInput) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    const activePage = document.querySelector('[data-page-panel].active')?.dataset.pagePanel;
    if (activePage === 'match') {
      const q = byId('smartMatchQuery');
      if (q) { q.focus(); q.select(); }
    } else {
      const s = byId('propertySearch');
      if (s) { s.focus(); s.select(); }
    }
    return;
  }

  // Alt + 1..6: Switch Navigation Tabs
  if (e.altKey && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
    const pages = ['dashboard', 'match', 'properties', 'editor', 'users', 'sync'];
    const idx = Number(e.key) - 1;
    if (pages[idx]) {
      e.preventDefault();
      setActivePage(pages[idx]);
    }
  }
});

function showToast(message, type = 'success', duration = 3200) {
  let container = byId('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'cms-toast-container';
    document.body.append(container);
  }
  const toast = document.createElement('div');
  toast.className = `cms-toast-card ${type}`;

  let iconSvg = '<svg class="cms-toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
  if (type === 'error') {
    iconSvg = '<svg class="cms-toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else if (type === 'warning') {
    iconSvg = '<svg class="cms-toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  } else if (type === 'info') {
    iconSvg = '<svg class="cms-toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  toast.innerHTML = `
    ${iconSvg}
    <div class="cms-toast-content">
      <span>${message}</span>
    </div>
    <button class="cms-toast-close" type="button" aria-label="Đóng">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  toast.querySelector('.cms-toast-close').addEventListener('click', () => {
    toast.remove();
  });

  container.append(toast);

  setTimeout(() => {
    toast.style.transition = 'all 0.25s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function handleCopyPitch(pitchText) {
  if (!pitchText) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pitchText).then(() => {
      showToast('Đã sao chép tin nhắn Zalo gửi khách thành công!');
    }).catch(() => fallbackCopy(pitchText));
  } else {
    fallbackCopy(pitchText);
  }
}

function fallbackCopy(text) {
  const input = document.createElement('textarea');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
document.body.removeChild(input);
  showToast('Đã sao chép tin nhắn Zalo gửi khách thành công!');
}

document.querySelectorAll('[data-switch-role]').forEach(card => {
  card.addEventListener('click', () => handleSwitchRole(card.dataset.switchRole));
});

// Smart Match Events
if (byId('smartMatchForm')) {
  byId('smartMatchForm').addEventListener('submit', event => {
    event.preventDefault();
    loadSmartMatch();
  });
}

document.querySelectorAll('.cms-chip[data-query]').forEach(chip => {
  chip.addEventListener('click', () => {
    const query = chip.dataset.query;
    byId('smartMatchQuery').value = query;
    loadSmartMatch(query);
  });
});

// Login & Logout Events
if (byId('cmsLoginForm')) {
  byId('cmsLoginForm').addEventListener('submit', event => {
    event.preventDefault();
    const email = byId('loginEmail').value;
    const password = byId('loginPassword').value;
    handleLogin({ email, password });
  });
}

document.querySelectorAll('[data-demo-role]').forEach(btn => {
  btn.addEventListener('click', () => {
    handleLogin({ role: btn.dataset.demoRole });
  });
});

if (byId('btnLogoutTopbar')) byId('btnLogoutTopbar').addEventListener('click', handleLogout);
if (byId('btnLogoutModal')) byId('btnLogoutModal').addEventListener('click', handleLogout);

// ==========================================================================
// FACEBOOK POST STUDIO & COMPOSIO MCP CLIENT
// ==========================================================================

const fbState = {
  propertyId: null,
  tone: 'hot',
  content: '',
  allImages: [],
  selectedImages: new Set(),
  selectedPageIds: new Set(['106656702112510']),
  selectedPageId: '106656702112510',
  pageName: 'Ngọc Nhà Tốt',
  pages: []
};

function renderFacebookChannels() {
  const container = byId('fbChannelList');
  if (!container) return;
  const pages = Array.isArray(fbState.pages) && fbState.pages.length > 0
    ? fbState.pages
    : (Array.isArray(fbPagesCache) && fbPagesCache.length > 0 ? fbPagesCache : [{
        pageId: '106656702112510',
        name: 'Ngọc Nhà Tốt',
        isDefault: true,
        category: 'Trang BĐS Fourland'
      }]);

  if (fbState.selectedPageIds.size === 0 && pages.length > 0) {
    const defaultPage = pages.find(p => p.isDefault) || pages[0];
    fbState.selectedPageIds.add(String(defaultPage.pageId));
  }

  container.innerHTML = pages.map(p => {
    const pid = String(p.pageId);
    const isChecked = fbState.selectedPageIds.has(pid);
    return `
      <label class="cms-fb-channel-card ${isChecked ? 'checked' : ''}" data-fb-channel-id="${escapeHtml(pid)}">
        <input type="checkbox" name="fbChannel" value="${escapeHtml(pid)}" ${isChecked ? 'checked' : ''}>
        <img class="cms-fb-card-avatar" src="https://graph.facebook.com/${escapeHtml(pid)}/picture?type=large" alt="${escapeHtml(p.name)}" onerror="this.src='https://graph.facebook.com/106656702112510/picture?type=large'">
        <div class="cms-fb-card-info">
          <div class="cms-fb-card-name">
            <strong>${escapeHtml(p.name)}</strong>
            ${p.isDefault ? '<span class="cms-fb-badge default" style="font-size:10px; padding:1px 5px; background:var(--sage); color:var(--forest); border-radius:4px; font-weight:700;">Mặc định</span>' : ''}
          </div>
          <span class="cms-fb-card-id">${escapeHtml(p.category || 'Fanpage Facebook')} · ID: ${escapeHtml(pid)}</span>
        </div>
        <span class="cms-fb-check-indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('.cms-fb-channel-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const pid = card.dataset.fbChannelId;
      if (fbState.selectedPageIds.has(pid)) {
        fbState.selectedPageIds.delete(pid);
      } else {
        fbState.selectedPageIds.add(pid);
      }
      card.classList.toggle('checked', fbState.selectedPageIds.has(pid));
      const checkbox = card.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = fbState.selectedPageIds.has(pid);
      updatePublishButtonState();
      updatePreviewFromChannels();
    });
  });

  updatePublishButtonState();
  updatePreviewFromChannels();
}

function updatePublishButtonState() {
  const submitBtn = byId('fbSubmitBtn');
  if (!submitBtn) return;
  const count = fbState.selectedPageIds.size;
  const span = submitBtn.querySelector('span');

  if (count === 0) {
    submitBtn.disabled = true;
    if (span) span.textContent = 'Vui lòng chọn ít nhất 1 Fanpage';
  } else if (count === 1) {
    submitBtn.disabled = false;
    const selectedPid = Array.from(fbState.selectedPageIds)[0];
    const pageObj = (fbState.pages || []).find(p => String(p.pageId) === selectedPid);
    const pName = pageObj?.name || fbState.pageName || 'Fanpage';
    if (span) span.textContent = `Đăng lên Fanpage ${pName}`;
  } else {
    submitBtn.disabled = false;
    if (span) span.textContent = `Đăng đồng thời lên ${count} Fanpage đã chọn`;
  }

  const btnSelectAll = byId('btnFbSelectAllPages');
  if (btnSelectAll) {
    const total = (fbState.pages || []).length || 1;
    btnSelectAll.textContent = (count === total && total > 0) ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
  }
}

function updatePreviewFromChannels() {
  const selectedPid = Array.from(fbState.selectedPageIds)[0];
  if (!selectedPid) return;
  const pageObj = (fbState.pages || []).find(p => String(p.pageId) === selectedPid);
  const pName = pageObj?.name || 'Ngọc Nhà Tốt';

  const avatarImg = document.querySelector('.fb-mock-avatar img');
  if (avatarImg) {
    avatarImg.src = `https://graph.facebook.com/${selectedPid}/picture?type=large`;
    avatarImg.alt = `Avatar ${pName}`;
    avatarImg.style.display = 'block';
  }
  const nameEl = document.querySelector('.fb-mock-name strong');
  if (nameEl) nameEl.textContent = pName;

  const titleEl = byId('fbDialogTitle');
  if (titleEl) {
    const count = fbState.selectedPageIds.size;
    titleEl.textContent = count > 1 
      ? `Đăng bài đồng thời lên ${count} Fanpage Facebook`
      : `Đăng bài lên Fanpage ${pName}`;
  }
}

async function openFacebookStudio(propertyId) {
  fbState.propertyId = propertyId;
  const dialog = byId('facebookPostDialog');
  if (!dialog) return;

  renderFacebookChannels();
  byId('fbPublishStatus').textContent = 'Đang chuẩn bị bài viết…';
  dialog.showModal();
  await loadFacebookDraft(propertyId, fbState.tone);
}

function closeFacebookStudio() {
  const dialog = byId('facebookPostDialog');
  if (dialog) dialog.close();
}

async function loadFacebookDraft(propertyId, tone = 'hot') {
  fbState.tone = tone;

  const contentInput = byId('fbPostContent');
  const previewText = byId('fbPreviewText');
  contentInput.value = 'Đang sinh nội dung bài viết với AI…';
  previewText.textContent = 'Đang sinh nội dung bài viết với AI…';

  // Highlight active tone chip
  document.querySelectorAll('[data-fb-tone]').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.fbTone === tone);
  });

  try {
    const selectedPid = Array.from(fbState.selectedPageIds)[0] || '106656702112510';
    const result = await cmsApi('/api/admin/v1/facebook/draft', {
      method: 'POST',
      body: {
        propertyId,
        tone,
        pageId: selectedPid,
        includeLink: byId('fbIncludeLink')?.checked !== false
      }
    });

    const data = result.data;
    fbState.content = data.content;
    fbState.allImages = data.images || [];
    fbState.pageName = data.pageName || 'Ngọc Nhà Tốt';
    fbState.pages = data.pages || fbState.pages;

    renderFacebookChannels();

    contentInput.value = data.content;
    previewText.textContent = data.content;

    // Default: select ALL images
    fbState.selectedImages = new Set(fbState.allImages);
    renderFacebookPhotoGrid();
    renderFacebookPreviewGallery();

    const count = fbState.selectedPageIds.size;
    byId('fbPublishStatus').textContent = count > 1 
      ? `Sẵn sàng đăng đồng thời lên ${count} Fanpage`
      : `Sẵn sàng đăng lên Fanpage ${fbState.pageName}`;
  } catch (error) {
    contentInput.value = '';
    previewText.textContent = `Lỗi: ${error.message}`;
    byId('fbPublishStatus').textContent = error.message;
  }
}

function renderFacebookPhotoGrid() {
  const grid = byId('fbPhotoGrid');
  const countEl = byId('fbPhotoCount');
  if (!grid) return;

  grid.innerHTML = '';
  countEl.textContent = `Đã chọn ${fbState.selectedImages.size}/${fbState.allImages.length} ảnh`;

  if (fbState.allImages.length === 0) {
    grid.innerHTML = '<p class="cms-meta-empty">Hồ sơ này chưa có hình ảnh đính kèm</p>';
    return;
  }

  fbState.allImages.forEach((url, index) => {
    const box = document.createElement('div');
    const isSelected = fbState.selectedImages.has(url);
    box.className = `cms-fb-photo-item ${isSelected ? 'selected' : ''}`;
    box.innerHTML = `
      <img src="${escapeHtml(driveImage(url))}" alt="Ảnh ${index + 1}" onerror="this.src='/assets/brand/fourland-logo.png'">
      <span class="cms-fb-photo-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      ${index === 0 ? '<span class="cms-fb-photo-badge">Bìa</span>' : ''}
    `;
    box.addEventListener('click', () => {
      if (fbState.selectedImages.has(url)) {
        if (fbState.selectedImages.size === 1) {
          alert('Bài viết phải có ít nhất 1 hình ảnh');
          return;
        }
        fbState.selectedImages.delete(url);
      } else {
        fbState.selectedImages.add(url);
      }
      renderFacebookPhotoGrid();
      renderFacebookPreviewGallery();
    });
    grid.appendChild(box);
  });
}

function renderFacebookPreviewGallery() {
  const gallery = byId('fbPreviewGallery');
  if (!gallery) return;

  gallery.innerHTML = '';
  const selectedArr = fbState.allImages.filter(url => fbState.selectedImages.has(url));

  if (selectedArr.length === 0) {
    gallery.style.display = 'none';
    return;
  }

  gallery.style.display = 'grid';
  gallery.className = `fb-mock-gallery count-${Math.min(selectedArr.length, 5)}`;

  selectedArr.slice(0, 4).forEach((url, i) => {
    const box = document.createElement('div');
    box.className = 'fb-mock-photo';
    const remaining = selectedArr.length - 4;
    box.innerHTML = `
      <img src="${escapeHtml(driveImage(url))}" alt="Xem trước ${i + 1}" onerror="this.src='/assets/brand/fourland-logo.png'">
      ${i === 3 && remaining > 0 ? `<div class="fb-mock-more">+${remaining}</div>` : ''}
    `;
    gallery.appendChild(box);
  });
}

async function handlePublishFacebook() {
  const submitBtn = byId('fbSubmitBtn');
  const statusNote = byId('fbPublishStatus');
  const content = byId('fbPostContent')?.value.trim();

  if (!content) {
    alert('Nội dung bài viết không được để trống');
    return;
  }

  const pageIds = Array.from(fbState.selectedPageIds);
  if (pageIds.length === 0) {
    alert('Vui lòng chọn ít nhất một Fanpage để đăng bài!');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<svg class="cms-btn-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Đang xuất bản lên ${pageIds.length} Fanpage…</span>`;
  statusNote.textContent = `Đang xuất bản bài viết lên ${pageIds.length} Fanpage…`;

  try {
    const result = await cmsApi('/api/admin/v1/facebook/publish', {
      method: 'POST',
      body: {
        propertyId: fbState.propertyId,
        content,
        images: Array.from(fbState.selectedImages),
        pageIds: pageIds
      }
    });

    statusNote.textContent = result.message || 'Đã đăng thành công!';
    submitBtn.innerHTML = `<svg class="cms-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Đã xuất bản & Lưu thành công</span>`;

    if (fbState.propertyId) {
      if (cmsState.currentProperty && cmsState.currentProperty.id === fbState.propertyId) {
        cmsState.currentProperty.raw_text = content;
        cmsState.currentProperty.notes = null;
      }
      cmsState.propertiesLoaded = false;
      openPropertyDetail(fbState.propertyId);
    }

    const results = result.data?.results || [];
    const successfulPages = results.filter(r => r.success);
    if (successfulPages.length > 0) {
      let reportMsg = result.message || `Đã xuất bản thành công lên ${successfulPages.length} Fanpage!\n`;
      if (successfulPages.length === 1 && successfulPages[0].postUrl) {
        if (confirm(`${reportMsg}\n\nBạn có muốn mở xem bài viết trên Facebook không?`)) {
          window.open(successfulPages[0].postUrl, '_blank');
        }
      } else {
        const links = successfulPages.map(p => `• ${p.pageName}: ${p.postUrl || 'Thành công'}`).join('\n');
        alert(`${reportMsg}\n\nChi tiết bài đăng:\n${links}`);
      }
    } else {
      alert(result.message || 'Đã xuất bản bài viết!');
    }

    setTimeout(closeFacebookStudio, 1500);
  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Thử lại</span>`;
    statusNote.textContent = `Lỗi: ${error.message}`;
    alert(`Không thể đăng bài: ${error.message}`);
  }
}

// Facebook Studio Event Listeners
if (byId('fbDialogClose')) byId('fbDialogClose').addEventListener('click', closeFacebookStudio);
if (byId('fbCancelBtn')) byId('fbCancelBtn').addEventListener('click', closeFacebookStudio);
if (byId('fbSubmitBtn')) byId('fbSubmitBtn').addEventListener('click', handlePublishFacebook);

if (byId('fbPageSelect')) {
  byId('fbPageSelect').addEventListener('change', function() {
    const newPageId = this.value;
    if (fbState.propertyId && newPageId) {
      loadFacebookDraft(fbState.propertyId, fbState.tone, newPageId);
    }
  });
}

if (byId('linkManageFbPages')) {
  byId('linkManageFbPages').addEventListener('click', (e) => {
    e.preventDefault();
    closeFacebookStudio();
    setActivePage('facebook-pages');
  });
}

document.querySelectorAll('[data-fb-tone]').forEach(chip => {
  chip.addEventListener('click', () => {
    const tone = chip.dataset.fbTone;
    if (fbState.propertyId) {
      loadFacebookDraft(fbState.propertyId, tone, fbState.selectedPageId);
    }
  });
});

if (byId('fbPostContent')) {
  byId('fbPostContent').addEventListener('input', function() {
    fbState.content = this.value;
    if (byId('fbPreviewText')) byId('fbPreviewText').textContent = this.value;
  });
}

if (byId('fbIncludeLink')) {
  byId('fbIncludeLink').addEventListener('change', () => {
    if (fbState.propertyId) {
      loadFacebookDraft(fbState.propertyId, fbState.tone);
    }
  });
}

if (byId('facebookPostDialog')) {
  byId('facebookPostDialog').addEventListener('click', event => {
    if (event.target === byId('facebookPostDialog')) closeFacebookStudio();
  });
}

// ============================================================================
// WEB PUSH STUDIO (ONESIGNAL BROADCAST)
// ============================================================================

const pushState = {
  property: null,
  isSending: false
};

function updatePushPhoneTime() {
  const timeEl = byId('pushPhoneTime');
  if (!timeEl) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  timeEl.textContent = `${hh}:${mm}`;
}

function updatePushPreview() {
  const title = byId('pushTitleInput')?.value?.trim() || '';
  const message = byId('pushMessageInput')?.value?.trim() || '';
  const image = byId('pushImageInput')?.value?.trim() || '';

  const previewTitle = byId('pushPreviewTitle');
  const previewDesc = byId('pushPreviewDesc');
  const previewImg = byId('pushPreviewBigImg');

  if (previewTitle) {
    previewTitle.textContent = title || 'Tiêu đề thông báo mẫu';
  }
  if (previewDesc) {
    previewDesc.textContent = message || 'Nội dung thông báo sẽ hiển thị ở đây trên màn hình khóa của khách hàng.';
  }
  if (previewImg) {
    if (image && (image.startsWith('http://') || image.startsWith('https://'))) {
      previewImg.src = image;
      previewImg.style.display = 'block';
    } else {
      previewImg.style.display = 'none';
      previewImg.src = '';
    }
  }
  updatePushPhoneTime();
}

async function checkPushStatus() {
  const statusBar = byId('pushStatusBar');
  const statusText = byId('pushStatusText');
  if (!statusBar || !statusText) return;

  statusBar.className = 'cms-push-status-bar';
  statusText.textContent = 'Đang kiểm tra kết nối OneSignal...';

  try {
    const res = await cmsApi('/api/admin/v1/push/status');
    if (res.ok && res.enabled) {
      statusBar.classList.add('is-connected');
      const count = res.messageableSubscribers ?? res.subscribers ?? 0;
      statusText.textContent = `OneSignal kết nối tốt · ${res.appName || 'Fourland'} (${count} thiết bị đã nhận tin)`;
    } else {
      statusBar.classList.add('is-warning');
      statusText.textContent = res.error || 'Chưa thể kết nối OneSignal REST API';
    }
  } catch (err) {
    statusBar.classList.add('is-warning');
    statusText.textContent = `Chưa kết nối OneSignal: ${err.message}`;
  }
}

function openPushStudio(property = null) {
  pushState.property = property;
  const dialog = byId('pushNotificationDialog');
  if (!dialog) return;

  const titleInput = byId('pushTitleInput');
  const messageInput = byId('pushMessageInput');
  const urlInput = byId('pushUrlInput');
  const imageInput = byId('pushImageInput');

  if (property) {
    const isRent = property.listingType === 'rent' || String(property.price || '').toLowerCase().includes('tháng');
    const tag = isRent ? 'CHO THUÊ' : 'CẦN BÁN';
    const addr = property.addressClean || property.address || 'Bất động sản mới';
    const price = property.price ? ` - ${property.price}` : '';
    const autoTitle = `🔥 [${tag}] ${addr}${price}`.slice(0, 100);

    const specs = [property.structure, property.area, property.legal].filter(Boolean).join(' · ');
    const autoMsg = specs 
      ? `${specs}. Vị trí cực đẹp, giá tốt. Chạm để xem chi tiết ngay!`
      : `Bất động sản mới vừa lên sàn Fourland với mức giá hấp dẫn. Chạm để xem ngay!`;

    const propId = property.id || property.property_id || '';
    const autoUrl = propId ? `https://www.fourland.vn/#q=${encodeURIComponent(propId)}` : 'https://www.fourland.vn';

    let firstImg = '';
    if (Array.isArray(property.images) && property.images.length > 0) {
      firstImg = typeof property.images[0] === 'string' ? property.images[0] : (property.images[0]?.url || '');
    } else if (property.imageUrl) {
      firstImg = property.imageUrl;
    }

    if (titleInput) titleInput.value = autoTitle;
    if (messageInput) messageInput.value = autoMsg;
    if (urlInput) urlInput.value = autoUrl;
    if (imageInput) imageInput.value = firstImg;
  } else {
    // General broadcast
    if (titleInput) titleInput.value = '🔥 Bất động sản mới cập nhật - Fourland';
    if (messageInput) messageInput.value = 'Hàng loạt bất động sản chính chủ mới vừa cập nhật với mức giá tốt nhất tuần. Chạm để khám phá ngay!';
    if (urlInput) urlInput.value = 'https://www.fourland.vn';
    if (imageInput) imageInput.value = '';
  }

  updatePushPreview();
  checkPushStatus();
  dialog.showModal();
}

function closePushStudio() {
  const dialog = byId('pushNotificationDialog');
  if (dialog && dialog.open) dialog.close();
}

async function handleSendPushSubmit(e) {
  e.preventDefault();
  if (pushState.isSending) return;

  const title = byId('pushTitleInput')?.value?.trim();
  const message = byId('pushMessageInput')?.value?.trim();
  const url = byId('pushUrlInput')?.value?.trim() || 'https://www.fourland.vn';
  const imageUrl = byId('pushImageInput')?.value?.trim() || '';

  if (!title || !message) {
    alert('Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo.');
    return;
  }

  const confirmMsg = `Bạn có chắc muốn bắn thông báo đẩy này đến tất cả khách hàng trên website Fourland?\n\n• Tiêu đề: ${title}\n• Link đích: ${url}`;
  if (!confirm(confirmMsg)) return;

  const submitBtn = byId('pushSubmitBtn');
  const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  pushState.isSending = true;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Đang gửi thông báo...</span>`;
  }

  try {
    const res = await cmsApi('/api/admin/v1/push/send', {
      method: 'POST',
      body: {
        title,
        message,
        url,
        imageUrl,
        propertyId: pushState.property?.id || null
      }
    });

    if (res.ok) {
      if (res.warning) {
        alert(`Ghi nhận lệnh gửi Push thành công!\n\nLưu ý: ${res.warning}`);
      } else {
        alert(res.message || `Đã bắn thông báo đẩy thành công đến ${res.recipients || 0} thiết bị!`);
      }
      closePushStudio();
    } else {
      alert(`Không thể gửi thông báo: ${res.error?.message || 'Lỗi không xác định'}`);
    }
  } catch (err) {
    alert(`Lỗi khi bắn Push: ${err.message}`);
  } finally {
    pushState.isSending = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origBtnHtml;
    }
  }
}

// Push Studio Event Listeners
if (byId('btnQuickPushHeader')) byId('btnQuickPushHeader').addEventListener('click', () => openPushStudio(null));
if (byId('pushDialogClose')) byId('pushDialogClose').addEventListener('click', closePushStudio);
if (byId('pushCancelBtn')) byId('pushCancelBtn').addEventListener('click', closePushStudio);
if (byId('pushNotificationDialog')) {
  byId('pushNotificationDialog').addEventListener('click', event => {
    if (event.target === byId('pushNotificationDialog')) closePushStudio();
  });
}
if (byId('pushTitleInput')) byId('pushTitleInput').addEventListener('input', updatePushPreview);
if (byId('pushMessageInput')) byId('pushMessageInput').addEventListener('input', updatePushPreview);
if (byId('pushImageInput')) byId('pushImageInput').addEventListener('input', updatePushPreview);
if (byId('pushNotificationForm')) byId('pushNotificationForm').addEventListener('submit', handleSendPushSubmit);

// ==========================================================================
// FACEBOOK PAGES MANAGEMENT
// ==========================================================================

const DEFAULT_FALLBACK_PAGES = [
  {
    id: "106656702112510",
    pageId: "106656702112510",
    name: "Ngọc Nhà Tốt",
    isDefault: true,
    source: "composio",
    category: "Bất động sản",
    avatarUrl: "https://graph.facebook.com/106656702112510/picture?type=large"
  }
];

let fbPagesCache = [];

async function loadFacebookPages(force = false) {
  const grid = byId('fbPagesGrid');
  const alertEl = byId('fbPagesAlert');
  if (!grid) return;

  if (alertEl) alertEl.hidden = true;
  grid.innerHTML = '<div class="cms-empty" style="grid-column:1/-1;"><b>Đang tải danh sách Fanpage từ Composio…</b></div>';

  try {
    const url = force ? '/api/admin/v1/facebook/pages?sync=true' : '/api/admin/v1/facebook/pages';
    const res = await cmsApi(url);
    fbPagesCache = (res && Array.isArray(res.data) && res.data.length > 0) ? res.data : DEFAULT_FALLBACK_PAGES;

    const totalEl = byId('fbTotalPages');
    if (totalEl) totalEl.textContent = fbPagesCache.length;
    const defaultPage = fbPagesCache.find(p => p.isDefault) || fbPagesCache[0];
    const defaultEl = byId('fbDefaultPageName');
    if (defaultEl && defaultPage) defaultEl.textContent = defaultPage.name;

    renderFacebookPagesGrid(fbPagesCache);
  } catch (err) {
    console.warn("loadFacebookPages notice:", err.message);
    fbPagesCache = DEFAULT_FALLBACK_PAGES;
    const totalEl = byId('fbTotalPages');
    if (totalEl) totalEl.textContent = fbPagesCache.length;
    const defaultEl = byId('fbDefaultPageName');
    if (defaultEl) defaultEl.textContent = "Ngọc Nhà Tốt";

    renderFacebookPagesGrid(fbPagesCache);

    if (alertEl) {
      alertEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;flex-wrap:wrap;font-size:12.5px;">
          <span>Kết nối API Fanpage: Đang hiển thị danh sách đệm.</span>
          <button type="button" class="cms-page-btn" onclick="loadFacebookPages(true)" style="height:28px;padding:0 8px;font-size:11.5px;">Thử lại</button>
        </div>
      `;
      alertEl.hidden = false;
    }
  }
}

function renderFacebookPagesGrid(pages) {
  const grid = byId('fbPagesGrid');
  if (!grid) return;

  if (!pages || pages.length === 0) {
    grid.innerHTML = `
      <div class="cms-empty" style="grid-column:1/-1; padding:30px 20px;">
        <b>Chưa có Fanpage nào được kết nối</b>
        <span>Bấm nút "Đồng bộ từ Composio" để tải về các Fanpage quản trị.</span>
      </div>
    `;
    return;
  }

  grid.innerHTML = pages.map(p => `
    <div class="cms-fb-page-card ${p.isDefault ? 'is-default' : ''}">
      <div class="cms-fb-page-header">
        <img class="cms-fb-page-avatar" src="https://graph.facebook.com/${p.pageId}/picture?type=large" alt="${escapeHtml(p.name)}" onerror="this.src='https://graph.facebook.com/106656702112510/picture?type=large'">
        <div class="cms-fb-page-meta">
          <div class="cms-fb-page-title-row">
            <strong>${escapeHtml(p.name)}</strong>
            <svg class="cms-fb-verified-icon" viewBox="0 0 24 24" width="15" height="15" fill="#1877f2" title="Đã xác thực Facebook"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
          </div>
          <span class="cms-fb-id-pill" title="Bấm để sao chép Page ID" data-copy-id="${p.pageId}">
            <span>ID: ${escapeHtml(p.pageId)}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </span>
        </div>
      </div>
      <div class="cms-fb-page-badges">
        ${p.isDefault ? '<span class="cms-fb-badge default"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Trang mặc định</span>' : ''}
        <span class="cms-fb-badge composio"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Composio MCP</span>
        <span class="cms-fb-badge category">${escapeHtml(p.category || 'Trang Facebook')}</span>
      </div>
      <div class="cms-fb-page-actions">
        <div class="cms-fb-action-left">
          <a href="https://facebook.com/${p.pageId}" target="_blank" rel="noopener noreferrer" class="cms-fb-link-btn" title="Mở trang trên Facebook">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            <span>Xem trang</span>
          </a>
        </div>
        <div class="cms-fb-action-right">
          ${!p.isDefault ? `
            <button type="button" class="cms-fb-btn-default btn-set-default" data-page-id="${p.pageId}" title="Đặt làm Fanpage mặc định khi xuất bản">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              <span>Đặt mặc định</span>
            </button>
          ` : ''}
          <button type="button" class="cms-fb-btn-icon btn-edit-page" data-page-id="${p.pageId}" title="Chỉnh sửa thông tin">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          ${pages.length > 1 && !p.isDefault ? `
            <button type="button" class="cms-fb-btn-icon danger btn-delete-page" data-page-id="${p.pageId}" title="Xóa Fanpage">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');

  // Copy ID handlers
  grid.querySelectorAll('[data-copy-id]').forEach(pill => {
    pill.addEventListener('click', () => {
      const id = pill.dataset.copyId;
      navigator.clipboard?.writeText(id);
      showToast(`Đã sao chép Page ID: ${id}`);
    });
  });

  // Attach action handlers
  grid.querySelectorAll('.btn-set-default').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pageId = btn.dataset.pageId;
      try {
        btn.disabled = true;
        btn.innerHTML = '<svg class="cms-btn-icon spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Đang lưu…</span>';
        await cmsApi('/api/admin/v1/facebook/pages', {
          method: 'PATCH',
          body: { pageId, isDefault: true }
        });
        showToast('Đã đặt Fanpage làm mặc định thành công!');
        await loadFacebookPages(false);
      } catch (err) {
        alert('Lỗi: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg><span>Đặt mặc định</span>';
      }
    });
  });

  grid.querySelectorAll('.btn-edit-page').forEach(btn => {
    btn.addEventListener('click', () => {
      const pageId = btn.dataset.pageId;
      const page = fbPagesCache.find(p => p.pageId === pageId);
      if (page) openFbPageModal(page);
    });
  });

  grid.querySelectorAll('.btn-delete-page').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pageId = btn.dataset.pageId;
      const page = fbPagesCache.find(p => p.pageId === pageId);
      const name = page ? page.name : pageId;
      if (!confirm(`Bạn có chắc chắn muốn xóa Fanpage "${name}" không?`)) return;

      try {
        await cmsApi(`/api/admin/v1/facebook/pages?id=${encodeURIComponent(pageId)}`, {
          method: 'DELETE'
        });
        showToast('Đã xóa Fanpage thành công!');
        await loadFacebookPages(false);
      } catch (err) {
        alert('Lỗi: ' + err.message);
      }
    });
  });
}

function openFbPageModal(editingPage = null) {
  const dialog = byId('fbPageDialog');
  const alertEl = byId('fbPageAlert');
  if (!dialog) return;

  if (alertEl) alertEl.hidden = true;
  byId('fbPageDialogTitle').textContent = editingPage ? 'Chỉnh sửa Fanpage Facebook' : 'Thêm Fanpage Facebook';
  byId('inputFbPageName').value = editingPage ? editingPage.name : '';
  byId('inputFbPageId').value = editingPage ? editingPage.pageId : '';
  byId('inputFbPageId').readOnly = Boolean(editingPage);
  byId('inputFbPageToken').value = '';
  byId('inputFbPageDefault').checked = editingPage ? Boolean(editingPage.isDefault) : false;

  dialog.dataset.mode = editingPage ? 'edit' : 'create';
  dialog.dataset.targetId = editingPage ? editingPage.pageId : '';
  dialog.showModal();
}

function closeFbPageModal() {
  const dialog = byId('fbPageDialog');
  if (dialog) dialog.close();
}

// Modal and Page Event Listeners
if (byId('btnCreateFbPage')) byId('btnCreateFbPage').addEventListener('click', () => openFbPageModal(null));
if (byId('btnRefreshFbPages')) byId('btnRefreshFbPages').addEventListener('click', () => loadFacebookPages(true));
if (byId('fbPageDialogClose')) byId('fbPageDialogClose').addEventListener('click', closeFbPageModal);
if (byId('fbPageCancel')) byId('fbPageCancel').addEventListener('click', closeFbPageModal);

if (byId('btnSyncComposio')) {
  byId('btnSyncComposio').addEventListener('click', async () => {
    const btn = byId('btnSyncComposio');
    const origHtml = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = `<svg class="cms-btn-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Đang đồng bộ Composio…</span>`;
      const res = await cmsApi('/api/admin/v1/facebook/pages?sync=true');
      fbPagesCache = res.data || [];
      showToast(`Đã đồng bộ thành công ${fbPagesCache.length} Fanpage từ Composio!`);
      await loadFacebookPages(false);
    } catch (err) {
      alert('Lỗi đồng bộ: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  });
}

if (byId('fbPageForm')) {
  byId('fbPageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dialog = byId('fbPageDialog');
    const alertEl = byId('fbPageAlert');
    const saveBtn = byId('fbPageSave');
    const mode = dialog?.dataset.mode || 'create';
    const targetId = dialog?.dataset.targetId || '';

    const name = byId('inputFbPageName')?.value.trim();
    const pageId = byId('inputFbPageId')?.value.trim();
    const token = byId('inputFbPageToken')?.value.trim();
    const isDefault = byId('inputFbPageDefault')?.checked;

    if (!name || !pageId) {
      if (alertEl) {
        alertEl.textContent = 'Vui lòng nhập đầy đủ Tên Fanpage và Page ID';
        alertEl.hidden = false;
      }
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.querySelector('span').textContent = 'Đang lưu…';

      if (mode === 'create') {
        await cmsApi('/api/admin/v1/facebook/pages', {
          method: 'POST',
          body: { name, pageId, token, isDefault }
        });
        showToast('Đã thêm Fanpage mới thành công!');
      } else {
        await cmsApi('/api/admin/v1/facebook/pages', {
          method: 'PATCH',
          body: { pageId: targetId, name, token: token || undefined, isDefault }
        });
        showToast('Đã cập nhật Fanpage thành công!');
      }

      closeFbPageModal();
      await loadFacebookPages(false);
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message || 'Lỗi khi lưu Fanpage';
        alertEl.hidden = false;
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.querySelector('span').textContent = 'Lưu Fanpage';
    }
  });
}

// Create Property Modal Events
if (byId('btnCreatePropertyDashboard')) byId('btnCreatePropertyDashboard').addEventListener('click', openCreatePropertyModal);
if (byId('btnCreatePropertyPage')) byId('btnCreatePropertyPage').addEventListener('click', openCreatePropertyModal);
if (byId('createDialogClose')) byId('createDialogClose').addEventListener('click', closeCreatePropertyModal);
if (byId('createCancelBtn')) byId('createCancelBtn').addEventListener('click', closeCreatePropertyModal);
if (byId('createPropertyForm')) byId('createPropertyForm').addEventListener('submit', handleCreateProperty);
if (byId('createPropertyDialog')) {
  byId('createPropertyDialog').addEventListener('click', event => {
    if (event.target === byId('createPropertyDialog')) closeCreatePropertyModal();
  });
}

// Property Detail Modal Events
function closePropertyDetail() {
  const dialog = byId('propertyDetail');
  if (dialog && dialog.open) dialog.close();
}

if (byId('detailClose')) byId('detailClose').addEventListener('click', closePropertyDetail);
if (byId('detailEdit')) byId('detailEdit').addEventListener('click', () => setEditFormVisible(true));
if (byId('editCancel')) byId('editCancel').addEventListener('click', () => setEditFormVisible(false));
if (byId('editSave')) byId('editSave').addEventListener('click', handleSavePropertyEdit);
if (byId('detailEditForm')) byId('detailEditForm').addEventListener('submit', validateEditPreview);
if (byId('btnWorkflowPublish')) byId('btnWorkflowPublish').addEventListener('click', () => handlePropertyWorkflow('publish'));
if (byId('btnWorkflowArchive')) byId('btnWorkflowArchive').addEventListener('click', () => handlePropertyWorkflow('archive'));
if (byId('btnWorkflowRestore')) byId('btnWorkflowRestore').addEventListener('click', () => handlePropertyWorkflow('restore'));
if (byId('propertyDetail')) {
  byId('propertyDetail').addEventListener('click', event => {
    if (event.target === byId('propertyDetail')) closePropertyDetail();
  });
}

// Profile Modal Events
if (byId('profileButton')) byId('profileButton').addEventListener('click', openProfileDialog);
if (byId('profileDialogClose')) byId('profileDialogClose').addEventListener('click', closeProfileDialog);
if (byId('profileDialog')) {
  byId('profileDialog').addEventListener('click', event => {
    if (event.target === byId('profileDialog')) closeProfileDialog();
  });
}

// User Modal Events
if (byId('btnCreateUser')) byId('btnCreateUser').addEventListener('click', () => openUserModal());
if (byId('userDialogClose')) byId('userDialogClose').addEventListener('click', closeUserModal);
if (byId('userCancelBtn')) byId('userCancelBtn').addEventListener('click', closeUserModal);
if (byId('userForm')) byId('userForm').addEventListener('submit', handleSaveUser);
if (byId('userDialog')) {
  byId('userDialog').addEventListener('click', event => {
    if (event.target === byId('userDialog')) closeUserModal();
  });
}


// Sidebar Navigation Events & Deep-Linking Routing
document.querySelectorAll('[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    if (page) setActivePage(page, true);
  });
});

window.addEventListener('hashchange', () => {
  const page = getPageFromUrl();
  setActivePage(page, false);
});

window.addEventListener('popstate', () => {
  const page = getPageFromUrl();
  setActivePage(page, false);
});

// Owners Directory CRM Events
if (byId('ownersRefresh')) byId('ownersRefresh').addEventListener('click', () => loadOwners(true));
if (byId('ownersSearchInput')) {
  let timer;
  const searchInput = byId('ownersSearchInput');
  const clearBtn = byId('ownersSearchClear');
  const updateClearState = () => {
    if (clearBtn) clearBtn.hidden = !searchInput.value.trim();
  };
  searchInput.addEventListener('input', () => {
    updateClearState();
    clearTimeout(timer);
    timer = setTimeout(() => loadOwners(true), 300);
  });
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      updateClearState();
      searchInput.focus();
      loadOwners(true);
    });
  }
}
if (byId('ownersRoleFilter')) byId('ownersRoleFilter').addEventListener('change', () => loadOwners(true));
if (byId('ownersSortSelect')) byId('ownersSortSelect').addEventListener('change', () => loadOwners(true));

bootstrapCms();

