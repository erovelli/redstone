// Rules audit (docs/SPEC.md section 3, R1 to R6) for every <rs-*> component and its catalogue entry.
//
//   node scripts/audit-rules.js            prints the findings, exits 1 if any rule is broken
//   require('./scripts/audit-rules.js')    { run, staticScan, dynamicAudit } for the test suite (test/audit)
//
// Two parts:
//  1. A static scan of src/ui/components/*.js and src/contraptions/ui/*.js for code that drives a sealed world
//     instead of performing a player action: writes to block state, world.put/set/shift/at/spawn, ticking or
//     settling from element code, timers, private core members, wiring links, fake blocks, `buried`.
//     Every hit must be on the reviewed list below, with the reason it is not a violation.
//  2. A dynamic audit. Every entry is built at every parameter edge; its sealed world is instrumented so that
//     every write to a block field is recorded unless the engine itself or world.hand is running
//     (world._inside > 0), and every world.tick() made from element code is recorded. Then each element that
//     uses the entry is driven headlessly through all its controls and every writable state. Strict entries
//     must also pass assertSteady (or, for a clock, come back to the built state), and the instrumented world
//     must hash the same as an uninstrumented twin driven the same way (the probe does not change behaviour).
(function () {
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'src', 'index.js'));
const ui = require(path.join(ROOT, 'src', 'ui', 'core.js'));
const RS = require(path.join(ROOT, 'src', 'engine.js'));

/* ---------- 1. static scan ---------- */

// Patterns that drive a sealed world. `where` limits a pattern to element files, contraption files or both.
const PATTERNS = [
  { id: 'state-write', where: 'element', re: /\.(on|lit|ext|lvl|out|open|powered|locked|delay|mode|note|page|pages|fill|items|text|popped|level|inverted|ringing|sky|d|s|att)\s*=(?!=)/, what: 'writes block state' },
  { id: 'world-mutation', where: 'element', re: /\b(world|w|built\.world|b\.world)\.(put|set|shift|at|spawn|vibrate|extend|retract)\(/, what: 'mutates the world directly' },
  { id: 'world-time', where: 'element', re: /\b(world|w|built\.world|b\.world)\.(tick|run|settle)\(/, what: 'runs the world from element code' },
  { id: 'timer', where: 'element', re: /\b(setTimeout|setInterval)\(/, what: 'a JavaScript timer (R4)' },
  { id: 'private-core', where: 'element', re: /\b(el|this)\._(ctl|activate|box|stage|view|awake|apply|layout|controls|request|tick)\b/, what: 'uses a private core member' },
  { id: 'engine-backdoor', where: 'both', re: /_inside|_emitting|_adopt\(|_quiet\s*=/, what: 'touches an engine internal' },
  { id: 'wiring-link', where: 'both', re: /\.floor\.push|\bfeed\s*:/, what: 'a wiring link (R2)' },
  { id: 'fake-block', where: 'both', re: /(?<!kind:\s?)'(wall|wallb|ground)'/, what: 'a fake block (R1)' },
  { id: 'buried', where: 'both', re: /\bburied\b|\bskip\s*:/, what: 'hides a block by fiat (R6)' },
];

// Reviewed hits: file, the pattern id, a substring of the line, and why it is not a rule violation.
const REVIEWED = [
  { file: 'src/ui/components/accordion.js', id: 'state-write', text: 'd.open = open', why: 'a <details> element in the light DOM mirrors the machine; not a block' },
  { file: 'src/ui/components/toast.js', id: 'state-write', text: 'this.open = ', why: 'the element\'s own `open` property: its setter presses the show or dismiss button' },
  { file: 'src/ui/components/toast.js', id: 'state-write', text: 'el.open = true', why: 'the element\'s own `open` property (<rs-toast open>): its setter presses the show button' },
  { file: 'src/ui/components/theme.js', id: 'state-write', text: 'built.world.sky = ', why: 'ui-theme-auto: the sky light is the environment, declared as a deviation (strict: false)' },
];

function staticScan() {
  const files = [];
  for (const [dir, kind] of [['src/ui/components', 'element'], ['src/contraptions/ui', 'contraption']]) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter(n => n.endsWith('.js')).sort()) files.push({ file: `${dir}/${f}`, kind });
  }
  const hits = [];
  for (const { file, kind } of files) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      for (const p of PATTERNS) {
        if (p.where !== 'both' && p.where !== kind) continue;
        if (!p.re.test(code)) continue;
        const ok = REVIEWED.find(r => r.file === file && r.id === p.id && line.includes(r.text));
        hits.push({ file, line: i + 1, id: p.id, what: p.what, code: line.trim(), reviewed: ok ? ok.why : null });
      }
    });
  }
  return hits;
}

/* ---------- 2. dynamic audit ---------- */

// Block fields an element might be tempted to write. Fields a block already has are watched as well.
const FIELDS = ['on', 'lit', 'ext', 'lvl', 'out', 'open', 'powered', 'locked', 'delay', 'mode', 'note', 'page', 'pages',
  'fill', 'items', 'text', 'popped', 'level', 'inverted', 'ringing', 'state', 'd', 's', 'att', 'half', 'slots', 'rot', 'item'];

// The probe: watch every block of a sealed world. log(kind, detail) records a violation.
function instrument(world, probe) {
  const watched = new WeakSet();
  const watch = b => {
    if (!b || typeof b !== 'object' || watched.has(b)) return;
    watched.add(b);
    for (const k of new Set(Object.keys(b).concat(FIELDS))) {
      if (k === 't' || k[0] === '_') continue;
      let v = b[k];
      Object.defineProperty(b, k, {
        configurable: true,
        enumerable: true,
        get: () => v,
        set: nv => {
          if (world.sealed && world._inside === 0 && !Object.is(v, nv)) {
            probe.log('state-write', `${b.t}.${k} = ${JSON.stringify(nv)} at (${b.x},${b.y},${b.z})${probe.where()}`);
          }
          v = nv;
        },
      });
    }
  };
  for (const b of world.c.values()) watch(b);
  const set = world.c.set.bind(world.c);
  world.c.set = (k, b) => { watch(b); return set(k, b); };
  for (const m of ['put', 'set', 'shift', 'at', 'spawn', 'vibrate', 'extend', 'retract']) {
    const fn = world[m].bind(world);
    world[m] = (...a) => {
      if (world.sealed && world._inside === 0) probe.log('world-mutation', `world.${m}()${probe.where()}`);
      return fn(...a);
    };
  }
  const tick = world.tick.bind(world);
  world.tick = () => {
    if (probe.spec) probe.log('world-time', `world.tick() from ${probe.spec}`);
    return tick();
  };
  const sky = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(world), 'sky');
  Object.defineProperty(world, 'sky', {
    configurable: true,
    get: () => sky.get.call(world),
    set: v => { probe.log('environment', `world.sky = ${v}${probe.where()}`); sky.set.call(world, v); },
  });
  return world;
}

function makeProbe() {
  const probe = {
    spec: null,
    found: [],
    where: () => (probe.spec ? ` from ${probe.spec}` : ''),
    log: (kind, detail) => { if (probe.found.length < 50) probe.found.push({ kind, detail }); },
    during(label, fn) {
      const prev = probe.spec;
      probe.spec = label;
      try { return fn(); } finally { probe.spec = prev; }
    },
  };
  return probe;
}

// Every element spec, by catalogue entry id.
function loadSpecs() {
  const dir = path.join(ROOT, 'src', 'ui', 'components');
  const out = [];
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js')).sort()) {
    const file = path.join(dir, f);
    const prev = global.Redstone;
    global.Redstone = { ui: { define: (tag, spec) => { out.push({ tag, spec, file: `src/ui/components/${f}` }); return class {}; } } };
    try {
      delete require.cache[require.resolve(file)];
      require(file);
    } finally {
      global.Redstone = prev;
    }
  }
  return out;
}

// The entries an element can build: a string id, or a function of the element (rs-theme: auto or not).
function entriesOf(spec) {
  if (typeof spec.entry === 'string') return [{ id: spec.entry, attrs: {} }];
  if (typeof spec.entry === 'function') {
    const ids = new Map();
    for (const attrs of [{}, { auto: '' }]) {
      const el = { hasAttribute: n => n in attrs, getAttribute: n => (n in attrs ? attrs[n] : null) };
      const id = spec.entry(el);
      if (typeof id === 'string' && !ids.has(id)) ids.set(id, attrs);
    }
    return [...ids].map(([id, attrs]) => ({ id, attrs }));
  }
  return [];
}

// A controller whose spec calls (controls, state setters and readers) are labelled for the probe.
function auditedController(spec, entry, probe, tag) {
  const ctl = new ui.Controller(spec, entry);
  const act = ctl.act.bind(ctl), request = ctl.request.bind(ctl), read = ctl.read.bind(ctl);
  ctl.act = (control, key) => probe.during(`${tag} control ${control.io || 'custom'}`, () => act(control, key));
  ctl.request = (key, value) => probe.during(`${tag} set ${key}`, () => request(key, value));
  ctl.read = () => probe.during(`${tag} read`, () => read());
  return ctl;
}

// Values to ask a writable state for, from its current value and the built machine.
function valuesFor(st, value, built) {
  if (typeof value === 'boolean') return [!value, value];
  if (typeof value === 'number' || st.type === 'number') return [1, 0, 3, value].filter(v => v !== null && v !== undefined);
  const vals = (built && built.values) || [];
  return vals.length ? vals.concat([value]) : ['audit', value === undefined || value === null ? '' : value];
}

// Drive one element through every control and every writable state. `twin` is driven the same way without the probe.
function drive(ctl, twin, spec) {
  const steps = [];
  for (const c of spec.controls || []) {
    if (c.io && !ctl.io[c.io] && typeof c.act !== 'function') continue;
    steps.push(k => k.act(c));
    if (c.hover) {
      steps.push(k => k.act(Object.assign({}, c, { act: c.hover.enter })));
      steps.push(k => k.act(Object.assign({}, c, { act: c.hover.leave })));
    }
    for (const [key, keyAct] of Object.entries(c.keys || {})) steps.push(k => k.act(Object.assign({}, c, { act: keyAct }), key));
  }
  for (const [key, st] of Object.entries(spec.state || {})) {
    if (typeof st.set !== 'function') continue;
    for (const v of valuesFor(st, ctl.state[key], ctl.built)) steps.push(k => k.request(key, v));
  }
  for (const step of steps) {
    for (const k of [ctl, twin]) {
      try { step(k); } catch (e) { /* a refused action is the machine's answer */ }
      k.settle(1200);
    }
  }
  return steps.length;
}

// A strict build must be steady, or (a running clock) come back to its built state: build() makes a fresh world.
function steadyOrPeriodic(build) {
  try {
    build().world.assertSteady(100);
    return { ok: true, kind: 'steady' };
  } catch (e) {
    // A clock: the hash sequence repeats. The hash leaves out pending events, so a repeat of the built state
    // itself is not enough; look for a repeated run of states.
    const w = build().world, seq = [w.hash()];
    for (let i = 1; i <= 800; i++) {
      w.tick();
      seq.push(w.hash());
    }
    for (let period = 1; period <= 400; period++) {
      const tail = seq.slice(-2 * period);
      if (tail.slice(0, period).join() !== tail.slice(period).join()) continue;
      if (new Set(tail).size < 2) break;   // a fixed point that assertSteady refused: not a clock
      const onCycle = tail.includes(seq[0]);
      return { ok: true, kind: `a running clock (period ${period} ticks${onCycle ? '' : '; it starts from a placement state just off its cycle'})` };
    }
    return { ok: false, kind: String(e.message || e) };
  }
}

// The workbench controls of an entry: the player actions it lists, as world.hand calls (or its own action).
function entryActions(entry, built) {
  const out = [];
  for (const c of entry.controls || []) {
    const b = c.io ? built.io[c.io] : null;
    const list = (Array.isArray(b) ? b : [b]).filter(Boolean);
    if (c.kind === 'lever') for (const x of list) out.push(h => h.flip(x));
    else if (c.kind === 'button') for (const x of list) out.push(h => h.press(x));
    else if (c.kind === 'plate') for (const x of list) out.push(h => h.step(x, !x._player));
    else if (c.kind === 'action' && typeof c.fn === 'function') out.push(() => c.fn(built));
  }
  return out;
}

function dynamicAudit() {
  const specs = loadSpecs();
  const byEntry = new Map();
  for (const s of specs) for (const { id, attrs } of entriesOf(s.spec)) {
    if (!byEntry.has(id)) byEntry.set(id, []);
    byEntry.get(id).push(Object.assign({ attrs }, s));
  }
  const results = [];
  for (const entry of C.entries.filter(e => e.id.startsWith('ui-'))) {
    const r = { id: entry.id, strict: entry.strict === true, deviations: entry.deviations || [], tags: [], problems: [], notes: [], steps: 0 };
    // Every parameter edge: a strict, sealed world in its steady state.
    for (const p of ui.testing.edges(entry)) {
      let built;
      try { built = entry.build(p); } catch (e) { r.problems.push(`build ${JSON.stringify(p)}: ${e.message}`); continue; }
      const w = built.world;
      if (r.strict && !(w.strict && w.sealed)) r.problems.push(`build ${JSON.stringify(p)}: not a sealed strict world`);
      if (r.strict) {
        try { ui.testing.strictWorld(w, RS); } catch (e) { r.problems.push(`build ${JSON.stringify(p)}: ${e.message}`); }
        const s = steadyOrPeriodic(() => entry.build(p));
        if (!s.ok) r.problems.push(`build ${JSON.stringify(p)}: ${s.kind}`);
        else if (s.kind !== 'steady') r.notes.push(`${JSON.stringify(p)}: ${s.kind}`);
      }
    }
    // The entry's own player actions (the workbench controls), on an instrumented world.
    {
      const probe = makeProbe(), built = entry.build(ui.testing.edges(entry)[0] || {});
      instrument(built.world, probe);
      for (const act of entryActions(entry, built)) {
        probe.during(`${entry.id} workbench control`, () => { try { act(built.world.hand); } catch (e) { /* refused */ } });
        try { built.world.settle(1200); } catch (e) { /* a clock */ }
        r.steps++;
      }
      for (const f of probe.found) r.problems.push(`${f.kind}: ${f.detail}`);
    }
    // Every element that builds this entry, driven through its controls and writable states.
    for (const s of byEntry.get(entry.id) || []) {
      r.tags.push(s.tag);
      const probe = makeProbe();
      const ctx = { el: null, B: 24, text: 'Label', signsFor: (t, o) => ui.signsFor(t, o) };
      const attr = n => (n in s.attrs ? s.attrs[n] : null);
      const params = ui.paramsFor(entry, s.spec, attr, ctx);
      const ctl = auditedController(s.spec, entry, probe, s.tag);
      const twin = new ui.Controller(s.spec, entry);
      try {
        twin.build(params);
        ctl.built = entry.build(params);
        instrument(ctl.world, probe);
        ctl.params = params;
        try { ctl.world.settle(400); } catch (e) { /* a running clock */ }
        ctl.state = ctl.read();
        r.steps += drive(ctl, twin, s.spec);
      } catch (e) {
        r.problems.push(`${s.tag}: ${e.message}`);
        continue;
      }
      if (ctl.world.hash() !== twin.world.hash()) r.problems.push(`${s.tag}: the instrumented world drifted from its twin (the probe changed behaviour)`);
      for (const f of probe.found) {
        const allowed = (ALLOWED[entry.id] || []).find(a => a.kind === f.kind);
        if (allowed) r.notes.push(`${f.kind}: ${f.detail} (reviewed: ${allowed.why})`);
        else r.problems.push(`${f.kind}: ${f.detail}`);
      }
    }
    // Dedupe the notes the probe repeats on every step.
    r.notes = [...new Set(r.notes)];
    results.push(r);
  }
  return results;
}

// Reviewed dynamic findings, by entry: each must also be documented in that entry (notes or deviations).
const ALLOWED = {
  // The slider's hand moves one item at a time and waits for the comparator after each: separate player actions,
  // each applied to a quiet world (documented in the entry's notes).
  'ui-slider': [{ kind: 'world-time', why: 'the player waits between items: each item is a separate action on a quiet world (entry notes)' }],
  // rs-select's page request turns the page, waits, then presses the button: separate actions on a quiet world.
  'ui-select': [{ kind: 'world-time', why: 'a page request turns the page, waits for the list, then presses the button (entry notes)' }],
  'ui-theme-auto': [{ kind: 'environment', why: 'the sky light is the environment; declared in deviations (strict: false)' }],
};

function run() {
  const hits = staticScan();
  const entries = dynamicAudit();
  const staticProblems = hits.filter(h => !h.reviewed);
  return { hits, staticProblems, entries, ok: !staticProblems.length && entries.every(e => !e.problems.length) };
}

module.exports = { run, staticScan, dynamicAudit, instrument, makeProbe, PATTERNS, REVIEWED, ALLOWED };

if (require.main === module) {
  const res = run();
  console.log('Static scan');
  for (const h of res.hits) console.log(`  ${h.reviewed ? 'ok  ' : 'FAIL'} ${h.file}:${h.line} ${h.what}: ${h.code}${h.reviewed ? `\n         reviewed: ${h.reviewed}` : ''}`);
  console.log('\nEntries');
  for (const e of res.entries) {
    console.log(`  ${e.problems.length ? 'FAIL' : 'ok  '} ${e.id} (${e.tags.join(', ') || 'no element'}) strict=${e.strict} steps=${e.steps}`);
    for (const p of e.problems) console.log(`         x ${p}`);
    for (const n of e.notes) console.log(`         - ${n}`);
  }
  console.log(res.ok ? '\nNo rule violations.' : '\nRule violations found.');
  process.exit(res.ok ? 0 : 1);
}
})();
