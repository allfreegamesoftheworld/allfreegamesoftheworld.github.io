// Névtelen, összesített látogatottság-mérés GoatCounterrel.
// Nem használ sütit, nem tárol semmit a böngészőben, és nem küld személyes adatot
// (keresőszavakat sem): csak azt, hogy melyik oldal / játék / gomb lett megnyitva.
(function () {
  var code = window.GOATCOUNTER_CODE;
  var queue = [];
  function send(ev) {
    if (window.goatcounter && typeof window.goatcounter.count === 'function') window.goatcounter.count(ev);
    else queue.push(ev);
  }
  // Esemény: name pl. "megnyitas-570", title pl. "Dota 2"
  window.track = function (name, title) {
    if (!code) return;
    send({ path: name, title: title || name, event: true });
  };
  if (!code) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', 'https://' + code + '.goatcounter.com/count');
  s.onload = function () { var q = queue; queue = []; q.forEach(send); };
  document.head.appendChild(s);
})();
