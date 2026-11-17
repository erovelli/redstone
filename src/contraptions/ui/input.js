// UI contraption for <rs-input>: a row of oak wall signs on stone bricks. The player writes on the signs; the text field's
// value is what the signs say, read left to right.
//
// A Java sign line holds about 15 characters (the game limits a line by its width; 15 fit for ordinary text), so each
// sign carries the next 15 characters of the value on its first line, the way a player writes a long message across
// a row of signs. With up to 8 signs the longest value is 120 characters. The element shows the text over the boards
// at the sign font (SPEC I3), so fewer characters are visible than a sign holds; like a native input, the field
// scrolls while it is being edited.
//
//   front view (x east, z up); the signs hang on the front (y = 1) of the stone bricks:
//     z=0   [bricks+sign] [bricks+sign] ... (signs)
//     z=-1  floor --------------------------
(function () {
const N = typeof module !== 'undefined';
const RS = N ? require('../../engine.js') : window.RS;
const Catalogue = N ? require('../../catalogue.js') : window.Catalogue;
const ui = () => (N ? require('../../ui/core.js') : window.Redstone.ui);

const FLOOR = 'smooth_stone';
const PER_SIGN = 15;   // characters on a sign's first line
const MAX_SIGNS = 8;

const int = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

// A single line (newlines become spaces, as in a native text input), cut into one chunk per sign; text beyond the
// last sign does not fit and is not written.
function chunksOf(text, signs) {
  const chars = Array.from(String(text === undefined || text === null ? '' : text).replace(/\r\n|[\r\n]/g, ' '));
  const out = [];
  for (let i = 0; i < signs; i++) out.push(chars.slice(i * PER_SIGN, (i + 1) * PER_SIGN).join(''));
  return out;
}
const firstLine = sign => String(sign.text || '').split('\n')[0];
const textOf = signs => signs.map(firstLine).join('');

function buildInput(p = {}) {
  const n = int(p.signs, 1, MAX_SIGNS, 5);
  const w = new RS.World({ strict: true });
  const chunks = chunksOf(p.value, n);
  const signs = [];
  for (let x = 0; x < n; x++) {
    w.put(x, 0, -1, FLOOR);
    w.put(x, 0, 0, 'bricks');            // stone bricks: the oak boards stand out against them
    signs.push(w.put(x, 1, 0, 'sign', { att: 'N', kind: 'wall', text: chunks[x] }));
  }
  w.seal();
  const built = {
    world: w,
    box: [0, n - 1, 0, 1, -1, 0],
    capacity: n * PER_SIGN,
    editing: null,                // set by the element while its text field has focus (see rs-input)
    io: { signs },
  };
  // The player's hand: rewrite each sign whose part of the text changed. Returns true if any sign changed.
  built.write = (hand, text) => {
    let changed = false;
    chunksOf(text, n).forEach((chunk, i) => {
      if (firstLine(signs[i]) !== chunk || signs[i].text !== chunk) changed = hand.write(signs[i], chunk) || changed;
    });
    return changed;
  };
  built.text = () => textOf(signs);
  return built;
}

const T = (name, fn) => ({ name, fn });
const each = (entry, fn) => ui().testing.edges(entry).every(p => fn(p) || (() => { throw new Error('failed with ' + JSON.stringify(p)); })());
const LONG = 'The quick brown fox jumps over the lazy dog, then naps on a warm block of redstone lamps until the sun comes up again.';

const entry = Catalogue.register({
  id: 'ui-input',
  name: 'Text field',
  category: 'Form controls',
  summary: 'A row of oak wall signs. The player writes on them; the value is what they say, read left to right, 15 characters to a sign.',
  strict: true,
  deviations: [],
  inputs: ['writing on the signs'],
  outputs: ['the signs\' text'],
  actions: ['write on a sign'],
  timing: 'The signs carry the new text at once: writing is not a redstone change, and the world is quiet again after 1 tick.',
  notes: [
    'Limits: a sign line holds about 15 characters (Java measures a line by width; 15 fit for ordinary text) and a single-line field uses the first line of each sign, so the field holds 15 characters per sign: 75 with the default 5 signs, 120 at most (8 signs). Longer text does not fit on the signs, as in the game.',
    'Newlines become spaces: this is a single-line field.',
    'The element lays the text over the sign boards at 0.4 of a block (12.8 px at its default 32 px blocks), so it shows fewer characters than the signs hold; the native text field it puts over the boards while focused scrolls, as a native input does.',
    'Build with { signs, value }.',
  ],
  params: [{ key: 'signs', label: 'Signs', min: 1, max: MAX_SIGNS, def: 5 }],
  controls: [
    { kind: 'action', label: 'Write "hello"', fn: built => built.write(built.world.hand, 'hello') },
    { kind: 'action', label: 'Clear the signs', fn: built => built.write(built.world.hand, '') },
  ],
  build: buildInput,
  tests: [
    T('writing puts 15 characters on each sign and reads back at once (every parameter edge)', () => each(entry, p => {
      const t = ui().testing, c = buildInput(p), w = c.world, hand = t.hand(w);
      const n = c.io.signs.length;
      c.write(hand, LONG);
      const want = LONG.slice(0, 15 * n);
      return c.text() === want && c.io.signs.every((s, i) => s.text === want.slice(15 * i, 15 * i + 15)) && t.settle(w) <= 1 && c.capacity === 15 * n;
    })),
    T('only the signs whose part changed are written; newlines become spaces', () => {
      const t = ui().testing, c = buildInput({ signs: 3, value: 'a'.repeat(20) }), hand = t.hand(c.world);
      const first = c.io.signs[0].text;
      c.write(hand, 'a'.repeat(19));
      const same = c.io.signs[0].text === first;
      c.write(hand, 'one\ntwo\r\nthree');
      return same && c.text() === 'one two three' && c.write(hand, 'one two three') === false;
    }),
    T('characters, not UTF-16 units: an emoji counts as one', () => {
      const t = ui().testing, c = buildInput({ signs: 1 }), hand = t.hand(c.world);
      c.write(hand, '\u{1F600}'.repeat(20));
      return Array.from(c.text()).length === 15;
    }),
    T('a full cycle (write, rewrite, clear, write the start text) returns every block to its start', () => each(entry, p => ['', 'Steve'].every(v => {
      const t = ui().testing, c = buildInput(Object.assign({}, p, { value: v })), w = c.world, hand = t.hand(w);
      const h0 = t.hash(w);
      c.write(hand, LONG);
      t.settle(w);
      c.write(hand, 'x');
      c.write(hand, '');
      c.write(hand, v);
      t.settle(w);
      return t.hash(w) === h0;
    }))),
    T('built with a value, the steady state does not drift for 100 ticks and reads the value', () => each(entry, p => ['', 'Alex', LONG].every(v => {
      const c = buildInput(Object.assign({}, p, { value: v }));
      return ui().testing.noDrift(c.world, 100) && c.text() === v.slice(0, c.capacity);
    }))),
    T('strict, and no pistons', () => each(entry, p => ui().testing.strictWorld(buildInput(p).world, RS) && ui().testing.pistonCount(buildInput(p).world) === 0)),
  ],
});

if (N) module.exports = { buildInput, chunksOf, entry, PER_SIGN, MAX_SIGNS };
else window.RSInput = { buildInput, chunksOf, PER_SIGN, MAX_SIGNS };
})();
