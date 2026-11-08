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

  // A meat-eater seen from above, facing right (+x): the same body plan as a plant-eater, but with a
  // spiky armoured shell (spines along the abdomen, two on the thorax) and a broader, darker head.
  // Its pincers are drawn live by the renderer, so they can snap shut when it bites.
  function predator(hue) {
    var key = 'pred' + hueKey(hue);
    if (cache[key]) return cache[key];
    var c = makeCanvas(BODY_SIZE), g = c.getContext('2d'), m = BODY_SIZE / 2, R = BODY_R, h = hueKey(hue);
    var rim = M.hslToRgb(h, 1, 0.64), fill = M.hslToRgb(h, 0.85, 0.40), core = M.hslToRgb(h, 1, 0.82);
    var dark = M.hslToRgb(h, 0.7, 0.16), plate = M.hslToRgb(h, 0.75, 0.26), spike = M.hslToRgb(h, 0.9, 0.55);
    var ax = m + ABDOMEN.x * R, tx = m + THORAX.x * R;
    function part(p, pad) { g.beginPath(); g.ellipse(m + p.x * R, m, p.rx * R + (pad || 0), p.ry * R + (pad || 0), 0, 0, M.TAU); }
    // Spines: triangles standing out from the edge of the abdomen, raked backward.
    function spines(path) {
      var n = 9;
      for (var k = 0; k < n; k++) {
        var t = -2.35 + k * (4.7 / (n - 1));                       // around the sides and rear (not the front)
        var a = Math.PI + t, ca = Math.cos(a), sa = Math.sin(a);
        var bx = ax + ca * ABDOMEN.rx * R * 0.93, by = m + sa * ABDOMEN.ry * R * 0.93;
        var len = (k === 0 || k === n - 1 ? 0.16 : 0.24) * R;
        var ox = ca * len - 0.12 * R * Math.abs(sa), oy = sa * len;   // raked backward a little
        var w = 0.07 * R;
        path.moveTo(bx - sa * w, by + ca * w); path.lineTo(bx + ox, by + oy); path.lineTo(bx + sa * w, by - ca * w);
      }
      // two spines on the thorax shoulders
      [-1, 1].forEach(function (s) {
        var bx = tx + 0.05 * R, by = m + s * THORAX.ry * R * 0.9;
        path.moveTo(bx - 0.08 * R, by); path.lineTo(bx - 0.02 * R, by + s * 0.2 * R); path.lineTo(bx + 0.1 * R, by);
      });
    }
    var sp = new Path2D(); spines(sp);
    // Halo around the whole silhouette.
    g.save();
    g.shadowColor = M.rgba(rim, 0.8); g.shadowBlur = 16;
    g.fillStyle = M.rgba(dark, 0.95);
    part(ABDOMEN); g.fill(); part(THORAX); g.fill(); g.fill(sp);
    g.beginPath(); g.ellipse(m + HEAD.x * R, m, HEAD.rx * R * 1.1, HEAD.ry * R * 1.15, 0, 0, M.TAU); g.fill();
    g.restore();
    g.fillStyle = M.rgba(spike, 0.95); g.fill(sp);
    g.strokeStyle = M.rgba(rim, 0.9); g.lineWidth = 1.6; g.stroke(sp);
    // Abdomen: armoured, darker than a plant-eater's, lit from inside by a smaller hot lantern.
    var gr = g.createRadialGradient(ax - 0.22 * R, m, 0, ax - 0.05 * R, m, 0.86 * R);
    gr.addColorStop(0, 'rgba(255,240,245,0.95)');
    gr.addColorStop(0.16, M.rgba(core, 0.9));
    gr.addColorStop(0.45, M.rgba(fill, 0.85));
    gr.addColorStop(1, M.rgba(plate, 0.9));
    g.fillStyle = gr; part(ABDOMEN); g.fill();
    // Armour plates: chevrons across the back, and a hard ridge down the middle.
    g.save(); part(ABDOMEN); g.clip();
    g.strokeStyle = M.rgba(dark, 0.6); g.lineWidth = 2.4;
    for (var k = 0; k < 4; k++) {
      var sx = ax + (0.28 - k * 0.24) * R;
      g.beginPath(); g.moveTo(sx - 0.16 * R, m - 0.75 * R); g.lineTo(sx + 0.06 * R, m); g.lineTo(sx - 0.16 * R, m + 0.75 * R); g.stroke();
    }
    g.strokeStyle = M.rgba([255, 230, 240], 0.4); g.lineWidth = 2;
    g.beginPath(); g.moveTo(ax + 0.74 * R, m); g.lineTo(ax - 0.8 * R, m); g.stroke();
    g.restore();
    g.strokeStyle = M.rgba(rim, 0.95); g.lineWidth = 2.8; part(ABDOMEN); g.stroke();
    // Thorax plate with a bright rim.
    var gt = g.createRadialGradient(tx - 0.1 * R, m, 0, tx, m, 0.5 * R);
    gt.addColorStop(0, M.rgba(fill, 0.95)); gt.addColorStop(1, M.rgba(plate, 0.95));
    g.fillStyle = gt; part(THORAX); g.fill();
    g.strokeStyle = M.rgba(rim, 0.9); g.lineWidth = 2.4; part(THORAX); g.stroke();
    // A broader, darker head.
    g.fillStyle = M.rgba(dark, 0.98);
    g.beginPath(); g.ellipse(m + HEAD.x * R, m, HEAD.rx * R * 1.1, HEAD.ry * R * 1.15, 0, 0, M.TAU); g.fill();
    g.strokeStyle = M.rgba(rim, 0.9); g.lineWidth = 2.2; g.stroke();
    return (cache[key] = c);
  }

  // A meat pellet seen from above: a chunky, rounded nugget, amber with a darker red-brown rim,
  // a dark outline and a hot pale core, so it never melts into the warm lamp light. Four shapes.
  var MEAT_SIZE = 48;
  function meat(variant) {
    var key = 'meat' + variant;
    if (cache[key]) return cache[key];
    var c = makeCanvas(MEAT_SIZE), g = c.getContext('2d'), mm = MEAT_SIZE / 2;
    var amber = rgbOf(GL.Config.colors.amber);
    var rng = new GL.RNG(911 + variant * 37);
    // An irregular blob: a ring of points at slightly different distances, joined with smooth curves.
    var n = 7, pts = [];
    for (var k = 0; k < n; k++) {
      var a = k / n * M.TAU + rng.range(-0.25, 0.25), r = 13 * rng.range(0.8, 1.1);
      pts.push([mm + Math.cos(a) * r * 1.12, mm + Math.sin(a) * r * 0.9]);
    }
    var blob = new Path2D();
    for (k = 0; k < n; k++) {
      var p0 = pts[k], p1 = pts[(k + 1) % n], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      if (k === 0) blob.moveTo(mx, my); else blob.quadraticCurveTo(p0[0], p0[1], mx, my);
    }
    var pl = pts[0], pn = pts[1];
    blob.quadraticCurveTo(pl[0], pl[1], (pl[0] + pn[0]) / 2, (pl[1] + pn[1]) / 2);
    blob.closePath();
    g.save(); g.translate(mm, mm); g.rotate(variant * 1.3); g.translate(-mm, -mm);
    // Dark outline first (a little bigger than the pellet), so it reads on bright warm light.
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(18, 6, 4, 0.92)'; g.lineWidth = 5; g.stroke(blob);
    var gr = g.createRadialGradient(mm - 4, mm - 4, 1, mm, mm, 15);
    gr.addColorStop(0, 'rgba(255, 248, 210, 1)');
    gr.addColorStop(0.28, M.rgba(amber, 1));
    gr.addColorStop(0.75, 'rgba(214, 92, 30, 1)');
    gr.addColorStop(1, 'rgba(150, 44, 22, 1)');
    g.fillStyle = gr; g.fill(blob);
    // A few darker flecks and a glossy highlight.
    g.fillStyle = 'rgba(120, 30, 14, 0.55)';
    for (k = 0; k < 3; k++) { g.beginPath(); g.arc(mm + rng.range(-6, 7), mm + rng.range(-5, 6), rng.range(1.2, 2.2), 0, M.TAU); g.fill(); }
    g.fillStyle = 'rgba(255, 255, 240, 0.85)';
    g.beginPath(); g.ellipse(mm - 5, mm - 5, 3.2, 2, -0.6, 0, M.TAU); g.fill();
    g.restore();
    return (cache[key] = c);
  }
  // From far away a meat pellet is a small amber dot with a dark ring.
  function meatDot() {
    if (cache.meatDot) return cache.meatDot;
    var size = 16, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    g.fillStyle = 'rgba(18, 6, 4, 0.85)'; g.beginPath(); g.arc(r, r, r - 0.5, 0, M.TAU); g.fill();
    var grad = g.createRadialGradient(r - 1, r - 1, 0, r, r, r - 2.5);
    grad.addColorStop(0, 'rgba(255, 246, 205, 1)'); grad.addColorStop(0.5, 'rgba(255, 176, 32, 1)'); grad.addColorStop(1, 'rgba(210, 90, 30, 1)');
    g.fillStyle = grad; g.beginPath(); g.arc(r, r, r - 2.5, 0, M.TAU); g.fill();
    return (cache.meatDot = c);
  }

  // A scorch mark left by a meteor: a dark crater with a faint glowing rim.
  function crater() {
    if (cache.crater) return cache.crater;
    var size = 256, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(4, 3, 6, 0.9)');
    grad.addColorStop(0.45, 'rgba(10, 6, 8, 0.75)');
    grad.addColorStop(0.72, 'rgba(60, 22, 8, 0.45)');
    grad.addColorStop(0.82, 'rgba(255, 120, 40, 0.18)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    var rng = new GL.RNG(4242);
    g.strokeStyle = 'rgba(0, 0, 0, 0.35)'; g.lineWidth = 2;
    for (var k = 0; k < 16; k++) {                                   // cracks radiating out
      var a = rng.angle(), r0 = r * rng.range(0.3, 0.45), r1 = r * rng.range(0.6, 0.9);
      g.beginPath(); g.moveTo(r + Math.cos(a) * r0, r + Math.sin(a) * r0);
      g.lineTo(r + Math.cos(a + rng.range(-0.1, 0.1)) * r1, r + Math.sin(a + rng.range(-0.1, 0.1)) * r1); g.stroke();
    }
    return (cache.crater = c);
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

  // The right body for a creature: plant-eaters are smooth glowing bugs, meat-eaters spiky.
  function body(hue, isMeat) { return isMeat ? predator(hue) : bug(hue); }

  return {
    glow: glow, bug: bug, predator: predator, body: body, meat: meat, meatDot: meatDot, crater: crater,
    sprout: sprout, sproutGlow: sproutGlow, sproutDot: sproutDot,
    dot: dot, mote: mote, lampPool: lampPool, lampCore: lampCore, pad: pad,
    BODY_SIZE: BODY_SIZE, BODY_R: BODY_R, SPROUT_SIZE: SPROUT_SIZE, MEAT_SIZE: MEAT_SIZE,
    ABDOMEN: ABDOMEN, THORAX: THORAX, HEAD: HEAD
  };
})();
