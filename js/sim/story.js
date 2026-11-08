// Genesis Lab - simulation: the story engine. Pure logic, never draws.
// Watches the world and writes short lab log lines: booms, crashes, a full
// terrarium, lifespan and family records, generation milestones and foraging
// skill milestones. (New species and extinctions arrive in Session 3.)
// It only reads the world and never draws random numbers, so the simulation
// runs exactly the same with or without it.
var GL = GL || {};

GL.Story = (function () {
  var C = GL.Config;

  function Story(world) {
    this.world = world;
    this.nextCheck = 0;
    this.boomed = false;        // the first boom has been logged
    this.full = false;          // "the terrarium is full" has been logged
    this.trend = 'up';          // after a boom we watch for a crash, after a crash for a boom
    this.hi = 0; this.lo = 0;   // highest and lowest population since the last boom or crash
    this.recordAge = 0;         // longest life so far (seconds), among bugs that died
    this.recordBabies = 0;      // most babies so far, among bugs that died
    this.pending = null;        // a record waiting for its turn in the log
    this.lastRecordTime = -1e9;
    this.genIndex = 0;          // next generation milestone
    this.skillIndex = 0;        // next foraging-skill milestone
  }

  function clock(seconds) {
    var t = Math.floor(seconds), m = Math.floor(t / 60), s = t % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function times(x) {
    var words = { 2: 'twice', 3: 'three times', 4: 'four times', 5: 'five times', 6: 'six times', 8: 'eight times', 10: 'ten times' };
    return words[x] ? words[x] + ' as fast as' : x + '× as fast as';
  }

  Story.prototype = {
    note: function (text, kind, id) {
      var w = this.world;
      w.events.note(w.time, text, kind, id || 0, w.stats.maxGenerationEver);
    },

    begin: function () {
      this.note(C.startCreatures + ' creatures with random brains released into the terrarium. None of them know how to find food yet.', 'info');
    },

    // A creature died: is it a record? (Called by world.kill.)
    onDeath: function (c) {
      var S = C.story;
      if (c.babies > this.recordBabies) {
        this.recordBabies = c.babies;
        if (c.babies >= S.recordMinBabies) this.pending = { id: c.id, age: c.age, babies: c.babies, gen: c.generation, kind: 'babies' };
      }
      if (c.age >= this.recordAge + S.recordAgeStep) {
        this.recordAge = c.age;
        if (c.age >= S.recordMinAge && (!this.pending || this.pending.kind !== 'babies'))
          this.pending = { id: c.id, age: c.age, babies: c.babies, gen: c.generation, kind: 'age' };
      }
    },

    // Look for news once a simulated second. (Called by world.step.)
    update: function () {
      var w = this.world, S = C.story;
      if (w.time < this.nextCheck) return;
      this.nextCheck = w.time + S.checkEverySec;
      var n = w.creatures.length, s = w.stats;

      // Booms and crashes.
      if (!this.boomed) {
        if (n >= S.firstBoomPop) {
          this.boomed = true; this.trend = 'up'; this.hi = this.lo = n;
          this.note('Population boom: ' + n + ' bugs alive and climbing, as the families that find food multiply.', 'boom');
        }
      } else {
        if (n > this.hi) this.hi = n;
        if (n < this.lo) this.lo = n;
        if (this.trend === 'up' && this.hi - n >= S.swingMinBugs && n <= this.hi * (1 - S.swingShare)) {
          var lost = Math.round((1 - n / this.hi) * 100);
          var why = w.lampBrightness < 0.92 ? ' as the heat lamps dimmed' : (w.food.sproutCount < n ? ' as the sprouts ran out' : '');
          this.note('Population crash: ' + lost + '% of life lost' + why + ' (' + this.hi + ' → ' + n + ' bugs).', 'crash');
          this.trend = 'down'; this.lo = n;
        } else if (this.trend === 'down' && n - this.lo >= S.swingMinBugs && n >= this.lo * (1 + S.swingShare)) {
          var why2 = w.lampBrightness > 1.05 ? ' as the heat lamps brightened' : '';
          this.note('Population boom: back from ' + this.lo + ' to ' + n + ' bugs' + why2 + '.', 'boom');
          this.trend = 'up'; this.hi = n;
        }
      }
      if (!this.full && n >= w.cap) {
        this.full = true;
        this.note('The terrarium is full: ' + n + ' bugs. From now on only the best-fed get to have babies.', 'boom');
      }

      // Records, at most one line per recordGap seconds.
      if (this.pending && w.time - this.lastRecordTime >= S.recordGap) {
        var p = this.pending;
        var kids = p.babies + (p.babies === 1 ? ' baby' : ' babies');
        this.note(p.kind === 'babies'
          ? 'Record: specimen #' + p.id + ' (gen ' + p.gen + ') had ' + kids + ', the most so far, and lived ' + clock(p.age) + '.'
          : 'Record: specimen #' + p.id + ' (gen ' + p.gen + ') lived ' + clock(p.age) + ', the longest life so far (' + kids + ').',
          'record', p.id);
        this.pending = null; this.lastRecordTime = w.time;
      }

      // Generation milestones.
      var gm = S.generationMilestones;
      if (this.genIndex < gm.length && s.maxGenerationEver >= gm[this.genIndex]) {
        while (this.genIndex + 1 < gm.length && s.maxGenerationEver >= gm[this.genIndex + 1]) this.genIndex++;
        var g = gm[this.genIndex], who = 0;
        for (var i = 0; i < n; i++) if (w.creatures[i].generation >= g) { who = w.creatures[i].id; break; }
        this.note('Generation ' + g + ' reached: one family line is now ' + g + ' parents deep' +
          (who ? ' (specimen #' + who + ').' : '.'), 'gen', who);
        this.genIndex++;
      }

      // Foraging skill milestones: the proof that they are learning.
      var sm = S.skillMilestones;
      if (w.time >= S.skillFromSec && this.skillIndex < sm.length && s.skill >= sm[this.skillIndex]) {
        while (this.skillIndex + 1 < sm.length && s.skill >= sm[this.skillIndex + 1]) this.skillIndex++;
        var x = sm[this.skillIndex];
        this.note('Foraging skill passed ' + x + '×: hungry bugs now find food ' + times(x) +
          ' random brains in the same spots.', 'skill');
        this.skillIndex++;
      }
    }
  };

  return Story;
})();
