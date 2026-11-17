// UI contraption for <rs-spinner>: a torch clock laid out as a ring. Three redstone lamps and a dust corner
// sit round a 3 x 3 square; three repeaters carry the signal from corner to corner, and a redstone torch hung on
// the last lamp closes the ring. A lamp a repeater points into is strongly powered, so it powers the next
// repeater; the torch inverts, so a wave of light and then a wave of darkness run round and round.
//
//   top view (y = 0 is the back row), z = 0, a floor under it at z = -1:
//          x=-1     x=0      x=1      x=2
//   y=0   [lever]  dust  ->  R(E) ->  L1
//                   ^                 v
//   y=1           torch              R(S)
//                   ^                 v
//   y=2             L3   <-  R(W) <-  L2
//   The torch hangs on L3 and feeds the dust. The lever beside the dust, when on, holds the dust at 15: then the
//   whole ring is lit and still (the torch is off), which is the reduced-motion state.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const FLOOR = 'smooth_stone';
const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildSpinner(p = {}) {
  const delay = int(p.delay, 1, 4, 2);
  const still = yes(p.still) || yes(p.reduced);   // reduced: the element asks for it under reduced motion
  const w = new RS.World({ strict: true });
  for (let x = 0; x <= 2; x++) for (let y = 0; y <= 2; y++) w.put(x, y, -1, FLOOR);
  w.put(-1, 0, -1, FLOOR);
  // Built still (lever on), the ring is in the state the engine settles into: every lamp lit, the torch off.
  // Built running, it is the clock's state just after the torch lit: the dust on, nothing else yet.
  const dust = w.put(0, 0, 0, 'dust', { lvl: 15 });
  const lamps = [
    w.put(2, 0, 0, 'lamp', { lit: still }),
    w.put(2, 2, 0, 'lamp', { lit: still }),
    w.put(0, 2, 0, 'lamp', { lit: still }),
  ];
  const repeaters = [
    w.put(1, 0, 0, 'repeater', { d: 'E', delay, on: still }),
    w.put(2, 1, 0, 'repeater', { d: 'S', delay, on: still }),
    w.put(1, 2, 0, 'repeater', { d: 'W', delay, on: still }),
  ];
  const torch = w.put(0, 1, 0, 'torch', { att: 'S', lit: !still });
  const lever = w.put(-1, 0, 0, 'lever', { att: 'D', on: still });
  w.seal();
  return { world: w, box: [-1, 2, 0, 2, -1, 0], io: { lever, lamps, repeaters, torch, dust } };
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const pattern = io => io.lamps.map(l => (l.lit ? 1 : 0)).join('');

const entry = Catalogue.register({
  id: 'ui-spinner',
  name: 'Spinner',
  category: 'Feedback',
  summary: 'A torch clock laid out as a ring: three repeaters and a redstone torch pass the signal round three lamps and a dust corner, so light chases itself round the square. A lever holds it still and fully lit.',
  strict: true,
  deviations: [],
  inputs: ['lever (stop)'],
  outputs: ['the lamps (running or still)'],
  actions: ['flip the lever'],
  timing: 'Period 2 x (1 + 3 x delay) ticks: 14 ticks (1.4 s) at the default delay 2. Each lamp lights delay ticks after the one before it.',
  notes: [
    'One inversion (the torch) in the ring makes it a clock that starts itself; it needs no pulse to get going.',
    'The torch turns off at most once per period (at least 8 ticks), far from the burnout limit of 8 turn-offs in 30 ticks.',
    'With the lever on, the dust is held at 15, the whole ring lights and the torch goes out: a steady state, used for reduced motion and the paused attribute.',
  ],
  params: [
    { key: 'delay', label: 'Repeater delay', min: 1, max: 4, def: 2 },
    { key: 'still', label: 'Lever on (still)', options: [false, true], def: false },
  ],
  controls: [{ kind: 'lever', io: 'lever', label: 'Stop lever' }],
  build: buildSpinner,
  tests: [
    T('running, the light goes round: every lamp lights in order and the pattern repeats with the documented period', () => each(entry, p => {
      if (yes(p.still)) return true;
      const c = buildSpinner(p), w = c.world, period = 2 * (1 + 3 * p.delay);
      const seq = [];
      for (let i = 0; i < 4 * period; i++) { w.tick(); seq.push(pattern(c.io)); }
      const same = seq.slice(2 * period).every((s, i) => s === seq[period + i]);
      const lights = [0, 1, 2].every(k => seq.some(s => s[k] === '1') && seq.some(s => s[k] === '0'));
      return same && lights && !seq.slice(period).every(s => s === seq[period]);
    })),
    T('the torch never burns out while it runs for 600 ticks', () => each(entry, p => {
      const c = buildSpinner(Object.assign({}, p, { still: false })), w = c.world;
      let turns = 0, was = c.io.torch.lit;
      for (let i = 0; i < 600; i++) { w.tick(); if (was && !c.io.torch.lit) turns++; was = c.io.torch.lit; }
      return turns >= 600 / (2 * (1 + 3 * p.delay)) - 1 && !c.io.torch.burnt && !c.io.torch.out;
    })),
    T('built still, the ring is fully lit and does not drift for 100 ticks', () => each(entry, p => {
      const c = buildSpinner(Object.assign({}, p, { still: true }));
      return ui().testing.noDrift(c.world, 100) && pattern(c.io) === '111' && !c.io.torch.lit;
    })),
    T('flipping the lever on stops it fully lit within a period; flipping it off starts it again', () => each(entry, p => {
      const t = ui().testing, c = buildSpinner(Object.assign({}, p, { still: false })), w = c.world, hand = t.hand(w);
      w.run(5);
      hand.flip(c.io.lever);
      const n = t.settle(w);
      const still = pattern(c.io) === '111' && n <= 2 * (1 + 3 * p.delay) + 3;
      hand.flip(c.io.lever);
      w.run(40);
      return still && !w.quiet;
    })),
    T('a stop and restart cycle from still returns every block to its start', () => {
      const t = ui().testing, c = buildSpinner({ still: true }), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      hand.flip(c.io.lever);
      w.run(33);
      hand.flip(c.io.lever);
      t.settle(w);
      return t.hash(w) === h0;
    }),
    T('strict, no pistons', () => each(entry, p => t2(buildSpinner(p)))),
  ],
});
function t2(c) { return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 0; }

if (N) module.exports = { buildSpinner, entry };
else window.buildSpinner = buildSpinner;
})();
