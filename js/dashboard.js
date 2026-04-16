/**
 * dashboard.js
 * Dashboard page: KPI cards + charts
 */

const Dashboard = (() => {
  let trendChart = null;
  let methodChart = null;
  let dailyChart = null;

  async function init() {
    renderSkeleton();
    try {
      const pointSettings = await db.getPointSettings();
      const currentYM = AppState.selectedMonth;

      // Load current month
      const cases = await db.getCases(currentYM);

      // Load last 12 months for trend
      const now = new Date();
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
      }
      const allData = await db.getAllCases(months);

      renderKPIs(cases, currentYM, pointSettings);
      renderTrendChart(allData, months, pointSettings);
      renderMethodChart(cases, currentYM, pointSettings);
      renderDailyChart(cases, currentYM, pointSettings);
    } catch (err) {
      console.error(err);
      showToast('載入儀表板資料失敗: ' + err.message, 'error');
    }
  }

  function renderSkeleton() {
    document.getElementById('content').innerHTML = `
      <div class="loading-overlay">
        <div class="spinner"></div>
        <span>載入資料中...</span>
      </div>`;
  }

  function computeMonthStats(cases, pointSettings) {
    let totalPoints = 0, totalSelfPay = 0;
    const dates = new Set();

    for (const c of cases) {
      const pts = Calculator.calculateTotal(c, pointSettings);
      const sp  = Calculator.calculateSelfPayTotal(c, pointSettings);
      totalPoints += pts;
      totalSelfPay += sp;
      if (c.date) dates.add(c.date);
    }

    const daysWorked = dates.size;
    const avgDaily = daysWorked > 0 ? totalPoints / daysWorked : 0;
    const avgPerCase = cases.length > 0 ? totalPoints / cases.length : 0;
    const selfPayRatio = totalPoints > 0 ? totalSelfPay / totalPoints : 0;

    return { totalPoints, totalSelfPay, daysWorked, avgDaily, avgPerCase, selfPayRatio, count: cases.length };
  }

  function renderKPIs(cases, yearMonth, pointSettings) {
    const stats = computeMonthStats(cases, pointSettings);
    const [y, m] = yearMonth.split('-');
    const monthLabel = `${y}年${parseInt(m)}月`;

    document.getElementById('content').innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:var(--text-primary)">${monthLabel} 績效儀表板</h2>
          <p class="text-muted text-sm mt-2">共 ${cases.length} 筆記錄</p>
        </div>
      </div>

      <div class="kpi-grid" id="kpi-grid"></div>

      <div class="chart-grid mb-6">
        <div class="card">
          <div class="card-header">
            <span class="card-title">近12個月績效趨勢</span>
          </div>
          <div class="chart-container"><canvas id="trendChart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">${monthLabel} 麻醉方式分布</span>
          </div>
          <div class="chart-container"><canvas id="methodChart"></canvas></div>
        </div>
      </div>

      <div class="card mb-6">
        <div class="card-header">
          <span class="card-title">${monthLabel} 每日績效</span>
        </div>
        <div style="position:relative;height:220px"><canvas id="dailyChart"></canvas></div>
      </div>
    `;

    const kpiGrid = document.getElementById('kpi-grid');
    kpiGrid.innerHTML = `
      ${kpiCard('刀量', stats.count + ' 刀', '', 'primary')}
      ${kpiCard('總績效點數', fmt(stats.totalPoints), '含加成＋附加', 'success')}
      ${kpiCard('自費點數', fmt(stats.totalSelfPay), '自費項目小計', '')}
      ${kpiCard('工作天數', stats.daysWorked + ' 天', '', '')}
      ${kpiCard('平均日績效', fmt(stats.avgDaily), '點/工作日', 'warning')}
      ${kpiCard('平均刀績效', fmt(stats.avgPerCase), '點/刀', '')}
      ${kpiCard('自費佔比', (stats.selfPayRatio * 100).toFixed(1) + '%', '自費/總績效', '')}
    `;
  }

  function kpiCard(label, value, sub, cls) {
    return `
      <div class="kpi-card">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value ${cls}">${value}</div>
        ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
      </div>`;
  }

  function fmt(n) {
    return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function renderTrendChart(allData, months, pointSettings) {
    const labels = months.map(ym => {
      const [y, m] = ym.split('-');
      return `${y.slice(2)}/${m}`;
    });
    const totals = months.map(ym => {
      const cases = allData[ym] || [];
      return cases.reduce((s, c) => s + Calculator.calculateTotal(c, pointSettings), 0);
    });
    const selfPays = months.map(ym => {
      const cases = allData[ym] || [];
      return cases.reduce((s, c) => s + Calculator.calculateSelfPayTotal(c, pointSettings), 0);
    });

    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '總績效',
            data: totals,
            borderColor: '#1D4ED8',
            backgroundColor: 'rgba(29,78,216,0.08)',
            tension: 0.3,
            fill: true,
            pointRadius: 4,
          },
          {
            label: '自費',
            data: selfPays,
            borderColor: '#15803D',
            backgroundColor: 'rgba(21,128,61,0.08)',
            tension: 0.3,
            fill: false,
            pointRadius: 3,
            borderDash: [4, 4],
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          y: { ticks: { font: { size: 11 } } },
          x: { ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  function renderMethodChart(cases, yearMonth, pointSettings) {
    const canvas = document.getElementById('methodChart');
    if (!canvas) return;

    const counts = {};
    for (const c of cases) {
      counts[c.method] = (counts[c.method] || 0) + 1;
    }
    const labels = Object.keys(counts);
    const data = labels.map(k => counts[k]);
    const colors = [
      '#1D4ED8','#15803D','#B45309','#DC2626','#7C3AED',
      '#0891B2','#BE185D','#D97706','#059669','#6D28D9',
      '#2563EB','#16A34A','#CA8A04','#EF4444','#8B5CF6',
    ];

    if (methodChart) methodChart.destroy();
    methodChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#fff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 }, padding: 8 } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed} 刀 (${((ctx.parsed / cases.length) * 100).toFixed(1)}%)`
            }
          }
        }
      }
    });
  }

  function renderDailyChart(cases, yearMonth, pointSettings) {
    const canvas = document.getElementById('dailyChart');
    if (!canvas) return;

    const byDate = {};
    for (const c of cases) {
      const d = c.date || '';
      if (!byDate[d]) byDate[d] = 0;
      byDate[d] += Calculator.calculateTotal(c, pointSettings);
    }
    const dates = Object.keys(byDate).sort();
    const values = dates.map(d => byDate[d]);
    const labels = dates.map(d => {
      const dt = new Date(d + 'T00:00:00');
      return `${dt.getMonth()+1}/${dt.getDate()}`;
    });

    if (dailyChart) dailyChart.destroy();
    dailyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '日績效',
          data: values,
          backgroundColor: 'rgba(29,78,216,0.6)',
          borderColor: '#1D4ED8',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { font: { size: 10 } } },
          x: { ticks: { font: { size: 10 }, maxRotation: 45 } }
        }
      }
    });
  }

  return { init };
})();
