// Genesis Lab - interface: the Hall of Fame (a tab in the left Lab panel).
// Save up to 20 creatures from the inspector (the star button), even one that just died.
// Each one can be released back into this terrarium (a copy with the same genes and brain,
// fully grown, with a full tank), copied as a share code, or removed. Paste a friend's
// code to add their creature. Saved creatures live in this browser (localStorage); if the
// browser blocks storage, the Hall of Fame still works until the page is closed.
var GL = GL || {};

GL.HallOfFame = (function () {
  var KEY = 'genesisLab.hallOfFame.v1', MAX = 20;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clock(t) { t = Math.max(0, Math.floor(t)); var m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  function HallOfFame(app) {
    this.app = app;
    var $ = function (id) { return document.getElementById(id); };
    this.el = { list: $('hof-list'), code: $('hof-code'), add: $('hof-add'), msg: $('hof-msg') };
    this.items = this.load();
    var self = this;
    this.el.add.addEventListener('click', function () { self.importCode(self.el.code.value); });
    this.el.code.addEventListener('keydown', function (e) { if (e.key === 'Enter') self.importCode(self.el.code.value); e.stopPropagation(); });
    this.el.list.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      var k = Number(b.closest('[data-i]').dataset.i), item = self.items[k];
      if (!item) return;
      if (b.dataset.act === 'release') self.release(item);
      else if (b.dataset.act === 'code') self.copy(item, b);
      else if (b.dataset.act === 'remove') { self.items.splice(k, 1); self.store(); self.render(); self.say('Removed ' + item.name + '.'); }
    });
  }

  HallOfFame.prototype = {
    count: function () { return this.items.length; },
    full: function () { return this.items.length >= MAX; },

    load: function () {
      try { var raw = window.localStorage && localStorage.getItem(KEY), list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list.slice(0, MAX) : []; }
      catch (e) { return []; }
    },
    store: function () {
      try { if (window.localStorage) localStorage.setItem(KEY, JSON.stringify(this.items)); return true; }
      catch (e) { return false; }
    },
    say: function (text, bad) { this.el.msg.textContent = text; this.el.msg.className = 'hof-msg' + (bad ? ' bad' : ''); },

    // Save the creature the inspector shows (a snapshot, so a bug that just died can be saved too).
    save: function (s, speciesName) {
      if (this.full()) { this.say('The Hall of Fame is full (' + MAX + '). Remove one to make room.', true); return false; }
      var code = GL.Genome.encode(s.genes, s.brain, s.hue, speciesName);
      for (var i = 0; i < this.items.length; i++) if (this.items[i].code === code) { this.say('Already in the Hall of Fame.'); return false; }
      this.items.unshift({ code: code, name: speciesName || 'Specimen', id: s.id, hue: s.hue, meat: !!s.meat, gen: s.generation,
                           age: Math.round(s.age), babies: s.babies, kills: s.kills, food: s.foodEaten, seed: this.app.world.seed, saved: Date.now() });
      var kept = this.store();
      this.render();
      this.say((speciesName || 'Specimen') + ' #' + s.id + ' saved' + (kept ? '.' : ' (this browser blocks storage, so it lasts until you close the page).'));
      return true;
    },

    importCode: function (text) {
      var dna = GL.Genome.decode(text);
      if (!dna) { this.say('That code does not look right: it should start with GL1. and be copied whole.', true); return; }
      if (this.full()) { this.say('The Hall of Fame is full (' + MAX + '). Remove one to make room.', true); return; }
      var meat = dna.genes[GL.Genome.G.DIET] >= GL.Config.species.meatDiet;
      this.items.unshift({ code: GL.Genome.encode(dna.genes, dna.brain, dna.hue, dna.name), name: dna.name || 'Imported specimen', id: 0,
                           hue: dna.hue, meat: meat, gen: 0, age: 0, babies: 0, kills: 0, food: 0, seed: 0, saved: Date.now(), imported: true });
      this.store();
      this.el.code.value = '';
      this.render();
      this.say('Added ' + (dna.name || 'a creature') + ' from a code. Release it to see it live.');
    },

    // Put a copy into the terrarium, near the middle of the view, and follow it.
    release: function (item) {
      var dna = GL.Genome.decode(item.code), app = this.app;
      if (!dna) { this.say('This saved code is damaged.', true); return; }
      var cam = app.renderer.camera, R = GL.Config.terrariumRadius * 0.9, x = cam.x, y = cam.y, d = Math.sqrt(x * x + y * y);
      if (d > R) { x *= R / d; y *= R / d; }
      var a = Math.random() * Math.PI * 2;
      var c = app.world.placeCreature(dna.genes, dna.brain, x + Math.cos(a) * 30, y + Math.sin(a) * 30, 'hall', { name: item.name, hue: dna.hue });
      if (!c) { this.say('No room right now: the terrarium is at its limit.', true); return; }
      var sp = app.world.species.get(c.speciesId);
      app.world.story.note('From the Hall of Fame: ' + (sp ? sp.name : item.name) + (item.id ? ' (a copy of specimen #' + item.id + ')' : '') +
        ' was released into the terrarium as specimen #' + c.id + '.', 'god', c.id, c.speciesId);
      app.hud.dismissDeath();
      app.renderer.select(c);
      app.hud.update(0, true);
      this.say('Released as specimen #' + c.id + '.');
    },

    copy: function (item, btn) {
      var self = this, done = function (ok) {
        if (ok) { self.say('Code copied. Paste it anywhere to share ' + item.name + '.'); if (btn) { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Code'; }, 1500); } }
        else { self.el.code.value = item.code; self.el.code.focus(); self.el.code.select(); self.say('Copy the selected code with Ctrl+C (or Cmd+C).'); }
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(item.code).then(function () { done(true); }, function () { done(false); });
        else done(false);
      } catch (e) { done(false); }
    },

    render: function () {
      var html = '';
      if (!this.items.length) html = '<li class="hof-empty">Nothing saved yet. Click a creature, then the star in its panel.</li>';
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i], hue = Math.round(((it.hue % 360) + 360) % 360);
        var bits = it.imported ? 'from a shared code' : ('gen ' + it.gen + ' · lived ' + clock(it.age) + ' · ' + it.babies + (it.babies === 1 ? ' baby' : ' babies') +
          (it.meat ? ' · ' + it.kills + (it.kills === 1 ? ' kill' : ' kills') : ''));
        html += '<li data-i="' + i + '" style="--hue:' + hue + '"><span class="swatch' + (it.meat ? ' meat' : '') + '"></span>' +
          '<div class="hof-text"><div class="hof-name"><i>' + esc(it.name) + '</i>' + (it.id ? ' #' + it.id : '') + '</div><div class="hof-meta">' + esc(bits) + '</div></div>' +
          '<div class="hof-btns"><button class="chip-btn primary" data-act="release" title="Put a copy into this terrarium">Release</button>' +
          '<button class="chip-btn" data-act="code" title="Copy its share code">Code</button>' +
          '<button class="icon-btn" data-act="remove" aria-label="Remove" title="Remove from the Hall of Fame">&times;</button></div></li>';
      }
      this.el.list.innerHTML = html;
    }
  };

  return HallOfFame;
})();
