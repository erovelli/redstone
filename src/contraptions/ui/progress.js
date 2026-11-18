// UI contraption for <rs-progress>: a barrel, a comparator and a line of redstone lamps with dust on top.
// The comparator reads how full the barrel is (0 to 15) and the dust carries that strength along the lamps,
// losing one per block, so exactly `level` lamps are lit. Behind the lamps a torch clock feeds a repeater
// chain (repeater, block, repeater, block, ...): each block it powers lights the lamp in front of it, so a band
// of light runs along the bar. A lever on the clock holds it stopped; the bar is indeterminate while it runs.
//
//   front row (y = 0)                                  back row (y = -1)
//     z=1  [lever] [barrel] [comparator] dust dust x steps      [X] [R0 <-] [S1]
//     z=0  planks  planks   planks       stone lamp x steps    dust [A] [torch] R B R B ...
//     z=-1 floor ------------------------------------      floor -------------------
//   The clock: torch -> S1 (the block above it) -> repeater R0 -> X -> the dust under X -> A, the torch's block.
//   The lever on X keeps X powered, so A stays powered and the torch stays off.
//   The pause lever on top of S1 (z = 2) holds S1 powered, so R0, X and A stay powered and the torch stays off:
//   the clock stands still with the bar dark while the bar is still indeterminate (reduced motion).
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const FLOOR = 'smooth_stone';
const CLOCK_DELAY = 3;    // R0: the torch is on for 4 ticks, off for 4
const CHAIN_DELAY = 2;    // each chain repeater: the band moves one lamp pair every 2 ticks

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};
const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));

// The comparator level for a value: value / max of the way along `steps` lamps, rounded to the nearest lamp.
function levelFor(value, max, steps) {
  const v = num(value), m = num(max) > 0 ? num(max) : 100;
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(steps, Math.round((steps * v) / m)));
}

function buildProgress(p = {}) {
  const steps = int(p.steps, 5, 15, 10);
  const max = num(p.max) > 0 ? num(p.max) : 100;
  const level = levelFor(p.value, max, steps);
  const running = level === null;          // no value: indeterminate, the clock runs
  const paused = running && (p.paused === true || p.paused === 'true');   // indeterminate, clock held still
  const w = new RS.World({ strict: true });
  const L0 = 4;                             // the first lamp's column; the dust starts one block earlier
  const xEnd = L0 + steps - 1;
  for (let x = 0; x <= xEnd; x++) {
    w.put(x, 0, -1, FLOOR);
    w.put(x, -1, -1, FLOOR);
  }
  // Front row: the lever, the barrel and the comparator on planks, then the lamps with dust on top.
  w.put(0, 0, 0, 'planks');
  w.put(1, 0, 0, 'planks');
  w.put(2, 0, 0, 'planks');
  // The dust starts on a stone block: a block under dust is powered and lights the lamp beside it, and so does
  // every lamp under dust, so with the extra block a strength s lights exactly s lamps.
  w.put(3, 0, 0, 'stone');
  const lead = w.put(3, 0, 1, 'dust', { lvl: 0 });
  const fill = running ? 0 : level;
  lead.lvl = fill;
  // The stacks a player's hand.fill(barrel, fill) leaves, so a later fill back to this level restores the hash.
  const barrel = w.put(1, 0, 1, 'barrel', { d: 'U', fill, items: w._itemsForLevel(27, fill, 'stone') });
  const comparator = w.put(2, 0, 1, 'comparator', { d: 'E', mode: 'cmp', out: fill });
  const lamps = [], dust = [];
  for (let i = 0; i < steps; i++) {
    const x = L0 + i;
    lamps.push(w.put(x, 0, 0, 'lamp', { lit: !running && i < fill }));
    dust.push(w.put(x, 0, 1, 'dust', { lvl: running ? 0 : Math.max(0, fill - 1 - i) }));
  }
  // Back row: the clock and its stop lever.
  const X = w.put(0, -1, 1, 'stone');
  const lever = w.put(0, 0, 1, 'lever', { att: 'N', on: !running });
  w.put(0, -1, 0, 'dust', { lvl: running && !paused ? 0 : 15 });
  w.put(1, -1, 0, 'stone');                                   // A: the torch's block
  const r0 = w.put(1, -1, 1, 'repeater', { d: 'W', delay: CLOCK_DELAY, on: paused });
  const torch = w.put(2, -1, 0, 'torch', { att: 'W', lit: false });
  w.put(2, -1, 1, 'stone');                                   // S1: powered by the torch below it
  const pause = w.put(2, -1, 2, 'lever', { att: 'D', on: paused });   // on S1: holds the clock still
  // The chase chain: a repeater behind every odd lamp, a block behind every even one.
  const chain = [];
  for (let x = 3; x <= xEnd; x++) {
    const repeater = (x - 3) % 2 === 0;
    chain.push(repeater ? w.put(x, -1, 0, 'repeater', { d: 'E', delay: CHAIN_DELAY, on: false }) : w.put(x, -1, 0, 'stone'));
  }
  w.seal();
  return {
    world: w,
    box: [0, xEnd, -1, 0, -1, 2],
    steps, max,
    io: { lever, pause, barrel, comparator, lamps, dust, torch, clock: r0, chain, stop: X },
  };
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const litCount = io => io.lamps.filter(l => l.lit).length;

const entry = Catalogue.register({
  id: 'ui-progress',
  name: 'Progress bar',
  category: 'Feedback',
  summary: 'A comparator reads how full a barrel is and a dust line on top of a row of lamps carries that strength: one lamp per level. Without a value a torch clock behind the lamps sends a band of light along a repeater chain.',
  strict: true,
  deviations: [],
  inputs: ['items in the barrel', 'the clock lever', 'the pause lever'],
  outputs: ['comparator strength (lamps lit)', 'the chase (clock running)'],
  actions: ['put items into or take them out of the barrel', 'flip the clock lever', 'flip the pause lever'],
  timing: 'The comparator follows the barrel within 2 ticks of a change; the last lamp lights in the same tick and goes dark within 2 more. The chase runs at 2 ticks per lamp pair; the clock period is 8 ticks.',
  notes: [
    'Resolution: value / max is rounded to the nearest of `steps` lamps (5 to 15, default 10). The comparator level is that lamp count, so a step is max / steps.',
    'Dust loses one level per block. A block under dust is powered and lights the redstone lamps beside it, so each lit lamp under the line also lights the next one; the line therefore starts on a stone block, and a strength s lights exactly the first s lamps.',
    'The chase lights every second lamp, starting with the first: the lamps in front of the chain blocks, which the repeaters strongly power.',
    'The torch is off for 4 ticks of every 8, well inside the burnout limit (8 turn-offs in 30 ticks).',
    'The element builds with { value, max } from its attributes (no value: the clock runs) and then sets the value with the hand.',
    'Reduced motion: an indeterminate bar is built with { paused: true } (and set so with the hand): the pause lever on top of S1 holds the clock still with every lamp dark, a steady state, like rs-spinner\'s still ring. The bar stays indeterminate: the clock lever is off.',
  ],
  params: [
    { key: 'steps', label: 'Lamps', min: 5, max: 15, def: 10 },
  ],
  controls: [
    { kind: 'action', label: 'Fill the barrel by one level', fn: built => built.world.hand.fill(built.io.barrel, Math.min(15, (built.io.barrel.fill || 0) + 1)) },
    { kind: 'lever', io: 'lever', label: 'Clock stop lever' },
    { kind: 'lever', io: 'pause', label: 'Pause lever' },
  ],
  build: buildProgress,
  tests: [
    T('every fill level lights exactly that many lamps within 2 ticks (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildProgress(Object.assign({ value: 0 }, p)), w = c.world, hand = t.hand(w);
      for (let level = 0; level <= c.steps; level++) {
        hand.fill(c.io.barrel, level);
        if (t.ticksUntil(w, () => c.io.comparator.out === level && litCount(c.io) >= level, 4) > 2) return false;
        t.settle(w);
        if (litCount(c.io) !== level) return false;
      }
      return true;
    })),
    T('value / max maps to the nearest lamp', () => {
      const ok = [[0, 100, 10, 0], [5, 100, 10, 1], [4, 100, 10, 0], [7, 15, 15, 7], [42, 100, 15, 6], [100, 100, 10, 10], [250, 100, 10, 10], [-3, 100, 10, 0]];
      return ok.every(([v, m, s, l]) => levelFor(v, m, s) === l) && levelFor(null, 100, 10) === null && levelFor('', 100, 10) === null;
    }),
    T('built with a value, the steady state does not drift for 100 ticks', () => each(entry, p => [0, 3, 100].every(value => {
      const c = buildProgress(Object.assign({}, p, { value, max: 100 }));
      return ui().testing.noDrift(c.world, 100) && litCount(c.io) === levelFor(value, 100, c.steps);
    }))),
    T('without a value the clock runs: lamps in front of the chain blocks light in turn and never all at once', () => each(entry, p => {
      const c = buildProgress(p), w = c.world;
      const seen = new Set();
      let maxLit = 0;
      for (let i = 0; i < 80; i++) {
        w.tick();
        c.io.lamps.forEach((l, k) => { if (l.lit) seen.add(k); });
        maxLit = Math.max(maxLit, litCount(c.io));
      }
      const chained = c.io.lamps.map((l, k) => k).filter(k => k % 2 === 0);
      return chained.every(k => seen.has(k)) && [...seen].every(k => k % 2 === 0) && maxLit < c.steps && !w.quiet;
    })),
    T('the clock period is 8 ticks and the torch never burns out', () => {
      const c = buildProgress({}), w = c.world;
      let rises = 0, was = c.io.torch.lit, first = -1, second = -1;
      for (let i = 1; i <= 200; i++) {
        w.tick();
        if (c.io.torch.lit && !was) { rises++; if (rises === 3) first = i; if (rises === 4) second = i; }
        was = c.io.torch.lit;
      }
      return second - first === 8 && rises >= 24;
    }),
    T('flipping the lever stops the clock and the bar settles dark; flipping it back starts it', () => {
      const t = ui().testing, c = buildProgress({}), w = c.world, hand = t.hand(w);
      w.run(13);
      hand.flip(c.io.lever);
      t.settle(w);
      const stopped = litCount(c.io) === 0 && !c.io.torch.lit;
      hand.flip(c.io.lever);
      w.run(30);
      return stopped && !w.quiet;
    }),
    T('a full cycle (fill, empty, run the clock, stop it) returns every block to its start', () => each(entry, p => {
      const t = ui().testing, c = buildProgress(Object.assign({ value: 0 }, p)), w = c.world, hand = t.hand(w);
      t.settle(w);
      const h0 = t.hash(w);
      hand.fill(c.io.barrel, c.steps);
      t.settle(w);
      hand.fill(c.io.barrel, 0);
      t.settle(w);
      hand.flip(c.io.lever);
      w.run(37);
      hand.flip(c.io.lever);
      t.settle(w);
      return t.hash(w) === h0;
    })),
    T('paused (reduced motion): built indeterminate and still, steady, all dark; the pause lever starts and stops the clock', () => each(entry, p => {
      const t = ui().testing, c = buildProgress(Object.assign({}, p, { paused: true })), w = c.world, hand = t.hand(w);
      w.assertSteady(100);
      if (litCount(c.io) !== 0 || c.io.lever.on || !c.io.pause.on) return false;
      hand.flip(c.io.pause);
      w.run(40);
      const runs = !w.quiet;
      hand.flip(c.io.pause);
      t.settle(w);
      const h = t.hash(w);
      return runs && litCount(c.io) === 0 && h === t.hash(buildProgress(Object.assign({}, p, { paused: true })).world);
    })),
    T('strict, and no pistons', () => each(entry, p => ui().testing.strictWorld(buildProgress(p).world, RS) && ui().testing.pistonCount(buildProgress(p).world) === 0)),
  ],
});

if (N) module.exports = { buildProgress, levelFor, entry };
else window.buildProgress = buildProgress;
})();
