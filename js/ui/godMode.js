// Genesis Lab - interface: god mode, in the left "Lab" panel (key G).
// Six ways to change the world: Drought, Sprout bloom and Ice age act at once (with a
// countdown while they last); Meteor strike and Predator drop wait for a click on the
// terrarium; Paint food plants sprouts wherever you drag. Esc puts an armed tool away.
// The simulation does the work (world.js); this file only asks it and shows what happens.
// The panel also holds the Hall of Fame tab (hallOfFame.js).
var GL = GL || {};

GL.GodMode = (function () {
  var C = GL.Config, D = C.god;
  var ICONS = {
    drought: '<path d="M8 1.5c2.4 3.2 4 5.4 4 7.6a4 4 0 0 1-8 0c0-2.2 1.6-4.4 4-7.6z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 14.5l10-10" stroke="currentColor" stroke-width="1.5"/>',
    bloom: '<path d="M8 14.5V8" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 8.5C4.5 8.5 3 6 3 3.5 6 3.5 8 5 8 8.5zM8 8.5c3.5 0 5-2.5 5-5-3 0-5 1.5-5 5z"/>',
    ice: '<path d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5M6 2.8L8 4.5l2-1.7M6 13.2l2-1.7 2 1.7" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    meteor: '<circle cx="10" cy="10" r="3.5"/><path d="M7.5 7.5L2 2M9 6.5L5.5 1.5M6.5 9L1.5 5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    drop: '<path d="M8 2l2 3h3l-2 3 1.5 4L8 10l-4.5 2L5 8 3 5h3z"/>',
    paint: '<path d="M11.5 1.8l2.7 2.7-6.8 6.8-3.3.6.6-3.3z"/><path d="M2 14.5c1.5 0 2.5-.6 2.5-2" stroke="currentColor" stroke-width="1.4" fill="none"/>'
  };
  var TOOLS = [
    { key: 'drought', name: 'Drought', desc: 'Half the sprouts wither and almost none grow for ' + D.droughtSeconds + ' s.' },
    { key: 'bloom', name: 'Sprout bloom', desc: D.bloomSprouts + ' sprouts burst up under the lamps, then growth runs fast for ' + D.bloomSeconds + ' s.' },
    { key: 'ice', name: 'Ice age', desc: D.iceSeconds + ' s of cold: legs slow down, staying warm costs more, sprouts barely grow.' },
    { key: 'meteor', name: 'Meteor strike', desc: 'Click the terrarium to drop it. Everything in the blast is lost.', arm: true },
    { key: 'drop', name: 'Predator drop', desc: 'Click to release ' + D.dropCount + ' meat-eaters (copies of the best one alive).', arm: true },
    { key: 'paint', name: 'Paint food', desc: 'Drag across the soil to plant sprouts by hand.', arm: true }
  ];

  function GodMode(app) {
    this.app = app;
    var $ = function (id) { return document.getElementById(id); };
    this.el = { root: $('lab'), tools: $('god-tools'), status: $('god-status'), btn: $('btn-lab'), close: $('lab-close'),
                tabGod: $('tab-god'), tabHof: $('tab-hof'), god: $('god'), hof: $('hof') };
    this.open = false;
    this.tab = 'god';
    this.armed = null;              // 'meteor' | 'drop' | 'paint' while a tool waits for the pointer
    this.painting = false;          // the pointer is down with Paint food
    this.paintAcc = 0; this.painted = 0;
    this.statusTimer = 0;
    this.build();
    var self = this;
    this.el.btn.addEventListener('click', function () { self.toggle(); });
    this.el.close.addEventListener('click', function () { self.toggle(false); });
    this.el.tabGod.addEventListener('click', function () { self.showTab('god'); });
    this.el.tabHof.addEventListener('click', function () { self.showTab('hof'); });
    document.getElementById('tab-settings').addEventListener('click', function () { self.showTab('settings'); });
  }

  GodMode.prototype = {
    build: function () {
      var html = '', self = this;
      TOOLS.forEach(function (t) {
        html += '<button class="god-tool" data-tool="' + t.key + '" title="' + t.desc + '">' +
          '<svg viewBox="0 0 16 16" aria-hidden="true">' + ICONS[t.key] + '</svg>' +
          '<span class="gt-name">' + t.name + '</span><span class="gt-desc">' + t.desc + '</span></button>';
      });
      this.el.tools.innerHTML = html;
      this.el.tools.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-tool]') : null;
        if (b) self.use(b.dataset.tool);
      });
    },

    toggle: function (on) {
      on = on === undefined ? !this.open : on;
      if (on === this.open) return;
      this.open = on;
      this.el.root.classList.toggle('hidden', !on);
      document.body.classList.toggle('lab-open', on);
      this.el.btn.classList.toggle('active', on);
      this.el.btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      var sb = document.getElementById('btn-settings');
      if (sb) sb.classList.toggle('active', on && this.tab === 'settings');
      if (!on) this.disarm();
      this.app.hud.hideHint();
      this.app.layoutChanged();
      if (on && this.tab === 'hof') this.app.hallOfFame.render();
    },
    showTab: function (tab) {
      this.tab = tab;
      var tabs = { god: [this.el.tabGod, this.el.god], hof: [this.el.tabHof, this.el.hof],
                   settings: [document.getElementById('tab-settings'), document.getElementById('settings')] };
      for (var k in tabs) {
        tabs[k][0].classList.toggle('active', tab === k); tabs[k][0].setAttribute('aria-selected', tab === k);
        tabs[k][1].classList.toggle('hidden', tab !== k);
      }
      if (tab !== 'god') this.disarm();
      if (tab === 'hof') this.app.hallOfFame.render();
      if (tab === 'settings' && this.app.settings) this.app.settings.refresh();
      var sb = document.getElementById('btn-settings');
      if (sb) sb.classList.toggle('active', this.open && tab === 'settings');
    },
    // Open the panel on one tab (or close it if it is already showing that tab).
    openTab: function (tab) {
      if (this.open && this.tab === tab) { this.toggle(false); return; }
      this.showTab(tab);
      this.toggle(true);
    },

    // A tool button was pressed: act now, or arm the tool and wait for the pointer.
    use: function (key) {
      var w = this.app.world, t = null;
      for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].key === key) t = TOOLS[i];
      if (!t) return;
      if (t.arm) { if (this.armed === key) this.disarm(); else this.arm(key); return; }
      this.disarm();
      if (key === 'drought') w.godDrought();
      else if (key === 'bloom') w.godBloom();
      else if (key === 'ice') w.godIceAge();
      this.statusTimer = 0;
    },
    arm: function (key) {
      this.armed = key;
      this.app.renderer.tool = { kind: key === 'drop' ? 'drop' : key, x: 0, y: 0, on: false, down: false };
      this.app.cinematic.stop();
      document.body.classList.add('tool-armed');
      this.refreshButtons();
      var how = { meteor: 'Click the terrarium to drop the meteor. Esc to cancel.', drop: 'Click where the meat-eaters should arrive. Esc to cancel.',
                  paint: 'Drag across the soil to plant sprouts. Esc when you are done.' }[key];
      this.app.labLog.showToast({ text: how, kind: 'god' });
    },
    disarm: function () {
      if (!this.armed) return;
      this.endPaint();
      this.armed = null;
      this.app.renderer.tool = null;
      document.body.classList.remove('tool-armed');
      this.refreshButtons();
    },
    refreshButtons: function () {
      var btns = this.el.tools.querySelectorAll('[data-tool]');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('armed', btns[i].dataset.tool === this.armed);
    },

    // Pointer events from the terrarium while a tool is armed (controls.js). Returns true when used.
    pointer: function (type, sx, sy) {
      if (!this.armed) return false;
      var cam = this.app.renderer.camera, t = this.app.renderer.tool, w = this.app.world;
      var x = cam.screenToWorldX(sx), y = cam.screenToWorldY(sy);
      t.x = x; t.y = y; t.on = type !== 'leave';
      if (this.armed === 'paint') {
        if (type === 'down') { this.painting = true; t.down = true; this.paintAcc = 0.6; }
        else if (type === 'up' || type === 'leave') this.endPaint();
        return true;
      }
      if (type === 'click') {
        var R = C.terrariumRadius;
        if (x * x + y * y > R * R) return true;                     // outside the glass: nothing happens
        if (this.armed === 'meteor') w.godMeteor(x, y);
        else if (this.armed === 'drop') {
          var made = w.godPredatorDrop(x, y);
          if (!made) this.app.labLog.showToast({ text: 'No room for newcomers right now: the terrarium is full.', kind: 'warn' });
        }
        this.disarm();
      }
      return true;
    },
    endPaint: function () {
      if (this.painting && this.painted > 0) {
        this.app.world.story.note('Paint food: you planted ' + this.painted + ' sprouts by hand.', 'god');
      }
      this.painting = false; this.painted = 0;
      if (this.app.renderer.tool) this.app.renderer.tool.down = false;
    },

    update: function (dt) {
      // Paint while the pointer is held down (in real time, at any speed, even paused).
      if (this.painting && this.app.renderer.tool) {
        var t = this.app.renderer.tool, R = C.terrariumRadius;
        this.paintAcc += dt * D.paintRate;
        var n = Math.floor(this.paintAcc);
        if (n > 0 && t.x * t.x + t.y * t.y < R * R) { this.paintAcc -= n; this.painted += this.app.world.godPaint(t.x, t.y, D.paintRadius, n); }
        else if (n > 0) this.paintAcc -= n;
      }
      if (!this.open) return;
      this.statusTimer -= dt;
      if (this.statusTimer > 0) return;
      this.statusTimer = 0.25;
      var g = this.app.world.god, rows = [];
      function row(name, left, total, cls) {
        rows.push('<div class="gs-row ' + cls + '"><span>' + name + '</span><span class="gs-bar"><i style="transform:scaleX(' +
          Math.max(0, Math.min(1, left / total)).toFixed(3) + ')"></i></span><span class="num">' + Math.ceil(left) + ' s</span></div>');
      }
      if (g.drought > 0) row('Drought', g.drought, D.droughtSeconds, 'dry');
      if (g.bloom > 0) row('Sprout bloom', g.bloom, D.bloomSeconds, 'bloom');
      if (g.ice > 0) row('Ice age', g.ice, D.iceSeconds, 'ice');
      else if (g.iceLevel > 0.01) rows.push('<div class="gs-row ice"><span>Thawing…</span></div>');
      if (g.meteors.length) rows.push('<div class="gs-row hot"><span>Meteor falling…</span></div>');
      var html = rows.length ? rows.join('') : '<div class="gs-row idle"><span>Nothing unusual is happening.</span></div>';
      if (html !== this._status) { this._status = html; this.el.status.innerHTML = html; }
      var hof = this.app.hallOfFame ? this.app.hallOfFame.count() : 0, tc = document.getElementById('hof-count');
      if (tc && tc.textContent !== (hof ? String(hof) : '')) tc.textContent = hof ? String(hof) : '';
    }
  };

  return GodMode;
})();
