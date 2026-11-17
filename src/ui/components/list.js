// <rs-list>: a bulleted list. A column of stone with a redstone torch beside the first line of each item; the items
// are ordinary page text beside it. `ordered` turns each bullet into repeaters whose delays add up to its number.
//
//   <rs-list><li>Dust</li><li>Torches</li></rs-list>       <rs-list ordered><ol><li>One</li><li>Two</li></ol></rs-list>
//
// The items sit on a line height of two blocks, so a bullet row lines up with each first line. Bullet rows are
// measured from the laid-out items and measured again whenever the list's size changes, so the column reflows.
(function () {
const STYLES = `
  :host, :host([data-rs-beside]) { display: flex; align-items: flex-start; --rs-block: 12px; }
  .caption { flex: 1 1 auto; min-width: 0; cursor: auto; user-select: text; line-height: calc(var(--b, 12px) * 2);
    padding-top: calc(var(--t, 9px) - var(--b, 12px) / 2); }
  /* A wall torch's flame sits high in its cell: unordered text rides a little higher to meet it. */
  :host(:not([ordered])) .caption { padding-top: calc(var(--t, 9px) - var(--b, 12px) * .7); }
  ::slotted(ul), ::slotted(ol) { margin: 0; padding: 0; list-style: none; }
  ::slotted(li) { list-style: none; }
`;
const watching = new WeakMap();   // element -> its ResizeObserver on the items

function itemsOf(el) {
  const out = [];
  for (const c of el.children) {
    if (c.localName === 'li') out.push(c);
    else if (c.localName === 'ul' || c.localName === 'ol') for (const li of c.children) if (li.localName === 'li') out.push(li);
  }
  return out;
}

// The block row beside each item's first line, and the column height in rows. Row j's front face spans
// T + j B to T + (j + 1) B below the top of the machine, which is level with the top of the items.
function measure(el, ctx) {
  const box = el && el.shadowRoot && el.shadowRoot.querySelector('.box');
  const cap = box && el.shadowRoot.querySelector('.caption');
  if (!cap || !el.isConnected) return null;
  const B = ctx.B, T = Math.max(2, Math.round(B * 0.72));
  const top = box.getBoundingClientRect().top;
  const rows = itemsOf(el).map(li => {
    const cs = getComputedStyle(li);
    const line = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.2;
    const mid = li.getBoundingClientRect().top - top + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0) + line / 2;
    return Math.max(0, Math.floor((mid - T) / B));
  });
  const height = Math.max(1, Math.ceil((cap.getBoundingClientRect().bottom - top - T) / B));
  return { rows: rows.join(','), height };
}

Redstone.ui.define('rs-list', {
  entry: 'ui-list',
  params: {
    ordered: { attr: 'ordered', type: 'boolean', doc: 'Bullets are repeaters whose delays add up to the item number.' },
    rows: (el, ctx) => { const m = measure(el, ctx); return m ? m.rows : undefined; },
    height: (el, ctx) => { const m = measure(el, ctx); return m ? m.height : undefined; },
  },
  label: 'beside',
  // Direct <li> children make the element itself the list; a wrapped <ul> or <ol> is the list already.
  host: { role: el => (el.querySelector(':scope > li') ? 'list' : null) },
  styles: STYLES,
  mounted(el) {
    // Item heights change with the text, images and fonts as well as the width: measure again (a rebuild happens
    // only if a bullet row or the height changed).
    if (typeof ResizeObserver === 'undefined') return;
    if (watching.get(el)) watching.get(el).disconnect();
    const ro = new ResizeObserver(() => { if (el.isConnected) el.refresh(); });
    ro.observe(el.shadowRoot.querySelector('.caption'));
    itemsOf(el).forEach(li => ro.observe(li));
    watching.set(el, ro);
  },
});
})();
