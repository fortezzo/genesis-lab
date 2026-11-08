// Genesis Lab - starts everything.
// The world is built at once and drawn behind the intro screen; the simulation starts when the
// visitor presses Begin experiment (with the guided story for first-time visitors).
// Optional address-bar settings, for testing:
//   index.html?seed=123     a specific world (same seed = same starting world)
//   index.html?speed=16     start at another speed (1, 2, 4, 16 or max)
//   index.html?bench=300    performance test: keep at least this many creatures alive
//   index.html?intro=0      skip the intro screen and start at once (no story)
//   index.html?story=1      play the guided story after Begin, even for a returning visitor
var GL = GL || {};

(function () {
  var C = GL.Config;
  var params = new URLSearchParams(location.search);

  // Phones get a lower creature cap, and their own layout (css).
  var isPhone = window.matchMedia && window.matchMedia('(pointer: coarse)').matches &&
                Math.min(screen.width, screen.height) < 820;
  var defaultCap = isPhone ? C.capPhone : C.capLaptop;
  var bench = parseInt(params.get('bench') || '0', 10) || 0;
  var app = { world: null, renderer: null, loop: null, hud: null, inspector: null, charts: null, labLog: null,
              familyTree: null, godMode: null, hallOfFame: null, cinematic: null, story: null, sound: null, settings: null,
              isPhone: isPhone, defaultCap: defaultCap, started: false };
  app.systemReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------------------------------------------------------------- worlds
  // World settings: what the visitor chose last time (Advanced or Settings), else the usual ones.
  app.worldSettings = GL.WorldSettings.clean(GL.Prefs.get('world'), defaultCap);
  app.makeWorld = function (seed, ws) {
    GL.WorldSettings.apply(ws);
    var world = new GL.World(seed, { cap: Math.max(ws.cap, bench) });
    if (bench) {                                  // performance test: hold the population at "bench"
      world.floor = bench;
      while (world.creatures.length < bench) world.spawnPrimitive(false);
    }
    return world;
  };
  // The values the New world form starts with: the remembered settings and no seed.
  app.nextWorldValues = function () {
    var ws = GL.WorldSettings.clean(GL.Prefs.get('world'), defaultCap);
    return { seed: '', cap: ws.cap, growth: ws.growth, mutation: ws.mutation, size: ws.size };
  };
  app.rememberWorldValues = function (v) {
    var ws = GL.WorldSettings.clean(v, defaultCap);
    GL.Prefs.set('world', { cap: ws.cap === defaultCap ? 0 : ws.cap, growth: ws.growth, mutation: ws.mutation, size: ws.size });
  };

  var seed = params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : GL.RNG.randomSeed();
  var world = app.makeWorld(seed, app.worldSettings);
  app.world = world; app.seed = seed;

  var canvas = document.getElementById('terrarium');
  var renderer = new GL.Renderer(canvas, world);
  renderer.phone = isPhone;
  renderer.qualityMode = GL.Prefs.get('quality') || 'auto';
  app.renderer = renderer;

  // Swap in another world (a new one, a loaded one, or a fresh one for the story). Every panel reads
  // app.world, so this only resets what each one remembers about the old world.
  app.replaceWorld = function (w, ws) {
    if (app.story && app.story.on) app.story.stop('restart');
    app.cinematic.stop();
    app.hud.dismissDeath();
    if (app.godMode.armed) app.godMode.disarm();
    app.world = w; app.seed = w.seed; app.worldSettings = ws;
    renderer.background.soilSeed = -1;            // repaint the floor (another seed or size)
    renderer.setWorld(w);
    renderer.highlightSpecies = 0; renderer.clearDeathMark();
    renderer.resize(true);                        // the whole terrarium in view again
    app.labLog.reset();
    app.familyTree.rows = []; app.familyTree.hover = null;
    app.charts.timer = 0;
    app.sound.setWorld(w);
    app.hud.update(0, true);
    if (app.settings) app.settings.refresh();
    app.layoutChanged();
  };

  // A new world from the New world form: { seed (empty = random), cap, growth, mutation, size }.
  app.newWorld = function (v, quiet) {
    var ws = GL.WorldSettings.clean(v, defaultCap);
    var s = v && v.seed !== '' && v.seed !== undefined && isFinite(parseInt(v.seed, 10)) ? parseInt(v.seed, 10) >>> 0 : GL.RNG.randomSeed();
    app.replaceWorld(app.makeWorld(s, ws), ws);
    app.loop.setSpeed(C.defaultSpeed); app.hud.refreshSpeeds();
    if (!quiet) {
      var desc = GL.WorldSettings.describe(ws, defaultCap);
      app.labLog.showToast({ text: 'A new world: seed ' + s + (desc ? ' (' + desc + ')' : '') + '.', kind: 'info' });
    }
  };

  // Save the whole world as a .json file (downloaded). Returns a short message for the Settings tab.
  app.saveWorld = function () {
    var w = app.world, t = Math.floor(w.time);
    try {
      var data = GL.Save.serialize(w, { seed: w.seed, cap: w.cap, settings: app.worldSettings, app: 'Genesis Lab' });
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var name = 'genesis-lab-seed' + w.seed + '-' + Math.floor(t / 60) + 'm' + (t % 60) + 's.json';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return 'Saved to your downloads: ' + name + ' (' + (blob.size / 1e6).toFixed(1) + ' MB).';
    } catch (e) { return 'Could not save this world: ' + e.message; }
  };
  // Load a world saved with Save world. done(message, bad).
  app.loadWorldFile = function (file, done) {
    var reader = new FileReader();
    reader.onerror = function () { done('Could not read that file.', true); };
    reader.onload = function () {
      var ws = null;
      try {
        var data = JSON.parse(reader.result);
        var w = GL.Save.restore(data, function (meta) {
          ws = GL.WorldSettings.clean(meta.settings || {}, defaultCap);
          ws.cap = meta.cap || defaultCap;
          return app.makeWorld(meta.seed >>> 0, ws);
        });
        app.replaceWorld(w, ws);
        var t = Math.floor(w.time);
        done('Loaded seed ' + w.seed + ' at ' + Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60) + ' with ' + w.creatures.length + ' bugs.');
        app.labLog.showToast({ text: 'World loaded: seed ' + w.seed + ', ' + w.creatures.length + ' bugs, ' + w.species.living + ' species.', kind: 'info' });
      } catch (e) {
        GL.WorldSettings.apply(app.worldSettings);   // put the current world's numbers back
        done(e instanceof SyntaxError ? 'That file is not a saved Genesis Lab world.' : e.message, true);
      }
    };
    reader.readAsText(file);
  };

  // ---------------------------------------------------------------- display settings
  app.setQuality = function (mode) { renderer.qualityMode = mode; GL.Prefs.set('quality', mode); };
  app.setReducedMotion = function (on, remember) {
    renderer.reducedMotion = !!on;
    document.body.classList.toggle('reduce-motion', !!on);
    if (remember) GL.Prefs.set('reducedMotion', !!on);
  };
  var rmPref = GL.Prefs.get('reducedMotion');
  app.setReducedMotion(rmPref === null ? app.systemReducedMotion : rmPref, false);

  // Panels opened or closed: keep a followed creature in the middle of the part of the screen they leave free.
  app.layoutChanged = function () {
    var cam = renderer.camera, w = cam.w, h = cam.h, left = 0, right = w, top = 0, bottom = h;
    var clean = document.body.classList.contains('clean');
    var bar = document.getElementById('topbar').getBoundingClientRect();
    if (bar.height > 0) top = bar.bottom;
    var tabs = document.getElementById('tabbar');
    if (tabs && tabs.offsetHeight > 0 && getComputedStyle(tabs).display !== 'none') bottom = Math.min(bottom, tabs.getBoundingClientRect().top);
    if (app.godMode && app.godMode.open && !clean) {
      var lab = document.getElementById('lab');
      if (lab.getBoundingClientRect().left < w / 2 && lab.offsetWidth < w * 0.6) left = 12 + lab.offsetWidth;
      else bottom = Math.min(bottom, h - 8 - lab.offsetHeight);
    }
    if (app.inspector && app.inspector.open && !clean) {
      var r = document.getElementById('inspector').getBoundingClientRect();
      // A side panel takes the right edge; on narrow screens it is a bottom sheet instead.
      // (Measured from the layout, not the slide-in animation.)
      var el = document.getElementById('inspector');
      if (r.left > w / 2) right = w - 12 - el.offsetWidth;
      else bottom = Math.min(bottom, h - 8 - el.offsetHeight);
    }
    if (app.charts && app.charts.open && !clean) {
      var d = document.getElementById('drawer'), dh = d.offsetHeight;
      bottom = Math.min(bottom, h - 12 - dh);
    }
    if (app.story && app.story.on) return;         // the story places the camera itself
    cam.offX = w / 2 - (left + right) / 2;
    cam.offY = h / 2 - (top + bottom) / 2;
  };

  // ---------------------------------------------------------------- the loop
  var loop = new GL.Loop(
    function () { app.world.step(); },
    function (dt) {
      app.story.update(dt);
      app.cinematic.update(dt);
      renderer.draw(dt, loop.fps);
      app.hud.update(dt);
      app.inspector.update(dt);
      app.charts.update(dt);
      app.familyTree.update(dt);
      app.godMode.update(dt);
      app.labLog.update();
      app.sound.update(dt);
      app.phoneTabs.update(dt);
    }
  );
  app.loop = loop;
  var sp = params.get('speed');
  if (sp) loop.speed = sp === 'max' ? 'max' : (Number(sp) || C.defaultSpeed);
  app.sound = new GL.Sound(app);
  app.hud = new GL.HUD(app);
  app.inspector = new GL.Inspector(app);
  app.charts = new GL.Charts(app);
  app.familyTree = new GL.FamilyTree(app);
  app.labLog = new GL.LabLog(app);
  app.hallOfFame = new GL.HallOfFame(app);
  app.godMode = new GL.GodMode(app);
  app.cinematic = new GL.Cinematic(app);
  app.story = new GL.StoryMode(app);
  app.phoneTabs = new GL.PhoneTabs(app);
  app.settings = new GL.SettingsPanel(app);
  app.tips = new GL.Tips(app);
  GL.Controls(app);

  // Begin experiment: start the sound and the simulation, in a new world if the visitor changed
  // the seed or the world settings under Advanced, then the guided story or the tips.
  app.begin = function (opts) {
    opts = opts || {};
    app.started = true;
    document.body.classList.remove('waiting');
    if (opts.gesture === false) {                  // no click yet (intro skipped): start the sound at the first one
      var first = function () { window.removeEventListener('pointerdown', first, true); app.sound.start(); };
      window.addEventListener('pointerdown', first, true);
    } else app.sound.start();
    var v = opts.values, ws = v ? GL.WorldSettings.clean(v, defaultCap) : app.worldSettings;
    var cur = app.worldSettings;
    if (v && ((v.seed !== '' && (parseInt(v.seed, 10) >>> 0) !== app.world.seed) ||
              ws.cap !== cur.cap || ws.growth !== cur.growth || ws.mutation !== cur.mutation || ws.size !== cur.size)) {
      app.newWorld(v, true);
    }
    var story = opts.story || params.get('story') === '1';
    var asked = sp ? (sp === 'max' ? 'max' : (Number(sp) || C.defaultSpeed)) : C.defaultSpeed;
    loop.setSpeed(story ? C.storyMode.momentSpeed : asked);
    app.hud.refreshSpeeds();
    if (story) app.story.start();
    else setTimeout(function () { app.tips.show(); }, 900);
  };
  // Replay the story (Settings): a brand-new world, with the usual flow from Begin.
  app.replayStory = function () {
    if (app.godMode.open) app.godMode.toggle(false);
    app.newWorld(app.nextWorldValues(), true);
    app.story.start();
  };

  window.addEventListener('resize', function () { renderer.resize(false); app.layoutChanged(); });
  loop.paused = true;                             // waiting for Begin
  document.body.classList.add('waiting');
  loop.start();
  app.intro = new GL.Intro(app);
  if (params.get('intro') === '0') { app.intro.skip(); app.begin({ story: params.get('story') === '1', gesture: false }); }
  // Fade in once the first frame is drawn.
  requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add('ready'); }); });

  window.GLApp = app;                             // handy for testing from the browser console
})();
