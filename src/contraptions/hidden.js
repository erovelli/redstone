// Flush 2x2 hidden door. Wall face at y=5. Stage 1: back pistons pull the bricks in. Stage 2: side pistons
// slide them behind the wall face. Stage 3: floor/ceiling pistons pull the back pistons out of the passage.
function buildHidden(opt={}){
  const RSx = typeof module!=='undefined' ? require('../engine.js') : window.RS;
  const w = new RSx.World(), F = 5, special = new Map();
  const S = (x,y,z,t,o={}) => { const b = w.put(x,y,z,t,o); special.set(RSx.K(x,y,z), b); return b; };
  const E = (x,y,z) => special.set(RSx.K(x,y,z), null);
  const door = [], st1 = [], st2 = [], st3 = [];
  const piston = (x,y,z,d) => { const p = S(x,y,z,'piston',{d,s:true,ext:true}); const v = RSx.D[d]; S(x+v[0],y+v[1],z+v[2],'head',{d,s:true,p}); return p; };
  for (const x of [0,1]) for (const z of [0,1]){
    door.push(S(x,F,z,'bricks'));
    piston(x,3,z,'S');                                          // back piston, head at y=4
    const side = x===0 ? -1 : 1, px = x===0 ? -2 : 3;           // side piston, head in the slot next to the door
    piston(px,4,z, x===0 ? 'E' : 'W');
    st2.push(S(px+side,4,z,'obsidian',{station:true}));
    st1.push(S(x+side,3,z,'obsidian',{station:true}));
  }
  for (const x of [0,1]){
    piston(x,3,-2,'U'); st3.push(S(x,3,-3,'obsidian',{station:true}));
    piston(x,3,3,'D');  st3.push(S(x,3,4,'obsidian',{station:true}));
    for (let y=0;y<=2;y++) for (const z of [0,1]) E(x,y,z);       // the room
    S(x,-1,0,'lamp',{lit:true}); S(x,-2,0,'torch',{att:'D',lit:true});
  }
  for (let x=-4;x<=5;x++) for (let y=-2;y<=F;y++) for (let z=-3;z<=5;z++) if (!special.has(RSx.K(x,y,z))) w.put(x,y,z,'wallb');
  // control board on the floor: lever -> inverter (S) ; P2 = S+4 ; P3 = S OR S+8 ; P1 = NOT(L OR L+8)
  const by = 7, seq = RSx.addSequencer(w, 0, by), lever = seq.lever, [f1,f2,f3] = seq.out;
  // optional sculk latch, west of the board, driving the sequencer's inject cell; more than 8 blocks from every piston
  const latch = opt.trigger==='sculk' ? RSx.addLatch(w, -8, by+2) : null, x0 = latch ? -8 : -4;
  if (latch) w.put(seq.inject[0], seq.inject[1], 0, 'repeater', {d:'E',delay:1});
  for (let x=x0;x<=6;x++) for (let y=F+1;y<=15;y++) w.put(x,y,-1,'ground');
  const cell = b => [b.x,b.y,b.z];
  w.floor.push({ feed:cell(f1), cells:st1.map(cell) }, { feed:cell(f2), cells:st2.map(cell) }, { feed:cell(f3), cells:st3.map(cell) });
  return { world:w, F, lever, door, sensor:latch&&latch.sensor, button:latch&&latch.button, box:[x0,6,-2,15,-3,5], boardY:by };
}
if (typeof module!=='undefined') module.exports = { buildHidden };
