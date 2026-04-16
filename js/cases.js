/**
 * cases.js
 * Case list page and add/edit case page.
 */

// HTML-escape helper — prevents <6mo and similar values breaking innerHTML
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ========================
// METHOD BADGE HELPER
// ========================
function methodBadge(method) {
  const colors = {
    'GE':          'badge-teal',
    'GM':          'badge-blue',
    'EA':          'badge-amber',
    'SA':          'badge-purple',
    'IV':          'badge-muted',
    'Painless':    'badge-pink',
    'Painless夜間': 'badge-pink',
    'HMC':         'badge-gray',
    'C/G':         'badge-gray',
    'C+G':         'badge-gray',
    'C':           'badge-gray',
    'G':           'badge-gray',
    'ERCP':        'badge-orange',
    'EUS':         'badge-orange',
    '傳染GE':       'badge-red',
    '困難氣道GE':    'badge-red',
  };
  return `<span class="badge ${colors[method] || 'badge-gray'}">${escHtml(method)}</span>`;
}

function bonusBadgeClass(bonus) {
  if (!bonus || bonus === '無') return 'badge-gray';
  if (['心臟手術','腦部手術'].includes(bonus)) return 'badge-red';
  if (['休克','急診'].includes(bonus)) return 'badge-amber';
  if (['器官移植'].includes(bonus)) return 'badge-purple';
  if (['<6mo','6mo-2yo','2yo-7yo'].includes(bonus)) return 'badge-teal';
  if (['自費麻醉','醫美'].includes(bonus)) return 'badge-orange';
  return 'badge-gray';
}

const Cases = (() => {
  const PAGE_SIZE = 50;
  let _allCases = [];
  let _filtered = [];
  let _currentPage = 1;
  let _pointSettings = [];
  let _currentYM = '';
  let _editingId = null;
  let _scanner = null;

  // ========================
  // CASE LIST PAGE
  // ========================
  async function initList() {
    _currentYM = AppState.selectedMonth;
    document.getElementById('content').innerHTML = `
      <div class="page-header flex items-center justify-between">
        <div>
          <h2 class="page-title">病例列表</h2>
          <p class="page-subtitle" id="cases-subtitle">載入中...</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" id="btn-import-csv">
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/></svg>
            匯入CSV
          </button>
          <button class="btn btn-outline btn-sm" id="btn-batch-add">
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z"/></svg>
            批次新增
          </button>
          <button class="btn btn-primary btn-sm" id="btn-add-case">
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            新增病例
          </button>
        </div>
      </div>

      <div class="card mb-4">
        <div class="filter-bar">
          <div class="search-input-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
            <input class="form-input" id="search-input" placeholder="搜尋病例號或術式...">
          </div>
          <select class="form-select" id="filter-method" style="width:140px">
            <option value="">所有方式</option>
            ${Calculator.METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
          <select class="form-select" id="filter-asa" style="width:100px">
            <option value="">所有ASA</option>
            <option value="1">ASA 1</option>
            <option value="2">ASA 2</option>
            <option value="3">ASA 3</option>
            <option value="4">ASA 4</option>
            <option value="1E">ASA 1E</option>
            <option value="2E">ASA 2E</option>
            <option value="3E">ASA 3E</option>
            <option value="4E">ASA 4E</option>
          </select>
          <input type="date" class="form-input" id="filter-date-from" style="width:140px" placeholder="起始日期">
          <input type="date" class="form-input" id="filter-date-to" style="width:140px" placeholder="結束日期">
          <button class="btn btn-outline btn-sm" id="btn-clear-filter">清除篩選</button>
        </div>
      </div>

      <div class="card">
        <div id="cases-table-wrap" class="table-wrap"></div>
        <div id="pagination"></div>
      </div>
    `;

    document.getElementById('btn-add-case').addEventListener('click', () => openAddEditModal());
    document.getElementById('btn-batch-add').addEventListener('click', openBatchModal);
    document.getElementById('btn-import-csv').addEventListener('click', openImportModal);
    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('filter-method').addEventListener('change', applyFilters);
    document.getElementById('filter-asa').addEventListener('change', applyFilters);
    document.getElementById('filter-date-from').addEventListener('change', applyFilters);
    document.getElementById('filter-date-to').addEventListener('change', applyFilters);
    document.getElementById('btn-clear-filter').addEventListener('click', clearFilters);

    await loadCases();
  }

  async function loadCases() {
    try {
      _pointSettings = await db.getPointSettings();
      _allCases = await db.getCases(_currentYM);
      _allCases.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      applyFilters();
      const subtitle = document.getElementById('cases-subtitle');
      if (subtitle) subtitle.textContent = `${_currentYM} — 共 ${_allCases.length} 筆`;
    } catch (err) {
      showToast('載入病例失敗: ' + err.message, 'error');
    }
  }

  function applyFilters() {
    const q      = (document.getElementById('search-input')?.value || '').toLowerCase();
    const method = document.getElementById('filter-method')?.value || '';
    const asa    = document.getElementById('filter-asa')?.value || '';
    const from   = document.getElementById('filter-date-from')?.value || '';
    const to     = document.getElementById('filter-date-to')?.value || '';

    _filtered = _allCases.filter(c => {
      if (q && !((c.case_no || '').toLowerCase().includes(q) || (c.diagnosis || '').toLowerCase().includes(q))) return false;
      if (method && c.method !== method) return false;
      if (asa && String(c.asa) !== asa) return false;
      if (from && c.date < from) return false;
      if (to && c.date > to) return false;
      return true;
    });

    _currentPage = 1;
    renderTable();
  }

  function clearFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-method').value = '';
    document.getElementById('filter-asa').value = '';
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    applyFilters();
  }

  function renderTable() {
    const wrap = document.getElementById('cases-table-wrap');
    if (!wrap) return;

    if (_filtered.length === 0) {
      wrap.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <h3>沒有符合的病例</h3>
        <p>調整篩選條件或新增病例</p>
      </div>`;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    const start = (_currentPage - 1) * PAGE_SIZE;
    const end   = start + PAGE_SIZE;
    const page  = _filtered.slice(start, end);

    const rows = page.map(c => {
      const pts = Calculator.calculateTotal(c, _pointSettings);
      const extras = getExtrasSummary(c);
      return `
        <tr>
          <td class="mono">${c.date || ''}</td>
          <td class="mono">${c.case_no || ''}</td>
          <td class="truncate" style="max-width:180px" title="${c.diagnosis || ''}">${c.diagnosis || ''}</td>
          <td><span class="badge badge-blue">${c.asa || ''}</span></td>
          <td><span class="badge ${bonusBadgeClass(c.bonus)}">${escHtml(c.bonus || '無')}</span></td>
          <td>${methodBadge(c.method || '')}</td>
          <td class="text-right mono">${c.duration || 0}</td>
          <td class="text-right mono" style="color:var(--accent);font-weight:700">${pts.toLocaleString('zh-TW', {maximumFractionDigits:2})}</td>
          <td class="text-right mono">${c.handover ?? 1}</td>
          <td><div class="extras-tags">${extras}</div></td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-icon btn-sm" onclick="Cases.openAddEditModal('${c.id}')" title="編輯">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon btn-sm" style="color:var(--red)" onclick="Cases.deleteCase('${c.id}')" title="刪除">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>病例號</th>
            <th>診斷/術式</th>
            <th>ASA</th>
            <th>加成</th>
            <th>麻醉方式</th>
            <th class="text-right">時間(min)</th>
            <th class="text-right">績效點數</th>
            <th class="text-right">交接班</th>
            <th>附加項目</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    renderPagination();
  }

  function getExtrasSummary(c) {
    const tags = [];
    const checks = ['GVL_AWS_MAC','Rusch_Video','OMT','A_line','CVC','PAC','TEE','CO','Optiflow','BIS_self','BIS_NHI_adult','BIS_NHI_child','blanket','IVPCA','NBPCA','PCEA','IV_sedation','ultrasound','ByBIS'];
    const labels = {'GVL_AWS_MAC':'GVL','Rusch_Video':'Rusch','OMT':'OMT','A_line':'A-line','CVC':'CVC','PAC':'PAC','TEE':'TEE','CO':'CO','Optiflow':'Optiflow','BIS_self':'BIS自','BIS_NHI_adult':'BIS成','BIS_NHI_child':'BIS兒','blanket':'溫毯','IVPCA':'IVPCA','NBPCA':'NBPCA','PCEA':'PCEA','IV_sedation':'IVSed','ultrasound':'US','ByBIS':'ByBIS'};
    for (const k of checks) {
      if (Number(c[k]) > 0) tags.push(`<span class="extra-tag">${labels[k]}</span>`);
    }
    if (Number(c.PCA_days) > 0) tags.push(`<span class="extra-tag">PCA×${c.PCA_days}</span>`);
    return tags.join('');
  }

  function renderPagination() {
    const total = Math.ceil(_filtered.length / PAGE_SIZE);
    const pg = document.getElementById('pagination');
    if (!pg || total <= 1) { if (pg) pg.innerHTML = ''; return; }

    let html = '<div class="pagination">';
    html += `<button class="page-btn" onclick="Cases.goPage(${_currentPage-1})" ${_currentPage===1?'disabled':''}>‹</button>`;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - _currentPage) <= 2) {
        html += `<button class="page-btn ${i===_currentPage?'active':''}" onclick="Cases.goPage(${i})">${i}</button>`;
      } else if (Math.abs(i - _currentPage) === 3) {
        html += `<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
      }
    }

    html += `<button class="page-btn" onclick="Cases.goPage(${_currentPage+1})" ${_currentPage===total?'disabled':''}>›</button>`;
    html += `<span style="font-size:12px;color:var(--text-muted);margin-left:8px">共 ${_filtered.length} 筆</span>`;
    html += '</div>';
    pg.innerHTML = html;
  }

  function goPage(p) {
    const total = Math.ceil(_filtered.length / PAGE_SIZE);
    if (p < 1 || p > total) return;
    _currentPage = p;
    renderTable();
  }

  // ========================
  // ADD / EDIT MODAL
  // ========================
  async function openAddEditModal(id) {
    _editingId = id || null;
    if (_pointSettings.length === 0) {
      _pointSettings = await db.getPointSettings();
    }

    let caseData = null;
    if (id) {
      caseData = _allCases.find(c => c.id === id);
    }

    const title = id ? '編輯病例' : '新增病例';
    const modalHtml = buildCaseFormHtml(caseData);
    showModal('case-modal', title, modalHtml, [
      { label: '取消', cls: 'btn-outline', action: 'close' },
      { label: id ? '儲存' : '新增', cls: 'btn-primary', action: 'save-case' },
    ]);

    // Populate if editing
    if (caseData) populateForm(caseData);

    // Live calculation
    attachFormListeners();
    recalculate();

    // Barcode scanner
    document.getElementById('btn-scan')?.addEventListener('click', openScannerModal);
  }

  function buildCaseFormHtml(caseData) {
    const ym = _currentYM;
    const [y, m] = ym.split('-');
    const defaultDate = `${y}-${m}-01`;

    return `
      <div class="form-row form-row-2">
        <div class="form-group">
          <label class="form-label">日期<span class="required">*</span></label>
          <input class="form-input" type="date" id="f-date" value="${defaultDate}">
        </div>
        <div class="form-group">
          <label class="form-label">病例號</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="f-case-no" placeholder="e.g. 003013132J">
            <button class="btn btn-outline btn-sm btn-icon" id="btn-scan" title="掃描條碼">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm9-1a1 1 0 000 2h2v2a1 1 0 002 0V4a1 1 0 00-1-1h-3zM3 13a1 1 0 011 1v2h2a1 1 0 010 2H4a1 1 0 01-1-1v-3a1 1 0 011-1zm13 1a1 1 0 00-2 0v3h-2a1 1 0 000 2h3a1 1 0 001-1v-4z" clip-rule="evenodd"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">診斷/術式</label>
        <input class="form-input" id="f-diagnosis" placeholder="e.g. Appendectomy">
      </div>

      <div class="form-row form-row-3">
        <div class="form-group">
          <label class="form-label">ASA</label>
          <select class="form-select" id="f-asa">
            <option value="1">1</option><option value="2" selected>2</option>
            <option value="3">3</option><option value="4">4</option>
            <option value="1E">1E</option><option value="2E">2E</option>
            <option value="3E">3E</option><option value="4E">4E</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">麻醉方式<span class="required">*</span></label>
          <select class="form-select" id="f-method">
            ${Calculator.METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">加成</label>
          <select class="form-select" id="f-bonus">
            ${Calculator.BONUS_TYPES.map(b => `<option value="${b}">${b}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row form-row-3">
        <div class="form-group">
          <label class="form-label">麻醉時間 (min)<span class="required">*</span></label>
          <input class="form-input" type="number" id="f-duration" min="0" value="60">
        </div>
        <div class="form-group">
          <label class="form-label">交接班</label>
          <select class="form-select" id="f-handover">
            ${Calculator.HANDOVER_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">PCA加做天</label>
          <input class="form-input" type="number" id="f-pca-days" min="0" value="0">
        </div>
      </div>

      <hr class="divider">
      <div class="section-title">附加項目</div>
      <div class="checkbox-grid" id="extras-grid">
        ${Calculator.EXTRAS_META.filter(e => e.type === 'check').map(e => `
          <label class="checkbox-item">
            <input type="checkbox" id="f-${e.key}" value="1">
            <span>${e.label}</span>
          </label>`).join('')}
      </div>

      <hr class="divider">
      <div class="form-group">
        <label class="form-label">備註</label>
        <textarea class="form-textarea" id="f-notes" rows="2" placeholder="備註..."></textarea>
      </div>

      <div class="point-preview">
        <div class="total-label">即時績效點數</div>
        <div class="total-value" id="preview-total">--</div>
        <div class="breakdown" id="preview-breakdown"></div>
      </div>
    `;
  }

  function populateForm(c) {
    setValue('f-date', c.date || '');
    setValue('f-case-no', c.case_no || '');
    setValue('f-diagnosis', c.diagnosis || '');
    setValue('f-asa', String(c.asa || '2'));
    setValue('f-method', c.method || 'GE');
    setValue('f-bonus', c.bonus || '無');
    setValue('f-duration', String(c.duration || 0));
    setValue('f-handover', String(c.handover ?? 1));
    setValue('f-pca-days', String(c.PCA_days || 0));
    setValue('f-notes', c.notes || '');

    for (const e of Calculator.EXTRAS_META) {
      if (e.type === 'check') {
        const el = document.getElementById(`f-${e.key}`);
        if (el) el.checked = Number(c[e.key] || 0) > 0;
      }
    }
  }

  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function attachFormListeners() {
    const ids = ['f-date','f-method','f-bonus','f-duration','f-handover','f-pca-days'];
    for (const id of ids) {
      document.getElementById(id)?.addEventListener('input', recalculate);
      document.getElementById(id)?.addEventListener('change', recalculate);
    }
    for (const e of Calculator.EXTRAS_META) {
      document.getElementById(`f-${e.key}`)?.addEventListener('change', recalculate);
    }
  }

  function buildCaseFromForm() {
    const date = document.getElementById('f-date')?.value || '';
    const method = document.getElementById('f-method')?.value || 'GE';
    const bonus  = document.getElementById('f-bonus')?.value || '無';
    const duration = Number(document.getElementById('f-duration')?.value || 0);
    const handover = Number(document.getElementById('f-handover')?.value || 1);

    const yearMonth = date.substring(0, 7);
    const settings = Calculator.getApplicableSettings(yearMonth, _pointSettings);
    const basePoints = settings ? Calculator.calculateBasePerformance(method, duration, settings) : 0;

    const caseData = {
      id: _editingId || GitHubDB.generateId(),
      date,
      case_no: document.getElementById('f-case-no')?.value?.trim() || '',
      diagnosis: document.getElementById('f-diagnosis')?.value?.trim() || '',
      asa: document.getElementById('f-asa')?.value || '2',
      bonus,
      method,
      base_points: Math.round(basePoints * 1000) / 1000,
      handover,
      duration,
      notes: document.getElementById('f-notes')?.value?.trim() || '',
    };

    for (const e of Calculator.EXTRAS_META) {
      if (e.type === 'check') {
        caseData[e.key] = document.getElementById(`f-${e.key}`)?.checked ? 1 : 0;
      } else {
        caseData[e.key] = Number(document.getElementById(`f-${e.key}`)?.value || 0);
      }
    }
    caseData.PCA_days = Number(document.getElementById('f-pca-days')?.value || 0);

    caseData.total_performance = Calculator.calculateTotal(caseData, _pointSettings);
    return caseData;
  }

  function recalculate() {
    try {
      const caseData = buildCaseFromForm();
      const total = caseData.total_performance;
      const breakdown = Calculator.getBreakdown(caseData, _pointSettings);
      const el = document.getElementById('preview-total');
      const bel = document.getElementById('preview-breakdown');
      if (el) el.textContent = total.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (bel) bel.textContent = breakdown;
    } catch {}
  }

  async function saveCase() {
    const caseData = buildCaseFromForm();
    if (!caseData.date) { showToast('請填寫日期', 'warning'); return; }

    const targetYM = caseData.date.substring(0, 7);

    try {
      showToast('儲存中...', 'info');
      let cases = await db.getCases(targetYM);
      if (_editingId) {
        const idx = cases.findIndex(c => c.id === _editingId);
        if (idx >= 0) cases[idx] = caseData;
        else cases.push(caseData);
      } else {
        cases.push(caseData);
      }
      await db.saveCases(targetYM, cases);
      closeModal('case-modal');
      showToast(_editingId ? '病例已更新' : '病例已新增', 'success');

      // Reload
      _currentYM = AppState.selectedMonth;
      await loadCases();
    } catch (err) {
      showToast('儲存失敗: ' + err.message, 'error');
    }
  }

  async function deleteCase(id) {
    if (!confirm('確定刪除這筆病例？')) return;
    const c = _allCases.find(x => x.id === id);
    if (!c) return;
    const targetYM = (c.date || _currentYM).substring(0, 7);
    try {
      const cases = await db.getCases(targetYM);
      const updated = cases.filter(x => x.id !== id);
      await db.saveCases(targetYM, updated);
      showToast('病例已刪除', 'success');
      await loadCases();
    } catch (err) {
      showToast('刪除失敗: ' + err.message, 'error');
    }
  }

  // ========================
  // BATCH ADD
  // ========================
  let _batchRows = [];
  let _batchRowId = 0;

  async function openBatchModal() {
    _batchRows = [];
    _batchRowId = 0;
    if (_pointSettings.length === 0) _pointSettings = await db.getPointSettings();

    const ym = _currentYM;
    const [y, m] = ym.split('-');
    const now = new Date();
    const nowYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const defaultDate = (nowYM === ym)
      ? now.toISOString().split('T')[0]
      : `${y}-${m}-01`;

    const html = `
      <!-- Shared settings -->
      <div style="background:var(--bg-elevated);border-radius:8px;padding:14px 16px;margin-bottom:14px">
        <div style="font-size:11px;color:var(--text-muted);font-weight:500;letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px">共用設定</div>
        <div style="display:grid;grid-template-columns:160px 100px 1fr 1fr;gap:10px;align-items:end">
          <div class="form-group" style="margin:0">
            <label class="form-label">日期<span class="required">*</span></label>
            <input class="form-input" type="date" id="bf-date" value="${defaultDate}" onchange="Cases._batchRefreshAll()">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">ASA</label>
            <select class="form-select" id="bf-asa">
              <option value="1">1</option><option value="2" selected>2</option>
              <option value="3">3</option><option value="4">4</option>
              <option value="1E">1E</option><option value="2E">2E</option>
              <option value="3E">3E</option><option value="4E">4E</option>
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">加成</label>
            <select class="form-select" id="bf-bonus" onchange="Cases._batchRefreshAll()">
              ${Calculator.BONUS_TYPES.map(b => `<option value="${b}">${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">交接班</label>
            <select class="form-select" id="bf-handover" onchange="Cases._batchRefreshAll()">
              ${Calculator.HANDOVER_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Quick-add strip -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;background:var(--bg-elevated);border-radius:6px;font-size:12px">
        <span style="color:var(--text-muted);flex-shrink:0">快速新增</span>
        <input id="bf-quick-n" type="number" min="1" max="20" value="3" class="form-input" style="width:56px;padding:4px 8px;font-size:12px">
        <span style="color:var(--text-muted);flex-shrink:0">筆</span>
        <select id="bf-quick-method" class="form-select" style="width:110px;font-size:12px">
          ${Calculator.METHODS.map(m => `<option value="${m}" ${m==='C+G'?'selected':''}>${m}</option>`).join('')}
        </select>
        <span style="color:var(--text-muted);flex-shrink:0">各</span>
        <input id="bf-quick-dur" type="number" min="1" value="30" class="form-input" style="width:60px;padding:4px 8px;font-size:12px">
        <span style="color:var(--text-muted);flex-shrink:0">分</span>
        <button class="btn btn-outline btn-sm" onclick="Cases._quickAddRows()">新增</button>
      </div>

      <!-- Rows table -->
      <div class="table-wrap" style="max-height:340px;overflow-y:auto">
        <table id="batch-table" style="table-layout:fixed">
          <colgroup>
            <col style="width:120px"><col style="width:80px"><col style="width:140px"><col style="width:46px"><col style="width:72px"><col style="width:30px">
          </colgroup>
          <thead>
            <tr>
              <th>麻醉方式</th>
              <th>時間(min)</th>
              <th>病例號（選填）</th>
              <th style="text-align:center">附加</th>
              <th style="text-align:right">績效點數</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="batch-tbody"></tbody>
        </table>
      </div>

      <!-- Footer strip -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">
        <button class="btn btn-outline btn-sm" onclick="Cases._addBatchRow()">
          <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          手動新增一筆
        </button>
        <div id="batch-summary" style="font-size:12px;color:var(--text-muted)"></div>
      </div>
    `;

    showModal('batch-modal', '批次新增病例', html, [
      { label: '取消', cls: 'btn-outline', action: 'close' },
      { label: '全部儲存', cls: 'btn-primary', action: 'save-batch' },
    ], 'modal-xl');

    _renderBatchRows();
  }

  function _addBatchRow(method, duration) {
    const lastMethod = _batchRows.length > 0 ? _batchRows[_batchRows.length - 1].method : 'C+G';
    _batchRows.push({
      id: ++_batchRowId,
      method: method || lastMethod,
      duration: duration || 30,
      case_no: '',
      expanded: false,
      extras: {},
    });
    _renderBatchRows();
  }

  function _quickAddRows() {
    const n = Math.max(1, Math.min(20, Number(document.getElementById('bf-quick-n')?.value) || 3));
    const method = document.getElementById('bf-quick-method')?.value || 'C+G';
    const duration = Number(document.getElementById('bf-quick-dur')?.value) || 30;
    for (let i = 0; i < n; i++) _addBatchRow(method, duration);
  }

  function _removeBatchRow(id) {
    _batchRows = _batchRows.filter(r => r.id !== id);
    _renderBatchRows();
  }

  function _toggleBatchExtras(id) {
    const row = _batchRows.find(r => r.id === id);
    if (row) { row.expanded = !row.expanded; _renderBatchRows(); }
  }

  function _batchUpdateRow(id, field, value) {
    const row = _batchRows.find(r => r.id === id);
    if (row) { row[field] = value; _renderBatchRows(); }
  }

  function _batchUpdateExtra(id, key, value) {
    const row = _batchRows.find(r => r.id === id);
    if (row) { row.extras[key] = Number(value); _renderBatchRows(); }
  }

  function _batchRefreshAll() { _renderBatchRows(); }

  function _renderBatchRows() {
    const tbody = document.getElementById('batch-tbody');
    if (!tbody) return;

    const sharedBonus    = document.getElementById('bf-bonus')?.value || '無';
    const sharedHandover = Number(document.getElementById('bf-handover')?.value || 1);
    const sharedDate     = document.getElementById('bf-date')?.value || (_currentYM + '-01');
    const ym             = sharedDate.substring(0, 7);

    let totalPts = 0;
    const rows = _batchRows.map(row => {
      const tempCase = { method: row.method, duration: row.duration, bonus: sharedBonus, handover: sharedHandover, PCA_days: 0, ...row.extras };
      const pts = Calculator.calculateTotal(tempCase, _pointSettings);
      totalPts += pts;

      const hasExtras = Object.values(row.extras).some(v => Number(v) > 0);
      const extrasRowHtml = row.expanded ? `
        <tr style="background:var(--bg-base)">
          <td colspan="6" style="padding:8px 10px 10px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">附加項目</div>
            <div class="checkbox-grid" style="gap:5px 12px;grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">
              ${Calculator.EXTRAS_META.filter(e => e.type === 'check').map(e => `
                <label class="checkbox-item" style="font-size:11px">
                  <input type="checkbox" ${Number(row.extras[e.key]) > 0 ? 'checked' : ''}
                         onchange="Cases._batchUpdateExtra(${row.id},'${e.key}',this.checked?1:0)">
                  <span>${e.label}</span>
                </label>`).join('')}
            </div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
              <label style="font-size:11px;color:var(--text-secondary)">PCA加做天</label>
              <input class="form-input" type="number" min="0" style="width:58px;padding:3px 8px;font-size:12px"
                     value="${row.extras.PCA_days || 0}"
                     onchange="Cases._batchUpdateExtra(${row.id},'PCA_days',this.value)">
            </div>
          </td>
        </tr>` : '';

      return `
        <tr id="brow-${row.id}">
          <td>
            <select class="form-select" style="font-size:12px;width:100%"
                    onchange="Cases._batchUpdateRow(${row.id},'method',this.value)">
              ${Calculator.METHODS.map(m => `<option value="${m}" ${m === row.method ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </td>
          <td>
            <input class="form-input" type="number" min="0" style="font-size:12px;width:100%"
                   value="${row.duration}"
                   onchange="Cases._batchUpdateRow(${row.id},'duration',Number(this.value))">
          </td>
          <td>
            <input class="form-input" type="text" style="font-size:12px;width:100%" placeholder="選填"
                   value="${escHtml(row.case_no)}"
                   onchange="Cases._batchUpdateRow(${row.id},'case_no',this.value)">
          </td>
          <td style="text-align:center">
            <button class="btn btn-ghost btn-sm btn-icon" title="附加項目"
                    style="${hasExtras ? 'color:var(--accent)' : 'color:var(--text-muted)'}"
                    onclick="Cases._toggleBatchExtras(${row.id})">
              ${hasExtras
                ? `<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`
                : `<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>`}
            </button>
          </td>
          <td style="text-align:right;font-family:var(--font-mono);font-size:12px;color:var(--accent)">
            ${pts.toLocaleString('zh-TW',{maximumFractionDigits:1})}
          </td>
          <td style="text-align:center">
            <button class="btn btn-ghost btn-icon btn-sm" style="color:var(--red)" onclick="Cases._removeBatchRow(${row.id})">
              <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            </button>
          </td>
        </tr>
        ${extrasRowHtml}`;
    }).join('');

    tbody.innerHTML = rows || `
      <tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">
        尚無病例，請使用快速新增或手動新增一筆
      </td></tr>`;

    const summary = document.getElementById('batch-summary');
    if (summary) {
      summary.innerHTML = _batchRows.length > 0
        ? `共 <strong style="color:var(--text-primary)">${_batchRows.length}</strong> 筆 &nbsp;·&nbsp; 合計 <strong style="color:var(--accent)">${totalPts.toLocaleString('zh-TW',{maximumFractionDigits:1})}</strong> 點`
        : '';
    }
  }

  async function saveBatch() {
    if (_batchRows.length === 0) { showToast('請至少新增一筆病例', 'warning'); return; }

    const date     = document.getElementById('bf-date')?.value || '';
    const asa      = document.getElementById('bf-asa')?.value || '2';
    const bonus    = document.getElementById('bf-bonus')?.value || '無';
    const handover = Number(document.getElementById('bf-handover')?.value || 1);

    if (!date) { showToast('請填寫日期', 'warning'); return; }
    const targetYM = date.substring(0, 7);

    const newCases = _batchRows.map(row => {
      const caseData = {
        id: GitHubDB.generateId(),
        date,
        case_no:   row.case_no || '',
        diagnosis: '',
        asa,
        bonus,
        method:    row.method,
        handover,
        duration:  row.duration,
        notes:     '',
        PCA_days:  row.extras.PCA_days || 0,
        ...Object.fromEntries(
          Calculator.EXTRAS_META.filter(e => e.type === 'check').map(e => [e.key, Number(row.extras[e.key] || 0)])
        ),
      };
      const settings = Calculator.getApplicableSettings(targetYM, _pointSettings);
      caseData.base_points = settings ? Calculator.calculateBasePerformance(caseData.method, caseData.duration, settings) : 0;
      caseData.total_performance = Calculator.calculateTotal(caseData, _pointSettings);
      return caseData;
    });

    try {
      showToast('儲存中...', 'info');
      const existing = await db.getCases(targetYM);
      await db.saveCases(targetYM, [...existing, ...newCases]);
      closeModal('batch-modal');
      showToast(`已新增 ${newCases.length} 筆病例`, 'success');
      _currentYM = AppState.selectedMonth;
      await loadCases();
    } catch (err) {
      showToast('儲存失敗: ' + err.message, 'error');
    }
  }

  // ========================
  // BARCODE SCANNER
  // ========================
  function openScannerModal() {
    const html = `
      <p class="text-muted text-sm mb-4">請將條碼對準攝影機</p>
      <div id="reader"></div>
      <p class="text-muted text-sm mt-4" id="scan-status">等待掃描...</p>
    `;
    showModal('scanner-modal', '掃描條碼', html, [
      { label: '關閉', cls: 'btn-outline', action: 'close-scanner' }
    ]);

    setTimeout(() => {
      if (typeof Html5Qrcode !== 'undefined') {
        _scanner = new Html5Qrcode('reader');
        _scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            document.getElementById('f-case-no').value = decodedText;
            document.getElementById('scan-status').textContent = '已掃描: ' + decodedText;
            stopScanner();
            closeModal('scanner-modal');
          },
          () => {}
        ).catch(err => {
          document.getElementById('scan-status').textContent = '無法啟動攝影機: ' + err;
        });
      } else {
        document.getElementById('scan-status').textContent = 'html5-qrcode 未載入';
      }
    }, 300);
  }

  function stopScanner() {
    if (_scanner) {
      _scanner.stop().catch(() => {});
      _scanner = null;
    }
  }

  // ========================
  // CSV IMPORT
  // ========================
  function openImportModal() {
    const html = `
      <p class="text-muted text-sm mb-4">CSV 欄位順序：日期,病例號,診斷/術式,ASA,加成,麻醉方式,時間(min),交接班,GVL_AWS_MAC,Rusch_Video,OMT,A_line,CVC,PAC,TEE,CO,Optiflow,BIS_self,BIS_NHI_adult,BIS_NHI_child,blanket,IVPCA,NBPCA,PCEA,PCA_days,IV_sedation,ultrasound,ByBIS,備註</p>
      <div class="form-group">
        <label class="form-label">選擇 CSV 檔案</label>
        <input class="form-input" type="file" id="csv-file" accept=".csv">
      </div>
      <div id="csv-preview" class="mt-4"></div>
    `;
    showModal('import-modal', '匯入 CSV', html, [
      { label: '取消', cls: 'btn-outline', action: 'close' },
      { label: '匯入', cls: 'btn-primary', action: 'do-import' },
    ]);

    document.getElementById('csv-file').addEventListener('change', previewCSV);
  }

  let _csvParsed = [];

  function previewCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (results) => {
        const rows = results.data.filter(r => r.length > 2 && r[0]);
        _csvParsed = rows;
        const preview = document.getElementById('csv-preview');
        preview.innerHTML = `<p class="text-sm" style="color:var(--success)">解析到 ${rows.length} 筆資料，確認後點擊匯入。</p>`;
      },
      skipEmptyLines: true,
    });
  }

  async function doImport() {
    if (_csvParsed.length === 0) { showToast('請先選擇 CSV 檔案', 'warning'); return; }

    const byMonth = {};
    for (const row of _csvParsed) {
      const date = String(row[0] || '').trim();
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
      const ym = date.substring(0, 7);

      const caseData = {
        id: GitHubDB.generateId(),
        date,
        case_no:   String(row[1] || '').trim(),
        diagnosis: String(row[2] || '').trim(),
        asa:       String(row[3] || '2').trim(),
        bonus:     String(row[4] || '無').trim(),
        method:    String(row[5] || 'GE').trim(),
        duration:  Number(row[6]) || 0,
        handover:  Number(row[7]) || 1,
        GVL_AWS_MAC:   Number(row[8])  || 0,
        Rusch_Video:   Number(row[9])  || 0,
        OMT:           Number(row[10]) || 0,
        A_line:        Number(row[11]) || 0,
        CVC:           Number(row[12]) || 0,
        PAC:           Number(row[13]) || 0,
        TEE:           Number(row[14]) || 0,
        CO:            Number(row[15]) || 0,
        Optiflow:      Number(row[16]) || 0,
        BIS_self:      Number(row[17]) || 0,
        BIS_NHI_adult: Number(row[18]) || 0,
        BIS_NHI_child: Number(row[19]) || 0,
        blanket:       Number(row[20]) || 0,
        IVPCA:         Number(row[21]) || 0,
        NBPCA:         Number(row[22]) || 0,
        PCEA:          Number(row[23]) || 0,
        PCA_days:      Number(row[24]) || 0,
        IV_sedation:   Number(row[25]) || 0,
        ultrasound:    Number(row[26]) || 0,
        ByBIS:         Number(row[27]) || 0,
        notes:         String(row[28] || '').trim(),
      };

      const settings = Calculator.getApplicableSettings(ym, _pointSettings);
      caseData.base_points = settings ? Calculator.calculateBasePerformance(caseData.method, caseData.duration, settings) : 0;
      caseData.total_performance = Calculator.calculateTotal(caseData, _pointSettings);

      if (!byMonth[ym]) byMonth[ym] = [];
      byMonth[ym].push(caseData);
    }

    try {
      showToast('匯入中...', 'info');
      for (const [ym, newCases] of Object.entries(byMonth)) {
        const existing = await db.getCases(ym);
        await db.saveCases(ym, [...existing, ...newCases]);
      }
      closeModal('import-modal');
      showToast(`已匯入 ${_csvParsed.length} 筆`, 'success');
      await loadCases();
    } catch (err) {
      showToast('匯入失敗: ' + err.message, 'error');
    }
  }

  return {
    initList,
    openAddEditModal,
    deleteCase,
    goPage,
    saveCase,
    doImport,
    stopScanner,
    // Batch add
    openBatchModal,
    saveBatch,
    _addBatchRow,
    _quickAddRows,
    _removeBatchRow,
    _toggleBatchExtras,
    _batchUpdateRow,
    _batchUpdateExtra,
    _batchRefreshAll,
  };
})();
