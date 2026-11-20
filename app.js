(() => {
  'use strict';
  const GAMES = (window.GAMES || []).filter((g) => g.n && !/dedicated server/i.test(g.n));
  for (const g of GAMES) {
    if (g.s > 204800) g.s = null; // 200 GB felett: a fejlesztő elírása
    if (g.h && !/\.(jpg|png|webp)/i.test(g.h)) g.h = ''; // hiányzó borítókép → alapértelmezett
  }
  const META = window.META || { tags: {}, genres: {} };
  const IMG_BASE = 'https://shared.fastly.steamstatic.com/store_item_assets/';
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------ nyelv
  const I = window.i18n || { t: (k) => k, lang: 'hu', locale: 'hu', chosen: false, langs: [], tag: () => null, apply() {} };
  const T = I.t, LOC = I.locale;
  const num0 = (n) => Number(n).toLocaleString(LOC);
  I.apply();

  // ------------------------------------------------------------ címkék, műfajok
  const tagName = (id) => { const t = META.tags && META.tags[id]; return I.tag(id) || (t ? (I.lang === 'hu' ? t[0] : t[1]) : '#' + id); };
  const tagEn = (id) => { const t = META.tags && META.tags[id]; return t ? t[1] : ''; };
  const genreName = (id) => { const s = T('g_' + id); return s !== 'g_' + id ? s : (META.genres && META.genres[id]) || ('#' + id); };
  const MODES = [
    [2, T('m_single')], [1, T('m_multi')], [9, T('m_coop')], [38, T('m_ocoop')], [49, T('m_pvp')], [36, T('m_opvp')], [24, T('m_split')], [27, T('m_cross')],
  ];
  const PLATS = [['w', 'Windows'], ['m', 'macOS'], ['l', 'Linux'], ['d', T('deck')], ['v', 'VR']];
  const SIZES = [['<1', 0, 1024], ['1–5', 1024, 5120], ['5–20', 5120, 20480], ['20–50', 20480, 51200], ['50+', 51200, Infinity]];
  const MOODS = ['Funny', 'Comedy', 'Cute', 'Relaxing', 'Cozy', 'Wholesome', 'Family Friendly', 'Memes', 'Horror', 'Psychological Horror', 'Dark', 'Gore', 'Atmospheric', 'Story Rich', 'Anime', 'Competitive', 'Difficult', 'Addictive', 'Fast-Paced', 'Beautiful'];

  // címke-előfordulások
  const tagCount = new Map();
  const genreCount = new Map();
  for (const g of GAMES) {
    for (const t of g.t || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    for (const x of g.g || []) genreCount.set(String(x), (genreCount.get(String(x)) || 0) + 1);
    g._s = ((g.n || '') + ' ' + (g.t || []).map((t) => tagName(t) + ' ' + tagEn(t)).join(' ')).toLowerCase();
  }
  const enToId = new Map();
  for (const id in META.tags || {}) enToId.set(META.tags[id][1].toLowerCase(), +id);

  // ------------------------------------------------------------ állapot
  const S = { q: '', sort: 'pop', sizes: new Set(), sizeMin: null, sizeMax: null, sizeUnknown: true, age: '', ageUnknown: true, tags: new Map(), genres: new Set(), modes: new Set(), plats: new Set(), rating: 0, minReviews: 0, yearMin: null, yearMax: null };

  // ------------------------------------------------------------ szűrő UI
  function chip(label, count, onClick, key) {
    const c = el('span', 'chip', esc(label) + (count != null ? `<span class="n">${count}</span>` : ''));
    c.dataset.key = key;
    c.addEventListener('click', (e) => { onClick(c, e); });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); onClick(c, e, true); });
    return c;
  }
  function toggleSetChip(set, key, c) { if (set.has(key)) { set.delete(key); c.classList.remove('on'); } else { set.add(key); c.classList.add('on'); } update(); }

  function tagChip(id, cls) {
    const c = chip(tagName(id), tagCount.get(id) || 0, (c, e, right) => {
      const cur = S.tags.get(id);
      let next;
      if (right) next = cur === -1 ? undefined : -1;
      else next = cur === undefined ? 1 : cur === 1 ? -1 : undefined;
      if (next === undefined) S.tags.delete(id); else S.tags.set(id, next);
      syncTagChips(); update();
    }, 't' + id);
    c.title = tagEn(id) + ' — ' + T('tag_title');
    return c;
  }
  function syncTagChips() {
    document.querySelectorAll('.chip[data-key^="t"]').forEach((c) => {
      const v = S.tags.get(+c.dataset.key.slice(1));
      c.classList.toggle('on', v === 1); c.classList.toggle('off', v === -1);
    });
  }

  function buildFilters() {
    const sc = $('#sizeChips');
    SIZES.forEach(([l], i) => sc.append(chip(l + ' GB', null, (c) => toggleSetChip(S.sizes, i, c), 's' + i)));
    const mc = $('#moodChips');
    for (const m of MOODS) { const id = enToId.get(m.toLowerCase()); if (id && tagCount.get(id)) mc.append(tagChip(id)); }
    const gc = $('#genreChips');
    [...genreCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([id, n]) => {
      if (id === '37') return; // mind ingyenes
      gc.append(chip(genreName(id), n, (c) => toggleSetChip(S.genres, id, c), 'g' + id));
    });
    const md = $('#modeChips');
    for (const [id, l] of MODES) md.append(chip(l, null, (c) => toggleSetChip(S.modes, id, c), 'm' + id));
    const pc = $('#platChips');
    for (const [k, l] of PLATS) pc.append(chip(l, null, (c) => toggleSetChip(S.plats, k, c), 'p' + k));
    renderTagList();
  }
  function renderTagList() {
    const q = $('#tagSearch').value.trim().toLowerCase();
    const box = $('#tagChips'); box.innerHTML = '';
    let ids = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    if (q) ids = ids.filter((id) => tagName(id).toLowerCase().includes(q) || tagEn(id).toLowerCase().includes(q));
    ids.slice(0, q ? 200 : 120).forEach((id) => box.append(tagChip(id)));
    syncTagChips();
  }

  // ------------------------------------------------------------ szűrés
  const ageOk = (g) => {
    if (!S.age) return true;
    if (g.a == null) return S.ageUnknown && S.age !== '18only';
    if (S.age === '18only') return g.a >= 18;
    return g.a <= +S.age;
  };
  function passes(g) {
    if (S.q && !S.q.every((w) => g._s.includes(w))) return false;
    // méret
    const sizeActive = S.sizes.size || S.sizeMin != null || S.sizeMax != null;
    if (sizeActive) {
      if (g.s == null) { if (!S.sizeUnknown) return false; }
      else {
        if (S.sizes.size && ![...S.sizes].some((i) => g.s >= SIZES[i][1] && g.s < SIZES[i][2])) return false;
        if (S.sizeMin != null && g.s < S.sizeMin * 1024) return false;
        if (S.sizeMax != null && g.s > S.sizeMax * 1024) return false;
      }
    }
    if (!ageOk(g)) return false;
    if (S.tags.size) {
      const t = g.t || [];
      for (const [id, v] of S.tags) { const has = t.includes(id); if ((v === 1 && !has) || (v === -1 && has)) return false; }
    }
    if (S.genres.size) { const gg = (g.g || []).map(String); for (const x of S.genres) if (!gg.includes(x)) return false; }
    if (S.modes.size) { const m = g.m || []; for (const x of S.modes) if (!m.includes(x)) return false; }
    if (S.plats.size) { for (const p of S.plats) if (!(g.p || '').includes(p)) return false; }
    if (S.rating && (g.r || 0) < S.rating) return false;
    if (S.minReviews && (g.c || 0) < S.minReviews) return false;
    if (S.yearMin || S.yearMax) {
      if (!g.d) return false;
      const y = new Date(g.d * 1000).getFullYear();
      if (S.yearMin && y < S.yearMin) return false;
      if (S.yearMax && y > S.yearMax) return false;
    }
    return true;
  }
  const SORTS = {
    pop: (a, b) => (b.c || 0) - (a.c || 0),
    rating: (a, b) => score(b) - score(a),
    new: (a, b) => (b.d || 0) - (a.d || 0),
    old: (a, b) => (a.d || 9e12) - (b.d || 9e12),
    name: (a, b) => a.n.localeCompare(b.n, LOC),
    small: (a, b) => (a.s ?? 9e12) - (b.s ?? 9e12),
    big: (a, b) => (b.s ?? -1) - (a.s ?? -1),
  };
  // Wilson-szerű súlyozás, hogy pár értékelés ne kerüljön előre
  function score(g) { const n = g.c || 0; const p = (g.r || 0) / 100; return n ? (p * n + 0.5 * 20) / (n + 20) : 0; }

  // ------------------------------------------------------------ megjelenítés
  let results = [], shown = 0;
  const grid = $('#grid');
  const fmtSize = (mb) => mb == null ? '? GB' : mb >= 1024 ? (mb / 1024).toLocaleString(LOC, { maximumFractionDigits: mb >= 10240 ? 0 : 1 }) + ' GB' : Math.max(1, Math.round(mb)) + ' MB';
  const ageClass = (a) => a >= 18 ? 'age18' : a >= 16 ? 'age16' : a >= 12 ? 'age12' : 'ageLow';
  const imgUrl = (g) => g.h ? IMG_BASE + g.h : `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.i}/header.jpg`;
  const rvClass = (r) => r >= 70 ? 'good' : r >= 40 ? 'mid' : 'bad';

  function card(g) {
    const c = el('a', 'card');
    c.href = 'jatek/' + g.i + '.html';
    const age = g.a != null ? `<span class="badge ${ageClass(g.a)}" title="${esc(g.ae ? T('est_age') : T('age'))}">${g.a}+${g.ae ? '?' : ''}</span>` : '';
    const rv = g.c ? `<span class="rv ${rvClass(g.r)}" title="${esc(T('reviews_n', num0(g.c)))}">👍 ${g.r}%</span>` : `<span>${esc(T('no_reviews'))}</span>`;
    const year = g.d ? new Date(g.d * 1000).getFullYear() : '';
    c.innerHTML = `<div class="thumb"><img loading="lazy" src="${imgUrl(g)}" alt=""><div class="badges">${age}</div></div>
      <div class="cbody"><div class="cname">${esc(g.n)}</div>
      <div class="cmeta"><span class="size">💾 ${fmtSize(g.s)}</span>${rv}<span>${year}</span></div>
      <div class="ctags">${(g.t || []).slice(0, 4).map((t) => `<span>${esc(tagName(t))}</span>`).join('')}</div></div>`;
    c.querySelector('img').onerror = function () { this.onerror = null; this.src = `https://cdn.akamai.steamstatic.com/steam/apps/${g.i}/capsule_616x353.jpg`; };
    c.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // új lapon: a játék saját oldala
      e.preventDefault(); location.hash = '#/app/' + g.i;
    });
    return c;
  }
  function renderMore() {
    const frag = document.createDocumentFragment();
    const end = Math.min(results.length, shown + 60);
    for (; shown < end; shown++) frag.append(card(results[shown]));
    grid.append(frag);
  }
  function update() {
    results = GAMES.filter(passes).sort(SORTS[S.sort]);
    shown = 0; grid.innerHTML = '';
    renderMore();
    $('#empty').hidden = results.length > 0;
    $('#stats').textContent = T('stats', num0(results.length), num0(GAMES.length));
    renderActive();
  }
  new IntersectionObserver((en) => { if (en[0].isIntersecting && shown < results.length) renderMore(); }, { rootMargin: '1200px' }).observe($('#sentinel'));

  function renderActive() {
    const bar = $('#activeBar'); bar.innerHTML = '';
    const add = (label, fn) => { const c = el('span', 'chip', esc(label) + ' ✕'); c.onclick = () => { fn(); syncAll(); update(); }; bar.append(c); };
    for (const [id, v] of S.tags) add((v === -1 ? T('not_prefix') : '') + tagName(id), () => S.tags.delete(id));
    for (const i of S.sizes) add(SIZES[i][0] + ' GB', () => S.sizes.delete(i));
    for (const g of S.genres) add(genreName(g), () => S.genres.delete(g));
    for (const m of S.modes) add(MODES.find((x) => x[0] === m)[1], () => S.modes.delete(m));
    for (const p of S.plats) add(PLATS.find((x) => x[0] === p)[1], () => S.plats.delete(p));
    if (S.age) add($('#age').selectedOptions[0].text, () => { S.age = ''; });
  }
  function syncAll() {
    document.querySelectorAll('.chip[data-key]').forEach((c) => {
      const k = c.dataset.key, t = k[0], v = k.slice(1);
      if (t === 's') c.classList.toggle('on', S.sizes.has(+v));
      if (t === 'g') c.classList.toggle('on', S.genres.has(v));
      if (t === 'm') c.classList.toggle('on', S.modes.has(+v));
      if (t === 'p') c.classList.toggle('on', S.plats.has(v));
    });
    syncTagChips();
    $('#age').value = S.age;
  }

  // ------------------------------------------------------------ vezérlők
  let qTimer;
  $('#q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { const v = e.target.value.trim().toLowerCase(); S.q = v ? v.split(/\s+/) : ''; update(); }, 150); });
  $('#sort').addEventListener('change', (e) => { S.sort = e.target.value; update(); });
  const num = (v) => v === '' ? null : +v;
  $('#sizeMin').addEventListener('input', (e) => { S.sizeMin = num(e.target.value); update(); });
  $('#sizeMax').addEventListener('input', (e) => { S.sizeMax = num(e.target.value); update(); });
  $('#sizeUnknown').addEventListener('change', (e) => { S.sizeUnknown = e.target.checked; update(); });
  $('#age').addEventListener('change', (e) => { S.age = e.target.value; update(); });
  $('#ageUnknown').addEventListener('change', (e) => { S.ageUnknown = e.target.checked; update(); });
  $('#rating').addEventListener('change', (e) => { S.rating = +e.target.value; update(); });
  $('#minReviews').addEventListener('input', (e) => { S.minReviews = +e.target.value || 0; update(); });
  $('#yearMin').addEventListener('input', (e) => { S.yearMin = +e.target.value > 1900 ? +e.target.value : null; update(); });
  $('#yearMax').addEventListener('input', (e) => { S.yearMax = +e.target.value > 1900 ? +e.target.value : null; update(); });
  $('#tagSearch').addEventListener('input', renderTagList);
  $('#toggleFilters').addEventListener('click', () => $('#filters').classList.toggle('open'));
  // mobilon: a panel bezárul, ha mellé koppintasz; a panel a fejléc alatt kezdődik
  $('main').addEventListener('click', (e) => {
    const f = $('#filters');
    if (f.classList.contains('open')) { f.classList.remove('open'); e.preventDefault(); e.stopPropagation(); }
  }, true);
  const setTopH = () => document.documentElement.style.setProperty('--toph', $('.top').offsetHeight + 'px');
  window.addEventListener('resize', setTopH); setTopH();
  $('#reset').addEventListener('click', () => {
    Object.assign(S, { sizes: new Set(), sizeMin: null, sizeMax: null, sizeUnknown: true, age: '', ageUnknown: true, tags: new Map(), genres: new Set(), modes: new Set(), plats: new Set(), rating: 0, minReviews: 0, yearMin: null, yearMax: null });
    ['#sizeMin', '#sizeMax', '#minReviews', '#yearMin', '#yearMax'].forEach((s) => { $(s).value = ''; });
    $('#rating').value = '0'; $('#sizeUnknown').checked = true; $('#ageUnknown').checked = true;
    syncAll(); update();
  });

  // ------------------------------------------------------------ részletek ablak
  const pending = {};
  window.steamDetail = (d) => { const p = pending[d.id]; if (p) { p.resolve(d); delete pending[d.id]; } };
  const detCache = {};
  function loadDetail(id) {
    if (detCache[id]) return Promise.resolve(detCache[id]);
    return new Promise((resolve) => {
      pending[id] = { resolve: (d) => { detCache[id] = d; resolve(d); } };
      const s = document.createElement('script');
      s.src = `data/d/${id}.js?v=${encodeURIComponent(META.updated || '')}`;
      s.onerror = () => { delete pending[id]; resolve(null); };
      s.onload = () => s.remove();
      document.head.append(s);
    });
  }

  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed,style,link,form,input,button').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((n) => {
      for (const a of [...n.attributes]) if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name);
      if (n.tagName === 'A') { n.target = '_blank'; n.rel = 'noopener'; }
      if (n.tagName === 'IMG') n.loading = 'lazy';
    });
    return doc.body.firstChild.innerHTML;
  }

  let current = null, original = '';
  async function openModal(id) {
    const g = GAMES.find((x) => x.i === id) || { i: id, n: 'Steam #' + id, t: [] };
    current = id;
    window.track && window.track('megnyitas-' + id, g.n);
    $('#modal').hidden = false; document.body.style.overflow = 'hidden';
    $('#mName').textContent = g.n;
    $('#mImg').src = imgUrl(g);
    $('#mHero').style.backgroundImage = '';
    $('#mWeb').href = `https://store.steampowered.com/app/${id}/`;
    $('#mLang').value = ''; $('#mTrStatus').textContent = '';
    $('#mDesc').innerHTML = `<p class="small">${esc(T('loading'))}</p>`;
    $('#mMedia').innerHTML = ''; $('#mSide').innerHTML = '';
    renderFacts(g, null);
    const d = await loadDetail(id);
    if (current !== id) return;
    renderFacts(g, d);
    if (d && d.bg) $('#mHero').style.backgroundImage = `url("${d.bg}")`;
    // képek, videó
    const media = $('#mMedia');
    if (d && d.movie) { const v = el('video'); v.src = d.movie.src; v.poster = d.movie.poster; v.controls = true; v.preload = 'none'; v.muted = true; media.append(v); }
    for (const s of (d && d.shots) || []) { const im = el('img'); im.loading = 'lazy'; im.src = s.t; im.onclick = () => lightbox(s.f); media.append(im); }
    // leírás
    // csak a rövid hivatalos ismertető – a teljes leírás a Steamen olvasható (szerzői jogi okból nem másoljuk át)
    original = d && d.short ? `<p class="lead">${esc(d.short)}</p>` : `<p class="small">${esc(T('no_short'))}</p>`;
    $('#mDesc').innerHTML = original;
    $('#mFull').href = `https://store.steampowered.com/app/${id}/`;
    const owner = d && ((d.pubs && d.pubs.length && d.pubs.join(', ')) || (d.devs && d.devs.join(', ')));
    $('#mSrc').innerHTML = `${esc(T('src'))} <a href="https://store.steampowered.com/app/${id}/" target="_blank" rel="noopener">${esc(T('src_link'))}</a>${owner ? ' · © ' + esc(owner) : ''}.`;
    renderSide(g, d);
    // ha a látogató maga választott nem angol nyelvet, a rövid ismertetőt automatikusan lefordítjuk
    if (I.chosen && I.lang !== 'en' && d && d.short) { $('#mLang').value = I.lang; translateDesc(I.lang); }
  }
  function renderFacts(g, d) {
    let size = d && d.size != null ? d.size : g.s;
    if (size > 204800) size = null; // 200 GB felett: a fejlesztő elírása
    const age = d && d.age != null ? d.age : g.a;
    const f = [];
    f.push(`<span class="fact"><b>${esc(T('size'))}</b>${fmtSize(size)}</span>`);
    f.push(`<span class="fact"><b>${esc(T('age'))}</b>${age != null ? age + '+' + ((d ? d.ageEst : g.ae) ? ' ' + esc(T('estimated')) : '') : esc(T('not_given'))}</span>`);
    if (g.c) f.push(`<span class="fact"><b>${esc(T('rating'))}</b><span class="rv ${rvClass(g.r)}">${esc(T('positive', g.r))}</span> · ${num0(g.c)}</span>`);
    let date = '';
    try { date = g.d ? new Date(g.d * 1000).toLocaleDateString(LOC, { year: 'numeric', month: 'long', day: 'numeric' }) : (d && d.date) || ''; } catch (e) { date = new Date(g.d * 1000).toISOString().slice(0, 10); }
    if (date) f.push(`<span class="fact"><b>${esc(T('release'))}</b>${esc(date)}</span>`);
    if (d && d.meta) f.push(`<span class="fact"><b>Metacritic</b>${d.meta}</span>`);
    f.push(`<span class="fact">${esc(T('free'))}</span>`);
    $('#mFacts').innerHTML = f.join('');
  }
  function renderSide(g, d) {
    const s = [];
    if (d && d.devs && d.devs.length) s.push(`<h4>${esc(T("s_dev"))}</h4><div class="val">${esc(d.devs.join(', '))}</div>`);
    if (d && d.pubs && d.pubs.length) s.push(`<h4>${esc(T("s_pub"))}</h4><div class="val">${esc(d.pubs.join(', '))}</div>`);
    { const gl = g.g && g.g.length ? g.g.map(genreName).join(", ") : d && d.genres && d.genres.join(", "); if (gl) s.push(`<h4>${esc(T("genre"))}</h4><div class="val">${esc(gl)}</div>`); }
    if (g.t && g.t.length) s.push(`<h4>${esc(T("tags"))}</h4><div class="tags">${g.t.map((t) => `<span data-tag="${t}">${esc(tagName(t))}</span>`).join('')}</div>`);
    if (d && d.ageSrc) s.push(`<h4>${esc(T("s_agesrc"))}</h4><div class="val">${esc(d.ageSrc)}</div>`);
    if (d && d.notes) s.push(`<h4>${esc(T("s_notes"))}</h4><div class="val">${esc(d.notes)}</div>`);
    if (d && d.cats && d.cats.length) s.push(`<h4>${esc(T("s_cats"))}</h4><div class="val">${esc(d.cats.join(' · '))}</div>`);
    if (d && d.reqMin) s.push(`<h4>${esc(T("s_req"))}</h4><div class="req">${sanitize(d.reqMin)}</div>`);
    if (d && d.langs) s.push(`<h4>${esc(T("s_langs"))}</h4><div class="req">${sanitize(d.langs)}</div>`);
    if (d && d.web) s.push(`<h4>${esc(T("s_web"))}</h4><div class="val"><a href="${esc(d.web)}" target="_blank" rel="noopener">${esc(d.web.replace(/^https?:\/\//, '').slice(0, 40))}</a></div>`);
    const side = $('#mSide'); side.innerHTML = s.join('');
    side.querySelectorAll('[data-tag]').forEach((t) => t.onclick = () => { S.tags.set(+t.dataset.tag, 1); syncTagChips(); closeModal(); update(); });
  }
  function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; current = null; $('#mMedia').querySelectorAll('video').forEach((v) => v.pause()); if (location.hash) history.replaceState(null, '', location.pathname + location.search); }
  function lightbox(src) { const lb = el('div', 'lightbox', `<img src="${src}" alt="">`); lb.onclick = () => lb.remove(); document.body.append(lb); }
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const lb = $('.lightbox'); if (lb) lb.remove(); else if (!$('#modal').hidden) closeModal(); } });
  function route() { const m = location.hash.match(/^#\/app\/(\d+)/); if (m) openModal(+m[1]); else if (!$('#modal').hidden) closeModal(); }
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------ Steam gomb
  $('#mSteam').addEventListener('click', () => {
    const id = current; if (!id) return;
    window.track && window.track('steam-' + id, $('#mName').textContent);
    const web = `https://store.steampowered.com/app/${id}/`;
    let appOpened = false;
    const mark = () => { appOpened = true; };
    window.addEventListener('blur', mark, { once: true });
    document.addEventListener('visibilitychange', mark, { once: true });
    location.href = `steam://store/${id}`;
    setTimeout(() => {
      window.removeEventListener('blur', mark);
      document.removeEventListener('visibilitychange', mark);
      if (!appOpened) window.open(web, '_blank', 'noopener');
    }, 1500);
  });

  // ------------------------------------------------------------ fordítás
  const trCache = {};
  async function gtx(text, tl) {
    const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl === 'he' ? 'iw' : tl}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j[0] || []).map((x) => x[0]).join('');
  }
  async function translateDesc(lang) {
    const box = $('#mDesc'), st = $('#mTrStatus'), id = current;
    if (!lang) { box.innerHTML = original; st.textContent = ''; return; }
    const key = id + ':' + lang;
    if (trCache[key]) { box.innerHTML = trCache[key]; st.textContent = T('tr_done'); return; }
    box.innerHTML = original;
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    const chunks = []; let cur = [], len = 0;
    for (const n of nodes) {
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (len + t.length > 1500 && cur.length) { chunks.push(cur); cur = []; len = 0; }
      cur.push([n, t]); len += t.length + 1;
    }
    if (cur.length) chunks.push(cur);
    st.textContent = T('tr_busy');
    try {
      let done = 0;
      for (const ch of chunks) {
        if (current !== id || $('#mLang').value !== lang) return;
        const out = (await gtx(ch.map((x) => x[1]).join('\n'), lang)).split('\n');
        if (out.length === ch.length) ch.forEach(([n, t], i) => { const lead = /^\s/.test(n.nodeValue) ? ' ' : '', trail = /\s$/.test(n.nodeValue) ? ' ' : ''; n.nodeValue = lead + out[i].trim() + trail; });
        else { ch[0][0].nodeValue = out.join(' '); ch.slice(1).forEach(([n]) => { n.nodeValue = ' '; }); }
        st.textContent = `${T("tr_busy")} ${Math.round(++done / chunks.length * 100)}%`;
      }
      trCache[key] = box.innerHTML;
      st.textContent = T('tr_done');
    } catch (e) {
      box.innerHTML = original;
      const url = `https://translate.google.com/translate?sl=auto&tl=${lang}&u=${encodeURIComponent('https://store.steampowered.com/app/' + id + '/')}`;
      st.innerHTML = `${esc(T("tr_fail"))} <a href="${url}" target="_blank" rel="noopener">${esc(T("tr_open"))}</a>`;
    }
  }
  $('#mLang').addEventListener('change', (e) => {
    if (e.target.value && window.track) window.track('forditas-' + e.target.value, 'Fordítás: ' + e.target.selectedOptions[0].text);
    translateDesc(e.target.value);
  });
  ['#mWeb', '#mFull'].forEach((s) => $(s).addEventListener('click', () => { if (current && window.track) window.track('steamweb-' + current, $('#mName').textContent); }));

  // ------------------------------------------------------------ indulás
  $('#syncInfo').textContent = T('sync_info', META.updated || '?', num0(GAMES.length));
  // a leírás-fordító lenyíló: minden nyelv (az angol az eredeti)
  for (const [code, name] of (I.allLangs || I.langs)) if (code !== 'en') { const o = el('option'); o.value = code; o.textContent = name; $('#mLang').append(o); }
  buildFilters();
  update();
  route();
})();
