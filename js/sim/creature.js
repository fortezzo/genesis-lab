// Genesis Lab - simulation: creature. Pure logic, never draws.
// A creature is DNA (genes + brain) plus a body: position, heading, energy,
// health and age. Creature objects are pooled and reused, so a tick never
// creates new objects. Each tick the world calls, in order:
//   sense() -> think() -> act() -> metabolism()
// A "ghost" is a creature used only for measuring (see world.js): it senses,
// thinks and walks like any other, but its meals are imaginary. It never
// removes food, never bites, and nothing in the world can see it.
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
    this.ancestors = new Int32Array(3);  // parent, grandparent and great-grandparent ids (0 = none), for finding relatives
    this.ghost = false;                  // true for the invisible random-brain control group (world.js)
    this.group = null;                   // a ghost's group, where it counts its imaginary meals
    this.ghostMeals = new Float32Array(16); // where a ghost "ate" lately (x, y pairs), so it can't count a sprout twice
    this.alive = false;
    this.id = 0;
    this.fx = null;            // drawing-only state, owned by the renderer
    this.reset();
  }

  Creature.prototype = {
    reset: function () {
      this.generation = 0; this.parentId = 0; this.age = 0; this.bornAt = 0;
      this.x = 0; this.y = 0; this.heading = 0; this.vx = 0; this.vy = 0; this.speed = 0;
      this.thrust = 0; this.turn = 0; this.turnRate = 0; this.wantsBaby = false; this.biting = false;
      this.energy = 0; this.health = 0; this.wallTouch = 0;
      this.foodEaten = 0; this.meatEaten = 0; this.babies = 0; this.kills = 0;
      this.lastEatTick = -100000; this.bornTick = 0; this.cooldown = 0;
      this.lookAngle = 0; this.lookAmount = 0; this.lookPrey = null;
      this.foodDensity = 0; this.hungry = false;
      this.ghostLeft = 0; this.ghostMealCount = 0;
      this.deathCause = '';
      this.speciesId = 0; this.founderIdx = -1;
      this.biteTarget = null; this.lastBiteTick = -100000;     // who it bit last, and when (for drawing and stats)
      this.attacker = null; this.attackerId = 0; this.lastBittenTick = -100000;   // who bit it last
      this.heldBy = null; this.heldTick = -100000;             // held in a meat-eater's pincers (this tick or the last)
      this.holdTick = -100000;                                 // holding prey in its own pincers
      this.lockUntil = -100000;                                // its pincers stay shut until this tick
      this.struggle = 0;                                       // how close a held victim is to breaking free (0..1)
      this.escapeUntil = -100000;                              // it just broke free: nothing can bite it until this tick
      this.ancestors.fill(0);
      this.hue = 180; this.primitive = false; this.placed = ''; this.clockPhase = 0;
      this.inputs.fill(0); this.hidden.fill(0); this.outputs.fill(0);
    },

    // Turn the genes into body numbers. Called once when the creature is made.
    applyGenes: function () {
      var g = this.genes;
      this.fullRadius = g[G.SIZE];
      this.topSpeed = g[G.SPEED] * Math.pow(C.refSize / this.fullRadius, C.sizeSpeedPenalty);
      // Long legs built for speed are clumsy: above agilitySpeed, a faster top speed means slower turning.
      var clumsy = this.topSpeed > C.agilitySpeed ? Math.pow(C.agilitySpeed / this.topSpeed, C.agilityExp) : 1;
      this.turnSpeed = g[G.TURN] * clumsy;
      this.sight = g[G.SIGHT];
      this.fov = g[G.FOV] * Math.PI / 180;
      var diet = g[G.DIET];
      this.digestPlant = (1 - diet) * (1 - diet);   // in-between diets digest both poorly
      this.digestMeat = diet * diet;
      if (this.digestPlant < C.eatMinDigest) this.digestPlant = 0;   // too poor to bother: it ignores that food
      if (this.digestMeat < C.eatMinDigest) this.digestMeat = 0;
      this.meat = diet >= C.species.meatDiet;        // a meat-eater (for drawing, species and stats)
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
      var lookVal = 0, lookAng = 0, near = 0, lookPrey = null;
      n = world.foodGrid.query(x, y, sight, buf);
      for (k = 0; k < n; k++) {
        i = buf[k];
        if (!food.alive[i]) continue;
        var dx = food.x[i] - x, dy = food.y[i] - y, d2 = dx * dx + dy * dy;
        if (d2 >= s2) continue;
        if (this.ghost && this.ghostAte(food.x[i], food.y[i])) continue;   // a ghost already "ate" this one
        var digest = food.kind[i] === 0 ? this.digestPlant : this.digestMeat;
        if (digest <= 0) continue;
        near++;                                      // edible food within sight, in any direction
        var phi = M.fastAtan2(dy * ch - dx * sh, dx * ch + dy * sh);
        if (phi < -half || phi > half) continue;
        var val = (1 - Math.sqrt(d2) * invSight) * digest;
        var s = Math.floor((phi + half) * invSlice);
        if (s < 0) s = 0; else if (s >= SLICES) s = SLICES - 1;
        if (val > bestFood[s]) bestFood[s] = val;
        if (val > lookVal) { lookVal = val; lookAng = phi; }
      }

      // Creatures: per slice, the closest one. To a meat-eater, a plant-eater is also food.
      var list = world.creatures, hunter = this.digestMeat > 0 && !this.ghost && C.preyFoodSense > 0;
      var preyGain = this.digestMeat * C.preyFoodSense;
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
        if (hunter && !o.meat) {
          val = (1 - Math.sqrt(d2) * invSight) * preyGain;
          if (val > bestFood[s]) bestFood[s] = val;
          if (val > lookVal) { lookVal = val; lookAng = phi; lookPrey = o; }
        }
      }

      for (s = 0; s < SLICES; s++) {
        inp[IN.FOOD + s] = bestFood[s] * C.foodSenseGain;
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
      this.lookPrey = lookPrey;
      this.foodDensity = near / (Math.PI * s2);     // food per square unit around me (for the fair skill measure)
    },

    // 2. THINK: run the brain.
    think: function () {
      GL.Brain.think(this.brain, this.inputs, this.hidden, this.outputs);
    },

    // 3. ACT: walk, turn, bite and eat.
    act: function (world, dt) {
      var out = this.outputs;
      var dz = C.thrustDeadZone, th = (out[OUT.THRUST] - dz) / (1 - dz);
      this.thrust = th < 0 ? 0 : (th > 1 ? 1 : th);
      this.turn = out[OUT.TURN];
      // Legs can't reverse a turn instantly: the actual turn rate eases toward what the brain asks for.
      var tr = C.turnResponse * dt; if (tr > 1) tr = 1;
      this.turnRate += (this.turn - this.turnRate) * tr;
      // Pincers close when the bite output goes above 0, and only open again once it drops below
      // -biteRelease, so a brain that wavers around 0 doesn't drop its prey every other tick.
      var bo = out[OUT.BITE];
      if (bo > 0) this.biting = true; else if (bo < -C.biteRelease) this.biting = false;
      if (world.tick < this.lockUntil) this.biting = true;   // pincers that closed on a victim stay shut a moment
      this.wantsBaby = out[OUT.REPRODUCE] > 0;

      this.heading = M.wrapAngle(this.heading + this.turnRate * this.turnSpeed * dt);

      // Walking: split the velocity into "forward" (along the heading) and "sideways".
      // Legs speed a bug up at walkAcceleration but brake it fast (walkBraking), so it
      // stops quickly instead of gliding, and grip the soil (legGrip), so turns don't skid.
      // The air is still: nothing else moves a bug. (An ice age slows every leg: world.speedFactor.)
      var target = this.thrust * this.topSpeed * world.speedFactor;
      var holder = this.heldBy, tick = world.tick;
      var held = holder !== null && tick - this.heldTick <= 1 && holder.alive;
      if (!held && tick - this.lastBittenTick <= 1) target *= C.biteGrip;  // bitten but too big to hold: slowed
      if (tick - this.holdTick <= 1) target *= C.biteDrag;                 // dragging prey in its pincers
      var hx = Math.cos(this.heading), hy = Math.sin(this.heading);
      var fwd = this.vx * hx + this.vy * hy, side = this.vy * hx - this.vx * hy;
      var k = ((fwd < 0 || target < fwd) ? C.walkBraking : C.walkAcceleration) * dt; if (k > 1) k = 1;
      fwd += (target - fwd) * k;
      var g = C.legGrip * dt; if (g > 1) g = 1;
      side -= side * g;
      this.vx = hx * fwd - hy * side;
      this.vy = hy * fwd + hx * side;
      if (held) {
        // Held in pincers: it can't walk away. It is dragged along at the hunter's mouth.
        this.vx = holder.vx; this.vy = holder.vy;
      }
      var nx = this.x + this.vx * dt;
      var ny = this.y + this.vy * dt;
      if (held) {
        var hr = holder.radius, mxp = holder.x + Math.cos(holder.heading) * (hr * C.biteReach + this.radius * 0.6);
        var myp = holder.y + Math.sin(holder.heading) * (hr * C.biteReach + this.radius * 0.6);
        nx += (mxp - nx) * 0.25; ny += (myp - ny) * 0.25;
      }

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

      // Fair foraging measure (it never changes behaviour): while hungry (room for a whole
      // sprout), add the meals blind luck would bring a bug walking here at this speed:
      // food density x the width of ground it sweeps (it eats what its body touches) x speed.
      // Grown bugs also count their hungry time, for the comparison with random brains (stats.js).
      // Only plant-eaters count: foraging skill is about finding sprouts.
      this.hungry = this.energy + C.sproutEnergy <= this.maxEnergy;
      var forager = !this.meat;
      if (this.ghost) this.group.time += dt;
      else if (forager && this.age >= C.growTime) world.stats.adultTime += dt;
      if (this.hungry && forager) {
        var luck = this.foodDensity * 2 * this.reach() * this.speed * dt;
        if (this.ghost) { this.group.luck += luck; this.group.hungry += dt; }
        else {
          world.stats.luckExpected += luck;
          if (this.age >= C.growTime) world.stats.adultHungry += dt;
        }
      }

      // Bite whatever touches the mouth. Damage grows with size and with how well it digests meat,
      // so a plant-eater's bite does nothing; biting costs energy for every point of damage.
      if (this.biting && this.digestMeat > 0 && !this.ghost) this.bite(world, dt);

      // Eat one piece of touching food per tick, if there's room in the stomach.
      if (this.energy < this.maxEnergy) { if (this.ghost) this.ghostEat(world); else this.eat(world); }
    },

    bite: function (world, dt) {
      var r = this.radius, mx = this.x + Math.cos(this.heading) * r * C.biteReach, my = this.y + Math.sin(this.heading) * r * C.biteReach;
      var mr = r * C.biteRange, buf = world.queryBuf, list = world.creatures, best = null, bestD = Infinity, dx, dy, d2, reach;
      // Pincers keep biting the victim they bit last tick, as long as it is still within reach (even if
      // another hunter is biting it too); otherwise they close on whatever is nearest to the mouth.
      var held = this.biteTarget;
      if (held && held.alive && world.tick - this.lastBiteTick <= 1 && world.tick >= held.escapeUntil) {
        dx = held.x - mx; dy = held.y - my; reach = mr + held.radius + 2;
        if (dx * dx + dy * dy < reach * reach) best = held;
      }
      if (!best) {
        var n = world.creatureGrid.query(mx, my, mr + 26, buf);
        for (var k = 0; k < n; k++) {
          var o = list[buf[k]];
          if (o === this || !o.alive || o.speciesId === this.speciesId) continue;   // never its own kind
          if (world.tick < o.escapeUntil) continue;                                  // it just wriggled free
          dx = o.x - mx; dy = o.y - my; d2 = dx * dx + dy * dy; reach = mr + o.radius;
          if (d2 < reach * reach && d2 < bestD) { bestD = d2; best = o; }
        }
      }
      if (!best) return;
      var dmg = C.biteDamage * r * this.digestMeat * dt, real = Math.min(dmg, Math.max(0, best.health));
      best.health -= dmg;                                      // (a victim can't heal while it is being bitten: metabolism)
      best.attacker = this; best.attackerId = this.id; best.lastBittenTick = world.tick;
      // Pincers hold a victim no bigger than the biter (bigger ones can't be held, only slowed),
      // and once they close on a new victim they stay shut for biteLock seconds.
      if (best.radius <= r * C.biteHoldSize) {
        if (world.tick - this.holdTick > 1 || best.heldBy !== this) this.lockUntil = world.tick + Math.round(C.biteLock * C.ticksPerSecond);
        best.heldBy = this; best.heldTick = world.tick; this.holdTick = world.tick;
      }
      this.energy -= real * C.biteCost;
      this.biteTarget = best; this.lastBiteTick = world.tick;
      // A victim struggles: a well-fed one breaks free quickly (wounded, but alive); a hungry, weak one can't.
      // So hunters mostly catch the weak, as real predators do.
      if (C.preyStruggle > 0 && best.health > 0) {
        best.struggle += C.preyStruggle * Math.max(0, best.energy / best.maxEnergy) * dt;
        if (best.struggle >= 1) {
          best.struggle = 0; best.escapeUntil = world.tick + Math.round(C.escapeGrace * C.ticksPerSecond);
          if (best.heldBy === this) best.heldBy = null;
          this.lockUntil = world.tick; this.biteTarget = null;
        }
      }
    },

    // Bugs eat with their mouths: food must touch the mouth circle at the front of the head.
    // reach() = how far to each side of its path a walking bug can catch a sprout (for the luck measure).
    reach: function () { return C.eatWithMouth ? this.radius * C.mouthRange + C.sproutRadius : this.radius + C.sproutRadius; },
    mouthX: function () { return C.eatWithMouth ? this.x + Math.cos(this.heading) * this.radius * C.mouthReach : this.x; },
    mouthY: function () { return C.eatWithMouth ? this.y + Math.sin(this.heading) * this.radius * C.mouthReach : this.y; },

    eat: function (world) {
      var food = world.food, buf = world.queryBuf, ox = this.mouthX(), oy = this.mouthY();
      var mr = C.eatWithMouth ? this.radius * C.mouthRange : this.radius;
      var reach = mr + Math.max(C.sproutRadius, C.meatRadius);
      var n = world.foodGrid.query(ox, oy, reach, buf);
      for (var k = 0; k < n; k++) {
        var i = buf[k];
        if (!food.alive[i]) continue;
        var meat = food.kind[i] !== 0, rr = mr + (meat ? C.meatRadius : C.sproutRadius);
        var dx = food.x[i] - ox, dy = food.y[i] - oy;
        if (dx * dx + dy * dy > rr * rr) continue;
        var digest = meat ? this.digestMeat : this.digestPlant;
        if (digest <= 0) continue;
        if (C.eatOnlyWithRoom && this.energy + food.energy[i] * digest > this.maxEnergy) continue;   // too full: leave it
        this.energy = Math.min(this.maxEnergy, this.energy + food.energy[i] * digest);
        food.remove(i);
        this.foodEaten++;
        if (meat) this.meatEaten++;
        else if (this.hungry && !this.meat) { world.stats.luckMeals++; if (this.age >= C.growTime) world.stats.adultMeals++; }
        this.lastEatTick = world.tick;
        world.onEat(this, food.x[i], food.y[i], meat);
        return;
      }
    },

    // A ghost "eats" without eating: it counts the meal and gains the energy, but the sprout stays
    // for the real bugs. It remembers where it ate, so it never counts the same sprout twice.
    ghostEat: function (world) {
      var food = world.food, buf = world.queryBuf, grp = this.group, ox = this.mouthX(), oy = this.mouthY();
      var reach = this.reach(), reach2 = reach * reach;
      var n = world.foodGrid.query(ox, oy, reach, buf);
      for (var k = 0; k < n; k++) {
        var i = buf[k];
        if (!food.alive[i] || food.kind[i] !== 0) continue;      // ghosts copy plant-eaters: sprouts only
        var dx = food.x[i] - ox, dy = food.y[i] - oy;
        if (dx * dx + dy * dy > reach2) continue;
        var digest = this.digestPlant;
        if (digest <= 0) continue;
        if (C.eatOnlyWithRoom && this.energy + food.energy[i] * digest > this.maxEnergy) continue;
        if (this.ghostAte(food.x[i], food.y[i])) continue;
        this.energy = Math.min(this.maxEnergy, this.energy + food.energy[i] * digest);
        var slot = (this.ghostMealCount++ % 8) * 2;
        this.ghostMeals[slot] = food.x[i]; this.ghostMeals[slot + 1] = food.y[i];
        if (this.hungry) { grp.meals++; grp.luckMeals++; }
        return;
      }
    },
    ghostAte: function (fx, fy) {
      var m = this.ghostMeals, n = Math.min(this.ghostMealCount, 8) * 2;
      for (var j = 0; j < n; j += 2) if (m[j] === fx && m[j + 1] === fy) return true;
      return false;
    },

    // 4. METABOLISM: pay energy for living, walking, seeing and thinking; heal; age; grow.
    // (An ice age makes staying alive cost more: world.upkeepFactor.)
    metabolism: function (dt, world) {
      var r = this.radius, age = this.age, life = C.lifespan;
      var upkeep = C.upkeepPerSize2 * r * r * world.upkeepFactor;
      var oldStart = C.oldAgeStart * life;
      if (age > oldStart) {
        var t = (age - oldStart) / (life - oldStart);
        upkeep *= 1 + C.oldAgeUpkeep * t * t;     // old age: upkeep climbs
      }
      var cost = upkeep
        + C.walkCost * this.speed * this.speed * r
        + this.eyeCost
        + C.thinkCost
        + C.turnCost * Math.abs(this.turnRate)
        + C.wallEnergyCost * this.wallTouch;
      this.energy -= cost * dt;

      // Heal slowly by spending energy, but not while something is biting it.
      if (world.tick - this.lastBittenTick > 1 && this.struggle > 0) this.struggle = Math.max(0, this.struggle - dt);
      if (this.health < this.maxHealth && this.energy > 0 && world.tick - this.lastBittenTick > 1) {
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
