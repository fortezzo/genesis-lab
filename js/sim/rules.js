// Genesis Lab - simulation: the rules a world is built with.
// Before a world is made, apply() sets the config.js numbers that depend on its settings:
//  - the visitor's world settings (sprout growth, mutation strength, world size; Settings tab), and
//  - smaller populations (phones, or a lower creature cap): a world with a cap below scaleRefCap is a
//    scaled-down laptop world. The terrarium shrinks so there are as many bugs per area, sprouts grow
//    in proportion so there is as much food per bug, and the gut switch that starts a meat-eater line
//    is more likely, so meat-eater lines start about as often as they do in a full-size world. Without
//    this, a 150-bug phone world sat at its cap all the time with well-fed, scattered prey, and a hunter
//    species formed by minute 20 in only 3 of 20 worlds (laptops: 18 of 20).
// At the usual settings and a cap of scaleRefCap or more, every number is exactly as config.js has it.
var GL = GL || {};

GL.WorldRules = (function () {
  var C = GL.Config;
  // The numbers these rules scale, exactly as config.js has them (captured once, before any change).
  var base = { sproutGrowthRate: C.sproutGrowthRate, sproutMax: C.sproutMax, geneNudge: C.geneNudge, brainNudge: C.brainNudge,
               terrariumRadius: C.terrariumRadius, dietSwitchChance: C.dietSwitchChance };

  // ws: { cap, growth (x sprout growth), mutation (x DNA nudges), size ('small' | 'normal' | 'large') }; any may be left out.
  function apply(ws) {
    ws = ws || {};
    var S = C.smallWorld, sizes = C.settings ? C.settings.worldSizes : null;
    var growth = ws.growth || 1, mutation = ws.mutation || 1;
    var radius = !ws.size || ws.size === 'normal' || !sizes || !sizes[ws.size] ? base.terrariumRadius : sizes[ws.size];
    var k = ws.cap && ws.cap < S.scaleRefCap ? ws.cap / S.scaleRefCap : 1;   // 1 = a full-size world
    C.sproutGrowthRate = base.sproutGrowthRate * growth * k;
    C.sproutMax = k === 1 ? base.sproutMax : Math.round(base.sproutMax * k);
    C.geneNudge = base.geneNudge * mutation;
    C.brainNudge = base.brainNudge * mutation;
    C.terrariumRadius = k === 1 ? radius : Math.round(radius * Math.sqrt(k));
    C.dietSwitchChance = k === 1 ? base.dietSwitchChance : Math.min(S.dietSwitchMax, base.dietSwitchChance * Math.pow(k, -S.dietSwitchExp));
    return k;
  }

  return { base: base, apply: apply };
})();
