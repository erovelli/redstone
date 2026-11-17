// <rs-spoiler>: hidden content behind a curtain. Pointing at it, focusing it or tapping it stands on the pressure
// plate; the curtain is pulled back. Leaving steps off; the curtain returns after the plate's real release delay.
//
//   <rs-spoiler>Snape kills Dumbledore.</rs-spoiler>
//
// The opening is sized from the content: its natural width (up to the available width and 15 columns), then as
// many rows as it needs at that width (up to 12; more scrolls).
(function () {
const STYLES = `
  :host { --rs-block: 20px; }
  .window { padding: 0 .5em; box-sizing: border-box;
    background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
`;
const PAD_EM = 1;

// Lay the content out off-screen next to the element, at `width` px (or its natural width), and return its size.
function probe(el, width) {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', display: 'flow-root', lineHeight: 'normal',
    width: width ? width + 'px' : 'max-content',
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

function size(el, ctx) {
  if (!el || !el.parentNode) return { cols: 6, rows: 1 };
  const parent = el.parentElement;
  const cs = getComputedStyle(parent);
  const avail = parent.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const font = parseFloat(getComputedStyle(el).fontSize) || 16;
  const maxCols = Math.max(1, Math.min(15, Math.floor(avail / ctx.B) - 2));
  const natural = probe(el, 0).width + PAD_EM * font;
  const cols = Math.max(1, Math.min(maxCols, Math.ceil(natural / ctx.B)));
  const h = probe(el, cols * ctx.B - PAD_EM * font).height;
  return { cols, rows: Math.max(1, Math.min(12, Math.ceil((h - 1) / ctx.B))) };
}

const step = on => (hand, io) => hand.step(io.plate, on);

Redstone.ui.define('rs-spoiler', {
  entry: 'ui-spoiler',
  params: {
    cols: (el, ctx) => size(el, ctx).cols,
    rows: (el, ctx) => size(el, ctx).rows,
  },
  opening: { cells: 'opening', shownWhen: 'open' },
  controls: [
    {
      io: 'plate', act: step(true), role: 'button', area: ['plate'],
      label: el => el.getAttribute('aria-label') || 'Spoiler: point at it or focus it to reveal',
      aria: { expanded: 'open' },
      hover: { enter: step(true), leave: step(false) },
    },
  ],
  state: {
    open: {
      read: (io, b) => b.opening.every(([x, y, z]) => !b.world.get(x, y, z)),
      attr: 'open',
      event: 'toggle',
      set: (hand, io, value) => hand.step(io.plate, value),
      announce: (open, el) => (open ? el.textContent.replace(/\s+/g, ' ').trim() : 'Spoiler hidden'),
      doc: 'True while the opening is clear. Setting it stands on (true) or steps off (false) the plate; the world then settles.',
    },
  },
  styles: STYLES,
});
})();
