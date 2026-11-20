/* Képnézegető: nagy kép, ◀ ▶ nyilak, billentyűzet (← → Esc), húzás mobilon. */
(function () {
  'use strict';
  var box = null, list = [], idx = 0, startX = null;
  function show() {
    var img = box.querySelector('img');
    img.src = list[idx];
    box.querySelector('.lbCount').textContent = (idx + 1) + ' / ' + list.length;
    var multi = list.length > 1;
    box.querySelector('.lbPrev').hidden = !multi;
    box.querySelector('.lbNext').hidden = !multi;
    // a szomszédos képek előtöltése
    [idx + 1, idx - 1].forEach(function (j) { if (list[(j + list.length) % list.length]) { var p = new Image(); p.src = list[(j + list.length) % list.length]; } });
  }
  function step(d) { if (!box || list.length < 2) return; idx = (idx + d + list.length) % list.length; show(); }
  function close() { if (box) { box.remove(); box = null; document.removeEventListener('keydown', onKey, true); } }
  function onKey(e) {
    if (!box) return;
    if (e.key === 'ArrowRight') { step(1); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Escape') { close(); e.preventDefault(); e.stopPropagation(); }
  }
  function btn(cls, label, txt) { var b = document.createElement('button'); b.className = cls; b.type = 'button'; b.setAttribute('aria-label', label); b.textContent = txt; return b; }
  window.openGallery = function (urls, start) {
    close();
    list = urls.slice(); idx = Math.max(0, Math.min(start || 0, list.length - 1));
    box = document.createElement('div');
    box.className = 'lightbox';
    var img = document.createElement('img'); img.alt = '';
    var prev = btn('lbPrev', 'Előző kép', '‹'), next = btn('lbNext', 'Következő kép', '›'), x = btn('lbClose', 'Bezárás', '✕');
    var count = document.createElement('div'); count.className = 'lbCount';
    prev.onclick = function (e) { e.stopPropagation(); step(-1); };
    next.onclick = function (e) { e.stopPropagation(); step(1); };
    x.onclick = function (e) { e.stopPropagation(); close(); };
    img.onclick = function (e) { e.stopPropagation(); step(1); };
    box.onclick = close;
    box.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) { if (startX == null) return; var dx = e.changedTouches[0].clientX - startX; startX = null; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); });
    box.append(img, prev, next, x, count);
    document.body.append(box);
    document.addEventListener('keydown', onKey, true);
    show();
  };
  window.closeGallery = close;
  window.galleryOpen = function () { return !!box; };
})();
