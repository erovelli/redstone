// Shared helpers for UI tests: load a component file in Node and get its spec, then drive it headlessly
// through the core's Controller (the same object the custom element wraps).
const path = require('path');
const C = require('../../src/index.js');
const ui = require('../../src/ui/core.js');

const specs = {};
// Component files call the global Redstone.ui.define(tag, spec); in Node we only capture the spec.
function loadComponent(name) {
  const file = path.join(__dirname, '..', '..', 'src', 'ui', 'components', name + '.js');
  const prev = global.Redstone;
  global.Redstone = { ui: { define: (tag, spec) => { specs[tag] = spec; } } };
  try {
    delete require.cache[require.resolve(file)];
    require(file);
  } finally {
    global.Redstone = prev;
  }
  return specs['rs-' + name];
}

// A controller built the way the element builds it, from a map of attributes.
function controller(spec, attrs = {}, ctx = {}) {
  const entry = typeof spec.entry === 'string' ? C.get(spec.entry) : spec.entry;
  const ctl = new ui.Controller(spec, entry);
  const text = ctx.text || '';
  const fullCtx = Object.assign({ el: null, B: 24, text, signsFor: (t, o) => ui.signsFor(t, o) }, ctx);
  const attr = n => (n in attrs ? attrs[n] : null);
  ctl.build(ui.paramsFor(entry, spec, attr, fullCtx));
  return ctl;
}

// Tick until some change appears; returns { ticks, changes } (or ticks -1).
function untilChange(ctl, max = 40) {
  for (let i = 1; i <= max; i++) {
    const changes = ctl.tick();
    if (changes.length) return { ticks: i, changes };
  }
  return { ticks: -1, changes: [] };
}

module.exports = { ui, C, loadComponent, controller, untilChange };
