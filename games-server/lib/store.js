// Persistent account + game-history store, shared by every game on the server.
//
// SQLite (better-sqlite3, synchronous) so the single-threaded server can read and
// write inline with no callback plumbing. Passwords are hashed with scrypt from
// node:crypto (no native bcrypt dependency). "Remember me" tokens are random and
// stored only as a SHA-256 hash, so a leaked database can't be replayed as logins.
//
// The DB lives at $DATA_DIR/games.db (default ./data/games.db relative to the
// server's working directory). Fail loudly: if the DB can't be opened, the import
// throws and the server won't start.

import Database from 'better-sqlite3';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DB_PATH = process.env.DATA_DIR
    ? join(process.env.DATA_DIR, 'games.db')
    : join(process.cwd(), 'data', 'games.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY,
        username   TEXT NOT NULL UNIQUE,   -- lowercased, for case-insensitive uniqueness
        display    TEXT NOT NULL,          -- original-case name shown to others
        pass_hash  TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
        token_hash TEXT PRIMARY KEY,       -- sha256 of the random token
        user_id    INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS games (
        id        INTEGER PRIMARY KEY,
        user_id   INTEGER NOT NULL,
        played_at INTEGER NOT NULL,
        opponent  TEXT,
        record    TEXT NOT NULL,           -- full game JSON (see games/aumann.js historyRecord)
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_id, played_at DESC);
`);

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 60; // 60 days for "remember me"

// --- password hashing (scrypt) -------------------------------------------------
function hashPassword(password) {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 32);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// --- validation ----------------------------------------------------------------
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;
export function validateCredentials(username, password) {
    if (!USERNAME_RE.test(String(username || '')))
        return '3–24 chars: letters, digits, _ or - only.';
    if (String(password || '').length < 6)
        return 'Password must be at least 6 characters.';
    return null;
}

// --- prepared statements -------------------------------------------------------
const stmt = {
    insertUser: db.prepare('INSERT INTO users (username, display, pass_hash, created_at) VALUES (?, ?, ?, ?)'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById:   db.prepare('SELECT * FROM users WHERE id = ?'),
    insertToken: db.prepare('INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    tokenRow:   db.prepare('SELECT * FROM tokens WHERE token_hash = ?'),
    deleteToken: db.prepare('DELETE FROM tokens WHERE token_hash = ?'),
    deleteExpired: db.prepare('DELETE FROM tokens WHERE expires_at < ?'),
    insertGame: db.prepare('INSERT INTO games (user_id, played_at, opponent, record) VALUES (?, ?, ?, ?)'),
    gamesForUser: db.prepare('SELECT id, played_at, opponent, record FROM games WHERE user_id = ? ORDER BY played_at DESC, id DESC LIMIT ?'),
};

const publicUser = (u) => (u ? { id: u.id, username: u.username, display: u.display } : null);

// --- accounts ------------------------------------------------------------------
// Returns { user } or { error }.
export function registerUser(username, password, now) {
    const err = validateCredentials(username, password);
    if (err) return { error: err };
    const uname = String(username).toLowerCase();
    if (stmt.userByName.get(uname)) return { error: 'That username is taken.' };
    const info = stmt.insertUser.run(uname, String(username), hashPassword(password), now);
    return { user: publicUser(stmt.userById.get(info.lastInsertRowid)) };
}

export function loginUser(username, password) {
    const u = stmt.userByName.get(String(username || '').toLowerCase());
    if (!u || !verifyPassword(password, u.pass_hash)) return { error: 'Wrong username or password.' };
    return { user: publicUser(u) };
}

export function userById(id) { return publicUser(stmt.userById.get(id)); }

// --- remember-me tokens --------------------------------------------------------
export function issueToken(userId, now) {
    const token = randomBytes(32).toString('hex');
    stmt.insertToken.run(sha256(token), userId, now, now + TOKEN_TTL_MS);
    return token; // plaintext, returned to the client once
}

export function userForToken(token, now) {
    if (!token) return null;
    const row = stmt.tokenRow.get(sha256(token));
    if (!row) return null;
    if (row.expires_at < now) { stmt.deleteToken.run(sha256(token)); return null; }
    return publicUser(stmt.userById.get(row.user_id));
}

export function revokeToken(token) { if (token) stmt.deleteToken.run(sha256(token)); }

// --- game history --------------------------------------------------------------
export function addGame(userId, opponent, record, now) {
    stmt.insertGame.run(userId, now, opponent || null, JSON.stringify(record));
}

export function gamesForUser(userId, limit = 200) {
    return stmt.gamesForUser.all(userId, limit).map(r => ({
        id: r.id, playedAt: r.played_at, opponent: r.opponent, ...JSON.parse(r.record),
    }));
}

// Opportunistic cleanup of expired tokens (called on a timer from rooms.js).
export function purgeExpiredTokens(now) { stmt.deleteExpired.run(now); }

export default {
    registerUser, loginUser, userById, issueToken, userForToken, revokeToken,
    addGame, gamesForUser, validateCredentials, purgeExpiredTokens,
};
