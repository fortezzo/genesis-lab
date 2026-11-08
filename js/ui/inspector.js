// Genesis Lab - interface: the inspector (right panel), opened by clicking a creature.
// Name, number, generation and age; energy, health and diet; the live brain viewer
// and the view-slice radar; every gene as a mini bar against the average of all
// living bugs; babies, kills and food eaten; parent and children links to jump between
// them. If the bug dies while selected, the panel says what happened, freezes its brain,
// and offers to follow its child or nearest relative.
// Speed: text and bars refresh a few times a second; only the brain viewer and the
// radar draw every frame, and nothing is drawn while the panel is closed.
var GL = GL || {};

GL.Inspector = (function () {
  var C = GL.Config, U = C.ui, G = GL.Genome.G, GENES = GL.Genome.GENES;

  // How each gene reads in the panel (real lab units: 1 unit = 0.1 mm).
  var FORMAT = {
    size: function (v) { return (v * 2 * C.mmPerUnit).toFixed(1) + ' mm'; },
    speed: function (v) { return (v * C.mmPerUnit).toFixed(1) + ' mm/s'; },
    turn: function (v) { return Math.round(v * 180 / Math.PI) + '°/s'; },
    sight: function (v) { return (v * C.mmPerUnit).toFixed(1) + ' mm'; },
    fov: function (v) { return Math.round(v) + '°'; },
    diet: function (v) { return v < 0.05 ? 'plants' : v > 0.95 ? 'meat' : v.toFixed(2); },
    invest: function (v) { return Math.round(v * 100) + '%'; },
    mutation: function (v) { return (v * 100).toFixed(1) + '%'; },
    clock: function (v) { return v.toFixed(2) + ' Hz'; }
  };
  var HELP = {
    size: 'Body width. Bigger stores more energy but burns more.',
    speed: 'Top walking speed. Above 7 mm/s, long legs turn more slowly.',
    turn: 'How fast it can turn.',
    sight: 'How far it can see.',
    fov: 'How wide it can see. Wider views make each slice vaguer.',
    diet: '0 = plants, 1 = meat (meat-eating arrives in Session 3).',
    invest: 'Share of its energy each baby gets.',
    mutation: 'Chance each DNA number changes in its babies.',
    clock: 'Speed of its inner rhythm.'
  };
  var DEATH_WORDS = { starvation: 'starved', oldAge: 'died of old age', eaten: 'was eaten', disaster: 'was lost in a disaster' };

  function Inspector(app) {
    this.app = app;
    var $ = function (id) { return document.getElementById(id); };
    this.el = {
      root: $('inspector'), name: $('insp-name'), meta: $('insp-meta'), champ: $('insp-champ'), close: $('insp-close'),
      death: $('insp-death'), energy: $('insp-energy'), energyV: $('insp-energy-v'), health: $('insp-health'),
      healthV: $('insp-health-v'), diet: $('insp-diet'), dietV: $('insp-diet-v'), genes: $('insp-genes'),
      life: $('insp-life'), family: $('insp-family'), radarNote: $('radar-note')
    };
    this.brainView = new GL.BrainView($('brain'), $('brain-tip'));
    this.radar = new GL.RadarView($('radar'));
    // A snapshot of the subject, so the panel can keep showing a bug after it dies
    // (creature objects are reused for new babies straight away).
    this.snap = {
      key: '', id: 0, alive: false, brain: new Float32Array(GL.Genome.BRAIN_SIZE), genes: new Float32Array(GL.Genome.GENE_COUNT),
      inputs: new Float32Array(C.brainInputs), hidden: new Float32Array(C.brainHidden), outputs: new Float32Array(C.brainOutputs),
      hue: 190, fov: 2, sight: 150, generation: 0, parentId: 0, primitive: false, age: 0, energy: 0, maxEnergy: 1,
      health: 0, maxHealth: 1, babies: 0, kills: 0, foodEaten: 0, turnSpeed: 0, radius: 0, fullRadius: 1
    };
    this.open = false;
    this.refreshTimer = 0;
    this.familyKey = '';
    this.deathKey = '';
    this.buildGenes();
    this.buildLife();
    var self = this;
    this.el.close.addEventListener('click', function () { self.app.hud.dismissDeath(); self.app.renderer.select(null); self.app.hud.update(0, true); });
    // Parent, children and "follow" buttons all work by click delegation.
    this.el.root.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-id],[data-act]') : null;
      if (!t) return;
      if (t.dataset.act === 'follow') { self.app.hud.followNext(); return; }
      if (t.dataset.act === 'stay') { self.app.hud.dismissDeath(); self.app.hud.update(0, true); return; }
      var id = Number(t.dataset.id), c = id ? self.app.world.findById(id) : null;
      if (c) { self.app.hud.dismissDeath(); self.app.renderer.select(c); self.app.hud.update(0, true); }
    });
  }

  Inspector.prototype = {
    buildGenes: function () {
      var html = '';
      for (var i = 0; i < GENES.length; i++) {
        var g = GENES[i];
        html += '<div class="gene" title="' + HELP[g.key] + '"><span class="gname">' + g.name + '</span>' +
          '<div class="track"><div class="gfill"></div><div class="gavg"></div></div><span class="gval">-</span></div>';
      }
      this.el.genes.innerHTML = html;
      var rows = this.el.genes.children;
      this.geneEls = [];
      for (i = 0; i < rows.length; i++) {
        this.geneEls.push({ fill: rows[i].querySelector('.gfill'), avg: rows[i].querySelector('.gavg'), val: rows[i].querySelector('.gval'), row: rows[i] });
      }
      this.avg = new Float32Array(GENES.length);
    },
    buildLife: function () {
      var cells = [['age', 'Age'], ['babies', 'Babies'], ['food', 'Food eaten'], ['gen', 'Generation'], ['kills', 'Kills'], ['score', 'Score']];
      var tips = { age: 'Old age starts at 2:48; nobody lives past 5:00.', score: 'Champion score: babies x 3 + minutes alive.',
        kills: 'Hunting arrives in Session 3.', gen: 'How many parents back its family line goes.', food: 'Sprouts eaten in its life.' };
      var html = '';
      cells.forEach(function (c) {
        html += '<div class="cell" title="' + (tips[c[0]] || '') + '"><span class="label">' + c[1] + '</span><div class="cv" data-cell="' + c[0] + '">-</div></div>';
      });
      this.el.life.innerHTML = html;
      this.cells = {};
      var els = this.el.life.querySelectorAll('[data-cell]');
      for (var i = 0; i < els.length; i++) this.cells[els[i].dataset.cell] = els[i];
    },

    // Copy what the panel needs from a living creature.
    capture: function (c) {
      var s = this.snap;
      if (s.id !== c.id) { s.id = c.id; s.key = 'c' + c.id; s.brain.set(c.brain); s.genes.set(c.genes); this.familyKey = ''; this.refreshTimer = 0; }
      s.alive = true;
      s.inputs.set(c.inputs); s.hidden.set(c.hidden); s.outputs.set(c.outputs);
      s.hue = c.hue; s.fov = c.fov; s.sight = c.sight; s.generation = c.generation; s.parentId = c.parentId;
      s.primitive = c.primitive; s.age = c.age; s.energy = c.energy; s.maxEnergy = c.maxEnergy;
      s.health = c.health; s.maxHealth = c.maxHealth; s.babies = c.babies; s.kills = c.kills; s.foodEaten = c.foodEaten;
      s.turnSpeed = c.turnSpeed; s.radius = c.radius; s.fullRadius = c.fullRadius;
    },

    show: function (on) {
      if (on === this.open) return;
      this.open = on;
      this.el.root.classList.toggle('hidden', !on);
      document.body.classList.toggle('inspecting', on);
      this.app.layoutChanged();
    },

    update: function (dt) {
      var app = this.app, c = app.renderer.getSelected(), death = app.hud.death, s = this.snap;
      if (c) this.capture(c);
      else if (death && death.record.id === s.id) s.alive = false;
      else { this.show(false); return; }
      this.show(true);
      if (document.body.classList.contains('clean')) return;   // screenshot mode: nothing to draw
      var running = !app.loop.paused;
      this.brainView.setSubject(s);
      this.brainView.draw(dt, running);
      this.radar.draw(dt, s, this.brainView.hoverSlice);
      this.refreshTimer -= dt;
      if (this.refreshTimer > 0) return;
      this.refreshTimer = U.inspectorRefresh;
      this.refresh(c, death);
    },

    refresh: function (c, death) {
      var s = this.snap, el = this.el, world = this.app.world, hud = this.app.hud, i;
      el.root.style.setProperty('--hue', Math.round(s.hue));
      el.root.classList.toggle('dead', !s.alive);
      el.name.textContent = 'Specimen #' + s.id;
      el.meta.textContent = 'Gen ' + s.generation + ' · ' + (s.primitive ? 'primitive, wandered in' : 'child of #' + s.parentId) +
        ' · ' + (s.radius < s.fullRadius - 0.01 ? 'growing' : 'grown');
      el.champ.classList.toggle('hidden', !(s.alive && world.stats.championId === s.id));

      // Death notice, with the next bug to follow.
      if (!s.alive && death) {
        var rec = death.record, left = Math.max(0, Math.ceil((death.until - performance.now()) / 1000));
        var key = rec.id + '|' + (death.next ? death.next.id : 0) + '|' + left;
        if (key !== this.deathKey) {
          this.deathKey = key;
          el.death.innerHTML = '<b>Specimen #' + rec.id + ' ' + (DEATH_WORDS[rec.cause] || 'died') + ' at age ' + hud.clock(rec.age) + '</b>' +
            ' after eating ' + rec.foodEaten + (rec.foodEaten === 1 ? ' sprout' : ' sprouts') + ' and having ' + rec.babies +
            (rec.babies === 1 ? ' baby.' : ' babies.') +
            '<div class="fam-row" style="margin-top:8px">' +
            (death.next ? '<button class="link" data-act="follow">Follow ' + death.label + ' #' + death.next.id + (left > 0 ? ' (' + left + ')' : '') + '</button>' : '') +
            '<button class="link gone" data-act="stay" style="cursor:pointer">Stay here</button></div>';
        }
        el.death.classList.remove('hidden');
      } else if (this.deathKey) { this.deathKey = ''; el.death.classList.add('hidden'); }

      // Vitals.
      var e = Math.max(0, Math.min(1, s.energy / s.maxEnergy)), h = Math.max(0, Math.min(1, s.health / s.maxHealth));
      if (!s.alive) e = 0;
      el.energy.style.transform = 'scaleX(' + e.toFixed(3) + ')';
      el.energy.classList.toggle('low', e < 0.25);
      el.energyV.textContent = Math.round(e * 100) + '%';
      el.health.style.transform = 'scaleX(' + h.toFixed(3) + ')';
      el.healthV.textContent = Math.round(h * 100) + '%';
      var diet = s.genes[G.DIET];
      el.diet.style.left = (diet * 100).toFixed(1) + '%';
      el.dietV.textContent = FORMAT.diet(diet);
      el.radarNote.textContent = 'sees ' + FORMAT.sight(s.sight) + ' · ' + Math.round(s.fov * 180 / Math.PI) + '° wide';

      // Genes against the average of all living bugs.
      var list = world.creatures, n = list.length, avg = this.avg;
      avg.fill(0);
      for (i = 0; i < n; i++) for (var k = 0; k < GENES.length; k++) avg[k] += list[i].genes[k];
      for (k = 0; k < GENES.length; k++) {
        var g = GENES[k], span = g.max - g.min, v = s.genes[k], ge = this.geneEls[k];
        var a = n ? avg[k] / n : v;
        ge.fill.style.transform = 'scaleX(' + Math.max(0.02, (v - g.min) / span).toFixed(3) + ')';
        ge.avg.style.left = ((a - g.min) / span * 100).toFixed(1) + '%';
        ge.val.textContent = FORMAT[g.key](v);
        if (g.key === 'turn') ge.row.title = HELP.turn + ' Gene ' + FORMAT.turn(v) + '; with its leg length it really turns at ' + FORMAT.turn(s.turnSpeed) + '.';
      }

      // Life.
      var old = s.age > C.lifespan * C.oldAgeStart;
      this.cells.age.innerHTML = hud.clock(s.age) + (old ? ' <small>old</small>' : '');
      this.cells.babies.textContent = s.babies;
      this.cells.food.textContent = s.foodEaten;
      this.cells.gen.textContent = s.generation;
      this.cells.kills.innerHTML = s.kills + ' <small>none yet</small>';
      this.cells.score.textContent = (s.babies * C.championBabyWeight + s.age / 60 * C.championMinuteWeight).toFixed(1);

      this.refreshFamily(s, world);
    },

    // Parent and living children as links. Rebuilt only when something changes, so clicks never miss.
    refreshFamily: function (s, world) {
      var list = world.creatures, kids = [], i;
      for (i = 0; i < list.length; i++) if (list[i].parentId === s.id) kids.push(list[i].id);
      var parent = s.parentId ? world.findById(s.parentId) : null;
      var key = s.id + '|' + (parent ? 1 : 0) + '|' + s.babies + '|' + kids.join(',');
      if (key === this.familyKey) return;
      this.familyKey = key;
      var html = '<div class="fam-row"><span class="label">Parent</span>';
      if (s.primitive || !s.parentId) html += '<span class="fam-note">none: it wandered in with a random brain</span>';
      else if (parent) html += '<button class="link" data-id="' + parent.id + '">#' + parent.id + '</button><span class="fam-note">alive</span>';
      else html += '<span class="link gone">#' + s.parentId + '</span><span class="fam-note">gone</span>';
      html += '</div><div class="fam-row"><span class="label">Children</span>';
      if (!s.babies) html += '<span class="fam-note">none yet</span>';
      else {
        var shown = Math.min(kids.length, U.childrenShown);
        for (i = 0; i < shown; i++) html += '<button class="link" data-id="' + kids[i] + '">#' + kids[i] + '</button>';
        if (kids.length > shown) html += '<span class="fam-note">+' + (kids.length - shown) + ' more</span>';
        html += '<span class="fam-note">' + kids.length + ' of ' + s.babies + ' alive</span>';
      }
      html += '</div>';
      this.el.family.innerHTML = html;
    }
  };

  return Inspector;
})();
