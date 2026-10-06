// Redstone kit catalogue. Each entry: metadata, params, controls, build(params) -> { world, box, io, ... }, tests.
(function(){
const N = typeof module!=='undefined';
const RS = N ? require('./engine.js') : window.RS;
const Lg = N ? require('./contraptions/logic.js') : window.Logic;
const Sc = N ? require('./contraptions/scenes.js') : window.Scenes;
const { buildDoor } = N ? require('./contraptions/door.js') : window;
const { buildHidden } = N ? require('./contraptions/hidden.js') : window;
const { buildPlaque } = N ? require('./contraptions/plaque.js') : window;
const { buildLauncherNav, buildSharedLauncherNav, buildHiddenLauncherNav } = N ? require('./contraptions/launcher.js') : window;
const { buildPistonDoor } = N ? require('./contraptions/pistondoor.js') : window;

const press = (w,b,n=10) => { b.on = true; w.at(w.t+n, () => { b.on = false; }); };
const until = (w, f, max=200) => { for (let i=0;i<max;i++){ if (f()) return i; w.tick(); } return f() ? max : -1; };
const first = (w, f, max=200) => { for (let i=1;i<=max;i++){ w.tick(); if (f()) return i; } return -1; };   // ticks until f() holds, counting the first tick as 1
const snapIn = (w, f) => [...w.c.values()].filter(f).map(b=>b.t+(b.ext?'E':'')+[b.x,b.y,b.z]).sort().join(';');
const T = (name, fn) => ({ name, fn });
const doorArea = (G) => { const w=G.world; let n=0; for (let x=0;x<G.W;x++) for (const y of [1,2]) for (let z=0;z<2*G.L;z++) if (w.get(x,y,z)) n++; return n; };
const hiddenClear = (H) => { for (const x of [0,1]) for (let y=0;y<=5;y++) for (const z of [0,1]) if (H.world.get(x,y,z)) return false; return true; };
const truth = (build, want) => [[0,0],[1,0],[0,1],[1,1]].every(([a,b],i) => { const c=build(), w=c.world; w.run(5); c.io.a.on=!!a; c.io.b.on=!!b; w.run(20); return !!c.io.lamp.lit === !!want[i]; });
const plaqueClear = (P) => P.bands.every(z0 => { for (let x=0;x<P.W;x++) for (let y=P.F-2;y<=P.F;y++) for (const z of [z0,z0+1]) if (P.world.get(x,y,z)) return false; return true; });

const entries = [
{ id:'lever-lamp', name:'Lever and lamp', category:'Toggles & logic',
  summary:'The simplest circuit: a lever powers dust, and the dust powers a lamp.',
  inputs:['lever'], outputs:['lamp'], timing:'Lamp on in the same tick; off 1 tick after power drops.',
  notes:['Dust loses 1 level per block, so a lamp must be within 15 blocks of the source.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.leverLamp(),
  tests:[ T('lamp follows the lever', () => { const c=Lg.leverLamp(), w=c.world; w.run(3); const a=!c.io.lamp.lit; c.io.lever.on=true; w.run(2); const b=c.io.lamp.lit; c.io.lever.on=false; w.run(3); return a && b && !c.io.lamp.lit; }) ] },

{ id:'inverter', name:'Torch inverter (NOT)', category:'Toggles & logic',
  summary:'A torch on a block turns off when the block is powered, so the output is the opposite of the input.',
  inputs:['lever'], outputs:['lamp (inverted)'], timing:'1 tick per torch.',
  notes:['A torch never powers the block it is attached to.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.inverter(),
  tests:[ T('output is inverted', () => { const c=Lg.inverter(), w=c.world; w.run(3); const a=c.io.lamp.lit; c.io.lever.on=true; w.run(4); const b=!c.io.lamp.lit; c.io.lever.on=false; w.run(4); return a && b && c.io.lamp.lit; }) ] },

{ id:'or-gate', name:'OR gate', category:'Toggles & logic',
  summary:'Two dust lines meet, so either input lights the lamp.',
  inputs:['lever A','lever B'], outputs:['lamp (A OR B)'], timing:'Same tick on; off 1 tick after both drop.',
  notes:['Dust carries power both ways, so the inputs also feed each other. Put a repeater on each input if the sources must stay isolated.'],
  controls:[{ kind:'lever', io:'a', label:'Lever A' },{ kind:'lever', io:'b', label:'Lever B' }],
  build:() => Lg.orGate(),
  tests:[ T('truth table 0111', () => truth(Lg.orGate, [0,1,1,1])) ] },

{ id:'and-gate', name:'AND gate (torch)', category:'Toggles & logic',
  summary:'Each input turns off its torch. The torch outputs join into a block, and the torch on that block is lit only when both inputs are on.',
  inputs:['lever A','lever B'], outputs:['lamp (A AND B)'], timing:'Lamp on at +3 after the second input.',
  notes:['A AND B = NOT(NOT A OR NOT B).'],
  controls:[{ kind:'lever', io:'a', label:'Lever A' },{ kind:'lever', io:'b', label:'Lever B' }],
  build:() => Lg.andGate(),
  tests:[ T('truth table 0001', () => truth(Lg.andGate, [0,0,0,1])),
          T('timing: lamp on at +3 after the second input', () => { const c=Lg.andGate(), w=c.world; w.run(5); c.io.a.on=true; w.run(10); c.io.b.on=true; return first(w,()=>c.io.lamp.lit)===3; }) ] },

{ id:'xor-gate', name:'XOR gate (comparator)', category:'Toggles & logic',
  summary:'A comparator in subtract mode takes A OR B at the rear and A AND B at the side, so the output is on when exactly one input is on.',
  inputs:['lever A','lever B'], outputs:['lamp (A XOR B)'], timing:'One input: lamp on at +3. Adding the second: lamp off at +6 (the AND path is slower).',
  notes:['XOR = (A OR B) - (A AND B). The AND torch also feeds the rear, which is harmless: it is only on when OR is.','Switching from one input to both can flash the output for a tick while the AND path catches up.'],
  controls:[{ kind:'lever', io:'a', label:'Lever A' },{ kind:'lever', io:'b', label:'Lever B' }],
  build:() => Lg.xorGate(),
  tests:[ T('truth table 0110', () => truth(Lg.xorGate, [0,1,1,0])),
          T('follows a sequence of inputs', () => { const c=Lg.xorGate(), w=c.world; w.run(5); return [[1,0,1],[1,1,0],[0,1,1],[0,0,0],[1,1,0],[1,0,1]].every(([a,b,q]) => { c.io.a.on=!!a; c.io.b.on=!!b; w.run(20); return !!c.io.lamp.lit===!!q; }); }),
          T('timing: on at +3, off at +6 when the second input joins', () => { const c=Lg.xorGate(), w=c.world; w.run(5); c.io.a.on=true; const a=first(w,()=>c.io.lamp.lit); w.run(10); c.io.b.on=true; return a===3 && first(w,()=>!c.io.lamp.lit)===6; }) ] },

{ id:'rs-latch', name:'Torch RS latch', category:'Toggles & logic',
  summary:'Two torches feeding each other remember a bit. Set turns the output on, reset turns it off, and it holds without power.',
  inputs:['set button','reset button'], outputs:['Q (torch and lamp)'], timing:'Set: lamp on at +5. Reset: lamp off at +4.',
  notes:['If set and reset are both held, both torches go dark and whichever input releases last wins.'],
  controls:[{ kind:'button', io:'set', label:'Set' },{ kind:'button', io:'reset', label:'Reset' }],
  build:() => Lg.rsLatch(),
  tests:[ T('set holds, reset holds', () => { const c=Lg.rsLatch(), w=c.world; w.run(3); const a=!c.io.lamp.lit; press(w,c.io.set); w.run(25); const b=c.io.lamp.lit; press(w,c.io.reset); w.run(25); return a && b && !c.io.lamp.lit; }),
          T('timing: set +5, reset +4', () => { const c=Lg.rsLatch(), w=c.world; w.run(3); press(w,c.io.set); const a=first(w,()=>c.io.lamp.lit); w.run(25); press(w,c.io.reset); return a===5 && first(w,()=>!c.io.lamp.lit)===4; }) ] },

{ id:'t-flip-flop', monitor:(c) => ({ state: c.io.block.x===10 ? 'on (block dropped)' : 'off (block home)' }), name:'T flip-flop (block dropping)', category:'Toggles & logic',
  summary:'One button toggles a lamp. A rising-edge detector makes a 1-tick pulse. On that pulse a sticky piston drops its redstone block on one press and grabs it back on the next.',
  inputs:['button'], outputs:['lamp (toggles each press)'], timing:'Edge pulse at +3 (1 tick long); lamp flips at +4.',
  notes:['Edge detector: S AND NOT(S delayed 2), built from two torches and a repeater.','Relies on Java block dropping: a sticky piston that retracts 1 tick after pushing leaves the block behind.'],
  controls:[{ kind:'button', io:'button', label:'Press' }],
  build:() => Lg.tFlipFlop(),
  tests:[ T('toggles on every press', () => { const c=Lg.tFlipFlop(), w=c.world; w.run(5); const s=[]; for (let k=0;k<4;k++){ press(w,c.io.button); w.run(25); s.push(c.io.lamp.lit?1:0); } return s.join('')==='1010'; }),
          T('timing: edge +3, lamp +4', () => { const c=Lg.tFlipFlop(), w=c.world; w.run(5); press(w,c.io.button); let e=-1, l=-1; for (let t=1;t<20;t++){ w.tick(); if (e<0 && c.io.edge.lit) e=t; if (l<0 && c.io.lamp.lit) l=t; } return e===3 && l===4; }),
          T('exactly one edge pulse per press', () => { const c=Lg.tFlipFlop(), w=c.world; w.run(5); let n=0; for (let k=0;k<3;k++){ press(w,c.io.button); for (let i=0;i<25;i++){ w.tick(); if (c.io.edge.lit) n++; } } return n===3; }) ] },

{ id:'sequencer', name:'Open/close sequencer', category:'Toggles & logic',
  summary:'Three outputs that switch in one order when opening and the reverse order when closing. Repeaters delay both edges equally, so this needs a torch AND gate and an OR.',
  inputs:['lever'], outputs:['P1 (first to open, last to close)','P2 (middle)','P3 (last to open, first to close)'], timing:'Open: P1 at +5, P2 at +7, P3 at +12. Close: P3 at +3, P2 at +6, P1 at +12.',
  notes:['Outputs are high while closed.','P1 = NOT(L OR L+8), P2 = S+4, P3 = S OR S+8, where S = NOT L.','Another source (such as a latch) can drive it through a repeater at the inject cell.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.sequencer(),
  tests:[ T('opens P1, P2, P3 and closes P3, P2, P1', () => { const c=Lg.sequencer(), w=c.world, io=c.io; w.run(5);
      io.lever.on=true; const o=[0,0,0]; let t=0; for (;t<30;t++){ w.tick(); ['p1','p2','p3'].forEach((k,i)=>{ if (!o[i] && !io[k].lit) o[i]=t+1; }); }
      io.lever.on=false; const cl=[0,0,0]; for (t=0;t<30;t++){ w.tick(); ['p1','p2','p3'].forEach((k,i)=>{ if (!cl[i] && io[k].lit) cl[i]=t+1; }); }
      return o[0]<o[1] && o[1]<o[2] && cl[2]<cl[1] && cl[1]<cl[0]; }),
          T('timing: open 5, 7, 12; close 3, 6, 12', () => { const c=Lg.sequencer(), w=c.world, io=c.io; w.run(5); io.lever.on=true; const o={}; for (let t=1;t<30;t++){ w.tick(); for (const k of ['p1','p2','p3']) if (o[k]==null && !io[k].lit) o[k]=t; }
      io.lever.on=false; const cl={}; for (let t=1;t<30;t++){ w.tick(); for (const k of ['p1','p2','p3']) if (cl[k]==null && io[k].lit) cl[k]=t; }
      return [o.p1,o.p2,o.p3,cl.p3,cl.p2,cl.p1].join()==='5,7,12,3,6,12'; }) ] },

{ id:'observer-pulse', name:'Observer pulse', category:'Clocks & pulses',
  summary:'An observer watching a lever emits a 1-tick pulse from its back every time the lever changes.',
  inputs:['lever'], outputs:['1-tick pulse on each flip'], timing:'Pulse on at +1 tick, off at +2.',
  notes:['Fires on both edges. Moved observers also fire (Java behavior), which is what drives flying machines.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.observerPulse(),
  tests:[ T('one 1-tick pulse per flip', () => { const c=Lg.observerPulse(), w=c.world; w.run(3); let on=0; c.io.lever.on=true; for (let i=0;i<6;i++){ w.tick(); if (c.io.observer.on) on++; } c.io.lever.on=false; for (let i=0;i<6;i++){ w.tick(); if (c.io.observer.on) on++; } return on===2; }) ] },

{ id:'edge-detector', name:'Rising-edge detector', category:'Clocks & pulses',
  summary:'Turns the start of a long signal into a short pulse: S AND NOT(S delayed 2). Unlike an observer, it ignores the falling edge.',
  inputs:['lever'], outputs:['1-tick pulse when the lever turns on'], timing:'Pulse at +3, 1 tick long (the lamp stays lit 1 tick longer).',
  notes:['Built from two torches and a repeater. The pulse lasts 1 tick less than the repeater delay (2 here), so a delay of 1 gives no pulse.','The same detector drives the T flip-flop.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => Lg.edgeDetector(),
  tests:[ T('one 1-tick pulse on rising edges only', () => { const c=Lg.edgeDetector(), w=c.world; w.run(5); const on=[]; c.io.lever.on=true; for (let t=1;t<15;t++){ w.tick(); if (c.io.edge.lit) on.push(t); } c.io.lever.on=false; let off=0; for (let t=1;t<15;t++){ w.tick(); if (c.io.edge.lit) off++; } return on.join()==='3' && off===0; }) ] },

{ id:'torch-clock', monitor:(c) => ({ period: `${2*(1+c.io.repeaters.reduce((n,r)=>n+r.delay,0))} ticks` }), name:'Torch clock', category:'Clocks & pulses',
  summary:'A torch on a block feeds two repeaters that loop back into the block, so the torch keeps turning itself off and on. A lever on the block stops it.',
  inputs:['stop lever','repeater delays (tap)'], outputs:['lamp blinking'], timing:'Period = 2 x (1 + repeater delays): 14 ticks at the default 3 + 3.',
  notes:['In Java a torch burns out after about 8 flips in 30 redstone ticks, so keep the period at 8 ticks or more. The engine does not model burnout.','The lever powers the block directly, which holds the torch off.'],
  controls:[{ kind:'lever', io:'lever', label:'Stop' },{ kind:'repeaters', io:'repeaters' }],
  build:() => Lg.torchClock(),
  tests:[ T('period is 2 x (1 + delays)', () => [[3,3],[2,4],[4,4]].every(d => { const c=Lg.torchClock(d), w=c.world; w.run(5); const ts=[]; let prev=c.io.torch.lit; for (let t=1;t<80;t++){ w.tick(); if (c.io.torch.lit!==prev){ prev=c.io.torch.lit; ts.push(t); } } const want=1+d[0]+d[1]; return ts.length>4 && ts.slice(1).every((t,i)=>t-ts[i]===want); })),
          T('the lever stops it', () => { const c=Lg.torchClock(), w=c.world; w.run(5); c.io.lever.on=true; w.run(20); let n=0; const s=c.io.lamp.lit; for (let i=0;i<40;i++){ w.tick(); if (c.io.lamp.lit!==s) n++; } return n===0 && !s; }) ] },

{ id:'delay-line', name:'Repeater delay line', category:'Clocks & pulses',
  summary:'A signal crawls down a line of repeaters, lighting each lamp in turn. Repeaters delay turning off by the same amount.',
  inputs:['lever','repeater delays (tap)'], outputs:['one lamp per stage'], timing:'Each stage adds its repeater delay (1 to 4 ticks).',
  params:[{ key:'stages', label:'Stages', min:2, max:6, def:4 }],
  controls:[{ kind:'lever', io:'lever', label:'Lever' },{ kind:'repeaters', io:'repeaters' }],
  build:(p) => Lg.delayLine([2,4,3,4,2,3].slice(0,p.stages)),
  tests:[ T('lights in order and turns off in order', () => { const c=Lg.delayLine([2,4,3,4]), w=c.world, L=c.io.lamps; w.run(3); c.io.lever.on=true; const on=L.map(()=>0); for (let t=1;t<30;t++){ w.tick(); L.forEach((l,i)=>{ if (!on[i] && l.lit) on[i]=t; }); }
      c.io.lever.on=false; const off=L.map(()=>0); for (let t=1;t<30;t++){ w.tick(); L.forEach((l,i)=>{ if (!off[i] && !l.lit) off[i]=t; }); }
      return on.every((v,i)=>v>0 && (!i || v>on[i-1])) && off.every((v,i)=>v>0 && (!i || v>off[i-1])); }) ] },

{ id:'comparator-reader', name:'Comparator fill reader', category:'Signals',
  summary:'A comparator reads how full a barrel is as a signal from 0 to 15. The dust loses a level per block, so the length of the glowing line shows the value.',
  inputs:['barrel fill'], outputs:['signal 0 to 15'], timing:'1 tick.',
  params:[{ key:'fill', label:'Fill', min:0, max:15, def:10 }],
  controls:[],
  build:(p) => { const c=Sc.status(p.fill); c.io={ comp:c.comp, barrel:c.world.get(0,0,0) }; return c; },
  tests:[ T('output equals fill, dust decays per block', () => [0,3,9,15].every(f => { const c=Sc.status(f), w=c.world; w.run(4); const lv=[...Array(15)].map((_,k)=>w.get(2+k,0,0).lvl); return (c.comp.out||0)===f && lv.every((v,k)=>v===Math.max(0,f-k)); })) ] },

{ id:'comparator-subtractor', name:'Comparator subtractor', category:'Signals',
  summary:'A comparator reads barrel A at its rear and barrel B at its side, through a second comparator. In subtract mode it outputs A minus B; in compare mode it passes A unless B is stronger.',
  inputs:['barrel A fill','barrel B fill'], outputs:['signal A - B (subtract) or A / 0 (compare)'], timing:'2 ticks (two comparators).',
  notes:['The front torch on the comparator is lit in subtract mode.','Only dust, repeaters and comparators count as side inputs.'],
  params:[{ key:'a', label:'Fill A', min:0, max:15, def:12 },{ key:'b', label:'Fill B', min:0, max:15, def:5 },{ key:'mode', label:'Mode', options:['subtract','compare'], def:'subtract' }],
  controls:[],
  build:(p) => Lg.subtractor(p.a, p.b, p.mode==='compare' ? 'cmp' : 'sub'),
  tests:[ T('subtract: A - B, floored at 0', () => [[12,5],[5,12],[15,15],[9,0]].every(([a,b]) => { const c=Lg.subtractor(a,b,'sub'), w=c.world; w.run(5); return c.io.comp.out===Math.max(0,a-b) && w.get(2,0,0).lvl===Math.max(0,a-b); })),
          T('compare: A unless B is stronger', () => [[12,5],[5,12],[15,15],[9,0]].every(([a,b]) => { const c=Lg.subtractor(a,b,'cmp'), w=c.world; w.run(5); return c.io.comp.out===(a>=b?a:0); })) ] },

{ id:'sculk-latch', name:'Sculk presence latch', category:'Sensors',
  summary:'A sculk sensor hears footsteps within 8 blocks and sets a torch latch, so the output stays on after the visitor stops moving. A button resets it.',
  inputs:['footsteps or any vibration','reset button'], outputs:['Q (latched)'], timing:'Vibration travels about 1 block per game tick. Sensor active 15 ticks, cooldown 5.',
  notes:['Wool between the sensor and the reset button stops the button click from re-setting the latch.','Keep the sensor more than 8 blocks from any piston it drives, or the machine will hear itself.'],
  controls:[{ kind:'walk', io:'sensor' },{ kind:'button', io:'reset', label:'Reset' }],
  build:() => Lg.sculkLatch(),
  tests:[ T('ignores steps beyond 8 blocks', () => { const c=Lg.sculkLatch(), w=c.world; w.run(3); w.vibrate(1,10,0); w.run(30); return !c.io.lamp.lit; }),
          T('latches on a near step and holds', () => { const c=Lg.sculkLatch(), w=c.world; w.run(3); w.vibrate(1,5,0); w.run(60); return c.io.lamp.lit && c.io.sensor.state==='idle'; }),
          T('reset clears it and the button is not heard', () => { const c=Lg.sculkLatch(), w=c.world; w.run(3); w.vibrate(1,5,0); w.run(40); press(w,c.io.reset); w.vibrate(c.io.reset.x,c.io.reset.y,0); w.run(40); return !c.io.lamp.lit; }) ] },

{ id:'plate-reveal', monitor:(c) => ({ 'covers down': `${c.covers.filter(b=>b.z===0).length} / ${c.covers.length}` }), name:'Pull-down cover reveal', category:'Reveals',
  summary:'Standing on a pressure plate turns off a torch under the floor. Sticky pistons lose power and pull a row of cover blocks down, revealing what is behind them. Step off and they push the covers back up.',
  inputs:['pressure plate'], outputs:['one row revealed'], timing:'About 3 ticks to reveal.',
  params:[{ key:'width', label:'Width', min:4, max:16, def:10 }],
  controls:[{ kind:'plate', io:'plate', label:'Stand on plate' }],
  build:(p) => { const c=Sc.contact(p.width); c.io={ plate:c.plate }; return c; },
  tests:[ T('reveals while pressed, recovers after', () => { const c=Sc.contact(12), w=c.world; w.run(4); const a=c.covers.every(b=>b.z===1); c.plate.on=true; w.run(6); const b=c.covers.every(b=>b.z===0); c.plate.on=false; w.run(6); return a && b && c.covers.every(b=>b.z===1); }),
          T('timing: revealed at +3', () => { const c=Sc.contact(10), w=c.world; w.run(4); c.plate.on=true; return first(w,()=>c.covers.every(b=>b.z===0))===3; }) ] },

{ id:'flying-machine', monitor:(c) => { let z=1e9; for (const b of c.world.c.values()) if (b.x===0 && (b.y===1||b.y===2) && b.t!=='obsidian') z=Math.min(z,b.z); return { 'height above home': `${z-c.L} blocks` }; }, name:'2-way flying machine', category:'Flying machines',
  summary:'A column that flies itself: 2 sticky pistons, 2 observers, slime or honey, plus cargo. Powering one piston sends it out; powering the other brings it back.',
  inputs:['lever (observer pulse into the wall behind each engine)'], outputs:['column position'], timing:'First move at +8, then 1 block every 3 ticks.',
  params:[{ key:'cargo', label:'Cargo rows', min:1, max:4, def:2 }],
  notes:['Uses wiring links: the trigger output reaches the station blocks next to the pistons through links that stand in for buried wiring.','Push limit 12: each half (4 engine blocks plus cargo) must stay at or under 12.','Needs block dropping so the pushing piston does not pull its load back.','A moved observer fires, so each half triggers the other.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:(p) => { const G=buildDoor(1,{ halves:['top'], trigger:'lever', Rc:p.cargo, Fc:p.cargo }); G.box=[0,5,0,G.yMax,G.zMin,G.zMax]; G.io={ lever:G.lever }; return G; },
  tests:[ T('flies out and returns identical', () => { const G=buildDoor(1,{ halves:['top'], trigger:'lever' }), w=G.world, sn=()=>snapIn(w,b=>b.y===1||b.y===2); w.run(5); const c0=sn(); G.lever.on=true; w.run(80); const moved = !w.get(0,1,G.L+1); G.lever.on=false; w.run(80); return moved && sn()===c0; }),
          T('timing: first move +8, then every 3 ticks', () => { const G=buildDoor(1,{ halves:['top'], trigger:'lever' }), w=G.world, h=()=>{ let z=1e9; for (const b of w.c.values()) if (b.x===0 && (b.y===1||b.y===2) && b.t!=='obsidian') z=Math.min(z,b.z); return z-G.L; }; w.run(5); G.lever.on=true; const ts=[]; let last=0; for (let t=1;t<40;t++){ w.tick(); if (h()!==last){ last=h(); ts.push(t); } } return ts.slice(0,4).join()==='8,11,14,17'; }) ] },

{ id:'split-door', monitor:(c) => ({ 'opening clear': `${Math.round(100*(1-doorArea(c)/(c.W*4*c.L)))}%` }), name:'Flying-machine split door', category:'Flying machines',
  summary:'A wide door made of 1-wide, 2-deep flying machines. Top halves fly into an attic and bottom halves drop into a pit 8 ticks later. Neighbors alternate slime and honey so they never stick, and they move in lockstep.',
  inputs:['lever or sculk latch'], outputs:['opening 2L tall, any width'], timing:'Fully open at +37, fully closed at +29, at any width.',
  params:[{ key:'width', label:'Width', min:2, max:16, def:8 },{ key:'cargo', label:'Cargo rows', min:1, max:4, def:2 },{ key:'trigger', label:'Trigger', options:['lever','sculk'], def:'lever' }],
  notes:['Uses wiring links: the trigger output reaches the station blocks next to the pistons through links that stand in for buried wiring.','Columns must move in lockstep. Out-of-step neighbors line up slime against non-sticky blocks and glue together.','Seam cargo must be at least 1 row, or the seam observers see the other half.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' },{ kind:'walk', io:'sensor' },{ kind:'button', io:'button', label:'Reset' }],
  build:(p) => { const G=buildDoor(p.width,{ trigger:p.trigger, Rc:p.cargo, Fc:p.cargo }); G.box=[0,Math.max(p.width,6)-1,0,G.yMax,G.zMin,G.zMax]; G.io={ lever:G.lever, sensor:G.sensor, button:G.button }; return G; },
  tests:[ T('opens fully and recloses identical, twice (lever)', () => { const G=buildDoor(6,{ trigger:'lever' }), w=G.world, sn=()=>snapIn(w,b=>b.y===1||b.y===2); w.run(5); const c0=sn(); let ok=true; for (let k=0;k<2;k++){ G.lever.on=true; w.run(80); ok = ok && doorArea(G)===0; G.lever.on=false; w.run(80); ok = ok && sn()===c0; } return ok; }),
          T('sculk trigger opens; reset closes; it cannot hear itself', () => { const G=buildDoor(6), w=G.world; w.run(5); w.vibrate(1,G.sensor.y+5,0); w.run(90); const a=doorArea(G)===0; press(w,G.button); w.vibrate(G.button.x,G.button.y,0); w.run(120); return a && doorArea(G)===G.W*4*G.L; }),
          T('timing: open +37, closed +29 (widths 2 and 16)', () => [2,16].every(W => { const G=buildDoor(W,{ trigger:'lever' }), w=G.world; w.run(5); G.lever.on=true; const o=first(w,()=>doorArea(G)===0); w.run(40); G.lever.on=false; return o===37 && first(w,()=>doorArea(G)===G.W*4*G.L)===29; })),
          T('sculk trigger at width 16, cargo 4', () => { const G=buildDoor(16,{ Rc:4, Fc:4 }), w=G.world; w.run(5); w.vibrate(1,G.sensor.y+5,0); w.run(90); const a=doorArea(G)===0; press(w,G.button); w.vibrate(G.button.x,G.button.y,0); w.run(150); return a && doorArea(G)===G.W*4*G.L; }) ] },

{ id:'piston-door-2x2', monitor:(c) => { const n=[0,1].reduce((m,x)=>m+[0,1].filter(z=>c.world.get(x,0,z)).length,0); return { opening: n===4 ? 'closed' : n ? 'moving' : 'open' }; }, name:'2x2 piston door', category:'Doors',
  summary:'The classic starter door: two sticky pistons on each side pull the door blocks into the wall. One torch per side drives both of its pistons, the upper one through the block above the torch.',
  inputs:['lever'], outputs:['2x2 passage'], timing:'Open at +3, closed at +3.',
  notes:['No wiring links: the lever line runs in a trench under the floor, and each torch powers its lower piston directly and its upper piston through the block above it.','Pistons are extended while the torches are lit, so the door is closed at rest and the lever opens it.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' }],
  build:() => { const G=buildPistonDoor(); G.io={ lever:G.lever }; return G; },
  tests:[ T('opens and recloses identical, twice', () => { const G=buildPistonDoor(), w=G.world, sn=()=>snapIn(w,()=>true), clear=()=>[0,1].every(x=>[0,1].every(z=>!w.get(x,0,z))); w.run(5); const c0=sn(); let ok=true; for (let k=0;k<2;k++){ G.lever.on=true; w.run(10); ok = ok && clear(); G.lever.on=false; w.run(10); ok = ok && sn()===c0; } return ok; }),
          T('timing: open +3, closed +3', () => { const G=buildPistonDoor(), w=G.world, sn=()=>snapIn(w,()=>true), clear=()=>[0,1].every(x=>[0,1].every(z=>!w.get(x,0,z))); w.run(5); const c0=sn(); G.lever.on=true; const o=first(w,clear); w.run(10); G.lever.on=false; return o===3 && first(w,()=>sn()===c0)===3; }) ] },

{ id:'hidden-2x2', monitor:(c) => ({ door: c.door.every(b => b.y===c.F && c.world.get(b.x,b.y,b.z)===b) && [0,1].every(x => [0,1].every(z => c.world.get(x,c.F,z))) ? 'closed (flush)' : hiddenClear(c) ? 'open (passage clear)' : 'moving' }), name:'Flush 2x2 hidden door', category:'Doors',
  summary:'A 2x2 opening in a brick wall that looks seamless when closed. The bricks pull in, slide sideways behind the face, then the back pistons drop into the floor and ceiling so the passage clears.',
  inputs:['lever or sculk latch','reset button'], outputs:['2x2 passage'], timing:'Open at +11, closed at +12.', depth:true,
  params:[{ key:'trigger', label:'Trigger', options:['lever','sculk'], def:'lever' }],
  notes:['Uses wiring links: the trigger output reaches the station blocks next to the pistons through links that stand in for buried wiring.','12 sticky pistons, driven by the open/close sequencer.','Every trigger is a real block next to its piston.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' },{ kind:'walk', io:'sensor' },{ kind:'button', io:'button', label:'Reset' }],
  build:(p) => { const H=buildHidden({ trigger:p.trigger }); H.io={ lever:H.lever, sensor:H.sensor, button:H.button }; return H; },
  tests:[ T('opens a clear passage and recloses identical, twice', () => { const H=buildHidden(), w=H.world, sn=()=>snapIn(w,b=>b.y<=5), clear=()=>{ for (const x of [0,1]) for (let y=0;y<=5;y++) for (const z of [0,1]) if (w.get(x,y,z)) return false; return true; }; w.run(3); const c0=sn(); let ok=true; for (let k=0;k<2;k++){ H.lever.on=true; w.run(25); ok = ok && clear(); H.lever.on=false; w.run(25); ok = ok && sn()===c0; } return ok; }),
          T('timing: open +11, closed +12', () => { const H=buildHidden(), w=H.world, sn=()=>snapIn(w,b=>b.y<=5); w.run(3); const c0=sn(); H.lever.on=true; const o=first(w,()=>hiddenClear(H)); w.run(20); H.lever.on=false; return o===11 && first(w,()=>sn()===c0)===12; }),
          T('sculk opens, reset closes identical and it cannot hear itself', () => { const H=buildHidden({ trigger:'sculk' }), w=H.world, sn=()=>snapIn(w,b=>b.y<=5); w.run(3); const c0=sn(); w.vibrate(H.sensor.x+1,H.sensor.y+5,0); w.run(60); const a=hiddenClear(H); press(w,H.button); w.vibrate(H.button.x,H.button.y,0); w.run(100); return a && sn()===c0; }) ] },

{ id:'hidden-plaque', monitor:(c) => ({ 'bands open': `${c.bands.filter(z0 => { for (let x=0;x<c.W;x++) for (let y=c.F-2;y<=c.F;y++) for (const z of [z0,z0+1]) if (c.world.get(x,y,z)) return false; return true; }).length} / ${c.bands.length}` }), name:'Hidden plaque (stacked bands)', category:'Doors',
  summary:'A flush hidden door scaled up to reveal text. Each band is a 2-tall opening of any width, with hidden pullers above and below, revealing a plaque 3 blocks deep.',
  inputs:['lever or sculk latch','reset button'], outputs:['n text bands, 2 rows each'], timing:'Open at +11, closed at +12.', depth:true, plaque:true,
  params:[{ key:'width', label:'Width', min:4, max:20, def:10 },{ key:'bands', label:'Bands', min:1, max:3, def:2 },{ key:'trigger', label:'Trigger', options:['sculk','lever'], def:'sculk' }],
  notes:['Uses wiring links: the trigger output reaches the station blocks next to the pistons through links that stand in for buried wiring.','Bands are capped at 2 tall: after a brick pulls in, it must slide into an empty neighbor.','Bands need 4 rows of wall between them for the pullers.','Use a low camera tilt; at a steep angle the slot lip hides the plaque.'],
  controls:[{ kind:'lever', io:'lever', label:'Lever' },{ kind:'walk', io:'sensor' },{ kind:'button', io:'button', label:'Reset' }],
  build:(p) => { const P=buildPlaque(p.width,p.bands,{ trigger:p.trigger }); P.box=P.box.slice(); P.box[4]=-1; P.io={ lever:P.lever, sensor:P.sensor, button:P.button }; return P; },
  tests:[ T('opens all bands and recloses identical, twice', () => { const P=buildPlaque(8,2,{ trigger:'lever' }), w=P.world, sn=()=>snapIn(w,b=>b.y<=P.F); w.run(3); const c0=sn(); let ok=true; for (let k=0;k<2;k++){ P.lever.on=true; w.run(30); ok = ok && plaqueClear(P); P.lever.on=false; w.run(30); ok = ok && sn()===c0; } return ok; }),
          T('sculk opens, reset closes and stays closed', () => { const P=buildPlaque(8,2), w=P.world; w.run(3); w.vibrate(1,P.sensor.y+5,0); w.run(40); const a=plaqueClear(P); press(w,P.button); w.vibrate(P.button.x,P.button.y,0); w.run(80); return a && !plaqueClear(P); }),
          T('timing: open +11, closed +12', () => { const P=buildPlaque(8,2,{ trigger:'lever' }), w=P.world, sn=()=>snapIn(w,b=>b.y<=P.F); w.run(3); const c0=sn(); P.lever.on=true; const o=first(w,()=>plaqueClear(P)); w.run(20); P.lever.on=false; return o===11 && first(w,()=>sn()===c0)===12; }),
          T('sculk trigger at width 20, 3 bands', () => { const P=buildPlaque(20,3), w=P.world; w.run(3); w.vibrate(1,P.sensor.y+5,0); w.run(40); const a=plaqueClear(P); press(w,P.button); w.vibrate(P.button.x,P.button.y,0); w.run(80); return a && !plaqueClear(P); }) ] },

{ id:'pearl-launcher', name:'Ender pearl launcher', category:'Navigation',
  summary:'A nav button that is a machine. Pressing the button on a glass box opens its trapdoor floor, and the ender pearl drops onto a slime plate. Eight ticks later a pair of sticky pistons drives the plate into the pearl and flings it off screen.',
  inputs:['button (one per item)'], outputs:['pearl launched toward the viewer'], timing:'Pearl falls in about 6 ticks; launch at +9; trapdoor shuts at +10; pistons home by +20.',
  params:[{ key:'items', label:'Items', min:1, max:4, def:2 }],
  notes:['The pearl is a dropped item entity: Java item physics (gravity 0.04, drag 0.98 per game tick). A slime block moved by a piston into an entity sets its velocity in the push direction.','Two pistons cannot both push one slime plate. Whichever fires first drags the other along, so the second drives the plate through a honey spacer (honey and slime do not stick).','The plate-touching piston retracts one tick after the spacer piston, so the spacer is out of the way when the plate comes home.','Vertical wiring runs (button to trapdoor and delay lines, delay lines to pistons) are buried links.'],
  controls:[{ kind:'button', io:'button', label:'Press first button' },{ kind:'action', label:'Restock pearls', fn:(c) => c.items.forEach(c.restock) }],
  monitor:(c) => Object.fromEntries(c.items.map(it => [`pearl ${it.i+1}`, c.where(it)])),
  build:(p) => { const L=buildLauncherNav(p.items); const it=L.items[0]; L.io={ button:it.button, trapdoor:it.trapdoor, pistonL:it.pistons[0], pistonR:it.pistons[1] }; return L; },
  tests:[ T('drops, lands, and launches off screen', () => { const L=buildLauncherNav(1), w=L.world, it=L.items[0]; w.run(4); press(w,it.button); let landed=false, launched=-1; for (let t=1;t<30;t++){ w.tick(); if (L.where(it)==='on the launcher') landed=true; if (launched<0 && it.pearl.y>6) launched=t; } return landed && launched>0 && launched<14; }),
          T('resets to identical blocks and relaunches after restock', () => { const L=buildLauncherNav(2), w=L.world, it=L.items[0], sn=()=>snapIn(w,()=>true); w.run(4); const s0=sn(); press(w,it.button); w.run(40); const a = sn()===s0; L.restock(it); press(w,it.button); w.run(40); return a && sn()===s0 && L.where(it)==='launched'; }),
          T('neighboring pearls stay put', () => { const L=buildLauncherNav(3), w=L.world; w.run(4); press(w,L.items[1].button); w.run(40); return L.where(L.items[1])==='launched' && L.where(L.items[0])==='in the box' && L.where(L.items[2])==='in the box'; }),
          T('shared navigation has two sticky pistons and rails within the push limit', () => [1,2,3,4,5,6].every(n => { const L=buildSharedLauncherNav(n), ps=[...L.world.c.values()].filter(b=>b.t==='piston'); return L.items.length===n && ps.length===2 && ps.every(p=>p.s) && ps.some(p=>p.d==='U') && ps.some(p=>p.d==='S') && L.lower.length<=12 && L.upper.length<=12; })),
          T('every crate drops straight down and both pistons launch its pearl diagonally', () => {
            for (const n of [1,2,3,4,5,6]) for (let i=0;i<n;i++){
              const L=buildSharedLauncherNav(n), w=L.world, it=L.items[i]; w.run(4); if (!L.release(it)) return false;
              let dropped=false, landed=false, up=false, side=false;
              for (let t=0;t<20;t++){
                w.tick(); const p=it.pearl;
                if (L.where(it)==='dropping'){
                  if (p.x!==it.home[0] || p.y!==it.home[1] || p.vx!==0 || p.vy!==0 || p.z>=it.home[2]) return false;
                  dropped=true;
                }
                if (p.ground && p.z===1) landed=true;
                if (L.pistons[0].ext && !L.pistons[1].ext && p.vz>0 && p.vy===0) up=true;
                if (L.where(it)==='launched' && p.vy>.05 && p.vz>.05){ side=true; if (!L.ready() && L.restock(it)) return false; }
                if (L.items.some(other=>other!==it && (L.where(other)!=='in the box' || [other.pearl.x,other.pearl.y,other.pearl.z].some((v,k)=>v!==other.home[k])))) return false;
              }
              if (!dropped || !landed || !up || !side || !L.ready() || it.trapdoor.open) return false;
            }
            return true;
          }),
          T('shared navigation serializes releases and reuses every crate twice', () => {
            const L=buildSharedLauncherNav(6), w=L.world; w.run(4); const s0=snapIn(w,()=>true);
            for (let cycle=0;cycle<2;cycle++) for (const it of L.items){
              if (!L.release(it) || L.release(L.items[(it.i+1)%6])) return false;
              w.run(20); if (L.where(it)!=='launched' || snapIn(w,()=>true)!==s0 || !L.restock(it) || L.where(it)!=='in the box') return false;
              w.run(2); if (it.trapdoor.open || it.pearl.z!==it.home[2]) return false;
            }
            return true;
          }),
          T('every barrel hides its pistons, slime and redstone blocks inside a flush wall', () => [1,2,3,4,5,6].every(n => {
            const L=buildHiddenLauncherNav(n), w=L.world, ps=[...w.c.values()].filter(b=>b.t==='piston');
            if (ps.length!==2*n || !L.ready() || [...w.c.values()].some(b=>b.station)) return false;
            for (let x=0;x<L.cols;x++) for (let z=-5;z<=1;z++){ const b=w.get(x,0,z); if (!b || !['noteblock','jukebox','barrel'].includes(b.t) || w.get(x,1,z)) return false; }
            return L.items.every(it=>it.barrel.t==='barrel' && it.barrel.y===0 && !it.barrel.open && !it.pearl.visible && it.pistons.every(p=>p.s && p.y===-2) && it.pistons[0].d==='U' && it.pistons[1].d==='E'
              && [it.lower,it.upper].every(b=>b.t==='slime' && b.y===-2) && it.reds.every((r,k)=>r.t==='rblock' && r.y===-4 && r.x===it.pistons[k].x && r.z===it.pistons[k].z)
              && it.covers.length===4 && it.covers.every(c=>c.y===0 && c.t==='noteblock' && !w.get(c.x,-1,c.z)));
          })),
          T('a redstone block directly behind each launch piston is what fires it', () => {
            const adj=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+Math.abs(a.z-b.z)===1;
            const L=buildHiddenLauncherNav(3), w=L.world, it=L.items[1]; w.run(4); L.release(it);
            const fired=[false,false];
            for (let t=0;t<40;t++){
              const was=it.pistons.map(p=>p.ext); w.tick();
              for (const k of [0,1]){
                const p=it.pistons[k], r=it.reds[k], behind=r.x===p.x && r.z===p.z && r.y===p.y-1;
                if (!was[k] && p.ext){ if (!behind || p.y!==1) return false; fired[k]=true; }
                if (adj(r,p) && !behind) return false;
                if (!!p.ext !== behind && !(was[k] && !p.ext)) return false;
              }
            }
            return fired[0] && fired[1] && it.launched && L.ready(it);
          }),
          T('covers recede into the wall, move aside, and the pistons and slime come 3 blocks forward', () => {
            const L=buildHiddenLauncherNav(2), w=L.world, it=L.items[1]; w.run(4); L.release(it); w.run(3);
            if (it.phase!=='revealing' || it.covers.some(c=>c.y!==0)) return false;
            w.tick(); if (!it.covers.every(c=>c.y===-1) || [it.lower,it.upper].some(b=>b.y!==-2)) return false;
            w.tick(); w.tick(); const g=Object.fromEntries(it.coverGroups.map(g=>[g.name,g.blocks]));
            if (!g.side.every((c,k)=>c.y===-1 && c.x===[it.xc-1,it.xc-2][k] && c.z===-2) || !g.up.every((c,k)=>c.y===-1 && c.x===it.xc-2 && c.z===[-3,-4][k])) return false;
            for (const y of [-1,0,1]){ w.tick(); if (![...it.pistons,it.lower,it.upper].every(b=>b.y===y)) return false; if (it.pearl.visible || it.barrel.open) return false; }
            w.tick(); if (it.phase!=='dropping' || !it.barrel.open || !it.pearl.visible || it.pearl.y!==1.5) return false;
            const J=buildHiddenLauncherNav(1), j=J.items[0], jw=J.world;
            jw.put(j.xc-2,-1,-3,'wallb'); J.release(j); jw.run(20);
            return j.phase==='receding' && !j.pearl.visible && !j.barrel.open && [j.lower,j.upper].every(b=>b.y===-2) && !J.ready(j);
          }),
          T('each barrel drops its pearl straight down, then launches it up and to the east', () => {
            for (const n of [1,2,3,4,5,6]) for (let i=0;i<n;i++){
              const L=buildHiddenLauncherNav(n), w=L.world, it=L.items[i]; w.run(4); if (!L.release(it)) return false;
              let dropped=false, landed=false, up=false, east=false;
              for (let t=0;t<40;t++){
                w.tick(); const p=it.pearl;
                if (it.phase==='dropping' && p.z<it.mouth[2]){ if (p.x!==it.mouth[0] || p.y!==it.mouth[1] || p.vx!==0 || p.vy!==0) return false; dropped=true; }
                if (p.ground && p.z===it.zRest) landed=true;
                if (it.pistons[0].ext && !it.pistons[1].ext && p.vz>0 && p.vx===0) up=true;
                if (it.launched && p.vx>.05 && p.vz>.05 && p.y===1.5) east=true;
                if (L.items.some(o=>o!==it && (o.phase!=='closed' || o.pearl.visible || o.barrel.open || o.covers.some(c=>c.y!==0) || o.pistons.some(p=>p.ext || p.y!==-2)))) return false;
              }
              if (!dropped || !landed || !up || !east || !L.ready(it)) return false;
            }
            return true;
          }),
          T('a moving slime block only ever touches jukeboxes, the barrel or its own machine, so it drags nothing', () => {
            const D=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
            const L=buildHiddenLauncherNav(6), w=L.world; w.run(4); let moves=0;
            for (const it of L.items){
              if (!L.release(it)) return false;
              const carriage=[...it.pistons,it.lower,it.upper,...it.reds];
              for (let t=0;t<45;t++){
                // during the launch stroke only the slime's own piston may touch it; on the way in and out the whole machine moves together
                const launch=['launching','flying'].includes(it.phase);
                const before=[[it.lower,it.pistons[0]],[it.upper,it.pistons[1]]].map(([sl,pusher])=>({ sl, pusher, at:[sl.x,sl.y,sl.z], nb:D.map(([dx,dy,dz])=>w.get(sl.x+dx,sl.y+dy,sl.z+dz)).filter(b=>b && !b.buried) }));
                w.tick();
                for (const { sl, pusher, at, nb } of before){
                  if (sl.x===at[0] && sl.y===at[1] && sl.z===at[2]) continue; moves++;
                  for (const b of nb){
                    const own = b===pusher || (b.t==='head' && b.p===pusher) || (!launch && carriage.includes(b));
                    if (!own && b.t!=='jukebox' && b.t!=='barrel') return false;
                  }
                }
              }
              if (!it.launched || !L.ready(it) || !L.restock(it)) return false;
            }
            return moves===6*2*8;
          }),
          T('the note-block covers play a rising chord as a launcher opens and a falling one as it closes, in each barrel\'s own key', () => {
            const L=buildHiddenLauncherNav(6), w=L.world; w.run(4); const keys=new Set();
            for (const it of L.items){
              const from=L.notes.length; L.release(it); for (let t=0;t<45;t++) w.tick();
              const steps=L.notes.slice(from).filter(n=>n.k===undefined), ps=steps.map(n=>n.pitch);
              if (steps.length!==6 || steps.some(n=>n.i!==it.i) || ps.some(p=>p<0 || p>24)) return false;
              if (!(ps[0]<ps[1] && ps[1]<ps[2] && ps[3]>ps[4] && ps[4]>ps[5] && ps[0]===ps[5])) return false;
              if (L.notes.slice(from).length!==6*it.covers.length) return false;   // every cover sounds on every step
              keys.add(ps[0]); L.restock(it);
            }
            return keys.size===6;
          }),
          T('the two slime blocks never touch, so neither piston can drag the other slime', () => {
            const apart = it => Math.abs(it.lower.x-it.upper.x)+Math.abs(it.lower.y-it.upper.y)+Math.abs(it.lower.z-it.upper.z) > 1;
            const L=buildHiddenLauncherNav(6), w=L.world; w.run(4);
            for (const it of L.items){
              if (!L.release(it)) return false;
              for (let t=0;t<40;t++){ w.tick(); if (!L.items.every(apart)) return false; }
              if (!it.launched || !L.ready(it) || !L.restock(it)) return false;
            }
            return true;
          }),
          T('the launched pearl clears the wall and climbs 8 blocks to the east', () => {
            const L=buildHiddenLauncherNav(6), w=L.world, it=L.items[0]; L.release(it);
            for (let t=0;t<40 && !it.launched;t++) w.tick();
            const p=it.pearl, x0=p.x; let blocked=false;
            for (let t=0;t<4;t++){ w.tick(); if (p.vx===0 || p.y!==1.5) blocked=true; }
            return it.launched && !blocked && p.z>8 && p.x-x0>6;
          }),
          T('every barrel withdraws, closes flush, and can be reused twice', () => {
            const L=buildHiddenLauncherNav(6), w=L.world; w.run(4); const s0=snapIn(w,()=>true);
            for (let cycle=0;cycle<2;cycle++) for (const it of L.items){
              if (!L.release(it) || L.release(L.items[(it.i+1)%6]) || L.restock(it)) return false;
              for (let t=0;t<40;t++){ w.tick(); if (it.phase==='withdrawing' && (it.pistons.some(p=>p.ext) || it.barrel.open || L.ready(it) || L.restock(it))) return false; }
              if (!it.launched || !L.ready(it) || snapIn(w,()=>true)!==s0 || !L.restock(it) || it.pearl.visible || it.launched) return false;
              if ([it.pearl.x,it.pearl.y,it.pearl.z].some((v,k)=>v!==it.home[k])) return false;
            }
            return true;
          }),
          T('hidden launchers need real piston contact and preserve projectile gravity and drag', () => {
            const stopped=buildHiddenLauncherNav(6), sw=stopped.world, si=stopped.items[2];
            stopped.release(si); for (let t=0;t<12 && si.phase!=='dropping';t++) sw.tick(); si.pistons.forEach(b=>sw.set(b.x,b.y,b.z,null)); sw.run(30);
            if (si.pearl.x!==si.mouth[0] || si.pearl.y!==si.mouth[1] || si.pearl.z!==si.zRest || !si.pearl.ground || si.launched) return false;
            const L=buildHiddenLauncherNav(6), w=L.world, it=L.items[2]; L.release(it);
            for (let t=0;t<40 && !it.launched;t++) w.tick();
            const p=it.pearl; let x=p.x,z=p.z,vx=p.vx,vz=p.vz;
            if (!it.launched) return false;
            for (let gt=0;gt<2;gt++){ x+=vx; z+=vz; vx*=.99; vz=vz*.99-.03; }
            w.tick(); return Math.abs(p.x-x)<1e-9 && Math.abs(p.z-z)<1e-9 && Math.abs(p.vx-vx)<1e-9 && Math.abs(p.vz-vz)<1e-9 && p.y===it.mouth[1] && p.vy===0;
          }),
          T('nav motion needs real pistons and flight follows gravity and drag', () => {
            const stopped=buildSharedLauncherNav(6), sw=stopped.world, si=stopped.items[2];
            stopped.pistons.forEach(b=>sw.set(b.x,b.y,b.z,null)); stopped.release(si); sw.run(30);
            if (si.pearl.x!==si.home[0] || si.pearl.y!==si.home[1] || si.pearl.z!==1 || !si.pearl.ground || stopped.where(si)==='launched') return false;
            const L=buildSharedLauncherNav(6), w=L.world, it=L.items[2]; L.release(it);
            for (let t=0;t<20 && L.where(it)!=='launched';t++) w.tick();
            const p=it.pearl; let y=p.y,z=p.z,vy=p.vy,vz=p.vz;
            if (L.where(it)!=='launched') return false;
            for (let gt=0;gt<2;gt++){ z+=vz; y+=vy; vy*=.99; vz=vz*.99-.03; }
            w.tick(); return Math.abs(p.y-y)<1e-9 && Math.abs(p.z-z)<1e-9 && Math.abs(p.vy-vy)<1e-9 && Math.abs(p.vz-vz)<1e-9;
          }) ] },
];
const CATEGORIES = ['Toggles & logic','Clocks & pulses','Signals','Sensors','Reveals','Flying machines','Doors','Navigation'];
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
    for (let k=0;k<2;k++){ L.on = true; w.run(120); L.on = false; w.run(120); if (snapIn(w,()=>true)!==s0) fail(p, `blocks differ after cycle ${k+1}`); }
  }
  return true;
}
const testsOf = e => [...e.tests, T('builds at every parameter edge with valid box, io and controls', () => wellFormed(e)),
  ...(e.controls.some(c => c.kind==='lever' && c.io==='lever') ? [T('every block returns to its start after two lever cycles (every parameter edge)', () => leverCycle(e))] : [])];
function runTests(e){ return testsOf(e).map(t => { const t0=Date.now(); let pass=false, err=null; try { pass = !!t.fn(); } catch(x){ err = String(x && x.message || x); } return { name:t.name, pass, err, ms:Date.now()-t0 }; }); }
const api = { entries, CATEGORIES, defaults, testsOf, runTests };
if (N) module.exports = api; else window.Catalogue = api;
})();
