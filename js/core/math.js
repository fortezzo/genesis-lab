// Genesis Lab - core: small math helpers shared by the simulation and the drawing code.
var GL = GL || {};

GL.M = (function () {
  var TAU = Math.PI * 2;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  // Wrap an angle into -PI..PI.
  function wrapAngle(a) {
    a = a % TAU;
    if (a > Math.PI) a -= TAU;
    else if (a < -Math.PI) a += TAU;
    return a;
  }
  // Fast atan2 (error under 0.005 radians), used for the view slices.
  function fastAtan2(y, x) {
    var ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
    if (ax === 0 && ay === 0) return 0;
    var a = ax < ay ? ax / ay : ay / ax;
    var s = a * a;
    var r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
    if (ay > ax) r = 1.57079637 - r;
    if (x < 0) r = 3.14159274 - r;
    if (y < 0) r = -r;
    return r;
  }
  // Colour helpers: hue 0-360, saturation and lightness 0-1. Returns [r, g, b] 0-255.
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  function rgba(rgb, a) { return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')'; }
  function hexToRgb(hex) {
    var n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  return {
    TAU: TAU, clamp: clamp, lerp: lerp, smoothstep: smoothstep, wrapAngle: wrapAngle,
    fastAtan2: fastAtan2, hslToRgb: hslToRgb, rgba: rgba, hexToRgb: hexToRgb
  };
})();
