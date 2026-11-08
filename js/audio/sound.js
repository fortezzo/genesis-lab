// Genesis Lab - sound made in code (Web Audio, no sound files).
// A low ambient lab hum with soft, muffled air noise; a tiny blip for each birth you can
// see (at most a few per second, so 16x speed stays calm); a bell-like chime when a species
// dies out; quiet clicks for the interface; and a soft two-note chime for each chapter of
// the guided story. Sound starts on at a quiet volume when the visitor presses Begin (browsers
// only allow sound after a click), with mute (key M) and a volume slider in Settings.
// It only reads the world, so the simulation is the same with or without it.
var GL = GL || {};

GL.Sound = function (app) {
  this.app = app;
  this.ctx = null;
  this.volume = Number(GL.Prefs.get('volume'));
  if (!isFinite(this.volume)) this.volume = GL.Config.settings.defaultVolume;
  this.muted = !!GL.Prefs.get('muted');
  this.lastSeq = 0; this.logSeen = 0;
  this.blipBudget = 0;
  this.btn = document.getElementById('btn-sound');
  var self = this;
  if (this.btn) this.btn.addEventListener('click', function () { self.toggleMute(); });
  this.refreshButton();
};

GL.Sound.prototype = {
  // Called from the Begin click (a user gesture), so the browser lets the sound start.
  start: function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    var ctx = this.ctx, S = GL.Config.sound, self = this;
    this.master = ctx.createGain();
    this.master.gain.value = this.level();
    this.master.connect(ctx.destination);
    // A gentle limiter, so nothing ever gets harsh.
    this.bus = ctx.createDynamicsCompressor();
    this.bus.threshold.value = -18; this.bus.ratio.value = 4;
    this.bus.connect(this.master);

    // Ambient hum: two low tones a fifth apart, a hint of octave, and muffled air noise, breathing slowly.
    var hum = ctx.createGain(), lp = ctx.createBiquadFilter();
    hum.gain.value = S.humLevel;
    lp.type = 'lowpass'; lp.frequency.value = S.humLowpass;
    hum.connect(lp); lp.connect(this.bus);
    [[55, 0.55, 'sine', 0], [82.4, 0.32, 'sine', 3], [110, 0.12, 'triangle', -4]].forEach(function (t) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = t[2]; o.frequency.value = t[0]; o.detune.value = t[3]; g.gain.value = t[1];
      o.connect(g); g.connect(hum); o.start();
    });
    var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }   // soft brown-ish noise
    var noise = ctx.createBufferSource(), ng = ctx.createGain();
    noise.buffer = buf; noise.loop = true; ng.gain.value = 0.5;
    noise.connect(ng); ng.connect(hum); noise.start();
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.06; lg.gain.value = S.humLevel * 0.35;
    lfo.connect(lg); lg.connect(hum.gain); lfo.start();
    // Fade in, so the hum arrives softly after Begin.
    this.master.gain.setValueAtTime(0, ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(this.level(), ctx.currentTime + 2.5);

    var w = this.app.world;
    this.lastSeq = w.events.seq; this.logSeen = w.events.logCount;
    // Interface clicks: any button.
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('button, .seg button, input[type=checkbox]')) self.click();
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (!self.ctx) return;
      if (document.hidden) self.ctx.suspend(); else self.ctx.resume();
    });
  },

  level: function () { return this.muted ? 0 : this.volume; },
  applyLevel: function () {
    if (!this.ctx) return;
    var g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(this.level(), t + 0.15);
  },
  setVolume: function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.volume > 0 && this.muted) this.muted = false;
    GL.Prefs.set('volume', this.volume); GL.Prefs.set('muted', this.muted);
    this.applyLevel(); this.refreshButton();
  },
  toggleMute: function () {
    this.muted = !this.muted;
    GL.Prefs.set('muted', this.muted);
    if (!this.ctx && !this.muted) this.start();
    this.applyLevel(); this.refreshButton();
    if (this.app.settings) this.app.settings.refresh();
  },
  refreshButton: function () {
    if (!this.btn) return;
    this.btn.classList.toggle('muted', this.muted);
    this.btn.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
    this.btn.setAttribute('aria-label', this.muted ? 'Sound is off: turn it on' : 'Sound is on: mute');
    this.btn.title = (this.muted ? 'Sound is off. Click to turn it on' : 'Mute the sound') + ' (key M)';
  },
  // A new world: start listening from its current moment.
  setWorld: function (w) { this.lastSeq = w.events.seq; this.logSeen = w.events.logCount; },

  // Listen to the world: births on screen, and species that died out.
  update: function (dt) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    var w = this.app.world, ev = w.events, E = GL.Events, S = GL.Config.sound, v = this.app.renderer.view;
    this.blipBudget = Math.min(S.birthMaxPerSec, this.blipBudget + dt * S.birthMaxPerSec);
    var from = Math.max(this.lastSeq, ev.seq - ev.cap), played = 0;
    for (var s = from; s < ev.seq; s++) {
      var i = s % ev.cap;
      if (ev.type[i] !== E.BIRTH || this.blipBudget < 1 || played >= 2) continue;
      if (ev.x[i] < v.x0 || ev.x[i] > v.x1 || ev.y[i] < v.y0 || ev.y[i] > v.y1) continue;
      this.blipBudget -= 1; played++;
      this.blip(played * 0.04);
    }
    this.lastSeq = ev.seq;
    if (ev.logCount !== this.logSeen) {
      var log = ev.log, chimed = false;
      for (var k = log.length - 1; k >= 0 && log[k].n > this.logSeen; k--) if (log[k].kind === 'extinct' && !chimed) { this.chime(); chimed = true; }
      this.logSeen = ev.logCount;
    }
  },

  // ---------------------------------------------------------------- voices
  tone: function (type, f0, f1, at, attack, decay, level) {
    var ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + (at || 0);
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + attack + decay + 0.05);
  },
  blip: function (at) {
    if (!this.ctx) return;
    var notes = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093], f = notes[Math.floor(Math.random() * notes.length)];
    this.tone('triangle', f, f * 1.06, at, 0.006, 0.13, GL.Config.sound.birthLevel);
  },
  chime: function () {
    if (!this.ctx || this.muted) return;
    var L = GL.Config.sound.chimeLevel, base = 392, self = this;
    [[1, 1], [2.0, 0.45], [2.76, 0.32], [5.4, 0.12]].forEach(function (p) { self.tone('sine', base * p[0], 0, 0, 0.01, 2.8, L * p[1]); });
  },
  click: function () {
    if (!this.ctx || this.muted) return;
    this.tone('sine', 1900, 1250, 0, 0.002, 0.03, GL.Config.sound.clickLevel);
  },
  chapter: function () {
    if (!this.ctx || this.muted) return;
    var L = GL.Config.sound.storyLevel;
    this.tone('sine', 659.3, 0, 0, 0.02, 0.9, L);
    this.tone('sine', 987.8, 0, 0.16, 0.02, 1.2, L * 0.8);
  }
};
