/**
 * app.js
 * Main application controller — router, navigation, modal system, toasts.
 */

// ========================
// APP STATE
// ========================
const AppState = (() => {
  const now = new Date();
  let _month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  return {
    get selectedMonth() { return _month; },
    setMonth(ym) { _month = ym; },
  };
})();

// ========================
// ROUTER
// ========================
const Router = (() => {
  const routes = {
    '#dashboard':  { title: '儀表板',   init: () => Dashboard.init() },
    '#cases':      { title: '病例列表', init: () => Cases.initList() },
    '#add-case':   { title: '新增病例', init: () => Cases.openAddEditModal() },
    '#analytics':  { title: '統計分析', init: () => Analytics.init() },
    '#export':     { title: '資料匯出', init: () => Export.init() },
    '#settings':   { title: '點數設定', init: () => PointSettings.init() },
    '#billing':    { title: 'HIS 計費核對', init: () => Billing.init() },
    '#config':     { title: '系統設定', init: () => Config.init() },
  };

  function navigate(hash) {
    if (!hash || hash === '#') hash = '#dashboard';
    window.location.hash = hash;
  }

  function handleRoute() {
    const hash = window.location.hash || '#dashboard';
    const route = routes[hash];

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === hash);
    });

    // Update topbar title
    const titleEl = document.getElementById('topbar-title');
    if (titleEl && route) titleEl.textContent = route.title;

    // Show/hide month selector
    const monthSel = document.getElementById('month-selector-wrap');
    const showMonthSelector = ['#dashboard','#cases','#add-case'].includes(hash);
    if (monthSel) monthSel.style.display = showMonthSelector ? '' : 'none';

    // Run page init
    if (route) {
      if (hash === '#add-case') {
        navigate('#cases');
        setTimeout(() => Cases.openAddEditModal(), 100);
        return;
      }
      route.init();
    }

    // Close sidebar on mobile
    if (window.innerWidth < 768) {
      document.getElementById('sidebar').classList.remove('open');
    }
  }

  window.addEventListener('hashchange', handleRoute);

  return { navigate, handleRoute };
})();

// ========================
// MONTH SELECTOR
// ========================
function initMonthSelector() {
  const wrap = document.getElementById('month-selector-wrap');
  if (!wrap) return;

  function renderMonthSelector() {
    const [y, m] = AppState.selectedMonth.split('-').map(Number);
    wrap.innerHTML = `
      <div class="month-selector">
        <button id="month-prev" title="上個月">‹</button>
        <select id="month-year">${buildYearOptions(y)}</select>
        <span style="color:var(--text-muted);font-size:12px">年</span>
        <select id="month-month">${buildMonthOptions(m)}</select>
        <span style="color:var(--text-muted);font-size:12px">月</span>
        <button id="month-next" title="下個月">›</button>
      </div>`;

    document.getElementById('month-prev').addEventListener('click', () => changeMonth(-1));
    document.getElementById('month-next').addEventListener('click', () => changeMonth(1));
    document.getElementById('month-year').addEventListener('change', onMonthChange);
    document.getElementById('month-month').addEventListener('change', onMonthChange);
  }

  function buildYearOptions(selectedYear) {
    const now = new Date();
    let html = '';
    for (let y = 2022; y <= now.getFullYear() + 1; y++) {
      html += `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`;
    }
    return html;
  }

  function buildMonthOptions(selectedMonth) {
    let html = '';
    for (let m = 1; m <= 12; m++) {
      html += `<option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${m}</option>`;
    }
    return html;
  }

  function changeMonth(delta) {
    const [y, m] = AppState.selectedMonth.split('-').map(Number);
    let newM = m + delta;
    let newY = y;
    if (newM > 12) { newM = 1; newY++; }
    if (newM < 1)  { newM = 12; newY--; }
    AppState.setMonth(`${newY}-${String(newM).padStart(2,'0')}`);
    renderMonthSelector();
    Router.handleRoute();
  }

  function onMonthChange() {
    const y = document.getElementById('month-year')?.value;
    const m = document.getElementById('month-month')?.value;
    if (y && m) {
      AppState.setMonth(`${y}-${String(m).padStart(2,'0')}`);
      Router.handleRoute();
    }
  }

  renderMonthSelector();
}

// ========================
// NAVIGATION
// ========================
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      Router.navigate(el.dataset.route);
    });
  });

  // Hamburger
  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Overlay click to close sidebar on mobile
  document.getElementById('content')?.addEventListener('click', () => {
    if (window.innerWidth < 768) {
      document.getElementById('sidebar').classList.remove('open');
    }
  });
}

// ========================
// TOAST SYSTEM
// ========================
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style="flex-shrink:0">
      ${type === 'success' ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>' : ''}
      ${type === 'error'   ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>' : ''}
      ${type === 'warning' ? '<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>' : ''}
      ${type === 'info'    ? '<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>' : ''}
    </svg>
    <span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ========================
// MODAL SYSTEM
// ========================
function showModal(id, title, bodyHtml, buttons = [], extraClass = '') {
  // Remove existing modal with same id
  document.getElementById(id)?.remove();

  const buttonsHtml = buttons.map(b => {
    let onclick = '';
    if (b.action === 'close') onclick = `closeModal('${id}')`;
    else if (b.action === 'save-case') onclick = `Cases.saveCase()`;
    else if (b.action === 'do-import') onclick = `Cases.doImport()`;
    else if (b.action === 'save-ps') onclick = `PointSettings.savePeriod()`;
    else if (b.action === 'close-scanner') onclick = `Cases.stopScanner(); closeModal('${id}')`;
    else onclick = `document.dispatchEvent(new CustomEvent('modal-action',{detail:'${b.action}'}));closeModal('${id}')`;
    return `<button class="btn ${b.cls}" onclick="${onclick}">${b.label}</button>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = id + '-overlay';
  overlay.innerHTML = `
    <div class="modal ${extraClass}" id="${id}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" onclick="closeModal('${id}')">&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${buttons.length ? `<div class="modal-footer">${buttonsHtml}</div>` : ''}
    </div>`;

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(id);
  });

  document.body.appendChild(overlay);
}

function closeModal(id) {
  const overlay = document.getElementById(id + '-overlay');
  if (overlay) overlay.remove();
  else {
    const modal = document.getElementById(id);
    if (modal?.parentElement?.classList.contains('modal-overlay')) {
      modal.parentElement.remove();
    }
  }
}

// ========================
// GITHUB CONFIG PAGE
// ========================
const Config = (() => {
  function init() {
    const cfg = JSON.parse(localStorage.getItem('anes_github_config') || '{}');

    document.getElementById('content').innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="page-title">系統設定</h2>
          <p class="page-subtitle">設定 GitHub 儲存庫連線</p>
        </div>
      </div>

      <div class="setting-section">
        <h3>GitHub 儲存庫設定</h3>
        <p class="text-muted text-sm mb-4">本系統使用 GitHub 作為資料庫。請建立公開或私人 Repo，並提供 Personal Access Token 以進行寫入操作。</p>

        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">GitHub 使用者名稱 / 組織<span class="required">*</span></label>
            <input class="form-input" id="cfg-owner" placeholder="e.g. johndoe" value="${cfg.owner || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">儲存庫名稱<span class="required">*</span></label>
            <input class="form-input" id="cfg-repo" placeholder="e.g. anes-performance" value="${cfg.repo || ''}">
          </div>
        </div>

        <div class="form-row form-row-2">
          <div class="form-group">
            <label class="form-label">Branch</label>
            <input class="form-input" id="cfg-branch" placeholder="main" value="${cfg.branch || 'main'}">
          </div>
          <div class="form-group">
            <label class="form-label">Personal Access Token</label>
            <input class="form-input" id="cfg-token" type="password" placeholder="ghp_xxxxxxxxxxxx" value="${cfg.token || ''}">
            <div class="form-hint">前往 github.com/settings/tokens 建立具有 repo 權限的 token</div>
          </div>
        </div>

        <div class="flex gap-2 mt-4">
          <button class="btn btn-primary" onclick="Config.save()">儲存設定</button>
          <button class="btn btn-outline" onclick="Config.testConnection()">測試連線</button>
          <button class="btn btn-danger btn-sm" onclick="Config.clearCache()">清除快取</button>
        </div>
      </div>

      <div class="setting-section">
        <h3>快取管理</h3>
        <p class="text-muted text-sm mb-4">案例資料快取 5 分鐘，點數設定永久快取直到手動清除。</p>
        <button class="btn btn-outline" onclick="Config.clearCache()">清除所有快取</button>
      </div>

      <div class="setting-section">
        <h3>關於</h3>
        <p class="text-sm" style="color:var(--text-secondary);line-height:1.8">
          麻醉績效管理系統 v1.0.0<br>
          使用 GitHub Pages + GitHub API 作為靜態網站與資料庫。<br>
          資料存放於 GitHub 儲存庫中的 JSON 檔案。
        </p>
      </div>
    `;
  }

  function save() {
    const owner  = document.getElementById('cfg-owner')?.value?.trim();
    const repo   = document.getElementById('cfg-repo')?.value?.trim();
    const branch = document.getElementById('cfg-branch')?.value?.trim() || 'main';
    const token  = document.getElementById('cfg-token')?.value?.trim();

    if (!owner || !repo) { showToast('請填寫使用者名稱和儲存庫名稱', 'warning'); return; }

    localStorage.setItem('anes_github_config', JSON.stringify({ owner, repo, branch, token }));
    db.reload();
    showToast('設定已儲存', 'success');
  }

  async function testConnection() {
    const owner  = document.getElementById('cfg-owner')?.value?.trim();
    const repo   = document.getElementById('cfg-repo')?.value?.trim();
    const branch = document.getElementById('cfg-branch')?.value?.trim() || 'main';
    const token  = document.getElementById('cfg-token')?.value?.trim();

    if (!owner || !repo) { showToast('請先填寫設定', 'warning'); return; }

    showToast('測試連線中...', 'info');
    try {
      const headers = {};
      if (token) headers['Authorization'] = `token ${token}`;
      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (resp.ok) {
        showToast('連線成功！', 'success');
      } else {
        showToast(`連線失敗: ${resp.status} ${resp.statusText}`, 'error');
      }
    } catch (err) {
      showToast('連線失敗: ' + err.message, 'error');
    }
  }

  function clearCache() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('ghcache_') || k.startsWith('lcache_'));
    keys.forEach(k => localStorage.removeItem(k));
    showToast(`已清除 ${keys.length} 筆快取`, 'success');
  }

  return { init, save, testConnection, clearCache };
})();

// ========================
// FIRST-TIME SETUP MODAL
// ========================
function showSetupModal() {
  const html = `
    <p class="text-muted text-sm mb-4">首次使用請設定 GitHub 儲存庫，用於存取與儲存績效資料。</p>

    <div class="form-group">
      <label class="form-label">GitHub 使用者名稱<span class="required">*</span></label>
      <input class="form-input" id="setup-owner" placeholder="e.g. johndoe">
    </div>
    <div class="form-group">
      <label class="form-label">儲存庫名稱<span class="required">*</span></label>
      <input class="form-input" id="setup-repo" placeholder="e.g. anes-performance">
    </div>
    <div class="form-group">
      <label class="form-label">Branch</label>
      <input class="form-input" id="setup-branch" value="main">
    </div>
    <div class="form-group">
      <label class="form-label">Personal Access Token</label>
      <input class="form-input" id="setup-token" type="password" placeholder="ghp_xxxxxxxxxxxx">
      <div class="form-hint">前往 <a href="https://github.com/settings/tokens" target="_blank" style="color:var(--primary)">github.com/settings/tokens</a> 建立具有 repo 權限的 token（寫入操作需要）</div>
    </div>
  `;

  showModal('setup-modal', '初始設定', html, [
    { label: '稍後設定', cls: 'btn-outline', action: 'close' },
    { label: '儲存並繼續', cls: 'btn-primary', action: 'close' },
  ]);

  // Override save button
  const footer = document.querySelector('#setup-modal .modal-footer');
  if (footer) {
    const saveBtn = footer.querySelectorAll('button')[1];
    if (saveBtn) {
      saveBtn.onclick = () => {
        const owner  = document.getElementById('setup-owner')?.value?.trim();
        const repo   = document.getElementById('setup-repo')?.value?.trim();
        const branch = document.getElementById('setup-branch')?.value?.trim() || 'main';
        const token  = document.getElementById('setup-token')?.value?.trim();
        if (!owner || !repo) { showToast('請填寫必填欄位', 'warning'); return; }
        localStorage.setItem('anes_github_config', JSON.stringify({ owner, repo, branch, token }));
        db.reload();
        closeModal('setup-modal');
        showToast('設定已儲存，正在載入...', 'success');
        Router.handleRoute();
      };
    }
  }
}

// ========================
// INIT
// ========================
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initMonthSelector();

  // Check if configured
  if (!db.isConfigured()) {
    showSetupModal();
  }

  // Initial route
  Router.handleRoute();
});
