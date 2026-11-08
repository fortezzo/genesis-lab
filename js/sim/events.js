// Genesis Lab - simulation: events. Pure logic, never draws.
// The simulation drops short records here (a birth at x,y; a death; a meal),
// and the drawing code reads them to play effects. It is a fixed-size ring:
// old records are simply overwritten, so nothing new is created during a tick.
// Notable moments also go into a text log, which the lab log (Session 2) shows.
var GL = GL || {};

GL.Events = function (capacity) {
  this.cap = capacity || 4096;
  this.type = new Uint8Array(this.cap);
  this.x = new Float32Array(this.cap);
  this.y = new Float32Array(this.cap);
  this.hue = new Float32Array(this.cap);
  this.r = new Float32Array(this.cap);
  this.id = new Int32Array(this.cap);
  this.seq = 0;          // how many records have ever been written
  this.log = [];         // notable moments: { time, text }
  this.logMax = 300;
};

GL.Events.BIRTH = 1;     // a baby was born
GL.Events.DEATH = 2;     // a creature died
GL.Events.EAT = 3;       // a creature ate a piece of food
GL.Events.ARRIVAL = 4;   // a primitive creature wandered in (population floor)

GL.Events.prototype = {
  push: function (type, x, y, hue, r, id) {
    var i = this.seq % this.cap;
    this.type[i] = type; this.x[i] = x; this.y[i] = y;
    this.hue[i] = hue; this.r[i] = r; this.id[i] = id;
    this.seq++;
  },
  note: function (time, text) {
    this.log.push({ time: time, text: text });
    if (this.log.length > this.logMax) this.log.splice(0, this.log.length - this.logMax);
  }
};
