// Genesis Lab - simulation: save and load a whole world. Pure logic, never draws.
// A saved world is a plain JSON file holding everything the simulation needs to carry on
// exactly where it stopped: every creature (genes, brain, body and memory), the food, the
// lamps, the species and their history, the charts' samples, the lab log and every random
// number generator's state. Loading builds a fresh world with the same seed and settings,
// then pours the saved state into it, so a loaded world continues tick for tick exactly as
// the original would have.
// Numbers go in as JSON (which keeps every digit); typed arrays (brains, genes, food) go in as
// their raw bytes in base64; links between objects (a bite victim, a ghost's group, a species)
// are saved as references and reconnected on load.
var GL = GL || {};

GL.Save = (function () {
  var FORMAT = 'genesis-lab-world', VERSION = 1;
  // Rebuilt every tick or by the drawing code, so never saved.
  var SKIP_WORLD = { creatureGrid: 1, foodGrid: 1, queryBuf: 1, readyBuf: 1, posX: 1, posY: 1, noise: 1,
                     pool: 1, creatures: 1, events: 1, ghostGroups: 1, species: 1 };
  var SKIP_ANY = { world: 1, fx: 1 };          // back-links to the world, and drawing-only state
  var TYPED = { Float32Array: Float32Array, Float64Array: Float64Array, Int32Array: Int32Array, Uint32Array: Uint32Array,
                Uint8Array: Uint8Array, Int16Array: Int16Array, Uint16Array: Uint16Array, Int8Array: Int8Array };

  // ---------------------------------------------------------------- bytes
  function toB64(ta) {
    var bytes = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength), s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function fromB64(name, b64) {
    var s = atob(b64), bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    var T = TYPED[name];
    if (!T) throw new Error('Unknown number list in the save file: ' + name);
    return new T(bytes.buffer, 0, bytes.length / T.BYTES_PER_ELEMENT);
  }
  function isTyped(v) { return ArrayBuffer.isView(v) && !(v instanceof DataView); }

  // ---------------------------------------------------------------- save
  function serialize(world, meta) {
    var poolIdx = new Map(), ghostIdx = new Map(), groupIdx = new Map(), speciesIdx = new Map();
    world.pool.forEach(function (c, i) { poolIdx.set(c, i); });
    world.ghostGroups.forEach(function (g, gi) { groupIdx.set(g, gi); g.ghosts.forEach(function (c, k) { ghostIdx.set(c, [gi, k]); }); });
    world.species.list.forEach(function (sp) { speciesIdx.set(sp, sp.id); });

    function enc(v) {
      if (v === null || v === undefined) return null;
      var t = typeof v;
      if (t === 'number') {
        if (Object.is(v, -0)) return { $n: '-0' };
        return isFinite(v) ? v : { $n: String(v) };
      }
      if (t === 'string' || t === 'boolean') return v;
      if (t === 'function') return undefined;
      if (isTyped(v)) return { $t: v.constructor.name, b: toB64(v) };
      if (Array.isArray(v)) return v.map(function (x) { var e = enc(x); return e === undefined ? null : e; });
      if (poolIdx.has(v)) return { $c: poolIdx.get(v) };
      if (ghostIdx.has(v)) return { $h: ghostIdx.get(v) };
      if (groupIdx.has(v)) return { $g: groupIdx.get(v) };
      if (speciesIdx.has(v)) return { $s: speciesIdx.get(v) };
      return plain(v);
    }
    function plain(o, skip) {
      var out = {};
      for (var k in o) {
        if (!Object.prototype.hasOwnProperty.call(o, k) || SKIP_ANY[k] || (skip && skip[k])) continue;
        var e = enc(o[k]);
        if (e !== undefined) out[k] = e;
      }
      return out;
    }
    function groupOut(g) {
      var out = plain(g, { ghosts: 1 });
      out.ghosts = g.ghosts.map(function (c) { return plain(c); });
      return out;
    }

    var sp = world.species;
    var data = {
      format: FORMAT, version: VERSION, savedAt: new Date().toISOString(),
      meta: meta || {},                                  // seed, cap and world settings, for rebuilding
      world: plain(world, SKIP_WORLD),
      species: { list: sp.list.map(function (s) { return plain(s); }), rest: plain(sp, { list: 1 }) },
      pool: world.pool.map(function (c) { return plain(c); }),
      creatures: world.creatures.map(function (c) { return poolIdx.get(c); }),
      ghostGroups: world.ghostGroups.map(groupOut),
      log: { log: enc(world.events.log), logCount: world.events.logCount }
    };
    return data;
  }

  // ---------------------------------------------------------------- load
  // build(meta) must return a fresh world made with the saved seed, cap and settings.
  function restore(data, build) {
    if (!data || data.format !== FORMAT) throw new Error('This file is not a saved Genesis Lab world.');
    if (data.version > VERSION) throw new Error('This world was saved by a newer version of Genesis Lab.');
    var world = build(data.meta || {});
    if (world.pool.length !== data.pool.length) throw new Error('This world was saved with a different creature cap.');
    if (world.ghostGroups.length < data.ghostGroups.length) {     // extra test probes (headless only) are rebuilt
      for (var p = world.ghostGroups.length; p < data.ghostGroups.length; p++) {
        var dg = data.ghostGroups[p];
        world.makeGhostGroup(dg.ghosts.length, dg.lifetime, dg.respawn, 1);
      }
    }

    function dec(v) {
      if (v === null || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map(dec);
      if (v.$n !== undefined) return v.$n === '-0' ? -0 : Number(v.$n);
      if (v.$t !== undefined) return fromB64(v.$t, v.b);
      if (v.$c !== undefined) return world.pool[v.$c];
      if (v.$h !== undefined) return world.ghostGroups[v.$h[0]].ghosts[v.$h[1]];
      if (v.$g !== undefined) return world.ghostGroups[v.$g];
      if (v.$s !== undefined) return world.species.list[v.$s - 1];
      var o = {};
      for (var k in v) o[k] = dec(v[k]);
      return o;
    }
    function isSpecial(v) { return v.$n !== undefined || v.$t !== undefined || v.$c !== undefined || v.$h !== undefined || v.$g !== undefined || v.$s !== undefined; }
    // Pour saved values into an existing object, keeping its kind (and its own number lists where they fit).
    function into(target, saved) {
      for (var k in saved) {
        var v = saved[k], cur = target[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && !isSpecial(v) &&
            cur && typeof cur === 'object' && !Array.isArray(cur) && !isTyped(cur) && !(cur instanceof GL.Creature)) {
          into(cur, v);
        } else if (v && v.$t !== undefined && isTyped(cur) && cur.constructor.name === v.$t) {
          var d = fromB64(v.$t, v.b);
          if (d.length === cur.length) cur.set(d); else target[k] = d;
        } else {
          target[k] = dec(v);
        }
      }
    }

    // Species first, so references to them can be reconnected everywhere else.
    world.species.list = data.species.list.map(dec);
    into(world.species, data.species.rest);
    // Every creature object (dead ones too: references and reuse order depend on them).
    for (var i = 0; i < data.pool.length; i++) into(world.pool[i], data.pool[i]);
    world.creatures = data.creatures.map(function (k) { return world.pool[k]; });
    data.ghostGroups.forEach(function (g, gi) {
      var grp = world.ghostGroups[gi], gh = g.ghosts;
      var rest = {}; for (var k in g) if (k !== 'ghosts') rest[k] = g[k];
      into(grp, rest);
      for (var j = 0; j < gh.length; j++) into(grp.ghosts[j], gh[j]);
    });
    into(world, data.world);
    world.events.log = dec(data.log.log);
    world.events.logCount = data.log.logCount;
    world.watchId = 0; world.watchDeath = null;
    return world;
  }

  return { serialize: serialize, restore: restore, FORMAT: FORMAT, VERSION: VERSION };
})();
