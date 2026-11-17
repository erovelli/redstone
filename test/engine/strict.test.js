// Strict worlds, seal(), world.hand, events, quiet/settle/hash/assertSteady, the registry and the exporter.
const { RS, world, eq, ok, throws, T } = require('./helpers.js');

function leverLamp() {
  const w = world();
  const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
  w.put(1, 0, 0, 'dust');
  const lamp = w.put(2, 0, 0, 'lamp');
  return { w, lever, lamp };
}

const tests = [
  T('the registry holds the SPEC 5.2 palette with Minecraft ids; legacy blocks are fake', () => {
    const palette = ['stone', 'bricks', 'planks', 'smooth_stone', 'iron', 'quartz', 'wool', 'concrete', 'glass', 'terracotta', 'obsidian', 'slime', 'honey',
      'rblock', 'lamp', 'bulb', 'target', 'noteblock', 'jukebox', 'barrel', 'furnace', 'chest', 'dispenser', 'dropper', 'hopper', 'lectern', 'bookshelf',
      'bell', 'sign', 'piston', 'head', 'observer', 'dust', 'torch', 'repeater', 'comparator', 'lever', 'button', 'plate', 'door', 'trapdoor', 'gate',
      'daylight', 'sculk', 'soulsand', 'magma', 'water'];
    for (const t of palette) {
      const d = RS.blocks[t];
      if (!d) throw new Error(`${t} missing`);
      if (d.fake) throw new Error(`${t} is fake`);
      if (!d.mc) throw new Error(`${t} has no mc id`);
    }
    ok(['wall', 'wallb', 'ground'].every(t => RS.blocks[t].fake && RS.blocks[t].push === 'immovable'), 'legacy blocks are fake and immovable');
    eq(['obsidian', 'glass', 'terracotta', 'dust', 'barrel', 'slime', 'noteblock', 'bell', 'trapdoor'].map(t => RS.blocks[t].push), ['immovable', 'normal', 'push_only', 'destroy', 'immovable', 'normal', 'normal', 'destroy', 'normal'], 'push classes');
    eq(['smooth_stone', 'glass', 'slime', 'honey', 'bulb', 'noteblock', 'hopper'].map(t => RS.blocks[t].conductive), [true, false, true, false, false, true, false], 'conductive');
    return eq([RS.blocks.slime.sticky, RS.blocks.honey.sticky], ['slime', 'honey'], 'sticky');
  }),

  T('defineBlock adds a block with its own behaviour', () => {
    RS.defineBlock('test_beacon', { mc: 'minecraft:sea_lantern', source: true, emits: (w, b) => (b.on ? 9 : 0) });
    const w = world();
    w.put(0, 0, 0, 'test_beacon', { on: true });
    const d = w.put(1, 0, 0, 'dust');
    w.tick();
    eq(d.lvl, 9, 'dust powered by the new block');
    return throws(() => RS.defineBlock('bad', { push: 'sideways' }), /push must be/);
  }),

  T('seal() rejects fake blocks, wiring links, hidden blocks, unsupported attachments and unknown types', () => {
    const fake = world(); fake.put(0, 0, 0, 'wallb');
    throws(() => fake.seal(), /not a vanilla block/, 'fake');
    const link = world(); link.floor.push({ feed: [0, 0, 0], cells: [[1, 0, 0]] });
    throws(() => link.seal(), /wiring link/, 'floor link');
    const buried = world(); buried.put(0, 0, 0, 'stone', { buried: true });
    throws(() => buried.seal(), /buried/, 'buried');
    const floating = world(); floating.put(0, 0, 3, 'torch', { att: 'D' });
    throws(() => floating.seal(), /nothing to attach to/, 'unsupported torch');
    const headless = world(); headless.put(0, 0, 0, 'piston', { d: 'E', ext: true });
    throws(() => headless.seal(), /without its head/, 'piston without head');
    return throws(() => world().put(0, 0, 0, 'unobtainium'), /unknown block/, 'unknown type');
  }),

  T('after seal, put/set/shift/at/spawn/vibrate and floor links throw; world.hand works', () => {
    const { w, lever, lamp } = leverLamp();
    w.seal();
    throws(() => w.put(5, 0, 0, 'stone'), /sealed/, 'put');
    throws(() => w.set(2, 0, 0, null), /sealed/, 'set');
    throws(() => w.shift([lamp], 'E'), /sealed/, 'shift');
    throws(() => w.at(w.t + 1, () => {}), /sealed/, 'at');
    throws(() => w.spawn('item', 0, 0, 0), /sealed/, 'spawn');
    throws(() => w.vibrate(0, 0, 0), /sealed/, 'vibrate');
    throws(() => w.floor.push({}), null, 'floor');
    w.hand.flip(lever);
    w.tick();
    return ok(lamp.lit, 'the lever lit the lamp');
  }),

  T('event listeners watch but cannot drive', () => {
    const { w, lever } = leverLamp();
    const seen = [];
    w.on('sound', e => {
      seen.push(e.name);
      throws(() => w.hand.flip(lever), /listeners/, 'hand from a listener');
      throws(() => w.put(9, 0, 0, 'stone'), /sealed/, 'put from a listener');
    });
    w.seal();
    w.hand.flip(lever);
    return eq(seen, ['click'], 'heard the click');
  }),

  T('move and pop events', () => {
    const w = world({ floorType: 'obsidian' });
    w.put(0, 0, 0, 'piston', { d: 'E' });
    w.put(1, 0, 0, 'stone');
    w.put(1, 0, 1, 'torch', { att: 'D' });
    const lever = w.put(0, 1, 0, 'lever', { att: 'D' });
    const ev = [];
    w.on('move', e => ev.push(['move', e.name, e.dir, e.blocks.length]));
    w.on('pop', e => ev.push(['pop', e.name]));
    w.seal();
    w.hand.flip(lever);
    w.tick();
    return eq(ev, [['pop', 'torch'], ['move', 'extend', 'E', 1]], 'events');
  }),

  T('quiet, settle and the cheap idle tick', () => {
    const { w, lever, lamp } = leverLamp();
    w.seal();
    const n = w.settle();
    ok(w.quiet && n >= 1, 'settles');
    const t = w.t;
    w.run(50);
    eq(w.t, t + 50, 'the clock advances while quiet');
    w.hand.flip(lever);
    ok(!w.quiet, 'a player action wakes it');
    w.settle();
    ok(lamp.lit && w.quiet, 'lit and quiet again');
    w.hand.flip(lever);
    const off = w.settle();
    return ok(!lamp.lit && off >= 3, `quiet only after the lamp has turned off (${off} ticks)`);
  }),

  T('settle throws for a clock unless lenient', () => {
    const w = world();
    w.put(1, 0, 0, 'stone');
    w.put(2, 0, 0, 'torch', { att: 'W', lit: true });
    w.put(2, 1, 0, 'dust'); w.put(2, 2, 0, 'dust'); w.put(1, 2, 0, 'dust');
    w.put(1, 1, 0, 'repeater', { d: 'N', delay: 4 });
    w.seal();
    throws(() => w.settle(100), /not quiet/, 'clock');
    return eq(w.settle(50, { lenient: true }), -1, 'lenient');
  }),

  T('hash: equal after a full use cycle, different in between', () => {
    const { w, lever } = leverLamp();
    w.seal();
    w.settle();
    const h0 = w.hash();
    w.hand.flip(lever); w.settle();
    const h1 = w.hash();
    w.hand.flip(lever); w.settle();
    ok(h1 !== h0, 'differs while on');
    return eq(w.hash(), h0, 'back to the start');
  }),

  T('assertSteady: a correct built state holds; a drifting one names the block', () => {
    const good = world({ floorType: 'obsidian' });
    good.put(0, 0, 0, 'piston', { d: 'E', ext: true });
    good.put(1, 0, 0, 'head', { d: 'E' });
    good.put(0, 1, 0, 'rblock');
    good.put(5, 0, 0, 'stone');
    good.put(6, 0, 0, 'torch', { att: 'W', lit: true });
    good.seal();
    ok(good.assertSteady(), 'steady');
    const bad = world();
    bad.put(0, 0, 0, 'lamp', { lit: true });   // nothing powers it
    bad.seal();
    return throws(() => bad.assertSteady(), /lamp built at 0,0,0 changed/, 'drift');
  }),

  T('rules: legacy worlds keep legacy behaviour, strict worlds get the full rules', () => {
    const legacy = new RS.World(), strict = new RS.World({ strict: true });
    eq(legacy.rules, { qc: false, stretch: false, trapdoorPush: false, projectileHit: false }, 'legacy');
    eq(strict.rules, { qc: true, stretch: true, trapdoorPush: true, projectileHit: true }, 'strict');
    return eq(new RS.World({ rules: { qc: true } }).rules.qc, true, 'override');
  }),

  T('legacy worlds: wiring links, direct pokes and fake blocks still work', () => {
    const w = new RS.World();
    w.put(0, 0, -1, 'ground');
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });   // strongly powers the ground block it is on
    const lamp = w.put(5, 5, 0, 'lamp');
    w.put(5, 5, -1, 'wallb');
    w.floor.push({ feed: [0, 0, -1], cells: [[5, 5, -1]] });
    lever.on = true;
    w.run(2);
    return ok(lamp.lit, 'linked');
  }),

  T('toCommands maps engine x, y, z to Minecraft x, z, y', () => {
    const w = world({ floor: false });
    w.put(1, 2, 3, 'stone');
    w.put(0, 0, 0, 'repeater', { d: 'E', delay: 2 });
    w.put(0, 1, 0, 'piston', { d: 'S', s: true });
    w.put(0, 3, 0, 'torch', { att: 'N', lit: true });
    const cmds = w.toCommands({ origin: [10, 64, 20] });
    eq(cmds[0], 'fill 10 64 20 11 67 23 minecraft:air', 'clear');
    ok(cmds.includes('setblock 11 67 22 minecraft:stone replace'), 'stone position');
    ok(cmds.includes('setblock 10 64 20 minecraft:repeater[facing=west,delay=2,locked=false,powered=false] replace'), 'repeater faces its input');
    ok(cmds.includes('setblock 10 64 21 minecraft:sticky_piston[facing=south,extended=false] replace'), 'piston');
    ok(cmds.includes('setblock 10 64 23 minecraft:redstone_wall_torch[facing=south,lit=true] replace'), 'wall torch');
    ok(cmds.indexOf('setblock 10 64 23 minecraft:redstone_wall_torch[facing=south,lit=true] replace') > cmds.indexOf('setblock 11 67 22 minecraft:stone replace'), 'attached blocks last');
    return ok(w.toCommands()[1].startsWith('setblock ~'), 'relative without an origin');
  }),
];

module.exports = { suite: 'engine: strict worlds and API', tests };
