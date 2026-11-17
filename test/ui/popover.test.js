// rs-popover: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller } = require('./helpers.js');

const spec = loadComponent('popover');
const T = (name, fn) => ({ name, fn });
const close = spec.controls[0];
// What a trigger click does: the button the latch calls for.
const trigger = { act: (hand, io) => hand.press(io.tA.lit ? io.show : io.close) };

function run(ctl, n) {
  const out = [];
  for (let i = 1; i <= n; i++) for (const ch of ctl.tick()) out.push(Object.assign({ tick: i }, ch));
  return out;
}

module.exports = {
  suite: 'rs-popover',
  tests: [
    T('the trigger presses open: toggle fires on tick 3; pressed again it presses close and the door shuts on tick 1', () => {
      const ctl = controller(spec, {});
      ctl.act(trigger);
      const a = run(ctl, 12).find(c => c.key === 'open');
      ctl.act(trigger);
      const b = run(ctl, 12).find(c => c.key === 'open');
      return a.tick === 3 && a.value === true && b.tick === 1 && b.value === false && !ctl.state.deployed;
    }),
    T('the trigger during the opening presses close (the latch is already set): it ends closed', () => {
      const ctl = controller(spec, {});
      ctl.act(trigger);
      run(ctl, 2);
      ctl.act(trigger);
      run(ctl, 40);
      return !ctl.state.open && !ctl.state.deployed;
    }),
    T('the close control presses the close button; built open, it starts open', () => {
      const ctl = controller(spec, { open: '' });
      if (!ctl.state.open) return false;
      ctl.act(close);
      return run(ctl, 3).some(c => c.key === 'open' && c.value === false && c.tick === 1);
    }),
    T('no title signs; the content goes through the opening', () => {
      const ctl = controller(spec, {});
      return ctl.io.signs.length === 0 && spec.opening.shownWhen === 'open' && spec.host.role === 'dialog';
    }),
  ],
};
