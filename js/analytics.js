/**
 * analytics.js
 * Analytics page with multiple charts.
 */

const Analytics = (() => {
  let charts = {};

  async function init() {
    document.getElementById('content').innerHTML = `
      <div class="page-header flex items-center justify-between">
        <div>
          <h2 class="page-title">統計分析</h2>
          <p class="page-subtitle">近12個月資料分析</p>
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

    const colors = ['#3FB950','#388BFD','#D29922','#A371F7','#39D353','#F778BA','#E3B341','#DA3633','#58A6FF','#BC8CFF','#2EA043','#1F6FEB','#BB8009'];

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
        plugins: {
          legend: { position: 'top', labels: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E', padding: 6 } }
        },
        scales: {
          x: { stacked: true, grid: { color: '#30363D' }, ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } },
          y: { stacked: true, grid: { color: '#30363D' }, ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } }
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
          { label: '健保', data: nhiData, backgroundColor: 'rgba(56,139,253,0.7)', stack: 'perf' },
          { label: '自費', data: spData,  backgroundColor: 'rgba(63,185,80,0.7)',  stack: 'perf' },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } }
        },
        scales: {
          x: { stacked: true, grid: { color: '#30363D' }, ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } },
          y: { stacked: true, grid: { color: '#30363D' }, ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } }
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
          backgroundColor: 'rgba(56,139,253,0.35)',
          borderColor: '#388BFD',
          borderWidth: 1,
          borderRadius: 3,
          hoverBackgroundColor: 'rgba(56,139,253,0.6)',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#30363D' }, ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } },
          y: { grid: { color: 'transparent' }, ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } }
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
    const colors = ['#3FB950','#388BFD','#D29922','#A371F7','#F778BA'];

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
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } }
        },
        scales: {
          x: { grid: { color: '#30363D' }, ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } },
          y: { grid: { color: '#30363D' }, ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E' } }
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
