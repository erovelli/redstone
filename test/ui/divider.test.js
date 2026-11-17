// rs-divider: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller } = require('./helpers.js');

const spec = loadComponent('divider');
const T = (name, fn) => ({ name, fn });

module.exports = {
  suite: 'rs-divider',
  tests: [
    T('plain by default: one row deep, settled and quiet, no controls and no state', () => {
      const c = controller(spec, {});
      return !c.built.pulse && c.quiet() && c.built.box[2] === 0 && !spec.controls && !spec.state;
    }),
    T('the pulse attribute builds the clock, which keeps the world awake', () => {
      const c = controller(spec, { pulse: '' });
      c.tick();
      return c.built.pulse && !c.quiet() && c.io.torch && c.io.repeaters.length > 0;
    }),
    T('reduced motion (the computed param) builds it plain even with pulse', () => {
      const s = Object.assign({}, spec, { params: Object.assign({}, spec.params, { reduced: () => true }) });
      const c = controller(s, { pulse: '' });
      return !c.built.pulse && c.quiet();
    }),
    T('the length comes from the element width, one block per --rs-block', () => {
      const el = { getBoundingClientRect: () => ({ width: 330 }) };
      return spec.params.length(el, { B: 16 }) === 20 && spec.params.length(el, { B: 48 }) === 6 && spec.params.length(null, { B: 16 }) === 24;
    }),
    T('role separator, horizontal', () => spec.host.role === 'separator' && spec.host.aria.orientation() === 'horizontal'),
  ],
};
