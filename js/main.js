// Genesis Lab - starts everything.
// Optional address-bar settings, for testing:
//   index.html?seed=123     a specific world (same seed = same starting world)
//   index.html?speed=16     start at another speed (1, 2, 4, 16 or max)
//   index.html?bench=300    performance test: keep at least this many creatures alive
var GL = GL || {};

(function () {
  var C = GL.Config;
  var params = new URLSearchParams(location.search);

  var seed = params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : GL.RNG.randomSeed();
  // Phones get a lower creature cap.
  var isPhone = window.matchMedia && window.matchMedia('(pointer: coarse)').matches &&
                Math.min(screen.width, screen.height) < 820;
  var cap = isPhone ? C.capPhone : C.capLaptop;
  var bench = parseInt(params.get('bench') || '0', 10) || 0;

  var world = new GL.World(seed, { cap: Math.max(cap, bench) });
  if (bench) {                                    // performance test: hold the population at "bench"
    world.floor = bench;
    while (world.creatures.length < bench) world.spawnPrimitive(false);
  }

  var canvas = document.getElementById('terrarium');
  var renderer = new GL.Renderer(canvas, world);
  var app = { world: world, renderer: renderer, loop: null, hud: null, inspector: null, charts: null, labLog: null,
              seed: seed, isPhone: isPhone };

  // Panels opened or closed: keep a followed creature in the middle of the part of the screen they leave free.
  app.layoutChanged = function () {
    var cam = renderer.camera, w = cam.w, h = cam.h, left = 0, right = w, top = 0, bottom = h;
    var bar = document.getElementById('topbar').getBoundingClientRect();
    if (bar.height > 0) top = bar.bottom;
    if (app.inspector && app.inspector.open && !document.body.classList.contains('clean')) {
      var r = document.getElementById('inspector').getBoundingClientRect();
      // A side panel takes the right edge; on narrow screens it is a bottom sheet instead.
      // (Measured from the layout, not the slide-in animation.)
      var el = document.getElementById('inspector');
      if (r.left > w / 2) right = w - 12 - el.offsetWidth;
      else bottom = Math.min(bottom, h - 8 - el.offsetHeight);
    }
    if (app.charts && app.charts.open && !document.body.classList.contains('clean')) {
      var d = document.getElementById('drawer'), dh = d.offsetHeight;
      bottom = Math.min(bottom, h - 12 - dh);
    }
    cam.offX = w / 2 - (left + right) / 2;
    cam.offY = h / 2 - (top + bottom) / 2;
  };

  var loop = new GL.Loop(
    function () { app.world.step(); },
    function (dt) {
      renderer.draw(dt, loop.fps);
      app.hud.update(dt);
      app.inspector.update(dt);
      app.charts.update(dt);
      app.labLog.update();
    }
  );
  app.loop = loop;
  var sp = params.get('speed');
  if (sp) loop.speed = sp === 'max' ? 'max' : (Number(sp) || C.defaultSpeed);
  app.hud = new GL.HUD(app);
  app.inspector = new GL.Inspector(app);
  app.charts = new GL.Charts(app);
  app.labLog = new GL.LabLog(app);
  GL.Controls(app);

  window.addEventListener('resize', function () { renderer.resize(false); app.layoutChanged(); });
  loop.start();
  // Fade in once the first frame is drawn.
  requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add('ready'); }); });

  window.GLApp = app;                             // handy for testing from the browser console
})();
