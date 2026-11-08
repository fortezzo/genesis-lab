// Genesis Lab - simulation: food. Pure logic, never draws.
// All food lives in one fixed pool of flat arrays (no objects per piece).
// Algae grows near the nutrient vents, drifts with the current, and fades
// away if nobody eats it. Meat (Session 3) will share this pool.
var GL = GL || {};

GL.Food = function (capacity) {
  this.cap = capacity;
  this.x = new Float32Array(capacity);
  this.y = new Float32Array(capacity);
  this.energy = new Float32Array(capacity);
  this.age = new Float32Array(capacity);
  this.phase = new Float32Array(capacity); // for the breathing glow
  this.kind = new Uint8Array(capacity);    // 0 = algae, 1 = meat (Session 3)
  this.alive = new Uint8Array(capacity);
  this.count = 0;                          // slots in use (alive or waiting to be cleared)
  this.algaeCount = 0;
  this.growAcc = 0;                        // fractional algae owed by the growth rate
};

GL.Food.ALGAE = 0;
GL.Food.MEAT = 1;

GL.Food.prototype = {
  add: function (x, y, kind, energy, phase) {
    if (this.count >= this.cap) return -1;
    var i = this.count++;
    this.x[i] = x; this.y[i] = y; this.kind[i] = kind;
    this.energy[i] = energy; this.age[i] = 0; this.phase[i] = phase; this.alive[i] = 1;
    if (kind === GL.Food.ALGAE) this.algaeCount++;
    return i;
  },

  // Mark a piece as gone (eaten or faded). It is cleared out by compact().
  remove: function (i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    if (this.kind[i] === GL.Food.ALGAE) this.algaeCount--;
  },

  // Close the gaps left by removed pieces by moving the last piece into each gap.
  compact: function () {
    var i = 0;
    while (i < this.count) {
      if (this.alive[i]) { i++; continue; }
      var last = --this.count;
      if (i !== last) {
        this.x[i] = this.x[last]; this.y[i] = this.y[last]; this.kind[i] = this.kind[last];
        this.energy[i] = this.energy[last]; this.age[i] = this.age[last];
        this.phase[i] = this.phase[last]; this.alive[i] = this.alive[last];
      }
      this.alive[last] = 0;
    }
  },

  // Age, drift and fade every piece.
  update: function (dt, world) {
    var C = GL.Config, R = C.dishRadius - C.algaeRadius - 2, R2 = R * R;
    var drift = C.currentOnAlgae, maxAge = C.algaeMaxAge;
    var cur = world.current;
    for (var i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      this.age[i] += dt;
      if (this.age[i] > maxAge) { this.remove(i); continue; }
      cur.sample(this.x[i], this.y[i]);
      var nx = this.x[i] + cur.u * drift * dt, ny = this.y[i] + cur.v * drift * dt;
      var d2 = nx * nx + ny * ny;
      if (d2 > R2) { var s = R / Math.sqrt(d2); nx *= s; ny *= s; } // stays inside the dish
      this.x[i] = nx; this.y[i] = ny;
    }
  },

  // Grow new algae: fast when the dish is bare, slowing to nothing as it fills.
  grow: function (dt, world) {
    var C = GL.Config, rng = world.rng;
    var room = 1 - this.algaeCount / C.algaeMax;
    if (room <= 0) return;
    this.growAcc += C.algaeGrowthRate * world.algaeGrowthMultiplier * room * dt;
    while (this.growAcc >= 1) {
      this.growAcc -= 1;
      this.spawnAlgae(world);
    }
  },

  spawnAlgae: function (world) {
    var C = GL.Config, rng = world.rng, R = C.dishRadius - 30;
    for (var attempt = 0; attempt < 4; attempt++) {
      var x, y;
      if (rng.next() < C.algaeOpenWaterChance) {
        var a = rng.angle(), r = R * Math.sqrt(rng.next());
        x = Math.cos(a) * r; y = Math.sin(a) * r;
      } else {
        var v = world.pickVent();
        x = v.x + rng.gauss() * C.ventSpread * 0.5;
        y = v.y + rng.gauss() * C.ventSpread * 0.5;
      }
      if (x * x + y * y < R * R) {
        return this.add(x, y, GL.Food.ALGAE, C.algaeEnergy, rng.next() * GL.M.TAU);
      }
    }
    return -1;
  }
};
