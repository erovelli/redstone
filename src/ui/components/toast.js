// <rs-toast> and <rs-alert>: a notification behind a honey curtain. show() presses the show button: the latch
// drops the curtain and rings the bell, and (toast) a repeater timer lifts it again. The dismiss button closes it.
//
//   <rs-toast duration="4000">Saved.</rs-toast>   el.show()
//   <rs-alert open>Disk almost full.</rs-alert>
(function () {
const STYLES = `
  :host { --rs-block: 20px; }
  .window { display: flex; align-items: center; padding: 0 .4em; box-sizing: border-box; white-space: nowrap;
    font-size: calc(var(--b) * .7); background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
`;

// Opening width: the message at the element's own font size, in blocks, plus a little margin.
function cellsFor(el, ctx) {
  const size = el && typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(el).fontSize) || 16 : 16;
  const font = Math.min(size, ctx.B * 0.7);
  const px = ctx.text ? (ctx.measure ? ctx.measure(ctx.text) * 100 * (font / 40) : ctx.text.length * font * 0.6) : 0;
  return Math.max(2, Math.min(11, Math.ceil((px * 1.15) / ctx.B + 1)));   // 15% for proportional fonts, half a block each side
}

function spec(persistent) {
  return {
    entry: 'ui-toast',
    params: {
      cells: cellsFor,
      persistent: () => persistent,
      // duration is in milliseconds; one repeater tick is 100 ms.
      ticks: el => Math.round((el && Number(el.getAttribute('duration')) > 0 ? Number(el.getAttribute('duration')) : 4000) / 100),
      open: { attr: 'open', type: 'boolean', doc: 'Built open (the latch set). A toast built open has no timer running: show() starts one.' },
    },
    opening: { cells: 'opening', shownWhen: 'open' },
    controls: [
      { io: 'dismiss', act: 'press', role: 'button', label: 'Dismiss' },
    ],
    host: { role: persistent ? 'alert' : 'status' },
    state: {
      open: {
        read: (io, built) => built.front.every(([x, y, z]) => !built.world.get(x, y, z)),
        attr: 'open',
        event: 'toggle',
        settle: false,
        set: (hand, io, value) => hand.press(value ? io.show : io.dismiss),
        announce: (open, el) => (open ? el.textContent.replace(/\s+/g, ' ').trim() : ''),
        doc: 'True while the curtain is down. Setting it presses the show or the dismiss button; the world then runs (the bell, the timer).',
      },
      closed: {
        read: (io, built) => !built.front.every(([x, y, z]) => !built.world.get(x, y, z)),
        event: 'close',
        when: 'rise',
        doc: 'True while the curtain is up.',
        eventDoc: 'When the curtain is back up: the timer ran out or the dismiss button was pressed.',
      },
    },
    methods: {
      show() { this.open = true; },
      close() { this.open = false; },
    },
    observe: persistent ? [] : ['duration'],
    styles: STYLES,
    docs: {
      attributes: persistent ? {} : { duration: 'Milliseconds the toast stays open (default 4000). The timer is a line of repeaters, 100 ms per tick, from about 1 s up to 15.6 s; a longer duration makes the machine wider.' },
      properties: { 'show()': 'Press the show button.', 'close()': 'Press the dismiss button.' },
    },
  };
}

Redstone.ui.define('rs-toast', spec(false));
Redstone.ui.define('rs-alert', spec(true));
})();
