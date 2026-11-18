// UI contraption for <rs-dropdown>: a menu behind a honey and slime door, opened and closed by a copper bulb.
//
// The door is the modal's (see modal.js): one sticky piston per column holds a honey or slime column in front of
// the opening while the dust line on top of the piston row is lit; the frame is obsidian. Here the opening is the
// menu: one row per item.
//
// The menu button sits on top of a waxed copper bulb, a one-block T flip-flop: each press (a rising edge) toggles
// it. A comparator reads the bulb (15 while lit) and strongly powers block A; the redstone wall torch on A is the
// dust line's source. So: bulb lit -> A powered -> the torch goes out -> the dust goes dark -> every piston pulls its
// column back and the menu shows. The next press unlights the bulb, the torch relights and the door shuts.
//
//   east end, plan at z = 1 (x = E is the frame's east column, y = 1 the front plane):
//            x=C     E             E+1   E+2                    E+3
//     y=-1   dust    torch (on A)  A     comparator (facing W)  copper bulb, the menu button on top (z = 2)
//   z = 2: the rim (planks, x = 0..C, y = -1) with the label signs hanging on its front.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const MAX_COLS = 14;   // the torch gives the dust 15 at x = C; the last piston, at x = 1, sits on level 16 - C - 1
const MAX_ROWS = 12;   // a column is one structure: at most 12 blocks for its piston
const FRAME = 'obsidian';

const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildDropdown(p = {}) {
  const C = int(p.cols, 1, MAX_COLS, 6);
  const R = int(p.rows, 1, MAX_ROWS, 3);
  const signs = int(p.signs, 0, MAX_COLS, 3);
  const open = yes(p.open);
  const E = C + 1, zb = 1 - R;
  const w = new RS.World({ strict: true });

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
  const pistons = [], covers = [], opening = [];
  for (let x = 1; x <= C; x++) {
    const piston = w.put(x, -1, 0, 'piston', { d: 'S', s: true, ext: !open });
    pistons.push(piston);
    if (!open) w.put(x, 0, 0, 'head', { d: 'S', s: true, p: piston });
    for (let z = zb; z <= 0; z++) {
      covers.push(w.put(x, open ? 0 : 1, z, x % 2 ? 'honey' : 'slime'));
      opening.push([x, 1, z]);
    }
    w.put(x, -1, 1, 'dust', { lvl: open ? 0 : 15 - (E - x) });
  }
  for (let x = 0; x <= C; x++) w.put(x, -1, 2, 'planks');
  const signBlocks = [];
  for (let x = 0; x < Math.min(signs, C + 1); x++) signBlocks.push(w.put(x, 0, 2, 'sign', { att: 'N', kind: 'wall', text: '' }));

  // The flip-flop and the inverter.
  const torch = w.put(E, -1, 1, 'torch', { att: 'E', lit: !open });
  const A = w.put(E + 1, -1, 1, 'planks');
  w.put(E + 2, -1, 0, FRAME);
  const comparator = w.put(E + 2, -1, 1, 'comparator', { d: 'W', mode: 'cmp', out: open ? 15 : 0 });
  const bulb = w.put(E + 3, -1, 1, 'bulb', { lit: open, powered: false });
  const button = w.put(E + 3, -1, 2, 'button', { att: 'D', on: false });

  w.seal();
  return {
    world: w,
    box: [0, E + 3, -1, 1, zb - 1, 2],
    opening,
    io: { button, bulb, comparator, A, torch, pistons, covers, signs: signBlocks },
  };
}

const isOpen = c => c.opening.every(([x, y, z]) => !c.world.get(x, y, z));
const isHome = c => c.opening.every(([x, y, z]) => {
  const b = c.world.get(x, y, z);
  return !!b && (b.t === 'honey' || b.t === 'slime');
});

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

const entry = Catalogue.register({
  id: 'ui-dropdown',
  name: 'Dropdown menu',
  category: 'Disclosure and overlays',
  summary: 'The menu button sits on a copper bulb, a one-block T flip-flop. A comparator reads the lit bulb and puts out the torch that lights the piston row; the pistons pull the honey and slime door back off the menu. The next press unlights the bulb and the door shuts.',
  strict: true,
  deviations: [],
  inputs: ['menu button'],
  outputs: ['door clear', 'door home'],
  actions: ['press the menu button'],
  timing: 'Door clear 4 ticks after a press that lights the bulb (bulb, comparator, torch, pistons); home 4 ticks after a press that unlights it. The button stays in for 10 ticks; a press while it is in does nothing.',
  notes: [
    'A copper bulb toggles on each rising edge of its power, so one press is one toggle however long the button stays in.',
    'The comparator strongly powers A; the torch on A is the dust line\'s only source, at 15, so at most 14 columns.',
    'Columns alternate honey and slime: each piston moves only its own column, at most 12 blocks.',
    'Build with { open: true } for a menu that starts open: the bulb lit, the torch out, the columns back.',
    'A stone button stays in for 10 ticks, so for the first second after opening a choice (which presses the same button) does nothing: the machine cannot take the press. The element passes it on and counts the choice only if the press went in.',
  ],
  params: [
    { key: 'cols', label: 'Columns', min: 1, max: MAX_COLS, def: 6 },
    { key: 'rows', label: 'Items (rows)', min: 1, max: MAX_ROWS, def: 3 },
    { key: 'signs', label: 'Label signs', min: 0, max: 4, def: 3 },
  ],
  controls: [{ kind: 'button', io: 'button', label: 'Menu button' }],
  build: buildDropdown,
  tests: [
    T('a press opens the door on tick 4; the next press shuts it on tick 4 (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildDropdown(p), w = c.world, hand = t.hand(w);
      if (!isHome(c) || c.io.bulb.lit) return false;
      hand.press(c.io.button);
      const opened = t.ticksUntil(w, () => isOpen(c), 20);
      t.settle(w);
      hand.press(c.io.button);
      const shut = t.ticksUntil(w, () => isHome(c), 20);
      return opened === 4 && shut === 4;
    })),
    T('one press is one toggle: the door stays open after the button lets go, and a press while it is in does nothing', () => {
      const t = ui().testing, c = buildDropdown({}), w = c.world, hand = t.hand(w);
      hand.press(c.io.button);
      w.run(6);
      const second = hand.press(c.io.button);
      t.settle(w);
      return !second && isOpen(c) && c.io.bulb.lit;
    }),
    T('a full open/close cycle returns every block to its start, twice (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildDropdown(p), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      for (let k = 0; k < 2; k++) {
        hand.press(c.io.button);
        t.settle(w);
        if (!isOpen(c)) return false;
        hand.press(c.io.button);
        t.settle(w);
      }
      return t.hash(w) === h0;
    })),
    T('built closed and built open, the steady state does not drift for 100 ticks', () => each(entry, p => [false, true].every(open => {
      const c = buildDropdown(Object.assign({}, p, { open }));
      return ui().testing.noDrift(c.world, 100) && (open ? isOpen(c) : isHome(c));
    }))),
    T('built open equals opened: the same blocks after one press', () => each(entry, p => {
      const t = ui().testing, a = buildDropdown(p), b = buildDropdown(Object.assign({}, p, { open: true }));
      t.hand(a.world).press(a.io.button);
      t.settle(a.world);
      return t.hash(a.world) === t.hash(b.world);
    })),
    T('push limit by construction: each piston moves exactly its own column, both ways', () => each(entry, p => {
      const t = ui().testing, c = buildDropdown(p), w = c.world, hand = t.hand(w), sizes = [];
      w.on('move', ev => sizes.push(ev.blocks.every(b => b.x === ev.piston.x) ? ev.blocks.length : 99));
      hand.press(c.io.button);
      t.settle(w);
      hand.press(c.io.button);
      t.settle(w);
      const rows = int(p.rows, 1, MAX_ROWS, 3);
      return sizes.length === 2 * c.io.pistons.length && sizes.every(k => k === rows && k <= 12);
    })),
    T('strict: real blocks only, no wiring links, one piston per column', () => each(entry, p => {
      const c = buildDropdown(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === int(p.cols, 1, MAX_COLS, 6);
    })),
  ],
});

if (N) module.exports = { buildDropdown, isOpen, isHome, entry };
else window.buildDropdown = buildDropdown;
})();
