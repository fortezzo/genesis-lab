// Genesis Lab - interface: the cinematic camera (key V, or the Cinematic button).
// It cruises by itself between the most interesting things happening: a hunt in progress,
// a baby just born, the busiest crowd, a brand-new species, the champion, or a wide look over
// a feeding ground. Each shot lasts a few seconds, the camera glides slowly from one to the
// next, and a short caption says what you are looking at. Any drag, scroll or click hands
// the camera back to you. Press H as well for a clean, panel-free view.
var GL = GL || {};

GL.Cinematic = (function () {
  var U = GL.Config.ui;

  function Cinematic(app) {
    this.app = app;
    this.on = false;
    this.shot = null;          // { kind, subject, subjectId, x, y, zoom, kills }
    this.timer = 0;
    this.lastKinds = [];
    this.btn = document.getElementById('btn-cinema');
    this.caption = document.getElementById('caption');
    this.captionUntil = 0;
    var self = this;
    this.btn.addEventListener('click', function () { self.toggle(); });
  }

  Cinematic.prototype = {
    toggle: function () { if (this.on) this.stop(); else this.start(); },
    start: function () {
      var app = this.app;
      this.on = true;
      app.hud.dismissDeath();
      app.renderer.select(null);
      if (app.godMode) app.godMode.disarm();
      app.renderer.camera.ease = U.cinemaEase;
      this.btn.classList.add('active'); this.btn.setAttribute('aria-pressed', 'true');
      document.body.classList.add('cinematic');
      app.hud.hideHint();
      this.timer = 0; this.shot = null;
      this.next();
    },
    stop: function () {
      if (!this.on) return;
      this.on = false;
      var cam = this.app.renderer.camera;
      cam.ease = 0;
      if (!this.app.renderer.getSelected()) cam.stopFollowing();
      this.btn.classList.remove('active'); this.btn.setAttribute('aria-pressed', 'false');
      document.body.classList.remove('cinematic');
      this.say('');
    },

    say: function (text) {
      var el = this.caption;
      if (!text) { el.classList.add('hidden'); return; }
      el.innerHTML = text;
      el.classList.remove('hidden');
      this.captionUntil = performance.now() + U.cinemaCaptionSec * 1000;
    },

    update: function (dt) {
      if (this.captionUntil && performance.now() > this.captionUntil) { this.captionUntil = 0; this.caption.classList.add('hidden'); }
      if (!this.on) return;
      var s = this.shot;
      this.timer -= dt;
      if (s && s.subject) {
        if (!s.subject.alive || s.subject.id !== s.subjectId) {      // the star of the shot is gone: cut soon
          if (this.timer > 1.2) this.timer = 1.2;
        } else if (s.kind === 'hunt' && s.subject.kills > s.kills) {
          s.kills = s.subject.kills;
          this.say('<b>Caught.</b> ' + this.name(s.subject) + ' made a kill.');
          if (this.timer < 2.5) this.timer = 2.5;
        }
      }
      if (this.timer <= 0) this.next();
    },

    name: function (c) {
      var sp = this.app.world.species.get(c.speciesId);
      return (sp ? '<i>' + sp.name + '</i> ' : 'Specimen ') + '#' + c.id;
    },

    // ------------------------------------------------------------ choosing shots
    next: function () {
      var w = this.app.world, cands = [], self = this;
      var hunt = this.findHunt(), birth = this.findBirth(), fresh = this.findNewSpecies(), champ = w.findById(w.stats.championId);
      if (hunt) cands.push({ kind: 'hunt', weight: hunt.holding ? 5 : 3, c: hunt.c });
      if (birth) cands.push({ kind: 'birth', weight: 2, c: birth });
      if (fresh) cands.push({ kind: 'species', weight: 2.5, c: fresh.c, sp: fresh.sp });
      if (champ) cands.push({ kind: 'champion', weight: 0.8, c: champ });
      cands.push({ kind: 'crowd', weight: 1.4 });
      cands.push({ kind: 'wide', weight: 0.9 });
      // Don't show the same kind of shot twice in a row (or the same kind three times out of four).
      cands.forEach(function (k) {
        if (self.lastKinds[0] === k.kind) k.weight *= 0.08;
        else if (self.lastKinds.indexOf(k.kind) >= 0) k.weight *= 0.5;
      });
      var total = 0; cands.forEach(function (k) { total += k.weight; });
      var r = Math.random() * total, pick = cands[cands.length - 1];
      for (var i = 0; i < cands.length; i++) { r -= cands[i].weight; if (r <= 0) { pick = cands[i]; break; } }
      this.lastKinds.unshift(pick.kind); if (this.lastKinds.length > 3) this.lastKinds.pop();
      this.frame(pick);
    },

    frame: function (pick) {
      var cam = this.app.renderer.camera, fit = cam.fitZoom(), w = this.app.world, U2 = U;
      var dur = U2.cinemaShotSec * (0.85 + Math.random() * 0.35), c = pick.c, zoom;
      this.shot = { kind: pick.kind, subject: c || null, subjectId: c ? c.id : 0, kills: c ? c.kills : 0 };
      if (c) {
        zoom = pick.kind === 'hunt' ? 2.6 : pick.kind === 'birth' ? 2.3 : pick.kind === 'species' ? 1.9 : 1.7;
        cam.follow = c; cam.followId = c.id;
        cam.tzoom = cam.clampZoom(Math.min(zoom, fit * 12));
      } else if (pick.kind === 'crowd') {
        var p = this.findCrowd();
        cam.stopFollowing(); cam.tx = p.x; cam.ty = p.y; cam.tzoom = cam.clampZoom(Math.min(1.1, fit * 5));
      } else {
        var lamp = w.lamps[Math.floor(Math.random() * w.lamps.length)], whole = Math.random() < 0.4;
        cam.stopFollowing();
        cam.tx = whole ? 0 : lamp.x * 0.85; cam.ty = whole ? 0 : lamp.y * 0.85;
        cam.tzoom = cam.clampZoom(whole ? fit : Math.min(0.5, fit * 2.5));
      }
      var sp = c ? w.species.get(c.speciesId) : null;
      var text = {
        hunt: '<b>A hunt.</b> ' + (c ? this.name(c) : '') + ' closes in on its prey.',
        birth: '<b>A birth.</b> ' + (c ? this.name(c) : '') + ' has just been born.',
        species: '<b>A new species.</b> ' + (pick.sp ? '<i>' + pick.sp.name + '</i>, ' + (pick.sp.meat ? 'a meat-eater' : 'a plant-eater') : '') + '.',
        champion: '<b>The champion.</b> ' + (c ? this.name(c) + ': ' + c.babies + (c.babies === 1 ? ' baby' : ' babies') : ''),
        crowd: '<b>A crowd.</b> The busiest corner of the terrarium right now.',
        wide: '<b>The terrarium.</b> ' + (w.creatures.length + ' bugs, ' + w.species.living + (w.species.living === 1 ? ' species' : ' species') +
              (w.stats.predators ? ', ' + w.stats.predators + ' of them meat-eaters' : '') + '.')
      }[pick.kind];
      this.say(text);
      this.timer = dur;
    },

    // A meat-eater holding prey, or one closing in on prey it can see.
    findHunt: function () {
      var list = this.app.world.creatures, tick = this.app.world.tick, best = null, bestScore = 0, holding = false;
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c.meat) continue;
        var hold = tick - c.lastBiteTick <= 3, score = hold ? 3 : (c.lookPrey ? c.lookAmount : 0);
        if (score > bestScore) { bestScore = score; best = c; holding = hold; }
      }
      return best && bestScore > 0.5 ? { c: best, holding: holding } : null;
    },
    // The newest baby still alive, from the last few seconds of births.
    findBirth: function () {
      var ev = this.app.world.events, E = GL.Events, w = this.app.world;
      for (var s = ev.seq - 1, n = 0; s >= 0 && n < 400; s--, n++) {
        var i = s % ev.cap;
        if (ev.type[i] !== E.BIRTH) continue;
        var c = w.findById(ev.id[i]);
        if (c && c.age < 4) return c;
      }
      return null;
    },
    // A member of a species announced in the last two minutes.
    findNewSpecies: function () {
      var w = this.app.world, list = w.species.list;
      for (var i = list.length - 1; i >= 0 && i > list.length - 30; i--) {
        var sp = list[i];
        if (!sp.announced || sp.count <= 0 || w.time - sp.bornAt > 120 || sp.origin === 'primordial') continue;
        for (var k = 0; k < w.creatures.length; k++) if (w.creatures[k].speciesId === sp.id) return { c: w.creatures[k], sp: sp };
      }
      return null;
    },
    // The middle of the busiest patch of the terrarium.
    findCrowd: function () {
      var list = this.app.world.creatures, R = GL.Config.terrariumRadius, N = 8, cell = 2 * R / N;
      var count = new Int32Array(N * N), sx = new Float32Array(N * N), sy = new Float32Array(N * N), best = 0;
      for (var i = 0; i < list.length; i++) {
        var c = list[i], gx = Math.min(N - 1, Math.max(0, Math.floor((c.x + R) / cell))), gy = Math.min(N - 1, Math.max(0, Math.floor((c.y + R) / cell)));
        var k = gy * N + gx; count[k]++; sx[k] += c.x; sy[k] += c.y;
        if (count[k] > count[best]) best = k;
      }
      return count[best] ? { x: sx[best] / count[best], y: sy[best] / count[best] } : { x: 0, y: 0 };
    }
  };

  return Cinematic;
})();
