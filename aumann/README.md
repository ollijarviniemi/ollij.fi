# Aumann

A web-playable version of the Aumann agreement game from chapter 11.4 of
*Maailmantutkija*.

## What is it

Two players, each dealt 5 cards from a standard 52-card deck (private to each
player), 3 random condition cards (shown to both). The shared question: when
the 10 cards are pooled, is at least one of the 3 conditions satisfied?

Two rounds. Each round, both players simultaneously place a token in one of 5
rows on the board. Each row corresponds to a probability band (80–100% at the
top, 0–20% at the bottom) and a score (10/0, 9/4, 7, 4/9, 0/10). Between
rounds, you see where your opponent placed their token (but not their cards).
After round 2, cards are revealed, the Q is evaluated, and scores are summed
(max 40 per game).

Two perfect Bayesians who share their round-1 tokens should usually converge
to similar beliefs by round 2 — that's the Aumann angle.

## Architecture

```
aumann/
├── index.html         ← landing + game UI (one page)
├── config.js          ← edit SERVER_URL_PROD when deploying
├── css/style.css
├── js/
│   ├── cards.js       ← deck + helpers
│   ├── conditions.js  ← the 20 condition predicates
│   ├── bayesian.js    ← MC solver for round-1 + round-2 beliefs + ideal score
│   ├── storage.js     ← localStorage (player name, score history)
│   ├── render.js      ← DOM rendering
│   └── main.js        ← Socket.IO client + state → view
├── server/
│   ├── server.js      ← Express + Socket.IO server with state machine
│   ├── package.json
│   └── smoke.mjs      ← end-to-end protocol test
├── test.mjs           ← unit tests for cards/conditions/bayesian
├── calibrate.mjs      ← average ideal-Bayesian score across many games
└── package.json
```

The static client (everything but `server/`) lives at ollij.fi/aumann/. The
Node + Socket.IO server runs elsewhere and the client connects to it via
WebSocket.

## Development

```bash
# 1. start the server
cd server && npm install && npm start
# server listens on :8787

# 2. start a static file server for the client
cd .. && python3 -m http.server 4200
# open http://localhost:4200/

# 3. unit tests
node test.mjs

# 4. server protocol smoke test
cd server && node smoke.mjs

# 5. perfect-Bayesian average (slow, ~30s per 30 games)
node calibrate.mjs 30
```

## Deployment

### Client (static files)

The `aumann/` directory is served as part of ollij.fi (GitHub Pages + Jekyll).
No build step. Just commit and push to ollij.fi.

### Server (Node + Socket.IO)

The server is platform-agnostic Node. Pick a host that **doesn't sleep**
(you said new players hitting a cold-started server is unacceptable):

- **Fly.io** — `fly launch` from `server/`, set `[[services]] auto_stop_machines = false` (paid). Cheapest always-on Node.
- **Railway** — free $5/month covers an always-on small instance.
- **A VPS** — `pm2 start server.js` on any cheap Linux box.

Whichever you pick, deploy `server/` and grab the public URL.

### Wire client → server

Edit `aumann/config.js`:

```js
const SERVER_URL_PROD = 'https://your-deployed-server-url';
```

Commit and push. The client will connect to that URL on any non-localhost
origin.

## Game rules (TL;DR)

See chapter 11.4 of Maailmantutkija for the full text. Brief:

| Row | Probability band | Score if Q true | Score if Q false |
|----:|:-----------------|----------------:|-----------------:|
|   1 | 80–100%          | 10              | 0                |
|   2 | 60–80%           | 9               | 4                |
|   3 | 40–60%           | 7               | 7                |
|   4 | 20–40%           | 4               | 9                |
|   5 | 0–20%            | 0               | 10               |

Max 40 points per game (4 tokens × 10 each). Chapter benchmarks: 28 average
"easy", 30 "very good", 31 "extremely hard" — for humans. Two perfect Bayesians
should land around 33.
