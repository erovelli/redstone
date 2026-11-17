// UI contraption for <rs-status>: a status dot. A lever on the floor stands beside a redstone lamp; the lamp is
// lit while the lever is on. The page flips the lever through the `on` attribute.
//
//   front view (x east, z up):
//     z=0   lever  lamp
//     z=-1  floor  floor
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

function buildStatus(p = {}) {
  const on = p.on === true || p.on === 'true';
  const w = new RS.World({ strict: true });
  w.put(0, 0, -1, 'smooth_stone');
  w.put(1, 0, -1, 'smooth_stone');
  const lever = w.put(0, 0, 0, 'lever', { att: 'D', on });
  const lamp = w.put(1, 0, 0, 'lamp', { lit: on });
  w.seal();
  return { world: w, box: [0, 1, 0, 0, -1, 0], io: { lever, lamp } };
}

const T = (name, fn) => ({ name, fn });

const entry = Catalogue.register({
  id: 'ui-status',
  name: 'Status dot',
  category: 'Feedback',
  summary: 'A lever beside a redstone lamp: the lamp is lit while the lever is on. The page flips the lever.',
  strict: true,
  deviations: [],
  inputs: ['lever'],
  outputs: ['lamp'],
  actions: ['flip the lever'],
  timing: 'Lamp on in tick 1 after the lever is flipped on, off within 3 ticks of flipping it off.',
  notes: ['A lever powers the lamp beside it directly; nothing else is needed.', 'Build with { on: true } for a dot that starts lit.'],
  params: [],
  controls: [{ kind: 'lever', io: 'lever', label: 'Lever' }],
  build: buildStatus,
  tests: [
    T('the lamp follows the lever within the documented ticks', () => {
      const t = ui().testing, c = buildStatus({}), w = c.world, hand = t.hand(w);
      hand.flip(c.io.lever);
      const on = t.ticksUntil(w, () => c.io.lamp.lit, 5);
      hand.flip(c.io.lever);
      const off = t.ticksUntil(w, () => !c.io.lamp.lit, 5);
      return on === 1 && off >= 1 && off <= 3;
    }),
    T('an on/off cycle returns every block to its start', () => {
      const t = ui().testing, c = buildStatus({}), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      hand.flip(c.io.lever);
      t.settle(w);
      hand.flip(c.io.lever);
      t.settle(w);
      return t.hash(w) === h0;
    }),
    T('no drift for 100 ticks, on and off', () => [false, true].every(on => ui().testing.noDrift(buildStatus({ on }).world, 100) && !!buildStatus({ on }).io.lamp.lit === on)),
    T('strict, no pistons', () => ui().testing.strictWorld(buildStatus({}).world, RS) && ui().testing.pistonCount(buildStatus({}).world) === 0),
  ],
});

if (N) module.exports = { buildStatus, entry };
else window.buildStatus = buildStatus;
})();
