// <rs-card>: a panel. A block frame round an opening; the content is the HTML seen through it. A header (slot="header"
// or the heading attribute) is written on signs hung on the top of the frame; `lamp` adds a corner lamp whose lever
// the `on` attribute flips.
//
//   <rs-card frame="planks" heading="Storage"><p>Twelve chests.</p></rs-card>
//   <rs-card lamp on><span slot="header">Smelter</span><p>Running.</p></rs-card>
//
// The frame fills the element's width (as a block box does) and is as tall as the content needs at that width;
// it is measured again when the element, the container or the content changes size.
(function () {
const STYLES = `
  :host { display: block; min-width: 0; flex: 1 1 16em; --rs-block: 24px; }
  .window { padding: .6em .8em; box-sizing: border-box; background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
`;
const PAD_EM = 1.6;
const watching = new WeakMap();

const headerText = el => {
  if (!el) return '';
  const slotted = el.querySelector(':scope > [slot="header"]');
  return (slotted ? slotted.textContent : el.getAttribute('heading') || '').replace(/\s+/g, ' ').trim();
};
const content = el => [...el.childNodes].filter(n => !(n.nodeType === 1 && n.getAttribute('slot')));

// Columns: the element's width in blocks, less the two frame columns (at most `columns`).
function colsFor(el, ctx) {
  if (!el || !el.isConnected) return 8;
  const width = el.getBoundingClientRect().width || (el.parentElement ? el.parentElement.clientWidth : 0);
  const want = Number(el.getAttribute('columns')) || 60;
  return Math.max(1, Math.min(60, want, Math.floor(width / ctx.B) - 2));
}

// Rows: the content laid out at the opening's width in an off-screen copy next to the element (so page CSS applies).
function rowsFor(el, ctx) {
  if (!el || !el.parentNode) return 3;
  const font = parseFloat(getComputedStyle(el).fontSize) || 16;
  const probe = document.createElement('div');
  Object.assign(probe.style, {
    position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', display: 'flow-root', lineHeight: 'normal',
    width: Math.max(1, colsFor(el, ctx) * ctx.B - PAD_EM * font) + 'px', padding: '.6em 0',
  });
  probe.setAttribute('aria-hidden', 'true');
  for (const n of content(el)) {
    const copy = n.cloneNode(true);
    if (copy.nodeType === 1) {
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    }
    probe.appendChild(copy);
  }
  el.parentNode.insertBefore(probe, el.nextSibling);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.max(1, Math.min(60, Math.ceil((h - 1) / ctx.B)));
}

Redstone.ui.define('rs-card', {
  entry: 'ui-card',
  params: {
    frame: { attr: 'frame', doc: 'The frame block: bricks (stone bricks), planks, quartz, smooth_stone, stone or obsidian.' },
    lamp: { attr: 'lamp', type: 'boolean', doc: 'A redstone lamp in the top-right corner, with a lever on its face.' },
    on: { attr: 'on', type: 'boolean', doc: 'With lamp: the lever starts on. After that the attribute mirrors the lamp.' },
    cols: colsFor,
    rows: rowsFor,
    signs: (el, ctx) => (headerText(el) ? ctx.signsFor(headerText(el), { min: 1, max: colsFor(el, ctx) }) : 0),
  },
  label: 'signs',
  labelSlot: 'header',
  labelFallback: el => el.getAttribute('heading') || '',
  readLabel: true,
  opening: { cells: 'opening', shownWhen: 'clear' },
  host: {
    role: el => (headerText(el) ? 'group' : null),
    aria: {
      label: (state, el) => headerText(el) || null,
      description: (state, el) => (el.hasAttribute('lamp') ? `Lamp ${state.on ? 'on' : 'off'}` : null),
    },
  },
  state: {
    clear: {
      read: (io, b) => b.opening.every(([x, y, z]) => !b.world.get(x, y, z)),
      doc: 'True while the opening is clear (always: nothing in the frame moves).',
    },
    on: {
      read: io => !!(io.lamp && io.lamp.lit),
      attr: 'on',
      set: (hand, io, value) => {
        if (io.lever && !!io.lever.on !== value) hand.flip(io.lever);
      },
      doc: 'With lamp: true while the lamp is lit. Setting it (or the attribute) flips the lever.',
    },
  },
  mounted(el) {
    // With a header the core raises the block to its sign size (36 px, SPEC I3); refresh when that changes.
    const header = !!headerText(el);
    if (el.hasAttribute('data-rs-header') !== header) {
      el.toggleAttribute('data-rs-header', header);
      queueMicrotask(() => el.refresh());
    }
    // Content that changes size on its own (an image loading, text edited) is measured again.
    if (typeof ResizeObserver === 'undefined') return;
    if (watching.get(el)) watching.get(el).disconnect();
    const ro = new ResizeObserver(() => { if (el.isConnected) el.refresh(); });
    content(el).filter(n => n.nodeType === 1).forEach(n => ro.observe(n));
    ro.observe(el);
    watching.set(el, ro);
  },
  observe: ['heading', 'columns'],
  styles: STYLES,
  docs: {
    attributes: {
      heading: 'The header on the signs (or a child with slot="header"). Also the card\'s accessible name.',
      columns: 'At most this many columns of opening (default: as many as fit).',
    },
  },
});
})();
