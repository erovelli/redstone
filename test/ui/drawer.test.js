// rs-drawer: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, ui, C } = require('./helpers.js');

const spec = loadComponent('drawer');
const T = (name, fn) => ({ name, fn });
const close = spec.controls[0];

function drawer(params) {
  const ctl = new ui.Controller(spec, C.get(spec.entry));
  ctl.build(Object.assign({ cols: 6, rows: 4 }, params));
  return ctl;
}
// Tick n times and collect every change with the tick it happened on.
function run(ctl, n) {
  const out = [];
  for (let i = 1; i <= n; i++) for (const ch of ctl.tick()) out.push(Object.assign({ tick: i }, ch));
  return out;
}

module.exports = {
  suite: 'rs-drawer',
  tests: [
    T('open = true presses the open button: up on tick 1, revealed as the machine crosses the edge, toggle on tick 19', () => {
      const ctl = drawer({});
      if (spec.state.open.settle !== false || ctl.state.deployed || ctl.state.open || !ctl.state.closed) return false;
      ctl.request('open', true);
      const ch = run(ctl, 30);
      const up = ch.find(c => c.key === 'deployed');
      const open = ch.find(c => c.key === 'open');
      const leads = ch.filter(c => c.key === 'lead').map(c => c.value);
      return up.tick === 1 && open.tick === 19 && open.events.join() === 'toggle' && leads.join() === '0,1,2,3,4,5' &&
        ch.find(c => c.key === 'revealed').value === true;
    }),
    T('the close control presses the far button: toggle as it leaves, close and the overlay down when it is home', () => {
      const ctl = drawer({ open: true });
      if (!ctl.state.open || !ctl.state.deployed) return false;
      ctl.act(close);
      const ch = run(ctl, 30);
      const open = ch.find(c => c.key === 'open');
      const shut = ch.find(c => c.key === 'closed');
      const down = ch.find(c => c.key === 'deployed');
      return open.tick <= 3 && open.events.join() === 'toggle' && shut.tick === 19 && shut.events.join() === 'close' && down.tick === 19;
    }),
    T('open while open and close while closed change nothing', () => {
      const a = drawer({});
      a.request('open', false);
      const b = drawer({ open: true });
      b.request('open', true);
      return run(a, 30).length === 0 && run(b, 30).filter(c => c.key !== 'deployed').length === 0 && b.state.open;
    }),
    T('dialog semantics: role dialog, aria-modal, the panel through the opening, one close control on the far station', () =>
      spec.host.role === 'dialog' && spec.host.aria.modal() === 'true' && spec.opening.cells === 'panel' && !spec.opening.slot &&
      spec.controls.length === 1 && close.act === 'press' && close.io === 'close'),
  ],
};
