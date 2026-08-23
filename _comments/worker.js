/* ollij.fi comments API — Cloudflare Worker + D1, routed at ollij.fi/api/comments/*.
   Public source, zero secrets: authentication is bearer-token-hash lookup, and every
   sensitive field (bodies, names, anchor quotes) arrives as AES-256-GCM ciphertext the
   server cannot read — the key never leaves the clients (see assets/js/comments.js and
   _comments/README.md). The server's job is structure: who may read/write, thread shape,
   timestamps, rate limits. */

const CORS_ORIGINS = new Set([
  'https://ollij.fi',
  'http://localhost:8090',   // Olli's local preview
  'http://localhost:8091',   // dev serve.py
  'http://localhost:8098',   // mockup/e2e harness
  'http://localhost:8099',   // e2e built-site server
]);
const MAX_PAYLOAD = 16 * 1024;   // b64 chars — a very long comment is ~2KB
const MAX_NAME = 1024;
const RATE_PER_HOUR = 120;       // writes per token per hour

const json = (data, status = 200, origin = null) =>
  new Response(JSON.stringify(data), { status, headers: headers(origin) });
const headers = (origin) => {
  const h = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (origin && CORS_ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization,Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
};

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function auth(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const hash = await sha256hex(m[1]);
  const row = await env.DB.prepare(
    'SELECT id, label, wrapped_key, admin FROM tokens WHERE auth_hash = ? AND revoked = 0'
  ).bind(hash).first();
  return row || null;
}

async function rateOk(env, tokenId) {
  const cutoff = Date.now() - 3600_000;
  await env.DB.prepare('DELETE FROM events WHERE ts < ?').bind(cutoff).run();
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE token = ? AND ts >= ?')
    .bind(tokenId, cutoff).first();
  if (n && n.n >= RATE_PER_HOUR) return false;
  await env.DB.prepare('INSERT INTO events (token, ts) VALUES (?, ?)').bind(tokenId, Date.now()).run();
  return true;
}

const ok = {
  id: s => typeof s === 'string' && /^[0-9a-f-]{8,64}$/.test(s),
  slug: s => typeof s === 'string' && s.length <= 200 && s.startsWith('/'),
  ct: s => typeof s === 'string' && s.length > 0 && s.length <= MAX_PAYLOAD && /^[A-Za-z0-9+/=]+$/.test(s),
  name_ct: s => typeof s === 'string' && s.length > 0 && s.length <= MAX_NAME && /^[A-Za-z0-9+/=]+$/.test(s),
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const path = url.pathname.replace(/^\/api\/comments/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });

    const tok = await auth(req, env);
    if (!tok) return json({ error: 'unauthorized' }, 401, origin);
    const now = () => new Date().toISOString();

    try {
      if (req.method === 'GET' && path === '/state') {
        const slug = url.searchParams.get('slug') || '';
        if (!ok.slug(slug)) return json({ error: 'bad slug' }, 400, origin);
        const comments = (await env.DB.prepare(
          'SELECT id, slug, author, parent, payload_ct, removed, created, edited FROM comments WHERE slug = ? ORDER BY created'
        ).bind(slug).all()).results;
        const ids = new Set(comments.map(c => c.author));
        const authors = (await env.DB.prepare('SELECT id, name_ct FROM authors').all()).results
          .filter(a => ids.has(a.id));
        return json({ admin: tok.admin ? 1 : 0, wrapped_key: tok.wrapped_key, authors, comments }, 200, origin);
      }

      if (req.method === 'GET' && path === '/index') {
        const rows = (await env.DB.prepare(
          'SELECT slug, COUNT(*) AS n, MAX(created) AS latest FROM comments WHERE removed = 0 GROUP BY slug'
        ).all()).results;
        const slugs = {};
        for (const r of rows) slugs[r.slug] = { n: r.n, latest: r.latest };
        return json({ admin: tok.admin ? 1 : 0, slugs }, 200, origin);
      }

      if (req.method === 'POST' && path === '/comment') {
        const b = await req.json();
        if (!ok.id(b.id) || !ok.slug(b.slug) || !ok.id(b.author) || !ok.ct(b.payload_ct) ||
            (b.parent != null && !ok.id(b.parent)))
          return json({ error: 'bad request' }, 400, origin);
        if (!await rateOk(env, tok.id)) return json({ error: 'rate limited' }, 429, origin);
        if (b.parent) {
          const p = await env.DB.prepare('SELECT id FROM comments WHERE id = ?').bind(b.parent).first();
          if (!p) return json({ error: 'no such parent' }, 400, origin);
        }
        await env.DB.prepare(
          'INSERT INTO comments (id, slug, author, parent, payload_ct, removed, created) VALUES (?,?,?,?,?,0,?)'
        ).bind(b.id, b.slug, b.author, b.parent || null, b.payload_ct, now()).run();
        // echo the row the database actually holds — clients verify the round-trip
        const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(b.id).first();
        return json(row, 200, origin);
      }

      if (req.method === 'POST' && path === '/edit') {
        const b = await req.json();
        if (!ok.id(b.id) || !ok.ct(b.payload_ct)) return json({ error: 'bad request' }, 400, origin);
        const row = await env.DB.prepare('SELECT author FROM comments WHERE id = ?').bind(b.id).first();
        if (!row) return json({ error: 'not found' }, 404, origin);
        if (!tok.admin && row.author !== b.author) return json({ error: 'not yours' }, 403, origin);
        if (!await rateOk(env, tok.id)) return json({ error: 'rate limited' }, 429, origin);
        await env.DB.prepare('UPDATE comments SET payload_ct = ?, edited = ? WHERE id = ?')
          .bind(b.payload_ct, now(), b.id).run();
        return json(await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(b.id).first(), 200, origin);
      }

      if (req.method === 'POST' && path === '/delete') {
        const b = await req.json();
        if (!ok.id(b.id)) return json({ error: 'bad request' }, 400, origin);
        const row = await env.DB.prepare('SELECT author, parent FROM comments WHERE id = ?').bind(b.id).first();
        if (!row) return json({ error: 'not found' }, 404, origin);
        if (!tok.admin && row.author !== b.author) return json({ error: 'not yours' }, 403, origin);
        const kids = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE parent = ?').bind(b.id).first();
        if (!row.parent && kids.n > 0) {
          // a root with replies tombstones — the thread survives, and so does its anchor:
          // the client sends an anchor-only re-encryption (quote/context, no body), since the
          // quote lives inside the ciphertext and the server can't extract it itself.
          const keep = ok.ct(b.payload_ct || '') ? b.payload_ct : null;
          await env.DB.prepare('UPDATE comments SET payload_ct = ?, removed = 1 WHERE id = ?').bind(keep, b.id).run();
          return json({ removed: true }, 200, origin);
        }
        await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(b.id).run();
        return json({ removed: false, deleted: true }, 200, origin);
      }

      if (req.method === 'POST' && path === '/author') {
        const b = await req.json();
        if (!ok.id(b.id) || !ok.name_ct(b.name_ct)) return json({ error: 'bad request' }, 400, origin);
        await env.DB.prepare(
          'INSERT INTO authors (id, name_ct, created) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name_ct = excluded.name_ct'
        ).bind(b.id, b.name_ct, now()).run();
        return json({ ok: 1 }, 200, origin);
      }

      /* ---- admin: mint / revoke / re-key / export (the CLI's surface) ---- */
      if (!tok.admin) return json({ error: 'not found' }, 404, origin);

      if (req.method === 'POST' && path === '/admin/mint') {
        const b = await req.json();
        if (typeof b.label !== 'string' || !/^[0-9a-f]{64}$/.test(b.auth_hash || '') || !ok.ct(b.wrapped_key))
          return json({ error: 'bad request' }, 400, origin);
        const id = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO tokens (id, label, auth_hash, wrapped_key, admin, revoked, created) VALUES (?,?,?,?,0,0,?)'
        ).bind(id, b.label, b.auth_hash, b.wrapped_key, now()).run();
        return json({ id }, 200, origin);
      }

      if (req.method === 'POST' && path === '/admin/revoke') {
        const b = await req.json();
        const r = await env.DB.prepare('UPDATE tokens SET revoked = 1 WHERE id = ? AND admin = 0').bind(b.id).run();
        return json({ ok: 1, changed: r.meta.changes }, 200, origin);
      }

      if (req.method === 'GET' && path === '/admin/tokens') {
        const rows = (await env.DB.prepare('SELECT id, label, admin, revoked, created FROM tokens').all()).results;
        return json({ tokens: rows }, 200, origin);
      }

      if (req.method === 'GET' && path === '/admin/export') {
        const dump = {};
        for (const t of ['tokens', 'authors', 'comments'])
          dump[t] = (await env.DB.prepare('SELECT * FROM ' + t).all()).results;
        return json(dump, 200, origin);
      }

      if (req.method === 'POST' && path === '/admin/rekey') {
        // revocation aftermath: everything re-encrypted under a fresh K, re-wrapped per token.
        const b = await req.json();
        const stmts = [];
        for (const t of b.tokens || []) {
          // token ids include the seeded literal 'admin' alongside minted UUIDs
          if (typeof t.id !== 'string' || !/^[0-9a-zA-Z-]{1,64}$/.test(t.id)) return json({ error: 'bad token id' }, 400, origin);
          if (!ok.ct(t.wrapped_key)) return json({ error: 'bad wrap' }, 400, origin);
          stmts.push(env.DB.prepare('UPDATE tokens SET wrapped_key = ? WHERE id = ?').bind(t.wrapped_key, t.id));
        }
        for (const a of b.authors || []) {
          if (!ok.id(a.id) || !ok.name_ct(a.name_ct)) return json({ error: 'bad author' }, 400, origin);
          stmts.push(env.DB.prepare('UPDATE authors SET name_ct = ? WHERE id = ?').bind(a.name_ct, a.id));
        }
        for (const c of b.comments || []) {
          if (!ok.id(c.id) || !ok.ct(c.payload_ct)) return json({ error: 'bad comment' }, 400, origin);
          stmts.push(env.DB.prepare('UPDATE comments SET payload_ct = ? WHERE id = ?').bind(c.payload_ct, c.id));
        }
        if (stmts.length) await env.DB.batch(stmts);
        return json({ ok: 1, updated: stmts.length }, 200, origin);
      }

      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'server error' }, 500, origin);   // never echo internals
    }
  }
};
