// Genesis Lab - interface: heads-up display.
// The top bar (generation, population, foraging skill, champion and charts buttons,
// speed buttons) with numbers that count smoothly to new values, the "it died" logic
// for the followed bug (shown in the inspector), screenshot mode (H), screenshots (P),
// the scale bar in millimetres, a first-time hint and the debug overlay (backtick key).
var GL = GL || {};

// A number that counts smoothly to its new value instead of jumping. It only touches
// the page when the text it shows actually changes.
GL.Ticker = function (el, decimals) {
  this.el = el; this.decimals = decimals || 0; this.started = false; this.value = 0; this.target = 0; this.text = '';
};
GL.Ticker.prototype.set = function (v) {
  this.target = v;
  if (!this.started) { this.started = true; this.value = v; }
};
GL.Ticker.prototype.update = function (dt) {
  var k = 1 - Math.exp(-GL.Config.ui.tickerEase * dt), d = this.target - this.value;
  var unit = Math.pow(10, -this.decimals);
  this.value = Math.abs(d) < unit * 0.5 ? this.target : this.value + d * k;
  var shown = this.decimals ? this.value : (d > 0 ? Math.floor(this.value + 0.5) : Math.ceil(this.value - 0.5));
  var text = shown.toFixed(this.decimals);
  if (text !== this.text) { this.text = text; this.el.textContent = text; }
};

GL.HUD = function (app) {
  this.app = app;
  var $ = function (id) { return document.getElementById(id); };
  this.el = {
    gen: $('stat-gen'), pop: $('stat-pop'), skill: $('stat-skill'), trend: $('stat-trend'),
    speeds: $('speeds'), chip: $('selection'), chipName: $('sel-name'), chipMeta: $('sel-meta'),
    chipEnergy: $('sel-energy'), chipClose: $('sel-close'), chipActions: $('sel-actions'),
    chipFollow: $('sel-follow'), chipStay: $('sel-stay'), topbar: $('topbar'),
    scaleBar: $('scale-line'), scaleLabel: $('scale-label'), debug: $('debug'), hint: $('hint')
  };
  this.textTimer = 0;
  this.lastScaleZoom = 0;
  this.death = null;           // when the followed bug dies: { record, next, label, until }
  this.tickers = { gen: new GL.Ticker(this.el.gen, 0), pop: new GL.Ticker(this.el.pop, 0), skill: new GL.Ticker(this.el.skill, 1) };
  this.buildSpeedButtons();
  var self = this;
  this.el.chipClose.addEventListener('click', function () { self.dismissDeath(); app.renderer.select(null); self.update(0, true); });
  this.el.chipStay.addEventListener('click', function () { self.dismissDeath(); self.update(0, true); });
  this.el.chipFollow.addEventListener('click', function () { self.followNext(); });
  window.addEventListener('resize', function () { self.placeChip(); });
  this.placeChip();
  document.getElementById('btn-champion').addEventListener('click', function () { self.followChampion(); });
  document.getElementById('btn-charts').addEventListener('click', function () { self.toggleDrawer(); });
  document.getElementById('drawer-close').addEventListener('click', function () { self.toggleDrawer(false); });
  setTimeout(function () { self.hideHint(); }, GL.Config.ui.hintSeconds * 1000);
};

GL.HUD.prototype = {
  buildSpeedButtons: function () {
    var app = this.app, self = this, box = this.el.speeds;
    var pause = document.createElement('button');
    pause.className = 'speed pause';
    pause.title = 'Pause or resume (Space)';
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('click', function () { app.loop.togglePause(); self.refreshSpeeds(); });
    box.appendChild(pause);
    this.pauseBtn = pause;
    this.speedBtns = [];
    GL.Config.speedOptions.forEach(function (s, i) {
      var b = document.createElement('button');
      b.className = 'speed';
      b.textContent = s === 'max' ? 'Max' : s + 'x';
      b.title = (s === 'max' ? 'As fast as this device can go' : s + 'x speed') + ' (key ' + (i + 1) + ')';
      b.addEventListener('click', function () { app.loop.setSpeed(s); self.refreshSpeeds(); });
      box.appendChild(b);
      self.speedBtns.push({ el: b, speed: s });
    });
    this.refreshSpeeds();
  },

  refreshSpeeds: function () {
    var loop = this.app.loop;
    if (!loop) return;
    this.pauseBtn.classList.toggle('active', loop.paused);
    this.pauseBtn.innerHTML = loop.paused
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';
    this.pauseBtn.setAttribute('aria-label', loop.paused ? 'Resume' : 'Pause');
    for (var i = 0; i < this.speedBtns.length; i++) {
      this.speedBtns[i].el.classList.toggle('active', !loop.paused && loop.speed === this.speedBtns[i].speed);
    }
  },

  hideHint: function () { if (this.el.hint) this.el.hint.classList.add('gone'); },

  // Keep the chip just under the top bar, however tall the bar is (it wraps on narrow screens).
  placeChip: function () {
    var r = this.el.topbar.getBoundingClientRect();
    if (r.height > 0) {
      this.el.chip.style.top = Math.round(r.bottom + 8) + 'px';
      document.documentElement.style.setProperty('--top-h', Math.round(r.bottom) + 'px');   // the inspector starts below the bar
    }
  },

  // ------------------------------------------------------------ panels and modes
  toggleDrawer: function (on) {
    var app = this.app, el = document.getElementById('drawer'), btn = document.getElementById('btn-charts');
    on = on === undefined ? el.classList.contains('hidden') : on;
    el.classList.toggle('hidden', !on);
    document.body.classList.toggle('drawer-open', on);
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    app.charts.setOpen(on);
    app.labLog.drawerOpen = on;
    if (on) this.hideHint();
    app.layoutChanged();
  },

  // Screenshot mode: hide every panel (H). The terrarium keeps running.
  toggleClean: function () {
    var on = document.body.classList.toggle('clean');
    this.hideHint();
    return on;
  },

  // Save what the terrarium looks like right now as a PNG (P).
  screenshot: function () {
    var app = this.app, canvas = app.renderer.canvas, flash = document.getElementById('flash');
    var t = Math.floor(app.world.time), name = 'genesis-lab-seed' + app.world.seed + '-' + Math.floor(t / 60) + 'm' + (t % 60) + 's.png';
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
    flash.classList.add('on');
    requestAnimationFrame(function () { requestAnimationFrame(function () { flash.classList.remove('on'); }); });
    if (!document.body.classList.contains('clean')) app.labLog.showToast({ text: 'Screenshot saved to your downloads: ' + name, kind: 'info' });
  },

  // Fly to the champion: the living bug with the best score (babies x 3 + minutes alive).
  followChampion: function () {
    var app = this.app, c = app.world.findById(app.world.stats.championId);
    this.hideHint();
    if (!c) return;
    this.dismissDeath();
    app.renderer.select(c);
    this.update(0, true);
  },

  update: function (dt, force) {
    this.updateScaleBar();
    var loop = this.app.loop;
    if (loop && (loop.speed !== this._shownSpeed || loop.paused !== this._shownPaused)) {
      this._shownSpeed = loop.speed; this._shownPaused = loop.paused;
      this.refreshSpeeds();                    // keep the buttons in step however the speed changed
    }
    var app = this.app, world = app.world, s = world.stats, tk = this.tickers;
    tk.gen.set(s.maxGenerationEver);             // the highest generation ever reached: it never goes down
    tk.pop.set(world.creatures.length);
    tk.skill.set(s.skill);
    tk.gen.update(dt); tk.pop.update(dt); tk.skill.update(dt);
    // Save frame rate on slow devices: panels drop their live blur at low drawing quality.
    var lite = app.renderer.quality.level < GL.Config.render.liteGlassBelowLevel;
    if (lite !== this._lite) { this._lite = lite; document.body.classList.toggle('lite', lite); }
    this.textTimer -= dt;
    if (this.textTimer > 0 && !force) return;
    this.textTimer = 0.25;                     // text refreshes 4 times a second
    if (s.startSkill > 0) {
      var up = s.skill >= s.startSkill;
      this.el.trend.textContent = (up ? '▲' : '▼') + ' from ' + s.startSkill.toFixed(1) + '×';
      this.el.trend.className = 'trend ' + (up ? 'up' : 'down');
      this.el.trend.title = 'In the first minute every bug had a random brain, so it started at about 1x (' + s.startSkill.toFixed(1) +
        'x). Now these bugs find food ' + s.skill.toFixed(1) + ' times faster than random brains would, right here and now.';
    } else {
      this.el.trend.textContent = 'measuring';
      this.el.trend.className = 'trend';
      this.el.trend.title = 'The first minute is the baseline: every bug starts with a random brain';
    }
    this.updateChip();
    if (app.renderer.debug) this.updateDebug();
  },

  updateChip: function () {
    var app = this.app, r = app.renderer, w = app.world, el = this.el;
    // The followed bug died: say what happened and offer to follow a relative.
    if (w.watchDeath) { var rec = w.watchDeath; w.watchDeath = null; if (!r.getSelected()) this.showDeath(rec); }
    var c = r.getSelected();
    if (c && this.death) this.dismissDeath();            // the viewer picked another bug
    if (this.death) { this.updateDeath(); return; }
    el.chip.classList.remove('dead');
    el.chipActions.classList.add('hidden');
    el.chipEnergy.parentNode.classList.remove('hidden');
    // The inspector shows the selected bug (and what happened if it dies), so the chip stays hidden.
    if (!c || this.app.inspector) { el.chip.classList.add('hidden'); return; }
    el.chip.classList.remove('hidden');
    el.chip.style.setProperty('--hue', Math.round(c.hue));
    el.chipName.textContent = 'Specimen #' + c.id;
    el.chipMeta.textContent = 'Gen ' + c.generation + ' · age ' + this.clock(c.age) +
      ' · ate ' + c.foodEaten + ' · ' + c.babies + (c.babies === 1 ? ' baby' : ' babies');
    var e = Math.max(0, Math.min(1, c.energy / c.maxEnergy));
    el.chipEnergy.style.width = Math.round(e * 100) + '%';
    el.chipEnergy.parentNode.title = 'Energy ' + Math.round(e * 100) + '%';
  },

  clock: function (seconds) {
    var t = Math.floor(seconds), mm = Math.floor(t / 60), ss = t % 60;
    return mm + ':' + (ss < 10 ? '0' : '') + ss;
  },

  // ------------------------------------------------- when the followed bug dies
  showDeath: function (rec) {
    var how = { starvation: 'starved', oldAge: 'died of old age', eaten: 'was eaten', disaster: 'was lost in a disaster' }[rec.cause] || 'died';
    this.death = { record: rec, until: performance.now() + GL.Config.render.followNextSeconds * 1000, next: null, label: '' };
    this.app.renderer.markDeath(rec);
    var el = this.el;
    if (!this.app.inspector) el.chip.classList.remove('hidden');
    el.chip.classList.add('dead');
    el.chip.style.setProperty('--hue', Math.round(rec.hue));
    el.chipName.textContent = 'Specimen #' + rec.id + ' ' + how + ' at age ' + this.clock(rec.age);
    el.chipMeta.textContent = 'Gen ' + rec.generation + ' · ate ' + rec.foodEaten + ' · ' + rec.babies +
      (rec.babies === 1 ? ' baby' : ' babies');
    el.chipEnergy.parentNode.classList.add('hidden');
    el.chipActions.classList.remove('hidden');
    this.updateDeath();
  },

  updateDeath: function () {
    var d = this.death, el = this.el;
    if (!d.next || !d.next.alive || d.next.id !== d.nextId) {         // (re)choose who to follow next
      var pick = this.findRelative(d.record);
      d.next = pick ? pick.c : null; d.nextId = pick ? pick.c.id : 0; d.label = pick ? pick.label : '';
    }
    var left = Math.ceil((d.until - performance.now()) / 1000);
    if (d.next) {
      el.chipFollow.classList.remove('hidden');
      el.chipFollow.textContent = 'Follow ' + d.label + ' #' + d.next.id + (left > 0 ? ' (' + left + ')' : '');
      el.chipFollow.title = 'Switches automatically when the countdown ends. Stay here to keep watching this spot.';
      if (left <= 0) this.followNext();
    } else {
      el.chipFollow.classList.add('hidden');
    }
  },

  followNext: function () {
    var d = this.death;
    if (!d) return;
    var next = d.next && d.next.alive && d.next.id === d.nextId ? d.next : null;
    this.dismissDeath();
    if (next) this.app.renderer.select(next);
    this.update(0, true);
  },

  dismissDeath: function () {
    if (!this.death) return;
    this.death = null;
    this.app.renderer.clearDeathMark();
  },

  // The closest living relative of a creature that died: its child, then grandchild, sibling,
  // parent, grandparent, cousin, any relative from the last few generations, and if there are
  // none, the nearest bug. Among equal relatives, the one closest to where it died.
  findRelative: function (rec) {
    var list = this.app.world.creatures, a = rec.ancestors;
    var kinds = [
      ['its child', function (c) { return c.parentId === rec.id; }],
      ['its grandchild', function (c) { return c.ancestors[1] === rec.id; }],
      ['its sibling', function (c) { return rec.parentId > 0 && c.parentId === rec.parentId; }],
      ['its parent', function (c) { return rec.parentId > 0 && c.id === rec.parentId; }],
      ['its grandparent', function (c) { return a[1] > 0 && c.id === a[1]; }],
      ['a cousin', function (c) { return a[1] > 0 && c.ancestors[1] === a[1]; }],
      ['a relative', function (c) { return a[2] > 0 && (c.ancestors[2] === a[2] || c.ancestors[1] === a[2] || c.id === a[2]); }],
      ['the nearest bug', function () { return true; }]
    ];
    for (var k = 0; k < kinds.length; k++) {
      var test = kinds[k][1], best = null, bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!test(c)) continue;
        var dx = c.x - rec.x, dy = c.y - rec.y, d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = c; }
      }
      if (best) return { c: best, label: kinds[k][0] };
    }
    return null;
  },

  // Scale bar: a round length in millimetres (1, 2, 5, 10, 20, 50 mm ...) about 120 pixels long.
  updateScaleBar: function () {
    var z = this.app.renderer.camera.zoom, mmPerUnit = GL.Config.mmPerUnit;
    if (Math.abs(z - this.lastScaleZoom) / z < 0.002) return;
    this.lastScaleZoom = z;
    var targetMm = GL.Config.render.scaleBarPx / z * mmPerUnit;
    var p = Math.pow(10, Math.floor(Math.log(targetMm) / Math.LN10)), len = p;
    [1, 2, 5, 10].forEach(function (m) { if (m * p <= targetMm) len = m * p; });
    len = Number(len.toPrecision(3));                    // tidy floating-point leftovers like 0.30000000000000004
    this.el.scaleBar.style.width = Math.round(len / mmPerUnit * z) + 'px';
    this.el.scaleLabel.textContent = len + ' mm';
  },

  toggleDebug: function () {
    var r = this.app.renderer;
    r.debug = !r.debug;
    this.el.debug.classList.toggle('hidden', !r.debug);
    if (r.debug) this.updateDebug();
  },

  updateDebug: function () {
    var app = this.app, loop = app.loop, w = app.world, r = app.renderer;
    var t = Math.floor(w.time), q = ['low', 'medium', 'high'][r.quality.level];
    this.el.debug.textContent =
      'fps        ' + loop.fps.toFixed(0) + '\n' +
      'tick       ' + loop.tickMs.toFixed(2) + ' ms  (' + loop.ticksLastFrame + ' per frame)\n' +
      'draw       ' + loop.drawMs.toFixed(2) + ' ms\n' +
      'speed      ' + (loop.paused ? 'paused' : loop.effectiveSpeed.toFixed(1) + 'x actual') + '\n' +
      'creatures  ' + w.creatures.length + ' / ' + w.cap + '\n' +
      'sprouts    ' + w.food.sproutCount + '\n' +
      'skill      ' + w.stats.skill.toFixed(2) + 'x random brains (' + w.stats.adultRate.toFixed(1) + ' vs ' + w.stats.ghostRate.toFixed(1) +
        ' meals per hungry minute)\n' +
      'also       ' + w.stats.skillLuck.toFixed(2) + 'x luck, ' + w.stats.foodRate.toFixed(2) + ' food per bug per minute\n' +
      'steering   ' + Math.round(w.stats.steer * 100) + '% (luck ' + Math.round(w.stats.steerLuck * 100) + '%)\n' +
      'grid cells ' + w.creatureGrid.usedCells() + ' creature, ' + w.foodGrid.usedCells() + ' food\n' +
      'sim time   ' + Math.floor(t / 60) + ':' + ((t % 60) < 10 ? '0' : '') + (t % 60) + '\n' +
      'seed       ' + w.seed + '\n' +
      'quality    ' + q + (this._lite ? ' (panels without blur)' : '') + '\n' +
      'panels     ' + (app.inspector && app.inspector.open ? 'inspector ' : '') + (app.charts && app.charts.open ? 'charts' : '') + '\n' +
      'champion   #' + w.stats.championId + ' (score ' + w.stats.championScore.toFixed(1) + ')' +
      (r.getSelected() ? '\nselected   view slices shown in the terrarium' : '');
  }
};
