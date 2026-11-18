// rs-accordion: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('accordion');
const T = (name, fn) => ({ name, fn });
// Computed params read the DOM; in Node the element is null: 2 items, none open.
const make = () => {
  const ctl = controller(spec, {}, { text: '' });
  ctl.built.values = ['ship', 'returns'];
  ctl.update();
  return ctl;
};
const header = k => spec.controls[k];
const none = spec.controls[spec.controls.length - 1];

module.exports = {
  suite: 'rs-accordion',
  tests: [
    T('starts with nothing open and nothing shown', () => {
      const ctl = make();
      return ctl.state.open === -1 && ctl.state.value === '' && !ctl.state.shown0 && !ctl.state.shown1;
    }),
    T('a header click opens its item when the opening is clear, 14 ticks after the press, with one change', () => {
      const ctl = make();
      ctl.act(header(1));
      const a = untilChange(ctl);
      const keys = a.changes.map(c => c.key + '=' + c.value).join();
      return a.ticks === 14 && keys === 'open=1,value=returns,shown1=true' && a.changes[1].events.join() === 'change';
    }),
    T('opening another item closes the first: hidden at 4, the other shown at 14', () => {
      const ctl = make();
      ctl.request('value', 'ship');
      ctl.settle();
      ctl.act(header(1));
      const a = untilChange(ctl);
      const b = untilChange(ctl);
      return ctl.state.open === 1 && a.ticks === 4 && a.changes.map(c => c.key).join() === 'shown0' && b.ticks === 10 && b.changes[0].key === 'open';
    }),
    T('clicking the open item\'s header presses the none button and closes it once the curtain is home', () => {
      const ctl = make();
      ctl.request('value', 'returns');
      ctl.settle();
      ctl.act(header(1));
      const pressedNone = ctl.io.none.on === true && ctl.io.buttons[1].on === false;
      const a = untilChange(ctl);
      const b = untilChange(ctl);
      return pressedNone && a.ticks === 4 && b.ticks === 1 && ctl.state.open === -1 && ctl.state.value === '';
    }),
    T('setting value to "" presses none; the close-all control presses none too', () => {
      const ctl = make();
      ctl.request('value', 'ship');
      ctl.settle();
      ctl.request('value', '');
      ctl.settle();
      const closed = ctl.state.open === -1;
      ctl.act(header(0));
      ctl.settle();
      ctl.act(none);
      ctl.settle();
      return closed && ctl.state.open === -1 && none.io === 'none';
    }),
    T('headers are buttons over their row and signs; aria-expanded follows open', () => {
      const h = header(1), fake = { children: [] };
      return !h.role && h.area.join() === 'row1,label1' && h.aria.expanded({ open: 1 }, fake) === true && h.aria.expanded({ open: 0 }, fake) === false;
    }),
  ],
};
