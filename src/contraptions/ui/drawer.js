// UI contraption for <rs-drawer>: an off-canvas panel. A two-way flying machine of slime, two sticky pistons and two
// observers runs along a rail across the top of the panel; the panel is the HTML revealed behind its leading edge.
//
// The machine is two rows of six blocks (front view, x east, z up; home is off the screen's west edge):
//     z=1 (row B)   slime slime slime  b(<-W) obs(->E) stone        b: sticky piston facing west
//     z=0 (row A)   stone obs(<-W) a(->E) slime slime slime          a: sticky piston facing east
// Slime sticks only to its own neighbours, so the machine is two structures: the west part (row A's stone, observer
// and a, with the slime above them) and the east part (row A's slime and row B's b, observer and stone).
//   Out (east): a 1-tick pulse into a pushes the east part one block east and lets go of it (a sticky piston that
//   retracts the tick after it pushed leaves its block behind). The east part's observer moved, so it fires into b;
//   b reaches into the gap and pulls the west part after it; the west part's observer fires into a, which pushes
//   again. One block every 3 ticks, until the east part meets the obsidian stopper and a's push fails.
//   Back (west): a 1-tick pulse into b at the far end pushes the west part west; its observer fires into a, which
//   reaches into the gap and pulls the east part; and so on until the west part meets the home stopper.
// Each pulse comes from a stone button on the face of an observer: the observer sees the button go in and fires
// once into an obsidian block beside the parked piston. Obsidian is immovable, so the slime slides past it.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const L = 6;               // the machine's length
const STEP = 3;            // ticks per block of travel
const MAX_COLS = 40;
const MAX_ROWS = 60;

const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// Build, seal and settle once, as the element does: an observer first looks at its block on the first tick, so a
// press before any tick would go unseen.
function buildDrawer(p = {}) {
  const c = buildRaw(p);
  c.world.settle(10);
  return c;
}

function buildRaw(p = {}) {
  const W = int(p.cols, 2, MAX_COLS, 10);
  const R = int(p.rows, 1, MAX_ROWS, 6);
  const open = yes(p.open);
  const x0 = open ? W - L : -L;          // the machine's west end
  const w = new RS.World({ strict: true });
  const at = (m, z, t, s) => w.put(x0 + m, 0, z, t, s);
  // Row A (z = 0) and row B (z = 1).
  const parts = [
    at(0, 0, 'stone'), at(1, 0, 'observer', { d: 'W', on: false }), at(2, 0, 'piston', { d: 'E', s: true, ext: false }),
    at(3, 0, 'slime'), at(4, 0, 'slime'), at(5, 0, 'slime'),
    at(0, 1, 'slime'), at(1, 1, 'slime'), at(2, 1, 'slime'), at(3, 1, 'piston', { d: 'W', s: true, ext: false }),
    at(4, 1, 'observer', { d: 'E', on: false }), at(5, 1, 'stone'),
  ];
  const a = parts[2], b = parts[9], west = parts[0], east = parts[11];
  // Stoppers: obsidian one block past each parked position.
  const stoppers = [w.put(-L - 1, 0, 0, 'obsidian'), w.put(-L - 1, 0, 1, 'obsidian'), w.put(W, 0, 0, 'obsidian'), w.put(W, 0, 1, 'obsidian')];
  // Home station (behind a's home cell) and far station (behind b's far cell): button on an observer's face,
  // the observer's back into an obsidian block beside the piston.
  const ax = -L + 2, bx = W - L + 3;
  w.put(ax, -1, 0, 'obsidian');
  w.put(ax - 1, -1, 0, 'observer', { d: 'W', on: false });
  const show = w.put(ax - 2, -1, 0, 'button', { att: 'E', on: false });
  w.put(bx, -1, 1, 'obsidian');
  const closeObserver = w.put(bx + 1, -1, 1, 'observer', { d: 'E', on: false });
  const close = w.put(bx + 2, -1, 1, 'button', { att: 'W', on: false });
  // The panel: rows below the rail, columns 0 .. W - 1.
  const panel = [];
  for (let z = -1; z >= -R; z--) for (let x = 0; x < W; x++) panel.push([x, 0, z]);
  w.seal();
  return {
    world: w,
    box: [-L - 1, W, -1, 0, -R, 1],
    cols: W, rows: R, length: L,
    panel,
    io: { show, close, closeObserver, a, b, west, east, machine: parts, stoppers },
  };
}

// The machine's state from the blocks.
const parkedAt = (c, x0) => c.io.west.x === x0 && c.io.east.x === x0 + L - 1 && !c.io.a.ext && !c.io.b.ext &&
  c.io.machine.every(k => c.world.get(k.x, k.y, k.z) === k);
const isOpen = c => parkedAt(c, c.cols - L);
const isHome = c => parkedAt(c, -L);
const lead = c => c.io.east.x;    // the leading edge: the east end of the machine

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const cols = p => int(p.cols, 2, MAX_COLS, 10);

// Every piston move over a full cycle: the number of blocks it carried.
function moves(p) {
  const c = buildDrawer(p), w = c.world, out = [];
  const off = w.on('move', ev => out.push(ev.blocks.length));
  w.hand.press(c.io.show);
  w.settle(1000);
  w.hand.press(c.io.close);
  w.settle(1000);
  off();
  return out;
}

const entry = Catalogue.register({
  id: 'ui-drawer',
  name: 'Drawer',
  category: 'Disclosure and overlays',
  summary: 'A two-way flying machine of slime, two sticky pistons and two observers flies along a rail across the top of the panel; the panel is the HTML revealed behind its leading edge. A button on an observer at each end gives the 1-tick pulse that starts it.',
  strict: true,
  deviations: [],
  inputs: ['open button (home station)', 'close button (far station)'],
  outputs: ['machine parked at the far end (open)', 'machine parked at home (closed)'],
  actions: ['press the open button', 'press the close button'],
  timing: `The machine starts 2 ticks after a press and moves one block every ${STEP} ticks: open (parked at the far end) ${STEP} x cols + 1 ticks after the open press, home again ${STEP} x cols + 1 ticks after the close press (31 ticks for 10 columns).`,
  notes: [
    'The machine carries the panel\'s leading edge along the top rail only: it is two blocks tall and travels the panel\'s full width (cols blocks); the rest of the panel\'s edge is the edge of the revealed HTML.',
    'Each half of the machine is six blocks, well inside the push limit of 12; the stoppers and stations are obsidian, which slime slides past.',
    'A sticky piston that retracts the tick after it pushed leaves its block behind; that is what lets a and b take turns. A long pulse (a lever, or a button pressed straight onto the piston\'s block) would hold the piston out, make the other half immovable and fly nowhere, so each station turns its button press into a 1-tick observer pulse.',
    'A press while the machine is flying, open at the far end, or close at home moves nothing: the station\'s obsidian is beside a piston only when the machine is parked there.',
    'Home is off the screen\'s west edge: the element places the panel\'s first column at the viewport edge, so the parked machine and its home station are off-screen until it flies in.',
  ],
  params: [
    { key: 'cols', label: 'Panel columns (travel)', min: 2, max: 16, def: 10 },
    { key: 'rows', label: 'Panel rows', min: 1, max: 8, def: 4 },
  ],
  controls: [{ kind: 'button', io: 'show', label: 'Open' }, { kind: 'button', io: 'close', label: 'Close' }],
  build: buildDrawer,
  tests: [
    T(`open parks the machine at the far end after ${STEP} x cols + 1 ticks; close brings it home as fast (every edge)`, () => each(entry, p => {
      const t = ui().testing, c = buildDrawer(p), w = c.world, hand = t.hand(w), W = cols(p);
      if (!isHome(c)) return false;
      hand.press(c.io.show);
      const opened = t.ticksUntil(w, () => isOpen(c), 400);
      t.settle(w, 400);
      hand.press(c.io.close);
      const shut = t.ticksUntil(w, () => isHome(c), 400);
      return opened === STEP * W + 1 && shut === STEP * W + 1 && isOpen(c) === false;
    })),
    T('the leading edge moves east one block at a time, never back, while opening', () => {
      const c = buildDrawer({ cols: 8 }), w = c.world;
      w.hand.press(c.io.show);
      let prev = lead(c), ok = true;
      for (let i = 0; i < 40; i++) { w.tick(); const x = lead(c); ok = ok && (x === prev || x === prev + 1); prev = x; }
      return ok && prev === 7 && isOpen(c);
    }),
    T('a full open/close cycle returns every block to its start, twice (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildDrawer(p), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      for (let k = 0; k < 2; k++) {
        hand.press(c.io.show);
        t.settle(w, 400);
        if (!isOpen(c)) return false;
        hand.press(c.io.close);
        t.settle(w, 400);
      }
      return t.hash(w) === h0;
    })),
    T('built open equals opened: the same blocks after pressing open', () => each(entry, p => {
      const t = ui().testing, a = buildDrawer(p), b = buildDrawer(Object.assign({}, p, { open: true }));
      t.hand(a.world).press(a.io.show);
      t.settle(a.world, 400);
      return t.hash(a.world) === t.hash(b.world);
    })),
    T('presses that do not apply move nothing: open while open, close while closed, close while flying', () => {
      const t = ui().testing, c = buildDrawer({ cols: 6 }), w = c.world, hand = t.hand(w);
      let moved = 0;
      w.on('move', () => moved++);
      hand.press(c.io.close);
      t.settle(w, 400);
      const a = moved === 0 && isHome(c);
      hand.press(c.io.show);
      w.run(6);
      hand.press(c.io.close);
      t.settle(w, 400);
      const b = isOpen(c);
      moved = 0;
      hand.press(c.io.show);
      t.settle(w, 400);
      return a && b && moved === 0 && isOpen(c);
    }),
    T('built closed and built open, the steady state does not drift for 100 ticks', () => each(entry, p => [false, true].every(open => {
      const c = buildDrawer(Object.assign({}, p, { open }));
      return ui().testing.noDrift(c.world, 100) && (open ? isOpen(c) : isHome(c));
    }))),
    T('push limit by construction: every move carries six blocks, one half of the machine', () => each(entry, p => {
      const m = moves(p);
      return m.length === 4 * cols(p) && m.every(n => n === L);
    })),
    T('strict: real blocks only, two pistons', () => each(entry, p => {
      const c = buildDrawer(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 2;
    })),
  ],
});

const api = { isOpen, isHome, lead, L, STEP };
if (N) module.exports = Object.assign({ buildDrawer, entry }, api);
else {
  window.buildDrawer = buildDrawer;
  window.RSDrawer = api;
}
})();
