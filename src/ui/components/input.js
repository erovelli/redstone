// <rs-input>: a single-line text field. The value is what a row of oak wall signs says; typing is the player
// writing on them. The text shows on the sign boards (SPEC I3); while the field has focus a real native <input>
// lies over the boards, so typing, IME, selection and autofill work, and every edit is written to the signs.
//
//   <rs-input name="user" placeholder="Steve" required>Name</rs-input>
//
// Each sign holds 15 characters (5 signs by default: 75; 8 signs at most: 120). `size` (visible characters, default
// 20) and `maxlength` choose how many signs hang.
(function () {
const PER_SIGN = 15;
const MAX_SIGNS = 8;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const attrNum = (el, name) => (el && el.getAttribute(name) !== null ? Number(el.getAttribute(name)) : NaN);
const built = el => (el.contraption ? el.contraption.built : null);

// Enough signs to show `size` characters at the sign font, and to hold `maxlength`.
function signsFor(el, ctx) {
  const size = clamp(Math.round(attrNum(el, 'size')) || 20, 1, 200);
  const shown = ctx.signsFor('x'.repeat(size), { min: 1, max: MAX_SIGNS });
  const max = attrNum(el, 'maxlength');
  return clamp(Math.max(shown, max > 0 ? Math.ceil(max / PER_SIGN) : 1), 1, MAX_SIGNS);
}

// The text over the boards (or the placeholder) and the native field's value follow the signs.
function paint(el, state) {
  const root = el.shadowRoot;
  const text = root && root.querySelector('.rs-text');
  const field = root && root.querySelector('.rs-field');
  if (!text || !field) return;
  const value = state.value || '';
  text.textContent = value || el.getAttribute('placeholder') || '';
  text.classList.toggle('empty', !value);
  if (field.value !== value) field.value = value;
  field.disabled = el.matches(':disabled');
}

// The edit is over (change, blur, Enter): `committed` catches up with the signs, and `change` fires if it moved.
const commit = el => el.perform((hand, io, b) => { b.editing = null; return false; }, { settle: true });

function mounted(el, view, b) {
  const root = el.shadowRoot;
  const box = root.querySelector('.box');
  let field = root.querySelector('.rs-field');
  let text = root.querySelector('.rs-text');
  if (!field) {
    text = document.createElement('div');
    text.className = 'rs-text';
    text.setAttribute('aria-hidden', 'true');
    field = document.createElement('input');
    field.type = 'text';
    field.className = 'rs-field';
    field.setAttribute('part', 'input');
    box.append(text, field);
    field.addEventListener('focus', () => {
      if (el.matches(':disabled')) return field.blur();
      const bb = built(el);
      if (bb && !bb.editing) bb.editing = { from: el.value };
    });
    // Typing: the player writes the field's text on the signs. The inner input event stays inside; the element's
    // own input event comes from the signs.
    field.addEventListener('input', ev => {
      ev.stopPropagation();
      el.perform((hand, io, bb) => bb.write(hand, field.value), { event: ev, settle: true });
    });
    field.addEventListener('beforeinput', ev => { if (el.matches(':disabled')) ev.preventDefault(); });
    field.addEventListener('change', () => commit(el));
    field.addEventListener('blur', () => commit(el));
    field.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || ev.isComposing) return;
      commit(el);
      if (el.form) el.form.requestSubmit();
    });
    const cap = root.querySelector('.caption');
    if (cap) cap.addEventListener('click', () => field.focus());
  }
  // Over the union of the sign boards.
  const rects = b.io.signs.map(s => view.rectOf(s, 'board'));
  const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y));
  const x1 = Math.max(...rects.map(r => r.x + r.w)), y1 = Math.max(...rects.map(r => r.y + r.h));
  for (const n of [text, field]) Object.assign(n.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
  const max = attrNum(el, 'maxlength');
  field.maxLength = max >= 0 ? Math.min(max, b.capacity) : b.capacity;
  field.placeholder = el.getAttribute('placeholder') || '';
  field.disabled = el.hasAttribute('disabled');
  for (const a of ['autocomplete', 'inputmode', 'spellcheck', 'autocapitalize', 'enterkeyhint']) {
    if (el.hasAttribute(a)) field.setAttribute(a, el.getAttribute(a));
    else field.removeAttribute(a);
  }
  if (el.name) field.name = el.name;
  if (el.label) field.setAttribute('aria-label', el.label);
  field.setAttribute('aria-required', String(el.hasAttribute('required')));
  paint(el, el.contraption.state);
}

Redstone.ui.define('rs-input', {
  entry: 'ui-input',
  minBlock: 30,                                // 0.4 of a block: the sign text stays at 12 px or more

  params: {
    signs: (el, ctx) => (ctx.el ? signsFor(ctx.el, ctx) : 5),
    value: { attr: 'value', type: 'string', doc: 'Read when built; after that the attribute mirrors the signs.' },
  },

  label: 'beside',
  observe: ['size', 'maxlength', 'placeholder', 'required', 'autocomplete', 'name'],
  controls: [],

  state: {
    value: {
      read: (io, b) => b.text(),
      attr: 'value',
      type: 'string',
      event: 'input',
      set: (hand, io, value, b) => b.write(hand, value),
      doc: 'What the signs say. Setting it writes on them (text beyond the signs\' 15 characters each does not fit).',
    },
    committed: {
      read: (io, b) => (b.editing ? b.editing.from : b.text()),
      event: 'change',
      doc: 'The value as of the last commit: while the field has focus it keeps the value it had when focused.',
      eventDoc: 'When the edit is committed: Enter, or leaving the field.',
    },
  },

  mounted,
  sync: paint,

  form: {
    value: el => el.value,
    validity: el => (el.hasAttribute('required') && !el.value ? { flags: { valueMissing: true }, message: 'Please fill out this field.' } : null),
  },

  styles: `
    :host { --rs-block: 32px; flex-wrap: wrap; }
    .caption { order: -1; cursor: text; }
    .rs-text, .rs-field { position: absolute; z-index: 4; box-sizing: border-box; margin: 0; border: 0; border-radius: 0;
      padding: 0 calc(var(--b) * .12); background: transparent; color: var(--rs-sign-ink, #1b120a);
      font: 500 calc(var(--b) * .4)/1 var(--rs-sign-font, ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace); letter-spacing: 0; }
    .rs-text { display: flex; align-items: center; white-space: pre; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
    .rs-text.empty { opacity: .55; }
    .rs-field { opacity: 0; cursor: text; }
    .rs-field:focus { opacity: 1; outline: 2px dashed var(--rs-focus, currentColor); outline-offset: 2px; }
    .rs-field::placeholder { color: inherit; opacity: .55; }
    :host(:focus-within) .rs-text { visibility: hidden; }
    :host([disabled]) .rs-field { cursor: not-allowed; }`,

  docs: {
    attributes: {
      name: 'Form field name.',
      placeholder: 'Shown on the signs while they are blank.',
      required: 'The form does not submit while the signs are blank (valueMissing).',
      maxlength: 'At most this many characters (and never more than the signs hold: 15 each).',
      size: 'Visible characters (default 20): sets how many signs hang, up to 8.',
      autocomplete: 'Passed to the native field (also inputmode, spellcheck, autocapitalize, enterkeyhint).',
    },
    properties: { validity: 'ValidityState; also checkValidity() and reportValidity().' },
  },
});
})();
