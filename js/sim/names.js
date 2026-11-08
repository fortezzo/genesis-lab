// Genesis Lab - simulation: species names. Pure logic, never draws.
// Each new species gets a Latin-style name such as "Lumivora cyanea" or "Ferox noctis".
// The first word (the genus) hints at diet: gentle-sounding for plant-eaters, fierce
// for meat-eaters. The second word is built from random syllables. Names draw from the
// species' own random numbers, never the simulation's, so naming changes nothing.
var GL = GL || {};

GL.Names = (function () {
  // Genus = a root + an ending. Plant-eaters sound soft; meat-eaters sound sharp.
  var PLANT_ROOTS = ['Lumi', 'Foli', 'Herbi', 'Moll', 'Placi', 'Glauc', 'Silv', 'Rori', 'Flocc', 'Mit', 'Lent', 'Cyan',
                     'Aqu', 'Neb', 'Sert', 'Lev', 'Tranqu', 'Mus', 'Ser', 'Plum'];
  var PLANT_ENDS = ['ivora', 'ipes', 'ula', 'ella', 'ina', 'icola', 'aria', 'ena', 'ifex', 'idia'];
  var MEAT_ROOTS = ['Fer', 'Mord', 'Vor', 'Rap', 'Saev', 'Atr', 'Necr', 'Cruent', 'Trux', 'Lani', 'Fur', 'Sang',
                    'Ungu', 'Spin', 'Dent', 'Hast', 'Grav', 'Rab', 'Acer', 'Vipr'];
  var MEAT_ENDS = ['ox', 'ax', 'ator', 'ipes', 'ivora', 'ix', 'odon', 'ens', 'ux', 'ex'];
  // Species word = 1-2 syllables + a Latin ending.
  var SYL = ['ca', 'cy', 'lu', 'no', 've', 'ri', 'ta', 'mo', 'ze', 'sa', 'vel', 'nor', 'pha', 'thy', 'la', 'mi', 'ru',
             'syl', 'do', 'tri', 'ae', 'li', 'ste', 'qua', 'ber', 'cor', 'fu', 'gla', 'pal', 'vi', 'ul', 'ne', 'ar', 'or'];
  var ENDS = ['a', 'ea', 'is', 'um', 'us', 'ens', 'ica', 'ina', 'ata', 'oides', 'ella', 'ior', 'ana', 'ensis', 'ax'];

  function pick(rng, list) { return list[Math.floor(rng.next() * list.length)]; }

  function genus(rng, meat) {
    var root = pick(rng, meat ? MEAT_ROOTS : PLANT_ROOTS), end = pick(rng, meat ? MEAT_ENDS : PLANT_ENDS);
    // Avoid a doubled letter where root and ending meet (e.g. "Moll" + "ula" is fine, "Mus" + "s..." is not).
    if (root[root.length - 1] === end[0]) end = end.slice(1);
    return root + end;
  }

  function epithet(rng) {
    var w = pick(rng, SYL);
    if (rng.next() < 0.65) w += pick(rng, SYL);
    var end = pick(rng, ENDS);
    var last = w[w.length - 1], vowels = 'aeiouy';
    if (vowels.indexOf(last) >= 0 && vowels.indexOf(end[0]) >= 0) w = w.slice(0, -1);   // "luca" + "ea" -> "lucea"
    return w + end;
  }

  // A full name, avoiding names already used in this world. keepGenus: reuse a genus (or null).
  function make(rng, meat, keepGenus, used) {
    for (var tries = 0; tries < 30; tries++) {
      var g = keepGenus || genus(rng, meat), e = epithet(rng), name = g + ' ' + e;
      if (!used || !used[name]) { if (used) used[name] = true; return { genus: g, name: name }; }
      if (tries > 10) keepGenus = null;
    }
    var fallback = genus(rng, meat) + ' ' + epithet(rng) + ' ' + Math.floor(rng.next() * 90 + 10);
    if (used) used[fallback] = true;
    return { genus: fallback.split(' ')[0], name: fallback };
  }

  return { make: make, genus: genus, epithet: epithet };
})();
