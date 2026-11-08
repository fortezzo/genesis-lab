// Genesis Lab - interface: the live brain viewer and the view-slice radar.
// The brain viewer draws the selected creature's whole neural network: 25 senses on
// the left (with small icons), 12 hidden neurons in the middle and 6 actions on the
// right. Every connection is drawn faintly (thicker = stronger, cyan excites, magenta
// calms); the strongest live signals light up on top, and pulses of light travel along
// them as the creature thinks. Neurons glow with their live activity. Hover any neuron
// to see its name, its value and what drives it.
// Speed: the faint wiring is painted once per creature into a hidden layer, so each
// frame only draws the live part (about 70 bright links, the pulses and 43 neurons).
var GL = GL || {};

GL.BrainView = (function () {
  var C = GL.Config, U = C.ui, B = GL.Brain, M = GL.M;
  var NI = B.INPUTS, NH = B.HIDDEN, NO = B.OUTPUTS, NL = NI * NH + NH * NO;
  var IN = B.IN, OUT = B.OUT;
  var CYAN = [34, 229, 255], MAGENTA = [255, 61, 110];
  var HUE_EXC = 188, HUE_CALM = 345;

  // Input groups: icon, colour, short row labels (slices run from the bug's left to its right).
  var GROUPS = [
    { name: 'Food', icon: 'food', color: '#66DD4F', rows: ['far left', 'left', 'ahead', 'right', 'far right'] },
    { name: 'Bugs', icon: 'bug', color: '#4A9DFF', rows: ['far left', 'left', 'ahead', 'right', 'far right'] },
    { name: 'Size', icon: 'size', color: '#8FB8FF', rows: ['far left', 'left', 'ahead', 'right', 'far right'] },
    { name: 'Glass', icon: 'wall', color: '#FFB020', rows: ['wall near', 'centre ↔', 'centre ↕'] },
    { name: 'Body', icon: 'body', color: '#CFE8FF', rows: ['energy', 'health', 'age', 'speed'] },
    { name: 'Clock', icon: 'clock', color: '#B79CFF', rows: ['clock'] },
    { name: 'Memory', icon: 'mem', color: '#9FD7E8', rows: ['memory 1', 'memory 2'] }
  ];
  var OUT_LABELS = ['walk', 'turn', 'bite', 'baby', 'memory 1', 'memory 2'];
  var BODY_ICONS = ['energy', 'health', 'age', 'speed'];

  function BrainView(canvas, tip) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.tip = tip;
    this.layer = document.createElement('canvas');      // the faint wiring, painted once per creature
    this.w = 0; this.h = 0; this.dpr = 1;
    this.subject = null; this.subjectKey = '';
    this.dirty = true;
    // Smoothed activity, as drawn.
    this.sIn = new Float32Array(NI); this.sHid = new Float32Array(NH); this.sOut = new Float32Array(NO);
    this.kick = new Float32Array(NI + NH + NO);           // a brief flash when pulses arrive
    // Link geometry and live strength.
    this.lx0 = new Float32Array(NL); this.ly0 = new Float32Array(NL);
    this.lx1 = new Float32Array(NL); this.ly1 = new Float32Array(NL);
    this.sig = new Float32Array(NL);                      // signed live signal along each link
    this.str = new Float32Array(NL);                      // its brightness, 0..1
    this.sorted = new Float32Array(NL);
    this.acc = new Float32Array(NL);                      // pulse "owed" per link
    // Pulse pool.
    var P = U.brainPulseMax;
    this.pc = new Int32Array(P); this.pt = new Float32Array(P); this.ps = new Float32Array(P); this.pn = 0;
    // Node positions.
    this.nx = new Float32Array(NI + NH + NO); this.ny = new Float32Array(NI + NH + NO);
    this.hover = -1; this.hoverSlice = -1;
    this.tipTimer = 0;
    var self = this;
    canvas.addEventListener('pointermove', function (e) { self.onMove(e); });
    canvas.addEventListener('pointerleave', function () { self.setHover(-1); });
    canvas.addEventListener('pointerdown', function (e) { self.onMove(e); });
  }

  BrainView.prototype = {
    // The inspector hands over a snapshot of the creature: { key, brain, inputs, hidden, outputs, alive, ... }.
    setSubject: function (s) {
      this.subject = s;
      if (s && s.key !== this.subjectKey) {
        this.subjectKey = s.key; this.dirty = true; this.pn = 0;
        this.acc.fill(0); this.kick.fill(0);
        this.sIn.fill(0); this.sHid.fill(0); this.sOut.fill(0);
      }
    },

    resize: function () {
      var r = this.canvas.getBoundingClientRect();
      if (r.width < 10) return false;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (Math.round(r.width) === this.w && Math.round(r.height) === this.h && dpr === this.dpr) return true;
      this.w = Math.round(r.width); this.h = Math.round(r.height); this.dpr = dpr;
      this.canvas.width = this.layer.width = Math.round(this.w * dpr);
      this.canvas.height = this.layer.height = Math.round(this.h * dpr);
      this.layout();
      this.dirty = true;
      return true;
    },

    layout: function () {
      var W = this.w, H = this.h, pad = 10, gap = 7, i, j, k, g, row = 0, padB = 22;
      var xi = 104, xh = Math.round(W * 0.58), xo = W - 72;
      this.xi = xi; this.xh = xh; this.xo = xo;
      var sp = (H - pad - padB - (GROUPS.length - 1) * gap) / (NI - 1);
      this.rowSp = sp;
      // Rows step by sp; each new group adds a small gap.
      var y = pad;
      this.groupY = [];
      for (g = 0; g < GROUPS.length; g++) {
        var start = y;
        for (k = 0; k < GROUPS[g].rows.length; k++) { this.ny[row] = y; this.nx[row] = xi; row++; if (k < GROUPS[g].rows.length - 1) y += sp; }
        this.groupY.push([start, y]);
        y += sp + gap;
      }
      var hp = 22, hs = (H - hp - padB - 10) / (NH - 1);
      for (j = 0; j < NH; j++) { this.nx[NI + j] = xh; this.ny[NI + j] = hp + j * hs; }
      var op = 40, os = (H - op - padB - 34) / (NO - 1);
      for (k = 0; k < NO; k++) { this.nx[NI + NH + k] = xo; this.ny[NI + NH + k] = op + k * os; }
      // Links: input i -> hidden j at j*NI + i, then hidden j -> output k at NI*NH + k*NH + j.
      for (j = 0; j < NH; j++) for (i = 0; i < NI; i++) {
        var c = j * NI + i;
        this.lx0[c] = this.nx[i]; this.ly0[c] = this.ny[i]; this.lx1[c] = this.nx[NI + j]; this.ly1[c] = this.ny[NI + j];
      }
      for (k = 0; k < NO; k++) for (j = 0; j < NH; j++) {
        c = NI * NH + k * NH + j;
        this.lx0[c] = this.nx[NI + j]; this.ly0[c] = this.ny[NI + j]; this.lx1[c] = this.nx[NI + NH + k]; this.ly1[c] = this.ny[NI + NH + k];
      }
    },

    weight: function (c) {
      var w = this.subject.brain;
      if (c < NI * NH) return w[c];
      var r = c - NI * NH, k = Math.floor(r / NH), j = r % NH;
      return w[B.OFF_W2 + k * NH + j];
    },

    // A smooth S-curve from one neuron to the next (horizontal at both ends).
    curve: function (p, c) {
      var x0 = this.lx0[c], y0 = this.ly0[c], x1 = this.lx1[c], y1 = this.ly1[c], xm = (x0 + x1) / 2;
      p.moveTo(x0, y0); p.bezierCurveTo(xm, y0, xm, y1, x1, y1);
    },
    pointOn: function (c, t, out) {
      var x0 = this.lx0[c], y0 = this.ly0[c], x1 = this.lx1[c], y1 = this.ly1[c], xm = (x0 + x1) / 2;
      var u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
      out[0] = a * x0 + (b + d) * xm + e * x1;
      out[1] = a * y0 + b * y0 + d * y1 + e * y1;
    },

    // ------------------------------------------------------- the faint wiring layer
    paintLayer: function () {
      var g = this.layer.getContext('2d'), W = this.w, H = this.h, s = this.subject, c, k;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      // Soft bands behind the input groups.
      for (k = 0; k < GROUPS.length; k++) {
        var gy = this.groupY[k];
        g.fillStyle = 'rgba(140, 200, 255, 0.035)';
        roundRect(g, 2, gy[0] - this.rowSp * 0.5, this.xi + 8, gy[1] - gy[0] + this.rowSp, 6); g.fill();
      }
      // Every connection, bucketed by sign and strength so it takes 8 strokes, not 372.
      var paths = [], widths = [0.5, 0.8, 1.2, 1.8];
      for (k = 0; k < 8; k++) paths.push(new Path2D());
      for (c = 0; c < NL; c++) {
        var w = this.weight(c), a = Math.abs(w), tier = a < 0.5 ? 0 : a < 1 ? 1 : a < 2 ? 2 : 3;
        this.curve(paths[(w >= 0 ? 0 : 4) + tier], c);
      }
      for (k = 0; k < 8; k++) {
        var tierK = k & 3, rgb = k < 4 ? CYAN : MAGENTA;
        g.strokeStyle = M.rgba(rgb, U.brainLinkAlpha * (0.45 + tierK * 0.55));
        g.lineWidth = widths[tierK];
        g.stroke(paths[k]);
      }
      // Input labels and icons.
      g.textBaseline = 'middle';
      g.font = '10px "Inter", system-ui, sans-serif';
      var row = 0;
      for (k = 0; k < GROUPS.length; k++) {
        var grp = GROUPS[k];
        for (var r = 0; r < grp.rows.length; r++) {
          var y = this.ny[row], icon = grp.icon === 'body' ? BODY_ICONS[r] : grp.icon;
          drawIcon(g, icon, 9, y, grp.color, r, grp.rows.length);
          g.fillStyle = r === 0 ? '#CFE8FF' : '#8FA6C4';
          g.fillText(r === 0 && grp.rows.length === 5 ? grp.name.toLowerCase() + ', ' + grp.rows[r] : grp.rows[r], 20, y + 0.5);
          row++;
        }
      }
      // Output labels.
      g.font = '600 11px "Space Grotesk", "Inter", sans-serif';
      for (k = 0; k < NO; k++) {
        g.fillStyle = k >= 4 ? '#8FA6C4' : '#CFE8FF';
        g.fillText(OUT_LABELS[k], this.xo + 12, this.ny[NI + NH + k] - 6);
      }
      g.font = '9px "Inter", sans-serif'; g.fillStyle = '#6E87A8'; g.textAlign = 'center';
      g.fillText('SENSES', this.xi - 2, H - 3); g.fillText('THINKING', this.xh, H - 3); g.fillText('ACTIONS', this.xo + 28, H - 3);
      g.textAlign = 'left';
      this.dirty = false;
    },

    // ------------------------------------------------------- every frame
    draw: function (dt, running) {
      var s = this.subject;
      if (!s || !this.resize()) return;
      if (this.dirty) this.paintLayer();
      var ctx = this.ctx, W = this.w, H = this.h, i, j, k, c;
      var live = s.alive;
      // Ease the drawn activity toward the real one, so it glows instead of flickering.
      var e = 1 - Math.exp(-U.brainSmoothing * dt);
      for (i = 0; i < NI; i++) {
        var v = live ? s.inputs[i] : 0;
        if (i < 5) v /= U.brainFoodScale;
        this.sIn[i] += (M.clamp(v, -1, 1) - this.sIn[i]) * e;
      }
      for (j = 0; j < NH; j++) this.sHid[j] += ((live ? s.hidden[j] : 0) - this.sHid[j]) * e;
      for (k = 0; k < NO; k++) this.sOut[k] += ((live ? s.outputs[k] : 0) - this.sOut[k]) * e;
      for (i = 0; i < this.kick.length; i++) this.kick[i] *= Math.exp(-6 * dt);

      // Live signal along each link = weight x what is flowing out of its source.
      var foodScale = U.brainFoodScale;
      for (c = 0; c < NL; c++) {
        var src;
        if (c < NI * NH) { i = c % NI; src = this.sIn[i] * (i < 5 ? Math.min(foodScale, 2) : 1); }
        else src = this.sHid[(c - NI * NH) % NH];
        var sg = this.weight(c) * src;
        this.sig[c] = sg;
        this.str[c] = Math.tanh(Math.abs(sg) * 0.7);
      }
      this.sorted.set(this.str); this.sorted.sort();
      var thr = Math.max(0.04, this.sorted[Math.max(0, NL - U.brainActiveLinks)]);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = live ? (this.hover >= 0 ? 0.35 : 1) : 0.4;
      ctx.drawImage(this.layer, 0, 0, W, H);
      ctx.globalAlpha = 1;

      // Hovering a neuron: its own connections, in full.
      if (this.hover >= 0) this.drawHoverLinks(ctx);

      // The strongest live signals, bright and additive.
      ctx.globalCompositeOperation = 'lighter';
      var paths = this._p || (this._p = []), counts = [0, 0, 0, 0, 0, 0];
      for (k = 0; k < 6; k++) paths[k] = new Path2D();
      for (c = 0; c < NL; c++) {
        var st = this.str[c];
        if (st < thr || (this.hover >= 0 && !this.touchesHover(c))) continue;
        var tier = st < 0.4 ? 0 : st < 0.75 ? 1 : 2;
        this.curve(paths[(this.sig[c] >= 0 ? 0 : 3) + tier], c); counts[(this.sig[c] >= 0 ? 0 : 3) + tier]++;
      }
      var aw = [1, 1.5, 2.2], aa = [0.35, 0.6, 0.9];
      for (k = 0; k < 6; k++) {
        if (!counts[k]) continue;
        ctx.strokeStyle = M.rgba(k < 3 ? CYAN : MAGENTA, U.brainActiveAlpha * aa[k % 3]);
        ctx.lineWidth = aw[k % 3];
        ctx.stroke(paths[k]);
      }

      // Pulses: sent along strong live links, faster for stronger signals.
      if (live && running) {
        for (c = 0; c < NL; c++) {
          st = this.str[c];
          if (st < thr || st < U.brainPulseMinSignal) { this.acc[c] *= 0.9; continue; }
          this.acc[c] += U.brainPulseRate * st * dt;
          if (this.acc[c] >= 1) {
            this.acc[c] -= 1;
            if (this.pn < U.brainPulseMax) { var n = this.pn++; this.pc[n] = c; this.pt[n] = 0; this.ps[n] = this.sig[c]; }
          }
        }
      }
      var pt = this._pt || (this._pt = [0, 0]);
      var gExc = GL.Sprites.glow(HUE_EXC, 1, 0.62), gCalm = GL.Sprites.glow(HUE_CALM, 1, 0.62), core = GL.Sprites.dot();
      for (n = 0; n < this.pn; n++) {
        c = this.pc[n];
        var str = Math.tanh(Math.abs(this.ps[n]) * 0.7);
        this.pt[n] += U.brainPulseSpeed * dt * (0.7 + 0.8 * str);
        if (this.pt[n] >= 1) {                                       // arrived: the target neuron flickers
          var dst = c < NI * NH ? NI + Math.floor(c / NI) : NI + NH + Math.floor((c - NI * NH) / NH);
          this.kick[dst] = Math.min(1, this.kick[dst] + 0.25 * str);
          var last = --this.pn;
          this.pc[n] = this.pc[last]; this.pt[n] = this.pt[last]; this.ps[n] = this.ps[last];
          n--; continue;
        }
        if (this.hover >= 0 && !this.touchesHover(c)) continue;
        this.pointOn(c, this.pt[n], pt);
        var sz = 7 + 9 * str, fade = Math.sin(Math.PI * this.pt[n]);
        ctx.globalAlpha = (0.45 + 0.55 * str) * (0.4 + 0.6 * fade);
        ctx.drawImage(this.ps[n] >= 0 ? gExc : gCalm, pt[0] - sz / 2, pt[1] - sz / 2, sz, sz);
        var cs = 1.6 + 1.6 * str;
        ctx.drawImage(core, pt[0] - cs / 2, pt[1] - cs / 2, cs, cs);
      }
      ctx.globalAlpha = 1;

      // Neurons.
      this.drawNodes(ctx, gExc, gCalm);
      ctx.globalCompositeOperation = 'source-over';
      this.drawOutputReadouts(ctx);
      if (!live) {
        ctx.font = '11px "Inter", sans-serif'; ctx.fillStyle = 'rgba(207, 232, 255, 0.75)'; ctx.textAlign = 'center';
        ctx.fillText('No activity: this brain has stopped', this.xh, 12);
        ctx.textAlign = 'left';
      }
      this.tipTimer -= dt;
      if (this.hover >= 0 && this.tipTimer <= 0) { this.tipTimer = 0.12; this.updateTip(); }
    },

    touchesHover: function (c) {
      var h = this.hover;
      if (h < NI) return c < NI * NH && c % NI === h;
      if (h < NI + NH) { var j = h - NI; return c < NI * NH ? Math.floor(c / NI) === j : (c - NI * NH) % NH === j; }
      return c >= NI * NH && Math.floor((c - NI * NH) / NH) === h - NI - NH;
    },

    drawHoverLinks: function (ctx) {
      var pos = new Path2D(), neg = new Path2D(), c;
      ctx.lineWidth = 1;
      for (c = 0; c < NL; c++) {
        if (!this.touchesHover(c)) continue;
        var w = this.weight(c);
        ctx.strokeStyle = M.rgba(w >= 0 ? CYAN : MAGENTA, 0.12 + 0.18 * Math.min(1, Math.abs(w) / 2));
        ctx.lineWidth = 0.6 + Math.min(2, Math.abs(w)) * 0.6;
        var p = new Path2D(); this.curve(p, c); ctx.stroke(p);
      }
    },

    drawNodes: function (ctx, gExc, gCalm) {
      var R = U.brainNodeRadius, i, n = NI + NH + NO;
      // Glows (additive).
      for (i = 0; i < n; i++) {
        var v = this.valueOf(i), a = Math.min(1, Math.abs(v) + this.kick[i]), r = i < NI ? R * 0.8 : (i < NI + NH ? R * 1.15 : R * 1.3);
        if (a < 0.04) continue;
        var gs = r * 2 + 26 * a;
        ctx.globalAlpha = 0.2 + 0.65 * a;
        ctx.drawImage(v >= 0 ? gExc : gCalm, this.nx[i] - gs / 2, this.ny[i] - gs / 2, gs, gs);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // Cores: a dark bead lit by its activity, with a coloured rim.
      for (i = 0; i < n; i++) {
        v = this.valueOf(i); a = Math.min(1, Math.abs(v)); r = i < NI ? R * 0.8 : (i < NI + NH ? R * 1.15 : R * 1.3);
        var rgb = v >= 0 ? CYAN : MAGENTA, x = this.nx[i], y = this.ny[i];
        ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU);
        ctx.fillStyle = '#081226'; ctx.fill();
        ctx.fillStyle = M.rgba(rgb, 0.12 + 0.8 * a); ctx.fill();
        if (a > 0.55) { ctx.beginPath(); ctx.arc(x, y, r * 0.45 * a, 0, M.TAU); ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * (a - 0.5)) + ')'; ctx.fill(); }
        ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU);
        ctx.lineWidth = i === this.hover ? 2 : 1;
        ctx.strokeStyle = i === this.hover ? '#FFFFFF' : M.rgba(rgb, 0.35 + 0.55 * a);
        ctx.stroke();
      }
    },

    valueOf: function (i) { return i < NI ? this.sIn[i] : (i < NI + NH ? this.sHid[i - NI] : this.sOut[i - NI - NH]); },

    // Small live readouts under each action: a centred bar plus what it means right now.
    drawOutputReadouts: function (ctx) {
      var x = this.xo + 12, bw = 50, dz = C.thrustDeadZone;
      ctx.font = '9.5px "JetBrains Mono", monospace';
      for (var k = 0; k < NO; k++) {
        var v = this.sOut[k], y = this.ny[NI + NH + k] + 7;
        ctx.fillStyle = 'rgba(140, 200, 255, 0.12)'; ctx.fillRect(x, y - 1, bw, 2);
        var fx = x + bw / 2, len = v * bw / 2;
        ctx.fillStyle = v >= 0 ? '#22E5FF' : '#FF3D6E';
        ctx.fillRect(Math.min(fx, fx + len), y - 1.5, Math.abs(len), 3);
        if (k === OUT.THRUST) { ctx.fillStyle = 'rgba(207, 232, 255, 0.5)'; ctx.fillRect(fx + dz * bw / 2, y - 3, 1, 6); }
        ctx.fillStyle = '#8FA6C4';
        ctx.fillText(outputWord(k, v), x, y + 10);
      }
    },

    // ------------------------------------------------------- hover
    onMove: function (e) {
      var r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      var best = -1, bestD = 14 * 14;
      for (var i = 0; i < NI + NH + NO; i++) {
        var dx = this.nx[i] - mx, dy = this.ny[i] - my, d = dx * dx + dy * dy;
        // Input rows are easy to hit anywhere along their label.
        if (i < NI && mx < this.xi + 8 && Math.abs(dy) < this.rowSp / 2) d = Math.min(d, dy * dy);
        if (i >= NI + NH && mx > this.xo - 8 && Math.abs(dy) < 18) d = Math.min(d, dy * dy);
        if (d < bestD) { bestD = d; best = i; }
      }
      this.setHover(best);
    },
    setHover: function (i) {
      if (i === this.hover) return;
      this.hover = i;
      this.hoverSlice = i >= 0 && i < 15 ? i % 5 : -1;
      if (i < 0) { this.tip.classList.add('hidden'); return; }
      this.tipTimer = 0; this.updateTip();
    },
    updateTip: function () {
      var i = this.hover, s = this.subject;
      if (i < 0 || !s) return;
      var html, v = this.valueOf(i), raw;
      if (i < NI) {
        raw = s.alive ? s.inputs[i] : 0;
        html = '<b>' + B.INPUT_NAMES[i] + '</b> <span class="v' + (raw < 0 ? ' neg' : '') + '">' + fmt(raw) + '</span>' +
          '<span class="d">' + inputMeaning(i, raw) + '</span>' + this.topLinks(i, 'out');
      } else if (i < NI + NH) {
        html = '<b>Hidden neuron ' + (i - NI + 1) + '</b> <span class="v' + (v < 0 ? ' neg' : '') + '">' + fmt(s.alive ? s.hidden[i - NI] : 0) + '</span>' +
          '<span class="d">Mixes the senses into one signal (between -1 and 1).</span>' + this.topLinks(i, 'in');
      } else {
        var k = i - NI - NH; raw = s.alive ? s.outputs[k] : 0;
        html = '<b>' + B.OUTPUT_NAMES[k] + '</b> <span class="v' + (raw < 0 ? ' neg' : '') + '">' + fmt(raw) + '</span>' +
          '<span class="d">' + outputMeaning(k, raw) + '</span>' + this.topLinks(i, 'in');
      }
      this.tip.innerHTML = html;
      this.tip.classList.remove('hidden');
      var x = this.nx[i], y = this.ny[i], tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
      var left = i >= NI + NH ? x - tw - 14 : (i < NI ? x + 14 : x + 14);
      if (i >= NI && i < NI + NH && x + 14 + tw > this.w) left = x - tw - 14;
      this.tip.style.left = Math.max(0, Math.min(this.w - tw, left)) + 'px';
      this.tip.style.top = Math.max(0, Math.min(this.h - th, y - th / 2)) + 'px';
    },
    // The live signals that matter most for a neuron, in words.
    topLinks: function (i, dir) {
      var list = [], c;
      for (c = 0; c < NL; c++) if (this.touchesHover(c) && (dir === 'out' || this.hover >= NI + NH || c < NI * NH)) list.push(c);
      var self = this;
      list.sort(function (a, b) { return Math.abs(self.sig[b]) - Math.abs(self.sig[a]); });
      var out = [];
      for (var n = 0; n < Math.min(3, list.length); n++) {
        c = list[n];
        if (Math.abs(this.sig[c]) < 0.03) break;
        var other = dir === 'out' ? this.nodeName(c < NI * NH ? NI + Math.floor(c / NI) : 0)
          : this.nodeName(c < NI * NH ? c % NI : NI + (c - NI * NH) % NH);
        out.push((this.sig[c] >= 0 ? '<span class="v">excites</span> ' : '<span class="v neg">calms</span> ') + other);
      }
      if (!out.length) return '<span class="d">Quiet right now.</span>';
      return '<span class="d">' + (dir === 'out' ? 'Right now it ' : 'Driven most by: ') + '</span>' +
        (dir === 'out' ? out.join(', ') : out.join('<br>').replace(/excites|calms/g, function (m) { return m === 'excites' ? 'excited by' : 'calmed by'; }));
    },
    nodeName: function (i) {
      if (i < NI) return B.INPUT_NAMES[i].toLowerCase();
      if (i < NI + NH) return 'neuron ' + (i - NI + 1);
      return B.OUTPUT_NAMES[i - NI - NH].toLowerCase();
    }
  };

  function fmt(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2); }

  function inputMeaning(i, v) {
    if (i < 5) return v > 0.01 ? 'Food seen in this slice: ' + Math.round(v / C.foodSenseGain * 100) + '% (closer and more nutritious = stronger).' : 'No food seen in this slice.';
    if (i < 10) return v > 0.01 ? 'Another bug in this slice, ' + Math.round(v * 100) + '% close.' : 'No bug in this slice.';
    if (i < 15) return Math.abs(v) < 0.01 ? 'Nothing to compare in this slice.' : (v > 0 ? 'That bug is bigger than me.' : 'That bug is smaller than me.');
    if (i === IN.WALL) return v > 0.01 ? 'The glass wall is ' + Math.round(v * 100) + '% close.' : 'The glass wall is out of sight.';
    if (i === IN.CENTER_SIDE) return 'Which side the centre is on: + right, - left.';
    if (i === IN.CENTER_FWD) return 'Whether the centre is ahead (+) or behind (-).';
    if (i === IN.ENERGY) return 'Energy: ' + Math.round(v * 100) + '% full.';
    if (i === IN.HEALTH) return 'Health: ' + Math.round(v * 100) + '%.';
    if (i === IN.AGE) return 'Age: ' + Math.round(v * 100) + '% of a 4-minute lifespan.';
    if (i === IN.SPEED) return 'Walking at ' + Math.round(v * 100) + '% of its top speed.';
    if (i === IN.CLOCK) return 'An inner rhythm set by its clock-speed gene.';
    return 'A value its own brain wrote on the last tick.';
  }
  function outputWord(k, v) {
    var dz = C.thrustDeadZone;
    if (k === OUT.THRUST) return v > dz ? Math.round((v - dz) / (1 - dz) * 100) + '% speed' : 'resting';
    if (k === OUT.TURN) return Math.abs(v) < 0.08 ? 'straight' : (v > 0 ? 'right ▸' : '◂ left');
    if (k === OUT.BITE) return v > 0 ? 'on' : 'off';
    if (k === OUT.REPRODUCE) return v > 0 ? 'wants one' : 'not now';
    return fmt(v);
  }
  function outputMeaning(k, v) {
    var dz = C.thrustDeadZone;
    if (k === OUT.THRUST) return v > dz ? 'Walking at ' + Math.round((v - dz) / (1 - dz) * 100) + '% of top speed.' : 'Below ' + dz + ': standing still.';
    if (k === OUT.TURN) return Math.abs(v) < 0.08 ? 'Going straight.' : 'Turning ' + (v > 0 ? 'right' : 'left') + ' at ' + Math.round(Math.abs(v) * 100) + '% of its turn speed.';
    if (k === OUT.BITE) return 'Bites anything at its mouth when above 0 (does nothing until predators arrive).';
    if (k === OUT.REPRODUCE) return v > 0 ? 'Wants a baby: it gets one if it is grown, rested and well fed.' : 'Not trying for a baby.';
    return 'Stored for the next tick: its only memory.';
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // Tiny line icons for the senses, 9 px across, drawn once into the wiring layer.
  function drawIcon(g, kind, x, y, color, row, rows) {
    g.save(); g.translate(x, y);
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1.2; g.lineCap = 'round'; g.lineJoin = 'round';
    g.globalAlpha = 0.9;
    if (kind === 'food') {          // a two-leaf sprout
      g.beginPath(); g.moveTo(0, 4); g.lineTo(0, -1); g.stroke();
      g.beginPath(); g.ellipse(-2.4, -1.8, 2.6, 1.3, -0.5, 0, M.TAU); g.fill();
      g.beginPath(); g.ellipse(2.4, -2.6, 2.6, 1.3, 0.5, 0, M.TAU); g.fill();
    } else if (kind === 'bug') {    // a little bug from above
      g.beginPath(); g.ellipse(0, 0.6, 2.6, 3.4, 0, 0, M.TAU); g.stroke();
      g.beginPath(); g.arc(0, -3.6, 1.3, 0, M.TAU); g.fill();
    } else if (kind === 'size') {   // small and big circles
      g.beginPath(); g.arc(-2.4, 1.5, 1.6, 0, M.TAU); g.stroke();
      g.beginPath(); g.arc(1.8, -0.6, 3, 0, M.TAU); g.stroke();
    } else if (kind === 'wall') {   // a curved glass wall
      g.beginPath(); g.arc(-6, 0, 9, -0.6, 0.6); g.stroke();
      g.globalAlpha = 0.4; g.beginPath(); g.arc(-6, 0, 6.5, -0.5, 0.5); g.stroke();
    } else if (kind === 'energy') { // a bolt
      g.beginPath(); g.moveTo(1, -4.5); g.lineTo(-2, 0.5); g.lineTo(0.5, 0.5); g.lineTo(-1, 4.5); g.lineTo(2.5, -1); g.lineTo(0, -1); g.closePath(); g.fill();
    } else if (kind === 'health') { // a cross
      g.lineWidth = 1.8; g.beginPath(); g.moveTo(0, -3.5); g.lineTo(0, 3.5); g.moveTo(-3.5, 0); g.lineTo(3.5, 0); g.stroke();
    } else if (kind === 'age') {    // an hourglass
      g.beginPath(); g.moveTo(-3, -4); g.lineTo(3, -4); g.lineTo(-3, 4); g.lineTo(3, 4); g.closePath(); g.stroke();
    } else if (kind === 'speed') {  // chevrons
      g.beginPath(); g.moveTo(-4, -3); g.lineTo(-1, 0); g.lineTo(-4, 3); g.moveTo(0, -3); g.lineTo(3, 0); g.lineTo(0, 3); g.stroke();
    } else if (kind === 'clock') {  // a wave
      g.beginPath(); for (var t = -4.5; t <= 4.5; t += 0.5) { var yy = -Math.sin(t * 0.9) * 3; if (t === -4.5) g.moveTo(t, yy); else g.lineTo(t, yy); } g.stroke();
    } else if (kind === 'mem') {    // a memory cell
      g.strokeRect(-3, -3, 6, 6); g.globalAlpha = 0.5; g.fillRect(-1.5, -1.5, 3, 3);
    }
    g.restore();
  }

  return BrainView;
})();

// The radar: the selected creature's field of view, seen from above with the bug facing up.
// Each of its 5 view slices lights green by how strongly it sees food; the nearest food,
// bug and glass wall it senses are drawn as blips at the distance it senses them.
GL.RadarView = (function () {
  var C = GL.Config, U = C.ui, IN = GL.Brain.IN, M = GL.M;

  function RadarView(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.w = 0; this.h = 0; this.dpr = 1;
    this.sFood = new Float32Array(5); this.sCre = new Float32Array(5); this.sWall = 0;
    this.t = 0;
  }

  RadarView.prototype = {
    resize: function () {
      var r = this.canvas.getBoundingClientRect();
      if (r.width < 10) return false;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (Math.round(r.width) !== this.w || Math.round(r.height) !== this.h || dpr !== this.dpr) {
        this.w = Math.round(r.width); this.h = Math.round(r.height); this.dpr = dpr;
        this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
      }
      return true;
    },

    draw: function (dt, s, hoverSlice) {
      if (!s || !this.resize()) return;
      var ctx = this.ctx, W = this.w, H = this.h, k, a;
      this.t += dt;
      var e = 1 - Math.exp(-U.brainSmoothing * dt), inp = s.inputs, live = s.alive;
      for (k = 0; k < 5; k++) {
        this.sFood[k] += ((live ? inp[IN.FOOD + k] / C.foodSenseGain : 0) - this.sFood[k]) * e;
        this.sCre[k] += ((live ? inp[IN.CREATURE + k] : 0) - this.sCre[k]) * e;
      }
      this.sWall += ((live ? inp[IN.WALL] : 0) - this.sWall) * e;
      var fov = s.fov, half = fov / 2, sw = fov / 5, up = -Math.PI / 2;
      // A view up to 180 degrees fits above the bug, so the bug sits low and the fan uses the whole height.
      var low = fov <= Math.PI + 0.01;
      var cx = W / 2, cy = low ? H - 20 : H / 2 + 2, R = low ? Math.min(H - 34, W / 2 - 40) : Math.min(H / 2 - 12, W / 2 - 40);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Range rings and cross hairs.
      ctx.strokeStyle = 'rgba(140, 200, 255, 0.10)'; ctx.lineWidth = 1;
      for (k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, R * k / 3, 0, M.TAU); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx - R - 8, cy); ctx.lineTo(cx + R + 8, cy); ctx.moveTo(cx, cy - R - 6); ctx.lineTo(cx, cy + R + 6); ctx.stroke();

      // The five slices.
      for (k = 0; k < 5; k++) {
        var a0 = up - half + k * sw, f = this.sFood[k];
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + sw); ctx.closePath();
        ctx.fillStyle = 'rgba(102, 221, 79,' + (0.035 + 0.32 * f) + ')'; ctx.fill();
        ctx.strokeStyle = k === hoverSlice ? 'rgba(255, 255, 255, 0.85)' : 'rgba(140, 200, 255, 0.22)';
        ctx.lineWidth = k === hoverSlice ? 1.5 : 1; ctx.stroke();
      }
      // A slow sweep across the view, for a lab-instrument feel.
      if (live) {
        var sweep = up - half + ((this.t * 0.6) % 1) * fov;
        var grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
        grad.addColorStop(0, 'rgba(34, 229, 255, 0)'); grad.addColorStop(1, 'rgba(34, 229, 255, 0.35)');
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); ctx.stroke();
      }

      ctx.globalCompositeOperation = 'lighter';
      var glowG = GL.Sprites.glow(105, 0.7, 0.6), glowB = GL.Sprites.glow(214, 1, 0.62), glowA = GL.Sprites.glow(38, 1, 0.55);
      for (k = 0; k < 5; k++) {
        var mid = up - half + (k + 0.5) * sw;
        if (this.sFood[k] > 0.02) {                 // food blip at the distance it is sensed
          var d = (1 - this.sFood[k]) * R, gs = 10 + 12 * this.sFood[k];
          ctx.globalAlpha = 0.5 + 0.5 * this.sFood[k];
          ctx.drawImage(glowG, cx + Math.cos(mid) * d - gs / 2, cy + Math.sin(mid) * d - gs / 2, gs, gs);
        }
        if (this.sCre[k] > 0.02) {                  // the nearest bug in the slice
          d = (1 - this.sCre[k]) * R;
          var big = live ? inp[IN.SIZE + k] : 0;
          gs = 12 + 8 * (big + 1) / 2;
          ctx.globalAlpha = 0.45 + 0.4 * this.sCre[k];
          ctx.drawImage(glowB, cx + Math.cos(mid + sw * 0.18) * d - gs / 2, cy + Math.sin(mid + sw * 0.18) * d - gs / 2, gs, gs);
        }
      }
      if (this.sWall > 0.02) {                       // the glass wall, opposite the direction of the centre
        var wallAng = live ? Math.atan2(inp[IN.CENTER_SIDE], inp[IN.CENTER_FWD]) + Math.PI : 0;
        var wd = Math.max(6, (1 - this.sWall) * R);
        ctx.globalAlpha = 0.3 + 0.6 * this.sWall;
        ctx.strokeStyle = '#FFB020'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, wd, up + wallAng - 0.55, up + wallAng + 0.55); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // The bug itself, facing up.
      var bs = 28;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(up);
      ctx.globalAlpha = live ? 1 : 0.4;
      ctx.drawImage(GL.Sprites.bug(s.hue), -bs / 2, -bs / 2, bs, bs);
      ctx.restore(); ctx.globalAlpha = 1;
      // Edge labels.
      ctx.font = '9.5px "Inter", sans-serif'; ctx.fillStyle = '#8FA6C4'; ctx.textAlign = 'center';
      var la = up - half, ra = up + half;
      ctx.fillText('left', cx + Math.cos(la) * (R + 16), cy + Math.sin(la) * (R + 16) + 3);
      ctx.fillText('right', cx + Math.cos(ra) * (R + 18), cy + Math.sin(ra) * (R + 18) + 3);
      ctx.textAlign = 'left';
    }
  };

  return RadarView;
})();
