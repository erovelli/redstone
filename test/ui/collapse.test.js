// rs-collapse: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('collapse');
const T = (name, fn) => ({ name, fn });
const lever = spec.controls[0];
// Computed params read the DOM; in Node the element is null, so they fall back to their defaults.
const make = (attrs = {}) => controller(spec, attrs, { text: '' });

module.exports = {
  suite: 'rs-collapse',
  tests: [
    T('the open attribute builds a collapse that is already open', () => {
      const open = make({ open: '' });
      const shut = make();
      return open.state.open === true && open.io.lever.on === true && shut.state.open === false && shut.state.deployed === false;
    }),
    T('a flip deploys at once, then fires toggle once, on the tick the opening is clear', () => {
      const ctl = make();
      ctl.act(lever);
      const first = untilChange(ctl);
      if (first.changes.length !== 1 || first.changes[0].key !== 'deployed' || ctl.state.open) return false;
      const second = untilChange(ctl);
      return second.ticks === 1 && second.changes[0].key === 'open' && second.changes[0].value === true && second.changes[0].events.join() === 'toggle';
    }),
    T('flipping back fires toggle when the curtain is home, and only then leaves the layout', () => {
      const ctl = make({ open: '' });
      ctl.act(lever);
      // The curtain moves in one piston stroke: the opening stops being clear in the tick it is home.
      const a = untilChange(ctl);
      const keys = a.changes.map(c => c.key + '=' + c.value).join();
      return a.ticks === 2 && keys === 'open=false,deployed=false' && a.changes[0].events.join() === 'toggle';
    }),
    T('setting open flips the lever only when needed', () => {
      const ctl = make();
      ctl.request('open', false);
      const same = ctl.settle().length === 0 && ctl.io.lever.on === false;
      ctl.request('open', true);
      ctl.settle();
      return same && ctl.state.open === true && ctl.io.lever.on === true;
    }),
    T('the control is a button whose aria-expanded mirrors open, and it covers the lever and the signs', () =>
      lever.role === 'button' && lever.aria.expanded === 'open' && lever.act === 'flip' && lever.area.join() === 'lever,signs'),
    T('the summary comes from a slot="summary" child, else the attribute, else "Details"', () => {
      const el = (attr, slotted) => ({ getAttribute: () => attr, querySelector: () => (slotted ? { textContent: slotted } : null) });
      return spec.labelFallback(el('Shipping', null)) === 'Shipping' && spec.labelFallback(el('x', '  Returns ')) === 'Returns' && spec.labelFallback(el(null, null)) === 'Details';
    }),
    T('the body goes through the opening (default slot); the summary is on the signs', () =>
      spec.opening.shownWhen === 'open' && !spec.opening.slot && spec.label === 'signs' && spec.labelSlot === 'summary'),
  ],
};
