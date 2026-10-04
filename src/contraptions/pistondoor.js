// Classic 2x2 piston door. Wall at y=0, door bricks at x=0..1, z=0..1. Two sticky pistons per side pull the bricks
// into the wall. Each side is driven by one torch: it powers the lower piston directly and, through the block above
// it, the upper piston. The lever line runs in a trench under the floor (z=-1) and turns both torches off to open.
function buildPistonDoor(){
  const RSx = typeof module!=='undefined' ? require('../engine.js') : window.RS;
  const w = new RSx.World(), K = RSx.K, sp = new Set(), door = [], pistons = [], torches = [];
  const S = (x,y,z,t,o={}) => { sp.add(K(x,y,z)); return w.put(x,y,z,t,o); };
  for (const z of [0,1]){
    door.push(S(0,0,z,'bricks'), S(1,0,z,'bricks'));
    for (const [px,d] of [[-2,'E'],[3,'W']]){ const p = S(px,0,z,'piston',{d,s:true,ext:true}); S(px+RSx.D[d][0],0,z,'head',{d,s:true,p}); pistons.push(p); }
  }
  for (const x of [-3,4]){ torches.push(S(x,0,0,'torch',{att:'D',lit:true})); S(x,1,-1,'repeater',{d:'N',delay:1}); }
  for (let x=-4;x<=5;x++) for (let z=-1;z<=2;z++) if (!sp.has(K(x,0,z))) w.put(x,0,z,'wallb');
  const lever = S(-5,2,-1,'lever',{on:false,att:'D'});
  for (let x=-4;x<=4;x++) S(x,2,-1,'dust');
  for (let x=-5;x<=5;x++) for (let y=1;y<=3;y++){ w.put(x,y,-2,'ground'); if (!sp.has(K(x,y,-1))) w.put(x,y,-1,'ground'); }
  return { world:w, lever, door, pistons, torches, box:[-5,5,0,3,-2,2] };
}
if (typeof module!=='undefined') module.exports = { buildPistonDoor };
