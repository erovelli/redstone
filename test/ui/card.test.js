// rs-card: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, ui, C } = require('./helpers.js');

const spec = loadComponent('card');
const T = (name, fn) => ({ name, fn });

// A controller with the params the element computes in a browser (size, header signs) given directly.
function card(params) {
  const ctl = new ui.Controller(spec, C.get(spec.entry));
  ctl.build(Object.assign({ cols: 6, rows: 3, frame: 'bricks', signs: 0, lamp: false, on: false }, params));
  return ctl;
}

module.exports = {
  suite: 'rs-card',
  tests: [
    T('the content shows through a clear opening of the measured size; the world is quiet', () => {
      const c = card({ cols: 7, rows: 4 });
      return c.state.clear === true && c.built.opening.length === 28 && c.quiet() && spec.opening.shownWhen === 'clear' && !spec.opening.slot;
    }),
    T('the frame attribute picks the block; an unknown name falls back to bricks', () => {
      const a = card({ frame: 'obsidian' }), b = card({ frame: 'gold' });
      return a.io.frame.every(f => f.t === 'obsidian') && b.io.frame.every(f => f.t === 'bricks');
    }),
    T('with a lamp, on follows the lamp and setting it flips the lever', () => {
      const c = card({ lamp: true });
      c.request('on', true);
      c.settle();
      const lit = c.state.on && c.io.lever.on && c.io.lamp.lit;
      c.request('on', false);
      c.settle();
      return lit && !c.state.on && !c.io.lever.on;
    }),
    T('without a lamp, on stays false and setting it does nothing', () => {
      const c = card({});
      c.request('on', true);
      c.settle();
      return c.state.on === false && !c.io.lever;
    }),
    T('the header goes on the signs (slot header, readable); built with the on attribute the lamp starts lit', () => {
      const c = card({ signs: 3, lamp: true, on: true });
      return spec.label === 'signs' && spec.labelSlot === 'header' && spec.readLabel && c.io.signs.length === 3 && c.state.on;
    }),
  ],
};
