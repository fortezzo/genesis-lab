// Genesis Lab - drawing: the renderer. All drawing happens here; it only READS
// the simulation. Layers, back to front: lab bench, terrarium floor (soil, moss,
// nutrient pads, lamp light, etched grid), meteor craters, the ice-age frost or the
// drought haze, far dust motes, sprouts and meat, glowing footprints, bugs (glow,
// legs, body, pincers, eyes, antennae), effects, falling meteors, the glass wall,
// near dust motes, vignette. Only what is on screen gets drawn.
var GL = GL || {};

GL.Renderer = function (canvas, world) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d', { alpha: false });
  this.world = world;
  this.camera = new GL.Camera();
  this.background = new GL.Background();
  this.effects = new GL.Effects();
  this.dpr = 1;
  this.time = 0;                  // real seconds since start (for pulses, legs and shimmer)
  this.selected = null;           // the selected creature, if any
  this.selectedId = 0;
  this.debug = false;
  this.reducedMotion = false;     // Session 4 adds the setting
  this.quality = { level: 2, footprints: 1, particles: 1, motes: 1, shimmer: true };
  this.qualityMode = 'auto';      // 'auto' (adapts to the frame rate), or fixed: 'high', 'medium', 'low' (Settings)
  this.phone = false;             // phones: no lamp shimmer and fewer particles, and auto quality tops out at medium
  this.lowFpsTime = 0; this.highFpsTime = 0;
  this.qualityClock = 0;          // real seconds the quality governor has been running
  this.lastDrop = -999;           // when quality last dropped...
  this.lastRaise = -999;          // ...and last went back up
  this.recoverWait = GL.Config.render.qualityRecoverSeconds;
  this.deathMark = null;          // where the followed bug died: { x, y, hue, radius, t }
  this.highlightSpecies = 0;      // a species picked in the family tree or log: its members get rings
  this.tool = null;               // god-mode tool under the pointer: { kind: 'meteor'|'drop'|'paint', x, y, on }
  this.flash = 0;                 // a white flash when a meteor strikes (fades in real time)
  this.shake = 0;                 // ...and a short camera shake
  this.view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  this.wt = [1, 0, 0, 1, 0, 0];   // the world-space transform for this frame
  this.resize(true);
};

// Where each leg joins the body and how it rests, in body radii and radians from "straight ahead".
// Front legs reach forward, middle legs out to the side, back legs backward.
GL.Renderer.LEGS = [
  { ax: 0.42, ay: 0.30, angle: 0.95, bend: -0.55, femur: 0.55, tibia: 0.60 },
  { ax: 0.16, ay: 0.40, angle: 1.62, bend: 0.25, femur: 0.55, tibia: 0.55 },
  { ax: -0.10, ay: 0.42, angle: 2.25, bend: 0.50, femur: 0.60, tibia: 0.65 }
];
GL.Renderer.HUE_BUCKET = 8;       // legs and footprints are batched by colour in buckets this many degrees wide

GL.Renderer.prototype = {
  resize: function (first) {
    var w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, GL.Config.render.maxPixelRatio);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.resize(w, h, first === true, this.measureInsets(h));
  },

  // Screen space the terrarium should fit into: below the top bar and above the hint line.
  measureInsets: function (h) {
    var m = GL.Config.render.viewMarginPx, top = 0, bottom = 0;
    var bar = document.getElementById('topbar'), hint = document.getElementById('hint');
    if (bar) { var rb = bar.getBoundingClientRect(); if (rb.height > 0) top = rb.bottom; }
    if (hint && !hint.classList.contains('gone') && getComputedStyle(hint).display !== 'none') {
      var rh = hint.getBoundingClientRect(); if (rh.height > 0) bottom = h - rh.top;
    }
    return { top: top + m, bottom: bottom + m, side: m };
  },

  setWorld: function (world) {
    this.world = world; this.effects.lastSeq = 0; this.effects.count = 0;
    this.select(null);
  },

  select: function (c) {
    this.selected = c; this.selectedId = c ? c.id : 0;
    this.world.watchId = c ? c.id : 0;      // the simulation keeps a record if this bug dies
    if (c) { this.camera.startFollowing(c); this.clearDeathMark(); } else this.camera.stopFollowing();
  },
  // A small fading marker where the followed bug died.
  markDeath: function (rec) { this.deathMark = { x: rec.x, y: rec.y, hue: rec.hue, radius: rec.radius, t: this.time }; },
  clearDeathMark: function () { this.deathMark = null; },
  // The selected creature, if it is still alive.
  getSelected: function () {
    var c = this.selected;
    if (c && (!c.alive || c.id !== this.selectedId)) { this.selected = null; this.selectedId = 0; return null; }
    return c;
  },

  // Find the creature closest to a screen point, within a few pixels.
  pick: function (sx, sy) {
    var cam = this.camera, wx = cam.screenToWorldX(sx), wy = cam.screenToWorldY(sy);
    var list = this.world.creatures, best = null, bestD = Infinity;
    var slack = GL.Config.render.clickSelectPx / cam.zoom;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], dx = c.x - wx, dy = c.y - wy, d = Math.sqrt(dx * dx + dy * dy) - c.radius;
      if (d < slack && d < bestD) { bestD = d; best = c; }
    }
    return best;
  },

  // Lower the drawing load when the frame rate stays low; raise it again when there is room.
  // The first seconds are ignored (loading is always a little slow). Quality comes back once the
  // frame rate holds a comfortable level for a few seconds, so a laptop running at 50-55 fps
  // recovers. If raising it makes things slow again straight away, the next try waits longer.
  adaptQuality: function (fps, dt) {
    var R = GL.Config.render, q = this.quality, now = (this.qualityClock += dt);
    var fixed = { high: 2, medium: 1, low: 0 }[this.qualityMode];
    if (fixed !== undefined) { q.level = fixed; this.lowFpsTime = 0; this.highFpsTime = 0; this.setQualityParts(); return; }
    var top = this.phone ? 1 : 2;
    if (q.level > top) q.level = top;
    if (now < R.qualityWarmupSeconds) { this.lowFpsTime = 0; this.highFpsTime = 0; }
    else if (fps < R.lowFpsThreshold) { this.lowFpsTime += dt; this.highFpsTime = 0; }
    else if (fps >= R.qualityRecoverFps) { this.highFpsTime += dt; this.lowFpsTime = 0; }
    else { this.lowFpsTime = 0; this.highFpsTime = 0; }
    if (this.lowFpsTime > R.lowFpsSeconds && q.level > 0) {
      q.level--; this.lowFpsTime = 0;
      // Dropped again right after going back up: wait twice as long before the next try.
      this.recoverWait = now - this.lastRaise < 10 ? Math.min(R.qualityBackoffMax, this.recoverWait * 2) : R.qualityRecoverSeconds;
      this.lastDrop = now;
    }
    if (this.highFpsTime > this.recoverWait && q.level < top) { q.level++; this.highFpsTime = 0; this.lastRaise = now; }
    this.setQualityParts();
  },
  setQualityParts: function () {
    var q = this.quality;
    q.footprints = [0, 0.5, 1][q.level];
    q.particles = [0.3, 0.6, 1][q.level];
    q.motes = [0.4, 0.7, 1][q.level];
    q.shimmer = q.level > 0 && !this.phone;
  },

  setWorldTransform: function () { var t = this.wt; this.ctx.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]); },

  draw: function (dt, fps) {
    var ctx = this.ctx, cam = this.camera, world = this.world, dpr = this.dpr;
    this.time += dt;
    this._lastDt = dt;
    this.adaptQuality(fps || 60, dt);
    this.getSelected();
    cam.update(dt, this.reducedMotion);
    this.background.update(cam, dt);

    var w = cam.w, h = cam.h, z = cam.zoom, v = this.view, pad = 60 / z + 40;
    v.x0 = cam.screenToWorldX(0) - pad; v.x1 = cam.screenToWorldX(w) + pad;
    v.y0 = cam.screenToWorldY(0) - pad; v.y1 = cam.screenToWorldY(h) + pad;
    this.effects.consume(world.events, this.quality, v);
    if (this.effects.impact) { this.effects.impact = 0; this.flash = 1; if (!this.reducedMotion) this.shake = 1; }
    this.effects.update(dt);
    var sx = 0, sy = 0;
    if (this.shake > 0) {                                   // a short shake when a meteor strikes
      this.shake = Math.max(0, this.shake - dt * 2.6);
      var amp = 9 * this.shake * this.shake;
      sx = Math.sin(this.time * 61) * amp; sy = Math.cos(this.time * 47) * amp;
    }
    var wt = this.wt;
    wt[0] = dpr * z; wt[1] = 0; wt[2] = 0; wt[3] = dpr * z;
    wt[4] = dpr * (w / 2 - cam.x * z + sx); wt[5] = dpr * (h / 2 - cam.y * z + sy);

    // Screen-space backdrop: the lab bench.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.background.drawBase(ctx, w, h);

    // World space: the terrarium floor, craters, and the weather god mode brings.
    this.setWorldTransform();
    this.background.drawFloor(ctx, cam, world, this.quality, this.reducedMotion);
    this.effects.drawCraters(ctx, cam);
    this.drawWeather(ctx, cam);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background.drawMotes(ctx, cam, world, 'far', this.quality);

    // World space: life.
    this.setWorldTransform();
    this.drawSprouts(ctx, cam);
    this.drawMeat(ctx, cam);
    var showPrints = this.quality.footprints > 0 && !this.reducedMotion;
    this.updateFootprints(showPrints);
    if (showPrints && z >= GL.Config.render.footprintMinZoom) this.drawFootprints(ctx, cam);
    this.drawCreatures(ctx, cam);
    this.effects.draw(ctx, cam);
    if (this.highlightSpecies) this.drawHighlight(ctx, cam);
    var sel = this.getSelected();
    if (sel) this.drawSelection(ctx, cam, sel);
    this.drawChampion(ctx, cam, sel);
    if (this.deathMark) this.drawDeathMark(ctx, cam);
    this.drawMeteors(ctx, cam);
    if (this.tool && this.tool.on) this.drawTool(ctx, cam);
    this.background.drawGlass(ctx, cam);

    // Screen space again.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background.drawMotes(ctx, cam, world, 'near', this.quality);
    this.background.drawVignette(ctx, w, h);
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 236, 205,' + (0.55 * this.flash * this.flash) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      this.flash = Math.max(0, this.flash - dt * 2.2);
    }
  },

  // ---------------------------------------------------------------- sprouts
  // From far away a sprout is a faint green speck; up close, two little leaves with a soft glow.
  // They grow in when they appear, sway gently, and fade as they wither.
  drawSprouts: function (ctx, cam) {
    var food = this.world.food, C = GL.Config, R = C.render, v = this.view, z = cam.zoom, S = GL.Sprites;
    var SPROUT = GL.Food.SPROUT, maxAge = C.sproutMaxAge, growT = R.sproutGrowTime;
    var full = C.sproutRadius * R.sproutSize;                     // leaf tip to leaf tip, world units
    var t = this.time * R.sproutSwaySpeed, sway = this.reducedMotion ? 0 : R.sproutSwayAmount;
    var i, x, y, age, fade, grow, s;
    ctx.globalCompositeOperation = 'lighter';
    if (full * z < 4) {
      var dotImg = S.sproutDot(), d = R.sproutDotPx / z;
      for (i = 0; i < food.count; i++) {
        if (!food.alive[i] || food.kind[i] !== SPROUT) continue;
        x = food.x[i]; y = food.y[i];
        if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
        age = food.age[i]; grow = age < growT ? age / growT : 1;
        fade = maxAge - age < 3 ? (maxAge - age) / 3 : 1;
        s = d * (0.55 + 0.45 * grow);
        ctx.globalAlpha = R.sproutDotAlpha * fade * (0.4 + 0.6 * grow);
        ctx.drawImage(dotImg, x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    // Close enough to see leaves: glows first (additive), then the leaves on top.
    var glowImg = S.sproutGlow(), gs = C.sproutRadius * R.sproutGlow * 2;
    var drawn = this._sproutIdx || (this._sproutIdx = new Int32Array(food.cap)), n = 0;
    for (i = 0; i < food.count; i++) {
      if (!food.alive[i] || food.kind[i] !== SPROUT) continue;
      x = food.x[i]; y = food.y[i];
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      drawn[n++] = i;
      age = food.age[i]; grow = age < growT ? age / growT : 1;
      fade = maxAge - age < 3 ? (maxAge - age) / 3 : 1;
      s = gs * (0.4 + 0.6 * grow);
      ctx.globalAlpha = R.sproutGlowAlpha * fade;
      ctx.drawImage(glowImg, x - s / 2, y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    var canvasSize = full * S.SPROUT_SIZE / 50;                   // the leaves span 49 of the sprite's 64 pixels
    for (var k = 0; k < n; k++) {
      i = drawn[k]; x = food.x[i]; y = food.y[i]; age = food.age[i];
      grow = age < growT ? age / growT : 1;
      fade = maxAge - age < 3 ? (maxAge - age) / 3 : 1;
      var ph = food.phase[i];
      s = canvasSize * (0.3 + 0.7 * grow) * (1 + sway * Math.sin(t + ph));
      ctx.globalAlpha = fade * (0.5 + 0.5 * grow);
      ctx.drawImage(S.sprout(((ph / GL.M.TAU) * 8) & 7), x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  },

  // ---------------------------------------------------------------- meat
  // Meat pellets: chunky amber nuggets with a dark outline and a hot core, so they stay easy to see
  // even in a lamp's warm light. A faint amber glow underneath; they shrink and fade as they decay.
  drawMeat: function (ctx, cam) {
    var food = this.world.food, C = GL.Config, R = C.render, v = this.view, z = cam.zoom, S = GL.Sprites;
    if (!food.meatCount) return;
    var MEAT = GL.Food.MEAT, maxAge = C.meatMaxAge, size = C.meatRadius * R.meatSize, i, x, y, fade, s;
    var far = size * z < 5, glow = S.glow(36, 1, 0.55), gs = C.meatRadius * R.meatGlow * 2;
    var list = this._meatIdx || (this._meatIdx = new Int32Array(food.cap)), n = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < food.count; i++) {
      if (!food.alive[i] || food.kind[i] !== MEAT) continue;
      x = food.x[i]; y = food.y[i];
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      list[n++] = i;
      fade = Math.min(1, (maxAge - food.age[i]) / R.meatFadeTime, food.age[i] / 0.3);
      if (far) continue;
      ctx.globalAlpha = R.meatGlowAlpha * fade;
      ctx.drawImage(glow, x - gs / 2, y - gs / 2, gs, gs);
    }
    ctx.globalCompositeOperation = 'source-over';
    var dotImg = far ? S.meatDot() : null, dd = Math.max(R.meatDotPx / z, size * 0.9);
    for (var k = 0; k < n; k++) {
      i = list[k]; x = food.x[i]; y = food.y[i];
      fade = Math.min(1, (maxAge - food.age[i]) / R.meatFadeTime, food.age[i] / 0.3);
      ctx.globalAlpha = Math.max(0, fade);
      if (far) { ctx.drawImage(dotImg, x - dd / 2, y - dd / 2, dd, dd); continue; }
      s = size * (0.75 + 0.25 * fade) * S.MEAT_SIZE / 30;           // the nugget spans about 30 of 48 pixels
      ctx.drawImage(S.meat(Math.floor(food.phase[i] / GL.M.TAU * 4) & 3), x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  },

  // ------------------------------------------------------ per-bug drawing state
  // Drawing-only state lives on the creature in a private slot the simulation never reads.
  fxOf: function (c) {
    var fx = c.fx, n = GL.Config.render.footprintMax;
    if (!fx) fx = c.fx = { id: -1, fpx: new Float32Array(n), fpy: new Float32Array(n), fpt: new Float32Array(n),
                           head: 0, count: 0, lx: 0, ly: 0, side: 1, gait: 0, gx: 0, gy: 0, move: 0,
                           px: 0, py: 0, ant: 0, pinch: 0, spark: 0 };
    if (fx.id !== c.id) {                      // a pooled creature object reused for a new life
      fx.id = c.id; fx.head = 0; fx.count = 0; fx.lx = c.x; fx.ly = c.y; fx.side = 1;
      fx.gait = Math.random() * GL.M.TAU; fx.gx = c.x; fx.gy = c.y; fx.move = 0;
      fx.px = 0; fx.py = 0; fx.ant = Math.random() * GL.M.TAU; fx.pinch = 0; fx.spark = 0;
    }
    return fx;
  },

  // Leave a footprint every short step, alternating left and right. Prints fade in real time.
  updateFootprints: function (enabled) {
    var list = this.world.creatures, R = GL.Config.render, n = R.footprintMax, now = this.time;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = this.fxOf(c);
      var dx = c.x - fx.lx, dy = c.y - fx.ly, step = c.radius * R.footprintEvery;
      if (dx * dx + dy * dy < step * step) continue;
      fx.lx = c.x; fx.ly = c.y;
      if (!enabled) continue;
      var off = c.radius * 0.42 * fx.side, hx = Math.cos(c.heading), hy = Math.sin(c.heading);
      fx.side = -fx.side;
      if (fx.count < n) fx.count++; else fx.head = (fx.head + 1) % n;
      var k = (fx.head + fx.count - 1) % n;
      fx.fpx[k] = c.x - hy * off; fx.fpy[k] = c.y + hx * off; fx.fpt[k] = now;
    }
  },

  drawFootprints: function (ctx, cam) {
    var list = this.world.creatures, C = GL.Config, R = C.render, v = this.view, z = cam.zoom;
    var n = R.footprintMax, now = this.time, life = R.footprintLife * this.quality.footprints;
    var HB = GL.Renderer.HUE_BUCKET, NB = Math.ceil(360 / HB);
    var paths = this._printPaths || (this._printPaths = []);
    for (var b = 0; b < NB * 3; b++) paths[b] = null;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = c.fx;
      if (!fx || fx.id !== c.id || fx.count === 0) continue;
      if (c.x < v.x0 - 60 || c.x > v.x1 + 60 || c.y < v.y0 - 60 || c.y > v.y1 + 60) continue;
      var bucket = Math.floor(c.hue / HB) % NB;
      var rad = Math.max(c.radius * R.footprintSize, 0.6 / z);
      for (var k = 0; k < fx.count; k++) {
        var idx = (fx.head + k) % n, age = now - fx.fpt[idx];
        if (age >= life || age < 0) continue;
        var tier = Math.min(2, Math.floor(age / life * 3)), p = paths[bucket * 3 + tier];
        if (!p) p = paths[bucket * 3 + tier] = new Path2D();
        var x = fx.fpx[idx], y = fx.fpy[idx];
        p.moveTo(x + rad, y); p.arc(x, y, rad, 0, GL.M.TAU);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (b = 0; b < NB; b++) {
      var hue = Math.round((b + 0.5) * HB);
      for (var tr = 0; tr < 3; tr++) {
        if (!paths[b * 3 + tr]) continue;
        ctx.fillStyle = 'hsla(' + hue + ',100%,70%,' + (R.footprintAlpha * [1, 0.55, 0.22][tr]) + ')';
        ctx.fill(paths[b * 3 + tr]);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // ------------------------------------------------------------------ bugs
  drawCreatures: function (ctx, cam) {
    var list = this.world.creatures, C = GL.Config, R = C.render, v = this.view, z = cam.zoom;
    var S = GL.Sprites, tick = this.world.tick, eatTicks = R.eatFlashTime * C.ticksPerSecond;
    var detail = this._detail || (this._detail = []), legs = this._legs || (this._legs = []);
    var close = this._close || (this._close = []), dot = S.dot(), biters = this._biters || (this._biters = []);
    detail.length = 0; legs.length = 0; close.length = 0; biters.length = 0;
    var dotBelowPx = 0.9;                                          // below this body radius on screen, a bug is a bright dot
    var minBody = R.creatureMinBodyPx / z;                         // otherwise its body is drawn at least this big
    // Glows first (additive light), so bodies sit on top of the bloom.
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) continue;
      var fade = Math.min(1, (tick - c.bornTick) / 45);            // newcomers fade in
      var flash = tick - c.lastEatTick < eatTicks ? 1 - (tick - c.lastEatTick) / eatTicks : 0;
      var g = Math.max(c.radius * R.creatureGlow * 2 * (1 + flash * 0.35), R.creatureGlowMinPx / z);
      ctx.globalAlpha = R.creatureGlowAlpha * fade * (0.85 + flash * 0.6);
      ctx.drawImage(S.glow(c.hue, 1, c.meat ? 0.55 : 0.58), c.x - g / 2, c.y - g / 2, g, g);
      if (c.meat && tick - c.lastBiteTick <= 2) biters.push(c);
      if (c.radius * z < dotBelowPx && minBody <= 0) {             // tiny on screen: a white-hot point
        var d = R.creatureDotPx / z;
        ctx.globalAlpha = 0.95 * fade;
        ctx.drawImage(dot, c.x - d / 2, c.y - d / 2, d, d);
      } else detail.push(c);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (biters.length) this.drawStruggles(ctx, cam, biters);
    if (!detail.length) return;

    // Legs go under the bodies.
    for (i = 0; i < detail.length; i++) if (detail[i].radius * z >= R.legDetailPx) legs.push(detail[i]);
    if (legs.length) this.drawLegs(ctx, cam, legs);

    // Bodies: each sprite turned to face the bug's heading. Meat-eaters have a spiky shell.
    var wt = this.wt, k0 = wt[0], scale = S.BODY_SIZE / S.BODY_R;
    for (i = 0; i < detail.length; i++) {
      c = detail[i];
      // Zoomed out, small bugs are drawn a little bigger than life so they still read as bugs, not dots
      // (babies a bit smaller than adults; meat-eaters a touch bigger, so their spikes show).
      var grown = c.radius / c.fullRadius, shown = Math.max(c.radius, minBody * (0.7 + 0.3 * grown) * (c.meat ? 1.15 : 1));
      var s = shown * scale, ch = Math.cos(c.heading), sh = Math.sin(c.heading);
      ctx.setTransform(k0 * ch, k0 * sh, -k0 * sh, k0 * ch, wt[4] + k0 * c.x, wt[5] + k0 * c.y);
      ctx.globalAlpha = Math.min(1, (tick - c.bornTick) / 45);
      ctx.drawImage(S.body(c.hue, c.meat), -s / 2, -s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    this.setWorldTransform();

    // Close up: pincers, antennae and eyes.
    for (i = 0; i < detail.length; i++) if (detail[i].radius * z >= R.detailPx) close.push(detail[i]);
    if (close.length) { this.drawPincers(ctx, cam, close); this.drawAntennae(ctx, cam, close); this.drawEyes(ctx, cam, close); }
  },

  // Six legs in a tripod gait (front-left, middle-right and back-left step together, then the
  // other three). The gait advances with the distance walked, so legs patter faster as a bug
  // walks faster and stand still when it stops.
  drawLegs: function (ctx, cam, list) {
    var C = GL.Config, R = C.render, z = cam.zoom, dt = Math.min(0.05, this._lastDt || 0.016);
    var LEGS = GL.Renderer.LEGS, TAU = GL.M.TAU, reach = R.legLength;
    var HB = GL.Renderer.HUE_BUCKET, NB = Math.ceil(360 / HB);
    var TIERS = 3, tierAlpha = [0.3, 0.58, 0.85];                // legs fade in as a bug gets bigger on screen
    var paths = this._legPaths || (this._legPaths = []), widths = this._legWidths || (this._legWidths = []);
    for (var b = 0; b < NB * TIERS; b++) { paths[b] = null; widths[b] = 0; }
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = this.fxOf(c), r = c.radius;
      var dx = c.x - fx.gx, dy = c.y - fx.gy, dist = Math.sqrt(dx * dx + dy * dy);
      fx.gx = c.x; fx.gy = c.y;
      if (dist > r * 6) dist = 0;                                  // skipped frames or a reused body: don't spin the legs
      var adv = dist / (R.legStride * r) * TAU, maxAdv = R.legPatterMax * dt;
      if (!this.reducedMotion) fx.gait += adv > maxAdv ? maxAdv : adv;
      var moving = c.topSpeed > 0 ? Math.min(1, c.speed / (0.2 * c.topSpeed)) : 0;
      fx.move += (moving - fx.move) * Math.min(1, dt * 12);
      var ch = Math.cos(c.heading), sh = Math.sin(c.heading);
      var show = GL.M.smoothstep(R.legDetailPx, R.legFullPx, r * z), tier = show < 0.4 ? 0 : (show < 0.8 ? 1 : 2);
      var bucket = (Math.floor(c.hue / HB) % NB) * TIERS + tier;
      var p = paths[bucket] || (paths[bucket] = new Path2D());
      var lw = Math.max(0.9 / z, r * (c.meat ? 0.09 : 0.075));
      if (lw > widths[bucket]) widths[bucket] = lw;
      for (var leg = 0; leg < 3; leg++) {
        var L = LEGS[leg];
        for (var side = -1; side <= 1; side += 2) {
          var group = (leg === 1) === (side < 0) ? 1 : 0;          // tripod groups
          var ph = fx.gait + group * Math.PI;
          var swing = R.legSwing * fx.move * Math.sin(ph);
          var lift = 1 - 0.14 * fx.move * Math.max(0, Math.cos(ph)); // a leg swinging forward is lifted, so it looks shorter
          var a1 = L.angle + swing, a2 = a1 + L.bend;
          var f = L.femur * r * reach * lift, t = L.tibia * r * reach * lift;
          // Local coordinates: x forward, y toward the bug's right (side +1) or left (side -1).
          var lx0 = L.ax * r, ly0 = side * L.ay * r;
          var lx1 = lx0 + Math.cos(a1) * f, ly1 = ly0 + side * Math.sin(a1) * f;
          var lx2 = lx1 + Math.cos(a2) * t, ly2 = ly1 + side * Math.sin(a2) * t;
          p.moveTo(c.x + lx0 * ch - ly0 * sh, c.y + lx0 * sh + ly0 * ch);
          p.lineTo(c.x + lx1 * ch - ly1 * sh, c.y + lx1 * sh + ly1 * ch);
          p.lineTo(c.x + lx2 * ch - ly2 * sh, c.y + lx2 * sh + ly2 * ch);
        }
      }
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (b = 0; b < NB * TIERS; b++) {
      if (!paths[b]) continue;
      var hue = Math.round((Math.floor(b / TIERS) + 0.5) * HB);
      ctx.strokeStyle = 'hsla(' + hue + ',85%,60%,' + tierAlpha[b % TIERS] + ')';
      ctx.lineWidth = widths[b];
      ctx.stroke(paths[b]);
    }
  },

  // A meat-eater's pincers: two curved mandibles at the front of the head. They hang half open,
  // open wide when it closes in on prey, and snap shut while it bites.
  drawPincers: function (ctx, cam, list) {
    var dt = Math.min(0.05, this._lastDt || 0.016), tick = this.world.tick, HEAD = GL.Sprites.HEAD, z = cam.zoom;
    var paths = this._pincerPaths || (this._pincerPaths = {}), keys = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c.meat) continue;
      var fx = this.fxOf(c), biting = tick - c.lastBiteTick <= 3;
      var hunting = c.lookPrey && c.lookAmount > 0.6;
      var target = biting ? 1 : (hunting ? -0.35 : 0.1 + 0.08 * Math.sin(this.time * 2.1 + fx.ant));
      fx.pinch += (target - fx.pinch) * Math.min(1, dt * (biting ? 26 : 9));
      var r = c.radius, ch = Math.cos(c.heading), sh = Math.sin(c.heading), k = fx.pinch;
      var key = Math.floor(c.hue / GL.Renderer.HUE_BUCKET);
      var p = paths[key];
      if (!p || p.frame !== this.time) { p = paths[key] = new Path2D(); p.frame = this.time; p.hue = c.hue; p.w = 0; keys.push(key); }
      p.w = Math.max(p.w, r * 0.13, 0.9 / z);
      for (var side = -1; side <= 1; side += 2) {
        var bx = (HEAD.x + 0.1) * r, by = side * 0.2 * r;
        var cx = (HEAD.x + 0.62) * r, cy = side * (0.46 - 0.2 * k) * r;
        var tx = (HEAD.x + 0.66 + 0.06 * k) * r, ty = side * (0.07 + 0.22 * (1 - k)) * r;
        p.moveTo(c.x + bx * ch - by * sh, c.y + bx * sh + by * ch);
        p.quadraticCurveTo(c.x + cx * ch - cy * sh, c.y + cx * sh + cy * ch, c.x + tx * ch - ty * sh, c.y + tx * sh + ty * ch);
      }
    }
    ctx.lineCap = 'round';
    for (i = 0; i < keys.length; i++) {
      var pp = paths[keys[i]];
      ctx.strokeStyle = 'rgba(16, 4, 10, 0.75)'; ctx.lineWidth = pp.w * 1.7; ctx.stroke(pp);
      ctx.strokeStyle = 'hsla(' + Math.round(pp.hue) + ', 95%, 72%, 0.95)'; ctx.lineWidth = pp.w; ctx.stroke(pp);
    }
  },

  // A hunt in progress: red sparks fly at the biter's mouth and the victim pulses red.
  drawStruggles: function (ctx, cam, biters) {
    var z = cam.zoom, R = GL.Config.render, dt = Math.min(0.05, this._lastDt || 0.016), fxs = this.effects;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < biters.length; i++) {
      var c = biters[i], v = c.biteTarget, fx = this.fxOf(c);
      if (!v || !v.alive) continue;
      var mx = c.x + Math.cos(c.heading) * c.radius * 1.2, my = c.y + Math.sin(c.heading) * c.radius * 1.2;
      fx.spark += dt * R.biteSparkRate * this.quality.particles;
      while (fx.spark >= 1) {
        fx.spark -= 1;
        var a = Math.random() * GL.M.TAU, sp = 20 + Math.random() * 40;
        fxs.add(GL.Effects.SPARK, mx, my, Math.cos(a) * sp, Math.sin(a) * sp, 0.35 + Math.random() * 0.25, 1.5 + Math.random() * 2, 352);
      }
      var pulse = 0.5 + 0.5 * Math.sin(this.time * 18 + c.id), rr = Math.max(v.radius * 1.6, 7 / z);
      ctx.strokeStyle = 'rgba(255, 70, 110,' + (0.35 + 0.35 * pulse) + ')';
      ctx.lineWidth = Math.max(1.2 / z, v.radius * 0.18);
      ctx.beginPath(); ctx.arc(v.x, v.y, rr, 0, GL.M.TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // Two short antennae that twitch, and lean toward the food the bug is looking at.
  drawAntennae: function (ctx, cam, list) {
    var R = GL.Config.render, z = cam.zoom, t = this.reducedMotion ? 0 : this.time;
    ctx.lineCap = 'round';
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = this.fxOf(c), r = c.radius, len = R.antennaLength * r * (c.meat ? 0.75 : 1);
      var ch = Math.cos(c.heading), sh = Math.sin(c.heading);
      var lean = c.lookAmount > 0 ? Math.max(-0.6, Math.min(0.6, c.lookAngle)) * 0.5 : 0;
      ctx.beginPath();
      for (var side = -1; side <= 1; side += 2) {
        var wig = 0.12 * Math.sin(t * 4.3 + fx.ant + side * 1.3) + 0.05 * Math.sin(t * 11 + fx.ant * 2);
        var a = side * (c.meat ? 0.75 : 0.42) + lean + wig;
        var bx = 1.04 * r, by = side * (c.meat ? 0.22 : 0.1) * r;
        var cx = bx + Math.cos(a * 0.45) * len * 0.55, cy = by + Math.sin(a * 0.45) * len * 0.55;
        var tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
        ctx.moveTo(c.x + bx * ch - by * sh, c.y + bx * sh + by * ch);
        ctx.quadraticCurveTo(c.x + cx * ch - cy * sh, c.y + cx * sh + cy * ch, c.x + tx * ch - ty * sh, c.y + tx * sh + ty * ch);
      }
      ctx.strokeStyle = 'hsla(' + Math.round(c.hue) + ',100%,74%,0.8)';
      ctx.lineWidth = Math.max(0.8 / z, r * 0.05);
      ctx.stroke();
    }
  },

  // Two eyes on the head. Pupils glance toward the food it is looking at (smoothed so they don't jitter).
  // Meat-eaters' eyes glow faintly red.
  drawEyes: function (ctx, cam, list) {
    var whites = new Path2D(), pupils = new Path2D(), red = new Path2D(), HEAD = GL.Sprites.HEAD, anyRed = false;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = this.fxOf(c), r = c.radius, h = c.heading;
      var look = c.lookAmount > 0 ? c.lookAngle : 0, tx = Math.cos(h + look), ty = Math.sin(h + look);
      fx.px += (tx - fx.px) * 0.15; fx.py += (ty - fx.py) * 0.15;
      var ch = Math.cos(h), sh = Math.sin(h), er = r * 0.17;
      for (var side = -1; side <= 1; side += 2) {
        var lx = (HEAD.x + 0.08) * r, ly = side * (c.meat ? 0.24 : 0.2) * r;
        var ex = c.x + lx * ch - ly * sh, ey = c.y + lx * sh + ly * ch;
        var w = c.meat ? red : whites;
        w.moveTo(ex + er, ey); w.arc(ex, ey, er, 0, GL.M.TAU);
        if (c.meat) anyRed = true;
        var px = ex + fx.px * er * 0.45, py = ey + fx.py * er * 0.45, pr = er * 0.55;
        pupils.moveTo(px + pr, py); pupils.arc(px, py, pr, 0, GL.M.TAU);
      }
    }
    ctx.fillStyle = 'rgba(225, 245, 255, 0.95)'; ctx.fill(whites);
    if (anyRed) { ctx.fillStyle = 'rgba(255, 196, 206, 0.95)'; ctx.fill(red); }
    ctx.fillStyle = '#050B18'; ctx.fill(pupils);
  },

  // A species picked in the family tree, the streamgraph or the lab log: a ring around each member.
  drawHighlight: function (ctx, cam) {
    var list = this.world.creatures, id = this.highlightSpecies, v = this.view, z = cam.zoom, any = false;
    var sp = this.world.species.get(id);
    if (!sp) { this.highlightSpecies = 0; return; }
    var p = new Path2D(), pulse = 0.75 + 0.25 * Math.sin(this.time * 3);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.speciesId !== id || c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) continue;
      var r = Math.max(c.radius * 2.1, 9 / z);
      p.moveTo(c.x + r, c.y); p.arc(c.x, c.y, r, 0, GL.M.TAU); any = true;
    }
    if (!any) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'hsla(' + Math.round(((sp.hue % 360) + 360) % 360) + ', 100%, 70%,' + (0.6 * pulse) + ')';
    ctx.lineWidth = 1.6 / z;
    ctx.stroke(p);
    ctx.globalCompositeOperation = 'source-over';
  },

  // ------------------------------------------------------------ god mode
  // Ice age: frost creeps over the terrarium. Drought: a dry, dusty haze.
  drawWeather: function (ctx, cam) {
    var g = this.world.god, C = GL.Config, R = C.terrariumRadius, M = GL.M;
    var ice = g.iceLevel, dry = g.drought > 0 ? Math.min(1, g.drought / 4, (C.god.droughtSeconds - g.drought) / 2 + 0.2) : 0;
    if (ice <= 0.01 && dry <= 0.01) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, M.TAU); ctx.clip();
    if (dry > 0.01) {
      ctx.fillStyle = 'rgba(150, 120, 70,' + (0.11 * dry) + ')';
      ctx.fillRect(-R, -R, R * 2, R * 2);
    }
    if (ice > 0.01) {
      var fr = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
      fr.addColorStop(0, 'rgba(170, 215, 255,' + (0.05 * ice) + ')');
      fr.addColorStop(0.75, 'rgba(200, 235, 255,' + (0.11 * ice) + ')');
      fr.addColorStop(1, 'rgba(235, 248, 255,' + (0.30 * ice) + ')');
      ctx.fillStyle = fr; ctx.fillRect(-R, -R, R * 2, R * 2);
    }
    ctx.restore();
  },

  // A meteor about to strike: a burning streak falling toward a target ring on the soil.
  drawMeteors: function (ctx, cam) {
    var list = this.world.god.meteors, z = cam.zoom, now = this.world.time, D = GL.Config.god;
    if (!list.length) return;
    for (var i = 0; i < list.length; i++) {
      var m = list[i], p = Math.max(0, Math.min(1, (now - m.from) / (m.at - m.from)));
      ctx.setLineDash([10 / z, 8 / z]);
      ctx.strokeStyle = 'rgba(255, 120, 60,' + (0.3 + 0.5 * p) + ')';
      ctx.lineWidth = 2 / z;
      ctx.beginPath(); ctx.arc(m.x, m.y, D.meteorRadius * (1.25 - 0.25 * p), 0, GL.M.TAU); ctx.stroke();
      ctx.setLineDash([]);
      var e = p * p, fx = m.x - 1400 * (1 - e), fy = m.y - 1700 * (1 - e);
      var tail = ctx.createLinearGradient(fx, fy, fx - 260, fy - 320);
      tail.addColorStop(0, 'rgba(255, 230, 190, 0.95)'); tail.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = tail; ctx.lineWidth = 18; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - 260, fy - 320); ctx.stroke();
      var gs = 160;
      ctx.drawImage(GL.Sprites.glow(30, 1, 0.65), fx - gs / 2, fy - gs / 2, gs, gs);
      ctx.globalCompositeOperation = 'source-over';
    }
  },

  // The armed god-mode tool under the pointer: a target for the meteor, a drop zone, or the food brush.
  drawTool: function (ctx, cam) {
    var t = this.tool, z = cam.zoom, D = GL.Config.god, pulse = 0.6 + 0.4 * Math.sin(this.time * 5);
    ctx.lineWidth = 1.6 / z;
    if (t.kind === 'meteor') {
      var r = D.meteorRadius;
      ctx.strokeStyle = 'rgba(255, 110, 70,' + (0.5 + 0.4 * pulse) + ')';
      ctx.setLineDash([8 / z, 6 / z]);
      ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, GL.M.TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(t.x - r * 0.25, t.y); ctx.lineTo(t.x + r * 0.25, t.y); ctx.moveTo(t.x, t.y - r * 0.25); ctx.lineTo(t.x, t.y + r * 0.25);
      ctx.stroke();
    } else if (t.kind === 'drop') {
      ctx.strokeStyle = 'rgba(255, 61, 110,' + (0.5 + 0.4 * pulse) + ')';
      ctx.setLineDash([5 / z, 5 / z]);
      ctx.beginPath(); ctx.arc(t.x, t.y, D.dropSpread, 0, GL.M.TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else if (t.kind === 'paint') {
      ctx.strokeStyle = 'rgba(102, 221, 79,' + (t.down ? 0.9 : 0.55) + ')';
      ctx.fillStyle = 'rgba(102, 221, 79,' + (t.down ? 0.08 : 0.04) + ')';
      ctx.beginPath(); ctx.arc(t.x, t.y, D.paintRadius, 0, GL.M.TAU); ctx.fill(); ctx.stroke();
    }
  },

  // Where the followed bug died: a soft ring and a small cross that fade out.
  drawDeathMark: function (ctx, cam) {
    var m = this.deathMark, R = GL.Config.render, age = this.time - m.t;
    if (age > R.deathMarkSeconds) { this.deathMark = null; return; }
    var z = cam.zoom, a = 1 - age / R.deathMarkSeconds, r = Math.max(m.radius * 2.2, 16 / z);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'hsla(' + Math.round(m.hue) + ', 60%, 70%,' + (0.55 * a) + ')';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([4 / z, 4 / z]);
    ctx.beginPath(); ctx.arc(m.x, m.y, r * (1 + 0.15 * Math.sin(age * 3)), 0, GL.M.TAU); ctx.stroke();
    ctx.setLineDash([]);
    var k = r * 0.35;
    ctx.strokeStyle = 'rgba(230, 240, 255,' + (0.6 * a) + ')';
    ctx.beginPath(); ctx.moveTo(m.x - k, m.y - k); ctx.lineTo(m.x + k, m.y + k); ctx.moveTo(m.x + k, m.y - k); ctx.lineTo(m.x - k, m.y + k); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  },

  drawSelection: function (ctx, cam, c) {
    var z = cam.zoom, r = Math.max(c.radius * 2, 14 / z), t = this.time, M = GL.M;
    var rgb = c.meat ? '255, 61, 110' : '34, 229, 255';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(' + rgb + ', 0.85)';
    ctx.lineWidth = 1.6 / z;
    for (var k = 0; k < 4; k++) {                       // four rotating brackets
      var a = t * 0.8 + k * Math.PI / 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, a, a + 0.9); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.18 + 0.12 * Math.sin(t * 3)) + ')';
    ctx.beginPath(); ctx.arc(c.x, c.y, r * 1.25, 0, M.TAU); ctx.stroke();
    if (this.debug) this.drawViewSlices(ctx, cam, c);
    else this.drawViewCone(ctx, cam, c);
    ctx.globalCompositeOperation = 'source-over';
  },

  // The selected bug's field of view, faint on the soil; slices that see food glow green (red for a
  // meat-eater's prey), the same picture as the radar in the inspector.
  drawViewCone: function (ctx, cam, c) {
    var R = GL.Config.render, IN = GL.Brain.IN, half = c.fov / 2, w = c.fov / 5, gain = GL.Config.foodSenseGain;
    var food = c.meat ? '255, 120, 90' : '102, 221, 79', cone = c.meat ? '255, 61, 110' : '34, 229, 255';
    for (var s = 0; s < 5; s++) {
      var a0 = c.heading - half + s * w, f = c.inputs[IN.FOOD + s] / gain;
      if (f <= 0.01) continue;
      ctx.fillStyle = 'rgba(' + food + ',' + (R.viewConeFoodAlpha * f) + ')';
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.sight, a0, a0 + w); ctx.closePath(); ctx.fill();
    }
    var g = ctx.createRadialGradient(c.x, c.y, c.radius, c.x, c.y, c.sight);
    g.addColorStop(0, 'rgba(' + cone + ',' + R.viewConeAlpha + ')'); g.addColorStop(1, 'rgba(' + cone + ', 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.sight, c.heading - half, c.heading + half); ctx.closePath(); ctx.fill();
  },

  // A small gold crown floating over the champion (the best score alive), so F has something to find.
  drawChampion: function (ctx, cam, sel) {
    var w = this.world, id = w.stats.championId, c = this._champ;
    if (!c || !c.alive || c.id !== id) c = this._champ = id ? w.findById(id) : null;
    if (!c) return;
    var v = this.view;
    if (c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) return;
    var z = cam.zoom, s = 7 / z, bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.2) * 1.5 / z;
    var x = c.x, y = c.y - Math.max(c.radius * 2.6, (sel === c ? 26 : 16) / z) + bob;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = GL.Config.render.championMarkAlpha;
    var gs = s * 4;
    ctx.drawImage(GL.Sprites.glow(40, 1, 0.6), x - gs / 2, y - gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.55); ctx.lineTo(x - s, y - s * 0.35); ctx.lineTo(x - s * 0.5, y + s * 0.05);
    ctx.lineTo(x, y - s * 0.6); ctx.lineTo(x + s * 0.5, y + s * 0.05); ctx.lineTo(x + s, y - s * 0.35); ctx.lineTo(x + s, y + s * 0.55);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 214, 128, 0.95)'; ctx.fill();
    ctx.lineWidth = 1 / z; ctx.strokeStyle = 'rgba(80, 50, 10, 0.8)'; ctx.stroke();
  },

  // Debug overlay: the selected creature's 5 view slices, shaded by what it sees.
  drawViewSlices: function (ctx, cam, c) {
    var IN = GL.Brain.IN, half = c.fov / 2, w = c.fov / 5;
    for (var s = 0; s < 5; s++) {
      var a0 = c.heading - half + s * w, food = c.inputs[IN.FOOD + s], cre = c.inputs[IN.CREATURE + s];
      ctx.fillStyle = 'rgba(102, 221, 79,' + (0.04 + food * 0.025) + ')';
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.sight, a0, a0 + w); ctx.closePath(); ctx.fill();
      if (cre > 0) {
        ctx.strokeStyle = 'rgba(255, 176, 32,' + (0.2 + cre * 0.5) + ')';
        ctx.lineWidth = 2 / cam.zoom;
        ctx.beginPath(); ctx.arc(c.x, c.y, c.sight * (1 - cre), a0, a0 + w); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(140, 200, 255, 0.35)'; ctx.lineWidth = 1 / cam.zoom;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.sight, c.heading - half, c.heading + half); ctx.closePath(); ctx.stroke();
    // The mouth: food must touch this circle to be eaten.
    var C = GL.Config, mr = c.radius * C.mouthRange + C.sproutRadius;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath(); ctx.arc(c.mouthX(), c.mouthY(), mr, 0, GL.M.TAU); ctx.stroke();
  }
};
