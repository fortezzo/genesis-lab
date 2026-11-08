// Genesis Lab - drawing: effects.
// A ring flash at every birth, a burst of particles at every death, a red burst when a
// meat-eater makes a kill, a small sparkle when food is eaten (green for sprouts, amber
// for meat) and, for a meteor strike, a shockwave, flying debris and a crater that fades.
// Everything comes from fixed pools, so no new objects are made while the app runs.
// Effects play in real time, whatever the speed.
var GL = GL || {};

GL.Effects = function () {
  var n = GL.Config.render.maxParticles;
  this.cap = n;
  this.x = new Float32Array(n); this.y = new Float32Array(n);
  this.vx = new Float32Array(n); this.vy = new Float32Array(n);
  this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
  this.size = new Float32Array(n); this.hue = new Float32Array(n);
  this.kind = new Uint8Array(n);          // see the kinds below
  this.count = 0;
  this.lastSeq = 0;                       // last world event we have played
  this.craters = [];                      // meteor scorch marks: { x, y, r, t } (real time)
  this.clock = 0;
  this.impact = 0;                        // set when a meteor strikes; the renderer flashes and shakes
};

GL.Effects.SPARK = 0;      // a glowing particle that flies out and fades
GL.Effects.RING = 1;       // an expanding ring (births, arrivals, kills)
GL.Effects.SPARKLE = 2;    // a soft green puff where a sprout was eaten
GL.Effects.MEATPUFF = 3;   // ...and an amber one where meat was eaten
GL.Effects.SHOCK = 4;      // a meteor's shockwave: a big, fast ring

GL.Effects.prototype = {
  add: function (kind, x, y, vx, vy, life, size, hue) {
    if (this.count >= this.cap) return;
    var i = this.count++;
    this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.hue[i] = hue;
  },

  // Turn the world's new event records into effects.
  consume: function (events, quality, view) {
    var E = GL.Events, R = GL.Config.render, K = GL.Effects;
    var from = Math.max(this.lastSeq, events.seq - events.cap), to = events.seq;
    // At very high speeds there can be thousands of events per frame: only play the latest few hundred.
    if (to - from > 600) from = to - 600;
    for (var s = from; s < to; s++) {
      var i = s % events.cap, x = events.x[i], y = events.y[i], type = events.type[i];
      if (type === E.METEOR) { this.meteor(x, y, events.r[i], quality); continue; }   // seen even off screen
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;     // off screen
      var hue = events.hue[i], r = events.r[i], k, a, sp, n;
      if (type === E.BIRTH || type === E.ARRIVAL) {
        this.add(K.RING, x, y, 0, 0, R.birthRingTime, r * (type === E.ARRIVAL ? 2.5 : 1.6), hue);
      } else if (type === E.DEATH || type === E.KILL) {
        n = Math.max(3, Math.round(R.deathParticles * quality.particles * (type === E.KILL ? 1.4 : 1)));
        for (k = 0; k < n; k++) {
          a = Math.random() * GL.M.TAU; sp = (20 + Math.random() * 45) * (0.6 + r / 20) * (type === E.KILL ? 1.3 : 1);
          this.add(K.SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
                   R.deathParticleTime * (0.6 + Math.random() * 0.6), 2 + Math.random() * r * 0.35, k % 3 === 0 && type === E.KILL ? 350 : hue);
        }
        if (type === E.KILL) this.add(K.RING, x, y, 0, 0, R.birthRingTime * 1.2, r * 1.8, 348);
      } else if (type === E.EAT && quality.particles > 0.5) {
        this.add(K.SPARKLE, x, y, 0, 0, 0.45, 9, 140);
      } else if (type === E.EAT_MEAT && quality.particles > 0.5) {
        this.add(K.MEATPUFF, x, y, 0, 0, 0.5, 10, 36);
      }
    }
    this.lastSeq = to;
  },

  // A meteor strike: a shockwave, a spray of burning debris, a scorch mark, and a flash on screen.
  meteor: function (x, y, r, quality) {
    var K = GL.Effects, n = Math.round(60 * Math.max(0.4, quality.particles));
    this.add(K.SHOCK, x, y, 0, 0, 1.1, r, 30);
    this.add(K.SHOCK, x, y, 0, 0, 1.7, r * 0.6, 20);
    for (var k = 0; k < n; k++) {
      var a = Math.random() * GL.M.TAU, sp = r * (0.8 + Math.random() * 2.2);
      this.add(K.SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.6 + Math.random() * 0.9, 4 + Math.random() * 9, 18 + Math.random() * 22);
    }
    this.craters.push({ x: x, y: y, r: r * 1.15, t: this.clock });
    if (this.craters.length > 12) this.craters.shift();
    this.impact = 1;
  },

  update: function (dt) {
    this.clock += dt;
    var i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {            // remove by moving the last particle into this slot
        var j = --this.count;
        this.kind[i] = this.kind[j]; this.x[i] = this.x[j]; this.y[i] = this.y[j];
        this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.life[i] = this.life[j];
        this.maxLife[i] = this.maxLife[j]; this.size[i] = this.size[j]; this.hue[i] = this.hue[j];
        continue;
      }
      var drag = Math.exp(-2.5 * dt);
      this.vx[i] *= drag; this.vy[i] *= drag;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      i++;
    }
    var life = GL.Config.render.craterSeconds;
    while (this.craters.length && this.clock - this.craters[0].t > life) this.craters.shift();
  },

  // Scorch marks lie on the soil, under everything that lives (drawn in world units).
  drawCraters: function (ctx, cam) {
    if (!this.craters.length) return;
    var img = GL.Sprites.crater(), life = GL.Config.render.craterSeconds;
    for (var i = 0; i < this.craters.length; i++) {
      var c = this.craters[i], age = this.clock - c.t, a = age < life * 0.6 ? 1 : 1 - (age - life * 0.6) / (life * 0.4);
      ctx.globalAlpha = Math.max(0, a) * 0.9;
      var s = c.r * 2.2;
      ctx.drawImage(img, c.x - s / 2, c.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  },

  // Draw in world space (the context is already in world units).
  draw: function (ctx, cam) {
    var S = GL.Sprites, M = GL.M, z = cam.zoom, K = GL.Effects;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < this.count; i++) {
      var t = 1 - this.life[i] / this.maxLife[i];     // 0 at the start, 1 at the end
      var kind = this.kind[i], x = this.x[i], y = this.y[i], r, s;
      if (kind === K.RING || kind === K.SHOCK) {
        var shock = kind === K.SHOCK;
        r = this.size[i] * (shock ? 0.3 + t * 1.3 : 1 + t * 2.2);
        ctx.globalAlpha = (1 - t) * (1 - t) * (shock ? 0.9 : 0.8);
        ctx.strokeStyle = 'hsl(' + Math.round(this.hue[i]) + ',100%,' + (shock ? 75 : 72) + '%)';
        ctx.lineWidth = Math.max(1.2 / z, this.size[i] * (shock ? 0.08 : 0.18) * (1 - t));
        ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU); ctx.stroke();
      } else {
        var puff = kind === K.SPARKLE || kind === K.MEATPUFF;
        var img = kind === K.SPARKLE ? S.sproutGlow() : S.glow(this.hue[i], 1, 0.62);
        s = this.size[i] * (puff ? (1 + t * 1.5) : (1.6 - t * 0.6)) * 2;
        s = Math.max(s, 3 / z);
        ctx.globalAlpha = puff ? 0.5 * (1 - t) : (1 - t);
        ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
};
