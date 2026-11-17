// UI contraption for <rs-button>: a stone button on the front of a stone block, a short dust line and a lamp.
// Pressing the button strongly powers the block for 10 ticks; the dust beside it carries the signal to the lamp.
// The label hangs on a row of oak wall signs to the left.
//
//   front view (x east, z up), y = 0 row; the signs and the button sit at y = 1:
//     z=0   [planks+sign] x signs   [stone+button]  dust x n  lamp
//     z=-1  floor ---------------------------------------------------
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const FLOOR = 'smooth_stone';

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildButton(p = {}) {
  const signs = int(p.signs, 0, 6, 2);
  const dust = int(p.dust, 1, 3, 2);
  const wood = p.wood === true || p.wood === 'true';
  const w = new RS.World({ strict: true });
  const bx = signs;                       // the column of the block the button is on
  const lampX = bx + dust + 1;
  for (let x = 0; x <= lampX; x++) w.put(x, 0, -1, FLOOR);
  const signBlocks = [];
  for (let x = 0; x < signs; x++) {
    w.put(x, 0, 0, 'planks');
    signBlocks.push(w.put(x, 1, 0, 'sign', { att: 'N', kind: 'wall', text: '' }));
  }
  const block = w.put(bx, 0, 0, 'stone');
  const button = w.put(bx, 1, 0, 'button', { att: 'N', on: false, wood });
  for (let i = 1; i <= dust; i++) w.put(bx + i, 0, 0, 'dust');
  const lamp = w.put(lampX, 0, 0, 'lamp', { lit: false });
  w.seal();
  return { world: w, box: [0, lampX, 0, 1, -1, 0], io: { button, block, lamp, signs: signBlocks } };
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

const entry = Catalogue.register({
  id: 'ui-button',
  name: 'Push button',
  category: 'Form controls',
  summary: 'A stone button on a block powers the block for 10 ticks; the dust beside it lights a lamp. The click happens when the lamp lights.',
  strict: true,
  deviations: [],
  inputs: ['stone button'],
  outputs: ['lamp (one pulse per press)'],
  actions: ['press the button'],
  timing: 'Lamp on within 1 tick of the press, lit for 10 ticks (15 for an oak button), off within 3 ticks of the release.',
  notes: [
    'A button strongly powers the block it is on, and a strongly powered block powers the dust next to it.',
    'Pressing again while the button is in does nothing, as in the game: one press, one pulse.',
  ],
  params: [
    { key: 'signs', label: 'Label signs', min: 0, max: 6, def: 2 },
    { key: 'dust', label: 'Dust line', min: 1, max: 3, def: 2 },
    { key: 'wood', label: 'Oak button', options: [false, true], def: false },
  ],
  controls: [{ kind: 'button', io: 'button', label: 'Press the button' }],
  build: buildButton,
  tests: [
    T('one press gives one lamp pulse of the documented length (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildButton(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      if (c.io.lamp.lit) return false;
      hand.press(c.io.button);
      const on = t.ticksUntil(w, () => c.io.lamp.lit, 5);
      const lit = t.ticksUntil(w, () => !c.io.lamp.lit, 30);
      const hold = p.wood === true ? 15 : 10;
      return on === 1 && lit >= hold && lit <= hold + 2;
    })),
    T('a second press while the button is in adds no pulse', () => {
      const t = ui().testing, c = buildButton({}), w = c.world, hand = t.hand(w);
      t.settle(w);
      hand.press(c.io.button);
      let rises = 0, was = false;
      for (let i = 0; i < 40; i++) {
        if (i === 4) hand.press(c.io.button);
        w.tick();
        if (c.io.lamp.lit && !was) rises++;
        was = !!c.io.lamp.lit;
      }
      return rises === 1 && !c.io.lamp.lit;
    }),
    T('a press settles back to the start state', () => each(entry, p => {
      const t = ui().testing, c = buildButton(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      const h0 = t.hash(w);
      hand.press(c.io.button);
      t.settle(w);
      hand.press(c.io.button);
      t.settle(w);
      return t.hash(w) === h0;
    })),
    T('the built steady state does not drift for 100 ticks', () => each(entry, p => ui().testing.noDrift(buildButton(p).world, 100))),
    T('strict: real blocks only, no wiring links, no pistons', () => each(entry, p => {
      const c = buildButton(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 0;
    })),
  ],
});

if (N) module.exports = { buildButton, entry };
else window.buildButton = buildButton;
})();
