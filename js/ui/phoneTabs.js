// Genesis Lab - interface: the phone layout's bottom tabs.
// On narrow screens the terrarium fills the screen under a slim top bar, and a tab bar at the
// bottom opens one sheet at a time: Inspector (the bug you tapped, or the champion if you
// haven't tapped one yet), Charts, Log (the lab log on its own) and World (god mode, the Hall
// of Fame and the settings). Tapping the open tab again closes its sheet.
var GL = GL || {};

GL.PhoneTabs = function (app) {
  this.app = app;
  this.bar = document.getElementById('tabbar');
  this.btns = this.bar.querySelectorAll('[data-tab]');
  this.timer = 0;
  var self = this;
  this.bar.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-tab]') : null;
    if (b) self.toggle(b.dataset.tab);
  });
};

GL.PhoneTabs.prototype = {
  // Which sheet is open right now (worked out from the panels themselves, so keys and buttons agree).
  current: function () {
    var app = this.app;
    if (app.godMode.open) return 'world';
    if (app.hud.drawerOpen) return document.body.classList.contains('sheet-log') ? 'log' : 'charts';
    if (app.inspector.open) return 'inspector';
    return '';
  },
  toggle: function (tab) {
    var app = this.app;
    if (this.current() === tab) { this.closeAll(); return; }
    this.closeAll(tab === 'inspector');
    if (tab === 'inspector') {
      if (!app.renderer.getSelected()) app.hud.followChampion();
    } else if (tab === 'charts' || tab === 'log') {
      document.body.classList.toggle('sheet-log', tab === 'log');
      app.hud.toggleDrawer(true);
      if (tab === 'charts') app.hud.showDrawerTab('charts');
      app.labLog.drawerOpen = true;
    } else if (tab === 'world') {
      app.godMode.toggle(true);
    }
    this.refresh();
  },
  closeAll: function (keepSelection) {
    var app = this.app;
    if (app.godMode.open) app.godMode.toggle(false);
    if (app.hud.drawerOpen) app.hud.toggleDrawer(false);
    document.body.classList.remove('sheet-log');
    if (!keepSelection && app.renderer.getSelected()) { app.hud.dismissDeath(); app.renderer.select(null); app.hud.update(0, true); }
    this.refresh();
  },
  refresh: function () {
    var cur = this.current();
    for (var i = 0; i < this.btns.length; i++) {
      var on = this.btns[i].dataset.tab === cur;
      this.btns[i].classList.toggle('active', on);
      this.btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  },
  update: function (dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    this.refresh();
  }
};
