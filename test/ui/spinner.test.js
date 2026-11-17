// rs-spinner: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, C } = require('./helpers.js');

const spec = loadComponent('spinner');
const T = (name, fn) => ({ name, fn });

module.exports = {
  suite: 'rs-spinner',
  tests: [
    T('it runs by default: the clock keeps the world awake', () => {
      const c = controller(spec, {});
      return c.state.paused === false && !c.quiet();
    }),
    T('paused builds it still and fully lit', () => {
      const c = controller(spec, { paused: '' });
      return c.state.paused === true && c.quiet() && c.io.lamps.every(l => l.lit);
    }),
    T('setting paused flips the lever; the ring settles lit, and unpausing starts it again', () => {
      const c = controller(spec, {});
      c.request('paused', true);
      c.settle();
      const still = c.quiet() && c.io.lamps.every(l => l.lit);
      c.request('paused', false);
      c.settle(30);
      return still && c.state.paused === false && !c.quiet();
    }),
    T('reduced motion (the computed param) builds it still', () => {
      const c = C.get('ui-spinner').build({ reduced: true });
      return c.io.lever.on && c.io.lamps.every(l => l.lit);
    }),
    T('role status, busy while running', () => spec.host.role === 'status' && spec.host.aria.busy({ paused: false }) === 'true' && spec.host.aria.busy({ paused: true }) === null),
  ],
};
