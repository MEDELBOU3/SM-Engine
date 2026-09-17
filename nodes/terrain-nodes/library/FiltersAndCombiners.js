// ============================================================================
// nodes/library/FiltersAndCombiners.js
// Blend, Slope Mask, Curvature, Warp, Quantize, Height Range, Paint Mask, Output
// ============================================================================
(function(global){
'use strict';
const NS=global.SMTerrainNodes,R=global.SMTerrainNodeRegistry;
if(!NS?.BaseTerrainNode||!R) throw new Error('[Terrain Nodes] Load core before FiltersAndCombiners.js');
const {BaseTerrainNode,FastSimplex2D,TerrainMath:M,ValueType:T}=NS;
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

class BlendNode extends BaseTerrainNode{
 constructor(params={}){super({type:'combine.blend',name:'Blend',category:'combine',params:{mode:'mix',factor:.5,clampMask:true,...params},paramSchema:{mode:{type:'select',options:['mix','add','subtract','multiply','max','min']},factor:{type:'number',min:0,max:1,step:.01},clampMask:{type:'boolean'}},inputs:{a:{type:T.HEIGHT,required:false},b:{type:T.HEIGHT,required:false},mask:{type:T.MASK,required:false}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,a=this.getHeightInput(i,'a',c,true),b=this.getHeightInput(i,'b',c,true),mask=i?.mask instanceof Float32Array&&i.mask.length===c.count?i.mask:null,o=new Float32Array(c.count);
  for(let k=0;k<c.count;k++){const m=mask?(p.clampMask?M.clamp01(mask[k]):mask[k]):p.factor;let q=b[k];if(p.mode==='add')q=a[k]+b[k];else if(p.mode==='subtract')q=a[k]-b[k];else if(p.mode==='multiply')q=a[k]*b[k];else if(p.mode==='max')q=Math.max(a[k],b[k]);else if(p.mode==='min')q=Math.min(a[k],b[k]);o[k]=M.lerp(a[k],q,m);}return {height:o};}
}

class SlopeMaskNode extends BaseTerrainNode{
 constructor(params={}){super({type:'mask.slope',name:'Slope Mask',category:'mask',params:{minDegrees:25,maxDegrees:55,invert:false,...params},paramSchema:{minDegrees:{type:'number',min:0,max:89,step:.5},maxDegrees:{type:'number',min:0,max:89,step:.5},invert:{type:'boolean'}},inputs:{height:{type:T.HEIGHT,required:true}},outputs:{mask:{type:T.MASK}}});}
 evaluate(c,i){const p=this.params,h=this.getHeightInput(i,'height',c,true),o=new Float32Array(c.count),sx=c.sizeX,sz=c.sizeZ;
  for(let z=0;z<sz;z++){const z0=Math.max(0,z-1),z1=Math.min(sz-1,z+1);for(let x=0;x<sx;x++){const x0=Math.max(0,x-1),x1=Math.min(sx-1,x+1),dx=(h[z*sx+x1]-h[z*sx+x0])/Math.max(1e-6,(x1-x0)*c.cellSizeX),dz=(h[z1*sx+x]-h[z0*sx+x])/Math.max(1e-6,(z1-z0)*c.cellSizeZ),deg=Math.atan(Math.sqrt(dx*dx+dz*dz))*180/Math.PI;let m=M.smoothstep(p.minDegrees,p.maxDegrees,deg);if(p.invert)m=1-m;o[z*sx+x]=m;}}
  return {mask:o};}
}

class CurvatureNode extends BaseTerrainNode{
 constructor(params={}){super({type:'mask.curvature',name:'Curvature Mask',category:'mask',params:{mode:'concave',scale:2,threshold:.05,softness:.2,invert:false,...params},paramSchema:{mode:{type:'select',options:['concave','convex','both']},scale:{type:'number',min:.01,max:20,step:.01},threshold:{type:'number',min:0,max:10,step:.01},softness:{type:'number',min:.001,max:5,step:.01},invert:{type:'boolean'}},inputs:{height:{type:T.HEIGHT,required:true}},outputs:{mask:{type:T.MASK}}});}
 evaluate(c,i){const p=this.params,h=this.getHeightInput(i,'height',c,true),o=new Float32Array(c.count),sx=c.sizeX,sz=c.sizeZ;for(let z=1;z<sz-1;z++)for(let x=1;x<sx-1;x++){const k=z*sx+x,lap=(h[k-1]+h[k+1]+h[k-sx]+h[k+sx]-h[k]*4)*p.scale;let v=p.mode==='convex'?-lap:p.mode==='both'?Math.abs(lap):lap,m=M.smoothstep(p.threshold,p.threshold+p.softness,v);if(p.invert)m=1-m;o[k]=m;}return {mask:o};}
}

class HeightRangeMaskNode extends BaseTerrainNode{
 constructor(params={}){super({type:'mask.heightRange',name:'Height Range Mask',category:'mask',params:{minHeight:0,maxHeight:50,falloff:4,invert:false,...params},paramSchema:{minHeight:{type:'number',min:-1000,max:1000,step:.5},maxHeight:{type:'number',min:-1000,max:1000,step:.5},falloff:{type:'number',min:.001,max:100,step:.1},invert:{type:'boolean'}},inputs:{height:{type:T.HEIGHT,required:true}},outputs:{mask:{type:T.MASK}}});}
 evaluate(c,i){const p=this.params,h=this.getHeightInput(i,'height',c,true),o=new Float32Array(c.count),f=Math.max(.0001,p.falloff);for(let k=0;k<c.count;k++){const low=M.smoothstep(p.minHeight-f,p.minHeight,h[k]),high=1-M.smoothstep(p.maxHeight,p.maxHeight+f,h[k]);let m=M.clamp01(low*high);if(p.invert)m=1-m;o[k]=m;}return {mask:o};}
}

class PaintMaskNode extends BaseTerrainNode{
 constructor(params={}){super({type:'mask.paint',name:'Paint Mask',category:'mask',params:{invert:false,...params},paramSchema:{invert:{type:'boolean'}},inputs:{},outputs:{mask:{type:T.MASK}}});}
 evaluate(c){const o=new Float32Array(c.count);for(let k=0;k<c.count;k++){const v=c.maskData?.length===c.count?c.maskData[k]:1;o[k]=this.params.invert?1-v:v;}return {mask:o};}
}

class WarpNode extends BaseTerrainNode{
 constructor(params={}){super({type:'filter.warp',name:'Domain Warp',category:'filter',params:{seed:1919,strength:20,frequency:.008,octaves:3,blend:1,...params},paramSchema:{seed:{type:'number',min:0,max:999999,step:1,randomize:true},strength:{type:'number',min:0,max:300,step:.25},frequency:{type:'number',min:.0001,max:.1,step:.0001},octaves:{type:'number',min:1,max:8,step:1},blend:{type:'number',min:0,max:1,step:.01}},inputs:{height:{type:T.HEIGHT,required:true}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,src=this.getHeightInput(i,'height',c,true),o=new Float32Array(c.count),n=new FastSimplex2D(num(p.seed)+c.seed),ix=1/Math.max(1e-6,c.cellSizeX),iz=1/Math.max(1e-6,c.cellSizeZ);for(let z=0;z<c.sizeZ;z++){const wz=c.worldZ(z);for(let x=0;x<c.sizeX;x++){const wx=c.worldX(x),k=z*c.sizeX+x,w=M.domainWarp(n,wx,wz,{frequency:p.frequency,strength:p.strength,octaves:p.octaves}),gx=(w.x+c.width*.5)*ix,gz=(w.y+c.length*.5)*iz,s=M.sampleBilinear(src,c.sizeX,c.sizeZ,gx,gz);o[k]=M.lerp(src[k],s,p.blend);}}return {height:o};}
}

class QuantizeNode extends BaseTerrainNode{
 constructor(params={}){super({type:'filter.quantize',name:'Terrace / Quantize',category:'filter',params:{stepHeight:4,smoothness:.18,strength:1,...params},paramSchema:{stepHeight:{type:'number',min:.05,max:100,step:.05},smoothness:{type:'number',min:0,max:1,step:.01},strength:{type:'number',min:0,max:1,step:.01}},inputs:{height:{type:T.HEIGHT,required:true}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,src=this.getHeightInput(i,'height',c,true),o=new Float32Array(c.count),step=Math.max(.0001,p.stepHeight);for(let k=0;k<c.count;k++){const level=src[k]/step,low=Math.floor(level),frac=level-low,edge=M.clamp01(p.smoothness)*.5,t=p.smoothness<=0?0:M.smoothstep(.5-edge,.5+edge,frac),q=(low+t)*step;o[k]=M.lerp(src[k],q,p.strength);}return {height:o};}
}

class TerrainOutputNode extends BaseTerrainNode{
 constructor(params={}){super({type:'output.terrain',name:'Terrain Output',category:'output',params:{gain:1,offset:0,...params},paramSchema:{gain:{type:'number',min:-10,max:10,step:.01},offset:{type:'number',min:-500,max:500,step:.1}},inputs:{height:{type:T.HEIGHT,required:true}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const src=this.getHeightInput(i,'height',c,true),o=new Float32Array(c.count);for(let k=0;k<c.count;k++)o[k]=src[k]*this.params.gain+this.params.offset;return {height:o};}
}

R.register('combine.blend',BlendNode,{label:'Blend',category:'combine',icon:'fa-code-branch',role:'Multi-input height blend',cost:'LOW',keywords:['mix','combine','mask']});
R.register('mask.slope',SlopeMaskNode,{label:'Slope Mask',category:'mask',icon:'fa-mountain',role:'Slope-angle selection',cost:'LOW',keywords:['slope','cliff','mask']});
R.register('mask.curvature',CurvatureNode,{label:'Curvature Mask',category:'mask',icon:'fa-wave-square',role:'Concave/convex selection',cost:'LOW',keywords:['curvature','cavity','ridge']});
R.register('mask.heightRange',HeightRangeMaskNode,{label:'Height Range',category:'mask',icon:'fa-arrows-up-down',role:'Altitude selection',cost:'LOW',keywords:['height','altitude']});
R.register('mask.paint',PaintMaskNode,{label:'Paint Mask',category:'mask',icon:'fa-paint-brush',role:'Hand-painted terrain mask',cost:'LOW',keywords:['paint','brush','mask']});
R.register('filter.warp',WarpNode,{label:'Domain Warp',category:'filter',icon:'fa-water',role:'Coordinate distortion',cost:'MED',keywords:['warp','distort']});
R.register('filter.quantize',QuantizeNode,{label:'Terrace / Quantize',category:'filter',icon:'fa-layer-group',role:'Stepped height',cost:'LOW',keywords:['terrace','steps']});
R.register('output.terrain',TerrainOutputNode,{label:'Terrain Output',category:'output',icon:'fa-bullseye',role:'Final terrain output',cost:'LOW',keywords:['output','final']});
Object.assign(NS,{BlendNode,SlopeMaskNode,CurvatureNode,HeightRangeMaskNode,PaintMaskNode,WarpNode,QuantizeNode,TerrainOutputNode});
})(window);
