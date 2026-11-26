(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n || 0).toLocaleString('hu');
  const NAMES = new Map((window.GAMES || []).map((g) => [String(g.i), g.n]));
  const KEY = 'afg-admin-session';
  const CODE = window.GOATCOUNTER_CODE || '';
  let auth = null, range = 7, sortKey = 'open', sortDir = -1, gameRows = [];

  // ------------------------------------------------------------ titkosítás (PBKDF2 + AES-GCM, a böngésző saját WebCrypto-jával)
  const ITER = 600000;
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function deriveKey(pw, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(text, pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pw, salt), new TextEncoder().encode(text));
    return { v: 1, it: ITER, s: b64(salt), i: b64(iv), c: b64(c) };
  }
  async function decrypt(vault, pw) {
    const k = await deriveKey(pw, unb64(vault.s));
    const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.i) }, k, unb64(vault.c));
    return new TextDecoder().decode(p);
  }

  // ------------------------------------------------------------ belépés / első beállítás
  function init() {
    const sess = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (sess && sess.key && window.ADMIN_VAULT) { auth = sess; start(); return; }
    if (window.ADMIN_VAULT) { $('#loginBox').hidden = false; $('#pw').focus(); }
    else $('#setupBox').hidden = false;
  }

  $('#loginBtn').addEventListener('click', async () => {
    const pw = $('#pw').value;
    if (!pw) return;
    $('#loginErr').textContent = 'Feloldás…';
    let key;
    try { key = await decrypt(window.ADMIN_VAULT, pw); }
    catch { $('#loginErr').textContent = 'Hibás jelszó.'; await new Promise((r) => setTimeout(r, 800)); return; }
    auth = { code: CODE, key };
    try {
      await api('/api/v0/stats/total', { start: iso(hoursAgo(24)), end: iso(nextHour()) });
      sessionStorage.setItem(KEY, JSON.stringify(auth)); // csak amíg ez a böngészőfül nyitva van
      $('#pw').value = ''; $('#loginErr').textContent = '';
      start();
    } catch (e) { $('#loginErr').innerHTML = e.message; auth = null; }
  });
  $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });
  $('#logout').addEventListener('click', () => { sessionStorage.removeItem(KEY); location.reload(); });

  $('#setupBtn').addEventListener('click', async () => {
    const key = $('#setKey').value.trim(), pw = $('#setPw').value, pw2 = $('#setPw2').value;
    const err = $('#setupErr');
    if (!key) { err.textContent = 'Másold be a GoatCounter API-kulcsot.'; return; }
    if (pw.length < 10) { err.textContent = 'Az admin-jelszó legyen legalább 10 karakter.'; return; }
    if (pw !== pw2) { err.textContent = 'A két jelszó nem egyezik.'; return; }
    err.textContent = 'A kulcs ellenőrzése a GoatCounternél…';
    auth = { code: CODE, key };
    try { await api('/api/v0/stats/total', { start: iso(hoursAgo(24)), end: iso(nextHour()) }); }
    catch (e) { err.innerHTML = e.message; auth = null; return; }
    err.textContent = 'Titkosítás…';
    const vault = await encrypt(key, pw);
    window.ADMIN_VAULT = vault;
    $('#vaultOut').value = JSON.stringify(vault); $('#vaultOut').hidden = false;
    $('#setKey').value = ''; $('#setPw').value = ''; $('#setPw2').value = '';
    err.style.color = 'var(--good)';
    err.textContent = '✔ Kész! A kulcs működik és titkosítva lett. Szólj Claude-nak, hogy mentse el (a titkosított szöveg lent látható – ez jelszó nélkül használhatatlan).';
  });

  // ------------------------------------------------------------ jelszó módosítása (belépve, a kulcs már megvan)
  $('#chpwBtn').addEventListener('click', () => { const b = $('#chpwBox'); b.hidden = !b.hidden; if (!b.hidden) $('#newPw').focus(); });
  $('#chpwSave').addEventListener('click', async () => {
    const pw = $('#newPw').value, pw2 = $('#newPw2').value, err = $('#chpwErr');
    err.style.color = '';
    if (!auth || !auth.key || auth.code === 'demo') { err.textContent = 'Előbb lépj be.'; return; }
    if (pw.length < 4) { err.textContent = 'Az új jelszó legyen legalább 4 karakter.'; return; }
    if (pw !== pw2) { err.textContent = 'A két jelszó nem egyezik.'; return; }
    err.textContent = 'Titkosítás…';
    const vault = await encrypt(auth.key, pw);
    $('#chpwOut').value = JSON.stringify(vault); $('#chpwOut').hidden = false;
    $('#newPw').value = ''; $('#newPw2').value = '';
    err.style.color = 'var(--good)';
    err.textContent = '✔ Kész! Szólj Claude-nak, hogy töltse fel. Addig a régi jelszó marad érvényben.';
  });

  // ------------------------------------------------------------ API
  const hoursAgo = (h) => { const d = new Date(Date.now() - h * 3600e3); d.setMinutes(0, 0, 0); return d; };
  const nextHour = () => { const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); return d; };
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  // A GoatCounter legfeljebb ~4 kérést enged másodpercenként; ha túllépjük, az előzetes (CORS) kérést is
  // elutasítja, amit a böngésző hálózati hibaként lát. Ezért a kéréseket sorba állítjuk és újrapróbáljuk.
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  let lastReq = 0, queue = Promise.resolve();
  function throttle() {
    const p = queue.then(async () => { const wait = lastReq + 350 - Date.now(); if (wait > 0) await sleep(wait); lastReq = Date.now(); });
    queue = p.catch(() => {}); return p;
  }
  async function api(path, params, tries = 0) {
    if (auth.code === 'demo') return demo(path, params);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) (Array.isArray(v) ? v : [v]).forEach((x) => qs.append(k, x));
    const backoff = () => sleep(1500 * (tries + 1));
    let r;
    await throttle();
    try {
      r = await fetch(`https://${encodeURIComponent(auth.code)}.goatcounter.com${path}?${qs}`, { headers: { Authorization: 'Bearer ' + auth.key, 'Content-Type': 'application/json' } });
    } catch (e) {
      if (tries < 4) { await backoff(); return api(path, params, tries + 1); }
      throw new Error(`A GoatCounter nem érhető el innen (hálózati vagy böngésző-korlátozás). Az adatokat a <a href="https://${esc(auth.code)}.goatcounter.com" target="_blank" rel="noopener">GoatCounter irányítópultján</a> is megnézheted.`);
    }
    if (r.status === 401) throw new Error('Hibás GoatCounter-kód vagy hozzáférési kód.');
    if (r.status === 403) throw new Error('A hozzáférési kódnak nincs olvasási joga a statisztikához.');
    if (r.status === 429 && tries < 6) { await backoff(); return api(path, params, tries + 1); }
    if (!r.ok) throw new Error('GoatCounter hiba: HTTP ' + r.status);
    return r.json();
  }
  async function allHits(params) {
    const out = []; const seen = new Set(); let exclude = [];
    for (let page = 0; page < 40; page++) {
      const r = await api('/api/v0/stats/hits', { ...params, limit: 100, ...(exclude.length ? { exclude_paths: exclude.join(',') } : {}) });
      let added = 0;
      for (const h of r.hits || []) if (!seen.has(h.path_id)) { seen.add(h.path_id); out.push(h); added++; }
      if (!r.more || !added) break;
      exclude = [...seen];
    }
    return out;
  }
  async function optional(path, params) { try { return await api(path, params); } catch { return null; } }

  // ------------------------------------------------------------ irányítópult
  function start() {
    $('#loginBox').hidden = true; $('#dash').hidden = false; $('#logout').hidden = false; $('#chpwBtn').hidden = false;
    $('#gcLink').href = `https://${auth.code}.goatcounter.com`;
    const rb = $('#ranges'); rb.innerHTML = '';
    [[1, 'Ma (24 óra)'], [7, '7 nap'], [30, '30 nap'], [90, '90 nap'], [365, '1 év']].forEach(([d, l]) => {
      const c = document.createElement('span'); c.className = 'chip' + (d === range ? ' on' : ''); c.textContent = l;
      c.onclick = () => { range = d; start(); }; rb.append(c);
    });
    load().catch((e) => { $('#kpis').innerHTML = `<div class="kpi" style="grid-column:1/-1"><div class="err">${e.message}</div></div>`; });
  }

  async function load() {
    $('#kpis').innerHTML = '<div class="kpi"><div class="l">Betöltés…</div></div>';
    const params = { start: iso(hoursAgo(range * 24)), end: iso(nextHour()) };
    const total = await api('/api/v0/stats/total', params);
    const hits = await allHits(params);
    const refs = await optional('/api/v0/stats/toprefs', { ...params, limit: 15 });
    const locs = await optional('/api/v0/stats/locations', { ...params, limit: 15 });

    // események szétválogatása
    const games = new Map(); const tr = []; const pages = [];
    const G = (id) => { if (!games.has(id)) games.set(id, { id, name: NAMES.get(id) || '', open: 0, page: 0, steam: 0, web: 0 }); return games.get(id); };
    let opens = 0, steam = 0, web = 0;
    for (const h of hits) {
      const p = h.path || '', c = h.count || 0; let m;
      if ((m = p.match(/^megnyitas-(\d+)$/))) { const g = G(m[1]); g.open += c; g.name = g.name || h.title; opens += c; }
      else if ((m = p.match(/^steam-(\d+)$/))) { const g = G(m[1]); g.steam += c; g.name = g.name || h.title; steam += c; }
      else if ((m = p.match(/^steamweb-(\d+)$/))) { const g = G(m[1]); g.web += c; g.name = g.name || h.title; web += c; }
      else if ((m = p.match(/^forditas-(.+)$/))) tr.push([h.title || m[1], c]);
      else if (!h.event) {
        if ((m = p.match(/\/jatek\/(\d+)\.html$/))) { const g = G(m[1]); g.page += c; g.name = g.name || (h.title || '').split(' – ')[0]; }
        pages.push([p, h.title, c]);
      }
    }
    gameRows = [...games.values()].map((g) => ({ ...g, conv: (g.open + g.page) ? Math.round(((g.steam + g.web) / (g.open + g.page)) * 100) : 0 }));
    const visits = total.total || 0;
    const kpi = (v, l, jump) => `<div class="kpi${jump ? ' click' : ''}"${jump ? ` data-jump="${jump}" title="Kattints a részletekért"` : ''}><div class="v">${v}</div><div class="l">${l}${jump ? ' ↓' : ''}</div></div>`;
    $('#kpis').innerHTML =
      kpi(fmt(visits), 'Oldalmegtekintés (látogató × oldal)') +
      kpi(fmt(opens), 'Játék megnyitva (ablak)', 'topGames') +
      kpi(fmt(gameRows.reduce((a, g) => a + g.page, 0)), 'Játékoldal megtekintve (pl. Google-ből)', 'gamesTable') +
      kpi(fmt(steam), '„Beszerzés Steamen” kattintás', 'gamesTable') +
      kpi(fmt(web), 'Steam-weboldal link kattintás', 'gamesTable') +
      kpi(fmt(games.size), 'Különböző játék, amit megnéztek', 'topGames');
    document.querySelectorAll('.kpi[data-jump]').forEach((k) => k.addEventListener('click', () => document.getElementById(k.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'center' })));

    // megnyitott játékok – nevekkel, képpel, azonnal látható
    const IMGS = new Map((window.GAMES || []).map((g) => [String(g.i), g.h]));
    const top = gameRows.filter((g) => g.open + g.page + g.steam + g.web > 0)
      .sort((a, b) => (b.open + b.page) - (a.open + a.page) || b.steam - a.steam);
    $('#topNote').textContent = top.length ? `– ${fmt(top.length)} játék` + (top.length > 30 ? ' (az első 30; a többi lent a táblázatban)' : '') : '';
    $('#topGames').innerHTML = top.length ? '<div class="topList">' + top.slice(0, 30).map((g, i) => {
      const h = IMGS.get(g.id); const img = h ? 'https://shared.fastly.steamstatic.com/store_item_assets/' + h : `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.id}/header.jpg`;
      return `<a class="topItem" href="../jatek/${g.id}.html" target="_blank"><span class="rank">${i + 1}.</span><img src="${esc(img)}" alt="" loading="lazy"><div>
        <div class="tn">${esc(g.name || '#' + g.id)}</div>
        <div class="ts"><b>${fmt(g.open + g.page)}</b> megnyitás · <b>${fmt(g.steam + g.web)}</b> Steamre kattintás</div></div></a>`;
    }).join('') + '</div>' : '<p class="muted">Ebben az időszakban még nem nyitottak meg játékot.</p>';
    $('#updated').textContent = auth.code === 'demo' ? '⚠ BEMUTATÓ MÓD – kitalált adatok, csak a felület kipróbálásához' : 'Frissítve: ' + new Date().toLocaleString('hu');

    // napi grafikon
    const days = (total.stats || []).map((s) => [s.day, s.daily || 0]);
    const max = Math.max(1, ...days.map((d) => d[1]));
    $('#chart').innerHTML = days.map(([d, v]) => `<div style="height:${Math.max(1, (v / max) * 100)}%" data-t="${esc(d)}: ${fmt(v)}"></div>`).join('');
    $('#chartNote').textContent = days.length ? '' : 'Ebben az időszakban még nincs adat.';

    renderGames();
    const rows = (arr, empty) => arr.length ? arr.map((r) => `<tr><td class="name">${r[0]}</td><td class="num">${fmt(r[1])}</td></tr>`).join('') : `<tr><td class="muted">${empty}</td></tr>`;
    $('#pagesTable tbody').innerHTML = rows(pages.sort((a, b) => b[2] - a[2]).slice(0, 15).map(([p, t, c]) => [`${esc(t || p)}<div class="muted">${esc(p)}</div>`, c]), 'Még nincs adat.');
    $('#trTable tbody').innerHTML = rows(tr.sort((a, b) => b[1] - a[1]).map(([t, c]) => [esc(t.replace(/^Fordítás: /, '')), c]), 'Még senki nem fordított.');
    const statRows = (r) => ((r && (r.stats || r.hits)) || []).map((s) => [esc(s.name || s.id || '(közvetlen)'), s.count]);
    $('#refsTable tbody').innerHTML = rows(statRows(refs), refs ? 'Még nincs adat.' : 'Nem érhető el.');
    let regionHu = null; try { regionHu = new Intl.DisplayNames(['hu'], { type: 'region' }); } catch { /* régi böngésző */ }
    const country = (s) => { const code = String(s.id || '').split('-')[0].toUpperCase(); try { if (regionHu && /^[A-Z]{2}$/.test(code)) return regionHu.of(code); } catch { /* ismeretlen kód */ } return s.name || s.id || '?'; };
    const locRows = ((locs && locs.stats) || []).map((s) => [esc(country(s)), s.count]);
    $('#locTable tbody').innerHTML = rows(locRows, locs ? 'Még nincs adat.' : 'Nem érhető el.');
  }

  function renderGames() {
    const q = $('#gameFilter').value.trim().toLowerCase();
    const list = gameRows.filter((g) => !q || (g.name || '').toLowerCase().includes(q))
      .sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name, 'hu') : (a[sortKey] - b[sortKey])) * sortDir);
    $('#gamesTable tbody').innerHTML = list.slice(0, 300).map((g) => `<tr>
      <td class="name"><a href="../jatek/${g.id}.html" target="_blank">${esc(g.name || '#' + g.id)}</a></td>
      <td class="num">${fmt(g.open)}</td><td class="num">${fmt(g.page)}</td><td class="num">${fmt(g.steam)}</td><td class="num">${fmt(g.web)}</td><td class="num">${g.conv}%</td></tr>`).join('')
      || '<tr><td class="muted" colspan="6">Ebben az időszakban még nem nyitottak meg játékot.</td></tr>';
    $('#gamesNote').textContent = list.length > 300 ? `Az első 300 látszik a ${fmt(list.length)}-ból – szűrj név szerint.` : '';
  }
  $('#gameFilter').addEventListener('input', renderGames);
  document.querySelectorAll('#gamesTable th').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.k; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === 'name' ? 1 : -1; } renderGames();
  }));

  // ------------------------------------------------------------ bemutató mód (kód: "demo") – kitalált adatok a felület kipróbálásához
  function demo(path) {
    const ids = [...NAMES.keys()].slice(0, 40); let seed = 7; const rnd = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); };
    if (path.endsWith('/stats/total')) return { total: 4210, total_events: 1980, stats: Array.from({ length: range === 1 ? 1 : Math.min(range, 30) }, (_, i) => ({ day: new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), daily: 80 + rnd(200) })).reverse() };
    if (path.endsWith('/stats/hits')) {
      const hits = [{ path_id: 1, path: '/', title: 'Főoldal', count: 3100, event: false }];
      ids.forEach((id, i) => {
        hits.push({ path_id: 100 + i, path: 'megnyitas-' + id, title: NAMES.get(id), count: 300 - i * 7 + rnd(20), event: true });
        hits.push({ path_id: 200 + i, path: 'steam-' + id, title: NAMES.get(id), count: 90 - i * 2 + rnd(10), event: true });
        if (i % 3 === 0) hits.push({ path_id: 300 + i, path: 'steamweb-' + id, title: NAMES.get(id), count: 10 + rnd(15), event: true });
        if (i % 2 === 0) hits.push({ path_id: 400 + i, path: '/jatek/' + id + '.html', title: NAMES.get(id) + ' – ingyenes Steam játék', count: 40 + rnd(60), event: false });
      });
      hits.push({ path_id: 900, path: 'forditas-hu', title: 'Fordítás: Magyar', count: 120, event: true });
      hits.push({ path_id: 901, path: 'forditas-de', title: 'Fordítás: Deutsch', count: 35, event: true });
      return { hits, more: false };
    }
    if (path.endsWith('/toprefs')) return { stats: [{ name: 'google.com', count: 1450 }, { name: '(közvetlen)', count: 900 }, { name: 'reddit.com', count: 210 }] };
    if (path.endsWith('/locations')) return { stats: [{ name: 'Magyarország', count: 2100 }, { name: 'Németország', count: 380 }, { name: 'Románia', count: 160 }] };
    return {};
  }
  init();
})();
