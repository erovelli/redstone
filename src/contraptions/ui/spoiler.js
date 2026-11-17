// UI contraption for <rs-spoiler>: the collapse curtain (see collapse.js) with a stone pressure plate in place
// of the lever. Standing on the plate strongly powers the block under it, the torch on that block's back goes
// out, the dust on the piston row goes dark and every column of the curtain is pulled back into the wall.
// Stepping off releases the plate at its next check (up to 10 ticks), and the curtain returns 2 ticks later.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);
// Resolved when a builder runs, not at load time (files in a directory must not depend on load order).
const curtain = () => (N ? require('./collapse.js') : window.RSCurtain);

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildSpoiler(p = {}) {
  const C = curtain();
  const cols = int(p.cols, 1, C.MAX_COLS, 6);
  const rows = int(p.rows, 1, C.MAX_ROWS, 1);
  const w = new RS.World({ strict: true });
  const c = C.addCurtain(w, { cols, rows, signs: 0, open: false, trigger: 'plate' });
  w.seal();
  return {
    world: w,
    box: [0, cols + 1, -1, 1, c.zb - 1, 2],
    opening: c.opening,
    io: { plate: c.trigger, torch: c.torch, pistons: c.pistons, covers: c.covers },
  };
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const open = c => curtain().isOpen(c.world, c.opening);
const home = c => curtain().isHome(c.world, c.opening);

const entry = Catalogue.register({
  id: 'ui-spoiler',
  name: 'Spoiler',
  category: 'Disclosure and overlays',
  summary: 'Standing on a pressure plate turns off a wall torch; the dust on the piston row goes dark and the sticky pistons pull the honey and slime curtain back into the wall. Step off and the plate releases at its next check; the curtain comes back.',
  strict: true,
  deviations: [],
  inputs: ['stone pressure plate'],
  outputs: ['opening clear', 'curtain home'],
  actions: ['stand on the plate', 'step off the plate'],
  timing: 'Opening clear 3 ticks after stepping on (the plate presses, the torch flips, the pistons pull); the plate releases up to 10 ticks after stepping off (it checks every 10 ticks while pressed), and the curtain is home 2 ticks after that.',
  notes: [
    'The same curtain as the collapse: one sticky piston per column of honey or slime, at most 12 rows, at most 15 columns.',
    'The plate strongly powers the stone it stands on; the torch hangs on that stone\'s back face.',
  ],
  params: [
    { key: 'cols', label: 'Columns', min: 1, max: 15, def: 6 },
    { key: 'rows', label: 'Rows', min: 1, max: 12, def: 1 },
  ],
  controls: [{ kind: 'plate', io: 'plate', label: 'Stand on the plate' }],
  build: buildSpoiler,
  tests: [
    T('stepping on clears the opening in 3 ticks; stepping off closes it within 12 (every edge)', () => each(entry, p => {
      const t = ui().testing, c = buildSpoiler(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      if (!home(c)) return false;
      hand.step(c.io.plate, true);
      const on = t.ticksUntil(w, () => open(c), 20);
      w.run(5);
      if (!open(c)) return false;
      hand.step(c.io.plate, false);
      const off = t.ticksUntil(w, () => home(c), 30);
      return on === 3 && off >= 2 && off <= 12;
    })),
    T('a full step on / step off cycle returns every block to its start, twice', () => each(entry, p => {
      const t = ui().testing, c = buildSpoiler(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      const h0 = t.hash(w);
      for (let k = 0; k < 2; k++) {
        hand.step(c.io.plate, true);
        t.settle(w);
        hand.step(c.io.plate, false);
        t.settle(w);
      }
      return t.hash(w) === h0;
    })),
    T('the built steady state does not drift for 100 ticks', () => each(entry, p => ui().testing.noDrift(buildSpoiler(p).world, 100))),
    T('push limit by construction: each piston moves exactly its own column, both ways', () => each(entry, p => {
      const moves = curtain().pushCounts(buildSpoiler, p, (c, w, hand) => {
        hand.step(c.io.plate, true);
        w.settle();
        hand.step(c.io.plate, false);
        w.settle();
      });
      return moves.length === 2 * int(p.cols, 1, 15, 6) && moves.every(n => n === int(p.rows, 1, 12, 1));
    })),
    T('strict: real blocks only, no wiring links, one piston per column', () => each(entry, p => {
      const c = buildSpoiler(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === int(p.cols, 1, 15, 6);
    })),
  ],
});

if (N) module.exports = { buildSpoiler, entry };
else window.buildSpoiler = buildSpoiler;
})();
