// rs-steps: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('steps');
const T = (name, fn) => ({ name, fn });
const [lever, next, back] = spec.controls;

module.exports = {
  suite: 'rs-steps',
  tests: [
    T('timeline: the running attribute builds every step reached; flipping the lever walks value up one change per lamp', () => {
      const done = controller(spec, { running: '' });
      const ctl = controller(spec, {});
      if (done.state.value !== 2 || ctl.state.value !== 0) return false;
      ctl.act(lever);
      if (ctl.update().map(c => c.key).join() !== 'running') return false;
      const a = untilChange(ctl), b = untilChange(ctl);
      return a.ticks === 3 && a.changes.find(c => c.key === 'value').value === 1 && b.ticks === 2 && b.changes[0].value === 2 && b.changes[0].events.join() === 'change';
    }),
    T('manual: the button steps on 4 ticks after a press; the hopper control steps back', () => {
      const ctl = controller(spec, { manual: '' });
      ctl.act(next);
      const a = untilChange(ctl);
      ctl.settle();
      ctl.act(back);
      const b = untilChange(ctl);
      return a.ticks === 4 && a.changes[0].value === 1 && b.changes[0].value === 0;
    }),
    T('manual: value="1" starts at step 1; setting value lower takes books back, higher presses the button', () => {
      const ctl = controller(spec, { manual: '', value: '1' });
      if (ctl.state.value !== 1) return false;
      ctl.request('value', 2);
      ctl.settle();
      const up = ctl.state.value === 2;
      ctl.request('value', 0);
      ctl.settle();
      return up && ctl.state.value === 0;
    }),
    T('the timeline has no button and the stepper no lever: those controls have no block', () => {
      const t = controller(spec, {}), m = controller(spec, { manual: '' });
      return !t.io.button && !t.io.hopper && !m.io.lever && lever.role === 'switch' && next.primary;
    }),
  ],
};
