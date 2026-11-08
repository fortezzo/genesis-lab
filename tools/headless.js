// Genesis Lab - headless test: runs the simulation with no drawing and builds a report.
// Used by tools/headless.html (in a browser) and tools/headless-cli.js (in a terminal),
// so both always run exactly the same simulation code.
var GL = GL || {};

GL.Headless = (function () {
  var C = GL.Config;

  // Prepare one seed's run. Call advance() repeatedly until it returns true.
  function SeedRun(seed, minutes) {
    this.seed = seed;
    this.minutes = minutes;
    this.world = new GL.World(seed, { cap: C.capLaptop });
    this.totalTicks = Math.round(minutes * 60 * C.ticksPerSecond);
    this.ms = 0;
  }
  SeedRun.prototype.advance = function (maxTicks) {
    var w = this.world, t0 = now();
    var end = Math.min(this.totalTicks, w.tick + maxTicks);
    while (w.tick < end) w.step();
    this.ms += now() - t0;
    return w.tick >= this.totalTicks;
  };
  SeedRun.prototype.result = function () {
    var w = this.world, s = w.stats, mins = s.minutes;
    var cap = w.cap, low = cap * 0.25;
    var start = mins.length ? mins[0].skill : 0;
    var at10 = mins.length >= 10 ? mins[9].skill : (mins.length ? mins[mins.length - 1].skill : 0);
    var best10 = 0;
    for (var i = 0; i < Math.min(10, mins.length); i++) best10 = Math.max(best10, mins[i].skill);
    // First minute the population reached a quarter of the cap; lowest and highest after that.
    var establishedAt = -1, minAfter = Infinity, maxAfter = 0;
    for (i = 0; i < mins.length; i++) {
      if (establishedAt < 0 && mins[i].popEnd >= low) establishedAt = mins[i].minute;
      if (establishedAt >= 0 && mins[i].minute > establishedAt) {
        minAfter = Math.min(minAfter, mins[i].popMin);
        maxAfter = Math.max(maxAfter, mins[i].popMax);
      }
    }
    var floorAfter10 = 0;
    for (i = 10; i < mins.length; i++) floorAfter10 += mins[i].floorEpisodes;
    return {
      seed: this.seed, minutes: this.minutes, msPerTick: this.ms / Math.max(1, w.tick),
      cap: cap, perMinute: mins, startSkill: start, skillAt10: at10, best10: best10,
      ratio: start > 0 ? at10 / start : 0,
      doubled: start > 0 && at10 >= 2 * start,
      establishedAt: establishedAt,
      minAfter: minAfter === Infinity ? -1 : minAfter, maxAfter: maxAfter,
      inBand: establishedAt >= 0 && minAfter !== Infinity && minAfter >= low && maxAfter <= cap,
      floorEpisodes: s.floorEpisodes, floorAfter10: floorAfter10, arrivals: s.arrivals,
      births: s.births, deaths: s.deaths, maxGeneration: s.maxGeneration,
      firstMinute: mins[0], lastMinute: mins[mins.length - 1]
    };
  };

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function pad(v, n) { v = String(v); while (v.length < n) v = ' ' + v; return v; }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }

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
    L.push(' min |  pop | algae | food eaten | skill/min | births | deaths | drift-ins | max gen');
    for (var i = 0; i < r.perMinute.length; i++) {
      var m = r.perMinute[i];
      L.push(pad(m.minute, 4) + ' | ' + pad(Math.round(m.population), 4) + ' | ' + pad(m.algae, 5) + ' | ' +
        pad(m.food, 10) + ' | ' + pad(f2(m.skill), 9) + ' | ' + pad(m.births, 6) + ' | ' + pad(m.deaths, 6) + ' | ' +
        pad(m.arrivals, 9) + ' | ' + pad(m.maxGeneration, 7));
    }
    var pops = [], skills = [];
    for (i = 0; i < r.perMinute.length; i++) { pops.push(r.perMinute[i].population); skills.push(r.perMinute[i].skill); }
    L.push('Population  [' + spark(pops) + ']');
    L.push('Skill       [' + spark(skills) + ']');
    L.push('Foraging skill: minute 1 = ' + f2(r.startSkill) + ', minute 10 = ' + f2(r.skillAt10) +
      '  ->  x' + f2(r.ratio) + (r.doubled ? '  PASS (at least doubled)' : '  FAIL (did not double)'));
    L.push('Deaths by cause: starvation ' + r.deaths.starvation + ', old age ' + r.deaths.oldAge +
      ', eaten ' + r.deaths.eaten + ', disaster ' + r.deaths.disaster + '.  Births: ' + r.births + '.');
    L.push('Population floor: dropped below it ' + r.floorEpisodes + ' time(s) (' + r.floorAfter10 +
      ' after minute 10); ' + r.arrivals + ' primitive creatures drifted in.');
    if (r.establishedAt >= 0) {
      L.push('Population reached 25% of the cap (' + Math.round(r.cap * 0.25) + ') in minute ' + r.establishedAt +
        '; after that it stayed between ' + r.minAfter + ' and ' + r.maxAfter +
        (r.inBand ? '  PASS (within 25%-100% of the cap)' : '  FAIL (left the 25%-100% band)'));
    } else {
      L.push('Population never reached 25% of the cap (' + Math.round(r.cap * 0.25) + ').  FAIL');
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
    L.push('  seed | skill min 1 | skill min 10 | change | doubled? | pop min 10 | floor drops after min 10');
    var passes = 0;
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.doubled) passes++;
      var pop10 = r.perMinute.length >= 10 ? Math.round(r.perMinute[9].population) : '-';
      L.push(pad(r.seed, 6) + ' | ' + pad(f2(r.startSkill), 11) + ' | ' + pad(f2(r.skillAt10), 12) + ' | ' +
        pad('x' + f2(r.ratio), 6) + ' | ' + pad(r.doubled ? 'yes' : 'NO', 8) + ' | ' + pad(pop10, 10) + ' | ' +
        pad(r.floorAfter10, 24));
    }
    L.push('Foraging skill doubled within 10 simulated minutes in ' + passes + ' of ' + results.length + ' seeds.');
    return L.join('\n');
  }

  return { SeedRun: SeedRun, formatSeed: formatSeed, formatSummary: formatSummary };
})();
