// Vertical flying-machine door. Columns are 1 wide (x) and 2 deep (y=1 back, y=2 front).
// Wall at y=0. Top halves park in an attic above, bottom halves in a pit below the floor.
function buildDoor(W, opts={}){
  const RSx = typeof module!=='undefined' ? require('../engine.js') : window.RS;
  const w = new RSx.World();
  const Rc = opts.Rc ?? 2, Fc = opts.Fc ?? 2, L = Rc + 4 + Fc;
  const G = { W, L, Rc, Fc, zMin:-L-1, zMax:3*L, areaZ0:0, areaZ1:2*L };
  for (let x=0;x<W;x++){
    for (let z=G.zMin; z<=G.zMax; z++) w.put(x,0,z,'wall');
    for (const y of [1,2]){ w.put(x,y,G.zMin,'obsidian'); w.put(x,y,G.zMax,'obsidian'); }
  }
  const s1 = [], s2 = [];
  const halvesSel = opts.halves || ['top','bot'];
  if (halvesSel.length === 1) for (let x=0;x<W;x++) for (const y of [1,2]) w.put(x, y, halvesSel[0]==='top' ? L-1 : L, 'obsidian');   // seam stopper when there is no opposite half
  const halves = opts.halves || ['top','bot'];
  for (let x=0; x<W; x++) for (const half of halves){
    const type = ((x%2===0) === (half==='top')) ? 'slime' : 'honey';
    const zOf = m => half==='top' ? L+m : L-1-m;
    const out = half==='top' ? 'U' : 'D', inn = half==='top' ? 'D' : 'U';
    const P = (c,m,t,o={}) => w.put(x, 1+c, zOf(m), t, o);
    for (let m=0; m<Rc; m++){ P(0,m,'stone'); P(1,m,type); }
    P(0,Rc,'observer',{d:inn}); P(1,Rc,type);
    const a = P(0,Rc+1,'piston',{d:out,s:true}); P(1,Rc+1,type);
    P(0,Rc+2,type); const b = P(1,Rc+2,'piston',{d:inn,s:true});
    P(0,Rc+3,type); P(1,Rc+3,'observer',{d:out});
    for (let m=Rc+4; m<L; m++){ P(0,m,type); P(1,m,'stone'); }
    const sh = half==='top' ? L : -L;
    s1.push({ half, cell:[x,0,a.z] });               // wall block behind the closed S1
    const beam = [x,3,b.z+sh];                      // beam block in front of the parked S2
    w.put(...beam,'obsidian',{station:true}); s2.push({ half, cell:beam });
  }
  // floor in front, panel on it: lever -> observer -> dust -> delay columns -> feed blocks
  const yF = 4, yC = 8; G.yMax = yC+10; G.ground = -1;
  for (let x=0;x<Math.max(W,6);x++) for (let y=3;y<=(opts.trigger==='lever'?yC+1:yC+10);y++) w.put(x,y,-1,'ground');
  let latch = null, lever = null;
  if (opts.trigger === 'lever'){ lever = w.put(0,yC,0,'lever',{on:false,att:'D'}); G.yMax = yC+1; }
  else { // sculk sensor -> torch latch -> two repeaters -> the observer
    latch = RSx.addLatch(w, 0, yC+4);
    w.put(0,yC+1,0,'repeater',{d:'N',delay:1}); w.put(0,yC,0,'repeater',{d:'N',delay:1}); }
  w.put(1,yC,0,'observer',{d:'W'});
  for (let x=2;x<6;x++) w.put(x,yC,0,'dust');
  const col = (x, delays) => { delays.forEach((d,i)=> w.put(x,yC-1-i,0,'repeater',{d:'N',delay:d})); w.put(x,yF,0,'obsidian',{feed:true}); };
  col(2,[1,1,2]); col(4,[4,4,4]);
  w.floor.push({ feed:[2,yF,0], cells:[...s1.filter(s=>s.half==='top'), ...s2].map(s=>s.cell) });
  w.floor.push({ feed:[4,yF,0], cells: s1.filter(s=>s.half==='bot').map(s=>s.cell) });
  Object.assign(G, { world:w, lever, sensor:latch&&latch.sensor, button:latch&&latch.button, yF, yC, halves });
  return G;
}
if (typeof module!=='undefined') module.exports = { buildDoor };
