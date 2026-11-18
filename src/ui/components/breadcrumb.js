// <rs-breadcrumb>: where you are. Each crumb's link sits on oak signs under a trail of dust and repeaters; as the
// page loads the element flips the lever at the root and the signal walks out one crumb at a time, stopping at the
// current page (the last child, marked aria-current="page").
//
//   <rs-breadcrumb><a href="/">Home</a><a href="/docs">Docs</a><span>Tabs</span></rs-breadcrumb>
//
// The links are the controls, as in rs-navbar: ordinary links over the signs. Without the script they read as a
// row of links (breadcrumb.css).
(function () {
const MAX = 6;
const crumbs = el => (el ? [...el.children].slice(0, MAX) : []);
const texts = el => crumbs(el).map(c => c.textContent.replace(/\s+/g, ' ').trim());

function mounted(el, view, built) {
  const box = el.shadowRoot.querySelector('.box');
  box.querySelectorAll('.rs-crumb').forEach(n => n.remove());
  const list = crumbs(el);
  list.forEach((c, k) => {
    const signs = built.io['crumb' + k];
    if (!signs) return;
    const a = view.rectOf(signs[0], 'front'), b = view.rectOf(signs[signs.length - 1], 'front');
    const cell = document.createElement('div');
    cell.className = 'rs-crumb';
    Object.assign(cell.style, { left: a.x + 'px', top: a.y + 'px', width: b.x + b.w - a.x + 'px', height: a.h + 'px' });
    cell.innerHTML = `<slot name="rs-crumb-${k}"></slot>`;
    box.appendChild(cell);
    c.slot = `rs-crumb-${k}`;
    if (k === list.length - 1) c.setAttribute('aria-current', 'page');
  });
  // The page's one player action: flip the lever at the root, so the signal walks out to the current page.
  if (!built.io.lever.on) queueMicrotask(() => el.perform((hand, io) => !io.lever.on && hand.flip(io.lever)));
}

Redstone.ui.define('rs-breadcrumb', {
  entry: 'ui-breadcrumb',
  minBlock: 30,
  params: {
    crumbs: (el, ctx) => Math.max(1, crumbs(ctx.el).length),
    signs: (el, ctx) => texts(ctx.el).map(t => ctx.signsFor(t, { min: 1, max: 5 })),
  },
  controls: [],
  host: { role: 'navigation', aria: { label: (s, el) => el.getAttribute('aria-label') || 'Breadcrumb' } },
  state: {
    arrived: {
      read: io => !!io.lamp.lit,
      attr: 'data-arrived',
      doc: 'True once the signal has walked out to the current page.',
    },
  },
  mounted,
  styles: `
    :host { display: block; --rs-block: 32px; overflow-x: auto; overflow-y: hidden; }
    .rs-crumb { position: absolute; z-index: 3; display: flex; align-items: center; justify-content: center; line-height: normal; }
    ::slotted(*) { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    ::slotted(a:focus-visible) { outline: 2px dashed var(--rs-focus, currentColor); outline-offset: 3px; }`,
  docs: {
    attributes: { '(children)': 'Up to six crumbs: links, then the current page (any element). Each goes on 1 to 5 oak signs.' },
  },
});
})();
