// <rs-dropdown>: a menu button. Pressing the stone button toggles a copper bulb; the lit bulb puts out the torch
// that lights the piston row and the door is pulled off the menu. Choosing an item, Escape, Tab or a click
// outside presses the same button again. `open` and `toggle` follow the door; `select` fires when the door has
// shut after an item was chosen, with the item.
//
//   <rs-dropdown label="Edit">
//     <button value="copy">Copy</button><button value="paste">Paste</button>
//   </rs-dropdown>
//
// The element's layout box is the top of the machine (the label and the button); the menu part hangs below it
// over the page while the menu is in use.
(function () {
const STYLES = `
  :host { --rs-block: 30px; z-index: 20; vertical-align: top; }
  :host([data-deployed]) { z-index: 2147482300; }
  :host(:not([data-deployed]):not([inspect])) .box { clip-path: inset(0 0 calc(100% - var(--rs-top, 100%)) 0); }
  .window { overflow: hidden; background: var(--rs-window-bg, #fbf7ea); color: var(--rs-window-ink, #1b120a); }
  ::slotted(*) { display: flex; align-items: center; box-sizing: border-box; width: 100%; height: var(--b); margin: 0;
    padding: 0 .6em; border: 0; border-radius: 0; background: none; font: inherit; color: inherit; text-align: left;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; text-decoration: none; }
  ::slotted(:hover), ::slotted(:focus) { background: var(--rs-menu-hover, rgba(255, 190, 60, .35)); outline: none; }
  ::slotted(:focus-visible) { outline: 2px dashed var(--rs-focus, currentColor); outline-offset: -3px; }
`;
const own = new WeakMap();
const mine = el => own.get(el) || own.set(el, {}).get(el);

const items = el => (el ? [...el.children].filter(n => !n.getAttribute('slot')).slice(0, 12) : []);
const labelText = el => {
  if (!el) return 'Menu';
  const slotted = el.querySelector(':scope > [slot="label"]');
  return (slotted ? slotted.textContent : el.getAttribute('label') || 'Menu').replace(/\s+/g, ' ').trim();
};
const enabled = n => !n.disabled && n.getAttribute('aria-disabled') !== 'true';

// Columns: the widest item at its natural width, within 14 and the available width.
function colsFor(el, ctx) {
  if (!el || !el.parentNode) return 6;
  const probe = document.createElement('div');
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', width: 'max-content' });
  probe.setAttribute('aria-hidden', 'true');
  for (const n of items(el)) {
    const row = document.createElement('div');
    Object.assign(row.style, { padding: '0 .6em', whiteSpace: 'nowrap', font: getComputedStyle(n).font });
    row.textContent = n.textContent.trim();
    probe.appendChild(row);
  }
  el.parentNode.insertBefore(probe, el.nextSibling);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  const parent = el.parentElement, cs = getComputedStyle(parent);
  const avail = parent.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const fit = Math.max(1, Math.floor(avail / ctx.B) - 5);
  return Math.max(1, Math.min(14, fit, Math.max(ctx.signsFor(labelText(el), { min: 1, max: 14 }) - 1, Math.ceil((w + 2) / ctx.B))));
}

// What the player does with the menu button: press it, unless it is already in (a press would do nothing).
const press = (hand, io) => { if (!io.button.on) hand.press(io.button); };
const pressIf = lit => (hand, io) => { if (!!io.bulb.lit === lit) press(hand, io); };

function shut(el) { el.perform(pressIf(true)); }

function onKey(el, ev) {
  const list = items(el).filter(enabled);
  const at = list.indexOf(ev.target);
  if (at < 0) return;
  const go = i => { ev.preventDefault(); list[(i + list.length) % list.length].focus(); };
  if (ev.key === 'ArrowDown') go(at + 1);
  else if (ev.key === 'ArrowUp') go(at - 1);
  else if (ev.key === 'Home') go(0);
  else if (ev.key === 'End') go(list.length - 1);
  else if (ev.key === 'Escape') {
    ev.preventDefault();
    shut(el);
    el.focus();
  } else if (ev.key === 'Tab') shut(el);
  else if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.localName !== 'button' && ev.target.localName !== 'a') {
    ev.preventDefault();
    ev.target.click();
  } else if (ev.key.length === 1 && /\S/.test(ev.key)) {
    // Typeahead: the next item starting with the letter.
    const k = ev.key.toLowerCase();
    for (let i = 1; i <= list.length; i++) {
      const n = list[(at + i) % list.length];
      if (n.textContent.trim().toLowerCase().startsWith(k)) return go(at + i);
    }
  }
}

function choose(el, item) {
  const io = el.contraption && el.contraption.io;
  if (!io || !el.open || io.button.on || !enabled(item)) return;   // the button is still in: the press would do nothing
  mine(el).chosen = item;
  el.perform(pressIf(true));
}

// Follow the door: clear -> focus the first item; shut -> fire select for a chosen item, focus back to the button.
function sync(el, change) {
  const m = mine(el);
  for (const n of items(el)) {
    n.setAttribute('role', 'menuitem');
    n.tabIndex = -1;
  }
  if (!change || change.key !== 'open') return;
  if (change.value) {
    const first = items(el).find(enabled);
    if (first) first.focus();
    return;
  }
  const inside = el.contains(document.activeElement);
  const item = m.chosen;
  m.chosen = null;
  if (inside || item) el.focus();
  if (item) el.dispatchEvent(new CustomEvent('select', { bubbles: true, detail: { item, value: item.value || item.getAttribute('value') || item.textContent.trim() } }));
}

Redstone.ui.define('rs-dropdown', {
  entry: 'ui-dropdown',
  minBlock: 30,                                    // 0.4 of a block: the label stays at 12 px or more
  params: {
    open: { attr: 'open', type: 'boolean', doc: 'Start open. After that the attribute mirrors the door.' },
    rows: el => Math.max(1, items(el).length || 3),
    cols: colsFor,
    signs: (el, ctx) => Math.min(colsFor(el, ctx) + 1, ctx.signsFor(labelText(el), { min: 1, max: 15 })),
  },
  label: 'signs',
  labelSlot: 'label',
  labelFallback: labelText,
  opening: { cells: 'opening', shownWhen: 'open' },
  controls: [
    {
      io: 'button', act: press, role: 'button', area: ['button', 'signs'], label: labelText, aria: { expanded: 'open' },
      keys: { ArrowDown: pressIf(false), ArrowUp: pressIf(false) },
    },
  ],
  state: {
    open: {
      read: (io, b) => b.opening.every(([x, y, z]) => !b.world.get(x, y, z)),
      attr: 'open',
      event: 'toggle',
      settle: false,
      set: (hand, io, value) => pressIf(!value)(hand, io),
      doc: 'True while the door is clear. Setting it presses the menu button if the bulb is not already that way.',
    },
    deployed: {
      read: (io, b) => !!io.bulb.lit || !b.opening.every(([x, y, z]) => { const k = b.world.get(x, y, z); return !!k && (k.t === 'honey' || k.t === 'slime'); }),
      attr: 'data-deployed',
      doc: 'True while the menu part is shown: from the press that lights the bulb until the door is home.',
    },
  },
  changed: (el, change) => sync(el, change),
  mounted(el, view) {
    const box = el.shadowRoot.querySelector('.box');
    // The layout box is the top of the machine, down to the bottom of the frame's top row; the rest hangs below.
    const r = view.rectOf([1, 1, 1], 'front');
    const top = Math.round(r.y + r.h);
    box.style.setProperty('--rs-top', top + 'px');
    box.style.marginBottom = top - view.H + 'px';
    const win = el.shadowRoot.querySelector('.window');
    win.setAttribute('role', 'menu');
    win.setAttribute('aria-label', labelText(el));
    const hit = el.shadowRoot.querySelector('.hit');
    if (hit) hit.setAttribute('aria-haspopup', 'menu');
    sync(el);
    const m = mine(el);
    if (m.wired) return;
    m.wired = true;
    // Capture: the core keeps raw clicks on the machine (and the opening) inside the shadow root.
    el.addEventListener('click', ev => {
      const item = ev.target.closest && items(el).find(n => n.contains(ev.target));
      if (item) choose(el, item);
    }, true);
    el.addEventListener('keydown', ev => onKey(el, ev));
    document.addEventListener('pointerdown', ev => {
      if (el.deployed && !ev.composedPath().includes(el)) shut(el);
    }, true);
  },
  methods: {
    show() { this.perform(pressIf(false)); },
    close() { this.perform(pressIf(true)); },
  },
  observe: ['label'],
  styles: STYLES,
  docs: {
    attributes: { label: 'The menu button\'s label on the signs (or a child with slot="label"); default "Menu".' },
    properties: { 'show()': 'Press the menu button if the menu is shut.', 'close()': 'Press it if the menu is open.' },
    events: { select: 'Fired when the door has shut after an item was chosen; detail { item, value } (value: the item\'s value, else its text).' },
  },
});
})();
