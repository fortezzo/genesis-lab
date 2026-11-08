// Genesis Lab - simulation: genome (DNA). Pure logic, never draws.
// A creature's DNA is 9 body genes plus a 390-number brain.
// This file makes random DNA for primitive creatures and mutated copies for babies,
// measures how far apart two DNAs are (for species), and packs DNA into short
// share codes for the Hall of Fame.
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

  // Random genes for a brand-new primitive creature (always a plant-eater: meat-eaters must evolve).
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
  // Rarely (dietSwitchChance), the baby's gut switches to the opposite diet: in-between diets
  // digest both foods poorly, so meat-eaters can't evolve from plant-eaters one small step at a time.
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
    else if (rng.next() < C.dietSwitchChance) outGenes[G.DIET] = clampGene(G.DIET, 1 - outGenes[G.DIET]);

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

  // Genetic distance on a 0-1 scale: the average gene difference (each gene scaled to its range)
  // plus the average brain-number difference (scaled to the brain's -4..4 range).
  var GENE_SPAN = new Float64Array(GENE_COUNT);
  for (i = 0; i < GENE_COUNT; i++) GENE_SPAN[i] = 1 / (GENES[i].max - GENES[i].min);
  function distance(ga, ba, gb, bb) {
    var g = 0, b = 0, k;
    for (k = 0; k < GENE_COUNT; k++) { var d = ga[k] - gb[k]; g += (d < 0 ? -d : d) * GENE_SPAN[k]; }
    for (k = 0; k < BRAIN_SIZE; k++) { var e = ba[k] - bb[k]; b += e < 0 ? -e : e; }
    return g / GENE_COUNT + b / (BRAIN_SIZE * 2 * C.brainLimit);
  }

  // ------------------------------------------------------------ share codes
  // A creature packed into bytes, then into base64 text: "GL1." + base64.
  // Bytes: version, 9 genes as 16-bit shares of their range, 390 brain numbers as 8-bit steps
  // across -4..4 (fine enough: a mutation nudges by about 0.3), the colour, its species name
  // (length + letters), and a checksum.
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function toB64(bytes) {
    var out = '', i;
    for (i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '';
      out += i + 2 < bytes.length ? B64[n & 63] : '';
    }
    return out;
  }
  function fromB64(text) {
    var vals = [], i;
    for (i = 0; i < text.length; i++) {
      var k = B64.indexOf(text[i]);
      if (k < 0) return null;
      vals.push(k);
    }
    var bytes = [];
    for (i = 0; i < vals.length; i += 4) {
      var n = (vals[i] << 18) | ((vals[i + 1] || 0) << 12) | ((vals[i + 2] || 0) << 6) | (vals[i + 3] || 0);
      bytes.push((n >> 16) & 255);
      if (i + 2 < vals.length) bytes.push((n >> 8) & 255);
      if (i + 3 < vals.length) bytes.push(n & 255);
    }
    return bytes;
  }
  var DNA_BYTES = 1 + GENE_COUNT * 2 + BRAIN_SIZE + 1;          // version, genes, brain, colour
  function encode(genes, brain, hue, name) {
    var bytes = [1], i, lim = C.brainLimit;
    for (i = 0; i < GENE_COUNT; i++) {
      var t = Math.round((genes[i] - GENES[i].min) * GENE_SPAN[i] * 65535);
      t = t < 0 ? 0 : (t > 65535 ? 65535 : t);
      bytes.push(t >> 8, t & 255);
    }
    for (i = 0; i < BRAIN_SIZE; i++) {
      var b = Math.round((brain[i] + lim) / (2 * lim) * 255);
      bytes.push(b < 0 ? 0 : (b > 255 ? 255 : b));
    }
    bytes.push(Math.round((((hue % 360) + 360) % 360) / 360 * 255) & 255);
    var text = String(name || '').replace(/[^ -~]/g, '').slice(0, 40);      // plain letters only
    bytes.push(text.length);
    for (i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i));
    var sum = 0;
    for (i = 0; i < bytes.length; i++) sum = (sum + bytes[i] * (i % 7 + 1)) & 255;
    bytes.push(sum);
    return 'GL1.' + toB64(bytes);
  }
  // Returns { genes, brain, hue, name } or null if the code is broken.
  function decode(code) {
    code = String(code || '').replace(/\s+/g, '');
    if (code.indexOf('GL1.') !== 0) return null;
    var bytes = fromB64(code.slice(4));
    if (!bytes || bytes.length < DNA_BYTES + 2 || bytes[0] !== 1) return null;
    var nameLen = bytes[DNA_BYTES];
    if (bytes.length !== DNA_BYTES + 1 + nameLen + 1) return null;
    var sum = 0, i;
    for (i = 0; i < bytes.length - 1; i++) sum = (sum + bytes[i] * (i % 7 + 1)) & 255;
    if (sum !== bytes[bytes.length - 1]) return null;
    var genes = new Float32Array(GENE_COUNT), brain = new Float32Array(BRAIN_SIZE), p = 1, lim = C.brainLimit;
    for (i = 0; i < GENE_COUNT; i++, p += 2) genes[i] = GENES[i].min + ((bytes[p] << 8) | bytes[p + 1]) / 65535 * (GENES[i].max - GENES[i].min);
    for (i = 0; i < BRAIN_SIZE; i++, p++) brain[i] = bytes[p] / 255 * 2 * lim - lim;
    var hue = bytes[p++] / 255 * 360, name = '';
    p++;                                                              // the name's length
    for (i = 0; i < nameLen; i++, p++) name += String.fromCharCode(bytes[p]);
    return { genes: genes, brain: brain, hue: hue, name: name };
  }

  return {
    GENES: GENES, GENE_COUNT: GENE_COUNT, BRAIN_SIZE: BRAIN_SIZE, G: G,
    randomGenes: randomGenes, randomBrain: randomBrain, inherit: inherit, clampGene: clampGene,
    distance: distance, encode: encode, decode: decode
  };
})();
