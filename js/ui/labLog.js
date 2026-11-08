// Genesis Lab - interface: the lab log. Shows the story engine's lines (js/sim/story.js),
// newest first, in the charts drawer. Lines about a specimen that is still alive can be
// clicked to fly to it. While the drawer is closed, each new line shows briefly near
// the bottom of the screen.
var GL = GL || {};

GL.LabLog = (function () {
  var U = GL.Config.ui;

  function clock(t) { t = Math.max(0, Math.floor(t)); var m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function LabLog(app) {
    this.app = app;
    this.list = document.getElementById('log');
    this.count = document.getElementById('log-count');
    this.toast = document.getElementById('toast');
    this.seen = 0;           // log lines already shown
    this.toastUntil = 0;
    this.drawerOpen = false;
    var self = this;
    this.list.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('li[data-id],li[data-species]') : null;
      if (!li) return;
      var app = self.app, c = li.dataset.id ? app.world.findById(Number(li.dataset.id)) : null;
      if (c) { app.cinematic.stop(); app.hud.dismissDeath(); app.renderer.select(c); app.hud.update(0, true); }
      if (li.dataset.species) {                                    // a line about a species: ring its members
        var sp = app.world.species.get(Number(li.dataset.species));
        if (sp && sp.count > 0) app.highlightSpecies(sp.id, !c);
      }
    });
  }

  LabLog.prototype = {
    reset: function () { this.seen = 0; this.list.innerHTML = ''; },

    update: function () {
      var ev = this.app.world.events, log = ev.log;
      if (ev.logCount !== this.seen) {
        var fresh = [], first = this.seen === 0;
        for (var i = log.length - 1; i >= 0 && log[i].n > this.seen; i--) fresh.push(log[i]);
        fresh.reverse();
        for (i = 0; i < fresh.length; i++) {
          var l = fresh[i], li = document.createElement('li');
          li.className = 'k-' + l.kind + (first ? '' : ' new') + (l.id || l.species ? ' clickable' : '');
          if (l.id) { li.dataset.id = l.id; li.title = 'Fly to specimen #' + l.id + ' (if it is still alive)'; }
          if (l.species) { li.dataset.species = l.species; if (!l.id) li.title = 'Show this species in the terrarium (if it is still alive)'; }
          li.innerHTML = '<span class="lt">' + clock(l.time) + '</span><span>' + esc(l.text) + '</span>';
          this.list.insertBefore(li, this.list.firstChild);
        }
        while (this.list.children.length > GL.Config.story.logMax) this.list.removeChild(this.list.lastChild);
        this.seen = ev.logCount;
        this.count.textContent = ev.logCount + (ev.logCount === 1 ? ' entry' : ' entries');
        var latest = fresh[fresh.length - 1];
        if (latest && !this.drawerOpen && latest.time > 0.5) this.showToast(latest);
      }
      if (this.toastUntil && performance.now() > this.toastUntil) { this.toastUntil = 0; this.toast.classList.add('hidden'); }
    },

    showToast: function (l, kind) {
      this.toast.className = 'panel toast k-' + (l.kind || kind || 'info');
      this.toast.innerHTML = (l.time !== undefined ? '<span class="lt">' + clock(l.time) + '</span>' : '') + esc(l.text);
      this.toastUntil = performance.now() + U.toastSeconds * 1000;
    }
  };

  return LabLog;
})();
