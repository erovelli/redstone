// <rs-slider>: a range input. The player puts books and quills into a barrel or takes them out; a comparator reads
// the fill and lights that many lamps. `value` is the comparator's level mapped onto min / max / step.
//
//   <rs-slider name="volume" min="0" max="15" value="7">Volume</rs-slider>
//
// Arrow keys, PageUp / PageDown and Home / End move items until the comparator reads the next level; pressing or
// dragging along the bar aims for the lamp under the pointer. `input` fires as the comparator changes, `change`
// when the move is committed (each key, or the pointer's release).
(function () {
const level = io => io.comparator.out || 0;
const to = target => (hand, io, built) => built.moveTo(hand, target(level(io), built.scale.lamps));
const page = n => Math.max(2, Math.round(n / 5));
const scaleOf = el => (el.contraption ? el.contraption.built.scale : null);

// The lamp under the pointer: the number of lamps whose left edge is at or left of it (0 over the barrel).
function levelAt(el, view, built, ev) {
  const stage = el.shadowRoot.querySelector('.stage').getBoundingClientRect();
  const x = ev.clientX - stage.left;
  return built.io.lamps.filter(l => x >= view.rectOf(l, 'front').x).length;
}

// Pressing on the bar aims for that lamp, and dragging keeps aiming; each move is the hand's work, settled at once.
// While the pointer is down `committed` holds the value the drag started from, so `change` waits for the release.
function mounted(el, view, built) {
  const btn = el.shadowRoot.querySelector('.hit[role="slider"]');
  if (!btn) return;
  const aim = ev => el.perform((hand, io, b) => {
    if (!b.drag) b.drag = { from: b.scale.text(level(io)) };
    return b.moveTo(hand, levelAt(el, view, b, ev));
  }, { event: ev, settle: true });
  const release = ev => el.perform((hand, io, b) => { b.drag = null; return false; }, { event: ev, settle: true });
  btn.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    btn.setPointerCapture(ev.pointerId);
    aim(ev);
  });
  btn.addEventListener('pointermove', ev => { if (built.drag) aim(ev); });
  btn.addEventListener('pointerup', ev => { if (built.drag) release(ev); });
  btn.addEventListener('pointercancel', ev => { if (built.drag) release(ev); });
}

const Ctor = Redstone.ui.define('rs-slider', {
  entry: 'ui-slider',

  params: {
    min: { attr: 'min', type: 'number', doc: 'The lowest value (default 0).' },
    max: { attr: 'max', type: 'number', doc: 'The highest value (default 15).' },
    step: { attr: 'step', type: 'string', doc: 'The step (default 1), or "any". Up to 16 values get one lamp per step; a wider range snaps to 16 evenly spaced values.' },
    value: { attr: 'value', type: 'string', doc: 'Read when the slider is built (default: the middle); after that the attribute mirrors the comparator.' },
  },

  label: 'beside',
  styles: ':host { --rs-block: 16px; flex-wrap: wrap; } .hit[role="slider"] { touch-action: none; }',

  controls: [{
    io: 'barrel',
    act: () => false,                     // Space and Enter do nothing on a slider
    role: 'slider',
    area: ['bar'],
    keys: {
      ArrowRight: to(l => l + 1), ArrowUp: to(l => l + 1),
      ArrowLeft: to(l => l - 1), ArrowDown: to(l => l - 1),
      PageUp: to((l, n) => l + page(n)), PageDown: to((l, n) => l - page(n)),
      Home: to(() => 0), End: to((l, n) => n),
    },
    aria: {
      valuenow: 'value',
      valuetext: 'value',
      valuemin: (state, el) => (scaleOf(el) ? scaleOf(el).valueAt(0) : 0),
      valuemax: (state, el) => (scaleOf(el) ? scaleOf(el).valueAt(scaleOf(el).lamps) : 15),
    },
  }],

  state: {
    value: {
      read: (io, built) => built.scale.text(level(io)),
      attr: 'value',
      event: 'input',
      set: (hand, io, value, built) => built.moveTo(hand, built.scale.levelOf(value)),
      doc: 'The comparator\'s level as a value (a string, as on a native range). Setting it moves items until the comparator reads the nearest level.',
    },
    committed: {
      read: (io, built) => (built.drag ? built.drag.from : built.scale.text(level(io))),
      event: 'change',
      announce: (v, el) => `${el.label} ${v}`,
      doc: 'The value as of the last commit: during a drag it keeps the value the drag started from.',
      eventDoc: 'After a key, or when the pointer is released.',
    },
  },

  mounted,
  form: { value: el => el.value },

  docs: {
    attributes: { name: 'Form field name; the value is always submitted, as with a native range.' },
    properties: { 'valueAsNumber': 'Number(el.value).' },
  },
});

// valueAsNumber, as on a native range input.
if (Ctor && !('valueAsNumber' in Ctor.prototype)) {
  Object.defineProperty(Ctor.prototype, 'valueAsNumber', { configurable: true, get() { return Number(this.value); } });
}
})();
