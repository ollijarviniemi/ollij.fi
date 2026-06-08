// Edit on deploy: where the client should connect to the Aumann Socket.IO
// server. The script tag below sets a single global; main.js reads it.
//
// Development: localhost picks up the localhost server automatically.
// Production: change the SERVER_URL_PROD constant to point at your deployed
// Node server (e.g., "https://aumann.fly.dev"). The server's CORS is already
// open (cors: { origin: '*' }) so any client origin works.

(function () {
    const SERVER_URL_DEV  = 'http://localhost:8787';
    const SERVER_URL_PROD = 'https://entrepreneurs-acceptable-files-bacterial.trycloudflare.com';

    const isLocal =
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1' ||
        location.hostname === '';

    window.AUMANN_SERVER = isLocal ? SERVER_URL_DEV : SERVER_URL_PROD;
})();
