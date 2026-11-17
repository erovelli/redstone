// UI contraption for <rs-toggle>: a lever, a short dust line and a redstone lamp. The label hangs on a row of
// oak wall signs to the left. The switch is "on" while the lamp is lit.
//
//   front view (x east, z up), y = 0 row; the signs hang at y = 1 on the planks:
//     z=0   [planks+sign] x signs   lever  dust x n  lamp
//     z=-1  floor ------------------------------------------
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

// TODO(merge): 'smooth_stone' once the block registry lands; the legacy engine does not know it yet.
const FLOOR = 'stone';

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildToggle(p = {}) {
  const signs = int(p.signs, 0, 6, 2);
  const dust = int(p.dust, 1, 4, 2);
  const on = p.on === true || p.on === 'true';
  const w = new RS.World({ strict: true });
  const x0 = signs;                       // the lever's column
  const lamp_x = x0 + dust + 1;
  for (let x = 0; x <= lamp_x; x++) w.put(x, 0, -1, FLOOR);
  const signBlocks = [];
  for (let x = 0; x < signs; x++) {
    w.put(x, 0, 0, 'planks');
    signBlocks.push(w.put(x, 1, 0, 'sign', { att: 'N', kind: 'wall', text: '' }));
  }
  const lever = w.put(x0, 0, 0, 'lever', { att: 'D', on });
  for (let i = 1; i <= dust; i++) w.put(x0 + i, 0, 0, 'dust', { lvl: on ? 16 - i : 0 });   // the levels the lever gives it
  const lamp = w.put(lamp_x, 0, 0, 'lamp', { lit: on });
  if (w.seal) w.seal();
  return { world: w, box: [0, lamp_x, 0, signs ? 1 : 0, -1, 0], io: { lever, lamp, signs: signBlocks } };
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

const entry = Catalogue.register({
  id: 'ui-toggle',
  name: 'Toggle switch',
  category: 'Form controls',
  summary: 'A lever powers a short dust line into a redstone lamp. The switch is on while the lamp is lit; the label hangs on oak wall signs.',
  strict: true,
  deviations: [],
  inputs: ['lever'],
  outputs: ['lamp'],
  actions: ['flip the lever'],
  timing: 'Lamp on within 1 tick of flipping the lever on; off within 3 ticks of flipping it off (a lamp holds 2 ticks).',
  notes: [
    'Dust loses one level per block, so the lamp stays lit up to 15 blocks away; the line is 1 to 4 long.',
    'Build with { on: true } for a switch that starts on: the lever is on and the lamp lit, which is the state the engine settles into.',
  ],
  params: [
    { key: 'signs', label: 'Label signs', min: 0, max: 6, def: 2 },
    { key: 'dust', label: 'Dust line', min: 1, max: 4, def: 2 },
  ],
  controls: [{ kind: 'lever', io: 'lever', label: 'Lever' }],
  build: buildToggle,
  tests: [
    T('the lamp follows the lever within the documented ticks (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildToggle(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      if (c.io.lamp.lit) return false;
      hand.flip(c.io.lever);
      const on = t.ticksUntil(w, () => c.io.lamp.lit, 10);
      hand.flip(c.io.lever);
      const off = t.ticksUntil(w, () => !c.io.lamp.lit, 10);
      return on >= 1 && on <= 1 && off >= 1 && off <= 3;
    })),
    T('a full on/off cycle returns every block to its start', () => each(entry, p => {
      const t = ui().testing, c = buildToggle(p), w = c.world, hand = t.hand(w);
      t.settle(w);
      const h0 = t.hash(w);
      for (let k = 0; k < 2; k++) {
        hand.flip(c.io.lever);
        t.settle(w);
        hand.flip(c.io.lever);
        t.settle(w);
      }
      return t.hash(w) === h0;
    })),
    T('the built steady state does not drift for 100 ticks, off and on', () => each(entry, p => [false, true].every(on => {
      const c = buildToggle(Object.assign({}, p, { on }));
      return ui().testing.noDrift(c.world, 100) && !!c.io.lamp.lit === on;
    }))),
    T('strict: real blocks only, no wiring links, no pistons', () => each(entry, p => {
      const c = buildToggle(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 0;
    })),
  ],
});

if (N) module.exports = { buildToggle, entry };
else window.buildToggle = buildToggle;
})();
