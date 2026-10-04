# redstone

A 3D redstone tick engine with a catalogue of tested, parametric contraptions, a fixed-perspective renderer, and a browser test bench.

Each contraption is a standalone builder with named inputs and outputs, adjustable parameters, and automated tests that run against the same engine used for rendering. Contraptions can be embedded in any page by building them and handing the result to the renderer.

## Quick start

```
npm test          # runs every catalogue entry's tests (no dependencies)
npm run build     # writes dist/catalogue.html (self-contained site) and dist/redstone.js (library bundle)
```

Open `dist/catalogue.html` in a browser. Requires Node 18+ and Python 3.

## Layout

```
src/engine.js              World (3D tick engine) and shared sub-circuits: addLatch, addSequencer
src/render.js              Renderer: front + top faces, sprites, depth tint and ghosting, entities
src/catalogue.js           Registry: metadata, params, controls, build(), monitor(), tests
src/contraptions/          Builders: logic.js, scenes.js, door.js, pistondoor.js, hidden.js, plaque.js, launcher.js
pages/                     Catalogue site (hash-routed, single file after build)
test/run.js                Test runner
build.py                   Inlines everything into dist/catalogue.html; bundles the library into dist/redstone.js
```

## Catalogue

| Category | Entry (id) | Inputs | Outputs | Parameters |
|---|---|---|---|---|
| Toggles & logic | Lever and lamp (`lever-lamp`) | lever | lamp | |
| | Torch inverter (`inverter`) | lever | inverted lamp | |
| | OR gate (`or-gate`) | lever A, lever B | A OR B | |
| | AND gate (`and-gate`) | lever A, lever B | A AND B | |
| | XOR gate (`xor-gate`) | lever A, lever B | A XOR B | |
| | Torch RS latch (`rs-latch`) | set, reset | Q | |
| | T flip-flop (`t-flip-flop`) | button | toggling output | |
| | Open/close sequencer (`sequencer`) | lever | P1, P2, P3 | |
| Clocks & pulses | Observer pulse (`observer-pulse`) | lever | 1-tick pulse per change | |
| | Rising-edge detector (`edge-detector`) | lever | 1-tick pulse on rising edge | |
| | Torch clock (`torch-clock`) | stop lever, repeater delays | blinking lamp | |
| | Repeater delay line (`delay-line`) | lever, repeater delays | lamp per stage | stages |
| Signals | Comparator fill reader (`comparator-reader`) | barrel fill | signal 0 to 15 | fill |
| | Comparator subtractor (`comparator-subtractor`) | barrel A, barrel B | A - B, or A unless B is stronger | a, b, mode |
| Sensors | Sculk presence latch (`sculk-latch`) | vibrations, reset | Q (latched) | |
| Reveals | Pull-down cover reveal (`plate-reveal`) | pressure plate | one row revealed | width |
| Flying machines | 2-way flying machine (`flying-machine`) | lever | column position | cargo |
| | Flying-machine split door (`split-door`) | lever or sculk latch | opening 2L tall | width, cargo, trigger |
| Doors | 2x2 piston door (`piston-door-2x2`) | lever | 2x2 passage | |
| | Flush 2x2 hidden door (`hidden-2x2`) | lever or sculk latch, reset | 2x2 passage | trigger |
| | Hidden plaque (`hidden-plaque`) | lever or sculk latch, reset | text bands | width, bands, trigger |
| Navigation | Ender pearl launcher (`pearl-launcher`) | button per item | item launched toward the viewer | items |

The catalogue site lists the same entries with timing, footprint, part counts, notes, and a live bench.

## Using an entry

```js
const entry = Catalogue.entries.find(e => e.id === 'split-door');
const c = entry.build({ width: 8, cargo: 2, trigger: 'lever' });   // { world, box, io, ... }
c.io.lever.on = true;                    // inputs are block objects
setInterval(() => c.world.tick(), 100);  // 1 redstone tick = 100 ms
RSR.makeView(stageElement, c);           // render (browser)
```

In another page, load `dist/redstone.js` (one script tag). It defines `RS`, `Logic`, `Scenes`, the `build*` functions, `Catalogue` and `RSR`. In Node, `require('redstone')` returns the catalogue and `require('redstone/engine')` the engine.

Inputs: levers (`on`), buttons and plates (`on`; the caller releases them after 10 or 30 ticks), sculk sensors (`world.vibrate(x, y, z)`), barrels (`fill`), repeaters (`delay`).

## Entry schema

```js
{
  id, name, category, summary,
  inputs: [String], outputs: [String], timing: String, notes: [String],
  params:   [{ key, label, min, max, def } | { key, label, options, def }],
  controls: [{ kind: 'lever'|'button'|'plate'|'walk'|'repeaters'|'action', io?, label?, fn? }],   // params get sliders automatically
  build(params) -> { world, box: [x0,x1,y0,y1,z0,z1], io: { name: block }, ... },
  monitor?(built) -> { label: value },        // extra live rows on the bench
  tests: [{ name, fn() -> boolean }],
  depth?, plaque?                              // renderer hints (peel and tilt controls, plaque layers)
}
```

## Adding an entry

1. Write a builder in `src/contraptions/` that returns `{ world, box, io }`. Coordinates: x east, y toward the viewer, z up. Place a ground layer at z = -1.
2. Register it in `src/catalogue.js` with metadata, params, controls, and at least one test that drives inputs and asserts outputs. If the `timing` string gives tick counts, add a test that asserts them.
3. If it can be repeated (doors, launchers), test that a full cycle returns every block to its starting state.
4. If it is a new file, add it to `parts` in `build.py` and a placeholder in `pages/catalogue.html`.
5. Run `npm test`.

Every entry also gets generic tests from `testsOf(entry)`: it is built through `build(params)` at each parameter's min, default and max (and every option), and `box`, `io`, `controls` and `monitor` must be consistent. Entries with a `lever` control must return every block to its start after two on/off cycles at each of those settings.

## Engine model

- 1 redstone tick = 100 ms = 2 game ticks.
- Dust: level 15 at the source, minus 1 per block. Powers what it points into.
- Torches flip 1 tick after their block changes and strongly power the block above them (torch towers). Repeaters delay 1 to 4 ticks on both edges.
- Comparators compare (pass the rear unless a side is stronger) or subtract (rear minus side). Side inputs are dust, repeaters and comparators.
- Observers pulse (on at +1, off at +2) when the watched block changes or when they are moved.
- Pistons push at most 12 blocks. Extensions resolve before retractions within a tick. Blocks moved this tick are in motion and cannot be grabbed by other pistons.
- Slime and honey drag movable neighbors, but not each other. Slime conducts power; honey does not.
- A sticky piston that retracts 1 tick after pushing leaves its blocks behind (block dropping).
- Sculk sensors hear vibrations within 8 blocks unless wool lies on the line. Vibrations travel about 1 block per game tick. Active 15 ticks, cooldown 5.
- Redstone blocks are movable power sources.
- Item entities use Java item physics (gravity 0.04, drag 0.98, ground friction 0.6 per game tick). A slime block moved by a piston into an item sets its velocity in the push direction. Trapdoors open while powered.

## Accuracy and simplifications

- Updates run per redstone tick in a fixed order. Java's block-event queue, update order, and 0-tick behavior are not modeled, so contraptions that depend on same-tick ordering may behave differently in the game.
- Not modeled: quasi-connectivity, dust on slopes, dust powering the block beneath it, torch burnout, container reading other than barrels, hoppers, droppers, and most other blocks.
- Some builders use wiring links (`world.floor`: a feed block strongly powers listed cells) to stand in for vertical or buried wiring. They predate torch towers; each entry's notes say where. The 2x2 piston door uses none.
- Sculk signal strength is approximated from distance. Frequency outputs are not modeled. Vibration sources are pistons, buttons, levers, and explicit `vibrate` calls.
- Items are points with simple per-axis collision. Trapdoors are immovable top-half trapdoors.
- Rendering is a fixed oblique projection showing front and top faces.

## Known constraints

- Touching flying-machine columns must move in lockstep. Offset neighbors line slime up against non-sticky blocks and stick together.
- A fully hidden flush opening is at most 2 blocks tall (or 2 wide), because each brick must slide into an empty neighbor after pulling in.
- A sculk sensor must be more than 8 blocks from the pistons it drives, or the machine hears itself. Wool blocks a reset button's vibration.
- Dust next to a strongly powered block picks up power. Use a repeater as a diode where that would create feedback.
- Two pistons cannot both push one slime plate: the first drags the second. Drive one through a honey spacer and retract it a tick earlier.
- Seeing 3 blocks deep through a 2-tall slot requires a low camera tilt.

## CI

`.github/workflows/ci.yml` runs the tests and the build on every push and pull request, and deploys `dist/` (with the catalogue as `index.html`) to GitHub Pages from `main`. Enable Pages under Settings > Pages > Source: GitHub Actions.

## License

Not yet chosen.
