// Genesis Lab - simulation: the world. Pure logic, never draws.
// The dish, its drifting nutrient vents, the swirling current, the algae and
// the creatures. step() runs one tick (1/60 simulated second), in this order:
//   1 rebuild the spatial grids   2 sense   3 think   4 act (move, turn, eat)
//   5 metabolism   6 births and deaths   7 food, vents and currents   8 stats
var GL = GL || {};

GL.World = (function () {
  var C = GL.Config, M = GL.M, G = GL.Genome.G, E = GL.Events;

  // ---------------------------------------------------------------- current
  // A slow swirl made from smooth noise (the "curl" of a noise field, so the
  // water circulates instead of piling up), sampled on a coarse grid.
  function Current(noise) {
    this.noise = noise;
    this.n = C.currentGridSize;
    this.cell = (C.dishRadius * 2) / (this.n - 1);
    this.gu = new Float32Array(this.n * this.n);
    this.gv = new Float32Array(this.n * this.n);
    this.psi = new Float32Array(this.n * this.n);
    this.u = 0; this.v = 0;      // result of the last sample()
  }
  Current.prototype = {
    update: function (time) {
      var n = this.n, R = C.dishRadius, cell = this.cell, sc = 1 / C.currentScale;
      var z = time * C.currentTimeScale, i, j, idx;
      for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
        this.psi[j * n + i] = this.noise.noise3((i * cell - R) * sc, (j * cell - R) * sc, z);
      }
      var sumSq = 0, cnt = 0;
      for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
        idx = j * n + i;
        var i0 = i > 0 ? i - 1 : i, i1 = i < n - 1 ? i + 1 : i;
        var j0 = j > 0 ? j - 1 : j, j1 = j < n - 1 ? j + 1 : j;
        var dpdx = (this.psi[j * n + i1] - this.psi[j * n + i0]) / ((i1 - i0) * cell);
        var dpdy = (this.psi[j1 * n + i] - this.psi[j0 * n + i]) / ((j1 - j0) * cell);
        var x = i * cell - R, y = j * cell - R, d = Math.sqrt(x * x + y * y);
        var fade = M.smoothstep(0, C.currentWallFade, R - d);
        this.gu[idx] = dpdy * fade;
        this.gv[idx] = -dpdx * fade;
        if (d < R) { sumSq += this.gu[idx] * this.gu[idx] + this.gv[idx] * this.gv[idx]; cnt++; }
      }
      // Scale so the typical water speed equals currentStrength.
      var rms = Math.sqrt(sumSq / Math.max(1, cnt)), k = rms > 0 ? C.currentStrength / rms : 0;
      for (idx = 0; idx < n * n; idx++) { this.gu[idx] *= k; this.gv[idx] *= k; }
    },
    // Water velocity at (x, y), smoothly blended between grid points. Sets this.u, this.v.
    sample: function (x, y) {
      var n = this.n, fx = (x + C.dishRadius) / this.cell, fy = (y + C.dishRadius) / this.cell;
      if (fx < 0) fx = 0; else if (fx > n - 1.001) fx = n - 1.001;
      if (fy < 0) fy = 0; else if (fy > n - 1.001) fy = n - 1.001;
      var i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, a = j * n + i;
      var gu = this.gu, gv = this.gv;
      var u0 = gu[a] + (gu[a + 1] - gu[a]) * tx, u1 = gu[a + n] + (gu[a + n + 1] - gu[a + n]) * tx;
      var v0 = gv[a] + (gv[a + 1] - gv[a]) * tx, v1 = gv[a + n] + (gv[a + n + 1] - gv[a + n]) * tx;
      this.u = u0 + (u1 - u0) * ty;
      this.v = v0 + (v1 - v0) * ty;
    }
  };

  // ------------------------------------------------------------------ world
  function World(seed, options) {
    options = options || {};
    this.seed = seed >>> 0;
    this.rng = new GL.RNG(this.seed);
    this.noise = new GL.Noise(this.rng);
    this.cap = options.cap || C.capLaptop;
    this.floor = C.populationFloor;
    this.tick = 0;
    this.time = 0;                       // simulated seconds
    this.dt = 1 / C.ticksPerSecond;
    this.nextId = 1;
    this.algaeGrowthMultiplier = 1;      // god mode will change this (Session 3)
    this.floorTimer = 0;

    this.events = new GL.Events(4096);
    this.stats = new GL.Stats();
    this.current = new Current(this.noise);

    // Creature pool: objects made once, reused forever.
    var poolSize = Math.max(C.capLaptop, C.capPhone, this.cap) + 8;
    this.pool = [];
    for (var i = 0; i < poolSize; i++) this.pool.push(new GL.Creature());
    this.creatures = [];
    this.posX = new Float32Array(poolSize);
    this.posY = new Float32Array(poolSize);

    var foodCap = C.algaeMax + 800;      // room for meat later
    this.food = new GL.Food(foodCap);
    var half = C.dishRadius + C.gridCellSize;
    this.creatureGrid = new GL.SpatialGrid(half, C.gridCellSize, poolSize);
    this.foodGrid = new GL.SpatialGrid(half, C.gridCellSize, foodCap);
    this.queryBuf = new Int32Array(Math.max(foodCap, poolSize));

    // Vents: each circles the dish at its own pace and wanders in and out.
    this.vents = [];
    for (i = 0; i < C.ventCount; i++) {
      this.vents.push({
        x: 0, y: 0, strength: 1, lane: i,
        angle0: (i / C.ventCount) * M.TAU + this.rng.range(-0.4, 0.4),
        spin: (this.rng.next() < 0.5 ? -1 : 1) * this.rng.range(0.6, 1.4)
      });
    }
    this.updateVents();
    this.current.update(0);

    for (i = 0; i < C.algaeStart; i++) this.food.spawnAlgae(this);
    for (i = 0; i < C.startCreatures; i++) this.spawnPrimitive(false);
    this.stats.sample(this);
  }

  World.prototype = {
    // ------------------------------------------------------------- vents
    updateVents: function () {
      var t = this.time, R = C.dishRadius;
      for (var i = 0; i < this.vents.length; i++) {
        var v = this.vents[i];
        var a = v.angle0 + v.spin * C.ventOrbitSpeed * t;
        var w = M.clamp(0.5 + 0.8 * this.noise.noise1(t * C.ventWanderSpeed + i * 10.7, v.lane), 0, 1);
        var orbit = R * M.lerp(C.ventMinOrbit, C.ventMaxOrbit, w);
        v.x = Math.cos(a) * orbit;
        v.y = Math.sin(a) * orbit;
        var s = M.clamp(0.5 + 0.8 * this.noise.noise1(t * C.ventWanderSpeed * 1.7 + 50 + i * 3.3, v.lane + 20), 0, 1);
        v.strength = M.lerp(C.ventStrengthMin, C.ventStrengthMax, s);
      }
    },
    // Choose a vent at random, stronger vents more often.
    pickVent: function () {
      var total = 0, i;
      for (i = 0; i < this.vents.length; i++) total += this.vents[i].strength;
      var r = this.rng.next() * total;
      for (i = 0; i < this.vents.length; i++) {
        r -= this.vents[i].strength;
        if (r <= 0) return this.vents[i];
      }
      return this.vents[this.vents.length - 1];
    },

    // --------------------------------------------------------- creatures
    takeFromPool: function () {
      for (var i = 0; i < this.pool.length; i++) {
        if (!this.pool[i].alive) {
          var c = this.pool[i];
          c.reset();
          c.alive = true;
          c.id = this.nextId++;
          c.bornTick = this.tick;
          c.bornAt = this.time;
          this.creatures.push(c);
          return c;
        }
      }
      return null;
    },

    // A brand-new random creature. arrival = true when it drifts in because of the floor.
    spawnPrimitive: function (arrival) {
      var c = this.takeFromPool();
      if (!c) return null;
      var rng = this.rng, R = C.dishRadius - 60;
      GL.Genome.randomGenes(rng, c.genes);
      GL.Genome.randomBrain(rng, c.brain);
      c.primitive = true;
      c.age = C.growTime + rng.range(0, C.primitiveAgeSpread);   // fully grown
      c.applyGenes();
      var a = rng.angle(), r = R * Math.sqrt(rng.next());
      c.x = Math.cos(a) * r; c.y = Math.sin(a) * r;
      c.heading = rng.angle();
      c.energy = C.startEnergy * c.maxEnergy;
      c.health = c.maxHealth;
      c.cooldown = C.primitiveSettleTime;
      c.clockPhase = rng.angle();
      c.hue = rng.range(C.plantHueMin, C.plantHueMax);
      if (arrival) {
        this.stats.onArrival();
        this.events.push(E.ARRIVAL, c.x, c.y, c.hue, c.radius, c.id);
      }
      return c;
    },

    spawnBaby: function (p) {
      var c = this.takeFromPool();
      if (!c) return null;
      var rng = this.rng;
      GL.Genome.inherit(rng, p.genes, p.brain, c.genes, c.brain);
      c.generation = p.generation + 1;
      c.parentId = p.id;
      c.age = 0;
      c.applyGenes();
      // Born just behind the parent.
      var back = p.radius + c.radius;
      c.x = p.x - Math.cos(p.heading) * back;
      c.y = p.y - Math.sin(p.heading) * back;
      var lim = C.dishRadius - c.radius, d2 = c.x * c.x + c.y * c.y;
      if (d2 > lim * lim) { var s = lim / Math.sqrt(d2); c.x *= s; c.y *= s; }
      c.heading = M.wrapAngle(p.heading + Math.PI + rng.range(-1, 1));
      c.clockPhase = rng.angle();
      c.hue = M.clamp(p.hue + rng.range(-C.hueDrift, C.hueDrift), C.plantHueMin, C.plantHueMax);
      // Energy: the baby gets the parent's investment share; the parent also pays the birth cost.
      var gift = p.energy * p.genes[G.INVEST];
      var price = p.energy * C.birthCost;
      if (gift > c.maxEnergy) gift = c.maxEnergy;
      p.energy -= gift + price;
      p.cooldown = C.reproduceCooldown;
      c.energy = gift;
      c.health = c.maxHealth;
      p.babies++;
      this.stats.onBirth();
      this.events.push(E.BIRTH, c.x, c.y, c.hue, p.radius, c.id);
      return c;
    },

    kill: function (index, cause) {
      var list = this.creatures, c = list[index];
      c.alive = false;
      c.deathCause = cause;
      this.stats.onDeath(cause);
      this.events.push(E.DEATH, c.x, c.y, c.hue, c.radius, c.id);
      var last = list.pop();
      if (index < list.length) list[index] = last;
    },

    onEat: function (c, fx, fy) {
      this.stats.onEat();
      this.events.push(E.EAT, fx, fy, c.hue, c.radius, c.id);
    },

    // -------------------------------------------------------------- tick
    step: function () {
      var dt = this.dt, list = this.creatures, n = list.length, i, c;

      // 1. Rebuild the spatial grids.
      for (i = 0; i < n; i++) { this.posX[i] = list[i].x; this.posY[i] = list[i].y; }
      this.creatureGrid.rebuild(this.posX, this.posY, n, null);
      this.foodGrid.rebuild(this.food.x, this.food.y, this.food.count, this.food.alive);

      // 2-3. Sense, then think.
      for (i = 0; i < n; i++) list[i].sense(this);
      for (i = 0; i < n; i++) list[i].think();
      // 4-5. Act, then metabolism.
      for (i = 0; i < n; i++) list[i].act(this, dt);
      for (i = 0; i < n; i++) list[i].metabolism(dt);

      // 6. Deaths, then births.
      var maxAge = C.lifespan * C.maxAgeFactor, oldAge = C.lifespan * C.oldAgeStart;
      for (i = list.length - 1; i >= 0; i--) {
        c = list[i];
        if (c.energy <= 0) this.kill(i, c.age > oldAge ? 'oldAge' : 'starvation');
        else if (c.age > maxAge) this.kill(i, 'oldAge');
      }
      n = list.length;
      if (n > 0) {
        var start = this.tick % n, threshold = C.reproduceThreshold;
        for (var k = 0; k < n && list.length < this.cap; k++) {
          c = list[(start + k) % n];
          if (c.wantsBaby && c.cooldown <= 0 && c.age >= C.maturityAge && c.energy > threshold * c.maxEnergy) this.spawnBaby(c);
        }
      }
      // Population floor: below it, primitive creatures drift in.
      if (list.length < this.floor) {
        if (!this.stats.belowFloor) {
          this.stats.belowFloor = true;
          this.stats.onFloorEpisode();
          this.events.note(this.time, 'Population fell below ' + this.floor + ': primitive creatures are drifting in');
        }
        this.floorTimer += dt;
        if (this.floorTimer >= C.floorSpawnInterval) { this.floorTimer = 0; this.spawnPrimitive(true); }
      } else {
        this.stats.belowFloor = false;
        this.floorTimer = 0;
      }

      // 7. Food, vents and currents.
      this.food.update(dt, this);
      this.food.grow(dt, this);
      this.food.compact();
      this.updateVents();
      this.tick++;
      this.time = this.tick * dt;
      if (this.tick % C.currentUpdateTicks === 0) this.current.update(this.time);

      // 8. Stats every half simulated second.
      if (this.tick % C.statsIntervalTicks === 0) this.stats.sample(this);
    },

    // Find a living creature by its id (or null).
    findById: function (id) {
      for (var i = 0; i < this.creatures.length; i++) if (this.creatures[i].id === id) return this.creatures[i];
      return null;
    }
  };

  World.Current = Current;
  return World;
})();
