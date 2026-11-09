// Genesis Lab - interface: the guided story. A short documentary for first-time visitors.
// It starts when the visitor presses Begin experiment, and tells this run's own story: each
// chapter is triggered by something that really happened in this world, never by a clock:
//   the start (100 random brains), foraging skill clearly rising, a meat-eater born by a gut
//   switch, the first hunter species, the first new species, a big crash and a record.
// For each chapter a big caption appears while the camera flies to the bug or event it is about,
// and time slows to 1x so you can watch; between chapters time speeds up. The whole arc takes
// about 3-5 real minutes. A chapter that never happens in this world is skipped, and the ending
// suggests Predator drop in god mode if no hunters evolved.
// "Skip story", or any click, tap, scroll or key, hands control back at once. It plays once
// for new visitors (remembered in the browser) and can be replayed from Settings.
// It only moves the camera, sets the speed and shows captions: it reads the world and never
// changes it, so the simulation runs exactly the same with or without it.
var GL = GL || {};

GL.StoryMode = (function () {
  var C = GL.Config, SM = C.storyMode;
  var ORDER = ['skill', 'meat', 'hunters', 'species', 'crash', 'record', 'champion'];   // which waiting chapter goes first

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clock(t) { t = Math.max(0, Math.floor(t)); var m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function StoryMode(app) {
    this.app = app;
    this.on = false;
    var $ = function (id) { return document.getElementById(id); };
    this.el = { root: $('story'), kicker: $('story-kicker'), title: $('story-title'), sub: $('story-sub'),
                skip: $('story-skip'), ff: $('story-ff') };
    var self = this;
    this.el.skip.addEventListener('click', function (e) { e.stopPropagation(); self.stop('skip'); });
    // Any click, tap, scroll or key hands control back (the input still does its usual job too).
    this.onInput = function (e) {
      if (!self.on || performance.now() - self.startedAt < SM.inputGraceMs) return;
      if (e.target === self.el.skip) return;
      self.stop('skip');
    };
  }

  StoryMode.prototype = {
    // ---------------------------------------------------------------- start and stop
    start: function () {
      var app = this.app, w = app.world;
      if (this.on) this.stop('restart');
      this.on = true;
      this.startedAt = performance.now();
      this.t = 0;                         // real seconds since the story began
      this.chapterN = 0;
      this.done = {}; this.queue = []; this.queued = {};
      this.logSeen = w.events.logCount;
      this.simStart = w.time;
      app.cinematic.stop();
      app.hud.dismissDeath();
      app.renderer.select(null);
      if (app.godMode.open) app.godMode.toggle(false);
      if (app.hud.drawerOpen) app.hud.toggleDrawer(false);
      app.phoneTabs && app.phoneTabs.closeAll();
      document.body.classList.add('story-on');
      var cam = app.renderer.camera;
      cam.ease = SM.flyEase;
      this.savedOffY = cam.offY;
      GL.Prefs.set('storySeen', true);
      ['pointerdown', 'wheel', 'keydown'].forEach(function (t) { window.addEventListener(t, this.onInput, true); }, this);
      this.el.root.classList.remove('hidden');
      this.enter('open');
    },

    stop: function (reason) {
      if (!this.on) return;
      this.on = false;
      var app = this.app, cam = app.renderer.camera;
      ['pointerdown', 'wheel', 'keydown'].forEach(function (t) { window.removeEventListener(t, this.onInput, true); }, this);
      document.body.classList.remove('story-on');
      this.el.root.classList.add('hidden');
      this.caption(null);
      this.el.ff.classList.add('hidden');
      cam.ease = 0;
      cam.offY = this.savedOffY || 0;
      if (cam.follow && !app.renderer.getSelected()) {           // keep looking at the bug, but let the viewer move freely
        cam.stopFollowing();
      }
      if (reason !== 'restart') {
        app.loop.setSpeed(C.defaultSpeed);
        app.hud.refreshSpeeds();
        app.layoutChanged();
        setTimeout(function () { app.tips.show(); }, 500);        // after the click that skipped has done its job
      }
    },

    // ---------------------------------------------------------------- the director
    update: function (dt) {
      if (!this.on) return;
      this.t += dt; this.phaseT += dt;
      this.watch();
      var st = this.state;
      if (st === 'open') this.updateOpen();
      else if (st === 'gap') this.updateGap();
      else if (st === 'moment') this.updateMoment();
      else if (st === 'end' && this.phaseT >= SM.endSec) this.stop('end');
      if (this.t > SM.maxRealSec + 30 && st !== 'end') this.enter('end');   // a safety net: it always finishes
    },

    enter: function (state, data) {
      this.state = state; this.phaseT = 0;
      var app = this.app;
      if (state === 'gap') {
        this.caption(null);
        this.wide(1);
        this.setSpeed(this.t > SM.lateAfterSec ? SM.gapSpeedLate : SM.gapSpeed);
        this.el.ff.classList.remove('hidden');
      } else {
        this.el.ff.classList.add('hidden');
      }
      if (state === 'open') this.beginOpen();
      if (state === 'moment') this.beginMoment(data);
      if (state === 'end') this.beginEnd();
      if (state !== 'gap' && app.sound) app.sound.chapter();
    },

    setSpeed: function (s) {
      var loop = this.app.loop;
      if (loop.speed !== s || loop.paused) { loop.setSpeed(s); this.app.hud.refreshSpeeds(); }
    },

    // Look for chapter-worthy events in the world (reading only).
    watch: function () {
      var w = this.app.world, s = w.stats, self = this;
      function want(key, data) { if (!self.done[key] && !self.queued[key]) { self.queued[key] = true; self.queue.push({ key: key, data: data || {}, at: w.time }); } }
      if (s.startSkill > 0 && w.time > 120 && s.skill >= SM.skillMin && s.skill >= SM.skillVsStart * s.startSkill) want('skill');
      if (!this.done.meat && !this.queued.meat && s.predators > 0) {
        var m = this.findMeatEater();
        if (m) want('meat', { id: m.id });
      }
      var list = w.species.list;
      for (var i = 0; i < list.length; i++) {
        var sp = list[i];
        if (sp.origin !== 'evolved' || sp.count <= 0) continue;
        if (sp.meat && sp.count >= SM.hunterMembers) want('hunters', { speciesId: sp.id });
        if (!sp.meat && sp.announced) want('species', { speciesId: sp.id });
      }
      var ev = w.events, log = ev.log;
      if (ev.logCount !== this.logSeen) {
        for (var k = 0; k < log.length; k++) {
          var l = log[k];
          if (l.n <= this.logSeen) continue;
          if (l.kind === 'crash') want('crash', { text: l.text });
          // A record worth a chapter: an evolved bug (not one of the random starters) that had babies.
          var gen = /\(gen (\d+)\)/.exec(l.text), kids = /(\d+) bab/.exec(l.text);
          if (l.kind === 'record' && gen && +gen[1] >= 1 && kids && +kids[1] > 0) want('record', { text: l.text, id: l.id });
        }
        this.logSeen = ev.logCount;
      }
    },

    // ---------------------------------------------------------------- the opening
    beginOpen: function () {
      this.setSpeed(SM.momentSpeed);
      this.wide(1);
      this.openBug = null;
      this.caption('Minute 0 · The experiment begins', C.startCreatures + ' random brains. No instructions.',
        'Every bug in this terrarium was born with a brain wired at random. Nobody has told them what food is, or how to find it.');
    },
    updateOpen: function () {
      if (!this.openBug && this.phaseT >= SM.openSec) {
        var c = this.pickWanderer();
        if (c) {
          this.openBug = c;
          this.follow(c, 2.0);
          this.caption('Minute 0 · The experiment begins', C.startCreatures + ' random brains. No instructions.',
            'This one senses, thinks and walks with its own random network: 390 numbers that nobody chose. Watch it wander.');
        }
      }
      if (this.phaseT >= SM.openSec + SM.momentSec) this.enter('gap');
    },

    // ---------------------------------------------------------------- between chapters
    updateGap: function () {
      var w = this.app.world, mins = (w.time - this.simStart) / 60;
      if (this.queue.length) { this.enter('moment', this.takeNext()); return; }
      var core = this.done.skill && this.done.meat && this.done.hunters && this.done.species;
      // Everything happened quickly: before the ending, one more true moment, the champion.
      if (core && !this.done.champion && this.t < SM.minRealSec) {
        var ch = w.findById(w.stats.championId);
        if (ch && ch.babies >= 3) { this.enter('moment', { key: 'champion', data: { id: ch.id } }); return; }
      }
      // Everything happened early: keep watching (a crash or a record may still come) until the story has
      // run about minRealSec, so even a fast world gets a 3-minute story.
      if ((core && this.t >= SM.minRealSec - SM.endSec) || mins >= SM.maxSimMin || this.t >= SM.maxRealSec) { this.enter('end'); return; }
      if (this.t > SM.lateAfterSec) this.setSpeed(SM.gapSpeedLate);
      var label = '▶▶ ' + this.app.loop.speed + '× · ' + clock(w.time) + ' · fast-forwarding to the next moment';
      if (label !== this._ff) { this._ff = label; this.el.ff.textContent = label; }
    },
    takeNext: function () {
      var q = this.queue, best = 0;
      for (var i = 1; i < q.length; i++) if (ORDER.indexOf(q[i].key) < ORDER.indexOf(q[best].key)) best = i;
      var e = q.splice(best, 1)[0];
      this.queued[e.key] = false;
      return e;
    },

    // ---------------------------------------------------------------- chapters
    beginMoment: function (e) {
      var app = this.app, w = app.world, s = w.stats, d = e.data, c = null, sp = null;
      this.done[e.key] = true;
      this.chapterN++;
      this.moment = { key: e.key, dur: SM.momentSec, subject: null, subjectId: 0, kills: 0, speciesId: d.speciesId || 0 };
      this.setSpeed(SM.momentSpeed);
      var kicker = 'Chapter ' + this.chapterN + ' · ' + clock(w.time) + ' into the experiment';
      if (e.key === 'skill') {
        c = this.pickForager();
        if (c) this.follow(c, 2.2); else this.wide(1.6);
        this.caption(kicker, 'They’re learning to find food.',
          'Hungry bugs now find food ' + s.skill.toFixed(1) + '× faster than random brains would in the same spots. Nobody taught them: the better foragers simply had more babies.');
      } else if (e.key === 'meat') {
        c = w.findById(d.id) || this.findMeatEater();
        if (!c) { this.done.meat = false; this.enter('gap'); return; }
        this.follow(c, 2.5);
        var n = s.meatBirths, first = n <= 1;
        this.caption(kicker, 'A meat-eater is born.',
          'Specimen #' + c.id + ' was born with a gut switch' + (first ? ', the first meat-eater in this world.' : ': meat-eater number ' + n + ' in this world.') +
          ' Its brain still steers toward food, and to it, the other bugs are food now.');
      } else if (e.key === 'hunters') {
        sp = w.species.get(d.speciesId);
        c = this.pickHunter(d.speciesId);
        this.moment.dur = SM.huntMaxSec;
        if (c) this.follow(c, 2.4); else this.wide(1.6);
        this.caption(kicker, 'Hunters.',
          '<i>' + esc(sp ? sp.name : 'A meat-eater species') + '</i> has grown to ' + plural(sp ? Math.max(sp.peak, SM.hunterMembers) : SM.hunterMembers, 'meat-eater', 'meat-eaters') +
          ', and they hunt the plant-eaters. Watch the pincers.');
      } else if (e.key === 'species') {
        sp = w.species.get(d.speciesId);
        var parent = sp ? w.species.get(sp.parentId) : null;
        c = this.memberOf(d.speciesId);
        if (c) this.follow(c, 2.0); else this.wide(1.4);
        this.caption(kicker, 'A new species.',
          '<i>' + esc(sp ? sp.name : 'A family line') + '</i> has drifted so far from its ancestors’ DNA that it counts as a new kind of bug' +
          (parent ? ', branching off <i>' + esc(parent.name) + '</i>.' : '.'));
      } else if (e.key === 'crash') {
        this.wide(1);
        this.caption(kicker, 'A crash.', esc(d.text.replace(/^Population crash:\s*/, '').replace(/^./, function (x) { return x.toUpperCase(); })));
      } else if (e.key === 'champion') {
        c = w.findById(d.id);
        if (!c) { this.enter('gap'); return; }
        sp = w.species.get(c.speciesId);
        this.follow(c, 2.2);
        this.caption(kicker, 'The champion.',
          (sp ? '<i>' + esc(sp.name) + '</i> ' : 'Specimen ') + '#' + c.id + ', generation ' + c.generation + ', has had ' + plural(c.babies, 'baby', 'babies') +
          ' in ' + clock(c.age) + ' of life: the best score of any bug alive. Its genes are spreading through the terrarium.');
      } else if (e.key === 'record') {
        var child = null, list = w.creatures;
        for (var i = 0; i < list.length; i++) if (list[i].parentId === d.id) { child = list[i]; break; }
        if (child) this.follow(child, 2.0); else this.wide(1.4);
        this.caption(kicker, 'A record.', esc(d.text.replace(/^Record:\s*/, '').replace(/^./, function (x) { return x.toUpperCase(); })) +
          (child ? ' Its child #' + child.id + ' carries its genes on.' : ''));
      }
      if (c) { this.moment.subject = c; this.moment.subjectId = c.id; this.moment.kills = c.kills; }
    },

    updateMoment: function () {
      var m = this.moment, c = m.subject;
      var alive = c && c.alive && c.id === m.subjectId;
      if (m.key === 'hunters') {
        if (alive && c.kills > m.kills) {                               // a kill: say so, and hold the shot a little
          m.kills = c.kills; m.caught = true;
          this.caption(null, null, 'Caught. #' + c.id + ' made a kill. Every body it leaves is food for the hunters, and room for new prey.', true);
          if (m.dur - this.phaseT < 4) m.dur = this.phaseT + 4;
        } else if (!m.caught && this.phaseT > 4 && (!alive || !this.isHunting(c))) {
          var h = this.pickHunter(m.speciesId, true);                   // this one gave up: find one that is hunting
          if (h && h !== c) { this.follow(h, 2.4); m.subject = h; m.subjectId = h.id; m.kills = h.kills; }
        }
      } else if (c && !alive && this.phaseT < m.dur - 2) {
        this.wide(1.6);                                                 // the star of the shot died: pull back
        m.subject = null;
      }
      if (this.phaseT >= SM.captionSec && !m.captionHidden && !m.caught) { m.captionHidden = true; this.caption(null); }
      if (this.phaseT >= m.dur) this.enter('gap');
    },

    // ---------------------------------------------------------------- the ending
    beginEnd: function () {
      var w = this.app.world, s = w.stats, mins = Math.max(1, Math.round(w.time / 60));
      this.setSpeed(C.defaultSpeed);
      this.wide(1);
      var lines = s.maxGenerationEver + ' generations · ' + plural(w.species.living, 'species', 'species') + ' alive · foraging skill ' +
        s.skill.toFixed(1) + '× random brains.<br>Nobody programmed any of it. Your turn: click any bug to open its brain.';
      var where = window.innerWidth <= 760 ? 'Open the World tab' : 'Open the Lab (G)';
      if (!this.done.hunters) lines += '<br><span class="story-try">No hunters evolved in this world this time. ' + where + ' and try <b>Predator drop</b>.</span>';
      this.caption('The story so far', plural(mins, 'minute', 'minutes') + ' of evolution.', lines);
      this.el.skip.textContent = 'Explore';
    },

    // ---------------------------------------------------------------- camera and captions
    caption: function (kicker, title, sub, keepTitle) {
      var el = this.el, root = el.root;
      if (kicker === null && title == null && sub == null) { root.classList.remove('show'); return; }
      if (!keepTitle) { el.kicker.textContent = kicker || ''; el.title.textContent = title || ''; }
      el.sub.innerHTML = sub || '';
      if (keepTitle) { root.classList.add('show'); return; }
      root.classList.remove('show');
      void root.offsetWidth;                           // restart the fade-in
      root.classList.add('show');
      if (this.el.skip.textContent !== 'Skip story' && this.state !== 'end') this.el.skip.textContent = 'Skip story';
    },
    follow: function (c, zoom) {
      var cam = this.app.renderer.camera, fit = cam.fitZoom();
      cam.follow = c; cam.followId = c.id;
      cam.offY = cam.h * (cam.w < 760 ? 0.12 : 0.08);  // keep the bug above the caption
      cam.tzoom = cam.clampZoom(Math.min(zoom, fit * 12));
    },
    // The whole terrarium (k = 1) or a little closer, centred in the space below the top bar.
    wide: function (k) {
      var cam = this.app.renderer.camera, fit = cam.fitZoom();
      cam.stopFollowing();
      cam.offY = 0;
      cam.tzoom = cam.clampZoom(fit * k);
      cam.tx = 0; cam.ty = -(cam.insets.top - cam.insets.bottom) / 2 / cam.tzoom;
      if (k > 1) { var p = this.app.cinematic.findCrowd(); cam.tx = p.x * 0.6; cam.ty = p.y * 0.6; }
    },

    // ---------------------------------------------------------------- choosing who to show
    // Opening: a starting bug near a heat lamp (more chance it meets food while we watch).
    pickWanderer: function () {
      var w = this.app.world, best = null, bestD = Infinity;
      for (var i = 0; i < w.creatures.length; i++) {
        var c = w.creatures[i];
        for (var k = 0; k < w.lamps.length; k++) {
          var dx = c.x - w.lamps[k].x, dy = c.y - w.lamps[k].y, d = dx * dx + dy * dy - (c.speed > 1 ? 4e4 : 0);
          if (d < bestD) { bestD = d; best = c; }
        }
      }
      return best;
    },
    // Learning: a hungry grown plant-eater walking with food straight ahead.
    pickForager: function () {
      var w = this.app.world, best = null, bestScore = 0;
      for (var i = 0; i < w.creatures.length; i++) {
        var c = w.creatures[i];
        if (c.meat || c.age < C.growTime || !c.hungry) continue;
        var walking = c.speed > 0.3 * c.topSpeed, ahead = Math.abs(c.lookAngle) < 0.35;
        var score = c.lookAmount * (walking ? 1 : 0.3) * (ahead ? 1 : 0.4);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      return best;
    },
    // A living meat-eater born by a gut switch (not one dropped by the experimenter): the youngest.
    findMeatEater: function () {
      var list = this.app.world.creatures, best = null;
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.meat && !c.placed && (!best || c.age < best.age)) best = c;
      }
      return best;
    },
    isHunting: function (c) { var tick = this.app.world.tick; return tick - c.lastBiteTick <= 3 || (c.lookPrey && c.lookAmount > 0.3); },
    // A member of the hunter species that is holding prey, or closing in on prey it can see.
    pickHunter: function (speciesId, mustHunt) {
      var list = this.app.world.creatures, tick = this.app.world.tick, best = null, bestScore = mustHunt ? 0.3 : -1;
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c.meat || (speciesId && c.speciesId !== speciesId)) continue;
        var score = tick - c.lastBiteTick <= 3 ? 3 : (c.lookPrey ? c.lookAmount : 0);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      return best;
    },
    memberOf: function (speciesId) {
      var list = this.app.world.creatures, best = null;
      for (var i = 0; i < list.length; i++) if (list[i].speciesId === speciesId && (!best || list[i].age > best.age)) best = list[i];
      return best;
    }
  };

  return StoryMode;
})();
