/**
 * billing.js
 * HIS Billing Verification Page
 * Connects to http://10.10.52.65:5000/anesthesia_billing (hospital intranet)
 * Requires login before querying. Login state persisted in sessionStorage.
 */

const Billing = (() => {
  const HIS_BASE = 'http://10.10.52.65:5000';
  const BILLING_ENDPOINT = `${HIS_BASE}/anesthesia_billing`;
  const LOGIN_ENDPOINT   = `${HIS_BASE}/login`;
  const SESSION_KEY      = 'his_logged_in';
  const USERNAME_KEY     = 'his_username';

  // Fields to compare between stored case and HIS response
  const COMPARE_FIELDS = [
    { key: 'method',       hisKey: 'anesthesia_type',  label: '麻醉方式' },
    { key: 'duration',     hisKey: 'duration_min',      label: '麻醉時間(min)' },
    { key: 'bonus',        hisKey: 'bonus_type',        label: '加成' },
    { key: 'handover',     hisKey: 'handover_ratio',    label: '交接班' },
    { key: 'GVL_AWS_MAC',  hisKey: 'GVL_AWS_MAC',       label: 'GVL/AWS/MAC' },
    { key: 'Rusch_Video',  hisKey: 'Rusch_Video',       label: 'Rusch+Video' },
    { key: 'OMT',          hisKey: 'OMT',               label: 'OMT' },
    { key: 'A_line',       hisKey: 'A_line',            label: 'A-line' },
    { key: 'CVC',          hisKey: 'CVC',               label: 'CVC' },
    { key: 'PAC',          hisKey: 'PAC',               label: 'PAC' },
    { key: 'TEE',          hisKey: 'TEE',               label: 'TEE' },
    { key: 'CO',           hisKey: 'CO',                label: 'CO' },
    { key: 'Optiflow',     hisKey: 'Optiflow',          label: 'Optiflow' },
    { key: 'BIS_self',     hisKey: 'BIS_self',          label: 'BIS自費' },
    { key: 'BIS_NHI_adult',hisKey: 'BIS_NHI_adult',    label: 'BIS健保成人' },
    { key: 'BIS_NHI_child',hisKey: 'BIS_NHI_child',    label: 'BIS健保小兒' },
    { key: 'blanket',      hisKey: 'blanket',           label: '溫毯' },
    { key: 'IVPCA',        hisKey: 'IVPCA',             label: 'IVPCA' },
    { key: 'NBPCA',        hisKey: 'NBPCA',             label: 'NBPCA' },
    { key: 'PCEA',         hisKey: 'PCEA',              label: 'PCEA' },
    { key: 'PCA_days',     hisKey: 'PCA_days',          label: 'PCA加做天' },
    { key: 'IV_sedation',  hisKey: 'IV_sedation',       label: 'IV Sedation' },
    { key: 'ultrasound',   hisKey: 'ultrasound',        label: '超音波導引' },
    { key: 'ByBIS',        hisKey: 'ByBIS',             label: 'ByBIS' },
  ];

  let _cases = [];
  let _pointSettings = [];
  let _results = {};
  let _networkOk = null;

  // ========================
  // LOGIN STATE
  // ========================
  function isLoggedIn() {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  }

  function setLoggedIn(username) {
    sessionStorage.setItem(SESSION_KEY, '1');
    localStorage.setItem(USERNAME_KEY, username);
  }

  function clearLogin() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ========================
  // PAGE INIT
  // ========================
  async function init() {
    const content = document.getElementById('content');
    content.innerHTML = `
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

    if (!isLoggedIn()) {
      renderLoginForm();
    } else {
      await showBillingContent();
    }
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
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
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
              此功能僅限院內網路使用。若無法連線，請確認您已連接醫院 Wi-Fi 或 VPN。
            </div>
          </div>
        </div>
      </div>`;

    // Focus password if username already filled
    setTimeout(() => {
      if (savedUsername) {
        document.getElementById('his-password')?.focus();
      } else {
        document.getElementById('his-username')?.focus();
      }
    }, 50);
  }

  async function doLogin(event) {
    event.preventDefault();
    const username = document.getElementById('his-username')?.value?.trim() || '';
    const password = document.getElementById('his-password')?.value || '';
    const btn = document.getElementById('login-btn');

    if (btn) {
      btn.disabled = true;
      btn.textContent = '登入中...';
    }

    try {
      const body = new URLSearchParams();
      body.append('username', username);
      body.append('password', password);

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
        });
      } finally {
        clearTimeout(timeout);
      }

      if (resp.ok) {
        setLoggedIn(username);
        await showBillingContent();
      } else {
        const msg = resp.status === 401
          ? '帳號或密碼錯誤，請重試'
          : `登入失敗 (HTTP ${resp.status})`;
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

    // Set topbar actions
    const topbar = document.getElementById('topbar-actions');
    if (topbar) {
      topbar.innerHTML = `
        <div id="network-status" class="network-badge network-checking">
          <span class="status-dot"></span> 檢查網路中...
        </div>
        <button class="btn btn-outline btn-sm" onclick="Billing.checkNetwork()">重新連線</button>
        <button class="btn btn-ghost btn-sm" onclick="Billing.logout()" title="登出 HIS 系統"
                style="color:var(--text-muted);font-size:12px">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style="margin-right:4px">
            <path fill-rule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
          登出 ${escHtml(username)}
        </button>`;
    }

    document.getElementById('billing-body').innerHTML = `
      <!-- Network check detail panel -->
      <div id="network-detail-panel" style="margin-bottom:16px;display:none">
        <div class="card" style="padding:16px">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;font-weight:500">連線診斷</div>
          <div id="network-steps"></div>
        </div>
      </div>

      <!-- Batch query bar -->
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

      <!-- Network offline notice -->
      <div id="offline-notice" class="notice notice-warning" style="display:none">
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        <div>
          <strong>無法連線至院內系統</strong><br>
          <span style="font-size:12px">請確認您已連線至醫院內網路（Wi-Fi 或 VPN）。若在院外使用，此功能不可用。</span>
        </div>
      </div>

      <!-- Results table -->
      <div id="billing-results"></div>`;

    // Load data
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
  // NETWORK CHECK (step-by-step)
  // ========================
  async function checkNetwork() {
    const badge = document.getElementById('network-status');
    const panel = document.getElementById('network-detail-panel');
    const stepsEl = document.getElementById('network-steps');
    const offlineNotice = document.getElementById('offline-notice');
    const toolbar = document.getElementById('billing-toolbar');

    if (!badge) return;

    // Show checking state
    badge.className = 'network-badge network-checking';
    badge.innerHTML = '<span class="status-dot"></span> 檢查連線中...';

    if (panel) panel.style.display = 'block';

    const steps = [
      { id: 'step-internet', label: '測試網際網路連線' },
      { id: 'step-host',     label: `連接院內主機 (${HIS_BASE.replace('http://', '')})` },
      { id: 'step-service',  label: '驗證 HIS 計費服務' },
      { id: 'step-session',  label: '確認登入工作階段' },
    ];

    function renderSteps(states) {
      if (!stepsEl) return;
      stepsEl.innerHTML = steps.map((s, i) => {
        const st = states[i] || 'pending';
        const icon = {
          pending: `<span style="color:var(--text-muted);font-size:14px">○</span>`,
          running: `<span class="dot-pulse-sm" style="display:inline-flex;gap:2px"></span>`,
          ok:      `<span style="color:var(--accent);font-size:14px">✓</span>`,
          warn:    `<span style="color:var(--amber);font-size:14px">⚠</span>`,
          error:   `<span style="color:var(--red);font-size:14px">✗</span>`,
        }[st] || '';
        const color = { ok: 'var(--accent)', warn: 'var(--amber)', error: 'var(--red)' }[st] || 'var(--text-muted)';
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border-subtle);font-size:12px" id="${s.id}">
            <div style="width:20px;text-align:center;flex-shrink:0">${icon}</div>
            <div style="color:${color}">${escHtml(s.label)}</div>
          </div>`;
      }).join('');
    }

    const states = ['pending','pending','pending','pending'];
    renderSteps(states);

    // Step 1: Internet connectivity
    states[0] = 'running'; renderSteps(states);
    let internetOk = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch('https://api.github.com/zen', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      internetOk = r.ok || r.type === 'opaque';
    } catch {}
    states[0] = internetOk ? 'ok' : 'warn';
    renderSteps(states);

    // Step 2: Reach HIS host (no-cors)
    states[1] = 'running'; renderSteps(states);
    let hostOk = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      await fetch(`${HIS_BASE}/`, { signal: ctrl.signal, mode: 'no-cors' });
      clearTimeout(t);
      hostOk = true;
    } catch {}
    states[1] = hostOk ? 'ok' : 'error';
    renderSteps(states);

    if (!hostOk) {
      states[2] = 'error'; states[3] = 'error';
      renderSteps(states);
      _networkOk = false;
      finalizeNetworkUI(false, badge, offlineNotice, toolbar);
      return;
    }

    // Step 3: Verify billing service responds
    states[2] = 'running'; renderSteps(states);
    let serviceOk = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      // A HEAD or GET to the billing endpoint; we expect JSON or 401 (both mean service is up)
      const r = await fetch(`${BILLING_ENDPOINT}?date=probe&case_no=probe`, {
        signal: ctrl.signal,
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(t);
      // 200, 401, 403, 404 all mean the service is up
      serviceOk = r.status < 500;
    } catch {}
    states[2] = serviceOk ? 'ok' : 'warn';
    renderSteps(states);

    // Step 4: Check login session
    states[3] = 'running'; renderSteps(states);
    const sessionValid = isLoggedIn();
    states[3] = sessionValid ? 'ok' : 'warn';
    renderSteps(states);

    _networkOk = hostOk && serviceOk;
    finalizeNetworkUI(_networkOk, badge, offlineNotice, toolbar);
  }

  function finalizeNetworkUI(ok, badge, offlineNotice, toolbar) {
    if (ok) {
      if (badge) {
        badge.className = 'network-badge network-online';
        badge.innerHTML = '<span class="status-dot"></span> 院內網路已連線';
      }
      if (offlineNotice) offlineNotice.style.display = 'none';
      if (toolbar) toolbar.style.display = 'flex';
      renderCasesTable();
    } else {
      if (badge) {
        badge.className = 'network-badge network-offline';
        badge.innerHTML = '<span class="status-dot"></span> 無法連線院內系統';
      }
      if (offlineNotice) offlineNotice.style.display = 'flex';
      if (toolbar) toolbar.style.display = 'none';
      renderCasesTable(true);
    }
  }

  // ========================
  // RENDER CASES TABLE
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
      const r = _results[c.id];
      const pts = Calculator.calculateTotal(c, _pointSettings);

      let statusCell = `<span class="verify-badge verify-pending">待查詢</span>`;
      if (r) {
        if (r.status === 'loading') statusCell = `<span class="verify-badge verify-loading">查詢中...</span>`;
        else if (r.status === 'error') statusCell = `<span class="verify-badge verify-error" title="${escHtml(r.error)}">查詢失敗</span>`;
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
          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" title="${escHtml(c.diagnosis || '')}">${escHtml(c.diagnosis || '')}</td>
          <td>${methodBadge(c.method || '')}</td>
          <td class="mono text-right">${c.duration || 0}</td>
          <td class="mono text-right" style="color:var(--accent)">${pts.toLocaleString('zh-TW', {maximumFractionDigits:1})}</td>
          <td>${statusCell}</td>
          <td>
            <div style="display:flex;gap:6px;align-items:center">
              ${queryBtn}
              ${r && r.status === 'ok' && r.diffs && r.diffs.length > 0 ?
                `<button class="btn btn-outline btn-sm" style="font-size:11px;padding:3px 8px" onclick="Billing.showDiff('${c.id}')">查看差異</button>
                 <button class="btn btn-primary btn-sm" style="font-size:11px;padding:3px 8px" onclick="Billing.applyHISData('${c.id}')">套用HIS</button>` : ''}
              ${r && r.status === 'ok' && (!r.diffs || r.diffs.length === 0) ?
                `<span style="color:var(--accent);font-size:11px">✓</span>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>病例號</th>
              <th>診斷/術式</th>
              <th>麻醉方式</th>
              <th class="text-right">時間(min)</th>
              <th class="text-right">績效點數</th>
              <th>核對狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="billing-tbody">
            ${rows}
          </tbody>
        </table>
      </div>`;
  }

  // ========================
  // QUERY SINGLE CASE
  // ========================
  async function querySingle(caseId) {
    const c = _cases.find(x => x.id === caseId);
    if (!c) return;

    _results[caseId] = { status: 'loading' };
    updateRowStatus(caseId);

    try {
      const hisData = await fetchHISBilling(c.date, c.case_no);
      const diffs = compareCaseWithHIS(c, hisData);
      _results[caseId] = { status: 'ok', hisData, diffs };
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

    for (let i = 0; i < validCases.length; i++) {
      const c = validCases[i];
      if (progressEl) progressEl.textContent = `查詢中 ${i + 1} / ${validCases.length}...`;

      _results[c.id] = { status: 'loading' };
      updateRowStatus(c.id);

      try {
        const hisData = await fetchHISBilling(c.date, c.case_no);
        const diffs = compareCaseWithHIS(c, hisData);
        _results[c.id] = { status: 'ok', hisData, diffs };
      } catch (e) {
        _results[c.id] = { status: 'error', error: e.message };
      }

      updateRowStatus(c.id);
      if (i < validCases.length - 1) await sleep(200);
    }

    if (progressEl) {
      const diffs = Object.values(_results).filter(r => r.status === 'ok' && r.diffs && r.diffs.length > 0).length;
      const errors = Object.values(_results).filter(r => r.status === 'error').length;
      progressEl.textContent = `完成 — ${validCases.length} 筆，${diffs} 筆有差異，${errors} 筆查詢失敗`;
    }
  }

  // ========================
  // HIS API CALL
  // ========================
  async function fetchHISBilling(date, caseNo) {
    const url = `${BILLING_ENDPOINT}?date=${encodeURIComponent(date)}&case_no=${encodeURIComponent(caseNo)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let resp;
    try {
      resp = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
      });
    } finally {
      clearTimeout(timeout);
    }

    if (resp.status === 401 || resp.status === 403) {
      // Session expired — clear login state and prompt re-login
      clearLogin();
      showToast('登入工作階段已過期，請重新登入', 'warning');
      renderLoginForm('登入工作階段已過期，請重新登入');
      throw new Error('Session expired');
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return await resp.json();

    const text = await resp.text();
    try { return JSON.parse(text); } catch {
      return parseHISHtml(text, date, caseNo);
    }
  }

  function parseHISHtml(html, date, caseNo) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const result = { raw_html: true, date, case_no: caseNo };
    doc.querySelectorAll('tr').forEach(row => {
      const cells = [...row.querySelectorAll('td,th')].map(c => c.textContent.trim());
      if (cells.length >= 2) {
        const key = cells[0]; const val = cells[1];
        if (key.includes('麻醉方式') || key.includes('anesthesia_type')) result.anesthesia_type = val;
        if (key.includes('時間') || key.includes('duration'))            result.duration_min = parseFloat(val) || null;
        if (key.includes('加成') || key.includes('bonus'))               result.bonus_type = val;
        if (key.includes('交接班') || key.includes('handover'))          result.handover_ratio = parseFloat(val) || null;
      }
    });
    return result;
  }

  // ========================
  // COMPARE CASE WITH HIS
  // ========================
  function compareCaseWithHIS(storedCase, hisData) {
    if (!hisData || hisData.raw_html) return [];
    const diffs = [];
    for (const field of COMPARE_FIELDS) {
      const storedVal = storedCase[field.key];
      const hisVal = hisData[field.hisKey];
      if (hisVal === undefined || hisVal === null) continue;
      const norm = v => (v === null || v === undefined) ? 0 : v;
      const sv = norm(storedVal); const hv = norm(hisVal);
      const isDiff = typeof sv === 'number' && typeof hv === 'number'
        ? Math.abs(sv - hv) > 0.01
        : String(sv) !== String(hv);
      if (isDiff) diffs.push({ label: field.label, stored: storedVal, his: hisVal });
    }
    return diffs;
  }

  // ========================
  // UPDATE SINGLE ROW UI
  // ========================
  function updateRowStatus(caseId) {
    const c = _cases.find(x => x.id === caseId);
    if (!c) return;
    const row = document.getElementById(`row-${caseId}`);
    if (!row) return;

    const r = _results[caseId];
    const pts = Calculator.calculateTotal(c, _pointSettings);

    let statusCell = `<span class="verify-badge verify-pending">待查詢</span>`;
    if (r) {
      if (r.status === 'loading') statusCell = `<span class="verify-badge verify-loading"><span class="dot-pulse-sm"></span> 查詢中</span>`;
      else if (r.status === 'error') statusCell = `<span class="verify-badge verify-error" title="${escHtml(r.error)}">查詢失敗</span>`;
      else if (r.status === 'ok') {
        const hasDiff = r.diffs && r.diffs.length > 0;
        statusCell = hasDiff
          ? `<span class="verify-badge verify-diff">有差異 (${r.diffs.length}項)</span>`
          : `<span class="verify-badge verify-match">✓ 相符</span>`;
      }
    }

    const actionBtns = r && r.status === 'ok' && r.diffs && r.diffs.length > 0
      ? `<button class="btn btn-outline btn-sm" style="font-size:11px;padding:3px 8px" onclick="Billing.showDiff('${c.id}')">查看差異</button>
         <button class="btn btn-primary btn-sm" style="font-size:11px;padding:3px 8px" onclick="Billing.applyHISData('${c.id}')">套用HIS</button>`
      : r && r.status === 'ok' && (!r.diffs || r.diffs.length === 0)
        ? `<span style="color:var(--accent);font-size:11px">✓</span>` : '';

    const queryBtn = _networkOk
      ? `<button class="btn btn-ghost btn-sm" onclick="Billing.querySingle('${c.id}')" title="重新查詢">
           <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.156a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"/></svg>
         </button>` : '';

    row.innerHTML = `
      <td class="mono" style="font-size:12px">${escHtml(c.date || '')}</td>
      <td class="mono" style="font-size:12px">${escHtml(c.case_no || '')}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" title="${escHtml(c.diagnosis || '')}">${escHtml(c.diagnosis || '')}</td>
      <td>${methodBadge(c.method || '')}</td>
      <td class="mono text-right">${c.duration || 0}</td>
      <td class="mono text-right" style="color:var(--accent)">${pts.toLocaleString('zh-TW', {maximumFractionDigits:1})}</td>
      <td>${statusCell}</td>
      <td>
        <div style="display:flex;gap:6px;align-items:center">
          ${queryBtn}
          ${actionBtns}
        </div>
      </td>`;
  }

  // ========================
  // SHOW DIFF MODAL
  // ========================
  function showDiff(caseId) {
    const c = _cases.find(x => x.id === caseId);
    const r = _results[caseId];
    if (!c || !r || !r.diffs) return;

    const allFields = COMPARE_FIELDS.filter(f => {
      const hisVal = r.hisData[f.hisKey];
      return hisVal !== undefined && hisVal !== null;
    });

    const rows = allFields.map(f => {
      const stored = c[f.key];
      const his = r.hisData[f.hisKey];
      const diff = r.diffs.find(d => d.label === f.label);
      const style = diff ? 'background:rgba(218,54,51,0.1);' : '';
      const diffIcon = diff
        ? '<span style="color:var(--red);margin-left:4px;font-weight:700">⚠</span>'
        : '<span style="color:var(--accent)">✓</span>';
      return `
        <tr style="${style}">
          <td style="font-size:12px">${escHtml(f.label)}</td>
          <td class="mono" style="font-size:12px;color:${diff ? 'var(--amber)' : 'var(--text-primary)'}">${escHtml(String(stored ?? '—'))}</td>
          <td class="mono" style="font-size:12px;color:${diff ? 'var(--red)' : 'var(--accent)'}">${escHtml(String(his ?? '—'))}</td>
          <td style="text-align:center">${diffIcon}</td>
        </tr>`;
    }).join('');

    const html = `
      <div style="margin-bottom:12px;padding:10px;background:var(--bg-elevated);border-radius:6px;font-size:13px">
        <strong>${escHtml(c.case_no)}</strong> &nbsp;·&nbsp; ${escHtml(c.date)} &nbsp;·&nbsp; ${escHtml(c.diagnosis || '')}
      </div>
      ${r.diffs.length === 0
        ? '<p style="color:var(--accent);text-align:center;padding:20px">所有欄位與HIS相符 ✓</p>'
        : `<div class="notice notice-error" style="margin-bottom:12px">
             共 <strong>${r.diffs.length}</strong> 個欄位與HIS計費資料有差異，以紅色標示
           </div>`}
      <div class="table-wrap" style="max-height:380px;overflow-y:auto">
        <table style="font-size:12px">
          <thead>
            <tr>
              <th>欄位</th><th>系統存儲值</th><th>HIS計費值</th><th style="text-align:center">狀態</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    showModal('billing-diff-modal',
      `核對詳情 — ${c.case_no}`,
      html,
      [
        { label: '關閉',    cls: 'btn-outline', action: 'close' },
        ...(r.diffs.length > 0 ? [{ label: '套用HIS資料', cls: 'btn-primary', action: `apply-his:${caseId}` }] : []),
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
  // APPLY HIS DATA TO CASE
  // ========================
  async function applyHISData(caseId) {
    const c = _cases.find(x => x.id === caseId);
    const r = _results[caseId];
    if (!c || !r || r.status !== 'ok') return;

    const hisData = r.hisData;
    const fieldMap = {
      method:        hisData.anesthesia_type,
      duration:      hisData.duration_min,
      bonus:         hisData.bonus_type,
      handover:      hisData.handover_ratio,
      GVL_AWS_MAC:   hisData.GVL_AWS_MAC,
      Rusch_Video:   hisData.Rusch_Video,
      OMT:           hisData.OMT,
      A_line:        hisData.A_line,
      CVC:           hisData.CVC,
      PAC:           hisData.PAC,
      TEE:           hisData.TEE,
      CO:            hisData.CO,
      Optiflow:      hisData.Optiflow,
      BIS_self:      hisData.BIS_self,
      BIS_NHI_adult: hisData.BIS_NHI_adult,
      BIS_NHI_child: hisData.BIS_NHI_child,
      blanket:       hisData.blanket,
      IVPCA:         hisData.IVPCA,
      NBPCA:         hisData.NBPCA,
      PCEA:          hisData.PCEA,
      PCA_days:      hisData.PCA_days,
      IV_sedation:   hisData.IV_sedation,
      ultrasound:    hisData.ultrasound,
      ByBIS:         hisData.ByBIS,
    };

    for (const [key, val] of Object.entries(fieldMap)) {
      if (val !== undefined && val !== null) c[key] = val;
    }

    c.total_performance = Calculator.calculateTotal(c, _pointSettings);

    const month = c.date.slice(0, 7);
    const allCases = await db.getCases(month);
    const idx = allCases.findIndex(x => x.id === c.id);
    if (idx >= 0) allCases[idx] = c;
    await db.saveCases(month, allCases);

    _results[caseId] = { status: 'ok', hisData, diffs: [] };
    showToast(`已更新病例 ${c.case_no}`, 'success');
    updateRowStatus(caseId);
  }

  // ========================
  // HELPERS
  // ========================
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init, checkNetwork, querySingle, queryAll, showDiff, applyHISData, doLogin, logout };
})();
