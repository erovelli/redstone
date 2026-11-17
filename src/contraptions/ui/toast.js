// UI contraption for <rs-toast> and <rs-alert>: a notification behind a honey curtain.
//
// The message (ordinary HTML) shows through an opening one block tall. In front of it hangs a row of honey
// blocks; honey sticks to honey, so one sticky piston under the row pulls the whole curtain down a block and
// pushes it back up. That piston is powered by a redstone block held in place by two pistons: a piston latch.
//   show:    press the show button -> piston S pushes the redstone block away from the curtain piston -> the
//            curtain drops; the redstone block now rings the bell beside it.
//   close:   piston R pushes the redstone block back -> the curtain piston is powered and lifts the curtain.
//            R fires from the dismiss button on top of it, or (toast) from the timer.
//   timer:   the show button also starts a pulse down a repeater line that runs east under the opening and back
//            west behind it into a block next to R. Its total delay is the toast's duration.
//
//   plan at z = -2 (y = 0 is the back row), floor at z = -3:
//          x=-1    0        1         2       3        4 ..... E      E+1
//   y=0    [blk] <-R(W) <- R(W) <- R(W) <-- R(W) <- R(W) .... R(W) <- dust
//   y=1    [R ->] (open)   [rblock]  [<- S]  [button] R(E) .... R(E) -> dust
//   y=2    (wall)[bell]    [P up]
//   z=-1: the dismiss button on R; the curtain piston's head at (1,2). z=0: the opening (x=1..N, y=1), the honey
//   curtain in front of it (y=2) and a planks wall behind it (y=0, z=-1 and 0).
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const FLOOR = 'smooth_stone';
const MAX_EAST = 20;
const yes = v => v === true || v === 'true';
const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// The timer's shape for a duration: the east end E of the line and each repeater's delay. The line has
// 2E - 1 repeaters (x = 4..E going east, x = E..0 going west), each 1 to 4 ticks.
function timerFor(ticks, cells) {
  let E = Math.max(cells, 4);
  while (4 * (2 * E - 1) < ticks && E < MAX_EAST) E++;
  const n = 2 * E - 1;
  const total = Math.max(n, Math.min(4 * n, ticks));
  const delays = [];
  for (let i = 0; i < n; i++) delays.push(Math.floor(total / n) + (i < total % n ? 1 : 0));
  return { E, delays, total };
}

function buildToast(p = {}) {
  const cells = int(p.cells, 2, 11, 6);
  const timed = !yes(p.persistent);
  const open = yes(p.open);
  const ticks = int(p.ticks, 1, 4 * (2 * MAX_EAST - 1), 40);
  const t = timed ? timerFor(ticks, cells) : { E: Math.max(cells, 3), delays: [], total: 0 };
  const E = t.E;
  const w = new RS.World({ strict: true });

  for (let x = -1; x <= E + 1; x++) for (let y = 0; y <= 2; y++) w.put(x, y, -3, FLOOR);
  // The wall behind the opening.
  for (let x = 1; x <= cells; x++) {
    w.put(x, 0, 0, 'planks');
    w.put(x, 0, -1, 'planks');
  }
  // The curtain and its piston. Open: the piston is retracted and the curtain hangs one block lower.
  const curtainZ = open ? -1 : 0;
  const curtain = [];
  for (let x = 1; x <= cells; x++) curtain.push(w.put(x, 2, curtainZ, 'honey'));
  const P = w.put(1, 2, -2, 'piston', { d: 'U', s: true, ext: !open });
  if (!open) w.put(1, 2, -1, 'head', { d: 'U', s: true, p: P });
  // The latch.
  const rblock = w.put(open ? 0 : 1, 1, -2, 'rblock');
  const S = w.put(2, 1, -2, 'piston', { d: 'W', s: false, ext: false });
  const show = w.put(3, 1, -2, 'button', { att: 'W', on: false });
  const R = w.put(-1, 1, -2, 'piston', { d: 'E', s: false, ext: false });
  const dismiss = w.put(-1, 1, -1, 'button', { att: 'D', on: false });
  w.put(-1, 2, -2, 'planks');
  const bell = w.put(0, 2, -2, 'bell', { att: 'W' });
  w.put(-1, 0, -2, 'stone');                          // the block the timer powers, next to R
  // The timer line.
  const line = [];
  if (timed) {
    let k = 0;
    for (let x = 4; x <= E; x++) line.push(w.put(x, 1, -2, 'repeater', { d: 'E', delay: t.delays[k++], on: false }));
    w.put(E + 1, 1, -2, 'dust', { lvl: 0 });
    w.put(E + 1, 0, -2, 'dust', { lvl: 0 });
    for (let x = E; x >= 0; x--) line.push(w.put(x, 0, -2, 'repeater', { d: 'W', delay: t.delays[k++], on: false }));
  }
  w.seal();
  const opening = [];
  for (let x = 1; x <= cells; x++) opening.push([x, 1, 0]);
  const front = [];
  for (let x = 1; x <= cells; x++) front.push([x, 2, 0]);
  return {
    world: w,
    box: [-1, timed ? E + 1 : Math.max(cells, 3), 0, 2, -3, 0],
    opening, front, ticks: t.total,
    io: { show, dismiss, bell, rblock, curtain, piston: P, set: S, reset: R, line },
  };
}

const isOpen = c => c.front.every(([x, y, z]) => !c.world.get(x, y, z));

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());

const entry = Catalogue.register({
  id: 'ui-toast',
  name: 'Toast and alert',
  category: 'Feedback',
  summary: 'A honey curtain hangs in front of the message. A piston latch (a redstone block pushed back and forth by two pistons) powers the curtain piston: the show button drops the curtain and rings a bell; a repeater timer or the dismiss button lifts it again.',
  strict: true,
  deviations: [],
  inputs: ['show button', 'dismiss button'],
  outputs: ['the curtain (opening clear or covered)', 'the bell'],
  actions: ['press the show button', 'press the dismiss button'],
  timing: 'Open on tick 2 after the show press (the bell rings in the same tick). The timer lifts the curtain within 2 ticks of `ticks` after the press; the dismiss button lifts it on tick 2.',
  notes: [
    'Durations: the timer is a line of 2E - 1 repeaters (E is the east end, at least the width of the opening), each 1 to 4 ticks, so a toast can stay open from 2E - 1 to 4 (2E - 1) ticks; a longer duration makes the machine wider, up to 15.6 s.',
    'Honey sticks to honey but not to the signs, buttons or repeaters around it, so the sticky piston moves exactly the curtain: at most 11 blocks, under the push limit.',
    'The latch is idempotent: pressing show while open or dismiss while closed moves nothing. A timer pulse that arrives after an early dismiss finds the latch closed and does nothing, but if the toast was shown again in between, it closes early.',
    'The timer holds R out for the 10 ticks of the show press; a show in those 10 ticks is blocked by R\'s head and does nothing.',
    'persistent (the alert) leaves out the timer; open builds it open (the latch already set).',
  ],
  params: [
    { key: 'cells', label: 'Opening width', min: 2, max: 11, def: 6 },
    { key: 'ticks', label: 'Duration (ticks)', min: 12, max: 156, def: 40 },
    { key: 'persistent', label: 'No timer (alert)', options: [false, true], def: false },
    { key: 'open', label: 'Built open', options: [false, true], def: false },
  ],
  controls: [{ kind: 'button', io: 'show', label: 'Show' }, { kind: 'button', io: 'dismiss', label: 'Dismiss' }],
  build: buildToast,
  tests: [
    T('show opens it on tick 2 and rings the bell (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildToast(Object.assign({}, p, { open: false })), w = c.world;
      let rang = 0;
      w.on('sound', ev => { if (ev.name === 'bell') rang++; });
      t.hand(w).press(c.io.show);
      return t.ticksUntil(w, () => isOpen(c), 6) === 2 && rang === 1;
    })),
    T('the timer closes a toast after its duration; an alert stays open', () => each(entry, p => {
      const t = ui().testing, c = buildToast(Object.assign({}, p, { open: false })), w = c.world;
      t.hand(w).press(c.io.show);
      const opened = t.ticksUntil(w, () => isOpen(c), 6);
      const n = t.ticksUntil(w, () => !isOpen(c), 200);
      if (yes(p.persistent)) return n === -1;
      return opened + n >= c.ticks - 2 && opened + n <= c.ticks + 3;   // counted from the press
    })),
    T('dismiss closes it early, on tick 2; the late timer pulse then moves nothing', () => {
      const t = ui().testing, c = buildToast({ ticks: 60 }), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      hand.press(c.io.show);
      w.run(15);
      hand.press(c.io.dismiss);
      const n = t.ticksUntil(w, () => !isOpen(c), 6);
      let moved = 0;
      w.on('move', ev => { if (ev.blocks.length) moved++; });
      t.settle(w);
      return n === 2 && moved === 0 && t.hash(w) === h0;
    }),
    T('a full show and time-out cycle returns every block to its start (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildToast(Object.assign({}, p, { open: false })), w = c.world, hand = t.hand(w);
      t.settle(w);
      const h0 = t.hash(w);
      hand.press(c.io.show);
      w.run(20);
      if (yes(p.persistent)) hand.press(c.io.dismiss);
      t.settle(w, 400);
      return t.hash(w) === h0 && !isOpen(c);
    })),
    T('show while open and dismiss while closed move nothing', () => {
      const t = ui().testing, c = buildToast({ persistent: true, open: true }), w = c.world, hand = t.hand(w);
      let moved = 0;
      w.on('move', ev => { if (ev.blocks.length) moved++; });
      hand.press(c.io.show);
      t.settle(w);
      const stillOpen = isOpen(c) && moved === 0;
      hand.press(c.io.dismiss);
      t.settle(w);
      const closed = !isOpen(c) && moved === 2;   // R pushes the redstone block, then the curtain rises
      hand.press(c.io.dismiss);
      t.settle(w);
      return stillOpen && closed && moved === 2;
    }),
    T('the curtain piston moves exactly the curtain', () => {
      const t = ui().testing, c = buildToast({ cells: 11, persistent: true }), w = c.world, hand = t.hand(w);
      const sizes = [];
      w.on('move', ev => { if (ev.piston === c.io.piston) sizes.push(ev.blocks.length); });
      hand.press(c.io.show);
      t.settle(w);
      hand.press(c.io.dismiss);
      t.settle(w);
      return sizes.length === 2 && sizes.every(n => n === 11);
    }),
    T('the built state does not drift for 100 ticks, closed and open', () => each(entry, p => ui().testing.noDrift(buildToast(p).world, 100) && isOpen(buildToast(p)) === yes(p.open))),
    T('timerFor: the line delay matches the duration within its range', () => {
      const a = timerFor(40, 6), b = timerFor(3, 6), c = timerFor(150, 6);
      return a.total === 40 && a.delays.reduce((s, d) => s + d, 0) === 40 && b.total === 11 && c.total === 150 && c.E > 6;
    }),
    T('strict', () => each(entry, p => ui().testing.strictWorld(buildToast(p).world, RS))),
  ],
});

if (N) module.exports = { buildToast, timerFor, isOpen, entry };
else window.buildToast = buildToast;
})();
