// rs-navbar: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('navbar');
const T = (name, fn) => ({ name, fn });
const nav = texts => controller(spec, {}, { linkTexts: texts });

module.exports = {
  suite: 'rs-navbar',
  tests: [
    T('one launcher per link; label signs sized from the link text (2 to 3)', () => {
      const ctl = nav(['Home', 'Documentation', 'A']);
      return ctl.built.links.length === 3 && ctl.params.signs.join() === '2,3,2' && ctl.io.signs.length === 7;
    }),
    T('no links still builds one launcher (the element is empty)', () => nav([]).built.links.length === 1),
    T('every chamber starts loaded and launching is false', () => {
      const ctl = nav(['Home', 'Docs']);
      return ctl.state.launching === false && ctl.built.links.every(ctl.built.ready);
    }),
    T('a press makes launching true at once; it stays true until the chamber refills and is restocked', () => {
      const ctl = nav(['Home', 'Docs']), b = ctl.built, L = b.links[1];
      ctl.hand.press(L.button);
      const rise = untilChange(ctl);
      if (rise.ticks !== 1 || rise.changes[0].value !== true) return false;
      for (let t = 0; t < 30; t++) ctl.tick();
      if (!b.restock(L)) return false;            // what the element does after each frame: the player's throw
      const fall = untilChange(ctl, 20);
      return fall.changes[0].key === 'launching' && fall.changes[0].value === false;
    }),
    T('the launched pearl is the pressed link\'s and leaves moving up and east', () => {
      const ctl = nav(['Home', 'Docs', 'Blog']), b = ctl.built, L = b.links[2], pearl = b.pearlOf(L);
      ctl.hand.press(L.button);
      for (let t = 0; t < 10; t++) ctl.tick();
      return pearl.vx > 0.5 && pearl.vz > 0.5 && b.links.filter(b.ready).length === 2;
    }),
    T('launching is read-only; there are no shadow controls (the links themselves are the controls)', () => !spec.state.launching.set && spec.controls.length === 0),
    T('sign text stays legible: the element never shrinks below 30 px blocks', () => spec.minBlock * 0.4 >= 12),
  ],
};
