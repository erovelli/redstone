// UI core, the parts that run without a DOM: attribute -> param mapping, output -> state diffs, the hand shim.
const { ui, C } = require('./helpers.js');
const RS = require('../../src/engine.js');

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = (name, fn) => ({ name, fn });

module.exports = {
  suite: 'ui core',
  tests: [
    T('coerce: boolean attributes are presence, and "false" is false', () => {
      const def = { type: 'boolean' };
      return ui.coerce(def, '') === true && ui.coerce(def, 'checked') === true && ui.coerce(def, null) === false && ui.coerce(def, 'false') === false;
    }),
    T('coerce: numbers round, clamp to min/max, and fall back to the default', () => {
      const def = { min: 1, max: 4, def: 2 };
      return ui.coerce(def, '3') === 3 && ui.coerce(def, '2.6') === 3 && ui.coerce(def, '99') === 4 && ui.coerce(def, '-5') === 1 && ui.coerce(def, 'abc') === 2 && ui.coerce(def, null) === 2;
    }),
    T('coerce: options accept only listed values; boolean options are presence', () => {
      const mode = { options: ['cmp', 'sub'], def: 'cmp' };
      const flag = { options: [false, true], def: false };
      return ui.coerce(mode, 'sub') === 'sub' && ui.coerce(mode, 'xor') === 'cmp' && ui.coerce(flag, '') === true && ui.coerce(flag, null) === false;
    }),
    T('paramsFor: catalogue defaults, then string, object and computed mappings', () => {
      const entry = { params: [{ key: 'len', min: 1, max: 4, def: 2 }, { key: 'signs', min: 0, max: 6, def: 2 }, { key: 'keep', min: 0, max: 9, def: 7 }] };
      const spec = { params: { len: 'length', on: { attr: 'checked', type: 'boolean' }, signs: (el, ctx) => ctx.signsFor(ctx.text, { min: 0 }) } };
      const attrs = { length: '9', checked: '' };
      const p = ui.paramsFor(entry, spec, n => (n in attrs ? attrs[n] : null), { text: 'Lights', signsFor: ui.signsFor });
      return eq(p, { len: 4, signs: 2, keep: 7, on: true });
    }),
    T('paramAttributes: attributes that mirror state do not rebuild', () => {
      const spec = { params: { on: { attr: 'checked', type: 'boolean' }, dust: 'length', signs: () => 1 }, state: { checked: { attr: 'checked', read: () => 0 } } };
      return eq(ui.paramAttributes(spec), ['length']);
    }),
    T('diffState: change, rise and fall events', () => {
      const spec = { a: { event: ['input', 'change'] }, b: { event: 'click', when: 'rise' }, c: { event: 'done', when: 'fall' }, d: {} };
      const up = ui.diffState(spec, { a: false, b: false, c: true, d: 1 }, { a: true, b: true, c: false, d: 1 });
      const down = ui.diffState(spec, { a: true, b: true, c: false, d: 1 }, { a: false, b: false, c: true, d: 2 });
      return eq(up.map(c => [c.key, c.events]), [['a', ['input', 'change']], ['b', ['click']], ['c', ['done']]]) &&
        eq(down.map(c => [c.key, c.events]), [['a', ['input', 'change']], ['b', []], ['c', []], ['d', []]]);
    }),
    T('signsFor: empty text uses the minimum; long text stops at the maximum', () =>
      ui.signsFor('', { min: 0 }) === 0 && ui.signsFor('Hi') === 1 && ui.signsFor('Lights') === 2 && ui.signsFor('x'.repeat(200)) === 6),
    T('hand: a button press holds 10 ticks and ignores a second press while in', () => {
      const w = new RS.World();
      const b = w.put(0, 0, 0, 'button', { att: 'D', on: false });
      w.put(0, 0, -1, 'stone');
      const hand = ui.testing.hand(w);
      if (!hand.press(b) || hand.press(b)) return false;
      let held = 0;
      while (b.on && held < 30) { w.tick(); held++; }
      return held >= 10 && held <= 11 && !b.on;   // released by the event due 10 ticks after the press
    }),
    T('hand: a lever flip toggles the lever only (outputs follow by ticking)', () => {
      const c = C.get('ui-toggle').build({});
      const hand = ui.testing.hand(c.world);
      ui.testing.settle(c.world);
      hand.flip(c.io.lever);
      return c.io.lever.on === true && !c.io.lamp.lit;
    }),
    T('Controller: an action changes nothing until the world ticks', () => {
      const spec = { state: { lit: { read: io => !!io.lamp.lit, event: 'change' } } };
      const ctl = new ui.Controller(spec, C.get('ui-toggle'));
      ctl.build({});
      ctl.act({ io: 'lever', act: 'flip' });
      if (ctl.state.lit !== false || ctl.read().lit !== false) return false;
      const changes = ctl.tick();
      return changes.length === 1 && changes[0].value === true && eq(changes[0].events, ['change']);
    }),
    T('Controller: request() is a player action through the state setter, then settle()', () => {
      const spec = { state: { lit: { read: io => !!io.lamp.lit, set: (hand, io, v) => { if (io.lever.on !== v) hand.flip(io.lever); } } } };
      const ctl = new ui.Controller(spec, C.get('ui-toggle'));
      ctl.build({});
      ctl.request('lit', true);
      const changes = ctl.settle();
      return ctl.state.lit === true && changes.length === 1;
    }),
    T('Controller: read-only state refuses request()', () => {
      const ctl = new ui.Controller({ state: { lit: { read: io => !!io.lamp.lit } } }, C.get('ui-toggle'));
      ctl.build({});
      try { ctl.request('lit', true); return false; } catch (e) { return /read-only/.test(e.message); }
    }),
    T('testing.edges: every combination of min, default and max', () => {
      const e = { params: [{ key: 'a', min: 0, max: 2, def: 1 }, { key: 'b', options: ['x', 'y'], def: 'x' }] };
      return ui.testing.edges(e).length === 6;
    }),
    T('testing.strictWorld: rejects legacy blocks and wiring links', () => {
      const w = new RS.World();
      w.put(0, 0, 0, 'stone');
      const ok = ui.testing.strictWorld(w, RS);
      w.put(1, 0, 0, 'ground');
      let rejected = false;
      try { ui.testing.strictWorld(w, RS); } catch (e) { rejected = true; }
      return ok && rejected;
    }),
  ],
};
