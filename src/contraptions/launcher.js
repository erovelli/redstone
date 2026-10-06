// Ender pearl launcher nav. Per item (4 columns wide, x0 = 4i, centre xc = x0+2):
//   glass box with a pearl item resting on a top-half trapdoor (xc,2,2), stone lid + button on top.
//   Pressing the button opens the trapdoor (powered block behind it); the pearl falls 3 blocks onto the launcher floor (xc,2,0).
//   8 ticks later (two repeaters) a pair of sticky pistons drives a 3-wide slime plate (one through a honey spacer) forward into the pearl and flings it
//   toward the viewer. Button release closes the trapdoor; the pistons retract 8 ticks after that.
//   Vertical runs (lid -> trapdoor station / delay line, delay line -> piston stations) are buried wiring links.
function buildLauncherNav(n){
  const RSx = typeof module!=='undefined' ? require('../engine.js') : window.RS;
  const w = new RSx.World(), items = [];
  for (let i=0;i<n;i++){
    const x0 = 4*i, xc = x0+2;
    w.put(x0,0,0,'obsidian'); w.put(x0,1,0,'obsidian');                     // separator
    // Pair of sticky pistons. The left one touches the plate: it pushes first (same tick, earlier in update order) and
    // retracts last, pulling the plate home. The right one drives the plate through a honey spacer (honey and slime do
    // not stick), so the plate never drags it, and it retracts one tick earlier to clear the spacer out of the way.
    const pL = w.put(x0+1,0,0,'piston',{d:'S',s:true});
    const pR = w.put(x0+3,-1,0,'piston',{d:'S',s:true}); w.put(x0+3,0,0,'honey'); const pistons = [pL, pR];
    w.put(xc,0,0,'obsidian');
    for (let x=x0+1;x<=x0+3;x++){ w.put(x,1,0,'slime'); w.put(x,1,1,'obsidian'); }
    const tStation = w.put(xc,1,2,'obsidian',{station:true}); w.put(xc,1,3,'obsidian');
    const trapdoor = w.put(xc,2,2,'trapdoor',{open:false});
    w.put(xc,3,3,'glass'); w.put(xc-1,2,3,'glass'); w.put(xc+1,2,3,'glass');
    const lid = w.put(xc,2,4,'stone'); const button = w.put(xc,2,5,'button',{on:false,att:'D'});
    // delay lines: 8 ticks (both pistons) and 9 ticks (keeps the left piston powered one tick longer)
    w.put(xc,-3,0,'obsidian'); w.put(xc,-4,0,'repeater',{d:'N',delay:4}); w.put(xc,-5,0,'repeater',{d:'N',delay:4}); w.put(xc,-6,0,'obsidian');
    w.put(xc+1,-3,0,'obsidian'); w.put(xc+1,-4,0,'repeater',{d:'N',delay:4}); w.put(xc+1,-5,0,'repeater',{d:'N',delay:4}); w.put(xc+1,-6,0,'repeater',{d:'N',delay:1}); w.put(xc+1,-7,0,'obsidian');
    const stL = w.put(x0+1,-1,0,'obsidian',{station:true}), stR = w.put(x0+3,-2,0,'obsidian',{station:true});
    w.floor.push({ feed:[xc,2,4], cells:[[xc,1,2],[xc,-3,0],[xc+1,-3,0]] }, { feed:[xc,-6,0], cells:[[stL.x,stL.y,0],[stR.x,stR.y,0]] }, { feed:[xc+1,-7,0], cells:[[stL.x,stL.y,0]] });
    const home = [xc+.5, 2.5, 3];
    const pearl = w.spawn('pearl', ...home, { ground:true, item:i });
    items.push({ i, x0, xc, button, trapdoor, pistons, pearl, home });
  }
  w.put(4*n,0,0,'obsidian'); w.put(4*n,1,0,'obsidian');
  for (let x=0;x<=4*n;x++) for (let y=-1;y<=2;y++) w.put(x,y,-1,'ground');
  const restock = (it) => { const p = it.pearl; Object.assign(p, { x:it.home[0], y:it.home[1], z:it.home[2], px:it.home[0], py:it.home[1], pz:it.home[2], vx:0, vy:0, vz:0, ground:true, gone:false }); };
  const where = (it) => { const p = it.pearl; if (p.gone || p.y > 4) return 'launched'; if (p.z >= 2.9) return 'in the box'; if (p.ground && p.z < .1) return 'on the launcher'; return p.vy > .05 ? 'flying' : 'falling'; };
  return { world:w, items, restock, where, box:[0, 4*n, -2, 3, -1, 5] };
}
// A row of wooden chambers drops onto two shared slime rails. The lower rail
// launches upward; a second rail strikes the rising pearl one tick later.
// All entity movement is performed by World.stepEntities and World.shift.
function buildSharedLauncherNav(n){
  if (!Number.isInteger(n) || n < 1 || n > 6) throw new Error('Expected 1 to 6 chambers (12-block piston limit)');
  const RSx = typeof module!=='undefined' ? require('../engine.js') : window.RS;
  const w = new RSx.World(), items = [], centre = n;
  const up = w.put(centre,2,-1,'piston',{d:'U',s:true});
  const side = w.put(centre,0,3,'piston',{d:'S',s:true});
  const driveUp = w.put(centre,1,-1,'button',{on:false});
  const driveSide = w.put(centre,-1,3,'button',{on:false});
  const lower = [], upper = [];
  for (let x=1;x<2*n;x++){
    lower.push(w.put(x,2,0,'slime'));
    upper.push(w.put(x,1,3,'slime'));
  }
  for (let i=0;i<n;i++){
    const xc = 2*i+1;
    const lid = w.put(xc,1,5,'barrel',{crate:true});
    const button = w.put(xc,1,6,'button',{on:false,att:'D'});
    w.put(xc,1,4,'obsidian',{station:true,buried:true});
    const trapdoor = w.put(xc,2,4,'trapdoor',{open:false,hinge:true});
    w.floor.push({feed:[lid.x,lid.y,lid.z],cells:[[xc,1,4]]});
    const home = [xc+.5,2.5,5];
    const pearl = w.spawn('pearl',...home,{ground:true,item:i,projectile:true});
    items.push({i,xc,x0:2*i,button,trapdoor,pearl,home});
  }
  let active = null;
  const ready = () => !up.ext && !side.ext && lower.every(b=>b.z===0) && upper.every(b=>b.y===1);
  const restock = it => {
    if (!items.includes(it) || !ready() || (active && active.it !== it)) return false;
    const p = it.pearl;
    Object.assign(p,{x:it.home[0],y:it.home[1],z:it.home[2],px:it.home[0],py:it.home[1],pz:it.home[2],vx:0,vy:0,vz:0,ground:true,gone:false});
    it.button.on = false; it.launched = false;
    if (active){ active = null; driveUp.on = driveSide.on = false; }
    return true;
  };
  const release = it => {
    if (!items.includes(it) || active || !ready()) return false;
    restock(it); it.button.on = true;
    active = {it,phase:'dropping'};
    return true;
  };
  const tick = w.tick.bind(w);
  w.tick = () => {
    tick(); if (!active) return;
    const a = active, p = a.it.pearl;
    if (a.phase === 'dropping' && p.ground && p.z===1){
      a.phase = 'launching'; driveUp.on = true;
      w.at(w.t+1,() => { if (active===a) driveSide.on = true; });
    } else if (a.phase === 'launching' && p.vy>.05 && p.vz>.05){
      a.it.launched = true; a.phase = 'flying'; a.it.button.on = false;
      w.at(w.t+2,() => { if (active===a) driveUp.on = driveSide.on = false; });
    }
  };
  const where = it => it.launched ? 'launched' : active && active.it === it ? active.phase : 'in the box';
  return {world:w,items,pistons:[up,side],lower,upper,centre,release,restock,ready,where,box:[0,2*n,-1,3,-1,6]};
}
// The site's navigation: a flush note-block wall with one barrel per destination, all
// at real block scale. Coordinates: wall face cells at y=0 (front face at y=1),
// open air in front at y=1, the wall interior at y=-1..-3; barrels at z=0, the
// label row at z=1 and the lower launcher rows down to z=-5. Each unit is 3
// columns wide: two columns for the side launcher, in line with the barrel,
// then the barrel at xc.
//   Stored: sticky pistons and slime wait 2 blocks inside the wall (y=-2) behind
//   note-block covers, with an empty cell (y=-1) between them. A redstone block waits
//   2 cells behind each launch piston (y=-4), so it never powers it on the way out.
//   Open:   the covers are pulled back into the wall (y=0 -> -1) and then aside
//   into pockets, playing a note-block chord as they go, and a hidden carriage pushes the pistons and slime 3 blocks
//   forward, so they stand 1 block proud of the wall (y=1). The redstone blocks
//   follow, still 2 cells behind (y=-1).
//   Launch: the barrel opens and the pearl drops 2.375 blocks onto the slime
//   block 3 below the barrel. A redstone block moves up behind the upward piston
//   (y=0, the cell it came out through) and powers it; one tick later the same
//   happens behind the side piston (in line with the barrel, left of the column,
//   facing east), which strikes the rising pearl in front of the barrel, sending
//   it up and to the right. The redstone blocks then move back and both pistons
//   retract. Only the open parts of an extended piston show its redstone block.
//   The two slime blocks are never face to face: slime sticks to slime, so if
//   they touched, one piston would drag the other's slime and break the launcher.
//   With both extended, one row of air still separates them. That fixes the
//   lower slime 3 below the barrel: any higher and it would meet the side slime,
//   and the pearl only reaches the barrel row one tick after the up push from there.
// Slime drags every movable block it touches. The wall is note blocks (movable, so they
// can be covers), and every wall block a slime block touches is a jukebox, which looks
// nearly the same but cannot be moved by pistons, so slime slides past it. Parked
// covers sit where no slime block reaches them.
// The cover, carriage and redstone block moves are direct block moves standing in
// for a hidden extender (a covered recess needs 3 blocks of travel, past a single
// piston's reach). The launch is real redstone block, piston and slime contact.
function buildHiddenLauncherNav(n){
  if (!Number.isInteger(n) || n<1 || n>6) throw new Error('Expected 1 to 6 navigation barrels');
  const RSx = typeof module!=='undefined' ? require('../engine.js') : window.RS;
  const w = new RSx.World(), items=[];
  const X1=3*n+1, Z0=-5, Z1=1, zRest=-2;
  const xcs=[...Array(n)].map((_,i)=>3*i+2);
  // Covers: the note blocks in front of the stored machine. Each is pulled back one block, then two cells aside
  // inside the wall, where no slime block touches it.
  const groups = xc => [
    { name:'side', cells:[[xc-1,0],[xc-2,0]], moves:['N','D','D'] },
    { name:'up',   cells:[[xc,-3],[xc,-4]],   moves:['N','W','W'] },
  ];
  // Every cell a cover passes through or parks in is left empty (keyed x,y,z), as is each redstone block's path.
  const open=new Set(), key=(x,y,z)=>x+','+y+','+z;
  for (const xc of xcs){
    for (const g of groups(xc)) for (const [x,z] of g.cells){ let c=[x,0,z]; for (const d of g.moves){ const v=RSx.D[d]; c=[c[0]+v[0],c[1]+v[1],c[2]+v[2]]; open.add(key(...c)); } }
    for (const [x,z] of [[xc,-4],[xc-2,0]]) for (const y of [-3,-1]) open.add(key(x,y,z));
    for (const [x,z] of [[xc-1,0],[xc-2,0],[xc,-3],[xc,-4]]) open.add(key(x,-1,z));
  }
  const isCover=(x,z)=>xcs.some(xc=>groups(xc).some(g=>g.cells.some(([cx,cz])=>cx===x && cz===z)));
  const machine=(x,z)=>xcs.some(xc=>[[xc-1,0],[xc-2,0],[xc,-3],[xc,-4]].some(([cx,cz])=>cx===x && cz===z));
  // Wall: note blocks, face and interior; the covers are note blocks too.
  for (let x=0;x<=X1;x++) for (let z=Z0;z<=Z1;z++){
    if (!xcs.includes(x) || z!==0) w.put(x,0,z,'noteblock',isCover(x,z) ? {cover:true} : {});
    for (const y of [-1,-2,-3,-4]){
      if (open.has(key(x,y,z)) || (y===-2 && machine(x,z)) || (y===-4 && xcs.some(xc=>(x===xc && z===-4) || (x===xc-2 && z===0)))) continue;
      w.put(x,y,z,'noteblock');
    }
  }
  for (let i=0;i<n;i++){
    const xc=xcs[i];
    const barrel=w.put(xc,0,0,'barrel',{d:'S',open:false});
    const up=w.put(xc,-2,-4,'piston',{d:'U',s:true}), lower=w.put(xc,-2,-3,'slime');
    const side=w.put(xc-2,-2,0,'piston',{d:'E',s:true}), upper=w.put(xc-1,-2,0,'slime');
    const coverGroups=groups(xc).map(g=>({ ...g, blocks:g.cells.map(([x,z])=>w.get(x,0,z)) }));
    const reds=[w.put(xc,-4,-4,'rblock'), w.put(xc-2,-4,0,'rblock')];   // behind the up and side pistons
    const home=[xc+.5,.5,.375], mouth=[xc+.5,1.5,.375];
    const pearl=w.spawn('pearl',...home,{ground:true,item:i,projectile:true,visible:false});
    items.push({i,xc,x0:xc-2,barrel,pearl,home,mouth,pistons:[up,side],reds,lower,upper,coverGroups,covers:coverGroups.flatMap(g=>g.blocks),phase:'closed',zRest,box:[xc-2,xc+1,-3,1,Z0,Z1]});
  }
  // Every position a slime block starts a move from: on its way out and back, and both ends of its launch stroke.
  const slimeStarts = it => [...[-2,-1,0,1].map(y=>[it.xc,y,-3]), [it.xc,1,-2], ...[-2,-1,0,1].map(y=>[it.xc-1,y,0]), [it.xc,1,0]];
  // Note blocks are movable, so a moving slime block would drag them. Every wall block a slime block touches is a
  // jukebox instead: it looks nearly the same, but pistons cannot move it, so slime slides past.
  for (const it of items) for (const [x,y,z] of slimeStarts(it)) for (const v of Object.values(RSx.D)){
    const b=w.get(x+v[0],y+v[1],z+v[2]); if (b && b.t==='noteblock' && !b.cover) b.t='jukebox';
  }
  // Block-move plans. Each step moves a group one block if every target cell is empty.
  const carriage=it=>[...it.pistons,it.lower,it.upper,...it.reds];
  const coverStep=k=>it=>it.coverGroups.map(g=>[g.blocks,g.moves[k]]), coverBack=k=>it=>it.coverGroups.map(g=>[g.blocks,RSx.OPP[g.moves[k]]]);
  const out=it=>[[carriage(it),'S']], in_=it=>[[carriage(it),'N']];
  // Every cover step powers its note blocks: a rising chord as a launcher opens, a falling one as it closes.
  // Pitches are note-block clicks, 0 to 24 (F#3 to F#5); each barrel has its own key.
  const ROOTS=[6,8,10,11,13,15], CHORD=[0,4,7], notes=[];
  const sound=(k,rising)=>it=>{ const pitch=ROOTS[it.i%ROOTS.length]+CHORD[rising ? k : 2-k];
    it.covers.forEach((b,k)=>notes.push({ t:w.t, i:it.i, pitch, x:b.x, y:b.y, z:b.z, ...(k ? { k } : {}) })); };   // k marks the extra blocks of one chord step
  const withNote=(step,note)=>it=>{ const m=step(it); m.note=()=>note(it); return m; };
  const OPEN=[withNote(coverStep(0),sound(0,true)), withNote(coverStep(1),sound(1,true)), withNote(coverStep(2),sound(2,true)), out, out, out];
  const CLOSE=[in_, in_, in_, withNote(coverBack(2),sound(0,false)), withNote(coverBack(1),sound(1,false)), withNote(coverBack(0),sound(2,false))];
  const tryMove = moves => {
    const all=new Set(moves.flatMap(([bs])=>bs));
    for (const [bs,d] of moves) for (const b of bs){ const v=RSx.D[d], o=w.get(b.x+v[0],b.y+v[1],b.z+v[2]); if (o && !all.has(o)) return false; }
    moves.forEach(([bs,d])=>w.shift(bs,d)); if (moves.note) moves.note(); return true;
  };
  const at=(b,x,y,z)=>b.x===x && b.y===y && b.z===z;
  const deployed = it => !it.pistons.some(p=>p.ext) && at(it.pistons[0],it.xc,1,-4) && at(it.lower,it.xc,1,-3) && at(it.pistons[1],it.xc-2,1,0) && at(it.upper,it.xc-1,1,0) && it.reds.every(r=>r.y===-1);
  const stored = it => !it.pistons.some(p=>p.ext) && [...it.pistons,it.lower,it.upper].every(b=>b.y===-2) && it.reds.every(r=>r.y===-4) && it.covers.every(b=>b.y===0) && !it.barrel.open;
  // Firing a launch piston: its redstone block moves forward into the cell right behind it, which powers it this tick.
  const signal = (it, k, on) => tryMove([[[it.reds[k]], on ? 'S' : 'N']]);
  const ready = it => (it ? [it] : items).every(it=>stored(it) && it.phase==='closed');
  let active=null;
  const restock = it => {
    if (!items.includes(it) || !ready(it) || (active && active.it!==it)) return false;
    const p=it.pearl;
    Object.assign(p,{x:it.home[0],y:it.home[1],z:it.home[2],px:it.home[0],py:it.home[1],pz:it.home[2],vx:0,vy:0,vz:0,ground:true,gone:false,visible:false,hit:null});
    it.launched=false;
    if (active) active=null;
    return true;
  };
  const release = it => {
    if (!items.includes(it) || active || !ready(it)) return false;
    restock(it); it.phase='revealing'; active={it,at:w.t,step:0};
    return true;
  };
  // The controller runs at the start of each tick, so its block moves and drive changes belong to that tick.
  const control = () => {
    const a=active, it=a.it, p=it.pearl;
    if (it.phase==='revealing' && w.t-a.at>=3){ it.phase='receding'; a.step=0; }
    if (it.phase==='receding'){
      if (tryMove(OPEN[a.step](it)) && ++a.step===OPEN.length) it.phase='opening';
    } else if (it.phase==='opening' && deployed(it)){
      it.phase='dropping'; it.barrel.open=true;
      Object.assign(p,{x:it.mouth[0],y:it.mouth[1],z:it.mouth[2],px:it.mouth[0],py:it.mouth[1],pz:it.mouth[2],ground:false,visible:true});
    } else if (it.phase==='dropping' && p.ground && p.z===it.zRest){
      it.phase='launching'; signal(it,0,true); a.sideAt=w.t+1;
    } else if (it.phase==='launching'){
      if (w.t===a.sideAt) signal(it,1,true);
      if (p.vx>.05 && p.vz>.05){ it.launched=true; it.phase='flying'; it.barrel.open=false; a.offAt=w.t+2; }
    } else if (it.phase==='flying'){
      if (w.t===a.offAt){ signal(it,0,false); signal(it,1,false); }
      if (w.t>a.offAt+1 && deployed(it)){ it.phase='withdrawing'; a.step=0; }
    } else if (it.phase==='withdrawing'){
      if (tryMove(CLOSE[a.step](it)) && ++a.step===CLOSE.length){ it.phase='concealing'; a.at=w.t; }
    } else if (it.phase==='concealing' && w.t-a.at>=2) it.phase='closed';
  };
  const tick=w.tick.bind(w);
  w.tick=()=>{ if (active) control(); tick(); };
  const where = it => it.launched ? 'launched' : it.phase;
  return {world:w,items,release,restock,ready,where,notes,cols:X1+1,rows:Z1-Z0+1,box:[0,X1,-4,1,Z0,Z1]};
}
if (typeof module!=='undefined') module.exports = { buildLauncherNav, buildSharedLauncherNav, buildHiddenLauncherNav };
