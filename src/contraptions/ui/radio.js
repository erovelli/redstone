// UI contraption for <rs-radio>: a bank of D latches, one per option, made of locked repeaters.
//
// Each option is a band of three rows on the floor (seen from above): its main row holds a stone button, a delay
// repeater D (3 ticks), the memory repeater M (1 tick) and a lamp; the next row holds a lock repeater L pointing
// into M's side; the third holds a feeder repeater, a stone block and a redstone torch that is L's input.
// All buttons hang on stone blocks in one collector line of dust down the left edge, so the line is powered while
// any button is in. Every band's feeder reads that line, so every torch is NOT(any button in), and every L unlocks
// its M only while some button is in. While unlocked, each M copies its own D: the pressed option's M turns on and
// every other M turns off. When the button comes out the locks come back one tick before D falls, so the choice
// holds. Pressing a second option while the first is still in ends with the one pressed last: its button comes
// out last, and the earlier option's D has fallen while the locks were still open.
//
// The upper half of the bands is laid out main row first and the lower half mirrored (main row last), so the
// collector reaches every feeder in 14 blocks or less with up to 6 options. A button strongly powers the block it
// hangs on, which feeds the dust on either side of it and the dust that climbs over it.
//
//   top view of one upper band (x east, y toward the viewer); dust climbs over each button's block:
//     y=a   [stone]  button  D>  M>  lamp
//     y=b    dust            .   L^
//     y=c    dust    feeder> [stone] torch
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const FLOOR = 'smooth_stone';
const MAX = 6;

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// Rows of option k among n: a (main), b (lock), c (feeder).
function rowsOf(k, n) {
  const up = k < Math.floor(n / 2);
  const base = 3 * k;
  return { up, a: up ? base : base + 2, b: base + 1, c: up ? base + 2 : base };
}

function buildRadio(p = {}) {
  const n = int(p.options, 2, MAX, 3);
  const sel = int(p.sel, -1, n - 1, -1);
  const H = 3 * n;
  const w = new RS.World({ strict: true });
  for (let x = -1; x <= 3; x++) for (let y = 0; y < H; y++) w.put(x, y, -1, FLOOR);
  const io = { buttons: [], delays: [], memory: [], locks: [], lamps: [], torches: [] };
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
    io.buttons.push(button);
    io.delays.push(D);
    io.memory.push(M);
    io.lamps.push(lamp);
    io['row' + k] = [button, D, M, lamp];   // a control's hit area: the whole main row
    io['b' + k] = button;
  }
  // The collector: dust down the left edge, climbing over each button's block.
  for (let y = 0; y < H; y++) w.put(-1, y, mainRows.includes(y) ? 1 : 0, 'dust');
  // Derived state (dust levels, lock flags) is what the engine settles into; settle before sealing to write it.
  w.settle();
  w.seal();
  return { world: w, box: [-1, 3, 0, H - 1, -1, 1], io, values: Array.isArray(p.values) ? p.values : [], pressedAt: -1 };
}

// The selected option: the one memory repeater that is on (-1 for none).
function selected(io) {
  const on = io.memory.map((m, k) => (m.on ? k : -1)).filter(k => k >= 0);
  return on.length === 1 ? on[0] : on.length ? -2 : -1;
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

// Press option k and count ticks until it is the only latch on; also note any tick with none or two on.
function pressAndTime(c, k) {
  const t = ui().testing, w = c.world;
  t.hand(w).press(c.io.buttons[k]);
  let at = -1, ragged = false;
  for (let i = 1; i <= 30; i++) {
    w.tick();
    const s = selected(c.io);
    if (s === -2) ragged = true;
    if (at < 0 && s === k) at = i;
  }
  t.settle(w);
  return { at, ragged, ok: selected(c.io) === k && c.io.lamps.every((l, j) => !!l.lit === (j === k)) };
}

const entry = Catalogue.register({
  id: 'ui-radio',
  name: 'Radio group',
  category: 'Form controls',
  summary: 'One stone button per option into a bank of D latches made of locked repeaters. Any button in unlocks every latch (a dust line down the edge and a torch per option), each latch copies its own button, and the locks close again just before the button\'s signal falls: the pressed option\'s lamp is lit and every other one is out.',
  strict: true,
  deviations: [],
  inputs: ['one stone button per option'],
  outputs: ['one lamp per option (exactly one lit once chosen)'],
  actions: ['press a button'],
  timing: 'The chosen lamp lights 5 ticks after the press, in the same tick the previous latch lets go (its lamp goes dark 2 ticks later). A second press 1 or more ticks later wins.',
  notes: [
    'Exclusivity is the latches: while any button is in, every memory repeater copies its own delay line, so only the pressed one stays on.',
    'D (3 ticks) is one tick longer than the lock path (feeder, torch, lock: 3 ticks), so the lock is back before the press ends at the latch.',
    'Two presses in the same tick would set both latches; the element sends a player one press per tick, as the game does (one interaction per game tick).',
    'The lower half of the bands is mirrored so that the dust line reaches every feeder: 2 to 6 options.',
    'Build with { sel: k } for option k chosen; { values } are the option values the element passes for its value property.',
  ],
  params: [{ key: 'options', label: 'Options', min: 2, max: MAX, def: 3 }],
  controls: [0, 1].map(k => ({ kind: 'button', io: 'b' + k, label: 'Option ' + (k + 1) })),
  build: buildRadio,
  tests: [
    T('each press selects its option within 5 ticks, switching in one tick (every option count)', () => each(entry, p => {
      const c = buildRadio(p), n = c.io.buttons.length;
      ui().testing.settle(c.world);
      if (selected(c.io) !== -1) return false;
      for (const k of [n - 1, 0, Math.floor(n / 2)]) {
        const r = pressAndTime(c, k);
        if (!r.ok || r.ragged || r.at !== 5) return false;
      }
      return true;
    })),
    T('a second press 1 to 12 ticks after the first wins, for every pair of options', () => [2, 4, 6].every(n => {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let g = 1; g <= 12; g++) {
        if (i === j) continue;
        const c = buildRadio({ options: n, sel: 0 }), w = c.world, hand = ui().testing.hand(w);
        hand.press(c.io.buttons[i]);
        w.run(g);
        hand.press(c.io.buttons[j]);
        ui().testing.settle(w);
        if (selected(c.io) !== j || c.io.lamps.filter(l => l.lit).length !== 1) throw new Error(`n=${n} ${i} then ${j} after ${g}`);
      }
      return true;
    })),
    T('pressing the chosen option again changes nothing', () => {
      const c = buildRadio({ options: 4, sel: 2 }), w = c.world;
      const h0 = ui().testing.hash(w);
      ui().testing.hand(w).press(c.io.buttons[2]);
      ui().testing.settle(w);
      return ui().testing.hash(w) === h0;
    }),
    T('a full cycle returns every block to its start', () => each(entry, p => {
      const c = buildRadio(Object.assign({}, p, { sel: 0 })), w = c.world, n = c.io.buttons.length;
      const h0 = ui().testing.hash(w);
      for (let k = n - 1; k >= 0; k--) pressAndTime(c, k);
      return ui().testing.hash(w) === h0;
    })),
    T('the built steady state does not drift for 100 ticks (none and every option chosen)', () => each(entry, p => {
      const n = buildRadio(p).io.buttons.length;
      for (let s = -1; s < n; s++) {
        const c = buildRadio(Object.assign({}, p, { sel: s }));
        if (!ui().testing.noDrift(c.world, 100) || selected(c.io) !== s) return false;
      }
      return true;
    })),
    T('strict: real blocks only, no wiring links, no pistons', () => each(entry, p => {
      const c = buildRadio(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 0;
    })),
  ],
});

if (N) module.exports = { buildRadio, selected, entry, MAX };
else window.buildRadio = buildRadio;
})();
