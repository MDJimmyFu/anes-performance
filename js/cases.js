/**
 * cases.js
 * Case list page and add/edit case page.
 */

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
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 style="font-size:20px;font-weight:700">病例列表</h2>
          <p class="text-muted text-sm mt-2" id="cases-subtitle">載入中...</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" id="btn-import-csv">
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/></svg>
            匯入CSV
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
          <td>${c.date || ''}</td>
          <td style="font-family:monospace;font-size:12px">${c.case_no || ''}</td>
          <td class="truncate" style="max-width:180px" title="${c.diagnosis || ''}">${c.diagnosis || ''}</td>
          <td><span class="badge badge-blue">${c.asa || ''}</span></td>
          <td><span class="badge badge-gray">${c.bonus || '無'}</span></td>
          <td><span class="badge badge-purple">${c.method || ''}</span></td>
          <td class="text-right">${c.duration || 0}</td>
          <td class="text-right font-bold text-primary-color">${pts.toLocaleString('zh-TW', {maximumFractionDigits:2})}</td>
          <td class="text-right">${c.handover ?? 1}</td>
          <td><div class="extras-tags">${extras}</div></td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-icon btn-sm" onclick="Cases.openAddEditModal('${c.id}')" title="編輯">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon btn-sm" style="color:var(--danger)" onclick="Cases.deleteCase('${c.id}')" title="刪除">
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
          <label class="form-label">病例號<span class="required">*</span></label>
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
            <span>${e.label}${e.selfPay ? ' <span style="color:var(--danger);font-size:9px">自費</span>' : ''}</span>
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
    if (!caseData.case_no) { showToast('請填寫病例號', 'warning'); return; }

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
  };
})();
