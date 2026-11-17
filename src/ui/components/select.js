// <rs-select>: a select. The book on a lectern has a page per <option>; `value` is the page a comparator reads.
// A stone button on a copper bulb opens a curtain over the list; choosing an option turns the page, and the
// lectern's pulse toggles the bulb, so the curtain closes by itself.
//
//   <rs-select name="size"><option value="s">Small</option><option value="m" selected>Medium</option></rs-select>
//
// The chosen option's text sits beside the machine (SPEC I3); the options show through the opening as HTML.
// Keyboard (the ARIA select-only combobox): closed, ArrowDown/Up, Enter, Space, Home, End or typing open the list;
// open, the arrows, Home, End and typing move the active option, Enter or Space chooses it, Escape closes,
// Tab chooses and moves on.
(function () {
const MAX = 15;
const options = el => (el ? [...el.children].filter(c => c.localName === 'option').slice(0, MAX) : []);
const valueOf = o => (o.hasAttribute('value') ? o.getAttribute('value') : o.textContent.trim());
const textOf = o => (o ? o.textContent.replace(/\s+/g, ' ').trim() : '');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const typed = new WeakMap();

// Columns: the longest option at the list's font (half a block, in the sign font), within the available width.
function colsFor(el, ctx) {
  const longest = Math.max(0, ...options(el).map(o => (ctx.measure ? ctx.measure(textOf(o)) : textOf(o).length * 0.24)));
  let parent = el && el.parentElement;
  while (parent && parent.parentElement && getComputedStyle(parent).display === 'contents') parent = parent.parentElement;
  const avail = parent ? Math.floor(parent.clientWidth / ctx.B) - 7 : 15;
  return clamp(Math.ceil((longest * 0.5) / 0.4 + 1), 2, Math.max(2, Math.min(15, avail)));
}

const nameOf = el => el.getAttribute('aria-label') || [...(el.labels || [])].map(l => l.textContent.trim()).join(' ');

// The DOM that follows the machine: the chosen text beside it, aria-selected, the active option, the combobox's value.
function paint(el) {
  const c = el.contraption;
  if (!c || !el.shadowRoot) return;
  const b = c.built, list = options(el), k = b.choice(), open = !!c.state.open;
  const cap = el.shadowRoot.querySelector('.rs-chosen');
  if (cap) cap.textContent = textOf(list[k]);
  list.forEach((o, i) => o.setAttribute('aria-selected', String(i === k)));
  const btn = el.shadowRoot.querySelector('.hit');
  const sr = btn && btn.querySelector('.sr');
  if (sr) sr.textContent = textOf(list[k]);
  if (btn) btn.ariaActiveDescendantElement = open && list[b.active] ? list[b.active] : null;
  const dyn = el.shadowRoot.querySelector('style.rs-dyn');
  if (dyn) {
    dyn.textContent = `::slotted(option:nth-of-type(${k + 1})) { font-weight: 700; }` +
      (open ? `::slotted(option:nth-of-type(${b.active + 1})) { background: var(--rs-active-bg, #2b6cb0); color: var(--rs-active-ink, #fff); }` : '');
  }
}

// Typeahead: the first option (after the active one, for a repeated letter) whose text starts with what was typed
// in the last half second. The time comes from the key events, not a timer.
function find(el, b, ev) {
  const prev = typed.get(el);
  const s = (prev && ev.timeStamp - prev.t < 500 ? prev.s : '') + ev.key.toLowerCase();
  typed.set(el, { s, t: ev.timeStamp });
  const list = options(el).map(o => textOf(o).toLowerCase());
  const same = [...s].every(ch => ch === s[0]);
  const start = same ? b.active + 1 : b.active;
  for (let i = 0; i < list.length; i++) {
    const k = (start + i) % list.length;
    if (list[k].startsWith(same ? s[0] : s)) return k;
  }
  return -1;
}

function onKey(el, ev) {
  const c = el.contraption;
  if (!c || el.disabled) return;
  const b = c.built, n = options(el).length, k = ev.key;
  const expanded = !!b.io.bulb.lit;      // where the flip-flop is heading
  const act = (fn, prevent = true) => {
    if (prevent) ev.preventDefault();
    el.perform(fn, { event: ev });
  };
  const move = to => {
    ev.preventDefault();
    b.active = clamp(to, 0, n - 1);
    paint(el);
  };
  const prev = typed.get(el);
  const typing = !!prev && ev.timeStamp - prev.t < 500;   // a space inside a typeahead word is a letter
  const printable = k.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && (k !== ' ' || typing);
  if (!expanded) {
    if (printable) {
      const to = find(el, b, ev);
      return act((hand, io, bb) => { const r = bb.toggle(hand); if (to >= 0) bb.active = to; return r; });
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(k)) return;
    return act((hand, io, bb) => {
      const r = bb.toggle(hand);
      if (k === 'Home') bb.active = 0;
      if (k === 'End') bb.active = n - 1;
      return r;
    });
  }
  if (ev.altKey && k === 'ArrowUp') return act((hand, io, bb) => bb.choose(hand, bb.active));
  if (k === 'ArrowDown') return move(b.active + 1);
  if (k === 'ArrowUp') return move(b.active - 1);
  if (k === 'Home' || k === 'PageUp') return move(k === 'Home' ? 0 : b.active - 7);
  if (k === 'End' || k === 'PageDown') return move(k === 'End' ? n - 1 : b.active + 7);
  if (k === 'Enter' || (k === ' ' && !typing)) return act((hand, io, bb) => bb.choose(hand, bb.active));
  if (k === 'Escape') return act((hand, io, bb) => bb.toggle(hand));
  if (k === 'Tab') return act((hand, io, bb) => bb.choose(hand, bb.active), false);
  if (printable) {
    const to = find(el, b, ev);
    if (to >= 0) move(to);
  }
}

function mounted(el, view, built) {
  const root = el.shadowRoot;
  const box = root.querySelector('.box');
  box.style.setProperty('--rs-full', view.H + 'px');
  if (!root.querySelector('style.rs-dyn')) {
    const dyn = document.createElement('style');
    dyn.className = 'rs-dyn';
    root.appendChild(dyn);
    const cap = document.createElement('span');
    cap.className = 'rs-chosen';
    cap.setAttribute('part', 'label');
    cap.setAttribute('aria-hidden', 'true');
    cap.addEventListener('click', ev => el.perform((hand, io, b) => b.toggle(hand), { event: ev }));
    root.insertBefore(cap, box.nextSibling);
    // Options are content shown through the opening: a click chooses, hovering makes it the active one.
    const win = root.querySelector('.window');
    const optionAt = ev => options(el).indexOf(ev.target.closest && ev.target.closest('option'));
    win.addEventListener('click', ev => {
      const k = optionAt(ev);
      if (k >= 0 && el.open) el.perform((hand, io, b) => b.choose(hand, k), { event: ev });
    });
    win.addEventListener('pointermove', ev => {
      const k = optionAt(ev), b = el.contraption && el.contraption.built;
      if (k >= 0 && b && b.active !== k) {
        b.active = k;
        paint(el);
      }
    });
  }
  const r = view.rectOf(built.io.lectern, 'front');
  // Beside the control row; when a narrow container wraps it under the machine, straight under it.
  const cap = root.querySelector('.rs-chosen');
  cap.style.marginTop = `calc(${r.y + r.h / 2}px - .65em)`;
  if (cap.offsetTop > box.offsetTop + r.y) cap.style.marginTop = '0';
  const win = root.querySelector('.window');
  win.setAttribute('role', 'listbox');
  win.setAttribute('aria-label', nameOf(el) || 'Options');
  const btn = root.querySelector('.hit');
  btn.innerHTML = '<span class="sr"></span>';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.ariaControlsElements = [win];
  btn.addEventListener('keydown', ev => onKey(el, ev));
}

Redstone.ui.define('rs-select', {
  entry: 'ui-select',

  params: {
    values: el => options(el).map(valueOf),
    selected: el => Math.max(0, options(el).findIndex(o => o.hasAttribute('selected'))),
    value: { attr: 'value', type: 'string', doc: 'Read when built (else the option marked selected, else the first); after that it mirrors the lectern.' },
    cols: (el, ctx) => colsFor(el, ctx),
  },

  opening: { cells: 'opening', shownWhen: 'open' },
  observe: ['required'],

  controls: [{
    io: 'button',
    act: (hand, io, built) => built.toggle(hand),
    role: 'combobox',
    area: ['row'],
    label: nameOf,
    aria: { expanded: 'open' },
  }],

  state: {
    value: {
      read: (io, built) => {
        const k = built.choice();
        return k >= 0 && k < built.values.length ? built.values[k] : '';
      },
      attr: 'value',
      type: 'string',
      event: ['input', 'change'],
      set: (hand, io, value, built) => built.pick(hand, built.values.indexOf(String(value))),
      announce: (v, el) => `${textOf(options(el)[el.contraption.built.choice()])} selected`,
      doc: 'The value of the option on the lectern\'s open page. Setting it turns the page (and presses the list shut if the pulse opened it).',
    },
    open: {
      read: (io, b) => b.opening.every(([x, y, z]) => !b.world.get(x, y, z)),
      attr: 'open',
      doc: 'True while the curtain is clear of the list (read-only).',
    },
    deployed: {
      read: (io, b) => !!io.bulb.lit || !b.opening.every(([x, y, z]) => b.world.get(x, y, z)),
      attr: 'data-deployed',
      doc: 'True from the press until the curtain is home again: the list is laid over the page below.',
    },
  },

  mounted,
  sync: paint,

  form: {
    value: el => el.value,
    validity: el => (el.hasAttribute('required') && el.value === '' ? { flags: { valueMissing: true }, message: 'Select an item in the list.' } : null),
  },

  styles: `
    :host { --rs-block: 24px; display: inline-flex; flex-wrap: wrap; align-items: flex-start; column-gap: calc(var(--b, 24px) * .3); }
    :host([data-deployed]) { z-index: 20; }
    :host(:not([data-deployed]):not([inspect])) .box { height: calc(var(--b) * 4.16 - 1px) !important; overflow: hidden; }
    :host([data-deployed]:not([inspect])) .box { margin-bottom: calc(var(--b) * 4.16 - 1px - var(--rs-full)); }
    .rs-chosen { line-height: normal; white-space: nowrap; cursor: pointer; user-select: none; }
    :host([disabled]) .rs-chosen { opacity: .6; cursor: not-allowed; }
    .window { background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); overscroll-behavior: contain; }
    ::slotted(option) { display: block; box-sizing: border-box; height: var(--b); padding: 0 .5em; cursor: pointer;
      font: 500 calc(var(--b) * .5)/var(--b) var(--rs-sign-font, ui-monospace, Menlo, Consolas, monospace);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    ::slotted(option:hover) { background: rgba(43, 108, 176, .18); }`,

  docs: {
    attributes: {
      name: 'Form field name.',
      required: 'The form does not submit while the chosen option\'s value is "" (valueMissing), as on a native select.',
      '(children)': 'Up to 15 <option> elements (a lectern book of up to 15 pages); the opening shows 8 rows and scrolls.',
    },
    properties: { validity: 'ValidityState; also checkValidity() and reportValidity().' },
  },
});
})();
