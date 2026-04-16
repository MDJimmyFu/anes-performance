/**
 * analytics.js
 * Analytics page with multiple charts.
 */

const Analytics = (() => {
  let charts = {};

  async function init() {
    document.getElementById('content').innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 style="font-size:20px;font-weight:700">統計分析</h2>
          <p class="text-muted text-sm mt-2">近12個月資料分析</p>
        </div>
        <div class="flex gap-2">
          <select class="form-select" id="analytics-months" style="width:120px">
            <option value="12">近12個月</option>
            <option value="6">近6個月</option>
            <option value="24">近24個月</option>
          </select>
        </div>
      </div>

      <div class="chart-grid mb-6">
        <div class="card">
          <div class="card-header"><span class="card-title">麻醉方式分布趨勢 (月別)</span></div>
          <div class="chart-container"><canvas id="methodTrendChart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">自費 vs 健保 績效比例</span></div>
          <div class="chart-container"><canvas id="selfPayChart"></canvas></div>
        </div>
      </div>

      <div class="chart-grid mb-6">
        <div class="card">
          <div class="card-header"><span class="card-title">附加項目使用頻率</span></div>
          <div class="chart-container"><canvas id="extrasChart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">年同期績效比較</span></div>
          <div class="chart-container"><canvas id="yoyChart"></canvas></div>
        </div>
      </div>

      <div class="card mb-6">
        <div class="card-header"><span class="card-title">點數設定沿革</span></div>
        <div class="timeline" id="settings-timeline"></div>
      </div>
    `;

    document.getElementById('analytics-months').addEventListener('change', loadAndRender);
    await loadAndRender();
  }

  async function loadAndRender() {
    const nMonths = Number(document.getElementById('analytics-months')?.value || 12);
    try {
      const pointSettings = await db.getPointSettings();
      const now = new Date();
      const months = [];
      for (let i = nMonths - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
      }
      const allData = await db.getAllCases(months);
      renderMethodTrend(allData, months, pointSettings);
      renderSelfPayChart(allData, months, pointSettings);
      renderExtrasChart(allData, months, pointSettings);
      renderYoYChart(allData, months, pointSettings);
      renderTimeline(pointSettings);
    } catch (err) {
      showToast('統計分析載入失敗: ' + err.message, 'error');
    }
  }

  function destroyChart(key) {
    if (charts[key]) { charts[key].destroy(); delete charts[key]; }
  }

  function renderMethodTrend(allData, months, pointSettings) {
    destroyChart('methodTrend');
    const canvas = document.getElementById('methodTrendChart');
    if (!canvas) return;

    // Collect all methods present
    const methodsSet = new Set();
    for (const ym of months) {
      for (const c of (allData[ym] || [])) methodsSet.add(c.method);
    }
    const methods = [...methodsSet].sort();

    const colors = ['#1D4ED8','#15803D','#B45309','#DC2626','#7C3AED','#0891B2','#BE185D','#D97706','#059669','#6D28D9','#2563EB','#16A34A','#CA8A04'];

    const datasets = methods.map((m, i) => ({
      label: m,
      data: months.map(ym => (allData[ym] || []).filter(c => c.method === m).length),
      backgroundColor: colors[i % colors.length],
    }));

    const labels = months.map(ym => {
      const [y, mo] = ym.split('-');
      return `${y.slice(2)}/${mo}`;
    });

    charts.methodTrend = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 10 }, padding: 6 } } },
        scales: {
          x: { stacked: true, ticks: { font: { size: 10 } } },
          y: { stacked: true, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  function renderSelfPayChart(allData, months, pointSettings) {
    destroyChart('selfPay');
    const canvas = document.getElementById('selfPayChart');
    if (!canvas) return;

    const labels = months.map(ym => {
      const [y, mo] = ym.split('-');
      return `${y.slice(2)}/${mo}`;
    });

    const nhiData = [], spData = [];
    for (const ym of months) {
      let nhi = 0, sp = 0;
      for (const c of (allData[ym] || [])) {
        const total = Calculator.calculateTotal(c, pointSettings);
        const selfPay = Calculator.calculateSelfPayTotal(c, pointSettings);
        sp += selfPay;
        nhi += (total - selfPay);
      }
      nhiData.push(Math.round(nhi));
      spData.push(Math.round(sp));
    }

    charts.selfPay = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '健保', data: nhiData, backgroundColor: '#1D4ED8', stack: 'perf' },
          { label: '自費', data: spData,  backgroundColor: '#15803D', stack: 'perf' },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          x: { stacked: true, ticks: { font: { size: 10 } } },
          y: { stacked: true, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  function renderExtrasChart(allData, months, pointSettings) {
    destroyChart('extras');
    const canvas = document.getElementById('extrasChart');
    if (!canvas) return;

    const counts = {};
    const labels = [];
    const extraKeys = Calculator.EXTRAS_META.map(e => e.key);

    for (const ym of months) {
      for (const c of (allData[ym] || [])) {
        for (const key of extraKeys) {
          if (Number(c[key]) > 0) counts[key] = (counts[key] || 0) + 1;
        }
      }
    }

    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 15);
    const chartLabels = sorted.map(([k]) => {
      const meta = Calculator.EXTRAS_META.find(e => e.key === k);
      return meta ? meta.label : k;
    });
    const chartData = sorted.map(([,v]) => v);

    charts.extras = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [{
          label: '使用次數',
          data: chartData,
          backgroundColor: 'rgba(29,78,216,0.7)',
          borderColor: '#1D4ED8',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 10 } } },
          y: { ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  function renderYoYChart(allData, months, pointSettings) {
    destroyChart('yoy');
    const canvas = document.getElementById('yoyChart');
    if (!canvas) return;

    // Group by year
    const byYear = {};
    for (const ym of months) {
      const [y, mo] = ym.split('-');
      if (!byYear[y]) byYear[y] = {};
      const total = (allData[ym] || []).reduce((s, c) => s + Calculator.calculateTotal(c, pointSettings), 0);
      byYear[y][mo] = total;
    }

    const moLabels = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const moDisplay = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const years = Object.keys(byYear).sort();
    const colors = ['#1D4ED8','#DC2626','#15803D','#B45309','#7C3AED'];

    const datasets = years.map((y, i) => ({
      label: y + '年',
      data: moLabels.map(mo => byYear[y][mo] ?? null),
      borderColor: colors[i % colors.length],
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 4,
      spanGaps: true,
    }));

    charts.yoy = new Chart(canvas, {
      type: 'line',
      data: { labels: moDisplay, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          x: { ticks: { font: { size: 10 } } },
          y: { ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  function renderTimeline(pointSettings) {
    const el = document.getElementById('settings-timeline');
    if (!el) return;
    const sorted = [...pointSettings].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
    el.innerHTML = sorted.map(p => `
      <div class="timeline-item">
        <div class="timeline-date">${p.effective_from} ~ ${p.effective_to || '現在'}</div>
        <div class="timeline-content">
          <strong>${p.label}</strong>
          <span style="font-size:11px;color:var(--text-muted);margin-left:8px">
            GE基礎=${p.methods?.GE?.base} | 溫毯=${p.extras?.blanket} | NBPCA=${p.extras?.NBPCA}
          </span>
        </div>
      </div>`).join('');
  }

  return { init };
})();
