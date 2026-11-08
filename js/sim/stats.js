// Genesis Lab - simulation: statistics. Pure logic, never draws.
// Counts births, deaths by cause and meals, and every half simulated second
// takes a sample for the charts and the headless report.
//
// Foraging skill, the main "are they learning?" number, compares the real bugs
// with random brains in the same terrarium at the same moment: how many times
// faster a hungry grown bug finds food than a hungry random-brain "ghost"
// (world.js) does. Ghosts copy real bugs' bodies and places but have fresh
// random brains, and only pretend to eat, so food shortages and crowding hit
// both sides equally and can't inflate the number. At minute 1 every bug has a
// random brain, so skill starts at about 1x.
// Rate = meals found while hungry (room for a whole sprout) / minutes spent hungry.
// Also recorded, for reference: skillLuck (times faster than blind luck: meals
// / meals luck would bring a bug walking there, which rises as food gets scarce
// even for random brains) and foodRate (food found per bug per minute, which
// peaks during the population boom and then falls to what each bug burns).
// Foraging skill and steering are about finding sprouts, so they count plant-eaters
// only; meat-eaters (predators) are counted separately.
var GL = GL || {};

GL.Stats = function () {
  var C = GL.Config;
  this.births = 0;
  this.meatBirths = 0;         // babies born meat-eaters
  this.deaths = { starvation: 0, eaten: 0, oldAge: 0, disaster: 0 };
  this.meatMeals = 0;          // meat pellets eaten, ever
  this.predators = 0;          // meat-eaters alive (last sample)...
  this.prey = 0;               // ...and plant-eaters
  this.foodEaten = 0;          // pieces of food eaten, ever
  this.luckMeals = 0;          // meals eaten by hungry bugs, ever (updated by the creatures)
  this.luckExpected = 0;       // meals blind luck would have given those hungry bugs, ever
  this.adultMeals = 0;         // meals found by hungry grown bugs, ever...
  this.adultHungry = 0;        // ...and the seconds they spent hungry
  this.adultTime = 0;          // seconds lived by grown bugs, ever (for meals per minute)
  this.arrivals = 0;           // primitive creatures that wandered in (population floor)
  this.floorEpisodes = 0;      // times the population dropped below the floor
  this.belowFloor = false;
  this.babyDeaths = 0;         // babies (not primitives) that have died...
  this.babyDeathsUnfed = 0;    // ...and how many of them never ate once
  this.babyUnfedEaten = 0;     // ...of which were eaten by a meat-eater before their first meal

  // Rolling window for the live numbers.
  this.winLen = Math.max(2, Math.round(C.skillWindowSec * C.ticksPerSecond / C.statsIntervalTicks));
  this.winFood = new Float64Array(this.winLen);  // cumulative food at each sample
  this.winMeals = new Float64Array(this.winLen); // cumulative hungry meals at each sample
  this.winLuck = new Float64Array(this.winLen);  // cumulative luck-expected meals at each sample
  this.winAdultMeals = new Float64Array(this.winLen);  // the same for grown bugs: meals while hungry...
  this.winAdultHungry = new Float64Array(this.winLen); // ...and hungry seconds
  this.winGhostMeals = new Float64Array(this.winLen);  // and for the random-brain ghosts
  this.winGhostHungry = new Float64Array(this.winLen);
  this.winPop = new Float64Array(this.winLen);   // population at each sample
  this.winTime = new Float64Array(this.winLen);
  this.winCount = 0;
  this.winHead = 0;
  this.skill = 0;              // foraging skill right now: times faster than random brains
  this.startSkill = -1;        // the first full minute's skill (the "before" number)
  this.skillLuck = 0;          // times faster than blind luck (for reference)
  this.adultRate = 0;          // meals per hungry minute: grown bugs...
  this.ghostRate = 0;          // ...and random-brain ghosts
  this.foodRate = 0;           // food found per bug per minute, right now (for reference)
  this.steer = 0;              // share of walking bugs that see food and are pointed at it (last sample)
  this.steerLuck = 0;          // what luck alone would give for that share

  // Per-minute summaries (for the headless report and Session 2's charts).
  this.minutes = [];
  this.resetMinute();

  // Sample history for charts (Session 2): plain arrays of numbers.
  // births and deaths are running totals (the charts turn them into per-minute rates).
  this.history = { time: [], population: [], sprouts: [], skill: [], adultRate: [], ghostRate: [], foodRate: [], steer: [],
                   steerLuck: [], speed: [], size: [], sight: [], diet: [], turn: [],
                   births: [], starvation: [], oldAge: [], eaten: [], disaster: [], predators: [], species: [], meat: [] };
  this.championId = 0;         // the living creature with the best score: babies x 3 + minutes alive
  this.championScore = 0;

  this.population = 0;
  this.maxGeneration = 0;      // deepest family line among the living (can go down when a line dies out)
  this.maxGenerationEver = 0;  // highest generation ever reached (never goes down: shown in the top bar)
  this.avgGeneration = 0;
};

// Real bugs' meals per hungry second divided by the ghosts'. A half-meal head start on the ghosts'
// side keeps the number sensible when they found almost nothing in the window.
GL.Stats.ratio = function (meals, hungry, ghostMeals, ghostHungry) {
  if (hungry <= 0 || ghostHungry <= 0) return 0;
  return (meals / hungry) / ((ghostMeals + 0.5) / ghostHungry);
};
// Living meat-eater species, and the size of the biggest one.
GL.Stats.meatSpecies = function (world) {
  var list = world.species.list, n = 0;
  for (var i = 0; i < list.length; i++) if (list[i].meat && list[i].count > 0) n++;
  return n;
};
GL.Stats.biggestMeat = function (world) {
  var list = world.species.list, best = 0;
  for (var i = 0; i < list.length; i++) if (list[i].meat && list[i].count > best) best = list[i].count;
  return best;
};

GL.Stats.prototype = {
  onBirth: function (c) { this.births++; this._minBirths++; if (c && c.meat) { this.meatBirths++; this._minMeatBirths++; } },
  onDeath: function (cause, c) {
    this.deaths[cause]++; this._minDeaths++;
    if (cause === 'eaten') this._minEaten++;
    if (c && !c.primitive) {
      this.babyDeaths++; this._minBabyDeaths++;
      if (c.foodEaten === 0) {
        this.babyDeathsUnfed++; this._minBabyUnfed++;
        if (cause === 'eaten') this.babyUnfedEaten++;
      }
    }
  },
  onEat: function (meat) { this.foodEaten++; this._minFood++; if (meat) { this.meatMeals++; this._minMeat++; } },
  onArrival: function () { this.arrivals++; this._minArrivals++; },
  onFloorEpisode: function () { this.floorEpisodes++; this._minFloor++; },

  resetMinute: function () {
    this._minFood = 0; this._minPopSum = 0; this._minSamples = 0;
    this._minBirths = 0; this._minDeaths = 0; this._minArrivals = 0;
    this._minPopMin = Infinity; this._minPopMax = 0; this._minFloor = 0;
    this._minMeals0 = this.luckMeals; this._minLuck0 = this.luckExpected;
    this._minAdultMeals0 = this.adultMeals; this._minAdultHungry0 = this.adultHungry;
    this._minGhostMeals0 = this._ghostMeals || 0; this._minGhostHungry0 = this._ghostHungry || 0;
    this._minSteerSeen = 0; this._minSteerHit = 0; this._minSteerLuck = 0;
    this._minBabyDeaths = 0; this._minBabyUnfed = 0;
    this._minEaten = 0; this._minMeat = 0; this._minMeatBirths = 0;
    this._minPredSum = 0; this._minPredMin = Infinity; this._minPredMax = 0; this._minPreyMin = Infinity;
  },

  sample: function (world) {
    var C = GL.Config, G = GL.Genome.G;
    var list = world.creatures, n = list.length, i;
    this.population = n;

    // Generations, average traits, and steering: of the bugs that are walking and can see
    // food, how many are pointed at it (within steerConeDeg either side of straight ahead)?
    var maxGen = 0, genSum = 0, sp = 0, sp2 = 0, fast = 0, tu = 0, sz = 0, si = 0, di = 0;
    var cone = C.steerConeDeg * Math.PI / 180, seen = 0, hit = 0, luck = 0;
    var champ = 0, champScore = -1, bw = C.championBabyWeight, mw = C.championMinuteWeight / 60;
    var pred = 0, pSp = 0, pSz = 0, qSp = 0, qSz = 0, pSeen = 0, pHit = 0;
    for (i = 0; i < n; i++) {
      var c = list[i];
      var score = c.babies * bw + c.age * mw;
      if (score > champScore) { champScore = score; champ = c.id; }
      if (c.generation > maxGen) maxGen = c.generation;
      genSum += c.generation;
      var spd = c.genes[G.SPEED];
      sp += spd; sp2 += spd * spd; if (spd >= 140) fast++;
      tu += c.genes[G.TURN];
      sz += c.genes[G.SIZE]; si += c.genes[G.SIGHT]; di += c.genes[G.DIET];
      var walking = c.lookAmount > 0 && c.thrust > 0 && c.speed > C.steerMinSpeed * c.topSpeed;
      if (c.meat) {
        pred++; pSp += spd; pSz += c.genes[G.SIZE];
        if (walking) { pSeen++; if (Math.abs(c.lookAngle) <= cone) pHit++; }
        continue;
      }
      qSp += spd; qSz += c.genes[G.SIZE];
      if (walking) {
        seen++;
        if (Math.abs(c.lookAngle) <= cone) hit++;
        luck += Math.min(1, 2 * cone / c.fov);   // pointed at it by chance: the cone's share of the view
      }
    }
    var prey = n - pred;
    this.predators = pred; this.prey = prey;
    this.predSpeed = pred ? pSp / pred : 0; this.predSize = pred ? pSz / pred : 0;
    this.preySpeed = prey ? qSp / prey : 0; this.preySize = prey ? qSz / prey : 0;
    this.predSteer = pSeen ? pHit / pSeen : 0;
    this._minPredSum += pred;
    if (pred < this._minPredMin) this._minPredMin = pred;
    if (pred > this._minPredMax) this._minPredMax = pred;
    if (prey < this._minPreyMin) this._minPreyMin = prey;
    this.maxGeneration = maxGen;
    this.championId = champ; this.championScore = champScore > 0 ? champScore : 0;
    if (maxGen > this.maxGenerationEver) this.maxGenerationEver = maxGen;
    this.avgGeneration = n ? genSum / n : 0;
    if (seen > 0) { this.steer = hit / seen; this.steerLuck = luck / seen; }
    this._minSteerSeen += seen; this._minSteerHit += hit; this._minSteerLuck += luck;

    // Live numbers over the rolling window.
    var gb = world.ghostBase;
    this._ghostMeals = gb ? gb.meals : 0; this._ghostHungry = gb ? gb.hungry : 0;
    var h = this.winHead;
    this.winFood[h] = this.foodEaten; this.winMeals[h] = this.luckMeals; this.winLuck[h] = this.luckExpected;
    this.winAdultMeals[h] = this.adultMeals; this.winAdultHungry[h] = this.adultHungry;
    this.winGhostMeals[h] = this._ghostMeals; this.winGhostHungry[h] = this._ghostHungry;
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
      this.skillLuck = expected > 0 ? (this.luckMeals - this.winMeals[oldest]) / expected : 0;
      var aH = this.adultHungry - this.winAdultHungry[oldest], gH = this._ghostHungry - this.winGhostHungry[oldest];
      this.adultRate = aH > 0 ? (this.adultMeals - this.winAdultMeals[oldest]) / aH * 60 : 0;
      this.ghostRate = gH > 0 ? (this._ghostMeals - this.winGhostMeals[oldest]) / gH * 60 : 0;
      this.skill = GL.Stats.ratio(this.adultMeals - this.winAdultMeals[oldest], aH,
                                  this._ghostMeals - this.winGhostMeals[oldest], gH);
    }

    // Per-minute summary.
    this._minPopSum += n; this._minSamples++;
    if (n < this._minPopMin) this._minPopMin = n;
    if (n > this._minPopMax) this._minPopMax = n;
    var perMinute = Math.round(60 * C.ticksPerSecond / C.statsIntervalTicks);
    if (this._minSamples >= perMinute) {
      var pop = this._minPopSum / this._minSamples;
      var luckMin = this.luckExpected - this._minLuck0;
      var aM = this.adultMeals - this._minAdultMeals0, aHm = this.adultHungry - this._minAdultHungry0;
      var gM = this._ghostMeals - this._minGhostMeals0, gHm = this._ghostHungry - this._minGhostHungry0;
      var rec = {
        minute: this.minutes.length + 1,
        population: pop,
        popEnd: n,
        popMin: this._minPopMin,
        popMax: this._minPopMax,
        floorEpisodes: this._minFloor,
        food: this._minFood,
        foodRate: pop > 0 ? this._minFood / pop : 0,                         // food per bug per minute
        skill: GL.Stats.ratio(aM, aHm, gM, gHm),                              // times faster than random brains
        skillLuck: luckMin > 0 ? (this.luckMeals - this._minMeals0) / luckMin : 0, // times faster than luck
        adultRate: aHm > 0 ? aM / aHm * 60 : 0,                               // meals per hungry minute, grown bugs
        ghostRate: gHm > 0 ? gM / gHm * 60 : 0,                               // ...and random-brain ghosts
        steer: this._minSteerSeen ? this._minSteerHit / this._minSteerSeen : 0,
        steerLuck: this._minSteerSeen ? this._minSteerLuck / this._minSteerSeen : 0,
        births: this._minBirths,
        deaths: this._minDeaths,
        babyDeaths: this._minBabyDeaths,
        babyUnfed: this._minBabyUnfed,
        arrivals: this._minArrivals,
        maxGeneration: this.maxGenerationEver,
        sprouts: world.food.sproutCount,
        avgSpeed: n ? sp / n : 0, avgSize: n ? sz / n : 0, avgSight: n ? si / n : 0,
        speedSpread: n ? Math.sqrt(Math.max(0, sp2 / n - (sp / n) * (sp / n))) : 0,  // spread of top speeds (standard deviation)
        speedHigh: n ? fast / n : 0,                                         // share of bugs with a top speed of 140 or more
        avgTurn: n ? tu / n : 0,                                             // average turn-speed gene
        avgDiet: n ? di / n : 0,
        predators: this._minPredSum / this._minSamples,                      // meat-eaters alive (average over the minute)...
        predMin: this._minPredMin, predMax: this._minPredMax, predEnd: pred, // ...lowest, highest and at the end
        preyMin: this._minPreyMin, preyEnd: prey,                            // plant-eaters: lowest and at the end
        eaten: this._minEaten, meatMeals: this._minMeat, meatBirths: this._minMeatBirths,
        predSpeed: this.predSpeed, preySpeed: this.preySpeed, predSize: this.predSize, preySize: this.preySize,
        predSteer: this.predSteer,
        species: world.species ? world.species.living : 0,
        speciesEver: world.species ? world.species.list.length : 0,
        meatSpecies: world.species ? GL.Stats.meatSpecies(world) : 0,
        biggestMeatSpecies: world.species ? GL.Stats.biggestMeat(world) : 0
      };
      this.minutes.push(rec);
      if (this.startSkill < 0) this.startSkill = rec.skill;
      this.resetMinute();
    }

    // Chart history (thinned out to every other sample once it is full).
    var hist = this.history;
    hist.time.push(world.time); hist.population.push(n); hist.sprouts.push(world.food.sproutCount);
    hist.skill.push(this.skill); hist.adultRate.push(this.adultRate); hist.ghostRate.push(this.ghostRate);
    hist.foodRate.push(this.foodRate); hist.steer.push(this.steer); hist.steerLuck.push(this.steerLuck);
    hist.speed.push(n ? sp / n : 0); hist.size.push(n ? sz / n : 0);
    hist.sight.push(n ? si / n : 0); hist.diet.push(n ? di / n : 0); hist.turn.push(n ? tu / n : 0);
    hist.births.push(this.births); hist.starvation.push(this.deaths.starvation); hist.oldAge.push(this.deaths.oldAge);
    hist.eaten.push(this.deaths.eaten); hist.disaster.push(this.deaths.disaster);
    hist.predators.push(pred); hist.species.push(world.species ? world.species.living : 0); hist.meat.push(world.food.meatCount);
    if (hist.time.length > C.statsHistoryMax) {
      for (var key in hist) {
        var arr = hist[key], out = [];
        for (i = 0; i < arr.length; i += 2) out.push(arr[i]);
        hist[key] = out;
      }
      this.historyThinned = (this.historyThinned || 0) + 1;   // lets the charts know old samples moved
    }
  }
};
