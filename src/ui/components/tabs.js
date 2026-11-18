// <rs-tabs>: tabs. Each tab is a stone button into rs-radio's latch bank, its label on oak signs beside its lamp;
// the panel whose latch is on shows through one opening below, behind a shutter that closes while the latches
// change. `value`, `selected` and `change` follow the opening, not the click.
//
//   <rs-tabs>
//     <rs-tab label="Specs">...</rs-tab>
//     <rs-tab label="Reviews" selected>...</rs-tab>
//   </rs-tabs>
//
// Any child element with a `label` (or `data-label`) attribute is a panel, so <section data-label="..."> works too.
// Without the script the panels are ordinary blocks, each headed by its label (tabs.css).
(function () {
const MAX = 6;
const PAD_EM = 1.4;      // the window's horizontal padding, in em

const panels = el => (el ? [...el.children].filter(c => c.hasAttribute('label') || c.hasAttribute('data-label')).slice(0, MAX) : []);
const labelOf = (p, k) => (p && (p.getAttribute('label') || p.getAttribute('data-label')) || `Tab ${k + 1}`).replace(/\s+/g, ' ').trim();
const labelsOf = el => panels(el).map(labelOf);
const valueOf = (p, k) => (p.hasAttribute('value') ? p.getAttribute('value') : labelOf(p, k));
const valuesOf = el => panels(el).map(valueOf);
const RT = () => (typeof module !== 'undefined' ? require('../../contraptions/ui/tabs.js') : window.RSTabs);

// Opening columns: the available width in blocks, less the two frame columns.
function colsFor(el, ctx) {
  const parent = el && el.parentElement;
  if (!parent) return 8;
  const cs = getComputedStyle(parent);
  const avail = parent.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  return Math.max(1, Math.min(14, Math.floor(avail / ctx.B) - 2));
}

// Opening rows: the tallest panel laid out at the opening's width in an off-screen copy (page CSS applies).
function rowsFor(el, ctx) {
  if (!el || !el.parentNode) return 3;
  const font = parseFloat(getComputedStyle(el).fontSize) || 16;
  const width = Math.max(1, colsFor(el, ctx) * ctx.B - PAD_EM * font);
  let h = 0;
  for (const p of panels(el)) {
    const probe = p.cloneNode(true);
    probe.removeAttribute('slot');
    probe.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    probe.removeAttribute('id');
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', display: 'flow-root', width: width + 'px', padding: '.4em 0', boxSizing: 'content-box' });
    el.parentNode.insertBefore(probe, el.nextSibling);
    h = Math.max(h, probe.getBoundingClientRect().height);
    probe.remove();
  }
  return Math.max(1, Math.min(12, Math.ceil((h - 1) / ctx.B)));
}

// The initial tab: the value attribute, else the selected attribute (an index), else a panel marked selected.
function initial(el) {
  if (!el) return 0;
  const v = el.getAttribute('value');
  if (v !== null && valuesOf(el).includes(v)) return valuesOf(el).indexOf(v);
  const s = el.getAttribute('selected');
  if (s !== null && Number.isFinite(Number(s))) return Number(s);
  return Math.max(0, panels(el).findIndex(p => p.hasAttribute('selected')));
}

// After every mount: panels into their windows, and each label onto its signs.
function mounted(el, view, built) {
  const list = panels(el), labels = labelsOf(el);
  list.forEach((p, k) => {
    p.slot = `rs-panel-${k}`;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-label', labels[k]);
    if (!p.hasAttribute('tabindex')) p.tabIndex = 0;
  });
  const bar = el.shadowRoot.querySelector('.controls');
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-orientation', 'vertical');
  if (el.getAttribute('aria-label')) bar.setAttribute('aria-label', el.getAttribute('aria-label'));
  const box = el.shadowRoot.querySelector('.box');
  box.querySelectorAll('.rs-tab-label').forEach(n => n.remove());
  labels.forEach((text, k) => {
    const signs = built.io['label' + k];
    if (!signs || !signs.length) return;
    const a = view.rectOf(signs[0], 'front'), b = view.rectOf(signs[signs.length - 1], 'front');
    const div = document.createElement('div');
    div.className = 'rs-tab-label';
    div.setAttribute('aria-hidden', 'true');
    div.textContent = text;
    Object.assign(div.style, { left: a.x + 'px', top: a.y + 'px', width: b.x + b.w - a.x + 'px', height: a.h + 'px' });
    box.appendChild(div);
  });
}

const controls = [];
for (let k = 0; k < MAX; k++) {
  controls.push({
    io: 'b' + k,
    act: (hand, io, built) => RT().pressBand(hand, io, built, k),
    role: 'tab',
    area: ['row' + k, 'label' + k],
    label: el => labelsOf(el)[k] || '',
    aria: { selected: state => state.selected === k },
    primary: k === 0,
  });
}

const state = {
  selected: {
    read: (io, built) => RT().shownPanel(built),
    attr: 'selected',
    type: 'number',
    set: (hand, io, value, built) => RT().pressBand(hand, io, built, Math.round(Number(value))),
    doc: 'Index of the tab on show. Changes when the shutter clears on the new panel. Setting it presses that tab\'s button.',
  },
  value: {
    read: (io, built) => (built.values || [])[RT().shownPanel(built)] || '',
    attr: 'value',
    type: 'string',
    event: 'change',
    set: (hand, io, value, built) => RT().pressBand(hand, io, built, (built.values || []).indexOf(value)),
    announce: (v, el) => `${labelsOf(el)[valuesOf(el).indexOf(v)] || v} shown`,
    doc: 'The value (or label) of the tab on show. Setting it presses that tab\'s button.',
    eventDoc: 'Fired once the shutter has cleared on the new panel.',
  },
};
const opening = [];
for (let k = 0; k < MAX; k++) {
  state['shown' + k] = { read: (io, built) => RT().isClear(built) && RT().shownPanel(built) === k, doc: `True while panel ${k} shows through the clear opening.` };
  opening.push({ cells: 'opening', shownWhen: 'shown' + k, slot: `rs-panel-${k}` });
}

Redstone.ui.define('rs-tabs', {
  entry: 'ui-tabs',
  minBlock: 30,                                    // 0.4 of a block: sign text stays at 12 px or more
  params: {
    tabs: (el, ctx) => Math.max(2, Math.min(MAX, panels(ctx.el).length)),
    values: (el, ctx) => valuesOf(ctx.el),
    sel: (el, ctx) => initial(ctx.el),
    signs: (el, ctx) => labelsOf(ctx.el).map(t => ctx.signsFor(t, { min: 2, max: 5 })),
    cols: (el, ctx) => colsFor(ctx.el, ctx),
    rows: (el, ctx) => rowsFor(ctx.el, ctx),
  },
  controls,
  roving: s => s.selected,
  opening,
  state,
  mounted,
  styles: `
    :host { display: block; }
    .window { padding: .4em .7em; box-sizing: border-box; background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
    .rs-tab-label { position: absolute; z-index: 2; display: flex; align-items: center; justify-content: center; overflow: hidden;
      white-space: nowrap; pointer-events: none; color: var(--rs-sign-ink, #1b120a);
      font: var(--rs-sign-text); }`,
  docs: {
    attributes: { '(children)': 'Two to six panels: any child element with a label (or data-label) attribute, such as <rs-tab label="...">. A value attribute on a panel sets its value.' },
    properties: {},
  },
});
})();
