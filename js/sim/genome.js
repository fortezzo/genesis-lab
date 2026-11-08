// Genesis Lab - simulation: genome (DNA). Pure logic, never draws.
// A creature's DNA is 9 body genes plus a 390-number brain.
// This file makes random DNA for primitive creatures and mutated copies for babies.
var GL = GL || {};

GL.Genome = (function () {
  var C = GL.Config;
  var GENES = C.genes;
  var GENE_COUNT = GENES.length;
  var NI = C.brainInputs, NH = C.brainHidden, NO = C.brainOutputs;
  var BRAIN_SIZE = NI * NH + NH + NH * NO + NO; // 300 + 12 + 72 + 6 = 390

  // Gene positions, so code can say genes[G.SIZE] instead of genes[0].
  var G = {};
  for (var i = 0; i < GENE_COUNT; i++) G[GENES[i].key.toUpperCase()] = i;

  function clampGene(i, v) {
    var g = GENES[i];
    return v < g.min ? g.min : (v > g.max ? g.max : v);
  }

  // Random genes for a brand-new primitive creature.
  function randomGenes(rng, out) {
    for (var i = 0; i < GENE_COUNT; i++) {
      var g = GENES[i];
      out[i] = rng.range(g.startMin, g.startMax);
    }
    if (!C.meatEating) out[G.DIET] = 0;
    return out;
  }

  // A random brain: every connection strength drawn from a bell curve.
  function randomBrain(rng, out) {
    var lim = C.brainLimit, s = C.brainInitSpread;
    for (var i = 0; i < BRAIN_SIZE; i++) {
      var v = rng.gauss() * s;
      out[i] = v < -lim ? -lim : (v > lim ? lim : v);
    }
    return out;
  }

  // Copy the parent's DNA into the baby's, with mutations.
  // Each number changes with a chance equal to the parent's mutation-rate gene.
  function inherit(rng, pGenes, pBrain, outGenes, outBrain) {
    var rate = pGenes[G.MUTATION];
    var i, g, v;
    for (i = 0; i < GENE_COUNT; i++) {
      v = pGenes[i];
      if (rng.next() < rate) {
        g = GENES[i];
        if (rng.next() < C.geneJumpChance) v = rng.range(g.min, g.max);       // rare big jump
        else v += rng.gauss() * C.geneNudge * (g.max - g.min);                // usual small nudge
        v = clampGene(i, v);
      }
      outGenes[i] = v;
    }
    if (!C.meatEating) outGenes[G.DIET] = 0;

    var lim = C.brainLimit, nudge = C.brainNudge, reset = C.brainResetChance, spread = C.brainInitSpread;
    for (i = 0; i < BRAIN_SIZE; i++) {
      v = pBrain[i];
      if (rng.next() < rate) {
        if (rng.next() < reset) v = rng.gauss() * spread;                     // fresh random value
        else v += rng.gauss() * nudge;                                         // small nudge
        v = v < -lim ? -lim : (v > lim ? lim : v);
      }
      outBrain[i] = v;
    }
  }

  return {
    GENES: GENES, GENE_COUNT: GENE_COUNT, BRAIN_SIZE: BRAIN_SIZE, G: G,
    randomGenes: randomGenes, randomBrain: randomBrain, inherit: inherit, clampGene: clampGene
  };
})();
