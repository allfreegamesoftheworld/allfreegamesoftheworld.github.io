/* Nyelvválasztó és felület-fordítás. A nyelvi szövegek az i18n/<kód>.js fájlokban vannak. */
(function () {
  'use strict';
  var LANGS = [['hu', 'Magyar'], ['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'], ['pl', 'Polski'], ['cs', 'Čeština'], ['sk', 'Slovenčina'], ['ro', 'Română'], ['hr', 'Hrvatski'], ['sr', 'Srpski'], ['sl', 'Slovenščina'], ['bs', 'Bosanski'], ['sq', 'Shqip'], ['mk', 'Македонски'], ['bg', 'Български'], ['uk', 'Українська'], ['ru', 'Русский'], ['tr', 'Türkçe'], ['nl', 'Nederlands'], ['sv', 'Svenska'], ['da', 'Dansk'], ['fi', 'Suomi'], ['no', 'Norsk'], ['is', 'Íslenska'], ['el', 'Ελληνικά'], ['lt', 'Lietuvių'], ['lv', 'Latviešu'], ['et', 'Eesti'], ['ca', 'Català'], ['ga', 'Gaeilge'], ['ja', '日本語'], ['ko', '한국어'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['ar', 'العربية'], ['he', 'עברית'], ['fa', 'فارسی'], ['ur', 'اردو'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['ta', 'தமிழ்'], ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['tl', 'Filipino'], ['sw', 'Kiswahili'], ['af', 'Afrikaans'], ['ka', 'ქართული'], ['hy', 'Հայերեն'], ['az', 'Azərbaycan'], ['kk', 'Қазақ'], ['uz', 'Oʻzbek']];
  // csak a már lefordított nyelvek jelennek meg (a többi később kerül fel)
  var READY = 'hu en de fr es it pt pl cs sk ro hr sr sl bs sq mk bg uk ru tr nl sv da fi no is el lt ja'.split(' ');
  var ALL = LANGS.slice();
  LANGS = LANGS.filter(function (l) { return READY.indexOf(l[0]) >= 0; });
  var RTL = { ar: 1, he: 1, fa: 1, ur: 1 };
  var LOCALE = { no: 'nb', tl: 'fil' };
  var KEY = 'afg-lang';
  var has = function (c) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === c) return true; return false; };

  function detect() {
    var q = (location.search.match(/[?&]lang=([A-Za-z-]+)/) || [])[1];
    if (q && has(q)) { try { localStorage.setItem(KEY, q); } catch (e) {} return { code: q, chosen: true }; }
    var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved && has(saved)) return { code: saved, chosen: true };
    var nav = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < nav.length; i++) {
      var n = String(nav[i]), b = n.split('-')[0].toLowerCase();
      if (b === 'zh') return { code: /TW|HK|MO|Hant/i.test(n) ? 'zh-TW' : 'zh-CN', chosen: false };
      if (b === 'nb' || b === 'nn') return { code: 'no', chosen: false };
      if (b === 'iw') return { code: 'he', chosen: false };
      if (b === 'fil') return { code: 'tl', chosen: false };
      if (has(b)) return { code: b, chosen: false };
    }
    return { code: 'en', chosen: false };
  }

  var cur = detect();
  var base = (document.currentScript && document.currentScript.src || '').replace(/i18n\.js(\?.*)?$/, '');
  var ver = (document.currentScript && document.currentScript.src.match(/\?v=(\w+)/) || [])[1] || '';
  document.documentElement.lang = cur.code;
  if (RTL[cur.code]) document.documentElement.dir = 'rtl';
  // szinkron betöltés, hogy a felület már a választott nyelven épüljön fel
  document.write('<script src="' + base + 'i18n/' + cur.code + '.js?v=' + ver + '"><\/script>');
  if (cur.code !== 'en') document.write('<script src="' + base + 'i18n/en.js?v=' + ver + '"><\/script>');

  function dict() { var I = window.I18N || {}; return I[cur.code] || I.en || {}; }
  function t(key) {
    var d = dict(), s = d[key];
    if (s == null) s = ((window.I18N || {}).en || {})[key];
    if (s == null) s = key;
    for (var i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(arguments[i]);
    return s;
  }
  function apply(root) {
    root = root || document;
    var q = function (sel, fn) { var n = root.querySelectorAll(sel); for (var i = 0; i < n.length; i++) fn(n[i]); };
    q('[data-i18n]', function (e) { var a = e.getAttribute('data-a0'); e.textContent = a == null ? t(e.getAttribute('data-i18n')) : t(e.getAttribute('data-i18n'), a); });
    q('[data-num]', function (e) { e.textContent = Number(e.getAttribute('data-num')).toLocaleString(LOCALE[cur.code] || cur.code); });
    q('[data-ts]', function (e) { try { e.textContent = new Date(+e.getAttribute('data-ts') * 1000).toLocaleDateString(LOCALE[cur.code] || cur.code, { year: 'numeric', month: 'long', day: 'numeric' }); } catch (x) {} });
    q('[data-tag]', function (e) { var d = dict()._tags, n = d && d[e.getAttribute('data-tag')]; if (n) e.textContent = n; });
    q('[data-i18n-ph]', function (e) { e.placeholder = t(e.getAttribute('data-i18n-ph')); });
    q('[data-i18n-title]', function (e) { e.title = t(e.getAttribute('data-i18n-title')); e.setAttribute('aria-label', e.title); });
    q('select.langSel', function (s) {
      if (s.options.length) return;
      for (var i = 0; i < LANGS.length; i++) { var o = document.createElement('option'); o.value = LANGS[i][0]; o.textContent = LANGS[i][1]; s.appendChild(o); }
      s.value = cur.code;
      s.title = t('lang_label');
      s.addEventListener('change', function () {
        try { localStorage.setItem(KEY, s.value); } catch (e) {}
        window.track && window.track('nyelv-' + s.value, 'Nyelv: ' + s.selectedOptions[0].textContent);
        var u = location.pathname + location.search.replace(/([?&])lang=[^&]*&?/, '$1').replace(/[?&]$/, '') + location.hash;
        location.replace(u);
      });
    });
  }
  window.i18n = {
    lang: cur.code,
    chosen: cur.chosen,
    locale: LOCALE[cur.code] || cur.code,
    langs: LANGS,
    allLangs: ALL,
    t: t,
    apply: apply,
    tag: function (id) { var d = dict()._tags; return d && d[id] ? d[id] : null; },
  };
  document.addEventListener('DOMContentLoaded', function () { apply(); });
})();
