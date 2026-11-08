// Genesis Lab - core: the fixed-step main loop.
// The simulation always advances in fixed steps of 1/60 simulated second
// ("ticks"), separate from drawing, so it behaves the same on fast and slow
// devices. Each screen frame runs as many ticks as the speed asks for (within
// a time budget, so drawing stays smooth), then draws once.
var GL = GL || {};

GL.Loop = function (tickFn, renderFn) {
  var C = GL.Config;
  this.tickFn = tickFn;         // runs one simulation tick
  this.renderFn = renderFn;     // draws one frame: renderFn(realDtSeconds)
  this.speed = C.defaultSpeed;  // 1, 2, 4, 16 or 'max'
  this.paused = false;
  this.acc = 0;                 // ticks owed but not yet run
  this.last = 0;
  this.running = false;
  // Performance numbers for the debug overlay.
  this.fps = 60;
  this.tickMs = 0;              // average milliseconds per tick
  this.drawMs = 0;              // average milliseconds per drawn frame
  this.ticksLastFrame = 0;
  this.effectiveSpeed = 0;      // simulated seconds per real second, measured
  this._frame = this._frame.bind(this);
};

GL.Loop.prototype = {
  start: function () {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  },

  setSpeed: function (s) { this.speed = s; this.paused = false; this.acc = 0; },
  togglePause: function () { this.paused = !this.paused; this.acc = 0; },

  _frame: function (now) {
    var C = GL.Config;
    var dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > C.maxFrameGapSec) dt = C.maxFrameGapSec;
    if (dt < 0) dt = 0;

    var budget = C.frameSimBudgetMs, ticks = 0;
    var t0 = performance.now();
    if (!this.paused) {
      if (this.speed === 'max') {
        do { this.tickFn(); ticks++; } while (performance.now() - t0 < budget);
      } else {
        this.acc += dt * this.speed * C.ticksPerSecond;
        var owed = Math.floor(this.acc);
        this.acc -= owed;
        while (owed > 0) {
          this.tickFn(); ticks++; owed--;
          if (performance.now() - t0 > budget) { this.acc = 0; break; } // too slow: drop the rest
        }
      }
    }
    var t1 = performance.now();
    if (ticks > 0) this.tickMs = this.tickMs * 0.9 + ((t1 - t0) / ticks) * 0.1;
    this.ticksLastFrame = ticks;

    this.renderFn(dt);
    var t2 = performance.now();
    this.drawMs = this.drawMs * 0.9 + (t2 - t1) * 0.1;

    if (dt > 0) {
      this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
      var speedNow = ticks / C.ticksPerSecond / dt;
      this.effectiveSpeed = this.effectiveSpeed * 0.95 + speedNow * 0.05;
    }
    requestAnimationFrame(this._frame);
  }
};
