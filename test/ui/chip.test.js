// rs-chip and rs-badge: the component specs driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const chip = loadComponent('chip');
// The same file also defines rs-badge; capture it the way helpers.js captures rs-chip.
function captureBadge() {
  const path = require('path');
  const file = path.join(__dirname, '..', '..', 'src', 'ui', 'components', 'chip.js');
  const prev = global.Redstone;
  let out = null;
  global.Redstone = { ui: { define: (tag, spec) => { if (tag === 'rs-badge') out = spec; } } };
  try {
    delete require.cache[require.resolve(file)];
    require(file);
  } finally {
    global.Redstone = prev;
  }
  return out;
}
const badge = captureBadge();
const T = (name, fn) => ({ name, fn });

module.exports = {
  suite: 'rs-chip',
  tests: [
    T('signs follow the measured text: one per block of text, at least one', () => {
      const short = controller(chip, {}, { text: '3' });
      const long = controller(chip, {}, { text: 'redstone dust' });
      return short.io.signs.length === 1 && long.io.signs.length > 3 && long.io.signs.length <= 10;
    }),
    T('a plain chip has no piston and no control; dismissible adds both', () => {
      const plain = controller(chip, {}, { text: 'tag' });
      const d = controller(chip, { dismissible: '' }, { text: 'tag' });
      return !plain.io.piston && d.io.piston && d.io.button && chip.controls.length === 1;
    }),
    T('tone picks the concrete colour; an unknown tone falls back to oak planks', () => {
      const lime = controller(chip, { tone: 'lime' }, { text: 'ok' });
      const bad = controller(chip, { tone: 'chartreuse' }, { text: 'ok' });
      return lime.io.blocks.every(b => b.t === 'concrete' && b.color === 'lime') && bad.io.blocks.every(b => b.t === 'planks');
    }),
    T('lit hangs the signs on lamps that are lit from the start', () => {
      const c = controller(chip, { lit: '' }, { text: 'online' });
      return c.io.blocks.every(b => b.t === 'lamp' && b.lit) && c.state.dismissed === false;
    }),
    T('pressing the dismiss button fires dismiss on tick 1, when the signs pop', () => {
      const c = controller(chip, { dismissible: '' }, { text: 'draft' });
      c.act(chip.controls[0]);
      if (c.state.dismissed) return false;
      const { ticks, changes } = untilChange(c);
      return ticks === 1 && changes[0].key === 'dismissed' && changes[0].value === true && changes[0].events.join() === 'dismiss';
    }),
    T('the dismiss event is cancelable and the element removes itself only if it was not cancelled', () => {
      let removed = 0;
      const el = { remove: () => removed++ };
      const queue = global.queueMicrotask;
      global.queueMicrotask = fn => fn();
      try {
        chip.changed(el, { key: 'dismissed', value: true, dispatched: [{ defaultPrevented: true }] });
        chip.changed(el, { key: 'dismissed', value: true, dispatched: [{ defaultPrevented: false }] });
      } finally { global.queueMicrotask = queue; }
      return chip.state.dismissed.cancelable === true && removed === 1;
    }),
    T('rs-badge: red by default, never dismissible', () => {
      const c = controller(badge, { dismissible: '' }, { text: '3' });
      return badge.controls.length === 0 && !c.io.piston && c.io.blocks.every(b => b.color === 'red');
    }),
    T('the sign text stays readable to screen readers', () => chip.readLabel === true && badge.readLabel === true && chip.label === 'signs'),
  ],
};
