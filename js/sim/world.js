// Genesis Lab - simulation: the world. Pure logic, never draws.
// The terrarium, its drifting heat lamps (each shining on a nutrient pad), the
// sprouts and the creatures. The air is still: there are no currents.
// step() runs one tick (1/60 simulated second), in this order:
//   1 rebuild the spatial grids   2 sense   3 think   4 act (walk, turn, eat)
//   5 metabolism   6 births and deaths   7 food and lamps   8 stats
var GL = GL || {};

GL.World = (function () {
  var C = GL.Config, M = GL.M, G = GL.Genome.G, E = GL.Events;

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
    this.sproutGrowthMultiplier = 1;     // god mode will change this (Session 3)
    this.lampBrightness = 1;             // the lamps' average strength right now (1 = normal)
    this.floorTimer = 0;
    this.watchId = 0;                    // the creature the viewer is following (set by the interface)
    this.watchDeath = null;              // filled in if that creature dies: what happened, where and when

    this.events = new GL.Events(4096);
    this.stats = new GL.Stats();

    // Creature pool: objects made once, reused forever.
    var poolSize = Math.max(C.capLaptop, C.capPhone, this.cap) + 8;
    this.pool = [];
    for (var i = 0; i < poolSize; i++) this.pool.push(new GL.Creature());
    this.creatures = [];
    this.posX = new Float32Array(poolSize);
    this.posY = new Float32Array(poolSize);

    var foodCap = C.sproutMax + 800;     // room for meat later
    this.food = new GL.Food(foodCap);
    var half = C.terrariumRadius + C.gridCellSize;
    this.creatureGrid = new GL.SpatialGrid(half, C.gridCellSize, poolSize);
    this.foodGrid = new GL.SpatialGrid(half, C.gridCellSize, foodCap);
    this.queryBuf = new Int32Array(Math.max(foodCap, poolSize));
    this.readyBuf = new Int32Array(poolSize);   // scratch list of creatures ready to have a baby

    // Ghosts: an invisible control group of random brains, for a fair learning proof (stats.js).
    // Each ghost copies a living grown bug's body, place and heading, gets a fresh random brain,
    // and walks around for ghostLifetime seconds counting the sprouts it would have eaten. Ghosts
    // never eat real food, never breed, and nothing can see them. They draw their random numbers
    // from their own generator, so the real simulation is exactly the same with or without them.
    var ghostCount = Math.max(8, Math.round(C.ghostCount * Math.min(1, this.cap / C.capLaptop)));
    this.ghostGroups = [];
    this.ghostBase = this.makeGhostGroup(ghostCount, C.ghostLifetime, true, (this.seed ^ 0x6A057) >>> 0);

    // Heat lamps: each circles the terrarium at its own pace, wanders in and out, and waxes and wanes.
    this.lamps = [];
    for (i = 0; i < C.lampCount; i++) {
      this.lamps.push({
        x: 0, y: 0, strength: 1, lane: i,
        angle0: (i / C.lampCount) * M.TAU + this.rng.range(-0.4, 0.4),
        spin: (this.rng.next() < 0.5 ? -1 : 1) * this.rng.range(0.6, 1.4)
      });
    }
    this.updateLamps();

    for (i = 0; i < C.sproutStart; i++) this.food.spawnSprout(this);
    for (i = 0; i < C.startCreatures; i++) this.spawnPrimitive(false);
    this.stats.sample(this);
  }

  World.prototype = {
    // ------------------------------------------------------------- lamps
    updateLamps: function () {
      var t = this.time, R = C.terrariumRadius, total = 0;
      for (var i = 0; i < this.lamps.length; i++) {
        var v = this.lamps[i];
        var a = v.angle0 + v.spin * C.lampOrbitSpeed * t;
        var w = M.clamp(0.5 + 0.8 * this.noise.noise1(t * C.lampWanderSpeed + i * 10.7, v.lane), 0, 1);
        var orbit = R * M.lerp(C.lampMinOrbit, C.lampMaxOrbit, w);
        v.x = Math.cos(a) * orbit;
        v.y = Math.sin(a) * orbit;
        var s = M.clamp(0.5 + 0.8 * this.noise.noise1(t * C.lampWanderSpeed * 1.7 + 50 + i * 3.3, v.lane + 20), 0, 1);
        v.strength = M.lerp(C.lampStrengthMin, C.lampStrengthMax, s);
        total += v.strength;
      }
      this.lampBrightness = total / Math.max(1, this.lamps.length) / ((C.lampStrengthMin + C.lampStrengthMax) / 2);
    },
    // Choose a lamp at random, stronger lamps more often.
    pickLamp: function () {
      var total = 0, i;
      for (i = 0; i < this.lamps.length; i++) total += this.lamps[i].strength;
      var r = this.rng.next() * total;
      for (i = 0; i < this.lamps.length; i++) {
        r -= this.lamps[i].strength;
        if (r <= 0) return this.lamps[i];
      }
      return this.lamps[this.lamps.length - 1];
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

    // A brand-new random creature. arrival = true when it wanders in because of the floor.
    spawnPrimitive: function (arrival) {
      var c = this.takeFromPool();
      if (!c) return null;
      var rng = this.rng, R = C.terrariumRadius - 60;
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
      c.ancestors[0] = p.id; c.ancestors[1] = p.ancestors[0]; c.ancestors[2] = p.ancestors[1];
      c.age = 0;
      c.applyGenes();
      // Born just behind the parent.
      var back = p.radius + c.radius;
      c.x = p.x - Math.cos(p.heading) * back;
      c.y = p.y - Math.sin(p.heading) * back;
      var lim = C.terrariumRadius - c.radius, d2 = c.x * c.x + c.y * c.y;
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

    // ------------------------------------------------------------ ghosts
    makeGhostGroup: function (count, lifetime, respawn, rngSeed) {
      var grp = { ghosts: [], lifetime: lifetime, respawn: respawn, rng: new GL.RNG(rngSeed), started: false,
                  meals: 0, hungry: 0, time: 0, luck: 0, luckMeals: 0 };
      for (var i = 0; i < count; i++) { var g = new GL.Creature(); g.ghost = true; g.group = grp; grp.ghosts.push(g); }
      this.ghostGroups.push(grp);
      return grp;
    },
    // Turn a ghost into a copy of a random grown bug (same genes, place, heading and energy) with a fresh random brain.
    cloneGhost: function (g, grp, lifetime) {
      var list = this.creatures, n = list.length, rng = grp.rng, src = null;
      for (var tries = 0; tries < 12 && n > 0; tries++) {
        var c = list[Math.floor(rng.next() * n)];
        if (c.age >= C.growTime) { src = c; break; }
      }
      if (!src) { g.alive = false; return false; }
      g.reset();
      g.genes.set(src.genes);
      GL.Genome.randomBrain(rng, g.brain);
      g.age = src.age;
      g.applyGenes();
      g.x = src.x; g.y = src.y; g.heading = src.heading; g.vx = src.vx; g.vy = src.vy; g.speed = src.speed;
      g.energy = src.energy; g.health = src.health; g.hue = src.hue;
      g.clockPhase = rng.angle();
      g.ghostLeft = lifetime;
      g.alive = true;
      return true;
    },
    // 5b. Ghosts sense, think and walk like everyone else; their meals are imaginary.
    stepGhosts: function (dt) {
      for (var gi = 0; gi < this.ghostGroups.length; gi++) {
        var grp = this.ghostGroups[gi], list = grp.ghosts, i, g;
        if (!grp.started) {                           // first time: stagger lifetimes so ghosts retire one by one
          grp.started = true;
          for (i = 0; i < list.length; i++) this.cloneGhost(list[i], grp, grp.respawn ? grp.lifetime * (i + 1) / list.length : grp.lifetime);
        }
        // Each ghost lives in a slot for ghostLifetime seconds. If it would have starved, it stops counting,
        // like a real bug that dies, and its slot waits out the rest of its time before copying a new bug.
        // (The brain-swap check in the headless report uses exactly the same rules, so the two can be compared.)
        for (i = 0; i < list.length; i++) {
          g = list[i];
          g.ghostLeft -= dt;
          if (g.alive && g.energy <= 0) g.alive = false;
          if (g.ghostLeft <= 0) { if (grp.respawn) this.cloneGhost(g, grp, grp.lifetime); else g.alive = false; }
          if (!g.alive) continue;
          g.sense(this); g.think(); g.act(this, dt); g.metabolism(dt);
        }
      }
    },
    // Test helper for the headless report's brain-swap check: a one-off group of ghosts copied
    // from grown bugs right now, measured for "seconds" and then dropped with removeProbe().
    addProbe: function (count, seconds, rngSeed) { return this.makeGhostGroup(count, seconds, false, rngSeed); },
    removeProbe: function (grp) { var k = this.ghostGroups.indexOf(grp); if (k >= 0) this.ghostGroups.splice(k, 1); },

    kill: function (index, cause) {
      var list = this.creatures, c = list[index];
      c.alive = false;
      c.deathCause = cause;
      this.stats.onDeath(cause, c);
      if (c.id === this.watchId) {           // the followed creature died: keep a record for the interface
        this.watchDeath = { id: c.id, cause: cause, age: c.age, x: c.x, y: c.y, hue: c.hue, radius: c.radius,
                            generation: c.generation, babies: c.babies, foodEaten: c.foodEaten, time: this.time,
                            parentId: c.parentId, ancestors: [c.ancestors[0], c.ancestors[1], c.ancestors[2]] };
        this.watchId = 0;
      }
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
      this.stepGhosts(dt);

      // 6. Deaths, then births.
      var maxAge = C.lifespan * C.maxAgeFactor, oldAge = C.lifespan * C.oldAgeStart;
      for (i = list.length - 1; i >= 0; i--) {
        c = list[i];
        if (c.energy <= 0) this.kill(i, c.age > oldAge ? 'oldAge' : 'starvation');
        else if (c.age > maxAge) this.kill(i, 'oldAge');
      }
      n = list.length;
      if (n > 0) {
        var start = this.tick % n, threshold = C.reproduceThreshold, ready = this.readyBuf, nReady = 0;
        for (var k = 0; k < n; k++) {
          c = list[(start + k) % n];
          if (c.wantsBaby && c.cooldown <= 0 && c.age >= C.maturityAge && c.energy > threshold * c.maxEnergy) ready[nReady++] = (start + k) % n;
        }
        var room = this.cap - n;
        if (nReady <= room || !C.capBestFed) {
          for (k = 0; k < nReady && list.length < this.cap; k++) this.spawnBaby(list[ready[k]]);
        } else {
          // Not enough room for everyone: the best-fed ready creatures get the free places.
          for (var slot = 0; slot < room; slot++) {
            var best = -1, bestFed = -1;
            for (k = 0; k < nReady; k++) {
              if (ready[k] < 0) continue;
              var fed = list[ready[k]].energy / list[ready[k]].maxEnergy;
              if (fed > bestFed) { bestFed = fed; best = k; }
            }
            if (best < 0) break;
            this.spawnBaby(list[ready[best]]);
            ready[best] = -1;
          }
        }
      }
      // Population floor: below it, primitive creatures wander in.
      if (list.length < this.floor) {
        if (!this.stats.belowFloor) {
          this.stats.belowFloor = true;
          this.stats.onFloorEpisode();
          this.events.note(this.time, 'Population fell below ' + this.floor + ': primitive creatures are wandering in');
        }
        this.floorTimer += dt;
        if (this.floorTimer >= C.floorSpawnInterval) { this.floorTimer = 0; this.spawnPrimitive(true); }
      } else {
        this.stats.belowFloor = false;
        this.floorTimer = 0;
      }

      // 7. Food and lamps.
      this.food.update(dt);
      this.food.grow(dt, this);
      this.food.compact();
      this.updateLamps();
      this.tick++;
      this.time = this.tick * dt;

      // 8. Stats every half simulated second.
      if (this.tick % C.statsIntervalTicks === 0) this.stats.sample(this);
    },

    // Find a living creature by its id (or null).
    findById: function (id) {
      for (var i = 0; i < this.creatures.length; i++) if (this.creatures[i].id === id) return this.creatures[i];
      return null;
    }
  };

  return World;
})();
