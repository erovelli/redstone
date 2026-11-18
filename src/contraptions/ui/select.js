// UI contraption for <rs-select>: a lectern holds the choice, a copper bulb opens and closes the list.
//
// The book on the lectern has one page per option; the page it lies open at is the chosen option, and a comparator
// reads it (floor(14 p / (pages - 1)) + 1, a different strength for every page of a book of up to 15 pages).
// Opening the list is a stone button on a waxed copper bulb (a one-block T flip-flop, as in rs-checkbox): a second
// comparator reads the lit bulb and powers the trigger block of rs-collapse's curtain, its torch goes out, and the
// pistons pull the honey and slime columns back off the opening, where the options show as HTML (SPEC I3).
// Choosing an option turns the lectern's page; a page turn sends a 1-tick pulse into the bulb next to the lectern,
// so the bulb toggles off and the curtain closes again by itself. Escape (or a second press) closes it unchosen.
//
//   front view (x east, z up); the control row is at y = 0, the button hangs on the bulb's front (y = 1):
//     z=2                                   rim (planks, y = -1)
//     z=1   dust <C2 [lectern] [bulb] C1> [base] F F F F F       base: the curtain's trigger block, torch behind it
//     z=0   planks planks planks planks planks  F h s h s ... F   the opening: one row per option (at most 8)
//     z<0                                       F h s h s ... F
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);
const curtain = () => (N ? require('./collapse.js') : window.RSCurtain);

const MAX = 15;        // a lectern gives up to 15 pages different comparator strengths
const MAX_ROWS = 8;    // the opening shows at most 8 rows; a longer list scrolls inside it
const X = 5;           // the curtain's left frame column (the control row is x = 0 to 4)

const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// What a comparator reads from a lectern whose book has `pages` pages, open at page p (0-based).
const levelOf = (p, pages) => (pages > 1 ? Math.floor((14 * p) / (pages - 1)) + 1 : 15);
// The page a comparator strength stands for (-1: no book).
function pageOf(level, pages) {
  for (let p = 0; p < pages; p++) if (levelOf(p, pages) === level) return p;
  return -1;
}

function buildSelect(p = {}) {
  const values = Array.isArray(p.values) ? p.values.slice(0, MAX) : null;
  const n = values && values.length ? values.length : int(p.options, 1, MAX, 3);
  let sel = values ? values.indexOf(p.value === undefined || p.value === null ? null : String(p.value)) : -1;
  if (sel < 0) sel = int(p.selected, 0, n - 1, 0);
  sel = int(p.sel, 0, n - 1, sel);
  const cols = int(p.cols, 2, curtain().MAX_COLS, 4);
  const rows = Math.min(n, MAX_ROWS);
  const open = yes(p.open);
  const w = new RS.World({ strict: true });
  const c = curtain().addCurtain(w, { cols, rows, signs: 0, open, trigger: 'lever', x0: X, z0: 0 });
  w.set(c.trigger.x, c.trigger.y, c.trigger.z, null);   // build phase: this curtain is worked by C1, not a lever
  for (let x = 0; x < X; x++) w.put(x, 0, 0, 'planks');
  const level = levelOf(sel, n);
  const lead = w.put(0, 0, 1, 'dust', { lvl: level });
  const reader = w.put(1, 0, 1, 'comparator', { d: 'W', mode: 'cmp', out: level });
  const lectern = w.put(2, 0, 1, 'lectern', { d: 'S', page: sel, pages: n });
  const bulb = w.put(3, 0, 1, 'bulb', { lit: open });
  const button = w.put(3, 1, 1, 'button', { att: 'N', on: false });
  const opener = w.put(4, 0, 1, 'comparator', { d: 'E', mode: 'cmp', out: open ? 15 : 0 });
  w.settle();   // derived state (dust shapes, torch and dust on the piston row) as the engine settles it
  w.seal();
  const built = {
    world: w,
    box: [0, X + cols + 1, -1, 1, c.zb - 1, 2],
    opening: c.opening,
    options: n,
    values: values || [],
    active: sel,                 // the option the keyboard is on while the list is open (rs-select)
    io: { button, bulb, opener, lectern, reader, lead, pistons: c.pistons, torch: c.torch, row: [lead, reader, lectern, bulb, button, opener] },
  };
  Object.assign(built, playerOf(built));
  return built;
}

// What the player does, as functions of the built machine (the element calls these with world.hand).
function playerOf(b) {
  const { button, bulb, lectern, reader } = b.io;
  const w = b.world;
  // A player's press while the button is still in from the last press does nothing (hand.press returns false),
  // and a page turn then has its pulse lost in the button's power (the bulb sees no rising edge, the list stays
  // open on the new page). The element passes every action on as it comes; only a page request waits.
  const toggle = hand => {
    if (!bulb.lit && !button.on) b.active = Math.max(0, pageOf(reader.out || 0, b.options));
    return hand.press(button);
  };
  // The player waits: the world runs until it is quiet. Used only between the separate actions of a page request.
  const wait = () => {
    if (!w.quiet) w.settle();
  };
  return {
    toggle,
    choice: () => pageOf(reader.out || 0, b.options),
    // Choose option k from the open list: turn to its page (the pulse closes the list), or, if the book is
    // already open there, close the list with the button.
    choose(hand, k) {
      if (!(k >= 0 && k < b.options)) return false;
      if ((lectern.page || 0) !== k) return hand.page(lectern, k);
      return bulb.lit ? toggle(hand) : false;
    },
    // Page code setting the value (el.value = v), which settles at once like a native property: the player waits
    // for a quiet world, turns the page and, if the list was closed (the pulse opened it), waits again and presses
    // it shut. Each is a separate player action on a quiet world.
    pick(hand, k) {
      if (!(k >= 0 && k < b.options) || (lectern.page || 0) === k) return false;
      wait();
      const wasOpen = !!bulb.lit;
      hand.page(lectern, k);
      if (wasOpen) return true;
      wait();
      return toggle(hand);
    },
  };
}

const isOpen = b => curtain().isOpen(b.world, b.opening);
const isHome = b => curtain().isHome(b.world, b.opening);
const chosen = b => pageOf(b.io.reader.out || 0, b.options);

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

const entry = Catalogue.register({
  id: 'ui-select',
  name: 'Select',
  category: 'Form controls',
  summary: 'The book on a lectern has a page per option and a comparator reads which page it lies open at. A stone button on a copper bulb (a T flip-flop) opens a curtain over the list; turning the page to an option pulses the bulb from the lectern, so the curtain closes again by itself.',
  strict: true,
  deviations: [],
  inputs: ['stone button (open, close)', 'lectern page (choose)'],
  outputs: ['comparator strength (the chosen page)', 'opening clear (list open)'],
  actions: ['press the button', 'turn the lectern\'s page'],
  timing: 'The list is open 3 to 4 ticks after the press (the last columns let go a tick after the first) and closed 3 to 4 ticks after a page turn (or a second press); the comparator reads the new page 2 ticks after the turn.',
  notes: [
    'A book of up to 15 pages gives every page its own comparator strength, so a select has 1 to 15 options. The opening shows up to 8 rows; a longer list scrolls inside it.',
    'The lectern\'s page-turn pulse (1 tick, to every side) reaches the bulb beside it; the bulb toggles on the rising edge, so a choice closes the list. Turning to the page it is already open at is no turn (no pulse): the element presses the button instead.',
    'A stone button stays in for 10 ticks: a press while it is in does nothing, and a page turn then is lost too (the bulb is already powered, so the pulse is no rising edge): the list stays open on the new page. The element passes each action on as it comes, as a player could make it.',
    'The player waits (audited): a page request (el.value = v) settles at once, like a native property, so it is three separate player actions, each on a quiet world: wait, turn the page, and, if the list was closed (the pulse opened it), wait again and press the button.',
    'The curtain is rs-collapse\'s (honey and slime columns, one sticky piston each, at most 12 blocks per move); its lever is replaced by the comparator C1 that reads the bulb.',
    'Build with { values, value } (the element) or { options, sel } (the workbench), and { open: true } for a list that starts open.',
  ],
  params: [
    { key: 'options', label: 'Options (book pages)', min: 1, max: MAX, def: 3 },
    { key: 'cols', label: 'Columns', min: 2, max: 15, def: 4 },
  ],
  controls: [
    { kind: 'button', io: 'button', label: 'Open / close' },
    { kind: 'action', label: 'Turn to the next page', fn: built => built.world.hand.page(built.io.lectern, ((built.io.lectern.page || 0) + 1) % built.options) },
  ],
  build: buildSelect,
  tests: [
    T('a press opens the list in 3 or 4 ticks; a page turn reads in 2 and closes it in 3 or 4 (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildSelect(p), w = c.world, hand = t.hand(w);
      if (!isHome(c) || chosen(c) !== 0) return false;
      hand.press(c.io.button);
      const opened = t.ticksUntil(w, () => isOpen(c), 10);
      if (opened < 3 || opened > 4) return false;
      t.settle(w);
      if (c.options === 1) return true;
      const k = c.options - 1;
      hand.page(c.io.lectern, k);
      let read = -1, shut = -1;
      for (let i = 1; i <= 10; i++) {
        w.tick();
        if (read < 0 && chosen(c) === k) read = i;
        if (shut < 0 && isHome(c)) shut = i;
      }
      t.settle(w);
      return read === 2 && shut >= 3 && shut <= 4 && chosen(c) === k && !c.io.bulb.lit;
    })),
    T('every page of a book of 1 to 15 pages has its own comparator strength', () => {
      for (let n = 1; n <= MAX; n++) {
        const seen = new Set();
        for (let q = 0; q < n; q++) seen.add(levelOf(q, n));
        if (seen.size !== n || [...seen].some(l => l < 1 || l > 15)) return false;
        for (let q = 0; q < n; q++) if (pageOf(levelOf(q, n), n) !== q) return false;
      }
      return true;
    }),
    T('every option of a 15-page book can be chosen: open, turn, closed', () => {
      const t = ui().testing, c = buildSelect({ options: MAX }), w = c.world, hand = t.hand(w);
      for (const k of [14, 3, 0, 7]) {
        hand.press(c.io.button);
        t.settle(w);
        if (!isOpen(c)) return false;
        hand.page(c.io.lectern, k);
        t.settle(w);
        if (!isHome(c) || chosen(c) !== k) return false;
      }
      return true;
    }),
    T('a second press closes the list without a choice', () => {
      const t = ui().testing, c = buildSelect({ options: 4, sel: 2 }), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      hand.press(c.io.button);
      t.settle(w);
      const opened = isOpen(c);
      hand.press(c.io.button);
      t.settle(w);
      return opened && isHome(c) && chosen(c) === 2 && t.hash(w) === h0;
    }),
    T('a full cycle (open, choose, open, choose the first page) returns every block to its start', () => each(entry, p => {
      const t = ui().testing, c = buildSelect(p), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      hand.press(c.io.button);
      t.settle(w);
      if (c.options > 1) {
        hand.page(c.io.lectern, c.options - 1);
        t.settle(w);
        hand.press(c.io.button);
        t.settle(w);
        hand.page(c.io.lectern, 0);
      } else hand.press(c.io.button);
      t.settle(w);
      return t.hash(w) === h0;
    })),
    T('built closed and open, at every page, the steady state does not drift for 100 ticks', () => each(entry, p => [false, true].every(open => {
      const n = int(p.options, 1, MAX, 3);
      return [0, n - 1].every(sel => {
        const c = buildSelect(Object.assign({}, p, { open, sel }));
        return ui().testing.noDrift(c.world, 100) && chosen(c) === sel && (open ? isOpen(c) : isHome(c));
      });
    }))),
    T('built open equals opened', () => each(entry, p => {
      const t = ui().testing, a = buildSelect(p), b = buildSelect(Object.assign({}, p, { open: true }));
      t.hand(a.world).press(a.io.button);
      t.settle(a.world);
      return t.hash(a.world) === t.hash(b.world);
    })),
    T('push limit by construction: each piston moves exactly its own column, both ways', () => each(entry, p => {
      const moves = curtain().pushCounts(buildSelect, p, (c, w, hand) => { hand.press(c.io.button); w.settle(); hand.press(c.io.button); w.settle(); });
      const c = buildSelect(p);
      return moves.length === 2 * c.io.pistons.length && moves.every(k => k === Math.min(c.options, MAX_ROWS) && k <= 12);
    })),
    T('strict: real blocks only, no wiring links, one piston per column', () => each(entry, p => {
      const c = buildSelect(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === int(p.cols, 2, 15, 4);
    })),
  ],
});

const api = { buildSelect, levelOf, pageOf, chosen, isOpen, isHome, MAX, MAX_ROWS };
if (N) module.exports = Object.assign({ entry }, api);
else window.RSSelect = api;
})();
