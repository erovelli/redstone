// UI contraption for <rs-popover>: the modal's machine (see modal.js), smaller. An open button on a torch latch
// puts out the torch that lights the dust line on the piston row, and one sticky piston per column pulls a honey or
// slime column of the door back into the wall; the close button relights it and the door shuts.
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);
// Resolved when a builder runs, not at load time (files in a directory must not depend on load order).
const modal = () => (N ? require('./modal.js') : { buildModal: window.buildModal, ...window.RSModal });

function buildPopover(p = {}) {
  return modal().buildModal(Object.assign({ cols: 6, rows: 2, signs: 0 }, p));
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

const entry = Catalogue.register({
  id: 'ui-popover',
  name: 'Popover',
  category: 'Disclosure and overlays',
  summary: 'The modal\'s machine, beside its trigger: the open button on a torch latch puts out the torch that lights the piston row, and the pistons pull the honey and slime door back. The close button relights it.',
  strict: true,
  deviations: [],
  inputs: ['open button', 'close button'],
  outputs: ['door clear', 'door home'],
  actions: ['press the open button', 'press the close button'],
  timing: 'Door clear 3 ticks after the open press; home 1 tick after the close press; the latch has turned over 7 ticks after it.',
  notes: [
    'The same latch and door as ui-modal, so the same guarantees: the latch settles for every pair of presses, and each piston moves only its own column.',
  ],
  params: [
    { key: 'cols', label: 'Columns', min: 1, max: 15, def: 6 },
    { key: 'rows', label: 'Rows', min: 1, max: 12, def: 2 },
  ],
  controls: [{ kind: 'button', io: 'show', label: 'Open' }, { kind: 'button', io: 'close', label: 'Close' }],
  build: buildPopover,
  tests: [
    T('open clears the door on tick 3, close shuts it on tick 1, and a cycle returns every block (every edge)', () => each(entry, p => {
      const t = ui().testing, M = modal(), c = buildPopover(p), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      hand.press(c.io.show);
      const opened = t.ticksUntil(w, () => M.isOpen(c), 20);
      t.settle(w);
      hand.press(c.io.close);
      const shut = t.ticksUntil(w, () => M.isHome(c), 20);
      t.settle(w);
      return opened === 3 && shut === 1 && t.hash(w) === h0;
    })),
    T('the built steady state does not drift for 100 ticks, closed and open', () => each(entry, p => [false, true].every(open => ui().testing.noDrift(buildPopover(Object.assign({}, p, { open })).world, 100)))),
    T('push limit: each piston moves exactly its own column, both ways', () => each(entry, p => {
      const t = ui().testing, c = buildPopover(p), w = c.world, hand = t.hand(w), sizes = [];
      w.on('move', ev => sizes.push(ev.blocks.every(b => b.x === ev.piston.x) ? ev.blocks.length : 99));
      hand.press(c.io.show);
      t.settle(w);
      hand.press(c.io.close);
      t.settle(w);
      return sizes.length === 2 * c.io.pistons.length && sizes.every(k => k === p.rows && k <= 12);
    })),
    T('strict', () => each(entry, p => ui().testing.strictWorld(buildPopover(p).world, RS))),
  ],
});

if (N) module.exports = { buildPopover, entry };
else window.buildPopover = buildPopover;
})();
