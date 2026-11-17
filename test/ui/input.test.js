// rs-input: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('input');
const T = (name, fn) => ({ name, fn });
const write = (ctl, text) => ctl.act({ act: (hand, io, b) => b.write(hand, text) });

module.exports = {
  suite: 'rs-input',
  tests: [
    T('the value attribute is written on the signs at build', () => {
      const ctl = controller(spec, { value: 'Hello' });
      return ctl.state.value === 'Hello' && ctl.io.signs[0].text === 'Hello' && ctl.io.signs.length === 5 && ctl.built.capacity === 75;
    }),
    T('typing writes the signs: input fires when they change; change waits for the commit', () => {
      const ctl = controller(spec, {});
      ctl.built.editing = { from: '' };          // the field has focus
      write(ctl, 'Al');
      const a = untilChange(ctl);
      write(ctl, 'Alex');
      const b = ctl.settle();
      ctl.act({ act: (hand, io, bb) => { bb.editing = null; return false; } });
      const c = ctl.settle();
      const ev = list => list.map(x => x.key + ':' + x.events.join()).join('|');
      return a.ticks === 1 && ev(a.changes) === 'value:input' && ev(b) === 'value:input' && ev(c) === 'committed:change' && c[0].value === 'Alex';
    }),
    T('a value longer than the signs hold is cut at 15 characters per sign', () => {
      const ctl = controller(spec, {});
      ctl.request('value', 'x'.repeat(100));
      ctl.settle();
      return ctl.state.value.length === 75 && ctl.io.signs.every(s => s.text.length === 15);
    }),
    T('setting value writes the signs; value and committed both follow', () => {
      const ctl = controller(spec, { value: 'a' });
      ctl.request('value', 'Steve');
      const ch = ctl.settle();
      return ctl.state.value === 'Steve' && ctl.state.committed === 'Steve' && ch.map(c => c.key).join() === 'value,committed';
    }),
    T('form value and required validity', () => {
      const el = (value, attrs) => ({ value, hasAttribute: n => n in attrs });
      return spec.form.value(el('x', {})) === 'x' && spec.form.validity(el('', { required: '' })).flags.valueMissing === true &&
        spec.form.validity(el('x', { required: '' })) === null && spec.form.validity(el('', {})) === null;
    }),
    T('no controls: the native field is the focusable surface, the label sits beside', () => spec.controls.length === 0 && spec.label === 'beside' && spec.minBlock >= 30),
  ],
};
