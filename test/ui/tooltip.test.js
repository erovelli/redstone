// rs-tooltip: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller } = require('./helpers.js');

const spec = loadComponent('tooltip');
const T = (name, fn) => ({ name, fn });
const step = on => ({ act: (hand, io) => hand.step(io.plate, on) });   // what the element's perform() does

function run(ctl, n) {
  const out = [];
  for (let i = 1; i <= n; i++) for (const ch of ctl.tick()) out.push(Object.assign({ tick: i }, ch));
  return out;
}

module.exports = {
  suite: 'rs-tooltip',
  tests: [
    T('standing on the plate: shown on tick 1, toggle on tick 3 when the signs are uncovered', () => {
      const ctl = controller(spec, {}, { text: 'Saves to disk' });
      if (ctl.state.open || ctl.state.deployed) return false;
      ctl.act(step(true));
      const ch = run(ctl, 10);
      const up = ch.find(c => c.key === 'deployed'), open = ch.find(c => c.key === 'open');
      return up.tick === 1 && open.tick === 3 && open.events.join() === 'toggle';
    }),
    T('stepping off: the signs are covered within 12 ticks, then the tip is no longer shown', () => {
      const ctl = controller(spec, {}, { text: 'Saves to disk' });
      ctl.act(step(true));
      run(ctl, 6);
      ctl.act(step(false));
      const ch = run(ctl, 20);
      const shut = ch.find(c => c.key === 'open');
      return shut.tick >= 2 && shut.tick <= 12 && shut.value === false && !ctl.state.deployed;
    }),
    T('the sign row is sized from the tip text, 1 to 12 signs', () => {
      const short = controller(spec, {}, { text: 'Hi' }), long = controller(spec, {}, { text: 'x'.repeat(200) });
      return short.io.signs.length === 1 && long.io.signs.length === 12;
    }),
    T('the tip is on the signs (slot tip, falling back to the text) and the element has no control of its own', () =>
      spec.label === 'signs' && spec.labelSlot === 'tip' && spec.controls.length === 0 && spec.state.open.event === 'toggle'),
  ],
};
