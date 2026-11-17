# Redstone UI: specification

This is the working spec for turning the redstone kit into a drop-in UI library. Every contributor (human or agent) works from this file. If something here is wrong or blocks you, say so in your report instead of quietly working around it.

## 1. Goal

A website author adds one script tag and writes ordinary-looking HTML:

```html
<script src="redstone-ui.js"></script>

<rs-navbar><a href="/">Home</a><a href="/docs">Docs</a></rs-navbar>
<rs-toggle name="lights" checked>Lights</rs-toggle>
<rs-collapse summary="Shipping"><p>Ships in two days.</p></rs-collapse>
<rs-chip dismissible>redstone</rs-chip>
```

Each element is a working redstone contraption. The contraption is not decoration laid over a normal widget: **the contraption is the widget's state machine.** A click is a player action (flip a lever, press a button). The DOM state changes (`checked`, `open`, a `change` event, a navigation) when, and only when, the contraption's output changes (the lamp lights, the door is clear, the pearl hits the target).

Two things make or break the idea:

- **Rule-true.** Someone who knows redstone should be able to rebuild any component block for block in Minecraft Java 1.21 and see it work the same way. Section 3 defines this precisely and the test suite enforces it.
- **Immersion.** One texture library, one scale, one camera, no canvas tricks, no invented blocks. Section 4.

## 2. Where we are (audit, start of this work)

What exists:

| Piece | State |
|---|---|
| Engine (`src/engine.js`) | One 260-line tick engine. Dust, torches, repeaters, comparators, observers, pistons, slime/honey, sculk, items/pearls, water/bubble columns. Works, 96 tests pass. |
| Renderer (`src/render.js`) | Fixed oblique camera (front + top faces), procedural 16x16 sprites, depth tint, ghosting. |
| Catalogue (`src/catalogue.js`) | 22 entries: gates, latches, clocks, comparators, sculk latch, plate reveal, flying machine, split door, 2x2 doors, hidden plaque, pearl launcher. |
| Site (`pages/`) | A workbench for the catalogue. Its nav bar (pearl launcher) and theme switch (lever and lamp) are the only two places a contraption acts as UI, and both are hand-wired page code. |

What is wrong or missing, in order of importance:

1. **There is no component layer.** Nothing can be dropped into another page. `dist/redstone.js` exposes six globals and the author must build a world, start a timer, create a view and position hit areas by hand. Zero of the usual UI elements exist as components.
2. **The flagship nav bar is mostly scripted.** In `buildHiddenLauncherNav` the covers, the carriage and the firing redstone blocks are moved by a JavaScript controller calling `world.shift` directly ("standing in for a hidden extender"). The phases are sequenced by JS, not by repeaters. The soul-sand piston is held by a hidden lever through a wiring link. The dispenser is fired by a function call, not by power. Note blocks "play" when JS says so, and they sit in a solid wall (a real note block is silent unless the block above it is air). The water stands in open air with nothing containing it. Hidden helper blocks are flagged `buried` so the renderer skips them.
3. **Wiring links (`world.floor`).** A feed block teleports strong power to listed cells. Used by the split door, hidden door, hidden plaque and all three launchers. This is not redstone.
4. **Invented blocks.** `wall`, `wallb` and `ground` are immovable blocks that look like bricks or floor. Real stone bricks move with slime. Several designs only work because of these.
5. **Block properties are ad hoc whitelists.** `MOVABLE` and `CONDUCT` miss real properties (wool, planks, note blocks, dispensers and soul sand do conduct; glass is movable; glazed terracotta is not modelled; dust, torches and levers in a piston's path block it instead of breaking).
6. **Missing or simplified rules** that designs rely on: no quasi-connectivity, no dust on slopes, dust does not power the block under it, repeaters do not lock or stretch short pulses, lamps turn off after 1 tick instead of 2, comparators read only barrels, no torch burnout.
7. **Textures are not a library.** Sprites live inside `cubeArt`/`flatArt` switch statements, and the nav view paints water, buttons, the pearl and note particles with bespoke canvas calls. Levers and trapdoors are drawn inline too. A new block means editing the renderer.
8. **Global state.** One global block scale (`RSR.setScale`), `window.__T`, a global tick clock, six window globals. Two components at different sizes on one page fight each other.
9. **Packaging.** Python is needed to build a JavaScript library. No CSS file, no docs page with copy-paste snippets, no license (the README says "Not yet chosen"; that is the owner's call and blocks real reuse).

## 3. The rules contract

Target: **Minecraft Java Edition 1.21**. A contraption that honours all of R1 to R6 is **strict**. The goal is that every UI component is strict.

- **R1. Real blocks only.** Every block is a vanilla block with its vanilla movability, conductivity and stickiness. No `wall`, `wallb`, `ground`. If a design needs a block that slime slides past, use a real one: obsidian, a block entity (furnace, jukebox, barrel, dispenser, hopper, lectern, sign), or glazed terracotta (pushable, never sticks).
- **R2. Power comes only from propagation.** No `world.floor` links. No code sets `lit`, `on`, `ext`, `lvl` or `out` on anything after the build. The steady state a builder writes (an extended piston with its head, a lit torch) must be the state the engine itself settles into; a test runs the world and checks nothing drifts.
- **R3. Blocks move only because a powered piston moved them.** No `world.shift`, `world.set` or `world.put` from component code once the world is sealed. If one piston cannot reach, build the extender.
- **R4. Time comes from redstone.** Sequencing is repeaters, torches, comparators, observers, hopper timers. No `setTimeout`, no phase machine in JavaScript deciding when a piston fires. JavaScript may *watch* the world and react to it (update the DOM, play a sound, navigate); it may not *drive* it.
- **R5. The only thing code may do to a sealed world is a player action**, through `world.hand`: flip a lever, press a button, stand on or leave a pressure plate, make a vibration, put items into or take them out of a container, turn a lectern page, rotate an item frame, set a repeater delay or comparator mode, tune a note block, write on a sign, throw an ender pearl, use a bucket. These are things a player's hand can do. Pointer and keyboard events map to them. Each component lists its player actions.
- **R6. Nothing is hidden by fiat.** No `buried` flags and no `skip` callbacks that hide helper blocks. A block is out of sight only because other blocks are in front of it from the fixed camera. Every component must look right in **inspect mode** (x-ray), which ghosts the covering blocks and shows all the wiring.

Known engine simplifications (acceptable, must stay documented in the README): one update pass per redstone tick in fixed order, so Java's block-event order, 0-ticks and BUD state are not modelled; quasi-connectivity is level-triggered (a piston, dropper or dispenser is powered if the cell above it would be, re-evaluated every tick); entities are points; sculk strength is approximated. A design must not depend on behaviour the engine cannot model.

If a component cannot meet a rule yet, it declares each gap in its catalogue entry (`deviations: ['...']`) and is not marked strict. Deviations are shown on the docs page. An empty list is the goal; an honest non-empty list is acceptable; an undeclared deviation is a bug.

### Rulebook (what the engine must get right)

Power
- Dust: 15 at the source, minus 1 per block. Connects to dust, to the front/back of repeaters and comparators, to power sources, target blocks and observer outputs, and up or down one block step (cut when a conductive block sits directly above the lower dust). A lone dust is a cross and powers all four sides. Dust weakly powers the block it sits on and the blocks it points into.
- Strong power: a repeater or comparator output, a torch (block above it), a lever or button (the block it is attached to), a pressure plate (the block under it), an observer (the block behind its output). A strongly powered conductive block powers adjacent dust; a weakly powered one does not, but both activate adjacent components.
- Torch: flips 1 tick after its block changes; never powers the block it is on; burns out after 8 flips in 60 game ticks.
- Repeater: 1 to 4 ticks, one way, stretches a short pulse to its delay, locks when a powered repeater or comparator points into its side.
- Comparator: 1 tick. Compare and subtract modes. Rear reads a signal or a container (also through one conductive block). Sides take dust, repeaters, comparators and redstone blocks.
- Observer: 1 tick after the watched block changes, a 1-tick pulse from the back. Fires when moved by a piston.
- Redstone lamp: on at once, off 2 ticks after power is lost.
- Copper bulb: toggles on each rising edge; a comparator reads 15 while lit; not conductive.
- Note block: plays on a rising edge only if the block above is air; pitch 0 to 24; movable.
- Dispenser, dropper: act on a rising edge, 2 ticks later. Hopper: one item per 4 ticks, locked while powered. All immovable.
- Target: redirects dust; a projectile hit (ender pearls included) emits a signal for 4 ticks.
- Stone button 10 ticks, wooden 15. Pressure plates release up to 10 ticks after the entity leaves.

Pistons
- Push limit 12. A piston cannot be powered through its face. An extended base is immovable.
- Push classes: `normal`; `immovable` (obsidian, bedrock, all block entities, extended piston bases); `destroy` (dust, torches, repeaters, comparators, levers, buttons, plates, doors: they pop off as items; water is displaced); `push_only` (glazed terracotta: can be pushed, cannot be pulled, never sticks).
- Slime and honey drag adjacent `normal` blocks, transitively, counting toward 12. They do not stick to each other, to `push_only` blocks or to immovable blocks. They slide past those, but if any block of the moving structure has an immovable block directly in its path, the whole move fails.
- A sticky piston that gets a 1-tick pulse leaves its block behind.
- A block attached to a moved block (sign, torch, button, lever) pops off.
- A slime block pushed into an entity launches it along the push. Slime conducts; honey does not.

Fluids and entities
- A water source needs containing on every open side or it flows. Water on soul sand is an upward bubble column; on magma, downward. A pearl in an upward column is in stasis.
- Ender pearls are thrown by players only (a dispenser drops them as items). A dispenser with an empty bucket picks up a source in front of it; with a water bucket it places one.

## 4. Immersion rules

- **I1. One texture library.** Every pixel on a component canvas comes from the texture atlas through a block or entity model. No component calls canvas drawing functions.
- **I2. One scale, one camera.** A block is `--rs-block` CSS pixels square (default 24) for everything on that component. The camera is the fixed oblique view (front face plus top face).
- **I3. Text lives on text blocks or behind openings.** A label is on a sign, a hanging sign or a lectern book. Larger page content (an accordion body, a dialog) is ordinary HTML shown *through* a real opening the contraption makes (a door, pulled covers, glass). HTML is never painted over the front of blocks as if it were part of them, except on those text blocks.
- **I4. Motion is the engine's motion.** Sprites interpolate between engine states (a piston stroke is one tick). No CSS transitions pretending to be machinery.
- **I5. Sound is block sound.** Piston, click, note block, bell, bucket: synthesised (no game assets), only after a user gesture, off under `prefers-reduced-motion`, and controlled by `Redstone.config.sound` (default `false` in the library; the docs site turns it on).
- **I6. Reduced motion.** With `prefers-reduced-motion: reduce`, an input settles the world at once (`world.settle()`) and the final frame is drawn. State changes still come from the contraption.

Textures: the bundled atlas is original pixel art that uses **vanilla texture names and layout** (16x16, `block/piston_side`, `block/redstone_lamp_on`, ...). Mojang's textures are not redistributable, so they are not bundled; because the names match, an author who has a resource pack can point the library at it (`Redstone.textures.usePack(url)`).

## 5. Architecture

```
src/engine.js                 World, block registry, power, pistons, entities, hand, events, export
src/blocks/*.js               extra block definitions (engine behaviour + model), one block per file, self-registering
src/contraptions/*.js         legacy builders (pre-strict), kept working
src/contraptions/ui/<name>.js UI contraption: builder(s) + Catalogue.register(entry). Runs in Node and in the browser.
src/catalogue.js              legacy entries, registry (register, get), generic tests
src/index.js                  Node entry: engine, blocks, catalogue, ui contraptions
src/textures.js               the atlas: named 16x16 textures, pack loader
src/render.js                 models, views, inspect mode, sprites from the atlas
src/ui/core.js                custom-element base, ticker, visibility, a11y, events, forms, sound
src/ui/components/<name>.js   one custom element per file: binds a UI contraption to the DOM
pages/                        docs site (component gallery with snippets), workbench, texture sheet
pages/demos/<name>.html       one gallery section per component (auto-included)
test/run.js                   catalogue tests + every test/**/*.test.js suite
test/engine/*.test.js         engine rule tests
test/ui/<name>.test.js        per-component tests beyond the catalogue entry
scripts/                      build, screenshots, export
docs/SPEC.md, docs/COMPONENTS.md   this file; the component authoring guide (written with the UI core)
```

Browser bundle load order (the build discovers files; nobody edits a manifest): `engine.js`, `blocks/*.js`, `contraptions/*.js`, `catalogue.js`, `contraptions/ui/*.js`, `textures.js`, `render.js`, `ui/core.js`, `ui/components/*.js`. Files in a directory load in name order and must not depend on each other's load order.

Outputs: `dist/redstone-ui.js` (everything; one global, `window.Redstone`), `dist/redstone-ui.css` (also injected by the script unless `data-rs-no-style` is on the script tag), `dist/index.html` (docs), `dist/catalogue.html` (workbench). Zero runtime dependencies, zero build dependencies beyond Node 18.

Isomorphic files (`engine`, `blocks`, `contraptions`, `catalogue`) keep the existing pattern: `const RS = typeof module !== 'undefined' ? require('../engine.js') : window.RS;`. Legacy globals (`RS`, `RSR`, `Catalogue`, `Logic`, `Scenes`, `build*`) may stay for the workbench but are internal; the public API is `window.Redstone`.

### 5.1 Engine contract

Block objects stay plain: `{ t, x, y, z, ...state }`. Coordinates: x east, y toward the viewer (south), z up. Existing short type ids stay (`piston` with `s:true` for sticky, `lamp`, `rblock`, `dust`, ...).

```js
RS.defineBlock(type, {
  mc,            // 'minecraft:redstone_lamp' or b => 'minecraft:sticky_piston[facing=up]'  (for export)
  conductive,    // bool: opaque solid that can be powered
  solid,         // bool: entity collision
  push,          // 'normal' | 'immovable' | 'destroy' | 'push_only'
  sticky,        // 'slime' | 'honey' | undefined
  fake,          // true only for legacy wall/wallb/ground; strict worlds reject them
  emits(world, b, toward) -> 0..15,      // optional: power source behaviour
  tick(world, b, now),                   // optional: per-tick behaviour
  analog(world, b) -> 0..15,             // optional: comparator reading
  onPower(world, b, rising),             // optional: edge-triggered behaviour
});
RS.blocks                                 // type -> definition

const w = new RS.World({ strict: true });
w.put(...)                                // build phase
w.seal();                                 // strict: from here put/set/shift/floor throw unless the engine or w.hand calls them
w.hand.flip(lever) / .press(button) / .step(plate, on) / .vibrate(x,y,z) / .fill(container, n) / .page(lectern, n)
      / .rotate(frame) / .delay(repeater, n) / .mode(comparator, m) / .tune(noteblock, n) / .write(sign, text)
      / .throwPearl(x,y,z, vx,vy,vz) / .use(...)          // R5: the complete list of legal mutations
w.on('sound' | 'move' | 'pop' | 'hit', fn)                // { name, x, y, z, ... }: observers only, never drivers
w.settle(max = 400) -> ticks                              // run until quiet; throws if it never settles (e.g. a clock) unless told to stop early
w.quiet                                                   // true when nothing changed last tick and nothing is scheduled
w.hash()                                                  // deterministic state signature, for tests
w.toCommands({ origin }) -> string[]                      // /setblock commands that rebuild it in Java 1.21
w.rules = { qc: true, ... }                               // edition switches
```

Legacy (non-strict) worlds keep working exactly as today, so the existing catalogue stays green while components migrate.

### 5.2 Block palette v1

State fields are the contract between engine and renderer. `d` is a facing (`N E S W U D`), `att` is the direction of the block a component is attached to.

| type | vanilla block | push | conductive | state |
|---|---|---|---|---|
| `stone`, `bricks`, `planks`, `smooth_stone`, `iron`, `quartz` | stone, stone_bricks, oak_planks, smooth_stone, iron_block, quartz_block | normal | yes | |
| `wool`, `concrete` | `<color>_wool`, `<color>_concrete` | normal | yes | `color` |
| `glass` | glass | normal | no | |
| `terracotta` | `<color>_glazed_terracotta` | push_only | yes | `color`, `d` |
| `obsidian` | obsidian | immovable | yes | |
| `slime`, `honey` | slime_block, honey_block | normal, sticky | slime yes, honey no | |
| `rblock` | redstone_block | normal | no (source) | |
| `lamp` | redstone_lamp | normal | yes | `lit` |
| `bulb` | copper_bulb | normal | no | `lit`, `powered` |
| `target` | target | normal | yes | `out` |
| `noteblock` | note_block | normal | yes | `note`, `powered` |
| `jukebox`, `barrel`, `furnace`, `chest` | same | immovable | yes | `fill` (containers), `d` |
| `dispenser`, `dropper`, `hopper` | same | immovable | yes (hopper no) | `d`, `items`, `powered` |
| `lectern` | lectern | immovable | no | `d`, `page`, `pages` |
| `bookshelf` | chiseled_bookshelf | immovable | yes | `d`, `slots`, `last` |
| `bell` | bell | immovable | no | `att`, `ringing` |
| `sign` | oak_wall_sign / oak_sign / oak_hanging_sign | immovable, pops off if its block moves | no | `att`, `text`, `kind` |
| `piston`, `head` | piston / sticky_piston, piston_head | normal (immovable while extended) | no | `d`, `s`, `ext` |
| `observer` | observer | normal | no | `d`, `on` |
| `dust`, `torch`, `repeater`, `comparator` | redstone_wire, redstone_(wall_)torch, repeater, comparator | destroy | no | as today, plus `locked` |
| `lever`, `button`, `plate` | lever, stone_button / oak_button, stone / oak pressure_plate | destroy | no | `att`, `on`, `wood` |
| `door`, `trapdoor`, `gate` | iron_door, (iron_)trapdoor, oak_fence_gate | destroy / normal | no | `d`, `open`, `half`, `iron` |
| `daylight` | daylight_detector | immovable | no | `level`, `inverted` |
| `sculk` | sculk_sensor | immovable | no | as today |
| `soulsand`, `magma` | soul_sand, magma_block | normal | yes | |
| `water` | water | displaced | no | |
| `wall`, `wallb`, `ground` | none (legacy) | immovable | yes | `fake: true` |

A component that needs a block outside this table adds `src/blocks/<type>.js` with `RS.defineBlock` and, guarded by `typeof window`, its model and textures.

### 5.3 Texture and renderer contract

```js
Redstone.textures.define('block/redstone_lamp_on', paint)   // paint(ctx16, px) draws a 16x16 texture
Redstone.textures.get(name) -> canvas                        // unknown name: the magenta-and-black missing texture
Redstone.textures.usePack(baseUrl)                           // load <baseUrl>/assets/minecraft/textures/<name>.png over the defaults
RSR.defineModel(type, model)                                 // { kind: 'cube', faces: b => ({ top, front }) }
                                                             // { kind: 'flat' | 'attached' | 'cross' | 'custom', ... }
RSR.makeView(stage, built, { B, T, inspect, ... }) -> view   // per-view scale; no global scale needed
view.rectOf(block | [x,y,z], face) -> { x, y, w, h }         // CSS px inside the stage: for hit areas, sign text, content windows
view.setInspect(bool)
```

Everything currently painted by hand (water, wall buttons, levers, trapdoors, pearls, note particles, bubbles) becomes a model or an entity/particle sprite from the atlas. The existing `RSR` API used by the workbench keeps working.

### 5.4 UI core contract

Each component is a custom element built on one base. The base owns: the shadow root (canvas stage plus slots), building the contraption, one shared 100 ms ticker for all components on the page, sleeping worlds that are quiet or off-screen, resize, inspect mode (`inspect` attribute), reduced motion, sound, focus and keyboard, ARIA, form participation (`ElementInternals`), and teardown.

A component file supplies only: which catalogue entry to build and how attributes map to its params; which blocks are interactive and which `world.hand` action each performs; how outputs map to properties, attributes and events; where light-DOM content sits (on which sign, through which opening).

Requirements for every component:
- **Progressive enhancement.** Before the script runs, and if it never runs, the light DOM is usable HTML (links are links, content is readable). No flash of unstyled content beyond a reserved box.
- **Standard surface.** Properties and events mirror the native element it replaces (`checked` + `change`, `open` + `toggle`, `value` + `input`). Events fire when the contraption's output changes. `disabled` works.
- **Accessible.** Real focusable controls with names, correct roles and states, full keyboard operation, visible focus. The canvas is `aria-hidden`. State is announced when the output changes.
- **Self-contained.** No page CSS required. Sizing via `--rs-block`. Works at 12 to 48 px per block and inside a 320 px wide viewport.
- **Cheap when idle.** A quiet world is not ticked or redrawn.
- `element.contraption` exposes `{ world, io, entry }` for the curious.

The authoring guide with the exact API is `docs/COMPONENTS.md`.

## 6. Component list

Mechanism sketches are starting points, not orders. The designer may choose another mechanism if it is rule-true, compact and reads clearly. Keep contraptions small: an inline control should be a handful of blocks.

| Element | Replaces | Player action | Mechanism sketch | Commits when |
|---|---|---|---|---|
| **Navigation** | | | | |
| `rs-navbar` | nav bar | press a button | Ender pearl stasis chamber and slime launcher per link (existing flagship, to be made strict). The pearl should hit a target block; that signal is the navigation. | target block is hit |
| `rs-tabs` | tabs | press a button | Button per tab into a latch bank where setting one resets the others; each latch lights its lamp and opens its panel's cover. | that tab's latch is set and its opening is clear |
| `rs-breadcrumb` | breadcrumb | none | Signs along a dust and repeater trail; the signal walks out from the root, one repeater per crumb, and stops at the current page. | static |
| `rs-pagination` | pagination | turn a lectern page | Lectern with a comparator; signal strength selects the page; a lamp row shows it. | comparator output changes |
| `rs-steps` | stepper, timeline | flip a lever | Repeater delay line lighting one lamp per step (from `Scenes.timeline`). | each lamp lights |
| **Disclosure and overlays** | | | | |
| `rs-collapse`, `rs-accordion` | details/summary, collapsible bullets, accordion | flip a lever (the bullet) | Sticky pistons pull covers off an opening; content shows through it (from the hidden plaque). In an accordion, opening one closes the others through wiring. | opening is clear / closed |
| `rs-spoiler` | hover or click reveal | stand on a plate | Pressure plate pulls covers down (from `plate-reveal`). | covers are down |
| `rs-modal` | dialog | press a button | Latch opens a door across the page (flying-machine split door or piston door); the dialog is behind it; the close button resets the latch. | door fully open / closed |
| `rs-drawer` | offcanvas | flip a lever | Flying machine carries the panel edge. | machine parked |
| `rs-tooltip`, `rs-popover` | tooltip, popover | stand on a plate / press a button | A piston pulls a cover away from a sign (signs cannot be pushed). | cover is clear |
| `rs-dropdown` | dropdown menu | press a button | T flip-flop opens a column of covers over option signs. | covers are clear |
| **Form controls** | | | | |
| `rs-button` | button | press a stone button | Button, short line, lamp or note block. `click` fires on the output's rising edge. | output pulses |
| `rs-toggle` | switch | flip a lever | Lever, dust, lamp. | lamp changes |
| `rs-checkbox` | checkbox | press a button | Button into a copper bulb (a one-block T flip-flop). | bulb changes |
| `rs-radio` | radio group, segmented control | press a button | Latch bank with mutual reset; one lamp lit. | latch changes |
| `rs-slider` | range input (0 to 15) | add or remove items in a barrel | Comparator reads the fill; a dust line of lamps shows the strength. | comparator output changes |
| `rs-select` | select | press a button | Dropdown whose option buttons set a latch bank. | latch changes |
| `rs-input` | text input | write on a sign | An editable sign. | sign text changes |
| `rs-theme` | dark-mode switch | flip a lever | Lever and lamp; optional daylight detector for "auto". Sets `data-theme` on the page. | lamp changes |
| **Feedback** | | | | |
| `rs-progress` | progress bar | (value is set by the page: items in a barrel) | Comparator and a 15-step dust and lamp line; indeterminate is a clock chase. | comparator output changes |
| `rs-spinner` | loading spinner | none | Repeater ring or observer clock driving lamps. | n/a |
| `rs-toast`, `rs-alert` | toast, alert | (shown by the page: a button press) | Pulse rings a bell and pulls a cover off a sign; a repeater chain or hopper timer closes it again. | cover clear / closed |
| `rs-chip`, `rs-badge` | chip, tag, badge | press a button (dismiss) | A sign on a block with a lamp or torch for status. Dismiss: a piston moves the supporting block and the sign pops off. | sign popped |
| `rs-status` | status dot | none | A torch or lamp driven by an attribute-controlled lever. | lamp changes |
| **Display** | | | | |
| `rs-counter` | stat number | (value set by the page) | Seven-segment lamp digits decoded from signal strength. Stretch goal. | lamps settle |
| `rs-divider` | hr | none | A dust line; optionally a pulse runs along it. | n/a |
| `rs-card` | card, panel | none | A block frame with a content opening. | n/a |
| `rs-list` | bulleted list | none | Torch bullets on a block column. | n/a |
| `rs-carousel` | carousel | press a button | Piston feed tape cycling item blocks. Stretch goal. | tape at rest |

## 7. Definition of done for a component

1. `src/contraptions/ui/<name>.js`: a builder returning `{ world, box, io }` from a strict, sealed world, and a `Catalogue.register` entry with `strict: true` (or an honest `deviations` list), `inputs`, `outputs`, `timing`, `notes`, `actions` (the player actions it uses), `params`, `controls`, and tests.
2. Tests, at minimum: each input produces the documented output within the documented tick count; a full use cycle returns every block to its start (`world.hash()` equal); the built steady state does not drift when run for 100 ticks; it works at every parameter edge; it stays within the 12-block push limit by construction, not by luck.
3. `src/ui/components/<name>.js`: the element, following `docs/COMPONENTS.md`.
4. `pages/demos/<name>.html`: a gallery section with a live example, the copy-paste snippet, the attribute/event table and one line on how the mechanism works.
5. Checked in a real browser at 320 px and 1280 px wide, light and dark, keyboard only, and in inspect mode. Take screenshots and look at them.
6. `npm test` and the build both pass. No file outside your assignment is changed, except small fixes to shared code that you list in your report.

## 8. Conventions

- New files use ordinary readable formatting (one statement per line, named functions, short comments that say why). Do not imitate the dense one-line style of the legacy files, and do not reformat legacy files you are not rewriting.
- No dependencies. Plain ES2020, no build-time transforms.
- British or American spelling is fine; be consistent within a file. Plain prose in docs: say what it does.
- Tests are deterministic: no timers, no randomness.
- Do not push, do not open pull requests. Commit on the branch you were given.
- Report at the end, briefly: branch and commit, files added or changed, what works, every deviation from this spec, any change you need in a file you do not own, and what you would do next.
