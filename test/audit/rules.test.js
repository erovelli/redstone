// The rules audit (scripts/audit-rules.js) as a suite: the static scan has only reviewed hits, and every UI entry,
// driven through its element's controls and states on an instrumented world, is changed only by the engine and
// world.hand, and (strict entries) builds a steady state or a running clock.
const audit = require('../../scripts/audit-rules.js');
const C = require('../../src/index.js');

const T = (name, fn) => ({ name, fn });
let cached = null;
const results = () => cached || (cached = audit.dynamicAudit());

const tests = [
  T('static scan: no unreviewed code that drives a sealed world', () => {
    const bad = audit.staticScan().filter(h => !h.reviewed);
    if (bad.length) throw new Error(bad.map(h => `${h.file}:${h.line} ${h.what}`).join('; '));
    return true;
  }),
  T('the probe sees a direct block write, a world mutation and a tick from element code', () => {
    const built = C.get('ui-toggle').build({});
    const probe = audit.makeProbe();
    audit.instrument(built.world, probe);
    built.world.hand.flip(built.io.lever);          // a player action: allowed
    built.world.settle();                           // the engine: allowed
    probe.during('test', () => {
      built.io.lamp.lit = !built.io.lamp.lit;        // drives the world: recorded
      try { built.world.put(9, 9, 9, 'stone'); } catch (e) { /* sealed: it throws as well */ }
      built.world.tick();
    });
    const kinds = probe.found.map(f => f.kind);
    return kinds.includes('state-write') && kinds.includes('world-mutation') && kinds.includes('world-time') && probe.found.length === 3;
  }),
];
for (const id of C.entries.filter(e => e.id.startsWith('ui-')).map(e => e.id)) {
  tests.push(T(`${id}: only world.hand changes the sealed world; steady (or a clock) at every parameter edge`, () => {
    const r = results().find(x => x.id === id);
    if (!r) throw new Error('not audited');
    if (r.problems.length) throw new Error(r.problems.join('; '));
    return true;
  }));
}

module.exports = { suite: 'rules audit', tests };
