// Redstone kit catalogue site: hash router, index with previews, per-component test bench, tests dashboard, rules.
(() => {
const R = window.RSR, C = window.Catalogue, RS = window.RS, root = document.documentElement;
const $ = (s, el=document) => el.querySelector(s), main = $('#main'), side = $('#side');
const slug = s => s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
const byId = Object.fromEntries(C.entries.map(e => [e.id, e]));
const catOf = s => C.CATEGORIES.find(c => slug(c) === s);
const width = () => $('#measure').clientWidth;
const scaleFor = w => Math.max(16, Math.min(26, Math.floor(w/18)));
let results = {};   // id -> test results
R.setScale(scaleFor(width()));

/* theme lever */
let stored = null; try { stored = localStorage.getItem('rs-theme'); } catch(e){}
const th = Logic.leverLamp(); th.io.lever.on = stored ? stored==='light' : !matchMedia('(prefers-color-scheme: dark)').matches; th.world.run(3);
root.dataset.theme = th.io.lamp.lit ? 'light' : 'dark'; R.readPal();
const tv = R.makeView($('#theme-stage'), th, { onTick: () => { const want = th.io.lamp.lit ? 'light' : 'dark'; if (root.dataset.theme !== want){ root.dataset.theme = want; try { localStorage.setItem('rs-theme', want); } catch(e){} R.readPal(); refreshPresentation(); } } });
tv.persistent = true; R.hitAt(tv, 0,0,0, 'Light switch lever', () => { th.io.lever.on = !th.io.lever.on; });

/* main nav: ender pearl launcher */
const NAV = [['Overview','#/'],['Logic','#/category/toggles-and-logic'],['Flying','#/category/flying-machines'],['Doors','#/category/doors'],['Tests','#/tests'],['Rules','#/rules']];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const launchHint = 'Press a button to launch and teleport.';
const nav = { L:null, view:null, pads:[], busy:null };
// The wall shows the label, button, chamber and one row below; it grows to the launcher's full depth while one is in use.
const OPEN_PHASES = ['revealing','receding','opening','releasing','dropping','launching','flying','withdrawing','refilling'];
function syncNav(){
  const b = nav.busy, it = b && nav.L.items[b.i];
  $('#launch-stage').classList.toggle('open', !!(it && OPEN_PHASES.includes(it.phase)));
}
// One block is the same size for the wall, barrels, pistons and slime.
const navScale = L => Math.max(12, Math.min(48, Math.floor($('#launch').clientWidth / L.cols)));
// Note block "harp": pitch 0..24 is F#3..F#5, a plucked tone that dies away. Only plays after a click (browser autoplay rules).
let audio = null;
function noteBlock(pitch){
  if (reduceMotion) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, f = 369.99 * Math.pow(2, (pitch-12)/12), out = audio.createGain();
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(.18, t+.005); out.gain.exponentialRampToValueAtTime(.0008, t+.9);
    const tone = audio.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = f*6; tone.connect(out); out.connect(audio.destination);
    for (const [type, mult, level] of [['triangle',1,1],['sine',2,.35],['sine',3,.12]]){
      const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.value = f*mult; g.gain.value = level;
      o.connect(g); g.connect(tone); o.start(t); o.stop(t+1);
    }
  } catch(e){}
}
// Dispenser bucket sounds: scooping water up ('fill', a falling glug) and pouring it back ('empty', a rising splash).
function bucketSound(kind){
  if (reduceMotion) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, len = kind==='fill' ? .38 : .5, fill = kind==='fill';
    const buf = audio.createBuffer(1, Math.ceil(audio.sampleRate*len), audio.sampleRate), d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
    const src = audio.createBufferSource(); src.buffer = buf;
    const band = audio.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = fill ? 6 : 2.5;
    band.frequency.setValueAtTime(fill ? 1400 : 500, t); band.frequency.exponentialRampToValueAtTime(fill ? 350 : 1900, t+len);
    const g = audio.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(fill ? .5 : .35, t+.03); g.gain.exponentialRampToValueAtTime(.001, t+len);
    src.connect(band); band.connect(g); g.connect(audio.destination); src.start(t); src.stop(t+len);
    // a couple of bubbly blips on top of the water noise
    for (const [at, f0, f1] of fill ? [[0,700,300],[.12,600,250]] : [[.05,220,520],[.2,260,640]]){
      const o = audio.createOscillator(), og = audio.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t+at); o.frequency.exponentialRampToValueAtTime(f1, t+at+.09);
      og.gain.setValueAtTime(.0001, t+at); og.gain.linearRampToValueAtTime(.12, t+at+.01); og.gain.exponentialRampToValueAtTime(.0005, t+at+.1);
      o.connect(og); og.connect(audio.destination); o.start(t+at); o.stop(t+at+.12);
    }
  } catch(e){}
}
function buildNav(){
  const st = $('#launch-stage'); st.innerHTML = ''; if (nav.view) R.removeView(nav.view);
  const L = nav.L || (nav.L = buildHiddenLauncherNav(NAV.length)); if (!L.warm){ L.world.run(4); L.warm = true; }
  const B = navScale(L);
  const v = nav.view = R.makeNavView(st, L, { B, overlay:$('#pearl-sky'), onNote:n => noteBlock(n.pitch), onSound:s => bucketSound(s.kind) });
  v.persistent = true;
  // Closed, the wall shows its top lip, the labels, the buttons, the chambers with the side launcher's covers, and one row below; open, the launcher rows too.
  const below = v.front(0, 0, -2).y;
  st.style.width = v.W+'px'; st.style.setProperty('--closed', below+'px'); st.style.setProperty('--open', v.H+'px'); st.style.setProperty('--b', B+'px');
  nav.pads = NAV.map(([label,href],i) => {
    const it = L.items[i], c = v.front(it.xc-1, 0, 2);
    const a = document.createElement('a'); a.className = 'pad'; a.href = href; a.dataset.i = i;
    Object.assign(a.style, { left:c.x+'px', top:c.y+'px', width:3*B+'px', height:3*B+'px' });
    a.innerHTML = `<span>${label}</span>`; a.setAttribute('aria-label', `${label} (presses the button on its ender pearl stasis chamber and launches the pearl)`);
    st.appendChild(a); return a;
  });
  if (nav.busy){ nav.pads.forEach(p=>p.setAttribute('aria-disabled','true')); nav.pads[nav.busy.i].classList.add('launching'); }
  v.draw(performance.now()); syncNav(); markNav();
}
function markNav(){ const h = lastHash || '#/'; nav.pads.forEach((p,i) => { const href = NAV[i][1]; const on = href==='#/' ? h==='#/' : h.startsWith(href); on ? p.setAttribute('aria-current','page') : p.removeAttribute('aria-current'); }); }
function launch(i){
  const L = nav.L, it = L.items[i], href = NAV[i][1];
  if (nav.busy) return;
  if (reduceMotion){ navigate(href); return; }
  if (!L.release(it)) return;
  nav.busy = { i, href };
  nav.pads.forEach(p => p.setAttribute('aria-disabled','true')); nav.pads[i].classList.add('launching');
  syncNav(); $('#launch-hint').textContent = `Opening the ${NAV[i][0]} launcher…`;
}
function watchLaunch(){
  const b = nav.busy; if (!b) return;
  const L = nav.L, it = L.items[b.i], view = nav.view, name = NAV[b.i][0];
  syncNav();
  if (b.cancelled || b.landed){ if (L.ready(it)) finishLaunch(b); return; }
  const phase = L.where(it), p = it.pearl;
  const hint = ['revealing','receding','opening'].includes(phase) ? `Opening the ${name} launcher…` : phase==='releasing' ? `${name}: draining the stasis chamber…` : phase==='launched' ? `${name}: pearl in flight…` : phase==='launching' ? `Launching ${name}…` : `${name}: dropping onto the slime launcher…`;
  if ($('#launch-hint').textContent!==hint) $('#launch-hint').textContent = hint;
  // The pearl lands once its whole sprite has left the viewport.
  const q = view.screenOf(p);
  if (phase === 'launched' && (p.gone || q.x+q.r < 0 || q.y+q.r < 0 || q.x-q.r > innerWidth || q.y-q.r > innerHeight)){
    b.landed = true; p.visible = false;
    $('#launch-hint').textContent = `Teleported to ${name}.`;
    b.cancelWarp = terrainScreen();
    navigate(b.href);
  }
}
function finishLaunch(b){
  if (nav.busy !== b) return;
  if (!nav.L.restock(nav.L.items[b.i])){ b.cancelled = true; return; }
  nav.busy = null; syncNav();
  nav.pads.forEach(p => { p.removeAttribute('aria-disabled'); p.classList.remove('launching'); }); $('#launch-hint').textContent = launchHint;
}
// The old between-dimensions screen: dark dirt and "Downloading terrain", held for half a second.
function terrainScreen(){
  const s = $('#terrain'); s.style.backgroundImage = `url("${R.dirtTexture()}")`; s.hidden = false;
  const t = setTimeout(() => { s.hidden = true; }, 500);
  return () => { clearTimeout(t); s.hidden = true; };
}

/* sidebar */
function buildSide(){
  side.innerHTML = `<label class="search"><span class="sr">Search components</span><input type="search" id="q" placeholder="Search components" autocomplete="off"></label>
    <nav aria-label="Catalogue"><a href="#/" data-r="home">Overview</a><a href="#/tests" data-r="tests">Tests dashboard</a><a href="#/rules" data-r="rules">Engine rules</a>
    ${C.CATEGORIES.map(c => `<p class="group"><a href="#/category/${slug(c)}" data-r="cat-${slug(c)}">${c}</a></p>${C.entries.filter(e=>e.category===c).map(e=>`<a class="item" href="#/c/${e.id}" data-r="c-${e.id}" data-name="${e.name.toLowerCase()} ${e.summary.toLowerCase()}">${e.name}<i data-dot="${e.id}"></i></a>`).join('')}`).join('')}</nav>`;
  $('#q').addEventListener('input', ev => { const q = ev.target.value.trim().toLowerCase(); side.querySelectorAll('a.item').forEach(a => a.hidden = q && !a.dataset.name.includes(q)); side.querySelectorAll('p.group').forEach(g => { let n = g.nextElementSibling, any = false; while (n && n.classList.contains('item')){ if (!n.hidden) any = true; n = n.nextElementSibling; } g.hidden = q && !any; }); });
}
const markDots = () => side.querySelectorAll('[data-dot]').forEach(i => { const r = results[i.dataset.dot]; i.className = r ? (r.every(x=>x.pass) ? 'ok' : 'bad') : ''; });
function setMenuOpen(open){ document.body.classList.toggle('nav-open', open); $('#menu').setAttribute('aria-expanded', open); }
$('#menu').addEventListener('click', () => setMenuOpen(!document.body.classList.contains('nav-open')));

/* helpers */
const clearViews = () => { for (const v of [...R.views]) if (!v.persistent) R.removeView(v); };
const describe = (w) => { const n = {}; let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9; for (const b of w.c.values()){ n[b.t]=(n[b.t]||0)+1; if (b.t==='ground') continue; x0=Math.min(x0,b.x); x1=Math.max(x1,b.x); y0=Math.min(y0,b.y); y1=Math.max(y1,b.y); z0=Math.min(z0,b.z); z1=Math.max(z1,b.z); }
  const P = [['piston','piston','pistons'],['observer','observer','observers'],['repeater','repeater','repeaters'],['comparator','comparator','comparators'],['torch','torch','torches'],['dust','dust','dust'],['sculk','sculk sensor','sculk sensors'],['slime','slime','slime'],['honey','honey','honey'],['lamp','lamp','lamps'],['rblock','redstone block','redstone blocks'],['barrel','barrel','barrels'],['trapdoor','trapdoor','trapdoors'],['wool','wool','wool']];
  return { parts: P.filter(([k])=>n[k]).map(([k,s,p])=>`${n[k]} ${n[k]===1?s:p}`).join(', '), foot: `${x1-x0+1} × ${y1-y0+1} × ${z1-z0+1} (w × d × h)`, blocks: w.c.size }; };
const ioState = (w, b) => { if (Array.isArray(b)) return b.map(x => ioState(w,x)).join(' · '); if (!b) return 'n/a';
  switch (b.t){ case 'lever': case 'button': case 'plate': return b.on ? 'on' : 'off'; case 'lamp': return b.lit ? 'lit' : 'dark'; case 'torch': return b.lit ? 'lit' : 'out';
    case 'sculk': return b.state + (b.on ? `, signal ${b.out}` : ''); case 'observer': return b.on ? 'pulse' : 'idle'; case 'comparator': return `signal ${b.out||0}${b.mode==='sub'?' (subtract)':''}`;
    case 'repeater': return `${b.delay}t ${b.on?'on':'off'}`; case 'piston': return b.ext ? 'extended' : 'retracted'; case 'rblock': return `at x=${b.x}`; case 'trapdoor': return b.open ? 'open' : 'shut'; case 'barrel': return `fill ${b.fill}`; default: return b.t; } };
const thumbScale = (box) => { const [x0,x1,y0,y1,z0,z1] = box, cols = x1-x0+1, rows = (z1-z0+1) + (y1-y0+1)*.72; return Math.max(4, Math.min(14, Math.floor(Math.min(240/cols, 140/rows)))); };
function thumb(el, e){ const built = e.build(C.defaults(e)); built.world.run(4); const keep = R.B; R.setScale(thumbScale(built.box)); const v = R.makeView(el, built, e.plaque ? { skip: b => b.plaque } : {}); v.draw(performance.now()); R.removeView(v); R.setScale(keep); }
const card = e => `<a class="card" href="#/c/${e.id}"><div class="thumb" data-thumb="${e.id}"></div><p class="kicker">${e.category}</p><h3>${e.name}</h3><p>${e.summary.split('. ')[0].replace(/\.$/,'')}.</p><p class="io">${e.inputs[0]} → ${e.outputs[0]}</p></a>`;
const fillThumbs = () => main.querySelectorAll('[data-thumb]').forEach(el => { const s = document.createElement('div'); s.className = 'stage'; el.appendChild(s); thumb(s, byId[el.dataset.thumb]); });
const setActive = key => { side.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.r === key)); setMenuOpen(false); };

/* pages */
function pageHome(){
  setActive('home'); document.title = 'Redstone kit: catalogue';
  const nTests = C.entries.reduce((n,e)=>n+C.testsOf(e).length,0);
  main.innerHTML = `<p class="label">catalogue</p><h1>Redstone kit<span>catalogue</span></h1>
    <p class="lede">A catalogue of redstone contraptions running on a small 3D tick engine. Each component is a parametric builder with named inputs and outputs and its own automated tests. Open one for a test bench: play, pause, step tick by tick, change parameters, and watch every input and output.</p>
    <dl class="stats"><div><dt>components</dt><dd>${C.entries.length}</dd></div><div><dt>categories</dt><dd>${C.CATEGORIES.length}</dd></div><div><dt>tests</dt><dd>${nTests}</dd></div></dl>
    ${C.CATEGORIES.map(c => `<section><div class="sec-head"><h2>${c}</h2><a href="#/category/${slug(c)}">View →</a></div><div class="grid">${C.entries.filter(e=>e.category===c).map(card).join('')}</div></section>`).join('')}`;
  fillThumbs();
}
function pageCategory(c){
  setActive('cat-'+slug(c)); document.title = `${c} · Redstone kit`;
  main.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Catalogue</a> / ${c}</nav><h1>${c}</h1><div class="grid">${C.entries.filter(e=>e.category===c).map(card).join('')}</div>`;
  fillThumbs();
}
function pageRules(){
  setActive('rules'); document.title = 'Engine rules · Redstone kit';
  main.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Catalogue</a> / Engine rules</nav><h1>Engine rules</h1>
    <p class="lede">The engine is a 3D tick simulation with Java-style behavior. These are the rules every component is built and tested against.</p>
    <ul class="rules">
      <li><b>Ticks.</b> 1 redstone tick is 100 ms. Torches flip 1 tick after their block changes. Repeaters delay 1 to 4 ticks, on both edges.</li>
      <li><b>Dust.</b> Loses 1 level per block, from 15. It powers what it points into and the blocks it points at (weakly). Dust next to a strongly powered block picks up power.</li>
      <li><b>Observers.</b> Pulse (on at +1 tick, off at +2) when the watched block changes or when the observer is moved.</li>
      <li><b>Pistons.</b> Push at most 12 blocks. Extensions resolve before retractions within a tick. Blocks moved this tick are in motion, so other pistons cannot grab them.</li>
      <li><b>Slime and honey.</b> Drag their neighbors, but not each other. Slime conducts power; honey does not. Immovable neighbors are skipped.</li>
      <li><b>Block dropping.</b> A sticky piston that retracts 1 tick after pushing leaves the blocks behind.</li>
      <li><b>Sculk sensors.</b> Hear vibrations (pistons, buttons, levers, footsteps) within 8 blocks unless wool is on the line. Vibrations travel about 1 block per game tick. Active 15 ticks, then a 5-tick cooldown. Signal strength falls with distance.</li>
      <li><b>Torches.</b> Turn off 1 tick after the block they hang on is powered. They power the components around them and strongly power the block directly above, so torch towers carry a signal upward.</li>
      <li><b>Comparators.</b> Read a barrel or a signal at the rear and the strongest dust, repeater or comparator at either side. Compare mode passes the rear unless a side is stronger; subtract mode outputs rear minus side.</li>
      <li><b>Redstone blocks.</b> Movable power sources that power adjacent components and dust, but not the face of a piston.</li>
      <li><b>Items and trapdoors.</b> Item entities use Java item physics (gravity 0.04, drag 0.98 per game tick, 2 game ticks per redstone tick). A slime block moved by a piston into an item launches it. Trapdoors open while powered.</li>
    </ul>
    <h2>Simplifications</h2>
    <ul class="rules">
      <li>Updates run per redstone tick in a fixed order. Java's block-event queue and 0-tick behavior are not modeled, so results that depend on same-tick ordering can differ.</li>
      <li>No quasi-connectivity, no dust on slopes, no torch burnout, and dust does not power the block beneath it. Comparators read barrels only.</li>
      <li>Some builders use wiring links (a feed block strongly powers listed cells) to stand in for vertical or buried wiring the engine cannot route. Each entry's notes say where.</li>
      <li>The sculk signal strength is an approximation by distance; frequency outputs are not modeled.</li>
      <li>Items are points with simple per-axis collision. Trapdoors are immovable top-half trapdoors.</li>
    </ul>
    <h2>Known constraints</h2>
    <ul class="rules">
      <li>Flying-machine columns that touch must move in lockstep. Offset neighbors line slime up against non-sticky blocks and glue together.</li>
      <li>A fully hidden flush opening is at most 2 blocks tall (or 2 wide). After a brick pulls in, it must slide into an empty neighbor.</li>
      <li>Sensors must sit more than 8 blocks from the pistons they drive, or the machine hears itself. Wool blocks a reset button's click.</li>
      <li>Use a repeater as a diode wherever dust would sit next to a strongly powered block in a feedback path.</li>
      <li>Two pistons cannot both push one slime plate: the first drags the second. Drive one through a honey spacer and retract it a tick earlier.</li>
      <li>Seeing 3 blocks deep through a 2-tall slot needs a low camera tilt.</li>
    </ul>`;
}
function pageTests(){
  setActive('tests'); document.title = 'Tests · Redstone kit';
  main.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Catalogue</a> / Tests</nav><h1>Tests dashboard</h1>
    <p class="lede">Every component ships with automated tests that run the real engine headlessly. Run them all here, or one component at a time from its bench.</p>
    <div class="toolbar"><button class="btn primary" id="runall" type="button">Run all tests</button><span id="sum" class="muted"></span></div>
    <div class="table-wrap"><table class="tests-table"><thead><tr><th>Component</th><th>Category</th><th>Tests</th><th>Result</th><th>Time</th></tr></thead><tbody>
    ${C.entries.map(e => `<tr data-id="${e.id}"><td><a href="#/c/${e.id}">${e.name}</a></td><td>${e.category}</td><td>${C.testsOf(e).length}</td><td class="res">${resText(e.id)}</td><td class="ms"></td></tr>`).join('')}</tbody></table></div>`;
  const runall = $('#runall'), table = $('.tests-table'), sum = $('#sum');
  runall.addEventListener('click', async () => { if (runall.disabled) return; runall.disabled = true;
    let p=0, f=0, t0 = performance.now(); sum.textContent = '';
    try {
      for (const e of C.entries){
        if (!table.isConnected) return;
        const row = table.querySelector(`tr[data-id="${e.id}"]`); row.querySelector('.res').textContent = 'running'; await new Promise(r => setTimeout(r, 10));
        if (!table.isConnected) return;
        const r = C.runTests(e); results[e.id] = r; r.forEach(x => x.pass ? p++ : f++); row.querySelector('.res').innerHTML = resText(e.id); row.querySelector('.ms').textContent = r.reduce((n,x)=>n+x.ms,0)+' ms'; markDots();
      }
      sum.textContent = `${p} passed, ${f} failed in ${Math.round(performance.now()-t0)} ms`;
    } finally { runall.disabled = false; }
  });
}
const resText = id => { const r = results[id]; if (!r) return '<span class="muted">not run</span>'; const ok = r.filter(x=>x.pass).length; return `<span class="${ok===r.length?'ok':'bad'}">${ok}/${r.length} pass</span>`; };

/* component bench */
let bench = null;
function pageComponent(e){
  setActive('c-'+e.id); document.title = `${e.name} · Redstone kit`;
  const i = C.entries.indexOf(e), prev = C.entries[i-1], next = C.entries[i+1];
  const params = C.defaults(e);
  main.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Catalogue</a> / <a href="#/category/${slug(e.category)}">${e.category}</a> / ${e.name}</nav>
    <div class="title-row"><h1>${e.name}</h1><span class="badge" id="badge">${resText(e.id)}</span></div>
    <p class="lede">${e.summary}</p>
    <div class="bench panel">
      <div class="transport" role="group" aria-label="Simulation">
        <button class="btn small" id="play" type="button" aria-pressed="false">Pause</button><button class="btn small" id="step" type="button" disabled>Step 1 tick</button><button class="btn small" id="reset" type="button">Reset</button>
        <label class="param">Speed <select id="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="4">4×</option></select></label>
        <span class="tick" id="tick">t = 0</span>
      </div>
      <div class="params" id="params"></div><div class="controls" id="controls"></div>
      <div class="scroller"><div class="stage" id="stage"></div></div>
      <p class="muted small">Shortcuts: space to pause or play, period to step while paused, R to reset.</p>
    </div>
    <div class="cols">
      <div class="panel"><h2 class="h3">Inputs and outputs</h2><table class="mon" id="mon"></table></div>
      <div class="panel"><h2 class="h3">Event log</h2><ol class="log" id="log" reversed></ol></div>
    </div>
    <div class="panel"><div class="sec-head"><h2 class="h3">Tests</h2><button class="btn small" id="runtests" type="button">Run tests</button></div><ul class="testlist" id="tests">${C.testsOf(e).map(t=>`<li><span class="st">not run</span> ${t.name}</li>`).join('')}</ul></div>
    <div class="cols">
      <div class="panel"><h2 class="h3">Spec</h2><dl class="spec"><dt>Inputs</dt><dd>${e.inputs.join(', ')}</dd><dt>Outputs</dt><dd>${e.outputs.join(', ')}</dd><dt>Timing</dt><dd>${e.timing}</dd><dt>Footprint</dt><dd id="foot"></dd><dt>Parts</dt><dd id="parts"></dd></dl></div>
      <div class="panel"><h2 class="h3">Notes and constraints</h2>${e.notes ? `<ul class="notes">${e.notes.map(n=>`<li>${n}</li>`).join('')}</ul>` : '<p class="muted">None.</p>'}</div>
    </div>
    <div class="panel"><h2 class="h3">Use it</h2><pre id="use"></pre></div>
    <nav class="pager" aria-label="Components">${prev ? `<a href="#/c/${prev.id}">← ${prev.name}</a>` : '<span></span>'}${next ? `<a href="#/c/${next.id}">${next.name} →</a>` : '<span></span>'}</nav>`;
  if (results[e.id]) showResults(e);
  const st = { e, params, paused:false, speed:1, acc:0, tilt: e.plaque ? 12 : 18, peel:0, walk:12, hold:0, view:null, built:null, prev:{}, log:[] };
  bench = st;
  const stage = $('#stage'), ctr = $('#controls'), pr = $('#params');
  const slider = (label, min, max, val, fn) => { const l = document.createElement('label'); l.className='param'; l.innerHTML = `${label} <input type="range" min="${min}" max="${max}" value="${val}"><output>${val}</output>`; const inp = $('input', l), o = $('output', l); inp.addEventListener('input', () => { o.textContent = inp.value; fn(+inp.value); }); return l; };
  for (const p of (e.params||[])){
    if (p.options){ const l = document.createElement('label'); l.className='param'; l.innerHTML = `${p.label} <select>${p.options.map(o=>`<option${o===p.def?' selected':''}>${o}</option>`).join('')}</select>`; $('select',l).addEventListener('change', ev => { params[p.key] = ev.target.value; mount(); }); pr.appendChild(l); }
    else pr.appendChild(slider(p.label, p.min, p.max, p.def, v => { params[p.key] = v; mount(); }));
  }
  const refresh = () => { st.sync(); st.view.draw(performance.now()); };
  const act = fn => () => { fn(); refresh(); };
  const mk = (text, fn, cls='') => { const b = document.createElement('button'); b.type='button'; b.className='btn small '+cls; b.textContent = text; b.addEventListener('click', act(fn)); ctr.appendChild(b); return b; };
  function drawView(){
    const built = st.built, walker = st.view && st.view.walker;
    if (st.view) R.removeView(st.view);
    stage.innerHTML = '';
    R.setScale(scaleFor(width()));
    const opt = { onTick: () => { if (st.hold > 0 && --st.hold === 0 && built.io.plate) built.io.plate.on = false; st.sync(); } };
    if (e.depth){ const F = built.F, inWall = b => b.y <= F && b.y >= F-4 && b.t !== 'ground', cut = () => F - st.peel;
      opt.T = Math.max(2, Math.round(R.B * st.tilt/100)); opt.ghost = b => inWall(b) && b.y > cut(); opt.tint = b => inWall(b) && b.y < cut() ? Math.min(.6, (cut()-b.y)*.15) : 0; if (e.plaque) opt.skip = b => b.plaque; }
    const v = st.view = R.makeView(stage, built, opt);
    if (walker) v.walker = walker;
    if (e.plaque) built.bands.forEach((z0,k) => { const r = v.front(0, built.F-3, z0+1); R.layer(stage, r.x, r.y, built.W*R.B, 2*R.B, 'layer plaque', `<div><b>Band ${k+1}</b> your text here</div>`); });
    for (const h of st.hits) R.hitAt(v, h.b.x, h.b.y, h.b.z, h.label, h.fn);
    v.draw(performance.now());
  }
  function mount(){
    if (st.view) st.view.walker = null;
    ctr.innerHTML = ''; st.prev = {}; st.log = []; st.walk = 12; st.hold = 0; st.acc = 0; st.hits = []; $('#log').innerHTML = '';
    const built = st.built = e.build(params); built.world.run(4);
    const d = describe(built.world); $('#foot').textContent = d.foot; $('#parts').textContent = d.parts;
    const hit = (b, label, fn) => st.hits.push({ b, label, fn });
    const fns = [];
    for (const c of e.controls){
      const b = built.io && built.io[c.io]; if (!b && c.kind!=='action') continue;
      if (c.kind==='lever'){ const btn = mk('', () => { b.on = !b.on; built.world.vibrate(b.x,b.y,b.z,'lever'); }); fns.push(() => { btn.textContent = `${c.label}: ${b.on?'on':'off'}`; btn.setAttribute('aria-pressed', b.on); }); hit(b, `${c.label} (click to flip)`, () => btn.click()); }
      if (c.kind==='button'){ const fire = () => { if (b.on) return; b.on = true; built.world.vibrate(b.x,b.y,b.z,'button'); built.world.at(built.world.t+10, () => { b.on = false; }); }; const btn = mk(c.label, fire); hit(b, c.label, () => btn.click()); }
      if (c.kind==='plate'){ const fire = () => { b.on = true; st.hold = 30; }; const btn = mk(c.label, fire); hit(b, c.label, () => btn.click()); }
      if (c.kind==='walk'){ const lab = document.createElement('span'); lab.className='muted small';
        const step = dd => { st.walk = Math.max(1, Math.min(14, st.walk+dd)); built.world.vibrate(b.x+1, b.y+st.walk, 0, 'step'); st.view.walker = { x:b.x+1, y:b.y+st.walk, at:performance.now() }; };
        mk('Step closer', () => step(-1)); mk('Step away', () => step(1)); ctr.appendChild(lab); fns.push(() => { lab.textContent = `visitor ${st.walk} blocks away`; }); }
      if (c.kind==='action') mk(c.label, () => c.fn(built));
      if (c.kind==='repeaters') b.forEach((r,k) => hit(r, `Repeater ${k+1}: tap to change delay`, act(() => { r.delay = r.delay%4+1; })));
    }
    if (e.depth){ ctr.appendChild(slider('Tilt', 10, 72, st.tilt, x => { st.tilt = x; drawView(); })); ctr.appendChild(slider('Peel', 0, 3, st.peel, x => { st.peel = x; st.view.draw(performance.now()); })); }
    const ioKeys = Object.keys(built.io||{}).filter(k => built.io[k]);
    $('#mon').innerHTML = `<tbody>${ioKeys.map(k => `<tr><th>${k}</th><td data-k="${k}"></td></tr>`).join('')}${e.monitor ? Object.keys(e.monitor(built)).map(k => `<tr><th>${k}</th><td data-m="${k}"></td></tr>`).join('') : ''}</tbody>`;
    const sync = () => {
      fns.forEach(f => f()); $('#tick').textContent = `t = ${built.world.t}`;
      for (const k of ioKeys){ const s = ioState(built.world, built.io[k]); $(`[data-k="${k}"]`).textContent = s; if (st.prev[k] !== undefined && st.prev[k] !== s) logLine(`${k} → ${s}`); st.prev[k] = s; }
      if (e.monitor){ const m = e.monitor(built); for (const k in m){ $(`[data-m="${k}"]`).textContent = m[k]; if (st.prev['m:'+k] !== undefined && st.prev['m:'+k] !== m[k]) logLine(`${k} → ${m[k]}`); st.prev['m:'+k] = m[k]; } }
    };
    const logLine = txt => { const li = document.createElement('li'); li.innerHTML = `<span>t${built.world.t}</span> ${txt}`; const log = $('#log'); log.prepend(li); while (log.children.length > 60) log.lastChild.remove(); };
    st.sync = sync; sync();
    $('#use').textContent = `const c = Catalogue.entries.find(e => e.id === '${e.id}').build(${JSON.stringify(params)});\n// inputs and outputs: c.io.${ioKeys.join(', c.io.')}\nsetInterval(() => c.world.tick(), 100);   // 1 redstone tick\nRSR.makeView(stageElement, c);              // draw it`;
    drawView();
  }
  st.mount = mount; st.redraw = drawView; mount();
  const play = $('#play'), stepB = $('#step');
  const setPaused = p => { st.paused = p; play.textContent = p ? 'Play' : 'Pause'; play.setAttribute('aria-pressed', p); stepB.disabled = !p; };
  play.addEventListener('click', () => setPaused(!st.paused));
  stepB.addEventListener('click', () => tickView(st.view));
  $('#reset').addEventListener('click', () => mount());
  $('#speed').addEventListener('change', ev => { st.speed = +ev.target.value; });
  const runtests = $('#runtests');
  runtests.addEventListener('click', () => { runtests.disabled = true; $('#tests').querySelectorAll('.st').forEach(s => s.textContent = 'running'); setTimeout(() => { if (bench !== st) return; results[e.id] = C.runTests(e); showResults(e); markDots(); runtests.disabled = false; }, 20); });
  st.setPaused = setPaused;
}
function showResults(e){ const r = results[e.id]; $('#tests').innerHTML = r.map(x => `<li class="${x.pass?'ok':'bad'}"><span class="st">${x.pass?'pass':'FAIL'}</span> ${x.name} <span class="muted">${x.ms} ms</span>${x.err?` <code>${x.err}</code>`:''}</li>`).join(''); $('#badge').innerHTML = resText(e.id); }

/* router */
let lastHash = null, current = null;
function refreshPresentation(){
  if (bench) bench.redraw();
  else if (main.querySelector('[data-thumb]')) route(true);
  for (const v of R.views) v.draw(performance.now());
}
function navigate(h){
  if (nav.busy && h !== nav.busy.href){ nav.busy.cancelled = true; if (nav.busy.cancelWarp) nav.busy.cancelWarp(); }
  current = h; try { if (location.hash !== h) history.pushState(null, '', h); } catch(e){} route();
}
function route(force){
  let h = current || location.hash || '#/'; if (!h.startsWith('#/')) h = lastHash || '#/';
  if (h === lastHash && !force) return; lastHash = h;
  clearViews(); bench = null; R.setScale(scaleFor(width()));
  const [, kind, id] = h.slice(1).split('/');
  if (kind === 'c' && byId[id]) pageComponent(byId[id]);
  else if (kind === 'category' && catOf(id)) pageCategory(catOf(id));
  else if (kind === 'tests') pageTests();
  else if (kind === 'rules') pageRules();
  else pageHome();
  if (!force) { main.focus({ preventScroll:true }); window.scrollTo(0,0); }
  if (nav.pads.length) markNav();
}
addEventListener('hashchange', () => { if (location.hash.startsWith('#/')){ navigate(location.hash); } });
addEventListener('popstate', () => { const h = location.hash || '#/'; if (!h.startsWith('#/')) return; navigate(h); });
document.addEventListener('click', ev => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return; const pad = ev.target.closest && ev.target.closest('a.pad'); if (pad){ ev.preventDefault(); launch(+pad.dataset.i); return; } const a = ev.target.closest && ev.target.closest('a[href^="#/"]'); if (!a) return; ev.preventDefault(); navigate(a.getAttribute('href')); });
addEventListener('keydown', ev => { if (!bench || ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (ev.key === ' ' && document.activeElement.tagName !== 'BUTTON'){ ev.preventDefault(); bench.setPaused(!bench.paused); }
  if (ev.key === '.' && bench.paused) tickView(bench.view);
  if (ev.key === 'r' || ev.key === 'R') bench.mount(); });

/* loop: bench honors pause and speed; theme ticks normally */
function tickView(v){ v.world.tick(); if (v.onTick) v.onTick(); R.markTick(); v.draw(performance.now()); }
let last = performance.now(), themeAcc = 0;
setInterval(() => { const now = performance.now(), dt = now - last; last = now;
  themeAcc += dt; while (themeAcc >= 100){ themeAcc -= 100; tickView(tv); if (nav.view) tickView(nav.view); watchLaunch(); }
  if (bench && bench.view && !bench.paused){ bench.acc += dt * bench.speed; let n = 0; while (bench.acc >= 100 && n++ < 8){ bench.acc -= 100; tickView(bench.view); } }
}, 25);
const frame = now => { for (const v of R.views) if (v.anim) v.draw(now); requestAnimationFrame(frame); };
requestAnimationFrame(frame);
buildSide(); route(); buildNav();
// Rebuild the wall when its width changes the block size (also covers a tab first laid out while hidden).
new ResizeObserver(() => { if (nav.view && navScale(nav.L) !== nav.view.B) buildNav(); }).observe($('#launch'));
let lw = innerWidth; addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(() => { if (innerWidth !== lw){ lw = innerWidth; refreshPresentation(); buildNav(); } }, 250); });
})();
