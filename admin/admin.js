const isLocalPreview = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
const cmsState = {
  user: null,
  accessToken: isLocalPreview ? 'fourland-preview-cms' : (localStorage.getItem('fourland_cms_access_token') || sessionStorage.getItem('fourland_cms_access_token') || ''),
  propertiesLoaded: false,
  propertyPage: 1,
  propertyMeta: null,
  currentProperty: null,
  reviewLoaded: false,
  healthLoaded: false,
  usersLoaded: false
};
const byId = id => document.getElementById(id);

function getPageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') || params.get('page');
  const validPages = ['dashboard', 'match', 'properties', 'editor', 'users', 'sync'];
  if (tab && validPages.includes(tab.toLowerCase())) return tab.toLowerCase();

  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (validPages.includes(hash)) return hash;

  return 'dashboard';
}

function setActivePage(page, updateUrl = true) {
  const validPages = ['dashboard', 'match', 'properties', 'editor', 'users', 'sync'];
  const targetPage = validPages.includes(page) ? page : 'dashboard';

  document.querySelectorAll('[data-page-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.pagePanel === targetPage));
  document.querySelectorAll('[data-page]').forEach(item => item.classList.toggle('active', item.dataset.page === targetPage));

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

  if (targetPage === 'properties' && cmsState.user && !cmsState.propertiesLoaded) loadProperties();
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
    updateHeaderUser();
    byId('cmsApp').setAttribute('aria-busy', 'false');
    showToast(`Chào mừng ${user.displayName} đã đăng nhập!`);
    await loadDashboard();
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
    updateHeaderUser();
    byId('cmsApp').setAttribute('aria-busy', 'false');
    await loadDashboard();
    const initialPage = getPageFromUrl();
    setActivePage(initialPage, false);
  } catch (error) {
    cmsState.accessToken = '';
    localStorage.removeItem('fourland_cms_access_token');
    sessionStorage.removeItem('fourland_cms_access_token');
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

function createPropertyCard(item) {
  const article = document.createElement('article');
  article.className = 'cms-property-card';
  const cover = document.createElement('div');
  cover.className = 'cms-property-cover';
  const imgSrc = driveImage(item.coverImage);
  if (imgSrc) {
    const image = document.createElement('img');
    image.src = imgSrc;
    image.alt = item.address || 'Ảnh bất động sản';
    image.loading = 'lazy';
    image.decoding = 'async';
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
  const detailButton = document.createElement('button');
  detailButton.className = 'cms-card-action';
  detailButton.type = 'button';
  detailButton.textContent = 'Xem chi tiết';
  detailButton.addEventListener('click', () => openPropertyDetail(item.id));
  footer.append(price, detailButton);
  body.append(badges, title, location, facts, footer);
  article.append(cover, body);
  return article;
}

function detailRow(label, value) {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value === null || value === undefined || value === '' ? 'Chưa cập nhật' : String(value);
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
      gallery.replaceChildren(...item.images.slice(0, 8).map((entry, index) => {
        const image = document.createElement('img');
        image.src = driveImage(entry.url);
        image.alt = `Ảnh bất động sản ${index + 1}`;
        image.loading = 'lazy';
        image.decoding = 'async';
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

    byId('detailOperations').replaceChildren(
      detailRow('Trạng thái', statusLabel(item.status)), detailRow('Số ảnh', item.imageCount),
      detailRow('Ngày tiếp nhận', formatDate(item.receivedAt)), detailRow('Cập nhật', formatDate(item.updatedAt)),
      detailRow('Điện thoại', displayPhone), detailRow('Hoa hồng', item.commission), detailRow('Ghi chú', item.notes)
    );
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
    address: item.address, property_type: item.propertyType, price_text: item.price,
    area_text: item.area, dimensions: item.dimensions, phone: item.phone, bedrooms: item.bedrooms, bathrooms: item.bathrooms,
    legal: item.legal, structure: item.structure, notes: item.notes
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
  byId('propertyEmpty').hidden = true;
  byId('propertyPagination').hidden = true;
  byId('propertyError').hidden = true;
  const districtFilter = byId('propertyDistrict')?.value || '';
  const params = new URLSearchParams({
    q: (byId('propertySearch')?.value || '').trim(),
    district: districtFilter,
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
    if (!result.data.items.length) {
      byId('propertyEmpty').hidden = false;
      return;
    }

    let items = [...result.data.items];
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
    grid.hidden = false;
    byId('propertyPagination').hidden = false;
    byId('propertyPage').textContent = `Trang ${result.meta.page} / ${Math.max(1, Math.ceil(result.meta.total / result.meta.pageSize))}`;
    byId('propertyPrev').disabled = result.meta.page <= 1;
    byId('propertyNext').disabled = !result.meta.hasNext;
  } catch (error) {
    byId('propertyLoading').hidden = true;
    byId('propertyError').hidden = false;
    byId('propertyError').textContent = `${error.code || 'REQUEST_FAILED'} · ${error.message}`;
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

document.querySelectorAll('[data-page]').forEach(item => item.addEventListener('click', () => setActivePage(item.dataset.page)));
byId('retryAuth').addEventListener('click', bootstrapCms);

// Property Filters & Live Reactive Search
let searchDebounceTimer = null;
const searchInput = byId('propertySearch');
const clearBtn = byId('propertySearchClear');

if (searchInput) {
  searchInput.addEventListener('input', () => {
    if (clearBtn) clearBtn.hidden = !searchInput.value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => loadProperties(1), 280);
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

if (byId('propertyDistrict')) byId('propertyDistrict').addEventListener('change', () => loadProperties(1));
if (byId('propertyStatus')) byId('propertyStatus').addEventListener('change', () => loadProperties(1));
if (byId('propertyQuality')) byId('propertyQuality').addEventListener('change', () => loadProperties(1));
if (byId('propertySort')) byId('propertySort').addEventListener('change', () => loadProperties(1));

if (byId('propertyResetFilters')) {
  byId('propertyResetFilters').addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.hidden = true;
    if (byId('propertyDistrict')) byId('propertyDistrict').value = '';
    if (byId('propertyStatus')) byId('propertyStatus').value = 'active';
    if (byId('propertyQuality')) byId('propertyQuality').value = 'all';
    if (byId('propertySort')) byId('propertySort').value = 'newest';
    document.querySelectorAll('[data-filter-chip]').forEach(c => c.classList.toggle('active', c.dataset.filterChip === 'all'));
    loadProperties(1);
  });
}

document.querySelectorAll('[data-filter-chip]').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('[data-filter-chip]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const type = chip.dataset.filterChip;
    if (type === 'all') {
      if (searchInput) searchInput.value = '';
      if (byId('propertyDistrict')) byId('propertyDistrict').value = '';
      if (byId('propertyStatus')) byId('propertyStatus').value = 'active';
      if (byId('propertyQuality')) byId('propertyQuality').value = 'all';
    } else if (type === 'today') {
      if (searchInput) searchInput.value = '';
      if (byId('propertyDistrict')) byId('propertyDistrict').value = '';
      if (byId('propertyStatus')) byId('propertyStatus').value = 'active';
      if (byId('propertyQuality')) byId('propertyQuality').value = 'all';
    } else if (type === 'has_images') {
      if (byId('propertyQuality')) byId('propertyQuality').value = 'all';
    } else if (type === 'mat_bang') {
      if (searchInput) searchInput.value = 'Mặt bằng';
      if (byId('propertyDistrict')) byId('propertyDistrict').value = '';
    } else if (type === 'nha_pho') {
      if (searchInput) searchInput.value = 'Nhà phố';
      if (byId('propertyDistrict')) byId('propertyDistrict').value = '';
    } else if (type === 'under_20m') {
      if (searchInput) searchInput.value = 'triệu';
      if (byId('propertyDistrict')) byId('propertyDistrict').value = '';
    } else if (type === 'tan_binh') {
      if (byId('propertyDistrict')) byId('propertyDistrict').value = 'Tân Bình';
      if (searchInput) searchInput.value = '';
    } else if (type === 'binh_thanh') {
      if (byId('propertyDistrict')) byId('propertyDistrict').value = 'Bình Thạnh';
      if (searchInput) searchInput.value = '';
    } else if (type === 'phu_nhuan') {
      if (byId('propertyDistrict')) byId('propertyDistrict').value = 'Phú Nhuận';
      if (searchInput) searchInput.value = '';
    }
    if (clearBtn && searchInput) clearBtn.hidden = !searchInput.value;
    loadProperties(1);
  });
});

byId('propertyPrev').addEventListener('click', () => loadProperties(Math.max(1, cmsState.propertyPage - 1)));
byId('propertyNext').addEventListener('click', () => loadProperties(cmsState.propertyPage + 1));
byId('reviewRefresh').addEventListener('click', () => { cmsState.reviewLoaded = false; loadReviewQueue(); });
byId('healthRefresh').addEventListener('click', () => { cmsState.healthLoaded = false; loadSystemHealth(); });
byId('detailClose').addEventListener('click', () => byId('propertyDetail').close());
byId('detailEdit').addEventListener('click', () => setEditFormVisible(true));
byId('editCancel').addEventListener('click', () => setEditFormVisible(false));
byId('detailEditForm').addEventListener('submit', validateEditPreview);
byId('propertyDetail').addEventListener('click', event => { if (event.target === byId('propertyDetail')) byId('propertyDetail').close(); });

if (byId('btnCreatePropertyDashboard')) byId('btnCreatePropertyDashboard').addEventListener('click', openCreatePropertyModal);
if (byId('btnCreatePropertyPage')) byId('btnCreatePropertyPage').addEventListener('click', openCreatePropertyModal);
if (byId('createDialogClose')) byId('createDialogClose').addEventListener('click', closeCreatePropertyModal);
if (byId('createCancelBtn')) byId('createCancelBtn').addEventListener('click', closeCreatePropertyModal);
if (byId('createPropertyForm')) byId('createPropertyForm').addEventListener('submit', handleCreateProperty);
if (byId('createPropertyDialog')) byId('createPropertyDialog').addEventListener('click', event => { if (event.target === byId('createPropertyDialog')) closeCreatePropertyModal(); });

// User Management & Profile Dialog Events
byId('profileButton').addEventListener('click', openProfileDialog);
if (byId('profileDialogClose')) byId('profileDialogClose').addEventListener('click', closeProfileDialog);
if (byId('profileDialog')) byId('profileDialog').addEventListener('click', event => { if (event.target === byId('profileDialog')) closeProfileDialog(); });

if (byId('btnCreateUser')) byId('btnCreateUser').addEventListener('click', () => openUserModal());
if (byId('userDialogClose')) byId('userDialogClose').addEventListener('click', closeUserModal);
if (byId('userCancelBtn')) byId('userCancelBtn').addEventListener('click', closeUserModal);
if (byId('userForm')) byId('userForm').addEventListener('submit', handleSaveUser);
if (byId('userDialog')) byId('userDialog').addEventListener('click', event => { if (event.target === byId('userDialog')) closeUserModal(); });

// Workflow & Edit Action Events
if (byId('btnWorkflowPublish')) byId('btnWorkflowPublish').addEventListener('click', () => handlePropertyWorkflow('publish'));
if (byId('btnWorkflowArchive')) byId('btnWorkflowArchive').addEventListener('click', () => handlePropertyWorkflow('archive'));
if (byId('btnWorkflowRestore')) byId('btnWorkflowRestore').addEventListener('click', () => handlePropertyWorkflow('restore'));
if (byId('editSave')) byId('editSave').addEventListener('click', handleSavePropertyEdit);

// ==========================================================================
// SMART MATCHING & PITCH GENERATOR FUNCTIONS
// ==========================================================================

async function loadSmartMatch(customQuery) {
  const query = (customQuery !== undefined ? customQuery : byId('smartMatchQuery').value).trim();
  byId('matchLoading').hidden = false;
  byId('matchGrid').hidden = true;
  byId('matchEmpty').hidden = true;
  byId('matchMeta').hidden = true;

  try {
    const result = await cmsApi('/api/admin/v1/smart-match', {
      method: 'POST',
      body: { query }
    });
    cmsState.matchLoaded = true;
    const { items, criteriaUsed, totalMatched } = result.data;

    byId('matchLoading').hidden = true;
    byId('matchMeta').hidden = false;
    byId('matchCount').textContent = `Tìm thấy ${items.length} căn nhà phù hợp nhất`;

    const summaryParts = [];
    if (criteriaUsed.district) summaryParts.push(`Quận: ${criteriaUsed.district}`);
    if (criteriaUsed.minPrice || criteriaUsed.maxPrice) {
      summaryParts.push(`Giá: ${criteriaUsed.minPrice ? criteriaUsed.minPrice / 1000000 + 'tr' : '0'} - ${criteriaUsed.maxPrice ? criteriaUsed.maxPrice / 1000000 + 'tr' : 'Vô hạn'}`);
    }
    if (criteriaUsed.propertyType) summaryParts.push(`Loại: ${criteriaUsed.propertyType}`);
    byId('matchCriteriaSummary').textContent = summaryParts.length ? `Tiêu chí bóc tách: ${summaryParts.join(' · ')}` : 'Quét toàn bộ kho dữ liệu';

    if (!items.length) {
      byId('matchEmpty').hidden = false;
      return;
    }

    const grid = byId('matchGrid');
    grid.replaceChildren(...items.map(createMatchCard));
    grid.hidden = false;
  } catch (error) {
    byId('matchLoading').hidden = true;
    byId('matchEmpty').hidden = false;
    byId('matchEmpty').querySelector('b').textContent = 'Lỗi tìm kiếm khớp nhu cầu';
    byId('matchEmpty').querySelector('span').textContent = `${error.code || 'REQUEST_FAILED'} · ${error.message}`;
  }
}

function createMatchCard(item) {
  const article = document.createElement('article');
  article.className = 'cms-match-item';

  // Header
  const header = document.createElement('div');
  header.className = 'cms-match-header';
  const headerText = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = item.address;
  const subtitle = document.createElement('p');
  subtitle.textContent = [item.propertyType, item.ward, item.district].filter(Boolean).join(' · ');
  headerText.append(title, subtitle);

  const scoreBadge = document.createElement('div');
  const scoreClass = item.matchScore >= 80 ? 'top' : (item.matchScore >= 65 ? 'medium' : 'low');
  scoreBadge.className = `cms-score-badge ${scoreClass}`;
  scoreBadge.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> <span>${item.matchScore}% KHỚP</span>`;

  header.append(headerText, scoreBadge);

  // Body
  const body = document.createElement('div');
  body.className = 'cms-match-body';

  const facts = document.createElement('div');
  facts.className = 'cms-match-facts';
  facts.innerHTML = `
    <div><span>Giá</span><strong>${item.price || 'Thỏa thuận'}</strong></div>
    <div><span>Diện tích</span><strong>${item.area || '—'}</strong></div>
    <div><span>Phòng / WC</span><strong>${item.bedrooms ? item.bedrooms + ' PN' : '—'} / ${item.bathrooms ? item.bathrooms + ' WC' : '—'}</strong></div>
  `;

  const reasons = document.createElement('div');
  reasons.className = 'cms-match-reasons';
  (item.reasons || []).slice(0, 4).forEach(r => {
    const rDiv = document.createElement('div');
    rDiv.className = `cms-match-reason-item ${r.pass ? 'pass' : 'fail'}`;
    rDiv.innerHTML = `<span class="cms-match-reason-dot"></span><span>${r.label}</span>`;
    reasons.append(rDiv);
  });

  body.append(facts, reasons);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'cms-match-footer';

  const viewBtn = document.createElement('button');
  viewBtn.className = 'cms-edit-preview';
  viewBtn.type = 'button';
  viewBtn.textContent = 'Xem chi tiết';
  viewBtn.addEventListener('click', () => openPropertyDetail(item.id));

  const copyBtn = document.createElement('button');
  copyBtn.className = 'cms-copy-pitch-btn';
  copyBtn.type = 'button';
  copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Sao chép tin gửi Zalo</span>`;
  copyBtn.addEventListener('click', () => handleCopyPitch(item.pitchText));

  footer.append(viewBtn, copyBtn);

  article.append(header, body, footer);
  return article;
}

function showToast(message) {
  const existing = document.querySelector('.cms-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'cms-toast';
  toast.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg><span>${message}</span>`;
  document.body.append(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
  pageName: 'Ngọc Ngà Tốt'
};

async function openFacebookStudio(propertyId) {
  fbState.propertyId = propertyId;
  const dialog = byId('facebookPostDialog');
  if (!dialog) return;

  byId('fbPublishStatus').textContent = 'Đang chuẩn bị bài viết…';
  byId('fbSubmitBtn').disabled = false;
  byId('fbSubmitBtn').innerHTML = `<svg class="cms-btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg><span>Đăng lên Fanpage Ngọc Ngà Tốt</span>`;

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
    const result = await cmsApi('/api/admin/v1/facebook/draft', {
      method: 'POST',
      body: {
        propertyId,
        tone,
        includeLink: byId('fbIncludeLink')?.checked !== false
      }
    });

    const data = result.data;
    fbState.content = data.content;
    fbState.allImages = data.images || [];
    fbState.pageName = data.pageName || 'Ngọc Ngà Tốt';

    contentInput.value = data.content;
    previewText.textContent = data.content;

    // Default: select up to 4 images
    fbState.selectedImages = new Set(fbState.allImages.slice(0, 4));
    renderFacebookPhotoGrid();
    renderFacebookPreviewGallery();

    byId('fbPublishStatus').textContent = `Sẵn sàng đăng lên Fanpage ${fbState.pageName}`;
  } catch (error) {
    contentInput.value = '';
    previewText.textContent = `Lỗi: ${error.message}`;
    byId('fbPublishStatus').textContent = error.message;
  }
}

function renderFacebookPhotoGrid() {
  const grid = byId('fbPhotoGrid');
  const countLabel = byId('fbPhotoCount');
  if (!grid) return;

  grid.innerHTML = '';
  countLabel.textContent = `Đã chọn ${fbState.selectedImages.size}/${fbState.allImages.length} ảnh`;

  if (!fbState.allImages.length) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--muted); font-size: 12px; padding: 10px;">Căn nhà này chưa có hình ảnh</div>';
    return;
  }

  fbState.allImages.forEach((imgUrl, index) => {
    const isSelected = fbState.selectedImages.has(imgUrl);
    const item = document.createElement('div');
    item.className = `cms-fb-photo-item ${isSelected ? 'selected' : ''}`;
    item.innerHTML = `
      <img src="${imgUrl}" alt="Ảnh ${index + 1}" loading="lazy">
      <div class="check-badge">${isSelected ? '✓' : ''}</div>
    `;

    item.onclick = () => {
      if (fbState.selectedImages.has(imgUrl)) {
        fbState.selectedImages.delete(imgUrl);
      } else {
        fbState.selectedImages.add(imgUrl);
      }
      renderFacebookPhotoGrid();
      renderFacebookPreviewGallery();
    };

    grid.appendChild(item);
  });
}

function renderFacebookPreviewGallery() {
  const gallery = byId('fbPreviewGallery');
  if (!gallery) return;

  const images = Array.from(fbState.selectedImages);
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
  const content = (byId('fbPostContent')?.value || '').trim();
  if (!content) {
    alert('Vui lòng nhập nội dung bài viết');
    return;
  }

  const submitBtn = byId('fbSubmitBtn');
  const statusNote = byId('fbPublishStatus');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Đang đăng lên Facebook qua Composio…</span>`;
  statusNote.textContent = 'Đang xử lý kết nối Composio MCP…';

  try {
    const result = await cmsApi('/api/admin/v1/facebook/publish', {
      method: 'POST',
      body: {
        propertyId: fbState.propertyId,
        content,
        images: Array.from(fbState.selectedImages),
        pageName: fbState.pageName
      }
    });

    statusNote.textContent = result.message || 'Đã đăng thành công!';
    submitBtn.innerHTML = `<svg class="cms-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>Đã xuất bản & Lưu thành công</span>`;

    // Auto-update current property detail in UI
    if (fbState.propertyId) {
      if (cmsState.currentProperty && cmsState.currentProperty.id === fbState.propertyId) {
        cmsState.currentProperty.notes = content;
      }
      cmsState.propertiesLoaded = false;
      openPropertyDetail(fbState.propertyId);
    }

    // Show toast with Facebook link
    if (result.data?.postUrl) {
      if (confirm(`${result.message || 'Đã xuất bản thành công lên Fanpage Ngọc Nhà Tốt!'}\n\nBạn có muốn mở xem bài viết trên Facebook không?`)) {
        window.open(result.data.postUrl, '_blank');
      }
    } else {
      alert(result.message || 'Đã đăng bài thành công lên Facebook!');
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

document.querySelectorAll('[data-fb-tone]').forEach(chip => {
  chip.addEventListener('click', () => {
    const tone = chip.dataset.fbTone;
    if (fbState.propertyId) {
      loadFacebookDraft(fbState.propertyId, tone);
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

bootstrapCms();

