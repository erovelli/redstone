// Wide hidden plaque: stacked 2-row flush hidden doors revealing a text panel 3 blocks deep.
// Per column per band: back pistons (y=F-2) pull the bricks in; pullers above/below (y=F-1) slide them into slots;
// pullers (y=F-2) then move the back pistons out of the way. Every station is a real block next to its piston.
function buildPlaque(W, nBands=3, opt={}){
  const RSx = typeof module!=='undefined' ? require('../engine.js') : window.RS;
  const w = new RSx.World(), F = 6, sp = new Map(), K = RSx.K;
  const S = (x,y,z,t,o={}) => { const b = w.put(x,y,z,t,o); sp.set(K(x,y,z), b); return b; };
  const piston = (x,y,z,d) => { const p = S(x,y,z,'piston',{d,s:true,ext:true}); const v = RSx.D[d]; S(x+v[0],y+v[1],z+v[2],'head',{d,s:true,p}); return p; };
  const bands = [], st1 = [], st2 = [], st3 = [], bricks = [];
  for (let k=0;k<nBands;k++){
    const z0 = 1 + 6*(nBands-1-k); bands.push(z0);   // band 0 is the top one
    for (let x=0;x<W;x++){
      for (const z of [z0, z0+1]){ bricks.push(S(x,F,z,'bricks')); piston(x,F-2,z,'S'); st1.push(S(x,F-3,z,'obsidian',{station:true, plaque:true})); }
      piston(x,F-1,z0-2,'U'); piston(x,F-1,z0+3,'D');           // brick pullers
      piston(x,F-2,z0-2,'U'); piston(x,F-2,z0+3,'D');           // back-piston pullers
      for (const z of [z0-2, z0+3]){ st2.push(S(x,F,z,'wallb',{station:true})); st3.push(S(x,F-3,z,'obsidian',{station:true})); }
    }
  }
  const zTop = 1 + 6*(nBands-1) + 4;
  for (let x=-1;x<=W;x++) for (let y=F-4;y<=F;y++) for (let z=-3;z<=zTop;z++) if (!sp.has(K(x,y,z))) w.put(x,y,z,'wallb');
  // control board on the floor (same verified sequencer as the 2x2 door)
  const bx = 8, by = F+4;
  const seq = RSx.addSequencer(w, bx, by), lever = seq.lever, [f1,f2,f3] = seq.out;
  const latch = opt.trigger==='lever' ? null : RSx.addLatch(w, 0, by+2);
  if (latch) w.put(4,by,0,'repeater',{d:'E',delay:1});
  const xMax = Math.max(W, bx+7);
  for (let x=-1;x<=xMax;x++) for (let y=F+1;y<=by+8;y++) w.put(x,y,-1,'ground');
  const cell = b => [b.x,b.y,b.z];
  w.floor.push({ feed:cell(f1), cells:st1.map(cell) }, { feed:cell(f2), cells:st2.map(cell) }, { feed:cell(f3), cells:st3.map(cell) });
  return { world:w, F, W, bands, lever, bricks, sensor:latch&&latch.sensor, button:latch&&latch.button, box:[-1, xMax, F-4, by+8, -3, zTop], board:[bx,by] };
}
if (typeof module!=='undefined') module.exports = { buildPlaque };
