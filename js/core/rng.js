// Genesis Lab - core: seeded random numbers.
// The same seed always gives the same sequence, so the same seed and
// settings always give the same world. Uses the small, fast "sfc32"
// generator, seeded through a hash so that nearby seeds look unrelated.
var GL = GL || {};

GL.RNG = function (seed) {
  this.seed = seed >>> 0;
  // Spread the seed into four 32-bit words of state.
  var h = this.seed ^ 0x9E3779B9;
  function mix() {
    h = (h + 0x6D2B79F5) | 0;
    var t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }
  this.a = mix(); this.b = mix(); this.c = mix(); this.d = mix();
  this._spare = 0;
  this._hasSpare = false;
  for (var i = 0; i < 12; i++) this.next(); // warm up
};

GL.RNG.prototype = {
  // A random number from 0 (inclusive) to 1 (exclusive).
  next: function () {
    var a = this.a, b = this.b, c = this.c, d = this.d;
    var t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return (t >>> 0) / 4294967296;
  },
  // A random number between lo and hi.
  range: function (lo, hi) { return lo + (hi - lo) * this.next(); },
  // A random whole number from 0 to n - 1.
  int: function (n) { return Math.floor(this.next() * n); },
  // True with probability p.
  chance: function (p) { return this.next() < p; },
  // A bell-curve random number with average 0 and spread 1 (Box-Muller).
  gauss: function () {
    if (this._hasSpare) { this._hasSpare = false; return this._spare; }
    var u = 0, v = 0, s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    var m = Math.sqrt(-2 * Math.log(s) / s);
    this._spare = v * m;
    this._hasSpare = true;
    return u * m;
  },
  // A random angle in radians.
  angle: function () { return this.next() * Math.PI * 2; }
};

// A random seed for a new world when none is given (uses the browser's randomness).
GL.RNG.randomSeed = function () {
  return (Math.floor(Math.random() * 900000) + 100000) >>> 0;
};
