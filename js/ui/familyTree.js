// Genesis Lab - interface: the family tree of species (a tab in the charts drawer).
// A branching timeline: time runs left to right, each species is a branch from the moment
// it appeared until it died out (or now), as thick as its population, joined to the species
// it split from. Living species glow in their colours; extinct ones fade to grey. Hover a
// branch for its story; click it to ring its members in the terrarium (click again to stop).
// Only species that ever had a few members at once are drawn, so short-lived one-offs
// don't clutter it. Redrawn about once a second while the tab is open.
var GL = GL || {};

GL.FamilyTree = (function () {
  var C = GL.Config, U = C.ui;
  function clock(t) { t = Math.max(0, Math.floor(t)); var m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function hueOf(sp) { return Math.round(((sp.hue % 360) + 360) % 360); }

  function FamilyTree(app) {
    this.app = app;
    this.canvas = document.getElementById('tree-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tip = document.getElementById('tree-tip');
    this.open = false;
    this.timer = 0;
    this.rows = [];             // laid-out branches: { sp, row, y, x0, x1 }
    this.hover = null;
    this.mx = -1; this.my = -1;
    var self = this;
    this.canvas.addEventListener('pointermove', function (e) {
      var r = self.canvas.getBoundingClientRect(); self.mx = e.clientX - r.left; self.my = e.clientY - r.top; self.pickHover(); self.render();
    });
    this.canvas.addEventListener('pointerleave', function () { self.mx = -1; self.hover = null; self.tip.classList.add('hidden'); self.render(); });
    this.canvas.addEventListener('click', function () { if (self.hover) self.app.highlightSpecies(self.hover.sp.id, true); self.render(); });
  }

  FamilyTree.prototype = {
    setOpen: function (on) { this.open = on; this.timer = 0; if (!on) this.tip.classList.add('hidden'); },
    update: function (dt) {
      if (!this.open) return;
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = U.treeRefresh;
      this.layout();
      this.render();
    },

    // Which species to draw, in tree order: each one below its parent, children by age.
    layout: function () {
      var w = this.app.world, list = w.species.list, minM = C.species.logMinMembers, shown = {}, kids = {}, roots = [], i;
      for (i = 0; i < list.length; i++) {
        var sp = list[i];
        if (sp.peak >= minM || sp.origin === 'primordial' || (sp.count > 0 && sp.origin !== 'evolved')) shown[sp.id] = sp;
      }
      // Join each shown species to its nearest shown ancestor (kept here: the simulation's records stay untouched).
      var parentOf = this.parentOf = {};
      for (var id in shown) {
        var s = shown[id], p = w.species.get(s.parentId);
        while (p && !shown[p.id]) p = w.species.get(p.parentId);
        if (p) (kids[p.id] = kids[p.id] || []).push(s); else roots.push(s);
        parentOf[s.id] = p ? p.id : 0;
      }
      var order = [];
      var visit = function (sp) {
        order.push(sp);
        var ks = (kids[sp.id] || []).sort(function (a, b) { return a.bornAt - b.bornAt; });
        for (var k = 0; k < ks.length; k++) visit(ks[k]);
      };
      roots.sort(function (a, b) { return a.bornAt - b.bornAt; }).forEach(visit);
      this.order = order;
    },

    render: function () {
      var cv = this.canvas, r = cv.getBoundingClientRect();
      if (!this.open || r.width < 40 || r.height < 40) return;
      if (!this.order) this.layout();
      var dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(r.width), H = Math.round(r.height);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      var ctx = this.ctx, w = this.app.world, spc = w.species, now = w.time, order = this.order, i, k;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var L = 8, Rm = 150, T = 8, B = 16, pw = Math.max(40, W - L - Rm), ph = H - T - B;
      var n = Math.max(1, order.length), rowH = Math.min(44, ph / n), maxTh = Math.max(2, Math.min(30, rowH * 0.85));
      var X = function (t) { return L + Math.max(0, t) / Math.max(60, now) * pw; };
      var times = spc.times;
      // Time axis.
      ctx.font = '9.5px "JetBrains Mono", monospace'; ctx.fillStyle = U.chartAxis; ctx.textAlign = 'center';
      var span = Math.max(60, now) / 60, steps = [0.5, 1, 2, 5, 10, 15, 30, 60], step = 60;
      for (i = 0; i < steps.length; i++) if (span / steps[i] <= 6) { step = steps[i]; break; }
      ctx.strokeStyle = U.chartGrid; ctx.lineWidth = 1;
      for (var m = step; m * 60 <= now; m += step) {
        var gx = Math.round(X(m * 60)) + 0.5;
        ctx.beginPath(); ctx.moveTo(gx, T); ctx.lineTo(gx, T + ph); ctx.stroke();
        ctx.fillText(m + 'm', gx, H - 3);
      }
      ctx.textAlign = 'left';
      if (!order.length) { ctx.fillStyle = U.chartAxis; ctx.fillText('collecting species…', L + 6, T + 14); return; }

      var rowOf = {}, rows = [];
      for (i = 0; i < order.length; i++) {
        var sp = order[i], y = T + (i + 0.5) * rowH, end = sp.count > 0 ? now : sp.extinctAt;
        rowOf[sp.id] = y;
        rows.push({ sp: sp, y: y, x0: X(sp.bornAt), x1: X(end) });
      }
      this.rows = rows; this.rowH = rowH;
      var peakAll = 1;
      for (i = 0; i < order.length; i++) peakAll = Math.max(peakAll, order[i].peak);
      var hl = this.app.renderer.highlightSpecies;

      // Connectors from each species to its parent, at the moment it split off.
      ctx.lineWidth = 1;
      for (i = 0; i < rows.length; i++) {
        var rw = rows[i], pid = this.parentOf[rw.sp.id];
        if (!pid || rowOf[pid] === undefined) continue;
        var alive = rw.sp.count > 0;
        ctx.strokeStyle = alive ? 'hsla(' + hueOf(rw.sp) + ', 80%, 65%, 0.55)' : 'rgba(140, 160, 190, 0.28)';
        ctx.beginPath(); ctx.moveTo(rw.x0, rowOf[pid]);
        ctx.bezierCurveTo(rw.x0 + 6, rowOf[pid], rw.x0 - 2, rw.y, rw.x0 + 4, rw.y); ctx.stroke();
      }
      // Branches: a band as thick as the population (square root, so small species still show).
      for (i = 0; i < rows.length; i++) {
        rw = rows[i]; sp = rw.sp;
        var living = sp.count > 0, hue = hueOf(sp), j0 = sp.histStart, vals = sp.hist;
        ctx.beginPath();
        var pts = [];
        for (k = 0; k < vals.length; k++) {
          var t = times[j0 + k]; if (t === undefined) continue;
          pts.push(X(t), Math.sqrt(vals[k] / peakAll) * maxTh * 0.5 + 0.7);
        }
        if (living) pts.push(X(now), Math.sqrt(sp.count / peakAll) * maxTh * 0.5 + 0.7);
        if (pts.length < 2) { pts = [rw.x0, 0.8, Math.max(rw.x0 + 1.5, rw.x1), 0.8]; }
        ctx.moveTo(pts[0], rw.y - pts[1]);
        for (k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], rw.y - pts[k + 1]);
        for (k = pts.length - 2; k >= 0; k -= 2) ctx.lineTo(pts[k], rw.y + pts[k + 1]);
        ctx.closePath();
        var picked = hl === sp.id || (this.hover && this.hover.sp === sp);
        if (living) {
          ctx.save();
          ctx.shadowColor = 'hsla(' + hue + ', 100%, 60%, 0.8)'; ctx.shadowBlur = picked ? 12 : 6;
          ctx.fillStyle = 'hsla(' + hue + ', 95%, ' + (picked ? 68 : 58) + '%, 0.95)'; ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = picked ? 'rgba(190, 205, 225, 0.75)' : 'rgba(120, 135, 160, 0.42)'; ctx.fill();
        }
        // Meat-eaters get small spikes along the top of their branch, so diet reads by shape too.
        if (sp.meat && rw.x1 - rw.x0 > 12) {
          ctx.fillStyle = living ? 'hsla(' + hue + ', 95%, 70%, 0.9)' : 'rgba(150, 160, 180, 0.5)';
          for (var sx = rw.x0 + 4; sx < rw.x1 - 2; sx += 9) {
            ctx.beginPath(); ctx.moveTo(sx - 2, rw.y - 1); ctx.lineTo(sx, rw.y - Math.min(5, rowH * 0.45)); ctx.lineTo(sx + 2, rw.y - 1); ctx.fill();
          }
        }
        // The species' name at the end of its branch.
        if (rowH >= 9 || living || picked) {
          ctx.font = (living ? '600 ' : '') + Math.min(11, Math.max(9, rowH * 0.62)) + 'px "Inter", sans-serif';
          ctx.fillStyle = living ? 'hsl(' + hue + ', 90%, 75%)' : 'rgba(140, 155, 180, 0.8)';
          ctx.textBaseline = 'middle';
          var label = sp.name + (living ? '  ' + sp.count : '');
          ctx.fillText(label, Math.min(rw.x1 + 6, W - Rm + 4), rw.y + 0.5);
          ctx.textBaseline = 'alphabetic';
        }
      }
      if (this.hover) this.showTip();
    },

    pickHover: function () {
      var best = null, bestD = Infinity;
      for (var i = 0; i < this.rows.length; i++) {
        var rw = this.rows[i], dy = Math.abs(this.my - rw.y);
        if (dy > Math.max(5, this.rowH * 0.6) || this.mx < rw.x0 - 6) continue;
        if (this.mx > rw.x1 + 150) continue;
        if (dy < bestD) { bestD = dy; best = rw; }
      }
      this.hover = best;
      if (!best) this.tip.classList.add('hidden');
      this.canvas.style.cursor = best ? 'pointer' : 'default';
    },

    showTip: function () {
      var rw = this.hover, sp = rw.sp, w = this.app.world, parent = w.species.get(sp.parentId);
      var gens = Math.max(1, sp.maxGen - sp.founderGen);
      var html = '<b><i>' + sp.name + '</i></b> <span class="v">' + (sp.meat ? 'meat-eater' : 'plant-eater') + '</span>' +
        '<span class="d">Appeared at ' + clock(sp.bornAt) + (sp.origin === 'primordial' ? ' (the first bugs)' : sp.origin === 'dropped' ? ' (dropped in by you)' :
        sp.origin === 'hall' ? ' (from the Hall of Fame)' : ', gen ' + sp.founderGen + (parent ? ', from ' + parent.name : '')) + '.</span>' +
        '<span class="d">' + (sp.count > 0 ? sp.count + ' alive now' : 'Extinct at ' + clock(sp.extinctAt)) + ' · at most ' + sp.peak + ' at once · ' +
        gens + (gens === 1 ? ' generation' : ' generations') + (sp.meat ? ' · ' + sp.kills + ' kills' : '') + '</span>' +
        '<span class="d">' + (this.app.renderer.highlightSpecies === sp.id ? 'Click to stop highlighting it.' : (sp.count > 0 ? 'Click to highlight it in the terrarium.' : '')) + '</span>';
      this.tip.innerHTML = html;
      this.tip.classList.remove('hidden');
      var tw = this.tip.offsetWidth, th = this.tip.offsetHeight, cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
      var left = this.mx + 14 + tw > cw ? this.mx - tw - 14 : this.mx + 14;
      this.tip.style.left = Math.max(0, left) + 'px';
      this.tip.style.top = Math.max(0, Math.min(ch - th, this.my - th / 2)) + 'px';
    }
  };

  // Every species in family order (each one right after its parent, children by age), for the
  // streamgraph, so related species lie side by side and their colours flow into each other.
  FamilyTree.familyOrder = function (world) {
    var list = world.species.list, kids = {}, roots = [], order = [], i;
    for (i = 0; i < list.length; i++) {
      var p = list[i].parentId;
      if (p && world.species.get(p)) (kids[p] = kids[p] || []).push(list[i]); else roots.push(list[i]);
    }
    var stack = roots.slice().reverse();
    while (stack.length) {
      var sp = stack.pop(); order.push(sp);
      var ks = kids[sp.id];
      if (ks) for (i = ks.length - 1; i >= 0; i--) stack.push(ks[i]);
    }
    return order;
  };

  return FamilyTree;
})();
