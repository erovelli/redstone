// <rs-button>: a push button. Pressing the stone button is the input; `click` fires when the lamp lights.
//
//   <rs-button type="submit">Save</rs-button>
Redstone.ui.define('rs-button', {
  entry: 'ui-button',

  params: {
    dust: 'length',
    wood: { attr: 'wood', type: 'boolean', doc: 'An oak button: a 15-tick pulse instead of 10.' },
    signs: (el, ctx) => ctx.signsFor(ctx.text, { min: 0 }),
  },

  label: 'signs',

  // SPEC I3: sign text is 0.4 of a block, so the default block is 32 px (12.8 px text). An author can still set
  // --rs-block on the element; the signs are sized from the measured caption, so a longer caption gets more signs.
  styles: ':host { --rs-block: 32px; }',

  controls: [
    { io: 'button', act: 'press', role: 'button', area: ['button', 'signs'] },
  ],

  state: {
    active: {
      read: io => !!io.lamp.lit,
      event: 'click',
      when: 'rise',
      eventDoc: 'A MouseEvent; cancel it to stop a form submit.',
      doc: 'True while the lamp is lit (10 ticks per press, 15 with wood).',
    },
  },

  // A real button submits or resets its form; this one does it when the lamp lights.
  changed(el, change) {
    if (change.key !== 'active' || !change.value) return;
    const click = change.dispatched[0];
    const form = el.form;
    if (!form || (click && click.defaultPrevented)) return;
    const type = (el.getAttribute('type') || 'submit').toLowerCase();
    if (type === 'submit') form.requestSubmit();
    if (type === 'reset') form.reset();
  },

  docs: {
    attributes: {
      type: '"submit" (default), "reset" or "button", as on a native button inside a form.',
    },
  },
});
