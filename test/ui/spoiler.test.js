// rs-spoiler: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('spoiler');
const T = (name, fn) => ({ name, fn });
const plate = spec.controls[0];
const make = () => controller(spec, {}, { text: '' });
const run = (ctl, n) => { for (let i = 0; i < n; i++) ctl.tick(); };

module.exports = {
  suite: 'rs-spoiler',
  tests: [
    T('hover enter stands on the plate; toggle fires when the opening is clear', () => {
      const ctl = make();
      ctl.act(Object.assign({}, plate, { act: plate.hover.enter }));
      const { ticks, changes } = untilChange(ctl);
      return ctl.io.plate.on === true && ticks === 3 && changes[0].value === true && changes[0].events.join() === 'toggle';
    }),
    T('leaving steps off; the curtain is back within the plate release delay plus 2 ticks', () => {
      const ctl = make();
      ctl.act(plate);
      run(ctl, 5);
      ctl.act(Object.assign({}, plate, { act: plate.hover.leave }));
      const { ticks, changes } = untilChange(ctl);
      return ticks >= 2 && ticks <= 12 && changes[0].key === 'open' && changes[0].value === false;
    }),
    T('a click (or Enter) only stands on the plate: it never steps off', () => {
      const ctl = make();
      ctl.act(plate);
      run(ctl, 5);
      ctl.act(plate);
      run(ctl, 30);
      return ctl.state.open === true && ctl.io.plate.on === true;
    }),
    T('setting open stands on or steps off the plate', () => {
      const ctl = make();
      ctl.request('open', true);
      ctl.settle();
      const a = ctl.state.open;
      ctl.request('open', false);
      ctl.settle();
      return a === true && ctl.state.open === false;
    }),
    T('the content goes through the opening; the control mirrors open in aria-expanded', () =>
      spec.opening.shownWhen === 'open' && !spec.opening.slot && plate.aria.expanded === 'open' && !!plate.hover),
  ],
};
