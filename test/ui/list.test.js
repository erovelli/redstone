// rs-list: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller } = require('./helpers.js');

const spec = loadComponent('list');
const T = (name, fn) => ({ name, fn });
const fakeHost = html => ({ querySelector: sel => (sel === ':scope > li' && /^<li/.test(html) ? {} : null) });

module.exports = {
  suite: 'rs-list',
  tests: [
    T('measured rows and height build one torch per item on those rows; the world is quiet', () => {
      const c = controller(spec, {}, { el: null });
      const m = C2(spec, { rows: '0,3,4', height: 7 });
      return c.quiet() && m.built.rows.join() === '0,3,4' && m.built.height === 7 && m.io.bullets.every(t => t.t === 'torch' && t.lit) && m.quiet();
    }),
    T('ordered builds repeaters whose delays add up to each item number', () => {
      const m = C2(spec, { rows: '0,2,4,6,8', height: 10, ordered: true });
      return m.built.bullets.map(b => b.reduce((n, r) => n + r.delay, 0)).join() === '1,2,3,4,5' && m.built.box[1] === 2;
    }),
    T('label beside: the items are page text next to the machine; no controls, no state', () => spec.label === 'beside' && !spec.controls && !spec.state),
    T('role list on the element only for direct <li> children', () => spec.host.role(fakeHost('<li>a</li>')) === 'list' && spec.host.role(fakeHost('<ul>')) === null),
  ],
};

// A controller with the measured params given directly (what the element computes in a browser).
function C2(s, params) {
  const { C, ui } = require('./helpers.js');
  const ctl = new ui.Controller(s, C.get(s.entry));
  ctl.build(params);
  return ctl;
}
