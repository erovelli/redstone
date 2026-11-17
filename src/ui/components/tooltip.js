// <rs-tooltip>: a tip on oak signs behind a honey curtain. Pointing at the target or focusing it stands on the
// pressure plate; the piston pulls the curtain down past the signs. Leaving (or Escape) steps off; the curtain comes
// back once the plate releases. `open` and `toggle` follow the signs being uncovered.
//
//   <button id="save">Save</button> <rs-tooltip for="save">Saves the file</rs-tooltip>
//   <rs-tooltip tip="Saves the file"><button>Save</button></rs-tooltip>       (wrapping its target)
//
// With `for`, the element's text is the tip; without it, the element wraps its target and the tip is the `tip`
// attribute (or a child with slot="tip"). The machine floats next to the target (above it, or below when there is
// no room), kept on screen, only while it is in use.
(function () {
const STYLES = `
  :host { --rs-block: 30px; line-height: normal; vertical-align: baseline; }
  :host([for]) { position: fixed; left: 0; top: 0; width: 1px; height: 1px; }
  .box { position: fixed; left: 0; top: 0; z-index: 2147482500; }
  :host(:not([data-deployed])) .box { visibility: hidden; }
  :host(:not([open])) .label { visibility: hidden; }
`;
const own = new WeakMap();
const mine = el => own.get(el) || own.set(el, {}).get(el);
let seq = 0;

const wraps = el => !el.hasAttribute('for');
const targetOf = el => (wraps(el) ? el.firstElementChild && el.firstElementChild.getAttribute('slot') !== 'tip' ? el.firstElementChild : el : document.getElementById(el.getAttribute('for')));
const tipText = el => {
  if (!el) return '';
  const slotted = el.querySelector(':scope > [slot="tip"]');
  const t = slotted ? slotted.textContent : wraps(el) ? el.getAttribute('tip') || '' : el.textContent;
  return t.replace(/\s+/g, ' ').trim();
};

// Next to the target: above it if there is room, else below; centred on it and kept inside the viewport.
function place(el) {
  const target = targetOf(el);
  const box = el.shadowRoot && el.shadowRoot.querySelector('.box');
  if (!target || !box) return;
  const r = target.getBoundingClientRect();
  const w = box.offsetWidth, h = box.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = innerHeight, gap = 2;
  const above = r.top - h - gap >= 0 || r.bottom + gap + h > vh;
  const top = above ? r.top - h - gap : r.bottom + gap;
  const left = Math.max(2, Math.min(vw - w - 2, r.left + r.width / 2 - w / 2));
  Object.assign(box.style, { left: Math.round(left) + 'px', top: Math.round(Math.max(0, top)) + 'px' });
  el.setAttribute('data-side', above ? 'top' : 'bottom');
}

const stand = (el, on) => el.perform((hand, io) => hand.step(io.plate, on));

// The target (and the tip itself, so it can be pointed at) stands on the plate while pointed at or focused.
function wire(el, target, signal) {
  const m = mine(el);
  const over = new Set();
  const update = () => stand(el, over.size > 0 && !m.dismissed);
  const on = (node, key) => {
    node.addEventListener('pointerenter', ev => { if (ev.pointerType !== 'touch') { over.add(key); update(); } }, { signal });
    node.addEventListener('pointerleave', () => { over.delete(key); m.dismissed = false; update(); }, { signal });
  };
  on(target, 'target');
  if (target !== el) on(el, 'tip');
  target.addEventListener('focusin', () => { over.add('focus'); update(); }, { signal });
  target.addEventListener('focusout', () => { over.delete('focus'); m.dismissed = false; update(); }, { signal });
  target.addEventListener('pointerdown', ev => { if (ev.pointerType === 'touch') { over.add('touch'); update(); } }, { signal });
  document.addEventListener('pointerdown', ev => { if (!target.contains(ev.target)) { over.delete('touch'); update(); } }, { signal, capture: true });
  // Escape dismisses the tip until the pointer or focus leaves the target (WCAG 1.4.13).
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && el.deployed) { m.dismissed = true; update(); } }, { signal });
}

// With `for`, the target is described by the element (role tooltip). Wrapping, the element also holds the target,
// so the target gets the tip text as its aria-description instead.
function describe(el, target) {
  if (wraps(el)) {
    target.setAttribute('aria-description', tipText(el));
    return;
  }
  if (!el.id) el.id = 'rs-tip-' + (++seq);
  const ids = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  if (!ids.includes(el.id)) target.setAttribute('aria-describedby', ids.concat(el.id).join(' '));
}

const reposition = () => document.querySelectorAll('rs-tooltip[data-deployed]').forEach(place);
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', reposition, { capture: true, passive: true });
  window.addEventListener('resize', reposition);
}

Redstone.ui.define('rs-tooltip', {
  entry: 'ui-tooltip',
  minBlock: 30,                                    // 0.4 of a block: the tip stays at 12 px or more
  params: {
    signs: (el, ctx) => ctx.signsFor(el ? tipText(el) : ctx.text, { min: 1, max: 12 }),
  },
  label: 'signs',
  labelSlot: 'tip',
  labelFallback: tipText,
  controls: [],
  host: { role: el => (wraps(el) ? null : 'tooltip') },
  state: {
    open: {
      read: (io, b) => b.front.every(([x, y, z]) => !b.world.get(x, y, z)),
      attr: 'open',
      event: 'toggle',
      set: (hand, io, value) => hand.step(io.plate, value),
      doc: 'True while the signs are uncovered. Setting it stands on (true) or steps off (false) the plate.',
    },
    deployed: {
      read: (io, b) => !!io.plate.on || !b.front.every(([x, y, z]) => { const k = b.world.get(x, y, z); return !!k && k.t === 'honey'; }),
      attr: 'data-deployed',
      doc: 'True while the tip is shown: from stepping on until the curtain is back.',
    },
  },
  changed: el => { if (el.deployed) place(el); },
  mounted(el) {
    const m = mine(el);
    // Wrapping: the target is the element's own child, laid out in the page as usual.
    if (wraps(el) && !el.shadowRoot.querySelector('.rs-target')) {
      const slot = document.createElement('slot');
      slot.className = 'rs-target';
      el.shadowRoot.appendChild(slot);
    }
    const target = targetOf(el);
    if (target && m.target !== target) {
      if (m.off) m.off.abort();
      m.off = new AbortController();
      m.target = target;
      wire(el, target, m.off.signal);
    }
    if (target && target !== el) describe(el, target);
    if (el.deployed) requestAnimationFrame(() => place(el));
  },
  methods: {
    disconnectedCallback() {
      Redstone.ui.Element.prototype.disconnectedCallback.call(this);
      const m = mine(this);
      if (m.off) m.off.abort();
      m.target = null;
    },
  },
  observe: ['tip', 'for'],
  styles: STYLES,
  docs: {
    attributes: {
      for: 'The id of the target. Without it, the element wraps its target (its first child).',
      tip: 'The tip, when the element wraps its target (or a child with slot="tip").',
    },
  },
});
})();
