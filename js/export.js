/**
 * export.js
 * Export page — generate CSV or JSON downloads.
 */

const Export = (() => {

  async function init() {
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const today    = now.toISOString().substring(0, 10);

    document.getElementById('content').innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 style="font-size:20px;font-weight:700">資料匯出</h2>
          <p class="text-muted text-sm mt-2">選擇匯出範圍與格式</p>
        </div>
      </div>

      <div class="card mb-6">
        <div class="card-header"><span class="card-title">匯出設定</span></div>

        <div class="form-row form-row-2 mb-4">
          <div class="form-group">
            <label class="form-label">起始日期</label>
            <input class="form-input" type="date" id="exp-from" value="${firstDay}">
          </div>
          <div class="form-group">
            <label class="form-label">結束日期</label>
            <input class="form-input" type="date" id="exp-to" value="${today}">
          </div>
        </div>

        <div class="form-row form-row-2 mb-4">
          <div class="form-group">
            <label class="form-label">匯出格式</label>
            <select class="form-select" id="exp-format">
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">匯出類型</label>
            <select class="form-select" id="exp-type">
              <option value="cases">病例資料</option>
              <option value="monthly">月份摘要</option>
              <option value="analytics">統計摘要</option>
            </select>
          </div>
        </div>

        <div class="flex gap-2">
          <button class="btn btn-primary" id="btn-export">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            產生並下載
          </button>
          <button class="btn btn-outline" id="btn-preview">預覽</button>
        </div>
      </div>

      <div class="card" id="export-preview" style="display:none">
        <div class="card-header">
          <span class="card-title">預覽</span>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('export-preview').style.display='none'">關閉</button>
        </div>
        <div id="preview-content" style="overflow-x:auto;max-height:400px"></div>
      </div>
    `;

    document.getElementById('btn-export').addEventListener('click', doExport);
    document.getElementById('btn-preview').addEventListener('click', previewExport);
  }

  async function collectCases(from, to) {
    const fromYM = from.substring(0, 7);
    const toYM   = to.substring(0, 7);
    const months = GitHubDB.generateMonthRange(fromYM, toYM);
    const allData = await db.getAllCases(months);

    const cases = [];
    for (const ym of months) {
      for (const c of (allData[ym] || [])) {
        if (c.date >= from && c.date <= to) cases.push(c);
      }
    }
    return cases;
  }

  async function doExport() {
    const from   = document.getElementById('exp-from').value;
    const to     = document.getElementById('exp-to').value;
    const format = document.getElementById('exp-format').value;
    const type   = document.getElementById('exp-type').value;

    if (!from || !to) { showToast('請選擇日期範圍', 'warning'); return; }
    if (from > to)    { showToast('起始日期不能大於結束日期', 'warning'); return; }

    showToast('準備匯出...', 'info');

    try {
      const pointSettings = await db.getPointSettings();
      const cases = await collectCases(from, to);

      let content = '';
      let filename = '';

      if (type === 'cases') {
        if (format === 'csv') {
          content = buildCasesCsv(cases, pointSettings);
          filename = `cases_${from}_to_${to}.csv`;
        } else {
          content = JSON.stringify(cases, null, 2);
          filename = `cases_${from}_to_${to}.json`;
        }
      } else if (type === 'monthly') {
        const summary = buildMonthlySummary(cases, pointSettings);
        if (format === 'csv') {
          content = buildSummaryCsv(summary);
          filename = `monthly_summary_${from}_to_${to}.csv`;
        } else {
          content = JSON.stringify(summary, null, 2);
          filename = `monthly_summary_${from}_to_${to}.json`;
        }
      } else {
        const analytics = buildAnalyticsSummary(cases, pointSettings);
        if (format === 'csv') {
          content = buildAnalyticsCsv(analytics);
          filename = `analytics_${from}_to_${to}.csv`;
        } else {
          content = JSON.stringify(analytics, null, 2);
          filename = `analytics_${from}_to_${to}.json`;
        }
      }

      downloadFile(content, filename, format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json');
      showToast(`已下載 ${filename}`, 'success');
    } catch (err) {
      showToast('匯出失敗: ' + err.message, 'error');
    }
  }

  async function previewExport() {
    const from   = document.getElementById('exp-from').value;
    const to     = document.getElementById('exp-to').value;
    const type   = document.getElementById('exp-type').value;

    if (!from || !to) { showToast('請選擇日期範圍', 'warning'); return; }

    try {
      const pointSettings = await db.getPointSettings();
      const cases = await collectCases(from, to);

      let html = '';
      if (type === 'cases') {
        const rows = cases.slice(0, 20).map(c => {
          const pts = Calculator.calculateTotal(c, pointSettings);
          return `<tr>
            <td>${c.date}</td><td>${c.case_no}</td>
            <td>${c.diagnosis || ''}</td><td>${c.method}</td>
            <td>${c.duration}</td><td class="text-right">${pts.toFixed(2)}</td>
          </tr>`;
        }).join('');
        html = `<table><thead><tr><th>日期</th><th>病例號</th><th>術式</th><th>方式</th><th>時間</th><th>點數</th></tr></thead><tbody>${rows}</tbody></table>`;
        if (cases.length > 20) html += `<p class="text-muted text-sm" style="padding:8px">顯示前 20 筆，共 ${cases.length} 筆</p>`;
      } else if (type === 'monthly') {
        const summary = buildMonthlySummary(cases, pointSettings);
        const rows = summary.map(m => `<tr>
          <td>${m.yearMonth}</td><td class="text-right">${m.count}</td>
          <td class="text-right">${m.totalPoints.toFixed(0)}</td>
          <td class="text-right">${m.selfPayPoints.toFixed(0)}</td>
          <td class="text-right">${m.avgPerCase.toFixed(0)}</td>
        </tr>`).join('');
        html = `<table><thead><tr><th>月份</th><th>刀量</th><th>總點數</th><th>自費</th><th>均刀</th></tr></thead><tbody>${rows}</tbody></table>`;
      }

      document.getElementById('export-preview').style.display = '';
      document.getElementById('preview-content').innerHTML = html || '<p class="text-muted" style="padding:16px">無資料</p>';
    } catch (err) {
      showToast('預覽失敗: ' + err.message, 'error');
    }
  }

  function buildCasesCsv(cases, pointSettings) {
    const header = ['日期','病例號','診斷/術式','ASA','加成','麻醉方式','時間(min)','交接班','績效點數','自費點數',
      'GVL_AWS_MAC','Rusch_Video','OMT','A_line','CVC','PAC','TEE','CO','Optiflow',
      'BIS_self','BIS_NHI_adult','BIS_NHI_child','blanket','IVPCA','NBPCA','PCEA','PCA_days',
      'IV_sedation','ultrasound','ByBIS','備註'];
    const rows = cases.map(c => {
      const pts = Calculator.calculateTotal(c, pointSettings);
      const sp  = Calculator.calculateSelfPayTotal(c, pointSettings);
      return [c.date, c.case_no, c.diagnosis, c.asa, c.bonus, c.method, c.duration, c.handover, pts.toFixed(2), sp.toFixed(2),
        c.GVL_AWS_MAC, c.Rusch_Video, c.OMT, c.A_line, c.CVC, c.PAC, c.TEE, c.CO, c.Optiflow,
        c.BIS_self, c.BIS_NHI_adult, c.BIS_NHI_child, c.blanket, c.IVPCA, c.NBPCA, c.PCEA, c.PCA_days,
        c.IV_sedation, c.ultrasound, c.ByBIS, `"${(c.notes || '').replace(/"/g, '""')}"`
      ].join(',');
    });
    return '\uFEFF' + [header.join(','), ...rows].join('\n');
  }

  function buildMonthlySummary(cases, pointSettings) {
    const byMonth = {};
    for (const c of cases) {
      const ym = (c.date || '').substring(0, 7);
      if (!byMonth[ym]) byMonth[ym] = [];
      byMonth[ym].push(c);
    }
    return Object.keys(byMonth).sort().map(ym => {
      const mCases = byMonth[ym];
      const totalPoints = mCases.reduce((s, c) => s + Calculator.calculateTotal(c, pointSettings), 0);
      const selfPayPoints = mCases.reduce((s, c) => s + Calculator.calculateSelfPayTotal(c, pointSettings), 0);
      const dates = new Set(mCases.map(c => c.date));
      return {
        yearMonth: ym,
        count: mCases.length,
        totalPoints,
        selfPayPoints,
        workDays: dates.size,
        avgPerCase: mCases.length > 0 ? totalPoints / mCases.length : 0,
        avgPerDay: dates.size > 0 ? totalPoints / dates.size : 0,
      };
    });
  }

  function buildSummaryCsv(summary) {
    const header = ['月份','刀量','總績效點數','自費點數','工作天數','均刀點數','均日點數'];
    const rows = summary.map(m =>
      [m.yearMonth, m.count, m.totalPoints.toFixed(2), m.selfPayPoints.toFixed(2),
       m.workDays, m.avgPerCase.toFixed(2), m.avgPerDay.toFixed(2)].join(',')
    );
    return '\uFEFF' + [header.join(','), ...rows].join('\n');
  }

  function buildAnalyticsSummary(cases, pointSettings) {
    const methodCounts = {};
    const extrasCounts = {};
    let totalPts = 0, totalSP = 0;

    for (const c of cases) {
      methodCounts[c.method] = (methodCounts[c.method] || 0) + 1;
      totalPts += Calculator.calculateTotal(c, pointSettings);
      totalSP  += Calculator.calculateSelfPayTotal(c, pointSettings);
      for (const e of Calculator.EXTRAS_META) {
        if (Number(c[e.key]) > 0) extrasCounts[e.key] = (extrasCounts[e.key] || 0) + 1;
      }
    }

    return {
      totalCases: cases.length,
      totalPoints: totalPts,
      totalSelfPay: totalSP,
      methodDistribution: methodCounts,
      extrasUsage: extrasCounts,
    };
  }

  function buildAnalyticsCsv(a) {
    const lines = [
      '\uFEFF統計摘要',
      `總刀量,${a.totalCases}`,
      `總績效,${a.totalPoints.toFixed(2)}`,
      `自費績效,${a.totalSelfPay.toFixed(2)}`,
      '',
      '麻醉方式,刀數',
      ...Object.entries(a.methodDistribution).map(([k,v]) => `${k},${v}`),
      '',
      '附加項目,使用次數',
      ...Object.entries(a.extrasUsage).map(([k,v]) => {
        const meta = Calculator.EXTRAS_META.find(e => e.key === k);
        return `${meta ? meta.label : k},${v}`;
      }),
    ];
    return lines.join('\n');
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init };
})();
