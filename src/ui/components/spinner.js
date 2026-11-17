// <rs-spinner>: a loading indicator. A torch clock laid out as a ring chases light round three lamps.
// `paused` (and reduced motion) flips its lever on: the ring stands still, fully lit.
//
//   <rs-spinner>Loading</rs-spinner>
const stillByDefault = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

Redstone.ui.define('rs-spinner', {
  entry: 'ui-spinner',

  params: {
    delay: 'delay',
    still: { attr: 'paused', type: 'boolean', doc: 'Built with the lever on: still and fully lit. Reduced motion builds it so too.' },
    reduced: () => stillByDefault(),
  },

  label: 'beside',
  // In a narrow container the caption wraps under the machine instead of overflowing.
  styles: ':host { --rs-block: 16px; flex-wrap: wrap; }',

  host: {
    role: 'status',
    aria: {
      label: (state, el) => el.label || 'Loading',
      busy: state => (state.paused ? null : 'true'),
    },
  },

  state: {
    paused: {
      read: io => !!io.lever.on,
      attr: 'paused',
      set: (hand, io, value) => {
        if (!!io.lever.on !== value) hand.flip(io.lever);
      },
      doc: 'True while the lever holds the ring still. Setting it flips the lever.',
    },
  },
});
