// UI contraption for <rs-modal>: a dialog behind a honey and slime door, opened and closed by a torch latch.
//
// The door is the collapse curtain (see collapse.js): one sticky piston per column, behind the column's top block,
// holds a honey or slime column in front of the opening while the dust line on top of the piston row is lit.
// Columns alternate honey and slime, which do not stick to each other, so each piston moves only its own column.
// The frame is obsidian, which slime and honey slide past.
//
// The dust line is lit by B, a planks block in the rim above its east end, while the latch is reset. The latch is
// an RS NOR latch of two torches and two repeaters in the rim, at the top-right corner:
//   tA (lit = closed) hangs on A and drives rA, which strongly powers B; B lights the dust line below it.
//   tB (lit = open) hangs on B and drives rB (delay 4), which strongly powers A. The two halves of the loop have
//   different delays, so when both buttons let go at nearly the same time the latch settles instead of oscillating.
//   The open button sits on top of A: A powered -> tA off -> rA off -> B unpowered -> the dust goes dark, every
//   piston pulls its column back, and tB lights, which holds A powered after the button lets go.
//   The close button hangs on B's front: B powered -> the dust lights at once and the door closes; tB goes out,
//   rB lets go of A, tA relights and rA holds B powered.
// Pressing both at least 5 ticks apart, the later press wins (its button lets go last). Pressing either twice
// changes nothing.
//
//   top bar (z = 2), plan; y = 0 is the front plane of the bar, the rim at y = -1, the latch's back row at y = -2:
//            x=0 .. C-2     C-1     C         E = C+1    E+1
//     y=0    title signs    [x]     [close]
//     y=-1   rim (planks)           B         rA (<-W)   tA (on A)
//     y=-2                                tB (on B) rB (->E)   A  (open button on top, z = 3)
//   z = 1: the dust line (x = 1..C, y = -1) on the pistons; obsidian under rA and rB; the obsidian frame's top row.
//   z = 0 .. 1-R: the opening (x = 1..C, y = 1), the covers in front of it, the pocket behind it (y = 0).
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const MAX_COLS = 15;   // B gives the dust 15 at x = C; the last piston, at x = 1, sits on level 16 - C
const MAX_ROWS = 12;   // a column is one structure: at most 12 blocks for its piston
const FRAME = 'obsidian';

const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildModal(p = {}) {
  const C = int(p.cols, 1, MAX_COLS, 10);
  const R = int(p.rows, 1, MAX_ROWS, 5);
  const signs = int(p.signs, 0, MAX_COLS - 1, 3);
  const open = yes(p.open);
  const E = C + 1;          // the frame's east column
  const zb = 1 - R;         // the bottom opening row
  const w = new RS.World({ strict: true });

  // The frame: west and east columns (front plane and pocket plane), top and bottom rows.
  for (let z = zb - 1; z <= 1; z++) {
    for (const x of [0, E]) {
      w.put(x, 1, z, FRAME);
      w.put(x, 0, z, FRAME);
    }
  }
  for (let x = 1; x <= C; x++) {
    w.put(x, 1, 1, FRAME);
    w.put(x, 0, 1, FRAME);
    w.put(x, 1, zb - 1, FRAME);
    w.put(x, 0, zb - 1, FRAME);
  }

  // The door: per column a sticky piston facing south, its head (closed), the column, and the dust on the piston.
  const pistons = [], covers = [], opening = [], dust = [];
  for (let x = 1; x <= C; x++) {
    const piston = w.put(x, -1, 0, 'piston', { d: 'S', s: true, ext: !open });
    pistons.push(piston);
    if (!open) w.put(x, 0, 0, 'head', { d: 'S', s: true, p: piston });
    for (let z = zb; z <= 0; z++) {
      covers.push(w.put(x, open ? 0 : 1, z, x % 2 ? 'honey' : 'slime'));
      opening.push([x, 1, z]);
    }
    dust.push(w.put(x, -1, 1, 'dust', { lvl: open ? 0 : 15 - (C - x) }));
  }

  // The rim over the wiring, with the title signs hanging on it; B is its east end.
  for (let x = 0; x < C; x++) w.put(x, -1, 2, 'planks');
  const B = w.put(C, -1, 2, 'planks');
  const signBlocks = [];
  for (let x = 0; x < Math.min(signs, C - 1); x++) signBlocks.push(w.put(x, 0, 2, 'sign', { att: 'N', kind: 'wall', text: '' }));
  const closeSign = C > 1 ? w.put(C - 1, 0, 2, 'sign', { att: 'N', kind: 'wall', text: 'x' }) : null;
  const close = w.put(C, 0, 2, 'button', { att: 'N', on: false });

  // The latch.
  w.put(E, -1, 1, FRAME);
  w.put(E, -2, 1, FRAME);
  const rA = w.put(E, -1, 2, 'repeater', { d: 'W', delay: 1, on: !open });
  const rB = w.put(E, -2, 2, 'repeater', { d: 'E', delay: 4, on: open });   // see 'the latch never oscillates'
  const A = w.put(E + 1, -2, 2, 'planks');
  const tA = w.put(E + 1, -1, 2, 'torch', { att: 'N', lit: !open });
  const tB = w.put(C, -2, 2, 'torch', { att: 'S', lit: open });
  const show = w.put(E + 1, -2, 3, 'button', { att: 'D', on: false });

  w.seal();
  return {
    world: w,
    box: [0, E + 1, -2, 1, zb - 1, 3],
    opening,
    io: { show, close, closeSign, A, B, tA, tB, rA, rB, pistons, covers, dust, signs: signBlocks },
  };
}

// The door's state from the blocks: clear (every opening cell empty) and home (every cell holds its cover).
const isOpen = c => c.opening.every(([x, y, z]) => !c.world.get(x, y, z));
const isHome = c => c.opening.every(([x, y, z]) => {
  const b = c.world.get(x, y, z);
  return !!b && (b.t === 'honey' || b.t === 'slime');
});
// Shown: from a press of the open button until the latch is reset and the door is home again.
const isDeployed = c => !!c.io.show.on || !c.io.tA.lit || !isHome(c);

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

// Every piston move over a full open/close cycle: the number of blocks it carried (99 if a block left its column).
function moves(p, cycle) {
  const c = buildModal(p), w = c.world, out = [];
  w.settle();
  const off = w.on('move', ev => out.push(ev.blocks.every(b => b.x === ev.piston.x) ? ev.blocks.length : 99));
  cycle(c, w, w.hand);
  off();
  return out;
}

const entry = Catalogue.register({
  id: 'ui-modal',
  name: 'Modal dialog',
  category: 'Disclosure and overlays',
  summary: 'The open button on a torch latch puts out the torch that lights the dust line on the piston row; one sticky piston per column pulls a honey or slime column of the door back into the wall, and the dialog is the HTML behind the opening. The close button relights the dust and the door shuts.',
  strict: true,
  deviations: [],
  inputs: ['open button', 'close button'],
  outputs: ['door clear', 'door home'],
  actions: ['press the open button', 'press the close button'],
  timing: 'Door clear 3 ticks after the open press (tA, rA, then the pistons). Door home 1 tick after the close press (the button powers B, which lights the dust); the latch has turned over 7 ticks after it (tB, the delay-4 repeater rB, tA).',
  notes: [
    'The latch is an RS NOR latch of two redstone torches and two repeaters. Each button strongly powers one of its blocks; the latch holds the state after the button lets go.',
    'Pressing open while open, or close while closed, moves nothing. Pressing both at least 5 ticks apart, the later press wins.',
    'A torch NOR latch with equal loop delays oscillates when both inputs let go in the same tick. Here rA has delay 1 and rB delay 4, and the latch settles for every pair of presses; pressed 1 to 4 ticks apart, it may settle either way.',
    'Columns alternate honey and slime, so each piston moves only its own column: rows blocks, at most 12. The frame is obsidian (immovable), which slime and honey slide past.',
    'B gives the dust line 15 at its east end and the line loses one level per column, so at most 15 columns.',
    'Build with { open: true } for a dialog that starts open: the latch set, the dust dark, the columns back in the wall.',
  ],
  params: [
    { key: 'cols', label: 'Columns', min: 1, max: MAX_COLS, def: 10 },
    { key: 'rows', label: 'Rows', min: 1, max: MAX_ROWS, def: 5 },
    { key: 'signs', label: 'Title signs', min: 0, max: 4, def: 3 },
  ],
  controls: [{ kind: 'button', io: 'show', label: 'Open' }, { kind: 'button', io: 'close', label: 'Close' }],
  build: buildModal,
  tests: [
    T('open clears the door on tick 3; close shuts it on tick 1 (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildModal(p), w = c.world, hand = t.hand(w);
      if (!isHome(c) || isDeployed(c)) return false;
      hand.press(c.io.show);
      const opened = t.ticksUntil(w, () => isOpen(c), 20);
      t.settle(w);
      hand.press(c.io.close);
      const shut = t.ticksUntil(w, () => isHome(c), 20);
      const latched = t.ticksUntil(w, () => !!c.io.tA.lit, 20) + shut;
      return opened === 3 && shut === 1 && latched === 7 && isOpen(c) === false;
    })),
    T('the latch holds: the door stays open after the open button lets go, and closed after the close button does', () => {
      const t = ui().testing, c = buildModal({}), w = c.world, hand = t.hand(w);
      hand.press(c.io.show);
      w.run(40);
      const held = isOpen(c) && !c.io.show.on;
      hand.press(c.io.close);
      w.run(40);
      return held && isHome(c) && !c.io.close.on && !isDeployed(c);
    }),
    T('a full open/close cycle returns every block to its start, twice (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildModal(p), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      for (let k = 0; k < 2; k++) {
        hand.press(c.io.show);
        t.settle(w);
        if (!isOpen(c)) return false;
        hand.press(c.io.close);
        t.settle(w);
      }
      return t.hash(w) === h0;
    })),
    T('open while open and close while closed move nothing', () => {
      const t = ui().testing, c = buildModal({ open: true }), w = c.world, hand = t.hand(w);
      let moved = 0;
      w.on('move', () => moved++);
      hand.press(c.io.show);
      t.settle(w);
      const a = moved === 0 && isOpen(c);
      hand.press(c.io.close);
      t.settle(w);
      const b = isHome(c);
      moved = 0;
      hand.press(c.io.close);
      t.settle(w);
      return a && b && moved === 0 && isHome(c);
    }),
    T('the latch never oscillates: every pair of presses settles; 5 or more ticks apart, the later press wins', () => [false, true].every(open => {
      for (let k = -16; k <= 16; k++) {
        const t = ui().testing, c = buildModal({ cols: 2, rows: 1, open }), w = c.world, hand = t.hand(w);
        const first = k >= 0 ? c.io.show : c.io.close, second = k >= 0 ? c.io.close : c.io.show;
        hand.press(first);
        w.run(Math.abs(k));
        hand.press(second);
        t.settle(w, 200);   // throws if it never settles
        if (Math.abs(k) >= 5 && isOpen(c) !== (second === c.io.show)) throw new Error('offset ' + k);
        if (!isOpen(c) && !isHome(c)) return false;
      }
      return true;
    })),
    T('built closed and built open, the steady state does not drift for 100 ticks', () => each(entry, p => [false, true].every(open => {
      const c = buildModal(Object.assign({}, p, { open }));
      return ui().testing.noDrift(c.world, 100) && (open ? isOpen(c) && isDeployed(c) : isHome(c) && !isDeployed(c));
    }))),
    T('built open equals opened: the same blocks after pressing open', () => each(entry, p => {
      const t = ui().testing, a = buildModal(p), b = buildModal(Object.assign({}, p, { open: true }));
      t.hand(a.world).press(a.io.show);
      t.settle(a.world);
      return t.hash(a.world) === t.hash(b.world);
    })),
    T('push limit by construction: each piston moves exactly its own column (rows <= 12), both ways', () => each(entry, p => {
      const rows = int(p.rows, 1, MAX_ROWS, 5), cols = int(p.cols, 1, MAX_COLS, 10);
      const m = moves(p, (c, w, hand) => {
        hand.press(c.io.show);
        w.settle();
        hand.press(c.io.close);
        w.settle();
      });
      return m.length === 2 * cols && m.every(n => n === rows && n <= 12);
    })),
    T('strict: real blocks only, no wiring links, one piston per column', () => each(entry, p => {
      const c = buildModal(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === int(p.cols, 1, MAX_COLS, 10);
    })),
  ],
});

const api = { isOpen, isHome, isDeployed };
if (N) module.exports = Object.assign({ buildModal, entry }, api);
else {
  window.buildModal = buildModal;
  window.RSModal = api;
}
})();
