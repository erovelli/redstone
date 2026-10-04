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
// T flip-flop: rising-edge detector (torch AND of S and NOT S+2) gives a 1-tick pulse; a sticky piston on a
// 1-tick pulse drops its redstone block on one press and grabs it back on the next.
function tFlipFlop(){ const w=new RSx.World();
  const button=P(w,0,0,'button',{on:false,att:'D'}); P(w,1,0,'dust'); P(w,2,0,'dust'); P(w,3,0,'stone'); P(w,4,0,'torch',{att:'W',lit:true}); P(w,5,0,'dust'); P(w,6,0,'stone');
  for (const [x,y] of [[1,1],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2]]) P(w,x,y,'dust');
  P(w,6,1,'repeater',{d:'N',delay:2}); const edge=P(w,7,0,'torch',{att:'W',lit:false});
  const piston=P(w,8,0,'piston',{d:'E',s:true}); const block=P(w,9,0,'rblock'); const lamp=P(w,11,0,'lamp');
  ground(w,0,11,0,2); return { world:w, box:[0,11,0,2,-1,0], io:{ button, edge, piston, block, lamp } }; }
const api = { leverLamp, inverter, observerPulse, rsLatch, sculkLatch, sequencer, delayLine, tFlipFlop };
if (typeof module!=='undefined') module.exports=api; else window.Logic=api;
})();
