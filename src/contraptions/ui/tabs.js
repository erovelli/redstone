// UI contraption for <rs-tabs> (and the selector that <rs-accordion> reuses): a vertical list of tabs, each a
// stone button and its label signs, into a bank of D latches (rs-radio's), above one opening whose shutter closes
// while the selection changes.
//
// The bank is rs-radio's (see radio.js): each tab is a band of three rows on the floor (seen from above). Its main
// row holds a stone button, a delay repeater D (3 ticks), the memory repeater M (1 tick) and a lamp; the next row a
// lock repeater L pointing into M's side; the third a feeder repeater, a stone block and a redstone torch that is
// L's input. Every button hangs on a stone block in one collector line of dust down the left edge, so the line is
// lit while any button is in; every torch is then out and every latch copies its own button: the pressed tab's M
// turns on and every other M turns off. The label signs hang on a planks row beside the lamp.
//
// The shutter is the rs-collapse curtain without its torch: one sticky piston per column, behind the top of a honey
// or slime column (alternating, so each piston moves only its own column), pushes the column in front of the
// opening while the dust line on the piston row is lit. That line is lit by a pulse made under the bank's floor
// (see addShutter): a wall torch on the floor block under the collector goes out when a button is pressed, and a
// comparator in subtract mode turns that edge into a 4-tick pulse. The curtain is in front of the opening the tick
// before the latches change and back in the wall two ticks after; the panel shown through the opening is the one
// whose latch is on.
//
//   plan (z = 0, x east, y toward the viewer), n tabs, H = 3n rows; the lower half of the bands is mirrored:
//     y=a        [stone] button D> M> lamp [planks x S]      collector dust down x = -1, climbing over each [stone]
//     y=b         dust          .  L^   .  [signs   x S]
//     y=c         dust   feeder> [stone] torch
//     y=H+1      the piston row (z = -2) and its dust (z = -1) under a planks rim; y=H+2 pocket; y=H+3 opening
//   front of the shutter (y = H+3), C columns, R rows, top opening row z = -2:
//     z=-1       F F ... F F                      F: white glazed terracotta frame, west column at x = -2
//     z=-2..-1-R F c c ... c F                    c: honey and slime columns, in the pocket (y = H+2) while open
//     z=-2-R     F F ... F F
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const FLOOR = 'smooth_stone';
const FRAME = { color: 'white', d: 'N' };
const MAX = 6;           // tabs: the collector reaches every feeder within 14 blocks (rs-radio's limit)
const MAX_COLS = 14;     // the repeater gives the piston row 15 at its first column; the last piston needs 1
const MAX_ROWS = 12;     // a column is one structure: at most 12 blocks for its piston

const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// Rows of band k among n: a (main), b (lock), c (feeder). As in rs-radio.
function rowsOf(k, n) {
  const up = k < Math.floor(n / 2);
  const base = 3 * k;
  return { up, a: up ? base : base + 2, b: base + 1, c: up ? base + 2 : base };
}

// Sign counts per band: a number for every band, or a list (the element passes one per tab from its label).
function signCounts(raw, n) {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.includes(',') ? raw.split(',') : null;
  const out = [];
  for (let k = 0; k < n; k++) out.push(int(list ? list[k] : raw, 1, 5, 3));
  return out;
}

// The bank: n bands, latch `sel` on (-1: none), label signs beside each lamp. Returns the parts and H (rows used).
function addBank(w, o) {
  const n = o.n, sel = o.sel, H = 3 * n;
  const signs = o.signs;
  const width = 4 + Math.max(...signs);
  for (let x = -1; x < width; x++) for (let y = 0; y <= H; y++) w.put(x, y, -1, FLOOR);
  const io = { buttons: [], delays: [], memory: [], locks: [], lamps: [], torches: [], signs: [] };
  const mainRows = [];
  for (let k = 0; k < n; k++) {
    const r = rowsOf(k, n);
    const on = k === sel;
    mainRows.push(r.a);
    w.put(-1, r.a, 0, 'stone');
    const button = w.put(0, r.a, 0, 'button', { att: 'W', on: false });
    const D = w.put(1, r.a, 0, 'repeater', { d: 'E', delay: 3 });
    const M = w.put(2, r.a, 0, 'repeater', { d: 'E', delay: 1, on });
    const lamp = w.put(3, r.a, 0, 'lamp', { lit: on });
    io.locks.push(w.put(2, r.b, 0, 'repeater', { d: r.up ? 'N' : 'S', delay: 1, on: true, locked: false }));
    w.put(0, r.c, 0, 'repeater', { d: 'E', delay: 1 });
    w.put(1, r.c, 0, 'stone');
    io.torches.push(w.put(2, r.c, 0, 'torch', { att: 'W', lit: true }));
    // Label: oak wall signs on a planks row beside the lamp, in the row in front of the main row.
    const labels = [];
    for (let x = 4; x < 4 + signs[k]; x++) {
      w.put(x, r.a, 0, 'planks');
      labels.push(w.put(x, r.a + 1, 0, 'sign', { att: 'N', kind: 'wall', text: '' }));
    }
    io.buttons.push(button);
    io.delays.push(D);
    io.memory.push(M);
    io.lamps.push(lamp);
    io.signs.push(...labels);
    io['b' + k] = button;
    io['row' + k] = [button, D, M, lamp];
    io['label' + k] = labels;
  }
  // The collector: dust down the left edge, climbing over each button's block.
  for (let y = 0; y < H; y++) io.collector = w.put(-1, y, mainRows.includes(y) ? 1 : 0, 'dust');
  return { io, H, width };
}

// The shutter in front of the bank: an opening of C x R behind a curtain that a pulse closes. The frame's west
// column is x = -2, the opening's top row z = -2, the front plane y = P + 2 (P = H + 1: the piston row).
// The pulse runs under the bank's floor, where every floor block is at most weakly powered (dust on it), so dust
// there reads nothing from above. A wall torch on the side of the floor block under the collector, halfway down
// the bank (every button is within 14 blocks of it), is lit while no button is in; it lights a dust line south
// along x = -2 one level below the floor. Near the front the line feeds a comparator in subtract mode twice: its
// rear from a redstone block (always 15) and its side directly. While any button is in the torch is out, the side is
// dark and the comparator is lit, so the shutter stays shut for as long as any button is in: a second press within
// the first's 10 ticks cannot change the latches behind an open shutter. The comparator strongly
// powers the block under the west end of the piston row's dust, which lights the whole row with 15.
function addShutter(w, o) {
  const C = o.cols, R = o.rows, P = o.p, H = P - 1, ym = o.tap;
  const Y = P + 2, x0 = -2, E = x0 + C + 1;
  const z0 = -2, zb = z0 - R + 1;
  const T = (x, y, z) => w.put(x, y, z, 'terracotta', Object.assign({}, FRAME));
  for (let z = zb - 1; z <= z0 + 1; z++) {
    T(x0, Y, z); T(x0, Y - 1, z);
    T(E, Y, z); T(E, Y - 1, z);
  }
  for (let x = x0 + 1; x < E; x++) {
    T(x, Y, z0 + 1); T(x, Y - 1, z0 + 1);
    T(x, Y, zb - 1); T(x, Y - 1, zb - 1);
  }
  // Under the floor (z = -2, on stone at z = -3): the torch's line, the delay, the comparator.
  const under = (x, y, t, s) => {
    w.put(x, y, -3, 'stone');
    return w.put(x, y, -2, t, s);
  };
  const torch = w.put(-2, ym, -1, 'torch', { att: 'E', lit: true });
  for (let y = ym; y <= H - 3; y++) under(-2, y, 'dust');
  for (const y of [H - 3, H - 2]) under(-1, y, 'dust');        // round the redstone block, never beside it
  for (const y of [H - 2, H - 1, H]) under(0, y, 'dust');
  under(-1, H, 'repeater', { d: 'W', delay: 1, on: true });   // the side must be 15 to cancel the rear
  const delay = under(-2, H - 1, 'rblock');                   // the rear: always 15
  const comparator = under(-2, H, 'comparator', { d: 'S', mode: 'sub' });
  w.put(x0, P, z0, 'stone');                    // strongly powered by the comparator
  w.put(x0, P, z0 + 1, 'dust');
  // Columns: piston, curtain (in the pocket while open), the dust on the piston, the rim above it.
  const pistons = [], covers = [], opening = [], dust = [];
  for (let x = x0 + 1; x < E; x++) {
    const piston = w.put(x, P, z0, 'piston', { d: 'S', s: true, ext: !!o.closed });
    pistons.push(piston);
    if (o.closed) w.put(x, P + 1, z0, 'head', { d: 'S', s: true, p: piston });
    for (let z = zb; z <= z0; z++) {
      covers.push(w.put(x, o.closed ? Y : Y - 1, z, (x - x0) % 2 ? 'honey' : 'slime'));
      opening.push([x, Y, z]);
    }
    dust.push(w.put(x, P, z0 + 1, 'dust'));
  }
  for (let x = x0; x <= E; x++) w.put(x, P, 0, 'planks');
  return { pistons, covers, opening, dust, comparator, delay, torch, zb, E, Y };
}

// The bank and the shutter in one world. o: { n, sel, cols, rows, signs, none }. With `none`, the last band is a
// "none" option whose memory repeater, instead of a lamp, lights the piston row through a dust step: the
// shutter stays closed while it is chosen (rs-accordion).
function buildSelector(o) {
  const w = new RS.World({ strict: true });
  const bank = addBank(w, o);
  const closed = o.none && o.sel === o.n - 1;
  const sh = addShutter(w, { cols: o.cols, rows: o.rows, p: bank.H + 1, tap: 3 * Math.floor(o.n / 2), closed });
  if (o.none) {
    // The none band is the last (a lower band: its main row is H - 1). Its lamp becomes dust, two blocks down to
    // the piston row's second column (no rim above that step).
    const H = bank.H, P = H + 1, lamp = bank.io.lamps[o.n - 1];
    w.set(lamp.x, lamp.y, lamp.z, null);
    bank.io.lamps.pop();
    bank.io[`row${o.n - 1}`].pop();
    w.put(3, H - 1, 0, 'dust');
    w.put(3, H, 0, 'dust');
    w.set(3, P, 0, null);
    // A narrow opening ends west of x = 3: carry the piston row's dust on to the step.
    for (let x = sh.E; x <= 3; x++) {
      if (w.get(x, P, -1)) continue;
      w.put(x, P, -2, 'stone');
      w.put(x, P, -1, 'dust');
    }
  }
  w.settle();
  w.seal();
  const xMax = Math.max(bank.width - 1, sh.E);
  return {
    world: w,
    box: [-2, xMax, 0, sh.Y, sh.zb - 1, 1],
    opening: sh.opening,
    io: Object.assign(bank.io, { pistons: sh.pistons, covers: sh.covers, comparator: sh.comparator }),
    shown: closed ? -1 : o.sel,
  };
}

function buildTabs(p = {}) {
  const n = int(p.tabs, 2, MAX, 3);
  const built = buildSelector({
    n,
    sel: int(p.sel, 0, n - 1, 0),
    cols: int(p.cols, 1, MAX_COLS, 8),
    rows: int(p.rows, 1, MAX_ROWS, 3),
    signs: signCounts(p.signs, n),
  });
  built.values = Array.isArray(p.values) ? p.values : [];
  return built;
}

/* ---------- reading the outputs ---------- */

// The latch that is on (-1 none, -2 more than one).
function latched(io) {
  const on = io.memory.map((m, k) => (m.on ? k : -1)).filter(k => k >= 0);
  return on.length === 1 ? on[0] : on.length ? -2 : -1;
}
const isClear = b => b.opening.every(([x, y, z]) => !b.world.get(x, y, z));
const isHome = b => b.opening.every(([x, y, z]) => { const c = b.world.get(x, y, z); return !!c && (c.t === 'honey' || c.t === 'slime'); });

// The panel on show: the latch that is on, taken only while the opening is clear (built.shown keeps the last one,
// so the shown panel changes only behind a closed shutter or as the shutter clears).
function shownPanel(built) {
  if (isClear(built)) {
    const k = latched(built.io);
    if (k >= 0) built.shown = k;
  }
  return built.shown;
}

// Press band k's button. Every press reaches the world: two buttons pressed in the same tick set both latches, and
// the panel on show stays the last one until the next press settles the bank. A press on a button that is still
// in does nothing and returns false; the core retries a page request after settling.
function pressBand(hand, io, built, k) {
  const b = io.buttons[k];
  return !!b && hand.press(b);
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

// Press band k; per tick note whether the opening is clear and which latch is on.
function pressTrace(c, k, ticks = 30) {
  const w = c.world, trace = [];
  ui().testing.hand(w).press(c.io.buttons[k]);
  for (let i = 1; i <= ticks; i++) {
    w.tick();
    trace.push({ t: i, clear: isClear(c), home: isHome(c), latch: latched(c.io) });
  }
  ui().testing.settle(w);
  return trace;
}

// Every piston move in a press cycle carries exactly its own column (rows blocks, <= 12).
function columnMoves(c, k) {
  const w = c.world, moves = [];
  const off = w.on('move', ev => moves.push(ev.blocks.every(b => b.x === ev.piston.x) ? ev.blocks.length : 99));
  ui().testing.hand(w).press(c.io.buttons[k]);
  ui().testing.settle(w);
  off();
  return moves;
}

const entry = Catalogue.register({
  id: 'ui-tabs',
  name: 'Tabs',
  category: 'Navigation',
  summary: 'A stone button per tab into rs-radio\'s bank of D latches: any button in unlocks every latch and each copies its own button, so the pressed tab\'s latch is set and every other is reset. A 4-tick comparator pulse, started by a torch that the same collector line puts out, closes a honey and slime shutter over the panel opening while the latches change; the panel on show is the one whose latch is on.',
  strict: true,
  deviations: [],
  inputs: ['one stone button per tab'],
  outputs: ['one latch and lamp per tab (exactly one on)', 'opening clear'],
  actions: ['press a button'],
  timing: 'Shutter closed 4 ticks after a press; the latches change at 5 (the old lamp goes dark 2 ticks later); the shutter stays shut while any button is in and the opening is clear again at 14 (4 ticks after the last button comes out), showing the new panel.',
  notes: [
    'Exclusivity is the latches (see rs-radio): while any button is in, every memory repeater copies its own delay line.',
    'The shutter pulse is made under the bank floor: a wall torch on the floor block under the collector, halfway down the bank, goes out on a press; its dust line feeds a comparator in subtract mode, at the side directly (through a repeater, so it reaches 15) and at the rear through a 4-tick repeater. The comparator strongly powers the block under the west end of the piston row\'s dust.',
    'Pressing the chosen tab again blinks the shutter and changes nothing else.',
    'Two presses in the same tick set both latches; the panel on show stays the last one until a later press settles the bank (a later press always wins). The element passes every press on, as a player could make them.',
    'Columns alternate honey and slime and every block a column touches is glazed terracotta, air or its own piston, so each piston moves exactly its column: rows blocks, at most 12.',
    'Build with { sel: k } for tab k chosen; { values } are the values the element passes for its value property; { signs: [..] } one sign count per tab.',
  ],
  params: [
    { key: 'tabs', label: 'Tabs', min: 2, max: MAX, def: 3 },
    { key: 'cols', label: 'Opening columns', min: 1, max: MAX_COLS, def: 8 },
    { key: 'rows', label: 'Opening rows', min: 1, max: MAX_ROWS, def: 3 },
    { key: 'signs', label: 'Signs per label', min: 1, max: 5, def: 3 },
  ],
  controls: [0, 1].map(k => ({ kind: 'button', io: 'b' + k, label: 'Tab ' + (k + 1) })),
  build: buildTabs,
  tests: [
    T('each press: shutter closed at 4, latches change at 5, clear at 14 showing the pressed tab (every edge)', () => each(entry, p => {
      const n = int(p.tabs, 2, MAX, 3);
      const c = buildTabs(p);
      ui().testing.settle(c.world);
      if (latched(c.io) !== 0 || !isClear(c)) return false;
      for (const k of [n - 1, 0, Math.floor(n / 2)]) {
        const from = latched(c.io);
        const tr = pressTrace(c, k);
        const closed = tr.find(s => s.home), changed = tr.find(s => s.latch === k), clear = tr.find(s => s.t > 4 && s.clear);
        if (!closed || closed.t !== 4 || !clear || clear.t !== 14 || clear.latch !== k) return false;
        if (from !== k && changed.t !== 5) return false;
        // Never two latches, never none, and the opening is shut whenever the latch is changing.
        if (tr.some(s => s.latch < 0)) return false;
        if (tr.some((s, i) => i && s.latch !== tr[i - 1].latch && s.clear)) return false;
        if (latched(c.io) !== k || c.io.lamps.some((l, j) => !!l.lit !== (j === k))) return false;
      }
      return true;
    })),
    T('a second press while the first button is in: the shutter stays shut until both are out, so the panel never swaps in view', () => [2, 3, 6].every(n => {
      for (let g = 1; g <= 12; g++) {
        const c = buildTabs({ tabs: n, sel: 0 }), w = c.world, hand = ui().testing.hand(w);
        hand.press(c.io.buttons[1]);
        // The panel on show (the latch seen through a clear opening) never changes while the opening stays clear.
        let wasClear = true, shown = shownPanel(c), bad = false;
        for (let t = 1; t <= 40; t++) {
          if (t === g + 1) hand.press(c.io.buttons[n - 1]);   // g ticks after the first press
          w.tick();
          const clear = isClear(c), k = latched(c.io);
          if (clear && wasClear && k !== shown) bad = true;
          if (clear) shown = k;
          wasClear = clear;
        }
        ui().testing.settle(w);
        if (bad || latched(c.io) !== n - 1 || shownPanel(c) !== n - 1) throw new Error(`n ${n} gap ${g}`);
      }
      return true;
    })),
    T('a second press 1 to 12 ticks after the first wins, for every pair of tabs', () => [2, 4, 6].every(n => {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let g = 1; g <= 12; g++) {
        if (i === j) continue;
        const c = buildTabs({ tabs: n, sel: 0 }), w = c.world, hand = ui().testing.hand(w);
        hand.press(c.io.buttons[i]);
        w.run(g);
        hand.press(c.io.buttons[j]);
        ui().testing.settle(w);
        if (latched(c.io) !== j || !isClear(c) || c.io.lamps.filter(l => l.lit).length !== 1) throw new Error(`n=${n} ${i} then ${j} after ${g}`);
      }
      return true;
    })),
    T('a full cycle returns every block to its start', () => each(entry, p => {
      const c = buildTabs(p), w = c.world, n = c.io.buttons.length;
      const h0 = ui().testing.hash(w);
      for (let k = n - 1; k >= 0; k--) pressTrace(c, k, 1);
      return ui().testing.hash(w) === h0;
    })),
    T('the built steady state does not drift for 100 ticks (every tab chosen)', () => each(entry, p => {
      const n = int(p.tabs, 2, MAX, 3);
      for (let s = 0; s < n; s++) {
        const c = buildTabs(Object.assign({}, p, { sel: s }));
        if (!ui().testing.noDrift(c.world, 100) || latched(c.io) !== s || !isClear(c)) return false;
      }
      return true;
    })),
    T('push limit by construction: each piston moves exactly its own column (rows <= 12), both ways', () => each(entry, p => {
      const c = buildTabs(p);
      const moves = columnMoves(c, 1);
      return moves.length === 2 * c.io.pistons.length && moves.every(m => m === int(p.rows, 1, MAX_ROWS, 3) && m <= 12);
    })),
    T('strict: real blocks only, no wiring links, one piston per column', () => each(entry, p => {
      const c = buildTabs(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === int(p.cols, 1, MAX_COLS, 8);
    })),
  ],
});

const api = { addBank, addShutter, buildSelector, rowsOf, signCounts, latched, isClear, isHome, shownPanel, pressBand, pressTrace, columnMoves, MAX, MAX_COLS, MAX_ROWS };
if (N) module.exports = Object.assign({ buildTabs, entry }, api);
else {
  window.buildTabs = buildTabs;
  window.RSTabs = api;
}
void yes;
})();
