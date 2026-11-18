// <rs-popover>: content behind a small honey and slime door next to its trigger. Activating the trigger presses the
// open button on the torch latch (or, while the latch is set, the close button); the door's pistons pull the door
// back and the content shows through the opening. The close button in the frame, Escape and a click outside press
// the close button. `open`, `toggle` and the trigger's aria-expanded follow the door.
//
//   <button>Details</button>
//   <rs-popover><p>Ships in two days.</p></rs-popover>          (the trigger is the previous element)
//   <rs-popover for="info-btn">...</rs-popover>                  (or named by id)
//
// The machine floats below the trigger (above it when there is no room), kept on screen, only while in use.
(function () {
const STYLES = `
  :host { --rs-block: 24px; position: fixed; left: 0; top: 0; width: 1px; height: 1px; }
  .box { position: fixed; left: 0; top: 0; z-index: 2147482400; }
  :host(:not([data-deployed])) .box { visibility: hidden; }
  .rs-x { font-size: calc(var(--b) * .5); }
  .window { padding: .3em .6em; box-sizing: border-box; background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
`;
const PAD_EM = 1.2;
const SIDE = 4, HIGH = 4 + 5 * 0.72;    // machine blocks around the opening (see modal.js)
const own = new WeakMap();
const mine = el => own.get(el) || own.set(el, {}).get(el);
let seq = 0;

const triggerOf = el => (el.hasAttribute('for') ? document.getElementById(el.getAttribute('for')) : el.previousElementSibling);
const home = b => b.opening.every(([x, y, z]) => { const k = b.world.get(x, y, z); return !!k && (k.t === 'honey' || k.t === 'slime'); });

function probe(el, width) {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', display: 'flow-root', lineHeight: 'normal',
    width: width ? width + 'px' : 'max-content', padding: '.3em 0',
  });
  box.setAttribute('aria-hidden', 'true');
  for (const n of el.childNodes) {
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

// The opening: the content's natural width (within the viewport and 15 columns), then the rows it needs (up to 8).
function size(el, ctx) {
  if (!el || !el.parentNode) return { cols: 6, rows: 2 };
  const B = ctx.B;
  const font = parseFloat(getComputedStyle(el).fontSize) || 16;
  const vw = document.documentElement.clientWidth || innerWidth;
  const maxCols = Math.max(2, Math.min(15, Math.floor((vw - 8) / B) - SIDE));
  const maxRows = Math.max(1, Math.min(8, Math.floor((innerHeight / 2) / B - HIGH)));
  const cols = Math.max(2, Math.min(maxCols, Math.ceil((probe(el, 0).width + PAD_EM * font) / B)));
  const h = probe(el, cols * B - PAD_EM * font).height;
  return { cols, rows: Math.max(1, Math.min(maxRows, Math.ceil((h - 1) / B))) };
}

// Below the trigger if there is room, else above; aligned with its left edge and kept inside the viewport.
function place(el) {
  const t = triggerOf(el);
  const box = el.shadowRoot && el.shadowRoot.querySelector('.box');
  if (!t || !box) return;
  const r = t.getBoundingClientRect();
  const w = box.offsetWidth, h = box.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = innerHeight, gap = 2;
  const below = r.bottom + gap + h <= vh || r.top - gap - h < 0;
  const top = below ? r.bottom + gap : r.top - gap - h;
  const left = Math.max(2, Math.min(vw - w - 2, r.left));
  Object.assign(box.style, { left: Math.round(left) + 'px', top: Math.round(Math.max(0, top)) + 'px' });
  el.setAttribute('data-side', below ? 'bottom' : 'top');
}

const press = key => (hand, io) => hand.press(io[key]);

function wire(el, t, signal) {
  t.addEventListener('click', ev => {
    ev.preventDefault();
    // The player presses whichever button the latch calls for: close while it is set, open otherwise.
    el.perform((hand, io) => hand.press(io.latch.on && !io.show.on ? io.show : io.close));
  }, { signal });
  document.addEventListener('pointerdown', ev => {
    const path = ev.composedPath();
    if (el.deployed && !path.includes(el) && !path.includes(t)) el.close();
  }, { signal, capture: true });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || !el.deployed) return;
    const inside = el.contains(document.activeElement) || document.activeElement === el || document.activeElement === t;
    el.close();
    if (inside) t.focus();
  }, { signal });
}

function sync(el) {
  const t = triggerOf(el);
  if (t) t.setAttribute('aria-expanded', String(!!el.open));
  if (el.deployed) place(el);
}

const reposition = () => document.querySelectorAll('rs-popover[data-deployed]').forEach(place);
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', reposition, { capture: true, passive: true });
  window.addEventListener('resize', reposition);
}

Redstone.ui.define('rs-popover', {
  entry: 'ui-popover',
  params: {
    open: { attr: 'open', type: 'boolean', doc: 'Start open. After that the attribute mirrors the door.' },
    cols: (el, ctx) => size(el, ctx).cols,
    rows: (el, ctx) => size(el, ctx).rows,
    signs: () => 0,
  },
  opening: { cells: 'opening', shownWhen: 'open' },
  controls: [
    { io: 'close', act: 'press', role: 'button', label: 'Close', area: ['close', 'closeSign'] },
  ],
  host: {
    role: 'dialog',
    aria: { label: (state, el) => { const t = triggerOf(el); return t ? t.textContent.replace(/\s+/g, ' ').trim() || null : null; } },
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
    deployed: {
      read: (io, b) => !!io.show.on || !io.latch.on || !home(b),
      attr: 'data-deployed',
      doc: 'True while the popover is shown: from the open press until the latch is reset and the door is home.',
    },
  },
  changed: el => sync(el),
  mounted(el, view, built) {
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
    const m = mine(el);
    const t = triggerOf(el);
    if (t && m.trigger !== t) {
      if (m.off) m.off.abort();
      m.off = new AbortController();
      m.trigger = t;
      wire(el, t, m.off.signal);
    }
    if (t) {
      if (!el.id) el.id = 'rs-popover-' + (++seq);
      t.setAttribute('aria-controls', el.id);
    }
    sync(el);
    if (el.deployed) requestAnimationFrame(() => place(el));
  },
  methods: {
    show() { this.perform(press('show')); },
    close() { this.perform(press('close')); },
    toggle() { this.perform((hand, io) => hand.press(io.latch.on && !io.show.on ? io.show : io.close)); },
    disconnectedCallback() {
      Redstone.ui.Element.prototype.disconnectedCallback.call(this);
      const m = mine(this);
      if (m.off) m.off.abort();
      m.trigger = null;
    },
  },
  observe: ['for'],
  styles: STYLES,
  docs: {
    attributes: { for: 'The id of the trigger (default: the previous element).' },
    properties: { 'show()': 'Press the open button.', 'close()': 'Press the close button.', 'toggle()': 'Press whichever the latch calls for.' },
  },
});
})();
