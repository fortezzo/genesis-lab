// Genesis Lab - core: smooth noise.
// Seeded 3D gradient ("Perlin") noise. Smooth hills and valleys of values
// between about -1 and 1, used for the slow wandering and waxing and waning
// of the heat lamps.
var GL = GL || {};

GL.Noise = (function () {
  function Noise(rng) {
    var p = new Uint8Array(256);
    for (var i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { // shuffle with the seeded random numbers
      var j = Math.floor(rng.next() * (i + 1));
      var t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(t, a, b) { return a + t * (b - a); }
  function grad(hash, x, y, z) {
    var h = hash & 15;
    var u = h < 8 ? x : y;
    var v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  Noise.prototype = {
    // 3D noise at (x, y, z). Returns roughly -1..1.
    noise3: function (x, y, z) {
      var perm = this.perm;
      var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
      x -= X; y -= Y; z -= Z;
      X &= 255; Y &= 255; Z &= 255;
      var u = fade(x), v = fade(y), w = fade(z);
      var A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
      var B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
      return lerp(w,
        lerp(v, lerp(u, grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z)),
                lerp(u, grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z))),
        lerp(v, lerp(u, grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1)),
                lerp(u, grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1))));
    },
    // 1D noise along a line, one "lane" per thing that wanders (handy for slow drifting values).
    noise1: function (x, lane) { return this.noise3(x, lane * 7.31 + 0.5, 0.5); }
  };

  return Noise;
})();
