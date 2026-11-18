// UI contraption for <rs-slider>: the meter of <rs-progress> (a barrel, a comparator and a dust line on a row of
// lamps) without its clock, worked by hand. The player puts books and quills into the barrel or takes them out;
// the comparator reads how full the barrel is (0 to 15) and the dust carries that strength along the lamps,
// losing one per block, so exactly `level` lamps are lit. The slider's value is the comparator's level.
//
// A book and quill does not stack, so each item is one twenty-seventh of the barrel: the comparator reads
// floor(14 k / 27) + 1 for k items (k > 0). Every level from 1 to 15 is one or two items further on.
//
//   front view (x east, z up), one row (y = 0):
//     z=1   barrel  comparator>  dust  dust dust ... dust
//     z=0   planks  planks       stone lamp lamp ... lamp
//   The dust starts on a stone block: a block under dust is powered and lights the lamp beside it, and so does
//   every lamp under dust, so a strength s lights exactly the first s lamps (see progress.js).
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const ITEM = 'writable_book';   // stacks to 1
const SLOTS = 27;               // a barrel
const L0 = 3;                   // the first lamp's column

const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tidy = v => Number(Number(v).toPrecision(12));

// The fewest items that make the comparator read `level`.
const itemsFor = level => (level > 0 ? Math.max(1, Math.ceil(((level - 1) * SLOTS) / 14)) : 0);

// min / max / step onto the comparator's levels. A range of P positions (P = (max - min) / step + 1) gets
// P - 1 lamps when P <= 16; a wider range gets 15 lamps and level i stands for the step nearest i / 15 of the
// way, so the resolution is one fifteenth of the range. step="any" is the same 16 evenly spaced values.
function scaleFor(p = {}) {
  let min = num(p.min);
  if (!Number.isFinite(min)) min = 0;
  let max = num(p.max);
  if (!Number.isFinite(max)) max = min + clamp(Math.round(num(p.levels)) || 15, 1, 15);
  if (max < min) max = min;
  const any = String(p.step).trim().toLowerCase() === 'any';
  let step = num(p.step);
  if (!(step > 0)) step = 1;
  const positions = any ? Infinity : Math.floor((max - min) / step + 1e-9) + 1;
  const lamps = positions > 16 ? 15 : Math.max(1, positions - 1);
  const valueAt = level => {
    const i = clamp(Math.round(level) || 0, 0, lamps);
    if (any) return tidy(min + ((max - min) * i) / lamps);
    const k = positions > 16 ? Math.round((i * (positions - 1)) / lamps) : i;
    return tidy(clamp(min + k * step, min, max));
  };
  // The level whose value is nearest v (ties go up, like a native range); no value: the middle, as a native range.
  const levelOf = v => {
    let x = num(v);
    if (!Number.isFinite(x)) x = min + (max - min) / 2;
    let best = 0;
    for (let i = 1; i <= lamps; i++) if (Math.abs(valueAt(i) - x) <= Math.abs(valueAt(best) - x)) best = i;
    return best;
  };
  return { min, max, step: any ? 'any' : step, positions, lamps, valueAt, levelOf, text: level => String(valueAt(level)) };
}

function buildSlider(p = {}) {
  const scale = scaleFor(p);
  const n = scale.lamps;
  const level = scale.levelOf(p.value);
  const w = new RS.World({ strict: true });
  w.put(0, 0, 0, 'planks');
  w.put(1, 0, 0, 'planks');
  w.put(2, 0, 0, 'stone');
  const k = itemsFor(level);
  const items = [];
  for (let i = 0; i < SLOTS; i++) items.push(i < k ? { id: ITEM, n: 1 } : null);
  const barrel = w.put(0, 0, 1, 'barrel', { d: 'U', items, fill: level });
  const comparator = w.put(1, 0, 1, 'comparator', { d: 'E', mode: 'cmp', out: level });
  const lead = w.put(2, 0, 1, 'dust', { lvl: level });
  const lamps = [], dust = [];
  for (let i = 0; i < n; i++) {
    lamps.push(w.put(L0 + i, 0, 0, 'lamp', { lit: i < level }));
    dust.push(w.put(L0 + i, 0, 1, 'dust', { lvl: Math.max(0, level - 1 - i) }));
  }
  w.seal();
  const built = {
    world: w,
    box: [0, L0 + n - 1, 0, 0, 0, 1],
    scale,
    drag: null,                     // set by the element while the pointer holds the bar (see rs-slider)
    io: { barrel, comparator, lead, lamps, dust, bar: [barrel, comparator, lead].concat(lamps, dust) },
  };
  built.moveTo = (hand, target) => moveTo(hand, built, target);
  return built;
}

// The player's hand: one item in or out at a time, waiting for the comparator after each, until it reads `level`.
// Returns true if any item moved.
function moveTo(hand, built, level) {
  const { barrel, comparator } = built.io;
  const w = built.world;
  const target = clamp(Math.round(level) || 0, 0, built.scale.lamps);
  w.settle();
  let moved = false;
  for (let guard = 0; guard < 2 * SLOTS && comparator.out !== target; guard++) {
    const ok = comparator.out < target ? hand.insert(barrel, ITEM, 1) : hand.take(barrel, ITEM, 1);
    if (!ok) break;
    moved = true;
    w.settle();
  }
  return moved;
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const litCount = io => io.lamps.filter(l => l.lit).length;
const count = barrel => (barrel.items || []).reduce((s, it) => s + (it ? it.n : 0), 0);

const entry = Catalogue.register({
  id: 'ui-slider',
  name: 'Slider',
  category: 'Form controls',
  summary: 'The player puts books and quills into a barrel or takes them out; a comparator reads how full it is and a dust line on a row of lamps lights one lamp per level. The value is the comparator\'s strength.',
  strict: true,
  deviations: [],
  inputs: ['items in the barrel'],
  outputs: ['comparator strength (lamps lit)'],
  actions: ['put a book and quill into the barrel', 'take one out'],
  timing: 'Each item moved: the comparator and the last lamp change 2 ticks later (a lamp going dark holds 2 more). One level is one or two items, so an arrow key settles in 3 to 6 ticks; Home to End (27 items) in about 50.',
  notes: [
    'Resolution: a comparator shows 16 levels (0 to 15). A range of up to 16 values (min, max and step) gets one lamp per step above min; a wider range, or step="any", gets 15 lamps and snaps to 16 evenly spaced values, so its resolution is (max - min) / 15 rounded to the step.',
    'A book and quill does not stack: k of them in a 27-slot barrel read floor(14 k / 27) + 1. Levels 1 to 15 take 1, 2, 4, 6, ... 26 and 27 items, so every level is one or two items from the next.',
    'The hand moves one item, waits until the world is still, and reads the comparator again; it stops when the comparator shows the level the player is aiming for. The value commits from the comparator, never from the pointer.',
    'The player waits (audited): moving to a level is a series of separate player actions, one item each, each applied to a quiet world; the element runs the world to quiet between them (settle) instead of in real time, so a drag or an arrow key shows the end state at once. No action is refused or dropped, and the comparator decides when to stop.',
    'Build with { min, max, step, value } (the element\'s attributes; the workbench uses { levels }, 0 to levels in steps of 1).',
  ],
  params: [{ key: 'levels', label: 'Levels (0 to n, step 1)', min: 1, max: 15, def: 15 }],
  controls: [
    { kind: 'action', label: 'Put a book and quill in', fn: built => built.world.hand.insert(built.io.barrel, ITEM, 1) },
    { kind: 'action', label: 'Take one out', fn: built => built.world.hand.take(built.io.barrel, ITEM, 1) },
  ],
  build: buildSlider,
  tests: [
    T('each item changes the comparator and the lamps within 2 ticks, up and down (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildSlider(Object.assign({ value: 0 }, p)), w = c.world, hand = t.hand(w);
      const levelOf = k => (k ? Math.floor((14 * k) / SLOTS) + 1 : 0);
      for (let k = 1; k <= SLOTS; k++) {
        hand.insert(c.io.barrel, ITEM, 1);
        const want = Math.min(levelOf(k), 15);
        if (t.ticksUntil(w, () => c.io.comparator.out === want, 4) > 2) return false;
        t.settle(w);
        if (litCount(c.io) !== Math.min(want, c.scale.lamps)) return false;
      }
      for (let k = SLOTS - 1; k >= 0; k--) {
        hand.take(c.io.barrel, ITEM, 1);
        if (t.ticksUntil(w, () => c.io.comparator.out === levelOf(k), 4) > 2) return false;
        t.settle(w);
      }
      return litCount(c.io) === 0;
    })),
    T('the hand reaches every level from every level, one item at a time, and the lamps show it', () => each(entry, p => {
      const t = ui().testing, c = buildSlider(p), hand = t.hand(c.world), n = c.scale.lamps;
      for (const target of [0, n, 1, n - 1, Math.floor(n / 2), 0]) {
        moveTo(hand, c, target);
        if (c.io.comparator.out !== target || litCount(c.io) !== target) return false;
      }
      return true;
    })),
    T('min / max / step map onto the levels honestly', () => {
      const a = scaleFor({ min: 0, max: 15 }), b = scaleFor({ min: 0, max: 100 }), c = scaleFor({ min: 1, max: 5, step: 0.5 });
      const d = scaleFor({ min: 0, max: 1, step: 'any' }), e = scaleFor({ min: 10, max: 20, step: 3 }), f = scaleFor({ min: 5, max: 5 });
      return a.lamps === 15 && a.valueAt(7) === 7 && a.levelOf(undefined) === 8 &&
        b.lamps === 15 && b.valueAt(1) === 7 && b.valueAt(15) === 100 && b.levelOf(50) === 8 && b.levelOf(46) === 7 &&
        c.lamps === 8 && c.valueAt(3) === 2.5 && c.levelOf(2.4) === 3 &&
        d.lamps === 15 && d.valueAt(3) === 0.2 &&
        e.lamps === 3 && e.valueAt(3) === 19 && e.levelOf(20) === 3 && e.levelOf(-4) === 0 &&
        f.lamps === 1 && f.valueAt(1) === 5 && scaleFor({ levels: 4 }).lamps === 4;
    }),
    T('a full cycle (to 0, to the top, to 0, back) returns every block to its start', () => each(entry, p => [0, 1, 7, 15].every(v => {
      const t = ui().testing, c = buildSlider(Object.assign({}, p, { value: v })), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w), level = c.io.comparator.out;
      moveTo(hand, c, 0);
      moveTo(hand, c, c.scale.lamps);
      moveTo(hand, c, 0);
      moveTo(hand, c, level);
      return t.hash(w) === h0 && count(c.io.barrel) === itemsFor(level);
    }))),
    T('built at every level, the steady state does not drift for 100 ticks', () => each(entry, p => {
      for (let v = 0; v <= 15; v++) {
        const c = buildSlider(Object.assign({}, p, { value: v }));
        if (!ui().testing.noDrift(c.world, 100) || litCount(c.io) !== c.io.comparator.out) return false;
      }
      return true;
    })),
    T('strict, and no pistons', () => each(entry, p => ui().testing.strictWorld(buildSlider(p).world, RS) && ui().testing.pistonCount(buildSlider(p).world) === 0)),
  ],
});

const api = { buildSlider, scaleFor, moveTo, itemsFor, ITEM };
if (N) module.exports = Object.assign({ entry }, api);
else window.RSSlider = api;
})();
