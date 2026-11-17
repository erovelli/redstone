// rs-toggle: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('toggle');
const T = (name, fn) => ({ name, fn });
const lever = spec.controls[0];

module.exports = {
  suite: 'rs-toggle',
  tests: [
    T('the checked attribute builds a switch that is already on', () => {
      const on = controller(spec, { checked: '' }, { text: 'Lights' });
      const off = controller(spec, {}, { text: 'Lights' });
      return on.state.checked === true && on.io.lever.on === true && off.state.checked === false;
    }),
    T('the label sets the number of signs; no label, no signs', () => {
      const long = controller(spec, {}, { text: 'Night lights' });
      const short = controller(spec, {}, { text: 'Fan' });
      const none = controller(spec, {}, { text: '' });
      return long.io.signs.length > short.io.signs.length && short.io.signs.length === 1 && none.io.signs.length === 0;
    }),
    T('length maps to the dust line, clamped', () => controller(spec, { length: '9' }).params.dust === 4),
    T('a flip fires input then change on the tick the lamp lights', () => {
      const ctl = controller(spec, {}, { text: 'Fan' });
      ctl.act(lever);
      if (ctl.state.checked) return false;
      const { ticks, changes } = untilChange(ctl);
      return ticks === 1 && changes.length === 1 && changes[0].value === true && changes[0].events.join() === 'input,change';
    }),
    T('flipping back fires change again when the lamp goes dark', () => {
      const ctl = controller(spec, { checked: '' }, { text: 'Fan' });
      ctl.act(lever);
      const { ticks, changes } = untilChange(ctl);
      return ticks >= 1 && ticks <= 3 && changes[0].value === false;
    }),
    T('setting checked flips the lever only when needed', () => {
      const ctl = controller(spec, {}, { text: 'Fan' });
      ctl.request('checked', false);
      const same = ctl.settle().length === 0 && ctl.io.lever.on === false;
      ctl.request('checked', true);
      ctl.settle();
      return same && ctl.state.checked === true && ctl.io.lever.on === true;
    }),
    T('form value: the value attribute (default "on") while checked, nothing otherwise', () => {
      const el = (checked, value) => ({ checked, getAttribute: n => (n === 'value' ? value : null) });
      return spec.form.value(el(true, null)) === 'on' && spec.form.value(el(true, 'yes')) === 'yes' && spec.form.value(el(false, 'yes')) === null;
    }),
    T('the control is a switch whose aria-checked mirrors checked', () => lever.role === 'switch' && lever.aria.checked === 'checked' && lever.act === 'flip'),
  ],
};
