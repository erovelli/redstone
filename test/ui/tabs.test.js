// rs-tabs: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('tabs');
const T = (name, fn) => ({ name, fn });
// Computed params read the DOM; in Node the element is null, so they fall back to defaults (2 tabs, tab 0).
const make = () => {
  const ctl = controller(spec, {}, { text: '' });
  ctl.built.values = ['a', 'b'];
  ctl.update();
  return ctl;
};

module.exports = {
  suite: 'rs-tabs',
  tests: [
    T('starts on tab 0 with its panel shown and no other', () => {
      const ctl = make();
      return ctl.state.selected === 0 && ctl.state.value === 'a' && ctl.state.shown0 === true && ctl.state.shown1 === false;
    }),
    T('a press hides the panel behind the shutter first, then commits selected, value and change when it clears', () => {
      const ctl = make();
      ctl.act(spec.controls[1]);
      const a = untilChange(ctl);
      // tick 4: the shutter is shut; nothing is shown, the selection has not changed yet
      if (a.ticks !== 4 || a.changes.map(c => c.key).join() !== 'shown0') return false;
      const b = untilChange(ctl);
      const keys = b.changes.map(c => c.key + '=' + c.value).join();
      const change = b.changes.find(c => c.key === 'value');
      return b.ticks === 3 && keys === 'selected=1,value=b,shown1=true' && change.events.join() === 'change';
    }),
    T('setting selected or value presses that tab and settles', () => {
      const ctl = make();
      ctl.request('selected', 1);
      ctl.settle();
      const one = ctl.state.value === 'b';
      ctl.request('value', 'a');
      ctl.settle();
      return one && ctl.state.selected === 0 && ctl.state.shown0;
    }),
    T('two presses in the same tick both reach the machine; the panel on show stays put until a later press settles the bank', () => {
      const ctl = make();
      const shown = ctl.state.selected;
      const a = ctl.act(spec.controls[1]), b = ctl.act(spec.controls[0]);
      ctl.settle();
      const held = ctl.state.selected === shown;
      ctl.act(spec.controls[1]);
      ctl.settle();
      return a === true && b === true && held && ctl.state.selected === 1;
    }),
    T('controls are tabs over the button row and the label signs, aria-selected follows selected, roving focus', () => {
      const c = spec.controls[1];
      return c.role === 'tab' && c.area.join() === 'row1,label1' && c.aria.selected({ selected: 1 }) === true &&
        c.aria.selected({ selected: 0 }) === false && spec.roving({ selected: 1 }) === 1;
    }),
    T('one opening per panel, each in its own slot, shown only while that panel is on show', () =>
      spec.opening.length === 6 && spec.opening.every((o, k) => o.slot === `rs-panel-${k}` && o.shownWhen === 'shown' + k && o.cells === 'opening')),
  ],
};
