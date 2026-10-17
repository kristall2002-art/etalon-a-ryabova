/* Эталон нотариуса: общая «обвязка» поверх движка страницы.
   1) Spotlight Card: один обработчик pointermove ставит --x/--y на карточку под курсором;
   2) касание на телефоне: вспышка пятна и подпрыгивание;
   3) видео первого экрана ставится на паузу, когда экран ушёл;
   4) фоны экранов догружаются после загрузки страницы (первый экран не делит канал с картинками);
   5) размер текста, контраст и тема в мобильном меню — кнопки-«прокси» к настоящим кнопкам шапки.
   Без библиотек, без внешних запросов. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var body = document.body;

  /* ---------- Spotlight Card ---------- */
  var SEL = '.svc,.step,.rev,.rsum,.cred,.cbox,.fq,.about-txt,.sec-head,.ilink,.rate-chip,.hero-plq,.btn-glass';
  $$(SEL).forEach(function (el) { el.classList.add('glow'); });
  // крупные плашки подпрыгивают на нижней границе диапазона (1,03)
  $$('.hero-plq,.about-txt,.sec-head,.cbox').forEach(function (el) { el.style.setProperty('--tap', '1.03'); });

  function chainOf(t) {
    var out = [], el = t && t.closest ? t.closest('.glow') : null;
    while (el) { out.push(el); el = el.parentElement ? el.parentElement.closest('.glow') : null; }
    return out;
  }
  function place(el, cx, cy) {
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    el.style.setProperty('--x', ((cx - r.left) / r.width * 100).toFixed(1) + '%');
    el.style.setProperty('--y', ((cy - r.top) / r.height * 100).toFixed(1) + '%');
  }
  var hot = [], raf = 0, ev = null, lx = -1, ly = -1;
  function clearHot() { hot.forEach(function (el) { el.classList.remove('lit'); }); hot = []; }
  function apply() {
    raf = 0;
    if (!ev) return;
    var chain = chainOf(ev.target);
    hot.forEach(function (el) { if (chain.indexOf(el) < 0) el.classList.remove('lit'); });
    chain.forEach(function (el) { el.classList.add('lit'); place(el, ev.clientX, ev.clientY); });
    hot = chain;
  }
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    ev = e; lx = e.clientX; ly = e.clientY;
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
  document.addEventListener('pointerout', function (e) { if (!e.relatedTarget) { ev = null; clearHot(); } });
  window.addEventListener('blur', function () { ev = null; clearHot(); });
  // экран сменился под неподвижным курсором — пересчитать, что под ним теперь
  var recheck;
  function afterFlip() {
    clearHot(); clearTimeout(recheck);
    recheck = setTimeout(function () {
      if (lx < 0) return;
      var t = document.elementFromPoint(lx, ly);
      if (t) { ev = { target: t, clientX: lx, clientY: ly }; apply(); }
    }, 720);
  }
  window.addEventListener('wheel', afterFlip, { passive: true });
  window.addEventListener('keydown', afterFlip);

  // касание: вспышка пятна в точке касания + подпрыгивание (только самая вложенная карточка)
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse') return;
    var el = chainOf(e.target)[0];
    if (!el) return;
    place(el, e.clientX, e.clientY);
    el.classList.remove('tap'); void el.offsetWidth; el.classList.add('tap');
    clearTimeout(el._tapT);
    el._tapT = setTimeout(function () { el.classList.remove('tap'); }, 700);
  }, { passive: true });

  /* ---------- видео первого экрана: играет только на первом экране ---------- */
  var v = $('#heroVideo');
  function syncVideo() {
    if (!v || !v.hasAttribute('autoplay')) return;
    if (body.getAttribute('data-sec') === '0') { if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () { }); } }
    else if (!v.paused) v.pause();
  }
  if (v) new MutationObserver(syncVideo).observe(body, { attributes: true, attributeFilter: ['data-sec'] });

  /* ---------- фоны экранов: грузятся после первого экрана и плавно проявляются ----------
     Видео и постер получают весь канал; интерьеры подтягиваются, когда страница загружена. */
  function loadBgs() {
    $$('.sec-bg picture').forEach(function (pic) {
      var s = $('source', pic), i = $('img', pic);
      if (!i || !i.getAttribute('data-src')) return;
      i.addEventListener('load', function () { i.classList.add('ld'); }, { once: true });
      if (s && s.getAttribute('data-srcset')) s.setAttribute('srcset', s.getAttribute('data-srcset'));
      i.src = i.getAttribute('data-src');
      i.removeAttribute('data-src');
    });
  }
  if (document.readyState === 'complete') setTimeout(loadBgs, 400);
  else window.addEventListener('load', function () { setTimeout(loadBgs, 500); });

  /* ---------- мобильное меню: размер текста, контраст и тема — кнопки-«прокси» к настоящим кнопкам шапки ---------- */
  function syncProxy(b) {
    var t = $(b.getAttribute('data-proxy'));
    if (!t) return;
    if (t.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', t.getAttribute('aria-pressed'));
    b.disabled = !!t.disabled;
  }
  function syncProxies() { $$('[data-proxy]').forEach(syncProxy); }
  $$('[data-proxy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = $(b.getAttribute('data-proxy'));
      if (!t) return;
      t.click();
      syncProxies();
    });
  });
  syncProxies();
})();
