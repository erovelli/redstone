// <rs-modal>: a modal dialog. showModal(), the open property or a trigger (any element with data-rs-open="<id>")
// presses the open button on a torch latch; the door's pistons pull its columns back and the dialog content is
// the HTML seen through the opening. The close button in the frame, Escape, a click on the backdrop and any
// [data-rs-close] inside the content press the close button. `open`, `toggle` and `close` follow the door.
//
//   <button data-rs-open="hello">Say hello</button>
//   <rs-modal id="hello"><span slot="title">Hello</span><p>Made of redstone.</p></rs-modal>
//
// How it sits over the page: the element is a fixed full-viewport overlay (a backdrop with the machine centred).
// It is invisible and lets clicks through until the open button is pressed, and stays up until the latch is reset
// and the door is home again. While it is up, the rest of the page is inert, focus is trapped inside it, and it
// returns to the trigger afterwards. Put it where no ancestor has a transform (a child of <body> is simplest).
(function () {
const STYLES = `
  :host { --rs-block: 32px; position: fixed; inset: 0; z-index: 2147482000; display: flex; align-items: center;
    justify-content: center; max-width: none; background: var(--rs-backdrop, rgba(12, 8, 4, .6)); }
  :host(:not([data-deployed])) { visibility: hidden; pointer-events: none; background: none; }
  @media (max-width: 420px) { :host { --rs-block: 30px; } }
  .rs-x { font-size: calc(var(--b) * .5); }
  .window { padding: .5em .8em; box-sizing: border-box; background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
`;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable="true"]';
const PAD_EM = 1.6;            // the window's horizontal padding, in em
const SIDE = 4;                // machine columns beside the opening: two frame columns and the latch's two
const HIGH = 4 + 5 * 0.72;     // machine rows above and below the opening, plus five rows of depth
const own = new WeakMap();     // per element: { opener, inerted, focused }
const mine = el => own.get(el) || own.set(el, {}).get(el);

const titleText = el => {
  if (!el) return '';
  const slotted = el.querySelector(':scope > [slot="title"]');
  return (slotted ? slotted.textContent : el.getAttribute('label') || '').replace(/\s+/g, ' ').trim();
};
const deepActive = () => {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a;
};

// The content laid out off-screen next to the element (so page CSS applies), at `width` px or its natural width.
function probe(el, width) {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', display: 'flow-root', lineHeight: 'normal',
    width: width ? width + 'px' : 'max-content', padding: '.5em 0',
  });
  box.setAttribute('aria-hidden', 'true');
  for (const n of el.childNodes) {
    if (n.nodeType === 1 && n.getAttribute('slot')) continue;
    const copy = n.cloneNode(true);
    if (copy.nodeType === 1) {
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    }
    box.appendChild(copy);
  }
  el.parentNode.insertBefore(box, el.nextSibling);
  const r = box.getBoundingClientRect();
  box.remove();
  return r;
}

// The opening: as wide as the content wants, within the viewport and 15 columns (and the `columns` attribute),
// at least wide enough for the title; then as many rows as the content needs at that width, within the viewport
// and 12 rows. Longer content scrolls inside the opening.
function size(el, ctx) {
  if (!el || !el.parentNode) return { cols: 10, rows: 5 };
  const B = ctx.B;
  const font = parseFloat(getComputedStyle(el).fontSize) || 16;
  const vw = document.documentElement.clientWidth || innerWidth;
  const maxCols = Math.max(1, Math.min(15, Number(el.getAttribute('columns')) || 15, Math.floor((vw - 16) / B) - SIDE));
  const maxRows = Math.max(1, Math.min(12, Math.floor((innerHeight - 16) / B - HIGH)));
  const minCols = Math.min(maxCols, ctx.signsFor(titleText(el), { min: 0, max: 13 }) + 2);
  const natural = probe(el, 0).width + PAD_EM * font;
  const cols = Math.max(minCols, Math.min(maxCols, Math.ceil(natural / B)));
  const h = probe(el, cols * B - PAD_EM * font).height;
  return { cols, rows: Math.max(1, Math.min(maxRows, Math.ceil((h - 1) / B))) };
}

// Focus targets in the order Tab visits them: the close control (the element itself, through delegatesFocus),
// then the content's focusable elements while the door is clear.
function focusables(el) {
  const list = [el];
  if (!el.open) return list;
  for (const n of el.querySelectorAll('*')) {
    if (n.closest('[slot="title"]') || n.closest('[inert]')) continue;
    if ((n.matches(FOCUSABLE) || n.localName.startsWith('rs-')) && n.getClientRects().length) list.push(n);
  }
  return list;
}
const holder = n => (n && n.getRootNode() !== document ? n.getRootNode().host : n);

// The page behind the dialog: every sibling of the element and of each of its ancestors becomes inert.
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

// Follow the machine: up (deployed) -> the page is inert and focus goes to the close control; door clear -> focus
// moves into the content; down -> the page is live again and focus returns to the trigger. Idempotent.
function sync(el) {
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

const press = key => (hand, io) => hand.press(io[key]);
const topModal = () => [...document.querySelectorAll('rs-modal[data-deployed]')].pop();

// Page-wide wiring, once: triggers, Escape, the Tab trap.
if (typeof document !== 'undefined' && !window.__rsModalWired) {
  window.__rsModalWired = true;
  document.addEventListener('click', ev => {
    const t = ev.target.closest && ev.target.closest('[data-rs-open]');
    if (!t) return;
    const m = document.getElementById(t.getAttribute('data-rs-open'));
    if (!m || m.localName !== 'rs-modal') return;
    ev.preventDefault();
    m.showModal(t);
  });
  document.addEventListener('keydown', ev => {
    const m = topModal();
    if (!m) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      m.close();
      return;
    }
    if (ev.key !== 'Tab') return;
    const list = focusables(m);
    const at = list.indexOf(holder(document.activeElement));
    const next = at < 0 ? 0 : ev.shiftKey ? (at === 0 ? list.length - 1 : -1) : (at === list.length - 1 ? 0 : -1);
    if (next < 0) return;
    ev.preventDefault();
    list[next].focus();
  }, true);
}

Redstone.ui.define('rs-modal', {
  entry: 'ui-modal',
  minBlock: 30,                                    // 0.4 of a block: the title stays at 12 px or more
  params: {
    open: { attr: 'open', type: 'boolean', doc: 'Start open. After that the attribute mirrors the door.' },
    cols: (el, ctx) => size(el, ctx).cols,
    rows: (el, ctx) => size(el, ctx).rows,
    signs: (el, ctx) => Math.min(size(el, ctx).cols - 2,ctx.signsFor(titleText(el), { min: 0, max: 14 })),
  },
  label: 'signs',
  labelSlot: 'title',
  labelFallback: el => el.getAttribute('label') || '',
  readLabel: true,
  opening: { cells: 'opening', shownWhen: 'open' },
  controls: [
    { io: 'close', act: 'press', role: 'button', label: 'Close', area: ['close', 'closeSign'] },
  ],
  host: {
    role: 'dialog',
    aria: { modal: () => 'true', label: (state, el) => titleText(el) || null },
  },
  state: {
    open: {
      read: (io, b) => b.opening.every(([x, y, z]) => !b.world.get(x, y, z)),
      attr: 'open',
      event: 'toggle',
      settle: false,
      set: (hand, io, value) => hand.press(value ? io.show : io.close),
      doc: 'True while the door is clear. Setting it presses the open or the close button; the world then runs.',
    },
    closed: {
      read: (io, b) => b.opening.every(([x, y, z]) => { const k = b.world.get(x, y, z); return !!k && (k.t === 'honey' || k.t === 'slime'); }),
      event: 'close',
      when: 'rise',
      doc: 'True while the door is home.',
      eventDoc: 'When the door is home again after the close button was pressed.',
    },
    deployed: {
      read: (io, b) => !!io.show.on || !io.latch.on || !b.opening.every(([x, y, z]) => { const k = b.world.get(x, y, z); return !!k && (k.t === 'honey' || k.t === 'slime'); }),
      attr: 'data-deployed',
      doc: 'True while the overlay is up: from the open press until the latch is reset and the door is home.',
    },
  },
  changed: el => sync(el),
  mounted(el, view, built) {
    // The close button's caption: an x on the sign beside it (the sign never moves).
    const box = el.shadowRoot.querySelector('.box');
    box.querySelectorAll('.rs-x').forEach(n => n.remove());
    if (built.io.closeSign) {
      const r = view.rectOf(built.io.closeSign, 'front');
      const x = document.createElement('span');
      x.className = 'label rs-x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '×';
      Object.assign(x.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      box.appendChild(x);
    }
    sync(el);
    const m = mine(el);
    if (!m.wired) {
      m.wired = true;
      // Capture: the core keeps raw clicks on the machine inside the shadow root.
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
    showModal(opener) {
      if (!this.deployed) mine(this).opener = opener && opener.focus ? opener : deepActive();
      this.perform(press('show'));
    },
    show(opener) { this.showModal(opener); },
    close() { this.perform(press('close')); },
    disconnectedCallback() {
      Redstone.ui.Element.prototype.disconnectedCallback.call(this);
      inertPage(this, false);
      mine(this).opener = null;
    },
  },
  observe: ['label', 'columns'],
  styles: STYLES,
  docs: {
    attributes: {
      label: 'The title on the signs (or a child with slot="title"). Also the dialog\'s accessible name.',
      columns: 'At most this many columns of opening (default: as many as the content and the viewport allow, up to 15).',
      'data-rs-open="id"': 'On any element elsewhere on the page (a <button>, an <rs-button>): activating it opens the modal with that id.',
      'data-rs-close': 'On any element inside the content: activating it presses the close button.',
    },
    properties: {
      'showModal()': 'Press the open button. open becomes true when the door is clear (5 ticks).',
      'close()': 'Press the close button (Escape and a backdrop click do the same).',
    },
  },
});
})();
