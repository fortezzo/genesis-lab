// Genesis Lab - drawing: the renderer. All drawing happens here; it only READS
// the simulation. Layers, back to front: lab bench, terrarium floor (soil, moss,
// nutrient pads, lamp light, etched grid), far dust motes, sprouts, glowing
// footprints, bugs (glow, legs, body, eyes, antennae), effects, the glass wall,
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
  this.lowFpsTime = 0; this.highFpsTime = 0;
  this.qualityClock = 0;          // real seconds the quality governor has been running
  this.lastDrop = -999;           // when quality last dropped...
  this.lastRaise = -999;          // ...and last went back up
  this.recoverWait = GL.Config.render.qualityRecoverSeconds;
  this.deathMark = null;          // where the followed bug died: { x, y, hue, radius, t }
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
    if (this.highFpsTime > this.recoverWait && q.level < 2) { q.level++; this.highFpsTime = 0; this.lastRaise = now; }
    q.footprints = [0, 0.5, 1][q.level];
    q.particles = [0.3, 0.6, 1][q.level];
    q.motes = [0.4, 0.7, 1][q.level];
    q.shimmer = q.level > 0;
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
    this.effects.update(dt);
    var wt = this.wt;
    wt[0] = dpr * z; wt[1] = 0; wt[2] = 0; wt[3] = dpr * z;
    wt[4] = dpr * (w / 2 - cam.x * z); wt[5] = dpr * (h / 2 - cam.y * z);

    // Screen-space backdrop: the lab bench.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.background.drawBase(ctx, w, h);

    // World space: the terrarium floor.
    this.setWorldTransform();
    this.background.drawFloor(ctx, cam, world, this.quality, this.reducedMotion);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background.drawMotes(ctx, cam, world, 'far', this.quality);

    // World space: life.
    this.setWorldTransform();
    this.drawSprouts(ctx, cam);
    var showPrints = this.quality.footprints > 0 && !this.reducedMotion;
    this.updateFootprints(showPrints);
    if (showPrints && z >= GL.Config.render.footprintMinZoom) this.drawFootprints(ctx, cam);
    this.drawCreatures(ctx, cam);
    this.effects.draw(ctx, cam);
    var sel = this.getSelected();
    if (sel) this.drawSelection(ctx, cam, sel);
    this.drawChampion(ctx, cam, sel);
    if (this.deathMark) this.drawDeathMark(ctx, cam);
    this.background.drawGlass(ctx, cam);

    // Screen space again.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background.drawMotes(ctx, cam, world, 'near', this.quality);
    this.background.drawVignette(ctx, w, h);
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

  // ------------------------------------------------------ per-bug drawing state
  // Drawing-only state lives on the creature in a private slot the simulation never reads.
  fxOf: function (c) {
    var fx = c.fx, n = GL.Config.render.footprintMax;
    if (!fx) fx = c.fx = { id: -1, fpx: new Float32Array(n), fpy: new Float32Array(n), fpt: new Float32Array(n),
                           head: 0, count: 0, lx: 0, ly: 0, side: 1, gait: 0, gx: 0, gy: 0, move: 0,
                           px: 0, py: 0, ant: 0 };
    if (fx.id !== c.id) {                      // a pooled creature object reused for a new life
      fx.id = c.id; fx.head = 0; fx.count = 0; fx.lx = c.x; fx.ly = c.y; fx.side = 1;
      fx.gait = Math.random() * GL.M.TAU; fx.gx = c.x; fx.gy = c.y; fx.move = 0;
      fx.px = 0; fx.py = 0; fx.ant = Math.random() * GL.M.TAU;
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
    var BUCKETS = 6, hMin = C.plantHueMin, hSpan = C.plantHueMax - hMin + 0.01;
    var paths = this._printPaths || (this._printPaths = []);
    for (var b = 0; b < BUCKETS * 3; b++) paths[b] = null;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = c.fx;
      if (!fx || fx.id !== c.id || fx.count === 0) continue;
      if (c.x < v.x0 - 60 || c.x > v.x1 + 60 || c.y < v.y0 - 60 || c.y > v.y1 + 60) continue;
      var bucket = Math.max(0, Math.min(BUCKETS - 1, Math.floor((c.hue - hMin) / hSpan * BUCKETS)));
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
    for (b = 0; b < BUCKETS; b++) {
      var hue = Math.round(hMin + (b + 0.5) / BUCKETS * hSpan);
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
    var close = this._close || (this._close = []), dot = S.dot();
    detail.length = 0; legs.length = 0; close.length = 0;
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
      ctx.drawImage(S.glow(c.hue, 1, 0.58), c.x - g / 2, c.y - g / 2, g, g);
      if (c.radius * z < dotBelowPx && minBody <= 0) {             // tiny on screen: a white-hot point
        var d = R.creatureDotPx / z;
        ctx.globalAlpha = 0.95 * fade;
        ctx.drawImage(dot, c.x - d / 2, c.y - d / 2, d, d);
      } else detail.push(c);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!detail.length) return;

    // Legs go under the bodies.
    for (i = 0; i < detail.length; i++) if (detail[i].radius * z >= R.legDetailPx) legs.push(detail[i]);
    if (legs.length) this.drawLegs(ctx, cam, legs);

    // Bodies: each sprite turned to face the bug's heading.
    var wt = this.wt, k0 = wt[0], scale = S.BODY_SIZE / S.BODY_R;
    for (i = 0; i < detail.length; i++) {
      c = detail[i];
      // Zoomed out, small bugs are drawn a little bigger than life so they still read as bugs, not dots
      // (babies a bit smaller than adults).
      var grown = c.radius / c.fullRadius, shown = Math.max(c.radius, minBody * (0.7 + 0.3 * grown));
      var s = shown * scale, ch = Math.cos(c.heading), sh = Math.sin(c.heading);
      ctx.setTransform(k0 * ch, k0 * sh, -k0 * sh, k0 * ch, wt[4] + k0 * c.x, wt[5] + k0 * c.y);
      ctx.globalAlpha = Math.min(1, (tick - c.bornTick) / 45);
      ctx.drawImage(S.bug(c.hue), -s / 2, -s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    this.setWorldTransform();

    // Close up: antennae and eyes.
    for (i = 0; i < detail.length; i++) if (detail[i].radius * z >= R.detailPx) close.push(detail[i]);
    if (close.length) { this.drawAntennae(ctx, cam, close); this.drawEyes(ctx, cam, close); }
  },

  // Six legs in a tripod gait (front-left, middle-right and back-left step together, then the
  // other three). The gait advances with the distance walked, so legs patter faster as a bug
  // walks faster and stand still when it stops.
  drawLegs: function (ctx, cam, list) {
    var C = GL.Config, R = C.render, z = cam.zoom, dt = Math.min(0.05, this._lastDt || 0.016);
    var LEGS = GL.Renderer.LEGS, TAU = GL.M.TAU, reach = R.legLength;
    var BUCKETS = 6, hMin = C.plantHueMin, hSpan = C.plantHueMax - hMin + 0.01;
    var TIERS = 3, tierAlpha = [0.3, 0.58, 0.85];                // legs fade in as a bug gets bigger on screen
    var paths = this._legPaths || (this._legPaths = []), widths = this._legWidths || (this._legWidths = []);
    for (var b = 0; b < BUCKETS * TIERS; b++) { paths[b] = null; widths[b] = 0; }
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
      var bucket = Math.max(0, Math.min(BUCKETS - 1, Math.floor((c.hue - hMin) / hSpan * BUCKETS))) * TIERS + tier;
      var p = paths[bucket] || (paths[bucket] = new Path2D());
      var lw = Math.max(0.9 / z, r * 0.075);
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
    for (b = 0; b < BUCKETS * TIERS; b++) {
      if (!paths[b]) continue;
      var hue = Math.round(hMin + (Math.floor(b / TIERS) + 0.5) / BUCKETS * hSpan);
      ctx.strokeStyle = 'hsla(' + hue + ',85%,60%,' + tierAlpha[b % TIERS] + ')';
      ctx.lineWidth = widths[b];
      ctx.stroke(paths[b]);
    }
  },

  // Two short antennae that twitch, and lean toward the food the bug is looking at.
  drawAntennae: function (ctx, cam, list) {
    var R = GL.Config.render, z = cam.zoom, t = this.reducedMotion ? 0 : this.time;
    ctx.lineCap = 'round';
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = this.fxOf(c), r = c.radius, len = R.antennaLength * r;
      var ch = Math.cos(c.heading), sh = Math.sin(c.heading);
      var lean = c.lookAmount > 0 ? Math.max(-0.6, Math.min(0.6, c.lookAngle)) * 0.5 : 0;
      ctx.beginPath();
      for (var side = -1; side <= 1; side += 2) {
        var wig = 0.12 * Math.sin(t * 4.3 + fx.ant + side * 1.3) + 0.05 * Math.sin(t * 11 + fx.ant * 2);
        var a = side * 0.42 + lean + wig;
        var bx = 1.04 * r, by = side * 0.1 * r;
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
  drawEyes: function (ctx, cam, list) {
    var whites = new Path2D(), pupils = new Path2D(), HEAD = GL.Sprites.HEAD;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = this.fxOf(c), r = c.radius, h = c.heading;
      var look = c.lookAmount > 0 ? c.lookAngle : 0, tx = Math.cos(h + look), ty = Math.sin(h + look);
      fx.px += (tx - fx.px) * 0.15; fx.py += (ty - fx.py) * 0.15;
      var ch = Math.cos(h), sh = Math.sin(h), er = r * 0.17;
      for (var side = -1; side <= 1; side += 2) {
        var lx = (HEAD.x + 0.08) * r, ly = side * 0.2 * r;
        var ex = c.x + lx * ch - ly * sh, ey = c.y + lx * sh + ly * ch;
        whites.moveTo(ex + er, ey); whites.arc(ex, ey, er, 0, GL.M.TAU);
        var px = ex + fx.px * er * 0.45, py = ey + fx.py * er * 0.45, pr = er * 0.55;
        pupils.moveTo(px + pr, py); pupils.arc(px, py, pr, 0, GL.M.TAU);
      }
    }
    ctx.fillStyle = 'rgba(225, 245, 255, 0.95)'; ctx.fill(whites);
    ctx.fillStyle = '#050B18'; ctx.fill(pupils);
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
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(34, 229, 255, 0.85)';
    ctx.lineWidth = 1.6 / z;
    for (var k = 0; k < 4; k++) {                       // four rotating brackets
      var a = t * 0.8 + k * Math.PI / 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, a, a + 0.9); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(34, 229, 255,' + (0.18 + 0.12 * Math.sin(t * 3)) + ')';
    ctx.beginPath(); ctx.arc(c.x, c.y, r * 1.25, 0, M.TAU); ctx.stroke();
    if (this.debug) this.drawViewSlices(ctx, cam, c);
    else this.drawViewCone(ctx, cam, c);
    ctx.globalCompositeOperation = 'source-over';
  },

  // The selected bug's field of view, faint on the soil; slices that see food glow green
  // (the same picture as the radar in the inspector).
  drawViewCone: function (ctx, cam, c) {
    var R = GL.Config.render, IN = GL.Brain.IN, half = c.fov / 2, w = c.fov / 5, gain = GL.Config.foodSenseGain;
    for (var s = 0; s < 5; s++) {
      var a0 = c.heading - half + s * w, f = c.inputs[IN.FOOD + s] / gain;
      if (f <= 0.01) continue;
      ctx.fillStyle = 'rgba(102, 221, 79,' + (R.viewConeFoodAlpha * f) + ')';
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.sight, a0, a0 + w); ctx.closePath(); ctx.fill();
    }
    var g = ctx.createRadialGradient(c.x, c.y, c.radius, c.x, c.y, c.sight);
    g.addColorStop(0, 'rgba(34, 229, 255,' + R.viewConeAlpha + ')'); g.addColorStop(1, 'rgba(34, 229, 255, 0)');
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
      ctx.fillStyle = 'rgba(102, 221, 79,' + (0.04 + food * 0.25) + ')';
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.sight, a0, a0 + w); ctx.closePath(); ctx.fill();
      if (cre > 0) {
        ctx.strokeStyle = 'rgba(255, 176, 32,' + (0.2 + cre * 0.5) + ')';
        ctx.lineWidth = 2 / cam.zoom;
        ctx.beginPath(); ctx.arc(c.x, c.y, c.sight * (1 - cre), a0, a0 + w); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(140, 200, 255, 0.35)'; ctx.lineWidth = 1 / cam.zoom;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.sight, c.heading - half, c.heading + half); ctx.closePath(); ctx.stroke();
  }
};
