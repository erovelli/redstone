// rs-modal: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller } = require('./helpers.js');

const spec = loadComponent('modal');
const T = (name, fn) => ({ name, fn });
const close = spec.controls[0];

// Tick n times and collect every change with the tick it happened on.
function run(ctl, n) {
  const out = [];
  for (let i = 1; i <= n; i++) for (const ch of ctl.tick()) out.push(Object.assign({ tick: i }, ch));
  return out;
}

module.exports = {
  suite: 'rs-modal',
  tests: [
    T('open = true presses the open button: the overlay is up on tick 1, toggle fires on tick 5 when the door is clear', () => {
      const ctl = controller(spec, {});
      if (spec.state.open.settle !== false || ctl.state.deployed || ctl.state.open) return false;
      ctl.request('open', true);
      const ch = run(ctl, 12);
      const up = ch.find(c => c.key === 'deployed');
      const open = ch.find(c => c.key === 'open');
      return up.tick === 1 && up.value === true && open.tick === 5 && open.value === true && open.events.join() === 'toggle';
    }),
    T('the close control presses the close button: close and toggle fire on tick 1, the overlay goes on tick 5', () => {
      const ctl = controller(spec, { open: '' });
      if (!ctl.state.open || !ctl.state.deployed) return false;
      ctl.act(close);
      const ch = run(ctl, 12);
      const shut = ch.find(c => c.key === 'closed');
      const open = ch.find(c => c.key === 'open');
      const down = ch.find(c => c.key === 'deployed');
      return shut.tick === 1 && shut.events.join() === 'close' && open.tick === 1 && open.events.join() === 'toggle' && down.tick === 5 && !ctl.state.deployed;
    }),
    T('closing during the opening ends closed (the later press wins), and no toggle fires: the door never cleared', () => {
      const ctl = controller(spec, {});
      ctl.request('open', true);
      run(ctl, 2);
      ctl.act(close);
      const ch = run(ctl, 30);
      return !ctl.state.open && ctl.state.closed && !ctl.state.deployed && !ch.some(c => c.key === 'open');
    }),
    T('open = false while closed and the close control while closed change nothing', () => {
      const ctl = controller(spec, {});
      ctl.request('open', false);
      ctl.act(close);
      return run(ctl, 20).length === 0;
    }),
    T('dialog semantics: role dialog, aria-modal, the content through the opening, one close control', () => {
      const host = spec.host;
      return host.role === 'dialog' && host.aria.modal() === 'true' && spec.opening.shownWhen === 'open' && !spec.opening.slot &&
        spec.labelSlot === 'title' && spec.controls.length === 1 && close.act === 'press' && close.io === 'close';
    }),
    T('the close control covers the button and its x sign; the title signs leave room for both', () => {
      const ctl = controller(spec, {}, { text: 'A rather long dialog title' });
      const io = ctl.io, C = ctl.built.opening.filter(c => c[2] === 0).length;
      return close.area.join() === 'close,closeSign' && io.closeSign.x === C - 1 && io.close.x === C && io.signs.every(s => s.x < C - 1);
    }),
  ],
};
