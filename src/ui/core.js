// Redstone UI core: the custom-element base every <rs-*> component is built on.
//
// A component file calls Redstone.ui.define(tag, spec). The spec says which catalogue entry to build,
// how attributes map to its params, which blocks the player can use (and with which world.hand action),
// how outputs map to properties, attributes and events, and where light-DOM content sits. This file does
// everything else: shadow root, view, one shared ticker, sleeping, resize, inspect mode, reduced motion,
// sound, focusable controls, ARIA, live announcements, form participation and teardown.
//
// The central rule: an input is a player action through world.hand. Properties, attributes and events change
// only when the contraption's OUTPUT changes, never directly from an input handler.
//
// The pure parts (param mapping, the headless Controller, test helpers) also run in Node; see docs/COMPONENTS.md.
(function () {
'use strict';
const IN_NODE = typeof module !== 'undefined' && module.exports;
const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof HTMLElement !== 'undefined';
const RSR = () => (typeof window !== 'undefined' ? window.RSR : null);

/* ---------- engine and renderer access ----------
 * Thin names for the engine (docs/SPEC.md 5.1) and renderer (5.3) calls the core uses, kept in one place. */
const compat = {
  hand: world => world.hand,
  settle: (world, max = 400) => world.settle(max),
  quiet: world => !!world.quiet,
  hash: world => world.hash(),
  on: (world, type, fn) => world.on(type, fn),
  isRealBlock: (RS, type) => !!RS.blocks[type] && !RS.blocks[type].fake,
  rectOf: (view, at, face = 'front') => view.rectOf(at, face),
  setInspect: (view, on) => view.setInspect(on),
  markTick: () => { const R = RSR(); if (R) R.markTick(); },
  removeView: view => { const R = RSR(); if (R) R.removeView(view); },
};


/* ---------- attribute -> param mapping (pure) ---------- */

// Coerce an attribute value (string or null) for a param. `def` is the catalogue param definition
// ({ key, min, max, def, options }) or a mapping's own { type, def, min, max, options }.
function coerce(def, raw) {
  const type = typeOf(def);
  if (type === 'boolean') return raw !== null && raw !== undefined && raw !== 'false';
  if (raw === null || raw === undefined) return def ? def.def : undefined;
  if (type === 'number') {
    let n = Number(raw);
    if (!Number.isFinite(n)) return def.def;
    if (Number.isInteger(def.def) || Number.isInteger(def.min)) n = Math.round(n);
    if (def.min !== undefined) n = Math.max(def.min, n);
    if (def.max !== undefined) n = Math.min(def.max, n);
    return n;
  }
  if (def && def.options) return def.options.includes(raw) ? raw : def.def;
  return String(raw);
}
function typeOf(def) {
  if (!def) return 'string';
  if (def.type) return def.type === Boolean ? 'boolean' : def.type === Number ? 'number' : def.type === String ? 'string' : def.type;
  if (typeof def.def === 'boolean' || (def.options && def.options.every(o => typeof o === 'boolean'))) return 'boolean';
  if (typeof def.def === 'number' || def.min !== undefined) return 'number';
  return 'string';
}

// The catalogue defaults, then every mapped param. `attr(name)` returns the attribute value or null;
// `ctx` is passed to computed params.
function paramsFor(entry, spec, attr, ctx) {
  const out = {};
  for (const p of entry.params || []) out[p.key] = p.def;
  for (const [key, m] of Object.entries(spec.params || {})) {
    if (typeof m === 'function') {
      const v = m(ctx && ctx.el, ctx);
      if (v !== undefined) out[key] = v;
      continue;
    }
    const map = typeof m === 'string' ? { attr: m } : m;
    const def = Object.assign({}, (entry.params || []).find(p => p.key === key), map.type || map.def !== undefined ? map : {});
    out[key] = coerce(def, attr(map.attr || key));
  }
  return out;
}

// Attribute names that rebuild the contraption when they change (not the ones that mirror state).
function paramAttributes(spec) {
  const stateAttrs = new Set(Object.values(spec.state || {}).map(s => s.attr).filter(Boolean));
  const out = [];
  for (const [key, m] of Object.entries(spec.params || {})) {
    if (typeof m === 'function') continue;
    const name = typeof m === 'string' ? m : (m.attr || key);
    if (!stateAttrs.has(name)) out.push(name);
  }
  return out;
}

// Params compared for a resize or slot change. A param read from a state attribute (`checked`, `open`) is read
// only at build time, so it does not count: the world already holds that state, and rebuilding mid-move
// would undo the player's action.
function sameParams(spec, a, b) {
  const stateAttrs = new Set(Object.values(spec.state || {}).map(s => s.attr).filter(Boolean));
  const skip = new Set(Object.entries(spec.params || {}).filter(([, m]) => typeof m === 'object' && stateAttrs.has(m.attr)).map(([k]) => k));
  const strip = o => JSON.stringify(Object.keys(o || {}).filter(k => !skip.has(k)).sort().map(k => [k, o[k]]));
  return strip(a) === strip(b);
}

/* ---------- output -> state logic (pure) ---------- */

const asList = v => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

// Compare two state snapshots. Returns [{ key, value, prev, events: [type] }] for every key that changed.
function diffState(stateSpec, prev, next) {
  const changes = [];
  for (const [key, s] of Object.entries(stateSpec || {})) {
    if (Object.is(prev[key], next[key])) continue;
    const when = s.when || 'change';
    const fires = when === 'change' || (when === 'rise' && next[key] && !prev[key]) || (when === 'fall' && !next[key] && prev[key]);
    changes.push({ key, value: next[key], prev: prev[key], events: fires ? asList(s.event) : [] });
  }
  return changes;
}

// The headless half of a component: builds the contraption, applies player actions, ticks, and turns
// output changes into state changes. The custom element wraps one; tests drive one directly.
class Controller {
  constructor(spec, entry) {
    this.spec = spec;
    this.entry = entry;
    this.built = null;
    this.state = {};
  }
  get world() { return this.built && this.built.world; }
  get io() { return this.built && this.built.io; }
  get hand() { return compat.hand(this.world); }
  build(params) {
    this.params = params;
    this.built = this.entry.build(params);
    // A strict builder writes its steady state; settling proves it and costs nothing when it holds.
    try { compat.settle(this.world, 400); } catch (e) { /* a clock never settles: start it running */ }
    this.state = this.read();
    return this.built;
  }
  read() {
    const s = {};
    for (const [key, st] of Object.entries(this.spec.state || {})) s[key] = st.read(this.io, this.built);
    return s;
  }
  // A player action from a control: hand[act](io[control.io]) or act(hand, io, built, key).
  act(control, key) {
    const target = control.io ? this.io[control.io] : null;
    if (typeof control.act === 'function') return control.act(this.hand, this.io, this.built, key);
    const fn = this.hand[control.act];
    if (typeof fn !== 'function') throw new Error(`world.hand has no action '${control.act}'`);
    return fn.call(this.hand, target);
  }
  // Ask for a state value the way the page asks: through the state's set() player action.
  request(key, value) {
    const st = this.spec.state[key];
    if (!st || typeof st.set !== 'function') throw new Error(`state '${key}' is read-only`);
    st.set(this.hand, this.io, value, this.built);
  }
  update() {
    const next = this.read();
    const changes = diffState(this.spec.state, this.state, next);
    this.state = next;
    return changes;
  }
  tick() {
    this.world.tick();
    return this.update();
  }
  settle(max) {
    try { compat.settle(this.world, max); } catch (e) { /* keep what happened so far */ }
    return this.update();
  }
  quiet() { return compat.quiet(this.world); }
  // What setting a property does: the player action, then settle. A machine can refuse an action while it is busy
  // (a button that is still in); then the settled world gets the action once more.
  requestSettled(key, value, max) {
    this.request(key, value);
    let changes = this.settle(max);
    if (!Object.is(this.state[key], value)) {
      this.request(key, value);
      changes = changes.concat(this.settle(max));
    }
    return changes;
  }
}

/* ---------- helpers for contraption tests (pure) ---------- */

const testing = {
  hand: w => compat.hand(w),
  hash: w => compat.hash(w),
  settle: (w, max) => compat.settle(w, max),
  // Every combination of each param's min, default and max (or every option).
  edges(entry) {
    return (entry.params || []).reduce((acc, p) => acc.flatMap(a => [...new Set(p.options || [p.min, p.def, p.max])].map(v => Object.assign({}, a, { [p.key]: v }))), [{}]);
  },
  // Ticks until f() holds, counting the first tick as 1; -1 if it never does within max.
  ticksUntil(world, f, max = 200) {
    for (let i = 1; i <= max; i++) {
      world.tick();
      if (f()) return i;
    }
    return -1;
  },
  // The built steady state does not drift: n ticks change nothing.
  noDrift(world, n = 100) {
    const h0 = compat.hash(world);
    for (let i = 0; i < n; i++) {
      world.tick();
      if (compat.hash(world) !== h0) return false;
    }
    return true;
  },
  // R1 and R2 as far as a test can see them: real blocks only, no wiring links, nothing hidden by fiat.
  strictWorld(world, RS) {
    for (const b of world.c.values()) {
      if (!compat.isRealBlock(RS, b.t)) throw new Error(`not a real block: ${b.t} at ${b.x},${b.y},${b.z}`);
      if (b.buried || b.feed) throw new Error(`hidden or feed flag on ${b.t} at ${b.x},${b.y},${b.z}`);
    }
    if (world.floor && world.floor.length) throw new Error('world.floor wiring links are not allowed');
    return true;
  },
  // Push limit by construction: every piston's possible structure is within 12 blocks.
  pistonCount(world) {
    let n = 0;
    for (const b of world.c.values()) if (b.t === 'piston') n++;
    return n;
  },
};

// Sign text (SPEC I3). A wall sign's board is half a block tall, so text of SIGN_TEXT of a block fills most of it.
// A component with sign text defaults to SIGN_BLOCK px blocks and never goes smaller (an author's smaller
// --rs-block is raised to it, and a narrow container scrolls rather than shrinking the blocks): 0.42 x 36 = 15.1 px.
const SIGN_BLOCK = 36;
const SIGN_TEXT = 0.42;

// How many sign blocks a label needs. One block holds about 4 characters of a bold monospace at the sign font
// (0.42 of a block); in the browser `measure` measures the text in the real sign font.
function signsFor(text, opts = {}) {
  const min = opts.min === undefined ? 1 : opts.min;
  const max = opts.max === undefined ? 6 : opts.max;
  const t = String(text || '').trim();
  if (!t) return min;
  const width = typeof opts.measure === 'function' ? opts.measure(t) : t.length * 0.26;   // in blocks
  return Math.max(min, Math.min(max, Math.ceil(width + 0.25)));   // a little margin at each end
}

const ui = {
  compat, coerce, paramsFor, paramAttributes, sameParams, diffState, Controller, testing, signsFor, SIGN_BLOCK, SIGN_TEXT,
  registry: new Map(),
};

if (IN_NODE) module.exports = ui;
if (!HAS_DOM) return;

/* ===================================================================================================
 * Browser: the custom element base
 * =================================================================================================== */

const Redstone = window.Redstone = window.Redstone || {};
Redstone.config = Object.assign({ sound: false }, Redstone.config);
Redstone.engine = Redstone.engine || window.RS;
Redstone.catalogue = Redstone.catalogue || window.Catalogue;
Redstone.render = Redstone.render || window.RSR;
Redstone.textures = Redstone.textures || window.RSTextures || null;
Redstone.ui = Object.assign(Redstone.ui || {}, ui);

const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SYNTHETIC = new WeakSet();

/* ---------- one shared ticker for the whole page ---------- */
const ticker = {
  members: new Set(),
  timer: null,
  frame: 0,
  add(el) {
    this.members.add(el);
    if (!this.timer) this.timer = setInterval(() => this.tick(), 100);
  },
  remove(el) {
    this.members.delete(el);
    if (!this.members.size && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },
  tick() {
    let any = false;
    for (const el of this.members) if (el._awake && el._visible) { any = true; break; }
    if (!any) return;
    compat.markTick();
    for (const el of this.members) if (el._awake && el._visible) el._tick();
    this.animate();
  },
  // Draw in-between frames (a piston stroke) only while some view is mid-move.
  animate() {
    if (this.frame) return;
    const step = now => {
      this.frame = 0;
      let more = false;
      for (const el of this.members) {
        const v = el._view;
        if (v && v.anim && el._visible) {
          v.draw(now);
          more = more || v.anim;
        }
      }
      if (more) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  },
};

const seen = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
  for (const e of entries) {
    const el = e.target;
    el._visible = e.isIntersecting;
    if (el._visible && el._view) el._view.draw(performance.now());
  }
}, { rootMargin: '120px' }) : null;

/* ---------- block sound (synthesised, opt-in) ---------- */
let audio = null;
function playSound(ev) {
  if (!Redstone.config.sound || reducedMotion()) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const out = audio.createGain();
    out.connect(audio.destination);
    const name = ev && ev.name || 'click';
    if (name === 'note') {
      const f = 369.99 * Math.pow(2, ((ev.pitch || 12) - 12) / 12);
      out.gain.setValueAtTime(0.16, t);
      out.gain.exponentialRampToValueAtTime(0.0008, t + 0.8);
      const o = audio.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(out);
      o.start(t);
      o.stop(t + 0.85);
      return;
    }
    // click (lever, button) and piston: a filtered noise burst; a piston is longer and lower.
    const piston = name === 'piston';
    const len = piston ? 0.16 : 0.035;
    const buf = audio.createBuffer(1, Math.ceil(audio.sampleRate * len), audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = audio.createBufferSource();
    src.buffer = buf;
    const band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = piston ? 420 : 2400;
    band.Q.value = piston ? 0.9 : 3;
    out.gain.value = piston ? 0.5 : 0.35;
    src.connect(band);
    band.connect(out);
    src.start(t);
  } catch (e) { /* no audio: stay silent */ }
}

/* ---------- shadow DOM ---------- */
// The default sign font: a bold monospace, which stays crisp and even on the pixel-art boards. --rs-sign-font
// replaces it (the docs page uses a pixel font).
const SIGN_FONT = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';
// The core sets --b and --t (the block's front and top sizes in px) on the host when it mounts a view, so every rule
// in the shadow root, and slotted page content, can size itself from them. --rs-sign-text is the sign text's font
// for a component's own text overlays (font: var(--rs-sign-text)); .label is the core's.
const BASE_CSS = `
:host { display: inline-block; vertical-align: middle; position: relative; max-width: 100%; line-height: 0;
  --rs-sign-text: var(--rs-sign-weight, 700) calc(var(--b) * ${SIGN_TEXT})/1 var(--rs-sign-font, ${SIGN_FONT}); }
:host([hidden]) { display: none; }
:host([disabled]) .box { filter: saturate(.35) brightness(.92); }
.box { position: relative; }
.stage { position: relative; }
.stage canvas { position: absolute; left: 0; top: 0; image-rendering: pixelated; pointer-events: none; }
.label { position: absolute; z-index: 2; display: flex; align-items: center; justify-content: center; overflow: hidden;
  white-space: nowrap; pointer-events: none; color: var(--rs-sign-ink, #1b120a); letter-spacing: 0; line-height: 1;
  font-family: var(--rs-sign-font, ${SIGN_FONT}); font-weight: var(--rs-sign-weight, 700); font-size: calc(var(--b) * ${SIGN_TEXT}); }
.label[hidden], .window[hidden] { display: none; }
:host([data-rs-beside]) { display: inline-flex; align-items: center; gap: calc(var(--rs-block, 24px) * .4); }
.caption { line-height: normal; cursor: pointer; user-select: none; }
:host([disabled]) .caption { cursor: not-allowed; opacity: .6; }
.window { position: absolute; z-index: 3; overflow: auto; line-height: normal; background: var(--rs-window-bg, Canvas); color: var(--rs-window-ink, CanvasText); }
.hit { position: absolute; z-index: 4; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; border-radius: 0; font: inherit; color: inherit; }
.hit:disabled { cursor: not-allowed; }
.hit:hover:not(:disabled) { outline: 2px solid var(--rs-hover, rgba(255, 255, 255, .55)); outline-offset: -2px; }
.hit:focus { outline: none; }
.hit:focus-visible { outline: 2px dashed var(--rs-focus, currentColor); outline-offset: 2px; }
.stash { display: none; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;

// The block size the element asks for: --rs-block, 12 to 48 (default 24). With sign text (signs true) the default
// and the minimum are SIGN_BLOCK.
function blockSize(el, signs) {
  const raw = getComputedStyle(el).getPropertyValue('--rs-block').trim();
  const n = parseFloat(raw);
  const floor = signs ? SIGN_BLOCK : 12;
  return Math.max(floor, Math.min(48, Number.isFinite(n) ? n : signs ? SIGN_BLOCK : 24));
}

// The nearest ancestor with a box: a display: contents parent (a <form> laid out by its own parent) has none.
function boxParent(el) {
  let p = el.parentElement;
  while (p && p.parentElement && getComputedStyle(p).display === 'contents') p = p.parentElement;
  return p;
}

// Union of rects.
function union(rects) {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const place = (node, r) => Object.assign(node.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
const blocksOf = v => asList(v).filter(Boolean);

class RedstoneElement extends HTMLElement {
  static get formAssociated() { return true; }

  constructor() {
    super();
    this._def = this.constructor._def;
    this._visible = true;
    this._awake = false;
    this._view = null;
    this._ctl = null;
    try { this._internals = this.attachInternals(); } catch (e) { this._internals = null; }
    // A click that lands on the element itself (a <label for>, el.click()) operates the primary control.
    // The raw click never reaches page listeners: a component's own events come from its output.
    this.addEventListener('click', ev => {
      if (SYNTHETIC.has(ev) || ev.composedPath()[0] !== this) return;
      ev.stopImmediatePropagation();
      this._activate(this._primary(), null, ev);
    }, true);
  }

  /* ----- lifecycle ----- */
  connectedCallback() {
    if (!this.shadowRoot) this._render();
    if (!this._defaults) this._defaults = this._stateAttrs();
    this._build();
    ticker.add(this);
    if (seen) seen.observe(this);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resized());
      this._ro.observe(boxParent(this) || document.documentElement);
    }
    // Sign sizes are measured in the sign font; measure again once web fonts have loaded.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this._scheduleRebuild(true));
  }
  disconnectedCallback() {
    ticker.remove(this);
    if (seen) seen.unobserve(this);
    if (this._ro) this._ro.disconnect();
    this._ro = null;
    this._teardownView();
    this._ctl = null;
    this._awake = false;
  }
  attributeChangedCallback(name, old, value) {
    if (this._reflecting || old === value || !this._ctl) return;
    if (name === 'disabled') return this._syncDisabled();
    if (name === 'inspect') return this._view && (compat.setInspect(this._view, this.inspect), this._view.draw(performance.now()));
    if (name === 'aria-label') return this._syncNames();
    if (name === 'style' || name === 'class') return this._resized();   // --rs-block may have changed
    const key = this._def.attrToState[name];
    if (key) {
      const st = this._def.spec.state[key];
      this[key] = coerce({ type: typeof this._ctl.state[key] === 'boolean' ? 'boolean' : st.type || 'string' }, value);
      return;
    }
    this._scheduleRebuild();
  }

  /* ----- public surface ----- */
  get contraption() {
    const c = this._ctl;
    return c ? { world: c.world, io: c.io, entry: c.entry, built: c.built, view: this._view, state: Object.assign({}, c.state) } : null;
  }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get inspect() { return this.hasAttribute('inspect'); }
  set inspect(v) { this.toggleAttribute('inspect', !!v); }
  get form() { return this._internals ? this._internals.form : null; }
  get labels() { return this._internals ? this._internals.labels : []; }
  get validity() { return this._internals ? this._internals.validity : undefined; }
  get validationMessage() { return this._internals ? this._internals.validationMessage : ''; }
  get willValidate() { return this._internals ? this._internals.willValidate : false; }
  checkValidity() { return this._internals ? this._internals.checkValidity() : true; }
  reportValidity() { return this._internals ? this._internals.reportValidity() : true; }
  get name() { return this.getAttribute('name') || ''; }
  set name(v) { this.setAttribute('name', v); }
  get label() { return this._labelText(); }
  // Re-read --rs-block and the container width after a change the element cannot observe (an ancestor's CSS).
  refresh() { this._resized(); }
  // A player action from outside the element's controls (a trigger elsewhere on the page, a method such as
  // showModal(), a slider drag, a text field, typeahead): act(hand, io, built). Like a control: ignored while
  // disabled, settled at once with reduced motion. opts: { event } is the input event; with { settle: true } the
  // world is settled and the state applied at once, so the element's events fire before this returns.
  perform(act, opts = {}) {
    this._activate({ act }, null, opts.event || null);
    if (!opts.settle || !this._ctl || this._isDisabled()) return;
    const changes = this._ctl.settle();
    this._apply(this._ctl.state, changes, false);
    this._layout();
    if (this._view) this._view.draw(performance.now());
  }

  formDisabledCallback(disabled) {
    this._formDisabled = disabled;
    this._syncDisabled();
  }
  // Reset: rebuild a fresh world from the attributes the element started with.
  formResetCallback() {
    this._reflect(() => {
      for (const [name, val] of Object.entries(this._defaults || {})) {
        if (val === null) this.removeAttribute(name);
        else this.setAttribute(name, val);
      }
    });
    if (this.isConnected) this._build();
  }

  /* ----- shadow root ----- */
  _render() {
    const spec = this._def.spec;
    const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
    // label: an io key puts the text on those signs; 'beside' sets it next to the machine as ordinary page text.
    const beside = spec.label === 'beside';
    // labelSlot names a slot for the sign text, so the default slot can go through an opening (rs-collapse).
    const labelSlot = spec.label && !beside ? (spec.labelSlot ? `<slot name="${spec.labelSlot}"></slot>` : '<slot></slot>') : '';
    const openings = asList(spec.opening);
    const defaultInWindow = openings.some(o => !o.slot);
    root.innerHTML = `<style>${BASE_CSS}${spec.styles || ''}</style><style class="rs-size"></style>
      <div class="box rs-own" part="box">
        <div class="stage" part="stage" aria-hidden="true"></div>
        <div class="label" part="label"${spec.readLabel ? '' : ' aria-hidden="true"'}>${labelSlot}</div>
        <div class="controls"></div>
        ${openings.map((o, i) => `<div class="window" part="window" data-i="${i}" hidden><slot${o.slot ? ` name="${o.slot}"` : ''}></slot></div>`).join('')}
      </div>
      ${beside ? '<span class="caption" part="label"><slot></slot></span>' : ''}
      ${!spec.label && !defaultInWindow ? '<div class="stash"><slot></slot></div>' : ''}
      <span class="sr" aria-live="polite"></span>`;
    this._box = root.querySelector('.box');
    this._sizeStyle = root.querySelector('.rs-size');
    this._stage = root.querySelector('.stage');
    this._labelEl = root.querySelector('.label');
    if (beside) {
      this.setAttribute('data-rs-beside', '');
      // Like a native <label>: clicking the caption operates the primary control.
      root.querySelector('.caption').addEventListener('click', ev => {
        if (SYNTHETIC.has(ev)) return;
        const pick = spec.captionControl ? spec.captionControl(this, ev) : null;
        const control = pick || this._primary();
        // With no control to operate (rs-list's items), the caption is ordinary page text: its clicks reach the page.
        if (!control) return;
        ev.stopPropagation();
        this._activate(control, null, ev);
      });
    }
    this._windows = [...root.querySelectorAll('.window')];
    this._controlsEl = root.querySelector('.controls');
    this._live = root.querySelector('.sr');
    // Raw clicks on the machine itself stay inside; clicks on content shown through an opening do not.
    root.addEventListener('click', ev => {
      if (SYNTHETIC.has(ev)) return;
      if (ev.composedPath().some(n => n.classList && n.classList.contains('rs-own'))) ev.stopPropagation();
    });
    root.addEventListener('slotchange', () => {
      this._syncNames();
      if (this._ctl) this._scheduleRebuild(true);
    });
  }

  /* ----- build and view ----- */
  _ctx(B) {
    const el = this;
    const text = this._labelText(true);
    let cv = null;
    // Measured in the sign font as the label resolves it (--rs-sign-font, weight and all), in blocks.
    const measure = t => {
      if (!cv) {
        cv = document.createElement('canvas').getContext('2d');
        const cs = getComputedStyle(this._labelEl);
        cv.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
      }
      return (cv.measureText(t).width / 100) * SIGN_TEXT;
    };
    if (B === undefined) B = blockSize(this, this._hasSignText());
    return { el, B, text, measure, signsFor: (t, o) => signsFor(t, Object.assign({ measure }, o)) };
  }
  // Whether the machine carries text on signs, which sets the block size's default and floor (SPEC I3): the core's
  // label has text, or the `signs` param (the signs a component lays its own text on) comes to one or more.
  // spec.signText: true | false | (el) => bool decides instead.
  _hasSignText() {
    const spec = this._def.spec;
    if (spec.signText !== undefined) return typeof spec.signText === 'function' ? !!spec.signText(this) : !!spec.signText;
    if (spec.label && spec.label !== 'beside') {
      if (!spec.labelSlot) return !!this._labelText(true);
      const own = [...this.children].filter(c => c.slot === spec.labelSlot).map(c => c.textContent).join('').trim();
      return !!(own || (spec.labelFallback && String(spec.labelFallback(this) || '').trim()));
    }
    const m = spec.params && spec.params.signs;
    if (!m) return false;
    if (typeof m !== 'function') return true;
    try {
      const n = m(this, this._ctx(SIGN_BLOCK));
      return Array.isArray(n) ? n.some(v => v > 0) : n > 0;
    } catch (e) {
      return true;
    }
  }
  _params() {
    const ctx = this._ctx();
    return paramsFor(this._def.entry(this), this._def.spec, n => this.getAttribute(n), ctx);
  }
  _build() {
    const def = this._def;
    const entry = def.entry(this);
    if (!entry) {
      console.error(`${def.tag}: catalogue entry '${def.spec.entry}' is not registered`);
      return;
    }
    this._teardownView();
    const ctl = this._ctl = new Controller(def.spec, entry);
    try {
      ctl.build(this._params());
    } catch (e) {
      this._ctl = null;
      console.error(`${def.tag}: build failed`, e);
      return;
    }
    compat.on(ctl.world, 'sound', ev => playSound(ev));
    this._mountView();
    this._apply(ctl.state, [], true);
    this._awake = !ctl.quiet();
  }
  _scheduleRebuild(onlyIfParamsChanged) {
    if (this._rebuildQueued) return;
    this._rebuildQueued = true;
    queueMicrotask(() => {
      this._rebuildQueued = false;
      if (!this.isConnected || !this._ctl) return;
      if (onlyIfParamsChanged && sameParams(this._def.spec, this._params(), this._ctl.params)) return;
      this._build();
    });
  }
  _fitBlock() {
    const signs = this._hasSignText();
    const want = blockSize(this, signs);
    const [x0, x1, y0, y1] = this._ctl.built.box;
    const cols = x1 - x0 + 1;
    const parent = boxParent(this);
    let avail = Infinity;
    if (parent) {
      const cs = getComputedStyle(parent);
      avail = parent.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    }
    if (!(avail > 0)) avail = Infinity;
    // Never shrink sign text (SPEC I3), nor below spec.minBlock: the element scrolls instead.
    const floor = signs ? SIGN_BLOCK : Math.max(12, Math.min(want, this._def.spec.minBlock || 12));
    return Math.max(floor, Math.min(want, Math.floor(avail / cols)));
  }
  _mountView() {
    const R = RSR();
    if (!R) return;
    const B = this._fitBlock();
    const T = Math.max(2, Math.round(B * 0.72));
    this._stage.innerHTML = '';
    const view = this._view = R.makeView(this._stage, this._ctl.built, { B, T, inspect: this.inspect });
    if (this.inspect) compat.setInspect(view, true);
    this._box.style.setProperty('--b', B + 'px');
    this._sizeStyle.textContent = `:host { --b: ${B}px; --t: ${T}px; }`;
    this._box.style.marginBottom = '';
    this._box.style.marginRight = '';
    this._trim = null;
    const cap = this.shadowRoot.querySelector('.caption');
    if (cap) {
      cap.style.setProperty('--b', B + 'px');
      cap.style.setProperty('--t', T + 'px');
    }
    this._box.style.width = view.W + 'px';
    this._box.style.height = view.H + 'px';
    this._makeControls();
    this._layout();
    if (this._def.spec.inline) this._inline(view);
    // spec.mounted(el, view, built): the element may add its own overlays (rs-navbar's links and pearl sky).
    if (this._def.spec.mounted) this._def.spec.mounted(this, view, this._ctl.built);
    view.draw(performance.now());
  }
  _teardownView() {
    if (this._view) compat.removeView(this._view);
    this._view = null;
    if (this._stage) this._stage.innerHTML = '';
    if (this._controlsEl) this._controlsEl.innerHTML = '';
  }
  _resized() {
    if (!this._ctl || !this._view) return;
    if (this._fitBlock() !== this._view.B) this._mountView();
    // Computed params may depend on the block size (columns that fill a width), so check them either way.
    this._scheduleRebuild(true);
  }

  /* ----- overlays: controls, sign text, openings ----- */
  _cellRects(blocks) {
    const out = [];
    for (const b of blocks) {
      out.push(compat.rectOf(this._view, [b.x, b.y, b.z], 'front'));
      out.push(compat.rectOf(this._view, [b.x, b.y, b.z], 'top'));
    }
    return out;
  }
  _makeControls() {
    const spec = this._def.spec;
    this._controlsEl.innerHTML = '';
    if (this._hoverOff) this._hoverOff.abort();
    this._hoverOff = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this._controls = (spec.controls || []).map((c, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hit';
      btn.setAttribute('part', 'control');
      if (c.role && c.role !== 'button') btn.setAttribute('role', c.role);
      btn.addEventListener('click', ev => this._activate(c, null, ev));
      if (c.keys) {
        btn.addEventListener('keydown', ev => {
          const k = c.keys[ev.key];
          if (!k) return;
          ev.preventDefault();
          this._activate(c, ev.key, ev, k);
        });
      }
      if (c.hover) this._hover(c, btn);
      if (spec.roving) btn.addEventListener('keydown', ev => this._rove(ev, i));
      this._controlsEl.appendChild(btn);
      return { spec: c, btn, i };
    });
    this._syncNames();
    this._syncDisabled();
  }
  // hover: { enter, leave } actions for a control the pointer "stands on": the pointer over the element or focus
  // inside it (the control, or content shown through an opening) is enter; leaving both is leave. A touch tap is
  // enter (the tapped button takes focus); tapping elsewhere is leave.
  _hover(c, btn) {
    const opt = this._hoverOff ? { signal: this._hoverOff.signal } : undefined;
    let over = false;
    const inside = () => over || this.matches(':focus-within');
    const enter = ev => this._activate(c, null, ev, c.hover.enter);
    const leave = ev => { if (!inside()) this._activate(c, null, ev, c.hover.leave); };
    this.addEventListener('pointerenter', ev => { if (ev.pointerType !== 'touch') over = true; enter(ev); }, opt);
    this.addEventListener('pointerleave', ev => { over = false; if (ev.pointerType !== 'touch') leave(ev); }, opt);
    this.addEventListener('focusin', enter, opt);
    this.addEventListener('focusout', ev => { if (!ev.relatedTarget || !this.contains(ev.relatedTarget) && !this.shadowRoot.contains(ev.relatedTarget)) queueMicrotask(() => leave(ev)); }, opt);
  }
  // Positions follow the blocks, so a control on a moved or popped block moves or disappears with it.
  _layout() {
    const io = this._ctl.io, world = this._ctl.world, spec = this._def.spec;
    for (const c of this._controls || []) {
      const blocks = asList(c.spec.area || c.spec.io).flatMap(k => blocksOf(io[k])).filter(b => world.get(b.x, b.y, b.z) === b);
      const r = union(this._cellRects(blocks));
      // An inline element's box ends above the empty front row (see _inline): so does its hit area.
      if (r && this._trim) r.h = Math.max(0, Math.min(r.h, this._trim - r.y));
      c.btn.hidden = !r;
      if (r) place(c.btn, r);
    }
    if (spec.label && spec.label !== 'beside') {
      const signs = blocksOf(io[spec.label]).filter(b => world.get(b.x, b.y, b.z) === b);
      const r = union(signs.map(b => compat.rectOf(this._view, b, 'front')));
      this._labelEl.hidden = !r;
      if (r) place(this._labelEl, r);
    }
    asList(spec.opening).forEach((o, i) => {
      const cells = asList(typeof o.cells === 'function' ? o.cells(this._ctl.built) : this._ctl.built[o.cells || 'opening']);
      const r = union(cells.map(c => compat.rectOf(this._view, c, 'front')));
      if (r) place(this._windows[i], r);
    });
  }
  // spec.inline: the element sits in a line of text (rs-chip). Its box ends at the bottom of the wall its label signs
  // hang on and at its last block on the right, so the empty front row below them and an empty column the machine
  // keeps for a piston stroke reserve no space in the line; the sign text's baseline sits on the line's baseline.
  _inline(view) {
    const spec = this._def.spec;
    const signs = blocksOf(this._ctl.io[spec.label]);
    if (!signs.length) return;
    const boards = union(signs.map(b => compat.rectOf(view, b, 'front')));
    // A wall sign (att N) hangs on the block behind it: that block's front face reaches below the board.
    const walls = signs.filter(b => !b.att || b.att === 'N').map(b => compat.rectOf(view, [b.x, b.y - 1, b.z], 'front'));
    const bottom = Math.max(boards.y + boards.h, ...walls.map(r => r.y + r.h));
    // The text's baseline: a line box of 1em centred on the board, with the font's content area centred in it.
    const size = view.B * SIGN_TEXT;
    const cs = getComputedStyle(this._labelEl);
    const g = document.createElement('canvas').getContext('2d');
    g.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const m = g.measureText('Hxg');
    const ascent = m.fontBoundingBoxAscent || size * 0.8;
    const descent = m.fontBoundingBoxDescent || size * 0.2;
    const baseline = boards.y + boards.h / 2 + (ascent - descent) / 2;
    this._trim = bottom;
    this._box.style.marginBottom = -(view.H - bottom) + 'px';
    const cells = union(this._cellRects([...this._ctl.world.c.values()]));
    if (cells) this._box.style.marginRight = -Math.max(0, view.W - (cells.x + cells.w)) + 'px';
    this._sizeStyle.textContent += `:host { vertical-align: ${-(bottom - baseline).toFixed(2)}px; }`;
    this._layout();
  }
  _labelText(raw) {
    if (!raw) {
      const aria = this.getAttribute('aria-label');
      if (aria) return aria;
    }
    const own = (this.textContent || '').replace(/\s+/g, ' ').trim();
    if (own || raw) return own;
    const labels = this.labels ? [...this.labels] : [];
    return labels.map(l => l.textContent.trim()).join(' ');
  }
  _syncNames() {
    // labelFallback(el): text shown on the signs when nothing is slotted into labelSlot (a summary attribute).
    const fallback = this._def.spec.labelFallback && this._labelEl && this._labelEl.querySelector('slot');
    // Only when it differs: rewriting a slot's fallback while a MutationObserver exists on the page signals a
    // slotchange in Chromium, and the slotchange handler lands here again (an endless microtask loop).
    const text = fallback ? this._def.spec.labelFallback(this) : null;
    if (fallback && fallback.textContent !== text) fallback.textContent = text;
    const name = this._labelText();
    for (const c of this._controls || []) {
      const label = typeof c.spec.label === 'function' ? c.spec.label(this) : c.spec.label || name;
      if (label) c.btn.setAttribute('aria-label', label);
      else c.btn.removeAttribute('aria-label');
    }
  }
  // A radio group's arrow keys: focus the next (or previous) visible control and operate it, wrapping around.
  // Auto-repeat is ignored: it would press a button every 30 ms.
  // Home and End go to the first and last control (tabs).
  _rove(ev, i) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
    const edge = { Home: 0, End: -1 }[ev.key];
    if (!step && edge === undefined) return;
    ev.preventDefault();
    if (ev.repeat) return;
    const live = this._controls.filter(c => !c.btn.hidden);
    const at = live.findIndex(c => c.i === i);
    const next = step ? live[(at + step + live.length) % live.length] : live[edge < 0 ? live.length - 1 : 0];
    if (!next || next.i === i) return;
    next.btn.focus();
    this._activate(next.spec, null, ev);
  }
  _tabStops(state) {
    const at = this._def.spec.roving(state, this);
    const live = (this._controls || []).filter(c => !c.btn.hidden);
    const stop = live.find(c => c.i === at) || live[0];
    for (const c of this._controls || []) c.btn.tabIndex = c === stop ? 0 : -1;
  }
  _isDisabled() { return this.disabled || !!this._formDisabled; }
  _syncDisabled() {
    const off = this._isDisabled();
    for (const c of this._controls || []) c.btn.disabled = off;
    if (this._internals) this._internals.ariaDisabled = off ? 'true' : null;
  }
  _primary() { return (this._controls || []).map(c => c.spec).find(c => c.primary) || (this._def.spec.controls || [])[0]; }

  /* ----- input: a player action, then the world runs ----- */
  _activate(control, key, ev, keyAct) {
    if (!control || !this._ctl || this._isDisabled()) return;
    try {
      this._ctl.act(keyAct ? Object.assign({}, control, { act: keyAct }) : control, key);
    } catch (e) {
      console.error(`${this._def.tag}: action failed`, e);
      return;
    }
    if (reducedMotion()) {
      // I6: settle at once and draw the final frame. The state still comes from the contraption.
      const changes = this._ctl.settle();
      this._apply(this._ctl.state, changes, false);
      this._layout();
      this._view && this._view.draw(performance.now());
      return;
    }
    this._awake = true;
    this._view && this._view.draw(performance.now());
  }
  _tick() {
    const changes = this._ctl.tick();
    if (changes.length) this._apply(this._ctl.state, changes, false);
    if (this._view) {
      this._layout();
      this._view.draw(performance.now());
    }
    if (this._ctl.quiet()) this._awake = false;
  }

  /* ----- state: reflect, events, ARIA, form, announcements ----- */
  _reflect(fn) {
    this._reflecting = true;
    try { fn(); } finally { this._reflecting = false; }
  }
  _apply(state, changes, silent) {
    const spec = this._def.spec;
    this._reflect(() => {
      for (const [key, st] of Object.entries(spec.state || {})) {
        if (!st.attr) continue;
        const v = state[key];
        if (typeof v === 'boolean') this.toggleAttribute(st.attr, v);
        else if (v === null || v === undefined) this.removeAttribute(st.attr);
        else this.setAttribute(st.attr, String(v));
      }
    });
    if (spec.host) this._syncHost(spec.host, state);
    for (const c of this._controls || []) {
      for (const [ariaName, key] of Object.entries(c.spec.aria || {})) {
        const v = typeof key === 'function' ? key(state, this) : state[key];
        c.btn.setAttribute('aria-' + ariaName, String(v));
      }
    }
    if (spec.roving) this._tabStops(state);
    if (this._internals && this._internals.states) {
      for (const [key, v] of Object.entries(state)) {
        if (typeof v !== 'boolean') continue;
        try { v ? this._internals.states.add(key) : this._internals.states.delete(key); } catch (e) { /* older CustomStateSet */ }
      }
    }
    asList(spec.opening).forEach((o, i) => {
      const shown = !!state[o.shownWhen || 'open'];
      const w = this._windows[i];
      w.hidden = !shown;
      w.inert = !shown;
    });
    if (spec.form && this._internals) {
      const v = spec.form.value ? spec.form.value(this) : null;
      this._internals.setFormValue(v === undefined ? null : v);
      if (spec.form.validity) {
        const bad = spec.form.validity(this);
        const anchor = (this._controls || []).map(c => c.btn).find(b => !b.hidden);
        try { bad ? this._internals.setValidity(bad.flags, bad.message, anchor) : this._internals.setValidity({}); } catch (e) { /* no anchor yet */ }
      }
    }
    // spec.sync(el, state): after every state change, silent or not, so the element's own overlays follow it.
    if (spec.sync) spec.sync(this, state);
    if (silent) return;
    const said = [];
    for (const ch of changes) {
      ch.dispatched = ch.events.map(type => this._fire(type, ch));
      const st = spec.state[ch.key];
      if (st.announce) said.push(st.announce(ch.value, this));
      if (spec.changed) spec.changed(this, ch);
    }
    if (said.length) this._announce(said.join('. '));
  }
  // spec.host: { role, aria: { valueNow: key | (state, el) => value } } on the element itself: ElementInternals
  // (role, ariaValueNow, ...) where supported, else the attributes. null or undefined removes the property.
  _syncHost(host, state) {
    const set = (name, v) => {
      const prop = name === 'role' ? 'role' : 'aria' + name[0].toUpperCase() + name.slice(1);
      const value = v === null || v === undefined ? null : String(v);
      if (this._internals && prop in this._internals) this._internals[prop] = value;
      else {
        const attr = name === 'role' ? 'role' : 'aria-' + name.toLowerCase();
        if (value === null) this.removeAttribute(attr);
        else this.setAttribute(attr, value);
      }
    };
    if (host.role) set('role', typeof host.role === 'function' ? host.role(this) : host.role);
    for (const [name, key] of Object.entries(host.aria || {})) set(name, typeof key === 'function' ? key(state, this) : state[key]);
  }
  _fire(type, change) {
    const st = this._def.spec.state[change.key] || {};
    const init = { bubbles: true, cancelable: type === 'click' || !!st.cancelable, composed: type === 'click' || type === 'input' };
    const ev = type === 'click' ? new MouseEvent('click', init) : new CustomEvent(type, Object.assign({ detail: { key: change.key, value: change.value, prev: change.prev } }, init));
    SYNTHETIC.add(ev);
    this.dispatchEvent(ev);
    return ev;
  }
  _announce(text) {
    // Alternate a trailing space so the same message twice is still a change.
    this._flip = !this._flip;
    this._live.textContent = text + (this._flip ? ' ' : '');
  }
  _stateAttrs() {
    const out = {};
    for (const st of Object.values(this._def.spec.state || {})) if (st.attr) out[st.attr] = this.getAttribute(st.attr);
    return out;
  }
  // A state set from page code: the player action that should produce it, settled at once, no events.
  _request(key, value) {
    const ctl = this._ctl;
    if (!ctl) {
      const st = this._def.spec.state[key];
      if (st.attr) this._reflect(() => (typeof value === 'boolean' ? this.toggleAttribute(st.attr, value) : this.setAttribute(st.attr, String(value))));
      return;
    }
    if (Object.is(ctl.state[key], value)) return;
    ctl.request(key, value);
    if (this._def.spec.state[key].settle === false) {
      // A timed output (a toast's timer): let the world run, so its events fire as the output changes.
      this._awake = true;
      if (this._view) this._view.draw(performance.now());
      return;
    }
    let changes = ctl.settle();
    if (!Object.is(ctl.state[key], value)) {
      // The machine refused the action while busy (a button still in): it has settled now, so act once more.
      ctl.request(key, value);
      changes = changes.concat(ctl.settle());
    }
    this._awake = !ctl.quiet();   // a clock started by the request keeps running
    this._apply(ctl.state, changes, true);
    this._layout();
    if (this._view) this._view.draw(performance.now());
  }
}

function define(tag, spec) {
  if (!spec || !spec.entry) throw new Error(`Redstone.ui.define('${tag}'): spec.entry is required`);
  const catalogue = () => Redstone.catalogue || window.Catalogue;
  const entry = el => {
    const id = typeof spec.entry === 'function' ? spec.entry(el) : spec.entry;
    return typeof id === 'string' ? catalogue().get(id) : id;
  };
  const attrToState = {};
  for (const [key, st] of Object.entries(spec.state || {})) if (st.attr && st.set) attrToState[st.attr] = key;
  const observed = new Set(['disabled', 'inspect', 'aria-label', 'style', 'class', ...paramAttributes(spec), ...Object.keys(attrToState), ...(spec.observe || [])]);
  const def = { tag, spec, entry, attrToState };

  class Component extends RedstoneElement {
    static get observedAttributes() { return [...observed]; }
  }
  Component._def = def;
  for (const [key, st] of Object.entries(spec.state || {})) {
    Object.defineProperty(Component.prototype, key, {
      configurable: true,
      get() { return this._ctl ? this._ctl.state[key] : (st.attr ? coerceAttr(this, st) : undefined); },
      set: st.set ? function (v) { this._request(key, typeof this[key] === 'boolean' ? !!v : v); } : undefined,
    });
  }
  for (const [name, fn] of Object.entries(spec.methods || {})) Component.prototype[name] = fn;
  if (!customElements.get(tag)) customElements.define(tag, Component);
  ui.registry.set(tag, def);
  return Component;
}
const coerceAttr = (el, st) => (st.type === 'number' ? Number(el.getAttribute(st.attr)) : el.hasAttribute(st.attr));

// What the docs table shows: attributes, properties and events of a defined component.
function describe(tag) {
  const def = ui.registry.get(tag);
  if (!def) return null;
  const spec = def.spec, entry = def.entry() || {};
  const docs = spec.docs || {};
  const attributes = [], properties = [], events = [];
  for (const [key, m] of Object.entries(spec.params || {})) {
    if (typeof m === 'function') continue;
    const map = typeof m === 'string' ? { attr: m } : m;
    const p = (entry.params || []).find(q => q.key === key) || {};
    const type = typeOf(Object.assign({}, p, map.type || map.def !== undefined ? map : {}));
    const range = p.options ? p.options.join(' | ') : p.min !== undefined ? `${p.min} to ${p.max}, default ${p.def}` : type;
    attributes.push({ name: map.attr || key, type: range, doc: map.doc || p.label || '' });
  }
  for (const [key, st] of Object.entries(spec.state || {})) {
    if (st.attr && !attributes.some(a => a.name === st.attr)) attributes.push({ name: st.attr, type: 'reflects ' + key, doc: st.doc || '' });
    properties.push({ name: key, type: st.set ? 'read/write' : 'read-only', doc: st.doc || '' });
    for (const type of asList(st.event)) events.push({ name: type, doc: `${st.when === 'rise' ? 'When ' + key + ' turns on' : st.when === 'fall' ? 'When ' + key + ' turns off' : 'When ' + key + ' changes'}${st.eventDoc ? '. ' + st.eventDoc : ''}` });
  }
  for (const [name, doc] of Object.entries(docs.attributes || {})) attributes.push({ name, type: 'string', doc });
  attributes.push({ name: 'disabled', type: 'boolean', doc: 'No player actions; the controls leave the tab order.' });
  attributes.push({ name: 'inspect', type: 'boolean', doc: 'X-ray: ghost covering blocks and show the wiring.' });
  for (const [name, doc] of Object.entries(docs.properties || {})) properties.push({ name, type: '', doc });
  properties.push({ name: 'contraption', type: 'read-only', doc: '{ world, io, entry } for the curious.' });
  for (const [name, doc] of Object.entries(docs.events || {})) events.push({ name, doc });
  const actions = (spec.controls || []).map(c => (typeof c.act === 'string' ? c.act : 'custom') + (c.io ? ' ' + c.io : ''));
  return { tag, entry, attributes, properties, events, actions, keys: (spec.controls || []).flatMap(c => Object.keys(c.keys || {})) };
}

function injectStyles(css) {
  const script = document.currentScript;
  if (script && script.hasAttribute('data-rs-no-style')) return;
  if (document.getElementById('redstone-ui-css')) return;
  const style = document.createElement('style');
  style.id = 'redstone-ui-css';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

Object.assign(Redstone.ui, { define, describe, injectStyles, sound: playSound, Element: RedstoneElement, ticker });
})();
