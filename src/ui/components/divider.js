// <rs-divider>: a horizontal rule, like <hr>. A dust line on a row of smooth stone, as wide as its container.
// With `pulse`, a torch clock at the west end sends a signal along the line (not under reduced motion).
//
//   <rs-divider></rs-divider>   <rs-divider pulse></rs-divider>
(function () {
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// One block per --rs-block of the element's own width (it is a block box, so that is the container's width).
function lengthFor(el, ctx) {
  if (!el) return 24;
  const width = el.getBoundingClientRect().width;
  return Math.max(1, Math.min(200, Math.floor(width / ctx.B)));
}

Redstone.ui.define('rs-divider', {
  entry: 'ui-divider',
  params: {
    length: lengthFor,
    pulse: { attr: 'pulse', type: 'boolean', doc: 'A torch clock sends a signal along the line every 1.7 s (off under reduced motion).' },
    reduced: () => reduced(),
  },
  host: {
    role: 'separator',
    aria: { orientation: () => 'horizontal' },
  },
  // Plain, the cells above the dust hold nothing but the dust itself: the empty top three quarters of that row
  // are not laid out, so the rule takes about one block of height.
  styles: `
    :host { display: block; box-sizing: border-box; width: 100%; flex: 1 0 100%; --rs-block: 16px; margin: .6em 0; }
    .box { margin: 0 auto; }
    :host(:not([data-rs-tall])) .box { margin-top: calc(var(--b) * -.75); }
  `,
  mounted(el, view, built) {
    el.toggleAttribute('data-rs-tall', !!built.pulse);
  },
});
})();
