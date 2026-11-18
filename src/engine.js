// Redstone tick engine. One World is a sparse 3D grid of plain block objects { t, x, y, z, ...state }.
// Coordinates: x east, y toward the viewer (south, N is away), z up. One tick is one redstone tick (2 game ticks, 100 ms).
// Target: Minecraft Java Edition 1.21. docs/ENGINE.md lists every rule and every simplification.
(function () {

// ---------------------------------------------------------------------------------------------
// Directions and cell keys
// ---------------------------------------------------------------------------------------------

const D = { N: [0, -1, 0], E: [1, 0, 0], S: [0, 1, 0], W: [-1, 0, 0], U: [0, 0, 1], D: [0, 0, -1] };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E', U: 'D', D: 'U' };
const DL = ['N', 'E', 'S', 'W', 'U', 'D'];
const HL = ['N', 'E', 'S', 'W'];
const K = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
const NOOP = () => {};
const MCDIR = { N: 'north', E: 'east', S: 'south', W: 'west', U: 'up', D: 'down' };
// Directions perpendicular to a horizontal facing, used for the sides of repeaters and comparators.
const SIDES = { N: ['E', 'W'], S: ['E', 'W'], E: ['N', 'S'], W: ['N', 'S'] };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------------------------
// Block registry
// ---------------------------------------------------------------------------------------------

const PUSH_CLASSES = ['normal', 'immovable', 'destroy', 'push_only'];
const blocks = Object.create(null);
let nextTypeId = 1;

const BLOCK_DEFAULTS = {
  mc: undefined,          // 'minecraft:stone' or b => blockstate string, for toCommands
  conductive: false,      // opaque full block that can be powered (Java isRedstoneConductor)
  solid: true,            // entity collision
  push: 'normal',         // piston push class
  sticky: undefined,      // 'slime' | 'honey'
  attach: null,           // 'att' (block in direction b.att), 'below', 'door' (upper door half): pops when that support moves
  source: false,          // a signal source that dust connects to (Java isSignalSource)
  holdsWater: true,       // flowing water cannot enter this cell (used to check that water sources are contained)
  slots: 0,               // inventory size for item containers
  instrument: undefined,  // note block instrument when this block is under a note block
};

function defineBlock(type, def) {
  if (!type || typeof type !== 'string') throw new Error('defineBlock: type must be a string');
  const d = Object.assign({}, BLOCK_DEFAULTS, def, { type, id: nextTypeId++ });
  if (!PUSH_CLASSES.includes(d.push)) throw new Error(`defineBlock(${type}): push must be one of ${PUSH_CLASSES.join(', ')}`);
  if (d.sticky !== undefined && d.sticky !== 'slime' && d.sticky !== 'honey') throw new Error(`defineBlock(${type}): sticky must be 'slime' or 'honey'`);
  blocks[type] = d;
  return d;
}

// Blocks a legacy world puts that are not registered behave like an immovable, non-conductive solid.
const UNKNOWN = Object.assign({}, BLOCK_DEFAULTS, { type: '?', id: 0, push: 'immovable', unknown: true });
const defOf = t => blocks[t] || UNKNOWN;

// Item stacks. Ids are vanilla item ids without the namespace.
const MAX_STACK = { bucket: 16, water_bucket: 1, ender_pearl: 16, snowball: 16, egg: 16, book: 1, writable_book: 1, oak_sign: 16 };
const maxStack = id => MAX_STACK[id] || (id && id.startsWith('music_disc') ? 1 : 64);
const DISCS = ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', '11', 'wait', 'pigstep', 'otherside', '5'];

// ---------------------------------------------------------------------------------------------
// Signal hooks shared by several blocks
// ---------------------------------------------------------------------------------------------

// Lever and button: weak power to every side, strong power to the block they are attached to.
const attachedSource = {
  source: true,
  emits: (w, b) => (b.on ? 15 : 0),
  strong: (w, b, toward) => (b.on && toward === b.att ? 15 : 0),
};
// Repeater and comparator output: only out of the front, strong.
const diodeOut = (level) => ({
  emits: (w, b, toward) => (toward === b.d ? level(b) : 0),
  strong: (w, b, toward) => (toward === b.d ? level(b) : 0),
});

// ---------------------------------------------------------------------------------------------
// Block palette (SPEC 5.2)
// ---------------------------------------------------------------------------------------------

function simple(type, mc, extra) {
  return defineBlock(type, Object.assign({ mc: 'minecraft:' + mc, conductive: true }, extra || {}));
}
const colored = suffix => b => `minecraft:${b.color || 'white'}_${suffix}`;

simple('stone', 'stone', { instrument: 'basedrum' });
simple('bricks', 'stone_bricks', { instrument: 'basedrum' });
simple('planks', 'oak_planks', { instrument: 'bass' });
simple('smooth_stone', 'smooth_stone', { instrument: 'basedrum' });
simple('iron', 'iron_block', { instrument: 'iron_xylophone' });
simple('quartz', 'quartz_block', { instrument: 'basedrum' });
simple('wool', 'white_wool', { mc: colored('wool'), instrument: 'guitar' });
simple('concrete', 'white_concrete', { mc: colored('concrete'), instrument: 'basedrum' });
simple('glass', 'glass', { conductive: false, instrument: 'hat' });
simple('terracotta', 'white_glazed_terracotta', {
  push: 'push_only', instrument: 'basedrum',
  mc: b => `minecraft:${b.color || 'white'}_glazed_terracotta[facing=${MCDIR[b.d || 'N']}]`,
});
simple('obsidian', 'obsidian', { push: 'immovable', instrument: 'basedrum' });
simple('soulsand', 'soul_sand', { instrument: 'cow_bell' });
simple('magma', 'magma_block', { instrument: 'basedrum' });
simple('slime', 'slime_block', { sticky: 'slime' });
simple('honey', 'honey_block', { sticky: 'honey', conductive: false });

defineBlock('rblock', {
  mc: 'minecraft:redstone_block', source: true,
  emits: () => 15,
});

defineBlock('lamp', {
  conductive: true,
  mc: b => `minecraft:redstone_lamp[lit=${!!b.lit}]`,
  tick: (w, b, now) => w._lampTick(b, now),
});

defineBlock('bulb', {
  mc: b => `minecraft:waxed_copper_bulb[lit=${!!b.lit},powered=${!!b.powered}]`,
  analog: (w, b) => (b.lit ? 15 : 0),
  onPower: (w, b, rising) => {
    if (!rising) return;
    b.lit = !b.lit;
    w._sound(b.lit ? 'bulb_on' : 'bulb_off', b);
  },
});

defineBlock('target', {
  conductive: true, source: true,
  mc: b => `minecraft:target[power=${b.out || 0}]`,
  emits: (w, b) => b.out || 0,
});

defineBlock('noteblock', {
  conductive: true, instrument: 'bass',
  mc: (b, w) => `minecraft:note_block[instrument=${w ? w.instrumentOf(b) : 'harp'},note=${b.note || 0},powered=${!!b.powered}]`,
  onPower: (w, b, rising) => { if (rising) w._playNote(b); },
});

// Containers: `fill` is always the comparator reading (0 to 15). `items`, when present, holds the stacks
// ([{ id, n }], one entry per slot, null for an empty slot) and `fill` is derived from it.
const containerMc = (name, facing) => b => `minecraft:${name}${facing ? `[facing=${MCDIR[b.d || 'S']}]` : ''}`;
defineBlock('barrel', { push: 'immovable', conductive: true, slots: 27, instrument: 'bass', mc: b => `minecraft:barrel[facing=${MCDIR[b.d || 'U']},open=false]`, analog: (w, b) => b.fill || 0 });
defineBlock('chest', { push: 'immovable', conductive: false, slots: 27, instrument: 'bass', mc: containerMc('chest', true), analog: (w, b) => b.fill || 0 });
defineBlock('furnace', { push: 'immovable', conductive: true, slots: 3, instrument: 'basedrum', mc: b => `minecraft:furnace[facing=${MCDIR[b.d || 'S']},lit=false]`, analog: (w, b) => b.fill || 0 });
defineBlock('jukebox', {
  push: 'immovable', conductive: true, instrument: 'bass',
  mc: b => `minecraft:jukebox[has_record=${(b.fill || 0) > 0}]`,
  analog: (w, b) => b.fill || 0,
});
const dispenserDef = name => ({
  push: 'immovable', conductive: true, slots: 9, qc: true, instrument: 'basedrum',
  mc: b => `minecraft:${name}[facing=${MCDIR[b.d || 'N']},triggered=${!!b.powered}]`,
  analog: (w, b) => b.fill || 0,
  onPower: (w, b, rising) => { if (rising) w.at(w.t + 2, () => w._dispense(b)); },
});
defineBlock('dispenser', dispenserDef('dispenser'));
defineBlock('dropper', dispenserDef('dropper'));
defineBlock('hopper', {
  push: 'immovable', conductive: false, slots: 5,
  mc: b => `minecraft:hopper[facing=${MCDIR[b.d || 'D']},enabled=${!b.powered}]`,
  analog: (w, b) => b.fill || 0,
  tick: (w, b, now) => w._hopperTick(b, now),
});

defineBlock('lectern', {
  push: 'immovable', source: true, holdsWater: true, instrument: 'bass',
  mc: b => `minecraft:lectern[facing=${MCDIR[b.d || 'N']},has_book=${(b.pages || 0) > 0},powered=${!!b.powered}]`,
  emits: (w, b) => (b.powered ? 15 : 0),
  strong: (w, b, toward) => (b.powered && toward === 'D' ? 15 : 0),
  analog: (w, b) => {
    const pages = b.pages || 0;
    if (!pages) return 0;
    const f = pages > 1 ? (b.page || 0) / (pages - 1) : 1;
    return Math.floor(f * 14) + 1;
  },
});

defineBlock('bookshelf', {
  push: 'immovable', conductive: true, instrument: 'bass',
  mc: b => {
    const s = b.slots || [];
    const occ = [0, 1, 2, 3, 4, 5].map(i => `slot_${i}_occupied=${!!s[i]}`).join(',');
    return `minecraft:chiseled_bookshelf[facing=${MCDIR[b.d || 'S']},${occ}]`;
  },
  analog: (w, b) => (b.last === undefined || b.last === null ? 0 : b.last + 1),
});

// A bell pops off when a piston pushes it (Java: push reaction DESTROY).
defineBlock('bell', {
  push: 'destroy', attach: 'att', solid: true,
  mc: b => {
    const kind = b.att === 'D' || !b.att ? 'floor' : b.att === 'U' ? 'ceiling' : 'single_wall';
    const facing = kind === 'single_wall' ? OPP[b.att] : (b.d || 'N');
    return `minecraft:bell[attachment=${kind},facing=${MCDIR[facing]},powered=${!!b.powered}]`;
  },
  onPower: (w, b, rising) => { if (rising) w._ringBell(b); },
});

defineBlock('sign', {
  push: 'immovable', attach: 'att', solid: false,
  mc: b => {
    if (b.kind === 'hanging') return 'minecraft:oak_hanging_sign[rotation=0,attached=false]';
    if (b.kind === 'standing' || b.att === 'D') return 'minecraft:oak_sign[rotation=0]';
    return `minecraft:oak_wall_sign[facing=${MCDIR[OPP[b.att || 'N']]}]`;
  },
});

// Item frame. In the game it is an entity hanging on a block face; here it occupies the cell in front of that face.
defineBlock('frame', {
  push: 'destroy', attach: 'att', solid: false, holdsWater: false,
  analog: (w, b) => (b.item ? (b.rot || 0) + 1 : 0),
});

defineBlock('piston', {
  mc: b => `minecraft:${b.s ? 'sticky_piston' : 'piston'}[facing=${MCDIR[b.d]},extended=${!!b.ext}]`,
});
defineBlock('head', {
  push: 'immovable',
  mc: b => `minecraft:piston_head[facing=${MCDIR[b.d]},type=${b.s ? 'sticky' : 'normal'},short=false]`,
});

defineBlock('observer', {
  mc: b => `minecraft:observer[facing=${MCDIR[b.d]},powered=${!!b.on}]`,
  emits: (w, b, toward) => (b.on && toward === OPP[b.d] ? 15 : 0),
  strong: (w, b, toward) => (b.on && toward === OPP[b.d] ? 15 : 0),
});

defineBlock('dust', {
  push: 'destroy', attach: 'below', solid: false, holdsWater: false,
  mc: b => {
    const up = b.up || [];
    const side = d => (up.includes(d) ? 'up' : (b.pts || []).includes(d) ? 'side' : 'none');
    return `minecraft:redstone_wire[power=${b.lvl || 0},north=${side('N')},east=${side('E')},south=${side('S')},west=${side('W')}]`;
  },
  // Dust powers the block below it and the cells it points into, never upward.
  emits: (w, b, toward) => {
    const lvl = b.lvl || 0;
    if (!lvl || toward === 'U') return 0;
    if (toward === 'D') return lvl;
    return b.pts && b.pts.includes(toward) ? lvl : 0;
  },
});

defineBlock('torch', {
  push: 'destroy', attach: 'att', solid: false, source: true, holdsWater: false,
  mc: b => (b.att === 'D' || !b.att
    ? `minecraft:redstone_torch[lit=${!!b.lit}]`
    : `minecraft:redstone_wall_torch[facing=${MCDIR[OPP[b.att]]},lit=${!!b.lit}]`),
  // A torch powers every side except the block it stands on, and strongly powers the block above it.
  emits: (w, b, toward) => (b.lit && toward !== b.att ? 15 : 0),
  strong: (w, b, toward) => (b.lit && toward === 'U' && b.att !== 'U' ? 15 : 0),
  tick: (w, b, now) => w._torchTick(b, now),
});

defineBlock('repeater', Object.assign({
  push: 'destroy', attach: 'below', solid: false, source: true, holdsWater: false,
  mc: b => `minecraft:repeater[facing=${MCDIR[OPP[b.d]]},delay=${b.delay || 1},locked=${!!b.locked},powered=${!!b.on}]`,
  tick: (w, b, now) => w._repeaterTick(b, now),
}, diodeOut(b => (b.on ? 15 : 0))));

defineBlock('comparator', Object.assign({
  push: 'destroy', attach: 'below', solid: false, source: true, holdsWater: false,
  mc: b => `minecraft:comparator[facing=${MCDIR[OPP[b.d]]},mode=${b.mode === 'sub' ? 'subtract' : 'compare'},powered=${(b.out || 0) > 0}]`,
  tick: (w, b, now) => w._comparatorTick(b, now),
}, diodeOut(b => b.out || 0)));

defineBlock('lever', Object.assign({
  push: 'destroy', attach: 'att', solid: false, holdsWater: false,
  mc: b => `minecraft:lever[${faceProps(b)},powered=${!!b.on}]`,
}, attachedSource));

defineBlock('button', Object.assign({
  push: 'destroy', attach: 'att', solid: false, holdsWater: false,
  mc: b => `minecraft:${b.wood ? 'oak' : 'stone'}_button[${faceProps(b)},powered=${!!b.on}]`,
}, attachedSource));

// Pressure plates: weak power to every side, strong power to the block under them.
defineBlock('plate', {
  push: 'destroy', attach: 'below', solid: false, source: true, holdsWater: false,
  mc: b => `minecraft:${b.wood ? 'oak' : 'stone'}_pressure_plate[powered=${!!b.on}]`,
  emits: (w, b) => (b.on ? 15 : 0),
  strong: (w, b, toward) => (b.on && toward === 'D' ? 15 : 0),
  tick: (w, b, now) => w._plateTick(b, now),
});

// Doors are two blocks: half 'lower' (on a block) and half 'upper' (on the lower half). Iron by default.
defineBlock('door', {
  push: 'destroy', attach: 'below',
  mc: b => `minecraft:${b.iron === false ? 'oak' : 'iron'}_door[facing=${MCDIR[b.d || 'N']},half=${b.half === 'upper' ? 'upper' : 'lower'},hinge=${b.hinge || 'left'},open=${!!b.open},powered=${!!b.powered}]`,
  tick: (w, b, now) => w._doorTick(b, now),
});
defineBlock('trapdoor', {
  mc: b => `minecraft:${b.iron ? 'iron' : 'oak'}_trapdoor[facing=${MCDIR[b.d || 'N']},half=${b.half === 'bottom' ? 'bottom' : 'top'},open=${!!b.open},powered=${!!b.powered}]`,
  openable: true,
  onPower: (w, b, rising) => w._openable(b, rising, 'trapdoor'),
});
defineBlock('gate', {
  mc: b => `minecraft:oak_fence_gate[facing=${MCDIR[b.d || 'N']},open=${!!b.open},powered=${!!b.powered},in_wall=false]`,
  openable: true,
  onPower: (w, b, rising) => w._openable(b, rising, 'gate'),
});

defineBlock('daylight', {
  push: 'immovable', source: true,
  mc: b => `minecraft:daylight_detector[inverted=${!!b.inverted},power=${b.level || 0}]`,
  emits: (w, b) => b.level || 0,
  tick: (w, b) => {
    const sky = clamp(w.sky, 0, 15);
    const level = b.inverted ? 15 - sky : sky;
    if (b.level !== level) { b.level = level; w._dirty = true; }
  },
});

defineBlock('sculk', {
  push: 'immovable', source: true,
  mc: b => `minecraft:sculk_sensor[power=${b.on ? b.out || 0 : 0},sculk_sensor_phase=${b.state === 'active' ? 'active' : b.state === 'cool' ? 'cooldown' : 'inactive'}]`,
  emits: (w, b) => (b.on ? b.out || 0 : 0),
  strong: (w, b, toward) => (b.on && toward === 'D' ? b.out || 0 : 0),
});

// A water source. Only sources exist: the engine does not simulate flowing water, so a strict world checks
// that every source is contained (see World.seal). Pistons displace water (push class destroy).
defineBlock('water', { push: 'destroy', solid: false, mc: 'minecraft:water' });


function faceProps(b) {
  if (b.att === 'D' || !b.att) return `face=floor,facing=${MCDIR[b.d || 'N']}`;
  if (b.att === 'U') return `face=ceiling,facing=${MCDIR[b.d || 'N']}`;
  return `face=wall,facing=${MCDIR[OPP[b.att]]}`;
}

// Fields that are engine bookkeeping, not block state: left out of hash() and assertSteady().
const TRANSIENT = new Set(['x', 'y', 'z', 't', 'mv', 'mvAt', 'pushedAt', 'seen', 'busy', 'firePending', 'pend', 'offAt', 'tgt', 'inp', 'p', 'pts', 'up']);

function mix(h, v) {
  h = Math.imul(h ^ (v | 0), 0x9e3779b1);
  return (h ^ (h >>> 15)) | 0;
}
function strHash(s, h) {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

// ---------------------------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------------------------

const LEGACY_RULES = {
  qc: false,              // quasi-connectivity for pistons, droppers and dispensers
  stretch: false,         // repeaters lock and stretch short pulses (one pending update at a time)
  trapdoorPush: false,    // trapdoors are movable by pistons and slime (legacy worlds: immovable)
  projectileHit: false,   // projectiles hit blocks (pearls teleport away, targets light) instead of resting on them
};
const STRICT_RULES = { qc: true, stretch: true, trapdoorPush: true, projectileHit: true };

class World {
  constructor(opts = {}) {
    this.c = new Map();
    this.t = 0;
    this.ev = [];
    this.sensors = [];
    this.vibs = [];
    this.hasWool = false;
    this.entities = [];
    this.strong = new Map();
    this.weak = new Map();
    this.strict = !!opts.strict;
    this.rules = Object.assign({}, this.strict ? STRICT_RULES : LEGACY_RULES, opts.rules || {});
    this.sealed = false;
    this._sky = opts.sky === undefined ? 15 : opts.sky;
    this._inside = 0;          // >0 while the engine itself (tick, hand) is mutating the world
    this._emitting = false;
    this._listeners = Object.create(null);
    this._quiet = false;
    this._dirty = true;        // something changed during the current tick
    this._toggles = null;
    this.hand = new Hand(this);
  }

  // ---- build phase ----------------------------------------------------------------------------

  _guard(what) {
    if (this.sealed && this._inside === 0) throw new Error(`World.${what}: the world is sealed; only the engine and world.hand may change it (R3, R5)`);
  }
  get(x, y, z) { return this.c.get(K(x, y, z)) || null; }
  set(x, y, z, b) {
    this._guard('set');
    const k = K(x, y, z);
    if (b) { b.x = x; b.y = y; b.z = z; this.c.set(k, b); } else this.c.delete(k);
    this._quiet = false;
    this._dirty = true;
  }
  put(x, y, z, t, o = {}) {
    this._guard('put');
    if (this.strict && !blocks[t]) throw new Error(`World.put: unknown block type '${t}'`);
    const b = Object.assign({ t }, o);
    if (t === 'observer' && b.seen === undefined) b.seen = null;
    if (t === 'sculk') { b.state = b.state || 'idle'; b.out = b.out || 0; this.sensors.push(b); }
    if (t === 'wool') this.hasWool = true;
    if (b.items) this._syncFill(b);
    this.set(x, y, z, b);
    return b;
  }
  // Items use gravity .04, drag .98 and ground friction .6. Projectile pearls use position -> drag .99 -> gravity .03
  // (Java 1.11-1.21.1). Two game ticks per redstone tick. Velocities are per game tick.
  spawn(kind, x, y, z, o = {}) {
    this._guard('spawn');
    const en = Object.assign({ kind, x, y, z, vx: 0, vy: 0, vz: 0, px: x, py: y, pz: z, ground: false }, o);
    this.entities.push(en);
    this._quiet = false;
    return en;
  }
  at(t, fn) {
    this._guard('at');
    this.ev.push({ t, fn });
  }
  nb(b, d) { const v = D[d]; return this.get(b.x + v[0], b.y + v[1], b.z + v[2]); }
  get sky() { return this._sky; }
  set sky(v) { this._sky = v; this._quiet = false; }   // daylight: the environment, not a player action

  // Strict worlds: check R1, R2 (wiring) and R6, then refuse every mutation that is not the engine or world.hand.
  seal() {
    if (this.sealed) return this;
    if (this.strict) {
      const bad = [];
      for (const b of this.c.values()) {
        const def = blocks[b.t];
        const at = `${b.t} at (${b.x},${b.y},${b.z})`;
        if (!def) bad.push(`${at}: unknown block`);
        if (b.buried) bad.push(`${at}: 'buried' hides a block by fiat (R6)`);
        if (b.t === 'water' && !this.waterContained(b)) bad.push(`${at}: water source is not contained and would flow`);
        if (def && def.attach && !this.supported(b)) bad.push(`${at}: nothing to attach to`);
        if (b.t === 'piston' && b.ext) {
          const h = this.nb(b, b.d);
          if (!h || h.t !== 'head' || h.d !== b.d) bad.push(`${at}: extended piston without its head`);
        }
      }
      if (bad.length) throw new Error('World.seal: not a strict world:\n  ' + bad.join('\n  '));
    }
    this._adopt();
    this.sealed = true;
    return this;
  }

  // Blocks built without `powered` take their current power as given (no edge), except that an open trapdoor
  // or gate is taken to be held open by power. Runs at seal(), or before the first tick of an unsealed world.
  _adopt() {
    if (this._adopted) return;
    this._adopted = true;
    this._inside++;
    try {
      this.computePower();
      for (const b of this.c.values()) {
        const def = defOf(b.t);
        if (!def.onPower || b.powered !== undefined) continue;
        b.powered = def.openable ? !!b.open : this._activated(b, !!def.qc);
      }
    } finally { this._inside--; }
  }

  // ---- events (observers only) ---------------------------------------------------------------

  on(event, fn) {
    (this._listeners[event] || (this._listeners[event] = [])).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const l = this._listeners[event];
    if (l) this._listeners[event] = l.filter(f => f !== fn);
  }
  _emit(event, data) {
    const l = this._listeners[event];
    if (!l || !l.length) return;
    const e = Object.assign({ event, t: this.t }, data);
    // Listeners watch; they may not drive. While they run, the world refuses every mutation.
    const inside = this._inside, emitting = this._emitting;
    this._inside = 0;
    this._emitting = true;
    try { for (const fn of l.slice()) fn(e); }
    finally { this._inside = inside; this._emitting = emitting; }
  }
  _sound(name, b, extra) {
    this._emit('sound', Object.assign({ name, x: b.x, y: b.y, z: b.z, block: b }, extra || {}));
  }

  // ---- signals ---------------------------------------------------------------------------------

  // The signal block n gives its neighbour in direction `toward` (Java Level.getSignal: the block's own output,
  // or, for a conductive block, the power it receives).
  signalFrom(n, toward) {
    if (!n) return 0;
    const def = defOf(n.t);
    let s = def.emits ? def.emits(this, n, toward) : 0;
    if (def.conductive) {
      const k = K(n.x, n.y, n.z);
      s = Math.max(s, this.strong.get(k) || 0, this.weak.get(k) || 0);
    }
    return s;
  }
  // Strongest signal reaching cell (x,y,z) from its neighbours (Java getBestNeighborSignal), optionally ignoring one side.
  signalAt(x, y, z, except) {
    let m = 0;
    for (const d of DL) {
      if (d === except) continue;
      const v = D[d];
      const s = this.signalFrom(this.get(x + v[0], y + v[1], z + v[2]), OPP[d]);
      if (s > m) { m = s; if (m >= 15) break; }
    }
    return m;
  }
  // Legacy name: the signal neighbour n sends into block tgt.
  into(tgt, n) {
    if (!n) return 0;
    const d = dirBetween(n, tgt);
    return d ? this.signalFrom(n, d) : 0;
  }
  poweredAt(b, except) { return this.signalAt(b.x, b.y, b.z, except); }
  lampPowered(b) { return this.signalAt(b.x, b.y, b.z) > 0; }
  // Java hasNeighborSignal, plus quasi-connectivity (the cell above) for blocks that have it.
  _activated(b, qc, except) {
    if (this.signalAt(b.x, b.y, b.z, except) > 0) return true;
    if (qc && this.rules.qc) return this.signalAt(b.x, b.y, b.z + 1, 'D') > 0;
    return false;
  }
  powerOf(b) {
    const k = K(b.x, b.y, b.z);
    return Math.max(this.strong.get(k) || 0, this.weak.get(k) || 0);
  }

  computePower() {
    const strong = new Map(), weak = new Map(), dusts = [];
    const bump = (m, k, v) => { if (v > (m.get(k) || 0)) m.set(k, v); };
    for (const b of this.c.values()) {
      if (b.t === 'dust') { dusts.push(b); continue; }
      const def = defOf(b.t);
      if (!def.strong) continue;
      for (const d of DL) {
        const lv = def.strong(this, b, d);
        if (!lv) continue;
        const n = this.nb(b, d);
        if (n && defOf(n.t).conductive) bump(strong, K(n.x, n.y, n.z), lv);
      }
    }
    this.strong = strong;
    this._computeDust(dusts);
    for (const b of dusts) {
      if (!b.lvl) continue;
      const below = this.get(b.x, b.y, b.z - 1);
      if (below && defOf(below.t).conductive) bump(weak, K(below.x, below.y, below.z), b.lvl);
      for (const d of b.pts) {
        const n = this.nb(b, d);
        if (n && defOf(n.t).conductive) bump(weak, K(n.x, n.y, n.z), b.lvl);
      }
    }
    this.weak = weak;
  }

  // Dust levels and shapes. Dust takes power from sources and strongly powered blocks on all six sides, and from
  // other dust beside it, one step up (unless a conductive block covers this dust) or one step down (unless the
  // side cell is conductive).
  _computeDust(dusts) {
    if (!dusts.length) return;
    const isDust = n => n && n.t === 'dust';
    const cond = n => !!n && defOf(n.t).conductive;
    const feeds = new Map();   // dust -> dust that read from it
    const link = (from, to) => { let l = feeds.get(from); if (!l) feeds.set(from, l = []); l.push(to); };
    const buckets = [], old = [];
    for (let i = 0; i <= 15; i++) buckets.push([]);
    for (const b of dusts) {
      let base = 0;
      for (const d of DL) {
        const n = this.nb(b, d);
        if (!n || n.t === 'dust') continue;
        const def = defOf(n.t);
        let s = def.emits ? def.emits(this, n, OPP[d]) : 0;
        if (def.conductive) s = Math.max(s, this.strong.get(K(n.x, n.y, n.z)) || 0);
        if (s > base) base = s;
      }
      const above = this.get(b.x, b.y, b.z + 1), covered = cond(above);
      const up = [], pts = [];
      for (const d of HL) {
        const v = D[d], side = this.get(b.x + v[0], b.y + v[1], b.z);
        if (isDust(side)) link(side, b);
        if (cond(side)) {
          if (!covered) { const u = this.get(side.x, side.y, side.z + 1); if (isDust(u)) link(u, b); }
        } else {
          const lo = this.get(b.x + v[0], b.y + v[1], b.z - 1);
          if (isDust(lo)) link(lo, b);
        }
        // Shape (Java getConnectingSide): up a step, then beside, then down a step.
        let con = false;
        if (!covered && side && (side.t === 'trapdoor' || this._supportsDust(side))) {
          const u = this.get(side.x, side.y, side.z + 1);
          if (isDust(u)) { con = true; up.push(d); }
        }
        if (!con && side && this._dustConnects(side, d)) con = true;
        if (!con && !cond(side)) {
          const lo = this.get(b.x + v[0], b.y + v[1], b.z - 1);
          if (isDust(lo)) con = true;
        }
        if (con) pts.push(d);
      }
      const newPts = !pts.length ? HL.slice() : pts.length === 1 ? [pts[0], OPP[pts[0]]] : pts;
      if (!this._dirty && (!b.pts || b.pts.join() !== newPts.join() || (b.up || []).join() !== up.join())) this._dirty = true;
      b.pts = newPts;
      b.up = up;
      old.push(b.lvl);
      b.lvl = base;
      buckets[base].push(b);
    }
    // Spread from strongest to weakest: each dust is final when its bucket is reached.
    for (let lv = 15; lv >= 2; lv--) {
      const q = buckets[lv];
      for (let i = 0; i < q.length; i++) {
        const b = q[i];
        if (b.lvl !== lv) continue;
        const out = feeds.get(b);
        if (!out) continue;
        for (const n of out) if (n.lvl < lv - 1) { n.lvl = lv - 1; buckets[lv - 1].push(n); }
      }
    }
    if (!this._dirty) for (let i = 0; i < dusts.length; i++) if (dusts[i].lvl !== old[i]) { this._dirty = true; break; }
  }
  _supportsDust(n) {
    if (!n) return false;
    if (n.t === 'hopper') return true;
    const def = defOf(n.t);
    return def.solid && def.push !== 'destroy' && !def.attach && n.t !== 'water' && n.t !== 'trapdoor' && n.t !== 'gate';
  }
  // Java RedStoneWireBlock.shouldConnectTo for a block beside the dust in direction d.
  _dustConnects(n, d) {
    switch (n.t) {
      case 'dust': return true;
      case 'repeater': return n.d === d || n.d === OPP[d];
      case 'observer': return n.d === d;
      default: return !!defOf(n.t).source;
    }
  }

  faces(b, n) { const d = D[b.d]; return b.x + d[0] === n.x && b.y + d[1] === n.y && b.z + d[2] === n.z; }
  backOf(b, n) { const d = D[b.d]; return b.x - d[0] === n.x && b.y - d[1] === n.y && b.z - d[2] === n.z; }

  // ---- components ------------------------------------------------------------------------------

  // Redstone lamp: on at once, off 2 ticks after it loses power.
  _lampTick(b, now) {
    if (this.lampPowered(b)) { if (!b.lit) { b.lit = true; this._dirty = true; } b.offAt = 0; return; }
    if (!b.lit) return;
    if (!b.offAt) b.offAt = now + 2;
    if (b.offAt === now + 1) {
      const at = b.offAt;
      this.at(at, () => { if (b.offAt === at) { b.lit = false; b.offAt = 0; } });
    } else if (b.offAt > now + 1) this.at(now + 1, NOOP);
  }

  // Redstone torch: flips 1 tick after its block changes; burns out on the 8th turn-off within 60 game ticks
  // (30 redstone ticks) and stays dark for 160 game ticks.
  _torchTick(b, now) {
    const ab = this.nb(b, b.att || 'D');
    let want = !(ab && this.signalFrom(ab, OPP[b.att || 'D']) > 0);
    if (want && b._burntUntil) {
      if (now < b._burntUntil) want = false;
      else b._burntUntil = 0;
    }
    if (want !== !!b.lit && b.pend !== want) {
      b.pend = want;
      this.at(now + 1, () => {
        const to = b.pend;
        b.pend = undefined;
        if (to === !!b.lit) return;
        b.lit = to;
        if (!to) this._torchOff(b, now + 1);
      });
    }
  }
  _torchOff(b, now) {
    const offs = (b._offs || []).filter(t => now - t <= 30);
    offs.push(now);
    b._offs = offs;
    if (offs.length >= 8) {
      b._burntUntil = now + 80;
      this.at(now + 80, NOOP);
      this._sound('fizz', b);
    }
  }

  // Repeater: 1 to 4 ticks. One pending update at a time (as Java's scheduled tick): a pulse shorter than the
  // delay is stretched to the delay. Locked while a powered repeater or comparator points into its side.
  _repeaterTick(b, now) {
    const back = this.nb(b, OPP[b.d]);
    let inp = back ? this.signalFrom(back, b.d) : 0;
    if (back && back.t === 'dust') inp = Math.max(inp, back.lvl || 0);
    inp = inp > 0;
    if (!this.rules.stretch) {
      // Legacy repeater: every input change is replayed after the delay, so short pulses pass through unchanged.
      if (inp !== b.inp) { b.inp = inp; this.at(now + (b.delay || 1), () => { b.on = inp; }); }
      return;
    }
    b.inp = inp;
    let locked = false;
    for (const s of SIDES[b.d] || []) {
      const n = this.nb(b, s);
      if (n && (n.t === 'repeater' || n.t === 'comparator') && defOf(n.t).strong(this, n, OPP[s]) > 0) { locked = true; break; }
    }
    if (!!b.locked !== locked) { b.locked = locked; this._dirty = true; }
    if (!b._due && !locked && inp !== !!b.on) b._due = now + (b.delay || 1);
    if (!b._due) return;
    if (b._due > now + 1) { this.at(now + 1, NOOP); return; }
    // The scheduled update is next tick: decide it from the inputs as they are now.
    const at = b._due;
    b._due = 0;
    if (locked) return;
    if (b.on && !inp) this.at(at, () => { b.on = false; });
    else if (!b.on) {
      this.at(at, () => { b.on = true; });
      if (!inp) {
        // The input is already gone: schedule the turn-off one delay after it turns on.
        const off = at + (b.delay || 1);
        b._due = off;
        this.at(at, NOOP);
      }
    }
  }

  // Comparator: 1 tick. The rear reads a signal, or a container's fill (also through one conductive block).
  // Sides take dust, redstone blocks and the outputs of repeaters, comparators and observers.
  _comparatorTick(b, now) {
    const o = this.comparatorOutput(b);
    if (o !== (b.out || 0) && b.tgt !== o) {
      b.tgt = o;
      this.at(now + 1, () => { b.out = o; b.tgt = undefined; });
    }
  }
  comparatorRear(b) {
    const bk = OPP[b.d], n = this.nb(b, bk);
    if (!n) return 0;
    const def = defOf(n.t);
    if (def.analog) return def.analog(this, n);
    let s = this.signalFrom(n, b.d);
    if (n.t === 'dust') s = Math.max(s, n.lvl || 0);
    if (s < 15 && def.conductive) {
      const m = this.nb(n, bk);
      if (m) {
        const md = defOf(m.t);
        if (m.t === 'frame' && m.att === b.d) return md.analog(this, m);
        if (md.analog && m.t !== 'frame') return md.analog(this, m);
      }
    }
    return s;
  }
  comparatorSide(b) {
    let side = 0;
    for (const s of SIDES[b.d] || []) {
      const m = this.nb(b, s);
      if (!m) continue;
      let v = 0;
      if (m.t === 'dust') v = m.lvl || 0;
      else if (m.t === 'rblock') v = 15;
      else { const md = defOf(m.t); if (md.source && md.strong) v = md.strong(this, m, OPP[s]); }
      if (v > side) side = v;
    }
    return side;
  }
  comparatorOutput(b) {
    const rear = this.comparatorRear(b), side = this.comparatorSide(b);
    return b.mode === 'sub' ? Math.max(0, rear - side) : (rear >= side ? rear : 0);
  }

  // Pressure plate. world.hand.step marks a player standing on it; wooden plates also detect items.
  // The plate rechecks every 10 ticks while pressed, so it releases up to 10 ticks after the last entity leaves.
  _plateTick(b, now) {
    const occupied = b._player || (b.wood && this.entities.some(en => !en.gone && Math.floor(en.x) === b.x && Math.floor(en.y) === b.y && Math.floor(en.z + 1e-6) === b.z));
    if (occupied) {
      b._rel = 0;
      if (!b.on) { b.on = true; b._since = now; b._by = true; this._dirty = true; this._sound('click', b); }
      return;
    }
    if (!b.on || !b._by || b._rel) return;   // a plate poked on by legacy code stays as it was put
    const since = b._since || now;
    const at = since + 10 * Math.max(1, Math.ceil((now + 1 - since) / 10));
    b._rel = at;
    this.at(at, () => {
      if (b._rel !== at) return;
      b._rel = 0;
      b.on = false;
      b._by = false;
      this._sound('click', b);
    });
  }

  // Iron doors (and wooden doors) open while either half receives power.
  _doorTick(b) {
    if (b.half === 'upper') return;
    const top = this.get(b.x, b.y, b.z + 1);
    const upper = top && top.t === 'door' && top.half === 'upper' ? top : null;
    const p = this._activated(b, false) || (upper ? this._activated(upper, false) : this.signalAt(b.x, b.y, b.z + 1, 'D') > 0);
    if (b.powered === undefined) b.powered = !!b.open;
    if (p === b.powered) return;
    b.powered = p;
    this._dirty = true;
    if (upper) upper.powered = p;
    if (!!b.open !== p) {
      b.open = p;
      if (upper) upper.open = p;
      this._sound(p ? 'door_open' : 'door_close', b);
    }
  }
  _openable(b, rising, kind) {
    if (!!b.open === rising) return;
    b.open = rising;
    this._sound(`${kind}_${rising ? 'open' : 'close'}`, b);
  }

  _ringBell(b) {
    b.ringing = true;
    const at = this.t + 25;
    b._ringEnd = at;
    this.at(at, () => { if (b._ringEnd === at) b.ringing = false; });
    this._sound('bell', b);
  }

  instrumentOf(b) {
    const below = this.get(b.x, b.y, b.z - 1);
    return (below && defOf(below.t).instrument) || 'harp';
  }
  _playNote(b) {
    const above = this.get(b.x, b.y, b.z + 1);
    if (above) return false;   // a note block is silent unless the block above it is air
    const note = clamp(b.note || 0, 0, 24);
    this._sound('note', b, { note, instrument: this.instrumentOf(b), pitch: Math.pow(2, (note - 12) / 12) });
    this.vibrate(b.x, b.y, b.z, 'note');
    return true;
  }

  // ---- containers ------------------------------------------------------------------------------

  isContainer(b) { return !!b && defOf(b.t).slots > 0; }
  _slots(b) {
    const n = defOf(b.t).slots;
    if (!b.items) b.items = this._itemsForLevel(n, b.fill || 0, 'stone');
    while (b.items.length < n) b.items.push(null);
    return b.items;
  }
  // The fewest stone that give comparator level `level` in a container with n slots.
  _itemsForLevel(n, level, id) {
    const items = [];
    for (let i = 0; i < n; i++) items.push(null);
    level = clamp(Math.round(level), 0, 15);
    if (!level) return items;
    const max = maxStack(id);
    let total = Math.max(1, Math.ceil((level - 1) / 14 * n * max));
    for (let i = 0; i < n && total > 0; i++) { const k = Math.min(max, total); items[i] = { id, n: k }; total -= k; }
    return items;
  }
  _syncFill(b) {
    const n = defOf(b.t).slots;
    if (!n || !b.items) return;
    let f = 0, any = false;
    for (const s of b.items) if (s && s.n > 0) { f += s.n / maxStack(s.id); any = true; }
    b.fill = Math.floor(f / n * 14) + (any ? 1 : 0);
    this._dirty = true;
  }
  // Insert up to n of item id; returns how many went in.
  _insert(c, id, n) {
    const slots = this._slots(c);
    const max = maxStack(id);
    let left = n;
    for (const s of slots) if (left > 0 && s && s.id === id && s.n < max) { const k = Math.min(max - s.n, left); s.n += k; left -= k; }
    for (let i = 0; i < slots.length && left > 0; i++) if (!slots[i]) { const k = Math.min(max, left); slots[i] = { id, n: k }; left -= k; }
    this._syncFill(c);
    return n - left;
  }
  // Take up to n items (of id, or of the first non-empty slot); returns { id, n } or null.
  _take(c, id, n) {
    const slots = this._slots(c);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s || (id && s.id !== id)) continue;
      const k = Math.min(n, s.n);
      s.n -= k;
      if (!s.n) slots[i] = null;
      this._syncFill(c);
      return { id: s.id, n: k };
    }
    return null;
  }

  // Dispenser and dropper: dispense from the first non-empty slot (Java picks a random one).
  _dispense(b) {
    const slots = this._slots(b);
    const i = slots.findIndex(s => s && s.n > 0);
    if (i < 0) { this._sound('dispense_fail', b); return; }
    const stack = slots[i], v = D[b.d || 'N'];
    const fx = b.x + v[0], fy = b.y + v[1], fz = b.z + v[2];
    const front = this.get(fx, fy, fz);
    const takeOne = () => { stack.n--; if (!stack.n) slots[i] = null; this._syncFill(b); };
    if (b.t === 'dropper') {
      if (front && this.isContainer(front)) {
        if (this._insert(front, stack.id, 1)) { takeOne(); this._sound('dispense', b); }
        return;
      }
      takeOne();
      this._dropItem(b, stack.id, 1);
      return;
    }
    if (stack.id === 'water_bucket') {
      if (!front) {
        this.put(fx, fy, fz, 'water');
        this._checkWater(this.get(fx, fy, fz));
        slots[i] = { id: 'bucket', n: 1 };
        this._syncFill(b);
        this._sound('bucket_empty', b);
        return;
      }
      takeOne();
      this._dropItem(b, 'water_bucket', 1);
      return;
    }
    if (stack.id === 'bucket') {
      if (front && front.t === 'water') {
        this.set(fx, fy, fz, null);
        this._waterRemoved(fx, fy, fz);
        takeOne();
        if (!slots[i]) slots[i] = { id: 'water_bucket', n: 1 };
        else if (!this._insert(b, 'water_bucket', 1)) this._dropItem(b, 'water_bucket', 1);
        this._syncFill(b);
        this._sound('bucket_fill', b);
        return;
      }
      takeOne();
      this._dropItem(b, 'bucket', 1);
      return;
    }
    if (stack.id === 'snowball' || stack.id === 'egg' || stack.id === 'arrow') {
      takeOne();
      // Java shoots along the facing with 0.1 added upward, at 1.1 blocks per game tick (no spread here).
      const dz = v[2] + 0.1, len = Math.hypot(v[0], v[1], dz) || 1, sp = 1.1;
      this.spawn(stack.id, fx + 0.5 - v[0] * 0.3, fy + 0.5 - v[1] * 0.3, fz + 0.5 - v[2] * 0.3, {
        projectile: true, vx: v[0] / len * sp, vy: v[1] / len * sp, vz: dz / len * sp, gravity: stack.id === 'arrow' ? 0.05 : 0.03,
      });
      this._sound('dispense', b);
      return;
    }
    // Everything else, ender pearls included, is dropped as an item.
    takeOne();
    this._dropItem(b, stack.id, 1);
  }
  _dropItem(b, id, n) {
    const v = D[b.d || 'N'];
    this.spawn('item', b.x + 0.5 + v[0] * 0.7, b.y + 0.5 + v[1] * 0.7, b.z + 0.5 + v[2] * 0.7 - 0.15, {
      item: id, n, vx: v[0] * 0.25, vy: v[1] * 0.25, vz: 0.2 + v[2] * 0.25,
    });
    this._sound('dispense', b);
  }

  // Hopper: moves one item every 4 ticks (8 game ticks) into the container it faces, and pulls one item from the
  // container above or picks up items lying in it. Locked while powered (no quasi-connectivity).
  _hopperTick(b, now) {
    const p = this._activated(b, false);
    if (b.powered !== p) { b.powered = p; this._dirty = true; }
    if (p || now < (b._cool || 0)) return;
    let moved = false;
    const slots = this._slots(b);
    const out = this.nb(b, b.d || 'D');
    if (out && this.isContainer(out)) {
      const i = slots.findIndex(s => s && s.n > 0);
      if (i >= 0 && this._insert(out, slots[i].id, 1)) {
        slots[i].n--; if (!slots[i].n) slots[i] = null; this._syncFill(b); moved = true;
      }
    }
    const above = this.get(b.x, b.y, b.z + 1);
    if (above && this.isContainer(above)) {
      const s = this._slots(above).find(s => s && s.n > 0);
      if (s && this._insert(b, s.id, 1)) { this._take(above, s.id, 1); moved = true; }
    } else if (!above || !defOf(above.t).solid) {
      for (const en of this.entities) {
        if (en.gone || en.kind !== 'item' || !en.item) continue;
        if (Math.floor(en.x) !== b.x || Math.floor(en.y) !== b.y) continue;
        if (en.z < b.z + 0.6 || en.z >= b.z + 2) continue;
        const k = this._insert(b, en.item, en.n || 1);
        if (k) { en.n = (en.n || 1) - k; if (!en.n) en.gone = true; moved = true; }
      }
    }
    if (moved) { b._cool = now + 4; this.at(now + 4, NOOP); }
  }

  // ---- water -------------------------------------------------------------------------------------

  // A source is contained when water could not flow out of it: below and on all four sides there is either
  // another source or a block flowing water cannot enter.
  waterContained(b) {
    for (const d of ['N', 'E', 'S', 'W', 'D']) {
      const n = this.nb(b, d);
      if (!n) return false;
      if (n.t === 'water') continue;
      const def = defOf(n.t);
      if (!def.holdsWater) return false;
      if (n.t === 'gate' && n.open) return false;
    }
    return true;
  }
  _checkWater(b) {
    if (this.strict && b && b.t === 'water' && !this.waterContained(b)) {
      throw new Error(`water at (${b.x},${b.y},${b.z}) is not contained and would flow (the engine does not model flowing water)`);
    }
  }
  _waterRemoved(x, y, z) {
    if (!this.strict) return;
    for (const d of HL.concat('U')) {
      const v = D[d], n = this.get(x + v[0], y + v[1], z + v[2]);
      if (n && n.t === 'water') this._checkWater(n);
    }
  }
  waterAt(x, y, z) { const b = this.get(Math.floor(x), Math.floor(y), Math.floor(z)); return !!b && b.t === 'water'; }
  // Water standing on soul sand is an upward bubble column (it holds a pearl in stasis); on magma, downward.
  bubbleColumn(x, y, z) { return this.columnAt(x, y, z) === 'up'; }
  columnAt(x, y, z) {
    let k = Math.floor(z);
    if (!this.waterAt(x, y, k)) return null;
    while (this.waterAt(x, y, k - 1)) k--;
    const b = this.get(Math.floor(x), Math.floor(y), k - 1);
    if (!b) return null;
    return b.t === 'soulsand' ? 'up' : b.t === 'magma' ? 'down' : null;
  }

  // ---- attachments -------------------------------------------------------------------------------

  // Whether an attached block (torch, lever, button, sign, bell, frame, dust, repeater, plate, door) has its support.
  supported(b) {
    const def = defOf(b.t);
    if (!def.attach) return true;
    if (def.attach === 'att' || (def.attach === 'below' && b.t !== 'door')) {
      const dir = def.attach === 'below' ? 'D' : (b.att || 'D');
      const s = this.nb(b, dir);
      if (!s) return false;
      if (b.t === 'dust' || b.t === 'repeater' || b.t === 'comparator') return this._supportsDust(s);
      const sd = defOf(s.t);
      return sd.solid && sd.push !== 'destroy' && s.t !== 'water' || (b.t === 'sign' && s.t === 'sign');
    }
    if (b.t === 'door') {
      if (b.half === 'upper') { const s = this.get(b.x, b.y, b.z - 1); return !!s && s.t === 'door' && s.half !== 'upper'; }
      const s = this.get(b.x, b.y, b.z - 1);
      return !!s && this._supportsDust(s);
    }
    return true;
  }
  _pop(b, why) {
    if (this.get(b.x, b.y, b.z) !== b) return;
    this.set(b.x, b.y, b.z, null);
    b.popped = true;
    if (b.t === 'water') this._waterRemoved(b.x, b.y, b.z);
    this._emit('pop', { name: b.t, x: b.x, y: b.y, z: b.z, block: b, why });
    if (b.t === 'door') {
      const other = this.get(b.x, b.y, b.z + (b.half === 'upper' ? -1 : 1));
      if (other && other.t === 'door') this._pop(other, 'door');
    }
  }

  // ---- pistons -------------------------------------------------------------------------------------

  // Can block b be part of a moving structure (moved in direction md)?  `pull` is true for blocks dragged by
  // slime or honey, or pulled by a sticky piston: those must be 'normal'.
  _movable(b, pull) {
    if (b.mv && b.mv.t === this.t) return false;      // already moving this tick
    if (b.t === 'piston') return !b.ext;
    if (b.t === 'trapdoor' && !this.rules.trapdoorPush) return false;
    const def = defOf(b.t);
    if (def.push === 'normal') return true;
    if (def.push === 'push_only') return !pull;
    return false;
  }
  // The blocks a piston moves (Java PistonStructureResolver). Returns null if the move fails, else
  // { move: [blocks], destroy: [blocks] }. Slime and honey drag adjacent normal blocks (not each other, not
  // push_only, not immovable); every moving block's path must be clear, or hold a block that moves too or pops.
  resolve(start, md, pk, extending) {
    const mv = D[md], inSet = new Set(), move = [], destroy = new Map(), stack = [];
    if (start) {
      const sd = defOf(start.t);
      if (extending && sd.push === 'destroy') { destroy.set(K(start.x, start.y, start.z), start); return { move, destroy: [...destroy.values()] }; }
      if (!this._movable(start, !extending)) return extending ? null : { move, destroy: [] };
      stack.push(start);
    }
    while (stack.length) {
      const b = stack.pop(), k = K(b.x, b.y, b.z);
      if (inSet.has(k)) continue;
      inSet.add(k);
      move.push(b);
      if (move.length > 12) return null;
      const fk = K(b.x + mv[0], b.y + mv[1], b.z + mv[2]);
      if (fk === pk) return null;
      const f = this.c.get(fk);
      if (f && !inSet.has(fk)) {
        if (this._movable(f, false)) stack.push(f);
        else if (defOf(f.t).push === 'destroy' && !(f.mv && f.mv.t === this.t)) destroy.set(fk, f);
        else return null;
      }
      const sticky = defOf(b.t).sticky;
      if (!sticky) continue;
      for (const d of DL) {
        if (d === md) continue;
        const n = this.nb(b, d);
        if (!n) continue;
        const nk = K(n.x, n.y, n.z);
        if (nk === pk || inSet.has(nk)) continue;
        const ns = defOf(n.t).sticky;
        if (ns && ns !== sticky) continue;            // slime and honey do not stick to each other
        if (!this._movable(n, true)) continue;        // slide past immovable, push_only and destroy blocks
        stack.push(n);
      }
    }
    for (const k of inSet) destroy.delete(k);
    return { move, destroy: [...destroy.values()] };
  }
  // Legacy API: the list of blocks a push would move, or null.
  structure(start, md, pk, hk) {
    const r = this.resolve(start, md, pk, true);
    if (!r || r.destroy.length) return r && !r.destroy.length ? r.move : null;
    return r.move;
  }

  shift(list, md) {
    this._guard('shift');
    const mv = D[md];
    for (const b of list) this.c.delete(K(b.x, b.y, b.z));
    const landed = new Map();
    for (const b of list) {
      this.set(b.x + mv[0], b.y + mv[1], b.z + mv[2], b);
      b.mv = { d: md, t: this.t };
      if (b.t === 'observer') b.firePending = true;
      landed.set(K(b.x, b.y, b.z), b);
    }
    // Blocks moving into an entity carry it along; slime also launches it in the push direction.
    for (const en of this.entities) {
      if (en.gone) continue;
      const b = landed.get(K(Math.floor(en.x), Math.floor(en.y), Math.floor(en.z + 0.01)));
      if (!b) continue;
      // For drawing: the fraction of the block's 1-block stroke before its leading face reaches the entity.
      const a = mv[0] ? 0 : mv[1] ? 1 : 2, s = mv[a], face = [b.x, b.y, b.z][a] + (s > 0 ? 0 : 1), pos = [en.x, en.y, en.z][a];
      const near = a === 2 ? (s > 0 ? pos : pos + 0.25) : pos - s * 0.125;
      en.hit = { t: this.t, at: Math.max(0, Math.min(1, s * (near - face))) };
      en.x += mv[0]; en.y += mv[1]; en.z += mv[2]; en.ground = false;
      if (b.t === 'slime') {
        if (mv[0]) en.vx = mv[0];
        if (mv[1]) en.vy = mv[1];
        if (mv[2]) en.vz = mv[2];
        en.launched = { t: this.t, d: md };
      }
    }
  }
  // Move a resolved structure: pop what is in the way, shift, then pop what was attached to a moved block.
  _moveStructure(r, md, piston) {
    for (const b of r.destroy) this._pop(b, 'pushed');
    const touched = new Set();
    const mvv = D[md];
    for (const b of r.move) { touched.add(K(b.x, b.y, b.z)); touched.add(K(b.x + mvv[0], b.y + mvv[1], b.z + mvv[2])); }
    if (r.move.length) this.shift(r.move, md);
    this._popDetached(touched, r.move);
    if (this.strict) for (const k of touched) {
      const z = (k % 1024) - 512, y = (Math.floor(k / 1024) % 1024) - 512, x = Math.floor(k / 1048576) - 512;
      if (!this.get(x, y, z)) this._waterRemoved(x, y, z);
    }
    if (r.move.length || r.destroy.length) {
      this._emit('move', { name: piston && piston.ext ? 'extend' : 'retract', x: piston ? piston.x : 0, y: piston ? piston.y : 0, z: piston ? piston.z : 0, piston, dir: md, blocks: r.move.slice(), popped: r.destroy.slice() });
    }
  }
  // An attached block whose support cell was moved (vacated or refilled by a moving block) pops off.
  _popDetached(cells, moved) {
    if (!cells.size) return;
    const movedSet = new Set(moved);
    const check = new Set();
    for (const k of cells) {
      const z = (k % 1024) - 512, y = (Math.floor(k / 1024) % 1024) - 512, x = Math.floor(k / 1048576) - 512;
      for (const d of DL) {
        const v = D[d], n = this.get(x + v[0], y + v[1], z + v[2]);
        if (n && defOf(n.t).attach && !movedSet.has(n)) check.add(n);
      }
    }
    for (const b of check) {
      const def = defOf(b.t);
      const dir = def.attach === 'att' ? (b.att || 'D') : 'D';
      const v = D[dir], sk = K(b.x + v[0], b.y + v[1], b.z + v[2]);
      if (cells.has(sk) || !this.supported(b)) this._pop(b, 'detached');
    }
  }
  extend(p) {
    const d = D[p.d], f = [p.x + d[0], p.y + d[1], p.z + d[2]], fb = this.get(...f);
    const r = fb ? this.resolve(fb, p.d, K(p.x, p.y, p.z), true) : { move: [], destroy: [] };
    if (r === null) return false;
    this._inside++;
    try {
      p.ext = true;
      this._moveStructure(r, p.d, p);
      this.set(...f, { t: 'head', d: p.d, s: p.s, p });
      p.mvAt = this.t;
      p.pushedAt = r.move.length ? this.t : -9;
      this.vibrate(p.x, p.y, p.z, 'piston');
      this._sound('piston_extend', p);
    } finally { this._inside--; }
    return true;
  }
  retract(p) {
    this._inside++;
    try {
      const d = D[p.d], h = [p.x + d[0], p.y + d[1], p.z + d[2]], hb = this.get(...h);
      if (hb && hb.t === 'head') this.set(...h, null);
      p.ext = false;
      p.mvAt = this.t;
      this.vibrate(p.x, p.y, p.z, 'piston');
      this._sound('piston_retract', p);
      // A sticky piston pulls the block in front of its head, unless it pushed last tick (a 1-tick pulse drops the block).
      if (p.s && p.pushedAt !== this.t - 1) {
        const tb = this.get(h[0] + d[0], h[1] + d[1], h[2] + d[2]);
        if (tb && (defOf(tb.t).push === 'normal' || tb.t === 'piston') && this._movable(tb, true)) {
          const r = this.resolve(tb, OPP[p.d], K(p.x, p.y, p.z), false);
          if (r) this._moveStructure(r, OPP[p.d], p);
        }
      }
      this._popDetached(new Set([K(...h)]), []);
    } finally { this._inside--; }
  }
  _pistonPowered(p) {
    return this._activated(p, true, p.d);
  }

  // ---- entities ---------------------------------------------------------------------------------

  solidAt(x, y, z) {
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z), b = this.get(fx, fy, fz);
    if (!b) return false;
    const def = defOf(b.t);
    if (b.t === 'trapdoor') {
      if (b.open) return false;
      return b.half === 'bottom' ? (z - fz) < 0.1875 : (z - fz) >= 0.8125;
    }
    if (b.t === 'gate' || b.t === 'door') return !b.open;
    if (b.t === 'repeater' || b.t === 'comparator') return false;
    return def.solid;
  }
  stepEntities() {
    for (const en of this.entities) {
      if (en.gone) continue;
      const column = this.columnAt(en.x, en.y, en.z + 0.125);
      en.stasis = !!en.projectile && column === 'up';
      if (en.stasis) { en.vx = en.vy = en.vz = 0; en.ground = false; continue; }
      if (!en.projectile && !en.ground) en.vz -= 0.04;
      if (column === 'up') en.vz = Math.min(0.7, en.vz + 0.06);
      else if (column === 'down') en.vz = Math.max(-0.9, en.vz - 0.03);
      if (en.projectile && this.rules.projectileHit && this._projectileStep(en)) continue;
      let nz = en.z + en.vz;
      if (en.vz < 0 && this.solidAt(en.x, en.y, nz - 1e-3)) { nz = Math.floor(nz - 1e-3) + 1; en.vz = 0; }
      else if (en.vz > 0 && this.solidAt(en.x, en.y, nz + 0.25)) { nz = en.z; en.vz = 0; }
      en.z = nz;
      const nx = en.x + en.vx; if (this.solidAt(nx, en.y, en.z + 0.1)) en.vx = 0; else en.x = nx;
      const ny = en.y + en.vy; if (this.solidAt(en.x, ny, en.z + 0.1)) en.vy = 0; else en.y = ny;
      en.ground = en.vz <= 0 && this.solidAt(en.x, en.y, en.z - 1e-3);
      const drag = en.projectile ? (this.waterAt(en.x, en.y, en.z + 0.125) ? 0.8 : 0.99) : 0.98;
      const f = !en.projectile && en.ground ? drag * 0.6 : drag;
      en.vx *= f; en.vy *= f; en.vz *= drag;
      if (en.projectile && !en.ground) en.vz -= en.gravity || 0.03;
      if (en.ground && !en.projectile) {
        if (Math.abs(en.vx) < 1e-3) en.vx = 0;
        if (Math.abs(en.vy) < 1e-3) en.vy = 0;
      }
      if (en.z < -40 || Math.abs(en.y) > 200 || Math.abs(en.x) > 200) en.gone = true;
    }
  }
  // A projectile moves in a straight line for one game tick; if it enters a solid block it hits it.
  _projectileStep(en) {
    const hit = this._raycast(en.x, en.y, en.z, en.vx, en.vy, en.vz);
    if (!hit) {
      en.x += en.vx; en.y += en.vy; en.z += en.vz;
      const drag = this.waterAt(en.x, en.y, en.z + 0.125) ? 0.8 : 0.99;
      en.vx *= drag; en.vy *= drag; en.vz *= drag;
      en.vz -= en.gravity || 0.03;
      if (en.z < -40 || Math.abs(en.y) > 200 || Math.abs(en.x) > 200) en.gone = true;
      return true;
    }
    en.x = hit.px; en.y = hit.py; en.z = hit.pz;
    en.vx = en.vy = en.vz = 0;
    en.gone = true;
    let power = 0;
    if (hit.block.t === 'target') power = this._targetHit(hit.block, hit, en);
    this._emit('hit', { name: en.kind, x: hit.block.x, y: hit.block.y, z: hit.block.z, block: hit.block, entity: en, face: hit.face, power, point: [hit.px, hit.py, hit.pz] });
    return true;
  }
  // First solid cell crossed by the segment p -> p+v (voxel walk), with the hit point and the face entered.
  _raycast(x, y, z, vx, vy, vz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(vx, vy, vz) * 8));
    let cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    for (let i = 1; i <= steps; i++) {
      const f = i / steps, px = x + vx * f, py = y + vy * f, pz = z + vz * f;
      const nx = Math.floor(px), ny = Math.floor(py), nz = Math.floor(pz);
      if (nx === cx && ny === cy && nz === cz) continue;
      const b = this.get(nx, ny, nz);
      if (b && this.solidAt(px, py, pz)) {
        const face = nx !== cx ? (nx > cx ? 'W' : 'E') : ny !== cy ? (ny > cy ? 'N' : 'S') : (nz > cz ? 'D' : 'U');
        // Put the point on the face that was entered.
        const p = [px, py, pz];
        if (face === 'W') p[0] = nx; else if (face === 'E') p[0] = nx + 1;
        else if (face === 'N') p[1] = ny; else if (face === 'S') p[1] = ny + 1;
        else if (face === 'D') p[2] = nz; else p[2] = nz + 1;
        return { block: b, face, px: p[0], py: p[1], pz: p[2] };
      }
      cx = nx; cy = ny; cz = nz;
    }
    return null;
  }
  // Target block: strength by accuracy, 1 to 15; 4 ticks for thrown projectiles, 10 for arrows.
  _targetHit(b, hit, en) {
    const fr = v => v - Math.floor(v);
    const dx = Math.abs(fr(hit.px) - 0.5), dy = Math.abs(fr(hit.py) - 0.5), dz = Math.abs(fr(hit.pz) - 0.5);
    const axis = hit.face === 'E' || hit.face === 'W' ? 'x' : hit.face === 'N' || hit.face === 'S' ? 'y' : 'z';
    const d = axis === 'x' ? Math.max(dy, dz) : axis === 'y' ? Math.max(dx, dz) : Math.max(dx, dy);
    const power = Math.max(1, Math.ceil(15 * clamp((0.5 - d) / 0.5, 0, 1)));
    b.out = power;
    this._dirty = true;
    const at = this.t + 1 + (en.kind === 'arrow' ? 10 : 4);
    b._offAt = at;
    this.at(at, () => { if (b._offAt === at) b.out = 0; });
    return power;
  }

  // ---- sculk -------------------------------------------------------------------------------------

  // Sculk sensor (1.20 timings in redstone ticks): range 8, travel 1 block per game tick, active 15, cooldown 5. Wool occludes.
  vibrate(x, y, z, src) {
    this._guard('vibrate');
    for (const s of this.sensors) {
      if (s.state !== 'idle' || this.get(s.x, s.y, s.z) !== s) continue;
      const d = Math.hypot(s.x - x, s.y - y, s.z - z);
      if (d > 8) continue;
      if (this.hasWool && this.occluded([x + 0.5, y + 0.5, z + 0.5], [s.x + 0.5, s.y + 0.5, s.z + 0.5])) continue;
      const delay = Math.max(1, Math.ceil(d / 2)), lv = Math.max(1, 15 - Math.floor(d * 14 / 8)), t0 = this.t;
      s.state = 'pending';
      this.vibs.push({ from: [x, y, z], to: [s.x, s.y, s.z], t0, t1: t0 + delay });
      this._inside++;
      try {
        this.at(t0 + delay, () => { s.on = true; s.out = lv; s.state = 'active'; });
        this.at(t0 + delay + 15, () => { s.on = false; s.out = 0; s.state = 'cool'; });
        this.at(t0 + delay + 20, () => { s.state = 'idle'; });
      } finally { this._inside--; }
      this._quiet = false;
    }
  }
  occluded(a, b) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 4);
    const sk = new Set([K(...a.map(Math.floor)), K(...b.map(Math.floor))]);
    for (let i = 1; i < n; i++) {
      const p = a.map((v, j) => Math.floor(v + (b[j] - v) * i / n)), k = K(...p);
      if (sk.has(k)) continue;
      const c = this.c.get(k);
      if (c && c.t === 'wool') return true;
    }
    return false;
  }

  // ---- the tick ------------------------------------------------------------------------------------

  sig(x, y, z) {
    const b = this.get(x, y, z);
    if (!b) return '0';
    return [b.t, b.d || '', b.ext ? 1 : 0, b.lit ? 1 : 0, b.on ? 1 : 0, b.lvl || 0, b.out || 0, b.open ? 1 : 0, b.powered ? 1 : 0, b.note || 0, b.locked ? 1 : 0, b.delay || 0, b.mode || '', b.level || 0].join('|');
  }

  tick() {
    // A sealed world that is quiet has nothing to do: nothing changed, nothing is scheduled, nothing moves.
    if (this.sealed && this._quiet) { this.t++; return; }
    const now = this.t;
    if (!this._adopted) this._adopt();
    this._inside++;
    try {
      const due = [], later = [];
      for (const e of this.ev) (e.t <= now ? due : later).push(e);
      this.ev = later;
      this._dirty = false;
      for (const e of due) { if (e.fn !== NOOP) this._dirty = true; e.fn(); }
      for (const en of this.entities) { en.px = en.x; en.py = en.y; en.pz = en.z; }
      this.computePower();
      const pistons = [], observers = [];
      for (const b of [...this.c.values()]) {
        if (b.t === 'piston') { pistons.push(b); continue; }
        if (b.t === 'observer') { observers.push(b); continue; }
        const def = defOf(b.t);
        if (def.tick) def.tick(this, b, now);
        if (def.onPower) {
          const p = this._activated(b, !!def.qc);
          // A block built without `powered` takes its current power as given (no edge), except that an open
          // trapdoor or gate is taken to be held open by power.
          if (b.powered === undefined) b.powered = def.openable ? !!b.open : p;
          if (p !== b.powered) { b.powered = p; this._dirty = true; def.onPower(this, b, p); }
        }
      }
      const want = pistons.map(p => ({ p, pw: this._pistonPowered(p), k: K(p.x, p.y, p.z) }));
      for (const pass of [0, 1]) for (const w of want) {
        const p = w.p;
        if (K(p.x, p.y, p.z) !== w.k || p.mvAt === now || this.get(p.x, p.y, p.z) !== p) continue;
        if (pass === 0 && w.pw && !p.ext) this.extend(p);
        else if (pass === 1 && !w.pw && p.ext) this.retract(p);
      }
      for (const b of observers) {
        if (this.get(b.x, b.y, b.z) !== b) continue;
        const d = D[b.d], s = this.sig(b.x + d[0], b.y + d[1], b.z + d[2]);
        if (b.seen === null || b.seen === undefined) { b.seen = s; this._dirty = true; continue; }
        if (b.firePending || s !== b.seen) {
          b.firePending = false;
          b.seen = s;
          this._dirty = true;
          if (!b.busy) {
            b.busy = true;
            this.at(now + 1, () => { b.on = true; });
            this.at(now + 2, () => { b.on = false; b.busy = false; });
          }
        }
      }
      this.stepEntities();
      this.stepEntities();
      this.t++;
      if (this.vibs.length) this.vibs = this.vibs.filter(v => v.t1 >= this.t - 2);
    } finally { this._inside--; }
    this._updateQuiet();
  }
  run(n) { for (let i = 0; i < n; i++) this.tick(); }

  // Quiet: nothing changed in the last tick, nothing is scheduled, no entity is moving.
  get quiet() { return this._quiet; }
  wake() { this._quiet = false; }
  _updateQuiet() {
    let still = !this._dirty && this.ev.length === 0 && this.vibs.length === 0;
    if (still) for (const en of this.entities) {
      if (en.gone || en.stasis) continue;
      if (en.x !== en.px || en.y !== en.py || en.z !== en.pz || en.vx || en.vy || (en.vz && !en.ground)) { still = false; break; }
    }
    this._quiet = still;
  }

  // Run until quiet. Returns the ticks run. Throws if it never settles, unless opts.lenient (then returns -1) or
  // opts.until() becomes true first.
  settle(max = 400, opts = {}) {
    for (let i = 1; i <= max; i++) {
      this.tick();
      if (this._quiet || (opts.until && opts.until(this))) return i;
    }
    if (opts.lenient) return -1;
    throw new Error(`World.settle: not quiet after ${max} ticks (a clock, or something still moving)`);
  }

  // ---- state signatures ------------------------------------------------------------------------------

  stateOf(b) {
    // Unset, false, 0 and '' all mean the default, so a block that returns to its start state hashes the same.
    const keys = Object.keys(b).filter(k => !TRANSIENT.has(k) && k[0] !== '_' && typeof b[k] !== 'function' && b[k] !== undefined && b[k] !== null && b[k] !== false && b[k] !== 0 && b[k] !== '').sort();
    return `${b.t}@${b.x},${b.y},${b.z}{` + keys.map(k => {
      const v = b[k];
      return k + '=' + (v && typeof v === 'object' ? JSON.stringify(v) : String(v));
    }).join(';') + '}';
  }
  _entityState(en) {
    const r = v => Math.round(v * 1e6) / 1e6;
    return `${en.kind}@${r(en.x)},${r(en.y)},${r(en.z)}v${r(en.vx)},${r(en.vy)},${r(en.vz)}${en.item ? ':' + en.item + 'x' + (en.n || 1) : ''}`;
  }
  // Deterministic signature of every block and entity (not the clock and not pending events).
  hash() {
    const parts = [...this.c.values()].map(b => this.stateOf(b)).sort();
    parts.push(...this.entities.filter(en => !en.gone).map(en => this._entityState(en)).sort());   // entity order does not matter
    let a = 0x811c9dc5 | 0, c = 0x01000193 | 0;
    for (const p of parts) { a = strHash(p, a); c = strHash(p, mix(c, a)); a = strHash('|', a); }
    const hex = v => (v >>> 0).toString(16).padStart(8, '0');
    return hex(a) + hex(c);
  }

  // Run n ticks with no input; throw, naming the first block that changed, if the built state drifts.
  assertSteady(n = 100) {
    this._inside++;
    try { this.computePower(); } finally { this._inside--; }
    const before = new Map();
    for (const b of this.c.values()) before.set(b, this.stateOf(b));
    const ents = this.entities.filter(en => !en.gone).map(en => [en, this._entityState(en)]);
    for (let i = 1; i <= n; i++) {
      this.tick();
      for (const [b, s] of before) {
        const now = this.get(b.x, b.y, b.z) === b ? this.stateOf(b) : null;
        if (now === s) continue;
        throw new Error(`World.assertSteady: ${b.t} built at ${s.slice(s.indexOf('@') + 1, s.indexOf('{'))} ${now === null ? 'moved or popped' : 'changed'} at tick ${i}: ${s} -> ${now}`);
      }
      for (const b of this.c.values()) if (!before.has(b)) throw new Error(`World.assertSteady: a ${b.t} appeared at (${b.x},${b.y},${b.z}) at tick ${i}`);
      for (const [en, s] of ents) {
        const now = en.gone ? null : this._entityState(en);
        if (now !== s) throw new Error(`World.assertSteady: entity ${s} ${now === null ? 'is gone' : 'moved to ' + now} at tick ${i}`);
      }
    }
    return true;
  }

  // ---- export -----------------------------------------------------------------------------------------

  // Minecraft Java 1.21 commands that rebuild this world. Engine x east, y south, z up maps to Minecraft x, z, y.
  // origin: [X, Y, Z] in Minecraft coordinates, or omitted for relative (~) coordinates.
  toCommands(opts = {}) {
    const origin = opts.origin;
    const pos = (x, y, z) => {
      if (origin) return `${origin[0] + x} ${origin[1] + z} ${origin[2] + y}`;
      return `~${x} ~${z} ~${y}`;
    };
    const fmt = v => Math.round(v * 1000) / 1000;
    const epos = (x, y, z) => {
      if (origin) return `${fmt(origin[0] + x)} ${fmt(origin[1] + z)} ${fmt(origin[2] + y)}`;
      return `~${fmt(x)} ~${fmt(z)} ~${fmt(y)}`;
    };
    // Dust shapes and levels are derived: compute them so the exported wire states are right.
    this._inside++;
    try { this.computePower(); } finally { this._inside--; }
    const list = [...this.c.values()];
    const out = [];
    if (!list.length) return out;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const b of list) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); z0 = Math.min(z0, b.z); x1 = Math.max(x1, b.x); y1 = Math.max(y1, b.y); z1 = Math.max(z1, b.z); }
    if (opts.clear !== false) out.push(`fill ${pos(x0, y0, z0)} ${pos(x1, y1, z1)} minecraft:air`);
    // Supports first, attached blocks after, each layer bottom-up.
    const rank = b => (defOf(b.t).attach ? 2 : b.t === 'water' ? 1 : 0);
    list.sort((a, b) => rank(a) - rank(b) || a.z - b.z || a.y - b.y || a.x - b.x);
    for (const b of list) {
      if (b.t === 'frame') continue;
      out.push(`setblock ${pos(b.x, b.y, b.z)} ${this._mcState(b)}${this._mcNbt(b)} replace`);
    }
    const FACE = { D: 0, U: 1, N: 2, S: 3, W: 4, E: 5 };
    for (const b of list) {
      if (b.t !== 'frame') continue;
      const item = b.item ? `,Item:{id:"minecraft:${b.item}",count:1},ItemRotation:${b.rot || 0}b` : '';
      out.push(`summon minecraft:item_frame ${pos(b.x, b.y, b.z)} {Facing:${FACE[OPP[b.att || 'D']]}b,Fixed:1b${item}}`);
    }
    for (const en of this.entities) {
      if (en.gone) continue;
      const motion = `Motion:[${fmt(en.vx)}d,${fmt(en.vz)}d,${fmt(en.vy)}d]`;
      if (en.kind === 'item') out.push(`summon minecraft:item ${epos(en.x, en.y, en.z)} {Item:{id:"minecraft:${en.item || 'stone'}",count:${en.n || 1}},${motion}}`);
      else if (en.kind === 'pearl' || en.kind === 'ender_pearl') out.push(`summon minecraft:ender_pearl ${epos(en.x, en.y, en.z)} {${motion}}`);
      else out.push(`summon minecraft:${en.kind} ${epos(en.x, en.y, en.z)} {${motion}}`);
    }
    return out;
  }
  _mcState(b) {
    const def = defOf(b.t);
    if (typeof def.mc === 'function') return def.mc(b, this);
    if (def.mc) return def.mc;
    return `minecraft:${b.t}`;
  }
  _mcNbt(b) {
    const items = slots => {
      const list = [];
      slots.forEach((s, i) => { if (s && s.n > 0) list.push(`{Slot:${i}b,id:"minecraft:${s.id}",count:${s.n}}`); });
      return list.length ? `{Items:[${list.join(',')}]}` : '';
    };
    if (b.t === 'jukebox') return (b.fill || 0) > 0 ? `{RecordItem:{id:"minecraft:music_disc_${DISCS[clamp(b.fill, 1, 15) - 1]}",count:1}}` : '';
    if (defOf(b.t).slots) {
      if (!b.items && !(b.fill > 0)) return '';
      const slots = b.items || this._itemsForLevel(defOf(b.t).slots, b.fill || 0, 'stone');
      return items(slots);
    }
    if (b.t === 'comparator') return `{OutputSignal:${b.out || 0}}`;
    if (b.t === 'sign') {
      const lines = String(b.text || '').split('\n').slice(0, 4);
      while (lines.length < 4) lines.push('');
      return `{front_text:{messages:[${lines.map(l => `'${JSON.stringify(l).replace(/'/g, "\\'")}'`).join(',')}]}}`;
    }
    if (b.t === 'lectern' && (b.pages || 0) > 0) {
      const pages = [];
      for (let i = 0; i < b.pages; i++) pages.push(`"${i + 1}"`);
      return `{Book:{id:"minecraft:writable_book",count:1,components:{"minecraft:writable_book_content":{pages:[${pages.join(',')}]}}},Page:${b.page || 0}}`;
    }
    if (b.t === 'bookshelf') {
      const s = b.slots || [], list = [];
      s.forEach((v, i) => { if (v) list.push(`{Slot:${i}b,id:"minecraft:book",count:1}`); });
      return `{Items:[${list.join(',')}],last_interacted_slot:${b.last === undefined || b.last === null ? -1 : b.last}}`;
    }
    return '';
  }
}

function dirBetween(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) !== 1) return null;
  return dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : dy === -1 ? 'N' : dz === 1 ? 'U' : 'D';
}

// ---------------------------------------------------------------------------------------------
// Player actions (R5): the only legal mutations of a sealed world
// ---------------------------------------------------------------------------------------------

class Hand {
  constructor(world) { this.world = world; }

  _act(b, types, fn) {
    const w = this.world;
    if (w._emitting) throw new Error('world.hand: event listeners may watch the world but not act on it (R4)');
    if (b) {
      if (!b.t || w.get(b.x, b.y, b.z) !== b) throw new Error('world.hand: that block is not in this world');
      if (types && !types.includes(b.t)) throw new Error(`world.hand: expected ${types.join(' or ')}, got ${b.t}`);
    }
    w._inside++;
    try { return fn(); }
    finally { w._inside--; w._quiet = false; }
  }
  // Interaction also makes a vibration that sculk sensors hear.
  _vib(b) { this.world.vibrate(b.x, b.y, b.z, 'hand'); }

  flip(lever) {
    return this._act(lever, ['lever'], () => {
      lever.on = !lever.on;
      this._vib(lever);
      this.world._sound('click', lever, { on: lever.on });
      return true;
    });
  }
  // Stone buttons stay pressed 10 ticks, wooden ones 15.
  press(button) {
    return this._act(button, ['button'], () => {
      if (button.on) return false;
      const w = this.world, at = w.t + (button.wood ? 15 : 10);
      button.on = true;
      button._release = at;
      w.at(at, () => { if (button._release === at) { button.on = false; w._sound('click', button, { on: false }); } });
      this._vib(button);
      w._sound('click', button, { on: true });
      return true;
    });
  }
  step(plate, on = true) {
    return this._act(plate, ['plate'], () => {
      if (!!plate._player === !!on) return false;
      plate._player = !!on;
      if (on) this._vib(plate);
      return true;
    });
  }
  vibrate(x, y, z) {
    return this._act(null, null, () => { this.world.vibrate(x, y, z, 'player'); return true; });
  }
  // Put in or take out items so that a comparator reads `level` (0 to 15). A jukebox takes the disc with that number.
  fill(container, level, item = 'stone') {
    return this._act(container, null, () => {
      const w = this.world, def = defOf(container.t);
      level = clamp(Math.round(level), 0, 15);
      if (container.t === 'jukebox') { container.fill = level; return true; }
      if (!def.slots) throw new Error(`world.hand.fill: ${container.t} is not a container`);
      if (container.items || def.slots) container.items = w._itemsForLevel(def.slots, level, item);
      w._syncFill(container);
      return true;
    });
  }
  insert(container, item, n = 1) {
    return this._act(container, null, () => {
      if (!defOf(container.t).slots) throw new Error(`world.hand.insert: ${container.t} is not a container`);
      return this.world._insert(container, item, n);
    });
  }
  take(container, item, n = 1) {
    return this._act(container, null, () => {
      if (!defOf(container.t).slots) throw new Error(`world.hand.take: ${container.t} is not a container`);
      return this.world._take(container, item, n);
    });
  }
  // Chiseled bookshelf: put a book into slot (0 to 5) if it is empty, or take it out.
  book(shelf, slot) {
    return this._act(shelf, ['bookshelf'], () => {
      const s = shelf.slots || (shelf.slots = [false, false, false, false, false, false]);
      slot = clamp(slot | 0, 0, 5);
      s[slot] = !s[slot];
      shelf.last = slot;
      this.world._sound('book', shelf, { slot, put: s[slot] });
      return true;
    });
  }
  // Turn a lectern's book to page n (0-based): the lectern sends a 1-tick pulse.
  page(lectern, n) {
    return this._act(lectern, ['lectern'], () => {
      const w = this.world, pages = lectern.pages || 0;
      if (!pages) return false;
      const p = clamp(n | 0, 0, pages - 1);
      if (p === (lectern.page || 0)) return false;
      lectern.page = p;
      lectern.powered = true;
      const at = w.t + 1;
      lectern._pulse = at;
      w.at(at, () => { if (lectern._pulse === at) lectern.powered = false; });
      w._sound('page', lectern, { page: p });
      return true;
    });
  }
  rotate(frame) {
    return this._act(frame, ['frame'], () => {
      if (!frame.item) return false;
      frame.rot = ((frame.rot || 0) + 1) % 8;
      this.world._sound('click', frame);
      return true;
    });
  }
  delay(repeater, n) {
    return this._act(repeater, ['repeater'], () => {
      repeater.delay = n === undefined ? (repeater.delay || 1) % 4 + 1 : clamp(n | 0, 1, 4);
      this.world._sound('click', repeater);
      return true;
    });
  }
  mode(comparator, m) {
    return this._act(comparator, ['comparator'], () => {
      comparator.mode = m === undefined ? (comparator.mode === 'sub' ? 'cmp' : 'sub') : (m === 'sub' || m === 'subtract' ? 'sub' : 'cmp');
      this.world._sound('click', comparator);
      return true;
    });
  }
  // Tune a note block (one click raises it a semitone; or set note n) and hear it.
  tune(noteblock, n) {
    return this._act(noteblock, ['noteblock'], () => {
      noteblock.note = n === undefined ? ((noteblock.note || 0) + 1) % 25 : clamp(n | 0, 0, 24);
      this.world._playNote(noteblock);
      return true;
    });
  }
  write(sign, text) {
    return this._act(sign, ['sign'], () => { sign.text = String(text); return true; });
  }
  throwPearl(x, y, z, vx, vy, vz) { return this.throw('pearl', x, y, z, vx, vy, vz); }
  throw(kind, x, y, z, vx = 0, vy = 0, vz = 0) {
    return this._act(null, null, () => {
      const w = this.world;
      const en = w.spawn(kind, x, y, z, { vx, vy, vz, projectile: true, thrown: true, visible: true });
      w._emit('sound', { name: 'throw', x, y, z, entity: en });
      return en;
    });
  }
  // Empty a water bucket into the empty cell (x,y,z).
  pour(x, y, z) {
    return this._act(null, null, () => {
      const w = this.world;
      if (w.get(x, y, z)) return false;
      const b = w.put(x, y, z, 'water');
      try { w._checkWater(b); } catch (e) { w.set(x, y, z, null); throw e; }
      w._emit('sound', { name: 'bucket_empty', x, y, z, block: b });
      return true;
    });
  }
  // Fill an empty bucket from the water source at (x,y,z).
  scoop(x, y, z) {
    return this._act(null, null, () => {
      const w = this.world, b = w.get(x, y, z);
      if (!b || b.t !== 'water') return false;
      w.set(x, y, z, null);
      w._waterRemoved(x, y, z);
      w._emit('sound', { name: 'bucket_fill', x, y, z, block: b });
      return true;
    });
  }
  // Right-click. use(block) or use([x,y,z], 'water_bucket' | 'bucket').
  use(target, item) {
    if (Array.isArray(target)) {
      if (item === 'water_bucket') return this.pour(...target);
      if (item === 'bucket') return this.scoop(...target);
      throw new Error('world.hand.use: a position needs an item (water_bucket or bucket)');
    }
    const b = target;
    switch (b && b.t) {
      case 'lever': return this.flip(b);
      case 'button': return this.press(b);
      case 'noteblock': return this.tune(b);
      case 'repeater': return this.delay(b);
      case 'comparator': return this.mode(b);
      case 'frame': return this.rotate(b);
      case 'water': if (item === 'bucket') return this.scoop(b.x, b.y, b.z); return false;
      case 'lectern': return this.page(b, ((b.page || 0) + 1) % Math.max(1, b.pages || 1));
      case 'daylight': return this._act(b, null, () => { b.inverted = !b.inverted; this.world._sound('click', b); return true; });
      case 'bell': return this._act(b, null, () => { this.world._ringBell(b); this._vib(b); return true; });
      case 'door': case 'trapdoor': case 'gate':
        return this._act(b, null, () => {
          if (b.iron || (b.t === 'door' && b.iron !== false)) return false;   // iron doors and trapdoors ignore hands
          const w = this.world;
          let lower = b;
          if (b.t === 'door' && b.half === 'upper') lower = w.get(b.x, b.y, b.z - 1) || b;
          const open = !lower.open;
          lower.open = open;
          if (b.t === 'door') { const up = w.get(lower.x, lower.y, lower.z + 1); if (up && up.t === 'door') up.open = open; }
          w._sound(`${b.t}_${open ? 'open' : 'close'}`, lower);
          this._vib(lower);
          return true;
        });
      default: return false;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Legacy sub-circuits used by the catalogue
// ---------------------------------------------------------------------------------------------

// Torch RS latch. A at (ox,oy); output Q on the dust row (ox..ox+3, oy-2*s). s=1: dust row north, inputs south; s=-1 mirrored.
function addLatch(w, ox, oy, s = 1, opt = {}) {
  const N = s === 1 ? 'N' : 'S', Sd = s === 1 ? 'S' : 'N';
  const P = (u, v, t, o = {}) => w.put(ox + u, oy + v * s, 0, t, o);
  P(0, 0, 'stone'); P(1, 0, 'torch', { att: 'W', lit: true }); P(2, 0, 'repeater', { d: 'E', delay: 1, on: true, inp: true }); P(3, 0, 'stone');
  P(3, -1, 'torch', { att: Sd, lit: false });
  for (let u = 0; u < 4; u++) P(u, -2, 'dust');
  P(0, -1, 'repeater', { d: Sd, delay: 1 });
  P(0, 1, 'repeater', { d: N, delay: 1 });
  const sensor = opt.set === 'button' ? P(0, 2, 'button', { on: false, att: 'D' }) : P(0, 2, 'sculk');
  P(3, 1, 'repeater', { d: N, delay: 1 });
  const button = P(3, 2, 'button', { on: false, att: 'D' });
  if (opt.set !== 'button') { P(1, 2, 'wool'); P(2, 2, 'wool'); }
  return { sensor, set: sensor, button, reset: button, tB: w.get(ox + 3, oy - s, 0), qRow: oy - 2 * s };
}

// Open/close sequencer. Lever L at (bx,by-1) feeding dust at (bx,by). Outputs are high while closed.
// Lever on: P1 falls (~2t), P2 (~5t), P3 (~10t). Lever off: P3 rises (~2t), P2 (~5t), P1 (~11t).
// P1 = NOT(L OR L+8)  (torch AND gate) ; P2 = S+4 ; P3 = S OR S+8 (two repeaters into one block) ; S = NOT L.
// An extra source (e.g. a latch) can drive L through a repeater placed at (bx-4,by) facing east.
function addSequencer(w, bx, by, opt = {}) {
  const Bp = (u, v, t, o = {}) => w.put(bx + u, by + v, 0, t, o), out = opt.out || 'feed';
  const sink = (u, v) => (out === 'lamp' ? Bp(u, v, 'lamp', { lit: true }) : Bp(u, v, 'obsidian', { feed: true }));
  Bp(0, 0, 'dust'); const lever = Bp(0, -1, 'lever', { on: false, att: 'D' });
  Bp(1, 0, 'dust'); Bp(2, 0, 'stone'); Bp(3, 0, 'torch', { att: 'W', lit: true });
  for (let v = 0; v <= 4; v++) Bp(4, v, 'dust');
  Bp(5, 0, 'repeater', { d: 'E', delay: 4, on: true, inp: true }); const p2 = sink(6, 0);
  Bp(5, 4, 'repeater', { d: 'E', delay: 1, on: true, inp: true }); const p3 = sink(6, 4);
  Bp(4, 5, 'repeater', { d: 'S', delay: 4, on: true, inp: true }); Bp(4, 6, 'repeater', { d: 'S', delay: 4, on: true, inp: true });
  for (const [u, v] of [[4, 7], [5, 7], [6, 7], [6, 6]]) Bp(u, v, 'dust');
  Bp(6, 5, 'repeater', { d: 'N', delay: 1, on: true, inp: true });
  for (let v = 1; v <= 3; v++) Bp(0, v, 'dust');
  Bp(0, 4, 'repeater', { d: 'S', delay: 1 });
  Bp(0, 5, 'stone'); Bp(1, 5, 'torch', { att: 'W', lit: true }); Bp(2, 5, 'dust'); Bp(2, 6, 'repeater', { d: 'S', delay: 1, on: true, inp: true }); const p1 = sink(2, 7);
  for (const u of [-1, -2, -3]) Bp(u, 0, 'dust');
  Bp(-3, 1, 'repeater', { d: 'S', delay: 4 }); Bp(-3, 2, 'repeater', { d: 'S', delay: 4 });
  for (let v = 3; v <= 7; v++) Bp(-3, v, 'dust');
  for (const u of [-2, -1, 0]) Bp(u, 7, 'dust');
  Bp(0, 6, 'repeater', { d: 'N', delay: 1 });
  return { lever, out: [p1, p2, p3], inject: [bx - 4, by], bounds: [bx - 3, bx + 6, by - 1, by + 7] };
}

const RS = { World, D, OPP, DL, HL, K, addLatch, addSequencer, defineBlock, blocks, Hand, MCDIR };
if (typeof module !== 'undefined') module.exports = RS;
if (typeof window !== 'undefined') window.RS = RS;
})();
