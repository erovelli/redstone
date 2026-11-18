// <rs-pagination>: page navigation. The player turns the page of a book on a lectern; a comparator reads it and
// the lamps up to the open page light. `page` and `change` follow the comparator, not the click.
//
//   <rs-pagination pages="7" page="3" href="?page={page}"></rs-pagination>
//
// Previous and next turn the page by one, each page's lamp column turns straight to it. With `href`, the page
// follows the link (with {page} filled in) once the comparator shows the new page, unless `change` is cancelled.
// Up to 15 pages: a lectern's comparator reads 1 to 15, one level per page. Light-DOM children (for example plain
// links for readers without the script) show only until the element upgrades.
(function () {
const MAX = 15;
const P = () => (typeof module !== 'undefined' ? require('../../contraptions/ui/pagination.js') : window.RSPagination);
const total = el => Math.max(2, Math.min(MAX, Math.round(Number(el && el.getAttribute('pages')) || 5)));
const turn = d => (hand, io) => hand.page(io.lectern, Math.max(0, Math.min(io.lectern.pages - 1, (io.lectern.page || 0) + d)));

// Page numbers under each page's lamp column, as page text beside the machine (aria-hidden: the controls carry it).
function mounted(el, view, built) {
  const box = el.shadowRoot.querySelector('.box');
  box.querySelectorAll('.rs-pg-num').forEach(n => n.remove());
  const put = (block, text) => {
    const r = view.rectOf(block, 'front');
    const s = document.createElement('span');
    s.className = 'rs-pg-num';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = text;
    Object.assign(s.style, { left: r.x + 'px', width: r.w + 'px' });
    box.appendChild(s);
  };
  built.io.lamps.forEach((lamp, k) => put(lamp, String(k + 1)));
  put(built.io.lectern, '‹');
  put(built.io.comparator, '›');
}

const controls = [
  { io: 'lectern', act: turn(-1), label: 'Previous page', keys: { ArrowLeft: turn(-1), ArrowRight: turn(1), Home: turn(-MAX), End: turn(MAX) } },
  { io: 'comparator', act: turn(1), label: 'Next page', primary: true, keys: { ArrowLeft: turn(-1), ArrowRight: turn(1), Home: turn(-MAX), End: turn(MAX) } },
];
for (let k = 0; k < MAX; k++) {
  controls.push({
    io: 'lamp' + k,
    act: (hand, io) => hand.page(io.lectern, k),
    label: el => `Page ${k + 1}`,
    aria: { current: s => (s.page === k + 1 ? 'page' : 'false') },
  });
}

Redstone.ui.define('rs-pagination', {
  entry: 'ui-pagination',
  params: {
    pages: { attr: 'pages', type: 'number', doc: 'Number of pages, 2 to 15 (the book on the lectern).' },
    page: { attr: 'page', type: 'number', doc: 'The page the book starts open at (1-based); after that it mirrors the comparator.' },
  },
  controls,
  host: { role: 'navigation', aria: { label: (s, el) => el.getAttribute('aria-label') || 'Pagination' } },
  state: {
    page: {
      read: (io, built) => P().pageOf(built) + 1,
      attr: 'page',
      type: 'number',
      event: 'change',
      cancelable: true,
      set: (hand, io, v) => hand.page(io.lectern, Math.max(0, Math.min(io.lectern.pages - 1, Math.round(v) - 1))),
      announce: (v, el) => `Page ${v} of ${total(el)}`,
      doc: 'The open page (1-based) as the comparator reads it. Setting it turns the lectern to that page.',
      eventDoc: 'Cancelable; detail.value is the page. With href, the page then follows the link.',
    },
  },
  changed(el, change) {
    const href = el.getAttribute('href');
    if (change.key !== 'page' || !href || change.value < 1) return;
    const ev = change.dispatched[0];
    if (!ev || !ev.defaultPrevented) location.href = href.replace(/\{page\}/g, String(change.value));
  },
  mounted,
  observe: ['href'],
  styles: `
    :host { padding-bottom: 1.5em; }
    .rs-pg-num { position: absolute; top: 100%; text-align: center; line-height: 1.5; font: 500 12px/1.5 var(--rs-sign-font, ui-monospace, Menlo, Consolas, monospace); }`,
  docs: {
    attributes: {
      href: 'Optional link pattern; {page} is replaced by the page number. Followed after the comparator shows the new page.',
      'aria-label': 'Name of the navigation landmark (default "Pagination").',
    },
  },
});
})();
