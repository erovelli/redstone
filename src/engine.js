// Tick-based 3D redstone engine. x = east, y = toward the viewer (N = away), z = up. 1 tick = 100 ms.
const D = { N:[0,-1,0], E:[1,0,0], S:[0,1,0], W:[-1,0,0], U:[0,0,1], D:[0,0,-1] };
const OPP = { N:'S', S:'N', E:'W', W:'E', U:'D', D:'U' };
const DL = ['N','E','S','W','U','D'], HL = ['N','E','S','W'];
const K = (x,y,z) => ((x+512)*1024 + (y+512))*1024 + (z+512);
const CONDUCT = new Set(['bricks','wallb','stone','obsidian','lamp','barrel','slime','ground','wall']);
const MOVABLE = new Set(['rblock','wool','bricks','stone','slime','honey','lamp','observer','piston','planks','noteblock']);
const STICKY = new Set(['slime','honey']);
const NONSOLID = new Set(['dust','repeater','comparator','torch','lever','button','plate','sculk']);
const live = (b, t) => !(b.t==='piston' && b.ext) && !(b.mv && b.mv.t===t);

// Torch RS latch. A at (ox,oy); output Q on the dust row (ox..ox+3, oy-2*s). s=1: dust row north, inputs south; s=-1 mirrored.
function addLatch(w, ox, oy, s=1, opt={}){
  const N = s===1 ? 'N' : 'S', Sd = s===1 ? 'S' : 'N', P = (u,v,t,o={}) => w.put(ox+u, oy+v*s, 0, t, o);
  P(0,0,'stone'); P(1,0,'torch',{att:'W',lit:true}); P(2,0,'repeater',{d:'E',delay:1,on:true,inp:true}); P(3,0,'stone');
  P(3,-1,'torch',{att:Sd,lit:false});
  for (let u=0;u<4;u++) P(u,-2,'dust');
  P(0,-1,'repeater',{d:Sd,delay:1});
  P(0,1,'repeater',{d:N,delay:1}); const sensor = opt.set==='button' ? P(0,2,'button',{on:false,att:'D'}) : P(0,2,'sculk');
  P(3,1,'repeater',{d:N,delay:1}); const button = P(3,2,'button',{on:false,att:'D'});
  if (opt.set!=='button'){ P(1,2,'wool'); P(2,2,'wool'); }
  return { sensor, set:sensor, button, reset:button, tB:w.get(ox+3, oy-s, 0), qRow: oy-2*s };
}
// Open/close sequencer. Lever L at (bx,by-1) feeding dust at (bx,by). Outputs are high while closed.
// Lever on: P1 falls (~2t), P2 (~5t), P3 (~10t). Lever off: P3 rises (~2t), P2 (~5t), P1 (~11t).
// P1 = NOT(L OR L+8)  (torch AND gate) ; P2 = S+4 ; P3 = S OR S+8 (two repeaters into one block) ; S = NOT L.
// An extra source (e.g. a latch) can drive L through a repeater placed at (bx-4,by) facing east.
function addSequencer(w, bx, by, opt={}){
  const Bp = (u,v,t,o={}) => w.put(bx+u,by+v,0,t,o), out = opt.out || 'feed';
  const sink = (u,v) => out==='lamp' ? Bp(u,v,'lamp',{lit:true}) : Bp(u,v,'obsidian',{feed:true});
  Bp(0,0,'dust'); const lever = Bp(0,-1,'lever',{on:false,att:'D'});
  Bp(1,0,'dust'); Bp(2,0,'stone'); Bp(3,0,'torch',{att:'W',lit:true});
  for (let v=0;v<=4;v++) Bp(4,v,'dust');
  Bp(5,0,'repeater',{d:'E',delay:4,on:true,inp:true}); const p2 = sink(6,0);
  Bp(5,4,'repeater',{d:'E',delay:1,on:true,inp:true}); const p3 = sink(6,4);
  Bp(4,5,'repeater',{d:'S',delay:4,on:true,inp:true}); Bp(4,6,'repeater',{d:'S',delay:4,on:true,inp:true});
  for (const [u,v] of [[4,7],[5,7],[6,7],[6,6]]) Bp(u,v,'dust');
  Bp(6,5,'repeater',{d:'N',delay:1,on:true,inp:true});
  for (let v=1;v<=3;v++) Bp(0,v,'dust'); Bp(0,4,'repeater',{d:'S',delay:1});
  Bp(0,5,'stone'); Bp(1,5,'torch',{att:'W',lit:true}); Bp(2,5,'dust'); Bp(2,6,'repeater',{d:'S',delay:1,on:true,inp:true}); const p1 = sink(2,7);
  for (const u of [-1,-2,-3]) Bp(u,0,'dust');
  Bp(-3,1,'repeater',{d:'S',delay:4}); Bp(-3,2,'repeater',{d:'S',delay:4});
  for (let v=3;v<=7;v++) Bp(-3,v,'dust');
  for (const u of [-2,-1,0]) Bp(u,7,'dust');
  Bp(0,6,'repeater',{d:'N',delay:1});
  return { lever, out:[p1,p2,p3], inject:[bx-4,by], bounds:[bx-3,bx+6,by-1,by+7] };
}
class World {
  constructor(){ this.c = new Map(); this.t = 0; this.ev = []; this.floor = []; this.sensors = []; this.vibs = []; this.hasWool = false; this.entities = []; this.strong = new Map(); this.weak = new Map(); }
  get(x,y,z){ return this.c.get(K(x,y,z)) || null; }
  set(x,y,z,b){ const k=K(x,y,z); if (b){ b.x=x; b.y=y; b.z=z; this.c.set(k,b); } else this.c.delete(k); }
  put(x,y,z,t,o={}){ const b = Object.assign({ t }, o); if (t==='observer') b.seen = null; if (t==='sculk'){ b.state='idle'; b.out=0; this.sensors.push(b); } if (t==='wool') this.hasWool = true; this.set(x,y,z,b); return b; }
  // Items use gravity .04, drag .98 and ground friction .6. Projectile pearls
  // use position -> drag .99 -> gravity .03 (Java 1.11–1.21.1). Two game ticks per redstone tick.
  spawn(kind, x, y, z, o={}){ const en = Object.assign({ kind, x, y, z, vx:0, vy:0, vz:0, px:x, py:y, pz:z, ground:false }, o); this.entities.push(en); return en; }
  solidAt(x, y, z){ const fx=Math.floor(x), fy=Math.floor(y), fz=Math.floor(z), b = this.get(fx,fy,fz); if (!b) return false;
    if (NONSOLID.has(b.t)) return false; if (b.t==='trapdoor') return !b.open && (z - fz) >= 0.8125; return true; }
  stepEntities(){
    for (const en of this.entities){
      if (en.gone) continue;
      if (!en.projectile && !en.ground) en.vz -= 0.04;
      let nz = en.z + en.vz;
      if (en.vz < 0 && this.solidAt(en.x, en.y, nz - 1e-3)){ nz = Math.floor(nz - 1e-3) + 1; en.vz = 0; }
      else if (en.vz > 0 && this.solidAt(en.x, en.y, nz + .25)){ nz = en.z; en.vz = 0; }
      en.z = nz;
      const nx = en.x + en.vx; if (this.solidAt(nx, en.y, en.z + .1)) en.vx = 0; else en.x = nx;
      const ny = en.y + en.vy; if (this.solidAt(en.x, ny, en.z + .1)) en.vy = 0; else en.y = ny;
      en.ground = en.vz <= 0 && this.solidAt(en.x, en.y, en.z - 1e-3);
      const drag = en.projectile ? .99 : .98, f = !en.projectile && en.ground ? drag*.6 : drag;
      en.vx *= f; en.vy *= f; en.vz *= drag;
      if (en.projectile && !en.ground) en.vz -= .03;
      if (en.z < -40 || Math.abs(en.y) > 200 || Math.abs(en.x) > 200) en.gone = true;
    }
  }
  // Sculk sensor (1.20 timings in redstone ticks): range 8, travel 1 block per game tick, active 15, cooldown 5. Wool occludes.
  vibrate(x,y,z,src){
    for (const s of this.sensors){
      if (s.state !== 'idle') continue;
      const d = Math.hypot(s.x-x, s.y-y, s.z-z); if (d > 8) continue;
      if (this.hasWool && this.occluded([x+.5,y+.5,z+.5],[s.x+.5,s.y+.5,s.z+.5])) continue;
      const delay = Math.max(1, Math.ceil(d/2)), lv = Math.max(1, 15 - Math.floor(d*14/8)), t0 = this.t;
      s.state = 'pending'; this.vibs.push({ from:[x,y,z], to:[s.x,s.y,s.z], t0, t1:t0+delay });
      this.at(t0+delay, () => { s.on = true; s.out = lv; s.state = 'active'; });
      this.at(t0+delay+15, () => { s.on = false; s.out = 0; s.state = 'cool'; });
      this.at(t0+delay+20, () => { s.state = 'idle'; });
    }
  }
  occluded(a, b){
    const n = Math.ceil(Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]) * 4), sk = new Set([K(...a.map(Math.floor)), K(...b.map(Math.floor))]);
    for (let i=1;i<n;i++){ const p = a.map((v,j)=>Math.floor(v+(b[j]-v)*i/n)), k = K(...p); if (sk.has(k)) continue; const c = this.c.get(k); if (c && c.t==='wool') return true; }
    return false;
  }
  nb(b,d){ const v=D[d]; return this.get(b.x+v[0], b.y+v[1], b.z+v[2]); }
  at(t, fn){ this.ev.push({ t, fn }); }
  computePower(){
    const strong = new Map(), weak = new Map(), dust = [];
    const bump = (m,k,v) => { if (v > (m.get(k)||0)) m.set(k,v); };
    for (const b of this.c.values()){
      if (b.t==='dust'){ b.lvl = 0; dust.push(b); continue; }
      let d = null, lv = 0;
      if ((b.t==='repeater' && b.on) || (b.t==='comparator' && b.out>0)){ d = D[b.d]; lv = b.t==='repeater'?15:b.out; }
      else if (b.t==='observer' && b.on){ d = D[OPP[b.d]]; lv = 15; }
      else if ((b.t==='lever'||b.t==='plate'||b.t==='button') && b.on && b.att){ d = D[b.att]; lv = 15; }
      else if (b.t==='sculk' && b.on){ d = D.D; lv = b.out; }
      if (lv){ const n=this.get(b.x+d[0], b.y+d[1], b.z+d[2]); if (n && CONDUCT.has(n.t)) bump(strong, K(n.x,n.y,n.z), lv); }
      if (b.t==='torch' && b.lit && b.att!=='U'){ const n=this.get(b.x, b.y, b.z+1); if (n && CONDUCT.has(n.t)) bump(strong, K(n.x,n.y,n.z), 15); }   // torches strongly power the block above
    }
    for (const L of this.floor){ const f=this.get(...L.feed); if (f && (strong.get(K(...L.feed))||0)>0) L.cells.forEach(c=>bump(strong, K(...c), 15)); }
    this.strong = strong;
    const src = (b, f) => {
      if (!f) return 0;
      switch (f.t){
        case 'lever': case 'plate': case 'button': return f.on?15:0;
        case 'sculk': return f.on?f.out:0;
        case 'rblock': return 15;
        case 'torch': return f.lit?15:0;
        case 'repeater': return (f.on && this.faces(f,b))?15:0;
        case 'comparator': return this.faces(f,b)?f.out:0;
        case 'observer': return (f.on && this.backOf(f,b))?15:0;
        default: return CONDUCT.has(f.t) ? (strong.get(K(f.x,f.y,f.z))||0) : 0;
      }
    };
    const q = [];
    for (const b of dust){ let m=0; for (const d of HL) m=Math.max(m, src(b, this.nb(b,d))); if (m){ b.lvl=m; q.push(b); } }
    q.sort((a,b)=>b.lvl-a.lvl);
    while (q.length){ const b=q.shift(); for (const d of HL){ const n=this.nb(b,d); if (n && n.t==='dust' && n.lvl < b.lvl-1){ n.lvl=b.lvl-1; q.push(n); q.sort((a,c)=>c.lvl-a.lvl); } } }
    for (const b of dust){
      const con = HL.filter(d => { const n=this.nb(b,d); return n && this.dustConnects(b,n,d); });
      b.pts = !con.length ? HL.slice() : con.length===1 ? [con[0], OPP[con[0]]] : con;
      if (b.lvl) for (const d of b.pts){ const n=this.nb(b,d); if (n && CONDUCT.has(n.t)) bump(weak, K(n.x,n.y,n.z), b.lvl); }
    }
    this.weak = weak;
  }
  faces(b, n){ const d=D[b.d]; return b.x+d[0]===n.x && b.y+d[1]===n.y && b.z+d[2]===n.z; }
  backOf(b, n){ const d=D[b.d]; return b.x-d[0]===n.x && b.y-d[1]===n.y && b.z-d[2]===n.z; }
  dustConnects(b, n, d){
    switch (n.t){
      case 'dust': case 'lever': case 'plate': case 'button': case 'sculk': case 'torch': case 'rblock': return true;
      case 'repeater': case 'comparator': return n.d===d || n.d===OPP[d];
      case 'observer': return this.backOf(n, b);
      default: return false;
    }
  }
  into(tgt, n){
    if (!n) return 0;
    switch (n.t){
      case 'dust': return (n.lvl && n.z===tgt.z && n.pts.some(d => n.x+D[d][0]===tgt.x && n.y+D[d][1]===tgt.y)) ? n.lvl : 0;
      case 'repeater': return (n.on && this.faces(n,tgt))?15:0;
      case 'comparator': return this.faces(n,tgt)?n.out:0;
      case 'observer': return (n.on && this.backOf(n,tgt))?15:0;
      case 'lever': case 'plate': case 'button': return n.on?15:0;
      case 'sculk': return n.on?n.out:0;
      case 'rblock': return 15;
      case 'torch': { if (!n.lit) return 0; const a=D[n.att]; return (n.x+a[0]===tgt.x && n.y+a[1]===tgt.y && n.z+a[2]===tgt.z)?0:15; }
      default: if (CONDUCT.has(n.t)){ const k=K(n.x,n.y,n.z); return Math.max(this.strong.get(k)||0, this.weak.get(k)||0); } return 0;
    }
  }
  poweredAt(b, except){ let m=0; for (const d of DL){ if (d===except) continue; m=Math.max(m, this.into(b, this.nb(b,d))); } return m; }
  lampPowered(b){
    for (const d of DL){ const n=this.nb(b,d); if (!n || CONDUCT.has(n.t)) continue; if (this.into(b,n)>0) return true; }
    const k=K(b.x,b.y,b.z); return (this.strong.get(k)||0)>0 || (this.weak.get(k)||0)>0;
  }
  structure(start, md, pk, hk){
    const mv = D[md], set = new Set(), list = [], stack = [start];
    while (stack.length){
      const b = stack.pop(), k = K(b.x,b.y,b.z);
      if (set.has(k)) continue;
      if (!MOVABLE.has(b.t) || !live(b,this.t)) return null;
      set.add(k); list.push(b);
      if (list.length > 12) return null;
      const fk = K(b.x+mv[0], b.y+mv[1], b.z+mv[2]);
      if (fk === pk) return null;
      const f = this.c.get(fk);
      if (f && fk !== hk && !set.has(fk)) stack.push(f);
      if (STICKY.has(b.t)) for (const d of DL){
        const n = this.nb(b,d); if (!n) continue; const nk=K(n.x,n.y,n.z);
        if (nk===pk || nk===hk || set.has(nk)) continue;
        if (STICKY.has(n.t) && n.t!==b.t) continue;
        if (!MOVABLE.has(n.t) || !live(n,this.t)) continue;
        stack.push(n);
      }
    }
    return list;
  }
  shift(list, md){
    const mv = D[md];
    for (const b of list) this.c.delete(K(b.x,b.y,b.z));
    const landed = new Map();
    for (const b of list){ this.set(b.x+mv[0], b.y+mv[1], b.z+mv[2], b); b.mv = { d:md, t:this.t }; if (b.t==='observer') b.firePending = true; landed.set(K(b.x,b.y,b.z), b); }
    // blocks moving into an entity carry it along; slime also launches it in the push direction
    for (const en of this.entities){ if (en.gone) continue; const b = landed.get(K(Math.floor(en.x), Math.floor(en.y), Math.floor(en.z+.01))); if (!b) continue;
      // For drawing: the fraction of the block's 1-block stroke before its leading face reaches the entity (0.25 wide, bottom at z).
      const a = mv[0] ? 0 : mv[1] ? 1 : 2, s = mv[a], face = [b.x,b.y,b.z][a] + (s > 0 ? 0 : 1), pos = [en.x,en.y,en.z][a];
      const near = a===2 ? (s > 0 ? pos : pos+.25) : pos - s*.125;
      en.hit = { t:this.t, at:Math.max(0, Math.min(1, s*(near - face))) };
      en.x += mv[0]; en.y += mv[1]; en.z += mv[2]; en.ground = false;
      if (b.t==='slime'){ if (mv[0]) en.vx = mv[0]; if (mv[1]) en.vy = mv[1]; if (mv[2]) en.vz = mv[2]; } }
  }
  extend(p){
    const d=D[p.d], f=[p.x+d[0], p.y+d[1], p.z+d[2]], fb=this.get(...f);
    const list = fb ? this.structure(fb, p.d, K(p.x,p.y,p.z), -1) : [];
    if (list === null) return false;
    this.shift(list, p.d);
    this.set(...f, { t:'head', d:p.d, s:p.s, p });
    p.ext = true; p.mvAt = this.t; p.pushedAt = list.length ? this.t : -9; this.vibrate(p.x,p.y,p.z,'piston');
    return true;
  }
  retract(p){
    const d=D[p.d], h=[p.x+d[0], p.y+d[1], p.z+d[2]], hb=this.get(...h);
    if (hb && hb.t==='head') this.set(...h, null);
    p.ext = false; p.mvAt = this.t; this.vibrate(p.x,p.y,p.z,'piston');
    if (p.s && p.pushedAt !== this.t-1){
      const tb = this.get(h[0]+d[0], h[1]+d[1], h[2]+d[2]);
      if (tb && MOVABLE.has(tb.t) && live(tb,this.t)){ const list = this.structure(tb, OPP[p.d], K(p.x,p.y,p.z), K(...h)); if (list) this.shift(list, OPP[p.d]); }
    }
  }
  sig(x,y,z){ const b=this.get(x,y,z); if (!b) return '0'; return [b.t,b.d||'',b.ext?1:0,b.lit?1:0,b.on?1:0,b.lvl||0,b.out||0,b.open?1:0].join('|'); }
  tick(){
    const now = this.t;
    const due = this.ev.filter(e => e.t <= now); this.ev = this.ev.filter(e => e.t > now);
    due.forEach(e => e.fn());
    for (const en of this.entities){ en.px = en.x; en.py = en.y; en.pz = en.z; }
    this.computePower();
    const pistons = [];
    for (const b of [...this.c.values()]){
      switch (b.t){
        case 'lamp': { const p = this.lampPowered(b); if (p) b.lit = true; else if (b.lit && !b.offAt){ b.offAt = now+1; this.at(now+1, () => { b.offAt = 0; if (!this.lampPowered(b)) b.lit = false; }); } break; }
        case 'torch': { const ab=this.nb(b,b.att); const want = !(ab && this.into(b,ab)>0); if (want!==b.lit && b.pend!==want){ b.pend=want; this.at(now+1, () => { b.lit = b.pend; b.pend = undefined; }); } break; }
        case 'repeater': { const inp = this.into(b, this.nb(b,OPP[b.d]))>0; if (inp!==b.inp){ b.inp=inp; this.at(now+(b.delay||1), () => { b.on = inp; }); } break; }
        case 'comparator': { const bk=OPP[b.d], n=this.nb(b,bk); const rear = n && n.t==='barrel' ? (n.fill||0) : this.into(b,n); let side=0; for (const s of HL){ if (s===b.d||s===bk) continue; const m=this.nb(b,s); if (m && (m.t==='dust'||m.t==='repeater'||m.t==='comparator')) side=Math.max(side, this.into(b,m)); } const o = b.mode==='sub' ? Math.max(0, rear-side) : (rear>=side?rear:0); if (o!==b.tgt){ b.tgt=o; this.at(now+1, () => { b.out = o; }); } break; }
        case 'trapdoor': b.open = this.poweredAt(b) > 0; break;
        case 'piston': pistons.push(b); break;
      }
    }
    const want = pistons.map(p => ({ p, pw: this.poweredAt(p, p.d) > 0, k:K(p.x,p.y,p.z) }));
    for (const pass of [0,1]) for (const w of want){
      const p = w.p; if (K(p.x,p.y,p.z)!==w.k || p.mvAt===now) continue;
      if (pass===0 && w.pw && !p.ext) this.extend(p);
      else if (pass===1 && !w.pw && p.ext) this.retract(p);
    }
    for (const b of this.c.values()){
      if (b.t !== 'observer') continue;
      const d=D[b.d], s=this.sig(b.x+d[0], b.y+d[1], b.z+d[2]);
      if (b.seen === null){ b.seen = s; continue; }
      if (b.firePending || s !== b.seen){ b.firePending = false; b.seen = s; if (!b.busy){ b.busy = true; this.at(now+1, () => { b.on = true; }); this.at(now+2, () => { b.on = false; b.busy = false; }); } }
    }
    this.stepEntities(); this.stepEntities();
    this.t++;
    if (this.vibs.length) this.vibs = this.vibs.filter(v => v.t1 >= this.t-2);
  }
  run(n){ for (let i=0;i<n;i++) this.tick(); }
}
if (typeof module !== 'undefined') module.exports = { World, D, OPP, DL, HL, K, addLatch, addSequencer };
if (typeof window !== 'undefined') window.RS = { World, D, OPP, DL, HL, K, addLatch, addSequencer };
