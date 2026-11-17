// <rs-collapse>: a disclosure, like <details>. The lever is the bullet; flipping it turns off a torch and the
// pistons pull the curtain back into the wall. `open` and `toggle` follow the opening, not the click.
//
//   <rs-collapse summary="Shipping"><p>Ships in two days.</p></rs-collapse>
//   <rs-collapse open><span slot="summary">Returns</span><p>Thirty days.</p></rs-collapse>
//
// The opening is sized from the body: as many columns as the available width allows (up to 15) and as many rows
// as the body needs at that width (up to 12; a longer body scrolls inside the opening). It is measured again on
// resize. While the lever is off and the curtain is home, only the top two rows are laid out; flipping the lever
// adds the curtain rows to the element's height at once (the page below moves down), and they leave the layout
// again once the curtain is back home.
(function () {
const STYLES = `
  :host { display: block; --rs-block: 32px; }
  :host(:not([data-deployed]):not([inspect])) .box { height: calc(var(--b) * 4.16 - 1px) !important; overflow: hidden; }
  .window { padding: .4em .7em; box-sizing: border-box; background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
`;
const PAD_EM = 1.4;      // the window's horizontal padding, in em
const FRAME_COLS = 2;

function summaryText(el) {
  if (!el) return '';
  const slotted = el.querySelector(':scope > [slot="summary"]');
  const t = slotted ? slotted.textContent : el.getAttribute('summary') || 'Details';
  return t.replace(/\s+/g, ' ').trim();
}

// Columns: the available width in blocks, less the two frame columns.
function colsFor(el, ctx) {
  const parent = el && el.parentElement;
  if (!parent) return 8;
  const cs = getComputedStyle(parent);
  const avail = parent.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const want = Number(el.getAttribute('columns')) || 15;
  return Math.max(1, Math.min(15, want, Math.floor(avail / ctx.B) - FRAME_COLS));
}

// Rows: the body laid out at the opening's width, in an off-screen copy next to the element (so page CSS applies).
function rowsFor(el, ctx) {
  if (!el || !el.parentNode) return 3;
  const cols = colsFor(el, ctx);
  const probe = document.createElement('div');
  const font = parseFloat(getComputedStyle(el).fontSize) || 16;
  Object.assign(probe.style, {
    position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', display: 'flow-root',
    width: Math.max(1, cols * ctx.B - PAD_EM * font) + 'px', padding: '.4em 0', lineHeight: 'normal',
  });
  probe.setAttribute('aria-hidden', 'true');
  for (const n of el.childNodes) {
    if (n.nodeType === 1 && n.getAttribute('slot')) continue;
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
  return Math.max(1, Math.min(12, Math.ceil((h - 1) / ctx.B)));
}

Redstone.ui.define('rs-collapse', {
  entry: 'ui-collapse',
  params: {
    open: { attr: 'open', type: 'boolean', doc: 'Start open. After that the attribute mirrors the opening.' },
    cols: colsFor,
    rows: rowsFor,
    signs: (el, ctx) => ctx.signsFor(summaryText(el), { min: 1, max: Math.min(4, colsFor(el, ctx)) }),
  },
  label: 'signs',
  labelSlot: 'summary',
  labelFallback: summaryText,
  opening: { cells: 'opening', shownWhen: 'open' },
  controls: [
    { io: 'lever', act: 'flip', role: 'button', area: ['lever', 'signs'], label: summaryText, aria: { expanded: 'open' } },
  ],
  state: {
    open: {
      read: (io, b) => b.opening.every(([x, y, z]) => !b.world.get(x, y, z)),
      attr: 'open',
      event: 'toggle',
      set: (hand, io, value) => {
        if (!!io.lever.on !== value) hand.flip(io.lever);
      },
      announce: (open, el) => `${summaryText(el)} ${open ? 'expanded' : 'collapsed'}`,
      doc: 'True while the opening is clear. Setting it flips the lever; the world then settles.',
    },
    deployed: {
      read: (io, b) => !!io.lever.on || !b.opening.every(([x, y, z]) => b.world.get(x, y, z)),
      attr: 'data-deployed',
      doc: 'True while the curtain rows are laid out: from the flip on until the curtain is home again.',
    },
  },
  observe: ['summary', 'columns'],
  styles: STYLES,
  docs: {
    attributes: {
      summary: 'The label on the signs (or a child with slot="summary").',
      columns: 'At most this many columns of opening (default: as many as fit, up to 15).',
    },
  },
});
})();
