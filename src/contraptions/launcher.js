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
if (typeof module!=='undefined') module.exports = { buildLauncherNav };
