/**
 * point-settings.js
 * Point settings page — view, add, edit periods.
 */

const PointSettings = (() => {
  let _settings = [];
  let _editingId = null;

  async function init() {
    document.getElementById('content').innerHTML = `
      <div class="page-header flex items-center justify-between">
        <div>
          <h2 class="page-title">點數設定</h2>
          <p class="page-subtitle">管理各期間的績效點數設定</p>
        </div>
        <button class="btn btn-primary" id="btn-add-period">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          新增期間
        </button>
      </div>
      <div id="periods-list"></div>
    `;

    document.getElementById('btn-add-period').addEventListener('click', () => openEditModal(null));
    await loadSettings();
  }

  async function loadSettings() {
    try {
      _settings = await db.getPointSettings();
      renderList();
    } catch (err) {
      showToast('載入點數設定失敗: ' + err.message, 'error');
    }
  }

  function renderList() {
    const container = document.getElementById('periods-list');
    if (!container) return;

    const sorted = [..._settings].sort((a, b) => b.effective_from.localeCompare(a.effective_from));

    container.innerHTML = sorted.map(p => `
      <div class="card mb-4">
        <div class="card-header">
          <div>
            <span class="card-title">${p.label}</span>
            <span class="badge badge-blue" style="margin-left:8px">${p.effective_from} ~ ${p.effective_to || '現在'}</span>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-outline btn-sm" onclick="PointSettings.openEditModal('${p.id}')">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
              編輯
            </button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div class="section-title">麻醉方式基礎點數</div>
            <table style="font-size:12px;width:100%">
              <thead><tr><th>方式</th><th class="text-right">基礎</th><th class="text-right">加班(≤4h)/30min</th><th class="text-right">加班(>4h)/30min</th></tr></thead>
              <tbody>
                ${Object.entries(p.methods || {}).map(([method, m]) => `
                  <tr>
                    <td><span class="badge badge-purple">${method}</span></td>
                    <td class="text-right">${m.base}</td>
                    <td class="text-right">${m.overtime ? m.ot24 : '—'}</td>
                    <td class="text-right">${m.overtime ? m.ot4plus : '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div>
            <div class="section-title">附加項目點數</div>
            <table style="font-size:12px;width:100%">
              <thead><tr><th>項目</th><th class="text-right">點數</th></tr></thead>
              <tbody>
                ${Object.entries(p.extras || {}).map(([k, v]) => {
                  const meta = Calculator.EXTRAS_META.find(e => e.key === k);
                  return `<tr><td>${meta ? meta.label : k}</td><td class="text-right">${v}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `).join('');
  }

  function openEditModal(id) {
    _editingId = id;
    const existing = id ? _settings.find(p => p.id === id) : null;
    // Copy from latest if adding new
    const latest = [..._settings].sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
    const base = existing || (latest ? JSON.parse(JSON.stringify(latest)) : getDefaultSettings());
    if (!existing) base.id = id || `${Date.now()}`;

    const html = buildEditFormHtml(base, !!existing);
    showModal('ps-modal', existing ? '編輯點數設定' : '新增點數設定', html, [
      { label: '取消', cls: 'btn-outline', action: 'close' },
      { label: '儲存', cls: 'btn-primary', action: 'save-ps' },
    ], 'modal-xl');

    if (existing || latest) populateEditForm(base);
  }

  function buildEditFormHtml(base) {
    const methods = ['GE','GM','IV','EA','SA','Painless','Painless夜間','傳染GE','困難氣道GE','HMC','C/G','C+G','ERCP','EUS'];
    return `
      <div class="form-row form-row-3 mb-4">
        <div class="form-group">
          <label class="form-label">標籤 (ID)</label>
          <input class="form-input" id="ps-id" placeholder="e.g. 202509">
        </div>
        <div class="form-group">
          <label class="form-label">生效起始 (YYYY-MM)</label>
          <input class="form-input" id="ps-from" placeholder="2025-09">
        </div>
        <div class="form-group">
          <label class="form-label">生效結束 (YYYY-MM，留空=現在)</label>
          <input class="form-input" id="ps-to" placeholder="">
        </div>
      </div>

      <div class="section-title">麻醉方式</div>
      <div class="table-wrap mb-4" style="max-height:260px;overflow-y:auto">
        <table>
          <thead><tr><th>方式</th><th>基礎點數</th><th>加班(≤4h)/30min</th><th>加班(>4h)/30min</th><th>有加班</th></tr></thead>
          <tbody>
            ${methods.map(m => `
              <tr>
                <td><span class="badge badge-purple">${m}</span></td>
                <td><input class="form-input" style="width:100px" id="ps-m-${m.replace(/\//g,'_').replace(/\+/g,'P')}-base" type="number" step="0.001"></td>
                <td><input class="form-input" style="width:100px" id="ps-m-${m.replace(/\//g,'_').replace(/\+/g,'P')}-ot24" type="number" step="0.001"></td>
                <td><input class="form-input" style="width:100px" id="ps-m-${m.replace(/\//g,'_').replace(/\+/g,'P')}-ot4p" type="number" step="0.001"></td>
                <td><input type="checkbox" id="ps-m-${m.replace(/\//g,'_').replace(/\+/g,'P')}-ot" style="width:16px;height:16px"></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="section-title">附加項目</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
        ${Calculator.EXTRAS_META.map(e => `
          <div class="flex items-center gap-2">
            <label style="font-size:12px;width:100px;flex-shrink:0">${e.label}</label>
            <input class="form-input" id="ps-ex-${e.key}" type="number" step="0.001" style="flex:1">
          </div>`).join('')}
      </div>
    `;
  }

  function populateEditForm(p) {
    const methods = ['GE','GM','IV','EA','SA','Painless','Painless夜間','傳染GE','困難氣道GE','HMC','C/G','C+G','ERCP','EUS'];
    setVal('ps-id', p.label || p.id || '');
    setVal('ps-from', p.effective_from || '');
    setVal('ps-to', p.effective_to || '');

    for (const m of methods) {
      const key = m.replace(/\//g,'_').replace(/\+/g,'P');
      const data = p.methods?.[m] || {};
      setVal(`ps-m-${key}-base`, data.base ?? '');
      setVal(`ps-m-${key}-ot24`, data.ot24 ?? '');
      setVal(`ps-m-${key}-ot4p`, data.ot4plus ?? '');
      const el = document.getElementById(`ps-m-${key}-ot`);
      if (el) el.checked = !!data.overtime;
    }

    for (const e of Calculator.EXTRAS_META) {
      setVal(`ps-ex-${e.key}`, p.extras?.[e.key] ?? '');
    }
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function collectFormData() {
    const methods = ['GE','GM','IV','EA','SA','Painless','Painless夜間','傳染GE','困難氣道GE','HMC','C/G','C+G','ERCP','EUS'];
    const id = document.getElementById('ps-id')?.value?.trim();
    const from = document.getElementById('ps-from')?.value?.trim();
    const to   = document.getElementById('ps-to')?.value?.trim() || null;

    const methodsObj = {};
    for (const m of methods) {
      const key = m.replace(/\//g,'_').replace(/\+/g,'P');
      methodsObj[m] = {
        base:    Number(document.getElementById(`ps-m-${key}-base`)?.value || 0),
        ot24:    Number(document.getElementById(`ps-m-${key}-ot24`)?.value || 0),
        ot4plus: Number(document.getElementById(`ps-m-${key}-ot4p`)?.value || 0),
        overtime: !!document.getElementById(`ps-m-${key}-ot`)?.checked,
      };
    }

    const extrasObj = {};
    for (const e of Calculator.EXTRAS_META) {
      extrasObj[e.key] = Number(document.getElementById(`ps-ex-${e.key}`)?.value || 0);
    }

    const bonusMultipliers = {
      '無':1.0,'心臟手術':1.2,'腦部手術':1.2,'休克':1.2,'急診':1.2,
      '器官移植':2.0,'<6mo':2.0,'6mo-2yo':1.8,'2yo-7yo':1.6,'自費麻醉':1.3,'醫美':1.5
    };

    return { id, label: id, effective_from: from, effective_to: to, methods: methodsObj, extras: extrasObj, bonus_multipliers: bonusMultipliers };
  }

  async function savePeriod() {
    const data = collectFormData();
    if (!data.id) { showToast('請填寫標籤', 'warning'); return; }
    if (!data.effective_from) { showToast('請填寫生效起始', 'warning'); return; }

    try {
      if (_editingId) {
        const idx = _settings.findIndex(p => p.id === _editingId);
        if (idx >= 0) _settings[idx] = { ..._settings[idx], ...data };
        else _settings.push(data);
      } else {
        _settings.push(data);
      }
      await db.savePointSettings(_settings);
      closeModal('ps-modal');
      showToast('點數設定已儲存', 'success');
      renderList();
    } catch (err) {
      showToast('儲存失敗: ' + err.message, 'error');
    }
  }

  function getDefaultSettings() {
    return {
      id: '', label: '', effective_from: '', effective_to: null,
      methods: {
        GE: { base: 1801.82, ot24: 411.7, ot4plus: 514.74, overtime: true },
      },
      extras: {},
      bonus_multipliers: { '無': 1.0 },
    };
  }

  return { init, openEditModal, savePeriod };
})();
