// UI contraption for <rs-pagination>: a lectern holding a book of P pages, a comparator reading it, and a row of
// lamps in front of a dust line that shows which page is open.
//
// A lectern's comparator output is floor(14 * page / (P - 1)) + 1 for page 0 to P - 1: 1 on the first page, 15 on
// the last, a different level for every page while P <= 15. The comparator lights a straight line of 15 dust
// lying on stone. Page k's repeater sits beside the dust block that is level(k) blocks along, so it is on while
// the open page is k or later, and lights page k's lamp in front of it: the lit lamps count the pages up to the open
// one. Lamps in odd columns stand one row further forward (a second repeater), so no lamp touches another: a
// powered lamp would light its neighbour.
//
//   plan (z = 0, on smooth stone):
//     y=0  lectern (book), comparator >, 15 dust
//     y=1  a repeater v under each page's dust block;  y=2 its lamp (even column) or a second repeater (odd)
//     y=3  the odd columns' lamps
//
// More than 15 pages cannot each get their own comparator level (a lectern reads 1 to 15), so P is at most 15.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const MAX = 15;
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};
// The comparator level for page k (0-based) of a book of P pages.
const level = (k, P) => Math.floor((14 * k) / (P - 1)) + 1;

function buildPagination(p = {}) {
  const P = int(p.pages, 2, MAX, 5);
  const page = int(p.page, 1, P, 1) - 1;          // 1-based, as the element's page attribute
  const w = new RS.World({ strict: true });
  const io = { lamps: [], repeaters: [] };
  for (let x = 0; x <= 16; x++) for (let y = 0; y <= 3; y++) w.put(x, y, -1, 'smooth_stone');
  io.lectern = w.put(0, 0, 0, 'lectern', { d: 'E', pages: P, page });
  io.comparator = w.put(1, 0, 0, 'comparator', { d: 'E', mode: 'cmp' });
  for (let x = 2; x <= 16; x++) w.put(x, 0, 0, 'dust');
  for (let k = 0; k < P; k++) {
    // Page k: a repeater reads the dust level(k) blocks along; an even column's lamp is right in front of it, an
    // odd column's one row further on through a second repeater, so no two lamps touch.
    const x = 1 + level(k, P);
    const reps = [w.put(x, 1, 0, 'repeater', { d: 'S', delay: 1 })];
    if (x % 2) reps.push(w.put(x, 2, 0, 'repeater', { d: 'S', delay: 1 }));
    const lamp = w.put(x, x % 2 ? 3 : 2, 0, 'lamp');
    io.lamps.push(lamp);
    io.repeaters.push(...reps);
    io['lamp' + k] = [lamp].concat(reps);
  }
  w.settle();
  w.seal();
  return { world: w, box: [0, 16, 0, 3, -1, 0], io, pages: P };
}

// The open page as the comparator shows it (0-based), -1 if its level is no page's.
function pageOf(built) {
  const out = built.io.comparator.out || 0;
  for (let k = 0; k < built.pages; k++) if (level(k, built.pages) === out) return k;
  return -1;
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const lit = io => io.lamps.filter(l => l.lit).length;

const entry = Catalogue.register({
  id: 'ui-pagination',
  name: 'Pagination',
  category: 'Navigation',
  summary: 'A lectern holds a book with a page per page of results; turning its page is the input. A comparator reads the lectern (1 on the first page, 15 on the last) into a line of dust; a repeater beside the block where each page\'s level runs out lights that page\'s lamp, so the lamps lit count the pages up to the open one.',
  strict: true,
  deviations: [],
  inputs: ['the lectern\'s page'],
  outputs: ['comparator level', 'one lamp per page (lit up to the open page)'],
  actions: ['turn a lectern page'],
  timing: 'The comparator follows a page turn within 2 ticks; the lamps 1 or 2 ticks later (one or two repeaters), and a lamp goes out 2 ticks after its repeater.',
  notes: [
    'A lectern outputs floor(14 x page / (pages - 1)) + 1, so a book of up to 15 pages gives every page its own level. That is the limit: with more pages two pages would share a level, and the comparator could not tell them apart. The element keeps pages to 15.',
    'A repeater behind which dust lies is powered by it whatever its level, so page k\'s repeater is on while the line reaches it. Lamps in odd columns stand a row further forward, so no two lamps touch.',
    'Turning the page also pulses the lectern for a tick; nothing but the comparator is next to it.',
    'Build with { page: k } for the book open at page k (1-based).',
  ],
  params: [{ key: 'pages', label: 'Pages', min: 2, max: MAX, def: 5 }],
  controls: [],
  build: buildPagination,
  tests: [
    T('every page: the comparator shows it within 2 ticks and exactly the lamps up to it are lit (2 to 15 pages)', () => [2, 3, 5, 7, 9, 14, 15].every(P => {
      const c = buildPagination({ pages: P }), w = c.world, hand = ui().testing.hand(w);
      const order = [...Array(P).keys()].concat([...Array(P).keys()].reverse(), [P - 1, 0, Math.floor(P / 2)]);
      for (const k of order) {
        const from = pageOf(c);
        hand.page(c.io.lectern, k);
        const t = from === k ? 0 : ui().testing.ticksUntil(w, () => pageOf(c) === k, 10);
        ui().testing.settle(w);
        if (t > 2 || t < 0 || pageOf(c) !== k || lit(c.io) !== k + 1 || !c.io.lamps.every((l, i) => !!l.lit === i <= k)) throw new Error(`P=${P} page ${k}`);
      }
      return true;
    })),
    T('a full cycle returns every block to its start', () => each(entry, p => {
      const c = buildPagination(p), w = c.world, hand = ui().testing.hand(w);
      const h0 = ui().testing.hash(w);
      hand.page(c.io.lectern, c.pages - 1);
      ui().testing.settle(w);
      hand.page(c.io.lectern, 0);
      ui().testing.settle(w);
      return ui().testing.hash(w) === h0;
    })),
    T('built open at every page, the steady state does not drift for 100 ticks', () => [2, 5, 15].every(P => [...Array(P).keys()].every(k => {
      const c = buildPagination({ pages: P, page: k + 1 });
      return ui().testing.noDrift(c.world, 100) && pageOf(c) === k;
    }))),
    T('strict: real blocks only, no wiring links, no pistons', () => each(entry, p => {
      const c = buildPagination(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 0;
    })),
  ],
});

if (N) module.exports = { buildPagination, pageOf, level, entry, MAX };
else window.RSPagination = { buildPagination, pageOf, level, MAX };
})();
