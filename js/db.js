/**
 * db.js
 * GitHub API wrapper — reads/writes JSON files stored in the repo.
 */

class GitHubDB {
  constructor() {
    this._loadConfig();
  }

  _loadConfig() {
    const raw = localStorage.getItem('anes_github_config');
    if (raw) {
      try {
        const cfg = JSON.parse(raw);
        this.owner  = cfg.owner  || '';
        this.repo   = cfg.repo   || '';
        this.branch = cfg.branch || 'main';
        this.token  = cfg.token  || '';
      } catch {
        this._clearConfig();
      }
    } else {
      this._clearConfig();
    }
  }

  _clearConfig() {
    this.owner  = '';
    this.repo   = '';
    this.branch = 'main';
    this.token  = '';
  }

  reload() {
    this._loadConfig();
  }

  isConfigured() {
    return !!(this.owner && this.repo);
  }

  _rawUrl(path) {
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`;
  }

  _apiUrl(path) {
    return `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`;
  }

  _headers(write = false) {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (this.token) h['Authorization'] = `token ${this.token}`;
    if (write) h['Content-Type'] = 'application/json';
    return h;
  }

  /**
   * Read a file from the repo via raw.githubusercontent.com.
   * Falls back to GitHub contents API if token is present (for private repos).
   * @param {string} path  e.g. "data/point_settings.json"
   * @returns {Promise<any>} parsed JSON
   */
  async readFile(path) {
    // Try cache first
    const cacheKey = `ghcache_${path}`;
    const cached = this._getCache(cacheKey);
    if (cached !== null) return cached;

    // Prefer raw URL (works for public repos without token)
    const url = this._rawUrl(path);
    try {
      const resp = await fetch(url, {
        headers: this.token ? { 'Authorization': `token ${this.token}` } : {}
      });
      if (resp.ok) {
        const data = await resp.json();
        this._setCache(cacheKey, data, path.startsWith('data/cases/') ? 300 : null);
        return data;
      }
    } catch {}

    // Fallback to contents API
    const resp2 = await fetch(this._apiUrl(path), { headers: this._headers() });
    if (!resp2.ok) {
      if (resp2.status === 404) return null;
      throw new Error(`GitHub read failed: ${resp2.status} ${resp2.statusText}`);
    }
    const meta = await resp2.json();
    const content = atob(meta.content.replace(/\n/g, ''));
    const data = JSON.parse(content);
    this._setCache(cacheKey, data, path.startsWith('data/cases/') ? 300 : null);
    return data;
  }

  /**
   * Write (create or update) a file in the repo via GitHub API.
   * @param {string} path
   * @param {any}    content  will be JSON.stringified
   * @param {string} message  commit message
   * @returns {Promise<void>}
   */
  async writeFile(path, content, message) {
    if (!this.token) throw new Error('GitHub token required for write operations');

    const jsonStr = JSON.stringify(content, null, 2);
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));

    // Get current SHA (needed for updates)
    let sha = undefined;
    try {
      const existing = await fetch(this._apiUrl(path), { headers: this._headers() });
      if (existing.ok) {
        const meta = await existing.json();
        sha = meta.sha;
      }
    } catch {}

    const body = {
      message,
      content: encoded,
      branch: this.branch,
    };
    if (sha) body.sha = sha;

    const resp = await fetch(this._apiUrl(path), {
      method: 'PUT',
      headers: this._headers(true),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`GitHub write failed: ${resp.status} - ${errText}`);
    }

    // Invalidate cache
    this._invalidateCache(`ghcache_${path}`);
  }

  /**
   * Get cases array for a given year-month.
   * @param {string} yearMonth  "YYYY-MM"
   * @returns {Promise<Array>}
   */
  async getCases(yearMonth) {
    const path = `data/cases/${yearMonth}.json`;
    const data = await this.readFile(path);
    return data || [];
  }

  /**
   * Save cases array for a given year-month.
   * @param {string} yearMonth
   * @param {Array}  cases
   */
  async saveCases(yearMonth, cases) {
    const path = `data/cases/${yearMonth}.json`;
    await this.writeFile(path, cases, `Update cases for ${yearMonth}`);
    // Invalidate local cache
    this._invalidateCache(`ghcache_${path}`);
    this._invalidateCache(`lcache_cases_${yearMonth}`);
  }

  /**
   * Fetch cases for multiple months.
   * @param {string[]} months  array of "YYYY-MM"
   * @returns {Promise<Object>} { "YYYY-MM": [...cases] }
   */
  async getAllCases(months) {
    const results = {};
    await Promise.all(months.map(async (ym) => {
      try {
        results[ym] = await this.getCases(ym);
      } catch {
        results[ym] = [];
      }
    }));
    return results;
  }

  /**
   * Get point settings.
   * @returns {Promise<Array>}
   */
  async getPointSettings() {
    const data = await this.readFile('data/point_settings.json');
    return data || [];
  }

  /**
   * Save point settings.
   * @param {Array} settings
   */
  async savePointSettings(settings) {
    await this.writeFile('data/point_settings.json', settings, 'Update point settings');
    this._invalidateCache('ghcache_data/point_settings.json');
  }

  // ========================
  // Cache helpers
  // ========================

  _getCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { data, expires } = JSON.parse(raw);
      if (expires !== null && Date.now() > expires) {
        localStorage.removeItem(key);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  _setCache(key, data, ttlSeconds = null) {
    try {
      const expires = ttlSeconds !== null ? Date.now() + ttlSeconds * 1000 : null;
      localStorage.setItem(key, JSON.stringify({ data, expires }));
    } catch {}
  }

  _invalidateCache(key) {
    localStorage.removeItem(key);
  }

  invalidateAllCasesCache() {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith('ghcache_data/cases/') || k.startsWith('lcache_cases_')
    );
    keys.forEach(k => localStorage.removeItem(k));
  }

  /**
   * Generate a UUID v4
   */
  static generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /**
   * Get list of months that have case files (from localStorage cache keys).
   * Also accepts a start/end to generate month range.
   */
  static generateMonthRange(startYM, endYM) {
    const months = [];
    let [y, m] = startYM.split('-').map(Number);
    const [ey, em] = endYM.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2,'0')}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return months;
  }
}

// Singleton instance
const db = new GitHubDB();
