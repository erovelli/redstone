// <rs-steps>: a stepper or timeline. One lamp per step, its label on oak signs; `value` is the number of steps
// reached (lamps lit) and the step reached last carries aria-current="step".
//
//   <rs-steps running><li>Ordered</li><li>Packed</li><li>Shipped</li></rs-steps>        a timeline (lever)
//   <rs-steps manual value="1"><li>Cart</li><li>Address</li><li>Pay</li></rs-steps>    a stepper (button counter)
//
// Every child element is a step; without the script they read as a list (steps.css).
(function () {
const S = () => (typeof module !== 'undefined' ? require('../../contraptions/ui/steps.js') : window.RSSteps);
const steps = el => (el ? [...el.children] : []);
const labelsOf = el => steps(el).map(c => c.textContent.replace(/\s+/g, ' ').trim());
const count = el => steps(el).length;

// aria-current="step" on the step reached last (called on every state change).
function mark(el, value) {
  steps(el).forEach((c, i) => {
    if (i === value - 1) c.setAttribute('aria-current', 'step');
    else c.removeAttribute('aria-current');
  });
}

function mounted(el, view, built) {
  const box = el.shadowRoot.querySelector('.box');
  box.querySelectorAll('.rs-step-label').forEach(n => n.remove());
  labelsOf(el).forEach((text, i) => {
    const signs = built.io['label' + i];
    if (!signs) return;
    const a = view.rectOf(signs[0], 'front'), b = view.rectOf(signs[signs.length - 1], 'front');
    const div = document.createElement('div');
    div.className = 'rs-step-label';
    div.setAttribute('aria-hidden', 'true');
    div.textContent = text;
    Object.assign(div.style, { left: a.x + 'px', top: a.y + 'px', width: b.x + b.w - a.x + 'px', height: a.h + 'px' });
    box.appendChild(div);
  });
}

Redstone.ui.define('rs-steps', {
  entry: 'ui-steps',
  minBlock: 30,
  params: {
    steps: (el, ctx) => Math.max(2, count(ctx.el)),
    manual: 'manual',
    delay: { attr: 'delay', type: 'number', doc: 'Timeline: ticks between steps, 1 to 4 (default 2).' },
    signs: (el, ctx) => Math.max(1, ...labelsOf(ctx.el).map(t => ctx.signsFor(t, { min: 2, max: 6 }))),
    on: { attr: 'running', type: 'boolean', doc: 'Timeline: start with the lever on (every step reached).' },
    at: { attr: 'value', type: 'number', doc: 'Manual: start at this step (books already in the hopper).' },
  },
  controls: [
    { io: 'lever', act: 'flip', role: 'switch', aria: { checked: 'running' }, label: el => el.getAttribute('run-label') || 'Run' },
    { io: 'button', act: 'press', label: el => el.getAttribute('next-label') || 'Next step', primary: true },
    { io: 'hopper', act: (hand, io) => S().stepBack(hand, io), label: el => el.getAttribute('back-label') || 'Previous step' },
  ],
  host: {
    role: 'progressbar',
    aria: {
      valueMin: () => 0,
      valueMax: (s, el) => count(el),
      valueNow: 'value',
      valueText: (s, el) => {
        mark(el, s.value);
        return s.value ? `Step ${s.value} of ${count(el)}: ${labelsOf(el)[s.value - 1] || ''}` : `Not started, ${count(el)} steps`;
      },
    },
  },
  state: {
    value: {
      read: io => S().reached(io),
      attr: 'value',
      type: 'number',
      event: 'change',
      // Manual only: going forward presses the button (one step); going back takes books out by hand.
      set: (hand, io, v) => {
        if (!io.hopper) return false;
        const now = S().reached(io);
        if (v > now) return hand.press(io.button);
        for (let k = now; k > Math.max(0, v); k--) S().stepBack(hand, io);
        return true;
      },
      announce: (v, el) => (v ? `${labelsOf(el)[v - 1] || 'Step ' + v}` : 'Not started'),
      doc: 'Steps reached: the lamps lit. Manual: setting it lower takes books back at once; higher presses the button (one step per set).',
      eventDoc: 'Fired as each lamp lights or goes out.',
    },
    running: {
      read: io => !!(io.lever && io.lever.on),
      attr: 'running',
      set: (hand, io, v) => { if (io.lever && io.lever.on !== v) hand.flip(io.lever); },
      settle: false,
      doc: 'Timeline: the lever. Setting it flips the lever and the lamps follow, a stage delay apart.',
    },
  },
  methods: {
    next() { this.perform((hand, io) => io.button && hand.press(io.button)); },
    previous() { this.perform((hand, io) => io.hopper && S().stepBack(hand, io)); },
  },
  mounted,
  observe: ['run-label', 'next-label', 'back-label'],
  styles: `
    :host { display: inline-block; --rs-block: 32px; }
    .rs-step-label { position: absolute; z-index: 2; display: flex; align-items: center; justify-content: center; overflow: hidden;
      white-space: nowrap; pointer-events: none; color: var(--rs-sign-ink, #1b120a);
      font: 500 calc(var(--b) * .4)/1 var(--rs-sign-font, ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace); }`,
  docs: {
    attributes: { '(children)': 'One child element per step (2 to 8; manual: 2 to 5); its text goes on the step\'s signs.' },
    properties: { 'next()': 'Manual: press the button (one step on).', 'previous()': 'Manual: take one book back (one step back).' },
  },
});
})();
