// ============================================================================
// nodes/library/ErosionGeology.js
// Hydraulic erosion, Thermal Talus, Glacial shaping, Rock Strata
// ============================================================================
(function(global){
'use strict';
const NS=global.SMTerrainNodes,R=global.SMTerrainNodeRegistry;
if(!NS?.BaseTerrainNode||!R) throw new Error('[Terrain Nodes] Load core before ErosionGeology.js');
const {BaseTerrainNode,FastSimplex2D,TerrainMath:M,ValueType:T}=NS;
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

class HydraulicErosionNode extends BaseTerrainNode{
 constructor(params={}){super({type:'geology.hydraulic',name:'Hydraulic Erosion',category:'geology',params:{seed:4242,iterations:12000,maxLifetime:48,inertia:.08,sedimentCapacity:4,minSedimentCapacity:.01,depositSpeed:.28,erodeSpeed:.32,evaporateSpeed:.025,gravity:5,initialWater:1,initialSpeed:1,brushRadius:2,strength:1,...params},
 paramSchema:{seed:{type:'number',min:0,max:999999,step:1,randomize:true},iterations:{type:'number',min:100,max:200000,step:100},maxLifetime:{type:'number',min:8,max:128,step:1},inertia:{type:'number',min:0,max:1,step:.01},sedimentCapacity:{type:'number',min:.1,max:20,step:.05},minSedimentCapacity:{type:'number',min:0,max:1,step:.005},depositSpeed:{type:'number',min:0,max:1,step:.01},erodeSpeed:{type:'number',min:0,max:1,step:.01},evaporateSpeed:{type:'number',min:0,max:.2,step:.001},gravity:{type:'number',min:.1,max:20,step:.1},initialWater:{type:'number',min:.1,max:5,step:.05},initialSpeed:{type:'number',min:.1,max:5,step:.05},brushRadius:{type:'number',min:1,max:8,step:1},strength:{type:'number',min:0,max:1,step:.01}},
 inputs:{height:{type:T.HEIGHT,required:true}},outputs:{height:{type:T.HEIGHT}}});}
 _brush(radius){const off=[],w=[];for(let z=-radius;z<=radius;z++)for(let x=-radius;x<=radius;x++){const d=Math.sqrt(x*x+z*z);if(d<=radius){off.push([x,z]);w.push(Math.max(0,1-d/Math.max(1,radius)));}}let s=w.reduce((a,b)=>a+b,0)||1;for(let i=0;i<w.length;i++)w[i]/=s;return {off,w};}
 evaluate(c,i){const p=this.params,src=this.getHeightInput(i,'height',c,true),h=new Float32Array(src),sx=c.sizeX,sz=c.sizeZ;if(sx<4||sz<4)return {height:h};
  const rnd=M.mulberry32(M.hash32(num(p.seed)+c.seed)),brush=this._brush(Math.max(1,Math.floor(p.brushRadius))),iterations=Math.max(1,Math.floor(p.iterations));
  for(let d=0;d<iterations;d++){let x=1+rnd()*Math.max(1,sx-3),z=1+rnd()*Math.max(1,sz-3),dx=0,dz=0,speed=p.initialSpeed,water=p.initialWater,sed=0;
   for(let life=0;life<p.maxLifetime;life++){const a=M.sampleHeightAndGradient(h,sx,sz,x,z);dx=dx*p.inertia-a.gradientX*(1-p.inertia);dz=dz*p.inertia-a.gradientZ*(1-p.inertia);let len=Math.sqrt(dx*dx+dz*dz);if(len<1e-6){const ang=rnd()*Math.PI*2;dx=Math.cos(ang);dz=Math.sin(ang);}else{dx/=len;dz/=len;}
    const nx=x+dx,nz=z+dz;if(nx<1||nx>=sx-2||nz<1||nz>=sz-2)break;const b=M.sampleHeightAndGradient(h,sx,sz,nx,nz),dh=b.height-a.height,cap=Math.max(-dh*speed*water*p.sedimentCapacity,p.minSedimentCapacity),cx=Math.floor(x),cz=Math.floor(z);
    if(sed>cap||dh>0){const amount=dh>0?Math.min(sed,dh):(sed-cap)*p.depositSpeed;sed-=amount;const tx=x-cx,tz=z-cz,i00=cz*sx+cx,i10=i00+1,i01=i00+sx,i11=i01+1;h[i00]+=amount*(1-tx)*(1-tz);h[i10]+=amount*tx*(1-tz);h[i01]+=amount*(1-tx)*tz;h[i11]+=amount*tx*tz;}
    else{const amount=Math.min((cap-sed)*p.erodeSpeed,-dh);let eroded=0;for(let q=0;q<brush.off.length;q++){const ex=cx+brush.off[q][0],ez=cz+brush.off[q][1];if(ex<0||ex>=sx||ez<0||ez>=sz)continue;const idx=ez*sx+ex,take=Math.max(0,amount*brush.w[q]);h[idx]-=take;eroded+=take;}sed+=eroded;}
    speed=Math.sqrt(Math.max(0,speed*speed-dh*p.gravity));water*=Math.max(0,1-p.evaporateSpeed);x=nx;z=nz;if(water<.01)break;}
  }
  const out=new Float32Array(c.count);for(let k=0;k<c.count;k++)out[k]=M.lerp(src[k],h[k],p.strength);return {height:out};}
}

class ThermalTalusNode extends BaseTerrainNode{
 constructor(params={}){super({type:'geology.thermal',name:'Thermal Talus',category:'geology',params:{iterations:8,talusAngle:33,rate:.28,strength:1,...params},paramSchema:{iterations:{type:'number',min:1,max:80,step:1},talusAngle:{type:'number',min:5,max:70,step:.5},rate:{type:'number',min:0,max:1,step:.01},strength:{type:'number',min:0,max:1,step:.01}},inputs:{height:{type:T.HEIGHT,required:true}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,src=this.getHeightInput(i,'height',c,true);let h=new Float32Array(src);const delta=new Float32Array(c.count),cell=Math.max(1e-4,Math.min(c.cellSizeX,c.cellSizeZ)),talus=Math.tan(p.talusAngle*Math.PI/180)*cell,N=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  for(let it=0;it<Math.floor(p.iterations);it++){delta.fill(0);for(let z=1;z<c.sizeZ-1;z++)for(let x=1;x<c.sizeX-1;x++){const k=z*c.sizeX+x,hh=h[k];let bi=-1,drop=0;for(const [ox,oz] of N){const ni=(z+oz)*c.sizeX+x+ox,d=hh-h[ni];if(d>drop){drop=d;bi=ni;}}if(bi>=0&&drop>talus){const move=(drop-talus)*.5*p.rate;delta[k]-=move;delta[bi]+=move;}}
   for(let k=0;k<h.length;k++)h[k]+=delta[k];}
  const out=new Float32Array(c.count);for(let k=0;k<c.count;k++)out[k]=M.lerp(src[k],h[k],p.strength);return {height:out};}
}

class GlacialErosionNode extends BaseTerrainNode{
 constructor(params={}){super({type:'geology.glacial',name:'Glacial Erosion',category:'geology',params:{iterations:6,incision:2.5,widening:.62,valleyThreshold:.25,smoothing:.45,strength:1,...params},paramSchema:{iterations:{type:'number',min:1,max:30,step:1},incision:{type:'number',min:0,max:20,step:.1},widening:{type:'number',min:0,max:1,step:.01},valleyThreshold:{type:'number',min:0,max:1,step:.01},smoothing:{type:'number',min:0,max:1,step:.01},strength:{type:'number',min:0,max:1,step:.01}},inputs:{height:{type:T.HEIGHT,required:true}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,src=this.getHeightInput(i,'height',c,true);let h=new Float32Array(src);
  for(let it=0;it<Math.floor(p.iterations);it++){const smooth=M.blur3x3(h,c.sizeX,c.sizeZ,p.smoothing),valley=new Float32Array(c.count);let vmax=1e-6;for(let z=1;z<c.sizeZ-1;z++)for(let x=1;x<c.sizeX-1;x++){const k=z*c.sizeX+x,avg=(h[k-1]+h[k+1]+h[k-c.sizeX]+h[k+c.sizeX])*.25,v=Math.max(0,avg-h[k]);valley[k]=v;if(v>vmax)vmax=v;}
   const next=new Float32Array(h);for(let z=1;z<c.sizeZ-1;z++)for(let x=1;x<c.sizeX-1;x++){const k=z*c.sizeX+x,g=M.smoothstep(p.valleyThreshold,1,valley[k]/vmax),wide=M.lerp(h[k],smooth[k],g*p.widening);next[k]=wide-g*p.incision;}h=next;}
  const out=new Float32Array(c.count);for(let k=0;k<c.count;k++)out[k]=M.lerp(src[k],h[k],p.strength);return {height:out};}
}

class StrataNode extends BaseTerrainNode{
 constructor(params={}){super({type:'geology.strata',name:'Rock Strata',category:'geology',params:{seed:812,layerThickness:5,strength:.65,dip:12,strike:35,warp:1.5,warpFrequency:.008,sharpness:.75,...params},paramSchema:{seed:{type:'number',min:0,max:999999,step:1,randomize:true},layerThickness:{type:'number',min:.1,max:100,step:.1},strength:{type:'number',min:0,max:1,step:.01},dip:{type:'number',min:-80,max:80,step:.5},strike:{type:'number',min:-180,max:180,step:1},warp:{type:'number',min:0,max:20,step:.1},warpFrequency:{type:'number',min:.0001,max:.1,step:.0001},sharpness:{type:'number',min:0,max:1,step:.01}},inputs:{height:{type:T.HEIGHT,required:true}},outputs:{height:{type:T.HEIGHT}}});}
 evaluate(c,i){const p=this.params,src=this.getHeightInput(i,'height',c,true),out=new Float32Array(c.count),n=new FastSimplex2D(num(p.seed)+c.seed),strike=p.strike*Math.PI/180,dip=Math.tan(p.dip*Math.PI/180),sx=Math.cos(strike),sz=Math.sin(strike),th=Math.max(.001,p.layerThickness);
  for(let z=0;z<c.sizeZ;z++){const wz=c.worldZ(z);for(let x=0;x<c.sizeX;x++){const wx=c.worldX(x),k=z*c.sizeX+x,fold=n.noise2D(wx*p.warpFrequency,wz*p.warpFrequency)*p.warp,plane=src[k]+(wx*sx+wz*sz)*dip+fold,level=plane/th,low=Math.floor(level),frac=level-low,edge=M.clamp01(p.sharpness)*.49,t=p.sharpness<=0?frac:M.smoothstep(.5-edge,.5+edge,frac),layered=(low+t)*th-(wx*sx+wz*sz)*dip;out[k]=M.lerp(src[k],layered,p.strength);}}
  return {height:out};}
}

R.register('geology.hydraulic',HydraulicErosionNode,{label:'Hydraulic Erosion',category:'geology',icon:'fa-droplet',role:'Droplet erosion simulation',cost:'HIGH',keywords:['water','river','erosion','sediment']});
R.register('geology.thermal',ThermalTalusNode,{label:'Thermal Talus',category:'geology',icon:'fa-mountain',role:'Talus / slope relaxation',cost:'HIGH',keywords:['thermal','talus','rockfall']});
R.register('geology.glacial',GlacialErosionNode,{label:'Glacial Erosion',category:'geology',icon:'fa-snowflake',role:'U-shaped valley carving',cost:'HIGH',keywords:['glacier','valley','ice']});
R.register('geology.strata',StrataNode,{label:'Rock Strata',category:'geology',icon:'fa-layer-group',role:'Sedimentary layering',cost:'MED',keywords:['strata','rock','layers']});
Object.assign(NS,{HydraulicErosionNode,ThermalTalusNode,GlacialErosionNode,StrataNode});
})(window);
