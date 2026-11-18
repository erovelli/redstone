// rs-toast and rs-alert: the component specs driven headlessly (beyond the catalogue entry's own tests).
const path = require('path');
const { loadComponent, controller, untilChange } = require('./helpers.js');

const toast = loadComponent('toast');
function captureAlert() {
  const file = path.join(__dirname, '..', '..', 'src', 'ui', 'components', 'toast.js');
  const prev = global.Redstone;
  let out = null;
  global.Redstone = { ui: { define: (tag, spec) => { if (tag === 'rs-alert') out = spec; } } };
  try {
    delete require.cache[require.resolve(file)];
    require(file);
  } finally {
    global.Redstone = prev;
  }
  return out;
}
const alert = captureAlert();
const T = (name, fn) => ({ name, fn });

module.exports = {
  suite: 'rs-toast',
  tests: [
    T('<rs-toast open>: built shut, then shown once when mounted, so its timer runs and closes it', () => {
      const c = controller(toast, { open: '' }, { text: 'Saved.' });
      if (c.state.open || c.params.open !== false) return false;
      const el = { hasAttribute: n => n === 'open', get contraption() { return { built: c.built }; }, set open(v) { c.request('open', v); } };
      const prev = global.queueMicrotask;
      global.queueMicrotask = fn => fn();
      try {
        toast.mounted(el, null, c.built);
        toast.mounted(el, null, c.built);          // a remount (resize) does not press again
      } finally { global.queueMicrotask = prev; }
      const opened = untilChange(c, 10);
      if (!opened.changes.some(ch => ch.key === 'open' && ch.value === true)) return false;
      const closed = untilChange(c, 200);
      return closed.changes.some(ch => ch.key === 'open' && ch.value === false) && c.io.show.on === false;
    }),
    T('<rs-alert open> is built open (no timer to run)', () => {
      const c = controller(alert, { open: '' }, { text: 'Disk' });
      return c.state.open === true && !alert.mounted;
    }),
    T('show (open = true) presses the show button; toggle fires on tick 2 when the curtain is down', () => {
      const c = controller(toast, {}, { text: 'Saved.' });
      if (toast.state.open.settle !== false) return false;
      c.request('open', true);
      const { ticks, changes } = untilChange(c);
      const open = changes.find(ch => ch.key === 'open');
      return ticks === 2 && open.value === true && open.events.join() === 'toggle';
    }),
    T('the timer closes it: toggle and close fire together after the default 4 s', () => {
      const c = controller(toast, {}, { text: 'Saved.' });
      c.request('open', true);
      untilChange(c);
      let n = 2;
      let found = null;
      for (let i = 0; i < 80 && !found; i++) {
        n++;
        const ch = c.tick();
        if (ch.length) found = ch;
      }
      const events = found.flatMap(ch => ch.events).sort().join();
      return n >= 38 && n <= 42 && events === 'close,toggle';
    }),
    T('close (open = false) presses dismiss and the curtain rises on tick 2', () => {
      const c = controller(alert, { open: '' }, { text: 'Disk full' });
      if (!c.state.open) return false;
      c.request('open', false);
      const { ticks, changes } = untilChange(c);
      return ticks === 2 && changes.some(ch => ch.key === 'closed' && ch.events.join() === 'close');
    }),
    T('an alert has no timer and role alert; a toast has role status', () => {
      const c = controller(alert, {}, { text: 'x' });
      return c.io.line.length === 0 && alert.host.role === 'alert' && toast.host.role === 'status';
    }),
    T('the opening widens with the message', () => {
      const short = controller(toast, {}, { text: 'Hi' });
      const long = controller(toast, {}, { text: 'Your three files were uploaded' });
      return long.built.opening.length > short.built.opening.length && long.built.opening.length <= 11;
    }),
    T('the message is announced when it opens', () => toast.state.open.announce(true, { textContent: ' Saved. ' }) === 'Saved.'),
  ],
};
