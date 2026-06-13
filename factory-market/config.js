// Where the client connects to the factory-market Socket.IO server.
// Development (localhost) auto-targets the local server; production targets the
// deployed URL (rewritten by server/go-live.sh on each live session).
(function () {
    const SERVER_URL_DEV = 'http://localhost:8788';
    const SERVER_URL_PROD = 'CHANGE_ME_TO_YOUR_DEPLOYED_SERVER_URL';

    const isLocal =
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1' ||
        location.hostname === '';

    window.FM_SERVER = isLocal ? SERVER_URL_DEV : SERVER_URL_PROD;
})();
