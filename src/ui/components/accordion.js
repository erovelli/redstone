// <rs-accordion>: a group of disclosures where opening one closes the others, like <details name>. Each item's
// header is a stone button into one latch bank (rs-tabs' selector with a "none" band); the open item's body shows
// through the opening below the list. Each <details> child keeps `open` and its native `toggle`, set from the
// opening; clicking the open item's header presses the none button and closes it.
//
//   <rs-accordion>
//     <details><summary>Shipping</summary><p>Two days.</p></details>
//     <details open><summary>Returns</summary><p>Thirty days.</p></details>
//   </rs-accordion>
//
// Without the script the children are ordinary <details> (give them one `name` for native exclusivity).
(function () {
const MAX = 5;
const PAD_EM = 1.4;
const A = () => (typeof module !== 'undefined' ? require('../../contraptions/ui/accordion.js') : window.RSAccordion);
const T = () => (typeof module !== 'undefined' ? require('../../contraptions/ui/tabs.js') : window.RSTabs);

const items = el => (el ? [...el.children].filter(c => c.localName === 'details').slice(0, MAX) : []);
const labelOf = (d, k) => {
  const s = d && d.querySelector(':scope > summary');
  return (s ? s.textContent : `Item ${k + 1}`).replace(/\s+/g, ' ').trim();
};
const labelsOf = el => items(el).map(labelOf);
const valueOf = (d, k) => (d.id || labelOf(d, k));
const valuesOf = el => items(el).map(valueOf);
const closeLabel = el => (el && el.getAttribute('close-label')) || 'Close';
const watched = new WeakSet();

function colsFor(el, ctx) {
  const parent = el && el.parentElement;
  if (!parent) return 8;
  const cs = getComputedStyle(parent);
  const avail = parent.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  return Math.max(1, Math.min(14, Math.floor(avail / ctx.B) - 2));
}

// Opening rows: the tallest body (open, without its summary) at the opening's width, off-screen.
function rowsFor(el, ctx) {
  if (!el || !el.parentNode) return 3;
  const font = parseFloat(getComputedStyle(el).fontSize) || 16;
  const width = Math.max(1, colsFor(el, ctx) * ctx.B - PAD_EM * font);
  let h = 0;
  for (const d of items(el)) {
    const probe = document.createElement('div');
    for (const n of d.childNodes) if (n.localName !== 'summary') probe.appendChild(n.cloneNode(true));
    probe.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', display: 'flow-root', width: width + 'px', padding: '.4em 0' });
    el.parentNode.insertBefore(probe, el.nextSibling);
    h = Math.max(h, probe.getBoundingClientRect().height);
    probe.remove();
  }
  return Math.max(1, Math.min(12, Math.ceil((h - 1) / ctx.B)));
}

// Each <details> mirrors the contraption: open only while its body shows (its native toggle fires then).
function mirror(el, k, open) {
  const d = items(el)[k];
  if (d && d.open !== open) d.open = open;
}
const sync = (el, open) => items(el).forEach((d, k) => mirror(el, k, k === open));

// Page code that sets details.open asks for it: press that item's button (or none). With a shared `name` the
// browser also closes the open one; that close is ignored while another item is asking to open.
function onToggle(el, d) {
  const k = items(el).indexOf(d), open = el.open;
  if (k < 0 || !el.contraption) return;
  if (d.open && open !== k) el.perform((hand, io, built) => T().pressBand(hand, io, built, k));
  else if (!d.open && open === k && !items(el).some((o, j) => j !== k && o.open)) el.perform((hand, io, built) => T().pressBand(hand, io, built, built.items));
}

function label(box, view, signs, text) {
  if (!signs || !signs.length) return;
  const a = view.rectOf(signs[0], 'front'), b = view.rectOf(signs[signs.length - 1], 'front');
  const div = document.createElement('div');
  div.className = 'rs-acc-label';
  div.setAttribute('aria-hidden', 'true');
  div.textContent = text;
  Object.assign(div.style, { left: a.x + 'px', top: a.y + 'px', width: b.x + b.w - a.x + 'px', height: a.h + 'px' });
  box.appendChild(div);
}

function mounted(el, view, built) {
  items(el).forEach((d, k) => {
    d.slot = `rs-panel-${k}`;
    if (!watched.has(d)) {
      watched.add(d);
      d.addEventListener('toggle', () => onToggle(el, d));
    }
  });
  sync(el, A().openItem(built));
  const box = el.shadowRoot.querySelector('.box');
  box.querySelectorAll('.rs-acc-label').forEach(n => n.remove());
  labelsOf(el).forEach((text, k) => label(box, view, built.io['label' + k], text));
  label(box, view, built.io.noneLabel, closeLabel(el));
}

const controls = [];
for (let k = 0; k < MAX; k++) {
  controls.push({
    io: 'b' + k,
    act: (hand, io, built) => A().pressHeader(hand, io, built, k),
    area: ['row' + k, 'label' + k],
    label: el => labelsOf(el)[k] || '',
    // aria-expanded and the item's own open attribute both mirror the output (called after every change).
    aria: { expanded: (s, el) => { mirror(el, k, s.open === k); return s.open === k; } },
    primary: k === 0,
  });
}
controls.push({
  io: 'none',
  act: (hand, io, built) => T().pressBand(hand, io, built, built.items),
  area: ['noneRow', 'noneLabel'],
  label: el => `${closeLabel(el)} all`,
});

const state = {
  open: {
    read: (io, built) => A().openItem(built),
    doc: 'Index of the open item (-1 for none). Changes when its body is clear, or when the curtain is home again.',
  },
  value: {
    read: (io, built) => (built.values || [])[A().openItem(built)] || '',
    attr: 'value',
    type: 'string',
    event: 'change',
    set: (hand, io, value, built) => {
      const k = (built.values || []).indexOf(value);
      return T().pressBand(hand, io, built, k >= 0 ? k : built.items);
    },
    announce: (v, el) => (v ? `${labelsOf(el)[valuesOf(el).indexOf(v)] || v} expanded` : 'Collapsed'),
    doc: 'The open item\'s id (or summary text), "" for none. Setting it presses that item\'s button ("" presses none).',
  },
};
const opening = [];
for (let k = 0; k < MAX; k++) {
  state['shown' + k] = { read: (io, built) => T().isClear(built) && A().openItem(built) === k, doc: `True while item ${k}'s body shows through the clear opening.` };
  opening.push({ cells: 'opening', shownWhen: 'shown' + k, slot: `rs-panel-${k}` });
}

Redstone.ui.define('rs-accordion', {
  entry: 'ui-accordion',
  minBlock: 30,
  params: {
    items: (el, ctx) => Math.max(2, Math.min(MAX, items(ctx.el).length)),
    values: (el, ctx) => valuesOf(ctx.el),
    sel: (el, ctx) => items(ctx.el).findIndex(d => d.open),
    signs: (el, ctx) => labelsOf(ctx.el).map(t => ctx.signsFor(t, { min: 2, max: 5 })),
    cols: (el, ctx) => colsFor(ctx.el, ctx),
    rows: (el, ctx) => rowsFor(ctx.el, ctx),
  },
  controls,
  opening,
  state,
  mounted,
  observe: ['close-label'],
  styles: `
    :host { display: block; }
    .window { padding: .4em .7em; box-sizing: border-box; background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
    .rs-acc-label { position: absolute; z-index: 2; display: flex; align-items: center; justify-content: center; overflow: hidden;
      white-space: nowrap; pointer-events: none; color: var(--rs-sign-ink, #1b120a);
      font: var(--rs-sign-text); }`,
  docs: {
    attributes: {
      '(children)': 'Two to five <details> elements; each <summary> goes on its header signs. Each details keeps open and fires its native toggle when its body shows or hides.',
      'close-label': 'Text on the none button\'s signs (default "Close").',
    },
  },
});
})();
