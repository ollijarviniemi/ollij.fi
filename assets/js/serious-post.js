/* Serious-Post front-matter compiler (design: mockup variant g, approved 2026-07-11).
   Rearranges a rendered .post-body into: h1 · meta · abstract · [summary | numbered ToC]
   · * * * · body sections (endmatter styled in place). ONE transform shared by the static
   page (w-post.html, synchronous — runs before first paint, no reflow flash) and the
   editor's exit re-render — read view and post-edit view identical by construction.
   Idempotent: bails if the hall is already assembled. Tolerates both kramdown output
   (heading ids present, newline before quote attributions) and marked output (no ids,
   <br> before attributions). Sections are found by heading TEXT, not id. */
(function () {
  'use strict';

  function slugify(t) {
    return t.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  }
  function headText(h) { return (h.textContent || '').trim(); }
  function classify(t) {
    t = t.toLowerCase().replace(/\s+/g, ' ').trim();
    if (t === 'abstract') return 'abstract';
    if (t === 'extended summary' || t === 'summary') return 'summary';
    if (/^influences/.test(t)) return 'endmatter';
    return null;
  }

  window.gaSeriousPost = function (body, opts) {
    if (!body || body.querySelector('.sp-hall')) return;
    opts = opts || {};

    // ---- carve childNodes into preamble + h2-keyed sections --------------
    var kids = Array.prototype.slice.call(body.childNodes);
    var pre = [], sections = [], cur = null;
    kids.forEach(function (n) {
      if (n.nodeType === 1 && n.tagName === 'H2') { cur = { h2: n, nodes: [] }; sections.push(cur); }
      else if (cur) cur.nodes.push(n);
      else pre.push(n);
    });
    if (!sections.length) return;

    var abstract = null, summary = null, endmatter = null, bodySecs = [];
    sections.forEach(function (s) {
      var kind = classify(headText(s.h2));
      if (kind === 'abstract' && !abstract) { abstract = s; return; }
      if (kind === 'summary' && !summary) { summary = s; return; }
      if (kind === 'endmatter' && !endmatter) endmatter = s;
      bodySecs.push(s);
    });

    // ---- numbered ToC over body sections (endmatter excluded) ------------
    var tocSecs = bodySecs.filter(function (s) { return s !== endmatter; });
    var toc = document.createElement('nav'); toc.className = 'sp-toc';
    var ol = document.createElement('ol'); toc.appendChild(ol);
    tocSecs.forEach(function (s, i) {
      if (!s.h2.id) s.h2.id = slugify(headText(s.h2));
      var li = document.createElement('li');
      var n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1); li.appendChild(n);
      var a = document.createElement('a'); a.href = '#' + s.h2.id; a.textContent = headText(s.h2); li.appendChild(a);
      var subs = s.nodes.filter(function (x) { return x.nodeType === 1 && x.tagName === 'H3'; });
      if (subs.length) {
        var sub = document.createElement('ol');
        subs.forEach(function (h, j) {
          if (!h.id) h.id = slugify(headText(h));
          var sli = document.createElement('li');
          var sn = document.createElement('span'); sn.className = 'n'; sn.textContent = (i + 1) + '.' + (j + 1); sli.appendChild(sn);
          var sa = document.createElement('a'); sa.href = '#' + h.id; sa.textContent = headText(h); sli.appendChild(sa);
          sub.appendChild(sli);
        });
        li.appendChild(sub);
      }
      ol.appendChild(li);
    });

    // ---- reassemble -------------------------------------------------------
    var frag = document.createDocumentFragment();
    var h1 = null;
    pre.forEach(function (n) { if (!h1 && n.nodeType === 1 && n.tagName === 'H1') h1 = n; });
    if (h1) frag.appendChild(h1);
    if (opts.meta) {
      var m = document.createElement('div'); m.className = 'sp-meta'; m.textContent = opts.meta;
      frag.appendChild(m);
    }
    pre.forEach(function (n) { if (n !== h1) frag.appendChild(n); });   // stray pre-abstract content stays visible
    if (abstract) {
      var ab = document.createElement('div'); ab.className = 'sp-abstract';
      abstract.nodes.forEach(function (n) { ab.appendChild(n); });
      frag.appendChild(ab);
    }
    var hall = document.createElement('div'); hall.className = 'sp-hall';
    if (summary) {
      var su = document.createElement('div'); su.className = 'sp-summary';
      summary.nodes.forEach(function (n) { su.appendChild(n); });
      hall.appendChild(su);
    }
    hall.appendChild(toc);
    frag.appendChild(hall);
    var close = document.createElement('div'); close.className = 'sp-close';
    close.textContent = '*　*　*';
    frag.appendChild(close);
    bodySecs.forEach(function (s) {
      if (s === endmatter) {
        var sec = document.createElement('section'); sec.className = 'sp-endmatter';
        sec.appendChild(s.h2); s.nodes.forEach(function (n) { sec.appendChild(n); });
        frag.appendChild(sec);
      } else {
        frag.appendChild(s.h2); s.nodes.forEach(function (n) { frag.appendChild(n); });
      }
    });
    body.textContent = '';
    body.appendChild(frag);

    // ---- Related reading → a quiet reference list ------------------------
    // The link is JUST the title; the "— Author, Year" that follows it in the source (kept there
    // in full, so nothing is lost) renders as a dim byline: long author lists collapse to
    // "Surname et al.", the year drops from view but stays on hover (Olli 2026-07-15: "the long
    // lists of authors are a bit messy… the year numbers aren't important either… nice to have
    // them in store, but don't need to be in the link names").
    styleRefList(body);

    // ---- quote attributions: trailing "– [Name](url)" → its own cite line -
    body.querySelectorAll('blockquote p').forEach(function (p) {
      var m = p.innerHTML.match(/^([\s\S]*?)(?:\n|<br\s*\/?>)\s*([–—]\s*<a[\s\S]*)$/);
      if (m) {
        p.innerHTML = m[1];
        var c = document.createElement('p'); c.className = 'sp-cite'; c.innerHTML = m[2];
        p.parentNode.insertBefore(c, p.nextSibling);
      }
    });
  };

  // gaFigures — center images and, when the markdown image carries a title, turn it into a
  // captioned <figure>. Runs on EVERY post, not just sp (Olli 2026-07-14: "I want pictures
  // centered and with the ability to caption them"). Caption source is the image title:
  //     ![alt](/path.png "the caption")   →   <figure><img><figcaption>the caption</figcaption>
  // Centering is ALSO done in CSS, so a lone image is centred even if this never runs; this adds
  // the semantic <figure> and the visible caption. Idempotent; only touches a lone image (one that
  // is the sole content of its paragraph) so inline images in a sentence are left alone.
  function surname(n) { n = n.trim().split(/\s+/); return n[n.length - 1]; }
  function shortenAuthors(s) {
    var names = s.split(/,\s*|\s+and\s+|\s*&\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!names.length) return '';
    if (names.length === 1) return surname(names[0]);
    if (names.length === 2) return surname(names[0]) + ' & ' + surname(names[1]);
    return surname(names[0]) + ' et al.';
  }
  function styleRefList(body) {
    var h = null;
    body.querySelectorAll('h2').forEach(function (x) {
      var t = (x.textContent || '').toLowerCase().trim();
      if (/related reading|references|read more|influences|further reading/.test(t)) h = x;
    });
    if (!h) return;
    var ul = h.nextElementSibling;
    while (ul && ul.tagName !== 'UL' && ul.tagName !== 'OL') ul = ul.nextElementSibling;
    if (!ul) return;
    ul.classList.add('sp-reflist');
    Array.prototype.forEach.call(ul.children, function (li) {
      var a = li.querySelector('a');
      if (!a) return;
      // gather the plain text after the link ("— Owen Cotton-Barratt, …, 2026") and remove it
      var rest = '', n = a.nextSibling;
      while (n) { rest += n.textContent; var nx = n.nextSibling; li.removeChild(n); n = nx; }
      var m = rest.match(/^\s*[—–-]\s*([\s\S]*?)(?:,\s*(\d{4}))?\s*$/);
      var authors = (m ? m[1] : rest).trim(), year = m && m[2];
      var shortA = shortenAuthors(authors);
      if (shortA) {
        var span = document.createElement('span'); span.className = 'sp-ref-by';
        span.textContent = shortA;                                   // year dropped from view…
        li.title = authors + (year ? ', ' + year : '');              // …but kept on hover (full)
        li.appendChild(span);
      }
    });
  }

  window.gaFigures = function (root) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('img'), function (img) {
      if (img.closest('figure')) return;
      var p = img.parentNode;
      if (!p || p.tagName !== 'P') return;
      var lone = Array.prototype.every.call(p.childNodes, function (n) {
        return n === img
          || (n.nodeType === 3 && !n.nodeValue.trim())
          || (n.nodeType === 1 && n.tagName === 'BR');
      });
      if (!lone) return;
      var fig = document.createElement('figure');
      fig.className = 'post-fig';
      fig.appendChild(img);
      var cap = (img.getAttribute('title') || '').trim();
      if (cap) {
        img.removeAttribute('title');
        var fc = document.createElement('figcaption');
        fc.textContent = cap;
        fig.appendChild(fc);
      }
      p.parentNode.replaceChild(fig, p);
    });
  };
})();
