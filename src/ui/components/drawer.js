// <rs-drawer>: an off-canvas panel, like a dialog that slides in from the west edge. show(), the open property or a
// trigger (any element with data-rs-open="<id>") presses the button at the machine's home station; a flying machine
// flies along the rail at the top of the panel and the panel's HTML is revealed behind its leading edge. The close
// button at the far station, Escape, a click on the backdrop and any [data-rs-close] inside press the far button.
// `open` and `toggle` follow the machine parked at the far end; `close` fires when it is home again.
//
//   <button data-rs-open="menu">Menu</button>
//   <rs-drawer id="menu" label="Menu"><nav><a href="/">Home</a></nav></rs-drawer>
//
// The element is a fixed full-viewport overlay, invisible until the open button is pressed and up until the machine
// is home again. The panel's first column is at the viewport's west edge, so the parked machine is off-screen.
// While it is up the page is inert, focus moves in once the machine parks, is trapped, and returns afterwards.
(function () {
const STYLES = `
  :host { --rs-block: 32px; position: fixed; inset: 0; z-index: 2147481000; display: block; max-width: none;
    background: var(--rs-backdrop, rgba(12, 8, 4, .5)); overflow: hidden; }
  :host(:not([data-deployed])) { visibility: hidden; pointer-events: none; background: none; }
  @media (max-width: 420px) { :host { --rs-block: 28px; } }
  .box { margin-left: calc(var(--b) * -7); }
  .window { padding: .6em .8em; box-sizing: border-box; background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
`;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const own = new WeakMap();
const mine = el => own.get(el) || own.set(el, {}).get(el);
const deepActive = () => {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a;
};
const holder = n => (n && n.getRootNode() !== document ? n.getRootNode().host : n);
const press = key => (hand, io) => hand.press(io[key]);

// Columns: the content's natural width in blocks, between 6 and 12 (12 columns fly in 3.7 s), within the viewport
// less one column for the far stopper. Rows: the viewport's height below the rail.
function size(el, ctx) {
  const B = ctx.B;
  if (!el || !el.parentNode) return { cols: 10, rows: 6 };
  const vw = document.documentElement.clientWidth || innerWidth;
  const probe = document.createElement('div');
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', width: 'max-content', padding: '.6em .8em' });
  for (const n of el.childNodes) if (!(n.nodeType === 1 && n.getAttribute('slot'))) probe.appendChild(n.cloneNode(true));
  el.parentNode.insertBefore(probe, el.nextSibling);
  const natural = probe.getBoundingClientRect().width;
  probe.remove();
  const want = Number(el.getAttribute('columns')) || Math.ceil(natural / B);
  const cols = Math.max(2, Math.min(12, Math.max(6, want), Math.floor(vw / B) - 1));
  const rows = Math.max(1, Math.min(60, Math.floor((innerHeight - 2 * B - 2 * Math.round(B * 0.72)) / B)));
  return { cols, rows };
}

function focusables(el) {
  const list = [el];
  if (!el.open) return list;
  for (const n of el.querySelectorAll('*')) {
    if (n.closest('[inert]')) continue;
    if ((n.matches(FOCUSABLE) || n.localName.startsWith('rs-')) && n.getClientRects().length) list.push(n);
  }
  return list;
}

function inertPage(el, on) {
  const m = mine(el);
  if (on && !m.inerted) {
    m.inerted = [];
    for (let n = el; n.parentElement && n !== document.body; n = n.parentElement) {
      for (const sib of n.parentElement.children) {
        if (sib === n || sib.inert || sib.localName === 'script' || sib.localName === 'style') continue;
        sib.inert = true;
        m.inerted.push(sib);
      }
    }
  } else if (!on && m.inerted) {
    m.inerted.forEach(n => { n.inert = false; });
    m.inerted = null;
  }
}

// Follow the machine: up -> the page is inert and focus goes to the close control; parked open -> focus moves into
// the panel; home -> the page is live again and focus returns to the trigger.
function follow(el) {
  const m = mine(el);
  const up = el.isConnected && !!el.deployed;
  if (up && !m.inerted) {
    if (!m.opener) m.opener = deepActive();
    inertPage(el, true);
    m.focused = false;
    el.focus();
  }
  if (up && el.open && !m.focused) {
    m.focused = true;
    const content = focusables(el).slice(1);
    const first = content.find(n => n.hasAttribute('autofocus')) || content[0];
    if (first) first.focus();
  }
  if (!up && m.inerted) {
    inertPage(el, false);
    const back = m.opener;
    m.opener = null;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus();
  }
}

// The panel shows only behind the machine: the window is clipped at the leading edge (the core places it over the
// whole panel; the clip follows the machine every tick).
function clip(el, state) {
  const c = el.contraption, win = el.shadowRoot && el.shadowRoot.querySelector('.window');
  if (!c || !win || !c.view) return;
  const hidden = Math.max(0, c.built.cols - 1 - state.lead) * c.view.B;
  win.style.clipPath = `inset(0 ${hidden}px 0 0)`;
}

if (typeof document !== 'undefined' && !window.__rsDrawerWired) {
  window.__rsDrawerWired = true;
  document.addEventListener('click', ev => {
    const t = ev.target.closest && ev.target.closest('[data-rs-open]');
    const d = t && document.getElementById(t.getAttribute('data-rs-open'));
    if (!d || d.localName !== 'rs-drawer') return;
    ev.preventDefault();
    d.show(t);
  });
  document.addEventListener('keydown', ev => {
    const d = [...document.querySelectorAll('rs-drawer[data-deployed]')].pop();
    if (!d) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      d.close();
      return;
    }
    if (ev.key !== 'Tab') return;
    const list = focusables(d);
    const at = list.indexOf(holder(document.activeElement));
    const next = at < 0 ? 0 : ev.shiftKey ? (at === 0 ? list.length - 1 : -1) : (at === list.length - 1 ? 0 : -1);
    if (next < 0) return;
    ev.preventDefault();
    list[next].focus();
  }, true);
}

const home = (io, b) => b.world.get(io.west.x, 0, io.west.z) === io.west && io.west.x === -b.length && !io.a.ext && !io.b.ext;
const parked = (io, b) => io.east.x === b.cols - 1 && io.west.x === b.cols - b.length && !io.a.ext && !io.b.ext;

Redstone.ui.define('rs-drawer', {
  entry: 'ui-drawer',
  minBlock: 30,
  params: {
    open: { attr: 'open', type: 'boolean', doc: 'Start open. After that the attribute mirrors the machine.' },
    cols: (el, ctx) => size(el, ctx).cols,
    rows: (el, ctx) => size(el, ctx).rows,
  },
  opening: { cells: 'panel', shownWhen: 'revealed' },
  controls: [{ io: 'close', act: 'press', role: 'button', label: 'Close', area: ['close', 'closeObserver'] }],
  host: {
    role: 'dialog',
    aria: { modal: () => 'true', label: (state, el) => el.getAttribute('label') || null },
  },
  state: {
    open: {
      read: (io, b) => parked(io, b),
      attr: 'open',
      event: 'toggle',
      settle: false,
      set: (hand, io, value) => hand.press(value ? io.show : io.close),
      doc: 'True while the machine is parked at the far end. Setting it presses the open or the close button; the world then runs.',
    },
    closed: {
      read: (io, b) => home(io, b),
      event: 'close',
      when: 'rise',
      doc: 'True while the machine is parked at home.',
      eventDoc: 'When the machine is home again after the close button was pressed.',
    },
    deployed: {
      read: (io, b) => !!io.show.on || !home(io, b),
      attr: 'data-deployed',
      doc: 'True while the overlay is up: from the open press until the machine is home.',
    },
    revealed: { read: io => io.east.x >= 0, doc: 'True while some of the panel is behind the machine.' },
    lead: { read: io => io.east.x, doc: 'The leading edge: the column of the machine\'s east end.' },
  },
  changed: el => follow(el),
  sync: (el, state) => clip(el, state),
  mounted(el, view, built) {
    clip(el, el.contraption.state);
    follow(el);
    const m = mine(el);
    if (!m.wired) {
      m.wired = true;
      el.addEventListener('click', ev => {
        const t = ev.target.closest && ev.target.closest('[data-rs-close]');
        if (t && el.contains(t)) el.close();
      }, true);
    }
    if (el.id) {
      document.querySelectorAll(`[data-rs-open="${CSS.escape(el.id)}"]`).forEach(t => {
        t.setAttribute('aria-haspopup', 'dialog');
        t.setAttribute('aria-controls', el.id);
      });
    }
  },
  methods: {
    show(opener) {
      if (!this.deployed) mine(this).opener = opener && opener.focus ? opener : deepActive();
      this.perform(press('show'));
    },
    showModal(opener) { this.show(opener); },
    close() { this.perform(press('close')); },
    disconnectedCallback() {
      Redstone.ui.Element.prototype.disconnectedCallback.call(this);
      inertPage(this, false);
      mine(this).opener = null;
    },
  },
  observe: ['columns'],
  styles: STYLES,
  docs: {
    attributes: {
      label: 'The dialog\'s accessible name.',
      columns: 'The panel width in columns (default: the content\'s width, 6 to 12). The machine flies 3 ticks per column.',
      'data-rs-open="id"': 'On any element elsewhere on the page: activating it opens the drawer with that id.',
      'data-rs-close': 'On any element inside the panel: activating it presses the close button.',
    },
    properties: {
      'show()': 'Press the open button. open becomes true when the machine parks at the far end.',
      'close()': 'Press the close button (Escape and a backdrop click do the same).',
    },
  },
});
})();
