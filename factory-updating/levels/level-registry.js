/**
 * Level Registry for Bayesian Factory: Updating
 *
 * Loads levels synchronously from levels/export.json on init. Read-only —
 * player history persists to localStorage; no edit/save path in this build.
 */

const IS_DEV = false;

const LevelRegistry = {
  GAME_NAME: 'factory-updating',

  // Timed mode configuration
  TIMED_MODE_SAMPLING_RULES: [
    { group: 'group1', count: 1 },  // One sack
    { group: 'group2', count: 1 },  // Several sacks
    { group: 'group3', count: 1 },  // Plexiglass and filter
    { group: 'group4', count: 2 },  // Mixer
    { group: 'group5', count: 2 },  // Duplicator
    { group: 'group6', count: 1 },  // Many possibilities
    { group: 'group7', count: 2 },  // Accumulating balls
  ],
  TIMED_MODE_TIME_LIMIT: 30000,

  GROUP_NAMES: ['One sack', 'Several sacks', 'Plexiglass and filter', 'Mixer', 'Duplicator', 'Many possibilities', 'Accumulating balls', 'Other'],

  GROUP_DESCRIPTIONS: [
    'Levels with a single sack from which balls are drawn.',
    'Balls are drawn from several sacks.',
    'You cannot see through the plexiglass what color the balls are. Filters sort balls by color.',
    'The mixer bounces balls around and sends them out in random order.',
    'The duplicator makes same-colored copies of a ball.',
    'Levels with many possible sack contents.',
    'Levels where balls accumulate in mixers waiting for new balls to arrive.',
    null
  ],

  // In-memory state (loaded from disk on init)
  _levels: [],
  _groups: {
    'group1': [], 'group2': [], 'group3': [], 'group4': [],
    'group5': [], 'group6': [], 'group7': [], 'other': []
  },
  _history: {},
  _timedModeHistory: [],
  _timedModeSampling: {},
  _loaded: false,

  init() {
    this._loadFromDisk();
    if (!IS_DEV) this._loadOverlaysFromLocalStorage();
  },

  _loadFromDisk() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'levels/export.json', false);
      xhr.send();
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        this._levels = data.levels || [];
        this._groups = data.groups || this._groups;
        this._history = data.history || {};
        this._timedModeHistory = data.timedModeHistory || [];
        this._timedModeSampling = data.timedModeSampling || {};
        this._loaded = true;
        console.log(`[LevelRegistry] Loaded ${this._levels.length} levels from disk`);
      }
    } catch (e) {
      console.warn('[LevelRegistry] No export.json found, starting empty');
    }
  },

  // Production: bundled export.json's history is dev-authored. Reset to empty
  // so each player gets a fresh log, then overlay localStorage if present.
  // Editor users who saved levels have a separate full-state overlay.
  _loadOverlaysFromLocalStorage() {
    this._history = {};
    this._timedModeHistory = [];
    this._timedModeSampling = {};
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
        if (data.timedModeHistory) this._timedModeHistory = data.timedModeHistory;
        if (data.timedModeSampling) this._timedModeSampling = data.timedModeSampling;
      }
    } catch (e) { console.warn('[LevelRegistry] history overlay parse failed:', e); }
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
        timedModeHistory: this._timedModeHistory,
        timedModeSampling: this._timedModeSampling,
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
    newLevel.meta.title = `Level ${maxId + 1}`;

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
      timedModeHistory: this._timedModeHistory,
      timedModeSampling: this._timedModeSampling,
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
          correct: entry.correctPosteriors,
          guess: entry.playerAssignments,
          time: entry.duration,
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

  // ==================== TIMED MODE ====================

  loadTimedModeSampling() {
    return this._timedModeSampling;
  },

  saveTimedModeSampling(state) {
    this._timedModeSampling = state;
    this._saveToDisk('history');
  },

  loadTimedModeHistory() {
    return this._timedModeHistory;
  },

  saveTimedModeHistory(history) {
    this._timedModeHistory = history;
    this._saveToDisk('history');
  },

  addTimedModeHistoryEntry(entry) {
    this._timedModeHistory.push(entry);
    this._saveToDisk('history');
  },

  validateTimedModeSampling() {
    const errors = [];
    this.TIMED_MODE_SAMPLING_RULES.forEach(rule => {
      const levelIds = this._groups[rule.group] || [];
      if (levelIds.length < rule.count) {
        const groupIndex = parseInt(rule.group.replace('group', '')) - 1;
        const groupName = this.GROUP_NAMES[groupIndex] || rule.group;
        errors.push(`${groupName} (${rule.group}) has ${levelIds.length} levels but needs at least ${rule.count}`);
      }
    });
    if (errors.length > 0) {
      throw new Error(`Timed mode sampling error:\n${errors.join('\n')}`);
    }
  },

  sampleTimedModeLevels() {
    this.validateTimedModeSampling();
    const samplingState = this._timedModeSampling;
    const selectedLevels = [];

    this.TIMED_MODE_SAMPLING_RULES.forEach(rule => {
      const groupLevels = this._groups[rule.group] || [];
      const groupKey = rule.group;
      if (!samplingState[groupKey]) samplingState[groupKey] = {};

      groupLevels.forEach(levelId => {
        if (samplingState[groupKey][levelId] === undefined) {
          samplingState[groupKey][levelId] = 0;
        }
      });

      for (let pick = 0; pick < rule.count; pick++) {
        const alreadySelected = selectedLevels.map(s => s.levelId);
        const available = groupLevels.filter(id => !alreadySelected.includes(id));
        if (available.length === 0) continue;

        const playCounts = available.map(id => samplingState[groupKey][id] || 0);
        const minPlays = Math.min(...playCounts);
        const candidates = available.filter(id =>
          (samplingState[groupKey][id] || 0) === minPlays
        );

        const selectedLevel = candidates[Math.floor(Math.random() * candidates.length)];
        selectedLevels.push({ group: rule.group, levelId: selectedLevel });
        samplingState[groupKey][selectedLevel] = (samplingState[groupKey][selectedLevel] || 0) + 1;
      }
    });

    this.saveTimedModeSampling(samplingState);
    this.shuffleArray(selectedLevels);
    return selectedLevels.map(item => item.levelId);
  },

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  getTimedModeStats() {
    if (this._timedModeHistory.length === 0) return null;
    const totals = this._timedModeHistory.map(h => h.totalStars ?? 0);
    return {
      plays: this._timedModeHistory.length,
      bestTotalStars: Math.max(...totals),
      avgTotalStars: totals.reduce((a, b) => a + b, 0) / totals.length
    };
  },

  importData(data, mode = 'merge') {
    if (!data.levels || !data.groups) {
      throw new Error('Invalid import data: missing levels or groups');
    }

    if (mode === 'replace') {
      this._levels = data.levels;
      this._groups = data.groups;
      this._history = data.history || {};
      this._timedModeHistory = data.timedModeHistory || [];
      this._timedModeSampling = data.timedModeSampling || {};
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
          level.meta.title = `Level ${nextId - 1}`;
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

LevelRegistry.init();

if (typeof window !== 'undefined') {
  window.LevelRegistry = LevelRegistry;
}
