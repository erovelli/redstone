// rs-progress: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller } = require('./helpers.js');

const spec = loadComponent('progress');
const T = (name, fn) => ({ name, fn });
const lit = c => c.io.lamps.filter(l => l.lit).length;

module.exports = {
  suite: 'rs-progress',
  tests: [
    T('value and max build a bar that already shows the value, snapped to max / steps', () => {
      const a = controller(spec, { value: '7', max: '15', steps: '15' });
      const b = controller(spec, { value: '42' });
      return a.state.value === 7 && lit(a) === 7 && b.state.value === 40 && lit(b) === 4;
    }),
    T('no value: indeterminate (null), the clock runs and the world never goes quiet', () => {
      const c = controller(spec, {});
      return c.state.value === null && !c.io.lever.on && !c.quiet();
    }),
    T('setting value fills the barrel with the hand and stops the clock; the bar then reads it back', () => {
      const c = controller(spec, {});
      c.request('value', 60);
      c.settle();
      return c.state.value === 60 && lit(c) === 6 && c.io.lever.on && c.io.barrel.fill === 6 && c.quiet();
    }),
    T('setting value to null (removing the attribute) empties the barrel and starts the clock', () => {
      const c = controller(spec, { value: '30' });
      c.request('value', null);
      c.settle(60);
      return c.state.value === null && c.io.barrel.fill === 0 && !c.io.lever.on && !c.quiet();
    }),
    T('values beyond the ends clamp to an empty or full bar', () => {
      const c = controller(spec, { value: '0' });
      c.request('value', 500);
      c.settle();
      const full = c.state.value === 100 && lit(c) === 10;
      c.request('value', -20);
      c.settle();
      return full && c.state.value === 0 && lit(c) === 0;
    }),
    T('the element is a progressbar whose aria-valuenow is the value and aria-busy marks indeterminate', () => {
      const a = spec.host.aria;
      return spec.host.role === 'progressbar' && a.valueNow === 'value' && a.busy({ value: null }) === 'true' && a.busy({ value: 3 }) === null;
    }),
  ],
};
