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
  this.log = [];         // notable moments for the lab log: { time, text, kind, id, gen, n }
  this.logMax = (GL.Config.story && GL.Config.story.logMax) || 300;
  this.logCount = 0;     // lines ever written (the lab log uses it to spot new lines)
};

GL.Events.BIRTH = 1;     // a baby was born
GL.Events.DEATH = 2;     // a creature died (starved, old age or disaster)
GL.Events.EAT = 3;       // a creature ate a sprout
GL.Events.ARRIVAL = 4;   // a creature arrived: wandered in (population floor) or placed by the experimenter
GL.Events.KILL = 5;      // a creature was killed and eaten by a meat-eater
GL.Events.EAT_MEAT = 6;  // a creature ate a meat pellet
GL.Events.METEOR = 7;    // a meteor struck (r = blast radius)

GL.Events.prototype = {
  push: function (type, x, y, hue, r, id) {
    var i = this.seq % this.cap;
    this.type[i] = type; this.x[i] = x; this.y[i] = y;
    this.hue[i] = hue; this.r[i] = r; this.id[i] = id;
    this.seq++;
  },
  // kind: 'info', 'boom', 'crash', 'record', 'gen', 'skill', 'warn', 'species', 'meat', 'extinct' or 'god';
  // id: a specimen the line is about (0 = none). Species lines also carry .species (its id).
  note: function (time, text, kind, id, gen, speciesId) {
    this.logCount++;
    this.log.push({ time: time, text: text, kind: kind || 'info', id: id || 0, gen: gen || 0, n: this.logCount, species: speciesId || 0 });
    if (this.log.length > this.logMax) this.log.splice(0, this.log.length - this.logMax);
  }
};
