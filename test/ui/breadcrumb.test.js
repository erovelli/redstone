// rs-breadcrumb: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('breadcrumb');
const T = (name, fn) => ({ name, fn });

module.exports = {
  suite: 'rs-breadcrumb',
  tests: [
    T('built with the lever on: the signal has arrived, the world is steady, and the element performs no action', () => {
      const ctl = controller(spec, {});
      return ctl.params.on === true && ctl.io.lever.on && ctl.state.arrived && ctl.quiet() && untilChange(ctl, 20).ticks === -1 &&
        !/perform\(|hand\./.test(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'ui', 'components', 'breadcrumb.js'), 'utf8'));
    }),
    T('flipping the lever off and on walks the signal out again to the lamp, 3 ticks for the first crumb', () => {
      const ctl = controller(spec, {});
      ctl.hand.flip(ctl.io.lever);
      ctl.settle();
      if (ctl.state.arrived) return false;
      ctl.hand.flip(ctl.io.lever);
      const a = untilChange(ctl);
      return a.changes[0].key === 'arrived' && a.changes[0].value === true;
    }),
    T('no controls of its own: the links are the controls; a navigation landmark', () =>
      spec.controls.length === 0 && spec.host.role === 'navigation' && spec.host.aria.label({}, { getAttribute: () => null }) === 'Breadcrumb'),
  ],
};
