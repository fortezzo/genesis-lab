// Genesis Lab - headless test: runs the simulation with no drawing and builds a report.
// Used by tools/headless.html (in a browser) and tools/headless-cli.js (in a terminal),
// so both always run exactly the same simulation code.
var GL = GL || {};

GL.Headless = (function () {
  var C = GL.Config;
  var CLICK_EVERY = 10;        // seconds between pretend "viewer clicks a random adult" samples...
  var CLICK_FROM = 180;        // ...starting at minute 3
  var HORIZON = 120;           // only judge clicks and babies at least this long before the run ends
  var BOOM_POP = 150;          // the population "booms" when it first reaches this many bugs
  var SWAP_MINUTES = [1, 10, 30, 60]; // brain-swap check: during these minutes...
  var SWAP_BUGS = 120;         // ...copy this many grown bugs with fresh random brains and measure them for a minute
                               // (random brains find little food late on, so fewer than ~100 gives a noisy answer)
  // Predator gate (Session 3): a meat-eater species appears by itself within GATE_MINUTES, meaning one
  // meat-eater species has at least GATE_MEMBERS alive at once, and the prey survive alongside it: the
  // plant-eaters never fall below PREY_SURVIVE from then until the end of the run.
  var GATE_MINUTES = 20, GATE_MEMBERS = 10, PREY_SURVIVE = 100;

  // Prepare one seed's run. Call advance() repeatedly until it returns true.
  function SeedRun(seed, minutes) {
    this.seed = seed;
    this.minutes = minutes;
    var w = this.world = new GL.World(seed, { cap: C.capLaptop });
    this.totalTicks = Math.round(minutes * 60 * C.ticksPerSecond);
    this.ms = 0;
    // Life stories, for the report only. The two world methods are wrapped, never changed.
    var run = this;
    this.death = new Map();    // id -> [time of death, meals eaten, age at death, cause]
    this.born = [];            // [id, time, id, time, ...] for every baby
    this.clicks = [];          // [id, time, ...]: "a viewer clicks this adult now"
    this.swaps = [];           // brain-swap check results, one per SWAP_MINUTES entry
    this.probe = null;
    this.predGateAt = -1;      // when a meat-eater species first had GATE_MEMBERS alive at once (seconds)
    this.predGateSpecies = null;
    this.preyMinAfter = Infinity; // lowest plant-eater count from then on
    var kill = w.kill, spawnBaby = w.spawnBaby;
    w.kill = function (index, cause) {
      var c = w.creatures[index];
      run.death.set(c.id, [w.time, c.foodEaten, c.age, cause]);
      return kill.call(w, index, cause);
    };
    w.spawnBaby = function (p) {
      var c = spawnBaby.call(w, p);
      if (c) run.born.push(c.id, w.time, c.meat ? 1 : 0);
      return c;
    };
  }
  // Every stats sample: has a meat-eater species reached GATE_MEMBERS, and how low have the prey gone since?
  SeedRun.prototype.watchPredators = function () {
    var w = this.world;
    if (this.predGateAt < 0) {
      var list = w.species.list;
      for (var i = 0; i < list.length; i++) {
        if (list[i].meat && list[i].count >= GATE_MEMBERS) { this.predGateAt = w.time; this.predGateSpecies = list[i]; break; }
      }
    }
    if (this.predGateAt >= 0 && w.stats.prey < this.preyMinAfter) this.preyMinAfter = w.stats.prey;
  };
  SeedRun.prototype.advance = function (maxTicks) {
    var w = this.world, t0 = now(), tps = C.ticksPerSecond;
    var end = Math.min(this.totalTicks, w.tick + maxTicks);
    var every = CLICK_EVERY * tps, from = CLICK_FROM * tps;
    while (w.tick < end) {
      this.swapCheck();
      w.step();
      if (w.tick % C.statsIntervalTicks === 0) this.watchPredators();
      if (w.tick >= from && w.tick % every === 0) {
        var list = w.creatures;
        for (var i = 0; i < list.length; i++) if (list[i].age >= C.maturityAge) this.clicks.push(list[i].id, w.time);
      }
    }
    this.swapCheck();                // a check that ends exactly at the end of the run still gets written
    this.ms += now() - t0;
    return w.tick >= this.totalTicks;
  };

  // Brain-swap check: at the start of each SWAP_MINUTES minute, copy SWAP_BUGS grown bugs (same
  // bodies, same places, same terrarium) with fresh random brains, as ghosts that only pretend to
  // eat. A minute later, compare them with the evolved bugs over the same 60 seconds.
  SeedRun.prototype.swapCheck = function () {
    var w = this.world, s = w.stats, tpm = 60 * C.ticksPerSecond, gb = w.ghostBase;
    if (this.probe && w.tick === this.probe.endTick) {
      var p = this.probe, g = p.group, d = function (now, then) { return now - then; };
      var aMeals = d(s.adultMeals, p.s.adultMeals), aHungry = d(s.adultHungry, p.s.adultHungry), aTime = d(s.adultTime, p.s.adultTime);
      var bMeals = d(gb.meals, p.s.gMeals), bHungry = d(gb.hungry, p.s.gHungry);
      this.swaps.push({
        minute: p.minute,
        evolvedPerMin: aTime > 0 ? aMeals / aTime * 60 : 0,
        randomPerMin: g.time > 0 ? g.meals / g.time * 60 : 0,
        evolvedLuck: d(s.luckExpected, p.s.luck) > 0 ? d(s.luckMeals, p.s.luckMeals) / d(s.luckExpected, p.s.luck) : 0,
        randomLuck: g.luck > 0 ? g.luckMeals / g.luck : 0,
        evolvedScore: GL.Stats.ratio(aMeals, aHungry, bMeals, bHungry),
        randomScore: GL.Stats.ratio(g.meals, g.hungry, bMeals, bHungry)
      });
      w.removeProbe(g);
      this.probe = null;
    }
    if (!this.probe && w.tick % tpm === 0 && SWAP_MINUTES.indexOf(w.tick / tpm + 1) >= 0 && w.tick + tpm <= this.totalTicks) {
      this.probe = {
        minute: w.tick / tpm + 1, endTick: w.tick + tpm,
        group: w.addProbe(SWAP_BUGS, 60, (this.seed * 7919 + w.tick) >>> 0),
        s: { adultMeals: s.adultMeals, adultHungry: s.adultHungry, adultTime: s.adultTime, luckMeals: s.luckMeals,
             luck: s.luckExpected, gMeals: gb.meals, gHungry: gb.hungry }
      };
    }
  };

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  SeedRun.prototype.result = function () {
    var w = this.world, s = w.stats, mins = s.minutes, endT = w.time, i;
    var cap = w.cap, low = cap * 0.25;
    var m1 = mins[0], m10 = mins.length >= 10 ? mins[9] : mins[mins.length - 1];
    var start = m1 ? m1.skill : 0, at10 = m10 ? m10.skill : 0;

    // A viewer clicks a random adult after minute 3: how much longer does it live?
    // (Bugs still alive at the end count as living at least until the end.)
    var rem = [];
    for (i = 0; i < this.clicks.length; i += 2) {
      var t = this.clicks[i + 1];
      if (t > endT - HORIZON) continue;
      var d = this.death.get(this.clicks[i]);
      rem.push(d ? d[0] - t : endT - t);
    }
    rem.sort(function (a, b) { return a - b; });
    var remSum = 0, over60 = 0, over90 = 0;
    for (i = 0; i < rem.length; i++) { remSum += rem[i]; if (rem[i] >= 60) over60++; if (rem[i] >= 90) over90++; }

    // Babies that never ate once (judged only for babies born well before the end), split by why they died
    // (starved, or eaten by a meat-eater before their first meal) and by diet.
    var babies = 0, unfed = 0, unfedEaten = 0, preyBabies = 0, preyUnfed = 0, predBabies = 0, predUnfed = 0;
    for (i = 0; i < this.born.length; i += 3) {
      if (this.born[i + 1] > endT - HORIZON) continue;
      babies++;
      var meatBaby = this.born[i + 2] === 1;
      if (meatBaby) predBabies++; else preyBabies++;
      var bd = this.death.get(this.born[i]);
      if (bd && bd[1] === 0) {
        unfed++;
        if (bd[3] === 'eaten') unfedEaten++;
        if (meatBaby) predUnfed++; else preyUnfed++;
      }
    }

    // How old are bugs when they die, after minute 5?
    var ages = [], oldAge = 0;
    this.death.forEach(function (d) { if (d[0] >= 300) { ages.push(d[2]); if (d[3] === 'oldAge') oldAge++; } });
    ages.sort(function (a, b) { return a - b; });

    // The start: lowest population in minutes 1-5, and the minute the population first reached BOOM_POP.
    var lowStart = Infinity, boomAt = -1;
    for (i = 0; i < Math.min(5, mins.length); i++) lowStart = Math.min(lowStart, mins[i].popMin);
    for (i = 0; i < mins.length; i++) if (mins[i].popEnd >= BOOM_POP) { boomAt = mins[i].minute; break; }

    // Food per bug per minute: where it peaked, and where it ended.
    var peak = 0, peakAt = 0;
    for (i = 0; i < mins.length; i++) if (mins[i].foodRate > peak) { peak = mins[i].foodRate; peakAt = mins[i].minute; }

    // Population band check: once the population has boomed to half the cap, it must stay within 25%-100%
    // of the cap. (It starts at half the cap because a world now begins with 90 bugs, so it can pass a quarter
    // of the cap within a minute and dip below it again while the starters die out, before any boom.)
    var establishedAt = -1, minAfter = Infinity, maxAfter = 0;
    for (i = 0; i < mins.length; i++) {
      if (establishedAt < 0 && mins[i].popEnd >= cap * 0.5) establishedAt = mins[i].minute;
      if (establishedAt >= 0 && mins[i].minute > establishedAt) {
        minAfter = Math.min(minAfter, mins[i].popMin);
        maxAfter = Math.max(maxAfter, mins[i].popMax);
      }
    }
    var floorAfter10 = 0;
    for (i = 10; i < mins.length; i++) floorAfter10 += mins[i].floorEpisodes;
    var steer1 = m1 ? m1.steer : 0, steer10 = m10 ? m10.steer : 0, luck10 = m10 ? m10.steerLuck : 0;

    // Predators: when the first meat-eater was born, when a meat-eater species first had GATE_MEMBERS alive,
    // how many there were, and whether the plant-eaters held up from then on.
    var spl = w.species.list, firstMeat = -1, meatSpeciesEver = 0, announced = 0;
    for (i = 0; i < spl.length; i++) {
      if (spl[i].meat) { meatSpeciesEver++; if (firstMeat < 0) firstMeat = spl[i].bornAt; }
      if (spl[i].peak >= C.species.logMinMembers) announced++;
    }
    var predPeak = 0, predAt20 = -1, cappedMinutes = 0, after10 = 0;
    for (i = 0; i < mins.length; i++) {
      predPeak = Math.max(predPeak, mins[i].predMax);
      if (mins[i].minute === GATE_MINUTES) predAt20 = mins[i].predEnd;
      if (mins[i].minute > 10) { after10++; if (mins[i].popMax >= cap) cappedMinutes++; }
    }
    var gateTime = this.predGateAt, preyMin = this.preyMinAfter === Infinity ? -1 : this.preyMinAfter;
    var pred = {
      firstBornMin: firstMeat < 0 ? -1 : firstMeat / 60,
      speciesAt: gateTime < 0 ? -1 : gateTime / 60,
      speciesName: this.predGateSpecies ? this.predGateSpecies.name : '',
      peak: predPeak, end: mins.length ? mins[mins.length - 1].predEnd : 0, at20: predAt20,
      preyMinAfter: preyMin,
      gate: gateTime >= 0 && gateTime <= GATE_MINUTES * 60 && preyMin >= PREY_SURVIVE,
      eaten: s.deaths.eaten, meatSpeciesEver: meatSpeciesEver,
      predSpeed: mins.length ? mins[mins.length - 1].predSpeed : 0, preySpeed: mins.length ? mins[mins.length - 1].preySpeed : 0,
      predSize: mins.length ? mins[mins.length - 1].predSize : 0, preySize: mins.length ? mins[mins.length - 1].preySize : 0
    };

    return {
      seed: this.seed, minutes: this.minutes, msPerTick: this.ms / Math.max(1, w.tick),
      cap: cap, perMinute: mins, startSkill: start, skillAt10: at10,
      ratio: start > 0 ? at10 / start : 0,
      doubled: start > 0 && at10 >= 2 * start,
      foodRate1: m1 ? m1.foodRate : 0, foodRate10: m10 ? m10.foodRate : 0, foodRatePeak: peak, foodRatePeakAt: peakAt,
      foodRateEnd: mins.length ? mins[mins.length - 1].foodRate : 0,
      steer1: steer1, steer10: steer10, steerLuck10: luck10,
      swaps: this.swaps,
      speedEnd: mins.length ? mins[mins.length - 1].avgSpeed : 0,
      speedSpreadEnd: mins.length ? mins[mins.length - 1].speedSpread : 0,
      speedHighEnd: mins.length ? mins[mins.length - 1].speedHigh : 0,
      steerRises: steer10 - steer1 >= 0.10 && steer10 - luck10 >= 0.10,
      clicks: rem.length, clickMedian: quantile(rem, 0.5), clickQuarter: quantile(rem, 0.25),
      clickMean: rem.length ? remSum / rem.length : 0,
      click60: rem.length ? over60 / rem.length : 0, click90: rem.length ? over90 / rem.length : 0,
      babies: babies, babiesUnfed: babies ? unfed / babies : 0,
      babiesUnfedEaten: babies ? unfedEaten / babies : 0, babiesUnfedStarved: babies ? (unfed - unfedEaten) / babies : 0,
      preyBabiesUnfed: preyBabies ? preyUnfed / preyBabies : 0, predBabies: predBabies, predBabiesUnfed: predBabies ? predUnfed / predBabies : 0,
      pred: pred,
      species: { ever: spl.length, announced: announced, alive: w.species.living, meat: meatSpeciesEver },
      cappedShare: after10 ? cappedMinutes / after10 : 0,
      deathAgeMedian: quantile(ages, 0.5), oldAgeShare: ages.length ? oldAge / ages.length : 0,
      lowStart: lowStart === Infinity ? 0 : lowStart, boomAt: boomAt,
      establishedAt: establishedAt,
      minAfter: minAfter === Infinity ? -1 : minAfter, maxAfter: maxAfter,
      inBand: establishedAt >= 0 && minAfter !== Infinity && minAfter >= low && maxAfter <= cap,
      floorEpisodes: s.floorEpisodes, floorAfter10: floorAfter10, arrivals: s.arrivals,
      births: s.births, deaths: s.deaths, maxGeneration: s.maxGenerationEver,
      firstMinute: mins[0], lastMinute: mins[mins.length - 1]
    };
  };

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function pad(v, n) { v = String(v); while (v.length < n) v = ' ' + v; return v; }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function pct(v) { return Math.round(v * 100) + '%'; }

  // A tiny bar chart drawn with characters, for population and skill over time.
  function spark(values) {
    var bars = ' .:-=+*#%@', max = 0, out = '';
    for (var i = 0; i < values.length; i++) max = Math.max(max, values[i]);
    for (i = 0; i < values.length; i++) out += bars[Math.min(9, Math.round(values[i] / (max || 1) * 9))];
    return out;
  }

  function formatSeed(r) {
    var L = [];
    L.push('=== Seed ' + r.seed + ' - ' + r.minutes + ' simulated minutes (' + f2(r.msPerTick) + ' ms per tick) ===');
    L.push(' min |  pop | sprouts | food/bug | skill | x luck | steering (luck) | births | deaths | eaten | gen | size | top speed (spread, 140+) | meat-eaters | species');
    for (var i = 0; i < r.perMinute.length; i++) {
      var m = r.perMinute[i];
      L.push(pad(m.minute, 4) + ' | ' + pad(Math.round(m.population), 4) + ' | ' + pad(m.sprouts, 7) + ' | ' +
        pad(f2(m.foodRate), 8) + ' | ' + pad(f1(m.skill) + 'x', 5) + ' | ' + pad(f1(m.skillLuck) + 'x', 6) + ' | ' +
        pad(pct(m.steer) + ' (' + pct(m.steerLuck) + ')', 15) + ' | ' +
        pad(m.births, 6) + ' | ' + pad(m.deaths, 6) + ' | ' + pad(m.eaten || 0, 5) + ' | ' + pad(m.maxGeneration, 3) + ' | ' + pad(f1(m.avgSize), 4) + ' | ' +
        pad(Math.round(m.avgSpeed) + ' (' + Math.round(m.speedSpread) + ', ' + pct(m.speedHigh) + ')', 24) + ' | ' +
        pad(Math.round(m.predators || 0), 11) + ' | ' + pad((m.species || 0) + (m.meatSpecies ? ' (' + m.meatSpecies + ' meat)' : ''), 7));
    }
    var pops = [], skills = [], rates = [];
    for (i = 0; i < r.perMinute.length; i++) {
      pops.push(r.perMinute[i].population); skills.push(r.perMinute[i].skill); rates.push(r.perMinute[i].foodRate);
    }
    L.push('Population      [' + spark(pops) + ']');
    L.push('Skill           [' + spark(skills) + ']');
    L.push('Food per bug    [' + spark(rates) + ']');
    L.push('Foraging skill (how many times faster than random brains a hungry bug finds food): minute 1 = ' + f2(r.startSkill) +
      'x, minute 10 = ' + f2(r.skillAt10) + 'x  ->  x' + f2(r.ratio) + (r.doubled ? '  PASS (at least doubled)' : '  FAIL (did not double)'));
    if (r.swaps.length) {
      L.push('Brain-swap check (' + SWAP_BUGS + ' grown bugs copied with fresh random brains, measured for 60 s next to the evolved bugs):');
      L.push('   minute | evolved: meals/min, x luck, skill | random brains: meals/min, x luck, skill');
      r.swaps.forEach(function (sw) {
        L.push(pad(sw.minute, 9) + ' | ' + pad(f2(sw.evolvedPerMin) + ', ' + f1(sw.evolvedLuck) + 'x, ' + f1(sw.evolvedScore) + 'x', 31) +
          ' | ' + pad(f2(sw.randomPerMin) + ', ' + f1(sw.randomLuck) + 'x, ' + f1(sw.randomScore) + 'x', 37));
      });
    }
    L.push('Food found per bug per minute: minute 1 = ' + f2(r.foodRate1) + ', peak ' + f2(r.foodRatePeak) + ' in minute ' +
      r.foodRatePeakAt + ', minute 10 = ' + f2(r.foodRate10) + ', last minute = ' + f2(r.foodRateEnd));
    L.push('Steers toward food it can see: minute 1 = ' + pct(r.steer1) + ', minute 10 = ' + pct(r.steer10) +
      ' (luck alone: ' + pct(r.steerLuck10) + ')' + (r.steerRises ? '  RISES' : '  does not clearly rise'));
    L.push('A clicked adult (after minute 3) lives on for: median ' + Math.round(r.clickMedian) + ' s, average ' +
      Math.round(r.clickMean) + ' s, a quarter die within ' + Math.round(r.clickQuarter) + ' s; ' + pct(r.click60) +
      ' last 60 s or more, ' + pct(r.click90) + ' last 90 s or more (' + r.clicks + ' clicks)');
    L.push('Babies that never ate once: ' + pct(r.babiesUnfed) + ' of ' + r.babies + ' babies (' + pct(r.babiesUnfedStarved) + ' starved, ' +
      pct(r.babiesUnfedEaten) + ' eaten first; plant-eater babies ' + pct(r.preyBabiesUnfed) + ', meat-eater babies ' + pct(r.predBabiesUnfed) +
      ' of ' + r.predBabies + ').  Deaths after minute 5: median age ' + Math.round(r.deathAgeMedian) + ' s, ' + pct(r.oldAgeShare) + ' of old age.');
    var p = r.pred;
    if (p) {
      L.push('Meat-eaters: first one born ' + (p.firstBornMin < 0 ? 'never' : 'in minute ' + f1(p.firstBornMin)) + '; a meat-eater species had ' +
        GATE_MEMBERS + ' alive ' + (p.speciesAt < 0 ? 'never' : 'in minute ' + f1(p.speciesAt) + ' (' + p.speciesName + ')') +
        '; most alive at once ' + p.peak + ', at minute ' + GATE_MINUTES + ' ' + (p.at20 < 0 ? '-' : p.at20) + ', at the end ' + p.end +
        '; ' + p.eaten + ' bugs eaten in all.');
      L.push('Prey after that: plant-eaters never fell below ' + (p.preyMinAfter < 0 ? '-' : p.preyMinAfter) +
        (p.gate ? '  PASS (meat-eater species within ' + GATE_MINUTES + ' minutes, prey above ' + PREY_SURVIVE + ')' : '  no predator gate pass') +
        '.  Last minute: meat-eaters walk at ' + Math.round(p.predSpeed) + ' and are size ' + f1(p.predSize) + ', plant-eaters ' +
        Math.round(p.preySpeed) + ' and ' + f1(p.preySize) + '.');
      L.push('Species: ' + r.species.ever + ' ever (' + r.species.announced + ' with ' + C.species.logMinMembers + '+ members, ' + r.species.meat +
        ' meat-eaters), ' + r.species.alive + ' alive at the end.  The population was at the cap in ' + pct(r.cappedShare) + ' of minutes after minute 10.');
    }
    L.push('Start: lowest population in minutes 1-5 = ' + r.lowStart + '; ' +
      (r.boomAt > 0 ? 'reached ' + BOOM_POP + ' bugs in minute ' + r.boomAt : 'never reached ' + BOOM_POP + ' bugs') + '.');
    L.push('Deaths by cause: starvation ' + r.deaths.starvation + ', old age ' + r.deaths.oldAge +
      ', eaten ' + r.deaths.eaten + ', disaster ' + r.deaths.disaster + '.  Births: ' + r.births + '.');
    L.push('Population floor: dropped below it ' + r.floorEpisodes + ' time(s) (' + r.floorAfter10 +
      ' after minute 10); ' + r.arrivals + ' primitive creatures wandered in.');
    if (r.establishedAt >= 0) {
      L.push('Population reached half the cap (' + Math.round(r.cap * 0.5) + ') in minute ' + r.establishedAt +
        '; after that it stayed between ' + r.minAfter + ' and ' + r.maxAfter +
        (r.inBand ? '  PASS (within 25%-100% of the cap)' : '  FAIL (left the 25%-100% band)'));
    } else {
      L.push('Population never reached half the cap (' + Math.round(r.cap * 0.5) + ').  FAIL');
    }
    var a = r.firstMinute, b = r.lastMinute;
    if (a && b) {
      L.push('Average genes, minute 1 -> minute ' + b.minute + ': speed ' + f1(a.avgSpeed) + ' -> ' + f1(b.avgSpeed) +
        ', size ' + f1(a.avgSize) + ' -> ' + f1(b.avgSize) + ', sight ' + f1(a.avgSight) + ' -> ' + f1(b.avgSight));
      L.push('Top speed in the last minute: average ' + Math.round(b.avgSpeed) + ' (ceiling 150), spread ' + Math.round(b.speedSpread) +
        ', ' + pct(b.speedHigh) + ' of bugs at 140 or more');
    }
    L.push('Highest generation reached: ' + r.maxGeneration);
    return L.join('\n');
  }

  function formatSummary(results) {
    var L = [];
    L.push('=== Summary ===');
    L.push('  seed | skill min 1 | skill min 10 | change | doubled? | steering 1 -> 10 | clicked adult lives | babies never ate | low pop 1-5 | ' + BOOM_POP + ' bugs by' +
      ' | meat-eater species (' + GATE_MEMBERS + '+) | prey low after | predator gate');
    var passes = 0, rises = 0, gates = 0;
    for (var i = 0; i < results.length; i++) {
      var r = results[i], p = r.pred || {};
      if (r.doubled) passes++;
      if (r.steerRises) rises++;
      if (p.gate) gates++;
      L.push(pad(r.seed, 6) + ' | ' + pad(f2(r.startSkill) + 'x', 11) + ' | ' + pad(f2(r.skillAt10) + 'x', 12) + ' | ' +
        pad('x' + f2(r.ratio), 6) + ' | ' + pad(r.doubled ? 'yes' : 'NO', 8) + ' | ' +
        pad(pct(r.steer1) + ' -> ' + pct(r.steer10), 16) + ' | ' + pad('median ' + Math.round(r.clickMedian) + ' s', 19) + ' | ' +
        pad(pct(r.babiesUnfed), 16) + ' | ' + pad(r.lowStart, 11) + ' | ' + pad(r.boomAt > 0 ? 'minute ' + r.boomAt : 'never', 11) + ' | ' +
        pad(p.speciesAt === undefined || p.speciesAt < 0 ? 'never' : 'minute ' + f1(p.speciesAt), 24) + ' | ' +
        pad(p.preyMinAfter === undefined || p.preyMinAfter < 0 ? '-' : p.preyMinAfter, 13) + ' | ' + pad(p.gate ? 'PASS' : 'no', 13));
    }
    L.push('Foraging skill doubled within 10 simulated minutes in ' + passes + ' of ' + results.length + ' seeds.');
    L.push('Steering toward food clearly rose by minute 10 in ' + rises + ' of ' + results.length + ' seeds.');
    L.push('A meat-eater species appeared by itself (' + GATE_MEMBERS + '+ alive at once) within ' + GATE_MINUTES +
      ' simulated minutes, with plant-eaters staying above ' + PREY_SURVIVE + ', in ' + gates + ' of ' + results.length + ' seeds.');
    return L.join('\n');
  }

  return { SeedRun: SeedRun, formatSeed: formatSeed, formatSummary: formatSummary };
})();
