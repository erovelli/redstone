// UI contraption for <rs-steps>: a stepper or timeline. One redstone lamp per step down a dust line, each lamp lit
// once its step is reached, with the step's label on oak signs beside it.
//
// Timeline (default): a lever into a repeater delay line, as in the legacy delay-line entry. Each stage is a
// repeater (delay 1 to 4) and two dust; a branch off the stage's dust lights its lamp. Flip the lever on and the
// lamps light one after another, a stage delay apart; flip it off and they go out in the same order.
//
// Manual: a counter. A stone button on a dropper holding a book and quill per step (they do not stack); each press
// drops one into a hopper below the line. A comparator reads the hopper: k of its 5 slots full gives 3k. The line
// is all dust, and lamp i hangs off a branch whose dust is 3(i+1) blocks from the comparator, so it is lit
// exactly while k > i. The hopper faces down onto stone and has nothing above it, so it holds its items. Going
// back a step is a player taking one book out of the hopper and putting it back in the dropper.
//
//   plan (z = 0 on a stone floor), step i at row 3i+1:
//     y=-2           [dropper>] hopper                         (manual)
//     y=-1           lever (timeline) | comparator v (manual)
//     y=3i            R_i v (timeline) | dust (manual)          x = 0
//     y=3i+1          dust  dust  lamp  [planks x S]
//     y=3i+2          dust              [signs  x S]
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const MAX = 8;            // timeline steps
const MAX_MANUAL = 5;     // the hopper's five slots
const BOOK = 'writable_book';
const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildSteps(p = {}) {
  const manual = yes(p.manual);
  const n = int(p.steps, 2, manual ? MAX_MANUAL : MAX, 4);
  const delay = int(p.delay, 1, 4, 2);
  const S = int(p.signs, 1, 6, 3);
  const at = manual ? int(p.at, 0, n, 0) : 0;
  const on = !manual && yes(p.on);
  const w = new RS.World({ strict: true });
  const H = 3 * n;
  for (let x = -1; x < 3 + S; x++) for (let y = -2; y < H; y++) w.put(x, y, -1, 'smooth_stone');
  const io = { lamps: [], signs: [], stages: [] };
  if (manual) {
    const slots = [];
    for (let i = 0; i < 9; i++) slots.push(i < n - at ? { id: BOOK, n: 1 } : null);   // one book per step
    io.dropper = w.put(-1, -2, 0, 'dropper', { d: 'E', items: slots });
    io.button = w.put(-1, -2, 1, 'button', { att: 'D', on: false });
    const hs = [];
    for (let i = 0; i < 5; i++) hs.push(i < at ? { id: BOOK, n: 1 } : null);
    io.hopper = w.put(0, -2, 0, 'hopper', { d: 'D', items: hs });
    io.comparator = w.put(0, -1, 0, 'comparator', { d: 'S', mode: 'cmp' });
  } else {
    io.lever = w.put(0, -1, 0, 'lever', { att: 'D', on });
  }
  for (let i = 0; i < n; i++) {
    const y = 3 * i;
    if (manual) w.put(0, y, 0, 'dust');
    else io.stages.push(w.put(0, y, 0, 'repeater', { d: 'S', delay }));
    w.put(0, y + 1, 0, 'dust');
    if (i < n - 1 || manual) w.put(0, y + 2, 0, 'dust');
    w.put(1, y + 1, 0, 'dust');
    io.lamps.push(w.put(2, y + 1, 0, 'lamp'));
    const signs = [];
    for (let x = 3; x < 3 + S; x++) {
      w.put(x, y + 1, 0, 'planks');
      signs.push(w.put(x, y + 2, 0, 'sign', { att: 'N', kind: 'wall', text: '' }));
    }
    io.signs.push(...signs);
    io['label' + i] = signs;
  }
  // The steady state (dust levels, lit lamps, a lever built on) is what the engine settles into.
  w.settle();
  w.seal();
  return { world: w, box: [-1, 2 + S, -2, H - 1, -1, 1], io, manual };
}

// Steps reached: the lit lamps (always a prefix of the list).
const reached = io => io.lamps.filter(l => l.lit).length;

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const prefix = io => io.lamps.every((l, i) => !!l.lit === (i < reached(io)));
// One step back: take a book out of the hopper and put it back in the dropper (two hand actions).
function stepBack(hand, io) {
  if (!hand.take(io.hopper, BOOK, 1)) return false;
  hand.insert(io.dropper, BOOK, 1);
  return true;
}

const entry = Catalogue.register({
  id: 'ui-steps',
  name: 'Steps',
  category: 'Navigation',
  summary: 'A lamp per step down a dust line, with its label on signs. As a timeline, a lever starts a repeater delay line and the lamps light one stage delay apart. As a manual stepper, a button fires a dropper holding one book and quill per step into a hopper; a comparator reads the hopper (3 per book) and each lamp\'s branch is 3 blocks further down the line, so the lamps lit are the books in it.',
  strict: true,
  deviations: [],
  inputs: ['lever (timeline)', 'stone button on the dropper, a book taken back by hand (manual)'],
  outputs: ['one lamp per step, lit in order'],
  actions: ['flip the lever', 'press a button', 'take an item from a container', 'put an item into a container'],
  timing: 'Timeline: lamp i lights (i + 1) x delay + 1 ticks after the lever is flipped on, and goes out in the same order (2 ticks later each) when it is flipped off. Manual: the next lamp lights 4 ticks after the press (the dropper fires 2 ticks after its rising edge, the comparator 1 tick after the hopper fills); a book taken back puts the last lamp out 3 ticks later.',
  notes: [
    'Timeline: up to 8 steps, a stage delay of 1 to 4 ticks.',
    'Manual: up to 5 steps, the hopper\'s slots. Books and quills do not stack, so each fills one slot: 14 x k / 5, plus 1, is 3k for k = 1 to 5, and the dust from the comparator loses one level per block.',
    'The hopper faces down onto stone and has no container above it, so it neither passes nor pulls items; the dropper fires only on its button.',
    'Build with { manual: true, at: k } for a stepper at step k, { on: true } for a timeline that has run.',
  ],
  params: [
    { key: 'steps', label: 'Steps', min: 2, max: MAX, def: 4 },
    { key: 'delay', label: 'Stage delay', min: 1, max: 4, def: 2 },
    { key: 'signs', label: 'Signs per label', min: 1, max: 6, def: 3 },
    { key: 'manual', label: 'Manual (button counter)', options: [false, true], def: false },
  ],
  controls: [],
  build: buildSteps,
  tests: [
    T('timeline: lamp i lights (i + 1) x delay + 1 ticks after the lever, in order; off in order', () => ui().testing.edges(entry).filter(p => !p.manual).every(p => {
      const c = buildSteps(p), w = c.world, hand = ui().testing.hand(w), n = c.io.lamps.length, d = p.delay;
      if (reached(c.io) !== 0) return false;
      hand.flip(c.io.lever);
      const on = [];
      for (let t = 1; t <= 40; t++) { w.tick(); if (!prefix(c.io)) return false; on.push(reached(c.io)); }
      const firstAt = i => on.findIndex(k => k > i) + 1;
      for (let i = 0; i < n; i++) if (firstAt(i) !== (i + 1) * d + 1) throw new Error(`lamp ${i} at ${firstAt(i)}`);
      hand.flip(c.io.lever);
      let last = n;
      for (let t = 1; t <= 50; t++) {
        w.tick();
        const k = reached(c.io);
        if (k > last || (k < n && c.io.lamps[0].lit)) return false;   // they go out from the first
        last = k;
      }
      return reached(c.io) === 0;
    })),
    T('manual: each press lights the next lamp 4 ticks later; a book taken back puts the last out; up to every step', () => ui().testing.edges(entry).filter(p => p.manual).every(p => {
      const c = buildSteps(p), w = c.world, hand = ui().testing.hand(w), n = c.io.lamps.length;
      for (let k = 1; k <= n; k++) {
        hand.press(c.io.button);
        if (ui().testing.ticksUntil(w, () => reached(c.io) === k, 20) !== 4 || !prefix(c.io)) return false;
        ui().testing.settle(w);
      }
      hand.press(c.io.button);   // the hopper is full: nothing more
      ui().testing.settle(w);
      if (reached(c.io) !== n) return false;
      for (let k = n - 1; k >= 0; k--) {
        stepBack(hand, c.io);
        ui().testing.settle(w);
        if (reached(c.io) !== k || !prefix(c.io)) return false;
      }
      return true;
    })),
    T('a full cycle returns every block to its start', () => each(entry, p => {
      const c = buildSteps(p), w = c.world, hand = ui().testing.hand(w);
      const h0 = ui().testing.hash(w);
      if (c.manual) {
        hand.press(c.io.button);
        ui().testing.settle(w);
        stepBack(hand, c.io);
      } else {
        hand.flip(c.io.lever);
        ui().testing.settle(w);
        hand.flip(c.io.lever);
      }
      ui().testing.settle(w);
      return ui().testing.hash(w) === h0;
    })),
    T('built at every state, the steady state does not drift for 100 ticks', () => each(entry, p => {
      const n = buildSteps(p).io.lamps.length;
      const states = p.manual ? [...Array(n + 1).keys()].map(at => ({ at })) : [{ on: false }, { on: true }];
      return states.every(s => {
        const c = buildSteps(Object.assign({}, p, s));
        return ui().testing.noDrift(c.world, 100) && reached(c.io) === (p.manual ? s.at : s.on ? n : 0);
      });
    })),
    T('strict: real blocks only, no wiring links, no pistons', () => each(entry, p => {
      const c = buildSteps(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 0;
    })),
  ],
});

if (N) module.exports = { buildSteps, reached, stepBack, entry, MAX, MAX_MANUAL };
else window.RSSteps = { buildSteps, reached, stepBack, MAX, MAX_MANUAL };
})();
