/**
 * dashboard.js
 * Dashboard page: KPI cards + charts
 */

// ========================
// CHART THEME DEFAULTS
// ========================
Chart.defaults.color = '#8B949E';
Chart.defaults.borderColor = '#30363D';
Chart.defaults.font.family = "'JetBrains Mono', monospace";

// ========================
// COUNT-UP ANIMATION
// ========================
function animateValue(el, from, to, duration = 800) {
  if (!el) return;
  const isFloat = String(to).includes('.');
  const start = performance.now();
  const update = (time) => {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = from + (to - from) * eased;
    el.textContent = isFloat
      ? current.toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : formatNum(current);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function formatNum(n) {
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

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
        <div class="dot-pulse"><span></span><span></span><span></span></div>
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
      <div class="page-header flex items-center justify-between">
        <div>
          <h2 class="page-title">${monthLabel} 績效儀表板</h2>
          <p class="page-subtitle">共 ${cases.length} 筆記錄</p>
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
      ${kpiCard('刀量',     stats.count,              '刀', 'primary')}
      ${kpiCard('總績效點數', stats.totalPoints,         '含加成＋附加', 'success')}
      ${kpiCard('自費點數',  stats.totalSelfPay,        '自費項目小計', '')}
      ${kpiCard('工作天數',  stats.daysWorked,          '天', '')}
      ${kpiCard('平均日績效', stats.avgDaily,            '點/工作日', 'warning')}
      ${kpiCard('平均刀績效', stats.avgPerCase,          '點/刀', '')}
      ${kpiCard('自費佔比',  stats.selfPayRatio * 100,  '%', '')}
    `;

    // Trigger countUp animations after DOM render
    requestAnimationFrame(() => {
      document.querySelectorAll('.kpi-value[data-target]').forEach(el => {
        const target = parseFloat(el.dataset.target);
        animateValue(el, 0, target);
      });
    });
  }

  function kpiCard(label, rawValue, sub, cls) {
    // Store raw numeric value for countUp; display placeholder
    const isPercent = sub === '%';
    const isDays    = sub === '天';
    const isKnife   = sub === '刀';
    let displaySub  = sub;
    if (isPercent) displaySub = '自費/總績效';
    if (isDays)    displaySub = '';
    if (isKnife)   displaySub = '';

    const formatted = isPercent
      ? rawValue.toFixed(1) + '%'
      : (isDays || isKnife)
        ? Math.round(rawValue) + (isDays ? ' 天' : ' 刀')
        : fmt(rawValue);

    return `
      <div class="kpi-card">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value ${cls}" data-target="${rawValue}">${formatted}</div>
        ${displaySub ? `<div class="kpi-sub">${displaySub}</div>` : ''}
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
            borderColor: '#3FB950',
            backgroundColor: 'rgba(63,185,80,0.08)',
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#3FB950',
            pointBorderColor: '#0D1117',
            pointBorderWidth: 1.5,
            borderWidth: 2,
          },
          {
            label: '自費',
            data: selfPays,
            borderColor: '#388BFD',
            backgroundColor: 'rgba(56,139,253,0.05)',
            tension: 0.35,
            fill: false,
            pointRadius: 2,
            pointBackgroundColor: '#388BFD',
            borderDash: [4, 4],
            borderWidth: 1.5,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { size: 11, family: "'JetBrains Mono', monospace" }, color: '#8B949E', padding: 16 }
          }
        },
        scales: {
          y: {
            grid: { color: '#30363D' },
            ticks: { font: { size: 11, family: "'JetBrains Mono', monospace" }, color: '#8B949E' }
          },
          x: {
            grid: { color: '#30363D' },
            ticks: { font: { size: 11, family: "'JetBrains Mono', monospace" }, color: '#8B949E' }
          }
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
      '#3FB950','#388BFD','#D29922','#A371F7','#39D353',
      '#F778BA','#E3B341','#DA3633','#58A6FF','#BC8CFF',
      '#2EA043','#1F6FEB','#BB8009','#CF222E','#8957E5',
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
          borderColor: '#161B22',
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { font: { size: 11, family: "'JetBrains Mono', monospace" }, color: '#8B949E', padding: 10 }
          },
          tooltip: {
            backgroundColor: '#21262D',
            borderColor: '#30363D',
            borderWidth: 1,
            titleColor: '#E6EDF3',
            bodyColor: '#8B949E',
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
          backgroundColor: 'rgba(63,185,80,0.25)',
          borderColor: '#3FB950',
          borderWidth: 1,
          borderRadius: 3,
          hoverBackgroundColor: 'rgba(63,185,80,0.5)',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#21262D',
            borderColor: '#30363D',
            borderWidth: 1,
            titleColor: '#E6EDF3',
            bodyColor: '#8B949E',
          }
        },
        scales: {
          y: {
            grid: { color: '#30363D' },
            ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E' }
          },
          x: {
            grid: { color: 'transparent' },
            ticks: { font: { size: 10, family: "'JetBrains Mono', monospace" }, color: '#8B949E', maxRotation: 45 }
          }
        }
      }
    });
  }

  return { init };
})();
