// Genesis Lab - simulation: statistics. Pure logic, never draws.
// Counts births, deaths by cause and meals, and every half simulated second
// takes a sample for the charts. Foraging skill = food found per creature
// per minute, measured over the last 60 simulated seconds. It is the main
// "are they learning?" number.
var GL = GL || {};

GL.Stats = function () {
  var C = GL.Config;
  this.births = 0;
  this.deaths = { starvation: 0, eaten: 0, oldAge: 0, disaster: 0 };
  this.foodEaten = 0;          // pieces of food eaten, ever
  this.arrivals = 0;           // primitive creatures that wandered in (population floor)
  this.floorEpisodes = 0;      // times the population dropped below the floor
  this.belowFloor = false;

  // Rolling window for the live foraging-skill number.
  this.winLen = Math.max(2, Math.round(C.skillWindowSec * C.ticksPerSecond / C.statsIntervalTicks));
  this.winFood = new Float64Array(this.winLen);  // cumulative food at each sample
  this.winPop = new Float64Array(this.winLen);   // population at each sample
  this.winTime = new Float64Array(this.winLen);
  this.winCount = 0;
  this.winHead = 0;
  this.skill = 0;              // food per creature per minute, right now
  this.startSkill = -1;        // the first full minute's skill (the "before" number)

  // Per-minute summaries (for the headless report and Session 2's charts).
  this.minutes = [];
  this._minFood = 0; this._minPopSum = 0; this._minSamples = 0;
  this._minBirths = 0; this._minDeaths = 0; this._minArrivals = 0;
  this._minPopMin = Infinity; this._minPopMax = 0; this._minFloor = 0;

  // Sample history for charts (Session 2): plain arrays of numbers.
  this.history = { time: [], population: [], sprouts: [], skill: [], speed: [], size: [], sight: [], diet: [] };

  this.population = 0;
  this.maxGeneration = 0;
  this.avgGeneration = 0;
};

GL.Stats.prototype = {
  onBirth: function () { this.births++; this._minBirths++; },
  onDeath: function (cause) { this.deaths[cause]++; this._minDeaths++; },
  onEat: function () { this.foodEaten++; this._minFood++; },
  onArrival: function () { this.arrivals++; this._minArrivals++; },
  onFloorEpisode: function () { this.floorEpisodes++; this._minFloor++; },

  sample: function (world) {
    var C = GL.Config, G = GL.Genome.G;
    var list = world.creatures, n = list.length, i;
    this.population = n;

    // Generations and average traits.
    var maxGen = 0, genSum = 0, sp = 0, sz = 0, si = 0, di = 0;
    for (i = 0; i < n; i++) {
      var c = list[i];
      if (c.generation > maxGen) maxGen = c.generation;
      genSum += c.generation;
      sp += c.genes[G.SPEED]; sz += c.genes[G.SIZE]; si += c.genes[G.SIGHT]; di += c.genes[G.DIET];
    }
    this.maxGeneration = maxGen;
    this.avgGeneration = n ? genSum / n : 0;

    // Live foraging skill over the rolling window.
    var h = this.winHead;
    this.winFood[h] = this.foodEaten; this.winPop[h] = n; this.winTime[h] = world.time;
    this.winHead = (h + 1) % this.winLen;
    if (this.winCount < this.winLen) this.winCount++;
    if (this.winCount >= 2) {
      var oldest = (this.winHead - this.winCount + this.winLen) % this.winLen;
      var popSum = 0;
      for (i = 0; i < this.winCount; i++) popSum += this.winPop[(oldest + i) % this.winLen];
      var avgPop = popSum / this.winCount;
      var minutes = (world.time - this.winTime[oldest]) / 60;
      var food = this.foodEaten - this.winFood[oldest];
      this.skill = (avgPop > 0 && minutes > 0) ? food / avgPop / minutes : 0;
    }

    // Per-minute summary.
    this._minPopSum += n; this._minSamples++;
    if (n < this._minPopMin) this._minPopMin = n;
    if (n > this._minPopMax) this._minPopMax = n;
    var perMinute = Math.round(60 * C.ticksPerSecond / C.statsIntervalTicks);
    if (this._minSamples >= perMinute) {
      var pop = this._minPopSum / this._minSamples;
      var rec = {
        minute: this.minutes.length + 1,
        population: pop,
        popEnd: n,
        popMin: this._minPopMin,
        popMax: this._minPopMax,
        floorEpisodes: this._minFloor,
        food: this._minFood,
        skill: pop > 0 ? this._minFood / pop : 0,
        births: this._minBirths,
        deaths: this._minDeaths,
        arrivals: this._minArrivals,
        maxGeneration: maxGen,
        sprouts: world.food.sproutCount,
        avgSpeed: n ? sp / n : 0, avgSize: n ? sz / n : 0, avgSight: n ? si / n : 0
      };
      this.minutes.push(rec);
      if (this.startSkill < 0) this.startSkill = rec.skill;
      this._minFood = 0; this._minPopSum = 0; this._minSamples = 0;
      this._minBirths = 0; this._minDeaths = 0; this._minArrivals = 0;
      this._minPopMin = Infinity; this._minPopMax = 0; this._minFloor = 0;
    }

    // Chart history (thinned out to every other sample once it is full).
    var hist = this.history;
    hist.time.push(world.time); hist.population.push(n); hist.sprouts.push(world.food.sproutCount);
    hist.skill.push(this.skill);
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
