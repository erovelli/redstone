// rs-checkbox: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('checkbox');
const T = (name, fn) => ({ name, fn });
const press = spec.controls[0];
const fakeEl = (attrs, checked) => ({ checked, hasAttribute: n => n in attrs, getAttribute: n => (n in attrs ? attrs[n] : null) });

module.exports = {
  suite: 'rs-checkbox',
  tests: [
    T('the checked attribute builds a box whose bulb is already lit', () => {
      const on = controller(spec, { checked: '' }, { text: 'I agree' });
      const off = controller(spec, {}, { text: 'I agree' });
      return on.state.checked === true && on.io.bulb.lit === true && off.state.checked === false;
    }),
    T('a press fires input then change on the tick the bulb lights; the release fires nothing', () => {
      const ctl = controller(spec, {}, { text: 'I agree' });
      ctl.act(press);
      if (ctl.state.checked) return false;
      const { ticks, changes } = untilChange(ctl);
      const after = untilChange(ctl, 30);
      return ticks === 1 && changes[0].value === true && changes[0].events.join() === 'input,change' && after.ticks === -1;
    }),
    T('setting checked presses the button only when the bulb is the wrong way round', () => {
      const ctl = controller(spec, {}, { text: 'I agree' });
      ctl.request('checked', false);
      const same = ctl.settle().length === 0 && ctl.io.button.on === false;
      ctl.request('checked', true);
      ctl.settle();
      return same && ctl.state.checked === true;
    }),
    T('setting checked while the button is still in: settle, then a second press (as the element does)', () => {
      const ctl = controller(spec, {}, { text: 'I agree' });
      ctl.act(press);
      ctl.tick();                       // checked now; the button stays in for 10 ticks
      ctl.request('checked', false);    // refused: the button is in
      ctl.settle();
      if (ctl.state.checked !== true) return false;
      ctl.request('checked', false);
      ctl.settle();
      return ctl.state.checked === false;
    }),
    T('form value: the value attribute (default "on") while checked, nothing otherwise', () =>
      spec.form.value(fakeEl({}, true)) === 'on' && spec.form.value(fakeEl({ value: 'yes' }, true)) === 'yes' && spec.form.value(fakeEl({ value: 'yes' }, false)) === null),
    T('required: valueMissing while unchecked, valid when checked or not required', () =>
      spec.form.validity(fakeEl({ required: '' }, false)).flags.valueMissing === true &&
      spec.form.validity(fakeEl({ required: '' }, true)) === null && spec.form.validity(fakeEl({}, false)) === null),
    T('the control is a checkbox whose aria-checked mirrors checked', () => press.role === 'checkbox' && press.aria.checked === 'checked' && press.act === 'press'),
  ],
};
