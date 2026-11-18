// UI contraption for <rs-breadcrumb>: a trail of dust and repeaters from the root to the current page, with each
// crumb's name on oak signs hung on the front of the floor under its stretch of trail.
//
// A lever at the root; then per crumb a repeater (delay 2) and dust over the rest of the crumb's signs; a lamp at
// the end, after the current page. Flip the lever on and the signal walks out one repeater per crumb and stops at
// the lamp: the trail ends where you are. The element flips the lever when it loads (the page's one player action).
//
//   plan (z = 0 on a planks floor; the signs hang on the floor's front face at y = 1, z = -1):
//     y=0   lever  R> dust dust  R> dust  R> dust dust dust  lamp
//     y=1          [crumb 1 ]    [crumb 2] [current page   ]
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const MAX = 6;
const DELAY = 2;
const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// Sign counts per crumb: a number for every crumb, or a list (the element passes one per link).
function signCounts(raw, n) {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.includes(',') ? raw.split(',') : null;
  return [...Array(n).keys()].map(k => int(list ? list[k] : raw, 1, 5, 2));
}

function buildBreadcrumb(p = {}) {
  const n = int(p.crumbs, 1, MAX, 3);
  const signs = signCounts(p.signs, n);
  const w = new RS.World({ strict: true });
  const io = { repeaters: [], signs: [] };
  let x = 0;
  w.put(x, 0, -1, 'planks');
  io.lever = w.put(x, 0, 0, 'lever', { att: 'D', on: yes(p.on) });
  x++;
  for (let k = 0; k < n; k++) {
    const crumb = [];
    for (let i = 0; i < signs[k]; i++, x++) {
      w.put(x, 0, -1, 'planks');
      if (i === 0) io.repeaters.push(w.put(x, 0, 0, 'repeater', { d: 'E', delay: DELAY }));
      else w.put(x, 0, 0, 'dust');
      crumb.push(w.put(x, 1, -1, 'sign', { att: 'N', kind: 'wall', text: '' }));
    }
    io.signs.push(...crumb);
    io['crumb' + k] = crumb;
  }
  w.put(x, 0, -1, 'planks');
  io.lamp = w.put(x, 0, 0, 'lamp');
  w.settle();
  w.seal();
  return { world: w, box: [0, x, 0, 1, -1, 0], io };
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

const entry = Catalogue.register({
  id: 'ui-breadcrumb',
  name: 'Breadcrumb',
  category: 'Navigation',
  summary: 'A trail of dust and repeaters from a lever at the root to a lamp after the current page, one repeater per crumb, with each crumb\'s name on signs below its stretch of trail. Flipped on as the page loads, the signal walks out one crumb at a time and stops at the current page.',
  strict: true,
  deviations: [],
  inputs: ['lever (flipped once as the page loads)'],
  outputs: ['the signal reaching each crumb', 'the lamp at the current page'],
  actions: ['flip the lever'],
  timing: 'Crumb k\'s repeater turns on 2(k + 1) + 1 ticks after the lever (the lever powers the first on the next tick); the lamp at the end lights in the same tick as the last repeater.',
  notes: [
    'Each crumb is at most 5 signs, so the dust after a repeater is at most 4 blocks: the signal arrives at 11 or more.',
    'The links are ordinary links laid over the signs; the trail only shows the way.',
    'Build with { on: true } for a trail that has walked out.',
  ],
  params: [
    { key: 'crumbs', label: 'Crumbs', min: 1, max: MAX, def: 3 },
    { key: 'signs', label: 'Signs per crumb', min: 1, max: 5, def: 2 },
  ],
  controls: [{ kind: 'lever', io: 'lever', label: 'Lever' }],
  build: buildBreadcrumb,
  tests: [
    T('the signal reaches crumb k at 2(k + 1) + 1 ticks, in order, and the lamp with the last (every edge)', () => each(entry, p => {
      const c = buildBreadcrumb(p), w = c.world;
      if (c.io.lamp.lit || c.io.repeaters.some(r => r.on)) return false;
      ui().testing.hand(w).flip(c.io.lever);
      const at = c.io.repeaters.map(() => -1);
      let lamp = -1;
      for (let t = 1; t <= 30; t++) {
        w.tick();
        c.io.repeaters.forEach((r, k) => { if (r.on && at[k] < 0) at[k] = t; });
        if (c.io.lamp.lit && lamp < 0) lamp = t;
      }
      return at.every((t, k) => t === DELAY * (k + 1) + 1) && lamp === at[at.length - 1];
    })),
    T('flipping back returns every block to its start', () => each(entry, p => {
      const c = buildBreadcrumb(p), w = c.world, hand = ui().testing.hand(w);
      const h0 = ui().testing.hash(w);
      hand.flip(c.io.lever);
      ui().testing.settle(w);
      hand.flip(c.io.lever);
      ui().testing.settle(w);
      return ui().testing.hash(w) === h0;
    })),
    T('built off and built on, the steady state does not drift for 100 ticks', () => each(entry, p => [false, true].every(on => {
      const c = buildBreadcrumb(Object.assign({}, p, { on }));
      return ui().testing.noDrift(c.world, 100) && !!c.io.lamp.lit === on;
    }))),
    T('strict: real blocks only, no wiring links, no pistons', () => each(entry, p => {
      const c = buildBreadcrumb(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 0;
    })),
  ],
});

if (N) module.exports = { buildBreadcrumb, entry, MAX };
else window.buildBreadcrumb = buildBreadcrumb;
})();
