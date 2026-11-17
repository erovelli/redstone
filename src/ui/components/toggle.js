// <rs-toggle>: a switch. Flipping the lever is the input; `checked` follows the lamp.
//
//   <rs-toggle name="lights" checked>Lights</rs-toggle>
Redstone.ui.define('rs-toggle', {
  entry: 'ui-toggle',

  // Builder params from attributes. `checked` is read once, at build; after that it mirrors the lamp.
  params: {
    on: { attr: 'checked', type: 'boolean', doc: 'Start on. After that the attribute mirrors the lamp.' },
    dust: 'length',
    signs: (el, ctx) => ctx.signsFor(ctx.text, { min: 0 }),
  },

  // The light-DOM text goes on the oak wall signs.
  label: 'signs',

  // The lever is a real focusable switch; clicking the label signs flips it too, like a native label.
  controls: [
    { io: 'lever', act: 'flip', role: 'switch', area: ['lever', 'signs'], aria: { checked: 'checked' } },
  ],

  state: {
    checked: {
      read: io => !!io.lamp.lit,
      attr: 'checked',
      event: ['input', 'change'],
      // Page code setting `checked` flips the lever if it is the wrong way round; the world then settles.
      set: (hand, io, value) => {
        if (!!io.lever.on !== value) hand.flip(io.lever);
      },
      announce: (on, el) => `${el.label} ${on ? 'on' : 'off'}`,
      doc: 'True while the lamp is lit. Setting it flips the lever.',
    },
  },

  form: { value: el => (el.checked ? el.getAttribute('value') || 'on' : null) },

  docs: {
    attributes: {
      name: 'Form field name.',
      value: 'Submitted while checked (default "on").',
    },
  },
});
