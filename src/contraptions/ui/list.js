// UI contraption for <rs-list>: a bulleted list. A column of smooth stone as tall as the list, with a redstone wall
// torch hung on its east face beside the first line of each item; the item text stands beside it as page text.
//
// Ordered, each bullet counts its item instead: a redstone block in the column powers a row of repeaters standing
// on stone blocks, and their delays add up to the item's number (4 + 4 + 1 for item 9). A repeater shows its delay
// by where its sliding torch stands, so the count can be read off the blocks.
//
//   front view (x east, z up), one item per bullet row:
//     unordered               ordered
//     z=0   S T  item 1       X R(1)        item 1
//     z=-1  S                 S s
//     z=-2  S T  item 2       X R(2)        item 2
//     z=-3  S                 S s
//     z=-4  S T  item 3       X R(4) R(1)   item 5 ...
//   S: smooth stone, T: wall torch (lit: its block is unpowered), X: redstone block, R(n): repeater with delay n,
//   s: the stone block a repeater stands on. An ordered bullet needs its own row and the one below it, so ordered
//   bullet rows are at least two apart.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const STONE = 'smooth_stone';
const MAX_ITEMS = 48;
const MAX_ROWS = 400;

const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// Repeater delays that add up to n: as many 4s as fit, then the rest.
function delaysFor(n) {
  const out = [];
  for (let left = n; left > 0; left -= 4) out.push(Math.min(4, left));
  return out;
}

// The bullet rows (row 0 is the top of the column): from p.rows ("0,2,5" or an array), else p.items rows `gap` apart.
// Rows are made strictly increasing, at least `gap` apart.
function rowsFor(p, gap) {
  let rows = Array.isArray(p.rows) ? p.rows : typeof p.rows === 'string' && p.rows.trim() ? p.rows.split(',') : null;
  rows = rows ? rows.map(Number).filter(Number.isFinite).map(Math.round) : null;
  if (!rows) rows = Array.from({ length: int(p.items, 0, MAX_ITEMS, 3) }, (_, k) => k * gap);
  const out = [];
  for (const r of rows.slice(0, MAX_ITEMS)) out.push(Math.max(0, r, out.length ? out[out.length - 1] + gap : 0));
  return out;
}

function buildList(p = {}) {
  const ordered = yes(p.ordered);
  const gap = ordered ? 2 : 1;
  const rows = rowsFor(p, gap);
  const last = rows.length ? rows[rows.length - 1] + gap : 1;
  const height = Math.min(MAX_ROWS, Math.max(last, int(p.height, 1, MAX_ROWS, 1)));
  const width = ordered ? 1 + Math.max(1, delaysFor(rows.length).length) : 2;
  const w = new RS.World({ strict: true });
  const bulletRow = new Set(rows);
  const column = [];
  for (let r = 0; r < height; r++) column.push(w.put(0, 0, -r, ordered && bulletRow.has(r) ? 'rblock' : STONE));
  const bullets = rows.map((r, k) => {
    if (!ordered) return [w.put(1, 0, -r, 'torch', { att: 'W', lit: true })];
    return delaysFor(k + 1).map((delay, i) => {
      w.put(1 + i, 0, -r - 1, STONE);
      return w.put(1 + i, 0, -r, 'repeater', { d: 'E', delay, on: true });
    });
  });
  w.seal();
  // io holds blocks only (a flat list); built.bullets groups them per item.
  return { world: w, box: [0, width - 1, 0, 0, -(height - 1), 0], rows, height, ordered, bullets, io: { column, bullets: bullets.flat() } };
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const count = bullet => bullet.reduce((n, r) => n + r.delay, 0);

const entry = Catalogue.register({
  id: 'ui-list',
  name: 'List',
  category: 'Display',
  summary: 'A column of smooth stone with a redstone wall torch beside the first line of each item. Ordered, a redstone block powers a row of repeaters whose delays add up to the item number.',
  strict: true,
  deviations: [],
  inputs: [],
  outputs: ['n/a (static)'],
  actions: [],
  timing: 'Static: the built state is the settled state, and the world is never ticked.',
  notes: [
    'A wall torch is lit while the block it hangs on is unpowered, which smooth stone in a column always is.',
    'Ordered: the redstone block in the column powers the first repeater from behind and each repeater the next, so every repeater is on; their delays (1 to 4, shown by the position of the sliding torch) add up to the item number.',
    'The element measures each item and puts its bullet in the block row beside the item\'s first line ({ rows: "0,2,5", height }), so the column reflows with the text. Item text sits on a two-block line height by default.',
    'An ordered bullet stands on a stone block in the row below it, so ordered bullet rows are at least two apart (the builder moves a row down if they are not).',
  ],
  params: [
    { key: 'items', label: 'Items', min: 0, max: 12, def: 3 },
    { key: 'ordered', label: 'Ordered', options: [false, true], def: false },
  ],
  controls: [],
  build: buildList,
  tests: [
    T('one lit torch per item, beside its row, on an unpowered column (every edge)', () => each(entry, p => {
      const c = buildList(Object.assign({}, p, { ordered: false }));
      const n = int(p.items, 0, MAX_ITEMS, 3);
      return c.bullets.length === n && c.bullets.every(([t], k) => t.t === 'torch' && t.lit && t.att === 'W' && t.z === -k && t.x === 1);
    })),
    T('ordered: every repeater is on and each bullet\'s delays add up to its item number', () => [1, 4, 5, 9, 16, MAX_ITEMS].every(n => {
      const c = buildList({ items: n, ordered: true });
      ui().testing.settle(c.world);
      return c.bullets.every((b, k) => count(b) === k + 1 && b.every(r => r.on && r.delay >= 1 && r.delay <= 4));
    })),
    T('measured rows: bullets sit on the given rows, pushed apart only where they would collide', () => {
      const a = buildList({ rows: '0,1,4', height: 9 });
      const b = buildList({ rows: '0,1,4', height: 9, ordered: true });
      return a.rows.join() === '0,1,4' && a.height === 9 && b.rows.join() === '0,2,4' &&
        a.bullets.map(([t]) => -t.z).join() === '0,1,4' && b.bullets.map(([r]) => -r.z).join() === '0,2,4';
    }),
    T('the built state is settled: no drift for 100 ticks (every edge, and with measured rows)', () => {
      const ok = ui().testing.edges(entry).every(p => {
        const c = buildList(p);
        return ui().testing.settle(c.world) <= 1 && ui().testing.noDrift(c.world, 100);
      });
      return ok && ui().testing.noDrift(buildList({ rows: '0,1,3,7', height: 12, ordered: true }).world, 100);
    }),
    T('strict, no pistons', () => each(entry, p => ui().testing.strictWorld(buildList(p).world, RS) && ui().testing.pistonCount(buildList(p).world) === 0)),
  ],
});

if (N) module.exports = { buildList, delaysFor, entry };
else window.buildList = buildList;
})();
