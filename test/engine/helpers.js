// Shared helpers for the engine suites (this file is not a suite: it does not end in .test.js).
const RS = require('../../src/engine.js');

// A strict world with a stone floor (or opts.floorType) at z = -1 over [x0..x1] x [y0..y1].
function world(opts = {}) {
  const w = new RS.World(Object.assign({ strict: true }, opts));
  if (opts.floor !== false) {
    const [x0, x1, y0, y1] = opts.floor || [-3, 20, -3, 6];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) w.put(x, y, -1, opts.floorType || 'stone');
  }
  return w;
}

function eq(actual, expected, what = 'value') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
  return true;
}
function ok(cond, what = 'condition') {
  if (!cond) throw new Error(`${what} failed`);
  return true;
}
function throws(fn, pattern, what = 'call') {
  try { fn(); } catch (e) {
    if (pattern && !pattern.test(String(e.message))) throw new Error(`${what}: threw "${e.message}", expected ${pattern}`);
    return true;
  }
  throw new Error(`${what}: did not throw`);
}
// Ticks until f() holds, counting the first tick as 1; -1 if it never does.
function first(w, f, max = 200) {
  for (let i = 1; i <= max; i++) { w.tick(); if (f()) return i; }
  return -1;
}
// The ticks (1-based) at which f() was true over n ticks.
function trace(w, f, n) {
  const on = [];
  for (let i = 1; i <= n; i++) { w.tick(); if (f()) on.push(i); }
  return on;
}
const T = (name, fn) => ({ name, fn: () => { fn(); return true; } });

module.exports = { RS, world, eq, ok, throws, first, trace, T };
