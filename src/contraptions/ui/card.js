// UI contraption for <rs-card>: a panel. A one-block frame of a chosen block round an opening; the card's content is
// the HTML seen through the opening. Optional: a header on wall signs hung on the top of the frame, and a status lamp
// in the top-right corner with a lever on its face (the page flips the lever, as for <rs-status>).
//
//   front view (x east, z up), C columns and R rows of opening; y = 0 is the frame, y = 1 the signs and the lever:
//     z=1        F  [sign sign ...]  F  F ... F  L [lever]      F: frame block, L: redstone lamp (or F without one)
//     z=0..1-R   F  . . . opening . . .         F
//     z=-R       F  F F F F F F F F F F F F F   F
//   A lever strongly powers the block it is attached to, so the lamp is lit while the lever is on.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const FRAMES = ['bricks', 'planks', 'quartz', 'smooth_stone', 'stone', 'obsidian'];
const MAX_COLS = 60;
const MAX_ROWS = 60;

const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildCard(p = {}) {
  const C = int(p.cols, 1, MAX_COLS, 8);
  const R = int(p.rows, 1, MAX_ROWS, 3);
  const frame = FRAMES.includes(p.frame) ? p.frame : 'bricks';
  const hasLamp = yes(p.lamp);
  const on = hasLamp && yes(p.on);
  // The header signs hang on the top row between the corners (and clear of the lamp's lever).
  const signs = int(p.signs, 0, C, 0);
  const E = C + 1, zb = -R;
  const w = new RS.World({ strict: true });
  const blocks = [];
  for (let x = 0; x <= E; x++) {
    blocks.push(w.put(x, 0, 1, hasLamp && x === E ? 'lamp' : frame, hasLamp && x === E ? { lit: on } : {}));
    blocks.push(w.put(x, 0, zb, frame));
  }
  for (let z = zb + 1; z <= 0; z++) {
    blocks.push(w.put(0, 0, z, frame));
    blocks.push(w.put(E, 0, z, frame));
  }
  const opening = [];
  for (let z = 0; z > zb; z--) for (let x = 1; x <= C; x++) opening.push([x, 0, z]);
  const signBlocks = [];
  for (let x = 1; x <= signs; x++) signBlocks.push(w.put(x, 1, 1, 'sign', { att: 'N', kind: 'wall', text: '' }));
  const io = { frame: blocks, signs: signBlocks };
  if (hasLamp) {
    io.lamp = w.get(E, 0, 1);
    io.lever = w.put(E, 1, 1, 'lever', { att: 'N', on });
  }
  w.seal();
  const deep = hasLamp || signs > 0;
  return { world: w, box: [0, E, 0, deep ? 1 : 0, zb, 1], opening, cols: C, rows: R, frame, io };
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const clear = c => c.opening.every(([x, y, z]) => !c.world.get(x, y, z));

const entry = Catalogue.register({
  id: 'ui-card',
  name: 'Card',
  category: 'Display',
  summary: 'A one-block frame of bricks, planks, quartz, stone or obsidian round an opening; the card\'s content is the HTML seen through it. Optional header signs on the top of the frame, and a lamp in the corner lit by a lever the page flips.',
  strict: true,
  deviations: [],
  inputs: ['lever (with a lamp)'],
  outputs: ['n/a (static frame)', 'lamp lit'],
  actions: ['flip the lever (with a lamp)'],
  timing: 'Static: the built state is the settled state. With a lamp: lit in tick 1 after the lever is flipped on, dark within 3 ticks of flipping it off.',
  notes: [
    'The frame is static, so the world is quiet and never ticked; a page full of cards costs nothing while idle.',
    'The opening is as wide as the element allows and as tall as the content needs at that width (the element measures it again on resize); longer content scrolls inside it.',
    'The header is text on wall signs hung on the top row of the frame, so it needs blocks of 30 px or more (the element uses 32 px when it has a header).',
    'A lever strongly powers the lamp it is attached to: the lamp is lit while the lever is on.',
  ],
  params: [
    { key: 'cols', label: 'Columns', min: 1, max: 20, def: 8 },
    { key: 'rows', label: 'Rows', min: 1, max: 12, def: 3 },
    { key: 'frame', label: 'Frame', options: FRAMES, def: 'bricks' },
    { key: 'signs', label: 'Header signs', min: 0, max: 4, def: 0 },
    { key: 'lamp', label: 'Corner lamp', options: [false, true], def: false },
  ],
  controls: [{ kind: 'action', label: 'Flip the lamp lever (with a lamp)', fn: built => built.io.lever && built.world.hand.flip(built.io.lever) }],
  build: buildCard,
  tests: [
    T('the frame is closed round a clear opening of cols x rows, in the chosen block (every edge)', () => each(entry, p => {
      const c = buildCard(p), w = c.world, E = c.cols + 1;
      const ring = [];
      for (let x = 0; x <= E; x++) ring.push([x, 1], [x, -c.rows]);
      for (let z = -c.rows + 1; z <= 0; z++) ring.push([0, z], [E, z]);
      const framed = ring.every(([x, z]) => { const b = w.get(x, 0, z); return b && (b.t === c.frame || (b.t === 'lamp' && x === E && z === 1)); });
      return framed && clear(c) && c.opening.length === c.cols * c.rows;
    })),
    T('the built state is settled: no drift for 100 ticks (every edge, lamp on and off)', () => each(entry, p => [false, true].every(on => {
      const c = buildCard(Object.assign({}, p, { on }));
      return ui().testing.settle(c.world) <= 1 && ui().testing.noDrift(c.world, 100) && (!c.io.lamp || !!c.io.lamp.lit === on);
    }))),
    T('the lamp follows the lever: lit on tick 1, dark within 3 ticks, and a cycle returns every block', () => {
      const t = ui().testing, c = buildCard({ lamp: true }), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      hand.flip(c.io.lever);
      const on = t.ticksUntil(w, () => c.io.lamp.lit, 5);
      hand.flip(c.io.lever);
      const off = t.ticksUntil(w, () => !c.io.lamp.lit, 5);
      t.settle(w);
      return on === 1 && off >= 1 && off <= 3 && t.hash(w) === h0;
    }),
    T('header signs hang on the top row, in front of the frame', () => {
      const c = buildCard({ cols: 6, signs: 4, lamp: true });
      return c.io.signs.length === 4 && c.io.signs.every((s, i) => s.x === i + 1 && s.y === 1 && s.z === 1 && s.att === 'N') && c.box[3] === 1;
    }),
    T('strict, no pistons', () => each(entry, p => ui().testing.strictWorld(buildCard(p).world, RS) && ui().testing.pistonCount(buildCard(p).world) === 0)),
  ],
});

if (N) module.exports = { buildCard, entry, FRAMES };
else window.buildCard = buildCard;
})();
