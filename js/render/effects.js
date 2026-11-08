// Genesis Lab - drawing: effects.
// A ring flash at every birth, a burst of particles at every death and a small
// sparkle when algae is eaten. Everything comes from one fixed pool, so no new
// objects are made while the app runs. Effects play in real time, whatever the speed.
var GL = GL || {};

GL.Effects = function () {
  var n = GL.Config.render.maxParticles;
  this.cap = n;
  this.x = new Float32Array(n); this.y = new Float32Array(n);
  this.vx = new Float32Array(n); this.vy = new Float32Array(n);
  this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
  this.size = new Float32Array(n); this.hue = new Float32Array(n);
  this.kind = new Uint8Array(n);          // 0 = spark, 1 = ring, 2 = sparkle (green)
  this.count = 0;
  this.lastSeq = 0;                       // last world event we have played
};

GL.Effects.SPARK = 0;
GL.Effects.RING = 1;
GL.Effects.SPARKLE = 2;

GL.Effects.prototype = {
  add: function (kind, x, y, vx, vy, life, size, hue) {
    if (this.count >= this.cap) return;
    var i = this.count++;
    this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.hue[i] = hue;
  },

  // Turn the world's new event records into effects.
  consume: function (events, quality, view) {
    var E = GL.Events, R = GL.Config.render;
    var from = Math.max(this.lastSeq, events.seq - events.cap), to = events.seq;
    // At very high speeds there can be thousands of events per frame: only play the latest few hundred.
    if (to - from > 600) from = to - 600;
    for (var s = from; s < to; s++) {
      var i = s % events.cap, x = events.x[i], y = events.y[i];
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;   // off screen
      var type = events.type[i], hue = events.hue[i], r = events.r[i];
      if (type === E.BIRTH || type === E.ARRIVAL) {
        this.add(GL.Effects.RING, x, y, 0, 0, R.birthRingTime, r * (type === E.ARRIVAL ? 2.5 : 1.6), hue);
      } else if (type === E.DEATH) {
        var n = Math.max(3, Math.round(R.deathParticles * quality.particles));
        for (var k = 0; k < n; k++) {
          var a = Math.random() * GL.M.TAU, sp = (20 + Math.random() * 45) * (0.6 + r / 20);
          this.add(GL.Effects.SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
                   R.deathParticleTime * (0.6 + Math.random() * 0.6), 2 + Math.random() * r * 0.35, hue);
        }
      } else if (type === E.EAT && quality.particles > 0.5) {
        this.add(GL.Effects.SPARKLE, x, y, 0, 0, 0.45, 9, 140);
      }
    }
    this.lastSeq = to;
  },

  update: function (dt) {
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
  },

  // Draw in world space (the context is already in world units).
  draw: function (ctx, cam) {
    var S = GL.Sprites, M = GL.M, z = cam.zoom;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < this.count; i++) {
      var t = 1 - this.life[i] / this.maxLife[i];     // 0 at the start, 1 at the end
      var kind = this.kind[i], x = this.x[i], y = this.y[i];
      if (kind === GL.Effects.RING) {
        var r = this.size[i] * (1 + t * 2.2);
        ctx.globalAlpha = (1 - t) * (1 - t) * 0.8;
        ctx.strokeStyle = 'hsl(' + Math.round(this.hue[i]) + ',100%,72%)';
        ctx.lineWidth = Math.max(1.2 / z, this.size[i] * 0.18 * (1 - t));
        ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU); ctx.stroke();
      } else {
        var img = kind === GL.Effects.SPARKLE ? S.algae() : S.glow(this.hue[i], 1, 0.62);
        var s = this.size[i] * (kind === GL.Effects.SPARKLE ? (1 + t * 1.5) : (1.6 - t * 0.6)) * 2;
        s = Math.max(s, 3 / z);
        ctx.globalAlpha = kind === GL.Effects.SPARKLE ? 0.5 * (1 - t) : (1 - t);
        ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
};
