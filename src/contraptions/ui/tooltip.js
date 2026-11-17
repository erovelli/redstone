// UI contraption for <rs-tooltip>: the tip text on a row of oak wall signs, behind a honey curtain.
//
// The signs hang on a row of planks. In front of them hangs a row of honey blocks; honey sticks to honey (and not
// to the signs, the planks behind them or anything else here), so one sticky piston under the row's west end
// moves the whole row. Signs cannot be pushed and pop when their block moves, so nothing ever moves a sign or its
// planks: the curtain moves past them, one block down into the row under the signs, and back.
//
// The piston is held extended (the curtain up, covering the signs) by a redstone wall torch beside it. The torch
// hangs on a stone block with a stone pressure plate on top. Standing on the plate strongly powers the stone, the
// torch goes out, and the piston pulls the curtain down: the signs are uncovered. Stepping off releases the plate
// at its next check (up to 10 ticks later); the torch relights and the piston pushes the curtain back up.
//
//   front view (x east, z up); y = 0 the planks, y = 1 the signs, y = 2 the curtain plane:
//     z=0    .      .      [sign/honey] x n           closed: honey at y = 2 in front of every sign
//     z=-1   plate  .      head  honey ...             open:   the honey row one block lower, the head gone
//     z=-2   stone  torch  piston (sticky, up)
//            x=-1   x=0    x=1 ... n
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const MAX_SIGNS = 12;   // the honey row is one structure: at most 12 blocks for its piston

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function buildTooltip(p = {}) {
  const n = int(p.signs, 1, MAX_SIGNS, 3);
  const w = new RS.World({ strict: true });
  const signs = [], covers = [];
  for (let x = 1; x <= n; x++) {
    w.put(x, 0, 0, 'planks');
    signs.push(w.put(x, 1, 0, 'sign', { att: 'N', kind: 'wall', text: '' }));
    covers.push(w.put(x, 2, 0, 'honey'));
  }
  const piston = w.put(1, 2, -2, 'piston', { d: 'U', s: true, ext: true });
  w.put(1, 2, -1, 'head', { d: 'U', s: true, p: piston });
  const base = w.put(-1, 2, -2, 'stone');
  const torch = w.put(0, 2, -2, 'torch', { att: 'W', lit: true });
  const plate = w.put(-1, 2, -1, 'plate', { on: false });
  w.seal();
  const front = [];
  for (let x = 1; x <= n; x++) front.push([x, 2, 0]);
  return { world: w, box: [-1, n, 0, 2, -2, 0], front, io: { plate, base, torch, piston, covers, signs } };
}

// Uncovered: no block in front of any sign. Home: the honey row in front of every sign.
const isOpen = c => c.front.every(([x, y, z]) => !c.world.get(x, y, z));
const isHome = c => c.front.every(([x, y, z]) => { const b = c.world.get(x, y, z); return !!b && b.t === 'honey'; });

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

const entry = Catalogue.register({
  id: 'ui-tooltip',
  name: 'Tooltip',
  category: 'Disclosure and overlays',
  summary: 'The tip is written on oak wall signs behind a honey curtain. Standing on a pressure plate puts out the torch that holds a sticky piston up; the piston pulls the curtain down past the signs, which never move.',
  strict: true,
  deviations: [],
  inputs: ['stone pressure plate'],
  outputs: ['signs uncovered', 'curtain home'],
  actions: ['stand on the plate', 'step off the plate'],
  timing: 'Signs uncovered 3 ticks after stepping on (the plate, the torch, the piston). The plate releases up to 10 ticks after stepping off; the curtain is back 2 ticks after that.',
  notes: [
    'Honey sticks only to honey here: the signs and the planks they hang on are never moved, so no sign pops.',
    'One piston moves the whole curtain, so the tip is at most 12 signs long.',
  ],
  params: [{ key: 'signs', label: 'Signs', min: 1, max: MAX_SIGNS, def: 3 }],
  controls: [{ kind: 'plate', io: 'plate', label: 'Stand on the plate' }],
  build: buildTooltip,
  tests: [
    T('stepping on uncovers the signs on tick 3; stepping off covers them within 12 (every edge)', () => each(entry, p => {
      const t = ui().testing, c = buildTooltip(p), w = c.world, hand = t.hand(w);
      if (!isHome(c)) return false;
      hand.step(c.io.plate, true);
      const on = t.ticksUntil(w, () => isOpen(c), 20);
      w.run(5);
      hand.step(c.io.plate, false);
      const off = t.ticksUntil(w, () => isHome(c), 30);
      return on === 3 && off >= 2 && off <= 12;
    })),
    T('a full cycle returns every block to its start, twice, and no sign ever pops', () => each(entry, p => {
      const t = ui().testing, c = buildTooltip(p), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      let pops = 0;
      w.on('pop', () => pops++);
      for (let k = 0; k < 2; k++) {
        hand.step(c.io.plate, true);
        t.settle(w);
        if (!isOpen(c)) return false;
        hand.step(c.io.plate, false);
        t.settle(w);
      }
      return t.hash(w) === h0 && pops === 0 && c.io.signs.every(s => w.c.get(RS.K(s.x, s.y, s.z)) === s);
    })),
    T('push limit by construction: the piston moves exactly the honey row, both ways', () => each(entry, p => {
      const t = ui().testing, c = buildTooltip(p), w = c.world, hand = t.hand(w), sizes = [];
      w.on('move', ev => sizes.push(ev.blocks.every(b => b.t === 'honey') ? ev.blocks.length : 99));
      hand.step(c.io.plate, true);
      t.settle(w);
      hand.step(c.io.plate, false);
      t.settle(w);
      return sizes.length === 2 && sizes.every(k => k === c.io.covers.length && k <= 12);
    })),
    T('the built steady state does not drift for 100 ticks', () => each(entry, p => ui().testing.noDrift(buildTooltip(p).world, 100))),
    T('strict: real blocks only, no wiring links, one piston', () => each(entry, p => {
      const c = buildTooltip(p);
      return ui().testing.strictWorld(c.world, RS) && ui().testing.pistonCount(c.world) === 1;
    })),
  ],
});

if (N) module.exports = { buildTooltip, isOpen, isHome, entry };
else window.buildTooltip = buildTooltip;
})();
