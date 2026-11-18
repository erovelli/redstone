// rs-radio: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('radio');
const T = (name, fn) => ({ name, fn });

// A stand-in element with <option> children.
function fakeEl(values, attrs = {}) {
  const children = values.map(v => ({ localName: 'option', hasAttribute: n => n === 'value' || (n === 'selected' && attrs.selected === v), getAttribute: () => v, textContent: v.toUpperCase() }));
  return { children, hasAttribute: n => n in attrs, getAttribute: n => (n in attrs ? attrs[n] : null) };
}
const make = (values, attrs) => {
  const el = fakeEl(values, attrs);
  return controller(spec, attrs, { el, text: values.join(' ') });
};

module.exports = {
  suite: 'rs-radio',
  tests: [
    T('options map to bands; the value attribute chooses the starting option', () => {
      const ctl = make(['s', 'm', 'l'], { value: 'm' });
      return ctl.params.options === 3 && ctl.state.value === 'm' && ctl.io.lamps[1].lit && !ctl.io.lamps[0].lit;
    }),
    T('no value and no selected option: nothing chosen, value ""', () => make(['a', 'b'], {}).state.value === ''),
    T('an option with the selected attribute is the start when there is no value attribute', () => make(['a', 'b', 'c'], { selected: 'c' }).state.value === 'c'),
    T('a press fires input then change once, 5 ticks later, with the new value', () => {
      const ctl = make(['s', 'm', 'l'], { value: 's' });
      ctl.act(spec.controls[2]);
      const { ticks, changes } = untilChange(ctl);
      const after = untilChange(ctl, 30);
      return ticks === 5 && changes.length === 1 && changes[0].value === 'l' && changes[0].events.join() === 'input,change' && after.ticks === -1;
    }),
    T('two presses in the same tick both reach the machine: both latches set, no value, and the next press settles it', () => {
      const ctl = make(['a', 'b', 'c'], {});
      const first = ctl.act(spec.controls[0]);
      const second = ctl.act(spec.controls[2]);
      ctl.settle();
      const both = ctl.io.lamps.filter(l => l.lit).length === 2 && ctl.state.value === '';
      ctl.act(spec.controls[1]);
      ctl.settle();
      return first === true && second === true && both && ctl.state.value === 'b' && ctl.io.lamps.filter(l => l.lit).length === 1;
    }),
    T('a second press one tick later wins', () => {
      const ctl = make(['a', 'b', 'c'], {});
      ctl.act(spec.controls[0]);
      ctl.tick();
      ctl.act(spec.controls[2]);
      ctl.settle();
      return ctl.state.value === 'c' && ctl.io.lamps.filter(l => l.lit).length === 1;
    }),
    T('setting value presses that option; while a press is in flight it lands after settling', () => {
      const ctl = make(['a', 'b', 'c'], { value: 'a' });
      ctl.request('value', 'b');
      ctl.settle();
      if (ctl.state.value !== 'b') return false;
      ctl.act(spec.controls[2]);
      ctl.requestSettled('value', 'a');   // same tick as the player's press: refused, then retried
      return ctl.state.value === 'a';
    }),
    T('an unknown value changes nothing', () => {
      const ctl = make(['a', 'b'], { value: 'a' });
      ctl.request('value', 'zzz');
      ctl.settle();
      return ctl.state.value === 'a';
    }),
    T('controls: radios named by their option, aria-checked from value, the extra ones absent', () => {
      const el = fakeEl(['s', 'm']);
      const c = spec.controls;
      return c.length === 6 && c.every(x => x.role === 'radio') && c[1].label(el) === 'M' && c[1].aria.checked({ value: 'm' }, el) === true &&
        c[0].aria.checked({ value: 'm' }, el) === false && !make(['s', 'm'], {}).io.b2;
    }),
    T('roving tab stop is the chosen option', () => spec.roving({ value: 'm' }, fakeEl(['s', 'm', 'l'])) === 1),
    T('form value and required validity', () => {
      const el = (value, attrs) => ({ value, hasAttribute: n => n in attrs });
      return spec.form.value(el('m', {})) === 'm' && spec.form.value(el('', {})) === null &&
        spec.form.validity(el('', { required: '' })).flags.valueMissing === true && spec.form.validity(el('m', { required: '' })) === null;
    }),
  ],
};
