// Redstone kit catalogue. Each entry: metadata, params, controls, build(params) -> { world, box, io, ... }, tests.
(function(){
const N = typeof module!=='undefined';
const RS = N ? require('./engine.js') : window.RS;
const Lg = N ? require('./contraptions/logic.js') : window.Logic;
const { buildPistonDoor } = N ? require('./contraptions/pistondoor.js') : window;

// Player actions (every catalogue world is strict and sealed: only world.hand may change it).
const press = (w,b) => w.hand.press(b);
const lev = (w,b,on) => { if (!!b.on !== !!on) w.hand.flip(b); };
const until = (w, f, max=200) => { for (let i=0;i<max;i++){ if (f()) return i; w.tick(); } return f() ? max : -1; };
const first = (w, f, max=200) => { for (let i=1;i<=max;i++){ w.tick(); if (f()) return i; } return -1; };   // ticks until f() holds, counting the first tick as 1
const snapIn = (w, f) => [...w.c.values()].filter(f).map(b=>b.t+(b.ext?'E':'')+[b.x,b.y,b.z]).sort().join(';');
const T = (name, fn) => ({ name, fn });
const require_engine = () => RS;
const truth = (build, want) => [[0,0],[1,0],[0,1],[1,1]].every(([a,b],i) => { const c=build(), w=c.world; w.run(5); lev(w,c.io.a,!!a); lev(w,c.io.b,!!b); w.run(20); return !!c.io.lamp.lit === !!want[i]; });

const entries = [
{ id:'lever-lamp', strict:true, deviations:[], name:'Lever and lamp', category:'Toggles & logic',
  summary:'The simplest circuit: a lever powers dust, and the dust powers a lamp.',
  inputs:['lever'], outputs:['lamp'], timing:'Lamp on in the same tick; off 2 ticks after power drops.',
  notes:['Dust loses 1 level per block, so a lamp must be within 15 blocks of the source.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.leverLamp(),
  tests:[ T('lamp follows the lever', () => { const c=Lg.leverLamp(), w=c.world; w.run(3); const a=!c.io.lamp.lit; lev(w,c.io.lever,true); w.run(2); const b=c.io.lamp.lit; lev(w,c.io.lever,false); w.run(3); return a && b && !c.io.lamp.lit; }) ] },

{ id:'inverter', strict:true, deviations:[], name:'Torch inverter (NOT)', category:'Toggles & logic',
  summary:'A torch on a block turns off when the block is powered, so the output is the opposite of the input.',
  inputs:['lever'], outputs:['lamp (inverted)'], timing:'1 tick per torch.',
  notes:['A torch never powers the block it is attached to.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.inverter(),
  tests:[ T('output is inverted', () => { const c=Lg.inverter(), w=c.world; w.run(3); const a=c.io.lamp.lit; lev(w,c.io.lever,true); w.run(4); const b=!c.io.lamp.lit; lev(w,c.io.lever,false); w.run(4); return a && b && c.io.lamp.lit; }) ] },

{ id:'or-gate', strict:true, deviations:[], name:'OR gate', category:'Toggles & logic',
  summary:'Two dust lines meet, so either input lights the lamp.',
  inputs:['lever A','lever B'], outputs:['lamp (A OR B)'], timing:'Same tick on; off 2 ticks after both drop.',
  notes:['Dust carries power both ways, so the inputs also feed each other. Put a repeater on each input if the sources must stay isolated.'],
  controls:[{ kind:'lever', io:'a', label:'Lever A' },{ kind:'lever', io:'b', label:'Lever B' }],
  build:() => Lg.orGate(),
  tests:[ T('truth table 0111', () => truth(Lg.orGate, [0,1,1,1])) ] },

{ id:'and-gate', strict:true, deviations:[], name:'AND gate (torch)', category:'Toggles & logic',
  summary:'Each input turns off its torch. The torch outputs join into a block, and the torch on that block is lit only when both inputs are on.',
  inputs:['lever A','lever B'], outputs:['lamp (A AND B)'], timing:'Lamp on at +3 after the second input.',
  notes:['A AND B = NOT(NOT A OR NOT B).'],
  controls:[{ kind:'lever', io:'a', label:'Lever A' },{ kind:'lever', io:'b', label:'Lever B' }],
  build:() => Lg.andGate(),
  tests:[ T('truth table 0001', () => truth(Lg.andGate, [0,0,0,1])),
          T('timing: lamp on at +3 after the second input', () => { const c=Lg.andGate(), w=c.world; w.run(5); lev(w,c.io.a,true); w.run(10); lev(w,c.io.b,true); return first(w,()=>c.io.lamp.lit)===3; }) ] },

{ id:'xor-gate', strict:true, deviations:[], name:'XOR gate (comparator)', category:'Toggles & logic',
  summary:'A comparator in subtract mode takes A OR B at the rear and A AND B at the side, so the output is on when exactly one input is on.',
  inputs:['lever A','lever B'], outputs:['lamp (A XOR B)'], timing:'One input: lamp on at +3. Adding the second: lamp off at +7 (the AND path is slower, and a lamp turns off 2 ticks after it loses power).',
  notes:['XOR = (A OR B) - (A AND B). The AND torch also feeds the rear, which is harmless: it is only on when OR is.','Switching from one input to both can flash the output for a tick while the AND path catches up.'],
  controls:[{ kind:'lever', io:'a', label:'Lever A' },{ kind:'lever', io:'b', label:'Lever B' }],
  build:() => Lg.xorGate(),
  tests:[ T('truth table 0110', () => truth(Lg.xorGate, [0,1,1,0])),
          T('follows a sequence of inputs', () => { const c=Lg.xorGate(), w=c.world; w.run(5); return [[1,0,1],[1,1,0],[0,1,1],[0,0,0],[1,1,0],[1,0,1]].every(([a,b,q]) => { lev(w,c.io.a,!!a); lev(w,c.io.b,!!b); w.run(20); return !!c.io.lamp.lit===!!q; }); }),
          T('timing: on at +3, off at +7 when the second input joins', () => { const c=Lg.xorGate(), w=c.world; w.run(5); lev(w,c.io.a,true); const a=first(w,()=>c.io.lamp.lit); w.run(10); lev(w,c.io.b,true); return a===3 && first(w,()=>!c.io.lamp.lit)===7; }) ] },

{ id:'rs-latch', strict:true, deviations:[], name:'Torch RS latch', category:'Toggles & logic',
  summary:'Two torches feeding each other remember a bit. Set turns the output on, reset turns it off, and it holds without power.',
  inputs:['set button','reset button'], outputs:['Q (torch and lamp)'], timing:'Set: lamp on at +5. Reset: lamp off at +5.',
  notes:['If set and reset are both held, both torches go dark and whichever input releases last wins.'],
  controls:[{ kind:'button', io:'set', label:'Set' },{ kind:'button', io:'reset', label:'Reset' }],
  build:() => Lg.rsLatch(),
  tests:[ T('set holds, reset holds', () => { const c=Lg.rsLatch(), w=c.world; w.run(3); const a=!c.io.lamp.lit; press(w,c.io.set); w.run(25); const b=c.io.lamp.lit; press(w,c.io.reset); w.run(25); return a && b && !c.io.lamp.lit; }),
          T('timing: set +5, reset +5', () => { const c=Lg.rsLatch(), w=c.world; w.run(3); press(w,c.io.set); const a=first(w,()=>c.io.lamp.lit); w.run(25); press(w,c.io.reset); return a===5 && first(w,()=>!c.io.lamp.lit)===5; }) ] },

{ id:'t-flip-flop', strict:true, deviations:[], monitor:(c) => ({ state: c.io.block.x===10 ? 'on (block dropped)' : 'off (block home)' }), name:'T flip-flop (block dropping)', category:'Toggles & logic',
  summary:'One button toggles a lamp. A rising-edge detector makes a 1-tick pulse. On that pulse a sticky piston drops its redstone block on one press and grabs it back on the next.',
  inputs:['button'], outputs:['lamp (toggles each press)'], timing:'Edge pulse at +3 (1 tick long); lamp flips at +4.',
  notes:['Edge detector: S AND NOT(S delayed 2), built from two torches and a repeater.','Relies on Java block dropping: a sticky piston that retracts 1 tick after pushing leaves the block behind.'],
  controls:[{ kind:'button', io:'button', label:'Press' }],
  build:() => Lg.tFlipFlop(),
  tests:[ T('toggles on every press', () => { const c=Lg.tFlipFlop(), w=c.world; w.run(5); const s=[]; for (let k=0;k<4;k++){ press(w,c.io.button); w.run(25); s.push(c.io.lamp.lit?1:0); } return s.join('')==='1010'; }),
          T('timing: edge +3, lamp +4', () => { const c=Lg.tFlipFlop(), w=c.world; w.run(5); press(w,c.io.button); let e=-1, l=-1; for (let t=1;t<20;t++){ w.tick(); if (e<0 && c.io.edge.lit) e=t; if (l<0 && c.io.lamp.lit) l=t; } return e===3 && l===4; }),
          T('exactly one edge pulse per press', () => { const c=Lg.tFlipFlop(), w=c.world; w.run(5); let n=0; for (let k=0;k<3;k++){ press(w,c.io.button); for (let i=0;i<25;i++){ w.tick(); if (c.io.edge.lit) n++; } } return n===3; }) ] },

{ id:'sequencer', strict:true, deviations:[], name:'Open/close sequencer', category:'Toggles & logic',
  summary:'Three outputs that switch in one order when opening and the reverse order when closing. Repeaters delay both edges equally, so this needs a torch AND gate and an OR.',
  inputs:['lever'], outputs:['P1 (first to open, last to close)','P2 (middle)','P3 (last to open, first to close)'], timing:'Open: P1 at +6, P2 at +8, P3 at +13 (the lamps turn off 2 ticks after losing power). Close: P3 at +3, P2 at +6, P1 at +12.',
  notes:['Outputs are high while closed.','P1 = NOT(L OR L+8), P2 = S+4, P3 = S OR S+8, where S = NOT L.','Another source (such as a latch) can drive it through a repeater at the inject cell.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.sequencer(),
  tests:[ T('opens P1, P2, P3 and closes P3, P2, P1', () => { const c=Lg.sequencer(), w=c.world, io=c.io; w.run(5);
      lev(w,io.lever,true); const o=[0,0,0]; let t=0; for (;t<30;t++){ w.tick(); ['p1','p2','p3'].forEach((k,i)=>{ if (!o[i] && !io[k].lit) o[i]=t+1; }); }
      lev(w,io.lever,false); const cl=[0,0,0]; for (t=0;t<30;t++){ w.tick(); ['p1','p2','p3'].forEach((k,i)=>{ if (!cl[i] && io[k].lit) cl[i]=t+1; }); }
      return o[0]<o[1] && o[1]<o[2] && cl[2]<cl[1] && cl[1]<cl[0]; }),
          T('timing: open 6, 8, 13; close 3, 6, 12', () => { const c=Lg.sequencer(), w=c.world, io=c.io; w.run(5); lev(w,io.lever,true); const o={}; for (let t=1;t<30;t++){ w.tick(); for (const k of ['p1','p2','p3']) if (o[k]==null && !io[k].lit) o[k]=t; }
      lev(w,io.lever,false); const cl={}; for (let t=1;t<30;t++){ w.tick(); for (const k of ['p1','p2','p3']) if (cl[k]==null && io[k].lit) cl[k]=t; }
      return [o.p1,o.p2,o.p3,cl.p3,cl.p2,cl.p1].join()==='6,8,13,3,6,12'; }) ] },

{ id:'observer-pulse', strict:true, deviations:[], name:'Observer pulse', category:'Clocks & pulses',
  summary:'An observer watching a lever emits a 1-tick pulse from its back every time the lever changes.',
  inputs:['lever'], outputs:['1-tick pulse on each flip'], timing:'Pulse on at +1 tick, off at +2.',
  notes:['Fires on both edges. Moved observers also fire (Java behavior), which is what drives flying machines.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.observerPulse(),
  tests:[ T('one 1-tick pulse per flip', () => { const c=Lg.observerPulse(), w=c.world; w.run(3); let on=0; lev(w,c.io.lever,true); for (let i=0;i<6;i++){ w.tick(); if (c.io.observer.on) on++; } lev(w,c.io.lever,false); for (let i=0;i<6;i++){ w.tick(); if (c.io.observer.on) on++; } return on===2; }) ] },

{ id:'edge-detector', strict:true, deviations:[], name:'Rising-edge detector', category:'Clocks & pulses',
  summary:'Turns the start of a long signal into a short pulse: S AND NOT(S delayed 2). Unlike an observer, it ignores the falling edge.',
  inputs:['lever'], outputs:['1-tick pulse when the lever turns on'], timing:'Pulse at +3, 1 tick long (the lamp stays lit 1 tick longer).',
  notes:['Built from two torches and a repeater. The pulse lasts 1 tick less than the repeater delay (2 here), so a delay of 1 gives no pulse.','The same detector drives the T flip-flop.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.edgeDetector(),
  tests:[ T('one 1-tick pulse on rising edges only', () => { const c=Lg.edgeDetector(), w=c.world; w.run(5); const on=[]; lev(w,c.io.lever,true); for (let t=1;t<15;t++){ w.tick(); if (c.io.edge.lit) on.push(t); } lev(w,c.io.lever,false); let off=0; for (let t=1;t<15;t++){ w.tick(); if (c.io.edge.lit) off++; } return on.join()==='3' && off===0; }) ] },

{ id:'torch-clock', strict:true, deviations:[], monitor:(c) => ({ period: `${2*(1+c.io.repeaters.reduce((n,r)=>n+r.delay,0))} ticks` }), name:'Torch clock', category:'Clocks & pulses',
  summary:'A torch on a block feeds two repeaters that loop back into the block, so the torch keeps turning itself off and on. A lever on the block stops it.',
  inputs:['stop lever','repeater delays (tap)'], outputs:['lamp blinking'], timing:'Period = 2 x (1 + repeater delays): 14 ticks at the default 3 + 3.',
  notes:['A torch burns out on its 8th turn-off within 60 game ticks (30 redstone ticks), as in Java, so keep the period above 4 ticks.','The lever powers the block directly, which holds the torch off.'],
  controls:[{ kind:'lever', io:'lever', label:'Stop' },{ kind:'repeaters', io:'repeaters' }],
  build:() => Lg.torchClock(),
  tests:[ T('period is 2 x (1 + delays)', () => [[3,3],[2,4],[4,4]].every(d => { const c=Lg.torchClock(d), w=c.world; w.run(5); const ts=[]; let prev=c.io.torch.lit; for (let t=1;t<80;t++){ w.tick(); if (c.io.torch.lit!==prev){ prev=c.io.torch.lit; ts.push(t); } } const want=1+d[0]+d[1]; return ts.length>4 && ts.slice(1).every((t,i)=>t-ts[i]===want); })),
          T('the lever stops it', () => { const c=Lg.torchClock(), w=c.world; w.run(5); lev(w,c.io.lever,true); w.run(20); let n=0; const s=c.io.lamp.lit; for (let i=0;i<40;i++){ w.tick(); if (c.io.lamp.lit!==s) n++; } return n===0 && !s; }) ] },

{ id:'delay-line', strict:true, deviations:[], name:'Repeater delay line', category:'Clocks & pulses',
  summary:'A signal crawls down a line of repeaters, lighting each lamp in turn. Repeaters delay turning off by the same amount.',
  inputs:['lever','repeater delays (tap)'], outputs:['one lamp per stage'], timing:'Each stage adds its repeater delay (1 to 4 ticks).',
  params:[{ key:'stages', label:'Stages', min:2, max:6, def:4 }],
  controls:[{ kind:'lever', io:'lever', label:'Lever' },{ kind:'repeaters', io:'repeaters' }],
  build:(p) => Lg.delayLine([2,4,3,4,2,3].slice(0,p.stages)),
  tests:[ T('lights in order and turns off in order', () => { const c=Lg.delayLine([2,4,3,4]), w=c.world, L=c.io.lamps; w.run(3); lev(w,c.io.lever,true); const on=L.map(()=>0); for (let t=1;t<30;t++){ w.tick(); L.forEach((l,i)=>{ if (!on[i] && l.lit) on[i]=t; }); }
      lev(w,c.io.lever,false); const off=L.map(()=>0); for (let t=1;t<30;t++){ w.tick(); L.forEach((l,i)=>{ if (!off[i] && !l.lit) off[i]=t; }); }
      return on.every((v,i)=>v>0 && (!i || v>on[i-1])) && off.every((v,i)=>v>0 && (!i || v>off[i-1])); }) ] },

{ id:'comparator-reader', strict:true, deviations:[], name:'Comparator fill reader', category:'Signals',
  summary:'A comparator reads how full a barrel is as a signal from 0 to 15. The dust loses a level per block, so the length of the glowing line shows the value.',
  inputs:['barrel fill'], outputs:['signal 0 to 15'], timing:'1 tick.',
  params:[{ key:'fill', label:'Fill', min:0, max:15, def:10 }],
  controls:[],
  build:(p) => Lg.status(p.fill),
  tests:[ T('output equals fill, dust decays per block', () => [0,3,9,15].every(f => { const c=Lg.status(f), w=c.world; w.run(4); const lv=[...Array(15)].map((_,k)=>w.get(2+k,0,0).lvl); return (c.comp.out||0)===f && lv.every((v,k)=>v===Math.max(0,f-k)); })) ] },

{ id:'comparator-subtractor', strict:true, deviations:[], name:'Comparator subtractor', category:'Signals',
  summary:'A comparator reads barrel A at its rear and barrel B at its side, through a second comparator. In subtract mode it outputs A minus B; in compare mode it passes A unless B is stronger.',
  inputs:['barrel A fill','barrel B fill'], outputs:['signal A - B (subtract) or A / 0 (compare)'], timing:'2 ticks (two comparators).',
  notes:['The front torch on the comparator is lit in subtract mode.','Only dust, redstone blocks and the outputs of repeaters, comparators and observers count as side inputs.'],
  params:[{ key:'a', label:'Fill A', min:0, max:15, def:12 },{ key:'b', label:'Fill B', min:0, max:15, def:5 },{ key:'mode', label:'Mode', options:['subtract','compare'], def:'subtract' }],
  controls:[],
  build:(p) => Lg.subtractor(p.a, p.b, p.mode==='compare' ? 'cmp' : 'sub'),
  tests:[ T('subtract: A - B, floored at 0', () => [[12,5],[5,12],[15,15],[9,0]].every(([a,b]) => { const c=Lg.subtractor(a,b,'sub'), w=c.world; w.run(5); return c.io.comp.out===Math.max(0,a-b) && w.get(2,0,0).lvl===Math.max(0,a-b); })),
          T('compare: A unless B is stronger', () => [[12,5],[5,12],[15,15],[9,0]].every(([a,b]) => { const c=Lg.subtractor(a,b,'cmp'), w=c.world; w.run(5); return c.io.comp.out===(a>=b?a:0); })) ] },

{ id:'sculk-latch', strict:true, deviations:[], name:'Sculk presence latch', category:'Sensors',
  summary:'A sculk sensor hears footsteps within 8 blocks and sets a torch latch, so the output stays on after the visitor stops moving. A button resets it.',
  inputs:['footsteps or any vibration','reset button'], outputs:['Q (latched)'], timing:'Vibration travels about 1 block per game tick. Sensor active 15 ticks, cooldown 5.',
  notes:['Wool between the sensor and the reset button stops the button click from re-setting the latch.','Keep the sensor more than 8 blocks from any piston it drives, or the machine will hear itself.'],
  controls:[{ kind:'walk', io:'sensor' },{ kind:'button', io:'reset', label:'Reset' }],
  build:() => Lg.sculkLatch(),
  tests:[ T('ignores steps beyond 8 blocks', () => { const c=Lg.sculkLatch(), w=c.world; w.run(3); w.hand.vibrate(1,10,0); w.run(30); return !c.io.lamp.lit; }),
          T('latches on a near step and holds', () => { const c=Lg.sculkLatch(), w=c.world; w.run(3); w.hand.vibrate(1,5,0); w.run(60); return c.io.lamp.lit && c.io.sensor.state==='idle'; }),
          T('reset clears it and the button is not heard', () => { const c=Lg.sculkLatch(), w=c.world; w.run(3); w.hand.vibrate(1,5,0); w.run(40); press(w,c.io.reset); w.hand.vibrate(c.io.reset.x,c.io.reset.y,0); w.run(40); return !c.io.lamp.lit; }) ] },

{ id:'piston-door-2x2', strict:true, deviations:[], monitor:(c) => { const n=[0,1].reduce((m,x)=>m+[0,1].filter(z=>c.world.get(x,0,z)).length,0); return { opening: n===4 ? 'closed' : n ? 'moving' : 'open' }; }, name:'2x2 piston door', category:'Doors',
  summary:'The classic starter door: two sticky pistons on each side pull the door blocks into the wall. One torch per side drives both of its pistons, the upper one through the block above the torch.',
  inputs:['lever'], outputs:['2x2 passage'], timing:'Open at +3, closed at +3.',
  notes:['No wiring links: the lever line runs in a trench under the floor, and each torch powers its lower piston directly and its upper piston through the block above it.','Pistons are extended while the torches are lit, so the door is closed at rest and the lever opens it.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => { const G=buildPistonDoor(); G.io={ lever:G.lever }; return G; },
  tests:[ T('opens and recloses identical, twice', () => { const G=buildPistonDoor(), w=G.world, sn=()=>snapIn(w,()=>true), clear=()=>[0,1].every(x=>[0,1].every(z=>!w.get(x,0,z))); w.run(5); const c0=sn(); let ok=true; for (let k=0;k<2;k++){ lev(w,G.lever,true); w.run(10); ok = ok && clear(); lev(w,G.lever,false); w.run(10); ok = ok && sn()===c0; } return ok; }),
          T('timing: open +3, closed +3', () => { const G=buildPistonDoor(), w=G.world, sn=()=>snapIn(w,()=>true), clear=()=>[0,1].every(x=>[0,1].every(z=>!w.get(x,0,z))); w.run(5); const c0=sn(); lev(w,G.lever,true); const o=first(w,clear); w.run(10); lev(w,G.lever,false); return o===3 && first(w,()=>sn()===c0)===3; }) ] },

];
const CATEGORIES = ['Toggles & logic','Clocks & pulses','Signals','Sensors','Doors','Navigation'];
const defaults = e => Object.fromEntries((e.params||[]).map(p => [p.key, p.def]));
// Generic checks every entry gets, run through build(params) at every parameter edge (min, default, max, each option).
const edges = e => (e.params||[]).reduce((acc,p) => acc.flatMap(a => [...new Set(p.options || [p.min, p.def, p.max])].map(v => ({ ...a, [p.key]:v }))), [{}]);
const fail = (p, msg) => { throw new Error(`${msg} with ${JSON.stringify(p)}`); };
function wellFormed(e){
  for (const p of edges(e)){
    const c = e.build(p), w = c.world, bx = c.box;
    if (!w || typeof w.tick!=='function') fail(p, 'no world');
    if (!Array.isArray(bx) || bx.length!==6 || !bx.every(Number.isFinite) || bx[0]>bx[1] || bx[2]>bx[3] || bx[4]>bx[5]) fail(p, 'bad box');
    for (const [k,v] of Object.entries(c.io||{})) if (v && !(Array.isArray(v)?v:[v]).every(b => b && w.get(b.x,b.y,b.z)===b)) fail(p, `io.${k} is not a block in the world`);
    for (const ctl of e.controls) if (ctl.io && !(ctl.io in (c.io||{}))) fail(p, `control io '${ctl.io}' missing`);
    if (!e.controls.some(ctl => !ctl.io || (c.io||{})[ctl.io]) && e.controls.length) fail(p, 'no usable control');
    w.run(4); if (e.monitor && typeof e.monitor(c)!=='object') fail(p, 'monitor did not return an object');
  }
  return true;
}
function leverCycle(e){
  for (const p of edges(e)){
    const c = e.build(p), w = c.world, L = c.io && c.io.lever; if (!L) continue;
    w.run(5); const s0 = snapIn(w,()=>true);
    for (let k=0;k<2;k++){ lev(w,L,true); w.run(120); lev(w,L,false); w.run(120); if (snapIn(w,()=>true)!==s0) fail(p, `blocks differ after cycle ${k+1}`); }
  }
  return true;
}
// A strict entry builds a sealed strict world, steady or a running clock, at every parameter edge.
function strictBuild(e){
  for (const p of edges(e)){
    const w = e.build(p).world;
    if (!w.strict || !w.sealed) fail(p, 'not a sealed strict world');
    const h0 = w.hash(); let changed = false;
    for (let i = 0; i < 100; i++){ w.tick(); if (w.hash() !== h0) changed = true; }
    if (changed && w.quiet) fail(p, 'the built state drifts to another steady state');
  }
  return true;
}
const testsOf = e => [...e.tests, T('builds at every parameter edge with valid box, io and controls', () => wellFormed(e)),
  ...(e.strict ? [T('strict: a sealed strict world at every parameter edge that does not drift to another state', () => strictBuild(e))] : []),
  ...(e.controls.some(c => c.kind==='lever' && c.io==='lever') ? [T('every block returns to its start after two lever cycles (every parameter edge)', () => leverCycle(e))] : [])];
function runTests(e){ return testsOf(e).map(t => { const t0=Date.now(); let pass=false, err=null; try { pass = !!t.fn(); } catch(x){ err = String(x && x.message || x); } return { name:t.name, pass, err, ms:Date.now()-t0 }; }); }
// Entries defined in their own files (src/contraptions/ui/*.js) add themselves here. A new category is appended.
function register(entry){
  if (!entry || !entry.id) throw new Error('Catalogue.register: entry needs an id');
  if (entries.some(e => e.id === entry.id)) throw new Error(`Catalogue.register: duplicate id '${entry.id}'`);
  if (!CATEGORIES.includes(entry.category)) CATEGORIES.push(entry.category);
  entries.push(entry); return entry;
}
const get = id => entries.find(e => e.id === id) || null;
const api = { entries, CATEGORIES, defaults, testsOf, runTests, register, get };
if (N) module.exports = api; else window.Catalogue = api;
})();
