// <rs-theme>: a dark-mode switch. The page's data-theme (on <html>) follows the lamp: "light" while it is lit.
//
//   <rs-theme>Lights</rs-theme>        a lever; the choice is stored in localStorage ("rs-theme")
//   <rs-theme auto>Daylight</rs-theme> a daylight detector; the sky follows prefers-color-scheme
(function () {
const KEY = 'rs-theme';
const dark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
const stored = () => {
  try { return localStorage.getItem(KEY); } catch (e) { return null; }
};
const isAuto = el => !!(el && el.hasAttribute && el.hasAttribute('auto'));

// What the document shows follows the lamp, read after every state change (also the silent first build).
function apply(el, theme) {
  if (typeof document === 'undefined' || !el || !el.isConnected) return;
  if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  if (!isAuto(el)) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* storage blocked: the page still follows the lamp */ }
  }
  // Other switches on the page follow through their own machines (a no-op once they agree).
  for (const other of document.querySelectorAll('rs-theme')) if (other !== el && other.contraption && other.theme !== theme) other.theme = theme;
}

Redstone.ui.define('rs-theme', {
  entry: el => (isAuto(el) ? 'ui-theme-auto' : 'ui-theme'),
  observe: ['auto'],

  params: {
    // The starting lamp: the system scheme for auto; otherwise the stored choice, else the system scheme.
    on: (el, ctx) => {
      const s = isAuto(ctx.el) ? null : stored();
      return s ? s === 'light' : !dark();
    },
  },

  label: 'beside',

  controls: [
    { io: 'lever', act: 'flip', role: 'switch', area: ['lever'], aria: { checked: (state) => state.theme === 'light' } },
  ],

  state: {
    theme: {
      read: io => (io.lamp.lit ? 'light' : 'dark'),
      type: 'string',
      event: 'change',
      // With a lever: flip it if it is the wrong way round. Auto: set the sky light the detector sees (an
      // environment input, not a player action; declared in the ui-theme-auto entry).
      set: (hand, io, value, built) => {
        const light = value === 'light';
        if (io.lever) {
          if (!!io.lever.on !== light) hand.flip(io.lever);
        } else built.world.sky = light ? 15 : 0;
      },
      announce: v => `${v === 'light' ? 'Light' : 'Dark'} theme`,
      doc: '"light" while the lamp is lit, else "dark". Setting it flips the lever (or, with auto, sets the sky).',
    },
  },

  form: {
    // A theme switch submits nothing; this hook runs after every state change, so the page follows the lamp here.
    value: el => {
      apply(el, el.theme);
      return null;
    },
  },

  docs: {
    attributes: { auto: 'A daylight detector instead of the lever: the lamp follows prefers-color-scheme (not strict; see deviations).' },
    events: {},
  },
});

// Auto switches follow the system colour scheme as it changes.
if (typeof matchMedia === 'function') {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const follow = () => {
    for (const el of document.querySelectorAll('rs-theme[auto]')) if (el.contraption) el.theme = mq.matches ? 'dark' : 'light';
  };
  if (mq.addEventListener) mq.addEventListener('change', follow);
}
})();
