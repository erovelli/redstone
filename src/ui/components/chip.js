// <rs-chip> and <rs-badge>: text on signs hung on a row of blocks. A dismissible chip has a button on a piston;
// `dismiss` fires (cancelable) when the signs have popped off, and then the element removes itself.
//
//   <rs-chip>redstone</rs-chip>  <rs-chip dismissible tone="lime">draft</rs-chip>  <rs-badge>3</rs-badge>
(function () {
function spec(tone, removable) {
  return {
    entry: 'ui-chip',
    params: {
      signs: (el, ctx) => ctx.signsFor(ctx.text, { min: 1, max: 10 }),
      dismissible: removable ? { attr: 'dismissible', type: 'boolean', doc: 'Adds an oak button on a piston that pushes the blocks away: the signs pop and the chip goes.' } : () => false,
      lit: { attr: 'lit', type: 'boolean', doc: 'The signs hang on redstone lamps, lit by redstone blocks behind them.' },
      tone: { attr: 'tone', type: 'string', def: tone, doc: 'Colour of the concrete behind the signs: plain (oak planks), white, gray, black, red, orange, yellow, lime, green, cyan, light_blue, blue, purple, pink.' },
    },
    // The text sits on the signs; it stays readable to screen readers (the chip is text, not a control).
    label: 'signs',
    readLabel: true,
    // Inline, like a <span>: the core ends the box at the bottom of the wall the signs hang on and puts the sign
    // text's baseline on the line's baseline.
    inline: true,
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
