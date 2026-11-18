// rs-select: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('select');
const T = (name, fn) => ({ name, fn });

// A stand-in element with <option> children.
function fakeEl(values, selected) {
  const children = values.map(v => ({ localName: 'option', hasAttribute: n => n === 'value' || (n === 'selected' && v === selected), getAttribute: () => v, textContent: v.toUpperCase() }));
  return { children, parentElement: null };
}
const make = (values, attrs = {}, selected) => controller(spec, attrs, { el: fakeEl(values, selected) });
const toggle = ctl => ctl.act(spec.controls[0]);

module.exports = {
  suite: 'rs-select',
  tests: [
    T('options become book pages; the value attribute, else the selected option, else the first, is the open page', () => {
      const a = make(['s', 'm', 'l'], { value: 'l' }), b = make(['s', 'm', 'l'], {}, 'm'), c = make(['x', 'y'], {});
      return a.built.options === 3 && a.state.value === 'l' && a.io.lectern.page === 2 && b.state.value === 'm' && c.state.value === 'x' &&
        !a.state.open && !a.state.deployed;
    }),
    T('the combobox press opens the list (open follows the curtain, deployed at once) and a second press closes it', () => {
      const ctl = make(['a', 'b', 'c'], {});
      toggle(ctl);
      const first = ctl.tick();
      ctl.settle();
      const opened = ctl.state.open;
      toggle(ctl);                          // the button is out by now (settled)
      ctl.settle();
      return first.some(ch => ch.key === 'deployed' && ch.value === true) && opened && !ctl.state.open && !ctl.state.deployed && ctl.state.value === 'a';
    }),
    T('choosing turns the page: input and change fire once when the comparator reads it, and the list closes', () => {
      const ctl = make(['a', 'b', 'c'], {});
      toggle(ctl);
      ctl.settle();
      ctl.act({ act: (hand, io, b) => b.choose(hand, 2) });
      const { ticks, changes } = untilChange(ctl);
      const all = changes.concat(ctl.settle());
      const value = all.filter(ch => ch.key === 'value');
      return ticks <= 2 && value.length === 1 && value[0].value === 'c' && value[0].events.join() === 'input,change' && !ctl.state.open && !ctl.io.bulb.lit;
    }),
    T('choosing the option already chosen closes the list with the button and changes nothing', () => {
      const ctl = make(['a', 'b'], { value: 'b' });
      toggle(ctl);
      ctl.settle();
      ctl.act({ act: (hand, io, b) => b.choose(hand, 1) });
      const ch = ctl.settle();
      return !ctl.state.open && !ch.some(c => c.key === 'value') && ctl.state.value === 'b';
    }),
    T('a press while the button is still in does nothing, as in the game (no waiting, no skipped time)', () => {
      const ctl = make(['a', 'b'], {});
      toggle(ctl);
      const t0 = ctl.world.t;
      ctl.tick();
      const again = toggle(ctl);
      const t1 = ctl.world.t;
      ctl.settle();
      return again === false && t1 === t0 + 1 && ctl.state.open && ctl.io.bulb.lit;
    }),
    T('a choice right after opening turns the page, but its pulse is lost in the button\'s power: the list stays open', () => {
      const ctl = make(['a', 'b', 'c'], {});
      toggle(ctl);
      ctl.tick();
      ctl.act({ act: (hand, io, b) => b.choose(hand, 1) });
      ctl.settle();
      if (ctl.state.value !== 'b' || !ctl.state.open) return false;
      ctl.act({ act: (hand, io, b) => b.choose(hand, 1) });   // the page it is open at: the button closes the list
      ctl.settle();
      return ctl.state.value === 'b' && !ctl.state.open && !ctl.io.bulb.lit;
    }),
    T('setting value while closed turns the page and presses the list shut again, no events', () => {
      const ctl = make(['s', 'm', 'l'], {});
      ctl.requestSettled('value', 'l');
      return ctl.state.value === 'l' && !ctl.state.open && !ctl.state.deployed && !ctl.io.bulb.lit;
    }),
    T('an unknown value changes nothing', () => {
      const ctl = make(['s', 'm'], { value: 'm' });
      ctl.request('value', 'zzz');
      ctl.settle();
      return ctl.state.value === 'm' && !ctl.state.open;
    }),
    T('opening resets the active option to the chosen one', () => {
      const ctl = make(['a', 'b', 'c', 'd'], { value: 'c' });
      ctl.built.active = 0;
      toggle(ctl);
      return ctl.built.active === 2;
    }),
    T('the control is a combobox whose aria-expanded follows the opening', () => spec.controls[0].role === 'combobox' && spec.controls[0].aria.expanded === 'open'),
    T('form value and required validity (an empty placeholder value)', () => {
      const el = (value, attrs) => ({ value, hasAttribute: n => n in attrs });
      return spec.form.value(el('m', {})) === 'm' && spec.form.validity(el('', { required: '' })).flags.valueMissing === true &&
        spec.form.validity(el('m', { required: '' })) === null && spec.form.validity(el('', {})) === null;
    }),
  ],
};
