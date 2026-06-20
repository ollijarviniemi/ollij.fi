// ollij.fi realtime games server: one process, one Socket.IO server, a
// namespace per game. The static site (served by Caddy) proxies /socket.io/*
// here, so clients connect same-origin, e.g. io('https://ollij.fi/aumann').

import express from 'express';
import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { join } from 'node:path';

import { mountGame } from './lib/rooms.js';
import aumann from './games/aumann.js';
// import factoryMarket from './games/factory-market.js';

const PORT = Number(process.env.PORT || 8787);
// Same-origin in production, so CORS is irrelevant there; '*' keeps local dev
// (client on :4200 → server on :8787) working. Override with CORS_ORIGIN.
const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';

const app = express();
app.set('strict routing', true); // so '/aumann' (redirect) and '/aumann/' (page) don't collide
const httpServer = createServer(app);
const io = new IOServer(httpServer, { cors: { origin: corsOrigin } });

app.get('/health', (_req, res) => res.json({ ok: true }));

// Optional static hosting. When STATIC_ROOT is set (e.g. running everything off
// one machine behind a tunnel), serve the Aumann client so the page and its
// same-origin WebSocket come from one origin — no config.js editing needed. Only
// the client assets are exposed (not server/ or bot/). In production Caddy serves
// the static site, so STATIC_ROOT is left unset.
if (process.env.STATIC_ROOT) {
    const aumannDir = join(process.env.STATIC_ROOT, 'aumann');
    app.get('/', (_q, res) => res.redirect('/aumann/'));
    app.get('/aumann', (_q, res) => res.redirect('/aumann/'));
    app.get('/aumann/', (_q, res) => res.sendFile(join(aumannDir, 'index.html')));
    app.get('/aumann/config.js', (_q, res) => res.sendFile(join(aumannDir, 'config.js')));
    app.use('/aumann/js', express.static(join(aumannDir, 'js')));
    app.use('/aumann/css', express.static(join(aumannDir, 'css')));
    app.use('/aumann/cards', express.static(join(aumannDir, 'cards')));
}

mountGame(io.of('/aumann'), aumann);
// mountGame(io.of('/factory-market'), factoryMarket);

httpServer.listen(PORT, () => console.log(`games-server on :${PORT} — namespaces: /aumann`));
