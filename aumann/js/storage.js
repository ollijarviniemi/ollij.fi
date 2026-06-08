// localStorage persistence for the Aumann game.
// Keyed by player name so different players on the same browser keep separate
// histories. Includes per-game records with timestamps for daily rollups.

const KEY_NAME = 'aumann.name';
const KEY_ROOM = 'aumann.room';       // { code, playerId }
const KEY_HISTORY_PREFIX = 'aumann.history.'; // + safe(playerName)

function safe(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32); }

export function getName() {
    try { return localStorage.getItem(KEY_NAME) || ''; } catch { return ''; }
}
export function setName(name) {
    try { localStorage.setItem(KEY_NAME, name); } catch {}
}

export function getRoomCookie() {
    try {
        const raw = localStorage.getItem(KEY_ROOM);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}
export function setRoomCookie(code, playerId) {
    try { localStorage.setItem(KEY_ROOM, JSON.stringify({ code, playerId })); } catch {}
}
export function clearRoomCookie() {
    try { localStorage.removeItem(KEY_ROOM); } catch {}
}

// History: per-player array of records { ts, date, ownScore, idealScore, delta, opponentName }
export function getHistory(playerName) {
    try {
        const raw = localStorage.getItem(KEY_HISTORY_PREFIX + safe(playerName));
        if (!raw) return [];
        return JSON.parse(raw);
    } catch { return []; }
}
export function appendHistory(playerName, record) {
    try {
        const arr = getHistory(playerName);
        arr.push(record);
        // Cap at a reasonable size so we don't grow unbounded.
        if (arr.length > 5000) arr.splice(0, arr.length - 5000);
        localStorage.setItem(KEY_HISTORY_PREFIX + safe(playerName), JSON.stringify(arr));
    } catch {}
}

// Summary stats from history.
export function summarize(history) {
    if (!history.length) return null;
    const todayIso = new Date().toISOString().slice(0, 10);
    const todays = history.filter(h => (h.date || '').startsWith(todayIso));
    const todayAvg = todays.length ? todays.reduce((s, h) => s + h.ownScore, 0) / todays.length : null;
    const todayIdealAvg = todays.length ? todays.reduce((s, h) => s + (h.idealScore || 0) / 2, 0) / todays.length : null; // ideal is sum of 4 placements; each player's share is half
    const allOwn = history.reduce((s, h) => s + h.ownScore, 0);
    const allIdeal = history.reduce((s, h) => s + (h.idealScore || 0) / 2, 0);
    return {
        games: history.length,
        todayGames: todays.length,
        todayAvg,
        todayIdealAvg,
        allTimeAvg: allOwn / history.length,
        allTimeIdealAvg: allIdeal / history.length,
    };
}
