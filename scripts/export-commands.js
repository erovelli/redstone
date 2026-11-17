#!/usr/bin/env node
// node scripts/export-commands.js <entry-id> [--origin X,Y,Z] [--param key=value ...] [--no-clear]
// Prints a Minecraft Java 1.21 .mcfunction that rebuilds a catalogue entry (built with its default parameters).
// Without --origin the commands use relative (~) coordinates, so run the function where the build should start.
const path = require('path');
const Catalogue = require(path.join(__dirname, '..', 'src', 'index.js'));

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: node scripts/export-commands.js <entry-id> [--origin X,Y,Z] [--param key=value ...] [--no-clear]');
  console.error('entries: ' + Catalogue.entries.map(e => e.id).join(', '));
  process.exit(1);
}

function parseArgs(argv) {
  const out = { id: null, origin: null, params: {}, clear: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--origin') {
      const v = (argv[++i] || '').split(',').map(Number);
      if (v.length !== 3 || !v.every(Number.isFinite)) usage('--origin needs X,Y,Z');
      out.origin = v;
    } else if (a === '--param') {
      const [k, v] = (argv[++i] || '').split('=');
      if (!k || v === undefined) usage('--param needs key=value');
      out.params[k] = isNaN(Number(v)) ? v : Number(v);
    } else if (a === '--no-clear') out.clear = false;
    else if (!out.id) out.id = a;
    else usage(`unexpected argument ${a}`);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.id) usage();
const entry = Catalogue.get(args.id);
if (!entry) usage(`no catalogue entry '${args.id}'`);
const built = entry.build(Object.assign(Catalogue.defaults(entry), args.params));
const world = built.world;
const lines = [
  `# ${entry.name} (${entry.id}), exported by redstone scripts/export-commands.js for Minecraft Java 1.21`,
  `# Engine x east, y south, z up -> Minecraft x, z, y.${args.origin ? ` Origin ${args.origin.join(' ')}.` : ' Relative to where the function runs.'}`,
];
if (!world.strict) lines.push('# Legacy (non-strict) contraption: it may rely on wiring links or invented blocks that do not exist in the game.');
if (world.floor && world.floor.length) lines.push(`# ${world.floor.length} wiring link(s) are not exported: they are not redstone.`);
for (const c of world.toCommands({ origin: args.origin, clear: args.clear })) lines.push(c);
process.stdout.write(lines.join('\n') + '\n');
