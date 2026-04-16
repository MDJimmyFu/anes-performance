/**
 * calculator.js
 * Point calculation logic for anesthesia performance system.
 */

const Calculator = (() => {

  /**
   * Find the applicable point settings period for a given year-month string "YYYY-MM".
   * @param {string} yearMonth  e.g. "2025-03"
   * @param {Array}  pointSettings  array of setting periods
   * @returns {Object|null} matching period object
   */
  function getApplicableSettings(yearMonth, pointSettings) {
    if (!pointSettings || pointSettings.length === 0) return null;
    // Sort by effective_from descending so we pick the latest matching
    const sorted = [...pointSettings].sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from)
    );
    for (const period of sorted) {
      const from = period.effective_from; // "YYYY-MM"
      const to   = period.effective_to;   // "YYYY-MM" or null
      if (yearMonth >= from && (to === null || yearMonth <= to)) {
        return period;
      }
    }
    // Fall back to earliest period
    return sorted[sorted.length - 1];
  }

  /**
   * Calculate base performance points including overtime.
   * @param {string} method     anesthesia method key e.g. "GE"
   * @param {number} duration   duration in minutes
   * @param {Object} settings   point settings period object
   * @returns {number}
   */
  function calculateBasePerformance(method, duration, settings) {
    if (!settings || !settings.methods) return 0;
    const m = settings.methods[method];
    if (!m) return 0;

    let base = m.base;
    let overtimeSubtotal = 0;

    if (m.overtime && duration > 120) {
      const units = Math.floor((duration - 120) / 30);
      const first4 = Math.min(units, 4);
      const beyond4 = Math.max(units - 4, 0);
      overtimeSubtotal = first4 * m.ot24 + beyond4 * m.ot4plus;
    }

    return base + overtimeSubtotal;
  }

  /**
   * Apply bonus multiplier.
   * @param {number} basePerf
   * @param {string} bonusType
   * @param {Object} settings
   * @returns {number}
   */
  function calculateBonus(basePerf, bonusType, settings) {
    if (!settings || !settings.bonus_multipliers) return basePerf;
    const mult = settings.bonus_multipliers[bonusType] ?? 1.0;
    return basePerf * mult;
  }

  /**
   * Calculate extras total.
   * @param {Object} caseData  case record
   * @param {Object} settings  point settings period
   * @returns {number}
   */
  function calculateExtras(caseData, settings) {
    if (!settings || !settings.extras) return 0;
    const ex = settings.extras;
    let total = 0;

    const extraFields = [
      ['GVL_AWS_MAC',   'GVL_AWS_MAC'],
      ['Rusch_Video',   'Rusch_Video'],
      ['OMT',           'OMT'],
      ['A_line',        'A_line'],
      ['CVC',           'CVC'],
      ['PAC',           'PAC'],
      ['TEE',           'TEE'],
      ['CO',            'CO'],
      ['Optiflow',      'Optiflow'],
      ['BIS_self',      'BIS_self'],
      ['BIS_NHI_adult', 'BIS_NHI_adult'],
      ['BIS_NHI_child', 'BIS_NHI_child'],
      ['blanket',       'blanket'],
      ['IVPCA',         'IVPCA'],
      ['NBPCA',         'NBPCA'],
      ['PCEA',          'PCEA'],
      ['PCA_days',      'PCA_days'],
      ['IV_sedation',   'IV_sedation'],
      ['ultrasound',    'ultrasound'],
      ['ByBIS',         'ByBIS'],
    ];

    for (const [caseKey, settingKey] of extraFields) {
      const qty = Number(caseData[caseKey]) || 0;
      const pts = ex[settingKey] ?? 0;
      total += qty * pts;
    }

    return total;
  }

  /**
   * Calculate total performance for a case.
   * @param {Object} caseData
   * @param {Array}  pointSettings
   * @returns {number}
   */
  function calculateTotal(caseData, pointSettings) {
    const yearMonth = (caseData.date || '').substring(0, 7);
    const settings = getApplicableSettings(yearMonth, pointSettings);
    if (!settings) return 0;

    const handover = Number(caseData.handover) || 1;
    const duration = Number(caseData.duration) || 0;
    const bonusType = caseData.bonus || '無';
    const method = caseData.method || '';

    const basePerf = calculateBasePerformance(method, duration, settings);
    const withBonus = calculateBonus(basePerf, bonusType, settings);
    const beforeExtras = withBonus * handover;
    const extras = calculateExtras(caseData, settings);

    return Math.round((beforeExtras + extras) * 1000) / 1000;
  }

  /**
   * Calculate self-pay portion.
   * Self-pay items: OMT, IV_sedation, BIS_self, Optiflow
   * @param {Object} caseData
   * @param {Array}  pointSettings
   * @returns {number}
   */
  function calculateSelfPayTotal(caseData, pointSettings) {
    const yearMonth = (caseData.date || '').substring(0, 7);
    const settings = getApplicableSettings(yearMonth, pointSettings);
    if (!settings || !settings.extras) return 0;

    const ex = settings.extras;
    const selfPayFields = ['OMT', 'IV_sedation', 'BIS_self', 'Optiflow'];
    let total = 0;
    for (const key of selfPayFields) {
      total += (Number(caseData[key]) || 0) * (ex[key] ?? 0);
    }
    return Math.round(total * 1000) / 1000;
  }

  /**
   * Get breakdown string for display.
   */
  function getBreakdown(caseData, pointSettings) {
    const yearMonth = (caseData.date || '').substring(0, 7);
    const settings = getApplicableSettings(yearMonth, pointSettings);
    if (!settings) return '';

    const handover = Number(caseData.handover) || 1;
    const duration = Number(caseData.duration) || 0;
    const bonusType = caseData.bonus || '無';
    const method = caseData.method || '';

    const m = settings.methods[method];
    if (!m) return '';

    let parts = [];
    parts.push(`基礎 ${m.base}`);

    if (m.overtime && duration > 120) {
      const units = Math.floor((duration - 120) / 30);
      const first4 = Math.min(units, 4);
      const beyond4 = Math.max(units - 4, 0);
      if (first4 > 0) parts.push(`加班(≤4h) ${first4}×${m.ot24}`);
      if (beyond4 > 0) parts.push(`加班(>4h) ${beyond4}×${m.ot4plus}`);
    }

    const mult = settings.bonus_multipliers[bonusType] ?? 1.0;
    if (mult !== 1.0) parts.push(`加成 ×${mult}`);
    if (handover !== 1) parts.push(`交接班 ×${handover}`);

    const extras = calculateExtras(caseData, settings);
    if (extras > 0) parts.push(`附加 +${extras.toFixed(2)}`);

    return parts.join(' | ');
  }

  /**
   * List of anesthesia methods
   */
  const METHODS = [
    'GE', 'GM', 'IV', 'EA', 'SA',
    'Painless', 'Painless夜間',
    '傳染GE', '困難氣道GE',
    'HMC', 'C/G', 'C+G', 'ERCP', 'EUS'
  ];

  /**
   * List of bonus types
   */
  const BONUS_TYPES = [
    '無', '心臟手術', '腦部手術', '休克', '急診',
    '器官移植', '<6mo', '6mo-2yo', '2yo-7yo',
    '自費麻醉', '醫美'
  ];

  /**
   * Handover options
   */
  const HANDOVER_OPTIONS = [
    { value: 1,   label: '全程 (1.0)' },
    { value: 0.8, label: '交出 (0.8)' },
    { value: 0.2, label: '接入 (0.2)' },
  ];

  /**
   * Extras field metadata for form rendering
   */
  const EXTRAS_META = [
    { key: 'GVL_AWS_MAC',   label: 'GVL/AWS/MAC',  type: 'check' },
    { key: 'Rusch_Video',   label: 'Rusch+Video',   type: 'check' },
    { key: 'OMT',           label: 'OMT',           type: 'check', selfPay: true },
    { key: 'A_line',        label: 'A-line',        type: 'check' },
    { key: 'CVC',           label: 'CVC',           type: 'check' },
    { key: 'PAC',           label: 'PAC',           type: 'check' },
    { key: 'TEE',           label: 'TEE',           type: 'check' },
    { key: 'CO',            label: 'CO',            type: 'check' },
    { key: 'Optiflow',      label: 'Optiflow',      type: 'check', selfPay: true },
    { key: 'BIS_self',      label: 'BIS自費',       type: 'check', selfPay: true },
    { key: 'BIS_NHI_adult', label: 'BIS健保成人',   type: 'check' },
    { key: 'BIS_NHI_child', label: 'BIS健保小兒',   type: 'check' },
    { key: 'blanket',       label: '溫毯',          type: 'check' },
    { key: 'IVPCA',         label: 'IVPCA',         type: 'check' },
    { key: 'NBPCA',         label: 'NBPCA',         type: 'check' },
    { key: 'PCEA',          label: 'PCEA',          type: 'check' },
    { key: 'PCA_days',      label: 'PCA加做天',      type: 'number' },
    { key: 'IV_sedation',   label: 'IV Sedation',   type: 'check', selfPay: true },
    { key: 'ultrasound',    label: '超音波導引',     type: 'check' },
    { key: 'ByBIS',         label: 'ByBIS',         type: 'check' },
  ];

  return {
    getApplicableSettings,
    calculateBasePerformance,
    calculateBonus,
    calculateExtras,
    calculateTotal,
    calculateSelfPayTotal,
    getBreakdown,
    METHODS,
    BONUS_TYPES,
    HANDOVER_OPTIONS,
    EXTRAS_META,
  };
})();
