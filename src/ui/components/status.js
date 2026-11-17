// <rs-status>: a status dot. The `on` attribute flips a lever; the element is on while the lamp beside it is lit.
//
//   <rs-status on>Online</rs-status>
Redstone.ui.define('rs-status', {
  entry: 'ui-status',

  params: {
    on: { attr: 'on', type: 'boolean', doc: 'Lever on: the lamp is lit. After the build the attribute mirrors the lamp.' },
  },

  label: 'beside',
  // In a narrow container the caption wraps under the machine instead of overflowing.
  styles: ':host { --rs-block: 16px; flex-wrap: wrap; }',

  // Not a control: the text beside it is the status, and its state is in the accessible name.
  host: {
    role: 'status',
    aria: { label: (state, el) => `${el.label || 'Status'}: ${state.on ? 'on' : 'off'}` },
  },

  state: {
    on: {
      read: io => !!io.lamp.lit,
      attr: 'on',
      // No event: page code is the only input, and a property set from page code is silent (like native `checked`).
      set: (hand, io, value) => {
        if (!!io.lever.on !== value) hand.flip(io.lever);
      },
      doc: 'True while the lamp is lit. Setting it (or the attribute) flips the lever.',
    },
  },
});
