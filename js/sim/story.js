// Genesis Lab - simulation: the story engine. Pure logic, never draws.
// Watches the world and writes short lab log lines: booms, crashes (and what
// caused them), a full terrarium, lifespan and family records, generation and
// foraging-skill milestones, new species, extinctions, the first meat-eater, and
// what the experimenter did in god mode.
// It only reads the world and never draws random numbers, so the simulation
// runs exactly the same with or without it.
var GL = GL || {};

GL.Story = (function () {
  var C = GL.Config;
  var WINDOW = 30;              // seconds of deaths remembered, to tell what caused a crash

  function Story(world) {
    this.world = world;
    this.nextCheck = 0;
    this.boomed = false;        // the first boom has been logged
    this.full = false;          // "the terrarium is full" has been logged
    this.trend = 'up';          // after a boom we watch for a crash, after a crash for a boom
    this.hi = 0; this.lo = 0;   // highest and lowest population since the last boom or crash
    this.recordAge = 0;         // longest life so far (seconds), among bugs that died
    this.recordBabies = 0;      // most babies so far, among bugs that died
    this.recordKills = 0;       // most kills so far, among meat-eaters that died
    this.pending = null;        // a record waiting for its turn in the log
    this.lastRecordTime = -1e9;
    this.genIndex = 0;          // next generation milestone
    this.skillIndex = 0;        // next foraging-skill milestone
    this.speciesSeen = 0;       // species looked at so far
    this.watch = [];            // new species not yet announced
    this.announced = [];        // announced species still alive (watched for extinction)
    this.firstMeat = false;     // the first meat-eater has been logged
    this.predatorsSeen = false; // meat-eaters have been announced (so their disappearance is news)
    this.deathRing = [];        // [eaten, all deaths] once a second, for the last WINDOW seconds
  }

  function clock(seconds) {
    var t = Math.floor(seconds), m = Math.floor(t / 60), s = t % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function times(x) {
    var words = { 2: 'twice', 3: 'three times', 4: 'four times', 5: 'five times', 6: 'six times', 8: 'eight times', 10: 'ten times' };
    return words[x] ? words[x] + ' as fast as' : x + '× as fast as';
  }
  function deathsTotal(d) { return d.starvation + d.eaten + d.oldAge + d.disaster; }

  Story.prototype = {
    note: function (text, kind, id, speciesId) {
      var w = this.world;
      w.events.note(w.time, text, kind, id || 0, w.stats.maxGenerationEver, speciesId || 0);
    },

    begin: function () {
      var first = this.world.species.first;
      this.note(C.startCreatures + ' creatures with random brains released into the terrarium' +
        (first ? ' (the first species, ' + first.name + ')' : '') + '. None of them know how to find food yet.', 'info', 0, first ? first.id : 0);
      this.speciesSeen = this.world.species.list.length;
      if (first) { first.announced = true; this.announced.push(first); }
    },

    // A creature died: is it a record? (Called by world.kill.)
    onDeath: function (c) {
      var S = C.story;
      if (c.babies > this.recordBabies) {
        this.recordBabies = c.babies;
        if (c.babies >= S.recordMinBabies) this.pending = { id: c.id, age: c.age, babies: c.babies, gen: c.generation, kind: 'babies' };
      }
      if (c.meat && c.kills > this.recordKills) {
        this.recordKills = c.kills;
        if (c.kills >= S.recordMinKills && (!this.pending || this.pending.kind !== 'babies'))
          this.pending = { id: c.id, age: c.age, babies: c.babies, kills: c.kills, gen: c.generation, kind: 'kills' };
      }
      if (c.age >= this.recordAge + S.recordAgeStep) {
        this.recordAge = c.age;
        if (c.age >= S.recordMinAge && !this.pending)
          this.pending = { id: c.id, age: c.age, babies: c.babies, gen: c.generation, kind: 'age' };
      }
    },

    // What caused a crash, in a few words: any disaster still going on or just over, else hunting, the lamps or hunger.
    crashCause: function () {
      var w = this.world, g = w.god, D = C.god, t = w.time, when = g.when, causes = [];
      if (g.drought > 0 || (when.drought !== undefined && t - when.drought < D.droughtSeconds + 60)) causes.push('the drought');
      if (g.ice > 0 || g.iceLevel > 0.05 || (when['ice age'] !== undefined && t - when['ice age'] < D.iceSeconds + 60)) causes.push('the ice age');
      var meteor = when['meteor strike'] !== undefined && t - when['meteor strike'] < 40;
      if (causes.length) return ' in ' + causes.join(' and ') + (meteor ? ', after a meteor strike' : '');
      if (meteor) return ' after the meteor strike';
      var r = this.deathRing;
      if (r.length > 1) {
        var a = r[0], b = r[r.length - 1], eaten = b[0] - a[0], all = b[1] - a[1];
        if (all > 10 && eaten / all > 0.35) return ' as the meat-eaters hunted';
      }
      if (w.lampBrightness < 0.92) return ' as the heat lamps dimmed';
      if (w.food.sproutCount < w.creatures.length) return ' as the sprouts ran out';
      return '';
    },

    // Look for news once a simulated second. (Called by world.step.)
    update: function () {
      var w = this.world, S = C.story;
      if (w.time < this.nextCheck) return;
      this.nextCheck = w.time + S.checkEverySec;
      var n = w.creatures.length, s = w.stats;
      this.deathRing.push([s.deaths.eaten, deathsTotal(s.deaths)]);
      if (this.deathRing.length > WINDOW) this.deathRing.shift();

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
          this.note('Population crash: ' + lost + '% of life lost' + this.crashCause() + ' (' + this.hi + ' → ' + n + ' bugs).', 'crash');
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

      this.speciesNews();

      // Records, at most one line per recordGap seconds.
      if (this.pending && w.time - this.lastRecordTime >= S.recordGap) {
        var p = this.pending;
        var kids = p.babies + (p.babies === 1 ? ' baby' : ' babies');
        this.note(p.kind === 'babies'
          ? 'Record: specimen #' + p.id + ' (gen ' + p.gen + ') had ' + kids + ', the most so far, and lived ' + clock(p.age) + '.'
          : p.kind === 'kills'
          ? 'Record: meat-eater #' + p.id + ' (gen ' + p.gen + ') made ' + p.kills + ' kills, the most so far, and lived ' + clock(p.age) + '.'
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
    },

    // New species (announced once they have a few members), extinctions and the first meat-eater.
    speciesNews: function () {
      var w = this.world, sp = w.species, list = sp.list, S = C.species, i, x;
      for (; this.speciesSeen < list.length; this.speciesSeen++) {
        x = list[this.speciesSeen];
        if (x.origin === 'dropped' || x.origin === 'hall') { this.announced.push(x); x.announced = true; continue; }   // god mode says so itself
        this.watch.push(x);
        if (x.meat && !this.firstMeat) {
          this.firstMeat = true;
          this.note('Gen ' + x.founderGen + ' · A gut switch: specimen #' + x.founderId + ' was born a meat-eater, the first one. ' +
            'Its brain still steers toward food, and to it, other bugs are food now.', 'meat', x.founderId, x.id);
        }
      }
      for (i = this.watch.length - 1; i >= 0; i--) {
        x = this.watch[i];
        if (x.peak >= S.logMinMembers) {
          this.watch.splice(i, 1); x.announced = true; this.announced.push(x);
          var parent = sp.get(x.parentId);
          this.note('Gen ' + x.founderGen + ' · New species: ' + x.name + ', a ' + (x.meat ? 'meat-eater' : 'plant-eater') +
            (parent ? ', branching off ' + parent.name : '') + '.', x.meat ? 'meat' : 'species', x.count > 0 ? x.founderId : 0, x.id);
          if (x.meat) this.predatorsSeen = true;
        } else if (x.count === 0) this.watch.splice(i, 1);        // died out before it really began
      }
      for (i = this.announced.length - 1; i >= 0; i--) {
        x = this.announced[i];
        if (x.count > 0) continue;
        this.announced.splice(i, 1);
        var gens = Math.max(1, x.maxGen - x.founderGen);
        this.note(x.name + ' went extinct after ' + gens + (gens === 1 ? ' generation' : ' generations') +
          ' (it lived ' + clock(w.time - x.bornAt) + ', at most ' + x.peak + ' alive at once).', 'extinct', 0, x.id);
      }
      if (this.predatorsSeen && w.stats.predators === 0) {
        var anyMeat = false;
        for (i = 0; i < w.creatures.length; i++) if (w.creatures[i].meat) { anyMeat = true; break; }
        if (!anyMeat) {
          this.predatorsSeen = false;
          this.note('The last meat-eater is gone: the plant-eaters are safe, until the next gut switch.', 'meat');
        }
      }
    }
  };

  return Story;
})();
