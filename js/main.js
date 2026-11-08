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

  var canvas = document.getElementById('dish');
  var renderer = new GL.Renderer(canvas, world);
  var app = { world: world, renderer: renderer, loop: null, hud: null, seed: seed, isPhone: isPhone };

  var loop = new GL.Loop(
    function () { app.world.step(); },
    function (dt) { renderer.draw(dt, loop.fps); app.hud.update(dt); }
  );
  app.loop = loop;
  var sp = params.get('speed');
  if (sp) loop.speed = sp === 'max' ? 'max' : (Number(sp) || C.defaultSpeed);
  app.hud = new GL.HUD(app);
  GL.Controls(app);

  window.addEventListener('resize', function () { renderer.resize(false); });
  loop.start();
  // Fade in once the first frame is drawn.
  requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add('ready'); }); });

  window.GLApp = app;                             // handy for testing from the browser console
})();
