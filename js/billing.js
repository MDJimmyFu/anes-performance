/**
 * billing.js
 * HIS Billing Verification Page
 * Connects to http://10.10.52.65:5000 (hospital intranet Flask server)
 *
 * Auth:  POST /login  { username, password }  →  302 redirect on success
 * Data:  POST /api/batch_anesthesia_billing  { hhistnums:[], query_date:"YYYY-MM-DD" }
 *        Response: [{ hhistnum, date, method, total_time, self_pay:[{code,name}], ... }]
 */

const Billing = (() => {
  const HIS_BASE         = 'http://10.10.52.65:5000';
  const LOGIN_ENDPOINT   = `${HIS_BASE}/login`;
  const API_ENDPOINT     = `${HIS_BASE}/api/batch_anesthesia_billing`;
  const SESSION_KEY      = 'his_logged_in';
  const USERNAME_KEY     = 'his_username';
  const ANES_ON_HIS_URL  = `${HIS_BASE}/anes/`;   // frontend served from Flask server

  // True when this page is itself served from the HIS server (same-origin, no mixed content)
  const _sameOrigin = window.location.origin === HIS_BASE;
  // True when HTTPS page tries to call HTTP server → browser will block
  const _mixedContent = !_sameOrigin &&
                        window.location.protocol === 'https:' &&
                        HIS_BASE.startsWith('http:');

  // Fields we can meaningfully compare with the HIS response.
  // hisKey matches the keys returned by /api/batch_anesthesia_billing.
  const COMPARE_FIELDS = [
    { key: 'method',   hisKey: 'method',     label: '麻醉方式' },
    { key: 'duration', hisKey: 'total_time', label: '麻醉時間(min)' },
  ];

  let _cases         = [];
  let _pointSettings = [];
  let _results       = {};   // keyed by case id: { status, hisData, diffs }
  let _networkOk     = null;

  // ========================
  // LOGIN STATE
  // ========================
  function isLoggedIn() { return sessionStorage.getItem(SESSION_KEY) === '1'; }

  function setLoggedIn(username) {
    sessionStorage.setItem(SESSION_KEY, '1');
    localStorage.setItem(USERNAME_KEY, username);
  }

  function clearLogin() { sessionStorage.removeItem(SESSION_KEY); }

  // ========================
  // PAGE INIT
  // ========================
  async function init() {
    document.getElementById('content').innerHTML = `
      <div class="page-fade-in">
        <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
          <div>
            <h2 class="page-title">HIS 計費核對</h2>
            <p class="page-subtitle">連接院內系統 (${HIS_BASE}) 核對麻醉計費資料</p>
          </div>
          <div style="display:flex;gap:10px;align-items:center" id="topbar-actions"></div>
        </div>
        <div id="billing-body"></div>
      </div>`;

    if (_mixedContent) {
      renderMixedContentNotice();
    } else if (!isLoggedIn()) {
      renderLoginForm();
    } else {
      await showBillingContent();
    }
  }

  // ========================
  // MIXED CONTENT NOTICE
  // ========================
  function renderMixedContentNotice() {
    const topbar = document.getElementById('topbar-actions');
    if (topbar) topbar.innerHTML = '';

    document.getElementById('billing-body').innerHTML = `
      <div style="display:flex;justify-content:center;align-items:flex-start;padding-top:40px">
        <div class="card" style="width:100%;max-width:520px;padding:32px">
          <div style="text-align:center;margin-bottom:24px">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"
                 style="width:48px;height:48px;margin:0 auto 12px;display:block">
              <rect width="40" height="40" rx="10" fill="rgba(210,153,34,0.12)"/>
              <path d="M20 8l-14 24h28L20 8zm0 4l11 19H9L20 12zm-1 7v5h2v-5h-2zm0 7v2h2v-2h-2z"
                    fill="#d2991f"/>
            </svg>
            <div style="font-family:var(--font-serif);font-size:18px;color:var(--text-primary);margin-bottom:6px">需從院內伺服器開啟</div>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.6">
              瀏覽器安全政策禁止 HTTPS 頁面（GitHub Pages）<br>直接連線至院內 HTTP 伺服器
            </div>
          </div>

          <div class="notice notice-warning" style="margin-bottom:20px;font-size:13px;line-height:1.7">
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" style="flex-shrink:0;margin-top:1px">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            <div>
              您目前使用 <strong>GitHub Pages（HTTPS）</strong> 瀏覽此頁面。<br>
              HIS 計費核對功能需在院內以 <strong>HTTP</strong> 方式開啟，才能連線至院內伺服器。
            </div>
          </div>

          <div style="background:var(--bg-elevated);border-radius:8px;padding:16px;margin-bottom:20px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;font-weight:500;letter-spacing:.04em;text-transform:uppercase">在院內請改用此網址</div>
            <div style="display:flex;align-items:center;gap:8px">
              <code style="font-family:var(--font-mono);font-size:13px;color:var(--accent);flex:1;word-break:break-all">${escHtml(ANES_ON_HIS_URL)}</code>
              <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${escHtml(ANES_ON_HIS_URL)}').then(()=>showToast('已複製','success'))">
                複製
              </button>
            </div>
          </div>

          <div style="font-size:12px;color:var(--text-muted);line-height:1.8">
            <div style="margin-bottom:4px;font-weight:500;color:var(--text-secondary)">操作步驟</div>
            <div>① 確認已連線至醫院 Wi-Fi 或插上院內網路線</div>
            <div>② 複製上方網址，貼到瀏覽器網址列</div>
            <div>③ 開啟後點選「HIS 計費核對」即可登入</div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-subtle)">
              其他功能（儀表板、病例列表、統計）在 GitHub Pages 上仍可正常使用。
            </div>
          </div>
        </div>
      </div>`;
  }

  // ========================
  // LOGIN FORM
  // ========================
  function renderLoginForm(errorMsg = '') {
    const savedUsername = localStorage.getItem(USERNAME_KEY) || '';
    const topbar = document.getElementById('topbar-actions');
    if (topbar) topbar.innerHTML = '';

    document.getElementById('billing-body').innerHTML = `
      <div style="display:flex;justify-content:center;align-items:flex-start;padding-top:40px">
        <div class="card" style="width:100%;max-width:400px;padding:32px">
          <div style="text-align:center;margin-bottom:28px">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"
                 style="width:48px;height:48px;margin:0 auto 12px;display:block">
              <rect width="40" height="40" rx="10" fill="rgba(63,185,80,0.1)"/>
              <path d="M20 10a5 5 0 015 5v2h2a2 2 0 012 2v10a2 2 0 01-2 2H13a2 2 0 01-2-2V19a2 2 0 012-2h2v-2a5 5 0 015-5zm0 2a3 3 0 00-3 3v2h6v-2a3 3 0 00-3-3zm0 9a2 2 0 110 4 2 2 0 010-4z"
                    fill="currentColor" style="color:var(--accent)"/>
            </svg>
            <div style="font-family:var(--font-serif);font-size:20px;color:var(--text-primary);margin-bottom:4px">HIS 系統登入</div>
            <div style="font-size:12px;color:var(--text-muted)">連線至院內計費系統需要身份驗證</div>
          </div>

          ${errorMsg ? `
            <div class="notice notice-error" style="margin-bottom:16px;padding:10px 14px;font-size:13px">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style="flex-shrink:0">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
              </svg>
              ${escHtml(errorMsg)}
            </div>` : ''}

          <form id="his-login-form" onsubmit="Billing.doLogin(event)">
            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">帳號</label>
              <input class="form-input" id="his-username" type="text" placeholder="輸入 HIS 帳號"
                     value="${escHtml(savedUsername)}" autocomplete="username" required>
            </div>
            <div class="form-group" style="margin-bottom:24px">
              <label class="form-label">密碼</label>
              <input class="form-input" id="his-password" type="password" placeholder="輸入 HIS 密碼"
                     autocomplete="current-password" required>
            </div>
            <button class="btn btn-primary" type="submit" id="login-btn" style="width:100%">
              登入
            </button>
          </form>

          <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle)">
            <div style="font-size:11px;color:var(--text-muted);text-align:center">
              此功能僅限院內網路使用。請確認您已連接醫院 Wi-Fi 或 VPN。
            </div>
          </div>
        </div>
      </div>`;

    setTimeout(() => {
      if (savedUsername) document.getElementById('his-password')?.focus();
      else document.getElementById('his-username')?.focus();
    }, 50);
  }

  async function doLogin(event) {
    event.preventDefault();
    const username = document.getElementById('his-username')?.value?.trim() || '';
    const password = document.getElementById('his-password')?.value || '';
    const btn = document.getElementById('login-btn');
    if (btn) { btn.disabled = true; btn.textContent = '登入中...'; }

    try {
      const body = new URLSearchParams({ username, password });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let resp;
      try {
        resp = await fetch(LOGIN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          credentials: 'include',
          signal: controller.signal,
          // fetch follows redirect by default; resp.redirected === true when login succeeds
        });
      } finally {
        clearTimeout(timeout);
      }

      // Server returns 302 → browser follows → resp.redirected is true if we ended up elsewhere
      const loginSucceeded = resp.redirected || !resp.url.includes('/login');

      if (loginSucceeded) {
        setLoggedIn(username);
        await showBillingContent();
      } else {
        // Read response body to extract error message from login.html
        let msg = '帳號或密碼錯誤，請重試';
        try {
          const html = await resp.text();
          if (html.includes('帳號或密碼錯誤')) msg = '帳號或密碼錯誤，請重新輸入';
        } catch {}
        renderLoginForm(msg);
      }
    } catch (e) {
      const msg = e.name === 'AbortError'
        ? '連線逾時，請確認院內網路連線正常'
        : `無法連線至 HIS 系統：${e.message}`;
      renderLoginForm(msg);
    }
  }

  function logout() {
    clearLogin();
    _results = {};
    _networkOk = null;
    renderLoginForm();
  }

  // ========================
  // BILLING CONTENT
  // ========================
  async function showBillingContent() {
    const username = localStorage.getItem(USERNAME_KEY) || '';
    const topbar = document.getElementById('topbar-actions');
    if (topbar) {
      topbar.innerHTML = `
        <div id="network-status" class="network-badge network-checking">
          <span class="status-dot"></span> 檢查連線中...
        </div>
        <button class="btn btn-outline btn-sm" onclick="Billing.checkNetwork()">重新檢查</button>
        <button class="btn btn-ghost btn-sm" onclick="Billing.logout()"
                style="color:var(--text-muted);font-size:12px">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style="margin-right:4px">
            <path fill-rule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
          登出 ${escHtml(username)}
        </button>`;
    }

    document.getElementById('billing-body').innerHTML = `
      <div id="network-detail-panel" style="margin-bottom:16px;display:none">
        <div class="card" style="padding:16px">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;font-weight:500">連線診斷</div>
          <div id="network-steps"></div>
        </div>
      </div>

      <div class="billing-toolbar" id="billing-toolbar" style="display:none">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span style="color:var(--text-secondary);font-size:13px">
            月份：<strong id="billing-month-label" style="color:var(--text-primary)"></strong>
          </span>
          <button class="btn btn-primary btn-sm" onclick="Billing.queryAll()">
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zM4.5 7.5a.5.5 0 000 1h5.793l-2.147 2.146a.5.5 0 00.708.708l3-3a.5.5 0 000-.708l-3-3a.5.5 0 10-.708.708L10.293 7.5H4.5z"/></svg>
            批次查詢本月所有病例
          </button>
          <span id="batch-progress" style="color:var(--text-muted);font-size:12px"></span>
        </div>
      </div>

      <div id="offline-notice" class="notice notice-warning" style="display:none">
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        <div>
          <strong>無法連線至院內系統</strong><br>
          <span style="font-size:12px">請確認您已連線至醫院內網路（Wi-Fi 或 VPN）。若在院外使用，此功能不可用。</span>
        </div>
      </div>

      <div id="billing-results"></div>`;

    try {
      _pointSettings = await db.getPointSettings();
      _cases = await db.getCases(AppState.selectedMonth);
      const mlEl = document.getElementById('billing-month-label');
      if (mlEl) mlEl.textContent = AppState.selectedMonth;
    } catch (e) {
      showToast('載入資料失敗: ' + e.message, 'error');
    }

    await checkNetwork();
  }

  // ========================
  // NETWORK CHECK — 4 steps
  // ========================
  async function checkNetwork() {
    const badge        = document.getElementById('network-status');
    const panel        = document.getElementById('network-detail-panel');
    const stepsEl      = document.getElementById('network-steps');
    const officeNotice = document.getElementById('offline-notice');
    const toolbar      = document.getElementById('billing-toolbar');

    if (!badge) return;
    badge.className = 'network-badge network-checking';
    badge.innerHTML = '<span class="status-dot"></span> 檢查連線中...';
    if (panel) panel.style.display = 'block';

    const steps = [
      { label: '測試網際網路連線' },
      { label: `連接院內主機 (${HIS_BASE.replace('http://', '')})` },
      { label: '讀取 HIS 登入頁面' },
      { label: '確認登入工作階段' },
    ];

    const states = ['pending','pending','pending','pending'];

    function render() {
      if (!stepsEl) return;
      stepsEl.innerHTML = steps.map((s, i) => {
        const st = states[i] || 'pending';
        const icon = {
          pending: `<span style="color:var(--text-muted);font-size:14px;line-height:1">○</span>`,
          running: `<span style="display:inline-flex;gap:3px;align-items:center">${[0,1,2].map(() =>
            `<span style="width:4px;height:4px;border-radius:50%;background:var(--accent);animation:pulse 1s infinite"></span>`
          ).join('')}</span>`,
          ok:    `<span style="color:var(--accent);font-size:14px">✓</span>`,
          warn:  `<span style="color:var(--amber);font-size:14px">⚠</span>`,
          error: `<span style="color:var(--red);font-size:14px">✗</span>`,
        }[st] || '';
        const color = { ok:'var(--accent)', warn:'var(--amber)', error:'var(--red)' }[st] || 'var(--text-muted)';
        const msg   = s.msg ? ` <span style="color:var(--text-muted);font-size:11px">— ${escHtml(s.msg)}</span>` : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;
                             border-bottom:1px solid var(--border-subtle);font-size:12px">
          <div style="width:20px;text-align:center;flex-shrink:0">${icon}</div>
          <div style="color:${color}">${escHtml(s.label)}${msg}</div>
        </div>`;
      }).join('');
    }

    render();

    // ── Step 1: Internet ──────────────────────────────────────────────────────
    states[0] = 'running'; render();
    let internetOk = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch('https://api.github.com/zen', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      internetOk = r.ok || r.type === 'opaque';
    } catch {}
    states[0] = internetOk ? 'ok' : 'warn';
    steps[0].msg = internetOk ? '' : '網際網路連線異常（仍可嘗試院內連線）';
    render();

    // ── Step 2: Host reachable (no-cors ping) ─────────────────────────────────
    states[1] = 'running'; render();
    let hostOk = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      await fetch(`${HIS_BASE}/`, { signal: ctrl.signal, mode: 'no-cors' });
      clearTimeout(t);
      hostOk = true;
    } catch {}
    states[1] = hostOk ? 'ok' : 'error';
    steps[1].msg = hostOk ? '' : '主機不可達，請確認院內網路連線';
    render();

    if (!hostOk) {
      states[2] = 'error'; states[3] = 'error';
      steps[2].msg = '跳過'; steps[3].msg = '跳過';
      render();
      _networkOk = false;
      _finalizeNetwork(false, badge, officeNotice, toolbar);
      return;
    }

    // ── Step 3: Read login page (verifies CORS + service running) ─────────────
    states[2] = 'running'; render();
    let pageOk = false;
    let corsOk = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(LOGIN_ENDPOINT, {
        signal: ctrl.signal,
        credentials: 'include',
        headers: { 'Accept': 'text/html,application/json' },
      });
      clearTimeout(t);
      if (r.ok) {
        pageOk = true;
        corsOk = true;
      } else {
        // Got a response but non-200 — service is up, check if it's a CORS issue
        pageOk = r.status < 500;
        corsOk = true; // If we got here, CORS must be working
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        // Likely a CORS or mixed-content error — host is reachable but browser blocks the read
        pageOk = false;
        corsOk = false;
      }
    }
    states[2] = pageOk ? 'ok' : corsOk ? 'warn' : 'error';
    steps[2].msg = pageOk ? ''
      : corsOk ? '服務回應異常'
      : '無法讀取頁面，伺服器可能缺少 CORS 設定';
    render();

    // ── Step 4: Session status ────────────────────────────────────────────────
    states[3] = isLoggedIn() ? 'ok' : 'warn';
    steps[3].msg = isLoggedIn() ? '' : '尚未登入';
    render();

    _networkOk = hostOk && pageOk;
    _finalizeNetwork(_networkOk, badge, officeNotice, toolbar);
  }

  function _finalizeNetwork(ok, badge, officeNotice, toolbar) {
    if (ok) {
      badge.className = 'network-badge network-online';
      badge.innerHTML = '<span class="status-dot"></span> 院內網路已連線';
      if (officeNotice) officeNotice.style.display = 'none';
      if (toolbar) toolbar.style.display = 'flex';
      renderCasesTable();
    } else {
      badge.className = 'network-badge network-offline';
      badge.innerHTML = '<span class="status-dot"></span> 無法連線院內系統';
      if (officeNotice) officeNotice.style.display = 'flex';
      if (toolbar) toolbar.style.display = 'none';
      renderCasesTable(true);
    }
  }

  // ========================
  // CASES TABLE
  // ========================
  function renderCasesTable(offlineMode = false) {
    const container = document.getElementById('billing-results');
    if (!container) return;

    const validCases = _cases.filter(c => c.case_no && c.case_no.trim());
    if (validCases.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>本月（${AppState.selectedMonth}）沒有有效病例號的記錄</p></div>`;
      return;
    }

    const rows = validCases.map(c => {
      const r   = _results[c.id];
      const pts = Calculator.calculateTotal(c, _pointSettings);

      let statusCell = `<span class="verify-badge verify-pending">待查詢</span>`;
      if (r) {
        if (r.status === 'loading') statusCell = `<span class="verify-badge verify-loading">查詢中...</span>`;
        else if (r.status === 'error') statusCell = `<span class="verify-badge verify-error" title="${escHtml(r.error)}">查詢失敗</span>`;
        else if (r.status === 'notfound') statusCell = `<span class="verify-badge verify-pending">HIS無記錄</span>`;
        else if (r.status === 'ok') {
          const hasDiff = r.diffs && r.diffs.length > 0;
          statusCell = hasDiff
            ? `<span class="verify-badge verify-diff">有差異 (${r.diffs.length}項)</span>`
            : `<span class="verify-badge verify-match">✓ 相符</span>`;
        }
      }

      const queryBtn = offlineMode ? '' :
        `<button class="btn btn-ghost btn-sm" onclick="Billing.querySingle('${c.id}')" title="查詢此病例">
           <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.156a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"/></svg>
         </button>`;

      return `
        <tr id="row-${c.id}">
          <td class="mono" style="font-size:12px">${escHtml(c.date || '')}</td>
          <td class="mono" style="font-size:12px">${escHtml(c.case_no || '')}</td>
          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px"
              title="${escHtml(c.diagnosis || '')}">${escHtml(c.diagnosis || '')}</td>
          <td>${methodBadge(c.method || '')}</td>
          <td class="mono text-right">${c.duration || 0}</td>
          <td class="mono text-right" style="color:var(--accent)">${pts.toLocaleString('zh-TW',{maximumFractionDigits:1})}</td>
          <td>${statusCell}</td>
          <td>
            <div style="display:flex;gap:6px;align-items:center">
              ${queryBtn}
              ${r?.status === 'ok' && r.diffs?.length > 0
                ? `<button class="btn btn-outline btn-sm" style="font-size:11px;padding:3px 8px"
                           onclick="Billing.showDiff('${c.id}')">查看差異</button>
                   <button class="btn btn-primary btn-sm" style="font-size:11px;padding:3px 8px"
                           onclick="Billing.applyHISData('${c.id}')">套用HIS</button>` : ''}
              ${r?.status === 'ok' && !r.diffs?.length
                ? `<span style="color:var(--accent);font-size:11px">✓</span>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th><th>病例號</th><th>診斷/術式</th><th>麻醉方式</th>
              <th class="text-right">時間(min)</th><th class="text-right">績效點數</th>
              <th>核對狀態</th><th>操作</th>
            </tr>
          </thead>
          <tbody id="billing-tbody">${rows}</tbody>
        </table>
      </div>`;
  }

  // ========================
  // QUERY SINGLE
  // ========================
  async function querySingle(caseId) {
    const c = _cases.find(x => x.id === caseId);
    if (!c || !c.case_no) return;

    _results[caseId] = { status: 'loading' };
    updateRowStatus(caseId);

    try {
      const hisData = await fetchHISRecord(c.case_no, c.date);
      if (!hisData) {
        _results[caseId] = { status: 'notfound' };
      } else {
        const diffs = compareCaseWithHIS(c, hisData);
        _results[caseId] = { status: 'ok', hisData, diffs };
      }
    } catch (e) {
      _results[caseId] = { status: 'error', error: e.message };
    }

    updateRowStatus(caseId);
  }

  // ========================
  // BATCH QUERY ALL
  // ========================
  async function queryAll() {
    const validCases = _cases.filter(c => c.case_no && c.case_no.trim());
    const progressEl = document.getElementById('batch-progress');
    if (validCases.length === 0) return;

    // Gather unique case numbers
    const hhistnums = [...new Set(validCases.map(c => c.case_no.trim()))];
    if (progressEl) progressEl.textContent = `批次查詢 ${hhistnums.length} 個病歷號...`;

    // Mark all as loading
    for (const c of validCases) {
      _results[c.id] = { status: 'loading' };
      updateRowStatus(c.id);
    }

    try {
      // Single batch POST to the HIS API
      const allHisRecords = await fetchHISBatch(hhistnums);

      // Match each stored case to its HIS record(s) by case_no + date
      for (const c of validCases) {
        const match = allHisRecords.find(r =>
          r.hhistnum === c.case_no.trim() && r.date === c.date
        );
        if (!match) {
          _results[c.id] = { status: 'notfound' };
        } else {
          const diffs = compareCaseWithHIS(c, match);
          _results[c.id] = { status: 'ok', hisData: match, diffs };
        }
        updateRowStatus(c.id);
      }

      const diffs  = Object.values(_results).filter(r => r.status === 'ok' && r.diffs?.length).length;
      const errors = Object.values(_results).filter(r => r.status === 'error').length;
      const notfound = Object.values(_results).filter(r => r.status === 'notfound').length;
      if (progressEl) progressEl.textContent =
        `完成 — ${validCases.length} 筆，${diffs} 筆有差異，${notfound} 筆HIS無記錄，${errors} 筆失敗`;

    } catch (e) {
      for (const c of validCases) {
        if (_results[c.id]?.status === 'loading') {
          _results[c.id] = { status: 'error', error: e.message };
          updateRowStatus(c.id);
        }
      }
      if (progressEl) progressEl.textContent = `查詢失敗：${e.message}`;
    }
  }

  // ========================
  // HIS API CALLS
  // ========================

  /** POST /api/batch_anesthesia_billing for a single case, filtered by date */
  async function fetchHISRecord(caseNo, date) {
    const results = await fetchHISBatch([caseNo], date);
    // The server filters by exact date when query_date is provided
    return results.find(r => r.hhistnum === caseNo) || null;
  }

  /** POST /api/batch_anesthesia_billing for multiple case numbers */
  async function fetchHISBatch(hhistnums, queryDate = null) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let resp;
    try {
      resp = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          hhistnums,
          query_date: queryDate || null,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (resp.status === 401 || resp.status === 403) {
      clearLogin();
      showToast('登入工作階段已過期，請重新登入', 'warning');
      renderLoginForm('登入工作階段已過期，請重新登入');
      throw new Error('Session expired');
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    if (data?.error) throw new Error(data.error);
    return Array.isArray(data) ? data : [];
  }

  // ========================
  // COMPARE
  // ========================
  function compareCaseWithHIS(storedCase, hisRecord) {
    if (!hisRecord) return [];
    const diffs = [];
    for (const field of COMPARE_FIELDS) {
      const sv = storedCase[field.key];
      const hv = hisRecord[field.hisKey];
      if (hv === undefined || hv === null) continue;
      const norm = v => (v === null || v === undefined) ? 0 : v;
      const isDiff = typeof norm(sv) === 'number' && typeof norm(hv) === 'number'
        ? Math.abs(norm(sv) - norm(hv)) > 0.01
        : String(sv ?? '') !== String(hv ?? '');
      if (isDiff) diffs.push({ label: field.label, stored: sv, his: hv });
    }
    return diffs;
  }

  // ========================
  // UPDATE ROW UI
  // ========================
  function updateRowStatus(caseId) {
    const c = _cases.find(x => x.id === caseId);
    if (!c) return;
    const row = document.getElementById(`row-${caseId}`);
    if (!row) return;

    const r   = _results[caseId];
    const pts = Calculator.calculateTotal(c, _pointSettings);

    let statusCell = `<span class="verify-badge verify-pending">待查詢</span>`;
    if (r) {
      if (r.status === 'loading')  statusCell = `<span class="verify-badge verify-loading">查詢中...</span>`;
      if (r.status === 'notfound') statusCell = `<span class="verify-badge verify-pending">HIS無記錄</span>`;
      if (r.status === 'error')    statusCell = `<span class="verify-badge verify-error" title="${escHtml(r.error)}">查詢失敗</span>`;
      if (r.status === 'ok') {
        statusCell = r.diffs?.length
          ? `<span class="verify-badge verify-diff">有差異 (${r.diffs.length}項)</span>`
          : `<span class="verify-badge verify-match">✓ 相符</span>`;
      }
    }

    const actionBtns = r?.status === 'ok' && r.diffs?.length
      ? `<button class="btn btn-outline btn-sm" style="font-size:11px;padding:3px 8px"
                 onclick="Billing.showDiff('${c.id}')">查看差異</button>
         <button class="btn btn-primary btn-sm" style="font-size:11px;padding:3px 8px"
                 onclick="Billing.applyHISData('${c.id}')">套用HIS</button>`
      : r?.status === 'ok' && !r.diffs?.length
        ? `<span style="color:var(--accent);font-size:11px">✓</span>` : '';

    const queryBtn = _networkOk
      ? `<button class="btn btn-ghost btn-sm" onclick="Billing.querySingle('${c.id}')" title="重新查詢">
           <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.156a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"/></svg>
         </button>` : '';

    row.innerHTML = `
      <td class="mono" style="font-size:12px">${escHtml(c.date || '')}</td>
      <td class="mono" style="font-size:12px">${escHtml(c.case_no || '')}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px"
          title="${escHtml(c.diagnosis || '')}">${escHtml(c.diagnosis || '')}</td>
      <td>${methodBadge(c.method || '')}</td>
      <td class="mono text-right">${c.duration || 0}</td>
      <td class="mono text-right" style="color:var(--accent)">${pts.toLocaleString('zh-TW',{maximumFractionDigits:1})}</td>
      <td>${statusCell}</td>
      <td><div style="display:flex;gap:6px;align-items:center">${queryBtn}${actionBtns}</div></td>`;
  }

  // ========================
  // SHOW DIFF MODAL
  // ========================
  function showDiff(caseId) {
    const c = _cases.find(x => x.id === caseId);
    const r = _results[caseId];
    if (!c || !r?.hisData) return;

    // Comparison rows for method + duration
    const compRows = COMPARE_FIELDS.map(f => {
      const sv   = c[f.key];
      const hv   = r.hisData[f.hisKey];
      if (hv === undefined || hv === null) return '';
      const diff = r.diffs?.find(d => d.label === f.label);
      const style = diff ? 'background:rgba(218,54,51,0.08);' : '';
      const icon  = diff
        ? '<span style="color:var(--red);font-weight:700">⚠</span>'
        : '<span style="color:var(--accent)">✓</span>';
      return `
        <tr style="${style}">
          <td style="font-size:12px">${escHtml(f.label)}</td>
          <td class="mono" style="font-size:12px;color:${diff ? 'var(--amber)':'var(--text-primary)'}">${escHtml(String(sv ?? '—'))}</td>
          <td class="mono" style="font-size:12px;color:${diff ? 'var(--red)':'var(--accent)'}">${escHtml(String(hv ?? '—'))}</td>
          <td style="text-align:center">${icon}</td>
        </tr>`;
    }).filter(Boolean).join('');

    // Self-pay items from HIS
    const selfPayHtml = r.hisData.self_pay?.length
      ? `<div class="section-title" style="margin-top:16px">HIS 自費項目</div>
         <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
           ${r.hisData.self_pay.map(item =>
             `<span class="badge badge-orange" title="${escHtml(item.code)}">${escHtml(item.name || item.code)}</span>`
           ).join('')}
         </div>`
      : `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)">HIS 無自費項目記錄</div>`;

    const html = `
      <div style="margin-bottom:12px;padding:10px;background:var(--bg-elevated);border-radius:6px;font-size:13px">
        <strong>${escHtml(c.case_no)}</strong> &nbsp;·&nbsp; ${escHtml(c.date)} &nbsp;·&nbsp; ${escHtml(c.diagnosis || '')}
        ${r.hisData.patient_name ? `&nbsp;·&nbsp; <span style="color:var(--text-muted)">${escHtml(r.hisData.patient_name)}</span>` : ''}
      </div>
      ${r.diffs?.length
        ? `<div class="notice notice-error" style="margin-bottom:12px">
             共 <strong>${r.diffs.length}</strong> 個欄位與 HIS 計費資料有差異，以紅色標示
           </div>`
        : '<p style="color:var(--accent);text-align:center;padding:12px 0">所有欄位與 HIS 相符 ✓</p>'}
      <div class="table-wrap">
        <table style="font-size:12px">
          <thead><tr><th>欄位</th><th>系統存儲值</th><th>HIS計費值</th><th style="text-align:center">狀態</th></tr></thead>
          <tbody>${compRows}</tbody>
        </table>
      </div>
      ${selfPayHtml}`;

    showModal('billing-diff-modal',
      `核對詳情 — ${c.case_no}`,
      html,
      [
        { label: '關閉',    cls: 'btn-outline', action: 'close' },
        ...(r.diffs?.length ? [{ label: '套用HIS資料', cls: 'btn-primary', action: `apply-his:${caseId}` }] : []),
      ]
    );

    document.addEventListener('modal-action', function handler(e) {
      if (e.detail === `apply-his:${caseId}`) {
        applyHISData(caseId);
        document.removeEventListener('modal-action', handler);
      }
    }, { once: true });
  }

  // ========================
  // APPLY HIS DATA
  // ========================
  async function applyHISData(caseId) {
    const c = _cases.find(x => x.id === caseId);
    const r = _results[caseId];
    if (!c || r?.status !== 'ok') return;

    const hisData = r.hisData;
    // Only apply the fields the HIS API actually returns
    if (hisData.method    !== undefined) c.method   = hisData.method;
    if (hisData.total_time !== undefined) c.duration = hisData.total_time;

    c.total_performance = Calculator.calculateTotal(c, _pointSettings);

    const month    = c.date.slice(0, 7);
    const allCases = await db.getCases(month);
    const idx      = allCases.findIndex(x => x.id === c.id);
    if (idx >= 0) allCases[idx] = c;
    await db.saveCases(month, allCases);

    _results[caseId] = { status: 'ok', hisData, diffs: [] };
    showToast(`已更新病例 ${c.case_no}`, 'success');
    updateRowStatus(caseId);
  }

  // ========================
  // HELPERS
  // ========================
  function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init, checkNetwork, querySingle, queryAll, showDiff, applyHISData, doLogin, logout };
})();
