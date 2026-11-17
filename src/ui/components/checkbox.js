// <rs-checkbox>: a checkbox. Pressing the stone button is the input; `checked` follows the copper bulb.
//
//   <rs-checkbox name="terms" required>I agree</rs-checkbox>
Redstone.ui.define('rs-checkbox', {
  entry: 'ui-checkbox',

  params: {
    on: { attr: 'checked', type: 'boolean', doc: 'Start checked. After that the attribute mirrors the bulb.' },
    dust: 'length',
  },

  label: 'beside',
  observe: ['required'],

  controls: [
    { io: 'button', act: 'press', role: 'checkbox', area: ['button', 'block', 'bulb'], aria: { checked: 'checked' } },
  ],

  state: {
    checked: {
      read: io => !!io.bulb.lit,
      attr: 'checked',
      event: ['input', 'change'],
      // A press toggles the bulb; press only when it is the wrong way round. If the button is still in from a
      // player's press, the core settles the world and asks again.
      set: (hand, io, value) => {
        if (!!io.bulb.lit !== value) hand.press(io.button);
      },
      announce: (on, el) => `${el.label} ${on ? 'checked' : 'not checked'}`,
      doc: 'True while the copper bulb is lit. Setting it presses the button if the bulb is the wrong way round.',
    },
  },

  form: {
    value: el => (el.checked ? el.getAttribute('value') || 'on' : null),
    validity: el => (el.hasAttribute('required') && !el.checked ? { flags: { valueMissing: true }, message: 'Check this box to continue.' } : null),
  },

  docs: {
    attributes: {
      name: 'Form field name.',
      value: 'Submitted while checked (default "on").',
      required: 'The form does not submit until the box is checked (valueMissing).',
    },
    properties: { validity: 'ValidityState, as on a native input; also checkValidity() and reportValidity().' },
  },
});
