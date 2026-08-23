/* ollij.fi comment layer — loaded ONLY when a capability token is present (see the
   w-base bootstrap; public visitors never load this file, and it contains no secrets).

   End-to-end encrypted: the URL-fragment token never reaches any server. Its HKDF
   "auth" half is the API bearer (stored only hashed server-side); its "kek" half
   unwraps the master comment key K in the browser. Every body, commenter name, and
   anchor quote is AES-256-GCM ciphertext at rest — the Worker stores structure only.
   Server + admin CLI live in _comments/.

   Testing/mockup seam: window.CMT_ADAPTER (async factory receiving the crypto kit)
   replaces the fetch adapter; window.CMT_API overrides the API base. */
(function () {
  'use strict';
  if (window.__cmtLoaded) return; window.__cmtLoaded = true;

  var postBody = document.querySelector('.post .post-body');
  var onIndex = /^\/writing\/?$/.test(location.pathname);
  if (!postBody && !onIndex) return;
  var SLUG = location.pathname.replace(/\/?$/, '/');

  /* ---------------- crypto kit ---------------- */
  var te = new TextEncoder(), td = new TextDecoder();
  var hex2b = function (h) { return new Uint8Array(h.match(/../g).map(function (x) { return parseInt(x, 16); })); };
  var b2hex = function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); };
  var b2b64 = function (b) { return btoa(String.fromCharCode.apply(null, new Uint8Array(b))); };
  var b642b = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  var SALT = te.encode('ollij.fi/comments/v1');

  function deriveHalves(tokenHex) {
    return crypto.subtle.importKey('raw', hex2b(tokenHex), 'HKDF', false, ['deriveBits', 'deriveKey']).then(function (km) {
      return Promise.all([
        crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: te.encode('auth') }, km, 256),
        crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: te.encode('kek') }, km,
          { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      ]).then(function (r) { return { auth: b2hex(r[0]), kek: r[1] }; });
    });
  }
  function aesEncRaw(key, bytes) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, bytes).then(function (ct) {
      var out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12); return b2b64(out);
    });
  }
  function aesDecRaw(key, b64) {
    var b = b642b(b64);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12))
      .then(function (pt) { return new Uint8Array(pt); });
  }
  var encJSON = function (key, obj) { return aesEncRaw(key, te.encode(JSON.stringify(obj))); };
  var decJSON = function (key, b64) { return aesDecRaw(key, b64).then(function (b) { return JSON.parse(td.decode(b)); }); };
  var encText = function (key, s) { return aesEncRaw(key, te.encode(s)); };
  var decText = function (key, b64) { return aesDecRaw(key, b64).then(function (b) { return td.decode(b); }); };
  var importK = function (bytes, extractable) {
    return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, extractable === true, ['encrypt', 'decrypt']);
  };
  var unwrapK = function (kek, wrappedB64) { return aesDecRaw(kek, wrappedB64).then(importK); };
  var CRYPTO = {
    deriveHalves: deriveHalves, aesEncRaw: aesEncRaw, aesDecRaw: aesDecRaw,
    encJSON: encJSON, decJSON: decJSON, encText: encText, decText: decText,
    unwrapK: unwrapK, importK: importK,
    wrapK: function (kek, kBytes) { return aesEncRaw(kek, kBytes); },
    genToken: function () { return b2hex(crypto.getRandomValues(new Uint8Array(16))); },
    genK: function () { return crypto.getRandomValues(new Uint8Array(32)); },
    b2hex: b2hex, hex2b: hex2b, b2b64: b2b64, b642b: b642b
  };

  /* ---------------- API adapter ---------------- */
  var API = window.CMT_API || (location.hostname === 'ollij.fi' ? '/api/comments' : 'https://ollij.fi/api/comments');
  function realAdapter(auth) {
    function call(path, body) {
      return fetch(API + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Authorization': 'Bearer ' + auth, 'Content-Type': 'application/json' }
                      : { 'Authorization': 'Bearer ' + auth },
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) {
        if (r.status === 401 || r.status === 403) { var e = new Error('unauthorized'); e.auth = true; throw e; }
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      });
    }
    return {
      state: function (slug) { return call('/state?slug=' + encodeURIComponent(slug)); },
      index: function () { return call('/index'); },
      post: function (c) { return call('/comment', c); },
      edit: function (id, author, payload_ct) { return call('/edit', { id: id, author: author, payload_ct: payload_ct }); },
      del: function (id, author, payload_ct) { return call('/delete', { id: id, author: author, payload_ct: payload_ct || null }); },
      setName: function (id, name_ct) { return call('/author', { id: id, name_ct: name_ct }); }
    };
  }

  /* ---------------- storage helpers (never let a private-mode failure break the page) -------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  var uuid = function () { return b2hex(crypto.getRandomValues(new Uint8Array(16))); };

  /* ---------------- style (injected so site.css stays untouched) ---------------- */
  var CSS = [
    '.post{position:relative}',
    'body[data-cmt="off"] .cmt-rail{display:none!important}',
    'body[data-cmt="off"] .cmt-anchor{background:transparent!important;box-shadow:none!important;cursor:text}',
    '.cmt-anchor{background:rgba(124,45,45,.10);box-shadow:inset 0 -1px 0 rgba(124,45,45,.35);cursor:pointer;transition:background .12s}',
    '[data-theme="dark"] .cmt-anchor{background:rgba(217,140,122,.13);box-shadow:inset 0 -1px 0 rgba(217,140,122,.4)}',
    '.cmt-anchor:hover,.cmt-anchor.hov{background:rgba(124,45,45,.17)}',
    '.cmt-anchor.active{background:rgba(124,45,45,.22)}',
    '[data-theme="dark"] .cmt-anchor:hover,[data-theme="dark"] .cmt-anchor.hov{background:rgba(217,140,122,.22)}',
    '[data-theme="dark"] .cmt-anchor.active{background:rgba(217,140,122,.28)}',
    '.cmt-rail{position:absolute;top:0;left:calc(50% + 25.5rem);width:17.5rem}',
    '@media (max-width:88rem){.cmt-rail{left:auto;right:.6rem;width:13rem}}',
    '@media (max-width:72rem){.cmt-rail{display:none}}',
    '.cmt-card{visibility:hidden;position:absolute;width:100%;box-sizing:border-box;padding:.55rem .7rem .6rem;',
    ' border-left:2px solid var(--accent-dim);background:var(--bg-offset);border-radius:0 3px 3px 0;color:var(--ink);',
    " font-family:var(--sp-apparatus,'EB Garamond',Garamond,serif);font-size:.86rem;line-height:1.45;cursor:pointer;",
    ' transition:transform .12s,box-shadow .12s,top .18s ease}',
    '.cmt-card.laid{visibility:visible}',
    '.cmt-card.active{transform:translateX(-.55rem);box-shadow:0 1px 6px rgba(0,0,0,.18);border-left-color:var(--accent)}',
    '.cmt-card.cmt-static{position:static;visibility:visible;width:auto;max-width:34rem;margin:0 0 .6rem;cursor:pointer}',
    '.cmt-who{font-size:.76rem;color:var(--muted);margin-bottom:.18rem}',
    '.cmt-who b{font-weight:600;color:var(--ink)}',
    '.cmt-who b.olli{color:var(--accent)}',
    '.cmt-who b.cmt-mine-name{cursor:text;border-bottom:1px dashed transparent}',
    '.cmt-who b.cmt-mine-name:hover,.cmt-who b.cmt-mine-name:focus{border-bottom-color:var(--muted);outline:none}',
    '.cmt-edit{float:right;opacity:0;color:var(--muted);font-size:.72rem;cursor:pointer;transition:opacity .12s}',
    '.cmt-card:hover .cmt-edit,.cmt-item:hover .cmt-edit{opacity:.5}',
    '.cmt-edit:hover{opacity:1!important;color:var(--accent)}',
    '.cmt-body{margin:0;white-space:pre-wrap;overflow-wrap:break-word}',
    '.cmt-body a{color:inherit}',
    '.cmt-removed{color:var(--muted);font-style:italic}',
    '.cmt-quote{color:var(--muted);font-style:italic;font-size:.78rem;margin-bottom:.25rem;',
    ' border-left:2px solid var(--rule);padding-left:.45rem}',
    '.cmt-thread{margin-top:.5rem;padding-top:.45rem;border-top:1px solid var(--rule)}',
    '.cmt-compose textarea{width:100%;box-sizing:border-box;font:inherit;line-height:1.45;border:none;outline:none;',
    ' background:transparent;resize:none;overflow:hidden;min-height:1.5em;padding:0;color:var(--ink);display:block}',
    '.cmt-hint{font-size:.68rem;color:var(--muted);margin-top:.25rem;text-align:right}',
    '.cmt-fail{border-left-color:#a33!important}',
    '.cmt-failline{font-size:.72rem;color:var(--accent);cursor:pointer;margin-top:.3rem}',
    '.cmt-mast{cursor:pointer;white-space:nowrap}',
    '.cmt-mast.off{opacity:.45}',
    '.cmt-info{cursor:pointer;opacity:.4;margin-left:.3rem;font-size:.8em;transition:opacity .12s}',
    '.cmt-info:hover{opacity:1}',
    '.cmt-panel{position:fixed;top:4.2rem;right:.8rem;width:19rem;max-width:calc(100vw - 2rem);z-index:70;',
    ' background:var(--bg-offset);border-left:2px solid var(--accent-dim);border-radius:0 3px 3px 0;',
    " padding:.85rem .95rem .8rem;font-family:var(--sp-apparatus,'EB Garamond',Garamond,serif);font-size:.9rem;",
    ' line-height:1.5;color:var(--ink);box-shadow:0 2px 14px rgba(0,0,0,.16)}',
    '.cmt-panel p{margin:0 0 .6rem}',
    '.cmt-panel input{font:inherit;font-weight:600;color:var(--ink);background:transparent;border:none;',
    ' border-bottom:1px dashed var(--rule);outline:none;padding:0 0 .1rem;width:11rem;display:block}',
    '.cmt-panel input:focus{border-bottom-color:var(--muted)}',
    '.cmt-note{color:var(--muted);font-size:.78rem;letter-spacing:0;text-transform:none}',
    '.cmt-count{color:var(--muted);font-size:.78rem}',
    /* narrow screens: thread opens as a bottom sheet; a small chip offers "comment" on selection */
    '.cmt-sheet{display:none;position:fixed;left:0;right:0;bottom:0;max-height:70vh;overflow-y:auto;z-index:60;',
    ' background:var(--bg);border-top:1px solid var(--rule);box-shadow:0 -6px 30px rgba(0,0,0,.25);padding:.8rem 1rem 1rem}',
    '.cmt-sheet.open{display:block}',
    '.cmt-sheet .cmt-card{position:static;visibility:visible;width:auto;max-width:none;transform:none;box-shadow:none}',
    '.cmt-chip{position:absolute;z-index:55;font-family:var(--sp-apparatus,serif);font-size:.78rem;padding:.15rem .55rem;',
    ' background:var(--bg-offset);color:var(--ink);border:1px solid var(--rule);border-radius:3px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18)}'
  ].join('\n');

  /* ---------------- shared DOM helpers ---------------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function stamp(iso) {
    var t = iso ? new Date(iso) : new Date(); var now = new Date();
    var y = t.getFullYear() === now.getFullYear() ? '' : ' ' + t.getFullYear();
    return t.toLocaleString('en', { month: 'short' }) + ' ' + t.getDate() + y + ', ' +
      String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  }
  function mastheadSlot() {
    return document.querySelector('.masthead .mnav') || document.querySelector('.masthead');
  }
  function mastheadNote(text) {
    var m = mastheadSlot(); if (!m) return;
    m.appendChild(el('span', 'cmt-note', text));
  }

  /* ================= main ================= */
  (function main() {
    var frag = (location.hash || '').match(/^#([0-9a-f]{32})$/);
    var token = frag ? frag[1] : lsGet('cmt_token');
    if (!token && !window.CMT_ADAPTER) return;

    var halves = null, adapter = null, K = null, admin = false;
    var authors = {};                 // id → plaintext name
    var myId = lsGet('cmt_author');   // created lazily at first post
    var myName = lsGet('cmt_name') || '';
    var hidden = lsGet('cmt_hidden') === '1';
    var comments = [];                // decrypted records
    var ready = (token ? deriveHalves(token) : Promise.resolve(null)).then(function (h) {
      halves = h;
      return window.CMT_ADAPTER ? window.CMT_ADAPTER(CRYPTO) : realAdapter(halves.auth);
    }).then(function (a) {
      adapter = a;
      return onIndex ? adapter.index() : adapter.state(SLUG);
    }).then(function (st) {
      if (frag) {
        lsSet('cmt_token', token);
        history.replaceState(null, '', location.pathname + location.search);
      }
      var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
      if (onIndex) return initIndex(st);
      admin = !!st.admin;
      return (st.key ? Promise.resolve(st.key) : unwrapK(halves.kek, st.wrapped_key)).then(function (k) {
        K = k;
        return decryptState(st);
      }).then(initPost);
    }).catch(function (err) {
      if (err && err.auth) {
        if (frag) mastheadNote('comment link no longer valid');
        else lsDel('cmt_token');
      }
      // network failure with a stored token: the layer is simply absent this visit
    });

    function decryptState(st) {
      var jobs = [];
      (st.authors || []).forEach(function (a) {
        jobs.push(a.name_ct ? decText(K, a.name_ct).then(function (n) { authors[a.id] = n; })
                                .catch(function () { authors[a.id] = '?'; })
                            : Promise.resolve());
      });
      comments = [];
      (st.comments || []).forEach(function (c) {
        var rec = { id: c.id, author: c.author, parent: c.parent || null, created: c.created,
                    edited: c.edited || null, removed: !!c.removed, payload: null };
        comments.push(rec);
        if (c.payload_ct) jobs.push(decJSON(K, c.payload_ct).then(function (p) { rec.payload = p; })
                                      .catch(function () { rec.removed = true; }));
      });
      return Promise.all(jobs);
    }

    /* ================= /writing/ index: quiet counts + "N new" ================= */
    function initIndex(idx) {
      var slugs = idx.slugs || {};
      var seen = {}; try { seen = JSON.parse(lsGet('cmt_seen') || '{}'); } catch (e) {}
      var fresh = [], any = false;
      Object.keys(slugs).forEach(function (s) {
        if (!slugs[s].n) return;
        any = true;
        if (!seen[s] || (slugs[s].latest && slugs[s].latest > seen[s])) fresh.push(s);
        document.querySelectorAll('.wlist a').forEach(function (a) {
          if (a.getAttribute('href') === s || a.getAttribute('href') === s.replace(/\/$/, ''))
            if (!a.parentNode.querySelector('.cmt-count'))
              a.parentNode.insertBefore(el('span', 'cmt-count', ' · ' + slugs[s].n), a.nextSibling);
        });
      });
      if (fresh.length) {
        var m = mastheadSlot(); if (!m) return;
        fresh.sort(function (a, b) { return (slugs[b].latest || '').localeCompare(slugs[a].latest || ''); });
        var link = el('a', 'cmt-mast', 'comments · ' + fresh.length + ' new');
        link.href = fresh[0];
        m.appendChild(link);
      } else if (any) { /* counts on titles say the rest — no extra chrome */ }
    }

    /* ================= post page ================= */
    var rail, mastItem, sheet, idxCache = null;

    function initPost() {
      // no name yet -> the layer stays dark: no cards, no washes, no counts.
      // The panel is the whole surface until a name is saved (then initFull runs).
      if (!myName) { openPanel(true); return; }
      initFull();
    }
    function initFull() {
      document.body.setAttribute('data-cmt', hidden ? 'off' : 'on');
      rail = el('div', 'cmt-rail');
      document.querySelector('.post').appendChild(rail);
      buildLayer();
      buildMasthead();
      restoreDrafts();
      wireSelection();
      wireCopy();
      markSeen();
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refresh();
      });
      addEventListener('resize', function () { layout(); });
      addEventListener('load', function () { layout(); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); });
    }

    function markSeen() {
      var seen = {}; try { seen = JSON.parse(lsGet('cmt_seen') || '{}'); } catch (e) {}
      seen[SLUG] = new Date().toISOString();
      lsSet('cmt_seen', JSON.stringify(seen));
    }

    /* ---------- anchoring: quote + context + offset hint, per-text-node wrapping ---------- */
    function textIndex() {
      var w = document.createTreeWalker(postBody, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          // KaTeX subtrees duplicate their text (MathML + HTML); anchors skip them wholesale
          return n.parentElement && n.parentElement.closest('.katex, script, style')
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      var s = '', nodes = [];
      while (w.nextNode()) { nodes.push({ node: w.currentNode, start: s.length }); s += w.currentNode.nodeValue; }
      return { text: s, nodes: nodes };
    }
    function findOccurrence(idx, p) {
      if (!p || !p.q) return -1;
      var occ = [], i = idx.text.indexOf(p.q);
      while (i !== -1 && occ.length < 60) { occ.push(i); i = idx.text.indexOf(p.q, i + 1); }
      if (!occ.length) return -1;
      var best = occ[0], bs = -Infinity;
      occ.forEach(function (o) {
        var sc = 0;
        if (p.p && idx.text.slice(Math.max(0, o - p.p.length), o) === p.p) sc += 2;
        if (p.s && idx.text.slice(o + p.q.length, o + p.q.length + p.s.length) === p.s) sc += 2;
        sc -= Math.abs(o - (p.h || 0)) / Math.max(idx.text.length, 1);
        if (sc > bs) { bs = sc; best = o; }
      });
      return best;
    }
    function wrapOffsets(idx, start, end, id) {
      var spans = [];
      idx.nodes.forEach(function (rec) {
        var nStart = rec.start, nEnd = rec.start + rec.node.nodeValue.length;
        if (nEnd <= start || nStart >= end) return;
        var a = Math.max(start, nStart) - nStart, b = Math.min(end, nEnd) - nStart;
        var n = rec.node;
        if (a > 0) n = n.splitText(a);
        if (b - a < n.nodeValue.length) n.splitText(b - a);
        var sp = el('span', 'cmt-anchor'); sp.dataset.c = id;
        n.parentNode.insertBefore(sp, n); sp.appendChild(n);
        sp.addEventListener('click', function (e) { e.stopPropagation(); anchorClicked(id); });
        sp.addEventListener('mouseenter', function () { cardFor(id) && cardFor(id).classList.add('hov-src'); pair(id, true); });
        sp.addEventListener('mouseleave', function () { pair(id, false); });
        spans.push(sp);
      });
      return spans;
    }
    function unwrapAnchor(id) {
      document.querySelectorAll('.cmt-anchor[data-c="' + id + '"]').forEach(function (sp) {
        while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
        sp.remove();
      });
      postBody.normalize();
    }
    function pair(id, on) {
      document.querySelectorAll('.cmt-anchor[data-c="' + id + '"]').forEach(function (sp) { sp.classList.toggle('hov', on); });
      var c = cardFor(id); if (c) c.style.boxShadow = on ? '0 1px 6px rgba(0,0,0,.15)' : '';
    }
    function boundaryPos(idx, container, offset) {
      if (container.nodeType === 3) {
        for (var i = 0; i < idx.nodes.length; i++) if (idx.nodes[i].node === container) return idx.nodes[i].start + offset;
        return -1;
      }
      var ref = container.childNodes[offset] || null;
      for (var j = 0; j < idx.nodes.length; j++) {
        var n = idx.nodes[j].node;
        if (!ref) {
          if (!container.contains(n) && (container.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING))
            return idx.nodes[j].start;
        } else if (n === ref || (ref.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) || ref.contains(n)) {
          return idx.nodes[j].start;
        }
      }
      return idx.text.length;
    }
    function anchorFromSelection() {
      var s = getSelection();
      if (!s || s.isCollapsed || !s.rangeCount) return null;
      var r = s.getRangeAt(0);
      if (!postBody.contains(r.commonAncestorContainer)) return null;
      var idx = textIndex();
      var start = boundaryPos(idx, r.startContainer, r.startOffset);
      var end = boundaryPos(idx, r.endContainer, r.endOffset);
      if (start < 0 || end <= start) return null;
      while (start < end && /\s/.test(idx.text[start])) start++;
      while (end > start && /\s/.test(idx.text[end - 1])) end--;
      var q = idx.text.slice(start, end);
      if (q.trim().length < 2) return null;
      return { q: q, p: idx.text.slice(Math.max(0, start - 32), start), s: idx.text.slice(end, end + 32), h: start };
    }

    /* ---------- rail cards ---------- */
    function cardFor(id) { return rail.querySelector('.cmt-card[data-c="' + id + '"]'); }
    function isMine(rec) { return myId && rec.author === myId; }
    function editable(rec) { return admin || isMine(rec); }
    function nameOf(rec) { return isMine(rec) ? (myName || 'you') : (authors[rec.author] || '?'); }

    function whoRow(rec, onEdit) {
      var row = el('div', 'cmt-who cmt-item');
      if (rec.removed) { row.appendChild(el('span', 'cmt-removed', '[deleted]')); return row; }
      var b = el('b', null, nameOf(rec));
      if (nameOf(rec) === 'Olli') b.classList.add('olli');
      if (isMine(rec)) { b.classList.add('cmt-mine-name'); bindNameEdit(b); }
      row.appendChild(b);
      row.appendChild(document.createTextNode(' · ' + stamp(rec.created) + (rec.edited ? ' · edited' : '')));
      if (editable(rec) && onEdit) {
        var ed = el('span', 'cmt-edit', 'edit');
        ed.addEventListener('click', function (e) { e.stopPropagation(); onEdit(); });
        row.appendChild(ed);
      }
      return row;
    }
    function bodyP(rec, onEdit) {
      if (rec.removed) return el('p', 'cmt-body');
      var p = el('p', 'cmt-body', rec.payload ? rec.payload.b : '');
      if (editable(rec) && onEdit) p.addEventListener('dblclick', function (e) { e.stopPropagation(); onEdit(); });
      return p;
    }
    function renderItem(rec, container) {
      container.textContent = '';
      container.classList.remove('cmt-compose', 'cmt-reply-compose');
      container._discard = null;
      var doEdit = function () { enterEdit(rec, container); };
      container.appendChild(whoRow(rec, doEdit));
      container.appendChild(bodyP(rec, doEdit));
    }
    function buildCard(rec) {
      var card = el('div', 'cmt-card' + (isMine(rec) ? ' mine' : ''));
      card.dataset.c = rec.id;
      if (rec.orphan && rec.payload && rec.payload.q) {
        var q = rec.payload.q;
        card.appendChild(el('div', 'cmt-quote', q.length > 140 ? q.slice(0, 140) + '…' : q));
      }
      var item = el('div', 'cmt-item-root');
      card.appendChild(item);
      renderItem(rec, item);
      comments.filter(function (c) { return c.parent === rec.id; })
        .sort(function (a, b) { return (a.created || '').localeCompare(b.created || ''); })
        .forEach(function (rep) {
          var t = el('div', 'cmt-thread'); t.dataset.id = rep.id;
          card.appendChild(t); renderItem(rep, t);
        });
      card.addEventListener('click', function () { openReply(card, rec); });
      card.addEventListener('mouseenter', function () { pair(rec.id, true); });
      card.addEventListener('mouseleave', function () { pair(rec.id, false); });
      return card;
    }

    function buildLayer() {
      rail.textContent = '';
      document.querySelectorAll('.cmt-anchor').forEach(function (sp) {
        while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
        sp.remove();
      });
      postBody.normalize();
      var roots = comments.filter(function (c) { return !c.parent && c.payload && c.payload.q; });
      // wrap in document order so offset hints stay honest as nodes split
      roots.forEach(function (rec) {
        var idx = textIndex();
        var at = findOccurrence(idx, rec.payload);
        if (at === -1) { rec.orphan = true; rec.pos = rec.payload.h || 0; return; }
        rec.orphan = false; rec.pos = at;
        wrapOffsets(idx, at, at + rec.payload.q.length, rec.id);
      });
      roots.sort(function (a, b) { return a.pos - b.pos; });
      roots.forEach(function (rec) { rail.appendChild(buildCard(rec)); });
      layout();
    }

    /* ---------- rail layout: active thread pins to its anchor, neighbors shove away ---------- */
    function anchorTop(id) {
      var sp = document.querySelector('.cmt-anchor[data-c="' + id + '"]');
      if (!sp) return null;
      return sp.getBoundingClientRect().top + scrollY;
    }
    function layout() {
      if (!rail) return;
      var railTop = document.querySelector('.post').getBoundingClientRect().top + scrollY;
      var cards = Array.prototype.slice.call(rail.querySelectorAll('.cmt-card'));
      if (!cards.length) return;
      var want = cards.map(function (c) {
        var a = anchorTop(c.dataset.c);
        return a === null ? null : a - railTop;
      });
      // fill gaps (orphans / drafts without live anchors) with the previous desired position
      var lastW = 0;
      want = want.map(function (w) { if (w === null) w = lastW; lastW = w; return w; });
      var ai = cards.findIndex(function (c) { return c.classList.contains('active'); });
      var tops = new Array(cards.length), GAP = 10;
      var startI = ai >= 0 ? ai : 0;
      tops[startI] = want[startI];
      for (var i = startI + 1; i < cards.length; i++)
        tops[i] = Math.max(want[i], tops[i - 1] + cards[i - 1].offsetHeight + GAP);
      for (var j = startI - 1; j >= 0; j--)
        tops[j] = Math.min(want[j], tops[j + 1] - cards[j].offsetHeight - GAP);
      cards.forEach(function (c, k) {
        c.style.top = tops[k] + 'px';
        c.classList.add('laid');
      });
    }
    function activate(id) {
      document.querySelectorAll('.cmt-card,.cmt-anchor').forEach(function (e) {
        e.classList.toggle('active', e.dataset.c === id);
      });
      layout();
    }

    /* ---------- composers ---------- */
    function composeInto(container, opts) {
      // opts: {text, onPost(text), onDiscard, quote} — a name always exists here
      // (the panel gate runs before the layer activates)
      var ta = document.createElement('textarea'); ta.rows = 1;
      if (opts.text) ta.value = opts.text;
      container.appendChild(ta);
      var hint = el('div', 'cmt-hint', 'Ctrl+Enter');
      container.appendChild(hint);
      container.classList.add('cmt-compose');
      container._quote = opts.quote || null;
      container._discard = function () { opts.onDiscard && opts.onDiscard(); };
      var grow = function () { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; layout(); };
      ta.addEventListener('input', function () {
        grow();
        if (opts.allowDelete) hint.textContent = ta.value.trim() ? 'Ctrl+Enter' : 'Ctrl+Enter · delete';
        opts.onInput && opts.onInput(ta.value);
      });
      function submit() {
        var v = ta.value; // allowDelete: empty submit means delete
        if (!v.trim() && !opts.allowDelete) return;
        opts.onPost(v, myName);
      }
      var keys = function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); container._discard(); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
      };
      ta.addEventListener('keydown', keys);
      setTimeout(function () { grow(); if (!opts.noFocus) ta.focus(); }, 0);
      return ta;
    }
    function sweepEmptyComposers(except) {
      document.querySelectorAll('.cmt-compose').forEach(function (c) {
        if (except && (c === except || c.contains(except) || except.contains(c))) return;
        var t = c.querySelector('textarea');
        if (t && !t.value.trim() && c._discard) c._discard();
      });
    }

    /* ---------- fail-loud persistence ---------- */
    function showFail(container, retry) {
      container.classList.add('cmt-fail');
      if (!container.querySelector('.cmt-failline')) {
        var line = el('div', 'cmt-failline', 'not saved — retry');
        line.addEventListener('click', function (e) { e.stopPropagation(); retry(); });
        container.appendChild(line);
      }
    }
    function clearFail(container) {
      container.classList.remove('cmt-fail');
      var l = container.querySelector('.cmt-failline'); if (l) l.remove();
    }
    function ensureAuthor() {
      if (!myId) { myId = uuid(); lsSet('cmt_author', myId); }
      return encText(K, myName).then(function (ct) { return adapter.setName(myId, ct); });
    }
    function persist(rec, container, after) {
      encJSON(K, rec.payload).then(function (payload_ct) {
        return ensureAuthor().then(function () {
          return adapter.post({ id: rec.id, slug: SLUG, parent: rec.parent, author: myId, payload_ct: payload_ct });
        });
      }).then(function (res) {
        if (!res || !res.created) throw new Error('no server echo');   // round-trip verified, not assumed
        rec.created = res.created;
        authors[myId] = myName;
        clearFail(container);
        after && after();
      }).catch(function () {
        showFail(container, function () { persist(rec, container, after); });
      });
    }

    /* ---------- new anchored comment ---------- */
    var draftSeq = 0;
    function newComposer(anchor, prefillText, noFocus) {
      var id = 'new-' + (++draftSeq) + '-' + uuid().slice(0, 6);
      var idx = textIndex();
      var at = findOccurrence(idx, anchor);
      if (at !== -1) wrapOffsets(idx, at, at + anchor.q.length, id);
      var card = el('div', 'cmt-card mine active'); card.dataset.c = id;
      rail.appendChild(card);
      var discard = function () { card.remove(); unwrapAnchor(id); dropDraft(id); layout(); };
      composeInto(card, {
        quote: anchor.q,
        text: prefillText || '',
        noFocus: noFocus,
        onDiscard: discard,
        onInput: function (v) { saveDraft(id, { anchor: anchor, text: v }); },
        onPost: function (text) {
          dropDraft(id);
          var rec = { id: uuid(), author: myId || (myId = uuid(), lsSet('cmt_author', myId), myId),
                      parent: null, created: new Date().toISOString(), edited: null, removed: false,
                      payload: { b: text, q: anchor.q, p: anchor.p, s: anchor.s, h: anchor.h } };
          comments.push(rec);
          // optimistic: the card becomes the posted card in place; anchor id follows the real id
          document.querySelectorAll('.cmt-anchor[data-c="' + id + '"]').forEach(function (sp) { sp.dataset.c = rec.id; });
          var posted = buildCard(rec);
          card.replaceWith(posted);
          activate(rec.id);
          persist(rec, posted, function () { layout(); });
        }
      });
      activate(id);
      getSelection().removeAllRanges && getSelection().removeAllRanges();
      layout();
      return card;
    }

    function wireSelection() {
      postBody.addEventListener('mouseup', function () {
        setTimeout(function () {
          if (document.body.getAttribute('data-cmt') !== 'on') return;
          var open = document.querySelector('.cmt-compose textarea');
          if (open && open.value.trim()) return;   // don't steal a half-typed thought
          var anchor = anchorFromSelection();
          if (!anchor) return;
          sweepEmptyComposers(null);
          if (narrow()) { showChip(anchor); return; }
          newComposer(anchor);
        }, 10);
      });
    }
    function wireCopy() {
      document.addEventListener('copy', function (e) {
        var a = document.activeElement;
        if (a && a.tagName === 'TEXTAREA' && !a.value) {
          var c = a.closest('.cmt-compose');
          if (c && c._quote) { e.clipboardData.setData('text/plain', c._quote); e.preventDefault(); }
        }
      });
    }

    /* ---------- reply ---------- */
    function openReply(card, rec, noFocus) {
      var live = card.querySelector('.cmt-compose textarea');   // reply OR in-place edit in progress
      if (live) { if (!noFocus) live.focus(); return; }
      if (card.classList.contains('cmt-compose')) { if (!noFocus) card.querySelector('textarea').focus(); return; }
      activate(rec.id);
      sweepEmptyComposers(card);
      var d = el('div', 'cmt-thread cmt-reply-compose');
      card.appendChild(d);
      var discard = function () { d.remove(); dropDraft('re-' + rec.id); layout(); };
      composeInto(d, {
        noFocus: noFocus,
        onDiscard: discard,
        onInput: function (v) { saveDraft('re-' + rec.id, { parent: rec.id, text: v }); },
        onPost: function (text) {
          dropDraft('re-' + rec.id);
          var rep = { id: uuid(), author: myId || (myId = uuid(), lsSet('cmt_author', myId), myId),
                      parent: rec.id, created: new Date().toISOString(), edited: null, removed: false,
                      payload: { b: text } };
          comments.push(rep);
          var t = el('div', 'cmt-thread'); t.dataset.id = rep.id;
          d.replaceWith(t);
          renderItem(rep, t);
          t.classList.add('mine');
          persist(rep, t, function () { layout(); });
          layout();
        }
      });
      layout();
    }
    function anchorClicked(id) {
      var card = cardFor(id);
      if (!card) return;
      if (narrow()) { openSheet(card); return; }
      var rec = comments.filter(function (c) { return c.id === id; })[0];
      if (card.classList.contains('cmt-compose')) { activate(id); card.querySelector('textarea').focus(); }
      else if (rec) openReply(card, rec);
    }

    /* ---------- edit / delete ---------- */
    function enterEdit(rec, container) {
      if (container.querySelector('textarea')) return;
      var old = { who: container.querySelector('.cmt-who'), body: container.querySelector('.cmt-body') };
      container.textContent = '';
      composeInto(container, {
        text: rec.payload ? rec.payload.b : '',
        allowDelete: true,
        onDiscard: function () { renderItem(rec, container); layout(); },
        onPost: function (text) {
          if (!text.trim()) return doDelete(rec, container);
          var newPayload = {}; Object.keys(rec.payload || {}).forEach(function (k) { newPayload[k] = rec.payload[k]; });
          newPayload.b = text.trim();
          encJSON(K, newPayload).then(function (ct) {
            return adapter.edit(rec.id, myId, ct);
          }).then(function (res) {
            if (!res || !res.edited) throw new Error('no server echo');
            rec.payload = newPayload; rec.edited = res.edited;
            renderItem(rec, container); clearFail(container); layout();
          }).catch(function () {
            renderItem(rec, container);
            showFail(container, function () { enterEdit(rec, container); });
            layout();
          });
        }
      });
      layout();
    }
    function doDelete(rec, container) {
      // roots keep an anchor-only ciphertext so a tombstoned thread stays attached to its text
      var anchorOnly = (!rec.parent && rec.payload && rec.payload.q)
        ? { q: rec.payload.q, p: rec.payload.p, s: rec.payload.s, h: rec.payload.h } : null;
      (anchorOnly ? encJSON(K, anchorOnly) : Promise.resolve(null)).then(function (ct) {
        return adapter.del(rec.id, myId, ct);
      }).then(function (res) {
        if (rec.parent) {
          comments = comments.filter(function (c) { return c.id !== rec.id; });
          var th = container.closest('.cmt-thread'); (th || container).remove();
          layout(); return;
        }
        if (res && res.removed) {           // tombstone: replies keep the anchor alive
          rec.removed = true; rec.payload = anchorOnly;
          renderItem(rec, container); layout();
        } else {
          comments = comments.filter(function (c) { return c.id !== rec.id && c.parent !== rec.id; });
          unwrapAnchor(rec.id);
          var card = cardFor(rec.id); if (card) card.remove();
          layout();
        }
      }).catch(function () {
        renderItem(rec, container);
        showFail(container, function () { doDelete(rec, container); });
      });
    }

    /* ---------- name: saved once, shown on every card, edited anywhere it appears ---------- */
    function saveName(v) {
      myName = v; lsSet('cmt_name', v);
      document.querySelectorAll('.cmt-mine-name').forEach(function (n) { n.textContent = v; });
      if (myId) encText(K, v).then(function (ct) { return adapter.setName(myId, ct); })
        .then(function () { authors[myId] = v; })
        .catch(function () { mastheadFlash('name not saved — will retry on next comment'); });
    }
    function bindNameEdit(b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        b.contentEditable = 'true'; b.focus();
        getSelection().selectAllChildren(b);
      });
      b.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); b.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); b.textContent = myName || 'you'; b.blur(); }
      });
      b.addEventListener('blur', function () {
        b.contentEditable = 'false';
        var v = b.textContent.trim();
        if (!v || v === myName) { b.textContent = myName || 'you'; return; }
        saveName(v);
      });
    }
    function mastheadFlash(text) {
      var m = mastheadSlot(); if (!m) return;
      var n = el('span', 'cmt-note', text); m.appendChild(n);
      setTimeout(function () { n.remove(); }, 4000);
    }

    /* ---------- the panel: first-visit gate, and the (i) info/identity surface ---------- */
    var PANEL_TEXT = 'Hey! You have comment access on my posts. Comments you post will be ' +
      'visible to others with a comment-level link, but not publicly, like Google Docs. ' +
      '(But consider that anyone with a comment-level link could share what you write.)';
    var panel = null;
    function closePanel() { if (panel) { panel.remove(); panel = null; } }
    function panelOutside(e) {
      if (panel && !panel.contains(e.target) && !e.target.closest('.cmt-info')) closePanel();
      else if (panel) document.addEventListener('mousedown', panelOutside, { once: true });
    }
    function openPanel(gated) {
      if (panel) { closePanel(); if (!gated) return; }
      panel = el('div', 'cmt-panel');
      panel.appendChild(el('p', null, PANEL_TEXT));
      var inp = el('input'); inp.placeholder = 'your name'; inp.value = myName;
      panel.appendChild(inp);
      panel.appendChild(el('div', 'cmt-hint', 'Enter · save'));
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          var v = inp.value.trim();
          if (!v) return;                       // the gate holds until a name exists
          var first = gated;
          if (v !== myName) saveName(v);
          closePanel();
          if (first) initFull();
        }
        if (e.key === 'Escape' && !gated) { e.preventDefault(); closePanel(); }
      });
      document.body.appendChild(panel);
      setTimeout(function () {
        inp.focus();
        if (!gated) document.addEventListener('mousedown', panelOutside, { once: true });
      }, 0);
    }

    /* ---------- masthead item: confirmation, count, and the on/off switch in one ---------- */
    function buildMasthead() {
      var m = mastheadSlot(); if (!m) return;
      mastItem = el('a', 'cmt-mast' + (hidden ? ' off' : ''));
      mastItem.href = '#';
      updateMastLabel();
      mastItem.addEventListener('click', function (e) {
        e.preventDefault();
        hidden = !hidden;
        lsSet('cmt_hidden', hidden ? '1' : '0');
        document.body.setAttribute('data-cmt', hidden ? 'off' : 'on');
        mastItem.classList.toggle('off', hidden);
        updateMastLabel();
        if (!hidden) layout();
      });
      m.appendChild(mastItem);
      var info = el('span', 'cmt-info', 'ⓘ');
      info.title = 'about commenting · your name';
      info.addEventListener('click', function (e) { e.stopPropagation(); openPanel(false); });
      m.appendChild(info);
    }
    function updateMastLabel() {
      var n = comments.filter(function (c) { return !c.removed; }).length;
      mastItem.textContent = hidden || !n ? 'comments' : 'comments · ' + n;
    }

    /* ---------- drafts survive reloads (the editor's safety-net pattern) ---------- */
    var DKEY = 'cmt_drafts:' + SLUG;
    function loadDrafts() { try { return JSON.parse(lsGet(DKEY) || '{}'); } catch (e) { return {}; } }
    function saveDraft(id, d) {
      var all = loadDrafts();
      if (d.text && d.text.trim()) { all[id] = d; } else { delete all[id]; }
      lsSet(DKEY, JSON.stringify(all));
    }
    function dropDraft(id) { var all = loadDrafts(); delete all[id]; lsSet(DKEY, JSON.stringify(all)); }
    function restoreDrafts() {
      var all = loadDrafts();
      lsDel(DKEY);   // anchored drafts get fresh ids below; each recreated composer re-saves itself
      Object.keys(all).forEach(function (id) {
        var d = all[id];
        if (d.general) {
          // pre-2026-08-04 drafts from the removed post-level composer: nothing to restore into
        } else if (d.parent) {
          var rec = comments.filter(function (c) { return c.id === d.parent; })[0];
          var card = rec && cardFor(rec.id);
          if (card) { openReply(card, rec, true); var t = card.querySelector('.cmt-reply-compose textarea'); if (t) { t.value = d.text; t.dispatchEvent(new Event('input')); } }
        } else if (d.anchor) {
          var c = newComposer(d.anchor, d.text, true);
          var ta2 = c.querySelector('textarea'); if (ta2) ta2.dispatchEvent(new Event('input'));
        }
      });
    }

    /* ---------- narrow screens: sheet + chip ---------- */
    function narrow() { return matchMedia('(max-width: 72rem)').matches; }
    function ensureSheet() {
      if (sheet) return sheet;
      sheet = el('div', 'cmt-sheet');
      document.body.appendChild(sheet);
      document.addEventListener('click', function (e) {
        if (sheet.classList.contains('open') && !sheet.contains(e.target) && !e.target.closest('.cmt-anchor,.cmt-chip'))
          closeSheet();
      });
      return sheet;
    }
    var sheetHome = null;
    function openSheet(card) {
      ensureSheet();
      closeSheet();
      sheetHome = { card: card, next: card.nextSibling, parent: card.parentNode };
      sheet.appendChild(card);
      sheet.classList.add('open');
    }
    function closeSheet() {
      if (!sheet || !sheetHome) { if (sheet) sheet.classList.remove('open'); return; }
      sheetHome.parent.insertBefore(sheetHome.card, sheetHome.next);
      sheetHome = null;
      sheet.classList.remove('open');
      layout();
    }
    var chip = null;
    function showChip(anchor) {
      hideChip();
      var s = getSelection();
      if (!s || !s.rangeCount) return;
      var r = s.getRangeAt(0).getBoundingClientRect();
      chip = el('button', 'cmt-chip', 'comment');
      chip.style.left = Math.min(r.right, innerWidth - 90) + 'px';
      chip.style.top = (r.bottom + scrollY + 6) + 'px';
      document.body.appendChild(chip);
      chip.addEventListener('click', function () {
        hideChip();
        var card = newComposer(anchor);
        openSheet(card);
        var ta = card.querySelector('textarea'); if (ta) setTimeout(function () { ta.focus(); }, 0);
      });
      setTimeout(function () {
        document.addEventListener('mousedown', hideChipOnce, { once: true });
      }, 0);
    }
    function hideChipOnce(e) { if (!chip || !chip.contains(e.target)) hideChip(); }
    function hideChip() { if (chip) { chip.remove(); chip = null; } }

    /* ---------- refresh on tab return: add-only when a thought is half-typed ---------- */
    function refresh() {
      if (!adapter) return Promise.resolve();
      return adapter.state(SLUG).then(function (st) {
        admin = !!st.admin;
        var have = {}; comments.forEach(function (c) { have[c.id] = c; });
        var typing = Array.prototype.some.call(document.querySelectorAll('.cmt-compose textarea'),
          function (t) { return t.value.trim(); });
        return decryptStateInto(st).then(function (fresh) {
          var changed = false;
          fresh.forEach(function (c) {
            var old = have[c.id];
            if (!old) { comments.push(c); changed = true; }
            else if ((c.edited || '') !== (old.edited || '') || c.removed !== old.removed) {
              old.payload = c.payload; old.edited = c.edited; old.removed = c.removed; changed = true;
            }
          });
          if (changed && !typing) { buildLayer(); restoreDrafts(); }
          else if (changed) { updateMastLabel(); }
          markSeen();
        });
      }).catch(function () {});
    }
    function decryptStateInto(st) {
      var out = [], jobs = [];
      (st.authors || []).forEach(function (a) {
        if (a.name_ct) jobs.push(decText(K, a.name_ct).then(function (n) { authors[a.id] = n; }).catch(function () {}));
      });
      (st.comments || []).forEach(function (c) {
        var rec = { id: c.id, author: c.author, parent: c.parent || null, created: c.created,
                    edited: c.edited || null, removed: !!c.removed, payload: null };
        out.push(rec);
        if (c.payload_ct) jobs.push(decJSON(K, c.payload_ct).then(function (p) { rec.payload = p; }).catch(function () { rec.removed = true; }));
      });
      return Promise.all(jobs).then(function () { return out; });
    }

    /* test hook */
    window.CMT = { crypto: CRYPTO, ready: ready, refresh: refresh,
      layout: function () { layout(); }, _state: function () { return { comments: comments, authors: authors, admin: admin }; } };
  })();
})();
