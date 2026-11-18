// UI contraption for <rs-accordion>: rs-tabs' selector (see tabs.js) with one more band, "none", whose latch holds
// the shutter shut. A vertical list of headers, each a stone button and its label signs, into one bank of D
// latches; the open item's body shows through one opening below the list.
//
// All the selection logic is in one place, so nothing has to travel down a stack of panels: every latch sits in
// the same bank, three rows of floor apart, and the bank's collector reaches every feeder within 14 blocks. Any
// button in unlocks every latch and each copies its own button: pressing an item's button sets its latch and
// resets every other, the none latch included; pressing the none button resets every item. The none band's memory
// repeater has no lamp: it lights a two-block dust step down onto the shutter's piston row, so the curtain stays in
// front of the opening while no item is open. A switch from one item to another closes the shutter for 3 ticks
// (the tabs pulse) while the latches change.
//
// The element maps a click on the open item's header to the none button (the player sees the open item's lamp
// and presses "close"), which gives <details name> semantics: opening one closes the others, clicking the open
// one closes it.
(function () {
const N = typeof module !== 'undefined';
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const RS = N ? require('../../engine.js') : window.RS;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);
const tabs = () => (N ? require('./tabs.js') : window.RSTabs);   // loads after this file in the browser bundle

const MAX = 5;           // items; with the none band, six bands: the bank's limit

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// p: { items, sel (-1: none open), cols, rows, signs, values }
function buildAccordion(p = {}) {
  const t = tabs();
  const items = int(p.items, 2, MAX, 3);
  const n = items + 1;
  const sel = int(p.sel, -1, items - 1, -1);
  const signs = t.signCounts(p.signs, items);
  signs.push(signs[0]);
  const built = t.buildSelector({
    n, none: true,
    sel: sel < 0 ? items : sel,
    cols: int(p.cols, 1, t.MAX_COLS, 8),
    rows: int(p.rows, 1, t.MAX_ROWS, 3),
    signs,
  });
  const io = built.io;
  io.none = io.buttons[items];
  io.noneRow = io[`row${items}`];
  io.noneLabel = io[`label${items}`];
  delete io['b' + items];
  delete io[`row${items}`];
  delete io[`label${items}`];
  built.items = items;
  built.values = Array.isArray(p.values) ? p.values : [];
  return built;
}

// The open item (-1 for none), as the page sees it: an item opens when the opening is clear on its latch, and the
// accordion is closed once the none latch is set behind a shut curtain. Until then the last state holds.
function openItem(built) {
  const t = tabs(), k = t.latched(built.io);
  if (k >= 0 && k < built.items && t.isClear(built)) built.shown = k;
  else if (k === built.items && t.isHome(built)) built.shown = -1;
  return built.shown;
}

// A header click: the open item's header presses the none button; any other header presses its own.
function pressHeader(hand, io, built, k) {
  return tabs().pressBand(hand, io, built, openItem(built) === k ? built.items : k);
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const trace = (c, button, ticks = 30) => {
  const w = c.world, out = [];
  ui().testing.hand(w).press(button);
  for (let i = 1; i <= ticks; i++) {
    w.tick();
    out.push({ t: i, open: openItem(c), clear: tabs().isClear(c), home: tabs().isHome(c) });
  }
  ui().testing.settle(w);
  return out;
};
const firstAt = (tr, f) => (tr.find(f) || { t: -1 }).t;

const entry = Catalogue.register({
  id: 'ui-accordion',
  name: 'Accordion',
  category: 'Disclosure and overlays',
  summary: 'rs-tabs\' latch bank with one more band, "none": a stone button per item, all into one bank of D latches, so setting one resets the others. The none latch lights the shutter\'s piston row, so the honey and slime curtain covers the opening below the list until an item is chosen; switching items closes it for the latches to change.',
  strict: true,
  deviations: [],
  inputs: ['one stone button per item', 'the none button'],
  outputs: ['one latch per item, plus none (exactly one on)', 'opening clear'],
  actions: ['press a button'],
  timing: 'From any state, a press on an item\'s button: the curtain is in front of the opening at 4 ticks, the latches change at 5 and the item\'s body is clear at 7. The none button: the curtain is home at 4 and stays. The same for every item: all the latches are in one bank, so nothing travels down the list.',
  notes: [
    'Exclusivity is rs-radio\'s latch bank: any button in unlocks every latch and each copies its own button.',
    'The none band\'s memory repeater lights a dust step two blocks down onto the piston row, beside the pulse feed, so the curtain is held shut while it is set.',
    'The element presses the none button when the open item\'s header is clicked (the player sees its lamp lit), and the item\'s own button otherwise.',
    'Two to five items: with the none band that is six bands, the most the collector reaches within 14 blocks.',
    'Build with { sel: k } for item k open, -1 (default) for none.',
  ],
  params: [
    { key: 'items', label: 'Items', min: 2, max: MAX, def: 3 },
    { key: 'cols', label: 'Opening columns', min: 1, max: 14, def: 8 },
    { key: 'rows', label: 'Opening rows', min: 1, max: 12, def: 3 },
    { key: 'signs', label: 'Signs per label', min: 1, max: 5, def: 3 },
  ],
  controls: [{ kind: 'button', io: 'b0', label: 'Item 1' }, { kind: 'button', io: 'b1', label: 'Item 2' }, { kind: 'button', io: 'none', label: 'None' }],
  build: buildAccordion,
  tests: [
    T('open, switch and close: shut at 4, latches at 5, clear at 7; closing stays shut (every edge)', () => each(entry, p => {
      const c = buildAccordion(p), items = c.items;
      ui().testing.settle(c.world);
      if (openItem(c) !== -1 || !tabs().isHome(c)) return false;
      for (const k of [0, items - 1]) {
        const tr = trace(c, c.io.buttons[k]);
        if (firstAt(tr, s => s.open === k) !== 7 || firstAt(tr, s => s.t > 3 && s.clear) !== 7) return false;
        if (tr.some(s => s.t >= 4 && s.t < 7 && s.clear)) return false;
      }
      const tr = trace(c, c.io.none);
      return firstAt(tr, s => s.open === -1) === 5 && tr.every(s => s.t < 4 || s.home);
    })),
    T('a header click on the open item presses none; on another item, its own button', () => {
      const c = buildAccordion({ items: 4, sel: 2 }), w = c.world, hand = ui().testing.hand(w);
      pressHeader(hand, c.io, c, 2);
      ui().testing.settle(w);
      const closed = openItem(c) === -1;
      pressHeader(hand, c.io, c, 1);
      ui().testing.settle(w);
      return closed && openItem(c) === 1 && c.io.none.on === false;
    }),
    T('a second press 1 to 12 ticks after the first wins, every pair including none', () => [2, 5].every(items => {
      for (let i = 0; i <= items; i++) for (let j = 0; j <= items; j++) for (let g = 1; g <= 12; g++) {
        if (i === j) continue;
        const c = buildAccordion({ items, sel: 0 }), w = c.world, hand = ui().testing.hand(w);
        hand.press(c.io.buttons[i]);
        w.run(g);
        hand.press(c.io.buttons[j]);
        ui().testing.settle(w);
        const want = j === items ? -1 : j;
        if (openItem(c) !== want || tabs().isClear(c) !== (want >= 0)) throw new Error(`items=${items} ${i} then ${j} after ${g}`);
      }
      return true;
    })),
    T('a full cycle returns every block to its start', () => each(entry, p => {
      const c = buildAccordion(p), w = c.world;
      const h0 = ui().testing.hash(w);
      for (let k = c.items - 1; k >= 0; k--) trace(c, c.io.buttons[k], 1);
      trace(c, c.io.none, 1);
      return ui().testing.hash(w) === h0;
    })),
    T('the built steady state does not drift for 100 ticks (none and every item open)', () => each(entry, p => {
      const items = int(p.items, 2, MAX, 3);
      for (let s = -1; s < items; s++) {
        const c = buildAccordion(Object.assign({}, p, { sel: s }));
        if (!ui().testing.noDrift(c.world, 100) || openItem(c) !== s || tabs().isClear(c) !== (s >= 0)) return false;
      }
      return true;
    })),
    T('push limit by construction: each piston moves exactly its own column (rows <= 12), both ways', () => each(entry, p => {
      const c = buildAccordion(Object.assign({}, p, { sel: 0 }));
      const moves = tabs().columnMoves(c, 1);
      return moves.length === 2 * c.io.pistons.length && moves.every(m => m === int(p.rows, 1, 12, 3) && m <= 12);
    })),
    T('strict: real blocks only, no wiring links, one piston per column', () => each(entry, p => {
      const c = buildAccordion(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === int(p.cols, 1, 14, 8);
    })),
  ],
});

const api = { buildAccordion, openItem, pressHeader, MAX };
if (N) module.exports = Object.assign({ entry }, api);
else {
  window.buildAccordion = buildAccordion;
  window.RSAccordion = api;
}
})();
