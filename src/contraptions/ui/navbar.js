// UI contraption for <rs-navbar>: one ender pearl launcher per link, side by side in one wall.
//
// Per link (x offsets from the link's first column; y=0 is the wall face, y=1 in front of it, y<0 behind it;
// z=0 is the chamber row):
//
//   front view, y=0                       behind (wiring, seen in x-ray)
//   z= 1  side piston > slime  .   .      the side piston's drive comes down from y=-3 to a repeater at (0,-1,1)
//   z= 0  planks   jukebox  water  disp<  label planks (oak wall signs at y=1)
//   z=-1  planks   planks   soul   BUTTON-block   repeater> dust (wiring out of the button block)
//   z=-2  planks   jukebox   .     jukebox
//   z=-3  planks   jukebox  slime  jukebox
//   z=-4  planks   planks   up^    planks
//
// The stasis chamber is a water source at (2,0,0) on soul sand: an upward bubble column holds the pearl still.
// It is contained by glass in front, a dispenser (with an empty bucket) to the east, a jukebox to the west and an
// observer behind. The soul sand is held under it by an extended sticky piston behind it (2,-2,-1), powered by a
// comparator in subtract mode that reads a barrel with one item: it outputs 1 until either of its sides is powered.
//
// Sequence (ticks after the press; the button stays in for 10):
//   1   the button strongly powers the block it is on; the dispenser above it is activated
//   3   the dispenser fires: its empty bucket scoops up the water; the bubble column is gone and the pearl sinks
//   5   a delay-3 repeater from the button block reaches the comparator: the piston pulls the soul sand into the wall
//   9   the pearl is in the cell above the slime: the up piston fires (dust from the delay line on the back plane)
//   10  the side piston fires: its slime strikes the rising pearl, which flies up and to the east, out of the wall
//   19  the up piston retracts; 20 the side piston retracts
//   23  the comparator's second side (a later copy of the launch signal) lets go: the soul sand is pushed back
//   24  the observer behind the water sees the piston head return and pulses the block behind the dispenser
//   26  the dispenser fires again: its water bucket pours the source back. The chamber is ready for a new pearl.
//
// The slime blocks never touch each other, the soul sand or any movable block: every wall block next to a slime
// block's path is a jukebox (immovable, so slime slides past it), the dispenser, a piston head, or wiring.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const WALL = 'planks';
const MIN_SIGNS = 2;
const MAX_SIGNS = 3;

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// Sign counts per link: a number for every link, or a list (the element passes one per link from the text width).
function signCounts(p, links) {
  const raw = p.signs;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.includes(',') ? raw.split(',') : null;
  const out = [];
  for (let i = 0; i < links; i++) {
    const v = list ? list[i] : raw;
    out.push(int(v, MIN_SIGNS, MAX_SIGNS, MIN_SIGNS));
  }
  return out;
}

// One link whose first column is x0. Returns the link record.
function buildLink(w, x0, signs, i) {
  const put = (x, y, z, t, s = {}) => w.put(x0 + x, y, z, t, s);
  const rep = (x, y, z, d, delay = 1) => put(x, y, z, 'repeater', { d, delay });
  const dust = (x, y, z) => put(x, y, z, 'dust');
  const L = { i, x0 };

  // ---- the wall face (y = 0)
  L.sidePiston = put(0, 0, 1, 'piston', { d: 'E', s: true });
  L.sideSlime = put(1, 0, 1, 'slime');
  put(0, 0, 0, WALL);
  put(1, 0, 0, 'jukebox');
  L.water = put(2, 0, 0, 'water');
  const slots = [{ id: 'bucket', n: 1 }];
  while (slots.length < 9) slots.push(null);
  L.dispenser = put(3, 0, 0, 'dispenser', { d: 'W', items: slots });
  put(0, 0, -1, WALL);
  put(1, 0, -1, WALL);
  L.soul = put(2, 0, -1, 'soulsand');
  L.buttonBlock = put(3, 0, -1, WALL);
  for (const [x, t] of [[0, WALL], [1, 'jukebox'], [3, 'jukebox']]) put(x, 0, -2, t);
  put(0, 0, -3, WALL);
  put(1, 0, -3, 'jukebox');
  L.upSlime = put(2, 0, -3, 'slime');
  put(3, 0, -3, 'jukebox');
  put(0, 0, -4, WALL);
  put(1, 0, -4, WALL);
  L.upPiston = put(2, 0, -4, 'piston', { d: 'U', s: true });
  put(3, 0, -4, WALL);
  // label columns: wall below a row of oak wall signs; the first two carry the wiring out of the button block
  L.signs = [];
  for (let k = 0; k < signs; k++) {
    const x = 4 + k;
    for (let z = -4; z <= 0; z++) if (!(z === -1 && k < 2)) put(x, 0, z, WALL);
    L.signs.push(put(x, 1, 0, 'sign', { att: 'N', kind: 'wall', text: '' }));
  }

  // ---- in front (y = 1)
  put(2, 1, 0, 'glass');
  L.button = put(3, 1, -1, 'button', { att: 'N', on: false });

  // ---- the soul sand piston and its comparator
  L.soulPiston = put(2, -2, -1, 'piston', { d: 'S', s: true, ext: true });
  put(2, -1, -1, 'head', { d: 'S', s: true, p: L.soulPiston });
  L.comparator = put(3, -2, -1, 'comparator', { d: 'W', mode: 'sub', out: 1 });
  put(3, -2, -2, WALL);
  put(4, -2, -1, 'barrel', { items: [{ id: 'stone', n: 1 }] });
  rep(3, -1, -1, 'N', 3);                       // early: the button block -> the comparator's south side
  put(3, -1, -2, WALL);

  // ---- refill: the observer behind the water watches the piston head; its pulse reaches the block behind the
  // dispenser through a jukebox and a dust. It also fires when the soul sand leaves, while the button still
  // powers the dispenser, so that pulse makes no second rising edge.
  L.observer = put(2, -1, 0, 'observer', { d: 'D' });
  put(2, -1, 1, 'jukebox');
  dust(3, -1, 1);
  put(3, -1, 0, WALL);

  // ---- up piston: dust on the block behind it, fed from the back plane
  dust(2, -1, -3);
  put(2, -1, -4, WALL);
  dust(2, -2, -3);
  put(2, -2, -4, WALL);

  // ---- side piston: repeater behind it, fed by dust from the back plane
  rep(0, -1, 1, 'S');
  put(0, -1, 0, WALL);
  dust(0, -2, 1);
  put(0, -2, 0, WALL);

  // ---- the launch line: button block -> repeater -> dust down the second label column into the back plane
  rep(4, 0, -1, 'E', 1);
  dust(5, 0, -1);
  dust(5, -1, -1);
  put(5, -1, -2, WALL);
  dust(5, -2, -2);
  put(5, -2, -3, WALL);
  dust(5, -3, -3);
  put(5, -3, -4, WALL);
  rep(4, -3, -3, 'W', 4);
  put(4, -3, -4, WALL);
  rep(3, -3, -3, 'W', 3);
  put(3, -3, -4, WALL);
  dust(2, -3, -3);                              // reaches the up piston (south) at tick 9
  put(2, -3, -4, WALL);
  // a staircase up to the side piston's feed (glass where a block would cut the dust)
  dust(1, -3, -2);
  put(1, -3, -3, WALL);
  dust(0, -3, -1);
  put(0, -3, -2, WALL);
  put(1, -3, -1, 'glass');
  dust(1, -3, 0);
  put(0, -3, 0, 'glass');
  dust(0, -3, 1);
  // late copy: repeater -> block -> dust on the comparator's north side
  rep(2, -3, 0, 'E', 3);
  put(2, -3, -1, WALL);
  put(3, -3, 0, WALL);
  dust(3, -3, -1);
  put(3, -3, -2, WALL);

  L.home = [x0 + 2.5, 0.5, 0];                   // the chamber cell
  L.width = 4 + signs;
  return L;
}

// Where a player throws a fresh pearl so that it settles in the chamber's bubble column.
const THROW = { dz: 1.2, vz: -0.1 };

function buildNavbar(p = {}) {
  const links = int(p.links, 1, 6, 3);
  const signs = signCounts(p, links);
  const w = new RS.World({ strict: true });
  const all = [];
  let x = 1;
  for (let z = -4; z <= 1; z++) w.put(0, 0, z, WALL);   // a wall column at each end
  for (let i = 0; i < links; i++) {
    const L = buildLink(w, x, signs[i], i);
    all.push(L);
    x += L.width;
  }
  for (let z = -4; z <= 0; z++) w.put(x, 0, z, WALL);
  w.seal();
  const hand = w.hand;
  // The player throws one pearl into each chamber.
  for (const L of all) restock(w, L);
  w.settle(400);
  const box = [0, x, -3, 1, -4, 1];
  return {
    world: w,
    box,
    links: all,
    io: { button: all[0].button, buttons: all.map(L => L.button), signs: all.flatMap(L => L.signs) },
    ready: L => ready(w, L),
    pearlOf: L => pearlIn(w, L),
    restock: L => restock(w, L),
  };
}

// The chamber holds water on soul sand and the soul sand piston is out: a pearl can go in.
function chamberSet(w, L) {
  const water = w.get(L.x0 + 2, 0, 0);
  return !!water && water.t === 'water' && w.get(L.x0 + 2, 0, -1) === L.soul && !!L.soulPiston.ext;
}
// The pearl held in this link's chamber, if any.
function pearlIn(w, L) {
  return w.entities.find(en => !en.gone && en.kind === 'pearl' && en.stasis && Math.floor(en.x) === L.x0 + 2 && Math.floor(en.z) === 0) || null;
}
// Ready to launch: the machine is home and a pearl is in the chamber.
function ready(w, L) {
  return chamberSet(w, L) && !L.button.on && !L.upPiston.ext && !L.sidePiston.ext && !!pearlIn(w, L);
}
// A player throws a pearl down into the chamber (only when the chamber is set and empty).
function restock(w, L) {
  if (!chamberSet(w, L) || pearlIn(w, L)) return false;
  w.hand.throwPearl(L.home[0], L.home[1], THROW.dz, 0, 0, THROW.vz);
  return true;
}

/* ---------- tests ---------- */

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

// Press link i's button and record the ticks of each event until the machine is quiet again.
function launch(c, i, max = 60) {
  const w = c.world, L = c.links[i], pearl = c.pearlOf(L);
  const ev = {};
  const mark = (k, cond) => { if (ev[k] === undefined && cond) ev[k] = t; };
  let t = 0;
  w.hand.press(L.button);
  for (t = 1; t <= max; t++) {
    w.tick();
    const water = w.get(L.x0 + 2, 0, 0);
    mark('scoop', !water);
    mark('soulOut', !L.soulPiston.ext);
    mark('up', L.upPiston.ext);
    mark('side', L.sidePiston.ext);
    mark('flying', pearl && !pearl.stasis && pearl.vx > 0.5 && pearl.vz > 0.3);
    mark('soulBack', ev.soulOut !== undefined && L.soulPiston.ext);
    mark('pour', ev.scoop !== undefined && !!water);
  }
  return { ev, pearl };
}
const blocksHash = w => {
  const parts = [...w.c.values()].map(b => w.stateOf(b)).sort();
  return parts.join('|');
};

const entry = Catalogue.register({
  id: 'ui-navbar',
  name: 'Ender pearl navigation',
  category: 'Navigation',
  summary: 'One ender pearl stasis chamber per link. The stone button drains the chamber (a dispenser scoops the water, a piston pulls the soul sand away), the pearl drops onto slime, and two slime pistons, one tick apart, fling it up and across the page. The machine then resets itself and refills the chamber; the player throws in a new pearl.',
  strict: true,
  deviations: [],
  inputs: ['stone button (one per link)'],
  outputs: ['ender pearl launched up and to the east'],
  actions: ['press a button', 'throw an ender pearl into a chamber (restock)'],
  timing: 'Water scooped at tick 3, soul sand pulled at 5, up piston at 9, side piston at 10 (the pearl leaves the wall), pistons home at 19 and 20, soul sand back at 23, water poured back at 26.',
  notes: [
    'The bubble column over soul sand holds a thrown pearl still. Draining it needs both the water (a dispenser\'s empty bucket) and the soul sand (pulled into the wall) gone; the dispenser fires first so the water never stands over air.',
    'The soul sand piston is held out by a comparator in subtract mode reading a barrel with one item. Its two sides take an early and a late copy of the button signal, so the soul sand stays away until both slime pistons are home: slime must never touch the soul sand.',
    'The refill is triggered by an observer behind the water watching the piston head. Its first pulse (soul sand leaving) comes while the button still powers the dispenser, so only the second one makes a rising edge.',
    'Every wall block a slime block touches is a jukebox, the dispenser or a piston head, so slime never drags the wall. The two slime blocks are always at least two cells apart.',
    'Pressing a button again before its chamber has refilled would pour water over the open drop shaft; the element ignores presses until the machine is home.',
    'Build params: links 1 to 6, signs 2 to 3 per link (a wider wall would put the far end in the path of the falling pearl) (a number, or one per link). The builder throws one pearl into each chamber after sealing.',
  ],
  params: [
    { key: 'links', label: 'Links', min: 1, max: 6, def: 3 },
    { key: 'signs', label: 'Signs per label', min: 2, max: 3, def: 2 },
  ],
  controls: [
    { kind: 'button', io: 'button', label: 'Press first button' },
    { kind: 'action', label: 'Restock pearls', fn: c => c.links.forEach(c.restock) },
  ],
  monitor: c => Object.fromEntries(c.links.map(L => [`chamber ${L.i + 1}`, c.ready(L) ? 'ready' : c.pearlOf(L) ? 'pearl held' : 'empty'])),
  build: buildNavbar,
  tests: [
    T('a press launches the pearl on the documented ticks, up then sideways (every parameter edge, every link)', () => each(entry, p => {
      const c0 = buildNavbar(p);
      for (let i = 0; i < c0.links.length; i++) {
        const c = buildNavbar(p);
        if (!c.ready(c.links[i])) return false;
        const { ev, pearl } = launch(c, i, 30);
        const ok = ev.scoop === 3 && ev.soulOut === 5 && ev.up === 9 && ev.side === 10 && ev.flying === 10 && ev.soulBack === 23 && ev.pour === 26;
        if (!ok) throw new Error('events ' + JSON.stringify(ev));
        // other chambers are untouched
        if (!c.links.every((L, k) => k === i || c.ready(L))) return false;
        if (pearl.gone || pearl.vx <= 0) return false;
      }
      return true;
    })),
    T('the up push comes first, then the side push one tick later', () => {
      const c = buildNavbar({ links: 1 }), L = c.links[0], pearl = c.pearlOf(L), w = c.world;
      c.world.hand.press(L.button);
      let upOnly = false, both = false;
      for (let t = 1; t <= 12; t++) {
        w.tick();
        if (t === 9) upOnly = pearl.vz > 0.5 && pearl.vx === 0;
        if (t === 10) both = pearl.vx > 0.5 && pearl.vz > 0.5;
      }
      return upOnly && both;
    }),
    T('the launched pearl clears the wall and every link to its east', () => {
      const c = buildNavbar({ links: 6, signs: 3 }), w = c.world, L = c.links[0], pearl = c.pearlOf(L);
      w.hand.press(L.button);
      for (let t = 0; t < 80 && !pearl.gone && pearl.x < c.box[1] + 1; t++) w.tick();
      return !pearl.gone && pearl.x >= c.box[1] + 1 && pearl.z > c.box[5] + 1;
    }),
    T('a full cycle returns every block to its start, and a thrown pearl restores the start state', () => each(entry, p => {
      const c = buildNavbar(p), w = c.world, L = c.links[0];
      const h0 = w.hash(), b0 = blocksHash(w);
      launch(c, 0, 40);
      if (blocksHash(w) !== b0) return false;
      for (let t = 0; t < 400 && !w.quiet; t++) w.tick();   // the old pearl flies out of the world
      if (!c.restock(L)) return false;
      w.settle(400);
      return w.hash() === h0 && c.ready(L);
    })),
    T('two launches in a row, and a different link after that', () => {
      const c = buildNavbar({ links: 3 }), w = c.world;
      const h0 = w.hash();
      for (const i of [1, 1, 2]) {
        const L = c.links[i];
        if (!c.ready(L)) return false;
        const { ev } = launch(c, i, 40);
        if (ev.side !== 10 || ev.pour !== 26) return false;
        w.settle(400);
        if (!c.restock(L)) return false;
        w.settle(400);
      }
      return w.hash() === h0;
    }),
    T('a second press while the button is still in does nothing', () => {
      const c = buildNavbar({ links: 2 }), w = c.world, L = c.links[0];
      w.hand.press(L.button);
      w.run(4);
      const again = w.hand.press(L.button);
      w.run(40);
      return again === false && !c.ready(L) && chamberSet(w, L) && c.ready(c.links[1]);
    }),
    T('ready() is false from the press until the chamber is refilled and restocked', () => {
      const c = buildNavbar({ links: 1 }), w = c.world, L = c.links[0];
      w.hand.press(L.button);
      for (let t = 1; t <= 40; t++) {
        w.tick();
        if (c.ready(L)) return false;
      }
      return chamberSet(w, L);
    }),
    T('the built steady state does not drift for 100 ticks', () => each(entry, p => {
      const c = buildNavbar(p);
      c.world.assertSteady(100);
      return ui().testing.noDrift(c.world, 100);
    })),
    T('strict: real blocks only, no wiring links, nothing hidden, contained water', () => each(entry, p => ui().testing.strictWorld(buildNavbar(p).world, RS))),
    T('push limit by construction: no piston ever moves more than 2 blocks', () => {
      const c = buildNavbar({ links: 2 }), w = c.world;
      let most = 0;
      const off = w.on('move', e => { most = Math.max(most, e.blocks.length); });
      launch(c, 0, 40);
      launch(c, 1, 40);
      off();
      return most <= 2 && most > 0;
    }),
    T('no slime block ever touches a movable block it could drag', () => {
      const c = buildNavbar({ links: 2 }), w = c.world, L = c.links[1];
      const D = Object.values(RS.D);
      const moveable = b => b && RS.blocks[b.t].push === 'normal';
      const bad = () => [L.sideSlime, L.upSlime].some(s => D.some(([dx, dy, dz]) => {
        const n = w.get(s.x + dx, s.y + dy, s.z + dz);
        return moveable(n) && n !== L.sidePiston && n !== L.upPiston;
      }));
      if (bad()) return false;
      w.hand.press(L.button);
      for (let t = 0; t < 40; t++) {
        w.tick();
        if (bad()) return false;
      }
      return true;
    }),
  ],
});

if (N) module.exports = { buildNavbar, entry, launch };
else window.buildNavbar = buildNavbar;
})();
