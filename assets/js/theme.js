// Dark/light toggle. Initial theme is set inline in <head> (no flash); this just
// wires the button and persists the choice.
(function () {
  var btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  function glyph() {
    btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀' : '☾';
  }
  glyph();
  btn.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    glyph();
  });
})();
