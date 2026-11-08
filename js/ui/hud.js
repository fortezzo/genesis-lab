// Genesis Lab - interface: heads-up display.
// The top bar (generation, population, foraging skill, speed buttons), the
// "following" chip for the selected creature, the scale bar in millimetres,
// a first-time hint and the debug overlay (backtick key).
var GL = GL || {};

GL.HUD = function (app) {
  this.app = app;
  var $ = function (id) { return document.getElementById(id); };
  this.el = {
    gen: $('stat-gen'), pop: $('stat-pop'), skill: $('stat-skill'), trend: $('stat-trend'),
    speeds: $('speeds'), chip: $('selection'), chipName: $('sel-name'), chipMeta: $('sel-meta'),
    chipEnergy: $('sel-energy'), chipClose: $('sel-close'),
    scaleBar: $('scale-line'), scaleLabel: $('scale-label'), debug: $('debug'), hint: $('hint')
  };
  this.textTimer = 0;
  this.lastScaleZoom = 0;
  this.buildSpeedButtons();
  var self = this;
  this.el.chipClose.addEventListener('click', function () { app.renderer.select(null); self.update(0, true); });
  setTimeout(function () { self.hideHint(); }, 14000);
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

  update: function (dt, force) {
    this.updateScaleBar();
    var loop = this.app.loop;
    if (loop && (loop.speed !== this._shownSpeed || loop.paused !== this._shownPaused)) {
      this._shownSpeed = loop.speed; this._shownPaused = loop.paused;
      this.refreshSpeeds();                    // keep the buttons in step however the speed changed
    }
    this.textTimer -= dt;
    if (this.textTimer > 0 && !force) return;
    this.textTimer = 0.25;                     // text refreshes 4 times a second
    var app = this.app, world = app.world, s = world.stats;
    this.el.gen.textContent = s.maxGeneration;
    this.el.pop.textContent = world.creatures.length;
    this.el.skill.textContent = s.skill.toFixed(1);
    if (s.startSkill > 0) {
      var ratio = s.skill / s.startSkill;
      this.el.trend.textContent = (ratio >= 1 ? '▲ ' : '▼ ') + ratio.toFixed(1) + '×';
      this.el.trend.className = 'trend ' + (ratio >= 1 ? 'up' : 'down');
      this.el.trend.title = 'Compared with the first minute (' + s.startSkill.toFixed(2) + ' food per creature per minute)';
    } else {
      this.el.trend.textContent = 'measuring';
      this.el.trend.className = 'trend';
      this.el.trend.title = 'The first minute is the baseline';
    }
    this.updateChip();
    if (app.renderer.debug) this.updateDebug();
  },

  updateChip: function () {
    var c = this.app.renderer.getSelected(), el = this.el;
    if (!c) { el.chip.classList.add('hidden'); return; }
    el.chip.classList.remove('hidden');
    el.chip.style.setProperty('--hue', Math.round(c.hue));
    el.chipName.textContent = 'Specimen #' + c.id;
    var age = Math.floor(c.age), mm = Math.floor(age / 60), ss = age % 60;
    el.chipMeta.textContent = 'Gen ' + c.generation + ' · age ' + mm + ':' + (ss < 10 ? '0' : '') + ss +
      ' · ate ' + c.foodEaten + ' · ' + c.babies + (c.babies === 1 ? ' baby' : ' babies');
    var e = Math.max(0, Math.min(1, c.energy / c.maxEnergy));
    el.chipEnergy.style.width = Math.round(e * 100) + '%';
    el.chipEnergy.parentNode.title = 'Energy ' + Math.round(e * 100) + '%';
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
      'grid cells ' + w.creatureGrid.usedCells() + ' creature, ' + w.foodGrid.usedCells() + ' food\n' +
      'sim time   ' + Math.floor(t / 60) + ':' + ((t % 60) < 10 ? '0' : '') + (t % 60) + '\n' +
      'seed       ' + w.seed + '\n' +
      'quality    ' + q +
      (r.getSelected() ? '\nselected   view slices shown in the terrarium' : '');
  }
};
