// rs-theme: the component spec driven headlessly (beyond the catalogue entries' own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('theme');
const T = (name, fn) => ({ name, fn });
const auto = Object.assign({}, spec, { entry: 'ui-theme-auto' });
const lever = Object.assign({}, spec, { entry: 'ui-theme' });

module.exports = {
  suite: 'rs-theme',
  tests: [
    T('the entry is chosen by the auto attribute', () =>
      spec.entry({ hasAttribute: n => n === 'auto' }) === 'ui-theme-auto' && spec.entry({ hasAttribute: () => false }) === 'ui-theme' && spec.entry(undefined) === 'ui-theme'),
    T('without a browser the start is light (no stored value, no dark scheme)', () => controller(lever, {}).state.theme === 'light'),
    T('a lever flip fires change on the tick the lamp changes', () => {
      const ctl = controller(lever, {});
      ctl.act(spec.controls[0]);
      const { ticks, changes } = untilChange(ctl);
      return ctl.state.theme === 'dark' && ticks >= 1 && ticks <= 3 && changes[0].events.join() === 'change';
    }),
    T('setting theme flips the lever only when needed', () => {
      const ctl = controller(lever, {});
      ctl.request('theme', 'light');
      const same = ctl.settle().length === 0;
      ctl.request('theme', 'dark');
      ctl.settle();
      return same && ctl.state.theme === 'dark' && ctl.io.lever.on === false;
    }),
    T('auto: setting theme sets the sky the daylight detector reads; no control', () => {
      const ctl = controller(auto, {});
      ctl.request('theme', 'dark');
      ctl.settle();
      return ctl.state.theme === 'dark' && ctl.world.sky === 0 && !ctl.io.lever && ctl.io.detector;
    }),
    T('the control is a switch, checked while light', () => spec.controls[0].role === 'switch' && spec.controls[0].aria.checked({ theme: 'light' }) === true),
  ],
};
