// Genesis Lab - interface: the intro screen and the first tips.
// A black screen: GENESIS LAB fades in, then the tagline, then two buttons: Begin experiment,
// and Advanced (a seed and the world settings). A switch below says whether the guided story
// plays: on for first-time visitors, off once they have seen it (Settings can replay it).
// The simulation waits behind the intro and starts at Begin, so minute 0 is the moment you start.
// After Begin (or after the story), three quick tips: drag to move, scroll or pinch to zoom,
// click or tap a bug to see its brain.
var GL = GL || {};

GL.Intro = function (app) {
  this.app = app;
  var $ = function (id) { return document.getElementById(id); };
  this.el = { root: $('intro'), begin: $('intro-begin'), adv: $('intro-adv'), advBox: $('intro-advanced'), story: $('intro-story') };
  this.open = true;
  var storyPref = GL.Prefs.get('storyOn');
  this.el.story.checked = storyPref === null ? !GL.Prefs.get('storySeen') : !!storyPref;
  this.values = app.nextWorldValues();
  var self = this;
  this.form = new GL.WorldForm($('intro-form'), this.values, app.defaultCap, function (v) { app.rememberWorldValues(v); });
  this.el.adv.addEventListener('click', function () {
    var on = self.el.advBox.classList.toggle('hidden') === false;
    self.el.adv.setAttribute('aria-expanded', on ? 'true' : 'false');
    self.el.root.classList.toggle('adv-open', on);
  });
  this.el.story.addEventListener('change', function () { GL.Prefs.set('storyOn', self.el.story.checked); });
  this.el.begin.addEventListener('click', function () { self.begin(); });
  // Enter starts too (but not while typing a seed).
  this.onKey = function (e) {
    if (!self.open) return;
    if (e.key === 'Enter' && !(e.target && e.target.tagName === 'INPUT' && e.target.type === 'text')) { e.preventDefault(); self.begin(); }
    e.stopPropagation();                               // no shortcuts while the intro is up
  };
  window.addEventListener('keydown', this.onKey, true);
  requestAnimationFrame(function () { self.el.root.classList.add('show'); });
  setTimeout(function () { if (self.open) self.el.begin.focus({ preventScroll: true }); }, 2600);
};

GL.Intro.prototype = {
  begin: function () {
    if (!this.open) return;
    this.open = false;
    window.removeEventListener('keydown', this.onKey, true);
    var root = this.el.root;
    root.classList.add('leaving');
    setTimeout(function () { root.classList.add('gone'); }, 1300);
    this.app.begin({ story: this.el.story.checked, values: this.values });
  },
  // Skip the intro (address bar ?intro=0, for testing): start at once.
  skip: function () {
    this.open = false;
    window.removeEventListener('keydown', this.onKey, true);
    this.el.root.classList.add('gone');
  }
};

// Three quick tips, worded for touch or mouse. They fade on their own or at the first touch.
GL.Tips = function (app) {
  this.app = app;
  this.el = document.getElementById('hint');
  var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var tips = touch ? ['Drag to move', 'Pinch to zoom', 'Tap a bug to see its brain']
                   : ['Drag to move', 'Scroll to zoom', 'Click a bug to see its brain'];
  this.el.innerHTML = tips.map(function (t, i) { return '<span class="tip-pill" style="--i:' + i + '">' + t + '</span>'; }).join('');
  this.el.classList.add('gone');
  this.shown = false;
};
GL.Tips.prototype = {
  show: function () {
    if (this.shown) return;
    this.shown = true;
    var el = this.el, app = this.app;
    el.classList.remove('gone');
    el.classList.add('on');
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { app.hud.hideHint(); }, GL.Config.ui.hintSeconds * 1000);
  }
};
