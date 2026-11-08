// Genesis Lab - simulation: creature. Pure logic, never draws.
// A creature is DNA (genes + brain) plus a body: position, heading, energy,
// health and age. Creature objects are pooled and reused, so a tick never
// creates new objects. Each tick the world calls, in order:
//   sense() -> think() -> act() -> metabolism()
var GL = GL || {};

GL.Creature = (function () {
  var C = GL.Config, M = GL.M, G = GL.Genome.G;
  var IN = GL.Brain.IN, OUT = GL.Brain.OUT;
  var SLICES = 5;
  var bestFood = new Float32Array(SLICES);     // scratch space shared by every creature's sense()
  var bestCre = new Float32Array(SLICES);
  var bestCreIdx = new Int32Array(SLICES);

  function Creature() {
    this.genes = new Float32Array(GL.Genome.GENE_COUNT);
    this.brain = new Float32Array(GL.Genome.BRAIN_SIZE);
    this.inputs = new Float32Array(C.brainInputs);
    this.hidden = new Float32Array(C.brainHidden);
    this.outputs = new Float32Array(C.brainOutputs);
    this.alive = false;
    this.id = 0;
    this.fx = null;            // drawing-only state, owned by the renderer
    this.reset();
  }

  Creature.prototype = {
    reset: function () {
      this.generation = 0; this.parentId = 0; this.age = 0; this.bornAt = 0;
      this.x = 0; this.y = 0; this.heading = 0; this.vx = 0; this.vy = 0; this.speed = 0;
      this.thrust = 0; this.turn = 0; this.wantsBaby = false; this.biting = false;
      this.energy = 0; this.health = 0; this.wallTouch = 0;
      this.foodEaten = 0; this.babies = 0; this.kills = 0;
      this.lastEatTick = -100000; this.bornTick = 0; this.cooldown = 0;
      this.lookAngle = 0; this.lookAmount = 0;
      this.deathCause = '';
      this.hue = 180; this.primitive = false; this.clockPhase = 0;
      this.inputs.fill(0); this.hidden.fill(0); this.outputs.fill(0);
    },

    // Turn the genes into body numbers. Called once when the creature is made.
    applyGenes: function () {
      var g = this.genes;
      this.fullRadius = g[G.SIZE];
      this.topSpeed = g[G.SPEED] * Math.pow(C.refSize / this.fullRadius, C.sizeSpeedPenalty);
      this.turnSpeed = g[G.TURN];
      this.sight = g[G.SIGHT];
      this.fov = g[G.FOV] * Math.PI / 180;
      var diet = g[G.DIET];
      this.digestPlant = (1 - diet) * (1 - diet);   // in-between diets digest both poorly
      this.digestMeat = diet * diet;
      this.clockHz = g[G.CLOCK];
      this.maxEnergy = C.energyPerSize2 * this.fullRadius * this.fullRadius;
      this.maxHealth = C.healthPerSize2 * this.fullRadius * this.fullRadius;
      this.eyeCost = C.eyeCost * this.sight * this.fov;
      this.updateRadius();
    },

    // Babies start at half size and grow to full size.
    updateRadius: function () {
      var t = this.age / C.growTime;
      var s = C.babyStartScale + (1 - C.babyStartScale) * (t > 1 ? 1 : t);
      this.radius = this.fullRadius * s;
    },

    // 1. SENSE: fill the 25 inputs from what the creature can see and feel.
    sense: function (world) {
      var inp = this.inputs, i, k, n;
      var x = this.x, y = this.y, sight = this.sight, s2 = sight * sight, invSight = 1 / sight;
      var half = this.fov * 0.5, invSlice = SLICES / this.fov;
      var ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      var buf = world.queryBuf;

      // Food: per slice, the best (closest, most nutritious) piece.
      var food = world.food;
      bestFood.fill(0);
      var lookVal = 0, lookAng = 0;
      n = world.foodGrid.query(x, y, sight, buf);
      for (k = 0; k < n; k++) {
        i = buf[k];
        if (!food.alive[i]) continue;
        var dx = food.x[i] - x, dy = food.y[i] - y, d2 = dx * dx + dy * dy;
        if (d2 >= s2) continue;
        var phi = M.fastAtan2(dy * ch - dx * sh, dx * ch + dy * sh);
        if (phi < -half || phi > half) continue;
        var digest = food.kind[i] === 0 ? this.digestPlant : this.digestMeat;
        if (digest <= 0) continue;
        var val = (1 - Math.sqrt(d2) * invSight) * digest;
        var s = Math.floor((phi + half) * invSlice);
        if (s < 0) s = 0; else if (s >= SLICES) s = SLICES - 1;
        if (val > bestFood[s]) bestFood[s] = val;
        if (val > lookVal) { lookVal = val; lookAng = phi; }
      }

      // Creatures: per slice, the closest one.
      var list = world.creatures;
      for (s = 0; s < SLICES; s++) { bestCre[s] = s2; bestCreIdx[s] = -1; }
      n = world.creatureGrid.query(x, y, sight, buf);
      for (k = 0; k < n; k++) {
        i = buf[k];
        var o = list[i];
        if (o === this) continue;
        dx = o.x - x; dy = o.y - y; d2 = dx * dx + dy * dy;
        if (d2 >= s2) continue;
        phi = M.fastAtan2(dy * ch - dx * sh, dx * ch + dy * sh);
        if (phi < -half || phi > half) continue;
        s = Math.floor((phi + half) * invSlice);
        if (s < 0) s = 0; else if (s >= SLICES) s = SLICES - 1;
        if (d2 < bestCre[s]) { bestCre[s] = d2; bestCreIdx[s] = i; }
      }

      for (s = 0; s < SLICES; s++) {
        inp[IN.FOOD + s] = bestFood[s];
        if (bestCreIdx[s] >= 0) {
          var other = list[bestCreIdx[s]];
          inp[IN.CREATURE + s] = 1 - Math.sqrt(bestCre[s]) * invSight;
          // Size compared with mine: -1 much smaller, +1 much bigger.
          inp[IN.SIZE + s] = Math.tanh(Math.log(other.radius / this.radius) * C.sizeSenseScale);
        } else {
          inp[IN.CREATURE + s] = 0;
          inp[IN.SIZE + s] = 0;
        }
      }

      // Glass wall: how close it is, and which way the centre lies.
      var R = C.terrariumRadius, dist = Math.sqrt(x * x + y * y);
      var wallGap = R - dist - this.radius;
      inp[IN.WALL] = M.clamp(1 - wallGap * invSight, 0, 1);
      if (dist > 1) {
        var cx = -x / dist, cy = -y / dist;
        inp[IN.CENTER_SIDE] = cy * ch - cx * sh;
        inp[IN.CENTER_FWD] = cx * ch + cy * sh;
      } else {
        inp[IN.CENTER_SIDE] = 0; inp[IN.CENTER_FWD] = 0;
      }

      // Body, inner clock and memory.
      inp[IN.ENERGY] = this.energy / this.maxEnergy;
      inp[IN.HEALTH] = this.health / this.maxHealth;
      inp[IN.AGE] = Math.min(1, this.age / C.lifespan);
      inp[IN.SPEED] = this.speed / this.topSpeed;
      inp[IN.CLOCK] = Math.sin(M.TAU * this.clockHz * this.age + this.clockPhase);
      inp[IN.MEM1] = this.outputs[OUT.MEM1];
      inp[IN.MEM2] = this.outputs[OUT.MEM2];

      this.lookAngle = lookAng;
      this.lookAmount = lookVal;
    },

    // 2. THINK: run the brain.
    think: function () {
      GL.Brain.think(this.brain, this.inputs, this.hidden, this.outputs);
    },

    // 3. ACT: walk, turn and eat. (Biting does nothing until Session 3.)
    act: function (world, dt) {
      var out = this.outputs;
      var dz = C.thrustDeadZone, th = (out[OUT.THRUST] - dz) / (1 - dz);
      this.thrust = th < 0 ? 0 : (th > 1 ? 1 : th);
      this.turn = out[OUT.TURN];
      this.biting = out[OUT.BITE] > 0;
      this.wantsBaby = out[OUT.REPRODUCE] > 0;

      this.heading = M.wrapAngle(this.heading + this.turn * this.turnSpeed * dt);

      // Walking: split the velocity into "forward" (along the heading) and "sideways".
      // Legs speed a bug up at walkAcceleration but brake it fast (walkBraking), so it
      // stops quickly instead of gliding, and grip the soil (legGrip), so turns don't skid.
      // The air is still: nothing else moves a bug.
      var target = this.thrust * this.topSpeed;
      var hx = Math.cos(this.heading), hy = Math.sin(this.heading);
      var fwd = this.vx * hx + this.vy * hy, side = this.vy * hx - this.vx * hy;
      var k = ((fwd < 0 || target < fwd) ? C.walkBraking : C.walkAcceleration) * dt; if (k > 1) k = 1;
      fwd += (target - fwd) * k;
      var g = C.legGrip * dt; if (g > 1) g = 1;
      side -= side * g;
      this.vx = hx * fwd - hy * side;
      this.vy = hy * fwd + hx * side;
      var nx = this.x + this.vx * dt;
      var ny = this.y + this.vy * dt;

      // Soft glass wall: pushed back inside, and it costs extra energy.
      var lim = C.terrariumRadius - this.radius, d2 = nx * nx + ny * ny;
      this.wallTouch = 0;
      if (d2 > lim * lim) {
        var d = Math.sqrt(d2), ux = nx / d, uy = ny / d;
        nx = ux * lim; ny = uy * lim;
        var outward = this.vx * ux + this.vy * uy;
        if (outward > 0) { this.vx -= outward * ux; this.vy -= outward * uy; }
        this.wallTouch = 1;
      }
      this.x = nx; this.y = ny;
      this.speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);

      // Eat one piece of touching food per tick, if there's room in the stomach.
      if (this.energy < this.maxEnergy) this.eat(world);
    },

    eat: function (world) {
      var food = world.food, buf = world.queryBuf;
      var reach = this.radius + C.sproutRadius, reach2 = reach * reach;
      var n = world.foodGrid.query(this.x, this.y, reach, buf);
      for (var k = 0; k < n; k++) {
        var i = buf[k];
        if (!food.alive[i]) continue;
        var dx = food.x[i] - this.x, dy = food.y[i] - this.y;
        if (dx * dx + dy * dy > reach2) continue;
        var digest = food.kind[i] === 0 ? this.digestPlant : this.digestMeat;
        if (digest <= 0) continue;
        this.energy = Math.min(this.maxEnergy, this.energy + food.energy[i] * digest);
        food.remove(i);
        this.foodEaten++;
        this.lastEatTick = world.tick;
        world.onEat(this, food.x[i], food.y[i]);
        return;
      }
    },

    // 4. METABOLISM: pay energy for living, walking, seeing and thinking; heal; age; grow.
    metabolism: function (dt) {
      var r = this.radius, age = this.age, life = C.lifespan;
      var upkeep = C.upkeepPerSize2 * r * r;
      var oldStart = C.oldAgeStart * life;
      if (age > oldStart) {
        var t = (age - oldStart) / (life - oldStart);
        upkeep *= 1 + C.oldAgeUpkeep * t * t;     // old age: upkeep climbs
      }
      var cost = upkeep
        + C.walkCost * this.speed * this.speed * r
        + this.eyeCost
        + C.thinkCost
        + C.turnCost * Math.abs(this.turn)
        + C.wallEnergyCost * this.wallTouch;
      this.energy -= cost * dt;

      if (this.health < this.maxHealth && this.energy > 0) {
        var heal = Math.min(this.maxHealth - this.health, C.healRate * this.maxHealth * dt);
        var price = heal * C.healEnergyCost;
        if (price < this.energy) { this.health += heal; this.energy -= price; }
      }

      this.age += dt;
      if (this.cooldown > 0) this.cooldown -= dt;
      if (this.radius < this.fullRadius) this.updateRadius();
    }
  };

  return Creature;
})();
