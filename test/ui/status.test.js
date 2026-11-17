// rs-status: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller } = require('./helpers.js');

const spec = loadComponent('status');
const T = (name, fn) => ({ name, fn });

module.exports = {
  suite: 'rs-status',
  tests: [
    T('the on attribute builds a lit dot', () => controller(spec, { on: '' }).state.on === true && controller(spec, {}).state.on === false),
    T('setting on flips the lever and the lamp follows', () => {
      const c = controller(spec, {});
      c.request('on', true);
      c.settle();
      const lit = c.state.on && c.io.lever.on;
      c.request('on', false);
      c.settle();
      return lit && !c.state.on && !c.io.lever.on;
    }),
    T('no controls: the attribute is the only input', () => !spec.controls),
    T('its accessible name carries the state', () => spec.host.aria.label({ on: true }, { label: 'Online' }) === 'Online: on'),
  ],
};
