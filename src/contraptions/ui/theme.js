// UI contraptions for <rs-theme>, a dark-mode switch. The page is light while the lamp is lit.
//
//   ui-theme       a lever on the floor beside a redstone lamp (the player flips the lever)
//   ui-theme-auto  a daylight detector beside a redstone lamp (the sky light, set from the system colour scheme)
//
//   front view (x east, z up):
//     z=0   lever | daylight detector   lamp
//     z=-1  floor                       floor
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const isOn = v => v === true || v === 'true';

function buildTheme(p = {}) {
  const on = isOn(p.on);
  const w = new RS.World({ strict: true });
  w.put(0, 0, -1, 'smooth_stone');
  w.put(1, 0, -1, 'smooth_stone');
  const lever = w.put(0, 0, 0, 'lever', { att: 'D', on });
  const lamp = w.put(1, 0, 0, 'lamp', { lit: on });
  w.seal();
  return { world: w, box: [0, 1, 0, 0, -1, 0], io: { lever, lamp } };
}

// The daylight detector outputs the sky light (world.sky): 15 by day lights the lamp, 0 at night leaves it dark.
function buildThemeAuto(p = {}) {
  const on = isOn(p.on);
  const w = new RS.World({ strict: true, sky: on ? 15 : 0 });
  w.put(0, 0, -1, 'smooth_stone');
  w.put(1, 0, -1, 'smooth_stone');
  const detector = w.put(0, 0, 0, 'daylight', { level: on ? 15 : 0, inverted: false });
  const lamp = w.put(1, 0, 0, 'lamp', { lit: on });
  w.seal();
  return { world: w, box: [0, 1, 0, 0, -1, 0], io: { detector, lamp } };
}

const T = (name, fn) => ({ name, fn });
const t = () => ui().testing;

Catalogue.register({
  id: 'ui-theme',
  name: 'Theme switch',
  category: 'Form controls',
  summary: 'A lever beside a redstone lamp. The page is light while the lamp is lit and dark while it is out; the choice is remembered.',
  strict: true,
  deviations: [],
  inputs: ['lever'],
  outputs: ['lamp'],
  actions: ['flip the lever'],
  timing: 'Lamp on in tick 1 after the lever is flipped on; off within 3 ticks of flipping it off (a lamp holds 2 ticks).',
  notes: ['The element sets data-theme on <html> when the lamp changes, and stores it in localStorage ("rs-theme").', 'Build with { on: true } for a lit lamp (light theme).'],
  params: [],
  controls: [{ kind: 'lever', io: 'lever', label: 'Lever' }],
  build: buildTheme,
  tests: [
    T('the lamp follows the lever within the documented ticks', () => {
      const c = buildTheme({}), w = c.world, hand = t().hand(w);
      hand.flip(c.io.lever);
      const on = t().ticksUntil(w, () => c.io.lamp.lit, 5);
      hand.flip(c.io.lever);
      const off = t().ticksUntil(w, () => !c.io.lamp.lit, 5);
      return on === 1 && off >= 1 && off <= 3;
    }),
    T('an on/off cycle returns every block to its start', () => {
      const c = buildTheme({}), w = c.world, hand = t().hand(w), h0 = t().hash(w);
      hand.flip(c.io.lever);
      t().settle(w);
      hand.flip(c.io.lever);
      t().settle(w);
      return t().hash(w) === h0;
    }),
    T('no drift for 100 ticks, light and dark', () => [false, true].every(on => t().noDrift(buildTheme({ on }).world, 100) && !!buildTheme({ on }).io.lamp.lit === on)),
    T('strict, no pistons', () => t().strictWorld(buildTheme({}).world, RS) && t().pistonCount(buildTheme({}).world) === 0),
  ],
});

Catalogue.register({
  id: 'ui-theme-auto',
  name: 'Theme switch (auto)',
  category: 'Form controls',
  summary: 'A daylight detector beside a redstone lamp: by day the lamp is lit and the page is light, at night it is dark. The sky light follows the system colour scheme.',
  strict: false,
  deviations: [
    'The sky light is not a player action: the element sets world.sky (the engine\'s environment input that daylight detectors read) to 15 or 0 from prefers-color-scheme. world.hand has no way to change the light a detector sees (in the game a player would cover it with a block).',
  ],
  inputs: ['sky light (environment)'],
  outputs: ['lamp'],
  actions: [],
  timing: 'Lamp on in tick 1 after the sky turns bright; off within 3 ticks of it turning dark.',
  notes: ['There is no lever: the system colour scheme decides, and the element is not focusable.', 'Build with { on: true } for daylight.'],
  params: [],
  controls: [],
  build: buildThemeAuto,
  tests: [
    T('the lamp follows the sky within the documented ticks', () => {
      const c = buildThemeAuto({}), w = c.world;
      w.sky = 15;
      const on = t().ticksUntil(w, () => c.io.lamp.lit, 5);
      w.sky = 0;
      const off = t().ticksUntil(w, () => !c.io.lamp.lit, 5);
      return on === 1 && off >= 1 && off <= 3;
    }),
    T('day then night returns every block to its start', () => {
      const c = buildThemeAuto({}), w = c.world, h0 = t().hash(w);
      w.sky = 15;
      t().settle(w);
      w.sky = 0;
      t().settle(w);
      return t().hash(w) === h0;
    }),
    T('no drift for 100 ticks, day and night', () => [false, true].every(on => t().noDrift(buildThemeAuto({ on }).world, 100) && !!buildThemeAuto({ on }).io.lamp.lit === on)),
    T('real blocks only, no wiring links, no pistons', () => t().strictWorld(buildThemeAuto({}).world, RS) && t().pistonCount(buildThemeAuto({}).world) === 0),
  ],
});

if (N) module.exports = { buildTheme, buildThemeAuto };
else Object.assign(window, { buildTheme, buildThemeAuto });
})();
