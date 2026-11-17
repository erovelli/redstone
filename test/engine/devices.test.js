// Rulebook: dispensers, droppers, hoppers, lecterns, bookshelves, bells, doors, signs, frames, fluids and entities.
const { RS, world, eq, ok, throws, first, trace, T } = require('./helpers.js');

// A contained cell at (2,0,0): stone on its north, south and east sides, the floor below.
function basin(w) {
  w.put(2, -1, 0, 'stone'); w.put(2, 1, 0, 'stone'); w.put(3, 0, 0, 'stone');
}

const tests = [
  T('dispenser: acts on a rising edge, 2 ticks later; a water bucket places a source, an empty bucket picks it up', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'E' });
    const disp = w.put(1, 0, 0, 'dispenser', { d: 'E', items: [{ id: 'water_bucket', n: 1 }] });
    basin(w);
    const sounds = [];
    w.on('sound', e => sounds.push(e.name));
    w.seal();
    w.hand.flip(lever);
    eq(first(w, () => !!w.get(2, 0, 0)), 3, 'water placed 2 ticks after the edge');
    eq(disp.items[0], { id: 'bucket', n: 1 }, 'the bucket is empty');
    w.run(5);
    ok(w.get(2, 0, 0).t === 'water' && disp.items[0].id === 'bucket', 'holding the lever does nothing more');
    w.hand.flip(lever); w.run(2);
    w.hand.flip(lever); w.run(4);
    eq([w.get(2, 0, 0), disp.items[0].id], [null, 'water_bucket'], 'picked up again');
    return ok(sounds.includes('bucket_empty') && sounds.includes('bucket_fill'), 'bucket sounds');
  }),

  T('dispenser: ender pearls are dropped as items, never thrown', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'E' });
    w.put(1, 0, 0, 'dispenser', { d: 'E', items: [{ id: 'ender_pearl', n: 2 }] });
    w.seal();
    w.hand.flip(lever); w.run(4);
    eq(w.entities.length, 1, 'one entity');
    return eq([w.entities[0].kind, w.entities[0].item, !!w.entities[0].projectile], ['item', 'ender_pearl', false], 'an item');
  }),

  T('dropper: drops an item, or moves one into the container it faces', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'E' });
    const dr = w.put(1, 0, 0, 'dropper', { d: 'E', items: [{ id: 'stone', n: 5 }] });
    const barrel = w.put(2, 0, 0, 'barrel');
    w.seal();
    w.hand.flip(lever); w.run(4);
    eq([dr.items[0].n, barrel.items.find(Boolean)], [4, { id: 'stone', n: 1 }], 'moved one');
    return eq(w.entities.length, 0, 'nothing dropped');
  }),

  T('hopper: one item per 4 ticks, locked while powered', () => {
    const w = world();
    const chest = w.put(0, 0, 1, 'chest', { items: [{ id: 'stone', n: 3 }] });
    const hopper = w.put(0, 0, 0, 'hopper', { d: 'E' });
    const barrel = w.put(1, 0, 0, 'barrel');
    const lever = w.put(0, 1, 0, 'lever', { att: 'N' });
    w.seal();
    const counts = [];
    for (let i = 0; i < 13; i++) { w.tick(); const s = barrel.items && barrel.items.find(Boolean); counts.push(s ? s.n : 0); }
    eq(counts.filter((v, i) => i && v !== counts[i - 1]).length + (counts[0] ? 1 : 0), 3, 'three transfers');
    ok(counts.indexOf(2) - counts.indexOf(1) === 4, 'four ticks apart');
    chest.items = [{ id: 'stone', n: 3 }]; w._syncFill(chest);
    w.hand.flip(lever);
    const before = barrel.fill;
    w.run(20);
    return eq([hopper.powered, barrel.fill], [true, before], 'locked');
  }),

  T('dispensers, droppers and hoppers are immovable', () => {
    for (const t of ['dispenser', 'dropper', 'hopper']) {
      const w = world({ floorType: 'obsidian' });
      const p = w.put(0, 0, 0, 'piston', { d: 'E' });
      w.put(1, 0, 0, t, { d: 'N' });
      w.put(0, 1, 0, 'lever', { att: 'D', on: true });
      w.run(2);
      if (p.ext) throw new Error(`${t} moved`);
    }
    return true;
  }),

  T('lectern: a comparator reads the page; turning a page sends a pulse', () => {
    const w = world();
    const lec = w.put(0, 0, 0, 'lectern', { pages: 5, page: 0 });
    const comp = w.put(1, 0, 0, 'comparator', { d: 'E' });
    const d = w.put(0, 1, 0, 'dust');
    w.seal();
    w.run(3);
    eq(comp.out, 1, 'page 1 of 5');
    w.hand.page(lec, 4);
    const pulse = trace(w, () => d.lvl > 0, 5);
    eq(comp.out, 15, 'last page');
    eq(pulse.length, 1, 'a 1-tick pulse');
    w.hand.page(lec, 2); w.run(3);
    return eq(comp.out, 8, 'page 3 of 5 reads floor(14 * 2/4) + 1');
  }),

  T('chiseled bookshelf: a comparator reads the last slot used', () => {
    const w = world();
    const shelf = w.put(0, 0, 0, 'bookshelf');
    const comp = w.put(1, 0, 0, 'comparator', { d: 'E' });
    w.seal();
    w.run(2);
    eq(comp.out || 0, 0, 'never used');
    w.hand.book(shelf, 4); w.run(3);
    eq(comp.out, 5, 'slot 5');
    w.hand.book(shelf, 1); w.run(3);
    return eq([comp.out, shelf.slots], [2, [false, true, false, false, true, false]], 'slot 2');
  }),

  T('item frame: a comparator reads its rotation through a block', () => {
    const w = world();
    const frame = w.put(-1, 0, 0, 'frame', { att: 'E', item: 'stick' });
    w.put(0, 0, 0, 'stone');
    const comp = w.put(1, 0, 0, 'comparator', { d: 'E' });
    w.seal();
    w.run(2);
    eq(comp.out, 1, 'rotation 0');
    w.hand.rotate(frame); w.hand.rotate(frame); w.run(2);
    return eq(comp.out, 3, 'rotation 2');
  }),

  T('bell rings on a rising edge', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    const bell = w.put(1, 0, 0, 'bell', { att: 'D' });
    const rings = [];
    w.on('sound', e => { if (e.name === 'bell') rings.push(e.t); });
    w.seal();
    w.hand.flip(lever); w.run(3);
    ok(bell.ringing, 'ringing');
    w.hand.flip(lever); w.run(3);
    return eq(rings.length, 1, 'one ring');
  }),

  T('iron door, trapdoor and fence gate open while powered; hands open only wooden ones', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    const lower = w.put(1, 0, 0, 'door', { half: 'lower' });
    const upper = w.put(1, 0, 1, 'door', { half: 'upper' });
    const trap = w.put(0, 1, 0, 'trapdoor', { iron: true, half: 'bottom' });
    const gate = w.put(-1, 0, 0, 'gate');
    w.seal();
    w.hand.flip(lever); w.run(2);
    eq([lower.open, upper.open, trap.open, gate.open], [true, true, true, true], 'open');
    w.hand.flip(lever); w.run(2);
    eq([lower.open, trap.open, gate.open], [false, false, false], 'closed');
    eq([w.hand.use(lower), w.hand.use(trap), w.hand.use(gate)], [false, false, true], 'hand use');
    return ok(gate.open, 'the gate opened by hand');
  }),

  T('signs take text from a hand and pop off when their block moves', () => {
    const w = world({ floorType: 'obsidian' });
    w.put(0, 0, 0, 'piston', { d: 'E' });
    w.put(1, 0, 0, 'stone');
    const sign = w.put(1, 1, 0, 'sign', { att: 'N', text: '' });
    const lever = w.put(0, 1, 0, 'lever', { att: 'D' });
    w.seal();
    w.hand.write(sign, 'Hello');
    eq(sign.text, 'Hello', 'text');
    w.hand.flip(lever); w.run(2);
    return ok(sign.popped && !w.get(1, 1, 0), 'popped');
  }),

  T('water: a source must be contained on every open side, else seal() refuses the world', () => {
    const w = world();
    w.put(2, 0, 0, 'water');
    throws(() => w.seal(), /not contained/, 'open water');
    const w2 = world();
    basin(w2);
    w2.put(1, 0, 0, 'glass');
    w2.put(2, 0, 0, 'water');
    w2.seal();
    const w3 = world();
    w3.put(1, 0, 0, 'stone'); w3.put(2, -1, 0, 'stone'); w3.put(2, 1, 0, 'stone'); w3.put(4, 0, 0, 'stone'); w3.put(3, -1, 0, 'stone'); w3.put(3, 1, 0, 'stone');
    w3.put(2, 0, 0, 'water'); w3.put(3, 0, 0, 'water');   // two sources contain each other
    w3.seal();
    return throws(() => w2.hand.pour(5, 5, 0), /not contained/, 'pouring into the open');
  }),

  T('bubble columns: soul sand holds a pearl in stasis, magma drags an item down', () => {
    const w = world({ strict: false });
    w.put(0, 0, 0, 'soulsand'); w.put(0, 0, 1, 'water');
    const pearl = w.spawn('pearl', 0.5, 0.5, 1.3, { projectile: true });
    w.put(3, 0, 0, 'magma'); w.put(3, 0, 1, 'water'); w.put(3, 0, 2, 'water');
    const item = w.spawn('item', 3.5, 0.5, 2.5, { item: 'stone' });
    const free = w.spawn('item', 6.5, 0.5, 2.5, { item: 'stone' });
    w.run(2);
    ok(pearl.stasis && pearl.z === 1.3, 'pearl held');
    return ok(item.vz < free.vz, 'the item sinks faster than in air');
  }),

  T('a thrown pearl or snowball hitting a target block emits a signal for 4 ticks', () => {
    for (const kind of ['pearl', 'snowball']) {
      const w = world();
      const target = w.put(5, 0, 2, 'target');
      const hits = [];
      w.on('hit', e => hits.push(e));
      w.seal();
      const en = kind === 'pearl' ? w.hand.throwPearl(5.5, 3.5, 2.5, 0, -0.8, 0) : w.hand.throw('snowball', 5.5, 3.5, 2.5, 0, -0.8, 0);
      w.run(2);
      eq([hits.length, hits[0] && hits[0].block === target, en.gone], [1, true, true], `${kind} hit`);
      ok(target.out >= 10, `${kind}: strength by accuracy (${target.out})`);
      const lit = trace(w, () => target.out > 0, 10).length;
      if (lit < 3 || lit > 4) throw new Error(`${kind}: lit for ${lit} more ticks`);
    }
    return true;
  }),

  T('dispenser shoots snowballs; projectiles hit blocks only when rules.projectileHit is on', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'E' });
    w.put(1, 0, 0, 'dispenser', { d: 'E', items: [{ id: 'snowball', n: 1 }] });
    const target = w.put(5, 0, 0, 'target');
    w.seal();
    w.hand.flip(lever);
    w.run(5);
    ok(w.entities[0].gone && target.out > 0, 'hit');
    const legacy = new RS.World();
    legacy.put(0, 0, 0, 'stone');
    const p = legacy.spawn('pearl', 0.5, 0.5, 1.5, { projectile: true });
    legacy.run(10);
    return ok(!p.gone && p.ground, 'in a legacy world a pearl rests on blocks');
  }),

  T('a strict world refuses a piston move that uncovers a water source', () => {
    const w = world({ floorType: 'obsidian' });
    w.put(0, 0, 0, 'piston', { d: 'E', s: true, ext: true });
    w.put(1, 0, 0, 'head', { d: 'E', s: true });
    w.put(2, 0, 0, 'stone');                 // the east wall of the basin, held by the sticky piston
    w.put(3, -1, 0, 'stone'); w.put(3, 1, 0, 'stone'); w.put(4, 0, 0, 'stone');
    w.put(3, 0, 0, 'water');
    const lever = w.put(0, 1, 0, 'lever', { att: 'D', on: true });
    w.seal();
    w.hand.flip(lever);
    return throws(() => w.run(2), /not contained/, 'retracting opens the basin');
  }),
];

module.exports = { suite: 'engine: devices and entities', tests };
