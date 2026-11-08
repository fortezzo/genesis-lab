// Genesis Lab - interface: settings (the Settings tab of the Lab panel, key G).
// Sound (mute and volume), drawing quality (auto, high, medium, low), reduced motion, the
// guided story (replay it), saving and loading the whole world, and a new world with its own
// seed, creature cap, sprout growth, mutation strength and world size. World settings take
// effect in the next world; everything else applies at once.
// Preferences are remembered in the browser (localStorage), wrapped in try/catch so blocked
// storage never breaks anything.
var GL = GL || {};

// ------------------------------------------------------------------ preferences
GL.Prefs = (function () {
  var KEY = 'genesisLab.prefs.v1';
  var data = null;
  function defaults() {
    return { volume: GL.Config.settings.defaultVolume, muted: false, quality: 'auto', reducedMotion: null,
             storySeen: false, storyOn: null, world: { cap: 0, growth: 1, mutation: 1, size: 'normal' } };
  }
  function load() {
    if (data) return data;
    data = defaults();
    try {
      var raw = window.localStorage && localStorage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (var k in saved) if (k in data) data[k] = saved[k];
        if (!data.world || typeof data.world !== 'object') data.world = defaults().world;
      }
    } catch (e) { /* storage blocked: use the defaults */ }
    return data;
  }
  return {
    get: function (k) { return load()[k]; },
    set: function (k, v) {
      load()[k] = v;
      try { if (window.localStorage) localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* not remembered, still works */ }
    }
  };
})();

// ------------------------------------------------------------------ world settings
// The numbers each world setting scales, as config.js has them (captured once, before any change).
GL.WorldSettings = (function () {
  var C = GL.Config, base = { sproutGrowthRate: C.sproutGrowthRate, geneNudge: C.geneNudge, brainNudge: C.brainNudge,
                              terrariumRadius: C.terrariumRadius };
  var S = C.settings;
  function clampTo(v, r) { v = Number(v); if (!isFinite(v)) v = r[0]; return Math.min(r[1], Math.max(r[0], Math.round(v / r[2]) * r[2])); }
  return {
    base: base,
    // A complete, checked set of world settings: { cap, growth, mutation, size } (cap 0 = this device's usual cap).
    clean: function (ws, defaultCap) {
      ws = ws || {};
      return {
        cap: ws.cap ? clampTo(ws.cap, S.capRange) : defaultCap,
        growth: ws.growth ? +clampTo(ws.growth, S.growthRange).toFixed(2) : 1,
        mutation: ws.mutation ? +clampTo(ws.mutation, S.mutationRange).toFixed(2) : 1,
        size: S.worldSizes[ws.size] ? ws.size : 'normal'
      };
    },
    // Set config.js numbers for a new world. The defaults leave every number exactly as it was.
    apply: function (ws) {
      C.sproutGrowthRate = ws.growth === 1 ? base.sproutGrowthRate : base.sproutGrowthRate * ws.growth;
      C.geneNudge = ws.mutation === 1 ? base.geneNudge : base.geneNudge * ws.mutation;
      C.brainNudge = ws.mutation === 1 ? base.brainNudge : base.brainNudge * ws.mutation;
      C.terrariumRadius = ws.size === 'normal' ? base.terrariumRadius : (S.worldSizes[ws.size] || base.terrariumRadius);
    },
    isDefault: function (ws, defaultCap) { return ws.cap === defaultCap && ws.growth === 1 && ws.mutation === 1 && ws.size === 'normal'; },
    describe: function (ws, defaultCap) {
      var parts = [];
      if (ws.cap !== defaultCap) parts.push('cap ' + ws.cap);
      if (ws.growth !== 1) parts.push('sprouts ×' + ws.growth);
      if (ws.mutation !== 1) parts.push('mutation ×' + ws.mutation);
      if (ws.size !== 'normal') parts.push(ws.size + ' terrarium');
      return parts.join(', ');
    }
  };
})();

// A form for a new world's seed and settings. Used in the Settings tab and in the intro's Advanced box.
// onChange(values) is called whenever something changes; values = { seed, cap, growth, mutation, size }.
GL.WorldForm = function (box, values, defaultCap, onChange) {
  var S = GL.Config.settings, self = this;
  this.values = values; this.box = box;
  function range(key, label, r, fmt, help) {
    return '<label class="set-row" title="' + help + '"><span class="set-name">' + label + '</span>' +
      '<input type="range" data-k="' + key + '" min="' + r[0] + '" max="' + r[1] + '" step="' + r[2] + '">' +
      '<output data-o="' + key + '"></output></label>';
  }
  box.innerHTML =
    '<label class="set-row" title="The same seed and settings always give the same starting world. Leave it empty for a random one.">' +
      '<span class="set-name">Seed</span><input type="text" inputmode="numeric" data-k="seed" placeholder="random" spellcheck="false" autocomplete="off" maxlength="10"></label>' +
    range('cap', 'Creature cap', S.capRange, '', 'Most creatures alive at once. More means a busier terrarium (and more work for this device).') +
    range('growth', 'Sprout growth', S.growthRange, '×', 'How fast sprouts grow, compared with the usual rate. More food means longer lives; less means harder times.') +
    range('mutation', 'Mutation strength', S.mutationRange, '×', 'How big each random DNA change is when a baby is born. Stronger means faster but clumsier evolution.') +
    '<div class="set-row" title="How big the terrarium is. The heat lamps and their feeding grounds stay the same size."><span class="set-name">World size</span>' +
      '<span class="seg" data-k="size"><button data-v="small">Small</button><button data-v="normal">Normal</button><button data-v="large">Large</button></span></div>';
  this.inputs = box.querySelectorAll('[data-k]');
  box.addEventListener('input', function (e) {
    var k = e.target.dataset && e.target.dataset.k;
    if (!k) return;
    self.values[k] = k === 'seed' ? e.target.value.replace(/[^0-9]/g, '') : Number(e.target.value);
    if (k === 'seed' && e.target.value !== self.values.seed) e.target.value = self.values.seed;
    self.show(); onChange(self.values);
  });
  box.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.seg[data-k] button') : null;
    if (!b) return;
    self.values.size = b.dataset.v; self.show(); onChange(self.values);
  });
  box.addEventListener('keydown', function (e) { e.stopPropagation(); });      // typing a seed never triggers shortcuts
  this.defaultCap = defaultCap;
  this.show();
};
GL.WorldForm.prototype.show = function () {
  var v = this.values, box = this.box;
  for (var i = 0; i < this.inputs.length; i++) {
    var el = this.inputs[i], k = el.dataset.k;
    if (el.tagName === 'INPUT' && document.activeElement !== el) el.value = k === 'seed' ? (v.seed || '') : v[k];
  }
  var o = function (k, t) { var el = box.querySelector('[data-o="' + k + '"]'); if (el) el.textContent = t; };
  o('cap', v.cap + (v.cap === this.defaultCap ? ' (usual)' : ''));
  o('growth', '×' + Number(v.growth).toFixed(2).replace(/\.?0+$/, '') + (v.growth === 1 ? ' (usual)' : ''));
  o('mutation', '×' + Number(v.mutation).toFixed(2).replace(/\.?0+$/, '') + (v.mutation === 1 ? ' (usual)' : ''));
  var segs = box.querySelectorAll('.seg[data-k="size"] button');
  for (i = 0; i < segs.length; i++) { segs[i].classList.toggle('on', segs[i].dataset.v === v.size); segs[i].setAttribute('aria-pressed', segs[i].dataset.v === v.size); }
};

// ------------------------------------------------------------------ the Settings tab
GL.SettingsPanel = function (app) {
  this.app = app;
  var self = this, box = document.getElementById('settings');
  box.innerHTML =
    '<section class="set-sec"><div class="set-head">Sound</div>' +
      '<div class="set-row"><span class="set-name">Volume</span><input type="range" id="set-volume" min="0" max="1" step="0.05" aria-label="Volume">' +
      '<button id="set-mute" class="chip-btn" aria-pressed="false">Mute</button></div>' +
      '<p class="set-note">A low lab hum, a soft blip for each birth you can see, a chime when a species dies out. Key M mutes.</p></section>' +
    '<section class="set-sec"><div class="set-head">Display</div>' +
      '<div class="set-row" title="Auto lowers footprints, particles and dust when the frame rate drops, and raises them again when there is room.">' +
        '<span class="set-name">Quality</span><span class="seg" id="set-quality"><button data-v="auto">Auto</button><button data-v="high">High</button><button data-v="medium">Medium</button><button data-v="low">Low</button></span></div>' +
      '<label class="set-row" title="Turns off footprints, the lamp shimmer, swaying sprouts, screen shake and camera glides (the camera cuts instead)."><span class="set-name">Reduced motion</span>' +
        '<input type="checkbox" id="set-motion" class="switch"><span class="set-val" id="set-motion-note"></span></label></section>' +
    '<section class="set-sec"><div class="set-head">Guided story</div>' +
      '<p class="set-note">A 3-5 minute documentary of a brand-new world: the camera follows what really happens and slows down for each big moment.</p>' +
      '<button id="set-story" class="chip-btn primary">Replay the story in a new world</button></section>' +
    '<section class="set-sec"><div class="set-head">This world <span id="set-world-id" class="set-val"></span></div>' +
      '<div class="set-btns"><button id="set-save" class="chip-btn">Save world</button><button id="set-load" class="chip-btn">Load world…</button>' +
      '<input type="file" id="set-file" accept=".json,application/json" hidden></div>' +
      '<p class="set-note" id="set-world-msg">Saves every creature, brain, species and chart as a .json file you can load back later, here or on another device.</p></section>' +
    '<section class="set-sec"><div class="set-head">New world</div>' +
      '<div id="set-form"></div>' +
      '<div class="set-btns"><button id="set-new" class="chip-btn primary">Start new world</button><button id="set-reset" class="chip-btn">Usual settings</button></div>' +
      '<p class="set-note">Seed and world settings take effect in the new world.</p></section>';
  var $ = function (id) { return document.getElementById(id); };
  this.el = { volume: $('set-volume'), mute: $('set-mute'), quality: $('set-quality'), motion: $('set-motion'), motionNote: $('set-motion-note'),
              worldId: $('set-world-id'), msg: $('set-world-msg'), file: $('set-file') };
  this.form = new GL.WorldForm($('set-form'), app.nextWorldValues(), app.defaultCap, function (v) { app.rememberWorldValues(v); });

  this.el.volume.addEventListener('input', function () { app.sound.setVolume(Number(self.el.volume.value)); self.refresh(); });
  this.el.mute.addEventListener('click', function () { app.sound.toggleMute(); });
  this.el.quality.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    app.setQuality(b.dataset.v); self.refresh();
  });
  this.el.motion.addEventListener('change', function () { app.setReducedMotion(self.el.motion.checked, true); self.refresh(); });
  $('set-story').addEventListener('click', function () { app.replayStory(); });
  $('set-save').addEventListener('click', function () { self.say(app.saveWorld()); });
  $('set-load').addEventListener('click', function () { self.el.file.value = ''; self.el.file.click(); });
  this.el.file.addEventListener('change', function () {
    var f = self.el.file.files && self.el.file.files[0];
    if (f) app.loadWorldFile(f, function (msg, bad) { self.say(msg, bad); });
  });
  $('set-new').addEventListener('click', function () { app.newWorld(self.form.values); });
  $('set-reset').addEventListener('click', function () {
    var v = self.form.values; v.cap = app.defaultCap; v.growth = 1; v.mutation = 1; v.size = 'normal'; v.seed = '';
    app.rememberWorldValues(v); self.form.show();
  });
  box.addEventListener('keydown', function (e) { if (e.target.tagName === 'INPUT') e.stopPropagation(); });
  this.refresh();
};
GL.SettingsPanel.prototype = {
  say: function (text, bad) { if (!text) return; this.el.msg.textContent = text; this.el.msg.classList.toggle('bad', !!bad); },
  refresh: function () {
    var app = this.app, el = this.el, snd = app.sound;
    if (document.activeElement !== el.volume) el.volume.value = snd.volume;
    el.mute.textContent = snd.muted ? 'Unmute' : 'Mute';
    el.mute.setAttribute('aria-pressed', snd.muted ? 'true' : 'false');
    el.mute.classList.toggle('primary', snd.muted);
    var q = app.renderer.qualityMode, bs = el.quality.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) { bs[i].classList.toggle('on', bs[i].dataset.v === q); bs[i].setAttribute('aria-pressed', bs[i].dataset.v === q); }
    el.motion.checked = app.renderer.reducedMotion;
    el.motionNote.textContent = GL.Prefs.get('reducedMotion') === null ? (app.systemReducedMotion ? 'on (your system setting)' : 'off (your system setting)') : '';
    var w = app.world, desc = GL.WorldSettings.describe(app.worldSettings, app.defaultCap);
    el.worldId.textContent = 'seed ' + w.seed + (desc ? ' · ' + desc : '');
    this.form.show();
  }
};
