// <rs-progress>: a progress bar. Setting `value` puts items into (or takes them out of) a barrel; a comparator
// reads the fill and lights that many lamps. Without a value a torch clock runs a band of light along the lamps.
//
//   <rs-progress value="7" max="15">Upload</rs-progress>   <rs-progress>Loading</rs-progress>
Redstone.ui.define('rs-progress', {
  entry: 'ui-progress',

  params: {
    steps: 'steps',
    max: { attr: 'max', type: 'number', doc: 'The value of a full bar (default 100). Changing it rebuilds the bar.' },
    value: { attr: 'value', type: 'number', doc: 'Read when the bar is built; after that the attribute mirrors the bar.' },
  },

  label: 'beside',

  // A bar reads best small: 16 px blocks unless the page sets --rs-block on the element.
  // In a narrow container the caption wraps under the bar instead of overflowing.
  styles: ':host { --rs-block: 16px; flex-wrap: wrap; }',

  host: {
    role: 'progressbar',
    aria: {
      valueNow: 'value',
      valueMin: () => 0,
      valueMax: (state, el) => (el.contraption ? el.contraption.built.max : 100),
      label: (state, el) => el.label || null,
      busy: state => (state.value === null ? 'true' : null),
    },
  },

  state: {
    value: {
      // The comparator's strength, as a value: the bar snaps to max / steps, like a range input's step.
      // null while the clock lever is off (the clock is running): indeterminate.
      read: (io, built) => (io.lever.on ? Math.round(((io.comparator.out || 0) * built.max / built.steps) * 1000) / 1000 : null),
      attr: 'value',
      type: 'number',
      set: (hand, io, value, built) => {
        const v = value === null || value === undefined || value === '' ? NaN : Number(value);
        if (!Number.isFinite(v)) {
          // Indeterminate: empty the barrel and let the clock run.
          hand.fill(io.barrel, 0);
          if (io.lever.on) hand.flip(io.lever);
          return;
        }
        const level = Math.max(0, Math.min(built.steps, Math.round((built.steps * v) / built.max)));
        hand.fill(io.barrel, level);
        if (!io.lever.on) hand.flip(io.lever);
      },
      doc: 'The bar, as a number from 0 to max, snapped to max / steps. Setting it fills the barrel; null (or removing the attribute) starts the clock.',
    },
  },

});
