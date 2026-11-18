// Redstone UI renderer: block models drawn from the texture atlas in a fixed oblique camera (front face plus top
// face), per-view scale, inspect (x-ray) mode, motion interpolated between engine ticks, entities and particles.
//
//   RSR.defineModel(type, model)                      how a block type is drawn (see "models" below)
//   RSR.makeView(stage, built, { B, T, inspect, ... }) -> view
//   view.rectOf(block | [x, y, z], face)             CSS px rect inside the stage
//   view.setInspect(bool)
//
// Camera: x east, y toward the viewer, z up. A block's front (south) face is B x B CSS px; its top face is B wide and
// T tall, directly above the front face, so rows further back sit T px higher. Nothing else is visible, so a model
// only ever draws south and up faces. Model boxes are given in sixteenths of a block, like vanilla block models.
(() => {
'use strict';

const RS = window.RS;
const { D, OPP } = RS;
const Redstone = window.Redstone = window.Redstone || {};
const TX = Redstone.textures;

const TICK = 100;
const FRONT_SHADE = 0.86;   // vanilla shades side faces darker than tops; the front face is a side face
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let B = 24;                 // default block size for views that do not set their own
let lastTick = performance.now();
let pal = {};
const views = [];
const walkers = [];
const models = new Map();

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* =====================================================================================================
   Texture variants: rotated, tinted, shaded copies of atlas textures, cached.
   ===================================================================================================== */

const variants = new Map();

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rgbOf(color) {
  if (!color) return [255, 255, 255];
  if (color[0] === '#') {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
}

// The texture `name` rotated clockwise by `rot` degrees, multiplied by `tint` and by the brightness `shade`, then
// darkened toward night by `dark` (0..1, for depth).
function variant(name, frame, rot, tint, shade, dark) {
  const key = `${name}|${frame}|${rot}|${tint || ''}|${shade}|${dark}`;
  let c = variants.get(key);
  if (c) return c;
  const src = TX.get(name, frame);
  if (!rot && !tint && shade === 1 && !dark) {
    variants.set(key, src);
    return src;
  }
  const w = src.width;
  const h = src.height;
  let base = src;
  if (rot) {
    base = newCanvas(w, h);
    const r = base.getContext('2d');
    r.translate(w / 2, h / 2);
    r.rotate((rot * Math.PI) / 180);
    r.translate(-w / 2, -h / 2);
    r.drawImage(src, 0, 0);
  }
  c = newCanvas(w, h);
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  const m = rgbOf(tint).map(v => Math.round(v * shade));
  if (m.some(v => v !== 255)) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${m.join(',')})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(base, 0, 0);
  }
  if (dark) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(8,6,14,${dark})`;
    g.fillRect(0, 0, w, h);
  }
  if (variants.size > 6000) variants.clear();
  variants.set(key, c);
  return c;
}

let redrawQueued = false;
function redrawAll() {
  if (redrawQueued) return;
  redrawQueued = true;
  Promise.resolve().then(() => {
    redrawQueued = false;
    const now = performance.now();
    for (const v of views) v.draw(now);
  });
}

TX.onChange(() => {
  variants.clear();
  redrawAll();
});

/* =====================================================================================================
   Geometry helpers for models: boxes in sixteenths, oriented by facing or attachment.
   ===================================================================================================== */

const HORIZONTAL_ROT = { N: 0, E: 90, S: 180, W: 270 };

// A box along facing d: w0..w1 measured from the face at the d edge inward, a and b across it.
function dirBox(d, w0, w1, a0, a1, b0, b1) {
  switch (d) {
    case 'N': return [[a0, w0, b0], [a1, w1, b1]];
    case 'S': return [[a0, 16 - w1, b0], [a1, 16 - w0, b1]];
    case 'W': return [[w0, a0, b0], [w1, a1, b1]];
    case 'E': return [[16 - w1, a0, b0], [16 - w0, a1, b1]];
    case 'D': return [[a0, b0, w0], [a1, b1, w1]];
    default: return [[a0, b0, 16 - w1], [a1, b1, 16 - w0]];   // U
  }
}

// A box on the surface a component is attached to (att: the direction of that block). Local coordinates: a runs
// along the surface (x, or y on east/west walls), b across it (y on floors and ceilings, z on walls), w outward.
function attBox(att, from, to) {
  const [a0, b0, w0] = from;
  const [a1, b1, w1] = to;
  switch (att) {
    case 'U': return [[a0, b0, 16 - w1], [a1, b1, 16 - w0]];
    case 'N': return [[a0, w0, b0], [a1, w1, b1]];
    case 'S': return [[a0, 16 - w1, b0], [a1, 16 - w0, b1]];
    case 'W': return [[w0, a0, b0], [w1, a1, b1]];
    case 'E': return [[16 - w1, a0, b0], [16 - w0, a1, b1]];
    default: return [[a0, b0, w0], [a1, b1, w1]];   // D, or unattached: on the floor
  }
}

// Rotate a box authored facing north to face d (about the vertical axis). Faces marked `turn` rotate their texture.
function rotY(el, d) {
  const r = HORIZONTAL_ROT[d] || 0;
  if (!r) return el;
  const map = ([x, y, z]) => {
    if (r === 90) return [16 - y, x, z];
    if (r === 180) return [16 - x, 16 - y, z];
    return [y, 16 - x, z];
  };
  const a = map(el.from);
  const b = map(el.to);
  const out = Object.assign({}, el, {
    from: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    to: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  });
  if (el.up && el.up.turn) out.up = Object.assign({}, el.up, { rot: ((el.up.rot || 0) + r) % 360 });
  return out;
}

// Which face of an oriented block (piston, observer, barrel, dispenser) shows on the south and up faces, and how far
// the side texture turns so that its top edge points the way the block faces.
const SOUTH_ROLE = { S: ['face', 0], N: ['back', 0], U: ['side', 0], D: ['side', 180], E: ['side', 90], W: ['side', 270] };
const UP_ROLE = { U: ['face', 0], D: ['back', 0], N: ['side', 0], S: ['side', 180], E: ['side', 90], W: ['side', 270] };

function orientedFaces(d, tex) {
  const pick = (role, rot, up) => {
    if (role === 'face') return { tex: up && tex.faceUp ? tex.faceUp : tex.face, shade: tex.faceShade };
    if (role === 'back') return { tex: tex.back };
    const side = up && tex.sideUp ? tex.sideUp : tex.side;
    return { tex: side, rot: tex.fixedSides ? 0 : rot };
  };
  const s = SOUTH_ROLE[d] || SOUTH_ROLE.U;
  const u = UP_ROLE[d] || UP_ROLE.U;
  return { front: pick(s[0], s[1], false), top: pick(u[0], u[1], true) };
}

const cube = (south, up, extra) => Object.assign({ from: [0, 0, 0], to: [16, 16, 16], south, up, cull: true }, extra);

/* =====================================================================================================
   Models
   ===================================================================================================== */

// A model is { kind, ... }:
//   cube:     faces(b, env) -> { front, top }       a full block; opaque unless opaque: false
//   flat:     layers(b, env) -> [face]               drawn on the floor; height (sixteenths) and side for a slab edge
//   cross:    tex(b, env) -> face                    a flat sprite standing in the middle of the cell
//   attached: boxes(b, env) -> [box]                 boxes placed with RSR.geom.attBox for b.att
//   boxes:    boxes(b, env) -> [box]                 any list of boxes { from, to, south, up }
//   custom:   draw(env, b)                           full control; env.boxes(list) and env.sprite(...) draw from the atlas
// Optional: opaque (bool | fn), inspect ('ghost' | 'show' | fn), glow(b, env) -> { color, size, at }, rects(b) ->
// { name: box } for view.rectOf, animated (bool | fn).
// A face is a texture name or { tex, rot, tint, uv: [u0, v0, u1, v1], shade: false, alpha, frame, turn }.
function defineModel(type, model) {
  models.set(type, compile(model));
  redrawAll();
}

function compile(model) {
  const m = Object.assign({}, model);
  if (m.kind === 'cube') {
    const faces = m.faces;
    m.boxes = (b, env) => {
      const f = faces(b, env);
      return [cube(f.front, f.top)];
    };
    if (m.opaque === undefined) m.opaque = true;
  } else if (m.kind === 'flat') {
    const layers = m.layers;
    m.boxes = (b, env) => [{ from: [0, 0, 0], to: [16, 16, m.height || 0], up: layers(b, env), south: m.side ? m.side(b, env) : null }];
  } else if (m.kind === 'cross') {
    const tex = m.tex;
    m.boxes = (b, env) => [{ from: [0, 8, 0], to: [16, 8, 16], south: tex(b, env) }];
  }
  return m;
}

const isFn = f => typeof f === 'function';

function modelOf(b) {
  return models.get(b.t) || models.get('*missing');
}

/* ---------- the block palette ---------- */

const plain = (tex, opt = {}) => ({ kind: 'cube', faces: () => ({ front: tex, top: opt.top || tex }), inspect: opt.inspect || 'ghost' });

defineModel('stone', plain('block/stone'));
defineModel('bricks', plain('block/stone_bricks'));
defineModel('wallb', plain('block/stone_bricks'));
defineModel('wall', plain('block/deepslate_bricks'));
defineModel('planks', plain('block/oak_planks'));
defineModel('smooth_stone', plain('block/smooth_stone'));
defineModel('iron', plain('block/iron_block'));
defineModel('quartz', plain('block/quartz_block_side', { top: 'block/quartz_block_top' }));
defineModel('cobblestone', plain('block/cobblestone'));
defineModel('dirt', plain('block/dirt'));
defineModel('bedrock', plain('block/bedrock'));
defineModel('rblock', plain('block/redstone_block', { inspect: 'show' }));
defineModel('soulsand', plain('block/soul_sand', { inspect: 'show' }));
defineModel('magma', Object.assign(plain('block/magma', { inspect: 'show' }), {
  glow: () => ({ color: '#ff6a1a', size: 1.2, strength: 0.5 }),
}));
defineModel('wool', { kind: 'cube', inspect: 'ghost', faces: b => ({ front: `block/${b.color || 'white'}_wool`, top: `block/${b.color || 'white'}_wool` }) });
defineModel('concrete', { kind: 'cube', inspect: 'ghost', faces: b => ({ front: `block/${b.color || 'white'}_concrete`, top: `block/${b.color || 'white'}_concrete` }) });
defineModel('terracotta', {
  kind: 'cube',
  inspect: 'ghost',
  faces: b => {
    const tex = `block/${b.color || 'light_blue'}_glazed_terracotta`;
    const rot = HORIZONTAL_ROT[b.d] || 0;
    return { front: { tex, rot }, top: { tex, rot } };
  },
});

// Ground: the legacy floor, coloured from the page palette (--floor, --floor-line).
TX.define('rs/ground_top', (ctx, px) => {
  px.fill(pal.floor || '#cfc8b8');
  px.rect(0, 0, 16, 1, pal.line || '#bdb6a6');
  px.rect(0, 0, 1, 16, pal.line || '#bdb6a6');
});
TX.define('rs/ground_side', (ctx, px) => {
  const f = pal.floor || '#cfc8b8';
  px.fill(TX.mix(f, '#000000', 0.38));
  px.rect(0, 0, 16, 2, TX.mix(f, '#000000', 0.18));
  px.rect(4, 6, 2, 1, TX.mix(f, '#000000', 0.5));
  px.rect(10, 10, 2, 1, TX.mix(f, '#000000', 0.5));
});
defineModel('ground', { kind: 'cube', inspect: 'ghost', faces: () => ({ front: { tex: 'rs/ground_side', shade: false }, top: 'rs/ground_top' }) });

// Obsidian. A legacy station or feed block shows a red core while its wiring link powers it.
defineModel('obsidian', {
  kind: 'cube',
  inspect: 'ghost',
  faces: (b, env) => {
    const lit = (b.station || b.feed) && env.strong(b) > 0;
    return { front: lit ? ['block/obsidian', { tex: 'rs/link_core', shade: false }] : 'block/obsidian', top: 'block/obsidian' };
  },
});

defineModel('glass', {
  kind: 'boxes',
  inspect: 'ghost',
  boxes: () => [cube('block/glass', 'block/glass', { cull: true, cullSame: true })],
});

// Slime and honey: an opaque core inside a translucent shell.
function stickyBlock(side, top) {
  return {
    kind: 'boxes',
    inspect: 'show',
    boxes: () => [
      { from: [3, 3, 3], to: [13, 13, 13], south: side, up: top },
      cube({ tex: side, alpha: 0.85 }, { tex: top, alpha: 0.85 }, { cullSame: true }),
    ],
  };
}
defineModel('slime', stickyBlock('block/slime_block', 'block/slime_block'));
defineModel('honey', stickyBlock('block/honey_block_side', 'block/honey_block_top'));

defineModel('lamp', {
  kind: 'cube',
  inspect: 'show',
  faces: b => {
    const tex = b.lit ? 'block/redstone_lamp_on' : 'block/redstone_lamp';
    return { front: { tex, shade: !b.lit }, top: tex };
  },
  glow: b => (b.lit ? { color: '#ffc85a', size: 1.7, strength: 0.55 } : null),
});

defineModel('bulb', {
  kind: 'cube',
  inspect: 'show',
  faces: b => {
    const tex = `block/copper_bulb${b.lit ? '_lit' : ''}${b.powered ? '_powered' : ''}`;
    return { front: { tex, shade: !b.lit }, top: tex };
  },
  glow: b => (b.lit ? { color: '#ffd27a', size: 1.6, strength: 0.5 } : null),
});

defineModel('target', { kind: 'cube', inspect: 'show', faces: () => ({ front: 'block/target_side', top: 'block/target_top' }) });
defineModel('noteblock', plain('block/note_block'));
defineModel('jukebox', plain('block/jukebox_side', { top: 'block/jukebox_top' }));

// Barrel: legacy barrels have no facing and open upward; `crate` is the legacy shared-launcher lid, drawn a row forward.
defineModel('barrel', {
  kind: 'boxes',
  inspect: 'show',
  opaque: b => !b.crate,
  boxes: b => {
    const f = orientedFaces(b.d || 'U', { face: b.open ? 'block/barrel_top_open' : 'block/barrel_top', back: 'block/barrel_bottom', side: 'block/barrel_side' });
    if (b.crate) return [cube(null, f.top), { from: [0, 16, 0], to: [16, 32, 16], south: 'rs/crate' }];
    return [cube(f.front, f.top)];
  },
});

defineModel('furnace', {
  kind: 'cube',
  inspect: 'show',
  faces: b => ({ front: (b.d || 'S') === 'S' ? (b.lit ? 'block/furnace_front_on' : 'block/furnace_front') : 'block/furnace_side', top: 'block/furnace_top' }),
  glow: b => (b.lit && (b.d || 'S') === 'S' ? { color: '#ff8a2a', size: 1.1, strength: 0.4, at: [8, 16, 5] } : null),
});

// Dispenser and dropper: the mouth on the facing side; facing up or down, the sides are smooth stone.
function dispenserModel(kind) {
  return {
    kind: 'cube',
    inspect: 'show',
    faces: b => {
      const d = b.d || 'S';
      if (d === 'U') return { front: 'block/furnace_top', top: `block/${kind}_front_vertical` };
      if (d === 'D') return { front: 'block/furnace_top', top: 'block/furnace_top' };
      return { front: d === 'S' ? `block/${kind}_front` : 'block/furnace_side', top: 'block/furnace_top' };
    },
  };
}
defineModel('dispenser', dispenserModel('dispenser'));
defineModel('dropper', dispenserModel('dropper'));

defineModel('chest', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const d = b.d || 'S';
    return [
      { from: [1, 1, 0], to: [15, 15, 14], south: d === 'S' ? 'rs/chest_front' : 'rs/chest_side', up: 'rs/chest_top' },
      ...(d === 'S' ? [{ from: [7, 15, 7], to: [9, 16, 11], south: { tex: 'block/iron_block', shade: false }, up: 'block/iron_block' }] : []),
    ];
  },
});

// Chiseled bookshelf: slots (6 booleans or a bitmask, top row first) show books on the front face.
defineModel('bookshelf', {
  kind: 'boxes',
  inspect: 'show',
  opaque: true,
  boxes: b => {
    const d = b.d || 'S';
    const list = [cube(d === 'S' ? 'block/chiseled_bookshelf_empty' : 'block/chiseled_bookshelf_side', 'block/chiseled_bookshelf_top')];
    if (d === 'S') {
      for (let k = 0; k < 6; k++) {
        const full = Array.isArray(b.slots) ? b.slots[k] : (b.slots >> k) & 1;
        if (!full) continue;
        const x = [1, 6, 11][k % 3];
        const z = k < 3 ? 9 : 1;
        list.push({ from: [x, 16, z], to: [x + 4, 16, z + 6], south: 'block/chiseled_bookshelf_occupied' });
      }
    }
    return list;
  },
});

/* ---------- pistons ---------- */

function pistonFaceTex(b) {
  return b.s ? 'block/piston_top_sticky' : 'block/piston_top';
}

function pistonBase(b, extended) {
  const d = b.d || 'U';
  if (!extended) {
    const f = orientedFaces(d, { face: pistonFaceTex(b), back: 'block/piston_bottom', side: 'block/piston_side' });
    return [cube(f.front, f.top, { cull: false })];
  }
  const [from, to] = dirBox(d, 4, 16, 0, 16, 0, 16);
  const f = orientedFaces(d, { face: 'block/piston_inner', back: 'block/piston_bottom', side: 'block/piston_side' });
  return [{ from, to, south: f.front, up: f.top }];
}

// The head: a 4px plate at the tip and an arm reaching 4px back into the base.
function pistonHead(b) {
  const d = b.d || 'U';
  const face = pistonFaceTex(b);
  const plate = dirBox(d, 0, 4, 0, 16, 0, 16);
  const f = orientedFaces(d, { face, back: 'block/piston_top', side: 'block/piston_side' });
  const arm = dirBox(d, 4, 20, 6, 10, 6, 10);
  const along = { N: 'y', S: 'y', E: 'x', W: 'x', U: 'z', D: 'z' }[d];
  const strip = { tex: 'block/piston_side', uv: [0, 0, 12, 4] };
  const stripV = { tex: 'block/piston_side', rot: 90, uv: [12, 0, 16, 12] };
  const cap = { tex: 'block/piston_side', uv: [6, 0, 10, 4] };
  const armFaces = {
    south: along === 'x' ? strip : along === 'z' ? stripV : cap,
    up: along === 'x' ? strip : along === 'y' ? stripV : cap,
  };
  const list = [{ from: arm[0], to: arm[1], south: armFaces.south, up: armFaces.up }, { from: plate[0], to: plate[1], south: f.front, up: f.top }];
  // Draw the part further back first: for a head facing the viewer or up, the arm is behind or below the plate.
  return d === 'N' || d === 'D' ? list.reverse() : list;
}

defineModel('piston', {
  kind: 'boxes',
  inspect: 'show',
  opaque: b => !b.ext,
  boxes: (b, env) => pistonBase(b, b.ext || env.retracting(b)),
});
defineModel('head', { kind: 'boxes', inspect: 'show', boxes: b => pistonHead(b) });

defineModel('observer', {
  kind: 'cube',
  inspect: 'show',
  faces: b => orientedFaces(b.d || 'N', {
    face: 'block/observer_front',
    back: b.on ? 'block/observer_back_on' : 'block/observer_back',
    side: 'block/observer_side',
    sideUp: 'block/observer_top',
  }),
  // The lit output glows only where the camera can see it: on the front or top face.
  glow: b => (b.on && ['N', 'D'].includes(b.d || 'N') ? { color: '#ff3a1c', size: 0.9, strength: 0.45, at: backCentre(b.d || 'N') } : null),
});

function backCentre(d) {
  const v = D[OPP[d]];
  return [8 + v[0] * 8, 8 + v[1] * 8, 8 + v[2] * 8];
}

/* ---------- redstone wire and components ---------- */

// Vanilla's redstone wire colour for a signal strength 0..15.
function dustColor(level) {
  const f = level / 15;
  const r = f * 0.6 + (f > 0 ? 0.4 : 0.3);
  const g = clamp(f * f * 0.7 - 0.5, 0, 1);
  const bl = clamp(f * f * 0.6 - 0.7, 0, 1);
  const hx = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + hx(r) + hx(g) + hx(bl);
}

defineModel('dust', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const tint = dustColor(b.lvl || 0);
    const pts = b.pts || ['N', 'E', 'S', 'W'];
    const has = d => pts.includes(d);
    const straight = pts.length === 2 && ((has('N') && has('S')) || (has('E') && has('W')));
    const list = [];
    const plane = (from, to, tex) => list.push({ from, to, up: { tex, tint } });
    if (has('N')) plane([0, 0, 0], [16, 8, 0], 'block/redstone_dust_line0');
    if (has('S')) plane([0, 8, 0], [16, 16, 0], 'block/redstone_dust_line0');
    if (has('W')) plane([0, 0, 0], [8, 16, 0], 'block/redstone_dust_line1');
    if (has('E')) plane([8, 0, 0], [16, 16, 0], 'block/redstone_dust_line1');
    if (!straight) plane([0, 0, 0], [16, 16, 0], 'block/redstone_dust_dot');
    return list;
  },
  digits: b => b.lvl || 0,
});

// A torch box: the stick and head of a torch texture, from z0 to z0 + h.
function torchBox(x, y, z0, h, lit) {
  const tex = lit ? 'block/redstone_torch' : 'block/redstone_torch_off';
  return { from: [x, y, z0], to: [x + 2, y + 2, z0 + h], south: { tex, uv: [7, 6, 9, 6 + h], shade: !lit }, up: { tex, uv: [7, 6, 9, 8], shade: false } };
}

function slab(top) {
  return { from: [0, 0, 0], to: [16, 16, 2], south: { tex: 'block/smooth_stone', uv: [0, 14, 16, 16] }, up: Object.assign({ turn: true }, top) };
}

// Repeaters and comparators are authored with their output toward north (the top edge of their textures).
defineModel('repeater', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const lit = !!b.on;
    const delay = clamp(b.delay || 1, 1, 4);
    const ry = 6 + 2 * (delay - 1);
    const list = [slab({ tex: lit ? 'block/repeater_on' : 'block/repeater' }), torchBox(7, 2, 2, 5, lit)];
    if (b.locked) list.push({ from: [2, ry, 2], to: [14, ry + 2, 4], south: 'block/bedrock', up: 'block/bedrock' });
    else list.push(torchBox(7, ry, 2, 5, lit));
    return list.map(el => rotY(el, b.d || 'N'));
  },
  glow: b => (b.on ? { color: '#ff4a2a', size: 0.7, strength: 0.3, at: [8, 8, 6] } : null),
});

defineModel('comparator', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const out = (b.out || 0) > 0;
    const sub = b.mode === 'sub';
    const list = [
      slab({ tex: out ? 'block/comparator_on' : 'block/comparator' }),
      torchBox(7, 2, 2, 3, sub),
      torchBox(3, 11, 2, 5, out),
      torchBox(11, 11, 2, 5, out),
    ];
    return list.map(el => rotY(el, b.d || 'N'));
  },
  digits: b => b.out || 0,
});

// Torch: standing on the floor, or leaning out from a wall (att is the block it hangs on). Vanilla's stick is 2/16 of
// a block wide; below 24 px blocks that is under 3 px and reads as a scratch, so the stick and head thicken to stay
// about 3 px wide (up to 5/16 at 12 px). Only the drawing changes: the block and its rules are the same.
function torchHalfWidth(env) {
  const B = env && env.view ? env.view.B : 24;
  return clamp(24 / B, 1, 2.5);
}
defineModel('torch', {
  kind: 'attached',
  inspect: 'show',
  boxes: (b, env) => {
    const lit = !!b.lit;
    const att = b.att || 'D';
    const tex = lit ? 'block/redstone_torch' : 'block/redstone_torch_off';
    const th = torchHalfWidth(env);
    if (att === 'D' || att === 'U') {
      return [{ from: [8 - th, 8 - th, 0], to: [8 + th, 8 + th, 10], south: { tex, uv: [7, 6, 9, 16], shade: !lit }, up: { tex, uv: [7, 6, 9, 8], shade: false } }];
    }
    // Five segments, each a little further from the wall: a 22.5 degree lean.
    const list = [];
    for (let k = 0; k < 5; k++) {
      const out = 0.5 + k * 0.85;
      const z0 = 3 + k * 2;
      const [from, to] = attBox(att, [8 - th, z0, out], [8 + th, z0 + 2, out + 2 * th]);
      const v0 = 16 - 2 * (k + 1);
      list.push({ from, to, south: { tex, uv: [7, v0, 9, v0 + 2], shade: !lit }, up: k === 4 ? { tex, uv: [7, 6, 9, 8], shade: false } : null });
    }
    return list;
  },
  glow: b => {
    if (!b.lit) return null;
    const att = b.att || 'D';
    const at = att === 'D' || att === 'U' ? [8, 8, 9] : attBox(att, [8, 12, 4.5], [8, 12, 4.5])[0];
    return { color: '#ff5a28', size: 0.9, strength: 0.5, at };
  },
});

defineModel('lever', {
  kind: 'attached',
  inspect: 'show',
  boxes: b => {
    const att = b.att || 'D';
    const wall = att !== 'D' && att !== 'U';
    const list = [];
    const base = attBox(att, [5, 4, 0], [11, 12, 3]);
    list.push({ from: base[0], to: base[1], south: 'block/cobblestone', up: 'block/cobblestone' });
    // The handle: a staircase of 2px segments from the base, tilted one way when off and the other when on.
    const dir = b.on ? 1 : -1;
    for (let k = 0; k < 5; k++) {
      const da = wall ? 0 : dir * k * 1.15;
      const db = wall ? -dir * k * 1.15 : 0;
      const [from, to] = attBox(att, [7 + da, 7 + db, 2 + k * 1.7], [9 + da, 9 + db, 4 + k * 1.7]);
      const knob = k === 4;
      list.push({ from, to, south: { tex: 'block/lever', uv: knob ? [7, 6, 9, 8] : [7, 8 + k, 9, 10 + k] }, up: { tex: 'block/lever', uv: [7, 6, 9, 8] } });
    }
    return list;
  },
});

function buttonBox(b) {
  const depth = b.on ? 1 : 2;
  return attBox(b.att || 'D', [5, 6, 0], [11, 10, depth]);
}
// A soft contact shadow under small parts, so a stone button still reads on a stone wall.
function contactShadow(att, from, to) {
  const wall = att !== 'D' && att !== 'U';
  const [a0, b0] = from;
  const [a1, b1] = to;
  const box = wall ? attBox(att, [a0 + 0.6, b0 - 1, 0], [a1 + 0.8, b1 - 0.6, 0]) : attBox(att, [a0 + 0.6, b0 + 0.6, 0], [a1 + 0.8, b1 + 0.8, 0]);
  return { from: box[0], to: box[1], south: { tex: 'rs/shadow', shade: false }, up: { tex: 'rs/shadow', shade: false } };
}

defineModel('button', {
  kind: 'attached',
  inspect: 'show',
  boxes: b => {
    const tex = b.wood ? 'block/oak_planks' : 'block/stone';
    const [from, to] = buttonBox(b);
    // The front face is not side-shaded: it catches the light, so the button stands out from its wall.
    return [contactShadow(b.att || 'D', [5, 6], [11, 10]), { from, to, south: { tex, shade: false }, up: tex }];
  },
  rects: b => ({ hit: buttonBox(b) }),
});

defineModel('plate', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const tex = b.wood ? 'block/oak_planks' : 'block/stone';
    return [contactShadow('D', [1, 1], [15, 15]), { from: [1, 1, 0], to: [15, 15, b.on ? 0.5 : 1], south: { tex, shade: false }, up: tex }];
  },
});

/* ---------- signs, lectern, bell, hopper, daylight detector, sculk ---------- */

function signBoard(b) {
  const att = b.att || 'N';
  if (b.kind === 'hanging' || att === 'U') return [[1, 7, 0], [15, 9, 10]];
  if (b.kind === 'standing' || att === 'D') return [[0, 7, 7], [16, 9, 15]];
  return attBox(att, [0, 4.5, 0], [16, 12.5, 2]);
}
defineModel('sign', {
  kind: 'attached',
  inspect: 'show',
  boxes: b => {
    const att = b.att || 'N';
    const board = signBoard(b);
    const list = [];
    if (b.kind === 'hanging' || att === 'U') {
      list.push({ from: [2, 8, 10], to: [5, 8, 16], south: { tex: 'block/chain', uv: [6, 0, 9, 6] } });
      list.push({ from: [11, 8, 10], to: [14, 8, 16], south: { tex: 'block/chain', uv: [6, 0, 9, 6] } });
    } else if (b.kind === 'standing' || att === 'D') {
      list.push({ from: [7, 7, 0], to: [9, 9, 7], south: 'block/oak_log', up: 'block/oak_log' });
    }
    // The board is pale planed oak (rs/oak_sign), not planks: the text on it must read (SPEC I3).
    list.push({ from: board[0], to: board[1], south: 'rs/oak_sign', up: 'rs/oak_sign' });
    return list;
  },
  rects: b => {
    const [from, to] = signBoard(b);
    // 'front' is the whole board (the UI core lays sign text over it); 'text' leaves a 1px frame.
    return { front: [from, to], board: [from, to], text: [[from[0] + 1, from[1], from[2] + 1], [to[0] - 1, to[1], to[2] - 1]] };
  },
});

defineModel('lectern', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const list = [
      { from: [0, 0, 0], to: [16, 16, 2], south: 'block/lectern_base', up: { tex: 'block/lectern_base', turn: true } },
      { from: [4, 4, 2], to: [12, 12, 13], south: 'block/lectern_front' },
      { from: [0, 0, 12], to: [16, 16, 15], south: { tex: 'block/lectern_sides', uv: [0, 1, 16, 4] }, up: { tex: 'block/lectern_top', turn: true } },
    ];
    if ((b.pages || 0) > 0 || b.book) list.push({ from: [1, 2, 15], to: [15, 14, 16], south: { tex: 'block/oak_planks', tint: '#7a2a1a', uv: [0, 0, 14, 1] }, up: { tex: 'rs/lectern_book', turn: true } });
    return list.map(el => rotY(el, b.d || 'N'));
  },
});

defineModel('bell', {
  kind: 'boxes',
  inspect: 'show',
  boxes: (b, env) => {
    const att = b.att || 'D';
    const swing = b.ringing ? Math.round(Math.sin(env.now / 60) * 1.5) : 0;
    if (b.ringing) env.animate(50);
    const body = { from: [2 + swing, 8, 1], to: [14 + swing, 8, 13], south: { tex: 'rs/bell_body', uv: [1, 2, 15, 14] } };
    if (att === 'U') return [{ from: [7, 7, 12], to: [9, 9, 16], south: 'block/bell_side', up: 'block/bell_top' }, body];
    if (att === 'D') {
      return [
        { from: [0, 6, 0], to: [2, 10, 15], south: 'block/bell_side', up: 'block/bell_top' },
        { from: [14, 6, 0], to: [16, 10, 15], south: 'block/bell_side', up: 'block/bell_top' },
        { from: [2, 7, 13], to: [14, 9, 15], south: 'block/bell_side', up: 'block/bell_top' },
        body,
      ];
    }
    const [from, to] = attBox(att, [7, 13, 0], [9, 15, 9]);
    return [{ from, to, south: 'block/bell_side', up: 'block/bell_top' }, body];
  },
  animated: b => !!b.ringing,
});

defineModel('hopper', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const d = b.d || 'D';
    const list = [
      { from: [0, 0, 10], to: [16, 16, 16], south: { tex: 'block/hopper_outside', uv: [0, 0, 16, 6] }, up: 'block/hopper_top' },
      { from: [4, 4, 4], to: [12, 12, 10], south: { tex: 'block/hopper_outside', uv: [4, 6, 12, 12] }, up: 'block/hopper_outside' },
    ];
    const [from, to] = d === 'D' ? [[6, 6, 0], [10, 10, 4]] : dirBox(d, 0, 4, 6, 10, 4, 8);
    const spout = { from, to, south: { tex: 'block/hopper_outside', uv: [6, 12, 10, 16] }, up: 'block/hopper_outside' };
    // The spout is drawn first unless it points at the viewer, where it is in front of the funnel.
    return d === 'S' ? [...list, spout] : [spout, ...list];
  },
});

defineModel('daylight', {
  kind: 'flat',
  inspect: 'show',
  height: 6,
  layers: b => [b.inverted ? 'block/daylight_detector_inverted_top' : 'block/daylight_detector_top'],
  side: () => ({ tex: 'block/daylight_detector_side', uv: [0, 10, 16, 16] }),
});

defineModel('sculk', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const tendril = b.on ? 'block/sculk_sensor_tendril_active' : 'block/sculk_sensor_tendril_inactive';
    return [
      { from: [0, 0, 0], to: [16, 16, 8], south: { tex: 'block/sculk_sensor_side', uv: [0, 8, 16, 16] }, up: 'block/sculk_sensor_top' },
      { from: [0, 4, 8], to: [16, 4, 16], south: { tex: tendril, uv: [0, 3, 16, 11], shade: !b.on } },
      { from: [0, 11, 8], to: [16, 11, 16], south: { tex: tendril, uv: [0, 3, 16, 11], shade: !b.on } },
    ];
  },
  glow: b => (b.on ? { color: '#5ff3f0', size: 1.6, strength: 0.4, at: [8, 8, 9] } : null),
  digits: b => (b.on ? b.out || 0 : 0),
});

/* ---------- doors, trapdoors, gates ---------- */

const CCW = { N: 'W', W: 'S', S: 'E', E: 'N' };
const CW = { N: 'E', E: 'S', S: 'W', W: 'N' };

// A 3px panel against the edge of the cell in direction `edge`.
function edgeSlab(edge, z0, z1) {
  switch (edge) {
    case 'N': return [[0, 0, z0], [16, 3, z1]];
    case 'S': return [[0, 13, z0], [16, 16, z1]];
    case 'W': return [[0, 0, z0], [3, 16, z1]];
    default: return [[13, 0, z0], [16, 16, z1]];
  }
}

defineModel('door', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const d = b.d || 'N';
    const edge = b.open ? (b.hinge === 'right' ? CW[d] : CCW[d]) : OPP[d];
    const upper = b.half === 'upper' || b.half === 'top';
    const tex = `block/${b.iron === false ? 'oak' : 'iron'}_door_${upper ? 'top' : 'bottom'}`;
    const [from, to] = edgeSlab(edge, 0, 16);
    return [{ from, to, south: tex, up: { tex, uv: [0, 0, 16, 3] } }];
  },
});

// Trapdoors swing over one tick (I4). Legacy trapdoors have no facing: they hang from the back (north) edge.
function trapdoorBox(b, open) {
  const d = b.d || 'S';
  const top = b.half !== 'bottom';
  if (open) return edgeSlab(OPP[d], 0, 16);
  return top ? [[0, 0, 13], [16, 16, 16]] : [[0, 0, 0], [16, 16, 3]];
}
defineModel('trapdoor', {
  kind: 'custom',
  inspect: 'show',
  draw: (env, b) => {
    const tex = b.iron ? 'block/iron_trapdoor' : 'block/oak_trapdoor';
    const u = env.swing(b, b.open ? 1 : 0);
    if (u === 0 || u === 1) {
      const [from, to] = trapdoorBox(b, u === 1);
      env.boxes([{ from, to, south: tex, up: tex }]);
      return;
    }
    // Mid-swing: the panel's surface turns about its hinge; draw it as one parallelogram.
    const d = b.d || 'S';
    const top = b.half !== 'bottom';
    const hingeEdge = OPP[d];
    env.hingePanel(tex, hingeEdge, top, u);
  },
});

defineModel('gate', {
  kind: 'boxes',
  inspect: 'show',
  boxes: b => {
    const tex = 'block/oak_planks';
    const list = [
      { from: [0, 7, 5], to: [2, 9, 16], south: tex, up: tex },
      { from: [14, 7, 5], to: [16, 9, 16], south: tex, up: tex },
    ];
    if (b.open) {
      for (const x of [0, 14]) {
        list.push({ from: [x, 9, 6], to: [x + 2, 15, 9], south: tex, up: tex });
        list.push({ from: [x, 9, 12], to: [x + 2, 15, 15], south: tex, up: tex });
      }
    } else {
      list.push({ from: [2, 7, 6], to: [14, 9, 9], south: tex, up: tex });
      list.push({ from: [2, 7, 12], to: [14, 9, 15], south: tex, up: tex });
      list.push({ from: [6, 7, 9], to: [8, 9, 12], south: tex, up: tex });
      list.push({ from: [8, 7, 9], to: [10, 9, 12], south: tex, up: tex });
    }
    return list.map(el => rotY(el, b.d === 'E' || b.d === 'W' ? 'E' : 'N'));
  },
});

/* ---------- water ---------- */

const WATER_TINT = '#3f76e4';
defineModel('water', {
  kind: 'custom',
  inspect: 'show',
  draw: (env, b) => {
    const w = env.world;
    const above = w.get(b.x, b.y, b.z + 1);
    const h = above && above.t === 'water' ? 16 : 14;
    // Bubbles rise inside an upward bubble column, behind the water's front face.
    if (w.bubbleColumn && w.bubbleColumn(b.x + 0.5, b.y + 0.5, b.z + 0.5)) {
      const t = env.now / 1000;
      env.animate(50);
      for (let k = 0; k < 6; k++) {
        const ph = (t * 0.9 + k / 6) % 1;
        const x = 0.16 + ((k * 37) % 60) / 100;
        const y = 0.3 + ((k * 23) % 40) / 100;
        const size = k % 2 ? 4 : 3;
        env.sprite('particle/bubble', b.x + x, b.y + y, b.z + ph * (h / 16), size / 16, { alpha: 1 - ph * 0.5 });
      }
    }
    env.boxes([{
      from: [0, 0, 0],
      to: [16, 16, h],
      south: { tex: 'block/water_still', tint: WATER_TINT },
      up: { tex: 'block/water_still', tint: WATER_TINT },
      cullSame: true,
    }]);
  },
  animated: true,
});

/* ---------- unknown blocks ---------- */

defineModel('*missing', { kind: 'cube', inspect: 'show', faces: () => ({ front: 'missing', top: 'missing' }) });

/* =====================================================================================================
   Views
   ===================================================================================================== */

// Where to draw an entity part way through a tick. A push by a moving block and the entity's next game ticks of
// flight all happen within one tick, so hold the entity in place until the block's leading face reaches it, then move
// it to where the tick leaves it.
function entityAt(en, p, t) {
  const h = en.hit;
  const u = h && h.t === t - 1 && p < 1 ? (p <= h.at ? 0 : (p - h.at) / (1 - h.at)) : p;
  return [en.px + (en.x - en.px) * u, en.py + (en.y - en.py) * u, en.pz + (en.z - en.pz) * u];
}

// The offset (in blocks) at which a block in motion is drawn: it moved last tick and slides in over this one.
function motionOf(b, w, p) {
  if (p >= 1) return null;
  if (b.mv && b.mv.t === w.t - 1) {
    const d = D[b.mv.d];
    return [-d[0] * (1 - p), -d[1] * (1 - p), -d[2] * (1 - p)];
  }
  if (b.t === 'head' && b.p && b.p.mvAt === w.t - 1) {
    const d = D[b.d];
    return [-d[0] * (1 - p), -d[1] * (1 - p), -d[2] * (1 - p)];
  }
  return null;
}

const INSPECT_GHOST_ALPHA = 0.14;
const OUTLINE_COLORS = { strong: '#ff3a1c', weak: '#ffa040', none: '#9a9ab4' };

function makeView(stage, scene, opt = {}) {
  const VB = opt.B || B;
  const T = opt.T || (opt.tilt ? Math.max(1, Math.round(VB * opt.tilt)) : (opt.B ? Math.round(VB * 0.72) : (window.__T || Math.round(VB * 0.72))));
  const S = opt.shear || 0;
  const [x0, x1, y0, y1, z0, z1] = scene.box;
  const W = (x1 - x0 + 1) * VB + (y1 - y0 + 1) * S;
  const H = (z1 - z0 + 1) * VB + (y1 - y0 + 1) * T;
  stage.style.width = (opt.width ? Math.max(opt.width, W) : W) + 'px';
  stage.style.height = H + 'px';
  const cv = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  cv.setAttribute('aria-hidden', 'true');
  stage.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const v = {
    stage, scene, world: scene.world, ctx, W, H, box: scene.box, B: VB, T, S, dpr,
    onTick: opt.onTick, skip: opt.skip, under: opt.under, ghost: opt.ghost, tint: opt.tint,
    entityFilter: opt.entityFilter, apertures: opt.apertures, ghostOpacity: opt.ghostOpacity,
    inspect: !!opt.inspect, particles: [], swings: new WeakMap(), seenT: null, tickAt: lastTick,
    moving: false, wakeAt: Infinity,
  };
  // Legacy code may set view.anim; the getter says whether the view wants another frame now.
  let forced = false;
  Object.defineProperty(v, 'anim', {
    get: () => forced || v.moving || performance.now() >= v.wakeAt,
    set: value => { forced = !!value; },
    enumerable: true,
  });

  // Screen position (CSS px) of the world point (X, Y, Z): X east, Y toward the viewer, Z up.
  v.pt = (X, Y, Z) => ({ x: (X - x0) * VB + (Y - y0) * S, y: (z1 + 1 - Z) * VB + (Y - y0) * T });
  v.front = (x, y, z) => v.pt(x, y + 1, z + 1);
  v.plane = (x, y, z) => v.pt(x, y, z);

  v.setInspect = on => {
    v.inspect = !!on;
    v.draw(performance.now());
  };

  v.rectOf = (target, face = 'front') => rectOf(v, target, face);
  v.emit = (kind, x, y, z, o) => emit(v, kind, x, y, z, o);
  v.draw = now => drawView(v, now === undefined ? performance.now() : now);
  views.push(v);
  return v;
}

function rectOf(v, target, face) {
  const b = Array.isArray(target) ? null : target;
  const [x, y, z] = Array.isArray(target) ? target : [target.x, target.y, target.z];
  const box = (from, to, which) => {
    if (which === 'up') {
      const p = v.pt(x + from[0] / 16, y + from[1] / 16, z + to[2] / 16);
      return { x: p.x, y: p.y, w: ((to[0] - from[0]) / 16) * v.B, h: ((to[1] - from[1]) / 16) * v.T };
    }
    const p = v.pt(x + from[0] / 16, y + to[1] / 16, z + to[2] / 16);
    return { x: p.x, y: p.y, w: ((to[0] - from[0]) / 16) * v.B, h: ((to[2] - from[2]) / 16) * v.B };
  };
  if (b) {
    const m = modelOf(b);
    const named = m && m.rects ? m.rects(b) : null;
    if (named && named[face]) return box(named[face][0], named[face][1], 'south');
  }
  switch (face) {
    case 'top': return box([0, 0, 0], [16, 16, 16], 'up');
    case 'floor': return box([0, 0, -16], [16, 16, 0], 'up');
    case 'back': return box([0, 0, 0], [16, 0, 16], 'south');
    case 'cell': {
      const top = box([0, 0, 0], [16, 16, 16], 'up');
      return { x: top.x, y: top.y, w: v.B, h: v.B + v.T };
    }
    default: return box([0, 0, 0], [16, 16, 16], 'south');   // front, text (a block with no text area)
  }
}

/* ---------- drawing ---------- */

// Draw an image region into a CSS-px rect, snapped to device pixels so edges stay crisp at any devicePixelRatio.
function blit(v, img, sx, sy, sw, sh, x, y, w, h) {
  const d = v.dpr;
  const X0 = Math.round(x * d);
  const Y0 = Math.round(y * d);
  const X1 = Math.round((x + w) * d);
  const Y1 = Math.round((y + h) * d);
  if (X1 <= X0 || Y1 <= Y0 || sw <= 0 || sh <= 0) return;
  v.ctx.drawImage(img, sx, sy, sw, sh, X0, Y0, X1 - X0, Y1 - Y0);
}

function normFace(f) {
  return typeof f === 'string' ? { tex: f } : f;
}

function drawFace(env, spec, uv, x, y, w, h, shear, which) {
  if (!spec) return;
  if (Array.isArray(spec)) {
    for (const s of spec) drawFace(env, s, uv, x, y, w, h, shear, which);
    return;
  }
  const s = normFace(spec);
  const v = env.view;
  const frames = TX.frames(s.tex);
  let frame = s.frame || 0;
  if (frames > 1 && s.frame === undefined) {
    frame = TX.frameAt(s.tex, env.now);
    env.animate(TX.nextFrameIn(s.tex, env.now));
  }
  const shade = s.shade === false || env.flat ? 1 : which === 'south' ? FRONT_SHADE : 1;
  const img = variant(s.tex, frame, s.rot || 0, s.tint, shade, s.shade === false ? env.dark * 0.5 : env.dark);
  const k = img.width / 16;
  const [u0, v0, u1, v1] = s.uv || uv;
  v.ctx.globalAlpha = env.alpha * (s.alpha === undefined ? 1 : s.alpha);
  if (!shear) {
    blit(v, img, u0 * k, v0 * k, (u1 - u0) * k, (v1 - v0) * k, x, y, w, h);
    return;
  }
  const d = v.dpr;
  const sw = (u1 - u0) * k;
  const sh = (v1 - v0) * k;
  v.ctx.save();
  v.ctx.setTransform((w * d) / sw, 0, (shear * d) / sh, (h * d) / sh, x * d, y * d);
  v.ctx.drawImage(img, u0 * k, v0 * k, sw, sh, 0, 0, sw, sh);
  v.ctx.restore();
}

// Draw a model's boxes for the block at cell (cx, cy, cz) shifted by `off` blocks.
function drawBoxes(env, list, cx, cy, cz, cull) {
  const v = env.view;
  for (const el of list) {
    const [f0, f1, f2] = el.from;
    const [t0, t1, t2] = el.to;
    const ox = cx + env.off[0];
    const oy = cy + env.off[1];
    const oz = cz + env.off[2];
    const cullSouth = cull && t1 === 16 && cull(el, 'south');
    const cullUp = cull && t2 === 16 && cull(el, 'up');
    if (el.south && t0 > f0 && t2 > f2 && !cullSouth) {
      const p = v.pt(ox + f0 / 16, oy + t1 / 16, oz + t2 / 16);
      drawFace(env, el.south, [f0, 16 - t2, t0, 16 - f2], p.x, p.y, ((t0 - f0) / 16) * v.B, ((t2 - f2) / 16) * v.B, 0, 'south');
    }
    if (el.up && t0 > f0 && t1 > f1 && !cullUp) {
      const p = v.pt(ox + f0 / 16, oy + f1 / 16, oz + t2 / 16);
      drawFace(env, el.up, [f0, f1, t0, t1], p.x, p.y, ((t0 - f0) / 16) * v.B, ((t1 - f1) / 16) * v.T, ((t1 - f1) / 16) * v.S, 'up');
    }
  }
}

// Draw a sprite (an item, particle or entity) centred on x and standing on the world point (X, Y, Z); size in blocks.
function drawSprite(env, tex, X, Y, Z, size, o = {}) {
  const v = env.view;
  const p = v.pt(X, Y, Z);
  const w = size * v.B;
  const h = (o.aspect || 1) * w;
  const img = variant(tex, 0, o.rot || 0, o.tint, 1, 0);
  const prev = v.ctx.globalCompositeOperation;
  if (o.add) v.ctx.globalCompositeOperation = 'lighter';
  v.ctx.globalAlpha = env.alpha * (o.alpha === undefined ? 1 : o.alpha);
  blit(v, img, 0, 0, img.width, img.height, p.x - w / 2, o.centre ? p.y - h / 2 : p.y - h, w, h);
  v.ctx.globalCompositeOperation = prev;
}

function drawGlow(env, b, g) {
  const v = env.view;
  const at = g.at || [8, 8, 8];
  const X = b.x + env.off[0] + at[0] / 16;
  const Y = b.y + env.off[1] + at[1] / 16;
  const Z = b.z + env.off[2] + at[2] / 16;
  const p = v.pt(X, Y, Z);
  const w = g.size * v.B;
  const img = variant('rs/glow', 0, 0, g.color, 1, 0);
  const prev = v.ctx.globalCompositeOperation;
  v.ctx.globalCompositeOperation = 'lighter';
  v.ctx.globalAlpha = (g.strength || 0.5) * (env.alpha < 1 ? env.alpha : 1);
  blit(v, img, 0, 0, img.width, img.height, p.x - w / 2, p.y - w / 2, w, w);
  v.ctx.globalCompositeOperation = prev;
}

// Mid-swing trapdoor: the panel turns about its hinge edge; its surface projects to a parallelogram.
function drawHingePanel(env, b, tex, edge, topHalf, u) {
  const v = env.view;
  const a = u * Math.PI / 2;
  const ox = b.x + env.off[0];
  const oy = b.y + env.off[1];
  const oz = b.z + env.off[2];
  // Hinge line and the panel's extent vector (closed: across the cell, horizontal; open: vertical, down or up).
  const hz = topHalf ? 1 : 0;
  const vert = topHalf ? -1 : 1;
  let P0;
  let P1;
  let ext;
  switch (edge) {
    case 'N': P0 = [0, 0, hz]; P1 = [1, 0, hz]; ext = [0, Math.cos(a), vert * Math.sin(a)]; break;
    case 'S': P0 = [0, 1, hz]; P1 = [1, 1, hz]; ext = [0, -Math.cos(a), vert * Math.sin(a)]; break;
    case 'W': P0 = [0, 0, hz]; P1 = [0, 1, hz]; ext = [Math.cos(a), 0, vert * Math.sin(a)]; break;
    default: P0 = [1, 0, hz]; P1 = [1, 1, hz]; ext = [-Math.cos(a), 0, vert * Math.sin(a)]; break;
  }
  const P = q => v.pt(ox + q[0], oy + q[1], oz + q[2]);
  const A = P(P0);
  const Bp = P(P1);
  const C = P([P0[0] + ext[0], P0[1] + ext[1], P0[2] + ext[2]]);
  const img = variant(tex, 0, 0, null, 1, env.dark);
  const d = v.dpr;
  const k = img.width;
  v.ctx.save();
  v.ctx.globalAlpha = env.alpha;
  v.ctx.setTransform(((Bp.x - A.x) * d) / k, ((Bp.y - A.y) * d) / k, ((C.x - A.x) * d) / k, ((C.y - A.y) * d) / k, A.x * d, A.y * d);
  v.ctx.drawImage(img, 0, 0);
  v.ctx.restore();
}

function drawView(v, now) {
  const w = v.world;
  const ctx = v.ctx;
  const [x0, x1, y0, y1, z0, z1] = v.box;
  if (w.t !== v.seenT) {
    v.seenT = w.t;
    v.tickAt = now - lastTick < TICK && now >= lastTick ? lastTick : now;
  }
  const p = reduce ? 1 : clamp((now - v.tickAt) / TICK, 0, 1);
  const inspect = v.inspect;
  let moving = false;
  let wake = Infinity;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (v.under) {
    ctx.save();
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    v.under(ctx);
    ctx.restore();
  }

  const inBox = b => b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1 && b.z >= z0 && b.z <= z1;
  const skipped = b => !inspect && v.skip && v.skip(b);
  const ghosted = b => {
    if (v.ghost && v.ghost(b)) return true;
    if (!inspect) return false;
    const m = modelOf(b);
    const role = isFn(m.inspect) ? m.inspect(b) : m.inspect;
    return role === 'ghost';
  };

  // Retracting pistons draw their head sliding back in over this tick.
  const retracting = b => b.t === 'piston' && !b.ext && b.mvAt === w.t - 1 && p < 1;

  // A block hides the faces behind it only if it is an opaque full cube that is drawn, at rest and solid.
  const occluder = n => {
    if (!n || !inBox(n) || skipped(n) || ghosted(n)) return false;
    if (n.mv && n.mv.t === w.t - 1 && p < 1) return false;
    const m = modelOf(n);
    return isFn(m.opaque) ? !!m.opaque(n) : !!m.opaque;
  };

  // In inspect mode a ghost behind another ghost fades further, so the nearest layer reads and deep walls do not
  // pile up into a grey wash.
  const ghostAlpha = b => {
    if (v.ghost && v.ghost(b)) return v.ghostOpacity === undefined ? 0.1 : v.ghostOpacity;
    const n = w.get(b.x, b.y + 1, b.z);
    return n && inBox(n) && ghosted(n) ? INSPECT_GHOST_ALPHA * 0.4 : INSPECT_GHOST_ALPHA;
  };

  const items = [];
  for (const b of w.c.values()) {
    if (!inBox(b) || skipped(b)) continue;
    const off = motionOf(b, w, p);
    if (off) moving = true;
    // Opaque cubes fully covered in front and above are never seen.
    if (!off && occluder(b) && occluder(w.get(b.x, b.y + 1, b.z)) && occluder(w.get(b.x, b.y, b.z + 1))) continue;
    const o = off || [0, 0, 0];
    items.push({ b, off: o, ky: b.y + o[1], kz: b.z + o[2], order: 1 });
    if (retracting(b)) {
      const d = D[b.d];
      const head = { t: 'head', d: b.d, s: b.s, x: b.x + d[0], y: b.y + d[1], z: b.z + d[2], phantom: true };
      const ho = [-d[0] * p, -d[1] * p, -d[2] * p];
      items.push({ b: head, off: ho, ky: head.y + ho[1], kz: head.z + ho[2], order: 0 });
      moving = true;
    }
  }
  const entities = [];
  for (const en of w.entities || []) {
    if (en.gone || (v.entityFilter && !v.entityFilter(en))) continue;
    const pos = entityAt(en, p, w.t);
    if (Math.hypot(en.vx, en.vy, en.vz) > 0.001 || en.x !== en.px || en.y !== en.py || en.z !== en.pz) moving = true;
    items.push({ en, pos, ky: Math.floor(pos[1]), kz: Math.floor(pos[2]), order: -1 });
    entities.push(en);
  }
  items.sort((a, c) => a.ky - c.ky || a.kz - c.kz || a.order - c.order);

  const env = {
    view: v, world: w, now, p, alpha: 1, dark: 0, off: [0, 0, 0], flat: false,
    animate: ms => { wake = Math.min(wake, now + Math.max(16, ms)); },
    strong: b => (w.strong && w.strong.get(RS.K(b.x, b.y, b.z))) || 0,
    weak: b => (w.weak && w.weak.get(RS.K(b.x, b.y, b.z))) || 0,
    retracting,
    swing: (b, target) => swingOf(v, b, target, now, () => { moving = true; }),
    sprite: (tex, X, Y, Z, size, o) => drawSprite(env, tex, X + env.off[0], Y + env.off[1], Z + env.off[2], size, o),
    boxes: null,
    hingePanel: null,
  };

  ctx.save();
  if (v.apertures) {
    ctx.beginPath();
    v.apertures.forEach(([ax, ay, aw, ah]) => ctx.rect(ax * v.dpr, ay * v.dpr, aw * v.dpr, ah * v.dpr));
    ctx.clip();
  }
  const digitList = [];
  for (const it of items) {
    if (it.en) {
      drawEntity(env, it.en, it.pos);
      continue;
    }
    const b = it.b;
    const m = modelOf(b);
    const gh = ghosted(b);
    env.alpha = gh ? ghostAlpha(b) : 1;
    env.dark = !gh && v.tint ? Math.round(clamp(v.tint(b) || 0, 0, 1) * 20) / 20 : 0;
    env.off = it.off;
    env.block = b;
    const cull = (el, face) => {
      const n = face === 'south' ? w.get(b.x, b.y + 1, b.z) : w.get(b.x, b.y, b.z + 1);
      if (el.cullSame && n && n.t === b.t && !(n.mv && n.mv.t === w.t - 1 && p < 1)) return true;
      return el.cull && !it.off.some(c => c) && occluder(n);
    };
    env.boxes = list => drawBoxes(env, list, b.x, b.y, b.z, cull);
    env.hingePanel = (tex, edge, topHalf, u) => drawHingePanel(env, b, tex, edge, topHalf, u);
    if (m.kind === 'custom') m.draw(env, b);
    else env.boxes(m.boxes(b, env));
    if (m.animated && (isFn(m.animated) ? m.animated(b) : true)) env.animate(50);
    const g = m.glow && m.glow(b, env);
    if (g) drawGlow(env, b, g);
    if (gh) {
      // Outline powered blocks (red strong, orange weak) and the nearest layer of unpowered ones.
      const state = inspect ? powerState(env, b) : 'legacy';
      if (state !== 'none' || env.alpha === INSPECT_GHOST_ALPHA) drawOutline(env, b, state);
    }
    if (inspect && m.digits) {
      const n = m.digits(b);
      if (n > 0) digitList.push({ b, n, off: it.off });
    }
  }
  ctx.restore();
  env.alpha = 1;
  env.dark = 0;
  env.off = [0, 0, 0];

  // Vibrations travelling to sculk sensors, and the sculk bench's visitor.
  for (const vb of w.vibs || []) {
    const pp = (w.t - 1 + p - vb.t0) / (vb.t1 - vb.t0);
    if (pp < 0 || pp > 1) continue;
    const P3 = vb.from.map((c, i) => c + 0.5 + (vb.to[i] - c) * pp);
    drawSprite(env, 'particle/vibration', P3[0], P3[1], P3[2], 0.5, { centre: true });
    drawSprite(env, 'rs/glow', P3[0], P3[1], P3[2], 1, { centre: true, tint: '#5ff3f0', add: true, alpha: 0.6 });
    moving = true;
  }
  if (v.walker && v.walker.y <= y1 + 1) {
    const age = (now - v.walker.at) / 400;
    if (age < 1) {
      const size = (0.3 + age * 0.9) * 2;
      drawSprite(env, 'rs/ring', v.walker.x + 0.5, v.walker.y + 0.5, 0, size, { centre: true, aspect: v.T / v.B, tint: '#5ff3f0', alpha: 1 - age });
      moving = true;
    }
    drawSprite(env, 'rs/visitor', v.walker.x + 0.5, v.walker.y + 0.5, 0, 1);
  }

  // Particles (notes, bubbles, redstone) emitted on this view.
  if (v.particles.length) {
    v.particles = v.particles.filter(pt => now - pt.born < pt.life);
    for (const pt of v.particles) {
      const age = (now - pt.born) / 1000;
      const a = 1 - (now - pt.born) / pt.life;
      drawSprite(env, pt.tex, pt.x + pt.vx * age, pt.y + pt.vy * age, pt.z + pt.vz * age, pt.size, { centre: true, tint: pt.tint, alpha: a });
    }
    if (v.particles.length) moving = true;
  }

  if (inspect) {
    drawLinks(env);
    if (v.B >= 14) for (const d of digitList) drawDigits(env, d.b, d.n, d.off);
  }

  v.moving = moving;
  v.wakeAt = wake;
  ctx.globalAlpha = 1;
}

function powerState(env, b) {
  if (env.strong(b) > 0) return 'strong';
  if (env.weak(b) > 0) return 'weak';
  return 'none';
}

function drawOutline(env, b, state) {
  const v = env.view;
  const tint = state === 'legacy' ? '#a0a0b4' : OUTLINE_COLORS[state];
  const img = variant('rs/outline', 0, 0, tint, 1, 0);
  const f = v.pt(b.x + env.off[0], b.y + 1 + env.off[1], b.z + 1 + env.off[2]);
  v.ctx.globalAlpha = state === 'legacy' ? 0.35 : state === 'none' ? 0.45 : 0.9;
  blit(v, img, 0, 0, img.width, img.height, f.x, f.y, v.B, v.B);
  if (state !== 'legacy') {
    const t = v.pt(b.x + env.off[0], b.y + env.off[1], b.z + 1 + env.off[2]);
    blit(v, img, 0, 0, img.width, img.height, t.x, t.y, v.B, v.T);
  }
  v.ctx.globalAlpha = 1;
}

// Inspect mode: legacy wiring links (a feed block powering distant cells) drawn as dotted lines of redstone.
function drawLinks(env) {
  const v = env.view;
  const w = env.world;
  for (const L of w.floor || []) {
    const fed = (w.strong && w.strong.get(RS.K(...L.feed))) > 0;
    const tint = fed ? '#ff3a1c' : '#8a3a30';
    const a = v.pt(L.feed[0] + 0.5, L.feed[1] + 1, L.feed[2] + 0.5);
    for (const c of L.cells) {
      const q = v.pt(c[0] + 0.5, c[1] + 1, c[2] + 0.5);
      const len = Math.hypot(q.x - a.x, q.y - a.y);
      const n = Math.max(2, Math.round(len / Math.max(6, v.B / 2)));
      const s = Math.max(3, Math.round(v.B / 6));
      const img = variant('rs/link_dot', 0, 0, tint, 1, 0);
      v.ctx.globalAlpha = fed ? 0.95 : 0.45;
      for (let i = 0; i <= n; i++) {
        const x = a.x + ((q.x - a.x) * i) / n;
        const y = a.y + ((q.y - a.y) * i) / n;
        blit(v, img, 0, 0, img.width, img.height, x - s / 2, y - s / 2, s, s);
      }
    }
  }
  v.ctx.globalAlpha = 1;
}

function drawDigits(env, b, n, off) {
  const v = env.view;
  const s = Math.round(clamp(v.B * 0.55, 8, 20));
  const text = String(n);
  const p = v.pt(b.x + off[0] + 0.5, b.y + off[1] + 0.5, b.z + off[2] + 0.5);
  const total = text.length * s * 0.62;
  v.ctx.globalAlpha = 1;
  [...text].forEach((ch, i) => {
    const img = variant(`rs/digit_${ch}`, 0, 0, null, 1, 0);
    blit(v, img, 0, 0, img.width, img.height, p.x - total / 2 + i * s * 0.62 - s * 0.19, p.y - s / 2, s, s);
  });
}

// Trapdoor swing: 0 closed, 1 open, tweened over one tick when the target changes.
function swingOf(v, b, target, now, onMove) {
  if (reduce) return target;
  let h = v.swings.get(b);
  if (!h) {
    h = { from: target, target, at: now };
    v.swings.set(b, h);
  }
  const value = h.from + (h.target - h.from) * clamp((now - h.at) / TICK, 0, 1);
  if (h.target !== target) {
    h.from = value;
    h.target = target;
    h.at = now;
  }
  const u = h.from + (h.target - h.from) * clamp((now - h.at) / TICK, 0, 1);
  if (Math.abs(u - target) > 0.001) {
    onMove();
    return u;
  }
  return target;
}

function drawEntity(env, en, pos) {
  const [X, Y, Z] = pos;
  const v = env.view;
  const [, , , y1] = v.box;
  let bob = 0;
  if (en.stasis || (en.visible === false && en.projectile)) {
    bob = Math.sin(env.now / 1000 * 2.4 + (en.item || 0)) * 0.05;
    env.animate(50);
  }
  const scale = 1 + Math.max(0, Y - (y1 + 1)) * 0.5;
  const tex = en.texture || (en.kind === 'pearl' ? 'item/ender_pearl' : `item/${en.id || 'redstone'}`);
  drawSprite(env, tex, X, Y, Z + bob, 0.5 * scale);
}

function emit(v, kind, x, y, z, o = {}) {
  const tex = { note: 'particle/note', bubble: 'particle/bubble', redstone: 'particle/generic_0' }[kind] || kind;
  v.particles.push(Object.assign({ tex, x, y, z, vx: 0, vy: 0, vz: 0.8, size: 0.4, life: 700, born: performance.now(), tint: kind === 'redstone' ? dustColor(15) : undefined }, o));
  v.wakeAt = 0;
}

/* =====================================================================================================
   Workbench helpers (legacy API, kept for pages/catalogue-app.js)
   ===================================================================================================== */

// The old between-dimensions background: a dirt tile.
function dirtTexture() {
  return TX.get('block/dirt').toDataURL();
}

function hitAt(v, x, y, z, label, fn, extra) {
  const q = v.plane(x, y, z);
  const h = document.createElement('button');
  h.className = 'hit';
  h.type = 'button';
  Object.assign(h.style, { left: q.x + 'px', top: (q.y - v.B * 0.55) + 'px', width: v.B + 'px', height: (v.T + v.B * 0.55) + 'px' });
  h.setAttribute('aria-label', label);
  h.addEventListener('click', fn);
  if (extra) extra(h);
  v.stage.appendChild(h);
  return h;
}

function addWalker(v, s) {
  const wk = { v, s, y: null };
  walkers.push(wk);
  return wk;
}

function stepWalkers() {
  for (const wk of walkers) {
    const { v, s } = wk;
    if (!v.stage.isConnected) continue;
    const r = v.stage.getBoundingClientRect();
    const ref = r.top + Math.min(r.height * 0.2, 160);   // footsteps get closer as the section rises into view
    const n = Math.max(1, Math.min(30, Math.round((ref - innerHeight * 0.78) / (v.B * 1.1))));
    const ty = s.y + n;
    if (wk.y === null) {
      wk.y = ty;
      continue;
    }
    if (ty === wk.y) continue;
    const dir = Math.sign(ty - wk.y);
    let k = 0;
    while (wk.y !== ty && k++ < 4) {
      wk.y += dir;
      v.world.vibrate(s.x + 1, wk.y, 0, 'step');
    }
    wk.y = ty;
    v.walker = { x: s.x + 1, y: wk.y, at: performance.now() };
  }
}

function pressButton(w, b) {
  if (b.on) return;
  b.on = true;
  w.vibrate(b.x, b.y, b.z, 'button');
  w.at(w.t + 10, () => { b.on = false; });
}

function sculkHits(v, s, b, what) {
  hitAt(v, s.x, s.y, 0, `Sculk sensor for ${what}: tap to make a noise next to it`, () => {
    v.world.vibrate(s.x + 1, s.y + 1, 0, 'tap');
    v.walker = { x: s.x + 1, y: s.y + 1, at: performance.now() };
  });
  hitAt(v, b.x, b.y, 0, `Reset button for the ${what} latch`, () => pressButton(v.world, b));
}

function layer(stage, l, t, w, h, cls, html) {
  const d = document.createElement('div');
  d.className = cls;
  Object.assign(d.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px' });
  d.innerHTML = html;
  stage.appendChild(d);
  return d;
}

function tag(stage, l, t, text) {
  const s = document.createElement('span');
  s.className = 'tag';
  s.style.left = l + 'px';
  s.style.top = t + 'px';
  s.textContent = text;
  stage.appendChild(s);
}

// Page palette for the legacy ground block.
function readPal() {
  pal = { floor: cssVar('--floor'), line: cssVar('--floor-line'), cavity: cssVar('--cavity') };
  TX.refresh('rs/ground_*');
}

// Default block size for views that do not choose one (the workbench sets this from the page width).
function setScale(b) {
  B = b;
  window.__T = Math.round(b * 0.72);
  const r = document.documentElement;
  r.style.setProperty('--b', B + 'px');
  r.style.setProperty('--t', window.__T + 'px');
}

function removeView(v) {
  const i = views.indexOf(v);
  if (i >= 0) views.splice(i, 1);
  const j = walkers.findIndex(k => k.v === v);
  if (j >= 0) walkers.splice(j, 1);
}

function tick(filter) {
  lastTick = performance.now();
  for (const v of views) {
    if (filter && !filter(v)) continue;
    v.world.tick();
    if (v.onTick) v.onTick();
    v.draw(lastTick);
  }
}

function startLoop(filter) {
  setInterval(() => tick(filter), TICK);
  const frame = now => {
    for (const v of views) if (v.anim && (!filter || filter(v))) v.draw(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function markTick() {
  lastTick = performance.now();
}

window.RSR = {
  dirtTexture, markTick, makeView, removeView, hitAt, layer, tag, views, walkers, setScale, readPal,
  startLoop, tick, pressButton, addWalker, stepWalkers, sculkHits, defineModel, emit, dustColor,
  models,
  geom: { attBox, dirBox, rotY, orientedFaces, edgeSlab },
  get textures() { return TX; },
  get B() { return B; },
  get T() { return window.__T; },
};
Redstone.render = window.RSR;
})();
