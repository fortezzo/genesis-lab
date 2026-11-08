// Genesis Lab - simulation: food. Pure logic, never draws.
// All food lives in one fixed pool of flat arrays (no objects per piece).
// Sprouts grow under the heat lamps, stay exactly where they come up (the air
// is still), and wither if nobody eats them. Meat pellets are left where a bug
// dies (worth most of its stored energy, plus a little for the body) and decay
// after a minute.
var GL = GL || {};

GL.Food = function (capacity) {
  this.cap = capacity;
  this.x = new Float32Array(capacity);
  this.y = new Float32Array(capacity);
  this.energy = new Float32Array(capacity);
  this.age = new Float32Array(capacity);
  this.phase = new Float32Array(capacity); // for the gentle sway and the pellets' shapes (drawing only)
  this.kind = new Uint8Array(capacity);    // 0 = sprout, 1 = meat
  this.alive = new Uint8Array(capacity);
  this.count = 0;                          // slots in use (alive or waiting to be cleared)
  this.sproutCount = 0;
  this.meatCount = 0;
  this.growAcc = 0;                        // fractional sprouts owed by the growth rate
};

GL.Food.SPROUT = 0;
GL.Food.MEAT = 1;

GL.Food.prototype = {
  add: function (x, y, kind, energy, phase) {
    if (this.count >= this.cap) return -1;
    var i = this.count++;
    this.x[i] = x; this.y[i] = y; this.kind[i] = kind;
    this.energy[i] = energy; this.age[i] = 0; this.phase[i] = phase; this.alive[i] = 1;
    if (kind === GL.Food.SPROUT) this.sproutCount++; else this.meatCount++;
    return i;
  },

  // Mark a piece as gone (eaten or faded). It is cleared out by compact().
  remove: function (i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    if (this.kind[i] === GL.Food.SPROUT) this.sproutCount--; else this.meatCount--;
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

  // Age every piece; sprouts wither and meat decays when too old. Nothing drifts.
  update: function (dt) {
    var C = GL.Config, maxSprout = C.sproutMaxAge, maxMeat = C.meatMaxAge;
    for (var i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      this.age[i] += dt;
      if (this.age[i] > (this.kind[i] === GL.Food.SPROUT ? maxSprout : maxMeat)) this.remove(i);
    }
  },

  // Grow new sprouts: fast when the terrarium is bare, slowing to nothing as it fills.
  grow: function (dt, world) {
    var C = GL.Config;
    var room = 1 - this.sproutCount / C.sproutMax;
    if (room <= 0) return;
    var lamps = C.sproutGrowthFollowsLamps ? world.lampBrightness : 1;   // brighter lamps overall: more sprouts
    this.growAcc += C.sproutGrowthRate * world.sproutGrowthMultiplier * lamps * room * dt;
    while (this.growAcc >= 1) {
      this.growAcc -= 1;
      this.spawnSprout(world);
    }
  },

  spawnSprout: function (world) {
    var C = GL.Config, rng = world.rng, R = C.terrariumRadius - 30;
    for (var attempt = 0; attempt < 4; attempt++) {
      var x, y;
      if (rng.next() < C.sproutOpenGroundChance) {
        var a = rng.angle(), r = R * Math.sqrt(rng.next());
        x = Math.cos(a) * r; y = Math.sin(a) * r;
      } else {
        var v = world.pickLamp();
        x = v.x + rng.gauss() * C.lampSpread * 0.5;
        y = v.y + rng.gauss() * C.lampSpread * 0.5;
      }
      if (x * x + y * y < R * R) {
        return this.add(x, y, GL.Food.SPROUT, C.sproutEnergy, rng.next() * GL.M.TAU);
      }
    }
    return -1;
  },

  // Meat left by a body: split into pellets of at most meatPelletEnergy, laid in a small ring
  // around where it died (a fixed pattern turned by its heading, so no random numbers are needed).
  dropMeat: function (x, y, energy, radius, heading) {
    var C = GL.Config;
    if (energy < 1) return 0;
    var n = Math.min(C.meatMaxPellets, Math.max(1, Math.ceil(energy / C.meatPelletEnergy)));
    var each = Math.min(C.meatPelletEnergy, energy / n), R = C.terrariumRadius - C.meatRadius - 2;
    var ring = n === 1 ? 0 : radius * 0.7 + C.meatRadius;
    for (var k = 0; k < n; k++) {
      var a = heading + k * GL.M.TAU / n + 0.4;
      var px = x + Math.cos(a) * ring, py = y + Math.sin(a) * ring, d2 = px * px + py * py;
      if (d2 > R * R) { var s = R / Math.sqrt(d2); px *= s; py *= s; }
      this.add(px, py, GL.Food.MEAT, each, (((a * 1.618 + k) % GL.M.TAU) + GL.M.TAU) % GL.M.TAU);
    }
    return n;
  }
};
