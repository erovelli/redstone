// Redstone kit renderer: fixed-perspective 3D views (front + top faces), sprites, depth tint/ghosting, sculk walkers.
(() => {
const { K, D } = window.RS;
const TICK = 100, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let B = 24, lastTick = performance.now();
const views = [];
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let pal = {}, cache = new Map();
const readPal = () => { pal = { floor: css('--floor'), line: css('--floor-line'), cavity: css('--cavity') }; cache = new Map(); };

/* ---------- sprites: 16x16 pixel art, cached, scaled with smoothing off ---------- */
const ANG = { N:0, E:Math.PI/2, S:Math.PI, W:-Math.PI/2 };
const FRONT = { U:'N', D:'S', E:'E', W:'W', S:'face', N:'back' }, TOP = { N:'N', S:'S', E:'E', W:'W', U:'face', D:'back' };
const mix = (a,b,t) => `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')})`;
const hex = h => { const n=parseInt(h.replace('#',''),16); return [n>>16&255, n>>8&255, n&255]; };
function art(key, fn){
  let c = cache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d'), R = (a,b,w,h,col) => { x.fillStyle = col; x.fillRect(a*2,b*2,w*2,h*2); };
  fn(R, x); cache.set(key, c); return c;
}
const rot = (x, d) => { x.translate(8,8); x.rotate(ANG[d]||0); x.translate(-8,-8); };
const stoneArt = (R,b='#85858c',hi='#a6a6ad',lo='#5f5f67') => { R(0,0,8,8,b); R(0,0,8,.5,hi); R(0,0,.5,8,hi); R(0,7.5,8,.5,lo); R(7.5,0,.5,8,lo); R(2,3,1,1,lo); R(5,5,1,1,lo); R(5,2,1,1,hi); R(1.5,6,1,.5,lo); };
function cubeArt(b, face){
  switch (b.t){
    case 'stone': return art('stone', R => stoneArt(R));
    case 'sculk': { const on = !!b.on; return face==='top' ? art('skT'+on, R => { R(0,0,8,8,'#123f45'); R(1,1,6,6,'#0d2e33'); const c = on ? '#5ff3f0' : '#1f8a90'; R(1,1,1,3,c); R(6,1,1,3,c); R(3.5,0.5,1,4,c); R(2,5,4,1.5,on?'#c8fffd':'#2a6c70'); }) : art('skF'+on, R => { R(0,0,8,8,'#0b2328'); R(0,0,8,1.5,'#155e63'); R(1,3,6,.5,'#123f45'); R(2,5,1,1,on?'#5ff3f0':'#1b5a60'); R(5,5,1,1,on?'#5ff3f0':'#1b5a60'); }); }
    case 'glass': return art('glass', R => { R(0,0,8,8,'rgba(190,230,250,.16)'); R(0,0,8,.5,'rgba(255,255,255,.75)'); R(0,0,.5,8,'rgba(255,255,255,.6)'); R(7.5,0,.5,8,'rgba(255,255,255,.35)'); R(0,7.5,8,.5,'rgba(255,255,255,.35)'); R(1.5,1.5,1,2.5,'rgba(255,255,255,.55)'); });
    case 'wool': return art('wool', R => { R(0,0,8,8,'#e4e0d8'); R(1,1,2,1,'#d0cbc1'); R(4,3,3,1,'#d0cbc1'); R(2,5,2,1,'#d0cbc1'); R(5,6,2,1,'#f4f1ea'); });
    case 'bricks': case 'wallb': return art('bricks', R => { R(0,0,8,8,'#8e8a84'); const m='#6a665f', h='#aaa59d'; R(0,3.5,8,.5,m); R(0,7.5,8,.5,m); R(3.5,0,.5,3.5,m); R(7.5,4,.5,3.5,m); R(0,0,3.5,.5,h); R(4,0,3.5,.5,h); R(0,4,7.5,.5,h); });
    case 'obsidian': { const lit = (b.station||b.feed) && (views.cur.strong.get(K(b.x,b.y,b.z))||0)>0;
      return art('obs'+lit, R => { R(0,0,8,8,'#1c1430'); R(1,2,2,1,'#3b2a60'); R(5,1,1,2,'#3b2a60'); R(4,5,3,1,'#2e2148'); R(1,6,1,1,'#4a3878'); if (lit){ R(2,2,4,4,'#ff3420'); R(3,3,2,2,'#ffb199'); } }); }
    case 'slime': return art('slime', R => { R(0,0,8,8,'#7bcb52'); R(2,2,4,4,'#58a835'); R(1,1,2,.5,'#b8f095'); R(1,1,.5,2,'#b8f095'); R(0,7.5,8,.5,'#4c9430'); });
    case 'honey': return art('honey', R => { R(0,0,8,8,'#f2a83a'); R(2,2,4,4,'#cf8614'); R(1,1,2,.5,'#ffd88a'); R(1,1,.5,2,'#ffd88a'); R(0,7.5,8,.5,'#b0700e'); });
    case 'barrel': if (b.d==='S' && face==='front') return art('barrelLid'+!!b.open, R => { R(0,0,8,8,'#6e4e2a'); R(.5,.5,7,7,'#9a7040'); R(1.5,1.5,5,5,'#6e4e2a'); if (b.open){ R(2,2,4,4,'#1b130a'); R(2,2,4,1,'#2b1f12'); } else { R(2,2,4,4,'#8a6334'); R(2,3.5,4,.5,'#6e4e2a'); R(2,5,4,.5,'#6e4e2a'); } R(.5,.5,7,.5,'#b88b54'); });
      if (b.crate && face==='front') return art('crate', R => { R(0,0,8,8,'#54361e'); R(0,0,8,1,'#bb8d50'); R(0,1,1,7,'#a4783f'); R(7,1,1,7,'#a4783f'); R(1,7,6,1,'#8e612f'); R(1,1,6,.5,'#d3a46d'); R(0,2,1,.5,'#423329'); R(7,2,1,.5,'#423329'); R(0,6,1,.5,'#423329'); R(7,6,1,.5,'#423329'); }); return face==='top' ? art('barrelT', R => { R(0,0,8,8,'#7a5530'); R(1,1,6,6,'#9a7040'); R(3,3,2,2,'#4e361b'); }) : art('barrelF', R => { R(0,0,8,8,'#9a7040'); R(0,2,8,.5,'#6e4e2a'); R(0,5.5,8,.5,'#6e4e2a'); R(2,0,.5,8,'#b88b54'); R(5.5,0,.5,8,'#b88b54'); });
    case 'lamp': return art('lamp'+!!b.lit, R => b.lit ? (R(0,0,8,8,'#ffd56e'), R(1,1,6,6,'#fff0b8'), R(3.5,0,1,8,'#f2b84a'), R(0,3.5,8,1,'#f2b84a')) : (R(0,0,8,8,'#6a4a2a'), R(1,1,6,6,'#55391e'), R(3.5,0,1,8,'#7b5833'), R(0,3.5,8,1,'#7b5833')));
    case 'ground': { const f = hex(pal.floor||'#cfc8b8'); return face==='top' ? art('gT'+pal.floor, R => { R(0,0,8,8,pal.floor); R(0,0,8,.5,pal.line); R(0,0,.5,8,pal.line); }) : art('gF'+pal.floor, R => { R(0,0,8,8,mix(f,[0,0,0],.38)); R(0,0,8,1,mix(f,[0,0,0],.18)); R(2,3,1,1,mix(f,[0,0,0],.5)); R(5,5,1,1,mix(f,[0,0,0],.5)); }); }
    case 'rblock': return art('rblock', R => { R(0,0,8,8,'#b0170c'); R(0,0,8,.5,'#e0402c'); R(0,0,.5,8,'#e0402c'); R(0,7.5,8,.5,'#6e0c05'); R(7.5,0,.5,8,'#6e0c05'); R(1.5,1.5,2,2,'#ff5a3c'); R(4.5,4.5,2,2,'#ff5a3c'); R(4.5,1.5,2,2,'#7c0f07'); R(1.5,4.5,2,2,'#7c0f07'); });
    case 'planks': return art('planks', R => { R(0,0,8,8,'#a4783f'); R(0,1.75,8,.25,'#6e4c24'); R(0,3.75,8,.25,'#6e4c24'); R(0,5.75,8,.25,'#6e4c24'); R(0,7.75,8,.25,'#6e4c24'); R(3,0,.25,1.75,'#6e4c24'); R(6,2,.25,1.75,'#6e4c24'); R(1.5,4,.25,1.75,'#6e4c24'); R(5,6,.25,1.75,'#6e4c24'); });
    case 'soulsand': return art('soulsand', R => { R(0,0,8,8,'#51402f'); R(0,0,8,.5,'#5f4c39'); [[1,1],[4.5,1.5],[2,4.5],[5.5,5]].forEach(([x,y]) => { R(x,y,2,1.5,'#3a2c20'); R(x+.5,y+.5,.5,.5,'#2a1f16'); R(x+1.5,y+.5,.5,.5,'#2a1f16'); }); R(0,7.5,8,.5,'#3a2c20'); });
    // Note block and jukebox: the same dark wood. The jukebox side has a slightly darker band, and its top a disc slot.
    case 'noteblock': return art('noteB', R => { R(0,0,8,8,'#6b4530'); R(0,0,8,.5,'#5a3826'); R(0,0,.5,8,'#5a3826'); R(0,7.5,8,.5,'#3f2619'); R(7.5,0,.5,8,'#3f2619');
        [[1,1.5],[4.5,1],[2.5,4],[6,3.5],[1,6],[4.5,6]].forEach(([x,y]) => { R(x,y,2,.5,'#7d5539'); R(x,y+.5,2,.5,'#55351f'); }); });
    case 'jukebox': return face==='top' ? art('jukeT', R => { R(0,0,8,8,'#6b4530'); R(0,0,8,.5,'#5a3826'); R(0,7.5,8,.5,'#3f2619'); R(1.5,1.5,5,5,'#55351f'); R(2,3.5,4,1,'#1c120c'); R(2,3.5,4,.5,'#2b1c13'); })
      : art('jukeS', R => { R(0,0,8,8,'#6b4530'); R(0,0,8,.5,'#5a3826'); R(0,0,.5,8,'#5a3826'); R(0,7.5,8,.5,'#3f2619'); R(7.5,0,.5,8,'#3f2619');
        [[1,1.5],[4.5,1],[2.5,4],[6,3.5],[1,6],[4.5,6]].forEach(([x,y]) => { R(x,y,2,.5,'#7d5539'); R(x,y+.5,2,.5,'#55351f'); }); R(.5,3.75,7,.5,'#4c2f20'); });
    // Dispenser side (the cobblestone side it shares with furnaces and droppers) and its smooth stone top.
    case 'dispenser': if (b.d==='S' && face==='front') return art('dispFront', R => { R(0,0,8,8,'#6b6b6b'); R(0,0,8,1.5,'#7e7e7e'); R(0,0,8,.5,'#9a9a9a'); R(0,7.5,8,.5,'#4f4f4f');
        R(.5,.5,.5,7,'#5a5a5a'); R(7,.5,.5,7,'#5a5a5a'); R(2,2.5,4,3.5,'#3b3b3b'); R(2.5,3,3,2.5,'#1a1a1a'); R(3,3,2,.5,'#2a2a2a'); R(2,2.5,4,.5,'#8a8a8a'); });
      return face==='top' ? art('dispT', R => { R(0,0,8,8,'#9a9a9a'); R(0,0,8,.5,'#b3b3b3'); R(0,0,.5,8,'#b3b3b3'); R(0,7.5,8,.5,'#7a7a7a'); R(7.5,0,.5,8,'#7a7a7a'); R(1,1,6,6,'#a2a2a2'); })
      : art('dispS', R => { R(0,0,8,8,'#6b6b6b');
        [[0,0,3,1.5,'#7d7d7d'],[3.5,0,4.5,1.5,'#767676'],[0,2,2,2,'#787878'],[2.5,2,3,1.5,'#828282'],[6,2,2,2.5,'#747474'],[0,4.5,3.5,1.5,'#7f7f7f'],[4,4,2,2.5,'#797979'],[6.5,5,1.5,1.5,'#828282'],[0.5,6.5,2.5,1.5,'#747474'],[3.5,7,4,1,'#7b7b7b']].forEach(([x,y,w,h,c]) => { R(x,y,w,h,c); R(x,y,w,.5,'#8c8c8c'); });
        R(0,0,8,.5,'#5a5a5a'); R(0,0,.5,8,'#5a5a5a'); R(0,7.5,8,.5,'#4f4f4f'); R(7.5,0,.5,8,'#4f4f4f'); });
    case 'wall': return art('wall', R => { R(0,0,8,8,'#4d4d56'); R(0,3.5,8,.5,'#3a3a42'); R(0,7.5,8,.5,'#3a3a42'); R(3.5,0,.5,3.5,'#3a3a42'); R(7.5,4,.5,3.5,'#3a3a42'); R(0,0,8,.5,'#5d5d67'); });
    case 'piston': { const v = (face==='top'?TOP:FRONT)[b.d], s=!!b.s, e=!!b.ext;
      if (v==='face') return art(`pf${s}${e}`, R => { R(0,0,8,8,'#b58b52'); R(0,0,8,.5,'#d0a873'); if (e){ R(1,1,6,6,'#3a3a40'); R(3,3,2,2,'#7d5d30'); } else { if (s) R(2,2,4,4,'#7bcb52'); R(3.5,3.5,1,1,'#7d5d30'); } });
      if (v==='back') return art('pb', R => { stoneArt(R,'#7c7c84'); R(2.5,2.5,3,3,'#55555c'); });
      return art(`ps${v}${s}${e}`, (R,x) => { rot(x,v); if (e){ R(0,2,8,6,'#7c7c84'); R(0,2,8,.5,'#9c9ca4'); R(3,0,2,2,'#7d5d30'); R(2,4,4,3,'#55555c'); } else { R(0,0,8,8,'#7c7c84'); R(0,0,8,2,'#b58b52'); if (s) R(2,0,4,2,'#7bcb52'); R(0,7.5,8,.5,'#55555c'); R(2,4,4,3,'#55555c'); R(3,2,2,2,'#5f5f67'); } }); }
    case 'head': { const v = (face==='top'?TOP:FRONT)[b.d], s=!!b.s;
      if (v==='face'||v==='back') return art(`hf${s}`, R => { R(0,0,8,8,'#b58b52'); R(0,0,8,.5,'#d0a873'); if (s && v==='face') R(2,2,4,4,'#7bcb52'); });
      return art(`hs${v}${s}`, (R,x) => { rot(x,v); R(3,2,2,6,'#7d5d30'); R(0,0,8,2,'#b58b52'); if (s) R(2,0,4,2,'#7bcb52'); }); }
    case 'observer': { const v = (face==='top'?TOP:FRONT)[b.d], on=!!b.on;
      if (v==='face') return art('of', R => { R(0,0,8,8,'#38383e'); R(1,2,2,2,'#141418'); R(5,2,2,2,'#141418'); R(2,5.5,4,1,'#5c5c63'); });
      if (v==='back') return art('ob'+on, R => { R(0,0,8,8,'#5c5c63'); R(3,3,2,2, on?'#ff3420':'#4a100b'); });
      return art(`os${v}${on}`, (R,x) => { rot(x,v); R(0,0,8,8,'#5c5c63'); R(0,0,8,3,'#38383e'); R(1,1,2,1,'#141418'); R(5,1,2,1,'#141418'); R(3,6,2,2, on?'#ff3420':'#4a100b'); }); }
  }
  return null;
}
const DOFF=[74,16,11], DON=[255,52,32];
function flatArt(b){
  switch (b.t){
    case 'dust': { const lv=b.lvl||0, pts=(b.pts||[]).join(''); return art(`d${lv}${pts}`, R => { const c=mix(DOFF,DON,lv/15); R(3,3,2,2,c); for (const d of b.pts||[]){ if (d==='N') R(3.25,0,1.5,3,c); if (d==='S') R(3.25,5,1.5,3,c); if (d==='W') R(0,3.25,3,1.5,c); if (d==='E') R(5,3.25,3,1.5,c); } }); }
    case 'repeater': case 'comparator': { const lit = b.t==='repeater' ? !!b.on : b.out>0, dl = b.delay||1, sub = b.mode==='sub';   // comparator: front torch lit in subtract mode
      return art(`${b.t}${b.d}${lit}${dl}${sub}`, (R,x) => { rot(x,b.d); R(0,0,8,8,'#b4b4ba'); R(0,0,8,.5,'#d0d0d6'); R(0,7.5,8,.5,'#8e8e96'); const on='#ff3420', off='#6a1d16';
        if (b.t==='repeater'){ R(3,1,2,2, lit?on:off); R(3,2+dl,2,2, lit?on:off); } else { R(3,1,2,2, sub?on:off); R(1,5,2,2, lit?on:off); R(5,5,2,2, lit?on:off); } }); }
    case 'plate': return art('plate'+!!b.on, R => b.on ? (R(1,1,6,6,'#7a7a82'), R(1,1,6,.5,'#5f5f67')) : (R(1,1,6,6,'#a6a6ad'), R(1,6.5,6,.5,'#6f6f77'), R(1,1,6,.5,'#c4c4ca')));
    case 'torch': return art('torch'+!!b.lit, R => { R(3.5,2,1,5,'#7d5d30'); R(3,1,2,2, b.lit?'#ff4a2a':'#5a1a14'); });
    case 'button': return art('btn'+!!b.on, R => b.on ? (R(2.5,2.5,3,3,'#6f6f77')) : (R(2,2,4,4,'#a6a6ad'), R(2,5.5,4,.5,'#6f6f77')));
    case 'lever': return art('leverbase', R => { R(2,2,4,4,'#6e6e76'); R(2,2,4,.5,'#8e8e96'); });
  }
  return null;
}
const FLAT = new Set(['dust','repeater','comparator','plate','torch','lever','button']);

// Where to draw an entity part way through a tick. A push by a moving block and the entity's
// next game ticks of flight all happen within one tick, so hold the entity in place until the
// block's leading face reaches it, then move it to where the tick leaves it.
function entityAt(en, p, t){
  const h = en.hit, u = h && h.t === t-1 && p < 1 ? (p <= h.at ? 0 : (p - h.at)/(1 - h.at)) : p;
  return [en.px+(en.x-en.px)*u, en.py+(en.y-en.py)*u, en.pz+(en.z-en.pz)*u];
}
function drawPearl(ctx, sx, sy, VB, sc){
  const rr = VB*.2*sc;
  ctx.save(); ctx.shadowColor = 'rgba(80,220,190,.7)'; ctx.shadowBlur = VB*.3*sc;
  ctx.fillStyle = '#0d4f47'; ctx.beginPath(); ctx.arc(sx, sy-rr, rr, 0, 7); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#1fa38f'; ctx.beginPath(); ctx.arc(sx, sy-rr, rr*.68, 0, 7); ctx.fill();
  ctx.fillStyle = '#062420'; ctx.beginPath(); ctx.arc(sx, sy-rr, rr*.3, 0, 7); ctx.fill();
  ctx.fillStyle = '#b8fff0'; ctx.fillRect(sx-rr*.55, sy-rr*1.6, rr*.35, rr*.35);
}

/* ---------- views ---------- */
function makeView(stage, scene, opt={}){
  const VB = opt.B || B;
  const [x0,x1,y0,y1,z0,z1] = scene.box;
  const T = opt.T || window.__T;
  const S = opt.shear || 0;
  const W = (x1-x0+1)*VB + (y1-y0+1)*S, H = (z1-z0+1)*VB + (y1-y0+1)*T;
  const extraW = opt.width ? Math.max(opt.width, W) : W;
  stage.style.width = extraW+'px'; stage.style.height = H+'px';
  const cv = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio||1);
  cv.width = W*dpr; cv.height = H*dpr; cv.style.width = W+'px'; cv.style.height = H+'px';
  stage.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.scale(dpr,dpr); ctx.imageSmoothingEnabled = false;
  const v = { stage, scene, world:scene.world, ctx, W, H, box:scene.box, onTick:opt.onTick, skip:opt.skip, under:opt.under, ghost:opt.ghost, tint:opt.tint, anim:false, T, B:VB, hinges:new WeakMap() };
  v.front = (x,y,z) => ({ x:(x-x0)*VB+(y+1-y0)*S, y:(z1-z)*VB + (y+1-y0)*T });
  v.plane = (x,y,z) => ({ x:(x-x0)*VB+(y-y0)*S, y:(z1-z+1)*VB + (y-y0)*T });
  v.draw = (now) => {
    const w = v.world, p = reduce ? 1 : Math.min(1, (now-lastTick)/TICK);
    views.cur = w;
    ctx.clearRect(0,0,W,H);
    if (v.under) v.under(ctx);
    const list = [];
    for (const b of w.c.values()){ if (b.x<x0||b.x>x1||b.y<y0||b.y>y1||b.z<z0||b.z>z1) continue; if (v.skip && v.skip(b)) continue; list.push(b); }
    const OPQ = new Set(['wallb','bricks','obsidian','ground','stone','dispenser','noteblock','jukebox']);
    const solid = (x,y,z) => { const n = w.get(x,y,z); return n && OPQ.has(n.t) && !(v.ghost && v.ghost(n)) && !(v.skip && v.skip(n)) && !(n.mv && n.mv.t===w.t-1); };
    for (let i=list.length-1;i>=0;i--){ const b=list[i]; if (OPQ.has(b.t) && !(b.mv && b.mv.t===w.t-1) && solid(b.x,b.y+1,b.z) && solid(b.x,b.y,b.z+1)) list.splice(i,1); }
    list.sort((a,b) => a.y-b.y || a.z-b.z);
    let moving = false;
    ctx.save();
    if (opt.apertures){ ctx.beginPath(); opt.apertures.forEach(([x,y,w,h])=>ctx.rect(x,y,w,h)); ctx.clip(); }
    for (const b of list){
      let o = [0,0,0];
      if (b.mv && b.mv.t===w.t-1 && p<1){ const d=D[b.mv.d]; o=[-d[0]*(1-p), -d[1]*(1-p), -d[2]*(1-p)]; moving=true; }
      if (b.t==='head' && b.p && b.p.mvAt===w.t-1 && p<1){ const d=D[b.d]; o=[-d[0]*(1-p), -d[1]*(1-p), -d[2]*(1-p)]; moving=true; }
      const ox = o[0]*VB+o[1]*S, oy = o[1]*T - o[2]*VB;
      const gh = v.ghost && v.ghost(b); if (gh) ctx.globalAlpha = opt.ghostOpacity ?? .1;
      const tn = (!gh && v.tint) ? v.tint(b) : 0;
      if (FLAT.has(b.t)){
        const q = v.plane(b.x,b.y,b.z), img = flatArt(b);
        if (img) ctx.drawImage(img, q.x+ox, q.y+oy, VB, T);
        if (b.t==='lever'){ ctx.fillStyle='#b58b52'; const bx=q.x+ox+VB/2, by=q.y+oy+T/2, s=VB/16, dir=b.on?1:-1; for (let i=0;i<5;i++) ctx.fillRect(bx+dir*i*s*1.1-s, by-i*s*2.4-s*2, s*2, s*2.6); ctx.fillStyle='#4a3219'; ctx.fillRect(bx+dir*5*s*1.1-s*1.5, by-12*s-s*2, s*3, s*3); }
        if (b.t==='torch' && b.lit){ ctx.fillStyle='rgba(255,90,40,.25)'; ctx.fillRect(q.x+ox, q.y+oy, VB, T); }
        if (tn){ ctx.fillStyle=`rgba(8,6,14,${tn})`; ctx.fillRect(q.x+ox, q.y+oy, VB, T); }
        ctx.globalAlpha = 1; continue;
      }
      const f = v.front(b.x,b.crate ? b.y+1 : b.y,b.z);
      if (b.t==='trapdoor'){ const img = art('trap', R => { R(0,0,8,8,'#a4783f'); R(0,0,8,.5,'#c9a06a'); R(1,1,2,2,'#5c3e1c'); R(5,1,2,2,'#5c3e1c'); R(1,5,2,2,'#5c3e1c'); R(5,5,2,2,'#5c3e1c'); R(0,7.5,8,.5,'#6e4c24'); });
        if (b.hinge){
          let h = v.hinges.get(b);
          const target = b.open ? 1 : 0;
          if (!h){ h = {target,from:target,at:now}; v.hinges.set(b,h); }
          const value = h.from + (h.target-h.from)*Math.min(1,(now-h.at)/100);
          if (h.target!==target){ h.from=value; h.target=target; h.at=now; }
          const u = reduce ? target : h.from+(target-h.from)*Math.min(1,(now-h.at)/100), angle = u*Math.PI/2;
          ctx.save(); ctx.transform(VB/16,0,S*Math.cos(angle)/16,(T*Math.cos(angle)+VB*Math.sin(angle))/16,f.x+ox-S,f.y+oy-T); ctx.drawImage(img,0,0); ctx.restore();
          if (Math.abs(u-target)>.001) moving = true;
          ctx.globalAlpha = 1; continue;
        }
        if (b.open){ ctx.globalAlpha = gh ? .1 : .95; ctx.drawImage(img, f.x+ox, f.y+oy-T*.82, VB, VB); }
        else { ctx.drawImage(img, f.x+ox, f.y+oy-T, VB, T); ctx.drawImage(img, 0, 0, 16, 3, f.x+ox, f.y+oy, VB, VB*.19); }
        ctx.globalAlpha = 1; continue; }
      const top = cubeArt(b,'top'), fr = cubeArt(b,'front');
      if (b.t==='lamp' && b.lit){ ctx.fillStyle='rgba(255,210,100,.28)'; ctx.fillRect(f.x+ox-VB*.25, f.y+oy-T-VB*.25, VB*1.5, VB*1.5+T); }
      if (top){ ctx.save(); ctx.transform(VB/16,0,S/16,T/16,f.x+ox-S,f.y+oy-T); ctx.drawImage(top,0,0); ctx.restore(); }
      if (fr) ctx.drawImage(fr, f.x+ox, f.y+oy, VB, VB);
      if (!S && top && b.t!=='head'){ ctx.fillStyle='rgba(255,255,255,.10)'; ctx.fillRect(f.x+ox, f.y+oy-T, VB, T); }
      if (tn){ ctx.fillStyle=`rgba(8,6,14,${tn})`; ctx.fillRect(f.x+ox, f.y+oy-T, VB, VB+T); }
      if (b.t==='sculk' && b.on){ ctx.fillStyle='rgba(95,243,240,.22)'; ctx.fillRect(f.x+ox-VB*.3, f.y+oy-T-VB*.3, VB*1.6, VB*1.6+T); }
      if (gh){ ctx.globalAlpha = 1; ctx.strokeStyle='rgba(160,160,180,.35)'; ctx.strokeRect(f.x+ox+.5, f.y+oy+.5, VB-1, VB-1); }
    }
    ctx.restore();
    const pt = (X,Y,Z) => [(X-x0)*VB+(Y-y0)*S, (z1+1-Z)*VB + (Y-y0)*T];
    if (v.walker && v.walker.y <= y1+1){ const [sx,sy] = pt(v.walker.x+.5, v.walker.y+.5, 0), age = (now - v.walker.at)/400;
      if (age < 1){ ctx.strokeStyle=`rgba(95,243,240,${1-age})`; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(sx, sy, VB*(.3+age*.9), T*(.3+age*.9), 0, 0, 7); ctx.stroke(); moving = true; }
      const u = VB/8; ctx.fillStyle='#e9e5de'; ctx.fillRect(sx-1.5*u, sy-7*u, 3*u, 3*u); ctx.fillStyle='#2b6f8a'; ctx.fillRect(sx-2*u, sy-4*u, 4*u, 3.5*u); ctx.fillStyle='#38383e'; ctx.fillRect(sx-2*u, sy-.5*u, 1.5*u, 1.5*u); ctx.fillRect(sx+.5*u, sy-.5*u, 1.5*u, 1.5*u); }
    for (const en of (w.entities||[])){ if (en.gone || (opt.entityFilter && !opt.entityFilter(en))) continue;
      const [X, Y, Z] = entityAt(en, p, w.t), [sx,sy] = pt(X, Y, Z);
      if (Math.hypot(en.vx,en.vy,en.vz) > .001 || en.x!==en.px || en.z!==en.pz) moving = true;
      drawPearl(ctx, sx, sy, VB, 1 + Math.max(0, Y - (y1+1)) * .5); }
    for (const vb of w.vibs){ const pp = (w.t-1+p - vb.t0)/(vb.t1-vb.t0); if (pp < 0 || pp > 1) continue;
      const P3 = vb.from.map((c,i)=> c+.5 + (vb.to[i]-c)*pp), [sx,sy] = pt(P3[0], P3[1], P3[2]-.5+.5);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI/4); ctx.shadowColor='#5ff3f0'; ctx.shadowBlur=VB*.5; ctx.fillStyle='#bffcfa'; ctx.fillRect(-VB*.12,-VB*.12,VB*.24,VB*.24); ctx.restore(); moving = true; }
    v.anim = moving;
  };
  views.push(v);
  return v;
}
/* ---------- navigation wall ---------- */
// The launcher wall uses the bench renderer: front and top faces, brick sprites, and depth tint for
// blocks set back in the wall, the same way the hidden plaque shows its recesses. The pearl is
// drawn on a page overlay with the bench's pearl sprite so it can fly past the wall's edge.
function makeNavView(stage, L, opt={}){
  const VB = opt.B || 24, T = Math.max(2, Math.round(VB*.14));
  const v = makeView(stage, L, { B:VB, T, skip:b => b.buried || b.t==='water' || b.t==='button', tint:b => b.t==='rblock' ? .45 : b.y < 0 ? Math.min(.6, -b.y*.2) : 0, entityFilter:() => false });
  const [x0,,y0,,,z1] = L.box, sky = opt.overlay, dpr = Math.min(2, window.devicePixelRatio||1), base = v.draw;
  stage.style.height = '';
  v.nav = true;
  const at = (X, Y, Z) => ({ x:(X-x0)*VB, y:(z1+1-Z)*VB + (Y-y0)*T });
  // Viewport position of an entity's centre, for detecting when the pearl leaves the screen.
  v.screenOf = en => { const r = v.ctx.canvas.getBoundingClientRect(), q = at(en.x, en.y, en.z); return { x:r.left+q.x, y:r.top+q.y-VB*.2, r:VB*.2 }; };
  v.draw = now => {
    base(now);
    if (!sky) return;
    const sctx = sky.getContext('2d'), p = reduce ? 1 : Math.min(1, (now-lastTick)/TICK);
    if (sky.width !== innerWidth*dpr || sky.height !== innerHeight*dpr){ sky.width = innerWidth*dpr; sky.height = innerHeight*dpr; sky.style.width = innerWidth+'px'; sky.style.height = innerHeight+'px'; }
    sctx.setTransform(dpr,0,0,dpr,0,0); sctx.clearRect(0,0,innerWidth,innerHeight);
    const r = v.ctx.canvas.getBoundingClientRect();
    // Stasis chambers: the water block in front of the wall (the dispenser shows through it), bubbles while the soul
    // sand is under it, the pearl while it is held in stasis, and the button above.
    const ctx = v.ctx, tsec = now/1000, w = v.world;
    for (const it of L.items || []){
      const en = it.pearl, wb = w.get(it.xc, 1, 0), wet = !!wb && wb.t==='water';
      const f = v.front(it.xc, 1, 0), x = f.x, y = f.y;
      if (wet){
        const column = w.bubbleColumn(it.xc+.5, 1.5, .5);
        if (column) for (let k=0;k<6;k++){ const ph = (tsec*.9 + k/6) % 1, bx = x + VB*(.18 + ((k*37)%60)/100), by = y + VB*(1-ph), sz = Math.max(1.5, VB/16*(k%2 ? 1.5 : 1));
          ctx.fillStyle = `rgba(210,235,255,${.8*(1-ph*.6)})`; ctx.fillRect(Math.round(bx), Math.round(by), sz, sz); }
        if (!en.gone && !en.visible){ const bob = Math.sin(tsec*2.4 + it.i)*.05; drawPearl(ctx, x+VB/2, y+VB*(.66+bob), VB, 1); }
        // water: front and top faces, translucent, with moving light streaks
        ctx.fillStyle = 'rgba(52,104,214,.48)'; ctx.fillRect(x, y, VB, VB);
        ctx.fillStyle = 'rgba(90,140,235,.55)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x+VB, y); ctx.lineTo(x+VB, y-v.T); ctx.lineTo(x, y-v.T); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(180,210,255,.4)';
        for (let k=0;k<3;k++){ const w1 = y + VB*((k/3 + tsec*.15) % 1), w2 = y + VB*((k/3 + .17 + tsec*.15) % 1);
          ctx.fillRect(x+VB*.1, Math.round(w1), VB*.35, Math.max(1, VB/24)); ctx.fillRect(x+VB*.55, Math.round(w2), VB*.3, Math.max(1, VB/24)); }
      }
      // stone button on the wall face above the chamber
      const bf = v.front(it.xc, 0, 1), on = it.button.on, bw = VB*6/16, bh = VB*4/16, d = on ? VB/32 : VB/12;
      const bx = bf.x + (VB-bw)/2, by = bf.y + (VB-bh)/2;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(bx+d, by+d, bw, bh);
      ctx.fillStyle = on ? '#7f7f7f' : '#9c9c9c'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = on ? '#6a6a6a' : '#b8b8b8'; ctx.fillRect(bx, by, bw, Math.max(1, VB/32));
    }
    v.anim = true;   // bubbles, water and the floating pearl keep moving
    for (const snd of (L.sounds || [])){ if (snd.seen === undefined){ snd.seen = now; if (opt.onSound) opt.onSound(snd); } }
    if (L.sounds && L.sounds.length > 16) L.sounds.splice(0, L.sounds.length - 4);
    // Note particles: every note a cover plays floats up from that block, colored by pitch as in the game.
    for (const n of (L.notes || [])){
      if (n.seen === undefined){ n.seen = now; if (opt.onNote && (n.k === undefined)) opt.onNote(n); }
      const age = (now - n.seen)/700; if (age >= 1) continue;
      const q = at(n.x+.5, 0, n.z+1+age*.8), a = 1-age; v.anim = true;
      drawNote(sctx, r.left+q.x, r.top+q.y, VB*.42, noteColor(n.pitch), a);
    }
    if (L.notes && L.notes.length > 48){ const keep = L.notes.filter(n => n.seen === undefined || now - n.seen < 700); L.notes.length = 0; L.notes.push(...keep); }
    for (const en of v.world.entities){ if (en.gone || !en.visible) continue;
      const q = at(...entityAt(en, p, v.world.t));
      if (Math.hypot(en.vx,en.vy,en.vz) > .001 || en.x!==en.px || en.z!==en.pz) v.anim = true;
      drawPearl(sctx, r.left+q.x, r.top+q.y, VB, 1); }
  };
  return v;
}
// The note particle's color for a pitch 0..24, as the game computes it.
const noteColor = pitch => { const p = pitch/24, c = o => Math.round(255*Math.max(0, Math.sin((p+o)*Math.PI*2)*.65+.35)); return `rgb(${c(0)},${c(1/3)},${c(2/3)})`; };
// A pixel-art eighth note (5x7 pixels), centred on (x,y).
function drawNote(ctx, x, y, size, color, alpha){
  const u = size/7, px = [[3,0],[4,0],[3,1],[4,1],[3,2],[3,3],[3,4],[1,4],[2,4],[0,5],[1,5],[2,5],[3,5],[0,6],[1,6],[2,6]];
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; for (const [a,b] of px) ctx.fillRect(Math.round(x+(a-2.5)*u+u*.6), Math.round(y+(b-3.5)*u+u*.6), Math.ceil(u), Math.ceil(u));
  ctx.fillStyle = color; for (const [a,b] of px) ctx.fillRect(Math.round(x+(a-2.5)*u), Math.round(y+(b-3.5)*u), Math.ceil(u), Math.ceil(u));
  ctx.restore();
}
// The old between-dimensions background: a dirt tile.
const dirtTexture = () => art('dirt', R => { R(0,0,8,8,'#866043'); [[1,1,'#593d29'],[5,0.5,'#b9855c'],[3,3,'#6c4a30'],[6.5,4,'#593d29'],[0.5,5.5,'#966c4a'],[4,6.5,'#593d29'],[2,4.5,'#b9855c'],[6,7,'#79553a'],[7,2,'#6c4a30'],[2.5,0,'#79553a']].forEach(([x,y,c]) => R(x,y,1,.5,c)); }).toDataURL();

function hitAt(v, x, y, z, label, fn, extra){
  const T = v.T, B = v.B, q = v.plane(x,y,z), h = document.createElement('button'); h.className='hit'; h.type='button';
  Object.assign(h.style, { left:q.x+'px', top:(q.y-B*.55)+'px', width:B+'px', height:(T+B*.55)+'px' });
  h.setAttribute('aria-label', label); h.addEventListener('click', fn); if (extra) extra(h); v.stage.appendChild(h); return h;
}
const walkers = [];
function addWalker(v, s){ const wk = { v, s, y:null }; walkers.push(wk); return wk; }
function stepWalkers(){
  for (const wk of walkers){
    const { v, s } = wk; if (!v.stage.isConnected) continue;
    const r = v.stage.getBoundingClientRect(), ref = r.top + Math.min(r.height*.2, 160);   // footsteps get closer as the section rises into view
    const n = Math.max(1, Math.min(30, Math.round((ref - innerHeight*.78) / (B*1.1)))), ty = s.y + n;
    if (wk.y === null){ wk.y = ty; continue; }
    if (ty === wk.y) continue;
    const dir = Math.sign(ty - wk.y); let k = 0;
    while (wk.y !== ty && k++ < 4){ wk.y += dir; v.world.vibrate(s.x+1, wk.y, 0, 'step'); }
    wk.y = ty; v.walker = { x:s.x+1, y:wk.y, at:performance.now() };
  }
}
function pressButton(w, b){ if (b.on) return; b.on = true; w.vibrate(b.x,b.y,b.z,'button'); w.at(w.t+10, () => { b.on = false; }); }
function sculkHits(v, s, b, what){
  hitAt(v, s.x, s.y, 0, `Sculk sensor for ${what}: tap to make a noise next to it`, () => { v.world.vibrate(s.x+1, s.y+1, 0, 'tap'); v.walker = { x:s.x+1, y:s.y+1, at:performance.now() }; });
  hitAt(v, b.x, b.y, 0, `Reset button for the ${what} latch`, () => pressButton(v.world, b));
}
function layer(stage, l, t, w, h, cls, html){ const d=document.createElement('div'); d.className=cls; Object.assign(d.style,{left:l+'px',top:t+'px',width:w+'px',height:h+'px'}); d.innerHTML=html; stage.appendChild(d); return d; }
function tag(stage, l, t, text){ const s=document.createElement('span'); s.className='tag'; s.style.left=l+'px'; s.style.top=t+'px'; s.textContent=text; stage.appendChild(s); }

function setScale(b){ B = b; window.__T = Math.round(b*.72); const r = document.documentElement; r.style.setProperty('--b', B+'px'); r.style.setProperty('--t', window.__T+'px'); }
function removeView(v){ const i = views.indexOf(v); if (i>=0) views.splice(i,1); const j = walkers.findIndex(k => k.v===v); if (j>=0) walkers.splice(j,1); }
function tick(filter){ lastTick = performance.now(); for (const v of views){ if (filter && !filter(v)) continue; v.world.tick(); if (v.onTick) v.onTick(); v.draw(lastTick); } }
function startLoop(filter){ setInterval(() => tick(filter), TICK); const frame = now => { for (const v of views) if (v.anim && (!filter || filter(v))) v.draw(now); requestAnimationFrame(frame); }; requestAnimationFrame(frame); }
function markTick(){ lastTick = performance.now(); }
window.RSR = { makeNavView, dirtTexture, markTick, makeView, removeView, hitAt, layer, tag, views, walkers, setScale, readPal, startLoop, tick, pressButton, addWalker, stepWalkers, sculkHits, get B(){ return B; }, get T(){ return window.__T; } };
})();
