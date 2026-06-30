// app.js — Giao diện & điều phối, khớp 100% với ID/class trong index.html

const state = {
  currentCategoryId: 'all',   // 'all' | 'favorites' | id danh mục
  searchQuery: '',
  sortMode: 'updated_desc',
  currentPage: 1,
  loadedItems: [],
  categories: [],
  editingItemId: null,
  tempCategoryFields: [],
  autoLockTimer: null,
  settings: { autoLockTime: 5, theme: 'dark' }
};

document.addEventListener('DOMContentLoaded', () => {
  // Lucide đã được khởi tạo trong index.html; gọi lại an toàn nếu có
  if (window.lucide) lucide.createIcons();
});

async function initializeApp() {
  state.settings = loadUserSettings();
  applyTheme(state.settings.theme);

  // Dùng vault_initialized làm cờ chuẩn (đã được set khi setup/import)
  const initialized = localStorage.getItem('vault_initialized') === 'true';
  showLockScreen(initialized ? 'unlock' : 'setup');

  setupEventListeners();
  refreshIcons();
}

// ============ ĐIỀU KHIỂN MÀN HÌNH ============
function showLockScreen(mode) {
  document.getElementById('lock-screen').classList.remove('hidden');
  document.getElementById('dashboard-screen').classList.add('hidden');
  const setup = document.getElementById('setup-mode-container');
  const unlock = document.getElementById('unlock-mode-container');
  if (mode === 'setup') {
    setup.classList.remove('hidden');
    unlock.classList.add('hidden');
  } else {
    unlock.classList.remove('hidden');
    setup.classList.add('hidden');
  }
  refreshIcons();
}

function showDashboard() {
  document.getElementById('lock-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
  refreshIcons();
}

function openSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  sb.classList.remove('hidden');
  sb.classList.add('flex');
  if (ov) ov.classList.remove('hidden');
}
function closeSidebar() {
  if (window.innerWidth >= 768) return; // desktop luôn hiện
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  sb.classList.add('hidden');
  sb.classList.remove('flex');
  if (ov) ov.classList.add('hidden');
}

function refreshIcons() {
  if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
}

function applyTheme(theme) {
  state.settings.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.setAttribute('data-theme', theme);
}

// ============ TRÌNH LẮNG NGHE SỰ KIỆN ============
function setupEventListeners() {
  // Thiết lập mật khẩu lần đầu
  const setupForm = document.getElementById('setup-password-form');
  if (setupForm) setupForm.addEventListener('submit', handleSetupSubmit);

  // Mở khóa
  const unlockForm = document.getElementById('unlock-password-form');
  if (unlockForm) unlockForm.addEventListener('submit', handleUnlockSubmit);

  // Mở/đóng sidebar trên mobile
  bindClick('btn-open-sidebar', openSidebar);
  bindClick('btn-open-sidebar-mobile', openSidebar);
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.addEventListener('click', closeSidebar);

  // Khóa vault
  bindClick('btn-lock-vault', handleLock);
  bindClick('btn-lock-vault-mobile', handleLock);

  // Tìm kiếm
  const search = document.getElementById('search-input');
  if (search) search.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    state.currentPage = 1;
    renderVaultItems();
  });

  // Bộ lọc
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) sortSelect.addEventListener('change', (e) => {
    state.sortMode = e.target.value;
    state.currentPage = 1;
    renderVaultItems();
  });
  bindClick('filter-all', () => selectFilter('all'));
  bindClick('filter-favorites', () => selectFilter('favorites'));

  // Danh mục
  bindClick('btn-add-category', openCategoryModal);
  bindClick('btn-add-form-field', () => addCategoryFieldRow());
  const tplSel = document.getElementById('category-template-select');
  if (tplSel) tplSel.addEventListener('change', (e) => applyCategoryTemplate(e.target.value));
  const catForm = document.getElementById('category-form');
  if (catForm) catForm.addEventListener('submit', handleCategorySubmit);

  // Bản ghi
  bindClick('btn-add-item', () => openItemModal());
  bindClick('btn-empty-add-item', () => openItemModal());
  const itemForm = document.getElementById('item-form');
  if (itemForm) itemForm.addEventListener('submit', handleItemSubmit);

  // Sao lưu
  bindClick('btn-backup-menu', () => {
    document.getElementById('backup-dropdown-menu').classList.toggle('hidden');
  });
  bindClick('btn-export', async () => {
    await exportVaultData();
    showToast('Đã xuất file sao lưu.', 'success');
    document.getElementById('backup-dropdown-menu').classList.add('hidden');
  });
  const importInput = document.getElementById('import-file-input');
  if (importInput) importInput.addEventListener('change', handleImport);

  // Trình tạo mật khẩu
  bindClick('btn-open-generator', openGeneratorModal);
  bindClick('btn-generate-password', runGenerator);
  bindClick('btn-copy-generated', () => {
    const val = document.getElementById('generator-result').textContent;
    copyToClipboard(val);
  });
  const lenSlider = document.getElementById('generator-length');
  if (lenSlider) lenSlider.addEventListener('input', (e) => {
    document.getElementById('generator-length-val').textContent = e.target.value + ' ký tự';
  });

  // Cài đặt
  bindClick('btn-open-settings', openSettingsModal);
  bindClick('btn-change-password', handleChangePassword);
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) settingsForm.addEventListener('submit', handleSettingsSubmit);

  // Đóng tất cả modal
  document.querySelectorAll('.category-modal-close').forEach(b => b.addEventListener('click', () => closeModal('category-modal')));
  document.querySelectorAll('.item-modal-close').forEach(b => b.addEventListener('click', () => closeModal('item-modal')));
  document.querySelectorAll('.generator-modal-close').forEach(b => b.addEventListener('click', () => closeModal('generator-modal')));
  document.querySelectorAll('.settings-modal-close').forEach(b => b.addEventListener('click', () => closeModal('settings-modal')));

  // Reset bộ đếm tự động khóa theo hoạt động người dùng
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetAutoLockTimer, { passive: true });
  });
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
}

// ============ XÁC THỰC ============
async function handleSetupSubmit(e) {
  e.preventDefault();
  const pw = document.getElementById('master-password-setup').value;
  const confirm = document.getElementById('master-password-confirm').value;
  const errEl = document.getElementById('setup-error-msg');

  if (pw.length < 8) {
    errEl.querySelector('span').textContent = 'Mật khẩu phải có ít nhất 8 ký tự!';
    errEl.classList.remove('hidden');
    return;
  }
  if (pw !== confirm) {
    errEl.querySelector('span').textContent = 'Mật khẩu xác nhận không khớp!';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  const ok = await setupMasterPassword(pw);
  if (ok) {
    await seedDefaultCategoriesIfEmpty();
    await enterVault();
    showToast('Đã khởi tạo két sắt thành công!', 'success');
  } else {
    showToast('Có lỗi khi khởi tạo. Vui lòng thử lại.', 'danger');
  }
}

async function handleUnlockSubmit(e) {
  e.preventDefault();
  const pw = document.getElementById('master-password-unlock').value;
  const errEl = document.getElementById('unlock-error-msg');

  const ok = await unlockVault(pw);
  if (ok) {
    errEl.classList.add('hidden');
    document.getElementById('master-password-unlock').value = '';
    await enterVault();
  } else {
    errEl.classList.remove('hidden');
  }
}

async function enterVault() {
  showDashboard();
  await loadAllData();
  startAutoLock();
}

function handleLock() {
  lockVault();
  stopAutoLock();
  state.loadedItems = [];
  showLockScreen('unlock');
  showToast('Két sắt đã được khóa.', 'success');
}

// ============ TẢI & HIỂN THỊ DỮ LIỆU ============
async function loadAllData() {
  state.categories = await loadCategories();
  state.loadedItems = await loadVaultData();
  renderCategories();
  renderVaultItems();
}

async function seedDefaultCategoriesIfEmpty() {
  const existing = await loadCategories();
  if (existing.length === 0 && Array.isArray(window.DEFAULT_CATEGORIES)) {
    for (const cat of window.DEFAULT_CATEGORIES) {
      await saveCategory(cat);
    }
  }
}

function selectFilter(filter) {
  state.currentCategoryId = filter;
  state.currentPage = 1;
  if (window.innerWidth < 768) closeSidebar();
  renderCategories();
  renderVaultItems();
}

function renderCategories() {
  const container = document.getElementById('category-list');
  if (!container) return;

  // Cập nhật badge bộ lọc chính
  document.getElementById('badge-count-all').textContent = state.loadedItems.length;
  document.getElementById('badge-count-fav').textContent = state.loadedItems.filter(i => i.isFavorite).length;

  if (state.categories.length === 0) {
    container.innerHTML = '<div class="text-center py-4 text-xs text-slate-600">Chưa có danh mục nào.</div>';
    return;
  }

  container.innerHTML = state.categories.map(cat => {
    const count = state.loadedItems.filter(i => i.categoryId === cat.id).length;
    const active = state.currentCategoryId === cat.id;
    return `
      <button data-cat-id="${cat.id}" class="cat-btn w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${active ? 'text-brand-500 bg-brand-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}">
        <div class="flex items-center gap-2.5">
          <i data-lucide="${cat.icon || 'folder'}" class="w-4 h-4"></i>
          <span>${escapeHtml(cat.name)}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px]">${count}</span>
          <span class="del-cat text-slate-600 hover:text-rose-500 p-0.5" data-del-cat="${cat.id}" title="Xóa danh mục">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </span>
        </div>
      </button>`;
  }).join('');

  container.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.del-cat')) return;
      selectFilter(btn.getAttribute('data-cat-id'));
    });
  });
  container.querySelectorAll('.del-cat').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.getAttribute('data-del-cat');
      if (confirm('Xóa danh mục này? (Các bản ghi thuộc danh mục sẽ không bị xóa)')) {
        await deleteCategory(id);
        if (state.currentCategoryId === id) state.currentCategoryId = 'all';
        await loadAllData();
        showToast('Đã xóa danh mục.', 'success');
      }
    });
  });
  refreshIcons();
}

function getFilteredItems() {
  let items = [...state.loadedItems];
  if (state.currentCategoryId === 'favorites') {
    items = items.filter(i => i.isFavorite);
  } else if (state.currentCategoryId !== 'all') {
    items = items.filter(i => i.categoryId === state.currentCategoryId);
  }
  if (state.searchQuery) {
    items = items.filter(i => {
      const haystack = JSON.stringify(i.fields || {}).toLowerCase();
      return haystack.includes(state.searchQuery);
    });
  }
  // Sắp xếp: ưu tiên yêu thích lên đầu, rồi theo chế độ đã chọn
  const titleOf = (it) => {
    const f = it.fields || {};
    return String(f.title || f.serviceName || f.bankName || Object.values(f)[0] || '').toLowerCase();
  };
  const catNameOf = (it) => {
    const c = state.categories.find(x => x.id === it.categoryId);
    return (c ? c.name : 'zzz').toLowerCase();
  };
  items.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return b.isFavorite - a.isFavorite;
    switch (state.sortMode) {
      case 'created_desc': return b.createdAt - a.createdAt;
      case 'title_asc':    return titleOf(a).localeCompare(titleOf(b), 'vi');
      case 'title_desc':   return titleOf(b).localeCompare(titleOf(a), 'vi');
      case 'category':
        return catNameOf(a).localeCompare(catNameOf(b), 'vi') || titleOf(a).localeCompare(titleOf(b), 'vi');
      case 'updated_desc':
      default:             return b.updatedAt - a.updatedAt;
    }
  });
  return items;
}

function renderVaultItems() {
  const grid = document.getElementById('vault-items-grid');
  const empty = document.getElementById('empty-state');
  if (!grid) return;

  const items = getFilteredItems();

  // Cập nhật tiêu đề
  const titleEl = document.getElementById('current-category-title');
  const countEl = document.getElementById('current-category-count');
  let title = 'Tất cả dữ liệu';
  if (state.currentCategoryId === 'favorites') title = 'Mục yêu thích';
  else if (state.currentCategoryId !== 'all') {
    const cat = state.categories.find(c => c.id === state.currentCategoryId);
    title = cat ? cat.name : 'Danh mục';
  }
  if (titleEl) titleEl.textContent = title;
  if (countEl) countEl.textContent = items.length + ' mục';

  if (items.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  // Phân trang
  const PAGE_SIZE = 9;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  const startIdx = (state.currentPage - 1) * PAGE_SIZE;
  const pageItems = items.slice(startIdx, startIdx + PAGE_SIZE);

  grid.innerHTML = pageItems.map(item => renderItemCard(item)).join('');
  renderPagination(totalPages, items.length);

  grid.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openItemModal(b.getAttribute('data-edit'))));
  grid.querySelectorAll('[data-duplicate]').forEach(b => b.addEventListener('click', () => handleDuplicateItem(b.getAttribute('data-duplicate'))));
  grid.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => handleDeleteItem(b.getAttribute('data-delete'))));
  grid.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyToClipboard(decodeURIComponent(b.getAttribute('data-copy')))));
  grid.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => toggleFieldVisibility(b.getAttribute('data-toggle'))));
  refreshIcons();
}

function renderItemCard(item) {
  const cat = state.categories.find(c => c.id === item.categoryId);
  const catName = cat ? cat.name : 'Không phân loại';
  const fields = item.fields || {};
  const fieldDefs = cat ? cat.fields : Object.keys(fields).map(k => ({ name: k, label: k, type: 'text' }));

  // Tiêu đề thẻ: lấy field 'title' hoặc field đầu tiên
  const titleVal = fields.title || fields.serviceName || fields.bankName || Object.values(fields)[0] || 'Không tiêu đề';

  const rows = fieldDefs.map(fd => {
    const val = fields[fd.name];
    if (val === undefined || val === '' || fd.name === 'title') return '';
    const isSecret = fd.type === 'password';
    const fieldId = `f_${item.id}_${fd.name}`;
    const display = isSecret ? '••••••••' : escapeHtml(String(val));
    return `
      <div class="vault-field-row flex items-center justify-between text-xs px-2 py-1 rounded bg-slate-950/40">
        <span class="text-slate-500">${escapeHtml(fd.label || fd.name)}</span>
        <span class="flex items-center gap-1.5">
          <span id="${fieldId}" data-secret="${encodeURIComponent(String(val))}" data-revealed="false" class="font-mono text-slate-200 truncate max-w-[120px]">${display}</span>
          ${isSecret ? `<button data-toggle="${fieldId}" class="text-slate-500 hover:text-brand-500"><i data-lucide="eye" class="w-3.5 h-3.5"></i></button>` : ''}
          <button data-copy="${encodeURIComponent(String(val))}" class="text-slate-500 hover:text-brand-500"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
        </span>
      </div>`;
  }).join('');

  return `
    <div class="vault-card bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2 min-w-0">
          ${item.isFavorite ? '<i data-lucide="star" class="w-4 h-4 text-amber-500 shrink-0"></i>' : ''}
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-white truncate">${escapeHtml(String(titleVal))}</h3>
            <span class="text-[10px] text-slate-500">${escapeHtml(catName)}</span>
          </div>
        </div>
         <div class="flex items-center gap-1 shrink-0">
          <button data-duplicate="${item.id}" class="text-slate-500 hover:text-brand-500 p-1" title="Tạo bản sao"><i data-lucide="copy-plus" class="w-3.5 h-3.5"></i></button>
          <button data-edit="${item.id}" class="text-slate-500 hover:text-brand-500 p-1" title="Chỉnh sửa"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
          <button data-delete="${item.id}" class="text-slate-500 hover:text-rose-500 p-1" title="Xóa"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>
      </div>
      <div class="flex flex-col gap-1.5">${rows}</div>
    </div>`;
}

function toggleFieldVisibility(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  const revealed = el.getAttribute('data-revealed') === 'true';
  if (revealed) {
    el.textContent = '••••••••';
    el.setAttribute('data-revealed', 'false');
  } else {
    el.textContent = decodeURIComponent(el.getAttribute('data-secret'));
    el.setAttribute('data-revealed', 'true');
  }
}

async function handleDeleteItem(id) {
  if (!confirm('Bạn chắc chắn muốn xóa bản ghi này?')) return;
  await deleteVaultData(id);
  state.loadedItems = await loadVaultData();
  renderCategories();
  renderVaultItems();
  showToast('Đã xóa bản ghi.', 'success');
}

async function handleDuplicateItem(id) {
  const original = state.loadedItems.find(i => i.id === id);
  if (!original) return;

  // Lấy tiêu đề hiện có để thêm hậu tố "(bản sao)"
  const newFields = { ...(original.fields || {}) };
  const titleKey = newFields.title !== undefined ? 'title'
    : (newFields.serviceName !== undefined ? 'serviceName'
    : (newFields.bankName !== undefined ? 'bankName' : null));
  if (titleKey) {
    newFields[titleKey] = String(newFields[titleKey] || '') + ' (bản sao)';
  }

  await saveVaultData({
    id: null, // null => tạo ID mới, không ghi đè bản gốc
    categoryId: original.categoryId,
    fields: newFields,
    isFavorite: false,
    createdAt: Date.now()
  });

  state.loadedItems = await loadVaultData();
  renderCategories();
  renderVaultItems();
  showToast('Đã tạo bản sao của bản ghi.', 'success');
}

function renderPagination(totalPages, totalItems) {
  let bar = document.getElementById('pagination-bar');
  const grid = document.getElementById('vault-items-grid');
  if (!grid) return;

  // Tạo thanh phân trang nếu chưa có
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'pagination-bar';
    bar.className = 'flex items-center justify-center gap-2 mt-6';
    grid.parentNode.appendChild(bar);
  }

  if (totalPages <= 1) { bar.innerHTML = ''; return; }

  const btn = (label, page, disabled, active) => `
    <button data-page="${page}" ${disabled ? 'disabled' : ''}
      class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all
      ${active ? 'bg-brand-600 text-white'
               : disabled ? 'bg-slate-900 text-slate-700 cursor-not-allowed'
                          : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'}">
      ${label}
    </button>`;

  let html = btn('‹ Trước', state.currentPage - 1, state.currentPage === 1, false);
  for (let p = 1; p <= totalPages; p++) {
    html += btn(String(p), p, false, p === state.currentPage);
  }
  html += btn('Sau ›', state.currentPage + 1, state.currentPage === totalPages, false);
  bar.innerHTML = html;

  bar.querySelectorAll('[data-page]').forEach(b => {
    b.addEventListener('click', () => {
      const p = parseInt(b.getAttribute('data-page'), 10);
      if (p >= 1 && p <= totalPages) {
        state.currentPage = p;
        renderVaultItems();
        document.querySelector('.main-content, main .overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

// ============ MODAL CHUNG ============
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  refreshIcons();
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ============ MODAL DANH MỤC ============
const CATEGORY_TEMPLATES = {
  custom: { name: '', icon: 'folder', fields: [] },
  vps: { name: 'Máy chủ / VPS', icon: 'server', fields: [
    { label: 'Tên máy chủ', type: 'text', required: true },
    { label: 'Địa chỉ IP', type: 'text' },
    { label: 'Cổng SSH', type: 'number' },
    { label: 'Tên đăng nhập', type: 'text' },
    { label: 'Mật khẩu', type: 'password' },
    { label: 'Ghi chú', type: 'textarea' }
  ]},
  medical: { name: 'Hồ sơ y tế', icon: 'heart-pulse', fields: [
    { label: 'Họ tên', type: 'text', required: true },
    { label: 'Mã bảo hiểm y tế', type: 'text' },
    { label: 'Nhóm máu', type: 'text' },
    { label: 'Dị ứng / Lưu ý', type: 'textarea' }
  ]},
  identity: { label: '', name: 'Giấy tờ tùy thân', icon: 'id-card', fields: [
    { label: 'Loại giấy tờ', type: 'text', required: true },
    { label: 'Số giấy tờ', type: 'text' },
    { label: 'Ngày cấp', type: 'date' },
    { label: 'Nơi cấp', type: 'text' }
  ]},
  wifi: { name: 'Mạng Wi-Fi', icon: 'wifi', fields: [
    { label: 'Tên mạng (SSID)', type: 'text', required: true },
    { label: 'Mật khẩu', type: 'password' },
    { label: 'Ghi chú', type: 'textarea' }
  ]},
  crypto: { name: 'Ví tiền mã hóa', icon: 'bitcoin', fields: [
    { label: 'Tên ví', type: 'text', required: true },
    { label: 'Địa chỉ ví', type: 'text' },
    { label: 'Cụm từ khôi phục', type: 'password' },
    { label: 'Ghi chú', type: 'textarea' }
  ]}
};

function openCategoryModal() {
  document.getElementById('category-name-input').value = '';
  document.getElementById('category-fields-container').innerHTML = '';
  const iconSel = document.getElementById('category-icon-input');
  if (iconSel) iconSel.value = 'folder';
  const tplSel = document.getElementById('category-template-select');
  if (tplSel) tplSel.value = 'custom';
  addCategoryFieldRow();
  openModal('category-modal');
}

function applyCategoryTemplate(key) {
  const tpl = CATEGORY_TEMPLATES[key];
  if (!tpl) return;
  document.getElementById('category-name-input').value = tpl.name;
  const iconSel = document.getElementById('category-icon-input');
  if (iconSel) iconSel.value = tpl.icon;
  const container = document.getElementById('category-fields-container');
  container.innerHTML = '';
  if (tpl.fields.length === 0) {
    addCategoryFieldRow();
  } else {
    tpl.fields.forEach(f => addCategoryFieldRow(f));
  }
}

function addCategoryFieldRow(preset) {
  const container = document.getElementById('category-fields-container');
  const row = document.createElement('div');
  row.className = 'flex flex-wrap gap-2 items-center bg-slate-950/40 p-2 rounded-lg';
  const types = [
    ['text', 'Văn bản'], ['password', 'Bí mật'], ['textarea', 'Ghi chú dài'],
    ['email', 'Email'], ['tel', 'Số điện thoại'], ['url', 'Đường dẫn URL'],
    ['date', 'Ngày tháng'], ['number', 'Số']
  ];
  const selType = (preset && preset.type) || 'text';
  row.innerHTML = `
    <input type="text" placeholder="Nhãn trường (vd: Mật khẩu)" value="${preset ? escapeHtml(preset.label) : ''}"
      class="cat-field-label flex-1 min-w-[140px] bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-white">
    <select class="cat-field-type bg-slate-950 border border-slate-800 rounded-lg py-2 px-2 text-xs text-white">
      ${types.map(([v, t]) => `<option value="${v}" ${v === selType ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <label class="flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer select-none">
      <input type="checkbox" class="cat-field-required w-3.5 h-3.5 rounded bg-slate-950 text-brand-500" ${preset && preset.required ? 'checked' : ''}>
      Bắt buộc
    </label>
    <button type="button" class="remove-field text-slate-500 hover:text-rose-500 p-1"><i data-lucide="x" class="w-4 h-4"></i></button>`;
  container.appendChild(row);
  row.querySelector('.remove-field').addEventListener('click', () => row.remove());
  refreshIcons();
}

async function handleCategorySubmit(e) {
  e.preventDefault();
  const name = document.getElementById('category-name-input').value.trim();
  if (!name) return;
  const iconSel = document.getElementById('category-icon-input');
  const icon = iconSel ? iconSel.value : 'folder';

  const rows = document.querySelectorAll('#category-fields-container > div');
  const fields = [];
  rows.forEach((row, idx) => {
    const label = row.querySelector('.cat-field-label').value.trim();
    const type = row.querySelector('.cat-field-type').value;
    const required = row.querySelector('.cat-field-required')?.checked || false;
    if (label) {
      fields.push({ name: slugify(label) + '_' + idx, label, type, required });
    }
  });
  if (fields.length === 0) {
    showToast('Vui lòng thêm ít nhất một trường.', 'warning');
    return;
  }

  await saveCategory({ name, icon, fields });
  closeModal('category-modal');
  await loadAllData();
  showToast('Đã lưu danh mục.', 'success');
}

// ============ MODAL BẢN GHI ============
function openItemModal(itemId = null) {
  if (state.categories.length === 0) {
    showToast('Hãy tạo một danh mục trước khi thêm bản ghi.', 'warning');
    openCategoryModal();
    return;
  }

  state.editingItemId = itemId;
  const titleEl = document.getElementById('item-modal-title').querySelector('span');
  const item = itemId ? state.loadedItems.find(i => i.id === itemId) : null;

  // Chọn danh mục: nếu đang lọc theo 1 danh mục cụ thể thì mặc định dùng nó
  let categoryId = item ? item.categoryId
    : (state.currentCategoryId !== 'all' && state.currentCategoryId !== 'favorites'
        ? state.currentCategoryId : state.categories[0].id);

  titleEl.textContent = item ? 'Chỉnh sửa bản ghi' : 'Thêm bản ghi bảo mật';
  document.getElementById('item-id-input').value = itemId || '';
  document.getElementById('item-category-id-input').value = categoryId;
  document.getElementById('item-favorite-checkbox').checked = item ? !!item.isFavorite : false;

  renderItemFormFields(categoryId, item ? item.fields : {});
  openModal('item-modal');
}

function renderItemFormFields(categoryId, values) {
  const container = document.getElementById('item-fields-container');
  const cat = state.categories.find(c => c.id === categoryId);

  // Dropdown chọn danh mục
  let html = `
    <div>
      <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Danh mục</label>
      <select id="item-category-select" class="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-white">
        ${state.categories.map(c => `<option value="${c.id}" ${c.id === categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>`;

  if (cat) {
    html += cat.fields.map(fd => {
      const val = values && values[fd.name] !== undefined ? escapeHtml(String(values[fd.name])) : '';
      if (fd.type === 'textarea') {
        return `<div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">${escapeHtml(fd.label)}</label>
          <textarea data-field="${fd.name}" rows="3" class="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-white">${val}</textarea>
        </div>`;
      }
      const type = fd.type === 'password' ? 'text' : 'text';
      return `<div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">${escapeHtml(fd.label)}</label>
        <input type="${type}" data-field="${fd.name}" value="${val}" class="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-white font-mono">
      </div>`;
    }).join('');
  }

  container.innerHTML = html;

  // Đổi danh mục thì render lại các trường
  const sel = document.getElementById('item-category-select');
  sel.addEventListener('change', () => {
    document.getElementById('item-category-id-input').value = sel.value;
    renderItemFormFields(sel.value, {});
  });
}

async function handleItemSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('item-id-input').value || null;
  const categoryId = document.getElementById('item-category-select').value;
  const isFavorite = document.getElementById('item-favorite-checkbox').checked;

  const fields = {};
  document.querySelectorAll('#item-fields-container [data-field]').forEach(el => {
    fields[el.getAttribute('data-field')] = el.value;
  });

  // Kiểm tra các trường bắt buộc
  const cat = state.categories.find(c => c.id === categoryId);
  if (cat) {
    for (const fd of cat.fields) {
      if (fd.required && !String(fields[fd.name] || '').trim()) {
        showToast(`Trường "${fd.label}" là bắt buộc.`, 'warning');
        return;
      }
    }
  }

  const existing = id ? state.loadedItems.find(i => i.id === id) : null;
  await saveVaultData({
    id, categoryId, fields, isFavorite,
    createdAt: existing ? existing.createdAt : Date.now()
  });

  closeModal('item-modal');
  state.loadedItems = await loadVaultData();
  renderCategories();
  renderVaultItems();
  showToast(id ? 'Đã cập nhật bản ghi.' : 'Đã thêm bản ghi mới.', 'success');
}

// ============ TRÌNH TẠO MẬT KHẨU ============
function openGeneratorModal() {
  runGenerator();
  openModal('generator-modal');
}

function runGenerator() {
  const length = parseInt(document.getElementById('generator-length').value, 10);
  const options = {
    uppercase: document.getElementById('generator-uppercase').checked,
    lowercase: document.getElementById('generator-lowercase').checked,
    numbers: document.getElementById('generator-numbers').checked,
    special: document.getElementById('generator-symbols').checked
  };
  const pw = generateRandomPassword(length, options);
  document.getElementById('generator-result').textContent = pw;
  updateStrengthMeter(pw);
}

function calcPasswordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  return Math.min(score, 4); // 0..4
}

function updateStrengthMeter(pw) {
  const bar = document.getElementById('gen-strength-bar');
  const label = document.getElementById('gen-strength-label');
  if (!bar) return;
  const score = calcPasswordStrength(pw);
  const levels = [
    { w: '20%', c: '#dc2626', t: 'Rất yếu' },
    { w: '40%', c: '#d97706', t: 'Yếu' },
    { w: '60%', c: '#d97706', t: 'Trung bình' },
    { w: '80%', c: '#0284c7', t: 'Mạnh' },
    { w: '100%', c: '#059669', t: 'Rất mạnh' }
  ];
  const lv = levels[score];
  bar.style.width = lv.w;
  bar.style.backgroundColor = lv.c;
  if (label) { label.textContent = lv.t; label.style.color = lv.c; }
}

// ============ CÀI ĐẶT ============
function openSettingsModal() {
  document.getElementById('settings-auto-lock').value = String(state.settings.autoLockTime || 5);
  document.getElementById('settings-theme').value = state.settings.theme || 'dark';
  openModal('settings-modal');
}

function handleSettingsSubmit(e) {
  e.preventDefault();
  const autoLockTime = parseInt(document.getElementById('settings-auto-lock').value, 10);
  const theme = document.getElementById('settings-theme').value;
  state.settings = { autoLockTime, theme };
  saveUserSettings(state.settings);
  applyTheme(theme);
  startAutoLock(); // áp dụng thời gian mới
  closeModal('settings-modal');
  showToast('Đã lưu cấu hình.', 'success');
}

async function handleChangePassword() {
  const oldPw = document.getElementById('change-old-password').value;
  const newPw = document.getElementById('change-new-password').value;
  const confirmPw = document.getElementById('change-confirm-password').value;

  if (!oldPw || !newPw) {
    showToast('Vui lòng nhập đầy đủ mật khẩu.', 'warning');
    return;
  }
  if (newPw.length < 8) {
    showToast('Mật khẩu mới phải có ít nhất 8 ký tự.', 'warning');
    return;
  }
  if (newPw !== confirmPw) {
    showToast('Xác nhận mật khẩu mới không khớp.', 'danger');
    return;
  }

  const btn = document.getElementById('btn-change-password');
  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = 'Đang xử lý...';

  try {
    await changeMasterPassword(oldPw, newPw);
    showToast('Đã đổi mật khẩu chính thành công!', 'success');
    document.getElementById('change-old-password').value = '';
    document.getElementById('change-new-password').value = '';
    document.getElementById('change-confirm-password').value = '';
    closeModal('settings-modal');
    await loadAllData();
  } catch (err) {
    showToast(err.message || 'Lỗi khi đổi mật khẩu.', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
    refreshIcons();
  }
}

// ============ TỰ ĐỘNG KHÓA ============
function startAutoLock() {
  stopAutoLock();
  resetAutoLockTimer();
}
function stopAutoLock() {
  if (state.autoLockTimer) clearTimeout(state.autoLockTimer);
  state.autoLockTimer = null;
}
function resetAutoLockTimer() {
  if (!isVaultUnlocked()) return;
  if (state.autoLockTimer) clearTimeout(state.autoLockTimer);
  const minutes = state.settings.autoLockTime || 5;
  state.autoLockTimer = setTimeout(() => {
    handleLock();
    showToast('Két sắt tự động khóa do không hoạt động.', 'warning');
  }, minutes * 60 * 1000);
}

// ============ IMPORT ============
async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await importVaultData(file);
    showToast('Đã nhập dữ liệu. Vui lòng mở khóa lại nếu cần.', 'success');
    if (isVaultUnlocked()) {
      await loadAllData();
    }
  } catch (err) {
    showToast(err.message || 'Lỗi khi nhập file.', 'danger');
  }
  e.target.value = '';
  document.getElementById('backup-dropdown-menu').classList.add('hidden');
}

// ============ CLIPBOARD ============
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Đã sao chép. Tự xóa sau 30 giây.', 'success');
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === text) await navigator.clipboard.writeText('');
      } catch { /* trình duyệt chặn đọc clipboard: bỏ qua */ }
    }, CLIPBOARD_CLEAR_DELAY);
  } catch {
    // Fallback nếu clipboard API bị chặn
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Đã sao chép.', 'success');
  }
}

// ============ TOAST ============
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const colors = {
    success: 'border-emerald-500 text-emerald-300',
    danger: 'border-rose-500 text-rose-300',
    warning: 'border-amber-500 text-amber-300'
  };
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto bg-slate-900 border-l-4 ${colors[type] || colors.success} shadow-xl rounded-lg px-4 py-3 text-xs min-w-[240px]`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============ TIỆN ÍCH ============
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
}
