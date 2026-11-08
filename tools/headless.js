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
    var kill = w.kill, spawnBaby = w.spawnBaby;
    w.kill = function (index, cause) {
      var c = w.creatures[index];
      run.death.set(c.id, [w.time, c.foodEaten, c.age, cause]);
      return kill.call(w, index, cause);
    };
    w.spawnBaby = function (p) {
      var c = spawnBaby.call(w, p);
      if (c) run.born.push(c.id, w.time);
      return c;
    };
  }
  SeedRun.prototype.advance = function (maxTicks) {
    var w = this.world, t0 = now(), tps = C.ticksPerSecond;
    var end = Math.min(this.totalTicks, w.tick + maxTicks);
    var every = CLICK_EVERY * tps, from = CLICK_FROM * tps;
    while (w.tick < end) {
      w.step();
      if (w.tick >= from && w.tick % every === 0) {
        var list = w.creatures;
        for (var i = 0; i < list.length; i++) if (list[i].age >= C.maturityAge) this.clicks.push(list[i].id, w.time);
      }
    }
    this.ms += now() - t0;
    return w.tick >= this.totalTicks;
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

    // Babies that never ate once (judged only for babies born well before the end).
    var babies = 0, unfed = 0;
    for (i = 0; i < this.born.length; i += 2) {
      if (this.born[i + 1] > endT - HORIZON) continue;
      babies++;
      var bd = this.death.get(this.born[i]);
      if (bd && bd[1] === 0) unfed++;
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

    return {
      seed: this.seed, minutes: this.minutes, msPerTick: this.ms / Math.max(1, w.tick),
      cap: cap, perMinute: mins, startSkill: start, skillAt10: at10,
      ratio: start > 0 ? at10 / start : 0,
      doubled: start > 0 && at10 >= 2 * start,
      foodRate1: m1 ? m1.foodRate : 0, foodRate10: m10 ? m10.foodRate : 0, foodRatePeak: peak, foodRatePeakAt: peakAt,
      foodRateEnd: mins.length ? mins[mins.length - 1].foodRate : 0,
      steer1: steer1, steer10: steer10, steerLuck10: luck10,
      steerRises: steer10 - steer1 >= 0.10 && steer10 - luck10 >= 0.10,
      clicks: rem.length, clickMedian: quantile(rem, 0.5), clickQuarter: quantile(rem, 0.25),
      clickMean: rem.length ? remSum / rem.length : 0,
      click60: rem.length ? over60 / rem.length : 0, click90: rem.length ? over90 / rem.length : 0,
      babies: babies, babiesUnfed: babies ? unfed / babies : 0,
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
    L.push(' min |  pop | sprouts | food/bug | skill | steering (luck) | births | deaths | newcomers | gen | size');
    for (var i = 0; i < r.perMinute.length; i++) {
      var m = r.perMinute[i];
      L.push(pad(m.minute, 4) + ' | ' + pad(Math.round(m.population), 4) + ' | ' + pad(m.sprouts, 7) + ' | ' +
        pad(f2(m.foodRate), 8) + ' | ' + pad(f1(m.skill) + 'x', 5) + ' | ' + pad(pct(m.steer) + ' (' + pct(m.steerLuck) + ')', 15) + ' | ' +
        pad(m.births, 6) + ' | ' + pad(m.deaths, 6) + ' | ' + pad(m.arrivals, 9) + ' | ' + pad(m.maxGeneration, 3) + ' | ' + pad(f1(m.avgSize), 4));
    }
    var pops = [], skills = [], rates = [];
    for (i = 0; i < r.perMinute.length; i++) {
      pops.push(r.perMinute[i].population); skills.push(r.perMinute[i].skill); rates.push(r.perMinute[i].foodRate);
    }
    L.push('Population      [' + spark(pops) + ']');
    L.push('Skill (x luck)  [' + spark(skills) + ']');
    L.push('Food per bug    [' + spark(rates) + ']');
    L.push('Foraging skill (how many times faster than luck a hungry bug finds food): minute 1 = ' + f2(r.startSkill) +
      'x, minute 10 = ' + f2(r.skillAt10) + 'x  ->  x' + f2(r.ratio) + (r.doubled ? '  PASS (at least doubled)' : '  FAIL (did not double)'));
    L.push('Food found per bug per minute: minute 1 = ' + f2(r.foodRate1) + ', peak ' + f2(r.foodRatePeak) + ' in minute ' +
      r.foodRatePeakAt + ', minute 10 = ' + f2(r.foodRate10) + ', last minute = ' + f2(r.foodRateEnd));
    L.push('Steers toward food it can see: minute 1 = ' + pct(r.steer1) + ', minute 10 = ' + pct(r.steer10) +
      ' (luck alone: ' + pct(r.steerLuck10) + ')' + (r.steerRises ? '  RISES' : '  does not clearly rise'));
    L.push('A clicked adult (after minute 3) lives on for: median ' + Math.round(r.clickMedian) + ' s, average ' +
      Math.round(r.clickMean) + ' s, a quarter die within ' + Math.round(r.clickQuarter) + ' s; ' + pct(r.click60) +
      ' last 60 s or more, ' + pct(r.click90) + ' last 90 s or more (' + r.clicks + ' clicks)');
    L.push('Babies that never ate once: ' + pct(r.babiesUnfed) + ' of ' + r.babies + ' babies.  Deaths after minute 5: median age ' +
      Math.round(r.deathAgeMedian) + ' s, ' + pct(r.oldAgeShare) + ' of old age.');
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
    }
    L.push('Highest generation reached: ' + r.maxGeneration);
    return L.join('\n');
  }

  function formatSummary(results) {
    var L = [];
    L.push('=== Summary ===');
    L.push('  seed | skill min 1 | skill min 10 | change | doubled? | steering 1 -> 10 | clicked adult lives | babies never ate | low pop 1-5 | ' + BOOM_POP + ' bugs by');
    var passes = 0, rises = 0;
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.doubled) passes++;
      if (r.steerRises) rises++;
      L.push(pad(r.seed, 6) + ' | ' + pad(f2(r.startSkill) + 'x', 11) + ' | ' + pad(f2(r.skillAt10) + 'x', 12) + ' | ' +
        pad('x' + f2(r.ratio), 6) + ' | ' + pad(r.doubled ? 'yes' : 'NO', 8) + ' | ' +
        pad(pct(r.steer1) + ' -> ' + pct(r.steer10), 16) + ' | ' + pad('median ' + Math.round(r.clickMedian) + ' s', 19) + ' | ' +
        pad(pct(r.babiesUnfed), 16) + ' | ' + pad(r.lowStart, 11) + ' | ' + pad(r.boomAt > 0 ? 'minute ' + r.boomAt : 'never', 11));
    }
    L.push('Foraging skill doubled within 10 simulated minutes in ' + passes + ' of ' + results.length + ' seeds.');
    L.push('Steering toward food clearly rose by minute 10 in ' + rises + ' of ' + results.length + ' seeds.');
    return L.join('\n');
  }

  return { SeedRun: SeedRun, formatSeed: formatSeed, formatSummary: formatSummary };
})();
