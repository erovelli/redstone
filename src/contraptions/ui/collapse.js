// UI contraption for <rs-collapse> (and the curtain that <rs-accordion> and <rs-spoiler> reuse): a curtain of
// honey and slime columns over an opening of any size, pulled back into the wall by one sticky piston per column.
//
// Honey sticks to honey and slime to slime, but not to each other, so alternating columns are separate
// structures: one sticky piston behind the top block of a column pulls the whole column (R blocks, R <= 12)
// one block back into the wall, and the opening in front is clear. Every block a column touches while it
// moves is glazed terracotta (push_only: never dragged), air, the column's own piston, or the other material.
//
// The pistons hold the curtain closed while they are powered: a dust line lies on top of the piston row and a
// redstone wall torch at its west end powers it. The lever (or a pressure plate, for the spoiler) on the block
// that torch hangs on turns the torch off, the dust goes dark, and every piston pulls its column back.
//
//   front view (x east, z up), C columns, R rows; y = 1 is the front plane:
//     z=2       lever  [signs on the planks rim, y = 0 / -1]
//     z=1       F  F F F ... F  F          F: white glazed terracotta frame
//     z=0..1-R  F  h s h ... s  F          h, s: honey and slime curtain columns
//     z=-R      F  F F F ... F  F
//   section through a column (y: 1 front, 0 pocket, -1 back), top rows:
//     z=2   .      .      planks rim (signs hang on it at y = 0)
//     z=1   F      .      dust (on the piston)          column x = 0: stone at y = 0 with the lever on top,
//     z=0   cover  head   sticky piston facing south                      the torch on its back at y = -1
//     z<0   cover  .      .
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const MAX_COLS = 15;   // the torch gives the dust 15; the last piston sits on level 1
const MAX_ROWS = 12;   // a column is one structure: at most 12 blocks for its piston
const FRAME = { t: 'terracotta', color: 'white', d: 'N' };

const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// The curtain machine. o: { cols, rows, signs, open, trigger: 'lever' | 'plate' }. Builds into world w with its
// top-left frame block at x = x0 and the top opening row at z = z0, and returns the parts.
function addCurtain(w, o) {
  const C = o.cols, R = o.rows, open = !!o.open;
  const x0 = o.x0 || 0, z0 = o.z0 || 0;
  const zb = z0 - R + 1;                   // bottom opening row
  const put = (x, y, z, t, s) => w.put(x0 + x, y, z, t, Object.assign({}, s));
  // Frame: the left and right columns at y = 1 and 0, the top row at y = 1, the bottom row at y = 1 and 0.
  for (let z = zb - 1; z <= z0 + 1; z++) {
    put(0, 1, z, FRAME.t, FRAME);
    put(C + 1, 1, z, FRAME.t, FRAME);
    put(C + 1, 0, z, FRAME.t, FRAME);
    if (z <= z0) put(0, 0, z, FRAME.t, FRAME);
  }
  for (let x = 1; x <= C; x++) {
    put(x, 1, z0 + 1, FRAME.t, FRAME);
    put(x, 0, z0 + 1, FRAME.t, FRAME);     // hides the dust from the front; the top cover touches it, so push_only
    put(x, 1, zb - 1, FRAME.t, FRAME);
    put(x, 0, zb - 1, FRAME.t, FRAME);
  }
  // The trigger block, its torch (lit while closed) and the trigger on top.
  const base = put(0, 0, z0 + 1, 'stone');
  const torch = put(0, -1, z0 + 1, 'torch', { att: 'S', lit: !open });
  const trigger = o.trigger === 'plate'
    ? put(0, 0, z0 + 2, 'plate', { on: open })
    : put(0, 0, z0 + 2, 'lever', { att: 'D', on: open });
  // Columns: piston, head (closed), curtain, and the dust on the piston.
  const pistons = [], covers = [], opening = [], dust = [];
  for (let x = 1; x <= C; x++) {
    const p = put(x, -1, z0, 'piston', { d: 'S', s: true, ext: !open });
    pistons.push(p);
    if (!open) put(x, 0, z0, 'head', { d: 'S', s: true, p });
    for (let z = zb; z <= z0; z++) {
      covers.push(put(x, open ? 0 : 1, z, x % 2 ? 'honey' : 'slime'));
      opening.push([x0 + x, 1, z]);
    }
    dust.push(put(x, -1, z0 + 1, 'dust', { lvl: open ? 0 : 16 - x }));
  }
  // The rim over the wiring, and the label signs hanging on it.
  const rim = [], signs = [];
  for (let x = 0; x <= C + 1; x++) rim.push(put(x, -1, z0 + 2, 'planks'));
  const n = Math.min(o.signs || 0, C + 1);
  for (let x = 1; x <= n; x++) signs.push(put(x, 0, z0 + 2, 'sign', { att: 'N', kind: 'wall', text: '' }));
  return { trigger, base, torch, pistons, covers, dust, rim, signs, opening, cols: C, rows: R, x0, z0, zb };
}

// The curtain's state from the blocks: open (every opening cell empty) and home (every cell holds its cover).
const isOpen = (world, cells) => cells.every(([x, y, z]) => !world.get(x, y, z));
const isHome = (world, cells) => cells.every(([x, y, z]) => { const b = world.get(x, y, z); return !!b && (b.t === 'honey' || b.t === 'slime'); });

function buildCollapse(p = {}) {
  const cols = int(p.cols, 1, MAX_COLS, 8);
  const rows = int(p.rows, 1, MAX_ROWS, 3);
  const signs = int(p.signs, 0, MAX_COLS + 1, 3);
  const w = new RS.World({ strict: true });
  const c = addCurtain(w, { cols, rows, signs, open: yes(p.open), trigger: 'lever' });
  w.seal();
  return {
    world: w,
    box: [0, cols + 1, -1, 1, c.zb - 1, 2],
    opening: c.opening,
    // The rows the element shows while the curtain is home and the lever off: the bullet row and the top frame.
    closedRows: 2,
    io: { lever: c.trigger, torch: c.torch, pistons: c.pistons, covers: c.covers, signs: c.signs },
  };
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

// Push limit: the number of blocks every piston move carries over a full open/close cycle (from the engine's
// move events), and whether each moved block stayed in its own piston's column.
function pushCounts(build, p, cycle) {
  const c = build(p);
  const w = c.world, hand = w.hand, out = [];
  w.settle();
  const off = w.on('move', ev => out.push(ev.blocks.every(b => b.x === ev.piston.x) ? ev.blocks.length : 99));
  (cycle || (() => { hand.flip(c.io.lever); w.settle(); hand.flip(c.io.lever); w.settle(); }))(c, w, hand);
  off();
  return out;
}

const entry = Catalogue.register({
  id: 'ui-collapse',
  name: 'Collapse',
  category: 'Disclosure and overlays',
  summary: 'A lever turns off a wall torch; the dust line on top of the piston row goes dark, and one sticky piston per column pulls a honey or slime column of the curtain back into the wall. The body is the HTML behind the opening.',
  strict: true,
  deviations: [],
  inputs: ['lever'],
  outputs: ['opening clear', 'curtain home'],
  actions: ['flip the lever'],
  timing: 'Opening clear 2 ticks after the lever is flipped on (the torch flips, then the pistons pull); curtain home 2 ticks after it is flipped off.',
  notes: [
    'Columns alternate honey and slime, which do not stick to each other, so each piston moves only its own column: rows blocks, at most 12.',
    'Every block a moving column touches is glazed terracotta (pushed, never pulled), air, its own piston, or the other material.',
    'The dust line is fed by the torch at the west end at 15 and loses one level per column, so at most 15 columns.',
    'Build with { open: true } for a collapse that starts open: the lever on, the torch out, the columns back in the wall.',
    'The element shows only the top two rows (lever, label signs, top frame) while the lever is off and the curtain is home; the curtain rows below are not part of the page layout then. Inspect mode always shows the whole machine.',
  ],
  params: [
    { key: 'cols', label: 'Columns', min: 1, max: MAX_COLS, def: 8 },
    { key: 'rows', label: 'Rows', min: 1, max: MAX_ROWS, def: 3 },
    { key: 'signs', label: 'Label signs', min: 0, max: 4, def: 3 },
  ],
  controls: [{ kind: 'lever', io: 'lever', label: 'Lever' }],
  build: buildCollapse,
  tests: [
    T('the opening clears 2 ticks after the flip and closes 2 ticks after flipping back (every edge)', () => each(entry, p => {
      const t = ui().testing, c = buildCollapse(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      if (!isHome(w, c.opening)) return false;
      hand.flip(c.io.lever);
      const open = t.ticksUntil(w, () => isOpen(w, c.opening), 20);
      t.settle(w);
      hand.flip(c.io.lever);
      const shut = t.ticksUntil(w, () => isHome(w, c.opening), 20);
      return open === 2 && shut === 2;
    })),
    T('a full open/close cycle returns every block to its start, twice', () => each(entry, p => {
      const t = ui().testing, c = buildCollapse(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      const h0 = t.hash(w);
      for (let k = 0; k < 2; k++) {
        hand.flip(c.io.lever);
        t.settle(w);
        if (!isOpen(w, c.opening)) return false;
        hand.flip(c.io.lever);
        t.settle(w);
      }
      return t.hash(w) === h0;
    })),
    T('built closed and built open, the steady state does not drift for 100 ticks', () => each(entry, p => [false, true].every(open => {
      const c = buildCollapse(Object.assign({}, p, { open }));
      return ui().testing.noDrift(c.world, 100) && (open ? isOpen(c.world, c.opening) : isHome(c.world, c.opening));
    }))),
    T('built open equals opened: the same blocks after flipping the lever on', () => each(entry, p => {
      const t = ui().testing, a = buildCollapse(p), b = buildCollapse(Object.assign({}, p, { open: true }));
      t.hand(a.world).flip(a.io.lever);
      t.settle(a.world);
      return t.hash(a.world) === t.hash(b.world);
    })),
    T('push limit by construction: each piston moves exactly its own column (rows <= 12), both ways', () => each(entry, p => {
      const rows = int(p.rows, 1, MAX_ROWS, 3);
      const moves = pushCounts(buildCollapse, p);
      return moves.length === 2 * int(p.cols, 1, MAX_COLS, 8) && moves.every(n => n === rows && n <= 12);
    })),
    T('strict: real blocks only, no wiring links, one piston per column', () => each(entry, p => {
      const c = buildCollapse(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === int(p.cols, 1, MAX_COLS, 8);
    })),
  ],
});

const api = { addCurtain, isOpen, isHome, pushCounts, MAX_COLS, MAX_ROWS };
if (N) module.exports = Object.assign({ buildCollapse, entry }, api);
else {
  window.buildCollapse = buildCollapse;
  window.RSCurtain = api;
}
})();
