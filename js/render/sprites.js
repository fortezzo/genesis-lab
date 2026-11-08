// Genesis Lab - drawing: pre-rendered glow sprites.
// Soft glows are expensive to draw from scratch, so each one is painted once
// onto a small hidden canvas and then stamped many times per frame.
// Colours are cached in hue buckets, so related creatures share sprites.
var GL = GL || {};

GL.Sprites = (function () {
  var M = GL.M;
  var cache = {};
  var HUE_STEP = 3;          // hue bucket size in degrees

  function makeCanvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }
  function hueKey(h) { return Math.round(h / HUE_STEP) * HUE_STEP; }

  // A soft round glow: bright centre fading to nothing.
  function glow(hue, sat, light) {
    var key = 'g' + hueKey(hue) + '_' + sat + '_' + light;
    if (cache[key]) return cache[key];
    var size = 64, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var rgb = M.hslToRgb(hueKey(hue), sat, light);
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, M.rgba(rgb, 1));
    grad.addColorStop(0.18, M.rgba(rgb, 0.55));
    grad.addColorStop(0.45, M.rgba(rgb, 0.16));
    grad.addColorStop(1, M.rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache[key] = c);
  }

  // A creature body: translucent membrane, a brighter rim and a glowing nucleus.
  // Drawn at radius 48 inside a 128 canvas (the extra room is for the soft edge).
  var BODY_SIZE = 128, BODY_R = 48;
  function body(hue) {
    var key = 'b' + hueKey(hue);
    if (cache[key]) return cache[key];
    var c = makeCanvas(BODY_SIZE), g = c.getContext('2d'), m = BODY_SIZE / 2, h = hueKey(hue);
    var rim = M.hslToRgb(h, 1, 0.62), fill = M.hslToRgb(h, 0.9, 0.45), core = M.hslToRgb(h, 1, 0.82);
    // Membrane fill: darker in the middle, brighter towards the rim, like a cell under a microscope.
    var gr = g.createRadialGradient(m, m, BODY_R * 0.2, m, m, BODY_R);
    gr.addColorStop(0, M.rgba(fill, 0.10));
    gr.addColorStop(0.75, M.rgba(fill, 0.22));
    gr.addColorStop(1, M.rgba(rim, 0.42));
    g.fillStyle = gr;
    g.beginPath(); g.arc(m, m, BODY_R, 0, M.TAU); g.fill();
    // Membrane outline: a soft halo plus a crisp line.
    g.strokeStyle = M.rgba(rim, 0.25); g.lineWidth = 9;
    g.beginPath(); g.arc(m, m, BODY_R, 0, M.TAU); g.stroke();
    g.strokeStyle = M.rgba(rim, 0.9); g.lineWidth = 3.2;
    g.beginPath(); g.arc(m, m, BODY_R - 1, 0, M.TAU); g.stroke();
    // Nucleus.
    var gn = g.createRadialGradient(m, m, 0, m, m, BODY_R * 0.42);
    gn.addColorStop(0, M.rgba([255, 255, 255], 0.95));
    gn.addColorStop(0.35, M.rgba(core, 0.85));
    gn.addColorStop(1, M.rgba(core, 0));
    g.fillStyle = gn;
    g.beginPath(); g.arc(m, m, BODY_R * 0.42, 0, M.TAU); g.fill();
    return (cache[key] = c);
  }

  // A piece of algae: a tiny bright seed inside a green glow.
  function algae() {
    if (cache.algae) return cache.algae;
    var size = 48, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var rgb = M.hexToRgb(GL.Config.colors.green);
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(235,255,240,1)');
    grad.addColorStop(0.12, M.rgba(rgb, 0.95));
    grad.addColorStop(0.3, M.rgba(rgb, 0.35));
    grad.addColorStop(1, M.rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache.algae = c);
  }

  // A plain soft white dot, for dust and particles.
  function dot() {
    if (cache.dot) return cache.dot;
    var size = 32, c = makeCanvas(size), g = c.getContext('2d'), r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(230,245,255,1)');
    grad.addColorStop(0.3, 'rgba(200,230,255,0.45)');
    grad.addColorStop(1, 'rgba(200,230,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (cache.dot = c);
  }

  // Moving light patterns (caustics): the web of bright lines that sunlight makes through ripples.
  // A classic iterated-wave caustic formula, painted once into a seamlessly repeating tile.
  // "phase" picks a different moment of the pattern, so two layers don't look alike.
  function caustics(phase) {
    var key = 'caustics' + phase;
    if (cache[key]) return cache[key];
    var size = 256, c = makeCanvas(size), g = c.getContext('2d');
    var img = g.createImageData(size, size), d = img.data, iters = 5, inten = 0.005;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var px = (x / size) * M.TAU - 250, py = (y / size) * M.TAU - 250;
      var ix = px, iy = py, sum = 1;
      for (var n = 0; n < iters; n++) {
        var t = phase * (1 - 3.5 / (n + 1));
        var nx = px + Math.cos(t - ix) + Math.sin(t + iy);
        var ny = py + Math.sin(t - iy) + Math.cos(t + ix);
        ix = nx; iy = ny;
        sum += 1 / Math.sqrt(Math.pow(px / (Math.sin(ix + t) / inten), 2) + Math.pow(py / (Math.cos(iy + t) / inten), 2));
      }
      sum /= iters;
      var v = Math.pow(Math.abs(1.17 - Math.pow(sum, 1.4)), 8);
      var o = (y * size + x) * 4;
      d[o] = 175; d[o + 1] = 235; d[o + 2] = 255; d[o + 3] = Math.round(255 * Math.min(1, v));
    }
    g.putImageData(img, 0, 0);
    return (cache[key] = c);
  }

  return { glow: glow, body: body, algae: algae, dot: dot, caustics: caustics, BODY_SIZE: BODY_SIZE, BODY_R: BODY_R };
})();
