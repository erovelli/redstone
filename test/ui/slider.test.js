// rs-slider: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('slider');
const T = (name, fn) => ({ name, fn });
const lit = c => c.io.lamps.filter(l => l.lit).length;
const key = (ctl, k) => ctl.act(Object.assign({}, spec.controls[0], { act: spec.controls[0].keys[k] }), k);

module.exports = {
  suite: 'rs-slider',
  tests: [
    T('min, max and value build a bar that already shows the value', () => {
      const a = controller(spec, { min: '0', max: '15', value: '7' });
      const b = controller(spec, {});
      const c = controller(spec, { min: '0', max: '100', value: '50' });
      return a.state.value === '7' && lit(a) === 7 && a.io.lamps.length === 15 &&
        b.state.value === '8' && c.state.value === '53' && lit(c) === 8;
    }),
    T('an arrow key moves items until the next level, then input and change fire once each, together', () => {
      const ctl = controller(spec, { max: '10', value: '3' });
      key(ctl, 'ArrowRight');
      const { changes } = untilChange(ctl);
      const after = untilChange(ctl, 20);
      return ctl.state.value === '4' && lit(ctl) === 4 && after.ticks === -1 &&
        changes.map(c => c.key + ':' + c.events.join()).join() === 'value:input,committed:change';
    }),
    T('every key: Up/Down, PageUp/PageDown, Home/End, clamped at the ends', () => {
      const ctl = controller(spec, { max: '15', value: '7' });
      const seq = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'PageUp', 'PageDown', 'End', 'ArrowRight', 'Home', 'ArrowLeft'].map(k => {
        key(ctl, k);
        ctl.settle();
        return ctl.state.value;
      });
      return seq.join() === '8,7,6,9,6,15,15,0,0';
    }),
    T('Space and Enter (the control\'s click) move nothing', () => {
      const ctl = controller(spec, { value: '5' });
      return ctl.act(spec.controls[0]) === false && ctl.settle().length === 0;
    }),
    T('setting value moves items to the nearest level, no events', () => {
      const ctl = controller(spec, { min: '0', max: '1', step: '0.25' });
      ctl.request('value', '0.7');
      ctl.settle();
      return ctl.state.value === '0.75' && lit(ctl) === 3 && ctl.state.committed === '0.75';
    }),
    T('a drag: input as the comparator moves, change once on release', () => {
      const ctl = controller(spec, { value: '2' });
      const b = ctl.built;
      const aim = n => ctl.act({ act: (hand, io, built) => { if (!built.drag) built.drag = { from: built.scale.text(io.comparator.out) }; return built.moveTo(hand, n); } });
      aim(6);
      const a = ctl.settle();
      aim(9);
      const c = ctl.settle();
      ctl.act({ act: (hand, io, built) => { built.drag = null; return false; } });
      const d = ctl.settle();
      const ev = list => list.map(x => x.events.join()).join('|');
      return b.drag === null && ev(a) === 'input' && ev(c) === 'input' && ev(d) === 'change' && d[0].value === '9' && d[0].prev === '2';
    }),
    T('the control is a slider with aria-valuenow, -valuemin, -valuemax and -valuetext', () => {
      const ctl = controller(spec, { min: '10', max: '20', step: '2', value: '14' });
      const el = { contraption: { built: ctl.built } };
      const a = spec.controls[0].aria;
      return spec.controls[0].role === 'slider' && ctl.state[a.valuenow] === '14' && a.valuemin({}, el) === 10 && a.valuemax({}, el) === 20 && a.valuetext === 'value';
    }),
    T('the form value is the value', () => spec.form.value({ value: '7' }) === '7'),
  ],
};
