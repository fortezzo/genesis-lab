// Genesis Lab - interface: the charts in the bottom drawer, drawn by our own small
// chart code (no libraries) to match the look.
//  - Foraging skill: meals per hungry minute for the evolved bugs and for random-brain
//    ghosts in the same spots at the same moment. The gap between the lines is the learning;
//    the headline is the ratio between them.
//  - Population, average traits (as a share of each gene's range), steering against
//    luck, and births and deaths per minute (deaths split by cause).
// Every chart uses one axis, a legend, and a hover crosshair with the exact values.
// Charts redraw only while the drawer is open, a couple of times a second.
var GL = GL || {};

GL.Charts = (function () {
  var C = GL.Config, U = C.ui;

  var TRAITS = [
    { key: 'speed', name: 'Top speed', fmt: function (v) { return (v * C.mmPerUnit).toFixed(1) + ' mm/s'; } },
    { key: 'size', name: 'Size', fmt: function (v) { return (v * 2 * C.mmPerUnit).toFixed(1) + ' mm'; } },
    { key: 'sight', name: 'Sight', fmt: function (v) { return (v * C.mmPerUnit).toFixed(1) + ' mm'; } },
    { key: 'diet', name: 'Diet', fmt: function (v) { return v < 0.05 ? 'plants' : v.toFixed(2); } }
  ];
  function geneRange(key) {
    var g = GL.Genome.GENES[GL.Genome.G[key.toUpperCase()]];
    return [g.min, g.max];
  }
  function clock(t) { t = Math.max(0, Math.floor(t)); var m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  // ------------------------------------------------------------------ one chart
  function Chart(parent, def) {
    this.def = def;
    var el = document.createElement('div');
    el.className = 'chart' + (def.wide ? ' wide' : '');
    el.innerHTML = '<div class="chart-head"><span class="label">' + def.title + '</span><span class="chart-val"></span></div>' +
      '<div class="chart-legend"></div><canvas></canvas><div class="tip hidden"></div>';
    el.title = def.help || '';
    parent.appendChild(el);
    this.el = el;
    this.val = el.querySelector('.chart-val');
    this.legend = el.querySelector('.chart-legend');
    this.canvas = el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tip = el.querySelector('.tip');
    this.data = null; this.hoverX = -1;
    var self = this;
    this.canvas.addEventListener('pointermove', function (e) {
      var r = self.canvas.getBoundingClientRect();
      self.hoverX = e.clientX - r.left; self.render();
    });
    this.canvas.addEventListener('pointerleave', function () { self.hoverX = -1; self.tip.classList.add('hidden'); self.render(); });
  }

  Chart.prototype = {
    setData: function (d) { this.data = d; this.render(); },

    render: function () {
      var d = this.data, cv = this.canvas, r = cv.getBoundingClientRect();
      if (!d || r.width < 20 || r.height < 20) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(r.width), H = Math.round(r.height);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      var ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var L = 30, R = 6, T = 5, B = 14, pw = W - L - R, ph = H - T - B;
      var xs = d.xs, n = xs.length;
      ctx.font = '9.5px "JetBrains Mono", monospace';
      if (n < 2) {
        ctx.fillStyle = U.chartAxis; ctx.textAlign = 'center';
        ctx.fillText('collecting data…', W / 2, H / 2); ctx.textAlign = 'left';
        return;
      }
      var x0 = xs[0], x1 = Math.max(xs[n - 1], x0 + 1), y0 = d.yMin || 0, y1 = d.yMax;
      var X = function (t) { return L + (t - x0) / (x1 - x0) * pw; };
      var Y = function (v) { return T + ph - (v - y0) / (y1 - y0) * ph; };

      // Grid and axes: faint, so the data leads. (A streamgraph has no value axis: it flows around its middle.)
      ctx.strokeStyle = U.chartGrid; ctx.lineWidth = 1; ctx.fillStyle = U.chartAxis;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      var ticks = d.stream ? [] : (d.yTicks || [y0, (y0 + y1) / 2, y1]);
      for (var i = 0; i < ticks.length; i++) {
        var yy = Math.round(Y(ticks[i])) + 0.5;
        ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + pw, yy); ctx.stroke();
        ctx.fillText(d.yFmt(ticks[i]), L - 4, yy);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      var span = (x1 - x0) / 60, steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120], step = 120;
      for (i = 0; i < steps.length; i++) if (span / steps[i] <= 5) { step = steps[i]; break; }
      for (var m = Math.ceil(x0 / 60 / step) * step; m * 60 <= x1; m += step) {
        var xx = X(m * 60);
        if (xx < L + 8) continue;
        ctx.fillText(m + 'm', xx, H - 2);
      }
      ctx.textAlign = 'left';

      // Stacked areas first (bottom to top), with a thin gap line between layers. A streamgraph stacks
      // around the middle instead of up from zero, so it flows (each layer keeps its own thickness).
      var base = d.stack ? new Float32Array(n) : null;
      if (d.stack) {
        if (d.stream) for (i = 0; i < n; i++) { var tot = 0; for (var q = 0; q < d.stack.length; q++) tot += d.stack[q].vals[i]; base[i] = -tot / 2; }
        for (var s = 0; s < d.stack.length; s++) {
          var st = d.stack[s];
          ctx.beginPath();
          for (i = 0; i < n; i++) { var top = base[i] + st.vals[i]; if (i === 0) ctx.moveTo(X(xs[i]), Y(top)); else ctx.lineTo(X(xs[i]), Y(top)); }
          for (i = n - 1; i >= 0; i--) ctx.lineTo(X(xs[i]), Y(base[i]));
          ctx.closePath();
          ctx.globalAlpha = st.alpha || 0.75; ctx.fillStyle = st.color; ctx.fill(); ctx.globalAlpha = 1;
          for (i = 0; i < n; i++) base[i] += st.vals[i];
          ctx.beginPath();
          for (i = 0; i < n; i++) { if (i === 0) ctx.moveTo(X(xs[i]), Y(base[i])); else ctx.lineTo(X(xs[i]), Y(base[i])); }
          ctx.strokeStyle = 'rgba(8, 17, 38, 0.9)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      // Reference lines (for example the creature cap).
      (d.refs || []).forEach(function (rf) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(143, 166, 196, 0.45)'; ctx.lineWidth = 1;
        var ry = Math.round(Y(rf.v)) + 0.5;
        ctx.beginPath(); ctx.moveTo(L, ry); ctx.lineTo(L + pw, ry); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = U.chartAxis; ctx.textAlign = 'right'; ctx.fillText(rf.label, L + pw - 2, ry - 3); ctx.textAlign = 'left';
      });
      // Lines: 2 px, round joins; reference series dashed.
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      (d.lines || []).forEach(function (ln) {
        ctx.beginPath();
        for (var k = 0; k < n; k++) { var py = Y(ln.vals[k]); if (k === 0) ctx.moveTo(X(xs[k]), py); else ctx.lineTo(X(xs[k]), py); }
        if (ln.fill) {
          ctx.save(); ctx.lineTo(X(xs[n - 1]), Y(y0)); ctx.lineTo(X(xs[0]), Y(y0)); ctx.closePath();
          var gr = ctx.createLinearGradient(0, T, 0, T + ph); gr.addColorStop(0, ln.fill); gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr; ctx.fill(); ctx.restore();
          ctx.beginPath();
          for (k = 0; k < n; k++) { py = Y(ln.vals[k]); if (k === 0) ctx.moveTo(X(xs[k]), py); else ctx.lineTo(X(xs[k]), py); }
        }
        ctx.setLineDash(ln.dash ? [4, 3] : []);
        ctx.strokeStyle = ln.color; ctx.lineWidth = ln.width || 2; ctx.stroke();
      });
      ctx.setLineDash([]);

      // Hover: crosshair, dots on each series and a tooltip with the values.
      if (this.hoverX >= L && this.hoverX <= L + pw) {
        var t = x0 + (this.hoverX - L) / pw * (x1 - x0), best = 0;
        for (i = 1; i < n; i++) if (Math.abs(xs[i] - t) < Math.abs(xs[best] - t)) best = i;
        var hx = X(xs[best]);
        ctx.strokeStyle = 'rgba(207, 232, 255, 0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(hx) + 0.5, T); ctx.lineTo(Math.round(hx) + 0.5, T + ph); ctx.stroke();
        var rows = [];
        (d.lines || []).forEach(function (ln) {
          var py = Y(ln.vals[best]);
          ctx.beginPath(); ctx.arc(hx, py, 3.5, 0, Math.PI * 2); ctx.fillStyle = ln.color; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = '#081226'; ctx.stroke();
          rows.push('<i style="background:' + ln.color + '"></i>' + ln.name + ' <b>' + (ln.tipFmt || d.yFmt)(ln.raw ? ln.raw[best] : ln.vals[best]) + '</b>');
        });
        var layers = (d.stack || []).slice().reverse();
        if (d.stackTipMax) {                                         // many layers: only the biggest ones at that moment
          layers = layers.filter(function (st) { return st.vals[best] > 0; }).sort(function (a, b) { return b.vals[best] - a.vals[best]; });
          var rest = layers.slice(d.stackTipMax).reduce(function (sum, st) { return sum + st.vals[best]; }, 0);
          layers = layers.slice(0, d.stackTipMax);
          if (rest > 0) layers.push({ name: 'others', color: 'rgba(140,160,190,0.6)', vals: (function () { var a = []; a[best] = rest; return a; })() });
        }
        layers.forEach(function (st) {
          rows.push('<i style="background:' + st.color + '"></i>' + st.name + ' <b>' + d.yFmt(st.vals[best]) + '</b>');
        });
        if (d.tipTotal) rows.unshift('total <b>' + d.yFmt(d.tipTotal[best]) + '</b>');
        this.tip.innerHTML = '<span class="d" style="margin:0 0 3px">at ' + clock(xs[best]) + '</span>' + rows.join('<br>');
        this.tip.classList.remove('hidden');
        var tw = this.tip.offsetWidth, th = this.tip.offsetHeight, cvTop = this.canvas.offsetTop;
        var left = hx + 12 + tw > W ? hx - tw - 12 : hx + 12;
        this.tip.style.left = (this.canvas.offsetLeft + Math.max(0, left)) + 'px';
        this.tip.style.top = Math.max(0, cvTop + ph / 2 - th / 2) + 'px';
      }
    }
  };

  // ------------------------------------------------------------------ the drawer
  function Charts(app) {
    this.app = app;
    var box = document.getElementById('charts');
    this.charts = {
      species: new Chart(box, { title: 'Population by species', wide: true,
        help: 'Every living bug, coloured by its species: plant-eaters in cyan to blue, meat-eaters in magenta to orange. A band starts when a species appears and ends when it dies out; related species flow side by side. Hover for the biggest species at that moment.' }),
      skill: new Chart(box, { title: 'Foraging skill', wide: true,
        help: 'Meals found per minute spent hungry: the evolved plant-eaters against random brains (invisible ghost bugs that copy real bugs’ bodies and places but think with fresh random brains). Food shortages hit both lines; the gap between them is what they have learned.' }),
      prey: new Chart(box, { title: 'Hunted / hunters', help: 'Plant-eaters and meat-eaters alive. When hunters thrive, prey thin out; then the hunters go hungry and the prey recover.' }),
      traits: new Chart(box, { title: 'Average traits', help: 'Average genes of all living bugs, as a share of the range evolution can reach (0% = the smallest possible, 100% = the largest).' }),
      steer: new Chart(box, { title: 'Steering', help: 'Of the walking plant-eaters that can see food, the share pointed straight at it (within 20°), next to what luck alone would give.' }),
      life: new Chart(box, { title: 'Births and deaths', help: 'Per minute, with deaths split by cause: starved, old age, eaten by a meat-eater, or lost in a disaster (a meteor).' })
    };
    this.timer = 0;
    this.open = false;
  }

  Charts.prototype = {
    setOpen: function (on) { this.open = on; this.timer = 0; },

    update: function (dt) {
      if (!this.open || this.hiddenTab) return;
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = U.chartRefresh;
      this.build();
    },

    // Pick at most about one sample per pixel column, so drawing stays cheap at any run length.
    indices: function (n, width) {
      var from = 0, h = this.app.world.stats.history;
      if (U.chartMinutesShown > 0 && n > 0) {
        var t0 = h.time[n - 1] - U.chartMinutesShown * 60;
        while (from < n - 1 && h.time[from] < t0) from++;
      }
      var count = n - from, step = Math.max(1, Math.ceil(count / Math.max(40, width))), idx = [];
      for (var i = from; i < n; i += step) idx.push(i);
      if (idx.length && idx[idx.length - 1] !== n - 1) idx.push(n - 1);
      return idx;
    },

    build: function () {
      var w = this.app.world, s = w.stats, h = s.history, n = h.time.length;
      var width = this.charts.skill.canvas.clientWidth || 400;
      var idx = this.indices(n, width), smallIdx = this.indices(n, this.charts.traits.canvas.clientWidth || 260);
      var pick = function (arr, ix, k) { var out = new Array(ix.length); for (var i = 0; i < ix.length; i++) out[i] = arr[ix[i]] * (k || 1); return out; };
      var xsOf = function (ix) { return pick(h.time, ix); };
      var maxOf = function (arrs) { var m = 0; arrs.forEach(function (a) { for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; }); return m; };
      // A rolling average over the last chartSmoothSec seconds, for noisy half-second samples.
      var smooth = function (arr, ix, k) {
        var out = new Array(ix.length), j = 0, sum = 0, lo = 0;
        for (var i = 0; i < ix.length; i++) {
          var at = ix[i], t = h.time[at];
          while (j <= at) sum += arr[j++];
          while (lo < at && h.time[lo] < t - U.chartSmoothSec) sum -= arr[lo++];
          out[i] = sum / (j - lo) * (k || 1);
        }
        return out;
      };
      var nice = function (m) { if (m <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log(m) / Math.LN10)); var r = m / p; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p; };

      // Foraging skill: two lines on one axis (meals per hungry minute), the ratio as the headline.
      // It starts once there are enough hungry moments to measure (the first seconds give wild numbers).
      var skIdx = idx.filter(function (i) { return h.time[i] >= U.skillChartFromSec; });
      var ev = pick(h.adultRate, skIdx), gh = pick(h.ghostRate, skIdx), top = nice(maxOf([ev, gh]) * 1.08);
      var ch = this.charts.skill;
      ch.val.innerHTML = s.skill.toFixed(1) + '×<small>random brains' + (s.startSkill > 0 ? ' (minute 1: ' + s.startSkill.toFixed(1) + '×)' : '') + '</small>';
      ch.legend.innerHTML = '<span><i style="background:' + U.chartEvolved + '"></i>evolved bugs ' + s.adultRate.toFixed(1) + '</span>' +
        '<span><i class="dash"></i>random brains, same spots ' + s.ghostRate.toFixed(1) + '</span><span>meals per hungry minute</span>';
      ch.setData({ xs: xsOf(skIdx), yMax: top, yFmt: function (v) { return v.toFixed(v < 10 && v % 1 ? 1 : 0); },
        lines: [{ name: 'random brains', color: U.chartGhost, vals: gh, dash: true },
                { name: 'evolved bugs', color: U.chartEvolved, vals: ev, fill: 'rgba(22, 157, 179, 0.25)' }] });

      // Population by species: a streamgraph in species colours, in family order.
      this.buildSpecies(w, width);

      // Hunters and hunted: plant-eaters and meat-eaters alive.
      var cap = w.cap, popArr = pick(h.population, smallIdx), predArr = pick(h.predators, smallIdx);
      var preyArr = popArr.map(function (v, i) { return v - predArr[i]; });
      ch = this.charts.prey;
      ch.val.innerHTML = s.prey + ' <small>/</small> ' + s.predators;
      ch.legend.innerHTML = '<span><i style="background:' + U.chartPrey + '"></i>plant-eaters</span><span><i style="background:' + U.chartPred + '"></i>meat-eaters</span>';
      ch.setData({ xs: xsOf(smallIdx), yMax: cap * 1.08, yTicks: [0, Math.round(cap / 2), cap], yFmt: function (v) { return Math.round(v); },
        refs: [{ v: cap, label: 'cap' }],
        lines: [{ name: 'plant-eaters', color: U.chartPrey, vals: preyArr, fill: 'rgba(22, 157, 179, 0.18)' },
                { name: 'meat-eaters', color: U.chartPred, vals: predArr, fill: 'rgba(222, 80, 137, 0.22)' }] });

      // Average traits, each as a share of its gene's range (one shared 0-100% axis).
      var lines = [], leg = [], self = this;
      TRAITS.forEach(function (tr, k) {
        var rg = geneRange(tr.key), raw = pick(h[tr.key], smallIdx), vals = raw.map(function (v) { return (v - rg[0]) / (rg[1] - rg[0]) * 100; });
        var now = raw.length ? raw[raw.length - 1] : 0;
        lines.push({ name: tr.name, color: U.chartTraits[k], vals: vals, raw: raw, tipFmt: tr.fmt });
        leg.push('<span><i style="background:' + U.chartTraits[k] + '"></i>' + tr.name + ' ' + tr.fmt(now) + '</span>');
      });
      ch = this.charts.traits;
      ch.val.innerHTML = '';
      ch.legend.innerHTML = leg.join('');
      ch.setData({ xs: xsOf(smallIdx), yMax: 100, yTicks: [0, 50, 100], yFmt: function (v) { return Math.round(v) + '%'; }, lines: lines });

      // Steering against luck.
      var st = smooth(h.steer, smallIdx, 100), lk = smooth(h.steerLuck, smallIdx, 100);
      ch = this.charts.steer;
      ch.val.innerHTML = Math.round(s.steer * 100) + '%<small>luck ' + Math.round(s.steerLuck * 100) + '%</small>';
      ch.legend.innerHTML = '<span><i style="background:' + U.chartSteer + '"></i>pointed at food it sees</span><span><i class="dash"></i>luck alone</span>';
      ch.setData({ xs: xsOf(smallIdx), yMax: 100, yTicks: [0, 50, 100], yFmt: function (v) { return Math.round(v) + '%'; },
        lines: [{ name: 'luck alone', color: U.chartGhost, vals: lk, dash: true }, { name: 'steering', color: U.chartSteer, vals: st }] });

      // Births and deaths per minute, from the running totals.
      var rate = function (arr) {
        var out = new Array(smallIdx.length), j = 0;
        for (var i = 0; i < smallIdx.length; i++) {
          var at = smallIdx[i], t = h.time[at];
          while (j < at && h.time[j] < t - 60) j++;
          var dtm = (t - h.time[j]) / 60;
          out[i] = dtm > 0.05 ? (arr[at] - arr[j]) / dtm : 0;
        }
        return out;
      };
      var D = U.chartDeaths, births = rate(h.births);
      var stack = [
        { name: 'starved', color: D.starvation, vals: rate(h.starvation) },
        { name: 'old age', color: D.oldAge, vals: rate(h.oldAge) },
        { name: 'eaten', color: D.eaten, vals: rate(h.eaten) },
        { name: 'disaster', color: D.disaster, vals: rate(h.disaster) }
      ];
      var tot = new Array(smallIdx.length);
      for (var i = 0; i < tot.length; i++) tot[i] = stack[0].vals[i] + stack[1].vals[i] + stack[2].vals[i] + stack[3].vals[i];
      top = nice(maxOf([births, tot]) * 1.08);
      var last = tot.length - 1;
      ch = this.charts.life;
      ch.val.innerHTML = Math.round(births[last] || 0) + ' / ' + Math.round(tot[last] || 0) + '<small>per min</small>';
      ch.legend.innerHTML = '<span><i style="background:' + U.chartBirths + '"></i>births</span>' +
        stack.map(function (x) { return '<span><i class="box" style="background:' + x.color + '"></i>' + x.name + '</span>'; }).join('');
      ch.setData({ xs: xsOf(smallIdx), yMax: top, yFmt: function (v) { return Math.round(v); }, stack: stack,
        lines: [{ name: 'births', color: U.chartBirths, vals: births }] });
    },

    // The streamgraph: one band per species that ever had a few members (the rest share a grey "others"
    // band), stacked around the middle, in family order so related species lie side by side.
    buildSpecies: function (w, width) {
      var spc = w.species, times = spc.times, n = times.length, ch = this.charts.species, minM = GL.Config.species.logMinMembers;
      if (n < 2) { ch.setData({ xs: [0], yMax: 1, yFmt: String }); return; }
      var step = Math.max(1, Math.ceil(n / Math.max(60, width))), idx = [];
      for (var i = 0; i < n; i += step) idx.push(i);
      if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
      var order = GL.FamilyTree.familyOrder(w), stack = [], others = new Array(idx.length).fill(0), total = new Array(idx.length).fill(0);
      order.forEach(function (sp) {
        var vals = new Array(idx.length), any = false;
        for (var k = 0; k < idx.length; k++) {
          var v = spc.countAt(sp, idx[k]);
          vals[k] = v; total[k] += v; if (v) any = true;
        }
        if (!any) return;
        if (sp.peak < minM) { for (k = 0; k < idx.length; k++) others[k] += vals[k]; return; }
        var hue = Math.round(((sp.hue % 360) + 360) % 360);
        stack.push({ name: sp.name + (sp.meat ? ' (meat)' : ''), color: 'hsl(' + hue + ', 85%, ' + (sp.meat ? 60 : 55) + '%)', vals: vals, alpha: 0.85 });
      });
      stack.push({ name: 'others (small species)', color: 'rgba(140, 160, 190, 0.55)', vals: others, alpha: 0.6 });
      var top = 1; for (i = 0; i < total.length; i++) top = Math.max(top, total[i]);
      var xs = idx.map(function (k) { return times[k]; }), living = spc.living, meatAlive = 0;
      for (i = 0; i < spc.list.length; i++) if (spc.list[i].meat && spc.list[i].count > 0) meatAlive++;
      ch.val.innerHTML = w.creatures.length + '<small>bugs</small> ' + living + '<small>' + (living === 1 ? 'species' : 'species') + (meatAlive ? ', ' + meatAlive + ' meat-eating' : '') + '</small>';
      ch.legend.innerHTML = '<span>each band is a species: cyan to blue eat plants, magenta to orange eat meat</span>';
      ch.setData({ xs: xs, yMin: -top * 0.55, yMax: top * 0.55, yFmt: function (v) { return Math.round(v); }, stream: true, stack: stack,
        stackTipMax: 6, tipTotal: total });
    }
  };

  return Charts;
})();
