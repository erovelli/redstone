// Rulebook: Power. One test per rule, on a strict world with a stone floor at z = -1.
const { world, eq, ok, first, trace, T } = require('./helpers.js');

const tests = [
  T('dust: 15 at the source, minus 1 per block', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    const dust = [];
    for (let x = 1; x <= 16; x++) dust.push(w.put(x, 0, 0, 'dust'));
    w.seal();
    w.hand.flip(lever);
    w.tick();
    eq(dust.map(d => d.lvl), [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], 'dust levels');
  }),

  T('dust connects to the front and back of a repeater, not its side', () => {
    const w = world();
    const d = w.put(0, 0, 0, 'dust');
    const r = w.put(1, 0, 0, 'repeater', { d: 'N', delay: 1 });
    w.tick();
    eq(d.pts, ['N', 'E', 'S', 'W'], 'beside a repeater side the dust stays a cross');
    r.d = 'E';
    w.tick();
    eq(d.pts.slice().sort(), ['E', 'W'], 'in line with a repeater the dust is a line');
  }),

  T('dust connects to power sources, target blocks and observer outputs', () => {
    const w = world();
    const d = w.put(0, 0, 0, 'dust');
    const n = w.put(1, 0, 0, 'target');
    w.tick();
    eq(d.pts.slice().sort(), ['E', 'W'], 'target');
    w.set(1, 0, 0, null);
    w.put(1, 0, 0, 'observer', { d: 'E' });   // its back (output) faces the dust
    w.tick();
    eq(d.pts.slice().sort(), ['E', 'W'], 'observer output');
    w.set(1, 0, 0, null);
    w.put(1, 0, 0, 'observer', { d: 'W' });   // its face looks at the dust
    w.tick();
    eq(d.pts, ['N', 'E', 'S', 'W'], 'observer face does not connect');
    w.set(1, 0, 0, null);
    w.put(1, 0, 0, 'torch', { att: 'D' });
    w.tick();
    eq(d.pts.slice().sort(), ['E', 'W'], 'torch');
    return ok(n);
  }),

  T('dust goes up and down a one-block step', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    const lo = w.put(1, 0, 0, 'dust');
    w.put(2, 0, 0, 'stone');
    const hi = w.put(2, 0, 1, 'dust');
    w.seal();
    w.hand.flip(lever);
    w.tick();
    eq([lo.lvl, hi.lvl], [15, 14], 'power climbs the step');
    ok(lo.up.includes('E') && lo.pts.includes('E'), 'the lower dust runs up the side of the step');
    const w2 = world();
    w2.put(2, 0, 0, 'stone');
    const top = w2.put(2, 0, 1, 'dust');
    w2.put(3, 0, 0, 'stone');
    const lever2 = w2.put(3, 0, 1, 'lever', { att: 'D' });
    const bottom = w2.put(1, 0, 0, 'dust');
    w2.seal();
    w2.hand.flip(lever2);
    w2.tick();
    return eq([top.lvl, bottom.lvl], [15, 14], 'power comes down the step');
  }),

  T('a conductive block directly above the lower dust cuts the step', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    const lo = w.put(1, 0, 0, 'dust');
    w.put(1, 0, 1, 'stone');   // the cut
    w.put(2, 0, 0, 'stone');
    const hi = w.put(2, 0, 1, 'dust');
    w.seal();
    w.hand.flip(lever);
    w.tick();
    eq([lo.lvl, hi.lvl], [15, 0], 'levels');
    return ok(!lo.pts.includes('E') || lo.pts.length === 2 && lo.pts.includes('W'), 'no connection up the step');
  }),

  T('a glass step passes power up but not down', () => {
    const up = world();
    const l1 = up.put(0, 0, 0, 'lever', { att: 'D' });
    const lo = up.put(1, 0, 0, 'dust');
    up.put(2, 0, 0, 'glass');
    const hi = up.put(2, 0, 1, 'dust');
    up.hand.flip(l1);
    up.tick();
    eq([lo.lvl, hi.lvl], [15, 14], 'upward through glass');
    const down = world();
    const lo2 = down.put(1, 0, 0, 'dust');
    down.put(2, 0, 0, 'glass');
    const hi2 = down.put(2, 0, 1, 'dust');
    down.put(3, 0, 0, 'stone');
    const l2 = down.put(3, 0, 1, 'lever', { att: 'D' });
    down.hand.flip(l2);
    down.tick();
    return eq([hi2.lvl, lo2.lvl], [15, 0], 'downward from glass');
  }),

  T('a lone dust is a cross and powers all four sides; a line does not power its sides', () => {
    const w = world();
    const lever = w.put(3, 0, 0, 'lever', { att: 'D' });
    w.put(4, 0, 0, 'repeater', { d: 'E', delay: 1 });
    w.put(5, 0, 0, 'stone');          // strongly powered by the repeater
    const d = w.put(5, 0, 1, 'dust');  // on top of it: powered, connected to nothing
    const lamps = [[6, 0, 1], [4, 0, 1], [5, 1, 1], [5, -1, 1]].map(p => w.put(...p, 'lamp'));
    w.seal();
    w.hand.flip(lever);
    w.run(3);
    eq(d.lvl, 15, 'dust on a strongly powered block');
    eq(d.pts, ['N', 'E', 'S', 'W'], 'cross');
    ok(lamps.every(l => l.lit), 'all four lamps lit');
    const w2 = world();
    const lv = w2.put(0, 0, 0, 'lever', { att: 'D' });
    for (let x = 1; x <= 3; x++) w2.put(x, 0, 0, 'dust');
    const side = w2.put(2, 1, 0, 'lamp');
    w2.hand.flip(lv);
    w2.run(2);
    return ok(!side.lit, 'a lamp beside a dust line stays off');
  }),

  T('dust weakly powers the block it sits on and the block it points into', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    w.put(1, 0, 0, 'dust');
    const under = w.put(1, 1, -1, 'lamp');   // a lamp in the floor, beside the block the dust sits on
    const s = w.put(2, 0, 0, 'stone');       // the dust points into this block
    const beside = w.put(2, 1, 0, 'lamp');
    const far = w.put(3, 0, 0, 'dust');      // dust beside a weakly powered block gets nothing
    w.seal();
    w.hand.flip(lever);
    w.run(2);
    ok(w.powerOf(w.get(1, 0, -1)) === 15, 'the block under the dust is powered');
    ok(under.lit, 'which activates the lamp beside it');
    ok(w.powerOf(s) === 15 && beside.lit, 'the block the dust points into is powered and activates a lamp');
    return eq(far.lvl, 0, 'weak power does not reach dust');
  }),

  T('strong power: repeater, lever, torch, plate and observer outputs power dust through a block', () => {
    const check = (build, act, what) => {
      const w = world();
      const s = w.put(2, 0, 1, 'stone');
      w.put(3, 0, 0, 'stone');
      const d = w.put(3, 0, 1, 'dust');   // beside s, on its own block
      const io = build(w, s);
      w.seal();
      w.tick();
      act(w, io);
      for (let i = 0; i < 4 && !d.lvl; i++) w.tick();
      if (d.lvl !== 15) throw new Error(`${what}: dust beside the block has ${d.lvl}`);
    };
    check((w) => { w.put(0, 0, 1, 'stone'); const l = w.put(0, 0, 2, 'lever', { att: 'D' }); w.put(1, 0, 1, 'repeater', { d: 'E', delay: 1, att: 'D' }); w.put(1, 0, 0, 'stone'); return l; }, (w, l) => w.hand.flip(l), 'repeater');
    check((w) => w.put(2, 0, 2, 'lever', { att: 'D' }), (w, l) => w.hand.flip(l), 'lever on top');
    check((w) => { w.put(2, 0, 0, 'torch', { att: 'D', lit: true }); return null; }, () => {}, 'torch below');
    check((w) => w.put(2, 0, 2, 'plate', {}), (w, p) => w.hand.step(p, true), 'pressure plate on top');
    check((w) => { w.put(1, 0, 0, 'stone'); w.put(0, 0, 0, 'stone'); const l = w.put(0, 0, 1, 'lever', { att: 'D' }); w.put(1, 0, 1, 'observer', { d: 'W' }); return l; }, (w, l) => w.hand.flip(l), 'observer');
    return true;
  }),

  T('a strongly powered block powers dust; a weakly powered one does not; both activate components', () => {
    const w = world();
    const l = w.put(0, 0, 0, 'lever', { att: 'D' });
    w.put(1, 0, 0, 'repeater', { d: 'E', delay: 1 });
    const strong = w.put(2, 0, 0, 'stone');
    const d1 = w.put(3, 0, 0, 'dust');
    const lamp1 = w.put(2, 1, 0, 'lamp');
    const l2 = w.put(0, 3, 0, 'lever', { att: 'D' });
    w.put(1, 3, 0, 'dust');
    const weak = w.put(2, 3, 0, 'stone');
    const d2 = w.put(3, 3, 0, 'dust');
    const lamp2 = w.put(2, 4, 0, 'lamp');
    w.seal();
    w.hand.flip(l); w.hand.flip(l2);
    w.run(3);
    eq([w.strong.get(require('../../src/engine.js').K(2, 0, 0)) || 0, d1.lvl, lamp1.lit], [15, 15, true], 'strong');
    return eq([w.powerOf(weak), d2.lvl, lamp2.lit], [15, 0, true], 'weak');
  }),

  T('torch: flips 1 tick after its block changes, never powers its own block, strongly powers the block above', () => {
    const w = world();
    const s = w.put(1, 0, 0, 'stone');
    const torch = w.put(2, 0, 0, 'torch', { att: 'W', lit: true });
    const above = w.put(2, 0, 1, 'stone');
    const lever = w.put(0, 0, 0, 'lever', { att: 'E' });
    w.seal();
    w.tick();
    eq([w.powerOf(s), w.powerOf(above)], [0, 15], 'own block unpowered, block above strongly powered');
    w.hand.flip(lever);
    eq(first(w, () => !torch.lit), 2, 'off on the tick after its block is powered');
    w.hand.flip(lever);
    return eq(first(w, () => torch.lit), 2, 'back on the tick after');
  }),

  T('torch: burns out on the 8th turn-off within 60 game ticks and relights after 160', () => {
    const w = world();
    w.put(1, 0, 0, 'stone');
    const torch = w.put(2, 0, 0, 'torch', { att: 'W', lit: true });
    const lever = w.put(0, 0, 0, 'lever', { att: 'E' });
    const fizz = [];
    w.on('sound', e => { if (e.name === 'fizz') fizz.push(e.t); });
    w.seal();
    let offs = 0;
    for (let k = 0; k < 8; k++) {
      w.hand.flip(lever); w.run(2); if (!torch.lit) offs++;
      w.hand.flip(lever); w.run(2);
    }
    eq(offs, 8, 'eight turn-offs');
    eq(fizz.length, 1, 'one burnout');
    ok(!lever.on && !torch.lit, 'burnt out: dark although its block is unpowered');
    const relit = first(w, () => torch.lit, 120);
    return ok(relit > 60 && relit <= 81, `relights about 80 ticks later (at +${relit})`);
  }),

  T('a slow torch clock does not burn out', () => {
    const w = world();
    w.put(1, 0, 0, 'stone');
    const torch = w.put(2, 0, 0, 'torch', { att: 'W', lit: true });
    const lever = w.put(0, 0, 0, 'lever', { att: 'E' });
    w.seal();
    let flips = 0;
    for (let k = 0; k < 10; k++) { w.hand.flip(lever); w.run(3); w.hand.flip(lever); w.run(3); }
    for (let i = 0; i < 4; i++) { w.tick(); if (torch.lit) flips++; }
    return ok(flips > 0, 'still lit with a 6-tick period');
  }),

  T('repeater: 1 to 4 ticks, one way', () => {
    for (const delay of [1, 2, 3, 4]) {
      const w = world();
      const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
      const r = w.put(1, 0, 0, 'repeater', { d: 'E', delay });
      w.seal();
      w.hand.flip(lever);
      eq(first(w, () => r.on), delay + 1, `delay ${delay}: on`);
      w.run(6);
      w.hand.flip(lever);
      eq(first(w, () => !r.on), delay + 1, `delay ${delay}: off`);
    }
    const w = world();
    const r = w.put(1, 0, 0, 'repeater', { d: 'W', delay: 1 });   // points at the lever: powered from its front
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    const lamp = w.put(2, 0, 0, 'lamp');
    w.seal();
    w.hand.flip(lever);
    w.run(4);
    return ok(!r.on && !lamp.lit, 'a repeater does not take power from its front');
  }),

  T('repeater: stretches a 1-tick pulse to its delay', () => {
    const w = world();
    const lever = w.put(-1, 0, 0, 'lever', { att: 'D' });
    const obs = w.put(0, 0, 0, 'observer', { d: 'W' });
    const r = w.put(1, 0, 0, 'repeater', { d: 'E', delay: 4 });
    w.seal();
    w.run(2);
    w.hand.flip(lever);
    const pulse = trace(w, () => obs.on, 12);
    w.hand.flip(lever);   // second pulse, to be sure the repeater is ready again
    w.run(12);
    const w2 = world();
    const lever2 = w2.put(-1, 0, 0, 'lever', { att: 'D' });
    w2.put(0, 0, 0, 'observer', { d: 'W' });
    const r2 = w2.put(1, 0, 0, 'repeater', { d: 'E', delay: 4 });
    w2.seal();
    w2.run(2);
    w2.hand.flip(lever2);
    const out = trace(w2, () => r2.on, 14);
    eq(pulse.length, 1, 'the observer pulse is 1 tick');
    return eq(out.length, 4, 'the repeater output lasts its delay') && ok(!r.on, 'and ends');
  }),

  T('repeater: locks while a powered repeater or comparator points into its side', () => {
    const w = world();
    const l1 = w.put(1, 0, 0, 'lever', { att: 'D' });
    const a = w.put(2, 0, 0, 'repeater', { d: 'E', delay: 1 });
    const b = w.put(2, 1, 0, 'repeater', { d: 'N', delay: 1 });
    const l2 = w.put(2, 2, 0, 'lever', { att: 'D' });
    w.seal();
    w.hand.flip(l2);
    w.run(3);
    ok(b.on && a.locked, 'locked by the side repeater');
    w.hand.flip(l1);
    w.run(4);
    ok(!a.on, 'ignores its input while locked');
    w.hand.flip(l2);
    w.run(5);
    return ok(!a.locked && a.on, 'unlocks and follows its input');
  }),

  T('comparator: 1 tick, compare and subtract modes', () => {
    const run = (a, b, mode) => {
      const w = world();
      const A = w.put(0, 0, 0, 'barrel');
      const comp = w.put(1, 0, 0, 'comparator', { d: 'E', mode });
      const B = w.put(1, 2, 0, 'barrel');
      w.put(1, 1, 0, 'comparator', { d: 'N' });
      w.seal();
      w.hand.fill(A, a); w.hand.fill(B, b);
      w.run(5);
      return comp.out || 0;
    };
    for (const [a, b] of [[12, 5], [5, 12], [15, 15], [9, 0]]) {
      eq(run(a, b, 'sub'), Math.max(0, a - b), `subtract ${a} - ${b}`);
      eq(run(a, b, 'cmp'), a >= b ? a : 0, `compare ${a} vs ${b}`);
    }
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    const comp = w.put(1, 0, 0, 'comparator', { d: 'E' });
    w.seal();
    w.hand.flip(lever);
    return eq(first(w, () => comp.out === 15), 2, 'one tick');
  }),

  T('comparator: the rear reads a container, also through one conductive block', () => {
    const w = world();
    const barrel = w.put(0, 0, 0, 'barrel');
    w.put(1, 0, 0, 'stone');
    const comp = w.put(2, 0, 0, 'comparator', { d: 'E' });
    const chest = w.put(0, 3, 0, 'chest');
    const c2 = w.put(1, 3, 0, 'comparator', { d: 'E' });
    w.seal();
    for (const n of [1, 7, 15, 0]) {
      w.hand.fill(barrel, n); w.hand.fill(chest, n);
      w.run(3);
      eq([comp.out || 0, c2.out || 0], [n, n], `fill ${n}`);
    }
    w.hand.insert(barrel, 'stone', 64);   // one full stack of 27 slots
    w.run(3);
    return eq(comp.out, 1, 'one stack in a barrel reads 1');
  }),

  T('comparator: sides take dust, repeaters, comparators and redstone blocks, but not levers or torches', () => {
    const side = (put) => {
      const w = world();
      w.put(0, 0, 0, 'rblock');
      const comp = w.put(1, 0, 0, 'comparator', { d: 'E', mode: 'sub' });
      put(w);
      w.run(5);
      return comp.out || 0;
    };
    eq(side(() => {}), 15, 'no side input');
    eq(side(w => w.put(1, 1, 0, 'rblock')), 0, 'redstone block');
    eq(side(w => { w.put(1, 1, 0, 'dust'); w.put(1, 2, 0, 'rblock'); }), 0, 'dust at 15');
    eq(side(w => { w.put(1, 1, 0, 'repeater', { d: 'N', delay: 1 }); w.put(1, 2, 0, 'rblock'); }), 0, 'repeater');
    eq(side(w => { w.put(1, 2, 0, 'rblock'); w.put(1, 1, 0, 'comparator', { d: 'N' }); }), 0, 'comparator');
    eq(side(w => w.put(1, 1, 0, 'lever', { att: 'D', on: true })), 15, 'lever ignored');
    return eq(side(w => w.put(1, 1, 0, 'torch', { att: 'D', lit: true })), 15, 'torch ignored');
  }),

  T('observer: 1 tick after the watched block changes, a 1-tick pulse from its back', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    const obs = w.put(1, 0, 0, 'observer', { d: 'W' });
    const d = w.put(2, 0, 0, 'dust');
    w.seal();
    w.run(2);
    w.hand.flip(lever);
    const on = trace(w, () => obs.on, 6);
    eq(on, [2], 'pulse at +2 (the change is seen on tick 1), 1 tick long');
    w.hand.flip(lever);
    eq(trace(w, () => d.lvl === 15, 6), [2], 'fires on both edges, out of its back');
    return true;
  }),

  T('redstone lamp: on at once, off 2 ticks after power is lost', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    w.put(1, 0, 0, 'dust');
    const lamp = w.put(2, 0, 0, 'lamp');
    w.seal();
    w.hand.flip(lever);
    eq(first(w, () => lamp.lit), 1, 'on the same tick');
    w.run(3);
    w.hand.flip(lever);
    return eq(trace(w, () => lamp.lit, 5), [1, 2], 'still lit on the first two ticks without power');
  }),

  T('copper bulb: toggles on each rising edge, a comparator reads 15 while lit, not conductive', () => {
    const w = world();
    const button = w.put(0, 0, 0, 'button', { att: 'D' });
    w.put(1, 0, 0, 'dust');
    const bulb = w.put(2, 0, 0, 'bulb');
    const behind = w.put(3, 0, 0, 'lamp');
    const comp = w.put(2, 1, 0, 'comparator', { d: 'S' });
    w.seal();
    w.hand.press(button);
    w.run(3);
    ok(bulb.lit && comp.out === 15, 'lit, comparator 15');
    ok(!behind.lit, 'a lamp behind the bulb gets nothing through it');
    w.run(15);
    ok(bulb.lit, 'stays lit when the button releases');
    w.hand.press(button);
    w.run(3);
    ok(!bulb.lit, 'the next press turns it off');
    return eq(comp.out, 0, 'comparator 0');
  }),

  T('note block: plays on a rising edge only if the block above is air; pitch 0 to 24', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'E' });
    const nb = w.put(1, 0, 0, 'noteblock', { note: 5 });
    const lever2 = w.put(0, 3, 0, 'lever', { att: 'E' });
    w.put(1, 3, 0, 'noteblock');
    w.put(1, 3, 1, 'stone');
    const notes = [];
    w.on('sound', e => { if (e.name === 'note') notes.push([e.x, e.y, e.note, e.instrument]); });
    w.seal();
    w.hand.flip(lever); w.run(2);
    w.hand.flip(lever); w.run(2);
    w.hand.flip(lever); w.run(2);
    w.hand.flip(lever2); w.run(2);
    eq(notes, [[1, 0, 5, 'basedrum'], [1, 0, 5, 'basedrum']], 'two rising edges, none under a block');
    w.hand.tune(nb, 30);
    return eq(nb.note, 24, 'pitch clamps to 24');
  }),

  T('target block: dust turns toward it', () => {
    const w = world();
    const lever = w.put(0, 0, 0, 'lever', { att: 'D' });
    w.put(1, 0, 0, 'dust');
    const d = w.put(2, 0, 0, 'dust');
    w.put(2, 1, 0, 'target');
    const lamp = w.put(3, 0, 0, 'lamp');
    w.seal();
    w.hand.flip(lever);
    w.run(2);
    eq(d.pts.slice().sort(), ['S', 'W'], 'the dust bends into the target');
    return ok(!lamp.lit, 'and no longer points at the lamp');
  }),

  T('buttons: stone 10 ticks, wooden 15; pressure plates release up to 10 ticks after the entity leaves', () => {
    const w = world();
    const stone = w.put(0, 0, 0, 'button', { att: 'D' });
    const wood = w.put(2, 0, 0, 'button', { att: 'D', wood: true });
    const plate = w.put(4, 0, 0, 'plate');
    w.seal();
    w.hand.press(stone); w.hand.press(wood);
    eq([trace(w, () => stone.on, 12).length, wood.on], [10, true], 'stone button');
    w.run(4);
    ok(!wood.on, 'wooden button released');
    w.hand.step(plate, true);
    w.run(3);
    ok(plate.on, 'plate pressed');
    w.hand.step(plate, false);
    const rel = first(w, () => !plate.on, 20);
    return ok(rel >= 1 && rel <= 10, `released ${rel} ticks after stepping off`);
  }),

  T('daylight detector: outputs the sky light, or its inverse', () => {
    const w = world({ sky: 12 });
    const det = w.put(0, 0, 0, 'daylight');
    const d = w.put(1, 0, 0, 'dust');
    w.seal();
    w.run(2);
    eq(d.lvl, 12, 'sky 12');
    w.hand.use(det);
    w.run(2);
    return eq(d.lvl, 3, 'inverted');
  }),
];

module.exports = { suite: 'engine: power', tests };
