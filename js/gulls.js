/* Чайки над видео первого экрана.
   Две-четыре небольшие белые чайки проплывают по небу плавными дугами на разной высоте и с разной скоростью:
   несколько взмахов, потом планирование; иногда небо пустеет. Рисуются на canvas 2D (никаких библиотек и запросов),
   лежат под плашкой с текстом и сами обходят её: высота полёта пересчитывается так, чтобы чайка всегда
   оставалась выше плашки, а на телефоне держится в верхней части неба. Идут только пока виден первый экран и
   вкладка активна. На слабых телефонах чаек меньше; при prefers-reduced-motion летит одна, медленно. */
(function () {
  'use strict';
  var home = document.getElementById('home');
  var bg = home && home.querySelector('.hero-bg');
  if (!bg) return;
  var plq = home.querySelector('.hero-plq');
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  var mqMob = window.matchMedia && matchMedia('(max-width:768px)');
  var weak = ((navigator.hardwareConcurrency || 4) <= 4 && mqMob && mqMob.matches) || (navigator.deviceMemory || 4) <= 2;

  var cv = document.createElement('canvas');
  cv.className = 'hero-gulls';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:0;pointer-events:none';
  var ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  bg.appendChild(cv);

  var W = 0, H = 0, BAND = 0, mobile = false, plqL = 0, plqR = 0, plqT = 0, dpr = 1;
  var gulls = [], clock = 0, nextSpawn = 3.2, lastTs = 0, raf = 0, lastDraw = 0, maxGulls = 3, sMin = 24, sMax = 40;
  var fps = reduced ? 20 : (weak ? 24 : 30), frameMs = 1000 / fps - 4;
  var TAU = Math.PI * 2;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  function measure() {
    W = Math.max(2, home.clientWidth); H = Math.max(2, home.clientHeight);
    mobile = W <= 768;
    BAND = Math.round(H * (mobile ? .40 : .46));
    dpr = Math.min(window.devicePixelRatio || 1, weak ? 1.5 : 2);
    var cw = Math.round(W * dpr), ch = Math.round(BAND * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    cv.style.height = BAND + 'px';
    if (mobile) { sMin = 16; sMax = 26; maxGulls = weak ? 2 : 3; }
    else { sMin = 24; sMax = 40; maxGulls = 4; }
    if (reduced) maxGulls = 1;
    /* плашка с текстом: чайки идут над её верхней кромкой */
    var hr = home.getBoundingClientRect();
    if (plq) {
      var r = plq.getBoundingClientRect();
      plqL = r.left - hr.left; plqR = r.right - hr.left; plqT = r.top - hr.top;
    } else { plqL = plqR = W; plqT = H; }
  }

  /* нижняя граница полёта в точке x: либо низ полосы неба, либо верх плашки с запасом */
  function floorAt(x, S) {
    var lim = BAND - S, over = plqT - 30 - S;
    var k = smooth(plqL - 70, plqL + 30, x) * (1 - smooth(plqR - 30, plqR + 70, x));  /* 1 над плашкой, 0 правее и левее */
    return Math.max(S * 2.2, lim + (Math.min(lim, over) - lim) * k);
  }
  function yAt(g, x) {
    var top = Math.max(H * .05, g.S * .8), fl = floorAt(x, g.S);
    var u = clamp(g.ub + g.ua * Math.sin(TAU * (x - g.x0) / g.lam + g.ph0), .03, .97);
    return top + (Math.max(fl, top + 4) - top) * u;
  }

  function spawn(dir, lag) {
    var S = rnd(sMin, sMax);
    var big = (S - sMin) / (sMax - sMin);                         /* крупнее = ближе = быстрее и ярче */
    var v = S * (mobile ? 1.9 : 3.1) * rnd(.85, 1.2) * (reduced ? .5 : 1);
    var x = dir > 0 ? -S - lag : W + S + lag;
    gulls.push({
      S: S, dir: dir, v: v, x: x, x0: x,
      ub: rnd(.12, .85), ua: rnd(.07, .17), lam: rnd(.9, 1.7) * (mobile ? W * 1.1 : W * .55), ph0: rnd(0, TAU),
      alpha: .72 + .28 * big, phase: rnd(0, TAU), amp: 0, mode: 0, left: rnd(.4, 1.2),
      freq: rnd(2.3, 3.4) * (reduced ? .55 : 1), t: 0, fade: 0
    });
  }

  function schedule() {
    /* группа из 1-3 чаек, потом пауза; иногда подолгу пусто */
    var r = Math.random();
    nextSpawn = clock + (r < .3 ? rnd(9, 15) : rnd(3, 7)) * (reduced ? 1.6 : 1);
  }

  function step(dt) {
    clock += dt;
    if (clock >= nextSpawn) {
      var n = reduced ? 1 : (Math.random() < .55 ? 1 : (Math.random() < .7 ? 2 : 3));
      n = Math.min(n, maxGulls - gulls.length);
      var d0 = Math.random() < .5 ? 1 : -1;
      for (var i = 0; i < n; i++) spawn(d0, i * rnd(70, 170));
      schedule();
    }
    for (var k = gulls.length - 1; k >= 0; k--) {
      var g = gulls[k];
      g.t += dt; g.fade = Math.min(1, g.fade + dt * 1.2);
      g.x += g.dir * g.v * dt;
      /* взмахи и планирование */
      g.left -= dt;
      if (g.left <= 0) {
        if (g.mode === 0) { g.mode = 1; g.left = rnd(1.1, 2.4) * (reduced ? 1.3 : 1); }
        else { g.mode = 0; g.left = rnd(1.4, 3.6); }
      }
      g.amp += ((g.mode === 1 ? 1 : 0) - g.amp) * Math.min(1, dt * (g.mode === 1 ? 5 : 1.6));
      g.phase += TAU * g.freq * dt * (.35 + .65 * g.amp);
      if ((g.dir > 0 && g.x > W + g.S * 2) || (g.dir < 0 && g.x < -g.S * 2)) gulls.splice(k, 1);
    }
  }

  /* одно крыло в единицах размаха (S = 1); f: 1 — крыло вверх, -1 — вниз */
  function wing(f) {
    var ex = .25, ey = -(.065 + .15 * f);
    var tx = .5 * (1 - .13 * Math.abs(f)), ty = .04 - .30 * f - .02;
    ctx.beginPath();
    ctx.moveTo(0, -.012);
    ctx.quadraticCurveTo(ex * .85, ey - .055, tx, ty);
    ctx.quadraticCurveTo(ex + .03, ey + .075 + .02 * (1 - f), .02, .05);
    ctx.closePath();
  }

  var shade = null;
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!gulls.length) return;
    if (!shade) {
      shade = ctx.createLinearGradient(0, -.2, 0, .12);
      shade.addColorStop(0, 'rgba(255,255,255,1)');
      shade.addColorStop(.55, 'rgba(248,251,255,1)');
      shade.addColorStop(1, 'rgba(186,198,216,1)');           /* мягкая серая тень на крыле снизу */
    }
    for (var i = 0; i < gulls.length; i++) {
      var g = gulls[i], S = g.S;
      var f = g.amp * Math.sin(g.phase) + (1 - g.amp) * (.16 + .08 * Math.sin(g.t * 1.1 + g.ph0));
      var y = yAt(g, g.x) - g.amp * Math.sin(g.phase) * S * .05;
      var slope = (yAt(g, g.x + 6 * g.dir) - yAt(g, g.x - 6 * g.dir)) / 12;   /* наклон по траектории */
      var tilt = clamp(Math.atan(slope) * .5, -.3, .3);
      ctx.setTransform(dpr * S, 0, 0, dpr * S, g.x * dpr, y * dpr);
      ctx.rotate(tilt);
      ctx.globalAlpha = g.alpha * g.fade;
      /* тень-ореол: чайка не теряется на светлых облаках */
      ctx.save(); ctx.translate(.012, .045); ctx.fillStyle = 'rgba(45,65,100,.2)';
      wing(f); ctx.fill(); ctx.scale(-1, 1); wing(f); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, .01, .1, .045, 0, 0, TAU); ctx.fill(); ctx.restore();
      /* крылья */
      ctx.fillStyle = shade;
      wing(f); ctx.fill();
      ctx.save(); ctx.scale(-1, 1); wing(f); ctx.fill(); ctx.restore();
      /* корпус, хвост и голова по ходу полёта */
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(-g.dir * .015, .012, .1, .04, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(g.dir * .085, .002, .035, .028, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,196,92,.9)';
      ctx.beginPath(); ctx.moveTo(g.dir * .11, -.002); ctx.lineTo(g.dir * .15, .008); ctx.lineTo(g.dir * .11, .014); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (ts - lastDraw < frameMs) return;
    var dt = lastTs ? Math.min((ts - lastTs) / 1000, .1) : 0;
    lastTs = ts; lastDraw = ts;
    step(dt);
    draw();
  }
  function shouldRun() { return !document.hidden && document.body.getAttribute('data-sec') === '0'; }
  function sync() {
    if (shouldRun()) { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  measure();
  sync();
  document.addEventListener('visibilitychange', sync);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-sec'] });
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { measure(); draw(); }, 160); });
  /* плашка встаёт на место уже после анимации входа: пересчитать, когда она осела */
  setTimeout(measure, 2600);
})();
