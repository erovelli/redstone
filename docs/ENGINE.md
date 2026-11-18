# Engine

`src/engine.js` is the redstone tick engine: one file, no dependencies, the same code in Node (`require('./src/engine.js')`) and the browser (`window.RS`). It targets Minecraft Java Edition 1.21. This page lists the API, every rule as implemented, and every place where the engine is simpler than the game. Where the real-game rule is uncertain, it says so.

## Model

- A `World` is a sparse grid of plain block objects `{ t, x, y, z, ...state }` in a `Map` (`world.c`) keyed by `RS.K(x, y, z)`.
- Coordinates: x east, y toward the viewer (south; `N` is away), z up. Directions are `N E S W U D` (`RS.D`, `RS.OPP`, `RS.DL` all six, `RS.HL` the horizontal four).
- One `tick()` is one redstone tick (2 game ticks, 100 ms). Entities step twice per tick.
- Convention for timings: a player action happens between ticks. Power spreads during the next tick, so a lamp on a lever lights on tick 1, a delay-1 repeater turns on at tick 2, a torch flips at tick 2, a comparator updates at tick 2.

## API

```js
const w = new RS.World({ strict: true, rules: { ... }, sky: 15 });
w.put(x, y, z, type, state)      // build: returns the block
w.get(x, y, z) / w.set(x, y, z, block | null)
w.seal()                          // strict: validate, then refuse every mutation except the engine and w.hand
w.tick() / w.run(n)
w.settle(max = 400, { lenient, until })   // tick until quiet; returns ticks; throws if never quiet (lenient: returns -1)
w.quiet                           // nothing changed last tick, nothing scheduled, no entity moving
w.wake()                          // mark not quiet (an environment change made outside the engine)
w.hash()                          // 16 hex chars over every block and entity state (not the clock, not pending events)
w.stateOf(block)                  // the canonical string hash() uses for one block
w.assertSteady(n = 100)           // run n ticks with no input; throw naming the first block that changed
w.on(event, fn) -> off()          // 'sound' | 'move' | 'pop' | 'hit'; w.off(event, fn)
w.toCommands({ origin, clear })   // Minecraft commands that rebuild the world
w.rules                           // edition switches, see Rules below
w.sky                             // sky light 0..15 seen by daylight detectors (environment, settable after seal)
w.entities                        // [{ kind, x, y, z, vx, vy, vz, ... }], velocities per game tick
w.strong, w.weak                  // Map K -> level: power received by conductive blocks (strong excludes dust)
w.signalAt(x, y, z, exceptDir) / w.signalFrom(block, towardDir) / w.powerOf(block)
w.comparatorOutput(comparator) / w.waterContained(water) / w.supported(attachedBlock)
RS.defineBlock(type, def) / RS.blocks[type]
```

Legacy members still work in non-strict worlds: `w.at(t, fn)`, `w.spawn(kind, x, y, z, o)`, `w.vibrate(x, y, z)`, `w.shift(list, dir)`, `w.structure(...)`, `w.extend(p)`, `w.retract(p)`, `w.into(tgt, n)`, `w.poweredAt(b)`, `w.lampPowered(b)`, `w.bubbleColumn(...)`, `w.solidAt(...)`, `w.sig(...)`, `w.vibs`, `w.sensors`, and direct field pokes such as `lever.on = true` in non-strict worlds. `RS.addLatch` and `RS.addSequencer` are unchanged.

### Events

Listeners receive `{ event, t, name, x, y, z, ... }`. They are observers: while a listener runs, `put`/`set`/`at`/... throw on a sealed world and `world.hand` throws on every world.

| event | name | extra fields |
|---|---|---|
| `sound` | `click` (lever, button, plate, repeater, comparator, frame, daylight), `piston_extend`, `piston_retract`, `note`, `bell`, `bucket_fill`, `bucket_empty`, `dispense`, `dispense_fail`, `door_open/close`, `trapdoor_open/close`, `gate_open/close`, `bulb_on/off`, `fizz` (torch burnout), `page`, `book`, `throw` | `block`; `note`: `note`, `instrument`, `pitch` (2^((note-12)/12)); `click`: `on` for levers and buttons |
| `move` | `extend` or `retract` | `piston`, `dir`, `blocks` (moved), `popped` |
| `pop` | the block type | `block`, `why` (`pushed`, `detached`, `door`) |
| `hit` | the projectile kind | `block`, `entity`, `face`, `power` (target), `point` |

### Strict worlds and `world.hand` (R1 to R6)

`new RS.World({ strict: true })`. `put` rejects unknown types. `seal()` throws, listing every problem, if the world has: a block flagged `buried`, a water source that is not contained, an attached block with nothing to attach to, or an extended piston without its head. After `seal()`, `put`, `set`, `shift`, `at`, `spawn`, `vibrate` throw unless the engine itself or `world.hand` is calling. A sealed world that is quiet skips all work in `tick()` (the clock still advances).

The engine cannot stop code assigning fields on plain block objects (`lamp.lit = true`). R2 is enforced by tests: `assertSteady()` and `hash()`.

`world.hand` is the complete list of player actions. Every action returns true if it did something.

| action | what the player does |
|---|---|
| `flip(lever)` | flip a lever (makes a vibration) |
| `press(button)` | press a button: stone 10 ticks, wooden (`wood: true`) 15 ticks |
| `step(plate, on = true)` | stand on or leave a pressure plate |
| `vibrate(x, y, z)` | make a vibration (a footstep) |
| `fill(container, level, item = 'stone')` | put in or take out items so a comparator reads `level`; a jukebox takes disc number `level` |
| `insert(container, item, n)` / `take(container, item, n)` | move items by hand |
| `book(bookshelf, slot)` | put a book into a chiseled bookshelf slot (0 to 5), or take it out |
| `page(lectern, n)` | turn a lectern's book to page n (0-based) |
| `rotate(frame)` | rotate the item in an item frame |
| `delay(repeater, n?)` / `mode(comparator, m?)` | set (or cycle) a repeater delay; set (`'cmp'` / `'sub'`) or toggle a comparator mode |
| `tune(noteblock, n?)` | one click (+1, wraps at 25) or set the note; the note block plays if air is above it |
| `write(sign, text)` | write on a sign (`\n` separates lines) |
| `throwPearl(x, y, z, vx, vy, vz)` / `throw(kind, ...)` | throw an ender pearl, snowball or egg; returns the entity |
| `pour(x, y, z)` / `scoop(x, y, z)` | use a water bucket or an empty bucket |
| `use(block)` / `use([x, y, z], item)` | right-click: lever, button, note block, repeater, comparator, frame, lectern (next page), daylight detector (invert), bell (ring), wooden door / trapdoor / gate (toggle); with `'water_bucket'` or `'bucket'` at a position |

### Rules (`world.rules`)

Rule fixes apply to every world, except these switches, which default to the legacy behaviour in non-strict worlds. No catalogue entry uses a non-strict world any more (every one is built strict), so the switches only matter for hand-made test worlds. Strict worlds always get `true`. Pass `{ rules: { ... } }` to override.

| rule | strict | legacy | what it switches |
|---|---|---|---|
| `qc` | on | off | quasi-connectivity for pistons, droppers and dispensers |
| `stretch` | on | off | repeaters lock, and keep one pending update so short pulses stretch to the delay (off: every input change is replayed after the delay, no locking) |
| `trapdoorPush` | on | off | trapdoors are movable (off: immovable) |
| `projectileHit` | on | off | projectiles hit blocks: they disappear, light targets and fire `hit` (off: they collide and rest like items) |

### Block registry

```js
RS.defineBlock('type', {
  mc,          // 'minecraft:id' or (b, world) => 'minecraft:id[state]'   (export)
  conductive,  // opaque full block that can be powered (Java isRedstoneConductor)
  solid,       // entity collision
  push,        // 'normal' | 'immovable' | 'destroy' | 'push_only'
  sticky,      // 'slime' | 'honey'
  emits(world, b, toward) -> 0..15    // weak signal to the neighbour in direction `toward`
  strong(world, b, toward) -> 0..15   // strong (direct) signal; powers a conductive neighbour  [extension]
  tick(world, b, now)                 // runs every tick in the component pass
  analog(world, b) -> 0..15           // comparator reading
  onPower(world, b, rising)           // edge-triggered: the engine tracks b.powered and calls this on each change
  // extensions: attach ('att' | 'below'), source (dust connects), holdsWater, slots, qc, openable, instrument
});
```

A block built without `powered` takes its current power at `seal()` (or before the first tick of an unsealed world) without firing an edge, except that an open trapdoor or gate is taken to be held open by power.

## Block palette and state fields

| type | Minecraft | push | conductive | state |
|---|---|---|---|---|
| `stone`, `bricks`, `planks`, `smooth_stone`, `iron`, `quartz` | stone, stone_bricks, oak_planks, smooth_stone, iron_block, quartz_block | normal | yes | |
| `wool`, `concrete` | `<color>_wool` / `_concrete` | normal | yes | `color` |
| `glass` | glass | normal | no | |
| `terracotta` | `<color>_glazed_terracotta` | push_only | yes | `color`, `d` |
| `obsidian` | obsidian | immovable | yes | |
| `slime`, `honey` | slime_block, honey_block | normal, sticky | slime yes, honey no | |
| `soulsand`, `magma` | soul_sand, magma_block | normal | yes | |
| `rblock` | redstone_block | normal | no | |
| `lamp` | redstone_lamp | normal | yes | `lit` |
| `bulb` | waxed_copper_bulb | normal | no | `lit`, `powered` |
| `target` | target | normal | yes | `out` |
| `noteblock` | note_block | normal | yes | `note` (0-24), `powered` |
| `barrel`, `chest`, `furnace` | same | immovable | barrel, furnace yes; chest no | `fill`, `items`, `d` |
| `jukebox` | jukebox | immovable | yes | `fill` (disc 1-15) |
| `dispenser`, `dropper` | same | immovable | yes | `d`, `items`, `fill`, `powered` |
| `hopper` | hopper | immovable | no | `d` (output, default `D`), `items`, `fill`, `powered` |
| `lectern` | lectern | immovable | no | `d`, `page` (0-based), `pages`, `powered` |
| `bookshelf` | chiseled_bookshelf | immovable | yes | `d`, `slots` (6 booleans), `last` |
| `bell` | bell | destroy | no | `att`, `d`, `ringing`, `powered` |
| `sign` | oak_wall_sign / oak_sign / oak_hanging_sign | immovable, pops off | no | `att`, `text`, `kind` (`wall`, `standing`, `hanging`) |
| `frame` | item_frame (entity) | destroy, pops off | no | `att`, `item`, `rot` (0-7) |
| `piston`, `head` | piston / sticky_piston, piston_head | normal; immovable while extended; head immovable | no | `d`, `s`, `ext`, `mvAt`; head `p` (its piston) |
| `observer` | observer | normal | no | `d` (the watched side), `on` |
| `dust` | redstone_wire | destroy | no | `lvl`, `pts` (directions it points), `up` (directions it climbs a step) |
| `torch` | redstone_(wall_)torch | destroy | no | `att`, `lit` |
| `repeater` | repeater | destroy | no | `d` (output), `delay`, `on`, `locked` |
| `comparator` | comparator | destroy | no | `d` (output), `mode` (`cmp`/`sub`), `out` |
| `lever`, `button` | lever, stone_button / oak_button | destroy | no | `att`, `on`, `wood` |
| `plate` | stone / oak_pressure_plate | destroy | no | `on`, `wood` |
| `door` | iron_door (oak_door with `iron: false`) | destroy | no | `d`, `half` (`lower`/`upper`), `open`, `powered`, `iron` |
| `trapdoor` | oak_trapdoor (iron_trapdoor with `iron: true`) | normal | no | `d`, `half` (`top` default, `bottom`), `open`, `powered`, `iron` |
| `gate` | oak_fence_gate | normal | no | `d`, `open`, `powered` |
| `daylight` | daylight_detector | immovable | no | `level`, `inverted` |
| `sculk` | sculk_sensor | immovable | no | `on`, `out`, `state` |
| `water` | water (source) | destroy (displaced) | no | |

Container contents: `items` is one entry per slot, `{ id, n }` or `null`, with vanilla item ids without the namespace (`stone`, `bucket`, `water_bucket`, `ender_pearl`, `snowball`, ...). `fill` is always the comparator reading; a container built with only `fill` gets stone stacks that produce it the first time items move.

## Rules as implemented

Each tick: run due scheduled events; compute power from the current state; run the component pass (every block's `tick`, then `onPower` edges) in map order; pistons extend, then retract; observers compare; entities step twice; the clock advances.

### Power

- A source's weak signal (`emits`) activates components; a conductive block is powered by strong signals (repeater and comparator fronts, a torch into the block above it, a lever or button into the block it is attached to, a plate into the block under it, an observer out of its back, a sculk sensor and a pulsing lectern into the block under them) and weakly by dust pointing into it or sitting on it.
- A component is activated by the strongest signal from any neighbour: a source's own output, or a conductive neighbour's power (strong or weak).
- Dust reads sources and strongly powered conductive blocks on all six sides, never a weakly powered one. It is 15 at a source and loses 1 per block.
- Dust spreads to dust beside it, one step up (unless a conductive block sits directly above the lower dust: the cut) and one step down (unless the side cell is conductive). Up steps need a conductive block to carry power, so on glass power climbs but does not come down.
- Dust connects (its shape, `pts`) to dust, to a repeater's front or back, to an observer's back, and to every other signal source (levers, buttons, plates, torches, redstone blocks, targets, daylight detectors, lecterns, sculk sensors, comparators on any side). A dust with no connection is a cross; with one it is a line through to the opposite side. It powers the block below it and the cells in `pts`.
- Redstone torch: powers every side except its block, strongly powers the block above, flips 1 tick after its block's power changes. Burnout: its 8th turn-off within 60 game ticks (30 ticks) burns it out; it stays dark for 160 game ticks (80 ticks), then relights if unpowered.
- Repeater: delay 1 to 4. One pending update at a time, so a pulse shorter than the delay is stretched to the delay (`rules.stretch`). Dust behind it powers it whatever the dust's shape. Locked while a powered repeater or comparator points into a side.
- Comparator: 1 tick. The rear reads a block's analog output if it has one (containers, jukebox, lectern, chiseled bookshelf, copper bulb), otherwise the signal; if that is below 15 and the rear block is conductive, an analog block or an item frame on its far side replaces it. Sides take dust (its level), redstone blocks (15) and the strong outputs of repeaters, comparators and observers; levers, buttons and torches do not count. Compare: rear if rear >= side, else 0. Subtract: max(0, rear - side).
- Observer: notices a change of the watched block's state, turns on the next tick for 1 tick, out of its back. Fires when a piston moves it.
- Redstone lamp: on in the tick it is powered, off 2 ticks after it loses power.
- Copper bulb (waxed): toggles on each rising edge; analog 15 while lit; not conductive.
- Note block: plays on a rising edge only if the cell above is empty; `note` 0 to 24; the instrument comes from the block below (stone-like: basedrum, wood: bass, glass: hat, wool: guitar, soul sand: cow_bell, iron: iron_xylophone, otherwise harp).
- Target: a signal source dust connects to; a projectile hit gives 1 to 15 by distance from the face centre, for 4 ticks (10 for arrows).
- Buttons: stone 10 ticks, wooden 15. Pressure plates recheck every 10 ticks while pressed, so they release up to 10 ticks after the last entity leaves. Wooden plates also detect item entities.
- Daylight detector: outputs `world.sky` (or 15 minus it when inverted).
- Doors open while either half is powered; trapdoors and gates open on a rising edge and close on a falling edge, and wooden ones can be toggled by hand in between.
- Bell: rings on a rising edge (`ringing` for 25 ticks).
- Lectern: turning a page pulses it for 1 tick (weak to all sides, strong down); analog `floor(14 * page / (pages - 1)) + 1`, 15 for a one-page book, 0 without a book.
- Chiseled bookshelf: analog = last slot used + 1 (0 if never used).
- Containers: analog `floor(14 * sum(count / maxStack) / slots) + (any items ? 1 : 0)`.

### Pistons

- Powered by any neighbour except through its face; with `rules.qc`, also when the cell above it would be powered (level-triggered).
- Push limit 12. The structure: the block in front, everything in each moving block's path, and for slime and honey every adjacent `normal` block, transitively. Slime and honey do not stick to each other, nor to `push_only`, `immovable` or `destroy` blocks; they slide past them. If any moving block has an immovable block (or the piston itself) directly in its path, the whole move fails. `destroy` blocks in a path pop (water is displaced).
- `immovable`: obsidian, bedrock-like blocks, block entities (containers, dispensers, droppers, hoppers, jukebox, lectern, chiseled bookshelf, sign, daylight detector, sculk sensor), extended piston bases and piston heads. `push_only`: glazed terracotta, pushed but never pulled.
- Sticky pistons pull the block in front of the head if it is `normal` (or a retracted piston). A sticky piston that retracts the tick after it pushed (a 1-tick pulse) leaves the block behind.
- After a move, every attached block (torch, lever, button, sign, bell, frame, dust, repeater, comparator, plate, door) whose support cell was vacated or refilled by a moving block pops off.
- A block moved into an entity carries it; a slime block sets the entity's velocity along the push to 1 block per game tick.

### Fluids and entities

- Only water sources exist. A source is contained when below it and on its four sides there is another source or a block flowing water cannot enter (anything except air, dust, torches, repeaters, comparators, levers, buttons, plates, frames and an open fence gate). Strict worlds refuse uncontained water at `seal()`, when a player pours it, when a dispenser places it, and when a piston or bucket uncovers a side of one (the engine throws, because it does not model flowing water).
- Water on soul sand is an upward bubble column (items rise at up to 0.7, a projectile pearl is held still: stasis); on magma, downward (up to -0.9).
- Items: gravity 0.04, drag 0.98, ground friction 0.6 per game tick. Projectiles: move, drag 0.99 (0.8 in water), gravity 0.03 (arrows 0.05). With `rules.projectileHit` a projectile entering a solid block hits it and disappears (an ender pearl teleports its thrower, who is not modelled).
- Dispensers and droppers fire on a rising edge, 2 ticks later, from the first non-empty slot. Dispenser: a water bucket places a source in an empty cell in front (else drops), an empty bucket picks up a source in front (else drops), snowballs, eggs and arrows are shot at 1.1 blocks per game tick along the facing with 0.1 added upward; everything else, ender pearls included, is dropped as an item (0.25 along the facing, 0.2 up). Dropper: moves one item into a container in front, else drops it.
- Hopper: every 4 ticks, pushes one item into the container it faces and pulls one from the container above (or picks up item entities lying in the cell above). Locked while powered.
- Sculk sensor (unchanged from the legacy engine): range 8, delay 1 tick per 2 blocks, active 15 ticks, cooldown 5, wool occludes, strength approximated. Pistons, note blocks and hand actions make vibrations.

### Export

`toCommands({ origin: [X, Y, Z], clear = true })` returns `fill ... air` (unless `clear: false`), then `setblock X Y Z <state>[nbt] replace` lines (supports first, bottom up; attached blocks last), `summon` lines for frames and entities, and `#` comment lines for warnings. Engine (x, y, z) maps to Minecraft (X + x, Y + z, Z + y); without an origin the coordinates are relative (`~`). Repeaters and comparators get Minecraft `facing` = the direction of their input; wall torches, wall signs, levers and buttons face away from their support. Containers carry `Items` (1.21 `count` format), comparators `OutputSignal`, signs `front_text`, lecterns a writable book, jukeboxes `RecordItem`, chiseled bookshelves their books.

`node scripts/export-commands.js <entry-id> [--origin X,Y,Z] [--param k=v] [--no-clear]` prints an `.mcfunction` for a catalogue entry.

## Simplifications versus Java 1.21

- One update pass per redstone tick in a fixed order (map insertion order). Java's block-event order, update order, 0-tick pulses, game-tick (odd) timings and BUD states are not modelled. Components are level-triggered: they look at their inputs every tick instead of reacting to neighbour updates. Scheduled updates (repeaters, comparators, torches, lamps) sample their inputs one tick before they fire.
- Pistons move their blocks instantly in the tick they are powered (Java: 2 game ticks of moving blocks). A block moved this tick cannot be moved again this tick. Quasi-connectivity is level-triggered.
- Entities are points: no hitboxes, no entity-entity collision, simple axis-by-axis block collision. Item entities do not despawn or merge. Players and mobs are not entities; `hand.step` stands for a player on a plate.
- Random choices are deterministic: dispensers use the first non-empty slot, dispensed items and projectiles have no spread.
- Flowing water is not simulated (see above). Bubble column forces are approximations.
- Daylight detectors read `world.sky` directly instead of time of day and sky access.
- Sculk sensors: frequencies, the comparator reading and calibrated sensors are not modelled.
- Wooden buttons are not pressed by arrows; tripwire, rails, redstone ore, trapped chests, crafters and item frames as entities are not modelled (frames are blocks occupying a cell).
- Item frames are blocks in the cell in front of the face they hang on.

## Uncertain points

These are implemented as stated, but I am not sure the real game agrees:

- Bells: implemented as push class `destroy` (I believe Java gives bells `PushReaction.DESTROY`; SPEC 5.2 listed them as immovable).
- Signs: implemented as immovable block entities that pop when their support moves. Java may give some sign variants a different push reaction.
- Sculk sensors: implemented as immovable; Java may break them when pushed.
- Copper bulb: implemented as toggling in the same tick its power rises; I am not sure whether 1.21 adds a game-tick delay.
- Chest: implemented as not conductive (its shape is not a full block), unlike SPEC 5.2, which says conductive.
- Pressure plates: implemented as not holding back water (flowing water would break them).
- Whether hoppers insert discs into jukeboxes in 1.21 (not implemented).
- The exported lectern book uses the 1.21 `writable_book_content` component with plain string pages, and sign text uses 1.21 JSON-string messages; later versions (1.21.5+) changed text components.
- Target block re-hits: a new hit replaces the output and restarts its timer.
