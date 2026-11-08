// Genesis Lab - simulation: species. Pure logic, never draws.
// Every species remembers its founder's DNA. A baby is compared with its species'
// founder (genetic distance, genome.js); more than splitDistance away, it starts a new
// species with itself as the founder, unless it is close enough to another living
// species of the same diet to join that one (two cousins that split at the same time
// stay one species). A baby born with the other diet (plants vs meat) always starts a
// new species: that is the biggest change a bug can make.
// The 90 starting bugs (and newcomers) belong to the first species, but each of them is
// compared with its own random DNA, because they are not related to each other.
// Colours show family: a new species takes its parent species' colour, nudged slightly;
// plant-eaters stay cyan-to-blue and meat-eaters magenta-to-orange.
// Names and colours use the species' own random numbers, so the simulation runs the
// same whatever the names are.
var GL = GL || {};

GL.Species = (function () {
  var C = GL.Config, S = C.species, G = GL.Genome.G;
  var TIMES_MAX = 1800;          // species history samples kept (an hour at one per 2 s), thinned when full

  function Species(world) {
    this.world = world;
    this.rng = new GL.RNG((world.seed ^ 0x5BEC1E5) >>> 0);
    this.list = [];              // every species ever; list[id - 1] has that id
    this.founders = [];          // founder DNA: { genes, brain, speciesId }
    this.used = {};              // names already used in this world
    this.living = 0;             // species with at least one member alive
    this.times = [];             // when each history sample was taken (shared by every species)
    this.sampleTick = 0;
    this.first = null;           // the starting species
  }

  function wrap(h) { return ((h % 360) + 360) % 360; }

  Species.prototype = {
    get: function (id) { return id > 0 ? this.list[id - 1] || null : null; },

    // ---------------------------------------------------------- new species
    create: function (founder, parent, origin, opts) {
      opts = opts || {};
      var rng = this.rng, meat = founder.genes[G.DIET] >= S.meatDiet, hue;
      var lo = meat ? C.meatHueMin : C.plantHueMin, hi = meat ? C.meatHueMax : C.plantHueMax;
      if (opts.hue !== undefined) {
        hue = opts.hue;
        if (meat && hue < lo - 1) hue += 360;                      // keep meat hues in their (wrapped) range
      } else if (parent && parent.meat === meat) {
        hue = parent.hue + (rng.next() * 2 - 1) * S.hueStep;      // related species look related
        if (hue < lo) hue = lo + (lo - hue);                       // bounce off the ends of the range
        if (hue > hi) hue = hi - (hue - hi);
        hue = Math.max(lo, Math.min(hi, hue));
      } else {
        hue = meat ? lo + 8 + rng.next() * 18 : lo + rng.next() * (hi - lo);   // a new meat line starts magenta-red
      }
      var keep = parent && parent.meat === meat && rng.next() < S.genusKeep ? parent.genus : null;
      var nm = opts.name && !this.used[opts.name] ? { name: opts.name, genus: opts.name.split(' ')[0] } : GL.Names.make(rng, meat, keep, this.used);
      if (opts.name) this.used[nm.name] = true;
      var w = this.world;
      var sp = {
        id: this.list.length + 1, name: nm.name, genus: nm.genus, meat: meat, hue: hue,
        parentId: parent ? parent.id : 0, origin: origin || 'evolved',
        bornAt: w.time, extinctAt: -1, founderId: founder.id || 0, founderGen: founder.generation || 0,
        founderIdx: -1, count: 0, peak: 0, total: 0, maxGen: founder.generation || 0,
        announced: false, histStart: this.times.length, hist: [], kills: 0
      };
      if (origin !== 'primordial') sp.founderIdx = this.addFounder(founder.genes, founder.brain, sp.id);
      this.list.push(sp);
      return sp;
    },

    addFounder: function (genes, brain, speciesId) {
      this.founders.push({ genes: new Float32Array(genes), brain: new Float32Array(brain), speciesId: speciesId });
      return this.founders.length - 1;
    },

    join: function (c, sp, founderIdx) {
      c.speciesId = sp.id;
      c.founderIdx = founderIdx;
      if (sp.count === 0) { if (sp.extinctAt >= 0) sp.extinctAt = -1; this.living++; }
      sp.count++; sp.total++;
      if (sp.count > sp.peak) sp.peak = sp.count;
      if (c.generation > sp.maxGen) sp.maxGen = c.generation;
      var hue = sp.hue + ((((c.id * 2654435761) >>> 0) % 1000) / 1000 * 2 - 1) * C.hueDrift;
      c.hue = wrap(hue);
    },

    // A primitive creature (one of the starters, or a newcomer): the first species, compared with its own DNA.
    assignPrimitive: function (c) {
      var sp = this.first;
      if (!sp || (sp.count === 0 && sp.extinctAt >= 0)) {
        // The first species has died out: newcomers start a species of wanderers of their own.
        sp = this.create(c, null, 'primordial', sp ? { name: this.newcomerName() } : { name: this.firstName() });
        this.first = sp;
      }
      this.join(c, sp, this.addFounder(c.genes, c.brain, sp.id));
    },
    firstName: function () { return GL.Names.make(this.rng, false, null, null).genus + ' prima'; },
    newcomerName: function () { return GL.Names.make(this.rng, false, null, null).genus + ' advena'; },

    // A baby: stays in its parent's species unless it drifted too far from the founder.
    assignBaby: function (c, p) {
      var sp = this.get(p.speciesId), f = this.founders[p.founderIdx];
      var meat = c.genes[G.DIET] >= S.meatDiet;
      if (!sp || !f) { var fresh = this.create(c, sp, 'evolved'); this.join(c, fresh, fresh.founderIdx); return; }
      var d = meat === sp.meat ? GL.Genome.distance(c.genes, c.brain, f.genes, f.brain) : 2;
      if (d <= S.splitDistance) { this.join(c, sp, p.founderIdx); return; }
      // Too far: join the closest living species of the same diet if its founder is near enough...
      var best = null, bestD = S.splitDistance, list = this.list;
      for (var i = list.length - 1; i >= 0; i--) {
        var s = list[i];
        if (s.count <= 0 || s.meat !== meat || s.founderIdx < 0 || s === sp) continue;
        var g = this.founders[s.founderIdx], dd = GL.Genome.distance(c.genes, c.brain, g.genes, g.brain);
        if (dd < bestD) { bestD = dd; best = s; }
      }
      if (best) { this.join(c, best, best.founderIdx); return; }
      // ...otherwise it founds a new species.
      var ns = this.create(c, sp, 'evolved');
      this.join(c, ns, ns.founderIdx);
    },

    // A creature placed by the experimenter (Predator drop, Hall of Fame): its own new species,
    // or a living species it was copied from.
    assignPlaced: function (c, origin, opts) {
      var sp = opts && opts.joinId ? this.get(opts.joinId) : null;
      if (sp && sp.count > 0 && sp.founderIdx >= 0) { this.join(c, sp, sp.founderIdx); return sp; }
      sp = opts && opts.speciesRef && opts.speciesRef.origin === origin && opts.speciesRef.count > 0 ? opts.speciesRef : null;
      // Close enough to a living species (for example a Hall of Fame bug brought back to its own world)? Rejoin it.
      if (!sp) {
        var meat = c.genes[G.DIET] >= S.meatDiet, bestD = S.splitDistance, list = this.list;
        for (var i = 0; i < list.length; i++) {
          var s = list[i];
          if (s.count <= 0 || s.meat !== meat || s.founderIdx < 0) continue;
          var f = this.founders[s.founderIdx], d = GL.Genome.distance(c.genes, c.brain, f.genes, f.brain);
          if (d < bestD) { bestD = d; sp = s; }
        }
      }
      if (!sp) sp = this.create(c, null, origin, opts);
      this.join(c, sp, sp.founderIdx);
      return sp;
    },

    onDeath: function (c) {
      var sp = this.get(c.speciesId);
      if (!sp) return;
      sp.count--;
      if (sp.count <= 0) { sp.count = 0; sp.extinctAt = this.world.time; this.living--; }
    },

    // ------------------------------------------------------------- history
    // Every few stats samples: record each living species' population (for the streamgraph and family tree).
    sample: function () {
      if (++this.sampleTick % S.historyEvery !== 0 && this.times.length) return;
      var t = this.world.time, k = this.times.length, list = this.list;
      this.times.push(t);
      for (var i = 0; i < list.length; i++) {
        var sp = list[i];
        var end = sp.histStart + sp.hist.length;                // the next sample index this species would fill
        if (sp.count > 0) {
          if (sp.hist.length === 0) sp.histStart = k;
          else while (end < k) { sp.hist.push(0); end++; }       // it had died out and came back (rare)
          sp.hist.push(sp.count);
        } else if (sp.hist.length && end === k && sp.hist[sp.hist.length - 1] > 0) {
          sp.hist.push(0);                                       // one last zero, so its band tapers off
        }
      }
      if (this.times.length > TIMES_MAX) this.thin();
    },
    // Keep every other sample (and adjust where each species' history starts).
    thin: function () {
      var keep = [], i, list = this.list;
      for (i = 0; i < this.times.length; i += 2) keep.push(this.times[i]);
      for (i = 0; i < list.length; i++) {
        var sp = list[i], start = sp.histStart, out = [];
        for (var k = 0; k < sp.hist.length; k++) if ((start + k) % 2 === 0) out.push(sp.hist[k]);
        sp.histStart = Math.ceil(start / 2);
        sp.hist = out;
      }
      this.times = keep;
      this.thinned = (this.thinned || 0) + 1;
    },
    // A species' population at history sample k (0 outside its life).
    countAt: function (sp, k) {
      var j = k - sp.histStart;
      return j >= 0 && j < sp.hist.length ? sp.hist[j] : 0;
    }
  };

  return Species;
})();
