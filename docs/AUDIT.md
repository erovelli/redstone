# Rules audit

Every `<rs-*>` component checked against the rules contract (`docs/SPEC.md` section 3, R1 to R6) for Minecraft Java 1.21. Every UI entry was marked `strict: true` with no deviations; this page records what was actually true, what was fixed, and what is now declared.

## How it is checked

`scripts/audit-rules.js` (run as the `rules audit` suite in `npm test`; `node scripts/audit-rules.js` prints the full report):

- **Static scan** of `src/ui/components/*.js` and `src/contraptions/ui/*.js` for code that drives a sealed world: writes to block state (`.on`, `.lit`, `.ext`, `.lvl`, `.out`, `.open`, `powered`, `sky`, ...), `world.put/set/shift/at/spawn`, ticking or settling from element code, JavaScript timers, private core members, engine internals, wiring links, fake blocks and `buried`. Every hit is either fixed or on a reviewed list in the script with the reason it is not a violation (for example `d.open = open` on a light-DOM `<details>`).
- **Dynamic probe.** Each entry is built at every parameter edge. Its sealed world is instrumented: every block field becomes an accessor that records any write made while neither the engine nor `world.hand` is running, and `put/set/shift/at/spawn/vibrate/extend/retract`, `tick()` and `sky` record calls made from element code. Then every element that uses the entry is driven headlessly through each control, each key and hover action, and each writable state, and the entry's workbench actions are run too. An uninstrumented twin is driven the same way and must hash the same, so the probe cannot change behaviour. Reviewed time skips ("the player waits") are listed per entry in the script and documented in the entry.
- **Steady state.** Every strict build at every edge passes `world.assertSteady(100)`, or is a running clock whose hash sequence repeats (spinner, divider pulse, indeterminate progress).
- Each entry's own tests still cover the timings, a full use cycle back to `world.hash()`, the push limit and `strictWorld`.

## Results

32 elements on 31 catalogue entries. After this audit 29 entries are strict; `ui-navbar` and `ui-theme-auto` are not, and their deviations are listed in the catalogue and on the docs page.

| Component | Entry | Strict | Findings | Action taken |
|---|---|---|---|---|
| rs-accordion | ui-accordion | yes | Shares the tabs selector, so it had the tabs problems: a second press in the same tick was refused by the element; two presses within about 0.5 s could change the open item with the shutter open. A click on a slotted `<summary>` toggles the native `<details>` before the machine does (the element then presses the band and mirrors the machine back). | Refusal removed (both presses reach the bank). Shutter fixed with tabs (below). The summary behaviour is a DOM detail, noted here. |
| rs-alert, rs-toast | ui-toast | yes | An old timer pulse closed a toast that was dismissed early and shown again within `duration`. `<rs-toast open>` was built open with no timer running, so it never closed. | See "Behaviour bugs". |
| rs-badge, rs-chip | ui-chip | yes | None. Dismiss pops the sign off a moved block; the element removes itself after the `dismiss` event. | None. |
| rs-breadcrumb | ui-breadcrumb | yes | The element flipped the root lever by itself as the page loaded: code acting with no player. | Fixed: the element builds the machine with the lever on, the steady state with the signal walked out; it performs no action. SPEC 6 lists the breadcrumb as static. |
| rs-button | ui-button | yes | None. | None. |
| rs-card | ui-card | yes | None. | None. |
| rs-checkbox | ui-checkbox | yes | None. | None. |
| rs-collapse | ui-collapse | yes | None. | None. |
| rs-counter | ui-counter | yes | None. Uses lamp columns, one per digit, not seven-segment digits (SPEC 6 updated). | None. |
| rs-divider | ui-divider | yes | None. With `pulse` it is a torch clock (period 34 ticks), off under reduced motion. | None. |
| rs-drawer | ui-drawer | yes | Reported as "ignores presses in flight". It does not: the element passes every press on; the machine itself does nothing with a press while flying, because a station's obsidian is beside a piston only while the machine is parked there. | Kept strict; already documented in the entry notes. |
| rs-dropdown | ui-dropdown | yes | A choice within 1 s of opening was dropped by the element (`io.button.on` check). The machine cannot take that press either (the menu button is still in), so the result was honest, but the element decided. | The element now passes the press to `world.hand`, which refuses it, and counts the choice only if the press went in. Documented in the entry notes. |
| rs-input | ui-input | yes | None. | None. |
| rs-list | ui-list | yes | None. | None. |
| rs-modal | ui-modal | yes | Open and close pressed 1 to 4 ticks apart did not let the later press win (a torch NOR latch with a 1- and a 4-tick loop). | See "Behaviour bugs". |
| rs-navbar | ui-navbar | **no** | The element ignores link presses from a press until every chamber holds a pearl again (about 3 s). It used private core members (`_ctl`, `_activate`, `_box`, `_stage`, `_awake`) and threw replacement pearls from inside the draw loop. The navigation follows the link when the pearl leaves the viewport, not when it hits a target block as SPEC 6 sketched. Export review: the launch depends on two slime pistons striking a falling pearl one redstone tick apart; the engine moves pistons instantly and treats entities as points, so the game may not reproduce the trajectory (SPEC 3 asks designs not to depend on behaviour the engine cannot model). | Declared: `strict: false` with the press filter as a deviation. A second press on the same launcher before its chamber refills would fire the dispenser again over the open drop shaft and the machine does not survive it, so the filter stays. Public hooks only now (`el.contraption`, `el.perform`, the open shadow root); restocking is a `sync` hook that throws a pearl through `perform` (a player action) when a chamber is set and empty. The export risk is noted in the entry. |
| rs-pagination | ui-pagination | yes | None. | None. |
| rs-popover | ui-popover | yes | Built with the modal's machine, so it had the modal's latch problem. | Fixed with the modal. |
| rs-progress | ui-progress | yes | Indeterminate kept its clock running under reduced motion. The running build starts from a placement state just off the clock's cycle (allowed: it is where the clock starts). | See "Behaviour bugs". |
| rs-radio | ui-radio | yes | The element refused a second press in the same tick ("one interaction per game tick"); a player, or two, can press two buttons in one redstone tick (two game ticks). | Refusal removed. Two buttons in the same tick set both latches and light both lamps; `value` reads "" until the next press, which always wins. Documented in the entry. |
| rs-select | ui-select | yes | A press or a choice while the menu button was still in settled the world first ("the player waits"): element code fast-forwarding the machine in the middle of a visible move. | User actions are passed on as they come (a press while the button is in does nothing; a page turn then is lost in the button's power and the list stays open). Only a page request (`el.value = v`, which settles at once like a native property) waits between its separate actions, each on a quiet world. Documented in the entry; reviewed in the audit. |
| rs-slider | ui-slider | yes | Moving to a level settles the world between items. | Honest: each item is a separate player action applied to a quiet world, and no action is refused. Documented in the entry; reviewed in the audit. |
| rs-spinner | ui-spinner | yes | None. A running clock; reduced motion and `paused` build it still. | None. |
| rs-spoiler | ui-spoiler | yes | None. Hover and focus stand on the plate. | None. |
| rs-status | ui-status | yes | None. | None. |
| rs-steps | ui-steps | yes | None. | None. |
| rs-tabs | ui-tabs | yes | The element refused a second press in the same tick. Two presses within about 0.5 s could swap the panel with the shutter open: the shutter's pulse came from the first press only. | Refusal removed. Shutter: see "Behaviour bugs". |
| rs-theme | ui-theme | yes | Switching one theme switch flips the lever of every other one on the page (each a player action). | None (documented here). |
| rs-theme auto | ui-theme-auto | **no** | Sets `world.sky` from `prefers-color-scheme`: the environment, not a player action. Already declared. | None. |
| rs-toggle | ui-toggle | yes | None. | None. |
| rs-tooltip | ui-tooltip | yes | None. Hover and focus stand on the plate. | None. |

Rule checks that found nothing anywhere: no element or contraption writes block state, calls `put/set/shift/at/spawn` after sealing, uses wiring links, fake blocks, `buried`, timers or engine internals; every strict build passes `assertSteady` or is a clock; every entry's use cycle returns to its start hash (entry tests).

## Behaviour bugs

| Component | Bug | Fix |
|---|---|---|
| rs-toast | Old timer pulse closes a re-shown toast; `<rs-toast open>` never closes. | Pending. |
| rs-modal, rs-popover | The later of two presses 1 to 4 ticks apart did not always win. | Pending. |
| rs-progress | Indeterminate clock runs under reduced motion. | Pending. |
| core | Clicks on slotted content inside an opening did not reach page listeners. | Pending. |
| rs-navbar | Private core members. | Fixed (see table). |
| rs-tabs, rs-accordion | Two presses within about 0.5 s swap the panel without the shutter closing. | Pending. |

## Export review

`node scripts/export-commands.js <id>` for `ui-navbar`, `ui-tabs`, `ui-accordion`, `ui-drawer` and `ui-modal`, read by hand:

- Every block is a vanilla 1.21 block (stone bricks, jukeboxes, dispensers, observers, glazed terracotta, honey, slime, obsidian, oak signs, ...). No look-alikes or warnings.
- Every attached block (dust, repeaters, comparators, torches, buttons, signs) has its support; the engine refuses an unsupported one at `seal()`.
- Water appears only in the navbar's stasis chambers, each contained by glass (front), a jukebox (west), the dispenser (east), the observer (back) and soul sand (below); the cell above is air, which water does not flow into.
- Flying machines (the drawer) and the honey and slime doors need no support. The drawer relies on Java block dropping (a sticky piston given a 1-tick observer pulse leaves its block behind), which is vanilla behaviour.
- Risk, navbar only: see its row above. The exported pearl is summoned without an owner, so in the game it does not teleport anyone when it lands.
