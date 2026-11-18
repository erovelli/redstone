// Redstone UI texture atlas: original 16x16 pixel art filed under vanilla texture names.
//
//   Redstone.textures.define(name, paint, { frames, frametime })   paint(ctx16, px, frame) draws one 16x16 frame
//   Redstone.textures.get(name, frame)    -> canvas (unknown names give the magenta-and-black missing texture)
//   Redstone.textures.usePack(baseUrl)    -> Promise; loads <baseUrl>/assets/minecraft/textures/<name>.png over the defaults
//
// Every texture is drawn here, by code, as original art. Names follow the vanilla resource pack layout so that an
// author who owns a resource pack can point the library at it. Textures that vanilla keeps in entity sheets with a
// different layout (chest, bell, book) use the `rs/` prefix instead, so a pack never replaces them with a
// mismatched sheet. Light comes from the top left: highlights on top and left edges, shadows bottom and right.
(() => {
'use strict';

const Redstone = window.Redstone = window.Redstone || {};
const SIZE = 16;

const defs = new Map();     // name -> { paint, frames, frametime }
const painted = new Map();  // name -> [canvas per frame], drawn from defs
const packed = new Map();   // name -> { frames: [canvas], frametime } loaded from a resource pack
const listeners = new Set();
let version = 0;
let missingCanvas = null;

/* ---------- colour helpers ---------- */

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// Multiply a colour's brightness by k (k > 1 lightens, toward white once a channel saturates).
function shade(hex, k) {
  return rgbToHex(hexToRgb(hex).map(v => v * k));
}

function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic random numbers, so a texture looks the same on every load.
function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- the px drawing kit handed to every painter ---------- */

function makePx(ctx, name, frame) {
  const random = rng(hashString(name) + frame * 7919);
  const px = {
    ctx,
    random,
    shade,
    mix,
    pick(list) {
      return list[Math.floor(random() * list.length)];
    },
    rect(x, y, w, h, color) {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    },
    dot(x, y, color) {
      px.rect(x, y, 1, 1, color);
    },
    fill(color) {
      px.rect(0, 0, SIZE, SIZE, color);
    },
    // Fill every pixel of a rectangle with a colour picked at random from the list.
    noise(list, x = 0, y = 0, w = SIZE, h = SIZE) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) px.dot(i, j, px.pick(list));
      }
    },
    // Scatter n single pixels (or short runs of length len) of a colour.
    speckle(color, n, len = 1, x = 0, y = 0, w = SIZE, h = SIZE) {
      for (let k = 0; k < n; k++) {
        const i = x + Math.floor(random() * w);
        const j = y + Math.floor(random() * h);
        px.rect(i, j, Math.min(len, x + w - i), 1, color);
      }
    },
    // A 1px bevel: light on the top and left edges, dark on the bottom and right.
    bevel(light, dark, x = 0, y = 0, w = SIZE, h = SIZE) {
      px.rect(x, y, w, 1, light);
      px.rect(x, y, 1, h, light);
      px.rect(x, y + h - 1, w, 1, dark);
      px.rect(x + w - 1, y, 1, h, dark);
    },
    border(color, x = 0, y = 0, w = SIZE, h = SIZE) {
      px.bevel(color, color, x, y, w, h);
    },
    // Draw a character map: one string per row, one character per pixel, '.' or ' ' is transparent.
    map(rows, palette, ox = 0, oy = 0) {
      rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
          const color = palette[row[i]];
          if (color) px.dot(ox + i, oy + j, color);
        }
      });
    },
    // Run fn(x, y) for every pixel and draw the colour it returns (if any).
    each(fn) {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const color = fn(x, y);
          if (color) px.dot(x, y, color);
        }
      }
    },
    // Copy another texture into this one (for variants built on a base).
    use(other, frame = 0) {
      ctx.drawImage(paintedFrames(other)[frame] || missing(), 0, 0);
    },
  };
  return px;
}

/* ---------- registry ---------- */

function newCanvas(w = SIZE, h = SIZE) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function missing() {
  if (missingCanvas) return missingCanvas;
  missingCanvas = newCanvas();
  const ctx = missingCanvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#f800f8';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillRect(8, 8, 8, 8);
  return missingCanvas;
}

function paintedFrames(name) {
  let frames = painted.get(name);
  if (frames) return frames;
  const def = defs.get(name);
  if (!def) return null;
  frames = [];
  for (let f = 0; f < def.frames; f++) {
    const c = newCanvas();
    const ctx = c.getContext('2d');
    def.paint(ctx, makePx(ctx, name, f), f);
    frames.push(c);
  }
  painted.set(name, frames);
  return frames;
}

function notify() {
  version++;
  for (const fn of listeners) {
    try { fn(version); } catch (e) { /* a listener's failure must not stop the others */ }
  }
}

function define(name, paint, opt = {}) {
  defs.set(name, { paint, frames: opt.frames || 1, frametime: opt.frametime || 1 });
  painted.delete(name);
  notify();
}

function get(name, frame = 0) {
  const pack = packed.get(name);
  const frames = pack ? pack.frames : paintedFrames(name);
  if (!frames || !frames.length) return missing();
  return frames[((frame % frames.length) + frames.length) % frames.length];
}

function frameCount(name) {
  const pack = packed.get(name);
  if (pack) return pack.frames.length;
  const def = defs.get(name);
  return def ? def.frames : 1;
}

// Vanilla animation timing: frametime is in game ticks (50 ms).
function frameAt(name, ms) {
  const pack = packed.get(name);
  const def = defs.get(name);
  const n = frameCount(name);
  if (n < 2) return 0;
  const ft = (pack && pack.frametime) || (def && def.frametime) || 1;
  return Math.floor(ms / (ft * 50)) % n;
}

// Ms until the frame shown at `ms` changes (Infinity for still textures).
function nextFrameIn(name, ms) {
  const n = frameCount(name);
  if (n < 2) return Infinity;
  const pack = packed.get(name);
  const def = defs.get(name);
  const step = ((pack && pack.frametime) || (def && def.frametime) || 1) * 50;
  return step - (ms % step);
}

function refresh(prefix) {
  for (const name of [...painted.keys()]) {
    if (name === prefix || (prefix.endsWith('*') && name.startsWith(prefix.slice(0, -1)))) painted.delete(name);
  }
  notify();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('not found: ' + url));
    img.src = url;
  });
}

// Load a resource pack's PNGs over the defaults. A vertical strip (height a multiple of the width) is an animation.
// Textures the pack does not have keep their default art. Resolves with the names that loaded.
async function usePack(baseUrl) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const names = [...defs.keys()].filter(n => !n.startsWith('rs/'));
  const loaded = [];
  await Promise.all(names.map(async name => {
    const url = `${base}/assets/minecraft/textures/${name}.png`;
    let img;
    try {
      img = await loadImage(url);
    } catch (e) {
      return;
    }
    const w = img.naturalWidth;
    const n = Math.max(1, Math.floor(img.naturalHeight / w));
    const frames = [];
    for (let f = 0; f < n; f++) {
      const c = newCanvas(w, w);
      c.getContext('2d').drawImage(img, 0, f * w, w, w, 0, 0, w, w);
      frames.push(c);
    }
    let frametime = 1;
    if (n > 1) {
      try {
        const meta = await (await fetch(url + '.mcmeta')).json();
        frametime = (meta.animation && meta.animation.frametime) || 1;
      } catch (e) {
        frametime = 1;
      }
    }
    packed.set(name, { frames, frametime });
    loaded.push(name);
  }));
  notify();
  return loaded.sort();
}

function clearPack() {
  packed.clear();
  notify();
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const DYES = {
  white: ['#e9ecec', '#cfd5d6'], orange: ['#f07613', '#e06101'], magenta: ['#bd44b3', '#a9309f'],
  light_blue: ['#3aafd9', '#2489c7'], yellow: ['#f8c627', '#f1af15'], lime: ['#70b919', '#5ea918'],
  pink: ['#ed8dac', '#d5658e'], gray: ['#3e4447', '#373a3e'], light_gray: ['#8e8e86', '#7d7d73'],
  cyan: ['#158991', '#157788'], purple: ['#792aac', '#64209c'], blue: ['#35399d', '#2d2f8f'],
  brown: ['#724728', '#603c20'], green: ['#546d1b', '#495b24'], red: ['#a12722', '#8e2121'],
  black: ['#141519', '#080a0f'],
};

Redstone.textures = {
  SIZE,
  define,
  get,
  has: name => defs.has(name) || packed.has(name),
  frames: frameCount,
  frameAt,
  nextFrameIn,
  refresh,
  usePack,
  clearPack,
  onChange,
  missing,
  shade,
  mix,
  DYES,
  get version() { return version; },
  get names() { return [...defs.keys()].sort(); },
  list() { return [...defs.keys()].sort(); },
};

/* =====================================================================================================
   The default art. One palette, light from the top left.
   ===================================================================================================== */

const T = (name, paint, opt) => {
  defs.set(name, { paint, frames: (opt && opt.frames) || 1, frametime: (opt && opt.frametime) || 1 });
};

const STONE = ['#7a7a7a', '#7f7f7f', '#7f7f7f', '#858585', '#7c7c7c'];
const OAK = { seam: '#5e4526', dark: '#866737', base: '#a5834d', light: '#b8945b', hi: '#c6a36b' };
const DARKWOOD = { seam: '#331f14', dark: '#553524', base: '#68432e', light: '#7a5139', hi: '#8e6245' };

/* ---------- stone family ---------- */

function paintStone(px) {
  px.noise(STONE);
  px.speckle('#6c6c6c', 9, 3);
  px.speckle('#737373', 8, 2);
  px.speckle('#919191', 7, 2);
}

T('block/stone', (ctx, px) => paintStone(px));

const COBBLE_MAP = [
  'bbaddeeddabccdda',
  'addeffeddbaddeda',
  'adeeedddcbadeedb',
  'bddddccbaadeeedc',
  'abcccbbaacdddcca',
  'aabbaaacdeedccba',
  'cddabcdeeeddcbaa',
  'ddeeacdeddcccbab',
  'deeedaccccbbaacd',
  'ddddcaabbbaacdee',
  'accccbaaacddeeed',
  'abbbbaacdeeddddc',
  'cdbaacdeeddcccba',
  'deeacdeedcbbbaab',
  'ddeaccdccbaaacdd',
  'ccbaabbbaaacddde',
];
const COBBLE_PAL = { a: '#4a4a4a', b: '#5d5d5d', c: '#6f6f6f', d: '#838383', e: '#979797', f: '#ababab' };
T('block/cobblestone', (ctx, px) => px.map(COBBLE_MAP, COBBLE_PAL));

// Two courses of 16x8 bricks in running bond: a full-width brick on top, two half bricks below.
function paintBricks(px, base, mortar, light, dark) {
  px.noise(base);
  const course = (y, joints) => {
    px.rect(0, y + 7, 16, 1, mortar);
    px.rect(0, y, 16, 1, light);
    px.rect(0, y + 6, 16, 1, dark);
    for (const x of joints) {
      px.rect(x, y, 1, 8, mortar);
      px.rect(x + 1, y, 1, 7, light);
      px.rect(x - 1, y + 1, 1, 6, dark);
    }
  };
  course(0, [15]);
  course(8, [7]);
  px.rect(0, 0, 1, 7, light);
}

T('block/stone_bricks', (ctx, px) => {
  paintBricks(px, ['#7b7b7b', '#7f7f7f', '#848484', '#7d7d7d'], '#565656', '#939393', '#6b6b6b');
  px.speckle('#727272', 6, 2);
});

T('block/deepslate_bricks', (ctx, px) => {
  paintBricks(px, ['#46464e', '#4b4b53', '#50505a'], '#2c2c32', '#5e5e68', '#3a3a41');
});

T('block/smooth_stone', (ctx, px) => {
  px.noise(['#a2a2a2', '#a5a5a5', '#a8a8a8']);
  px.border('#8e8e8e');
  px.rect(1, 1, 14, 1, '#b2b2b2');
});

T('block/smooth_stone_slab_side', (ctx, px) => {
  px.noise(['#a2a2a2', '#a5a5a5', '#a8a8a8']);
  px.border('#8e8e8e', 0, 0, 16, 8);
  px.border('#8e8e8e', 0, 8, 16, 8);
  px.rect(1, 1, 14, 1, '#b2b2b2');
  px.rect(1, 9, 14, 1, '#b2b2b2');
});

T('block/bedrock', (ctx, px) => {
  px.noise(['#3b3b3b', '#565656', '#2a2a2a', '#6f6f6f', '#454545']);
});

T('block/obsidian', (ctx, px) => {
  px.noise(['#0f0b18', '#140f20', '#18122a', '#120e1c']);
  px.speckle('#2c2145', 10, 2);
  px.speckle('#3b2a5c', 7, 1);
  px.speckle('#563f86', 4, 1);
  px.dot(4, 3, '#7a64b0');
  px.dot(11, 10, '#6b55a3');
});

T('block/iron_block', (ctx, px) => {
  px.noise(['#d8d8d8', '#dcdcdc', '#e0e0e0']);
  px.bevel('#f2f2f2', '#a9a9a9');
  px.rect(1, 7, 14, 1, '#c4c4c4');
  px.rect(1, 8, 14, 1, '#ececec');
  px.speckle('#cfcfcf', 6, 3, 1, 1, 14, 14);
});

T('block/quartz_block_side', (ctx, px) => {
  px.noise(['#ebe5de', '#e8e2da', '#eee9e2']);
  px.speckle('#ddd5cb', 6, 2);
});

T('block/quartz_block_top', (ctx, px) => {
  px.noise(['#ebe5de', '#e8e2da', '#eee9e2']);
  px.bevel('#f7f3ee', '#d6cdc2');
});

T('block/dirt', (ctx, px) => {
  px.noise(['#866043', '#866043', '#7a573c', '#8f6849']);
  px.speckle('#593d29', 10);
  px.speckle('#b9855c', 6);
  px.speckle('#6c4a30', 8, 2);
});

T('block/soul_sand', (ctx, px) => {
  px.noise(['#51402f', '#4c3b2b', '#574533']);
  // Faces of lost souls: two eyes and a mouth, pressed into the sand.
  for (const [x, y] of [[1, 1], [9, 2], [3, 9], [11, 10]]) {
    px.rect(x, y, 4, 4, '#3d2e21');
    px.dot(x, y + 1, '#2a1f16');
    px.dot(x + 2, y + 1, '#2a1f16');
    px.rect(x, y + 3, 3, 1, '#2a1f16');
    px.rect(x + 3, y, 1, 4, '#5f4c39');
  }
  px.speckle('#655140', 6);
});

T('block/magma', (ctx, px, f) => {
  px.noise(['#5a1c0c', '#4a170a', '#651f0d']);
  const glow = ['#ff9b2e', '#ffb648', '#ff8a24'][f % 3];
  const crack = ['#d9541a', '#e3601c', '#cf4c16'][f % 3];
  const CRACKS = [[0, 3, 6], [5, 7, 7], [9, 2, 6], [2, 12, 9], [11, 13, 5]];
  for (const [x, y, w] of CRACKS) {
    px.rect(x, y, w, 1, crack);
    px.rect(x + 1, y, Math.max(1, w - 3), 1, glow);
  }
  px.rect(4, 4, 1, 3, crack);
  px.rect(12, 8, 1, 5, crack);
}, { frames: 3, frametime: 8 });

/* ---------- wood ---------- */

function paintPlanks(px, wood) {
  px.noise([wood.base, wood.base, wood.light, wood.dark]);
  const joints = [11, 3, 13, 6];
  for (let k = 0; k < 4; k++) {
    const y = k * 4;
    px.rect(0, y, 16, 1, wood.light);
    px.rect(0, y + 3, 16, 1, wood.seam);
    px.rect(joints[k], y, 1, 3, wood.seam);
    px.rect(joints[k] + 1, y, 1, 3, wood.hi);
    // grain
    for (let g = 0; g < 2; g++) {
      const x = Math.floor(px.random() * 12);
      px.rect(x, y + 1 + g, 2 + Math.floor(px.random() * 4), 1, g ? wood.dark : wood.hi);
    }
  }
}

T('block/oak_planks', (ctx, px) => paintPlanks(px, OAK));

// A sign's board: pale, planed oak with faint grain and no plank seams, like vanilla's sign (which lives in an
// entity sheet, hence the rs/ name). Text sits on it, so it stays light and even: the ink keeps 4.5:1 or more.
// Any 16 x 8 band of it reads the same (wall, standing and hanging boards show different rows).
T('rs/oak_sign', (ctx, px) => {
  px.noise(['#d6b47e', '#d6b47e', '#dcbb86', '#cfad77']);
  for (let y = 0; y < 16; y++) {
    const x = Math.floor(px.random() * 12);
    px.rect(x, y, 3 + Math.floor(px.random() * 5), 1, y % 2 ? '#c9a671' : '#e2c48f');
  }
  px.speckle('#c2a06b', 6, 2);
});

T('block/oak_log', (ctx, px) => {
  px.noise(['#6b5230', '#5f4829', '#755a35']);
  for (let x = 1; x < 16; x += 3) px.rect(x, 0, 1, 16, '#4a3820');
  px.speckle('#3e2f1b', 8, 1);
  px.speckle('#82673e', 6, 1);
});

T('block/oak_log_top', (ctx, px) => {
  px.fill('#6b5230');
  px.border('#4a3820');
  const ring = (i, c) => px.border(c, i, i, 16 - 2 * i, 16 - 2 * i);
  ring(1, '#b08f5c');
  ring(2, '#a5834d');
  ring(3, '#b8955c');
  ring(4, '#9a7a48');
  ring(5, '#b08f5c');
  ring(6, '#a5834d');
  px.rect(7, 7, 2, 2, '#8a6b3c');
});

/* ---------- wool, concrete, glazed terracotta ---------- */

const GLAZE_MAP = [
  'aaaaabccddddcbbb',
  'abbbbbccddddcbaa',
  'abccccbccdddcbab',
  'abcddcbbccddcbab',
  'abcddccbbccccbab',
  'abcccdcccbbbbbab',
  'abbbcccddccbbaab',
  'bbcbbccdddcbaabb',
  'ccccbbccddcbabbc',
  'cdddcbbccccbabcc',
  'ddddccbbbbbabccd',
  'ddddddcbbaaabcdd',
  'cdddddcbaabbcddd',
  'ccdddcbaabccdddc',
  'bccccbaabccdddcb',
  'abbbbaabbccccbba',
];

for (const [color, [wool, concrete]] of Object.entries(DYES)) {
  T(`block/${color}_wool`, (ctx, px) => {
    // Tufts: a soft weave of light and dark curls.
    px.each((x, y) => {
      const r = px.random();
      const curl = ((x + 2 * y) % 5 === 0) ? 0.88 : ((2 * x + y) % 7 === 0 ? 1.08 : 1);
      return shade(wool, curl * (0.94 + r * 0.1));
    });
    px.speckle(shade(wool, 0.82), 6, 2);
  });
  T(`block/${color}_concrete`, (ctx, px) => {
    px.each(() => shade(concrete, 0.97 + px.random() * 0.06));
  });
  T(`block/${color}_glazed_terracotta`, (ctx, px) => {
    // An original swirl motif. It is not symmetric, so its rotation shows which way the block faces.
    px.map(GLAZE_MAP, {
      a: shade(wool, 0.55),
      b: wool,
      c: mix(wool, '#ffffff', 0.35),
      d: mix(wool, '#f4efe2', 0.72),
    });
  });
}

/* ---------- glass, slime, honey ---------- */

T('block/glass', (ctx, px) => {
  px.rect(1, 1, 14, 14, 'rgba(200,232,244,0.08)');
  px.border('#dcecf0');
  px.rect(0, 0, 1, 1, '#ffffff');
  px.rect(15, 15, 1, 1, '#a9c2c8');
  px.rect(15, 1, 1, 14, '#bcd2d7');
  px.rect(1, 15, 14, 1, '#bcd2d7');
  // diagonal glints
  for (let i = 0; i < 3; i++) px.dot(3 + i, 4 - i, 'rgba(255,255,255,0.85)');
  for (let i = 0; i < 2; i++) px.dot(4 + i, 5 - i, 'rgba(255,255,255,0.6)');
  for (let i = 0; i < 3; i++) px.dot(10 + i, 13 - i, 'rgba(255,255,255,0.55)');
});

T('block/slime_block', (ctx, px) => {
  px.rect(0, 0, 16, 16, 'rgba(118,190,96,0.7)');
  px.border('#93d97a');
  px.rect(15, 0, 1, 16, '#5c9e47');
  px.rect(0, 15, 16, 1, '#5c9e47');
  px.rect(1, 1, 3, 1, '#c6f5ad');
  px.rect(1, 1, 1, 3, '#c6f5ad');
  // inner cube (also used, opaque, for the slime core)
  px.rect(3, 3, 10, 10, '#5ea447');
  px.rect(3, 3, 10, 1, '#7cc263');
  px.rect(3, 3, 1, 10, '#7cc263');
  px.rect(3, 12, 10, 1, '#4a8838');
  px.rect(12, 3, 1, 10, '#4a8838');
  px.rect(5, 5, 2, 2, '#9ad981');
  px.dot(9, 9, '#4a8838');
});

T('block/honey_block_side', (ctx, px) => {
  px.rect(0, 0, 16, 16, 'rgba(246,170,40,0.75)');
  px.border('#ffcf5a');
  px.rect(15, 0, 1, 16, '#c77d0d');
  px.rect(0, 15, 16, 1, '#c77d0d');
  px.rect(3, 3, 10, 10, '#e5920f');
  px.rect(3, 3, 10, 1, '#f7b236');
  px.rect(3, 3, 1, 10, '#f7b236');
  px.rect(12, 3, 1, 10, '#c27a0a');
  px.rect(3, 12, 10, 1, '#c27a0a');
  // drips
  px.rect(5, 13, 1, 2, '#e5920f');
  px.rect(9, 13, 1, 1, '#e5920f');
  px.rect(1, 1, 3, 1, '#ffe39b');
});

T('block/honey_block_top', (ctx, px) => {
  px.rect(0, 0, 16, 16, 'rgba(246,170,40,0.75)');
  px.border('#ffcf5a');
  px.rect(3, 3, 10, 10, '#e5920f');
  px.rect(5, 5, 6, 6, '#f2a52a');
  px.rect(1, 1, 3, 1, '#ffe39b');
});

/* ---------- redstone blocks ---------- */

T('block/redstone_block', (ctx, px) => {
  px.noise(['#a8150b', '#a01409', '#b0180c']);
  // A grain of 4x4 crystal facets.
  for (let y = 0; y < 16; y += 4) {
    for (let x = (y / 4) % 2 ? 2 : 0; x < 16; x += 4) {
      px.rect(x, y, 2, 1, '#d8301a');
      px.dot(x, y + 1, '#d8301a');
      px.rect(x + 1, y + 2, 2, 1, '#6e0b05');
      px.dot(x + 2, y + 1, '#7c0f07');
    }
  }
  px.speckle('#ff5c3d', 6);
  px.bevel('#c9241a', '#5a0904');
});

const LAMP_MAP = [
  'aaaaaaaaaaaaaaaa',
  'abbbbbbaabbbbbba',
  'abcccdbaabdcccba',
  'abcdddbaabdddcba',
  'abcddcbaabcddcba',
  'abddccbaabccddba',
  'abbbbbbaabbbbbba',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'abbbbbbaabbbbbba',
  'abddccbaabccddba',
  'abcddcbaabcddcba',
  'abcdddbaabdddcba',
  'abcccdbaabdcccba',
  'abbbbbbaabbbbbba',
  'aaaaaaaaaaaaaaaa',
];
T('block/redstone_lamp', (ctx, px) => {
  px.map(LAMP_MAP, { a: '#3b2614', b: '#5e3f22', c: '#7a5530', d: '#946a3b' });
  px.dot(3, 3, '#a87d48');
  px.dot(12, 12, '#a87d48');
});
T('block/redstone_lamp_on', (ctx, px) => {
  px.map(LAMP_MAP, { a: '#8a4f12', b: '#e89a2c', c: '#f9c75a', d: '#fff1bf' });
  px.dot(4, 4, '#ffffff');
  px.dot(11, 11, '#ffffff');
});

// Copper bulb: a copper casing around a glass bulb. Lit: the bulb glows. Powered: a red dot in the middle.
function paintBulb(px, lit, powered) {
  px.noise(['#c06b48', '#b9653f', '#c87451']);
  px.bevel('#e08f6b', '#8a4430');
  px.border('#8a4430', 2, 2, 12, 12);
  px.rect(3, 3, 10, 10, lit ? '#f3b45a' : '#5a3f31');
  // grille
  for (const x of [5, 10]) px.rect(x, 3, 1, 10, lit ? '#d58a35' : '#6e4b3a');
  for (const y of [5, 10]) px.rect(3, y, 10, 1, lit ? '#d58a35' : '#6e4b3a');
  px.rect(6, 6, 4, 4, lit ? '#fff6d8' : '#7a5a46');
  px.rect(6, 6, 2, 1, lit ? '#ffffff' : '#93705a');
  if (powered) px.rect(7, 7, 2, 2, '#ff2e12');
  // rivets
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) px.dot(x, y, '#f3a582');
}
T('block/copper_bulb', (ctx, px) => paintBulb(px, false, false));
T('block/copper_bulb_lit', (ctx, px) => paintBulb(px, true, false));
T('block/copper_bulb_powered', (ctx, px) => paintBulb(px, false, true));
T('block/copper_bulb_lit_powered', (ctx, px) => paintBulb(px, true, true));

function paintTarget(px) {
  px.noise(['#e9dcc0', '#e3d4b5', '#ede2ca']);
  px.each((x, y) => {
    const r = Math.hypot(x - 7.5, y - 7.5);
    if (r > 5.6 && r < 7.4) return (x + y) % 3 ? '#c4321f' : '#a8281a';
    if (r > 2.2 && r < 3.9) return '#c4321f';
    if (r < 1.2) return '#d63a24';
    return null;
  });
}
T('block/target_side', (ctx, px) => paintTarget(px));
T('block/target_top', (ctx, px) => {
  paintTarget(px);
  px.speckle('#cdbd96', 8);
});

/* ---------- note block, jukebox, barrel, chest, bookshelf ---------- */

function paintDarkWood(px) {
  px.noise([DARKWOOD.base, DARKWOOD.base, DARKWOOD.light, DARKWOOD.dark]);
  px.speckle(DARKWOOD.hi, 7, 3);
  px.speckle(DARKWOOD.dark, 7, 4);
}

T('block/note_block', (ctx, px) => {
  paintDarkWood(px);
  // Planks with a darker frame; a small sound hole in the middle tells it from a jukebox.
  for (const y of [5, 10]) px.rect(1, y, 14, 1, DARKWOOD.seam);
  for (const [x, y] of [[9, 1], [4, 6], [11, 11]]) px.rect(x, y, 1, 4, DARKWOOD.dark);
  px.bevel(DARKWOOD.hi, DARKWOOD.seam);
  px.rect(7, 7, 2, 2, '#1d110a');
});

T('block/jukebox_side', (ctx, px) => {
  paintDarkWood(px);
  px.bevel(DARKWOOD.hi, DARKWOOD.seam);
  px.rect(1, 7, 14, 2, '#3a2416');
  px.rect(1, 7, 14, 1, '#2a1910');
  px.rect(1, 2, 14, 1, DARKWOOD.dark);
  px.rect(1, 13, 14, 1, DARKWOOD.dark);
});

T('block/jukebox_top', (ctx, px) => {
  paintDarkWood(px);
  px.bevel(DARKWOOD.hi, DARKWOOD.seam);
  px.border('#3a2416', 2, 2, 12, 12);
  px.rect(4, 7, 8, 2, '#0e0805');
  px.rect(4, 6, 8, 1, '#24160d');
});

T('block/barrel_side', (ctx, px) => {
  px.noise([OAK.dark, OAK.base, '#94733f']);
  for (let x = 0; x < 16; x += 4) {
    px.rect(x, 0, 1, 16, OAK.seam);
    px.rect(x + 1, 0, 1, 16, OAK.light);
  }
  for (const y of [2, 12]) {
    px.rect(0, y, 16, 2, '#3f3f43');
    px.rect(0, y, 16, 1, '#6a6a70');
  }
});

T('block/barrel_top', (ctx, px) => {
  px.noise([OAK.base, OAK.dark]);
  px.border('#4a3820');
  px.border(OAK.seam, 1, 1, 14, 14);
  for (const y of [4, 8, 12]) px.rect(2, y, 12, 1, OAK.seam);
  px.rect(2, 2, 12, 1, OAK.hi);
  px.rect(7, 6, 2, 2, '#3f3f43');
});

T('block/barrel_top_open', (ctx, px) => {
  px.noise([OAK.base, OAK.dark]);
  px.border('#4a3820');
  px.border(OAK.seam, 1, 1, 14, 14);
  px.rect(2, 2, 12, 12, '#1b130a');
  px.rect(2, 2, 12, 2, '#2b1f12');
});

T('block/barrel_bottom', (ctx, px) => {
  px.noise([OAK.base, OAK.dark]);
  px.border('#4a3820');
  for (const y of [4, 8, 12]) px.rect(1, y, 14, 1, OAK.seam);
});

// Vanilla keeps the chest in an entity sheet; this is a 16x16 face.
T('rs/chest_front', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel('#c6a36b', '#4a3820');
  px.rect(0, 5, 16, 1, '#4a3820');
  px.rect(7, 4, 2, 4, '#d8d8d8');
  px.rect(7, 7, 2, 1, '#8a8a8a');
});
T('rs/chest_side', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel('#c6a36b', '#4a3820');
  px.rect(0, 5, 16, 1, '#4a3820');
});
T('rs/chest_top', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel('#c6a36b', '#4a3820');
});

T('rs/crate', (ctx, px) => {
  px.fill('#54361e');
  px.rect(0, 0, 16, 2, '#bb8d50');
  px.rect(0, 2, 2, 14, '#a4783f');
  px.rect(14, 2, 2, 14, '#a4783f');
  px.rect(2, 14, 12, 2, '#8e612f');
  px.rect(2, 2, 12, 1, '#d3a46d');
  for (const y of [4, 12]) {
    px.rect(0, y, 2, 1, '#423329');
    px.rect(14, y, 2, 1, '#423329');
  }
});

T('block/chiseled_bookshelf_empty', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel(OAK.hi, OAK.seam);
  px.rect(0, 7, 16, 2, OAK.seam);
  px.rect(0, 7, 16, 1, '#4a3820');
  for (const y of [1, 9]) {
    for (const x of [1, 6, 11]) px.rect(x, y, 4, 6, '#2a1e12');
  }
});

T('block/chiseled_bookshelf_occupied', (ctx, px) => {
  px.use('block/chiseled_bookshelf_empty');
  const BOOKS = ['#9c2a2a', '#2f4f9c', '#3f7a2a', '#8a5a2a', '#6a2a8a', '#b08a2a'];
  let k = 0;
  for (const y of [1, 9]) {
    for (const x of [1, 6, 11]) {
      const c = BOOKS[k++];
      px.rect(x, y, 4, 6, c);
      px.rect(x, y, 4, 1, shade(c, 1.35));
      px.rect(x + 1, y + 1, 1, 5, shade(c, 0.7));
      px.rect(x + 3, y + 1, 1, 5, shade(c, 0.7));
      px.rect(x, y + 3, 4, 1, '#e8d9a8');
    }
  }
});

T('block/chiseled_bookshelf_side', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel(OAK.hi, OAK.seam);
});

T('block/chiseled_bookshelf_top', (ctx, px) => {
  paintPlanks(px, OAK);
  px.border(OAK.seam);
});

/* ---------- furnace, dispenser, dropper, hopper ---------- */

function paintMachineSide(px) {
  px.map(COBBLE_MAP, { a: '#525252', b: '#616161', c: '#6c6c6c', d: '#7a7a7a', e: '#878787', f: '#949494' });
  px.rect(0, 0, 16, 2, '#8c8c8c');
  px.rect(0, 0, 16, 1, '#a0a0a0');
  px.rect(0, 2, 16, 1, '#4f4f4f');
}

T('block/furnace_side', (ctx, px) => paintMachineSide(px));

T('block/furnace_top', (ctx, px) => {
  px.noise(['#8f8f8f', '#949494', '#8a8a8a']);
  px.bevel('#a8a8a8', '#6b6b6b');
  px.border('#7a7a7a', 2, 2, 12, 12);
});

function paintFurnaceFront(px, on) {
  paintMachineSide(px);
  px.rect(3, 8, 10, 6, '#1a1a1a');
  px.rect(3, 8, 10, 1, '#8a8a8a');
  px.rect(3, 13, 10, 1, '#3a3a3a');
  if (on) {
    px.rect(4, 10, 8, 3, '#d94d12');
    px.rect(5, 11, 6, 2, '#ffb02e');
    px.rect(7, 10, 2, 1, '#ffe28a');
  }
  for (const x of [5, 8, 11]) px.rect(x, 9, 1, 4, '#2b2b2b');
  px.rect(4, 4, 8, 2, '#3a3a3a');
  px.rect(4, 4, 8, 1, '#262626');
}
T('block/furnace_front', (ctx, px) => paintFurnaceFront(px, false));
T('block/furnace_front_on', (ctx, px) => paintFurnaceFront(px, true));

// The dispenser's mouth: a dark round opening with a lit rim. The dropper's is a smaller ring.
function paintMouth(px, dropper) {
  if (dropper) {
    px.rect(5, 5, 6, 6, '#3a3a3a');
    px.rect(6, 6, 4, 4, '#121212');
    px.rect(7, 7, 2, 2, '#3a3a3a');
    px.rect(5, 5, 6, 1, '#9a9a9a');
    px.rect(5, 5, 1, 6, '#8a8a8a');
  } else {
    px.map([
      '..aaaa..',
      '.abbbba.',
      'abcccccd',
      'abcccccd',
      'abcccccd',
      'abcccccd',
      '.dcccdd.',
      '..dddd..',
    ], { a: '#a3a3a3', b: '#2a2a2a', c: '#0d0d0d', d: '#3c3c3c' }, 4, 4);
  }
}
T('block/dispenser_front', (ctx, px) => {
  paintMachineSide(px);
  paintMouth(px, false);
});
T('block/dispenser_front_vertical', (ctx, px) => {
  px.use('block/furnace_top');
  paintMouth(px, false);
});
T('block/dropper_front', (ctx, px) => {
  paintMachineSide(px);
  paintMouth(px, true);
});
T('block/dropper_front_vertical', (ctx, px) => {
  px.use('block/furnace_top');
  paintMouth(px, true);
});

T('block/hopper_outside', (ctx, px) => {
  px.noise(['#3b3b3d', '#404043', '#37373a']);
  px.bevel('#5a5a5e', '#232325');
  px.rect(0, 4, 16, 1, '#2c2c2e');
  px.rect(0, 5, 16, 1, '#4d4d51');
});
T('block/hopper_top', (ctx, px) => {
  px.noise(['#3b3b3d', '#404043']);
  px.bevel('#5a5a5e', '#232325');
  px.rect(2, 2, 12, 12, '#1b1b1d');
  px.rect(2, 2, 12, 1, '#101011');
  px.rect(5, 5, 6, 6, '#2a2a2c');
});
T('block/hopper_inside', (ctx, px) => {
  px.noise(['#262628', '#2a2a2c']);
});

/* ---------- lectern, bell, signs ---------- */

T('block/lectern_base', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel(OAK.hi, OAK.seam);
});
T('block/lectern_front', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel(OAK.hi, OAK.seam);
  px.rect(4, 2, 8, 12, OAK.dark);
  px.border(OAK.seam, 4, 2, 8, 12);
  px.rect(6, 5, 4, 1, OAK.hi);
});
T('block/lectern_sides', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel(OAK.hi, OAK.seam);
  px.rect(2, 2, 12, 2, OAK.seam);
});
T('block/lectern_top', (ctx, px) => {
  paintPlanks(px, OAK);
  px.border(OAK.seam);
  px.rect(1, 13, 14, 2, OAK.seam);
});

T('rs/lectern_book', (ctx, px) => {
  // An open book seen from above: two pages and a red binding.
  px.rect(1, 3, 14, 10, '#7a2a1a');
  px.rect(2, 3, 6, 9, '#efe6cf');
  px.rect(8, 3, 6, 9, '#e6dbbf');
  px.rect(7, 3, 2, 10, '#5a1e12');
  for (const y of [5, 7, 9]) {
    px.rect(3, y, 4, 1, '#9a8f78');
    px.rect(9, y, 4, 1, '#9a8f78');
  }
});

T('block/bell_top', (ctx, px) => {
  px.noise(['#5b5b5b', '#636363']);
  px.bevel('#7a7a7a', '#3a3a3a');
});
T('block/bell_side', (ctx, px) => {
  px.noise(['#5b5b5b', '#636363']);
  px.bevel('#7a7a7a', '#3a3a3a');
  px.rect(0, 7, 16, 2, '#3f3f3f');
});
T('block/bell_bottom', (ctx, px) => {
  px.noise(['#4b4b4b', '#525252']);
});
T('rs/bell_body', (ctx, px) => {
  px.map([
    '................',
    '......aaaa......',
    '.....abbbbc.....',
    '....abbbbbcc....',
    '....abbbbbcc....',
    '....abbbbbcc....',
    '....abbbbbcc....',
    '...abbbbbbccc...',
    '...abbbbbbccc...',
    '..abbbbbbbcccc..',
    '..abbbbbbbcccc..',
    '.addddddddddddd.',
    '.aeeeeeeeeeeeed.',
    '..dddddddddddd..',
    '................',
    '................',
  ], { a: '#fff2a0', b: '#f2c933', c: '#c8951c', d: '#8a6412', e: '#b8861a' });
});

T('block/chain', (ctx, px) => {
  for (let y = 0; y < 16; y += 4) {
    px.rect(7, y, 2, 1, '#4a5060');
    px.rect(6, y + 1, 1, 2, '#3a3f4c');
    px.rect(9, y + 1, 1, 2, '#2a2e38');
    px.rect(7, y + 3, 2, 1, '#2a2e38');
    px.dot(7, y + 1, '#8a92a8');
  }
});

/* ---------- pistons and observers ---------- */

function paintPistonFace(px) {
  paintPlanks(px, OAK);
  px.border('#4a3820');
}

T('block/piston_top', (ctx, px) => paintPistonFace(px));

T('block/piston_top_sticky', (ctx, px) => {
  paintPistonFace(px);
  // A pad of slime with drips over the edge.
  px.rect(2, 2, 12, 12, '#6fb85a');
  px.rect(2, 2, 12, 1, '#a6e68e');
  px.rect(2, 2, 1, 12, '#8fd273');
  px.rect(2, 13, 12, 1, '#4a8838');
  px.rect(13, 2, 1, 12, '#4a8838');
  px.rect(4, 4, 3, 2, '#b8f095');
  px.rect(4, 14, 1, 1, '#4a8838');
  px.rect(10, 14, 1, 1, '#4a8838');
  px.rect(1, 6, 1, 2, '#4a8838');
});

// The texture's top edge is the piston's head end: four rows of wood, then the stone body.
T('block/piston_side', (ctx, px) => {
  px.map(COBBLE_MAP, { a: '#4c4c4c', b: '#5c5c5c', c: '#6a6a6a', d: '#7a7a7a', e: '#878787', f: '#949494' });
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 16; x++) px.dot(x, y, px.pick([OAK.base, OAK.light, OAK.base]));
  }
  px.rect(0, 0, 16, 1, OAK.hi);
  px.rect(0, 3, 16, 1, OAK.seam);
  px.rect(0, 4, 16, 1, '#2f2f2f');
  // iron bracket down the middle of the body
  px.rect(6, 5, 4, 10, '#5a5a5e');
  px.rect(6, 5, 1, 10, '#7c7c82');
  px.rect(9, 5, 1, 10, '#3e3e42');
  px.rect(7, 7, 2, 2, '#2a2a2c');
  px.bevel('#8c8c8c', '#3b3b3b', 0, 4, 16, 12);
});

T('block/piston_bottom', (ctx, px) => {
  px.map(COBBLE_MAP, { a: '#4c4c4c', b: '#5c5c5c', c: '#6a6a6a', d: '#7a7a7a', e: '#878787', f: '#949494' });
  px.bevel('#8c8c8c', '#3b3b3b');
  px.rect(4, 4, 8, 8, '#5a5a5e');
  px.bevel('#7c7c82', '#3e3e42', 4, 4, 8, 8);
  px.rect(6, 6, 4, 4, '#2a2a2c');
});

T('block/piston_inner', (ctx, px) => {
  px.map(COBBLE_MAP, { a: '#4c4c4c', b: '#5c5c5c', c: '#6a6a6a', d: '#7a7a7a', e: '#878787', f: '#949494' });
  px.bevel('#8c8c8c', '#3b3b3b');
  px.rect(4, 4, 8, 8, '#262628');
  px.rect(4, 4, 8, 1, '#161617');
  px.rect(6, 6, 4, 4, OAK.base);
  px.rect(6, 6, 4, 1, OAK.hi);
});

const OBS = ['#4a4a4c', '#505052', '#444446'];
T('block/observer_front', (ctx, px) => {
  px.noise(OBS);
  px.bevel('#626265', '#2e2e30');
  // two eyes and a frown: the watching face
  for (const x of [3, 9]) {
    px.rect(x, 4, 4, 4, '#141416');
    px.rect(x, 4, 4, 1, '#2a2a2c');
    px.rect(x + 1, 5, 2, 2, '#232326');
  }
  px.rect(4, 11, 8, 2, '#262628');
  px.rect(4, 11, 8, 1, '#141416');
  px.rect(2, 2, 12, 1, '#5a5a5d');
});

// The top edge of the side texture points the way the observer faces: a chevron of dark slats.
T('block/observer_side', (ctx, px) => {
  px.noise(['#6b6b6e', '#707073', '#66666a']);
  px.bevel('#828286', '#3e3e40');
  px.rect(0, 0, 16, 3, '#4a4a4c');
  px.rect(0, 3, 16, 1, '#2e2e30');
  for (let k = 0; k < 3; k++) {
    const y = 6 + k * 3;
    px.rect(2, y, 12, 1, '#3a3a3c');
    px.rect(2, y + 1, 12, 1, '#88888c');
  }
});

T('block/observer_top', (ctx, px) => {
  px.noise(['#6b6b6e', '#707073', '#66666a']);
  px.bevel('#828286', '#3e3e40');
  px.rect(0, 0, 16, 3, '#4a4a4c');
  // arrow toward the face
  px.rect(7, 4, 2, 9, '#3a3a3c');
  px.rect(5, 6, 6, 1, '#3a3a3c');
  px.rect(6, 5, 4, 1, '#3a3a3c');
});

function paintObserverBack(px, on) {
  px.noise(['#6b6b6e', '#707073', '#66666a']);
  px.bevel('#828286', '#3e3e40');
  px.border('#4a4a4c', 2, 2, 12, 12);
  px.rect(5, 5, 6, 6, '#2a2a2c');
  px.rect(6, 6, 4, 4, on ? '#ff3a1c' : '#4a100b');
  if (on) {
    px.rect(6, 6, 2, 1, '#ffb199');
    px.rect(7, 7, 2, 2, '#ff7a52');
  }
}
T('block/observer_back', (ctx, px) => paintObserverBack(px, false));
T('block/observer_back_on', (ctx, px) => paintObserverBack(px, true));

/* ---------- redstone wire, torch, repeater, comparator, lever ---------- */

// Dust textures are greyscale and tinted by signal strength when drawn, as in vanilla: a 4px trail with a brighter
// core and a few loose grains at its edges.
const DUST_EDGE = 'rgba(200,200,200,0.9)';
const DUST_GRAIN = 'rgba(210,210,210,0.75)';
T('block/redstone_dust_dot', (ctx, px) => {
  px.map([
    '.g..aaaa..g.',
    '...abbbba...',
    '..abbccbba..',
    '.abbccccbba.',
    '.abccccccba.',
    '.abccccccba.',
    '.abbccccbba.',
    '..abbccbba..',
    '...abbbba...',
    '.g..aaaa....',
  ], { a: DUST_EDGE, b: '#ffffff', c: '#ececec', g: DUST_GRAIN }, 2, 3);
});
T('block/redstone_dust_line0', (ctx, px) => {
  for (let y = 0; y < 16; y++) {
    px.rect(6, y, 4, 1, DUST_EDGE);
    px.rect(7, y, 2, 1, '#ffffff');
  }
  for (const [x, y] of [[5, 2], [10, 5], [5, 9], [10, 12], [5, 14]]) px.dot(x, y, DUST_GRAIN);
  for (const y of [3, 10]) px.dot(7, y, '#e2e2e2');
});
T('block/redstone_dust_line1', (ctx, px) => {
  for (let x = 0; x < 16; x++) {
    px.rect(x, 6, 1, 4, DUST_EDGE);
    px.rect(x, 7, 1, 2, '#ffffff');
  }
  for (const [x, y] of [[2, 10], [5, 5], [9, 10], [12, 5], [14, 10]]) px.dot(x, y, DUST_GRAIN);
  for (const x of [3, 10]) px.dot(x, 8, '#e2e2e2');
});
T('block/redstone_dust_overlay', () => {});

// Torches: a 2px stick (columns 7 and 8, rows 8 to 15) under a 2x2 head (rows 6 and 7), as vanilla lays them out.
function paintTorch(px, head) {
  px.rect(7, 8, 1, 8, '#7d5d30');
  px.rect(8, 8, 1, 8, '#5a4220');
  px.rect(7, 8, 1, 1, '#9a7a48');
  px.map(['ab', 'cd'], head, 7, 6);
}
T('block/redstone_torch', (ctx, px) => {
  paintTorch(px, { a: '#ffd2a0', b: '#ff6a3a', c: '#ff4a22', d: '#c81e0e' });
  for (const [x, y] of [[6, 5], [9, 6], [6, 8], [9, 4]]) px.dot(x, y, 'rgba(255,90,40,0.6)');
});
T('block/redstone_torch_off', (ctx, px) => {
  paintTorch(px, { a: '#8a3a2a', b: '#6a2216', c: '#5a1a12', d: '#3e120c' });
});

function paintSlabTop(px) {
  px.noise(['#a8a8aa', '#acacae', '#a4a4a6']);
  px.bevel('#c4c4c6', '#7c7c80');
}
// Output at the top of the texture (north when unrotated): the front torch is near the top edge.
T('block/repeater', (ctx, px) => {
  paintSlabTop(px);
  px.rect(7, 1, 2, 14, '#5a1e16');
  px.rect(6, 13, 4, 1, '#5a1e16');
  px.rect(6, 1, 4, 1, '#5a1e16');
});
T('block/repeater_on', (ctx, px) => {
  paintSlabTop(px);
  px.rect(7, 1, 2, 14, '#ff3b1f');
  px.rect(6, 13, 4, 1, '#d42a14');
  px.rect(6, 1, 4, 1, '#d42a14');
  px.rect(7, 1, 1, 14, '#ff7a52');
});
function paintComparatorTop(px, on) {
  paintSlabTop(px);
  const c = on ? '#ff3b1f' : '#5a1e16';
  px.rect(7, 2, 2, 9, c);
  px.rect(4, 10, 8, 2, c);
  px.rect(4, 12, 2, 2, c);
  px.rect(10, 12, 2, 2, c);
  if (on) px.rect(7, 2, 1, 9, '#ff7a52');
}
T('block/comparator', (ctx, px) => paintComparatorTop(px, false));
T('block/comparator_on', (ctx, px) => paintComparatorTop(px, true));

T('block/lever', (ctx, px) => {
  px.rect(7, 6, 1, 10, '#a5834d');
  px.rect(8, 6, 1, 10, '#6b5130');
  px.rect(7, 6, 2, 2, '#4a3418');
  px.dot(7, 6, '#7a5a30');
});

/* ---------- doors, trapdoors, daylight detector, sculk ---------- */

function paintIronPanel(px) {
  px.noise(['#d6d6d6', '#dadada', '#d2d2d2']);
  px.bevel('#f0f0f0', '#9a9a9a');
  px.border('#b8b8b8', 1, 1, 14, 14);
}
T('block/iron_door_top', (ctx, px) => {
  paintIronPanel(px);
  for (const x of [3, 9]) {
    px.rect(x, 3, 4, 6, '#5e6a70');
    px.rect(x, 3, 4, 1, '#3e464a');
    px.rect(x + 1, 4, 1, 3, '#8a9aa2');
  }
});
T('block/iron_door_bottom', (ctx, px) => {
  paintIronPanel(px);
  px.border('#a8a8a8', 3, 2, 10, 12);
  px.rect(4, 3, 8, 1, '#ececec');
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px.dot(x, y, '#8a8a8a');
  px.rect(12, 7, 2, 2, '#7a7a7a');
});
T('block/oak_door_top', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel(OAK.hi, OAK.seam);
  for (const x of [3, 9]) {
    px.rect(x, 3, 4, 6, '#3a2c18');
    px.rect(x + 1, 4, 2, 4, 'rgba(160,200,220,0.5)');
  }
});
T('block/oak_door_bottom', (ctx, px) => {
  paintPlanks(px, OAK);
  px.bevel(OAK.hi, OAK.seam);
  px.border(OAK.seam, 3, 2, 10, 12);
  px.rect(12, 7, 2, 2, '#3f3f43');
});
T('block/iron_trapdoor', (ctx, px) => {
  paintIronPanel(px);
  for (const [x, y] of [[3, 3], [9, 3], [3, 9], [9, 9]]) {
    px.rect(x, y, 4, 4, '#3a3f44');
    px.rect(x, y, 4, 1, '#22262a');
  }
});
T('block/oak_trapdoor', (ctx, px) => {
  px.noise([OAK.base, OAK.light, OAK.dark]);
  px.bevel(OAK.hi, OAK.seam);
  px.rect(0, 7, 16, 2, OAK.seam);
  px.rect(7, 0, 2, 16, OAK.seam);
  for (const [x, y] of [[2, 2], [10, 2], [2, 10], [10, 10]]) {
    px.rect(x, y, 4, 4, '#3a2a14');
    px.rect(x, y, 4, 1, '#22180b');
  }
});

function paintDaylight(px, inverted) {
  px.noise([OAK.base, OAK.dark]);
  px.border(OAK.seam);
  const glass = inverted ? ['#33456a', '#2c3c5e'] : ['#9ec6e4', '#b6d6ee'];
  for (let k = 0; k < 6; k++) {
    const x = 1 + (k % 3) * 5;
    const y = 1 + Math.floor(k / 3) * 7;
    px.rect(x, y, 4, 6, glass[k % 2]);
    px.rect(x, y, 4, 1, inverted ? '#4a5f8a' : '#e6f4ff');
  }
}
T('block/daylight_detector_top', (ctx, px) => paintDaylight(px, false));
T('block/daylight_detector_inverted_top', (ctx, px) => paintDaylight(px, true));
T('block/daylight_detector_side', (ctx, px) => {
  px.noise([OAK.base, OAK.dark]);
  px.rect(0, 10, 16, 1, OAK.hi);
  px.rect(0, 15, 16, 1, OAK.seam);
});

T('block/sculk_sensor_top', (ctx, px) => {
  px.noise(['#0d3036', '#0f363d', '#0b2a30']);
  px.bevel('#14474f', '#082024');
  for (const [x, y] of [[3, 3], [10, 4], [5, 10], [11, 11]]) {
    px.rect(x, y, 2, 2, '#1d7d84');
    px.dot(x, y, '#3ac6c9');
  }
});
T('block/sculk_sensor_side', (ctx, px) => {
  px.noise(['#0d3036', '#0f363d', '#0b2a30']);
  px.rect(0, 8, 16, 2, '#155e63');
  px.rect(0, 8, 16, 1, '#1f8a90');
  px.rect(0, 10, 16, 6, '#0a2226');
  for (const x of [3, 8, 12]) px.dot(x, 12, '#1b5a60');
});
T('block/sculk_sensor_bottom', (ctx, px) => {
  px.noise(['#0a2226', '#0c282c']);
});
function paintTendril(px, on) {
  const stem = on ? '#2aa6a8' : '#16585e';
  const tip = on ? '#c8fffd' : '#2a8a90';
  px.rect(4, 6, 1, 10, stem);
  px.rect(11, 6, 1, 10, stem);
  px.rect(3, 8, 1, 4, stem);
  px.rect(12, 8, 1, 4, stem);
  px.rect(4, 4, 1, 2, tip);
  px.rect(11, 4, 1, 2, tip);
  px.dot(4, 3, on ? '#ffffff' : '#1f8a90');
  px.dot(11, 3, on ? '#ffffff' : '#1f8a90');
}
T('block/sculk_sensor_tendril_inactive', (ctx, px) => paintTendril(px, false));
T('block/sculk_sensor_tendril_active', (ctx, px) => paintTendril(px, true));

/* ---------- water ---------- */

// Greyscale and tinted when drawn, as in vanilla. 16 frames of slow diagonal swell.
T('block/water_still', (ctx, px, f) => {
  const phase = (f / 16) * Math.PI * 2;
  px.each((x, y) => {
    const w = Math.sin(x * 0.55 + y * 0.35 + phase) + Math.sin(y * 0.8 - x * 0.2 - phase * 2) * 0.6;
    const v = w > 1.1 ? 236 : w > 0.3 ? 206 : w > -0.6 ? 186 : 172;
    return `rgba(${v},${v},${v},0.52)`;
  });
}, { frames: 16, frametime: 2 });

T('block/water_flow', (ctx, px, f) => {
  px.each((x, y) => {
    const w = Math.sin((y + f) * 0.9 + Math.sin(x * 0.7) * 1.2);
    const v = w > 0.6 ? 230 : w > -0.2 ? 196 : 176;
    return `rgba(${v},${v},${v},0.52)`;
  });
}, { frames: 16, frametime: 2 });

T('block/water_overlay', (ctx, px) => {
  px.fill('rgba(190,190,190,0.5)');
});

/* ---------- items, particles ---------- */

T('item/ender_pearl', (ctx, px) => {
  px.map([
    '................',
    '................',
    '.....aaaaaa.....',
    '....abbbbbba....',
    '...abhhccbbba...',
    '..abhhccccbbba..',
    '..abhccddccbba..',
    '..abccdeedcbba..',
    '..abccdeedcbba..',
    '..abbccddccbba..',
    '..abbbccccbbba..',
    '...abbbbbbbba...',
    '....abbbbbba....',
    '.....aaaaaa.....',
    '................',
    '................',
  ], { a: '#0a2a26', b: '#0d4f47', c: '#1f8f7d', d: '#2fc4a8', e: '#062420', h: '#b8fff0' });
});

T('item/redstone', (ctx, px) => {
  px.map([
    '................',
    '................',
    '................',
    '.......a........',
    '......aba.......',
    '.....abcba..a...',
    '....abcccba.ab..',
    '...abccdccba....',
    '..abccccccccba..',
    '..abbcccdcccba..',
    '...aabbbbbbaa...',
    '.....aaaaaa.....',
  ], { a: '#4a0804', b: '#8a1208', c: '#d42a14', d: '#ff7a52' }, 0, 2);
});

T('item/bucket', (ctx, px) => {
  px.map([
    '....aaaaaaaa....',
    '...a........a...',
    '...abbbbbbbba...',
    '...bccccccccb...',
    '...bcddddddcb...',
    '....bcccccdb....',
    '....bcccccdb....',
    '....bcccccdb....',
    '.....bccccb.....',
    '.....bbbbbb.....',
  ], { a: '#9a9a9a', b: '#4a4a4a', c: '#c8c8c8', d: '#e6e6e6' }, 0, 3);
});
T('item/water_bucket', (ctx, px) => {
  px.use('item/bucket');
  px.rect(4, 7, 8, 1, '#2f5fd0');
  px.rect(5, 7, 3, 1, '#7aa4ff');
});

// Particles are greyscale where vanilla tints them (note colour by pitch, redstone colour by power).
T('particle/note', (ctx, px) => {
  px.map([
    '.....aaaa.',
    '.....abba.',
    '.....ab...',
    '.....ab...',
    '.....ab...',
    '..aaaab...',
    '.abbbbb...',
    '.abbbba...',
    '..aaaa....',
  ], { a: 'rgba(0,0,0,0.55)', b: '#ffffff' }, 3, 3);
});
T('particle/bubble', (ctx, px) => {
  px.map([
    '..aaaa..',
    '.abbbba.',
    'abhb...a',
    'ab.....a',
    'ab.....a',
    'a......a',
    '.a....a.',
    '..aaaa..',
  ], { a: 'rgba(225,240,255,0.95)', b: 'rgba(255,255,255,0.55)', h: '#ffffff' }, 4, 4);
});
T('particle/generic_0', (ctx, px) => {
  px.rect(6, 6, 4, 4, '#ffffff');
  px.rect(7, 5, 2, 6, '#ffffff');
  px.rect(5, 7, 6, 2, '#ffffff');
});
T('particle/vibration', (ctx, px) => {
  px.map([
    '...a...',
    '..aba..',
    '.abcba.',
    'abcccba',
    '.abcba.',
    '..aba..',
    '...a...',
  ], { a: '#1f8a90', b: '#5ff3f0', c: '#e8fffe' }, 4, 4);
});

/* ---------- renderer helpers (rs/: not part of any resource pack) ---------- */

// A soft, stepped halo for light sources: drawn additively around lamps, torches and active sensors.
T('rs/glow', (ctx, px) => {
  px.each((x, y) => {
    const r = Math.hypot(x - 7.5, y - 7.5);
    if (r > 8) return null;
    const a = r < 3 ? 0.5 : r < 5 ? 0.32 : r < 6.5 ? 0.18 : 0.08;
    return `rgba(255,255,255,${a})`;
  });
});

// Contact shadow under buttons and plates.
T('rs/shadow', (ctx, px) => {
  px.fill('rgba(0,0,0,0.38)');
});

// Ghost outline for x-ray views: a 1px frame.
T('rs/outline', (ctx, px) => {
  px.border('rgba(255,255,255,0.9)');
});

// Wiring link dots (legacy power links, shown in inspect mode).
T('rs/link_dot', (ctx, px) => {
  px.rect(5, 5, 6, 6, 'rgba(0,0,0,0.5)');
  px.rect(6, 6, 4, 4, '#ffffff');
});

// The red core of a legacy station block while its link is powered.
T('rs/link_core', (ctx, px) => {
  px.rect(4, 4, 8, 8, '#ff3420');
  px.rect(6, 6, 4, 4, '#ffb199');
});

// The sculk bench's visitor: a small figure seen from the front.
T('rs/visitor', (ctx, px) => {
  px.map([
    '....aaaa....',
    '....abba....',
    '....aaaa....',
    '...cccccc...',
    '..dcccccccd.',
    '..dccccccd..',
    '...cccccc...',
    '...ee..ee...',
    '...ee..ee...',
    '...ff..ff...',
  ], { a: '#6b4a2e', b: '#e9c9a8', c: '#2b6f8a', d: '#e9c9a8', e: '#3b3b8a', f: '#38383e' }, 2, 3);
});

// A thin ring for footstep vibrations.
T('rs/ring', (ctx, px) => {
  px.each((x, y) => {
    const r = Math.hypot(x - 7.5, y - 7.5);
    return r > 6.2 && r < 7.6 ? '#ffffff' : null;
  });
});

// Digits for inspect mode: a 3x5 font, doubled, with a dark outline so it reads on any block.
const DIGITS = [
  ['###', '#.#', '#.#', '#.#', '###'], ['.#.', '##.', '.#.', '.#.', '###'], ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '###', '..#', '###'], ['#.#', '#.#', '###', '..#', '..#'], ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '###', '#.#', '###'], ['###', '..#', '.#.', '.#.', '.#.'], ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '###'],
];
DIGITS.forEach((glyph, n) => {
  T(`rs/digit_${n}`, (ctx, px) => {
    const ox = 5;
    const oy = 3;
    glyph.forEach((row, j) => {
      for (let i = 0; i < 3; i++) {
        if (row[i] === '#') px.rect(ox + i * 2 - 1, oy + j * 2 - 1, 4, 4, 'rgba(10,6,14,0.85)');
      }
    });
    glyph.forEach((row, j) => {
      for (let i = 0; i < 3; i++) {
        if (row[i] === '#') px.rect(ox + i * 2, oy + j * 2, 2, 2, '#ffffff');
      }
    });
  });
});

})();
