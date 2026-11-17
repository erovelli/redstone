// rs-button: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('button');
const T = (name, fn) => ({ name, fn });
const press = spec.controls[0];

// A stand-in element with a form, for the submit/reset hook.
function fakeEl(type, prevented) {
  const calls = [];
  const form = { requestSubmit: () => calls.push('submit'), reset: () => calls.push('reset') };
  return { calls, el: { form, getAttribute: n => (n === 'type' ? type : null) }, click: { defaultPrevented: prevented } };
}

module.exports = {
  suite: 'rs-button',
  tests: [
    T('a press fires click on the tick the lamp lights, and nothing when it goes dark', () => {
      const ctl = controller(spec, {}, { text: 'Save' });
      ctl.act(press);
      if (ctl.state.active) return false;
      const rise = untilChange(ctl);
      const fall = untilChange(ctl);
      return rise.ticks === 1 && rise.changes[0].events.join() === 'click' && fall.ticks >= 10 && fall.ticks <= 12 && fall.changes[0].events.length === 0;
    }),
    T('the wood attribute makes an oak button: a 15-tick pulse', () => {
      const ctl = controller(spec, { wood: '' }, { text: 'Save' });
      ctl.act(press);
      untilChange(ctl);
      const fall = untilChange(ctl);
      return fall.ticks >= 15 && fall.ticks <= 17;
    }),
    T('pressing while the button is in gives no second click', () => {
      const ctl = controller(spec, {}, { text: 'Save' });
      ctl.act(press);
      let clicks = 0;
      for (let i = 0; i < 40; i++) {
        if (i === 3) ctl.act(press);
        for (const c of ctl.tick()) clicks += c.events.length;
      }
      return clicks === 1;
    }),
    T('active is read-only', () => !spec.state.active.set),
    T('SPEC I3: the default block is 32 px, so sign text (0.4 of a block) is 12.8 px; signs come from the measured caption', () =>
      /--rs-block:\s*32px/.test(spec.styles) && spec.label === 'signs' && controller(spec, {}, { text: 'Save changes' }).params.signs > controller(spec, {}, { text: 'OK' }).params.signs),
    T('in a form: submit by default, reset for type="reset", nothing for type="button"', () => {
      const rise = { key: 'active', value: true };
      const a = fakeEl(null, false), b = fakeEl('reset', false), c = fakeEl('button', false);
      spec.changed(a.el, Object.assign({ dispatched: [a.click] }, rise));
      spec.changed(b.el, Object.assign({ dispatched: [b.click] }, rise));
      spec.changed(c.el, Object.assign({ dispatched: [c.click] }, rise));
      return a.calls.join() === 'submit' && b.calls.join() === 'reset' && c.calls.length === 0;
    }),
    T('a cancelled click does not submit; the falling edge never submits', () => {
      const a = fakeEl('submit', true), b = fakeEl('submit', false);
      spec.changed(a.el, { key: 'active', value: true, dispatched: [a.click] });
      spec.changed(b.el, { key: 'active', value: false, dispatched: [] });
      return a.calls.length === 0 && b.calls.length === 0;
    }),
  ],
};
