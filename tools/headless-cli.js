// Genesis Lab - headless test from a terminal (for the builder).
// Runs exactly the same simulation code as tools/headless.html, using Node.js:
//   node tools/headless-cli.js --seeds 1,2,3 --minutes 10
// Options:
//   --seeds 1,2,3       which worlds to run (default 1,2,3)
//   --minutes 10        simulated minutes per world (default 10)
//   --set name=value    try a different config.js number without editing the file (repeatable)
//   --cap 150           a smaller world, as on a phone (default: the laptop cap)
//   --summary           print only the summary table
//   --json              print the raw results as JSON
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var childProcess = require('child_process');

var root = path.join(__dirname, '..');
var args = parseArgs(process.argv.slice(2));

if (args.one !== undefined) {
  // Child mode: run one seed and print its result as JSON.
  var GL1 = load(args.sets);
  var run = new GL1.Headless.SeedRun(args.one, args.minutes, args.cap);
  while (!run.advance(60 * 60)) { /* keep going */ }
  process.stdout.write(JSON.stringify(run.result()));
  process.exit(0);
}

// Parent mode: run every seed in its own process at the same time, then print the report.
var GL = load(args.sets);
var pending = args.seeds.length, results = new Array(args.seeds.length), started = Date.now();
args.seeds.forEach(function (seed, i) {
  var childArgs = [__filename, '--one', String(seed), '--minutes', String(args.minutes)];
  if (args.cap) childArgs.push('--cap', String(args.cap));
  args.sets.forEach(function (s) { childArgs.push('--set', s); });
  var child = childProcess.spawn(process.execPath, childArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
  var out = '';
  child.stdout.on('data', function (d) { out += d; });
  child.on('close', function (code) {
    if (code !== 0) { console.error('Seed ' + seed + ' failed (exit code ' + code + ')'); process.exit(1); }
    results[i] = JSON.parse(out);
    if (--pending === 0) finish();
  });
});

function finish() {
  if (args.json) { console.log(JSON.stringify(results, null, 1)); return; }
  if (args.sets.length) console.log('Config changes for this run: ' + args.sets.join(', ') + '\n');
  if (!args.summary) results.forEach(function (r) { console.log(GL.Headless.formatSeed(r) + '\n'); });
  console.log(GL.Headless.formatSummary(results));
  console.log('(finished in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s of real time)');
}

// Load the simulation scripts listed in headless.html, as classic scripts, the way a browser does.
// (They run in this process's own global scope: a separate vm sandbox makes them about 4x slower.)
function load(sets) {
  var html = fs.readFileSync(path.join(__dirname, 'headless.html'), 'utf8');
  var srcs = [], re = /<script\s+src="([^"]+)"/g, m;
  while ((m = re.exec(html))) srcs.push(m[1]);
  srcs.forEach(function (src) {
    var file = path.join(__dirname, src);
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
    if (/config\.js$/.test(src)) applySets(globalThis.GL.Config, sets);
  });
  return globalThis.GL;
}

function applySets(config, sets) {
  sets.forEach(function (s) {
    var eq = s.indexOf('='), key = s.slice(0, eq), value = s.slice(eq + 1);
    var parts = key.split('.'), obj = config;
    for (var i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    var last = parts[parts.length - 1];
    if (!(last in obj)) { console.error('Unknown config number: ' + key); process.exit(1); }
    obj[last] = value === 'true' ? true : value === 'false' ? false : Number(value);
  });
}

function parseArgs(argv) {
  var a = { seeds: [1, 2, 3], minutes: 10, sets: [], summary: false, json: false };
  for (var i = 0; i < argv.length; i++) {
    var k = argv[i];
    if (k === '--seeds') a.seeds = argv[++i].split(',').map(Number);
    else if (k === '--minutes') a.minutes = Number(argv[++i]);
    else if (k === '--set') a.sets.push(argv[++i]);
    else if (k === '--summary') a.summary = true;
    else if (k === '--json') a.json = true;
    else if (k === '--one') a.one = Number(argv[++i]);
    else if (k === '--cap') a.cap = Number(argv[++i]);
  }
  return a;
}
