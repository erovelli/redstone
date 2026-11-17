// UI contraption for <rs-chip> and <rs-badge>: a row of oak wall signs hung on a row of blocks. The colour of
// the blocks is the chip's tone (concrete), or the blocks are redstone lamps lit by redstone blocks behind them.
// A dismissible chip has a piston at its left end with an oak button on its front: pressing the button pushes
// the whole row of blocks one block east, and every sign pops off because its block moved.
//
//   front view (x east, z up); the signs hang at y = 1 on the blocks at y = 0:
//     z=0   [piston+button]  [block+sign] x signs  (empty: the row moves into it)
//   lit: a redstone block sits behind every lamp at y = -1.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const TONES = ['plain', 'white', 'gray', 'black', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'pink'];

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};
const yes = v => v === true || v === 'true';

function buildChip(p = {}) {
  const signs = int(p.signs, 1, 10, 2);
  const dismissible = yes(p.dismissible);
  const lit = yes(p.lit);
  const tone = TONES.includes(p.tone) ? p.tone : 'plain';
  const w = new RS.World({ strict: true });
  const x0 = dismissible ? 1 : 0;           // the first sign's column
  let piston = null, button = null;
  if (dismissible) {
    piston = w.put(0, 0, 0, 'piston', { d: 'E', s: false, ext: false });
    button = w.put(0, 1, 0, 'button', { att: 'N', on: false, wood: true });   // oak: it reads on the piston's stone side
  }
  const blocks = [], signBlocks = [], power = [];
  for (let i = 0; i < signs; i++) {
    const x = x0 + i;
    if (lit) {
      blocks.push(w.put(x, 0, 0, 'lamp', { lit: true }));
      power.push(w.put(x, -1, 0, 'rblock'));
    } else if (tone === 'plain') {
      blocks.push(w.put(x, 0, 0, 'planks'));
    } else {
      blocks.push(w.put(x, 0, 0, 'concrete', { color: tone }));
    }
    signBlocks.push(w.put(x, 1, 0, 'sign', { att: 'N', kind: 'wall', text: '' }));
  }
  w.seal();
  // The piston pushes the row into the empty column at its east end, which is part of the box.
  const x1 = x0 + signs - 1 + (dismissible ? 1 : 0);
  return { world: w, box: [0, x1, lit ? -1 : 0, 1, 0, 0], io: { piston, button, blocks, power, signs: signBlocks } };
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const gone = io => io.signs.every(s => s.popped);

const entry = Catalogue.register({
  id: 'ui-chip',
  name: 'Chip and badge',
  category: 'Feedback',
  summary: 'The text hangs on oak wall signs on a row of coloured blocks (or lamps lit by redstone blocks). To dismiss, a button fires a piston that pushes the row of blocks; a sign whose block moves pops off.',
  strict: true,
  deviations: [],
  inputs: ['oak button (dismissible only)'],
  outputs: ['the signs (popped or hanging)'],
  actions: ['press the button'],
  timing: 'The piston extends on tick 1 after the press and every sign pops in that tick.',
  notes: [
    'Signs cannot be pushed: they are block entities that pop off when the block they hang on moves.',
    'The row of blocks plus nothing else is pushed, so the push limit holds for up to 11 signs; the builder allows 10.',
    'Tone is the colour of the concrete behind the signs; lit makes them redstone lamps, each lit by a redstone block behind it.',
  ],
  params: [
    { key: 'signs', label: 'Signs', min: 1, max: 10, def: 2 },
    { key: 'dismissible', label: 'Dismissible', options: [false, true], def: false },
    { key: 'lit', label: 'Lit (lamps)', options: [false, true], def: false },
    { key: 'tone', label: 'Tone', options: TONES, def: 'plain' },
  ],
  // An action rather than an io control: a chip without dismissible has no button.
  controls: [{ kind: 'action', label: 'Press the dismiss button', fn: built => built.io.button && built.world.hand.press(built.io.button) }],
  build: buildChip,
  tests: [
    T('pressing the button pops every sign on tick 1 (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildChip(Object.assign({}, p, { dismissible: true })), w = c.world;
      t.settle(w);
      if (gone(c.io)) return false;
      t.hand(w).press(c.io.button);
      return t.ticksUntil(w, () => gone(c.io), 5) === 1;
    })),
    T('after a dismissal the world settles with the row moved one block east and the piston retracted', () => {
      const t = ui().testing, c = buildChip({ dismissible: true, signs: 3 }), w = c.world;
      t.hand(w).press(c.io.button);
      t.settle(w);
      return c.io.blocks.every((b, i) => b.x === 2 + i) && !c.io.piston.ext && !c.io.button.on;
    }),
    T('the push limit holds by construction: the piston moves exactly the row of blocks', () => {
      const t = ui().testing, c = buildChip({ dismissible: true, signs: 10, lit: true }), w = c.world;
      let moved = -1;
      w.on('move', ev => { if (ev.name === 'extend') moved = ev.blocks.length; });
      t.hand(w).press(c.io.button);
      t.settle(w);
      return moved === 10 && moved <= 12;
    }),
    T('without dismissible there is no piston and no button', () => each(entry, p => {
      const c = buildChip(Object.assign({}, p, { dismissible: false }));
      return !c.io.button && ui().testing.pistonCount(c.world) === 0;
    })),
    T('the built steady state does not drift for 100 ticks; lit lamps stay lit', () => each(entry, p => {
      const c = buildChip(p);
      return ui().testing.noDrift(c.world, 100) && c.io.blocks.every(b => b.t !== 'lamp' || b.lit);
    })),
    T('strict: real blocks only, no wiring links', () => each(entry, p => ui().testing.strictWorld(buildChip(p).world, RS))),
    T('a chip that is never pressed keeps its hash (nothing to cycle)', () => each(entry, p => {
      const t = ui().testing, c = buildChip(p), h0 = t.hash(c.world);
      t.settle(c.world);
      return t.hash(c.world) === h0;
    })),
  ],
});

if (N) module.exports = { buildChip, entry, TONES };
else window.buildChip = buildChip;
})();
