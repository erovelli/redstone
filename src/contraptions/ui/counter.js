// UI contraption for <rs-counter>: a stat number of one to three decimal digits. Each digit is a barrel, a comparator
// and a line of nine redstone lamps with dust on top: the player puts books and quills into the barrel, the
// comparator reads the fill as the digit (0 to 9) and the dust carries that strength along the lamps, losing one per
// block, so exactly `digit` lamps are lit. The rows stack, most significant digit on top.
//
//   front view (x east, z up), digit row k at z = -2k (lamps) and -2k + 1 (dust):
//     z=-2k+1   barrel  comparator(E)  dust   dust dust ... (9)
//     z=-2k     planks  planks         stone  lamp lamp ... (9)
//   The stone under the first dust is weakly powered and lights the first lamp beside it; each lamp under the line
//   lights the next one, so strength s lights exactly the first s lamps (the rs-progress line).
//
// This is the smaller honest display SPEC section 6 allows for the stretch goal: a seven-segment decoder per digit
// needs six subtract-mode band comparators and ten threshold repeaters fed from sixteen dust taps at exact distances
// (for the best ordering of digits on the comparator's levels); laid out flat that is about eleven columns per digit,
// too wide for three digits at 320 px, and stacked behind a front-plane display it needs the analog signal at five
// heights. A lamp line per digit decodes the same comparator signal with dust decay alone.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const ITEM = 'writable_book';   // stacks to 1
const SLOTS = 27;               // a barrel
const LAMPS = 9;
const L0 = 3;                   // the first lamp's column

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};
// The fewest books and quills that make a comparator read `level` from a 27-slot barrel.
const itemsFor = level => (level > 0 ? Math.max(1, Math.ceil(((level - 1) * SLOTS) / 14)) : 0);
const count = barrel => (barrel.items || []).reduce((s, it) => s + (it && it.id === ITEM ? it.n : 0), 0);

// The digits of a value, most significant first, clamped to what `digits` places can show.
function digitsOf(value, digits) {
  const top = Math.pow(10, digits) - 1;
  const v = Math.max(0, Math.min(top, Math.round(Number(value)) || 0));
  return String(v).padStart(digits, '0').split('').map(Number);
}

function buildCounter(p = {}) {
  const digits = int(p.digits, 1, 3, 3);
  const values = digitsOf(p.value, digits);
  const w = new RS.World({ strict: true });
  const rows = values.map((d, k) => {
    const z = -2 * k;
    w.put(0, 0, z, 'planks');
    w.put(1, 0, z, 'planks');
    w.put(2, 0, z, 'stone');
    const items = [];
    for (let i = 0; i < SLOTS; i++) items.push(i < itemsFor(d) ? { id: ITEM, n: 1 } : null);
    const barrel = w.put(0, 0, z + 1, 'barrel', { d: 'U', items, fill: d });
    const comparator = w.put(1, 0, z + 1, 'comparator', { d: 'E', mode: 'cmp', out: d });
    const lead = w.put(2, 0, z + 1, 'dust', { lvl: d });
    const lamps = [], dust = [];
    for (let i = 0; i < LAMPS; i++) {
      lamps.push(w.put(L0 + i, 0, z, 'lamp', { lit: i < d }));
      dust.push(w.put(L0 + i, 0, z + 1, 'dust', { lvl: Math.max(0, d - 1 - i) }));
    }
    return { barrel, comparator, lead, lamps, dust };
  });
  w.seal();
  const flat = key => rows.flatMap(r => [].concat(r[key]));
  const built = {
    world: w,
    box: [0, L0 + LAMPS - 1, 0, 0, -2 * (digits - 1), 1],
    digits,
    rows,
    io: { barrels: flat('barrel'), comparators: flat('comparator'), lamps: flat('lamps') },
  };
  built.valueOf = () => valueOf(built);
  built.setValue = (hand, value) => setValue(hand, built, value);
  return built;
}

// The value the comparators read: digit k is comparator k's strength.
const valueOf = built => built.rows.reduce((v, r) => v * 10 + (r.comparator.out || 0), 0);

// The player's hand: books and quills in or out of each barrel until it holds the fewest that read the digit.
function setValue(hand, built, value) {
  const want = digitsOf(value, built.digits);
  let moved = false;
  built.rows.forEach((r, k) => {
    // One book at a time: a hand takes from one slot, and a book and quill fills a slot.
    for (let n = itemsFor(want[k]) - count(r.barrel); n !== 0; n += n > 0 ? -1 : 1) {
      if (!(n > 0 ? hand.insert(r.barrel, ITEM, 1) : hand.take(r.barrel, ITEM, 1))) break;
      moved = true;
    }
  });
  return moved;
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const lit = row => row.lamps.filter(l => l.lit).length;

const entry = Catalogue.register({
  id: 'ui-counter',
  name: 'Counter',
  category: 'Display',
  summary: 'One row per decimal digit: books and quills in a barrel, a comparator that reads the fill as the digit, and a dust line on nine lamps that lights that many. The rows stack, most significant digit on top.',
  strict: true,
  deviations: [],
  inputs: ['books and quills in each barrel'],
  outputs: ['comparator strength per digit (lamps lit)'],
  actions: ['put books and quills into a barrel', 'take them out'],
  timing: 'Each comparator follows its barrel within 2 ticks of a change; its last lamp lights in the same tick and goes dark within 2 more.',
  notes: [
    'A book and quill does not stack: k of them in a 27-slot barrel read floor(14 k / 27) + 1, so digits 1 to 9 take 1, 2, 4, 6, 8, 10, 12, 14 and 16 items. Setting a value moves the difference in or out of each barrel.',
    'Dust loses one level per block, and a block under dust lights the lamps beside it, so the line starts on a stone block and strength s lights exactly the first s lamps.',
    'A smaller honest display, in place of seven-segment digits: a seven-segment decoder needs six subtract-mode band comparators and ten threshold repeaters per digit fed from sixteen dust taps at exact distances, about eleven columns per digit laid out flat (too wide for three digits at 320 px). The lamp line decodes the same comparator signal with dust decay alone. The element writes the number beside the machine from the comparators\' strengths.',
  ],
  params: [
    { key: 'digits', label: 'Digits', min: 1, max: 3, def: 3 },
  ],
  controls: [
    { kind: 'action', label: 'Add one', fn: built => setValue(built.world.hand, built, valueOf(built) + 1) },
    { kind: 'action', label: 'Take one away', fn: built => setValue(built.world.hand, built, valueOf(built) - 1) },
  ],
  build: buildCounter,
  tests: [
    T('every value lights its digits within 2 ticks and settles on exactly that many lamps per row (every edge)', () => each(entry, p => {
      const t = ui().testing, c = buildCounter(Object.assign({ value: 0 }, p)), w = c.world, hand = t.hand(w);
      const top = Math.pow(10, c.digits) - 1;
      const values = c.digits === 1 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0] : [0, 7, 19, 90, 408, 999, 123, top, 5, 0];
      for (const v of values) {
        setValue(hand, c, v);
        const want = Math.min(v, top);
        if (t.ticksUntil(w, () => valueOf(c) === want, 4) > 2) return false;
        t.settle(w);
        if (!c.rows.every((r, k) => lit(r) === digitsOf(want, c.digits)[k])) return false;
      }
      return true;
    })),
    T('the item counts per digit are the fewest that read it', () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every(d =>
      Math.floor((14 * itemsFor(d)) / SLOTS) + (itemsFor(d) ? 1 : 0) === d && (d === 0 || Math.floor((14 * (itemsFor(d) - 1)) / SLOTS) + (itemsFor(d) > 1 ? 1 : 0) < d))),
    T('built with a value, the steady state does not drift for 100 ticks and reads that value', () => each(entry, p => [0, 7, 42, 999].every(value => {
      const c = buildCounter(Object.assign({}, p, { value }));
      return ui().testing.noDrift(c.world, 100) && valueOf(c) === Math.min(value, Math.pow(10, c.digits) - 1);
    }))),
    T('a full cycle (count up, count back down) returns every block to its start', () => each(entry, p => {
      const t = ui().testing, c = buildCounter(Object.assign({ value: 0 }, p)), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      setValue(hand, c, 987);
      t.settle(w);
      setValue(hand, c, 0);
      t.settle(w);
      return t.hash(w) === h0;
    })),
    T('built with a value equals counted to it', () => {
      const t = ui().testing, a = buildCounter({ value: 0 }), b = buildCounter({ value: 409 });
      setValue(t.hand(a.world), a, 409);
      t.settle(a.world);
      return t.hash(a.world) === t.hash(b.world);
    }),
    T('strict, no pistons', () => each(entry, p => ui().testing.strictWorld(buildCounter(p).world, RS) && ui().testing.pistonCount(buildCounter(p).world) === 0)),
  ],
});

const api = { buildCounter, setValue, valueOf, digitsOf, itemsFor };
if (N) module.exports = Object.assign({ entry }, api);
else {
  window.buildCounter = buildCounter;
  window.RSCounter = api;
}
})();
