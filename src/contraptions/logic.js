// Small logic, toggle, signal and sensor contraptions. Each returns { world, box, io } on a ground slab (z=-1).
(function(){
const RSx = typeof module!=='undefined' ? require('../engine.js') : window.RS;
const ground = (w,x0,x1,y0,y1) => { for (let x=x0;x<=x1;x++) for (let y=y0;y<=y1;y++) if (!w.get(x,y,-1)) w.put(x,y,-1,'ground'); };
const P = (w,x,y,t,o={}) => w.put(x,y,0,t,o);
function leverLamp(){ const w=new RSx.World(); const lever=P(w,0,0,'lever',{on:false,att:'D'}); for (let x=1;x<4;x++) P(w,x,0,'dust'); const lamp=P(w,4,0,'lamp'); ground(w,0,4,0,0); return { world:w, box:[0,4,0,0,-1,0], io:{ lever, lamp } }; }
function inverter(){ const w=new RSx.World(); const lever=P(w,0,0,'lever',{on:false,att:'D'}); P(w,1,0,'dust'); P(w,2,0,'stone'); const torch=P(w,3,0,'torch',{att:'W',lit:true}); P(w,4,0,'dust'); const lamp=P(w,5,0,'lamp',{lit:true}); ground(w,0,5,0,0); return { world:w, box:[0,5,0,0,-1,0], io:{ lever, torch, lamp } }; }
function observerPulse(){ const w=new RSx.World(); const lever=P(w,0,0,'lever',{on:false,att:'D'}); const obs=P(w,1,0,'observer',{d:'W'}); P(w,2,0,'dust'); P(w,3,0,'dust'); const lamp=P(w,4,0,'lamp'); ground(w,0,4,0,0); return { world:w, box:[0,4,0,0,-1,0], io:{ lever, observer:obs, lamp } }; }
function rsLatch(){ const w=new RSx.World(); const L=RSx.addLatch(w,0,0,1,{set:'button'}); const lamp=P(w,4,-1,'lamp'); ground(w,0,4,-2,2); return { world:w, box:[0,4,-2,2,-1,0], io:{ set:L.set, reset:L.reset, q:L.tB, lamp } }; }
function sculkLatch(){ const w=new RSx.World(); const L=RSx.addLatch(w,0,0); const lamp=P(w,4,-1,'lamp'); ground(w,0,4,-2,12); return { world:w, box:[0,4,-2,12,-1,0], io:{ sensor:L.sensor, reset:L.reset, q:L.tB, lamp } }; }
function sequencer(){ const w=new RSx.World(); const s=RSx.addSequencer(w,3,1,{out:'lamp'}); ground(w,0,9,0,8); return { world:w, box:[0,9,0,8,-1,0], io:{ lever:s.lever, p1:s.out[0], p2:s.out[1], p3:s.out[2] } }; }
function delayLine(delays=[2,4,3,4]){ const w=new RSx.World(); const lever=P(w,0,0,'lever',{on:false,att:'D'}); P(w,0,1,'dust'); const lamps=[], reps=[];
  delays.forEach((d,i)=>{ const y=2+i*2; reps.push(P(w,0,y,'repeater',{d:'S',delay:d})); P(w,0,y+1,'dust'); P(w,1,y+1,'dust'); lamps.push(P(w,2,y+1,'lamp')); });
  const y1=1+delays.length*2; ground(w,0,2,0,y1); return { world:w, box:[0,2,0,y1,-1,0], io:{ lever, lamps, repeaters:reps } }; }
// Rising-edge detector: S AND NOT(S delayed 2), from two torches and a repeater. Input at (0,0); the edge torch is at (7,0).
function addEdge(w, kind='button'){
  const input=P(w,0,0,kind,{on:false,att:'D'}); P(w,1,0,'dust'); P(w,2,0,'dust'); P(w,3,0,'stone'); P(w,4,0,'torch',{att:'W',lit:true}); P(w,5,0,'dust'); P(w,6,0,'stone');
  for (const [x,y] of [[1,1],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2]]) P(w,x,y,'dust');
  P(w,6,1,'repeater',{d:'N',delay:2}); const edge=P(w,7,0,'torch',{att:'W',lit:false});
  return { input, edge };
}
function edgeDetector(){ const w=new RSx.World(); const { input:lever, edge }=addEdge(w,'lever'); const lamp=P(w,8,0,'lamp'); ground(w,0,8,0,2); return { world:w, box:[0,8,0,2,-1,0], io:{ lever, edge, lamp } }; }
// T flip-flop: the rising-edge detector gives a short pulse; a sticky piston on that pulse drops its redstone block
// on one press and grabs it back on the next.
function tFlipFlop(){ const w=new RSx.World(); const { input:button, edge }=addEdge(w);
  const piston=P(w,8,0,'piston',{d:'E',s:true}); const block=P(w,9,0,'rblock'); const lamp=P(w,11,0,'lamp');
  ground(w,0,11,0,2); return { world:w, box:[0,11,0,2,-1,0], io:{ button, edge, piston, block, lamp } }; }
// OR: two dust lines meet. Either lever lights the lamp.
function orGate(){ const w=new RSx.World(); const a=P(w,0,0,'lever',{on:false,att:'D'}), b=P(w,0,2,'lever',{on:false,att:'D'});
  for (const [x,y] of [[1,0],[2,0],[1,2],[2,2],[2,1],[3,1]]) P(w,x,y,'dust'); const lamp=P(w,4,1,'lamp');
  ground(w,0,4,0,2); return { world:w, box:[0,4,0,2,-1,0], io:{ a, b, lamp } }; }
// AND: each input turns off a torch; the torch outputs join (NOR of the inverses) into a block whose torch is the output.
function andGate(){ const w=new RSx.World(); const a=P(w,0,0,'lever',{on:false,att:'D'}), b=P(w,0,2,'lever',{on:false,att:'D'});
  for (const y of [0,2]){ P(w,1,y,'dust'); P(w,2,y,'stone'); P(w,3,y,'torch',{att:'W',lit:true}); }
  for (let y=0;y<=2;y++) P(w,4,y,'dust'); P(w,5,1,'dust'); P(w,6,1,'stone'); const out=P(w,7,1,'torch',{att:'W',lit:false}); const lamp=P(w,8,1,'lamp');
  ground(w,0,8,0,2); return { world:w, box:[0,8,0,2,-1,0], io:{ a, b, out, lamp } }; }
// XOR = (A OR B) - (A AND B). A comparator in subtract mode takes the OR line at the rear and the AND output at the side.
function xorGate(){ const w=new RSx.World(); const a=P(w,1,0,'lever',{on:false,att:'D'}), b=P(w,3,0,'lever',{on:false,att:'D'});
  for (const x of [1,2,3]) P(w,x,-1,'dust');                                                    // OR: both levers power this row
  for (const [x,y] of [[4,-1],[5,-1],[5,0],[5,1],[5,2],[5,4],[5,5],[5,6],[5,7],[4,7],[3,7],[2,7]]) P(w,x,y,'dust');
  P(w,5,3,'repeater',{d:'S',delay:1});
  for (const x of [1,3]){ P(w,x,1,'dust'); P(w,x,2,'stone'); P(w,x,3,'torch',{att:'N',lit:true}); }   // AND
  for (const [x,y] of [[2,3],[2,4]]) P(w,x,y,'dust'); P(w,2,5,'stone'); const and=P(w,2,6,'torch',{att:'N',lit:false});
  for (const [x,y] of [[1,6],[0,6],[0,7],[0,8]]) P(w,x,y,'dust'); P(w,1,8,'repeater',{d:'E',delay:1});
  const comp=P(w,2,8,'comparator',{d:'S',mode:'sub'}); const lamp=P(w,2,9,'lamp');
  ground(w,0,5,-1,9); return { world:w, box:[0,5,-1,9,-1,0], io:{ a, b, and, comp, lamp } }; }
// Comparator subtractor: rear barrel A, side barrel B (read by a second comparator). Subtract mode outputs A - B;
// compare mode passes A through unless B is stronger.
function subtractor(fa, fb, mode='sub'){ const w=new RSx.World(); w.put(0,0,0,'barrel',{fill:fa}); const comp=P(w,1,0,'comparator',{d:'E',mode});
  w.put(1,2,0,'barrel',{fill:fb}); const side=P(w,1,1,'comparator',{d:'N'}); for (let x=2;x<17;x++) P(w,x,0,'dust');
  ground(w,0,16,0,2); return { world:w, box:[0,16,0,2,-1,0], io:{ a:w.get(0,0,0), b:w.get(1,2,0), side, comp } }; }
// Torch clock: a torch on a block feeds two repeaters back into that block, so it turns itself off and on.
// Half period = 1 (torch) + the repeater delays. A lever on the block stops it.
function torchClock(delays=[3,3]){ const w=new RSx.World(); const lever=P(w,0,0,'lever',{on:false,att:'E'}); P(w,1,0,'stone');
  const torch=P(w,2,0,'torch',{att:'W',lit:true}); const lamp=P(w,3,0,'lamp');
  for (const [x,y] of [[2,1],[2,2],[2,3],[1,3]]) P(w,x,y,'dust');
  const repeaters=[P(w,1,2,'repeater',{d:'N',delay:delays[0]}), P(w,1,1,'repeater',{d:'N',delay:delays[1]})];
  ground(w,0,3,0,3); return { world:w, box:[0,3,0,3,-1,0], io:{ lever, torch, lamp, repeaters } }; }
const api = { leverLamp, inverter, observerPulse, rsLatch, sculkLatch, sequencer, delayLine, tFlipFlop, edgeDetector, orGate, andGate, xorGate, subtractor, torchClock };
if (typeof module!=='undefined') module.exports=api; else window.Logic=api;
})();
