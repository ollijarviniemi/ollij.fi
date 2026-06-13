#!/usr/bin/env python3
"""
Dev server for the ollij.fi games. Serves static files from this directory and
handles POST /save-export/<game> so the level editor can persist levels to disk.

Run:  cd ~/ollij.fi && python3 serve.py     (http://localhost:8090)
Then open  http://localhost:8090/factory-market/manage.html  (or editor.html).

Plain `python3 -m http.server` does NOT persist edits — the editor needs this
server (it probes /save-export/_ping and refuses to run otherwise).
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import os

ALLOWED_GAMES = {'factory-market', 'factory-inference'}

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Health check the editor uses to confirm it's on the persisting server.
        if self.path == '/save-export/_ping':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith('/save-export/'):
            game = self.path.split('/save-export/')[1]
            if game not in ALLOWED_GAMES:
                self.send_error(400, f'Unknown game: {game}')
                return
            length = int(self.headers.get('Content-Length', 0))
            data = self.rfile.read(length)
            path = os.path.join(game, 'levels', 'export.json')
            try:
                with open(path, 'wb') as f:
                    f.write(data)
            except OSError as e:
                # Surface the failure so the editor's save reports an error
                # instead of silently believing it persisted.
                print(f'  FAILED to write {path}: {e}')
                self.send_error(500, f'Could not write {path}: {e}')
                return
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'OK')
            print(f'  saved {len(data)} bytes to {path}')
        else:
            self.send_error(404)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    port = 8090
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f'Serving {os.getcwd()} on http://localhost:{port}')
    print(f'Editable games: {", ".join(sorted(ALLOWED_GAMES))}')
    HTTPServer(('', port), Handler).serve_forever()
