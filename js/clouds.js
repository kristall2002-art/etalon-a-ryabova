/* Облака над видео первого экрана.
   WebGL-шейдер: fbm-шум, три слоя с параллаксом (перистые, средние, ближние), псевдо-объём
   через сдвиг плотности к солнцу, мягкая «дырка» вокруг купола собора.
   Лёгкий: рисуется в уменьшенном разрешении, 30 к/с (на слабых телефонах 20), останавливается,
   когда первый экран не виден или вкладка скрыта. Без WebGL облаков нет.
   На телефоне облака плотнее и плывут втрое быстрее (экран узкий, при той же скорости в пикселях
   их не заметить). При prefers-reduced-motion («убрать анимации» на Android) облака не замирают,
   а плывут вдвое медленнее и с пониженной частотой кадров: это мягкое движение фона. Внешних запросов нет. */
(function () {
  'use strict';
  var cv = document.getElementById('heroClouds');
  if (!cv) return;
  var home = document.getElementById('home');
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  var mobile = window.matchMedia && matchMedia('(max-width:768px)').matches;
  var weak = (navigator.hardwareConcurrency || 4) <= 4 && mobile || (navigator.deviceMemory || 4) <= 2;

  var gl = null;
  try {
    var opt = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false };
    gl = cv.getContext('webgl', opt) || cv.getContext('experimental-webgl', opt);
  } catch (e) { gl = null; }
  if (!gl) { cv.style.display = 'none'; return; }

  var OCT = mobile ? 4 : 5;
  var VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    '#define OCT ' + OCT,
    'uniform vec2 uRes;uniform float uT;uniform float uAsp;uniform float uFrac;uniform vec4 uHole;uniform float uZoom;uniform float uCov;uniform float uGain;',
    'vec2 hash2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.+2.*fract(sin(p)*43758.5453123);}',
    /* градиентный шум: чётче и «облачнее», чем значение в узлах сетки */
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);',
    '  return mix(mix(dot(hash2(i),f),dot(hash2(i+vec2(1.,0.)),f-vec2(1.,0.)),u.x),',
    '             mix(dot(hash2(i+vec2(0.,1.)),f-vec2(0.,1.)),dot(hash2(i+vec2(1.,1.)),f-vec2(1.,1.)),u.x),u.y);}',
    'float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<OCT;i++){v+=a*noise(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return v;}',
    /* слой: x — плотность, y — освещённость (плотность в сторону солнца даёт тень) */
    'vec2 layer(vec2 uv,vec2 sc,vec2 vel,float seed,float cover,float soft,vec2 sun,float warp){',
    '  vec2 p=uv*sc+seed;',
    '  vec2 w=vec2(fbm(p*.6+vel*uT*.6),fbm(p*.6+vec2(5.2,1.3)-vel*uT*.4));',   /* искажение области: клубящиеся края */
    '  p+=vel*uT+warp*w;',
    '  float d=fbm(p)*1.5+.5;float d2=fbm(p+sun)*1.5+.5;',
    '  float dens=smoothstep(cover+uCov,cover+uCov+soft,d);',
    '  float lit=clamp(.56+(d-d2)*7.5,0.,1.);',
    '  return vec2(dens,lit);',
    '}',
    'void main(){',
    '  vec2 f=gl_FragCoord.xy/uRes;',
    '  vec2 q=vec2(f.x,(1.-f.y)*uFrac);',            /* доли ширины и высоты экрана, y вниз */
    '  vec2 uv=vec2(q.x*uAsp,q.y);',
    '  vec2 cuv=uv*uZoom;',
    '  vec2 sun=vec2(-.05,.075);',                   /* солнце сверху-слева */
    '  vec3 shade=vec3(.79,.85,.94),lite=vec3(1.,.992,.965);',
    '  vec4 acc=vec4(0.);',
    /* перистые: вытянутые, высокие, прозрачные */
    '  vec2 a=layer(cuv,vec2(1.1,3.4),vec2(.0055,.0006),3.7,.52,.30,sun*vec2(1.6,.5),.5);',
    '  float ea=1.-smoothstep(.10,.50,uv.y);',
    '  float aa=min(a.x*ea*.40*uGain,.95);',
    '  acc=vec4(mix(shade,lite,a.y)*aa,aa)+acc*(1.-aa);',
    /* средние кучевые */
    '  vec2 b=layer(cuv,vec2(2.4,2.8),vec2(.0125,.0010),11.3,.52,.22,sun,.9);',
    '  float eb=1.-smoothstep(.04,.40,uv.y);',
    '  float ab=min(b.x*eb*.82*uGain,.97);',
    '  acc=vec4(mix(shade,lite,b.y)*ab,ab)+acc*(1.-ab);',
    /* ближние, крупные и быстрые */
    '  vec2 c=layer(cuv,vec2(1.25,1.5),vec2(.0225,.0016),23.9,.54,.22,sun*1.4,1.1);',
    '  float ec=1.-smoothstep(.0,.31,uv.y);',
    '  float ac=min(c.x*ec*.92*uGain,.98);',
    '  acc=vec4(mix(shade,lite,c.y)*ac,ac)+acc*(1.-ac);',
    /* вокруг купола облака редеют, чтобы не закрывать собор */
    '  vec2 hd=vec2((uv.x-uHole.x*uAsp)/uHole.z,(uv.y-uHole.y)/uHole.w);',
    '  float m=.10+.90*smoothstep(.55,1.25,length(hd));',
    '  gl_FragColor=acc*m;',
    '}'
  ].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  }
  var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) { cv.style.display = 'none'; return; }
  var pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { cv.style.display = 'none'; return; }
  gl.useProgram(pr);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  var U = {
    res: gl.getUniformLocation(pr, 'uRes'), t: gl.getUniformLocation(pr, 'uT'), asp: gl.getUniformLocation(pr, 'uAsp'),
    frac: gl.getUniformLocation(pr, 'uFrac'), zoom: gl.getUniformLocation(pr, 'uZoom'), hole: gl.getUniformLocation(pr, 'uHole'),
    cov: gl.getUniformLocation(pr, 'uCov'), gain: gl.getUniformLocation(pr, 'uGain')
  };

  var scale = mobile ? (weak ? .30 : .40) : .6;     /* доля CSS-пикселей: облака мягкие, этого хватает */
  /* частоты кадров кратны 60 Гц (30 / 20 / 15), иначе вместо 24 к/с получается 20 */
  var fps = reduced ? 15 : (mobile ? (weak ? 20 : 30) : 30);
  var frameMs = 1000 / fps - 4;
  /* скорость течения: на телефоне втрое больше (на узком экране при той же скорости в пикселях облака стоят),
     при «убрать анимации» вдвое меньше, но не нулевая */
  var speed = (mobile ? 3 : 1) * (reduced ? .5 : 1);
  var T0 = performance.now(), last = 0, raf = 0, ready = false;

  function size() {
    var w = Math.max(2, home ? home.clientWidth : innerWidth), h = Math.max(2, home ? home.clientHeight : innerHeight);
    var frac = cv.clientHeight / h || .58;
    var cw = Math.max(2, Math.round(cv.clientWidth * scale)), ch = Math.max(2, Math.round(cv.clientHeight * scale));
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    gl.viewport(0, 0, cw, ch);
    gl.uniform2f(U.res, cw, ch);
    gl.uniform1f(U.asp, w / h);
    gl.uniform1f(U.frac, frac);
    /* положение купола в кадре: на телефоне видео подрезано по бокам и сдвинуто к собору */
    gl.uniform1f(U.zoom, w <= 768 ? 2.1 : 1);   /* на узком экране узор крупнее экрана — берём мельче, чтобы облаков было видно */
    gl.uniform1f(U.cov, w <= 768 ? -.05 : 0);   /* на телефоне облаков больше: порог плотности ниже */
    gl.uniform1f(U.gain, w <= 768 ? 1.18 : 1);  /* и они плотнее */
    if (w <= 768) gl.uniform4f(U.hole, .51, .25, .21, .24);
    else gl.uniform4f(U.hole, .543, .26, .17, .24);
  }

  function draw(now) {
    gl.uniform1f(U.t, (now - T0) / 1000 * speed + (reduced ? 40 : 0));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!ready) { ready = true; cv.classList.add('on'); }
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < frameMs) return;
    last = now;
    draw(now);
  }
  function run() { if (!raf) raf = requestAnimationFrame(loop); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function shouldRun() { return !document.hidden && document.body.getAttribute('data-sec') === '0'; }
  function sync() { if (shouldRun()) run(); else stop(); }

  size();
  draw(performance.now());
  sync();
  document.addEventListener('visibilitychange', sync);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-sec'] });
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { size(); draw(performance.now()); }, 160);
  });
  cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); cv.style.display = 'none'; });
})();
