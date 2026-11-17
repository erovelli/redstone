// rs-dropdown: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller } = require('./helpers.js');

const spec = loadComponent('dropdown');
const T = (name, fn) => ({ name, fn });
const button = spec.controls[0];

function run(ctl, n) {
  const out = [];
  for (let i = 1; i <= n; i++) for (const ch of ctl.tick()) out.push(Object.assign({ tick: i }, ch));
  return out;
}

module.exports = {
  suite: 'rs-dropdown',
  tests: [
    T('the control presses the menu button: toggle fires on tick 4 when the door is clear; again, on tick 4 when it shuts', () => {
      const ctl = controller(spec, {});
      ctl.act(button);
      const a = run(ctl, 12).find(c => c.key === 'open');
      ctl.act(button);
      const b = run(ctl, 12).find(c => c.key === 'open');
      return a.tick === 4 && a.value === true && a.events.join() === 'toggle' && b.tick === 4 && b.value === false && !ctl.state.deployed;
    }),
    T('a press while the button is still in does nothing (the control does not press it again)', () => {
      const ctl = controller(spec, {});
      ctl.act(button);
      run(ctl, 5);
      ctl.act(button);
      run(ctl, 20);
      return ctl.state.open === true && ctl.io.bulb.lit;
    }),
    T('ArrowDown and ArrowUp only open (they never shut an open menu); open = false shuts it', () => {
      const ctl = controller(spec, {});
      ctl.act(Object.assign({}, button, { act: button.keys.ArrowDown }));
      run(ctl, 20);
      const opened = ctl.state.open;
      ctl.act(Object.assign({}, button, { act: button.keys.ArrowUp }));
      run(ctl, 20);
      const still = ctl.state.open;
      ctl.request('open', false);
      run(ctl, 20);
      return opened && still && !ctl.state.open;
    }),
    T('menu semantics: the button has aria-expanded from open; the items go through the opening; one row per item', () => {
      const ctl = controller(spec, {});
      return button.aria.expanded === 'open' && spec.opening.shownWhen === 'open' && !spec.opening.slot &&
        ctl.built.opening.length === 6 * 3 && spec.docs.events.select;
    }),
  ],
};
