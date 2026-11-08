// Genesis Lab - drawing: pre-rendered sprites.
// Soft glows, bug bodies, sprouts and lamp light are expensive to draw from
// scratch, so each one is painted once onto a small hidden canvas and then
// stamped many times per frame. Bug colours are cached in hue buckets, so
// related bugs share sprites.
var GL = GL || {};

GL.Sprites = (function () {
  var M = GL.M;
  var cache = {};
  var HUE_STEP = 3;          // hue bucket size in degrees

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }
  function hueKey(h) { return Math.round(h / HUE_STEP) * HUE_STEP; }
  function rgbOf(hex) { return M.hexToRgb(hex); }

  // A soft round glow: bright centre fading to nothing.
  function glow(hue, sat, light) {
    var key = 'g' + hueKey(hue) + '_' + sat + '_' + light;
    if (cache[key]) return cache[key];
    var size = 64, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var rgb = M.hslToRgb(hueKey(hue), sat, light);
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, M.rgba(rgb, 1));
    grad.addColorStop(0.18, M.rgba(rgb, 0.55));
    grad.addColorStop(0.45, M.rgba(rgb, 0.16));
    grad.addColorStop(1, M.rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache[key] = c);
  }

  // A little glowing bug seen from directly above, facing right (+x).
  // Body radius BODY_R inside a BODY_SIZE canvas; the creature's position is the canvas centre.
  // Parts (in body radii): abdomen with a shell seam and a glowing lantern (like a firefly's),
  // a thorax plate, and a small head. Legs, eyes and antennae are drawn live by the renderer.
  var BODY_SIZE = 192, BODY_R = 60;
  var ABDOMEN = { x: -0.28, rx: 0.78, ry: 0.66 };
  var THORAX = { x: 0.40, rx: 0.36, ry: 0.50 };
  var HEAD = { x: 0.84, rx: 0.27, ry: 0.32 };
  function bug(hue) {
    var key = 'bug' + hueKey(hue);
    if (cache[key]) return cache[key];
    var c = makeCanvas(BODY_SIZE), g = c.getContext('2d'), m = BODY_SIZE / 2, R = BODY_R, h = hueKey(hue);
    var rim = M.hslToRgb(h, 1, 0.64), fill = M.hslToRgb(h, 0.85, 0.40), core = M.hslToRgb(h, 1, 0.80);
    var dark = M.hslToRgb(h, 0.65, 0.20), plate = M.hslToRgb(h, 0.8, 0.30);
    function part(p, pad) { g.beginPath(); g.ellipse(m + p.x * R, m, p.rx * R + (pad || 0), p.ry * R + (pad || 0), 0, 0, M.TAU); }

    // A soft halo around the whole silhouette.
    g.save();
    g.shadowColor = M.rgba(rim, 0.75); g.shadowBlur = 16;
    g.fillStyle = M.rgba(dark, 0.9);
    part(ABDOMEN); g.fill(); part(THORAX); g.fill(); part(HEAD); g.fill();
    g.restore();

    // Abdomen: a translucent shell lit from inside by its lantern, brightest toward the rear.
    var ax = m + ABDOMEN.x * R;
    var gr = g.createRadialGradient(ax - 0.18 * R, m, 0, ax - 0.05 * R, m, 0.86 * R);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.22, M.rgba(core, 0.9));
    gr.addColorStop(0.55, M.rgba(fill, 0.75));
    gr.addColorStop(1, M.rgba(rim, 0.55));
    g.fillStyle = gr; part(ABDOMEN); g.fill();
    // Segment lines across the rear of the abdomen.
    g.save(); part(ABDOMEN); g.clip();
    g.strokeStyle = M.rgba(dark, 0.35); g.lineWidth = 2;
    for (var k = 0; k < 3; k++) {
      var sx = ax - (0.18 + k * 0.2) * R;
      g.beginPath(); g.moveTo(sx + 0.1 * R, m - 0.7 * R); g.quadraticCurveTo(sx - 0.12 * R, m, sx + 0.1 * R, m + 0.7 * R); g.stroke();
    }
    // The shell seam down the back.
    g.strokeStyle = M.rgba([255, 255, 255], 0.35); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(ax + 0.74 * R, m); g.lineTo(ax - 0.8 * R, m); g.stroke();
    g.restore();
    g.strokeStyle = M.rgba(rim, 0.95); g.lineWidth = 2.6; part(ABDOMEN); g.stroke();

    // Thorax plate: darker, with a bright rim.
    var tx = m + THORAX.x * R;
    var gt = g.createRadialGradient(tx - 0.1 * R, m, 0, tx, m, 0.5 * R);
    gt.addColorStop(0, M.rgba(fill, 0.95));
    gt.addColorStop(1, M.rgba(plate, 0.95));
    g.fillStyle = gt; part(THORAX); g.fill();
    g.strokeStyle = M.rgba(rim, 0.9); g.lineWidth = 2.4; part(THORAX); g.stroke();

    // Head.
    g.fillStyle = M.rgba(dark, 0.95); part(HEAD); g.fill();
    g.strokeStyle = M.rgba(rim, 0.85); g.lineWidth = 2.2; part(HEAD); g.stroke();
    return (cache[key] = c);
  }

  // A sprout seen from above: two small seed-leaves around a bud. Eight turned
  // versions, so neighbouring sprouts don't all point the same way.
  var SPROUT_SIZE = 64;
  function sprout(variant) {
    var key = 'sprout' + variant;
    if (cache[key]) return cache[key];
    var c = makeCanvas(SPROUT_SIZE), g = c.getContext('2d'), m = SPROUT_SIZE / 2;
    var leaf = rgbOf(GL.Config.colors.sprout);
    var deep = [Math.round(leaf[0] * 0.45), Math.round(leaf[1] * 0.55), Math.round(leaf[2] * 0.4)];
    var tip = [Math.min(255, leaf[0] + 70), Math.min(255, leaf[1] + 30), Math.min(255, leaf[2] + 50)];
    g.translate(m, m);
    g.rotate(variant * Math.PI / 4 + 0.3);
    for (var s = -1; s <= 1; s += 2) {
      g.save();
      g.rotate(s * 0.12);
      var lx = s * 12.5;
      var gr = g.createLinearGradient(0, 0, s * 26, 0);
      gr.addColorStop(0, M.rgba(deep, 1));
      gr.addColorStop(0.55, M.rgba(leaf, 1));
      gr.addColorStop(1, M.rgba(tip, 1));
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(lx, 0, 12, 9, 0, 0, M.TAU); g.fill();
      g.strokeStyle = M.rgba(deep, 0.9); g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = M.rgba(deep, 0.7); g.lineWidth = 1;           // the midrib
      g.beginPath(); g.moveTo(s * 3, 0); g.lineTo(s * 22, 0); g.stroke();
      g.restore();
    }
    g.fillStyle = M.rgba(tip, 1);                                     // the bud in the middle
    g.beginPath(); g.arc(0, 0, 3.4, 0, M.TAU); g.fill();
    return (cache[key] = c);
  }

  // A sprout's faint green glow, and the speck it becomes from far away.
  function sproutGlow() {
    if (cache.sproutGlow) return cache.sproutGlow;
    var size = 48, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var rgb = rgbOf(GL.Config.colors.sprout);
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, M.rgba(rgb, 0.9));
    grad.addColorStop(0.25, M.rgba(rgb, 0.45));
    grad.addColorStop(0.6, M.rgba(rgb, 0.1));
    grad.addColorStop(1, M.rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache.sproutGlow = c);
  }
  function sproutDot() {
    if (cache.sproutDot) return cache.sproutDot;
    var size = 16, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var rgb = rgbOf(GL.Config.colors.sprout);
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, M.rgba(rgb, 1));
    grad.addColorStop(0.45, M.rgba(rgb, 0.7));
    grad.addColorStop(1, M.rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache.sproutDot = c);
  }

  // A plain soft white dot: tiny far-away bugs and the dust motes.
  function dot() {
    if (cache.dot) return cache.dot;
    var size = 32, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(240,250,255,1)');
    grad.addColorStop(0.3, 'rgba(205,235,255,0.5)');
    grad.addColorStop(1, 'rgba(200,230,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache.dot = c);
  }
  // A warm speck for the dust motes floating in the lamp light.
  function mote() {
    if (cache.mote) return cache.mote;
    var size = 32, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,240,215,1)');
    grad.addColorStop(0.3, 'rgba(255,214,160,0.45)');
    grad.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache.mote = c);
  }

  // Heat-lamp light: a broad warm pool with a smooth falloff, and its hotter centre.
  function lampPool() {
    if (cache.lampPool) return cache.lampPool;
    var size = 256, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var rgb = rgbOf(GL.Config.colors.lamp);
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    for (var i = 0; i <= 10; i++) {                       // close to a bell curve, so there's no visible edge
      var t = i / 10, a = Math.exp(-t * t * 4.2) * (1 - t);
      grad.addColorStop(t, M.rgba(rgb, a));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache.lampPool = c);
  }
  function lampCore() {
    if (cache.lampCore) return cache.lampCore;
    var size = 128, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,226,186,1)');
    grad.addColorStop(0.3, 'rgba(255,196,130,0.5)');
    grad.addColorStop(0.65, 'rgba(255,170,100,0.12)');
    grad.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache.lampCore = c);
  }
  // The nutrient pad under a lamp: a soft patch of rich, dark soil.
  function pad() {
    if (cache.pad) return cache.pad;
    var size = 128, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var rgb = rgbOf(GL.Config.colors.padRich);
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, M.rgba(rgb, 0.95));
    grad.addColorStop(0.5, M.rgba(rgb, 0.75));
    grad.addColorStop(0.8, M.rgba(rgb, 0.25));
    grad.addColorStop(1, M.rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache.pad = c);
  }

  return {
    glow: glow, bug: bug, sprout: sprout, sproutGlow: sproutGlow, sproutDot: sproutDot,
    dot: dot, mote: mote, lampPool: lampPool, lampCore: lampCore, pad: pad,
    BODY_SIZE: BODY_SIZE, BODY_R: BODY_R, SPROUT_SIZE: SPROUT_SIZE,
    ABDOMEN: ABDOMEN, THORAX: THORAX, HEAD: HEAD
  };
})();
