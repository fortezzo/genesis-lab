// Genesis Lab - simulation: statistics. Pure logic, never draws.
// Counts births, deaths by cause and meals, and every half simulated second
// takes a sample for the charts and the headless report.
//
// Foraging skill, the main "are they learning?" number, is fair to crowding:
// it says how many times faster than blind luck a hungry bug finds food.
// While a bug is hungry, each tick adds the meals luck alone would bring it
// (food density around it x the ground its body sweeps as it walks), and
// each meal it actually eats is counted. Skill = meals / luck's meals, over
// the last 60 simulated seconds. Random brains score about 1x. Because both
// sides see the same food, a crowded terrarium doesn't drag the number down.
// (Food found per bug per minute is still recorded as foodRate: it peaks
// during the population boom and then falls to what each bug burns.)
var GL = GL || {};

GL.Stats = function () {
  var C = GL.Config;
  this.births = 0;
  this.deaths = { starvation: 0, eaten: 0, oldAge: 0, disaster: 0 };
  this.foodEaten = 0;          // pieces of food eaten, ever
  this.luckMeals = 0;          // meals eaten by hungry bugs, ever (updated by the creatures)
  this.luckExpected = 0;       // meals blind luck would have given those hungry bugs, ever
  this.arrivals = 0;           // primitive creatures that wandered in (population floor)
  this.floorEpisodes = 0;      // times the population dropped below the floor
  this.belowFloor = false;
  this.babyDeaths = 0;         // babies (not primitives) that have died...
  this.babyDeathsUnfed = 0;    // ...and how many of them never ate once

  // Rolling window for the live numbers.
  this.winLen = Math.max(2, Math.round(C.skillWindowSec * C.ticksPerSecond / C.statsIntervalTicks));
  this.winFood = new Float64Array(this.winLen);  // cumulative food at each sample
  this.winMeals = new Float64Array(this.winLen); // cumulative hungry meals at each sample
  this.winLuck = new Float64Array(this.winLen);  // cumulative luck-expected meals at each sample
  this.winPop = new Float64Array(this.winLen);   // population at each sample
  this.winTime = new Float64Array(this.winLen);
  this.winCount = 0;
  this.winHead = 0;
  this.skill = 0;              // foraging skill right now: times faster than luck
  this.startSkill = -1;        // the first full minute's skill (the "before" number)
  this.foodRate = 0;           // food found per bug per minute, right now (for reference)
  this.steer = 0;              // share of walking bugs that see food and are pointed at it (last sample)
  this.steerLuck = 0;          // what luck alone would give for that share

  // Per-minute summaries (for the headless report and Session 2's charts).
  this.minutes = [];
  this.resetMinute();

  // Sample history for charts (Session 2): plain arrays of numbers.
  this.history = { time: [], population: [], sprouts: [], skill: [], foodRate: [], steer: [],
                   speed: [], size: [], sight: [], diet: [] };

  this.population = 0;
  this.maxGeneration = 0;      // deepest family line among the living (can go down when a line dies out)
  this.maxGenerationEver = 0;  // highest generation ever reached (never goes down: shown in the top bar)
  this.avgGeneration = 0;
};

GL.Stats.prototype = {
  onBirth: function () { this.births++; this._minBirths++; },
  onDeath: function (cause, c) {
    this.deaths[cause]++; this._minDeaths++;
    if (c && !c.primitive) {
      this.babyDeaths++; this._minBabyDeaths++;
      if (c.foodEaten === 0) { this.babyDeathsUnfed++; this._minBabyUnfed++; }
    }
  },
  onEat: function () { this.foodEaten++; this._minFood++; },
  onArrival: function () { this.arrivals++; this._minArrivals++; },
  onFloorEpisode: function () { this.floorEpisodes++; this._minFloor++; },

  resetMinute: function () {
    this._minFood = 0; this._minPopSum = 0; this._minSamples = 0;
    this._minBirths = 0; this._minDeaths = 0; this._minArrivals = 0;
    this._minPopMin = Infinity; this._minPopMax = 0; this._minFloor = 0;
    this._minMeals0 = this.luckMeals; this._minLuck0 = this.luckExpected;
    this._minSteerSeen = 0; this._minSteerHit = 0; this._minSteerLuck = 0;
    this._minBabyDeaths = 0; this._minBabyUnfed = 0;
  },

  sample: function (world) {
    var C = GL.Config, G = GL.Genome.G;
    var list = world.creatures, n = list.length, i;
    this.population = n;

    // Generations, average traits, and steering: of the bugs that are walking and can see
    // food, how many are pointed at it (within steerConeDeg either side of straight ahead)?
    var maxGen = 0, genSum = 0, sp = 0, sz = 0, si = 0, di = 0;
    var cone = C.steerConeDeg * Math.PI / 180, seen = 0, hit = 0, luck = 0;
    for (i = 0; i < n; i++) {
      var c = list[i];
      if (c.generation > maxGen) maxGen = c.generation;
      genSum += c.generation;
      sp += c.genes[G.SPEED]; sz += c.genes[G.SIZE]; si += c.genes[G.SIGHT]; di += c.genes[G.DIET];
      if (c.lookAmount > 0 && c.thrust > 0 && c.speed > C.steerMinSpeed * c.topSpeed) {
        seen++;
        if (Math.abs(c.lookAngle) <= cone) hit++;
        luck += Math.min(1, 2 * cone / c.fov);   // pointed at it by chance: the cone's share of the view
      }
    }
    this.maxGeneration = maxGen;
    if (maxGen > this.maxGenerationEver) this.maxGenerationEver = maxGen;
    this.avgGeneration = n ? genSum / n : 0;
    if (seen > 0) { this.steer = hit / seen; this.steerLuck = luck / seen; }
    this._minSteerSeen += seen; this._minSteerHit += hit; this._minSteerLuck += luck;

    // Live numbers over the rolling window.
    var h = this.winHead;
    this.winFood[h] = this.foodEaten; this.winMeals[h] = this.luckMeals; this.winLuck[h] = this.luckExpected;
    this.winPop[h] = n; this.winTime[h] = world.time;
    this.winHead = (h + 1) % this.winLen;
    if (this.winCount < this.winLen) this.winCount++;
    if (this.winCount >= 2) {
      var oldest = (this.winHead - this.winCount + this.winLen) % this.winLen;
      var popSum = 0;
      for (i = 0; i < this.winCount; i++) popSum += this.winPop[(oldest + i) % this.winLen];
      var avgPop = popSum / this.winCount;
      var minutes = (world.time - this.winTime[oldest]) / 60;
      var food = this.foodEaten - this.winFood[oldest];
      this.foodRate = (avgPop > 0 && minutes > 0) ? food / avgPop / minutes : 0;
      var expected = this.luckExpected - this.winLuck[oldest];
      this.skill = expected > 0 ? (this.luckMeals - this.winMeals[oldest]) / expected : 0;
    }

    // Per-minute summary.
    this._minPopSum += n; this._minSamples++;
    if (n < this._minPopMin) this._minPopMin = n;
    if (n > this._minPopMax) this._minPopMax = n;
    var perMinute = Math.round(60 * C.ticksPerSecond / C.statsIntervalTicks);
    if (this._minSamples >= perMinute) {
      var pop = this._minPopSum / this._minSamples;
      var luckMin = this.luckExpected - this._minLuck0;
      var rec = {
        minute: this.minutes.length + 1,
        population: pop,
        popEnd: n,
        popMin: this._minPopMin,
        popMax: this._minPopMax,
        floorEpisodes: this._minFloor,
        food: this._minFood,
        foodRate: pop > 0 ? this._minFood / pop : 0,                         // food per bug per minute
        skill: luckMin > 0 ? (this.luckMeals - this._minMeals0) / luckMin : 0, // times faster than luck
        steer: this._minSteerSeen ? this._minSteerHit / this._minSteerSeen : 0,
        steerLuck: this._minSteerSeen ? this._minSteerLuck / this._minSteerSeen : 0,
        births: this._minBirths,
        deaths: this._minDeaths,
        babyDeaths: this._minBabyDeaths,
        babyUnfed: this._minBabyUnfed,
        arrivals: this._minArrivals,
        maxGeneration: this.maxGenerationEver,
        sprouts: world.food.sproutCount,
        avgSpeed: n ? sp / n : 0, avgSize: n ? sz / n : 0, avgSight: n ? si / n : 0
      };
      this.minutes.push(rec);
      if (this.startSkill < 0) this.startSkill = rec.skill;
      this.resetMinute();
    }

    // Chart history (thinned out to every other sample once it is full).
    var hist = this.history;
    hist.time.push(world.time); hist.population.push(n); hist.sprouts.push(world.food.sproutCount);
    hist.skill.push(this.skill); hist.foodRate.push(this.foodRate); hist.steer.push(this.steer);
    hist.speed.push(n ? sp / n : 0); hist.size.push(n ? sz / n : 0);
    hist.sight.push(n ? si / n : 0); hist.diet.push(n ? di / n : 0);
    if (hist.time.length > C.statsHistoryMax) {
      for (var key in hist) {
        var arr = hist[key], out = [];
        for (i = 0; i < arr.length; i += 2) out.push(arr[i]);
        hist[key] = out;
      }
    }
  }
};
