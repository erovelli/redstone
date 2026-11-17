// <rs-chip> and <rs-badge>: text on signs hung on a row of blocks. A dismissible chip has a button on a piston;
// `dismiss` fires (cancelable) when the signs have popped off, and then the element removes itself.
//
//   <rs-chip>redstone</rs-chip>  <rs-chip dismissible tone="lime">draft</rs-chip>  <rs-badge>3</rs-badge>
(function () {
const STYLES = `
  /* 32 px blocks keep the sign text at 12.8 px (SPEC I3). The element has no text baseline of its own, so its
     bottom edge sits on the line's baseline; lowering it by the sign's height above the bottom (1.16 blocks)
     less a third of an em puts the sign text on the surrounding text's line. */
  :host { --rs-block: 32px; vertical-align: calc(var(--rs-block) * -1.16 + .35em); }
`;

function spec(tone, removable) {
  return {
    entry: 'ui-chip',
    params: {
      signs: (el, ctx) => ctx.signsFor(ctx.text, { min: 1, max: 10 }),
      dismissible: removable ? { attr: 'dismissible', type: 'boolean', doc: 'Adds a stone button on a piston that pushes the blocks away: the signs pop and the chip goes.' } : () => false,
      lit: { attr: 'lit', type: 'boolean', doc: 'The signs hang on redstone lamps, lit by redstone blocks behind them.' },
      tone: { attr: 'tone', type: 'string', def: tone, doc: 'Colour of the concrete behind the signs: plain (oak planks), white, gray, black, red, orange, yellow, lime, green, cyan, light_blue, blue, purple, pink.' },
    },
    // The text sits on the signs; it stays readable to screen readers (the chip is text, not a control).
    label: 'signs',
    readLabel: true,
    controls: removable ? [
      { io: 'button', act: 'press', role: 'button', label: el => `Dismiss ${el.label}` },
    ] : [],
    state: {
      dismissed: {
        read: io => io.signs.every(s => s.popped),
        event: 'dismiss',
        when: 'rise',
        cancelable: true,
        announce: (gone, el) => (gone ? `${el.label} dismissed` : ''),
        doc: 'True once the signs have popped off.',
        eventDoc: 'Cancelable. Unless cancelled, the element then removes itself.',
      },
    },
    styles: STYLES,
    changed(el, change) {
      if (change.key !== 'dismissed' || !change.value) return;
      const ev = change.dispatched[0];
      // After the current tick has finished with the element.
      if (!ev || !ev.defaultPrevented) queueMicrotask(() => el.remove());
    },
    methods: {
      // Put a dismissed chip back together: a fresh contraption from the attributes.
      restore() { if (this.isConnected) this.formResetCallback(); },
    },
    docs: { properties: { 'restore()': 'Rebuild the chip (after a cancelled dismiss).' } },
  };
}

Redstone.ui.define('rs-chip', spec('plain', true));
Redstone.ui.define('rs-badge', spec('red', false));
})();
