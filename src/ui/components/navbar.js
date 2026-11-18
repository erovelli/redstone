// <rs-navbar>: navigation. Each link is an ender pearl launcher; activating a link presses its stone button.
// The page navigates when the launched pearl has left the viewport: a cancelable `rs-navigate` event first.
//
//   <rs-navbar><a href="/">Home</a><a href="/docs">Docs</a></rs-navbar>
(function () {
const MAX = 6;
const links = el => (el ? [...el.children].filter(n => n.localName === 'a').slice(0, MAX) : []);
const texts = (el, ctx) => (el ? links(el).map(a => a.textContent.trim()) : ctx.linkTexts || []);
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Plain clicks press the link's button; modifier and middle clicks stay ordinary link clicks.
function onClick(el, i, ev) {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  ev.preventDefault();
  const c = el.contraption, built = c && c.built;
  // One launch at a time (declared in the entry's deviations): a chamber that has not refilled would pour water
  // over its open drop shaft, so the element ignores presses until every launcher is home with a pearl.
  if (!built || el._flight || !built.links.every(built.ready)) return;
  const L = built.links[i], a = links(el)[i];
  el._flight = { a, pearl: built.pearlOf(L) };
  el.perform(hand => hand.press(L.button), { event: ev });
}

// A chamber that is set again and empty gets a fresh pearl: the player throws one in (world.hand.throwPearl).
function restock(el, state) {
  if (!state.empty) return;
  el.perform((hand, io, built) => built.links.forEach(L => built.restock(L)));
}

function navigate(el) {
  const a = el._flight.a;
  el._flight = null;
  const ev = new CustomEvent('rs-navigate', { bubbles: true, composed: true, cancelable: true, detail: { href: a.href, link: a } });
  el.dispatchEvent(ev);
  if (!ev.defaultPrevented) location.href = a.href;
}

// The view is wrapped so that, after every frame, flying pearls are drawn on a fixed full-viewport canvas and a
// pearl that has left the viewport (or hit something) triggers navigation.
function mounted(el, view, built) {
  const box = el.shadowRoot.querySelector('.box');
  const stage = el.shadowRoot.querySelector('.stage');
  box.querySelectorAll('.rs-links').forEach(n => n.remove());
  const wrap = document.createElement('div');
  wrap.className = 'rs-links';
  links(el).forEach((a, i) => {
    const L = built.links[i];
    if (!L) return;
    const r0 = view.rectOf(L.signs[0], 'front'), r1 = view.rectOf(L.signs[L.signs.length - 1], 'front');
    const cell = document.createElement('div');
    cell.className = 'rs-link';
    Object.assign(cell.style, { left: r0.x + 'px', top: r0.y + 'px', width: r1.x + r1.w - r0.x + 'px', height: r0.h + 'px' });
    cell.innerHTML = `<slot name="rs-link-${i}"></slot>`;
    wrap.appendChild(cell);
    a.slot = `rs-link-${i}`;
    if (!a._rsNav) a.addEventListener('click', a._rsNav = ev => onClick(el, links(el).indexOf(a), ev));
  });
  box.appendChild(wrap);

  const sky = document.createElement('canvas');
  sky.className = 'rs-sky';
  sky.setAttribute('aria-hidden', 'true');
  stage.appendChild(sky);
  const pearlTex = Redstone.textures.get('item/ender_pearl');
  view.entityFilter = en => !!en.stasis;           // held pearls on the wall; moving ones on the sky
  const draw = view.draw;
  view.draw = now => {
    draw(now);
    const dpr = Math.min(3, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (sky.width !== Math.round(W * dpr) || sky.height !== Math.round(H * dpr)) {
      Object.assign(sky, { width: Math.round(W * dpr), height: Math.round(H * dpr) });
      Object.assign(sky.style, { width: W + 'px', height: H + 'px' });
    }
    const ctx = sky.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    const st = stage.getBoundingClientRect(), p = Math.max(0, Math.min(1, (now - view.tickAt) / 100));
    const size = view.B * 0.5;
    for (const en of view.world.entities) {
      if (en.gone || en.stasis) continue;
      const q = view.pt(en.px + (en.x - en.px) * p, en.py + (en.y - en.py) * p, en.pz + (en.z - en.pz) * p + 0.25);
      const x = st.left + q.x, y = st.top + q.y;
      ctx.drawImage(pearlTex, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      if (el._flight && el._flight.pearl === en && (x < -size || y < -size || x > W + size || y > H + size)) navigate(el);
    }
    if (el._flight && el._flight.pearl && el._flight.pearl.gone) navigate(el);
  };
}

Redstone.ui.define('rs-navbar', {
  entry: 'ui-navbar',
  minBlock: 30,                                    // 0.4 of a block: sign text stays at 12 px or more
  params: {
    links: (el, ctx) => Math.max(1, texts(el, ctx).length),
    signs: (el, ctx) => texts(el, ctx).map(t => ctx.signsFor(t, { min: 2, max: 3 })),
  },
  controls: [],
  state: {
    launching: {
      read: (io, built) => !built.links.every(built.ready),
      attr: 'launching',
      doc: 'True from a press until every chamber holds a pearl again (about 3 s). Presses are ignored meanwhile.',
    },
    empty: {
      read: (io, built) => built.links.some(L => built.chamberSet(L) && !built.pearlOf(L)),
      doc: 'True while a chamber is set and holds no pearl; the element then throws one in.',
    },
  },
  mounted,
  sync: restock,
  methods: { click() { const a = links(this)[0]; if (a) a.click(); } },
  styles: `
    :host { display: block; overflow-x: auto; overflow-y: hidden; }
    .rs-sky { position: fixed; left: 0; top: 0; z-index: 2147483000; pointer-events: none; image-rendering: pixelated; }
    .rs-links, .rs-link { position: absolute; }
    .rs-links { inset: 0; z-index: 3; }
    .rs-link { display: flex; align-items: center; justify-content: center; line-height: normal; }
    ::slotted(a) { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    ::slotted(a:focus-visible) { outline: 2px dashed var(--rs-focus, currentColor); outline-offset: 3px; }`,
  docs: {
    attributes: { '(children)': 'Up to six <a href> links. Each gets a launcher; its text goes on 2 or 3 oak signs.' },
    events: { 'rs-navigate': 'Cancelable; detail { href, link }. Fired when the pearl leaves the viewport. If not cancelled, the page follows the link. Single-page apps cancel it and route.' },
  },
});
})();
