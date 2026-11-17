// rs-counter: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller } = require('./helpers.js');

const spec = loadComponent('counter');
const T = (name, fn) => ({ name, fn });
const lit = row => row.lamps.filter(l => l.lit).length;

module.exports = {
  suite: 'rs-counter',
  tests: [
    T('the value attribute builds the counter showing it, one row per digit', () => {
      const c = controller(spec, { value: '407' });
      return c.state.value === 407 && c.built.rows.map(lit).join() === '4,0,7' && c.quiet();
    }),
    T('setting value moves books and quills; the state is read back from the comparators', () => {
      const c = controller(spec, { value: '0', digits: '2' });
      c.request('value', 58);
      c.settle();
      const a = c.state.value === 58 && c.built.rows.map(lit).join() === '5,8';
      c.request('value', 3);
      c.settle();
      return a && c.state.value === 3 && c.built.rows.map(lit).join() === '0,3';
    }),
    T('values beyond the digits show all nines; negative and junk values show zero', () => {
      const c = controller(spec, { value: '5', digits: '1' });
      c.request('value', 1234);
      c.settle();
      const nines = c.state.value === 9;
      c.request('value', -4);
      c.settle();
      const zero = c.state.value === 0;
      c.request('value', 'abc');
      c.settle();
      return nines && zero && c.state.value === 0;
    }),
    T('role status; the accessible name carries the caption and the number', () =>
      spec.host.role === 'status' && spec.host.aria.label({ value: 42 }, { label: 'Players' }) === 'Players: 42'),
  ],
};
