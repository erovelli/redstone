// rs-pagination: the component spec driven headlessly (beyond the catalogue entry's own tests).
const { loadComponent, controller, untilChange } = require('./helpers.js');

const spec = loadComponent('pagination');
const T = (name, fn) => ({ name, fn });
const [prev, next] = spec.controls;

module.exports = {
  suite: 'rs-pagination',
  tests: [
    T('pages and page attributes build the book open at that page', () => {
      const ctl = controller(spec, { pages: '7', page: '3' });
      return ctl.state.page === 3 && ctl.io.lectern.pages === 7 && ctl.io.lectern.page === 2;
    }),
    T('next turns one page; page and change follow the comparator, not the click', () => {
      const ctl = controller(spec, { pages: '7', page: '3' });
      ctl.act(next);
      if (ctl.state.page !== 3) return false;
      const a = untilChange(ctl);
      return a.ticks <= 2 && a.changes[0].key === 'page' && a.changes[0].value === 4 && a.changes[0].events.join() === 'change';
    }),
    T('previous stops at the first page; a page control turns straight to its page; page = n sets it', () => {
      const ctl = controller(spec, { pages: '5', page: '1' });
      ctl.act(prev);
      ctl.settle();
      const stays = ctl.state.page === 1;
      ctl.act(spec.controls[2 + 4]);
      ctl.settle();
      const five = ctl.state.page === 5;
      ctl.request('page', 2);
      ctl.settle();
      return stays && five && ctl.state.page === 2;
    }),
    T('page controls mark the open page with aria-current; arrow keys turn the page', () => {
      const c = spec.controls[2 + 2];
      return c.aria.current({ page: 3 }) === 'page' && c.aria.current({ page: 1 }) === 'false' && typeof next.keys.ArrowLeft === 'function' && spec.state.page.cancelable;
    }),
  ],
};
