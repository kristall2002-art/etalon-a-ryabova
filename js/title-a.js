/* Вариант A. Слово «Нотариус» собирается из звёздной пыли.
   Берём пиксели настоящего текста (тот же шрифт и размер, что у h1), раскладываем по ним частицы;
   частицы стартуют рассыпанными по экрану и слетаются в буквы, потом проявляется обычный DOM-текст,
   а холст гаснет и удаляется. Слово всё время лежит в разметке, поэтому поисковики и скринридеры его видят. */
(function () {
  'use strict';
  var home = document.getElementById('home'), word = document.getElementById('heroWord');
  if (!home || !word) return;
  var hash = (location.hash || '').replace('#', '');
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  function go() { home.classList.add('go'); }
  function show() { go(); word.classList.add('in'); }
  if (reduced || (hash && hash !== 'home')) { show(); return; }

  var mobile = matchMedia('(max-width:768px)').matches;
  var TARGET = mobile ? 880 : 1900;                  // сколько частиц пытаемся набрать
  var text = (word.textContent || '').trim();
  if (!text) { show(); return; }

  var fontReady = (document.fonts && document.fonts.load) ? document.fonts.load('500 80px "Playfair Display"', text) : Promise.resolve();
  Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1800); })])
    .then(function () { requestAnimationFrame(begin); }, function () { requestAnimationFrame(begin); });

  function sprite(core, mid, rim) {
    var c = document.createElement('canvas'); c.width = c.height = 48;
    var x = c.getContext('2d'), g = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, core); g.addColorStop(.2, core); g.addColorStop(.44, mid); g.addColorStop(1, rim);
    x.fillStyle = g; x.fillRect(0, 0, 48, 48);
    return c;
  }

  function begin() {
    var cs = getComputedStyle(word), fs = parseFloat(cs.fontSize);
    var wr = word.getBoundingClientRect(), hr = home.getBoundingClientRect();
    if (!wr.width || !wr.height || !hr.width) { show(); return; }

    /* 1. растр слова: тот же шрифт, кегль и положение базовой линии, что у DOM-текста */
    var rw = Math.ceil(wr.width), rh = Math.ceil(wr.height);
    var off = document.createElement('canvas'); off.width = rw; off.height = rh;
    var oc = off.getContext('2d', { willReadFrequently: true });
    var fam = cs.fontFamily, wt = cs.fontWeight, ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0;
    var hasLS = 'letterSpacing' in oc;
    oc.font = wt + ' ' + fs + 'px ' + fam; if (hasLS) oc.letterSpacing = ls + 'px';
    var m0 = oc.measureText(text).width;
    var k = m0 ? wr.width / m0 : 1;                  // 1, если у страницы нет zoom
    oc.font = wt + ' ' + (fs * k) + 'px ' + fam; if (hasLS) oc.letterSpacing = (ls * k) + 'px';
    var mm = oc.measureText(text);
    var asc = mm.fontBoundingBoxAscent, desc = mm.fontBoundingBoxDescent;
    if (asc == null) { asc = fs * k * 1.06; desc = fs * k * .29; }
    var base = (wr.height - (asc + desc)) / 2 + asc;
    oc.fillStyle = '#fff'; oc.textBaseline = 'alphabetic'; oc.fillText(text, 0, base);
    var data = oc.getImageData(0, 0, rw, rh).data, filled = 0, i;
    for (i = 3; i < data.length; i += 4) if (data[i] > 128) filled++;
    if (!filled) { show(); return; }

    /* 2. точки: по сетке с шагом, при котором набирается ~TARGET частиц */
    var g = Math.max(2.1, Math.sqrt(filled / TARGET)), pts = [], x, y;
    for (y = g / 2; y < rh; y += g) for (x = g / 2; x < rw; x += g) {
      if (data[((y | 0) * rw + (x | 0)) * 4 + 3] > 110) {
        pts.push([Math.min(1, Math.max(0, (x + (Math.random() - .5) * g * .7) / rw)), Math.min(1, Math.max(0, (y + (Math.random() - .5) * g * .7) / rh))]);
      }
    }

    /* 3. холст на весь первый экран */
    var cv = document.createElement('canvas'); cv.className = 'sd-canvas'; cv.setAttribute('aria-hidden', 'true');
    home.appendChild(cv);
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75), W = hr.width, H = hr.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);

    var SP = [sprite('rgba(255,255,255,1)', 'rgba(255,238,196,.55)', 'rgba(255,214,140,0)'),
              sprite('rgba(255,246,220,1)', 'rgba(255,218,150,.55)', 'rgba(255,190,100,0)'),
              sprite('rgba(255,228,168,1)', 'rgba(255,192,104,.5)', 'rgba(255,160,70,0)')];
    var ox0 = wr.left - hr.left, oy0 = wr.top - hr.top, sz = mobile ? .78 : 1;
    var P = pts.map(function (q) {
      var sx = (Math.random() * 1.3 - .15) * W, sy = (Math.random() * 1.2 - .1) * H;
      var dx = ox0 + q[0] * wr.width - sx, dy = oy0 + q[1] * wr.height - sy, len = Math.hypot(dx, dy) || 1;
      return { nx: q[0], ny: q[1], sx: sx, sy: sy, dx: dx / len, dy: dy / len, cv: (Math.random() - .5) * len * .42,
               d: Math.random() * .8, du: 1.3 + Math.random() * .7, r: (.9 + Math.random() * 1.1) * sz,
               c: (Math.random() * 3) | 0, tw: 2 + Math.random() * 4, ph: Math.random() * 6.28 };
    });

    var T0 = performance.now(), raf = 0, fin = false, dead = false;
    function cleanup() {
      if (dead) return; dead = true;
      cancelAnimationFrame(raf); window.removeEventListener('resize', finish);
      if (cv.parentNode) cv.parentNode.removeChild(cv);
    }
    function finish() {
      if (fin) return; fin = true;
      show(); cv.classList.add('out');
      setTimeout(cleanup, 1100);
    }
    window.addEventListener('resize', finish);
    go();

    function frame(now) {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      var t = (now - T0) / 1000;
      var w2 = word.getBoundingClientRect(), h2 = home.getBoundingClientRect();
      var ox = w2.left - h2.left, oy = w2.top - h2.top;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var a0 = Math.min(1, t / .6), n = P.length;
      for (var j = 0; j < n; j++) {
        var p = P[j];
        var u = (t - p.d) / p.du; u = u < 0 ? 0 : u > 1 ? 1 : u;
        var e = 1 - Math.pow(1 - u, 3);                         // easeOutCubic
        var tx = ox + p.nx * w2.width, ty = oy + p.ny * w2.height;
        var px = p.sx + (tx - p.sx) * e, py = p.sy + (ty - p.sy) * e;
        var s = Math.sin(Math.PI * e) * p.cv;                   // изгиб траектории: частицы закручиваются
        px += -p.dy * s; py += p.dx * s;
        var tw = Math.sin(t * p.tw + p.ph);
        if (u >= 1) { px += tw * .5; py += Math.cos(t * p.tw + p.ph) * .5; }
        var al = a0 * (.5 + .5 * e) * (u >= 1 ? .8 + .2 * tw : 1);
        var d = p.r * (1.7 - .6 * e) * 5.4;
        ctx.globalAlpha = al;
        ctx.drawImage(SP[p.c], px - d / 2, py - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      if (!fin && t > 2.5) finish();
    }
    raf = requestAnimationFrame(frame);
  }
})();
