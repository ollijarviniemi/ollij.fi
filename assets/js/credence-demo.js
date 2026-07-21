/* Credence-demo widget — the extension's credence5 card (extension/ar-sidebar.js), ported so a
   post can show the real thing instead of a screenshot. One click on a band commits the bet and
   reveals the truth in place, same classes and payoff emphasis as the live card. Listener is
   delegated to document so the editor's innerHTML restore can't orphan the cells. Deliberately
   no persistence: refresh = a fresh, unanswered card. Styles: site.scss (.cred-demo). */
(function () {
  'use strict';
  if (window.gaCredDemo) return;   // double-include guard (several demos may share one page)
  window.gaCredDemo = true;
  document.addEventListener('click', function (ev) {
    var bk = ev.target && ev.target.closest ? ev.target.closest('.cred-bk') : null;
    if (!bk) return;
    var demo = bk.closest('.cred-demo');
    if (!demo || demo.classList.contains('revealed')) return;
    var cells = demo.querySelectorAll('.cred-bk');
    Array.prototype.forEach.call(cells, function (c) { c.classList.remove('end'); });
    bk.classList.add('end');
    var ans = (demo.getAttribute('data-answer') || '').trim();
    var isTrue = /^true/i.test(ans);
    demo.classList.add('committed', 'revealed', isTrue ? 'vtrue' : 'vfalse');
    var actual = demo.querySelector('.cred-actual');
    if (actual) actual.textContent = ans;
    // ring the band that would have scored best: TRUE → 80–100%, FALSE → 0–20%
    var ci = isTrue ? cells.length - 1 : 0;
    if (cells[ci]) cells[ci].classList.add('correct');
  });
})();
