/**
 * Level Registry for Todennakoisyyspaattely
 *
 * Canonical storage: levels/export.json on disk.
 * Loaded synchronously on init. In dev (serve.py on port 8090) saves go to
 * disk via POST /save-export/<game>. On the public site (maailmantutkija.fi)
 * we run read-only — _saveToDisk is a no-op there.
 */

const IS_LOCALHOST = (
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === ''
);
// Only probe the save endpoint on localhost — saves an unneeded 404 round-trip
// on every page load in production.
const SAVE_ENDPOINT_OK = IS_LOCALHOST && (() => {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/save-export/_ping', false);
    xhr.send();
    return xhr.status === 200 && xhr.responseText.trim() === 'OK';
  } catch (e) { return false; }
})();
const IS_DEV = IS_LOCALHOST && SAVE_ENDPOINT_OK;

if (IS_LOCALHOST && !SAVE_ENDPOINT_OK) {
  const msg = 'Save endpoint /save-export/_ping unreachable. Start serve.py on port 8090 (cd website_project && python3 serve.py) and reload. Edits would silently fail to persist, so this page is blocked to protect your work.';
  document.documentElement.innerHTML = `<body style="background:#300;color:#fdd;font-family:sans-serif;padding:40px;font-size:18px;line-height:1.5"><h1 style="color:#f88">Wrong dev server</h1><p>${msg}</p></body>`;
  throw new Error(msg);
}

const LevelRegistry = {
  GAME_NAME: 'factory-market',

  // Only the first 4 groups are shown in the player UI (index.html iterates GROUP_NAMES).
  // group5/group6/group7/other still hold levels in storage but aren't surfaced.
  GROUP_NAMES: ['Colors', 'Mixer', 'Colors and Mixer', 'Plexiglass'],

  GROUP_DESCRIPTIONS: [
    'Hidden parts are conveyor belts that may sort balls by colour.',
    'Hidden parts include mixers and conveyor belts.',
    'Hidden parts may be mixers or sort balls by colour.',
    'Ball colours are hidden behind plexiglass.'
  ],

  // In-memory state (loaded from disk on init)
  _levels: [],
  _groups: {
    'group1': [], 'group2': [], 'group3': [], 'group4': [],
    'group5': [], 'group6': [], 'group7': [], 'other': []
  },
  _history: {},
  _loaded: false,

  /**
   * Initialize: load from disk synchronously, then overlay localStorage in production.
   */
  init() {
    this._loadFromDisk();
    if (!IS_DEV) this._loadOverlaysFromLocalStorage();
  },

  // Production: bundled export.json's history is dev-authored. Reset to empty
  // so each player gets a fresh log, then overlay localStorage if present.
  _loadOverlaysFromLocalStorage() {
    this._history = {};
    try {
      const editor = localStorage.getItem(`${this.GAME_NAME}.editor`);
      if (editor) {
        const data = JSON.parse(editor);
        if (data.levels) this._levels = data.levels;
        if (data.groups) this._groups = data.groups;
      }
    } catch (e) { console.warn('[LevelRegistry] editor overlay parse failed:', e); }
    try {
      const hist = localStorage.getItem(`${this.GAME_NAME}.history`);
      if (hist) {
        const data = JSON.parse(hist);
        if (data.history) this._history = data.history;
      }
    } catch (e) { console.warn('[LevelRegistry] history overlay parse failed:', e); }
  },

  /**
   * Synchronous load from levels/export.json
   */
  _loadFromDisk() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'levels/export.json', false); // synchronous
      xhr.send();
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        this._levels = data.levels || [];
        this._groups = data.groups || this._groups;
        this._history = data.history || {};
        this._loaded = true;
        console.log(`[LevelRegistry] Loaded ${this._levels.length} levels from disk`);
      }
    } catch (e) {
      console.warn('[LevelRegistry] No export.json found, starting empty');
    }
  },

  // scope: 'history' (player gameplay) | 'editor' (level/group edits) | undefined (treated as 'editor').
  _saveToDisk(scope) {
    if (IS_DEV) {
      const data = JSON.stringify(this.exportAll());
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/save-export/${this.GAME_NAME}`, false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(data);
        if (xhr.status !== 200) {
          const msg = `[LevelRegistry] Save failed: HTTP ${xhr.status}. Wrong dev server? Need serve.py on port 8090 (has /save-export/). Jekyll (4000) and python3 -m http.server do NOT persist edits.`;
          console.error(msg);
          alert(msg);
          throw new Error(msg);
        }
      } catch (e) {
        const msg = `[LevelRegistry] Save failed: ${e.message}. Wrong dev server? Need serve.py on port 8090.`;
        console.error(msg);
        alert(msg);
        throw e;
      }
      return;
    }
    // Production: split keys so regular gameplay doesn't pin levels to a snapshot.
    if (scope === 'history') {
      localStorage.setItem(`${this.GAME_NAME}.history`, JSON.stringify({
        history: this._history,
      }));
    } else {
      localStorage.setItem(`${this.GAME_NAME}.editor`, JSON.stringify({
        levels: this._levels,
        groups: this._groups,
      }));
    }
  },

  // ==================== LEVEL MANAGEMENT ====================

  getLevel(id) {
    return this._levels.find(l => l.meta.id === id);
  },

  getAllLevels() {
    return this._levels;
  },

  saveLevels(levels) {
    this._levels = levels;
    this._saveToDisk();
  },

  getLevelCount() {
    return this._levels.length;
  },

  deleteLevel(id) {
    this._levels = this._levels.filter(l => l.meta.id !== id);
    for (const groupId in this._groups) {
      this._groups[groupId] = this._groups[groupId].filter(lid => lid !== id);
    }
    delete this._history[id];
    this._saveToDisk();
  },

  duplicateLevel(id) {
    const level = this.getLevel(id);
    if (!level) return null;

    const maxId = Math.max(0, ...this._levels.map(l => {
      const match = l.meta.id.match(/^level-(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    }));
    const newId = `level-${maxId + 1}`;
    const newLevel = JSON.parse(JSON.stringify(level));
    newLevel.meta.id = newId;
    newLevel.meta.title = `Taso ${maxId + 1}`;

    this._levels.push(newLevel);

    for (const groupId in this._groups) {
      if (this._groups[groupId].includes(id)) {
        this._groups[groupId].push(newId);
        break;
      }
    }
    this._saveToDisk();
    return newId;
  },

  // ==================== GROUP MANAGEMENT ====================

  loadGroups() {
    if (!this._groups.group7) this._groups.group7 = [];
    return this._groups;
  },

  saveGroups(groups) {
    this._groups = groups;
    this._saveToDisk();
  },

  getGroupLevels(groupId) {
    const levelIds = this._groups[groupId] || [];
    return levelIds.map(id => this.getLevel(id)).filter(Boolean);
  },

  moveLevel(levelId, fromGroupId, toGroupId, newIndex) {
    this._groups[fromGroupId] = this._groups[fromGroupId].filter(id => id !== levelId);
    this._groups[toGroupId].splice(newIndex, 0, levelId);
    this._saveToDisk();
  },

  findGroupForLevel(levelId) {
    for (const groupId in this._groups) {
      if (this._groups[groupId].includes(levelId)) return groupId;
    }
    return null;
  },

  getLevelByPosition(groupNumber, position) {
    const groupKeys = ['group1', 'group2', 'group3', 'group4', 'group5', 'group6', 'group7', 'other'];
    const groupKey = groupKeys[groupNumber - 1];
    if (!groupKey || !this._groups[groupKey]) return null;
    const levelId = this._groups[groupKey][position - 1];
    return levelId ? this.getLevel(levelId) : null;
  },

  // ==================== HISTORY MANAGEMENT ====================

  loadHistory() {
    return this._history;
  },

  saveHistory(history) {
    this._history = history;
    this._saveToDisk('history');
  },

  getLevelHistory(levelId) {
    return this._history[levelId] || [];
  },

  addHistoryEntry(levelId, entry) {
    if (!this._history[levelId]) this._history[levelId] = [];
    this._history[levelId].push(entry);
    this._saveToDisk('history');
  },

  getPlayCount(levelId) {
    return this.getLevelHistory(levelId).length;
  },

  getBestStats(levelId) {
    const history = this.getLevelHistory(levelId);
    if (history.length === 0) return null;
    return {
      bestMaxError: Math.min(...history.map(h => h.maxError)),
      bestStars: Math.max(...history.map(h => h.stars)),
      avgMaxError: history.reduce((s, h) => s + h.maxError, 0) / history.length,
      avgStars: history.reduce((s, h) => s + h.stars, 0) / history.length,
      plays: history.length
    };
  },

  // ==================== IMPORT/EXPORT ====================

  exportAll() {
    return {
      levels: this._levels,
      groups: this._groups,
      history: this._history,
      exportDate: new Date().toISOString(),
      version: 1
    };
  },

  exportPlayResults() {
    const results = [];
    for (const [levelId, entries] of Object.entries(this._history)) {
      for (const entry of entries) {
        results.push({
          level: levelId,
          oikea: entry.correctPosteriors,
          veikkaus: entry.playerAssignments,
          aika: entry.duration,
          maxError: entry.maxError
        });
      }
    }
    results.sort((a, b) => {
      const [aMajor, aMinor] = a.level.split('.').map(Number);
      const [bMajor, bMinor] = b.level.split('.').map(Number);
      if (aMajor !== bMajor) return aMajor - bMajor;
      return aMinor - bMinor;
    });
    return results;
  },

  importData(data, mode = 'merge') {
    if (!data.levels || !data.groups) {
      throw new Error('Invalid import data: missing levels or groups');
    }

    if (mode === 'replace') {
      this._levels = data.levels;
      this._groups = data.groups;
      this._history = data.history || {};
      this._saveToDisk();
    } else if (mode === 'merge') {
      const existingIds = new Set(this._levels.map(l => l.meta.id));
      const maxId = Math.max(0, ...this._levels.map(l => {
        const match = l.meta.id.match(/^level-(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      }));

      let nextId = maxId + 1;
      const idMapping = {};

      const importedLevels = data.levels.map(level => {
        if (existingIds.has(level.meta.id)) {
          const newId = `level-${nextId++}`;
          idMapping[level.meta.id] = newId;
          level = JSON.parse(JSON.stringify(level));
          level.meta.id = newId;
          level.meta.title = `Taso ${nextId - 1}`;
        } else {
          idMapping[level.meta.id] = level.meta.id;
        }
        return level;
      });

      this._levels = [...this._levels, ...importedLevels];

      for (const groupId in data.groups) {
        const mappedIds = data.groups[groupId].map(oldId => idMapping[oldId]);
        if (!this._groups[groupId]) this._groups[groupId] = [];
        this._groups[groupId].push(...mappedIds);
      }

      const importedHistory = data.history || {};
      for (const oldId in importedHistory) {
        const newId = idMapping[oldId];
        if (!this._history[newId]) this._history[newId] = [];
        this._history[newId].push(...importedHistory[oldId]);
      }

      this._saveToDisk();
    }
  }
};

// Initialize on load
LevelRegistry.init();

if (typeof window !== 'undefined') {
  window.LevelRegistry = LevelRegistry;
}
