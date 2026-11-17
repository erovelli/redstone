// <rs-radio>: a radio group. Each <option> is a stone button into a latch bank; `value` follows the latches.
//
//   <rs-radio name="size" value="m">
//     <option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option>
//   </rs-radio>
//
// The markup is a <select>'s: without the script the options are a readable list, and the value attribute and
// option values carry over. Each option's label sits beside its lamp as page text (SPEC I3: an inline control).
(function () {
const MAX = 6;
const options = el => (el ? [...el.children].filter(c => c.localName === 'option').slice(0, MAX) : []);
const valueOf = o => (o.hasAttribute('value') ? o.getAttribute('value') : o.textContent.trim());
const valuesOf = el => options(el).map(valueOf);
const valuesIn = built => (built && built.values) || [];

// One press per tick: two buttons pressed in the same tick would set both latches (a player's clicks reach the
// world one per game tick). A refused press returns false; page code's set is retried after settling.
function pressOption(hand, io, built, k) {
  if (!io.buttons[k] || built.pressedAt === built.world.t) return false;
  if (!hand.press(io.buttons[k])) return false;
  built.pressedAt = built.world.t;
  return true;
}

// Each option row is 3 depth rows (3T); the lower half is mirrored, which leaves 2 more rows before it.
// The first lamp's centre is 1.5 blocks plus half a row from the top (the collector climbs one block high).
let styles = `
:host { align-items: flex-start; }
.caption { display: flex; flex-direction: column; padding-top: calc(var(--b, 24px) * 1.5 - var(--t, 17px) * 1.6); }
::slotted(option) { display: flex; align-items: center; height: calc(var(--t, 17px) * 3); padding: 0; white-space: nowrap; }
::slotted(option[disabled]) { opacity: .6; }`;
for (let n = 2; n <= MAX; n++) {
  const half = Math.floor(n / 2);
  styles += `\n::slotted(option:nth-of-type(${half + 1}):nth-last-of-type(${n - half})) { margin-top: calc(var(--t, 17px) * 2); }`;
}

const controls = [];
for (let k = 0; k < MAX; k++) {
  controls.push({
    io: 'b' + k,
    act: (hand, io, built) => pressOption(hand, io, built, k),
    role: 'radio',
    area: ['row' + k],
    label: el => (options(el)[k] ? options(el)[k].textContent.trim() : ''),
    aria: { checked: (state, el) => state.value !== '' && valuesOf(el)[k] === state.value },
    primary: k === 0,
  });
}

Redstone.ui.define('rs-radio', {
  entry: 'ui-radio',

  params: {
    options: (el, ctx) => Math.max(2, Math.min(MAX, options(ctx.el).length)),
    values: (el, ctx) => valuesOf(ctx.el),
    sel: (el, ctx) => {
      const list = options(ctx.el);
      const v = ctx.el ? ctx.el.getAttribute('value') : null;
      return v !== null ? valuesOf(ctx.el).indexOf(v) : list.findIndex(o => o.hasAttribute('selected'));
    },
  },

  label: 'beside',
  styles,
  observe: ['required'],
  controls,
  roving: (state, el) => valuesOf(el).indexOf(state.value),
  captionControl: (el, ev) => {
    const o = ev.composedPath().find(n => n.localName === 'option' && n.parentNode === el);
    const k = options(el).indexOf(o);
    return k >= 0 ? controls[k] : controls[Math.max(0, valuesOf(el).indexOf(el.value))];
  },
  host: { role: 'radiogroup' },

  state: {
    value: {
      read: (io, built) => {
        const on = io.memory.map((m, k) => (m.on ? k : -1)).filter(k => k >= 0);
        return on.length === 1 ? (valuesIn(built)[on[0]] || '') : '';
      },
      attr: 'value',
      type: 'string',
      event: ['input', 'change'],
      // Press the option's button; a value that matches no option changes nothing (the latches cannot clear).
      set: (hand, io, value, built) => pressOption(hand, io, built, valuesIn(built).indexOf(value)),
      announce: (v, el) => {
        const o = options(el)[valuesOf(el).indexOf(v)];
        return o ? `${o.textContent.trim()} selected` : '';
      },
      doc: 'The value of the option whose latch is on ("" before one is chosen). Setting it presses that option\'s button.',
    },
  },

  form: {
    value: el => (el.value ? el.value : null),
    validity: el => (el.hasAttribute('required') && !el.value ? { flags: { valueMissing: true }, message: 'Choose an option.' } : null),
  },

  docs: {
    attributes: {
      name: 'Form field name.',
      required: 'The form does not submit until an option is chosen (valueMissing).',
    },
    properties: { validity: 'ValidityState; also checkValidity() and reportValidity().' },
  },
});
})();
