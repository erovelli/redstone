// UI contraption for <rs-checkbox>: a stone button on a stone block, an optional short dust line and a waxed
// copper bulb. A copper bulb toggles on every rising edge of its power, so it is a one-block T flip-flop: each
// press lights it or puts it out, and it keeps its state without power. The checkbox is checked while the bulb is lit.
//
//   front view (x east, z up); the button hangs on the front (y = 1) of the stone block:
//     z=0   [stone+button]  dust x n  bulb
//     z=-1  floor --------------------------
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

function buildCheckbox(p = {}) {
  const dust = int(p.dust, 0, 2, 0);
  const on = p.on === true || p.on === 'true';
  const w = new RS.World({ strict: true });
  const bulbX = dust + 1;
  for (let x = 0; x <= bulbX; x++) w.put(x, 0, -1, FLOOR);
  const block = w.put(0, 0, 0, 'stone');
  const button = w.put(0, 1, 0, 'button', { att: 'N', on: false });
  for (let x = 1; x <= dust; x++) w.put(x, 0, 0, 'dust');
  const bulb = w.put(bulbX, 0, 0, 'bulb', { lit: on });
  w.seal();
  return { world: w, box: [0, bulbX, 0, 1, -1, 0], io: { button, block, bulb } };
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

const entry = Catalogue.register({
  id: 'ui-checkbox',
  name: 'Checkbox',
  category: 'Form controls',
  summary: 'A stone button powers its block, and the block (or a short dust line) powers a copper bulb. A copper bulb toggles on every rising edge, so each press lights it or puts it out; the box is checked while the bulb is lit.',
  strict: true,
  deviations: [],
  inputs: ['stone button'],
  outputs: ['copper bulb (toggles each press)'],
  actions: ['press the button'],
  timing: 'The bulb toggles 1 tick after the press. The button stays in for 10 ticks; a press while it is in does nothing, as in the game.',
  notes: [
    'A waxed copper bulb is not conductive and keeps its state without power: the bulb is both the flip-flop and the indicator.',
    'The bulb toggles only on a rising edge, so the button coming out (the falling edge) changes nothing.',
    'Build with { on: true } for a box that starts checked: the bulb is lit and unpowered, which is the state the engine settles into.',
  ],
  params: [{ key: 'dust', label: 'Dust line', min: 0, max: 2, def: 0 }],
  controls: [{ kind: 'button', io: 'button', label: 'Press the button' }],
  build: buildCheckbox,
  tests: [
    T('each press toggles the bulb 1 tick later, and the release changes nothing (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildCheckbox(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      const seen = [];
      for (let k = 0; k < 3; k++) {
        hand.press(c.io.button);
        seen.push(t.ticksUntil(w, () => !!c.io.bulb.lit === (k % 2 === 0), 5));
        t.settle(w);
        if (!!c.io.bulb.lit !== (k % 2 === 0)) return false;
      }
      return seen.every(n => n === 1);
    })),
    T('a second press while the button is in does nothing', () => {
      const t = ui().testing, c = buildCheckbox({}), w = c.world, hand = t.hand(w);
      t.settle(w);
      hand.press(c.io.button);
      w.run(4);
      const again = hand.press(c.io.button);
      t.settle(w);
      return again === false && c.io.bulb.lit === true;
    }),
    T('two presses return every block to its start', () => each(entry, p => {
      const t = ui().testing, c = buildCheckbox(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      const h0 = t.hash(w);
      hand.press(c.io.button);
      t.settle(w);
      hand.press(c.io.button);
      t.settle(w);
      return t.hash(w) === h0;
    })),
    T('the built steady state does not drift for 100 ticks, unchecked and checked', () => each(entry, p => [false, true].every(on => {
      const c = buildCheckbox(Object.assign({}, p, { on }));
      return ui().testing.noDrift(c.world, 100) && !!c.io.bulb.lit === on;
    }))),
    T('strict: real blocks only, no wiring links, no pistons', () => each(entry, p => {
      const c = buildCheckbox(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 0;
    })),
  ],
});

if (N) module.exports = { buildCheckbox, entry };
else window.buildCheckbox = buildCheckbox;
})();
