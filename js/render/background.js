// Genesis Lab - drawing: the world behind the creatures.
// Navy gradient, the glass dish, the vents as dim clouds, moving light patterns
// (caustics), the microscope reticle, two depths of drifting dust and a vignette.
var GL = GL || {};

GL.Background = function () {
  var R = GL.Config.render;
  this.far = this.makeDust(R.dustFar, 0.6, 1.8, 0.10, 0.32);
  this.near = this.makeDust(R.dustNear, 2.5, 6, 0.035, 0.09);
  this.prevX = null; this.prevY = null;
  this.time = 0;
  this.vignette = null; this.vigW = 0; this.vigH = 0;
};

GL.Background.prototype = {
  makeDust: function (n, sizeMin, sizeMax, aMin, aMax) {
    var d = { n: n, x: new Float32Array(n), y: new Float32Array(n), s: new Float32Array(n),
              a: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), ph: new Float32Array(n) };
    for (var i = 0; i < n; i++) {
      d.x[i] = Math.random(); d.y[i] = Math.random();               // 0..1 across the screen
      d.s[i] = sizeMin + Math.random() * (sizeMax - sizeMin);
      d.a[i] = aMin + Math.random() * (aMax - aMin);
      d.vx[i] = (Math.random() - 0.5) * 6; d.vy[i] = (Math.random() - 0.5) * 6;   // pixels per second
      d.ph[i] = Math.random() * GL.M.TAU;
    }
    return d;
  },

  // Screen-space backdrop: deep navy, a little lighter in the middle.
  drawBase: function (ctx, w, h) {
    var C = GL.Config.colors;
    var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, C.navyCenter);
    g.addColorStop(1, C.navyEdge);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },

  // World-space layers (the context is already in world units).
  drawDish: function (ctx, cam, world, quality) {
    var C = GL.Config, R = C.dishRadius, RC = C.render, M = GL.M, z = cam.zoom;
    var t = this.time;

    // The dish interior: a faint glow of water.
    var g = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
    g.addColorStop(0, 'rgba(20, 50, 95, 0.55)');
    g.addColorStop(0.75, 'rgba(12, 32, 66, 0.45)');
    g.addColorStop(1, 'rgba(8, 22, 48, 0.25)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, M.TAU); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, M.TAU); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';

    // Vents: slowly churning clouds of green-cyan light.
    var vg = GL.Sprites.glow(160, 0.9, 0.5);
    for (var i = 0; i < world.vents.length; i++) {
      var v = world.vents[i], size = C.ventSpread * 2.2;
      for (var k = 0; k < 3; k++) {
        var a = t * 0.05 * (k + 1) + i * 2.1 + k * 2.09, off = C.ventSpread * 0.28;
        ctx.globalAlpha = RC.ventAlpha * v.strength * (0.8 + 0.2 * Math.sin(t * 0.4 + k + i));
        var s = size * (0.75 + 0.15 * k);
        ctx.drawImage(vg, v.x + Math.cos(a) * off - s / 2, v.y + Math.sin(a) * off - s / 2, s, s);
      }
    }

    // Caustics: two layers of light patterns drifting in different directions.
    if (quality.caustics) {
      var tile = GL.Sprites.caustics(3.0), tileB = GL.Sprites.caustics(7.5);
      this.drawTiles(ctx, cam, tile, RC.causticsTile, t * RC.causticsSpeed, t * RC.causticsSpeed * 0.6, RC.causticsAlpha);
      this.drawTiles(ctx, cam, tileB, RC.causticsTile * 1.7, -t * RC.causticsSpeed * 0.7, t * RC.causticsSpeed * 0.4, RC.causticsAlpha * 0.8);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Microscope reticle: grid lines, brighter every fifth, and a crosshair.
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
      ctx.strokeStyle = 'rgba(140, 200, 255,' + (RC.reticleAlpha * (pass ? 1.8 : 1)) + ')';
      ctx.stroke();
    }
    // Crosshair with tick marks.
    ctx.beginPath();
    ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.moveTo(0, -R); ctx.lineTo(0, R);
    var tick = 6 / z;
    for (var p = Math.ceil(-R / step) * step; p <= R; p += step) {
      ctx.moveTo(p, -tick); ctx.lineTo(p, tick); ctx.moveTo(-tick, p); ctx.lineTo(tick, p);
    }
    ctx.strokeStyle = 'rgba(140, 200, 255,' + (RC.reticleAlpha * 2.6) + ')';
    ctx.stroke();
    ctx.restore();

    // The glass rim: a wide faint glow and a crisp cyan line.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(34, 229, 255, 0.07)';
    ctx.lineWidth = 14 / z;
    ctx.beginPath(); ctx.arc(0, 0, R + 4 / z, 0, M.TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.45)';
    ctx.lineWidth = 1.5 / z;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, M.TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  },

  // Grid spacing in world units: a round number (1, 2 or 5 x 10^n) about 120 pixels apart.
  gridStep: function (zoom) {
    var target = 120 / zoom, p = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));
    var steps = [1, 2, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= target) return steps[i] * p;
    return 10 * p;
  },

  drawTiles: function (ctx, cam, img, tileSize, ox, oy, alpha) {
    var vx0 = cam.screenToWorldX(0), vx1 = cam.screenToWorldX(cam.w);
    var vy0 = cam.screenToWorldY(0), vy1 = cam.screenToWorldY(cam.h);
    var R = GL.Config.dishRadius;
    vx0 = Math.max(vx0, -R); vy0 = Math.max(vy0, -R); vx1 = Math.min(vx1, R); vy1 = Math.min(vy1, R);
    var sx = Math.floor((vx0 - ox) / tileSize) * tileSize + ox;
    var sy = Math.floor((vy0 - oy) / tileSize) * tileSize + oy;
    ctx.globalAlpha = alpha;
    for (var x = sx; x < vx1; x += tileSize) {
      for (var y = sy; y < vy1; y += tileSize) ctx.drawImage(img, x, y, tileSize + 1 / cam.zoom, tileSize + 1 / cam.zoom);
    }
  },

  // Dust specks in screen space. They shift with the camera by a parallax factor.
  updateDust: function (cam, dt) {
    this.time += dt;
    if (this.prevX === null) { this.prevX = cam.x; this.prevY = cam.y; }
    var mx = (cam.x - this.prevX) * cam.zoom, my = (cam.y - this.prevY) * cam.zoom;
    this.prevX = cam.x; this.prevY = cam.y;
    var R = GL.Config.render;
    this.moveDust(this.far, cam, -mx * R.dustFarParallax, -my * R.dustFarParallax, dt);
    this.moveDust(this.near, cam, -mx * R.dustNearParallax, -my * R.dustNearParallax, dt);
  },
  moveDust: function (d, cam, dx, dy, dt) {
    var w = cam.w + 40, h = cam.h + 40;
    for (var i = 0; i < d.n; i++) {
      var x = d.x[i] * w + dx + d.vx[i] * dt, y = d.y[i] * h + dy + d.vy[i] * dt;
      x = ((x % w) + w) % w; y = ((y % h) + h) % h;
      d.x[i] = x / w; d.y[i] = y / h;
    }
  },
  drawDust: function (ctx, cam, which, quality) {
    var d = which === 'near' ? this.near : this.far, img = GL.Sprites.dot();
    var w = cam.w + 40, h = cam.h + 40, n = Math.floor(d.n * quality.dust), t = this.time;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) {
      var s = d.s[i] * 3;
      ctx.globalAlpha = d.a[i] * (0.75 + 0.25 * Math.sin(t * 0.7 + d.ph[i]));
      ctx.drawImage(img, d.x[i] * w - 20 - s / 2, d.y[i] * h - 20 - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  // Dark edges, like looking down a microscope tube.
  drawVignette: function (ctx, w, h) {
    if (!this.vignette || this.vigW !== w || this.vigH !== h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, 'rgba(2, 5, 12, 0)');
      g.addColorStop(1, 'rgba(2, 5, 12, 0.7)');
      this.vignette = g; this.vigW = w; this.vigH = h;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, w, h);
  }
};
