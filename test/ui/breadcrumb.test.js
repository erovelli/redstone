// rs-breadcrumb: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('breadcrumb');
const T = (name, fn) => ({ name, fn });

module.exports = {
  suite: 'rs-breadcrumb',
  tests: [
    T('built with the lever off: nothing has arrived; the load-time flip walks the signal out to the lamp', () => {
      const ctl = controller(spec, {});
      if (ctl.state.arrived) return false;
      ctl.hand.flip(ctl.io.lever);
      const a = untilChange(ctl);
      return a.ticks === 3 && a.changes[0].key === 'arrived' && a.changes[0].value === true;
    }),
    T('no controls of its own: the links are the controls; a navigation landmark', () =>
      spec.controls.length === 0 && spec.host.role === 'navigation' && spec.host.aria.label({}, { getAttribute: () => null }) === 'Breadcrumb'),
  ],
};
