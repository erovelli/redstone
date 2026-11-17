// UI contraption for <rs-divider>: a horizontal rule. A row of smooth stone with a line of redstone dust on top,
// as long as the container is wide. Built plain, nothing is powered and the world is quiet.
//
// With `pulse`, a torch clock at the west end sends a short signal east along the line every 1.7 s:
//
//   plan at z = 1 (on top of the stone row at z = 0; y = -1 is the back row, y = 0 the line):
//            x=0      x=1      x=2      x=3     x=4        x=5   x=6 .. x=12  x=13 ...
//   y=-1     T(att S) R1 ->E   R2 ->E   S
//   y=0      A        R4 <-W   R3 <-W   dust    observer   R ->E  dust ...    R ->E ...
//                                               (watches W)
//   The ring: the torch T hangs on A and powers R1; R1 and R2 strongly power S; S powers the dust in front of it;
//   R3 and R4 carry that back west into A, which turns T off; the dark runs round the same way and T relights.
//   Each half of the cycle is 1 + 4 x 4 = 17 ticks. The observer watches the dust: every change (on and off) is a
//   1-tick pulse into the line, where a delay-2 repeater every 8 blocks stretches it to 2 ticks and passes it on.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const STONE = 'smooth_stone';
const MAX_LENGTH = 200;
const PULSE_MIN = 8;       // the clock takes 5 blocks; the line needs its first repeater and some dust
const SEGMENT = 8;         // a repeater every 8 blocks: the dust after it falls from 15 to 9
const RING_DELAY = 4;
const LINE_DELAY = 2;
const HALF_PERIOD = 1 + 4 * RING_DELAY;

const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildDivider(p = {}) {
  const length = int(p.length, 1, MAX_LENGTH, 24);
  const pulse = yes(p.pulse) && !yes(p.reduced) && length >= PULSE_MIN;
  const w = new RS.World({ strict: true });
  const row = [], line = [];
  for (let x = 0; x < length; x++) row.push(w.put(x, 0, 0, STONE));
  let io = { row, line };
  if (!pulse) {
    for (let x = 0; x < length; x++) line.push(w.put(x, 0, 1, 'dust', { lvl: 0 }));
  } else {
    // Built just after the torch lit: the torch on, the rest of the ring and the line dark.
    for (let x = 0; x <= 3; x++) w.put(x, -1, 0, STONE);
    const A = w.put(0, 0, 1, STONE);
    const torch = w.put(0, -1, 1, 'torch', { att: 'S', lit: true });
    const ring = [
      w.put(1, -1, 1, 'repeater', { d: 'E', delay: RING_DELAY, on: false }),
      w.put(2, -1, 1, 'repeater', { d: 'E', delay: RING_DELAY, on: false }),
      w.put(2, 0, 1, 'repeater', { d: 'W', delay: RING_DELAY, on: false }),
      w.put(1, 0, 1, 'repeater', { d: 'W', delay: RING_DELAY, on: false }),
    ];
    const S = w.put(3, -1, 1, STONE);
    const tap = w.put(3, 0, 1, 'dust', { lvl: 0 });
    const observer = w.put(4, 0, 1, 'observer', { d: 'W', on: false });
    const repeaters = [];
    for (let x = 5; x < length; x++) {
      const b = (x - 5) % SEGMENT === 0
        ? w.put(x, 0, 1, 'repeater', { d: 'E', delay: LINE_DELAY, on: false })
        : w.put(x, 0, 1, 'dust', { lvl: 0 });
      line.push(b);
      if (b.t === 'repeater') repeaters.push(b);
    }
    io = { row, line, A, torch, ring, S, tap, observer, repeaters };
  }
  w.seal();
  return { world: w, box: [0, length - 1, pulse ? -1 : 0, 0, 0, 1], length, pulse, io };
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const lit = b => (b.t === 'repeater' ? !!b.on : (b.lvl || 0) > 0);

const entry = Catalogue.register({
  id: 'ui-divider',
  name: 'Divider',
  category: 'Display',
  summary: 'A line of redstone dust on a row of smooth stone, as long as the container is wide. With pulse, a torch clock at the west end sends a short signal along it through repeaters.',
  strict: true,
  deviations: [],
  inputs: [],
  outputs: ['n/a (static); with pulse, a signal running along the line'],
  actions: [],
  timing: 'Plain: quiet, never ticked. Pulse: a 1-tick observer pulse every 17 ticks (1.7 s); a delay-2 repeater every 8 blocks moves it 8 blocks per 2 ticks.',
  notes: [
    'Built plain, the dust is unpowered and the world is quiet from the start, so a page full of dividers costs nothing while idle.',
    'The pulse clock is a ring of one redstone torch and four delay-4 repeaters (half period 17 ticks); the torch turns off once every 34 ticks, far from burnout.',
    'An observer watches the ring\'s dust tap and fires on both edges, so a pulse leaves every half period. Each line repeater stretches it to its delay of 2 ticks.',
    `pulse needs at least ${PULSE_MIN} blocks; a shorter divider, and any divider under reduced motion ({ reduced: true }), is built plain.`,
    'The element sets the length from its width: one block per --rs-block (16 px by default).',
  ],
  params: [
    { key: 'length', label: 'Length (blocks)', min: 1, max: MAX_LENGTH, def: 24 },
    { key: 'pulse', label: 'Pulse', options: [false, true], def: false },
  ],
  controls: [],
  build: buildDivider,
  tests: [
    T('plain: a straight dust line on a stone row, quiet and steady for 100 ticks (every edge)', () => each(entry, p => {
      const c = buildDivider(Object.assign({}, p, { pulse: false }));
      const straight = c.io.line.every((d, i) => d.t === 'dust' && d.lvl === 0 && d.z === 1 && c.io.row[i].z === 0);
      return straight && ui().testing.settle(c.world) <= 1 && ui().testing.noDrift(c.world, 100);
    })),
    T('pulse: every line repeater turns on in order, 2 ticks apart, and each pulse lasts 2 ticks', () => each(entry, p => {
      const c = buildDivider(Object.assign({}, p, { pulse: true }));
      if (!c.pulse) return int(p.length, 1, MAX_LENGTH, 24) < PULSE_MIN;
      const w = c.world, rs = c.io.repeaters, first = rs.map(() => -1), onFor = rs.map(() => 0);
      for (let t = 1; t <= HALF_PERIOD + 2 * rs.length + 4; t++) {
        w.tick();
        rs.forEach((r, i) => { if (r.on) { if (first[i] < 0) first[i] = t; if (first[i] > 0 && t - first[i] < 4) onFor[i]++; } });
      }
      return first.every((t, i) => t > 0 && (i === 0 || t - first[i - 1] === LINE_DELAY)) && onFor.every(n => n === LINE_DELAY);
    })),
    T('pulse: a pulse leaves every 17 ticks and the pattern repeats every 34', () => {
      const c = buildDivider({ length: 30, pulse: true }), w = c.world, r0 = c.io.repeaters[0];
      const rises = [];
      let was = false;
      for (let t = 1; t <= 200; t++) {
        w.tick();
        if (r0.on && !was) rises.push(t);
        was = r0.on;
      }
      const gaps = rises.slice(1).map((t, i) => t - rises[i]);
      w.run(5);
      const h = ui().testing.hash(w);
      w.run(2 * HALF_PERIOD);
      return gaps.length >= 9 && gaps.every(g => g === HALF_PERIOD) && ui().testing.hash(w) === h;
    }),
    T('pulse: the signal is short, at most one segment lit in a row at a time', () => {
      const c = buildDivider({ length: MAX_LENGTH, pulse: true }), w = c.world;
      for (let t = 0; t < 300; t++) {
        w.tick();
        let run = 0;
        for (const b of c.io.line) {
          run = lit(b) ? run + 1 : 0;
          if (run > SEGMENT) return false;
        }
      }
      return true;
    }),
    T('pulse: the torch never burns out in 600 ticks', () => {
      const c = buildDivider({ length: 24, pulse: true }), w = c.world;
      let offs = 0, was = c.io.torch.lit;
      for (let t = 0; t < 600; t++) { w.tick(); if (was && !c.io.torch.lit) offs++; was = c.io.torch.lit; }
      return offs >= 16 && !c.io.torch.burnt;
    }),
    T('reduced motion builds it plain and quiet', () => {
      const c = buildDivider({ length: 30, pulse: true, reduced: true });
      return !c.pulse && ui().testing.settle(c.world) <= 1 && !c.io.torch;
    }),
    T('strict, no pistons, one row deep when plain', () => each(entry, p => {
      const c = buildDivider(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 0 && (c.pulse || c.box[2] === 0);
    })),
  ],
});

if (N) module.exports = { buildDivider, entry, PULSE_MIN };
else window.buildDivider = buildDivider;
})();
