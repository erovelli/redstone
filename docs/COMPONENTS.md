# Writing a component

This is the guide for adding an `<rs-*>` element. Read `docs/SPEC.md` first (sections 3, 4, 6 and 7 above all). A component is four files plus tests, and you should not need to touch any shared file:

| File | What it holds |
|---|---|
| `src/contraptions/ui/<name>.js` | The contraption: a builder and its `Catalogue.register` entry with tests. Runs in Node and in the browser. |
| `src/ui/components/<name>.js` | The element: one `Redstone.ui.define(tag, spec)` call. Usually 30 to 60 lines. |
| `src/ui/components/<name>.css` | Optional page CSS: the box the element reserves before the script runs. |
| `pages/demos/<name>.html` | The docs gallery section: a live example. The build and the docs page add everything else. |
| `test/ui/<name>.test.js` | Tests of the element's spec beyond the catalogue entry's own tests. |

The build discovers all of them; there is no manifest to edit. Each source file is evaluated in its own block scope in the bundle, so top-level names cannot collide; share things only through `window.RS`, `window.Catalogue` and `window.Redstone`.

## The rule you build around

**An input is a player action through `world.hand`. Properties, attributes and events change only when the contraption's output changes.** A click handler never sets `checked`; it flips a lever. The core reads your outputs after every tick and turns changes into attribute updates, ARIA updates, events and announcements. You write two functions per output: `read` (blocks to value) and, if page code may set it, `set` (value to player action).

## 1. The contraption

```js
// src/contraptions/ui/toggle.js (abridged; read the real file)
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);   // lazily: core loads after this file

function buildToggle(p = {}) {
  const w = new RS.World({ strict: true });
  // ... w.put(x, y, z, type, state) for every block, in the steady state the engine settles into ...
  w.seal();
  return { world: w, box: [x0, x1, y0, y1, z0, z1], io: { lever, lamp, signs } };
}

Catalogue.register({
  id: 'ui-toggle', name: 'Toggle switch', category: 'Form controls',
  summary: 'One or two sentences: the mechanism. The docs page shows this.',
  strict: true, deviations: [],
  inputs: ['lever'], outputs: ['lamp'], actions: ['flip the lever'],
  timing: 'Lamp on within 1 tick of flipping the lever on; off within 3 ticks of flipping it off.',
  notes: ['...'],
  params: [{ key: 'signs', label: 'Label signs', min: 0, max: 6, def: 2 }, { key: 'dust', label: 'Dust line', min: 1, max: 4, def: 2 }],
  controls: [{ kind: 'lever', io: 'lever', label: 'Lever' }],     // for the workbench
  build: buildToggle,
  tests: [ /* see "Tests" below */ ],
});
})();
```

Rules for builders:

- Coordinates: x east, y toward the viewer, z up. The camera sees front faces (y+) and top faces (z+). Keep the machine shallow: every row of depth adds 0.72 of a block of height.
- Strict: `new RS.World({ strict: true })` and `w.seal()` at the end. Real blocks only (SPEC 5.2); no `ground`, `wall`, `wallb`, no `world.floor`, no `buried`. Write the steady state the engine itself settles into, including derived state such as dust levels (`lvl`) and lamps (`lit`), so `testing.noDrift` passes from the first tick.
- Use `category` from SPEC section 6 (`Navigation`, `Disclosure and overlays`, `Form controls`, `Feedback`, `Display`). The docs sidebar groups by it.
- `io` holds block objects (or arrays of them). Name the label signs `signs` by convention, and any opening a list of cells in the built object (`opening: [[x, y, z], ...]`).
- Boolean params are attribute presence, so they must default to `false`. A param that only the element sets (such as a start state) need not be in `params`; document it in `notes`.
- Builders must accept strings too (`p.on === true || p.on === 'true'`): the workbench passes option values as strings.

## 2. The element: `Redstone.ui.define(tag, spec)`

The complete rs-toggle (`src/ui/components/toggle.js`):

```js
Redstone.ui.define('rs-toggle', {
  entry: 'ui-toggle',
  params: {
    on: { attr: 'checked', type: 'boolean', doc: 'Start on. After that the attribute mirrors the lamp.' },
    dust: 'length',
    signs: (el, ctx) => ctx.signsFor(ctx.text, { min: 0 }),
  },
  label: 'beside',
  controls: [
    { io: 'lever', act: 'flip', role: 'switch', area: ['lever', 'signs'], aria: { checked: 'checked' } },
  ],
  state: {
    checked: {
      read: io => !!io.lamp.lit,
      attr: 'checked',
      event: ['input', 'change'],
      set: (hand, io, value) => { if (!!io.lever.on !== value) hand.flip(io.lever); },
      announce: (on, el) => `${el.label} ${on ? 'on' : 'off'}`,
      doc: 'True while the lamp is lit. Setting it flips the lever.',
    },
  },
  form: { value: el => (el.checked ? el.getAttribute('value') || 'on' : null) },
  docs: { attributes: { name: 'Form field name.', value: 'Submitted while checked (default "on").' } },
});
```

### Spec reference

| Field | Type | Meaning |
|---|---|---|
| `entry` | string or entry object | Catalogue id to build (an unregistered entry object works for test elements). |
| `params` | `{ paramKey: mapping }` | How the builder's params come from the element. Missing keys use the entry's defaults. |
| `label` | io key or `'beside'` | An io key places the light-DOM text (the default slot) on those sign blocks. `'beside'` sets it next to the machine as ordinary page text, like a native label; clicking it operates the primary control. Use `'beside'` for inline form controls and signs when the text is part of the machine (see SPEC I3). |
| `labelSlot` | string | With `label: 'signs'`: put this named slot on the signs instead of the default slot, so the default slot can go through an opening (rs-collapse: `slot="summary"`). |
| `labelFallback(el)` | function | Text shown on the signs while nothing is slotted into `labelSlot` (for example a `summary` attribute). |
| `readLabel` | boolean | Keep the sign text (`label: 'signs'`) readable to screen readers, for elements whose text is content rather than a control's name (chips, badges). Default: hidden, because the controls carry it. |
| `host` | `{ role, aria }` | Role and ARIA on the element itself, through `ElementInternals` (attributes as a fallback): `role` is a string or `el => string`; `aria` maps `ElementInternals` names without the `aria` prefix (`valueNow`, `busy`, `label`) to a state key or `(state, el) => value` (`null` removes it). For elements with no control of their own (`progressbar`, `status`). |
| `opening` | object or array | Slotted content shown through a world opening; see below. |
| `controls` | array | Focusable controls over interactive blocks; see below. |
| `state` | `{ key: output }` | Outputs: each becomes a property (and optionally an attribute, events, an announcement). |
| `form` | `{ value(el) }` | Form value after every state change (`null` = not submitted). Elements are always form-associated. |
| `changed(el, change)` | function | Runs after a change's events were dispatched (not for silent changes). `change.dispatched` holds the events, so you can honour `defaultPrevented` (rs-button submits its form here). |
| `mounted(el, view, built)` | function | Runs after the view is (re)mounted: add the element's own overlays to `el.shadowRoot` (rs-slider's drag handler, rs-input's text field). |
| `sync(el, state)` | function | Runs after every state change, silent ones (a property set from page code) included, so those overlays follow the state. |
| `methods` | `{ name: function }` | Extra prototype methods (`this` is the element). A method that performs a player action calls `this.perform((hand, io, built) => ...)`: like a control, it is ignored while disabled and settles at once with reduced motion (rs-modal's `showModal()`, its page-wide `data-rs-open` triggers). |
| `styles` | CSS string | Extra CSS inside the shadow root. Parts: `box`, `stage`, `label`, `window`, `control`. |
| `observe` | string[] | Extra attributes that rebuild the contraption when they change. |
| `docs` | `{ attributes, properties, events }` | Extra `{ name: description }` rows for the docs tables. |

**`params` mappings** (`paramKey` is the builder's param key):

- `'length'`: read attribute `length`, typed from the catalogue param (`min`/`max` numbers are rounded and clamped, `options` must match, boolean options are presence).
- `{ attr: 'checked', type: 'boolean' | 'number' | 'string', doc }`: for params the catalogue entry does not declare, or to give a doc string.
- `(el, ctx) => value`: computed. `ctx` is `{ el, B, text, measure(text), signsFor(text, { min, max }) }`. `ctx.text` is the trimmed light-DOM text; `ctx.signsFor` is how many sign blocks that text needs at the sign font. Computed params are recomputed on slot changes, resizes and font loads; the contraption is rebuilt only if a value changed.

Changing a mapped attribute rebuilds the contraption from scratch (a new world). An attribute that is also a state `attr` (like `checked`) is read only at build time; later changes to it go through the state's `set`.

**`controls`**: each becomes a real `<button>` in the shadow root, positioned over the union of the cells of its `area` blocks (default: its `io` block) and following them when pistons move them; it is hidden if its block is gone.

| Field | Meaning |
|---|---|
| `io` | The interactive block. |
| `act` | A `world.hand` method name called with that block (`'flip'`, `'press'`, `'step'`, ...), or `(hand, io, built, key) => ...` for anything else. |
| `role` | ARIA role: `button` (default), `switch`, `checkbox`, `radio`, `tab`, `slider`, ... |
| `aria` | `{ checked: 'stateKey' }`, `{ expanded: 'open' }`, `{ valuenow: (state, el) => ... }`: ARIA attributes kept in sync with state. |
| `area` | io keys whose blocks form the hit area (for example the button and its label signs). |
| `label` | Accessible name: string or `el => string`. Default: `aria-label`, else the light-DOM text, else the `<label>` text. |
| `keys` | `{ ArrowUp: act, ArrowDown: act }`: extra keys (the default prevented). Space and Enter already click a button. |
| `hover` | `{ enter, leave }` actions (names or functions, like `act`) for a control the pointer stands on: the pointer over the element, or focus inside it, is `enter`; leaving both is `leave`; a touch tap is `enter` and tapping elsewhere is `leave` (rs-spoiler's pressure plate). |
| `primary` | This control is the one a `<label for>` click or `el.click()` operates (default: the first). |

**`state` outputs**:

| Field | Meaning |
|---|---|
| `read(io, built)` | Required. The value from the blocks. Called after every tick. |
| `attr` | Reflect to this attribute (boolean: presence; other: string; `null`: removed). |
| `event` | Event type or list fired when it changes: `click` is a `MouseEvent` (composed, cancelable); others are `CustomEvent`s with `detail: { key, value, prev }` (`input` is composed). |
| `when` | `'change'` (default), `'rise'` (false to true), `'fall'`. |
| `cancelable` | Its events are cancelable (check `change.dispatched[i].defaultPrevented` in `changed`). |
| `settle: false` | Setting the property does not settle the world at once: it wakes it, and the events fire as the output changes. For outputs driven by a redstone timer (a toast), where settling would run the timer out. |
| `set(hand, io, value, built)` | Makes the property writable: perform the player action that leads to `value`. The core then settles the world at once, so the getter returns the new value straight away, and fires no events (like native `checked`). Leave it out for read-only outputs. |
| `announce(value, el)` | Text for the live region when it changes from user input. |
| `doc`, `eventDoc` | Docs table text. |

Every boolean state is also exposed as a custom state (`rs-toggle:state(checked)` in CSS) where the browser supports it.

### The two ways HTML meets blocks (SPEC I3)

- **Text on a sign:** `label: 'signs'` puts the default slot over the union of the sign boards, one line, centred, at 0.4 of a block (`--rs-sign-font`, `--rs-sign-ink`). Size the sign row from the text with `signs: (el, ctx) => ctx.signsFor(ctx.text, { min: 0 })`. The text is `aria-hidden` there; the controls get it as their name.
- **Content through an opening:** `opening: { cells: 'opening', shownWhen: 'open', slot: 'content' }`. `cells` is a key of the built object (or `built => [[x, y, z], ...]`); the window covers the union of those cells' front faces and is revealed (and made non-inert) only while state `shownWhen` is truthy. So define that state from the blocks, for example `open: { read: (io, b) => b.opening.every(([x, y, z]) => !b.world.get(x, y, z)) }`. Omit `slot` to use the default slot (then do not also use `label`). Content larger than the opening scrolls; size the opening with a computed param. Clicks inside an opening reach the page normally. The docs page's `rs-demo-hatch` (in `pages/docs.html`) is a complete example.

### What the core does for you

Shadow root and canvas; building and settling the contraption; one shared 100 ms ticker for the page that skips quiet and off-screen worlds and wakes a world on input; drawing in-between frames only while something moves; `--rs-block` (12 to 48 px, default 24) per element and shrinking to fit the container; `inspect` (x-ray); reduced motion (an input settles the world at once and the final frame is drawn); block sounds when `Redstone.config.sound` is true; focus, keyboard and ARIA; live announcements; `ElementInternals` form value, `form`, `labels`, `formResetCallback` (rebuilds from the starting attributes) and `formDisabledCallback`; `disabled`; teardown on disconnect and a rebuild on reconnect; `element.contraption` (`{ world, io, entry, built, view, state }`); `element.refresh()` to re-read `--rs-block` after an ancestor's CSS changed.

An overlay that is not a control (a drag along a lamp bar, a native `<input>` over a sign) performs its player actions with `el.perform((hand, io, built) => ..., { event, settle })`: the same path as a control's `act` (`disabled`, reduced motion, waking the world); `settle: true` also settles the world and applies the state before it returns, so the element's events fire at once.

Raw pointer clicks on the machine (the canvas, the controls, sign text) never reach page listeners in the bubble phase; the element's own events come from its output. Clicks on slotted content shown through an opening are ordinary DOM clicks: they bubble to the page like any other (`Redstone.ui.clickStaysInside(path, root)` is the rule). (Capture-phase listeners above the element still see the raw click; that cannot be prevented.) `el.click()` and a click on a `<label for>` operate the primary control.

## 3. Accessibility checklist

- [ ] Every interactive block has a control with the right `role` and an accessible name (check `aria-label` in devtools).
- [ ] State is exposed with `aria` (`checked`, `pressed`, `expanded`, `selected`, `valuenow`), mirrored from the output, not the input.
- [ ] Fully operable by keyboard: Tab reaches each control, Space/Enter act, arrow keys via `keys` where the native element has them (sliders, radio groups, tabs).
- [ ] The focus ring is visible on the canvas at 12 and 48 px per block (it uses `--rs-focus`).
- [ ] `announce` says what changed in words, including the label (`"Lights on"`).
- [ ] `disabled` stops all player actions; the property mirrors the native element's.
- [ ] Without the script the light DOM is usable HTML: links are links, text is readable. Reserve the box in `<name>.css`.
- [ ] Reduced motion: the state still comes from the contraption (the core settles it); nothing in your file uses timers.

## 4. The demo fragment

`pages/demos/<name>.html` is one section. The build copies the markup between the markers into a copy-paste snippet, so the snippet is always the live example. The docs page adds the heading, the strict badge or deviations list, the mechanism (`summary`), the player actions, timing and keys (from the catalogue entry), the x-ray switch, an event log, and the attribute, property and event tables (from your spec). It groups sections by `category`.

```html
<section class="demo" data-tag="rs-toggle">
  <p>Optional: when to use it, in one or two sentences.</p>
  <!-- example -->
  <rs-toggle name="lights" checked>Lights</rs-toggle>
  <rs-toggle name="fan">Fan</rs-toggle>
  <!-- /example -->
</section>
```

Show the default, one or two variants (attributes), and `disabled` where it applies. Keep it under about 300 px wide per element so it works at 320 px. A `<form>` in the example is fine: the docs page logs submits instead of navigating.

## 5. Tests

`npm test` runs every catalogue entry's `tests` plus every `test/**/*.test.js`. Tests are deterministic: no timers, no randomness.

**Contraption tests** (in the entry; SPEC 7.2). Use the helpers in `Redstone.ui.testing` (Node: `require('../../ui/core.js').testing`):

```js
const t = ui().testing;
t.hand(world)                 // world.hand (player actions)
t.settle(world)               // run until quiet; throws if it never settles
t.hash(world)                 // state signature for "returns to start"
t.ticksUntil(world, () => cond, max)   // ticks until cond (first tick = 1), or -1
t.noDrift(world, 100)         // the built state does not change for 100 ticks
t.strictWorld(world, RS)      // real blocks, no feed/buried flags, no world.floor (throws with the reason)
t.pistonCount(world)
t.edges(entry)                // every combination of min, default, max and options
```

Cover, at every parameter edge: each input gives the documented output within the documented ticks; a full use cycle returns `hash` to its start; no drift (in every start state); `strictWorld`; and the push limit by construction (count what each piston can move). See `src/contraptions/ui/toggle.js` and `button.js`.

**Element tests** (`test/ui/<name>.test.js`) drive your spec headlessly through the same `Controller` the element wraps:

```js
const { loadComponent, controller, untilChange } = require('./helpers.js');
const spec = loadComponent('toggle');                 // captures the define() call
const ctl = controller(spec, { checked: '' }, { text: 'Lights' });   // attributes, light-DOM text
ctl.act(spec.controls[0]);                            // a player action through the control
const { ticks, changes } = untilChange(ctl);          // [{ key, value, prev, events }]
ctl.request('checked', false); ctl.settle();           // what `el.checked = false` does
```

A test file exports `{ suite: 'rs-name', tests: [{ name, fn }] }`; `fn` returns truthy or throws.

**In a browser.** Build and screenshot your gallery section, then look at the image:

```
node scripts/shot.js toggle                      # 1280 px, light
node scripts/shot.js toggle --width 320 --dark   # narrow, dark
node scripts/shot.js toggle --inspect            # x-ray on
node scripts/shot.js page --page                 # the top of the docs page
```

It prints the PNG path (in the system temp directory unless `--out`) and exits 1 on console errors. Check keyboard-only use, 12 and 48 px (`style="--rs-block: 12px"`), light and dark, and x-ray. `npm run test:browser` is the smoke test for the reference components (needs Playwright; not in CI); copy its patterns if you want one for your element.

## 6. Checklist before you report

- [ ] `npm test` and `npm run build` pass; `node scripts/shot.js <name>` has no console errors.
- [ ] The entry is `strict: true` with `deviations: []`, or lists every gap honestly.
- [ ] The component file is well under 100 lines and contains no timers, no `world.set/put/shift`, and no writes to block state.
- [ ] Screenshots at 320 and 1280 px, light and dark, x-ray, looked at.
- [ ] No shared file changed (or each change listed in your report).
