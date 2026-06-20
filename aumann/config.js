// Edit on deploy: where the client should connect to the Aumann Socket.IO
// server. The script tag below sets a single global; main.js reads it.
//
// Development: localhost picks up the localhost server automatically.
// Production: change the SERVER_URL_PROD constant to point at your deployed
// Node server (e.g., "https://aumann.fly.dev"). The server's CORS is already
// open (cors: { origin: '*' }) so any client origin works.

(function () {
    // Where the client opens its WebSocket. In production the realtime server is
    // same-origin (Caddy proxies /socket.io/* to the games server), so this is
    // empty. In local dev the server runs on :8787. main.js appends the game's
    // namespace ('/aumann').
    const SERVER_URL_DEV  = 'http://localhost:8787';
    const SERVER_URL_PROD = 'https://ws.ollij.fi';  // always-on box (Caddy → games-server)

    const isLocal =
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1' ||
        location.hostname === '';

    window.AUMANN_SERVER = isLocal ? SERVER_URL_DEV : SERVER_URL_PROD;
})();
