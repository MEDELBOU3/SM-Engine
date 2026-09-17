// ============================================================================
// nodes/library/Generators.js
// Alpine, Dunes, FBM, Voronoi, Faults, Island
// ============================================================================
(function(global){
'use strict';
const NS=global.SMTerrainNodes, R=global.SMTerrainNodeRegistry;
if(!NS?.BaseTerrainNode||!R) throw new Error('[Terrain Nodes] Load core before Generators.js');
const {BaseTerrainNode,FastSimplex2D,TerrainMath:M,ValueType:T}=NS;
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

class FBMNode extends BaseTerrainNode{
 constructor(params={}){super({type:'generator.fbm',name:'Fractal FBM',category:'generator',params:{seed:1337,amplitude:18,frequency:0.008,octaves:6,lacunarity:2.05,gain:0.5,warpStrength:0,warpFrequency:0.01,mode:'add',strength:1,...params},
 paramSchema:{seed:{type:'number',min:0,max:999999,step:1,randomize:true},amplitude:{type:'number',min:0,max:300,step:.1},frequency:{type:'number',min:.0001,max:.2,step:.0001},octaves:{type:'number',min:1,max:12,step:1},lacunarity:{type:'number',min:1.1,max:4,step:.01},gain:{type:'number',min:.1,max:.95,step:.01},warpStrength:{type:'number',min:0,max:250,step:.25},warpFrequency:{type:'number',min:.0001,max:.1,step:.0001},mode:{type:'select',options:['add','replace','max','min']},strength:{type:'number',min:0,max:1,step:.01}},
 inputs:{base:{type:T.HEIGHT,required:false}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,b=this.getHeightInput(i,'base',c,true),o=new Float32Array(c.count),n=new FastSimplex2D(num(p.seed)+c.seed);
  for(let z=0;z<c.sizeZ;z++){const wz=c.worldZ(z);for(let x=0;x<c.sizeX;x++){const wx=c.worldX(x),k=z*c.sizeX+x;let sx=wx,sz=wz;if(p.warpStrength>0){const w=M.domainWarp(n,wx,wz,{frequency:p.warpFrequency,strength:p.warpStrength,octaves:3});sx=w.x;sz=w.y;}
   const g=M.fbm(n,sx,sz,{frequency:p.frequency,octaves:p.octaves,lacunarity:p.lacunarity,gain:p.gain})*p.amplitude;let target;
   if(p.mode==='replace')target=g;else if(p.mode==='max')target=Math.max(b[k],g);else if(p.mode==='min')target=Math.min(b[k],g);else target=b[k]+g;o[k]=M.lerp(b[k],target,p.strength);}}
  return {height:o};}
}

class AlpineNode extends BaseTerrainNode{
 constructor(params={}){super({type:'generator.alpine',name:'Alpine Mountains',category:'generator',params:{seed:4001,amplitude:85,frequency:.0045,octaves:7,lacunarity:2.15,gain:.52,ridgeSharpness:2.6,warpStrength:36,warpFrequency:.006,massifScale:.0015,valleyDepth:.18,strength:1,...params},
 paramSchema:{seed:{type:'number',min:0,max:999999,step:1,randomize:true},amplitude:{type:'number',min:0,max:500,step:.5},frequency:{type:'number',min:.0002,max:.05,step:.0001},octaves:{type:'number',min:2,max:12,step:1},lacunarity:{type:'number',min:1.2,max:3.5,step:.01},gain:{type:'number',min:.2,max:.85,step:.01},ridgeSharpness:{type:'number',min:.5,max:6,step:.05},warpStrength:{type:'number',min:0,max:300,step:.5},warpFrequency:{type:'number',min:.0002,max:.03,step:.0001},massifScale:{type:'number',min:.0001,max:.02,step:.0001},valleyDepth:{type:'number',min:0,max:1,step:.01},strength:{type:'number',min:0,max:1,step:.01}},
 inputs:{base:{type:T.HEIGHT,required:false}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,b=this.getHeightInput(i,'base',c,true),o=new Float32Array(c.count),n=new FastSimplex2D(num(p.seed)+c.seed);
  for(let z=0;z<c.sizeZ;z++){const wz=c.worldZ(z);for(let x=0;x<c.sizeX;x++){const wx=c.worldX(x),k=z*c.sizeX+x,w=M.domainWarp(n,wx,wz,{frequency:p.warpFrequency,strength:p.warpStrength,octaves:3});
   const rid=M.ridged(n,w.x,w.y,{frequency:p.frequency,octaves:p.octaves,lacunarity:p.lacunarity,gain:p.gain,sharpness:p.ridgeSharpness});
   const massif=M.smoothstep(-.35,.65,M.fbm(n,wx+211,wz-97,{frequency:p.massifScale,octaves:4,lacunarity:2,gain:.55}));
   const valley=Math.abs(M.fbm(n,wx-37,wz+83,{frequency:p.frequency*.55,octaves:4,lacunarity:2,gain:.5}));
   const g=rid*(.45+massif*.55)*p.amplitude-valley*p.amplitude*p.valleyDepth;o[k]=b[k]+g*p.strength;}}
  return {height:o};}
}

class DunesNode extends BaseTerrainNode{
 constructor(params={}){super({type:'generator.dunes',name:'Aeolian Dunes',category:'generator',params:{seed:987,height:14,wavelength:34,angle:28,sharpness:2.8,warpStrength:16,warpFrequency:.012,secondaryScale:.45,secondaryAngle:36,noiseAmount:.18,strength:1,...params},
 paramSchema:{seed:{type:'number',min:0,max:999999,step:1,randomize:true},height:{type:'number',min:0,max:100,step:.1},wavelength:{type:'number',min:2,max:300,step:.5},angle:{type:'number',min:-180,max:180,step:1},sharpness:{type:'number',min:.5,max:8,step:.05},warpStrength:{type:'number',min:0,max:120,step:.25},warpFrequency:{type:'number',min:.0005,max:.08,step:.0001},secondaryScale:{type:'number',min:0,max:1,step:.01},secondaryAngle:{type:'number',min:-90,max:90,step:1},noiseAmount:{type:'number',min:0,max:1,step:.01},strength:{type:'number',min:0,max:1,step:.01}},inputs:{base:{type:T.HEIGHT,required:false}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,b=this.getHeightInput(i,'base',c,true),o=new Float32Array(c.count),n=new FastSimplex2D(num(p.seed)+c.seed),a=p.angle*Math.PI/180,beta=(p.angle+p.secondaryAngle)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(beta),sb=Math.sin(beta),wave=2*Math.PI/Math.max(.001,p.wavelength);
  for(let z=0;z<c.sizeZ;z++){const wz=c.worldZ(z);for(let x=0;x<c.sizeX;x++){const wx=c.worldX(x),k=z*c.sizeX+x,w=M.domainWarp(n,wx,wz,{frequency:p.warpFrequency,strength:p.warpStrength,octaves:2}),u=w.x*ca+w.y*sa,v=w.x*cb+w.y*sb;
   const p1=Math.pow(M.clamp01(.5+.5*Math.sin(u*wave)),p.sharpness),p2=Math.pow(M.clamp01(.5+.5*Math.sin(v*wave*1.73+1.2)),p.sharpness*.75)*p.secondaryScale,micro=M.fbm(n,wx,wz,{frequency:p.warpFrequency*2.3,octaves:3,lacunarity:2,gain:.5})*p.noiseAmount;
   o[k]=b[k]+(p1+p2+micro)*p.height*p.strength;}}
  return {height:o};}
}

class VoronoiNode extends BaseTerrainNode{
 constructor(params={}){super({type:'generator.voronoi',name:'Voronoi Landforms',category:'generator',params:{seed:777,cellSize:38,amplitude:18,jitter:.9,edgeStrength:.65,cellVariation:.7,strength:1,...params},paramSchema:{seed:{type:'number',min:0,max:999999,step:1,randomize:true},cellSize:{type:'number',min:2,max:500,step:.5},amplitude:{type:'number',min:0,max:200,step:.1},jitter:{type:'number',min:0,max:1,step:.01},edgeStrength:{type:'number',min:-2,max:2,step:.01},cellVariation:{type:'number',min:0,max:2,step:.01},strength:{type:'number',min:0,max:1,step:.01}},inputs:{base:{type:T.HEIGHT,required:false}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,b=this.getHeightInput(i,'base',c,true),o=new Float32Array(c.count),seed=num(p.seed)+c.seed,cs=Math.max(.001,p.cellSize);
  for(let z=0;z<c.sizeZ;z++){const wz=c.worldZ(z);for(let x=0;x<c.sizeX;x++){const wx=c.worldX(x),k=z*c.sizeX+x,v=M.worley2D(wx/cs,wz/cs,seed,p.jitter),g=(v.value*p.cellVariation+(.5-v.edge)*p.edgeStrength)*p.amplitude;o[k]=b[k]+g*p.strength;}}
  return {height:o};}
}

class FaultsNode extends BaseTerrainNode{
 constructor(params={}){super({type:'generator.faults',name:'Tectonic Faults',category:'generator',params:{seed:31337,faults:28,displacement:5,falloff:18,decay:.93,strength:1,...params},paramSchema:{seed:{type:'number',min:0,max:999999,step:1,randomize:true},faults:{type:'number',min:1,max:128,step:1},displacement:{type:'number',min:0,max:80,step:.1},falloff:{type:'number',min:.01,max:200,step:.25},decay:{type:'number',min:.5,max:1,step:.005},strength:{type:'number',min:0,max:1,step:.01}},inputs:{base:{type:T.HEIGHT,required:false}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,b=this.getHeightInput(i,'base',c,true),o=new Float32Array(b),rnd=M.mulberry32(M.hash32(num(p.seed)+c.seed)),faults=[];let amp=p.displacement;
  for(let f=0;f<Math.floor(p.faults);f++){const a=rnd()*Math.PI*2;faults.push({nx:Math.cos(a),nz:Math.sin(a),offset:(rnd()-.5)*Math.max(c.width,c.length),amp});amp*=p.decay;}
  const fall=Math.max(.001,p.falloff);for(let z=0;z<c.sizeZ;z++){const wz=c.worldZ(z);for(let x=0;x<c.sizeX;x++){const wx=c.worldX(x),k=z*c.sizeX+x;let d=0;for(const f of faults)d+=Math.tanh((wx*f.nx+wz*f.nz-f.offset)/fall)*f.amp;o[k]=b[k]+d*p.strength;}}
  return {height:o};}
}

class IslandNode extends BaseTerrainNode{
 constructor(params={}){super({type:'generator.island',name:'Natural Island',category:'generator',params:{seed:2026,radiusX:180,radiusZ:150,height:55,coastFalloff:.18,coastNoise:.15,frequency:.006,octaves:6,mountainStrength:.6,seaLevel:0,strength:1,...params},paramSchema:{seed:{type:'number',min:0,max:999999,step:1,randomize:true},radiusX:{type:'number',min:5,max:2000,step:1},radiusZ:{type:'number',min:5,max:2000,step:1},height:{type:'number',min:0,max:500,step:.5},coastFalloff:{type:'number',min:.01,max:.8,step:.01},coastNoise:{type:'number',min:0,max:.6,step:.01},frequency:{type:'number',min:.0002,max:.05,step:.0001},octaves:{type:'number',min:1,max:12,step:1},mountainStrength:{type:'number',min:0,max:2,step:.01},seaLevel:{type:'number',min:-100,max:100,step:.1},strength:{type:'number',min:0,max:1,step:.01}},inputs:{base:{type:T.HEIGHT,required:false}},outputs:{height:{type:T.HEIGHT},landMask:{type:T.MASK}}});}
 evaluate(c,i){const p=this.params,b=this.getHeightInput(i,'base',c,true),h=new Float32Array(c.count),mask=new Float32Array(c.count),n=new FastSimplex2D(num(p.seed)+c.seed),rx=Math.max(.001,p.radiusX),rz=Math.max(.001,p.radiusZ);
  for(let z=0;z<c.sizeZ;z++){const wz=c.worldZ(z);for(let x=0;x<c.sizeX;x++){const wx=c.worldX(x),k=z*c.sizeX+x,nx=wx/rx,nz=wz/rz,coast=M.fbm(n,wx,wz,{frequency:p.frequency*.7,octaves:5,lacunarity:2.1,gain:.52})*p.coastNoise,rad=Math.sqrt(nx*nx+nz*nz)+coast,land=1-M.smoothstep(1-p.coastFalloff,1+p.coastFalloff,rad),macro=M.fbm(n,wx+31,wz-19,{frequency:p.frequency,octaves:p.octaves,lacunarity:2.05,gain:.5}),rid=M.ridged(n,wx-67,wz+53,{frequency:p.frequency*1.25,octaves:Math.max(2,p.octaves-1),lacunarity:2.1,gain:.5,sharpness:2.4}),interior=M.clamp01(1-rad),g=p.seaLevel+land*p.height*(.28+macro*.22+rid*p.mountainStrength*interior);h[k]=M.lerp(b[k],g,p.strength);mask[k]=M.clamp01(land);}}
  return {height:h,landMask:mask};}
}

R.register('generator.fbm',FBMNode,{label:'Fractal FBM',category:'generator',icon:'fa-wave-square',role:'Multi-octave noise',cost:'LOW',keywords:['noise','simplex','fractal']});
R.register('generator.alpine',AlpineNode,{label:'Alpine Mountains',category:'generator',icon:'fa-mountain',role:'Ridged massif generator',cost:'MED',keywords:['mountain','ridge','realistic']});
R.register('generator.dunes',DunesNode,{label:'Aeolian Dunes',category:'generator',icon:'fa-wind',role:'Wind-shaped dune field',cost:'LOW',keywords:['desert','sand','dune']});
R.register('generator.voronoi',VoronoiNode,{label:'Voronoi Landforms',category:'generator',icon:'fa-braille',role:'Cellular landforms',cost:'MED',keywords:['worley','cells']});
R.register('generator.faults',FaultsNode,{label:'Tectonic Faults',category:'generator',icon:'fa-bolt',role:'Fault displacement',cost:'MED',keywords:['fault','tectonic','cliff']});
R.register('generator.island',IslandNode,{label:'Natural Island',category:'generator',icon:'fa-water',role:'Coast + mountain island',cost:'MED',keywords:['island','coast','shore']});
Object.assign(NS,{FBMNode,AlpineNode,DunesNode,VoronoiNode,FaultsNode,IslandNode});
})(window);
