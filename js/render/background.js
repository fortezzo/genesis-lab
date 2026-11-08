// Genesis Lab - drawing: the terrarium and the lab around it.
// Back to front: the dim navy lab bench, the terrarium's shadow on it, the soil
// and moss floor (painted once into a texture), fine soil grain when zoomed in,
// the nutrient pads and the warm pools of heat-lamp light with a gentle shimmer,
// the shadow where the glass wall meets the soil and the measuring grid etched
// on the glass. Over the creatures: the glass wall with its rim and highlight,
// dust motes floating in the lamp light at two depths, and a vignette.
var GL = GL || {};

GL.Background = function () {
  var R = GL.Config.render;
  this.far = this.makeMotes(R.motesFar, 0.7, 2.0, 0.45, 0.95);
  this.near = this.makeMotes(R.motesNear, 2.4, 6.0, 0.16, 0.38);
  this.prevX = null; this.prevY = null;
  this.time = 0;
  this.vignette = null; this.vigW = 0; this.vigH = 0;
  this.soil = null; this.soilSeed = -1;     // the painted floor texture, made for each world's seed...
  this.soilFar = null;                      // ...and a softer, darker version for the whole-terrarium view
  this.grain = null; this.grainPattern = null; this.grainMatrix = null;
};

GL.Background.prototype = {
  // ------------------------------------------------------------ dust motes
  makeMotes: function (n, sizeMin, sizeMax, aMin, aMax) {
    var d = { n: n, x: new Float32Array(n), y: new Float32Array(n), s: new Float32Array(n),
              a: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), ph: new Float32Array(n) };
    for (var i = 0; i < n; i++) {
      d.x[i] = Math.random(); d.y[i] = Math.random();               // 0..1 across the screen
      d.s[i] = sizeMin + Math.random() * (sizeMax - sizeMin);
      d.a[i] = aMin + Math.random() * (aMax - aMin);
      d.vx[i] = (Math.random() - 0.5) * 5; d.vy[i] = (Math.random() - 0.5) * 5;   // pixels per second
      d.ph[i] = Math.random() * GL.M.TAU;
    }
    return d;
  },

  // Motes live in screen space and shift with the camera by a parallax factor.
  update: function (cam, dt) {
    this.time += dt;
    if (this.prevX === null) { this.prevX = cam.x; this.prevY = cam.y; }
    var mx = (cam.x - this.prevX) * cam.zoom, my = (cam.y - this.prevY) * cam.zoom;
    this.prevX = cam.x; this.prevY = cam.y;
    var R = GL.Config.render;
    this.moveMotes(this.far, cam, -mx * R.motesFarParallax, -my * R.motesFarParallax, dt);
    this.moveMotes(this.near, cam, -mx * R.motesNearParallax, -my * R.motesNearParallax, dt);
  },
  moveMotes: function (d, cam, dx, dy, dt) {
    var w = cam.w + 40, h = cam.h + 40, t = this.time;
    for (var i = 0; i < d.n; i++) {
      // A slow drift plus a lazy wobble, like dust hanging in warm air.
      var wob = Math.sin(t * 0.35 + d.ph[i] * 3) * 2.5;
      var x = d.x[i] * w + dx + (d.vx[i] + wob) * dt, y = d.y[i] * h + dy + (d.vy[i] - 1.2) * dt;
      x = ((x % w) + w) % w; y = ((y % h) + h) % h;
      d.x[i] = x / w; d.y[i] = y / h;
    }
  },
  // How much heat-lamp light falls on a world point (about 0 in the dark, 1+ under a lamp).
  lightAt: function (world, x, y) {
    var lamps = world.lamps, sigma = GL.Config.lampSpread * 0.6, k = 1 / (2 * sigma * sigma), L = 0;
    for (var i = 0; i < lamps.length; i++) {
      var dx = x - lamps[i].x, dy = y - lamps[i].y;
      L += lamps[i].strength * Math.exp(-(dx * dx + dy * dy) * k);
    }
    return L;
  },
  drawMotes: function (ctx, cam, world, which, quality) {
    var d = which === 'near' ? this.near : this.far, img = GL.Sprites.mote(), R = GL.Config.render;
    var w = cam.w + 40, h = cam.h + 40, n = Math.floor(d.n * quality.motes), t = this.time;
    var dark = R.moteDarkShare, R2 = GL.Config.terrariumRadius * GL.Config.terrariumRadius;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) {
      var sx = d.x[i] * w - 20, sy = d.y[i] * h - 20;
      var wx = cam.screenToWorldX(sx), wy = cam.screenToWorldY(sy);
      var light = wx * wx + wy * wy < R2 ? Math.min(1, this.lightAt(world, wx, wy)) : 0;
      var a = d.a[i] * (dark + (1 - dark) * light) * (0.65 + 0.35 * Math.sin(t * 0.8 + d.ph[i]));
      if (a < 0.01) continue;
      var s = d.s[i] * 3;
      ctx.globalAlpha = a;
      ctx.drawImage(img, sx - s / 2, sy - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  // ------------------------------------------------------------- lab bench
  // Screen-space backdrop: the lab bench in dim light, a little lighter in the middle.
  drawBase: function (ctx, w, h) {
    var C = GL.Config.colors;
    var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, C.navyCenter);
    g.addColorStop(1, C.navyEdge);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },

  // ------------------------------------------------------------ the floor
  // World-space layers under the creatures (the context is already in world units).
  drawFloor: function (ctx, cam, world, quality, reducedMotion) {
    var C = GL.Config, R = C.terrariumRadius, RC = C.render, M = GL.M, z = cam.zoom, T = RC.glassThickness;
    if (this.soilSeed !== world.seed) {
      this.soil = this.buildSoil(world.seed, RC.soilTexturePx, false);
      this.soilFar = this.buildSoil(world.seed, RC.soilFarTexturePx, true);
      this.soilSeed = world.seed;
    }

    // The terrarium's soft shadow on the bench.
    var sh = ctx.createRadialGradient(0, 0, R + T * 0.6, 0, 0, R + T + 300);
    sh.addColorStop(0, 'rgba(0, 2, 8,' + RC.benchShadowAlpha + ')');
    sh.addColorStop(1, 'rgba(0, 2, 8, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.arc(0, 0, R + T + 300, 0, M.TAU); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, M.TAU); ctx.clip();

    // Soil and moss.
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.soil, -R, -R, R * 2, R * 2);
    // Zoomed out, the moss softens and darkens so it doesn't look like camouflage and the bugs stand out.
    // It blends into the detailed floor as you zoom in; medium and close-up views use the detailed floor.
    var far = 1 - M.smoothstep(RC.softMossZoomFull, RC.softMossZoomEnd, z);
    if (far > 0.01) {
      ctx.globalAlpha = far;
      ctx.drawImage(this.soilFar, -R, -R, R * 2, R * 2);
      ctx.globalAlpha = 1;
    }

    // Fine soil grain, fading in as you zoom closer.
    var grainA = RC.grainAlpha * M.smoothstep(RC.grainZoomStart, RC.grainZoomFull, z);
    if (grainA > 0.01) {
      if (!this.grainPattern) this.buildGrain(ctx);
      ctx.globalAlpha = grainA;
      ctx.fillStyle = this.grainPattern;
      var x0 = Math.max(-R, cam.screenToWorldX(0)), x1 = Math.min(R, cam.screenToWorldX(cam.w));
      var y0 = Math.max(-R, cam.screenToWorldY(0)), y1 = Math.min(R, cam.screenToWorldY(cam.h));
      if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
    }

    this.drawLamps(ctx, world, quality, reducedMotion);

    // The shadow where the glass wall meets the soil.
    var ws = ctx.createRadialGradient(0, 0, R * (1 - RC.wallShadow), 0, 0, R);
    ws.addColorStop(0, 'rgba(2, 4, 10, 0)');
    ws.addColorStop(0.7, 'rgba(2, 4, 10,' + (RC.wallShadowAlpha * 0.45) + ')');
    ws.addColorStop(1, 'rgba(2, 4, 10,' + RC.wallShadowAlpha + ')');
    ctx.fillStyle = ws;
    ctx.fillRect(-R, -R, R * 2, R * 2);

    this.drawGrid(ctx, cam);
    ctx.restore();
  },

  // Heat lamps: a dark nutrient pad under each, then warm light poured on top.
  // Lamps drift and wax and wane (that's the simulation); the shimmer is just for looks.
  drawLamps: function (ctx, world, quality, reducedMotion) {
    var C = GL.Config, RC = C.render, S = GL.Sprites, sp = C.lampSpread, lamps = world.lamps;
    var t = this.time, shimmerOn = quality.shimmer && !reducedMotion;
    var span = C.lampStrengthMax - C.lampStrengthMin;
    var pad = S.pad(), pool = S.lampPool(), core = S.lampCore();
    var i, v, norm, s;
    for (i = 0; i < lamps.length; i++) {
      v = lamps[i]; norm = (v.strength - C.lampStrengthMin) / span;
      s = sp * RC.padSize;
      ctx.globalAlpha = RC.padAlpha * (0.75 + 0.25 * norm);
      ctx.drawImage(pad, v.x - s / 2, v.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < lamps.length; i++) {
      v = lamps[i]; norm = (v.strength - C.lampStrengthMin) / span;
      var shim = shimmerOn ? 1 + RC.shimmerAmount * (0.6 * Math.sin(t * RC.shimmerSpeed + i * 1.7) +
                                                      0.4 * Math.sin(t * RC.shimmerSpeed * 2.6 + i * 4.1)) : 1;
      s = sp * RC.lampPoolSize * (0.85 + 0.25 * norm);
      ctx.globalAlpha = RC.lampAlpha * (0.45 + 0.55 * norm) * shim;
      ctx.drawImage(pool, v.x - s / 2, v.y - s / 2, s, s);
      s = sp * 0.9 * (0.9 + 0.2 * norm);
      ctx.globalAlpha = RC.lampCoreAlpha * (0.4 + 0.6 * norm) * shim;
      ctx.drawImage(core, v.x - s / 2, v.y - s / 2, s, s);
      if (shimmerOn) {
        // Heat shimmer: two soft lobes of light slowly circling inside the pool.
        for (var k = 0; k < 2; k++) {
          var a = t * RC.shimmerSpeed * 0.4 * (k ? -1.3 : 1) + i * 2.1 + k * 2.4, off = sp * 0.17;
          var ss = sp * (0.75 + 0.1 * Math.sin(t * 0.7 + k + i));
          ctx.globalAlpha = RC.lampCoreAlpha * 0.5 * (0.4 + 0.6 * norm) * (0.6 + 0.4 * Math.sin(t * RC.shimmerSpeed * 1.9 + k * 2 + i));
          ctx.drawImage(core, v.x + Math.cos(a) * off - ss / 2, v.y + Math.sin(a) * off - ss / 2, ss, ss);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  // A faint measuring grid, as if etched on the glass: lines, brighter every fifth, and a centre cross.
  drawGrid: function (ctx, cam) {
    var C = GL.Config, R = C.terrariumRadius, RC = C.render, z = cam.zoom;
    var step = this.gridStep(z);
    var vx0 = cam.screenToWorldX(0), vx1 = cam.screenToWorldX(cam.w);
    var vy0 = cam.screenToWorldY(0), vy1 = cam.screenToWorldY(cam.h);
    var x0 = Math.max(-R, Math.floor(vx0 / step) * step), x1 = Math.min(R, vx1);
    var y0 = Math.max(-R, Math.floor(vy0 / step) * step), y1 = Math.min(R, vy1);
    ctx.lineWidth = 1 / z;
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (var gx = x0; gx <= x1; gx += step) {
        var major = Math.round(gx / step) % 5 === 0;
        if (major !== (pass === 1)) continue;
        ctx.moveTo(gx, Math.max(-R, vy0)); ctx.lineTo(gx, Math.min(R, vy1));
      }
      for (var gy = y0; gy <= y1; gy += step) {
        major = Math.round(gy / step) % 5 === 0;
        if (major !== (pass === 1)) continue;
        ctx.moveTo(Math.max(-R, vx0), gy); ctx.lineTo(Math.min(R, vx1), gy);
      }
      ctx.strokeStyle = 'rgba(190, 215, 240,' + (RC.gridAlpha * (pass ? 1.8 : 1)) + ')';
      ctx.stroke();
    }
    ctx.beginPath();                                   // centre cross with tick marks
    ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.moveTo(0, -R); ctx.lineTo(0, R);
    var tick = 6 / z;
    for (var p = Math.ceil(-R / step) * step; p <= R; p += step) {
      ctx.moveTo(p, -tick); ctx.lineTo(p, tick); ctx.moveTo(-tick, p); ctx.lineTo(tick, p);
    }
    ctx.strokeStyle = 'rgba(190, 215, 240,' + (RC.gridAlpha * 2.4) + ')';
    ctx.stroke();
  },

  // Grid spacing in world units: a round number (1, 2 or 5 x 10^n) about 120 pixels apart.
  gridStep: function (zoom) {
    var target = 120 / zoom, p = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));
    var steps = [1, 2, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= target) return steps[i] * p;
    return 10 * p;
  },

  // ------------------------------------------------------------ the glass
  // Drawn over the creatures: the glass wall's thickness, its rim lines, a soft
  // highlight where the room light catches it, and a faint reflection on the lid.
  drawGlass: function (ctx, cam) {
    var C = GL.Config, R = C.terrariumRadius, RC = C.render, T = RC.glassThickness, z = cam.zoom, M = GL.M;
    ctx.fillStyle = 'rgba(150, 200, 245,' + RC.glassAlpha + ')';
    ctx.beginPath(); ctx.arc(0, 0, R + T, 0, M.TAU); ctx.arc(0, 0, R, 0, M.TAU, true); ctx.fill();

    if (RC.lidSheenAlpha > 0) {                          // a faint diagonal reflection across the lid
      var g = ctx.createLinearGradient(-R, -R, R, R), a = RC.lidSheenAlpha;
      g.addColorStop(0, 'rgba(200, 225, 255, 0)');
      g.addColorStop(0.3, 'rgba(200, 225, 255,' + a + ')');
      g.addColorStop(0.4, 'rgba(200, 225, 255, 0)');
      g.addColorStop(0.47, 'rgba(200, 225, 255,' + (a * 0.5) + ')');
      g.addColorStop(0.52, 'rgba(200, 225, 255, 0)');
      g.addColorStop(1, 'rgba(200, 225, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, M.TAU); ctx.fill();
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.5 / z;
    ctx.strokeStyle = 'rgba(170, 225, 255, 0.40)';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, M.TAU); ctx.stroke();
    ctx.lineWidth = 1 / z;
    ctx.strokeStyle = 'rgba(170, 225, 255, 0.22)';
    ctx.beginPath(); ctx.arc(0, 0, R + T, 0, M.TAU); ctx.stroke();
    // Highlights: tapered arcs (brightest in the middle) on the upper left, and a dimmer one on the lower right.
    ctx.lineCap = 'butt';
    this.highlightArc(ctx, R + T * 0.5, -2.75, -1.15, T * 0.7, RC.glassHighlightAlpha * 0.5);
    this.highlightArc(ctx, R + T * 0.38, -2.45, -1.6, Math.max(1.6 / z, T * 0.16), RC.glassHighlightAlpha);
    this.highlightArc(ctx, R + T * 0.5, 0.35, 1.15, T * 0.5, RC.glassHighlightAlpha * 0.28);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
  highlightArc: function (ctx, radius, a0, a1, width, alpha) {
    var n = 14, step = (a1 - a0) / n;
    ctx.lineWidth = width;
    ctx.strokeStyle = 'rgb(255, 255, 255)';
    for (var i = 0; i < n; i++) {
      var u = (i + 0.5) / n;
      ctx.globalAlpha = alpha * Math.sin(Math.PI * u);
      ctx.beginPath(); ctx.arc(0, 0, radius, a0 + i * step, a0 + (i + 1) * step + step * 0.02); ctx.stroke();
    }
  },

  // Dark edges, like a dim lab with one pool of light on the bench.
  drawVignette: function (ctx, w, h) {
    if (!this.vignette || this.vigW !== w || this.vigH !== h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, 'rgba(2, 5, 12, 0)');
      g.addColorStop(1, 'rgba(2, 5, 12, 0.72)');
      this.vignette = g; this.vigW = w; this.vigH = h;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, w, h);
  },

  // ------------------------------------------------- painting the soil once
  // Dark soil with patches of moss, all tinted toward the navy palette. Each world
  // seed gets its own layout. Uses its own random numbers, never the simulation's.
  // soft = the whole-terrarium version: blurrier, darker, lower-contrast moss and no fine speckle.
  buildSoil: function (seed, size, soft) {
    var C = GL.Config, R = C.terrariumRadius, RC = C.render, col = C.colors, M = GL.M;
    var S = size, grit = soft ? 0 : 1, mossEdge = soft ? RC.softMossEdge : 0.07, mossBlend = soft ? RC.softMossBlend : 0.9;
    var noise = new GL.Noise(new GL.RNG((seed ^ 0x50111) >>> 0));
    var hseed = (seed * 2654435761) | 0;

    // Two grids of smooth noise: big moss patches, and medium soil clumps.
    function fbmGrid(n, freq, octaves, zOff) {
      var g = new Float32Array(n * n), step = 2 * R / (n - 1);
      for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
        var x = -R + i * step, y = -R + j * step, v = 0, amp = 1, f = freq, norm = 0;
        for (var o = 0; o < octaves; o++) {
          v += amp * noise.noise3(x * f, y * f, zOff + o * 7.7); norm += amp; amp *= 0.5; f *= 2.03;
        }
        g[j * n + i] = v / norm;
      }
      return g;
    }
    var N1 = 97, N2 = 321;
    var big = fbmGrid(N1, 1 / 650, 4, 0.37), mid = fbmGrid(N2, 1 / 95, 3, 19.3);
    function sample(g, n, x, y) {
      var f = (n - 1) / (2 * R), fx = (x + R) * f, fy = (y + R) * f;
      var i = fx | 0, j = fy | 0; if (i > n - 2) i = n - 2; if (j > n - 2) j = n - 2;
      var tx = fx - i, ty = fy - j, a = j * n + i;
      var top = g[a] + (g[a + 1] - g[a]) * tx, bot = g[a + n] + (g[a + n + 1] - g[a + n]) * tx;
      return top + (bot - top) * ty;
    }
    function hash(i, j, k) {
      var h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647) + hseed) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }

    // Choose the moss threshold so moss covers about mossCover of the floor.
    var vals = [];
    for (var sy = -R; sy <= R; sy += 40) for (var sx = -R; sx <= R; sx += 40) {
      if (sx * sx + sy * sy < R * R) vals.push(sample(big, N1, sx, sy) + 0.4 * sample(mid, N2, sx, sy));
    }
    vals.sort(function (a, b) { return a - b; });
    var thr = vals[Math.floor(vals.length * (1 - RC.mossCover))];

    var soilD = M.hexToRgb(col.soilDark), soilM = M.hexToRgb(col.soil), soilL = M.hexToRgb(col.soilLight);
    var mossD = M.hexToRgb(col.mossDark), mossM = M.hexToRgb(col.moss), mossL = M.hexToRgb(col.mossLight);
    function tri(a, b, c, t, k) {          // blend dark -> mid -> light by t (0..1), channel k
      return t < 0.5 ? a[k] + (b[k] - a[k]) * t * 2 : b[k] + (c[k] - b[k]) * (t - 0.5) * 2;
    }

    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    var g = canvas.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    var upp = 2 * R / S, R2 = (R + upp * 2) * (R + upp * 2);
    for (var py = 0; py < S; py++) {
      var y = -R + (py + 0.5) * upp;
      for (var px = 0; px < S; px++) {
        var x = -R + (px + 0.5) * upp, o = (py * S + px) * 4;
        if (x * x + y * y > R2) { d[o + 3] = 0; continue; }
        var b = sample(big, N1, x, y), m = sample(mid, N2, x, y);
        var h1 = hash(px, py, 1), h2 = hash(px, py, 2), h3 = hash(px, py, 3);
        // Soil: clumps from the medium noise, plus a little per-pixel grit.
        var tone = M.clamp(0.5 + m * 0.9 + (h1 - 0.5) * 0.16 * grit, 0, 1);
        if (m < -0.24) tone *= 0.78;                                 // cracks between clumps
        var moss = M.smoothstep(thr - mossEdge, thr + mossEdge + 0.02, b + 0.4 * m + (h2 - 0.5) * 0.04 * grit);
        // Moss: speckled cushions, a touch brighter on their edges and tops.
        var mt = soft ? M.clamp(0.3 + m * 0.5, 0, 1) : M.clamp(0.38 + h2 * 0.24 + m * 1.1 + moss * (1 - moss) * 1.0, 0, 1);
        for (var k = 0; k < 3; k++) {
          var sc = tri(soilD, soilM, soilL, tone, k), mc = tri(mossD, mossM, mossL, mt, k);
          var v = sc + (mc - sc) * moss * mossBlend;
          if (grit && h3 > 0.9965) v = v * 1.5 + 14;                  // a tiny pebble catching the light
          else if (grit && h3 < 0.03) v *= 0.72;                        // a dark crumb
          d[o + k] = v;
        }
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return canvas;
  },

  // Fine soil grain for close-ups: specks and tiny pebbles in a tile that repeats seamlessly.
  buildGrain: function (ctx) {
    var T = 256, c = document.createElement('canvas'); c.width = c.height = T;
    var g = c.getContext('2d'), img = g.createImageData(T, T), d = img.data;
    var rng = new GL.RNG(7331);
    for (var i = 0; i < T * T; i++) {
      var r = rng.next(), o = i * 4;
      if (r < 0.012) { d[o] = 120; d[o + 1] = 118; d[o + 2] = 132; d[o + 3] = 20 + rng.next() * 30; }   // light grit
      else if (r < 0.10) { d[o] = 0; d[o + 1] = 1; d[o + 2] = 6; d[o + 3] = 45 + rng.next() * 60; }     // dark grit
    }
    g.putImageData(img, 0, 0);
    // Wrap each blob around the tile edges, so the tile repeats without seams.
    function blob(px, py, pr, draw) {
      for (var ox = -T; ox <= T; ox += T) for (var oy = -T; oy <= T; oy += T) {
        var x = px + ox, y = py + oy;
        if (x < -pr * 2 || x > T + pr * 2 || y < -pr * 2 || y > T + pr * 2) continue;
        draw(x, y, pr);
      }
    }
    // Soft dark clods and damp patches, so the soil isn't perfectly even.
    for (var q = 0; q < 14; q++) {
      blob(rng.next() * T, rng.next() * T, 6 + rng.next() * 14, function (x, y, pr) {
        var gr = g.createRadialGradient(x, y, 0, x, y, pr);
        gr.addColorStop(0, 'rgba(0, 1, 6, 0.22)'); gr.addColorStop(1, 'rgba(0, 1, 6, 0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, pr, 0, GL.M.TAU); g.fill();
      });
    }
    // Tiny pebbles: a shadow, a body and a lit top, in warm greys.
    for (var p = 0; p < 34; p++) {
      var tone = 70 + rng.next() * 55, warm = rng.next() * 12;
      blob(rng.next() * T, rng.next() * T, 1.1 + rng.next() * rng.next() * 4.5, function (x, y, pr) {
        g.fillStyle = 'rgba(0, 1, 6, 0.5)'; g.beginPath(); g.arc(x + pr * 0.4, y + pr * 0.4, pr * 1.05, 0, GL.M.TAU); g.fill();
        g.fillStyle = 'rgba(' + Math.round(tone + warm) + ',' + Math.round(tone + warm * 0.4) + ',' + Math.round(tone * 1.05) + ', 0.42)';
        g.beginPath(); g.arc(x, y, pr, 0, GL.M.TAU); g.fill();
        g.fillStyle = 'rgba(210, 205, 215, 0.16)'; g.beginPath(); g.arc(x - pr * 0.3, y - pr * 0.3, pr * 0.42, 0, GL.M.TAU); g.fill();
      });
    }
    this.grain = c;
    this.grainPattern = ctx.createPattern(c, 'repeat');
    var s = GL.Config.render.grainTileUnits / T;              // tile pixels -> world units
    if (this.grainPattern.setTransform && typeof DOMMatrix !== 'undefined') {
      this.grainPattern.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    }
  }
};
