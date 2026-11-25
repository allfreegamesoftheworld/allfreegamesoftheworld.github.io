/* Játékajánló AI – a kérést egy AI (Cloudflare Workers AI) értelmezi és választ a jelöltek közül;
   ha az AI nem érhető el, a böngészőben futó szabályalapú ajánló dolgozik. */
(function () {
  'use strict';
  var AI_URL = 'https://afg-ai.allfreegames.workers.dev'; // a Cloudflare Worker címe (üres = csak a beépített ajánló)
  var META = window.META || { tags: {} };
  var I = window.i18n || { lang: 'hu', tag: function () { return null; } };
  var HU = I.lang === 'hu';
  var GAMES = (window.GAMES || []).filter(function (g) { return g.n && !/dedicated server/i.test(g.n); });
  var IMG_BASE = 'https://shared.fastly.steamstatic.com/store_item_assets/';

  // ------------------------------------------------------------ szövegek
  var TX = {
    title: ['Játékajánló AI', 'Game finder AI'],
    fab: ['Játékajánló AI', 'Game finder AI'],
    ph: ['Írd le, milyen játékot keresel…', 'Describe the game you are looking for…'],
    send: ['Küldés', 'Send'],
    hello: ['Szia! 👋 Segítek játékot választani a(z) {0} ingyenes játék közül. Írd le, kinek és milyen játék kellene, például:',
      'Hi! 👋 I can help you pick from {0} free games. Tell me who it is for and what kind of game you want, for example:'],
    examples: [['8 éves lánynak vicces, cuki játék', 'Barátokkal játszható online játék', 'Nyugis építős játék gyenge gépre', '12 éves fiúnak autós játék, ne legyen ijesztő', 'Ijesztő horror 2 GB alatt'],
      ['A funny, cute game for an 8 year old girl', 'Online game to play with friends', 'Relaxing building game for a weak PC', 'Racing game for a 12 year old boy, nothing scary', 'Scary horror game under 2 GB']],
    understood: ['Ezt értettem:', 'Here is what I understood:'],
    found: ['Íme a legjobb találatok:', 'Here are the best matches:'],
    more: ['Íme még néhány:', 'Here are some more:'],
    none: ['Erre sajnos nem találtam játékot. 😕 Próbáld lazábban: hagyj el egy feltételt (például a méretet vagy a „barátokkal”-t), vagy írd le másképp.',
      'Sorry, I could not find a game for that. 😕 Try loosening it: drop a condition (e.g. size or "with friends"), or phrase it differently.'],
    noMore: ['Nincs több találat erre. Írj új kérést, vagy finomíts!', 'No more matches. Ask something new or refine it!'],
    dunno: ['Ezt nem egészen értettem. 🤔 Írd le például az életkort, a hangulatot (vicces, nyugis, ijesztő) vagy a játék témáját (autós, lovas, építős, focis…).',
      'I did not quite get that. 🤔 Try mentioning an age, a mood (funny, relaxing, scary) or a theme (racing, horses, building, football…).'],
    thanks: ['Szívesen! 😊 Ha mást keresnél, csak írj.', 'You are welcome! 😊 Just ask if you need anything else.'],
    kidSafe: ['gyerekbarát szűrés: erőszakos, véres és ijesztő játékok nélkül', 'kid-safe: no violent, gory or scary games'],
    age: ['{0} évesnek', 'for age {0}'],
    girl: ['lányoknak tetsző', 'girl-friendly picks'],
    boy: ['fiúknak tetsző', 'boy-friendly picks'],
    size: ['legfeljebb {0} GB', 'up to {0} GB'],
    friends: ['barátokkal / többen', 'with friends / multiplayer'],
    online: ['online', 'online'],
    solo: ['egyjátékos', 'single-player'],
    local: ['egy gépen többen', 'local multiplayer'],
    newer: ['újabb játékok előnyben', 'newer games first'],
    popular: ['népszerűek előnyben', 'popular games first'],
    not: ['nem: {0}', 'not: {0}'],
    cMore: ['➕ Mutass még', '➕ Show more'],
    cSmall: ['💾 Kisebb méretű', '💾 Smaller size'],
    cFriends: ['👫 Barátokkal', '👫 With friends'],
    cCalm: ['😌 Nyugisabb', '😌 More relaxing'],
    cFunny: ['😂 Viccesebb', '😂 Funnier'],
    cNew: ['🔄 Új keresés', '🔄 New search'],
    newChat: ['Rendben, kezdjük elölről! Mit keresel?', 'OK, let us start over! What are you looking for?'],
    unknownSize: ['? GB', '? GB'],
    reviews: ['értékelés', 'reviews'],
    close: ['Bezárás', 'Close'],
    note: ['A beírt szöveg nem megy el sehova – az ajánló a te böngésződben fut.', 'Nothing you type leaves your browser – the finder runs on your device.'],
    noteAi: ['Mesterséges intelligencia válaszol (Cloudflare Workers AI). A szöveget nem tároljuk – ne írj be személyes adatot.', 'Answers come from an AI (Cloudflare Workers AI). Your text is not stored – please do not enter personal data.'],
  };
  function t(k) { var v = TX[k][HU ? 0 : 1]; for (var i = 1; i < arguments.length; i++) v = v.split('{' + (i - 1) + '}').join(arguments[i]); return v; }

  // ------------------------------------------------------------ címkék
  var enToId = {};
  for (var id in META.tags || {}) enToId[String(META.tags[id][1]).trim().toLowerCase()] = +id;
  function ids(names) { var out = []; names.forEach(function (n) { var x = enToId[n.toLowerCase()]; if (x) out.push(x); }); return out; }
  function tagLabel(id) { var l = I.tag && I.tag(id); if (l) return l; var m = META.tags[id]; return m ? (HU ? m[0] : m[1]) : ''; }
  var deacc = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ő/g, 'o').replace(/ű/g, 'u'); };

  // kulcsszavak: [szótövek, címkék, rövid magyar / angol címke]; "=" elején: pontos szó; szóközzel: kifejezés
  var KW = [
    [['vicc', 'humor', 'nevet', 'mokas', 'funny', 'comed', 'hilar', 'joke', '=fun', 'szorakoz', 'bolond', 'hulye'], ['Funny', 'Comedy'], 'vicces', 'funny'],
    [['cuki', 'aranyos', 'edes', '=cute', 'kawaii', 'adorable', 'bajos'], ['Cute', 'Colorful', 'Cartoony'], 'cuki', 'cute'],
    [['nyugis', 'nyugod', 'relax', 'pihen', 'lazit', 'chill', 'cozy', 'cosy', 'kenyelmes', 'calm', 'bekes', 'meghitt', 'stresszmentes'], ['Relaxing', 'Cozy', 'Wholesome'], 'nyugis', 'relaxing'],
    [['ijeszt', 'horror', 'felelm', 'parazos', 'scary', 'creepy', 'spooky', 'remis', 'hatborzong', 'kisert'], ['Horror', 'Psychological Horror', 'Survival Horror', 'Jump Scare'], 'ijesztő', 'scary'],
    [['izgalm', 'porges', 'akcio', 'action', 'exciting', 'adrenalin'], ['Action', 'Fast-Paced'], 'akciós', 'action'],
    [['logik', 'fejtor', 'rejtvey', 'puzzle', 'gondolkod', 'agytorna', 'brain', 'logic', 'riddle', 'kirako'], ['Puzzle', 'Logic'], 'logikai', 'puzzle'],
    [['epit', 'build', 'craft', 'kreativ', 'creativ', 'sandbox', 'alkot', 'barkac'], ['Building', 'Sandbox', 'Crafting', 'Base Building'], 'építős', 'building'],
    [['autos', '=auto', 'autok', 'autoval', 'verseny', 'racing', '=race', '=car', '=cars', 'driv', 'vezet', 'kocsi', 'gyorsulas'], ['Racing', 'Driving'], 'autós / verseny', 'racing'],
    [['foci', 'labdarug', 'soccer', '=football', 'futball'], ['Football (Soccer)', 'Sports'], 'foci', 'football'],
    [['sport'], ['Sports'], 'sport', 'sports'],
    [['kosarlabd', 'basket'], ['Basketball'], 'kosárlabda', 'basketball'],
    [['lovol', 'shoot', '=fps', 'fegyver', '=gun', '=guns', 'loves'], ['Shooter', 'FPS', 'Third-Person Shooter'], 'lövöldözős', 'shooter'],
    [['strateg', 'strategy', 'takti', 'tactic'], ['Strategy', 'Tactical', 'Turn-Based Strategy'], 'stratégia', 'strategy'],
    [['kaland', 'adventure', 'felfedez', 'explor'], ['Adventure', 'Exploration'], 'kaland', 'adventure'],
    [['=rpg', 'szerepjat', 'role play', 'roleplay'], ['RPG', 'Action RPG'], 'szerepjáték', 'RPG'],
    [['allat', 'animal', '=pet', '=pets', 'haziallat', 'kisallat'], ['Animals', 'Cats', 'Dogs', 'Horses'], 'állatos', 'animals'],
    [['=lo', '=lovas', '=lovak', '=lovat', '=lovakkal', '=lovakat', '=lovaskodas', 'lovagl', 'horse', 'poni', 'pony', 'csiko'], ['Horses'], 'lovas', 'horses'],
    [['macsk', 'cica', '=cat', '=cats', 'kitt', 'kitten', 'cicus'], ['Cats'], 'cicás', 'cats'],
    [['kutya', 'kutyus', '=dog', '=dogs', 'puppy', 'kiskutya'], ['Dog', 'Dogs'], 'kutyás', 'dogs'],
    [['dino'], ['Dinosaurs'], 'dínós', 'dinosaurs'],
    [['sarkany', 'dragon'], ['Dragons'], 'sárkányos', 'dragons'],
    [['robot', 'mech'], ['Robots', 'Mechs'], 'robotos', 'robots'],
    [['urhaj', '=ur', '=urben', 'urbeli', 'urlenyes', 'space', 'bolygo', 'planet', 'csillag', 'galax', 'alien', 'urleny'], ['Space', 'Sci-fi', 'Aliens'], 'űr', 'space'],
    [['zene', 'music', 'ritmus', 'rhythm', 'tanc', 'dance', 'enekl', 'sing'], ['Music', 'Rhythm'], 'zenés', 'music'],
    [['fozo', 'fozes', 'fozni', 'sutes', 'sutni', 'cook', 'bake', 'konyha', 'etterem', 'restaurant', 'cukraszd', 'suti'], ['Cooking'], 'főzős', 'cooking'],
    [['farm', 'gazdas', 'tanya', 'kertesz', 'garden', 'agricult', 'mezogazd'], ['Farming Sim', 'Farming', 'Agriculture'], 'farmos', 'farming'],
    [['varosep', 'city build', 'varost', '=city', '=town', 'telepules'], ['City Builder'], 'városépítő', 'city builder'],
    [['tulel', 'surviv'], ['Survival', 'Open World Survival Craft'], 'túlélős', 'survival'],
    [['zombi'], ['Zombies'], 'zombis', 'zombies'],
    [['magi', 'varazs', 'boszork', 'witch', 'wizard', 'tunder', 'fairy', 'fantasy', 'fantaz', 'mesebeli', 'meses'], ['Magic', 'Fantasy'], 'varázslatos', 'magic'],
    [['anime', 'manga'], ['Anime'], 'anime', 'anime'],
    [['pixel', 'retro', '8 bit', '8-bit', 'regimodi'], ['Pixel Graphics', 'Retro'], 'retró / pixeles', 'retro'],
    [['nyitott vilag', 'open world', 'openworld'], ['Open World'], 'nyitott világ', 'open world'],
    [['tortenet', 'story', 'sztori', 'narrat', 'cselekmeny'], ['Story Rich'], 'jó történet', 'story rich'],
    [['kartya', '=card', 'kartyaz'], ['Card Game', 'Card Battler', 'Deckbuilding'], 'kártyás', 'cards'],
    [['sakk', 'chess'], ['Chess'], 'sakk', 'chess'],
    [['ugral', 'platform', '=jump', 'ugrals'], ['Platformer', '2D Platformer', '3D Platformer'], 'ugrálós', 'platformer'],
    [['szimul', 'simul'], ['Simulation'], 'szimulátor', 'simulation'],
    [['tower defense', 'toronyved', 'vedekez'], ['Tower Defense'], 'toronyvédő', 'tower defense'],
    [['moba'], ['MOBA'], 'MOBA', 'MOBA'],
    [['battle royale', 'royale'], ['Battle Royale'], 'battle royale', 'battle royale'],
    [['versengo', 'kompetit', 'competit', 'rangsor', 'ranked', 'esport', '=pvp'], ['Competitive', 'PvP'], 'versengős', 'competitive'],
    [['oktat', 'tanul', 'iskol', 'educat', 'learn', 'matek', '=math', 'fejleszt'], ['Education'], 'tanulós', 'educational'],
    [['szep', 'gyonyoru', 'latvanyos', 'beautiful', 'grafik', 'pretty'], ['Beautiful', 'Atmospheric'], 'szép grafika', 'beautiful'],
    [['nehez', 'kihivas', 'difficult', '=hard', 'challeng'], ['Difficult'], 'nehéz', 'difficult'],
    [['konnyu', 'egyszeru', '=easy', 'simple', 'kezdo', 'beginner'], ['Casual'], 'könnyű', 'easy'],
    [['party', 'buli', 'csalad', 'family'], ['Family Friendly', 'Party Game', 'Party'], 'családi / parti', 'family / party'],
    [['detekt', 'nyomoz', 'rejtely', 'mystery', 'detective', 'krimi'], ['Detective', 'Mystery', 'Investigation'], 'nyomozós', 'detective'],
    [['kaloz', 'pirate'], ['Pirates'], 'kalózos', 'pirates'],
    [['ninja', 'szamuraj', 'samurai'], ['Ninja', 'Samurai'], 'nindzsás', 'ninja'],
    [['=lovag', '=lovagok', 'lovagi', 'kozepkor', 'medieval', 'knight'], ['Medieval'], 'középkori', 'medieval'],
    [['haboru', '=war', 'katona', 'militar', '=tank', 'tankos'], ['War', 'Military', 'Tanks'], 'háborús', 'war'],
    [['vadnyugat', 'western', 'cowboy'], ['Western'], 'vadnyugati', 'western'],
    [['horgas', 'halasz', 'fishing', '=fish'], ['Fishing'], 'horgászós', 'fishing'],
    [['repul', 'flight', 'pilot'], ['Flight'], 'repülős', 'flight'],
    [['vonat', 'train', 'mozdony'], ['Trains'], 'vonatos', 'trains'],
    [['hajo', '=ship', 'sail', 'vitorl', 'tengeri'], ['Sailing', 'Naval'], 'hajós', 'ships'],
    [['szuperhos', 'superhero'], ['Superhero'], 'szuperhős', 'superhero'],
    [['vampir', 'vampire'], ['Vampires'], 'vámpíros', 'vampires'],
    [['golf'], ['Golf', 'Mini Golf'], 'golf', 'golf'],
    [['tenisz', 'tennis'], ['Tennis'], 'tenisz', 'tennis'],
    [['harcol', 'verekedo', 'verekedos', 'fight', 'birkoz', 'karate', 'kung'], ['Fighting', 'Martial Arts', 'Beat \'em up'], 'verekedős', 'fighting'],
    [['gordeszk', 'skate'], ['Skateboarding'], 'gördeszkás', 'skateboarding'],
    [['bicikl', 'bring', '=bike', 'bmx'], ['Cycling', 'Bikes', 'BMX'], 'biciklis', 'cycling'],
    [['motor'], ['Motorbike', 'Motocross'], 'motoros', 'motorbikes'],
    [['kviz', 'quiz', 'trivia', 'tudas'], ['Trivia'], 'kvíz', 'trivia'],
    [['szojatek', 'word game', 'betu', 'helyesir'], ['Word Game', 'Spelling'], 'szójáték', 'word game'],
    [['gepel', 'typing'], ['Typing'], 'gépelős', 'typing'],
    [['programoz', 'kodol', 'coding', 'programming'], ['Programming', 'Coding'], 'programozós', 'coding'],
    [['idle', 'clicker', 'kattintgat', 'incremental'], ['Idler', 'Clicker', 'Incremental'], 'kattintgatós', 'idle / clicker'],
    [['rovid', '=short'], ['Short'], 'rövid', 'short'],
    [['erzelm', 'szomoru', 'emotional', '=sad', 'megindito'], ['Emotional'], 'megható', 'emotional'],
    [['romant', 'szerelm', 'romance'], ['Romance'], 'romantikus', 'romance'],
    [['lopakod', 'stealth', 'orgyilk', 'assassin'], ['Stealth'], 'lopakodós', 'stealth'],
    [['sotet', '=dark', 'gotik'], ['Dark', 'Gothic'], 'sötét hangulatú', 'dark'],
    [['menedzs', 'manage', 'tycoon', 'uzlet', 'boltos', 'shop', 'vallalkoz'], ['Management', 'Shop Keeper'], 'menedzser', 'management'],
    [['rejtett targy', 'hidden object', 'keresgelo'], ['Hidden Object'], 'rejtett tárgyas', 'hidden object'],
    [['szabadulo', 'escape room'], ['Escape Room'], 'szabadulószoba', 'escape room'],
    [['divat', 'fashion', 'oltoztet', 'smink', 'dress', 'oltozk', 'karakterkeszit', 'customiz'], ['Character Customization', 'Decorating'], 'öltöztetős', 'dress-up'],
    [['berendez', 'dekor', 'decor', 'interior', 'lakasber', 'hazat'], ['Decorating'], 'berendezős', 'decorating'],
    [['eletszim', 'life sim', 'eletet', 'mindennap'], ['Life Sim'], 'életszimulátor', 'life sim'],
    [['nyuszi', 'nyul', 'rabbit', 'bunny', 'roka', 'fox', 'farkas', 'wolf', 'madar', 'bird', 'capybara', 'kapibara'], ['Animals', 'Foxes', 'Birds', 'Capybaras', 'Wolves'], 'állatos', 'animals'],
    [['allatkert', '=zoo'], ['Zoo'], 'állatkertes', 'zoo'],
    [['gyujtog', 'collect', 'pokemon', 'szorny', 'monster'], ['Creature Collector', 'Collectathon'], 'gyűjtögetős', 'collecting'],
    [['tarsasj', 'board game', 'tabletop', 'dobokocka', 'dice'], ['Board Game', 'Tabletop', 'Dice'], 'társasjáték', 'board game'],
    [['rajzfilm', 'cartoon', 'mese'], ['Cartoon', 'Cartoony'], 'rajzfilmes', 'cartoon'],
    [['parkour', 'futos', 'runner'], ['Parkour', 'Runner'], 'futós', 'runner'],
    [['=tel', '=telen', '=teli', 'havas', 'snow', 'karacsony', 'christmas', 'sielo', 'ski'], ['Snow', 'Skiing'], 'havas / téli', 'snow'],
    [['vizalatt', 'tenger', 'ocean', 'underwater'], ['Underwater'], 'víz alatti', 'underwater'],
  ];
  // gyerekeknél tiltott címkék
  var KID_BLOCK = ids(['Violent', 'Gore', 'Blood', 'Horror', 'Psychological Horror', 'Survival Horror', 'Jump Scare', 'Mature', 'Dark', 'Dating Sim', 'Romance', 'Shooter', 'FPS', 'Third-Person Shooter', 'Top-Down Shooter', 'Arena Shooter', 'Hero Shooter', 'Extraction Shooter', 'Looter Shooter', 'Boomer Shooter', 'War', 'Military', 'Zombies', 'Battle Royale', 'Gambling', 'Crime', 'Memes', 'Dark Humor', 'Dark Comedy', 'Lovecraftian', 'Demons', 'Thriller', 'Psychological', 'Sexual Themes', 'Assassin', 'Sniper', 'Heist', 'Post-apocalyptic', 'Survival', 'Vampires', 'Werewolves', 'Gun Customization', 'Dark Fantasy', 'Souls-like', 'Unforgiving', 'Perma Death']);
  var TEEN_BLOCK = ids(['Gore', 'Blood', 'Mature', 'Dating Sim', 'Gambling', 'Sexual Themes', 'Psychological Horror', 'Jump Scare']);
  var KID_BOOST = ids(['Family Friendly', 'Kids', 'Cute', 'Colorful', 'Cartoony', 'Cartoon', 'Wholesome', 'Casual', 'Education']);
  var GIRL = ids(['Cute', 'Colorful', 'Cozy', 'Wholesome', 'Family Friendly', 'Cartoony', 'Cartoon', 'Animals', 'Cats', 'Horses', 'Dogs', 'Life Sim', 'Cooking', 'Magic', 'Decorating', 'Character Customization', 'Music', 'Rhythm', 'Creature Collector', 'Hidden Object', 'Female Protagonist', 'Farming Sim', 'Relaxing', 'Kids']);
  var BOY = ids(['Action', 'Racing', 'Driving', 'Building', 'Robots', 'Mechs', 'Dinosaurs', 'Sports', 'Football (Soccer)', 'Adventure', 'Platformer', 'Sandbox', 'Space', 'Superhero', 'Dragons', 'Pirates', 'Ninja']);
  var FAMILY = enToId['family friendly'];
  var KW_IDS = KW.map(function (k) { return ids(k[1]); });

  // ------------------------------------------------------------ értelmezés
  var NEG_BEFORE = { ne: 1, nem: 1, semmi: 1, sem: 1, no: 1, not: 1, without: 1, dont: 1, never: 1, nincs: 1, kerulj: 1, nelkul: 1, kiveve: 1, except: 1 };
  var NEG_AFTER = { nelkul: 1, nelkuli: 1, nelkulit: 1, mentes: 1, mentest: 1, free: 0 };
  var REFINE = { es: 1, de: 1, inkabb: 1, legyen: 1, csak: 1, plusz: 1, and: 1, but: 1, also: 1, plus: 1, rather: 1, now: 1, meg: 1, most: 1, viszont: 1, legyenek: 1, maradjon: 1 };

  function parse(text) {
    var norm = deacc(text);
    var toks = norm.split(/[^a-z0-9+]+/).filter(Boolean);
    var c = { want: [], not: [], age: null, kid: false, gender: null, sizeMax: null, modes: null, modeLabel: null, plat: null, newer: false, popular: false, any: false };
    function negAt(i, len) {
      for (var j = Math.max(0, i - 3); j < i; j++) if (NEG_BEFORE[toks[j]]) return true;
      var a = toks[i + (len || 1)]; return !!(a && NEG_AFTER[a]);
    }
    KW.forEach(function (k, ki) {
      var hit = -1, len = 1;
      k[0].forEach(function (s) {
        if (hit >= 0) return;
        if (s.indexOf(' ') > 0) { var p = norm.indexOf(s); if (p >= 0) { hit = norm.slice(0, p).split(/[^a-z0-9+]+/).filter(Boolean).length; len = s.split(' ').length; } return; }
        for (var i = 0; i < toks.length; i++) {
          if (s[0] === '=' ? toks[i] === s.slice(1) : (toks[i].indexOf(s) === 0)) { hit = i; return; }
        }
      });
      if (hit >= 0 && KW_IDS[ki].length) { (negAt(hit, len) ? c.not : c.want).push(ki); c.any = true; }
    });
    // címkenevek közvetlenül (bármely nyelven, amit a felület ismer)
    var extra = [];
    for (var id in META.tags) {
      var names = [META.tags[id][0], META.tags[id][1], I.tag && I.tag(id)].filter(Boolean).map(deacc);
      names.forEach(function (n) { n = n.trim(); if (n.length >= 5 && (' ' + norm + ' ').indexOf(' ' + n) >= 0 && extra.indexOf(+id) < 0) extra.push(+id); });
    }
    c.extra = extra.filter(function (x) { return !KW_IDS.some(function (arr, ki) { return (c.want.indexOf(ki) >= 0 || c.not.indexOf(ki) >= 0) && arr.indexOf(x) >= 0; }); });
    if (c.extra.length) c.any = true;
    // életkor
    var m = norm.match(/(\d{1,2})\s*-?\s*(?:ev|eves|year|yr|y\.?o\b)/) || norm.match(/(?:age|kor)\s*:?\s*(\d{1,2})\b/);
    if (m) { c.age = +m[1]; }
    else if (/\b(ovod|kisgyerek|toddler|preschool|picike|totyog)/.test(norm)) c.age = 5;
    else if (/\b(gyerek|gyermek|kid|kids|child|children|kisfiu|kislany|unoka|kicsiknek|kicsinek)/.test(norm)) c.age = 8;
    else if (/\b(tini|kamasz|teen|serdul)/.test(norm)) c.age = 14;
    else if (/\b(felnott|adult|grown)/.test(norm)) c.age = 18;
    if (c.age != null) { c.any = true; c.kid = c.age < 13; }
    // nem
    if (/\b(lany|lanyos|lanyom|lanyok|lanyomnak|kislany|girl|girls|noi\b|hugom|unokahug)/.test(norm)) { c.gender = 'g'; c.any = true; }
    else if (/\b(fiu|fius|fiam|fiunak|fiuk|kisfiu|boy|boys|ocsem|unokaocs)/.test(norm)) { c.gender = 'b'; c.any = true; }
    // méret
    var sm = norm.match(/(\d+(?:[.,]\d+)?)\s*(?:gb|giga)/);
    if (sm) { c.sizeMax = parseFloat(sm[1].replace(',', '.')); c.any = true; }
    else if (/(gyenge gep|regi gep|keves hely|kis meret|kicsi meret|laptop|krumpli|potato|low.?end|weak (pc|computer)|old (pc|computer)|small size|kis helyet|kevés hely|lassu gep|nem eros)/.test(norm)) { c.sizeMax = 3; c.any = true; }
    // játékmód
    if (/(barat(?!sag)|tarssal|tarsaval|tarsak|egyutt|kozos|kooperativ|\bkoop|co-?op|coop|friend|together|tobben|csapat|\bteam\b)/.test(norm)) { c.modes = [9, 38, 1, 24]; c.modeLabel = 'friends'; c.any = true; }
    else if (/(osztott kepernyo|split ?screen|egy gepen|tesoval|testverrel|testver|tesom|couch|ugyanazon a gepen)/.test(norm)) { c.modes = [24]; c.modeLabel = 'local'; c.any = true; }
    else if (/(online|tobbjatekos|multiplayer|multi\b|interneten)/.test(norm)) { c.modes = [1, 36, 38]; c.modeLabel = 'online'; c.any = true; }
    else if (/(egyedul|egyjatekos|single.?player|\bsolo\b|offline|internet nelkul)/.test(norm)) { c.modes = [2]; c.modeLabel = 'solo'; c.any = true; }
    // platform
    if (/\b(mac|macos|macbook|apple)\b/.test(norm)) { c.plat = 'm'; c.any = true; }
    else if (/\blinux\b/.test(norm)) { c.plat = 'l'; c.any = true; }
    else if (/steam ?deck|\bdeck\b/.test(norm)) { c.plat = 'd'; c.any = true; }
    else if (/\bvr\b|virtual/.test(norm)) { c.plat = 'v'; c.any = true; }
    if (/\b(uj|ujabb|legujabb|friss|new|newest|latest|recent|mostani)/.test(norm)) { c.newer = true; c.any = true; }
    if (/\b(nepszeru|legjobb|top|best|popular|sokan|hires|ismert|famous)/.test(norm)) { c.popular = true; c.any = true; }
    c.toks = toks; c.norm = norm;
    return c;
  }

  function merge(a, b) {
    var c = JSON.parse(JSON.stringify(a));
    b.want.forEach(function (k) { if (c.want.indexOf(k) < 0) c.want.push(k); var i = c.not.indexOf(k); if (i >= 0) c.not.splice(i, 1); });
    b.not.forEach(function (k) { if (c.not.indexOf(k) < 0) c.not.push(k); var i = c.want.indexOf(k); if (i >= 0) c.want.splice(i, 1); });
    (b.extra || []).forEach(function (x) { if (c.extra.indexOf(x) < 0) c.extra.push(x); });
    ['age', 'gender', 'sizeMax', 'modes', 'modeLabel', 'plat'].forEach(function (k) { if (b[k] != null) c[k] = b[k]; });
    if (b.age != null) c.kid = b.kid;
    c.newer = c.newer || b.newer; c.popular = c.popular || b.popular;
    return c;
  }

  // ------------------------------------------------------------ ajánlás
  function quality(g) { var n = g.c || 0, p = (g.r || 0) / 100; return n ? (p * n + 0.5 * 20) / (n + 20) : 0.35; }
  function recommend(c) {
    var want = {}, groups = [];
    c.want.forEach(function (ki) { var g = KW_IDS[ki]; groups.push(g); g.forEach(function (x, i) { want[x] = Math.max(want[x] || 0, i === 0 ? 2 : 1.6); }); });
    (c.extra || []).forEach(function (x) { want[x] = 2; groups.push([x]); });
    var block = {};
    c.not.forEach(function (ki) { KW_IDS[ki].forEach(function (x) { block[x] = 1; }); });
    (c.notIds || []).forEach(function (x) { block[x] = 1; });
    if (c.age != null && c.age < 13) KID_BLOCK.forEach(function (x) { if (!want[x]) block[x] = 1; });
    else if (c.age != null && c.age < 16) TEEN_BLOCK.forEach(function (x) { if (!want[x]) block[x] = 1; });
    var boost = {};
    (c.gender === 'g' ? GIRL : c.gender === 'b' ? BOY : []).forEach(function (x) { boost[x] = 0.7; });
    if (c.age != null && c.age < 13) KID_BOOST.forEach(function (x) { boost[x] = Math.max(boost[x] || 0, 0.6); });
    var hasWant = groups.length > 0, hasBoost = Object.keys(boost).length > 0;
    var nowY = new Date().getFullYear();
    var out = [];
    for (var gi = 0; gi < GAMES.length; gi++) {
      var g = GAMES[gi], tg = g.t || [];
      if (c.age != null && c.age < 18 && g.a != null && g.a > Math.max(c.age, 3)) continue;
      var bad = false; for (var k = 0; k < tg.length; k++) if (block[tg[k]]) { bad = true; break; }
      if (bad) continue;
      if (c.sizeMax != null && (g.s == null || g.s > c.sizeMax * 1024)) continue;
      if (c.modes && !(g.m || []).some(function (x) { return c.modes.indexOf(x) >= 0; })) continue;
      if (c.plat && (g.p || '').indexOf(c.plat) < 0) continue;
      var s = 0, why = [], gm = 0;
      for (var p = 0; p < tg.length; p++) {
        var pos = p < 3 ? 1.6 : p < 6 ? 1.25 : 1;
        if (want[tg[p]]) { s += want[tg[p]] * pos; why.push(tg[p]); }
        else if (boost[tg[p]]) { s += boost[tg[p]] * pos; if (why.length < 6) why.push(tg[p]); }
      }
      groups.forEach(function (grp) { if (grp.some(function (x) { return tg.indexOf(x) >= 0; })) gm++; });
      if (hasWant && gm === 0) continue;
      if (!hasWant && hasBoost && !why.length) continue;
      s += gm * 2.5;
      if (hasWant && gm === groups.length && groups.length > 1) s += 2;
      var q = quality(g); s += q * 4 + Math.log10((g.c || 0) + 1) * (c.popular ? 1.4 : 0.7);
      if ((g.c || 0) >= 10 && (g.r || 0) < 55) s -= 2.5;
      if ((g.c || 0) < 5) s -= 1;
      if (c.kid && FAMILY && tg.indexOf(FAMILY) >= 0) s += 1.5;
      if (c.kid && g.a == null) s -= 0.6; // ismeretlen korhatár: kicsit hátrébb
      if (c.newer && g.d) { var y = new Date(g.d * 1000).getFullYear(); s += y >= nowY - 1 ? 3 : y >= nowY - 3 ? 1.5 : 0; }
      out.push({ g: g, s: s, why: why });
    }
    out.sort(function (a, b) { return b.s - a.s; });
    // azonos sorozatból ne legyen túl sok egymás után
    var seen = {}, res = [];
    out.forEach(function (r) { var key = deacc(r.g.n).replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 2).join(' '); seen[key] = (seen[key] || 0) + 1; if (seen[key] <= 2) res.push(r); });
    return res;
  }

  // ------------------------------------------------------------ felület
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); };
  var fmtSize = function (mb) { return mb == null ? '? GB' : mb >= 1024 ? (mb / 1024).toLocaleString(I.locale || 'hu', { maximumFractionDigits: mb >= 10240 ? 0 : 1 }) + ' GB' : Math.max(1, Math.round(mb)) + ' MB'; };
  var img = function (g) { return g.h ? IMG_BASE + g.h : IMG_BASE + 'steam/apps/' + g.i + '/header.jpg'; };

  var fab = document.createElement('button');
  fab.className = 'cbFab'; fab.type = 'button';
  fab.innerHTML = '<span class="cbIco">💬</span><span class="cbFabTx">' + esc(t('fab')) + '</span>';
  var panel = document.createElement('section');
  panel.className = 'cbPanel'; panel.hidden = true; panel.setAttribute('aria-label', t('title'));
  panel.innerHTML = '<header class="cbHead"><span class="cbBot">🤖</span><b>' + esc(t('title')) + '</b><button type="button" class="cbX" aria-label="' + esc(t('close')) + '">✕</button></header>' +
    '<div class="cbMsgs" role="log" aria-live="polite"></div>' +
    '<form class="cbForm"><input class="cbIn" type="text" maxlength="300" autocomplete="off" placeholder="' + esc(t('ph')) + '"><button class="cbSend" type="submit" aria-label="' + esc(t('send')) + '">➤</button></form>' +
    '<div class="cbNote">' + esc(t(AI_URL ? 'noteAi' : 'note')) + '</div>';
  document.body.append(fab, panel);
  var msgs = panel.querySelector('.cbMsgs'), input = panel.querySelector('.cbIn');
  var state = null, results = [], shown = 0, greeted = false;

  // görgetés: a válasz ELEJE legyen látható (nem ugrik az aljára)
  var anchor = null, waitAnchor = false;
  function scroll() {
    if (anchor && anchor.isConnected) { msgs.scrollTop += anchor.getBoundingClientRect().top - msgs.getBoundingClientRect().top - 8; return; }
    msgs.scrollTop = msgs.scrollHeight;
  }
  function add(cls, html) {
    var d = document.createElement('div'); d.className = 'cbMsg ' + cls; d.innerHTML = html; msgs.append(d);
    if (waitAnchor && cls.indexOf('bot') === 0 && cls.indexOf('typing') < 0) { anchor = d; waitAnchor = false; }
    scroll(); return d;
  }
  function chips(list) {
    var d = document.createElement('div'); d.className = 'cbChips';
    list.forEach(function (c) { var b = document.createElement('button'); b.type = 'button'; b.className = 'cbChip'; b.textContent = c[0]; b.onclick = c[1]; d.append(b); });
    msgs.append(d); scroll();
  }
  function open() {
    panel.hidden = false; fab.hidden = true; document.body.classList.add('cbOpen');
    if (!greeted) {
      greeted = true;
      add('bot', esc(t('hello', GAMES.length.toLocaleString(I.locale || 'hu'))));
      chips(TX.examples[HU ? 0 : 1].map(function (e) { return [e, function () { ask(e); }]; }));
    }
    setTimeout(function () { input.focus(); }, 50);
    window.track && window.track('chatbot-megnyitas', 'Játékajánló megnyitva');
  }
  function close() { panel.hidden = true; fab.hidden = false; document.body.classList.remove('cbOpen'); }
  fab.onclick = open;
  panel.querySelector('.cbX').onclick = close;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) { var m = document.getElementById('modal'); if ((!m || m.hidden) && !(window.galleryOpen && window.galleryOpen())) close(); }
  });

  function summary(c) {
    var p = [];
    if (c.age != null) p.push('🎂 ' + t('age', c.age) + (c.age < 13 ? ' (' + t('kidSafe') + ')' : ''));
    if (c.gender) p.push((c.gender === 'g' ? '👧 ' : '👦 ') + t(c.gender === 'g' ? 'girl' : 'boy'));
    c.want.forEach(function (ki) { p.push('✔ ' + KW[ki][HU ? 2 : 3]); });
    (c.extra || []).forEach(function (x) { p.push('✔ ' + tagLabel(x)); });
    c.not.forEach(function (ki) { p.push('✖ ' + t('not', KW[ki][HU ? 2 : 3])); });
    (c.notIds || []).forEach(function (x) { p.push('✖ ' + t('not', tagLabel(x))); });
    if (c.sizeMax != null) p.push('💾 ' + t('size', String(c.sizeMax).replace('.', HU ? ',' : '.')));
    if (c.modeLabel) p.push('🎮 ' + t(c.modeLabel));
    if (c.plat) p.push('🖥 ' + ({ m: 'macOS', l: 'Linux', d: 'Steam Deck', v: 'VR' })[c.plat]);
    if (c.newer) p.push('🆕 ' + t('newer'));
    if (c.popular) p.push('⭐ ' + t('popular'));
    return p;
  }
  function cards(list) {
    var d = document.createElement('div'); d.className = 'cbCards';
    list.forEach(function (r) {
      var g = r.g, a = document.createElement('a');
      a.className = 'cbCard'; a.href = 'jatek/' + g.i + '.html';
      var why = r.why.slice(0, 4).map(function (x) { return '<span>' + esc(tagLabel(x)) + '</span>'; }).join('');
      a.innerHTML = '<img loading="lazy" alt="" src="' + esc(img(g)) + '"><div class="cbCB"><div class="cbCN">' + esc(g.n) + '</div>' +
        '<div class="cbCM">💾 ' + fmtSize(g.s) + (g.a != null ? ' · ' + g.a + '+' + (g.ae ? '?' : '') : '') + (g.c ? ' · 👍 ' + g.r + '%' : '') + '</div>' +
        (r.ai ? '<div class="cbWhy">💡 ' + esc(r.ai) + '</div>' : '') +
        (why ? '<div class="cbCT">' + why + '</div>' : '') + '</div>';
      a.querySelector('img').onerror = function () { this.onerror = null; this.src = 'https://cdn.akamai.steamstatic.com/steam/apps/' + g.i + '/capsule_616x353.jpg'; };
      a.onclick = function (e) { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; e.preventDefault(); location.hash = '#/app/' + g.i; window.track && window.track('chatbot-ajanlas-' + g.i, g.n); };
      d.append(a);
    });
    msgs.append(d); scroll();
  }
  function followUps() {
    chips([
      [t('cMore'), function () { user(t('cMore')); showMore(); }],
      [t('cSmall'), function () { refine({ sizeMax: Math.min(state.sizeMax || 99, state.sizeMax ? state.sizeMax / 2 : 2) }, t('cSmall')); }],
      [t('cFriends'), function () { refine({ modes: [9, 38, 1, 24], modeLabel: 'friends' }, t('cFriends')); }],
      [t('cCalm'), function () { refineKw(2, t('cCalm')); }],
      [t('cFunny'), function () { refineKw(0, t('cFunny')); }],
      [t('cNew'), function () { user(t('cNew')); state = null; results = []; add('bot', esc(t('newChat'))); chips(TX.examples[HU ? 0 : 1].map(function (e) { return [e, function () { ask(e); }]; })); }],
    ]);
  }
  function showMore() {
    var next = results.slice(shown, shown + 6);
    if (!next.length) { add('bot', esc(t('noMore'))); return; }
    add('bot', esc(t('more'))); cards(next); shown += next.length; followUps();
  }
  function run(c) {
    state = c; results = recommend(c); shown = 0;
    var p = summary(c);
    if (p.length) add('bot', '<div class="cbSum"><b>' + esc(t('understood')) + '</b> ' + p.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>');
    if (!results.length) { add('bot', esc(t('none'))); chips([[t('cNew'), function () { state = null; add('bot', esc(t('newChat'))); }]]); return; }
    add('bot', esc(t('found'))); cards(results.slice(0, 6)); shown = Math.min(6, results.length); followUps();
  }
  function refine(patch, label) {
    if (!state) return;
    user(label);
    var c = JSON.parse(JSON.stringify(state)); for (var k in patch) c[k] = patch[k];
    run(c);
  }
  function refineKw(ki, label) {
    if (!state) return;
    user(label);
    var c = JSON.parse(JSON.stringify(state));
    if (c.want.indexOf(ki) < 0) c.want.push(ki);
    var n = c.not.indexOf(ki); if (n >= 0) c.not.splice(n, 1);
    run(c);
  }
  function user(text) { anchor = null; waitAnchor = false; add('user', esc(text)); waitAnchor = true; }

  function ask(text) {
    text = String(text || '').trim(); if (!text) return;
    user(text);
    window.track && window.track('chatbot-kerdes', 'Játékajánló kérdés');
    if (AI_URL && Date.now() > aiDownUntil) aiAsk(text); else ruleAsk(text);
  }

  // ------------------------------------------------------------ AI mód
  var aiHist = [], aiDownUntil = 0;
  var MODES = { friends: [9, 38, 1, 24], online: [1, 36, 38], local: [24], solo: [2] };
  function post(path, data) {
    return Promise.race([
      fetch(AI_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 20000); }),
    ]);
  }
  function fromIntent(it) {
    return {
      want: [], not: [], extra: ids(it.tags || []), notIds: ids(it.exclude || []),
      age: it.age, kid: it.age != null && it.age < 13, gender: it.gender === 'g' ? 'g' : it.gender === 'b' ? 'b' : null,
      sizeMax: it.max_gb, modes: MODES[it.mode] || null, modeLabel: MODES[it.mode] ? it.mode : null,
      plat: ({ mac: 'm', linux: 'l', deck: 'd', vr: 'v' })[it.platform] || null,
      newer: !!it.newer, popular: !!it.popular, any: true,
    };
  }
  var tagEn = function (id) { var m = META.tags[id]; return m ? m[1] : ''; };
  function aiAsk(text) {
    var nn = deacc(text).replace(/[^a-z0-9 ]/g, ' ').trim();
    if (state && /^(meg|mast|tobbet|tovabb|more|other|next|others|mutass meg|meg tobbet|meg mast|mutass tobbet)( .*)?$/.test(nn) && nn.split(' ').length <= 3) { showMore(); return; }
    aiHist.push({ r: 'u', t: text }); if (aiHist.length > 8) aiHist = aiHist.slice(-8);
    var typing = add('bot typing', '<span></span><span></span><span></span>');
    var lang = I.lang || 'hu', crit = null;
    post('/intent', { lang: lang, hist: aiHist }).then(function (it) {
      if (!it.search) { typing.remove(); add('bot', esc(it.reply || t('dunno'))); aiHist.push({ r: 'b', t: it.reply || '' }); return; }
      crit = fromIntent(it);
      // „mutass még” csak akkor, ha a kívánságok nem változtak (az AI néha tévesen jelzi)
      var same = state && JSON.stringify((state.extra || []).slice().sort()) === JSON.stringify(crit.extra.slice().sort()) &&
        JSON.stringify((state.notIds || []).slice().sort()) === JSON.stringify(crit.notIds.slice().sort()) &&
        state.age === crit.age && state.sizeMax === crit.sizeMax && state.modeLabel === crit.modeLabel && state.plat === crit.plat;
      if (it.more && same) { typing.remove(); showMore(); return; }
      var res = recommend(crit);
      if (!res.length) { typing.remove(); if (it.reply) add('bot', esc(it.reply)); run(crit); return; }
      var cand = res.slice(0, 20);
      var q = aiHist.filter(function (m) { return m.r === 'u'; }).slice(-3).map(function (m) { return m.t; }).join(' / ');
      return post('/pick', {
        lang: lang, q: q,
        games: cand.map(function (r) { var g = r.g; return { i: g.i, n: g.n, t: (g.t || []).slice(0, 8).map(tagEn).filter(Boolean), s: fmtSize(g.s), a: g.a, r: g.c ? g.r : null, c: g.c || 0 }; }),
      }).then(function (pk) {
        typing.remove();
        var byId = {}; cand.forEach(function (r) { byId[r.g.i] = r; });
        var cjk = /^(zh|ja|ko)/.test(lang) ? null : /[　-鿿가-힯]+/g;
        var clean = function (s) { return cjk ? String(s || '').replace(cjk, '') : s; };
        var picked = (pk.picks || []).map(function (p) { var r = byId[p.i]; return r ? { g: r.g, why: r.why, ai: clean(p.why) } : null; }).filter(Boolean);
        if (!picked.length) picked = cand.slice(0, 4);
        var pid = picked.map(function (p) { return p.g.i; });
        state = crit; results = picked.concat(res.filter(function (r) { return pid.indexOf(r.g.i) < 0; })); shown = picked.length;
        if (it.reply) add('bot', esc(it.reply));
        var p = summary(crit);
        if (p.length) add('bot', '<div class="cbSum"><b>' + esc(t('understood')) + '</b> ' + p.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>');
        add('bot', esc(clean(pk.intro) || t('found'))); cards(picked); followUps();
        aiHist.push({ r: 'b', t: (it.reply || '') + ' [Recommended: ' + picked.map(function (x) { return x.g.n; }).join(', ') + ']' });
      });
    }).catch(function () {
      typing.remove();
      aiDownUntil = Date.now() + 60000;
      if (crit) run(crit); else ruleAsk(text);
    });
  }

  function ruleAsk(text) {
    var n = deacc(text).replace(/[^a-z0-9 ]/g, ' ').trim();
    var typing = add('bot typing', '<span></span><span></span><span></span>');
    setTimeout(function () {
      typing.remove();
      if (/^(koszi|koszonom|kosz|thanks|thank you|thx|ty)\b/.test(n)) { add('bot', esc(t('thanks'))); return; }
      if (state && /^(meg|mast|tobbet|tovabb|more|other|next|others|mutass meg|meg tobbet|meg mast)( .*)?$/.test(n) && n.split(' ').length <= 3) { showMore(); return; }
      if (/^(uj kereses|elolrol|reset|start over|uj)$/.test(n)) { state = null; add('bot', esc(t('newChat'))); return; }
      var c = parse(text);
      if (!c.any) {
        if (/^(szia|hello|hi|hali|helo|udv|jo napot|hey|szevasz)\b/.test(n)) { add('bot', esc(t('hello', GAMES.length.toLocaleString(I.locale || 'hu')))); chips(TX.examples[HU ? 0 : 1].map(function (e) { return [e, function () { ask(e); }]; })); return; }
        add('bot', esc(t('dunno'))); return;
      }
      var first = c.toks[0];
      if (state && (REFINE[first] || c.toks.length <= 3) && c.age == null) c = merge(state, c);
      run(c);
    }, 350);
  }
  panel.querySelector('.cbForm').addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; input.value = ''; ask(v); });

  window.AFGChat = { open: open, ask: ask, parse: parse, recommend: recommend };
})();
