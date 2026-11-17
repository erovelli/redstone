// <rs-counter>: a stat number. Setting `value` puts books and quills into (or takes them out of) one barrel per
// digit; each digit's comparator lights that many lamps on its row, and the number beside the machine is read back
// from the comparators.
//
//   <rs-counter value="42" digits="2">Players online</rs-counter>
(function () {
const STYLES = `
  :host { --rs-block: 16px; flex-wrap: wrap; }
  .readout { line-height: 1; font: 600 calc(var(--rs-block, 16px) * 2.2)/1 var(--rs-counter-font, ui-monospace, Menlo, Consolas, monospace);
    letter-spacing: .04em; font-variant-numeric: tabular-nums; }
`;
const shown = (value, el) => String(value).padStart(el.contraption ? el.contraption.built.digits : 1, '0');

Redstone.ui.define('rs-counter', {
  entry: 'ui-counter',
  params: {
    digits: 'digits',
    value: { attr: 'value', type: 'number', doc: 'Read when the counter is built; after that the attribute mirrors the comparators.' },
  },
  label: 'beside',
  host: {
    role: 'status',
    aria: { label: (state, el) => `${el.label ? el.label + ': ' : ''}${state.value}` },
  },
  state: {
    value: {
      read: (io, built) => built.valueOf(),
      attr: 'value',
      type: 'number',
      set: (hand, io, value, built) => built.setValue(hand, value),
      doc: 'The number the comparators read (0 to 999, by digits). Setting it moves books and quills in or out of each barrel.',
    },
  },
  // The number, written from the comparators' strengths, between the machine and the caption.
  mounted(el) {
    const box = el.shadowRoot.querySelector('.box');
    if (!el.shadowRoot.querySelector('.readout')) {
      const r = document.createElement('span');
      r.className = 'readout';
      r.setAttribute('part', 'readout');
      r.setAttribute('aria-hidden', 'true');
      box.after(r);
    }
    el.shadowRoot.querySelector('.readout').textContent = shown(el.value, el);
  },
  sync(el, state) {
    const r = el.shadowRoot && el.shadowRoot.querySelector('.readout');
    if (r) r.textContent = shown(state.value, el);
  },
  styles: STYLES,
  docs: { attributes: { digits: 'How many digit rows (1 to 3, default 3); larger values show as all nines.' } },
});
})();
