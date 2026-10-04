(function(){
const RSx = typeof module!=='undefined' ? require('../engine.js') : window.RS;
const ground = (w, x0,x1,y0,y1,z=-1) => { for (let x=x0;x<=x1;x++) for (let y=y0;y<=y1;y++) if (!w.get(x,y,z)) w.put(x,y,z,'ground'); };
function theme(){ const w=new RSx.World(); const lever=w.put(0,0,0,'lever',{on:false,att:'D'}); for(let x=1;x<4;x++) w.put(x,0,0,'dust'); const lamp=w.put(4,0,0,'lamp'); ground(w,0,4,0,0); return { world:w, box:[0,4,0,0,-1,0], lever, lamp }; }
function projects(n){ const w=new RSx.World(); const items=[]; for(let i=0;i<n;i++){ const y=i*3+1; const lever=w.put(0,y,0,'lever',{on:i===0,att:'D'}); w.put(1,y,0,'dust'); w.put(2,y,0,'dust'); const lamp=w.put(3,y,0,'lamp'); items.push({lever,lamp,y}); } ground(w,0,3,0,3*n-1); return { world:w, box:[0,3,0,3*n-1,-1,0], items }; }
function skills(levels){ const w=new RSx.World(); const items=levels.map((lv,i)=>{ const y=i*3+2; const barrel=w.put(0,y,0,'barrel',{fill:lv}); const comp=w.put(1,y,0,'comparator',{d:'E'}); for(let x=2;x<17;x++) w.put(x,y,0,'dust'); return {barrel,comp,y}; }); ground(w,0,16,0,3*levels.length-1); return { world:w, box:[0,16,0,3*levels.length-1,-1,0], items }; }
function timeline(delays){ const w=new RSx.World(); w.put(0,0,0,'dust'); const lever=w.put(1,0,0,'lever',{on:false,att:'D'}); w.put(0,1,0,'dust');
  const latch = RSx.addLatch(w, 0, -4, -1); w.put(0,-1,0,'repeater',{d:'S',delay:1}); const stages=delays.map((d,i)=>{ const y=2+i*3; const rep=w.put(0,y,0,'repeater',{d:'S',delay:d}); w.put(0,y+1,0,'dust'); w.put(1,y+1,0,'dust'); const lamp=w.put(2,y+1,0,'lamp'); if (i<delays.length-1) w.put(0,y+2,0,'dust'); return {rep,lamp,y:y+1}; }); const y1=2+delays.length*3; ground(w,0,3,-6,y1); return { world:w, box:[0,3,-6,y1,-1,0], lever, stages, sensor:latch.sensor, button:latch.button }; }
function contact(W){ // links on the wall at z=1 behind cover blocks; sticky pistons in the floor pull covers down
  const w=new RSx.World();
  for (let x=0;x<W;x++) for (let z=-1;z<=2;z++) if (!(z===1 && x>0)) w.put(x,0,z,'wall');
  const covers=[];
  for (let x=1;x<W;x++){
    const p=w.put(x,1,-1,'piston',{d:'U',s:true,ext:true}); w.put(x,1,0,'head',{d:'U',s:true,p}); covers.push(w.put(x,1,1,'stone'));
    w.put(x,2,-1,'repeater',{d:'N',delay:1,on:true,inp:true}); w.put(x,3,-1,'dust');
  }
  w.put(0,1,-1,'ground'); w.put(0,2,-1,'ground'); w.put(0,3,-1,'ground');
  w.put(0,4,-1,'stone'); const plate=w.put(0,4,0,'plate',{on:false,att:'D'}); const torch=w.put(1,4,-1,'torch',{att:'W',lit:true});
  for (let x=2;x<W;x++) w.put(x,4,-1,'ground');
  ground(w,0,W-1,1,4,-2);
  return { world:w, box:[0,W-1,0,4,-2,2], plate, torch, covers, contentZ:1 };
}
function status(fill){ const w=new RSx.World(); const barrel=w.put(0,0,0,'barrel',{fill}); const comp=w.put(1,0,0,'comparator',{d:'E'}); for(let x=2;x<17;x++) w.put(x,0,0,'dust'); ground(w,0,16,0,0); return { world:w, box:[0,16,0,0,-1,0], comp }; }
const api={ status, theme, projects, skills, timeline, contact };
if (typeof module!=='undefined') module.exports=api; else window.Scenes=api;
})();
