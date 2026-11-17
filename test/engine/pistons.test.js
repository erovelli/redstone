// Rulebook: Pistons.
const { RS, world, eq, ok, trace, T } = require('./helpers.js');

// A piston at (0,0,0) facing east, driven by a lever beside it at (0,1,0).
// The floor is obsidian so slime does not stick to it.
function rig(opts = {}) {
  const w = world(Object.assign({ floorType: 'obsidian' }, opts));
  const piston = w.put(0, 0, 0, 'piston', { d: 'E', s: !!opts.sticky });
  const lever = w.put(0, 1, 0, 'lever', { att: 'D' });
  return { w, piston, lever };
}

const tests = [
  T('push limit 12', () => {
    for (const [n, want] of [[12, true], [13, false]]) {
      const { w, piston, lever } = rig();
      for (let x = 1; x <= n; x++) w.put(x, 0, 0, 'stone');
      w.hand.flip(lever);
      w.run(2);
      eq(!!piston.ext, want, `${n} blocks`);
    }
    return true;
  }),

  T('a piston cannot be powered through its face', () => {
    const w = world();
    const p = w.put(0, 0, 0, 'piston', { d: 'E' });
    w.put(1, 0, 0, 'rblock');
    w.run(3);
    return ok(!p.ext, 'a redstone block against the face does not fire it');
  }),

  T('an extended piston base is immovable', () => {
    const { w, piston, lever } = rig();
    w.put(1, 0, 0, 'stone');
    const other = w.put(2, 0, 0, 'piston', { d: 'N' });
    const l2 = w.put(3, 0, 0, 'lever', { att: 'D' });
    w.hand.flip(l2); w.run(2);
    ok(other.ext, 'the other piston is extended');
    w.hand.flip(lever); w.run(2);
    return ok(!piston.ext, 'it cannot be pushed');
  }),

  T('immovable: obsidian and block entities stop a piston', () => {
    for (const t of ['obsidian', 'barrel', 'dispenser', 'jukebox', 'hopper', 'lectern', 'sign']) {
      const { w, piston, lever } = rig();
      w.put(1, 0, 0, 'stone');
      w.put(2, 0, 0, t, t === 'sign' ? { att: 'D' } : {});
      w.hand.flip(lever); w.run(2);
      if (piston.ext) throw new Error(`${t} was pushed`);
    }
    return true;
  }),

  T('destroy: dust, torches, repeaters, levers, buttons, plates and doors pop; water is displaced', () => {
    for (const [t, o] of [['dust', {}], ['torch', { att: 'D' }], ['repeater', { d: 'N' }], ['comparator', { d: 'N' }], ['lever', { att: 'D' }], ['button', { att: 'D' }], ['plate', {}], ['door', {}], ['water', {}]]) {
      const { w, piston, lever } = rig({ strict: false });
      w.put(1, 0, 0, 'stone');
      const b = w.put(2, 0, 0, t, o);
      const popped = [];
      w.on('pop', e => popped.push(e.name));
      w.hand.flip(lever); w.run(2);
      if (!piston.ext || w.get(2, 0, 0).t !== 'stone' || !popped.includes(t)) throw new Error(`${t}: not popped (${popped})`);
      ok(b.popped, `${t} flagged popped`);
    }
    return true;
  }),

  T('push_only: glazed terracotta is pushed, never pulled, and slime does not stick to it', () => {
    const { w, piston, lever } = rig({ sticky: true });
    const tc = w.put(1, 0, 0, 'terracotta', { d: 'N' });
    w.hand.flip(lever); w.run(2);
    eq(tc.x, 2, 'pushed');
    w.hand.flip(lever); w.run(2);
    eq(tc.x, 2, 'not pulled back');
    const r = rig({ sticky: true });
    r.w.put(1, 0, 0, 'slime');
    const side = r.w.put(1, 1, 0, 'terracotta');
    r.w.hand.flip(r.lever); r.w.run(2);
    return eq([r.w.get(2, 0, 0).t, side.x], ['slime', 1], 'slime slides past terracotta');
  }),

  T('slime drags adjacent normal blocks, transitively through slime, counting toward 12', () => {
    const { w, piston, lever } = rig({ sticky: true });
    const s1 = w.put(1, 0, 0, 'slime');
    const s2 = w.put(1, 0, 1, 'slime');
    const top = w.put(1, 0, 2, 'stone');        // stuck to s2
    const onTop = w.put(1, 0, 3, 'stone');      // stone does not stick: stays
    const side = w.put(1, -1, 0, 'planks');
    w.hand.flip(lever); w.run(2);
    eq([s1.x, s2.x, top.x, side.x, onTop.x], [2, 2, 2, 2, 1], 'moved');
    w.hand.flip(lever); w.run(2);
    eq([s1.x, s2.x, top.x, side.x], [1, 1, 1, 1], 'pulled back');
    const r = rig({ sticky: true });
    r.w.put(1, 0, 0, 'slime');
    for (let z = 1; z <= 11; z++) r.w.put(1, 0, z, 'slime');
    r.w.put(1, 0, 12, 'stone');   // 13 blocks in all
    r.w.hand.flip(r.lever); r.w.run(2);
    return ok(!r.piston.ext, 'a structure of 13 blocks does not move');
  }),

  T('slime and honey do not stick to each other', () => {
    const { w, lever } = rig({ sticky: true });
    const s = w.put(1, 0, 0, 'slime');
    const h = w.put(1, 0, 1, 'honey');
    w.hand.flip(lever); w.run(2);
    return eq([s.x, h.x], [2, 1], 'positions');
  }),

  T('slime slides past immovable blocks, but fails if one is directly in the path', () => {
    const { w, piston, lever } = rig({ sticky: true });
    const s = w.put(1, 0, 0, 'slime');
    const obs = w.put(1, 0, 1, 'obsidian');
    const jb = w.put(1, 1, 0, 'jukebox');
    w.hand.flip(lever); w.run(2);
    eq([piston.ext, s.x, obs.x, jb.x], [true, 2, 1, 1], 'slides past');
    const r = rig({ sticky: true });
    r.w.put(1, 0, 0, 'slime');
    const st = r.w.put(1, 0, 1, 'stone');
    r.w.put(2, 0, 1, 'obsidian');   // in the stuck stone's path
    r.w.hand.flip(r.lever); r.w.run(2);
    return eq([!!r.piston.ext, st.x], [false, 1], 'blocked');
  }),

  T('a sticky piston given a 1-tick pulse leaves its block behind', () => {
    const w = world();
    const lever = w.put(-2, 0, 0, 'lever', { att: 'D' });
    w.put(-1, 0, 0, 'observer', { d: 'W' });
    const p = w.put(0, 0, 0, 'piston', { d: 'E', s: true });
    const b = w.put(1, 0, 0, 'stone');
    w.run(2);
    w.hand.flip(lever);
    const ext = trace(w, () => p.ext, 6);
    eq(ext.length, 1, 'extended for 1 tick');
    return eq([p.ext, b.x], [false, 2], 'the block stays out');
  }),

  T('blocks attached to a moved block pop off: sign, torch, button, lever', () => {
    const { w, lever } = rig({ strict: false });
    const s = w.put(1, 0, 0, 'stone');
    const parts = [w.put(1, -1, 0, 'torch', { att: 'S' }), w.put(1, 0, 1, 'sign', { att: 'D' }), w.put(1, 1, 0, 'button', { att: 'N' }), w.put(2, 0, 0, 'lever', { att: 'W' })];
    const popped = [];
    w.on('pop', e => popped.push(e.name));
    w.hand.flip(lever); w.run(2);
    eq(s.x, 2, 'stone moved');
    return eq(popped.sort(), ['button', 'lever', 'sign', 'torch'], 'popped') && ok(parts.every(p => p.popped));
  }),

  T('a slime block pushed into an entity launches it along the push', () => {
    const w = world();
    const p = w.put(0, 0, 0, 'piston', { d: 'U', s: true });
    w.put(0, 0, 1, 'slime');
    const lever = w.put(1, 0, 0, 'lever', { att: 'D' });
    const en = w.spawn('item', 0.5, 0.5, 2, { item: 'stone', ground: true });
    w.hand.flip(lever);
    w.tick();
    ok(p.ext, 'extended');
    return ok(en.z > 3 && en.vz > 0.5, `launched upward (z ${en.z.toFixed(2)}, vz ${en.vz.toFixed(2)})`);
  }),

  T('slime conducts, honey does not', () => {
    const run = t => {
      const w = world();
      w.put(1, 0, 0, t);
      w.put(1, 0, 1, 'lever', { att: 'D', on: true });
      const d = w.put(2, 0, 0, 'dust');
      w.run(2);
      return d.lvl;
    };
    return eq([run('slime'), run('honey')], [15, 0], 'dust beside the block');
  }),

  T('quasi-connectivity: a piston or dropper fires when the cell above it would be powered (rules.qc)', () => {
    const build = qc => {
      const w = world({ rules: { qc } });
      const p = w.put(0, 0, 0, 'piston', { d: 'E' });
      const dr = w.put(0, 3, 0, 'dropper', { d: 'E', items: [{ id: 'stone', n: 3 }] });
      const levers = [0, 3].map(y => { w.put(-1, y, 1, 'stone'); return w.put(-1, y, 2, 'lever', { att: 'D' }); });
      w.seal();
      levers.forEach(l => w.hand.flip(l));
      w.run(4);
      return [!!p.ext, dr.fill > 0 && w.entities.length > 0];
    };
    return eq(build(true), [true, true], 'with qc') && eq(build(false), [false, false], 'without qc');
  }),

  T('an observer fires when a piston moves it', () => {
    const { w, lever } = rig();
    const obs = w.put(1, 0, 0, 'observer', { d: 'N' });
    w.run(3);
    w.hand.flip(lever);
    return eq(trace(w, () => obs.on, 5), [2], 'one pulse after the move');
  }),
];

module.exports = { suite: 'engine: pistons', tests, RS };
