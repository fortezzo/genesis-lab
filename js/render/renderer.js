// Genesis Lab - drawing: the renderer. All drawing happens here; it only READS
// the simulation. Layers, back to front: backdrop, dish (vents, light patterns,
// reticle, rim), far dust, algae, light trails, creatures (glow, body, tail,
// eyes), effects, near dust, vignette. Only what is on screen gets drawn.
var GL = GL || {};

GL.Renderer = function (canvas, world) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d', { alpha: false });
  this.world = world;
  this.camera = new GL.Camera();
  this.background = new GL.Background();
  this.effects = new GL.Effects();
  this.dpr = 1;
  this.time = 0;                  // real seconds since start (for pulses and waves)
  this.selected = null;           // the selected creature, if any
  this.selectedId = 0;
  this.debug = false;
  this.reducedMotion = false;     // Session 4 adds the setting
  this.quality = { level: 2, trails: 1, particles: 1, dust: 1, caustics: true };
  this.lowFpsTime = 0; this.highFpsTime = 0;
  this.view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  this.resize(true);
};

GL.Renderer.prototype = {
  resize: function (first) {
    var w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, GL.Config.render.maxPixelRatio);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.resize(w, h, first === true);
  },

  setWorld: function (world) {
    this.world = world; this.effects.lastSeq = 0; this.effects.count = 0;
    this.select(null);
  },

  select: function (c) {
    this.selected = c; this.selectedId = c ? c.id : 0;
    if (c) this.camera.startFollowing(c); else this.camera.stopFollowing();
  },
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
  adaptQuality: function (fps, dt) {
    var R = GL.Config.render, q = this.quality;
    if (fps < R.lowFpsThreshold) { this.lowFpsTime += dt; this.highFpsTime = 0; }
    else if (fps > 57) { this.highFpsTime += dt; this.lowFpsTime = 0; }
    else { this.lowFpsTime = 0; this.highFpsTime = 0; }
    if (this.lowFpsTime > R.lowFpsSeconds && q.level > 0) { q.level--; this.lowFpsTime = 0; }
    if (this.highFpsTime > 10 && q.level < 2) { q.level++; this.highFpsTime = 0; }
    q.trails = [0, 0.5, 1][q.level];
    q.particles = [0.3, 0.6, 1][q.level];
    q.dust = [0.4, 0.7, 1][q.level];
    q.caustics = q.level > 0;
  },

  draw: function (dt, fps) {
    var ctx = this.ctx, cam = this.camera, world = this.world, dpr = this.dpr;
    this.time += dt;
    this._lastDt = dt;
    this.adaptQuality(fps || 60, dt);
    this.getSelected();
    cam.update(dt, this.reducedMotion);
    this.background.updateDust(cam, dt);

    var w = cam.w, h = cam.h, z = cam.zoom, v = this.view, pad = 60 / z + 40;
    v.x0 = cam.screenToWorldX(0) - pad; v.x1 = cam.screenToWorldX(w) + pad;
    v.y0 = cam.screenToWorldY(0) - pad; v.y1 = cam.screenToWorldY(h) + pad;
    this.effects.consume(world.events, this.quality, v);
    this.effects.update(dt);

    // Screen-space backdrop.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.background.drawBase(ctx, w, h);

    // World space.
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));
    this.background.drawDish(ctx, cam, world, this.quality);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background.drawDust(ctx, cam, 'far', this.quality);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));
    this.drawAlgae(ctx, cam);
    if (this.quality.trails > 0 && !this.reducedMotion) this.drawTrails(ctx, cam);
    this.drawCreatures(ctx, cam);
    this.effects.draw(ctx, cam);
    var sel = this.getSelected();
    if (sel) this.drawSelection(ctx, cam, sel);

    // Screen space again.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background.drawDust(ctx, cam, 'near', this.quality);
    this.background.drawVignette(ctx, w, h);
  },

  drawAlgae: function (ctx, cam) {
    var food = this.world.food, C = GL.Config, R = C.render, v = this.view, z = cam.zoom;
    var img = GL.Sprites.algae(), t = this.time * R.algaeBreathSpeed, amt = R.algaeBreathAmount;
    var base = C.algaeRadius * R.algaeGlow * 2, minS = 3 / z, maxAge = C.algaeMaxAge;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < food.count; i++) {
      if (!food.alive[i]) continue;
      var x = food.x[i], y = food.y[i];
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      var age = food.age[i], fade = age < 0.8 ? age / 0.8 : 1;
      if (maxAge - age < 3) fade *= (maxAge - age) / 3;
      var breath = Math.sin(t + food.phase[i]);
      var s = Math.max(base * (1 + amt * breath), minS);
      ctx.globalAlpha = R.algaeGlowAlpha * fade * (0.8 + 0.2 * breath);
      ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  // Per-creature drawing state lives on the creature in a private slot the simulation never reads.
  fxOf: function (c) {
    var fx = c.fx, n = GL.Config.render.trailPoints;
    if (!fx) fx = c.fx = { id: -1, tx: new Float32Array(n), ty: new Float32Array(n), head: 0, count: 0,
                           tail: 0, px: 0, py: 0 };
    if (fx.id !== c.id) {                      // a pooled creature object reused for a new life
      fx.id = c.id; fx.head = 0; fx.count = 0; fx.tail = Math.random() * 6; fx.px = 0; fx.py = 0;
      fx.tx[0] = c.x; fx.ty[0] = c.y; fx.count = 1;
    }
    return fx;
  },

  drawTrails: function (ctx, cam) {
    var list = this.world.creatures, R = GL.Config.render, v = this.view, z = cam.zoom;
    var n = R.trailPoints, spacing = R.trailSpacing;
    var paths = this._trailPaths || (this._trailPaths = []);
    var BUCKETS = 6, hMin = GL.Config.plantHueMin, hSpan = GL.Config.plantHueMax - hMin + 0.01;
    for (var b = 0; b < BUCKETS * 3; b++) paths[b] = new Path2D();
    var used = n * this.quality.trails;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = this.fxOf(c);
      // Record a new trail point when the creature has moved far enough.
      var last = (fx.head + fx.count - 1) % n, dx = c.x - fx.tx[last], dy = c.y - fx.ty[last];
      if (dx * dx + dy * dy > spacing * spacing) {
        if (fx.count < n) fx.count++; else fx.head = (fx.head + 1) % n;
        last = (fx.head + fx.count - 1) % n;
        fx.tx[last] = c.x; fx.ty[last] = c.y;
      }
      if (c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1 || fx.count < 2 || c.speed < 4) continue;
      var bucket = Math.min(BUCKETS - 1, Math.floor((c.hue - hMin) / hSpan * BUCKETS));
      var start = Math.max(0, fx.count - used);
      var px = c.x, py = c.y, curTier = -1, p = null;
      for (var k = fx.count - 1; k >= start; k--) {     // from the newest point back to the oldest
        var idx = (fx.head + k) % n, tier = Math.min(2, Math.floor((fx.count - 1 - k) / (n / 3)));
        if (tier !== curTier) { curTier = tier; p = paths[bucket * 3 + tier]; p.moveTo(px, py); }
        p.lineTo(fx.tx[idx], fx.ty[idx]);              // one continuous line per fade step
        px = fx.tx[idx]; py = fx.ty[idx];
      }
    }
    // Thin streaks that fade in three steps. Butt ends, so the steps don't overlap into bright beads.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (b = 0; b < BUCKETS; b++) {
      var hue = Math.round(hMin + (b + 0.5) / BUCKETS * hSpan);
      for (var tier2 = 0; tier2 < 3; tier2++) {
        ctx.strokeStyle = 'hsla(' + hue + ',100%,68%,' + (R.trailAlpha * [1, 0.55, 0.25][tier2]) + ')';
        ctx.lineWidth = Math.min(R.trailWidth * [1, 0.75, 0.5][tier2], R.trailMaxPx / z);
        ctx.stroke(paths[b * 3 + tier2]);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  drawCreatures: function (ctx, cam) {
    var list = this.world.creatures, C = GL.Config, R = C.render, v = this.view, z = cam.zoom;
    var S = GL.Sprites, tick = this.world.tick, eatTicks = R.eatFlashTime * C.ticksPerSecond;
    var detail = this._detail || (this._detail = []), close = this._close || (this._close = []), dot = S.dot();
    detail.length = 0; close.length = 0;
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
      if (c.radius * z < 1.3) {                                     // tiny on screen: a bright point is enough
        var d = 3.2 / z;
        ctx.globalAlpha = 0.9 * fade;
        ctx.drawImage(dot, c.x - d / 2, c.y - d / 2, d, d);
      } else detail.push(c);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Bodies.
    var scale = S.BODY_SIZE / S.BODY_R;
    for (i = 0; i < detail.length; i++) {
      c = detail[i];
      fade = Math.min(1, (tick - c.bornTick) / 45);
      var s = c.radius * scale;
      ctx.globalAlpha = fade;
      ctx.drawImage(S.body(c.hue), c.x - s / 2, c.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // Close up: tails (flagella) and eyes.
    for (i = 0; i < detail.length; i++) if (detail[i].radius * z >= R.detailPx) close.push(detail[i]);
    if (close.length) { this.drawTails(ctx, cam, close); this.drawEyes(ctx, cam, close); }
  },

  drawTails: function (ctx, cam, list) {
    var R = GL.Config.render, dt = Math.min(0.05, this._lastDt || 0.016), z = cam.zoom;
    if (this.reducedMotion) dt = 0;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = this.fxOf(c), r = c.radius;
      var sp = c.topSpeed > 0 ? Math.min(1, c.speed / c.topSpeed) : 0;
      fx.tail += (R.tailWaveMin + (R.tailWaveMax - R.tailWaveMin) * sp) * dt;   // waves faster when swimming fast
      var hx = Math.cos(c.heading), hy = Math.sin(c.heading), len = r * R.tailLength;
      var bx = c.x - hx * r * 0.92, by = c.y - hy * r * 0.92;
      ctx.beginPath(); ctx.moveTo(bx, by);
      for (var k = 1; k <= 7; k++) {
        var t = k / 7, wave = Math.sin(fx.tail - t * 5) * r * 0.32 * t;
        ctx.lineTo(bx - hx * len * t - hy * wave, by - hy * len * t + hx * wave);
      }
      ctx.strokeStyle = 'hsla(' + Math.round(c.hue) + ',100%,70%,0.6)';
      ctx.lineWidth = Math.max(1 / z, r * 0.16);
      ctx.stroke();
    }
  },

  drawEyes: function (ctx, cam, list) {
    var whites = new Path2D(), pupils = new Path2D();
    for (var i = 0; i < list.length; i++) {
      var c = list[i], fx = this.fxOf(c), r = c.radius, h = c.heading;
      // Pupils glance toward the food it is looking at (smoothed so they don't jitter).
      var look = c.lookAmount > 0 ? c.lookAngle : 0, tx = Math.cos(h + look), ty = Math.sin(h + look);
      fx.px += (tx - fx.px) * 0.15; fx.py += (ty - fx.py) * 0.15;
      for (var side = -1; side <= 1; side += 2) {
        var a = h + side * 0.55, ex = c.x + Math.cos(a) * r * 0.58, ey = c.y + Math.sin(a) * r * 0.58;
        var er = r * 0.25;
        whites.moveTo(ex + er, ey); whites.arc(ex, ey, er, 0, GL.M.TAU);
        var px = ex + fx.px * er * 0.45, py = ey + fx.py * er * 0.45, pr = er * 0.52;
        pupils.moveTo(px + pr, py); pupils.arc(px, py, pr, 0, GL.M.TAU);
      }
    }
    ctx.fillStyle = 'rgba(225, 245, 255, 0.95)'; ctx.fill(whites);
    ctx.fillStyle = '#050B18'; ctx.fill(pupils);
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
    ctx.globalCompositeOperation = 'source-over';
  },

  // Debug overlay: the selected creature's 5 view slices, shaded by what it sees.
  drawViewSlices: function (ctx, cam, c) {
    var IN = GL.Brain.IN, half = c.fov / 2, w = c.fov / 5;
    for (var s = 0; s < 5; s++) {
      var a0 = c.heading - half + s * w, food = c.inputs[IN.FOOD + s], cre = c.inputs[IN.CREATURE + s];
      ctx.fillStyle = 'rgba(57, 255, 136,' + (0.04 + food * 0.25) + ')';
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
