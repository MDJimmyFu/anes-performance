/**
 * billing.js
 * HIS Billing Verification Page
 * Connects to http://10.10.52.65:5000/anesthesia_billing (hospital intranet)
 * Queries billing data by date + case number, compares with stored records,
 * and highlights discrepancies in red.
 */

const Billing = (() => {
  const HIS_BASE = 'http://10.10.52.65:5000';
  const BILLING_ENDPOINT = `${HIS_BASE}/anesthesia_billing`;

  // Fields to compare between stored case and HIS response
  // Each entry: { key: stored field, hisKey: HIS response field, label }
  const COMPARE_FIELDS = [
    { key: 'method',   hisKey: 'anesthesia_type',  label: '麻醉方式' },
    { key: 'duration', hisKey: 'duration_min',      label: '麻醉時間(min)' },
    { key: 'bonus',    hisKey: 'bonus_type',        label: '加成' },
    { key: 'handover', hisKey: 'handover_ratio',    label: '交接班' },
    // Extras
    { key: 'GVL_AWS_MAC',   hisKey: 'GVL_AWS_MAC',   label: 'GVL/AWS/MAC' },
    { key: 'Rusch_Video',   hisKey: 'Rusch_Video',   label: 'Rusch+Video' },
    { key: 'OMT',           hisKey: 'OMT',           label: 'OMT' },
    { key: 'A_line',        hisKey: 'A_line',        label: 'A-line' },
    { key: 'CVC',           hisKey: 'CVC',           label: 'CVC' },
    { key: 'PAC',           hisKey: 'PAC',           label: 'PAC' },
    { key: 'TEE',           hisKey: 'TEE',           label: 'TEE' },
    { key: 'CO',            hisKey: 'CO',            label: 'CO' },
    { key: 'Optiflow',      hisKey: 'Optiflow',      label: 'Optiflow' },
    { key: 'BIS_self',      hisKey: 'BIS_self',      label: 'BIS自費' },
    { key: 'BIS_NHI_adult', hisKey: 'BIS_NHI_adult', label: 'BIS健保成人' },
    { key: 'BIS_NHI_child', hisKey: 'BIS_NHI_child', label: 'BIS健保小兒' },
    { key: 'blanket',       hisKey: 'blanket',       label: '溫毯' },
    { key: 'IVPCA',         hisKey: 'IVPCA',         label: 'IVPCA' },
    { key: 'NBPCA',         hisKey: 'NBPCA',         label: 'NBPCA' },
    { key: 'PCEA',          hisKey: 'PCEA',          label: 'PCEA' },
    { key: 'PCA_days',      hisKey: 'PCA_days',      label: 'PCA加做天' },
    { key: 'IV_sedation',   hisKey: 'IV_sedation',   label: 'IV Sedation' },
    { key: 'ultrasound',    hisKey: 'ultrasound',    label: '超音波導引' },
    { key: 'ByBIS',         hisKey: 'ByBIS',         label: 'ByBIS' },
  ];

  let _cases = [];          // current month's stored cases
  let _pointSettings = [];
  let _results = {};        // keyed by case id: { status, hisData, diffs }
  let _networkOk = null;   // null = unchecked, true/false

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
          <div style="display:flex;gap:10px;align-items:center">
            <div id="network-status" class="network-badge network-checking">
              <span class="status-dot"></span> 檢查網路中...
            </div>
            <button class="btn btn-outline btn-sm" onclick="Billing.checkNetwork()">重新連線</button>
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
        <div id="billing-results"></div>
      </div>`;

    // Load data
    _pointSettings = await DB.getPointSettings();
    _cases = await DB.getCases(AppState.selectedMonth);
    document.getElementById('billing-month-label').textContent = AppState.selectedMonth;

    await checkNetwork();
  }

  // ========================
  // NETWORK CHECK
  // ========================
  async function checkNetwork() {
    const badge = document.getElementById('network-status');
    const offlineNotice = document.getElementById('offline-notice');
    const toolbar = document.getElementById('billing-toolbar');

    if (badge) {
      badge.className = 'network-badge network-checking';
      badge.innerHTML = '<span class="status-dot"></span> 檢查網路中...';
    }

    try {
      // Use a short timeout — if we're outside hospital, this will fail quickly
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(`${HIS_BASE}/`, {
        signal: controller.signal,
        mode: 'no-cors',   // avoid CORS preflight; we just need to know it's reachable
      });
      clearTimeout(timeout);
      _networkOk = true;
    } catch (e) {
      _networkOk = false;
    }

    if (_networkOk) {
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
      renderCasesTable(true); // show table in read-only mode
    }
  }

  // ========================
  // RENDER CASES TABLE
  // ========================
  function renderCasesTable(offlineMode = false) {
    const container = document.getElementById('billing-results');
    if (!container) return;

    // Filter cases that have a case_no (skip template rows)
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

      // Small delay between requests to avoid overwhelming the server
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
        credentials: 'include',   // send session cookies for HIS login
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await resp.json();
    }

    // Fallback: try to parse response text as JSON
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      // If not JSON, try to parse as HTML and extract key fields
      return parseHISHtml(text, date, caseNo);
    }
  }

  // Fallback HTML parser — extracts common billing fields from an HTML table response
  function parseHISHtml(html, date, caseNo) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const result = { raw_html: true, date, case_no: caseNo };

    // Try to find table rows with key-value pairs
    doc.querySelectorAll('tr').forEach(row => {
      const cells = [...row.querySelectorAll('td,th')].map(c => c.textContent.trim());
      if (cells.length >= 2) {
        const key = cells[0];
        const val = cells[1];
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
    if (!hisData || hisData.raw_html) return []; // can't compare HTML response reliably

    const diffs = [];
    for (const field of COMPARE_FIELDS) {
      const storedVal = storedCase[field.key];
      const hisVal = hisData[field.hisKey];

      // Skip if HIS didn't return this field
      if (hisVal === undefined || hisVal === null) continue;

      // Normalize: treat 0/null/undefined as equivalent for binary extras
      const norm = v => (v === null || v === undefined) ? 0 : v;
      const sv = norm(storedVal);
      const hv = norm(hisVal);

      // Compare with tolerance for floats
      const isDiff = typeof sv === 'number' && typeof hv === 'number'
        ? Math.abs(sv - hv) > 0.01
        : String(sv) !== String(hv);

      if (isDiff) {
        diffs.push({ label: field.label, stored: storedVal, his: hisVal });
      }
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
      const diffIcon = diff ? '<span style="color:var(--red);margin-left:4px;font-weight:700">⚠</span>' : '<span style="color:var(--accent)">✓</span>';
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
           </div>`
      }
      <div class="table-wrap" style="max-height:380px;overflow-y:auto">
        <table style="font-size:12px">
          <thead>
            <tr>
              <th>欄位</th>
              <th>系統存儲值</th>
              <th>HIS計費值</th>
              <th style="text-align:center">狀態</th>
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

    // Listen for apply action
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

    // Apply each mapped field from HIS response
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

    // Recalculate total
    c.total_performance = Calculator.calculateTotal(c, _pointSettings);

    // Save back
    const month = c.date.slice(0, 7);
    const allCases = await DB.getCases(month);
    const idx = allCases.findIndex(x => x.id === c.id);
    if (idx >= 0) allCases[idx] = c;
    const saved = await DB.saveCases(month, allCases);

    if (saved) {
      _results[caseId] = { status: 'ok', hisData, diffs: [] }; // no more diffs
      showToast(`已更新病例 ${c.case_no}`, 'success');
      updateRowStatus(caseId);
    } else {
      showToast('儲存失敗，請檢查 GitHub 設定', 'error');
    }
  }

  // ========================
  // HELPERS
  // ========================
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init, checkNetwork, querySingle, queryAll, showDiff, applyHISData };
})();
