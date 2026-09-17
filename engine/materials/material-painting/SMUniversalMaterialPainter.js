// engine/materials/material-painting/SMUniversalMaterialPainter.js
// SM Engine - Universal Material Painter v4
// Non-destructive target selection + explicit brush lifecycle + fail-safe material conversion.
(function(global){
"use strict";
if(global.SMUniversalMaterialPainter)return;
const THREE=global.THREE;
if(!THREE){console.error("[SMUniversalMaterialPainter] THREE unavailable.");return;}
const MAX_LAYERS=4;
const CHANNELS=["R","G","B","A"];
const state={
active:false,
target:null,
activeLayer:0,
layerAssetIds:[null,null,null,null],
brushRadius:1.5,
strength:.5,
flow:.55,
falloff:.55,
operation:"paint",
resolution:1024,
tiling:[1,1,1,1],
painting:false,
pointerId:null,
raycaster:new THREE.Raycaster(),
pointer:new THREE.Vector2(),
preview:null,
eventsBound:false,
eventCanvas:null,
lastStopReason:"startup"
};
const neutral={white:null,normal:null,orm:null};
function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function smoothstep01(v){const t=clamp01(v);return t*t*(3-2*t);}
function activeCamera(){return global.SMViewportSystem?.getActivePanel?.()?.camera||global.camera||null;}
function selectedObject(){return global.selectedObject||global.selectionManager?.selectedObject||global.SelectionManager?.selectedObject||global.editor?.selected||global.transformControls?.object||null;}
function createSolidTexture(r,g,b,a=255,name="SM_Solid"){
const data=new Uint8Array([r,g,b,a]);
const texture=new THREE.DataTexture(data,1,1,THREE.RGBAFormat,THREE.UnsignedByteType);
texture.name=name;
texture.needsUpdate=true;
texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
texture.minFilter=THREE.NearestFilter;
texture.magFilter=THREE.NearestFilter;
if("colorSpace"in texture&&THREE.NoColorSpace!==undefined)texture.colorSpace=THREE.NoColorSpace;
return texture;
}
function ensureNeutralTextures(){
neutral.white||=createSolidTexture(255,255,255,255,"SM_White");
neutral.normal||=createSolidTexture(128,128,255,255,"SM_NeutralNormal");
neutral.orm||=createSolidTexture(255,255,0,255,"SM_NeutralORM");
}
function meshList(root){
if(!root)return[];
if(root.isMesh)return[root];
const result=[];
root.traverse?.(object=>{if(object.isMesh&&!object.userData?.isSystemObject)result.push(object);});
return result;
}
function isTerrainObject(object){
let current=object;
while(current){
if(current.userData?.terrainData||current.userData?.isTerrain||/terrain|landscape/i.test(current.name||""))return true;
current=current.parent;
}
return false;
}
function hasMaterialLayer(){return state.layerAssetIds.some(Boolean);}
function createWeightTexture(resolution){
const size=Math.max(128,Math.min(2048,Math.floor(Number(resolution)||1024)));
const data=new Uint8Array(size*size*4);
for(let i=0;i<data.length;i+=4)data[i]=255;
const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
texture.name="SM_MaterialBlendWeights";
texture.flipY=false;
texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
texture.minFilter=THREE.LinearFilter;
texture.magFilter=THREE.LinearFilter;
texture.generateMipmaps=false;
texture.unpackAlignment=1;
if("colorSpace"in texture&&THREE.NoColorSpace!==undefined)texture.colorSpace=THREE.NoColorSpace;
texture.needsUpdate=true;
return{size,data,texture};
}
function ensureVertexWeights(mesh){
const geometry=mesh.geometry;
const count=geometry?.attributes?.position?.count||0;
if(!count)return null;
let attribute=geometry.getAttribute("smPaintWeights");
if(!attribute||attribute.count!==count||attribute.itemSize!==4){
const values=new Float32Array(count*4);
for(let i=0;i<count;i++)values[i*4]=1;
attribute=new THREE.BufferAttribute(values,4);
geometry.setAttribute("smPaintWeights",attribute);
}
return attribute;
}
function ensurePaintData(mesh){
if(!mesh?.isMesh)return null;
mesh.userData||={};
let data=mesh.userData.smUniversalMaterialPaint;
const hasRealUV=!!mesh.geometry?.attributes?.uv&&!mesh.userData?.smMaterialPaintDummyUV;
const backend=hasRealUV?"uv":"vertex";
if(!data||data.backend!==backend){
data={
version:4,
backend,
resolution:state.resolution,
weight:backend==="uv"?createWeightTexture(state.resolution):null,
vertexWeights:backend==="vertex"?ensureVertexWeights(mesh):null,
layers:[null,null,null,null],
layerDefinitions:[null,null,null,null],
shader:null,
material:null,
originalMaterial:mesh.material,
originalVisible:mesh.visible,
strokeVersion:0,
compileVersion:0
};
mesh.userData.smUniversalMaterialPaint=data;
}
return data;
}
function decodeAssetPayload(event){
try{return JSON.parse(event.dataTransfer?.getData("application/json")||"null");}
catch(_){return null;}
}
async function runtimeLayer(assetId){
ensureNeutralTextures();
const bridge=global.SMMaterialAssetBridge;
const asset=bridge?.getAsset?.(assetId);
if(!asset)throw new Error(`Material asset '${assetId}' was not found in AssetsPanel.`);
const def=asset.definition||{};
const color=def.map?await bridge?.loadTextureAsset?.(def.map,{color:true}):neutral.white;
const normal=def.normalMap?await bridge?.loadTextureAsset?.(def.normalMap,{color:false}):neutral.normal;
const orm=await bridge?.buildORMTexture?.(def,512)||neutral.orm;
return{
assetId,
asset,
definition:def,
color:color||neutral.white,
normal:normal||neutral.normal,
orm:orm||neutral.orm,
tiling:Math.max(.01,Number(def.tiling)||1),
normalFlipY:String(def.normalConvention||"gl").toLowerCase()==="dx"?-1:1
};
}
function shaderUniforms(){
const uniforms={
uSMWeightMap:{value:neutral.white},
uSMUseVertexWeights:{value:0},
uSMTiling:{value:new THREE.Vector4(1,1,1,1)},
uSMNormalFlipY:{value:new THREE.Vector4(1,1,1,1)}
};
for(let i=0;i<MAX_LAYERS;i++){
uniforms[`uSMColor${i}`]={value:neutral.white};
uniforms[`uSMNormal${i}`]={value:neutral.normal};
uniforms[`uSMORM${i}`]={value:neutral.orm};
}
return uniforms;
}
function shaderDefinitions(){
return`uniform sampler2D uSMWeightMap;
uniform float uSMUseVertexWeights;
uniform vec4 uSMTiling;
uniform vec4 uSMNormalFlipY;
uniform sampler2D uSMColor0;
uniform sampler2D uSMColor1;
uniform sampler2D uSMColor2;
uniform sampler2D uSMColor3;
uniform sampler2D uSMNormal0;
uniform sampler2D uSMNormal1;
uniform sampler2D uSMNormal2;
uniform sampler2D uSMNormal3;
uniform sampler2D uSMORM0;
uniform sampler2D uSMORM1;
uniform sampler2D uSMORM2;
uniform sampler2D uSMORM3;
varying vec2 vSMUv;
varying vec4 vSMVertexWeights;
varying vec3 vSMWorldPos;
varying vec3 vSMWorldNormal;
vec4 smWeights(){
vec4 w=mix(texture2D(uSMWeightMap,clamp(vSMUv,vec2(0.0),vec2(1.0))),vSMVertexWeights,uSMUseVertexWeights);
float total=dot(w,vec4(1.0));
return total>0.0001?w/total:vec4(1.0,0.0,0.0,0.0);
}
vec3 smTriWeights(){
vec3 w=pow(abs(normalize(vSMWorldNormal)),vec3(4.0));
return w/max(w.x+w.y+w.z,0.0001);
}
vec3 smColor0(float tile){
if(uSMUseVertexWeights<0.5)return texture2D(uSMColor0,vSMUv*tile).rgb;
vec3 w=smTriWeights();float s=max(0.001,tile*0.18);
return texture2D(uSMColor0,vSMWorldPos.zy*s).rgb*w.x+texture2D(uSMColor0,vSMWorldPos.xz*s).rgb*w.y+texture2D(uSMColor0,vSMWorldPos.xy*s).rgb*w.z;
}
vec3 smColor1(float tile){
if(uSMUseVertexWeights<0.5)return texture2D(uSMColor1,vSMUv*tile).rgb;
vec3 w=smTriWeights();float s=max(0.001,tile*0.18);
return texture2D(uSMColor1,vSMWorldPos.zy*s).rgb*w.x+texture2D(uSMColor1,vSMWorldPos.xz*s).rgb*w.y+texture2D(uSMColor1,vSMWorldPos.xy*s).rgb*w.z;
}
vec3 smColor2(float tile){
if(uSMUseVertexWeights<0.5)return texture2D(uSMColor2,vSMUv*tile).rgb;
vec3 w=smTriWeights();float s=max(0.001,tile*0.18);
return texture2D(uSMColor2,vSMWorldPos.zy*s).rgb*w.x+texture2D(uSMColor2,vSMWorldPos.xz*s).rgb*w.y+texture2D(uSMColor2,vSMWorldPos.xy*s).rgb*w.z;
}
vec3 smColor3(float tile){
if(uSMUseVertexWeights<0.5)return texture2D(uSMColor3,vSMUv*tile).rgb;
vec3 w=smTriWeights();float s=max(0.001,tile*0.18);
return texture2D(uSMColor3,vSMWorldPos.zy*s).rgb*w.x+texture2D(uSMColor3,vSMWorldPos.xz*s).rgb*w.y+texture2D(uSMColor3,vSMWorldPos.xy*s).rgb*w.z;
}
vec3 smORM0(float tile){
if(uSMUseVertexWeights<0.5)return texture2D(uSMORM0,vSMUv*tile).rgb;
vec3 w=smTriWeights();float s=max(0.001,tile*0.18);
return texture2D(uSMORM0,vSMWorldPos.zy*s).rgb*w.x+texture2D(uSMORM0,vSMWorldPos.xz*s).rgb*w.y+texture2D(uSMORM0,vSMWorldPos.xy*s).rgb*w.z;
}
vec3 smORM1(float tile){
if(uSMUseVertexWeights<0.5)return texture2D(uSMORM1,vSMUv*tile).rgb;
vec3 w=smTriWeights();float s=max(0.001,tile*0.18);
return texture2D(uSMORM1,vSMWorldPos.zy*s).rgb*w.x+texture2D(uSMORM1,vSMWorldPos.xz*s).rgb*w.y+texture2D(uSMORM1,vSMWorldPos.xy*s).rgb*w.z;
}
vec3 smORM2(float tile){
if(uSMUseVertexWeights<0.5)return texture2D(uSMORM2,vSMUv*tile).rgb;
vec3 w=smTriWeights();float s=max(0.001,tile*0.18);
return texture2D(uSMORM2,vSMWorldPos.zy*s).rgb*w.x+texture2D(uSMORM2,vSMWorldPos.xz*s).rgb*w.y+texture2D(uSMORM2,vSMWorldPos.xy*s).rgb*w.z;
}
vec3 smORM3(float tile){
if(uSMUseVertexWeights<0.5)return texture2D(uSMORM3,vSMUv*tile).rgb;
vec3 w=smTriWeights();float s=max(0.001,tile*0.18);
return texture2D(uSMORM3,vSMWorldPos.zy*s).rgb*w.x+texture2D(uSMORM3,vSMWorldPos.xz*s).rgb*w.y+texture2D(uSMORM3,vSMWorldPos.xy*s).rgb*w.z;
}
vec3 smColorBlend(vec4 w){return smColor0(uSMTiling.x)*w.x+smColor1(uSMTiling.y)*w.y+smColor2(uSMTiling.z)*w.z+smColor3(uSMTiling.w)*w.w;}
vec3 smORMBlend(vec4 w){return smORM0(uSMTiling.x)*w.x+smORM1(uSMTiling.y)*w.y+smORM2(uSMTiling.z)*w.z+smORM3(uSMTiling.w)*w.w;}
vec3 smNormalBlend(vec4 w){
if(uSMUseVertexWeights>0.5)return vec3(0.0,0.0,1.0);
vec3 n0=texture2D(uSMNormal0,vSMUv*uSMTiling.x).xyz*2.0-1.0;n0.y*=uSMNormalFlipY.x;
vec3 n1=texture2D(uSMNormal1,vSMUv*uSMTiling.y).xyz*2.0-1.0;n1.y*=uSMNormalFlipY.y;
vec3 n2=texture2D(uSMNormal2,vSMUv*uSMTiling.z).xyz*2.0-1.0;n2.y*=uSMNormalFlipY.z;
vec3 n3=texture2D(uSMNormal3,vSMUv*uSMTiling.w).xyz*2.0-1.0;n3.y*=uSMNormalFlipY.w;
return normalize(n0*w.x+n1*w.y+n2*w.z+n3*w.w);
}`;
}
function syncUniforms(mesh){
const data=mesh?.userData?.smUniversalMaterialPaint;
const shader=data?.shader;
if(!shader?.uniforms)return false;
const layers=data.layers||[];
if(data.backend==="uv"&&data.weight?.texture)shader.uniforms.uSMWeightMap.value=data.weight.texture;
shader.uniforms.uSMUseVertexWeights.value=data.backend==="vertex"?1:0;
const tiling=[1,1,1,1];
const flips=[1,1,1,1];
for(let i=0;i<MAX_LAYERS;i++){
const layer=layers[i];
shader.uniforms[`uSMColor${i}`].value=layer?.color||neutral.white;
shader.uniforms[`uSMNormal${i}`].value=layer?.normal||neutral.normal;
shader.uniforms[`uSMORM${i}`].value=layer?.orm||neutral.orm;
tiling[i]=layer?.tiling||state.tiling[i]||1;
flips[i]=layer?.normalFlipY||1;
}
shader.uniforms.uSMTiling.value.set(...tiling);
shader.uniforms.uSMNormalFlipY.value.set(...flips);
if(mesh.material?.userData)mesh.material.userData.smMaterialPaintLayerAssetIds=[...state.layerAssetIds];
return true;
}
function compatibleBaseMaterial(mesh,data){
const raw=data.originalMaterial||mesh.material;
const list=Array.isArray(raw)?raw:[raw];
const base=list.find(material=>material&&!material.isShaderMaterial&&!material.isRawShaderMaterial)||null;
if(!base)return null;
if(base.isMeshPhysicalMaterial||base.isMeshStandardMaterial)return base.clone();
const material=new THREE.MeshStandardMaterial();
if(base.color)material.color.copy(base.color);
if(base.map)material.map=base.map;
if(base.emissive)material.emissive.copy(base.emissive);
if(base.emissiveMap)material.emissiveMap=base.emissiveMap;
if(Number.isFinite(base.opacity))material.opacity=base.opacity;
material.transparent=base.transparent===true;
material.alphaTest=Number(base.alphaTest)||0;
material.side=base.side??THREE.FrontSide;
material.depthTest=base.depthTest!==false;
material.depthWrite=base.depthWrite!==false;
material.vertexColors=base.vertexColors===true;
material.flatShading=base.flatShading===true;
return material;
}
function installBlendShader(material,mesh,data){
if(material.userData?.smUniversalPaintInstalled)return material;
material.userData||={};
const previousCompile=material.onBeforeCompile;
const previousKey=material.customProgramCacheKey;
material.onBeforeCompile=function(shader,renderer){
previousCompile?.call(this,shader,renderer);
const requiredVertex=["#include <common>","#include <uv_vertex>","#include <project_vertex>"];
const requiredFragment=["#include <common>","#include <map_fragment>","#include <roughnessmap_fragment>","#include <metalnessmap_fragment>","#include <normal_fragment_maps>"];
if(!requiredVertex.every(token=>shader.vertexShader.includes(token))||!requiredFragment.every(token=>shader.fragmentShader.includes(token))){
console.error("[Material Paint] Shader chunks are incompatible with this THREE/material version.",{mesh,material});
return;
}
Object.assign(shader.uniforms,shaderUniforms());
data.shader=shader;
data.material=material;
data.compileVersion++;
shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>
attribute vec4 smPaintWeights;
varying vec2 vSMUv;
varying vec4 vSMVertexWeights;
varying vec3 vSMWorldPos;
varying vec3 vSMWorldNormal;`);
shader.vertexShader=shader.vertexShader.replace("#include <uv_vertex>",`#include <uv_vertex>
#ifdef USE_UV
vSMUv=uv;
#else
vSMUv=vec2(0.0);
#endif
vSMVertexWeights=smPaintWeights;`);
shader.vertexShader=shader.vertexShader.replace("#include <project_vertex>",`vSMWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;
vSMWorldNormal=normalize(mat3(modelMatrix)*objectNormal);
#include <project_vertex>`);
shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>
${shaderDefinitions()}`);
shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`vec4 smW=smWeights();
diffuseColor.rgb*=smColorBlend(smW);`);
shader.fragmentShader=shader.fragmentShader.replace("#include <roughnessmap_fragment>",`vec3 smORMValue=smORMBlend(smWeights());
roughnessFactor*=clamp(smORMValue.g,0.02,1.0);`);
shader.fragmentShader=shader.fragmentShader.replace("#include <metalnessmap_fragment>",`metalnessFactor*=clamp(smORMBlend(smWeights()).b,0.0,1.0);`);
shader.fragmentShader=shader.fragmentShader.replace("#include <normal_fragment_maps>",`vec3 smMapN=smNormalBlend(smWeights());
#ifdef USE_TANGENT
normal=normalize(vTBN*smMapN);
#else
normal=perturbNormal2Arb(-vViewPosition,normal,smMapN,faceDirection);
#endif`);
if(shader.fragmentShader.includes("#include <aomap_fragment>")){
shader.fragmentShader=shader.fragmentShader.replace("#include <aomap_fragment>",`float smAO=clamp(smORMBlend(smWeights()).r,0.0,1.0);
reflectedLight.indirectDiffuse*=smAO;
reflectedLight.indirectSpecular*=mix(0.55,1.0,smAO);`);
}
syncUniforms(mesh);
};
material.customProgramCacheKey=function(){
const base=typeof previousKey==="function"?previousKey.call(this):"SMStandard";
return`${base}|SMUniversalPaint_v4`;
};
material.userData.smUniversalPaintInstalled=true;
material.needsUpdate=true;
return material;
}
function prepareMaterial(mesh){
ensureNeutralTextures();
const data=ensurePaintData(mesh);
if(!data)return null;
if(data.material&&mesh.material===data.material)return data;
const positionCount=mesh.geometry?.attributes?.position?.count||0;
if(data.backend==="vertex"&&!mesh.geometry?.attributes?.uv&&positionCount){
mesh.geometry.setAttribute("uv",new THREE.BufferAttribute(new Float32Array(positionCount*2),2));
mesh.userData.smMaterialPaintDummyUV=true;
}
if(positionCount&&!mesh.geometry?.attributes?.smPaintWeights){
ensureVertexWeights(mesh);
}
const material=compatibleBaseMaterial(mesh,data);
if(!material){
console.warn("[Material Paint] Unsupported ShaderMaterial/RawShaderMaterial. Object left unchanged:",mesh);
return null;
}
material.name=`SM_Painted_${mesh.name||mesh.uuid}`;
material.map=neutral.white;
material.normalMap=neutral.normal;
material.normalScale=new THREE.Vector2(1,1);
material.roughness=1;
material.metalness=1;
material.userData.smOriginalMaterial=data.originalMaterial;
material.userData.smMaterialPaintLayerAssetIds=[...state.layerAssetIds];
material.userData.smMaterialPaintTarget=true;
installBlendShader(material,mesh,data);
mesh.material=material;
mesh.visible=data.originalVisible!==false;
mesh.castShadow=true;
mesh.receiveShadow=true;
data.material=material;
return data;
}
async function setLayerAsset(layerIndex,assetId,root=state.target){
const index=Math.max(0,Math.min(3,Math.floor(layerIndex)));
const hadAny=hasMaterialLayer();
const previous=state.layerAssetIds[index];
try{
const runtime=assetId?await runtimeLayer(assetId):null;
state.layerAssetIds[index]=assetId||null;
for(const mesh of meshList(root)){
const data=prepareMaterial(mesh);
if(!data)continue;
data.layers[index]=runtime;
data.layerDefinitions[index]=runtime?.definition||null;
syncUniforms(mesh);
}
if(!hadAny&&assetId&&root)fillLayer(index,root);
global.dispatchEvent(new CustomEvent("sm:material-paint-layer-changed",{detail:{layer:index,assetId,target:root}}));
emitState();
return runtime;
}catch(error){
state.layerAssetIds[index]=previous;
console.error("[Material Paint] Could not assign layer. Existing object material was preserved where possible.",error);
throw error;
}
}
async function setTarget(root){
emergencyStop("target-change");
if(!root){
state.target=null;
emitState();
return false;
}
const meshes=meshList(root);
if(!meshes.length){
console.warn("[Material Paint] Selected target has no mesh.");
state.target=null;
emitState();
return false;
}
state.target=root;
for(const mesh of meshes)ensurePaintData(mesh);
if(hasMaterialLayer()){
for(let i=0;i<MAX_LAYERS;i++){
if(state.layerAssetIds[i])await setLayerAsset(i,state.layerAssetIds[i],root);
}
}
emitState();
return true;
}
function useSelection(){
const object=selectedObject();
if(!object){console.warn("[Material Paint] No selected object.");return false;}
setTarget(object);
return true;
}
function setActiveLayer(index){
state.activeLayer=Math.max(0,Math.min(3,Math.floor(index)));
emitState();
return state.activeLayer;
}
function setOperation(operation){
state.operation=operation==="erase"?"erase":"paint";
emitState();
}
function paintRGBA(bytes,base,selected,alpha,erase){
const current=[bytes[base]/255,bytes[base+1]/255,bytes[base+2]/255,bytes[base+3]/255];
if(erase)current[selected]*=(1-alpha);
else{
for(let c=0;c<4;c++){
if(c===selected)current[c]+=(1-current[c])*alpha;
else current[c]*=(1-alpha);
}
}
let sum=current[0]+current[1]+current[2]+current[3];
if(sum<.0001){current[0]=1;current[1]=current[2]=current[3]=0;sum=1;}
if(sum>1.0001)for(let c=0;c<4;c++)current[c]/=sum;
for(let c=0;c<4;c++)bytes[base+c]=Math.round(clamp01(current[c])*255);
}
function uvBrushRadius(mesh,data){
mesh.geometry.computeBoundingBox?.();
const box=mesh.geometry.boundingBox;
const width=Math.max(.001,box?.max.x-box?.min.x||1);
const depth=Math.max(.001,box?.max.z-box?.min.z||box?.max.y-box?.min.y||1);
return Math.max(1,state.brushRadius/Math.max(.001,(width+depth)*.5)*data.weight.size);
}
function paintUV(mesh,hit,erase){
const data=ensurePaintData(mesh);
if(!data?.weight||!hit.uv)return false;
const{size,texture}=data.weight;
const bytes=data.weight.data;
const centerX=clamp01(hit.uv.x)*(size-1);
const centerY=(1-clamp01(hit.uv.y))*(size-1);
const radius=uvBrushRadius(mesh,data);
const minX=Math.max(0,Math.floor(centerX-radius-1));
const maxX=Math.min(size-1,Math.ceil(centerX+radius+1));
const minY=Math.max(0,Math.floor(centerY-radius-1));
const maxY=Math.min(size-1,Math.ceil(centerY+radius+1));
const hardCore=Math.max(0,1-clamp01(state.falloff));
let changed=false;
for(let y=minY;y<=maxY;y++){
for(let x=minX;x<=maxX;x++){
const dx=(x-centerX)/radius;
const dy=(y-centerY)/radius;
const distance=Math.hypot(dx,dy);
if(distance>1)continue;
let weight=1;
if(distance>hardCore)weight=1-smoothstep01((distance-hardCore)/Math.max(.0001,1-hardCore));
const alpha=clamp01(state.strength*state.flow*weight);
if(alpha<=.0001)continue;
paintRGBA(bytes,(y*size+x)*4,state.activeLayer,alpha,erase);
changed=true;
}
}
if(changed){
texture.needsUpdate=true;
data.strokeVersion++;
syncUniforms(mesh);
}
return changed;
}
function paintVertex(mesh,hit,erase){
const data=ensurePaintData(mesh);
const attribute=data?.vertexWeights||ensureVertexWeights(mesh);
const position=mesh.geometry?.attributes?.position;
if(!attribute||!position)return false;
mesh.updateWorldMatrix?.(true,false);
const world=new THREE.Vector3();
const hardCore=Math.max(0,1-clamp01(state.falloff));
let changed=false;
for(let i=0;i<position.count;i++){
world.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
const distance=world.distanceTo(hit.point);
if(distance>state.brushRadius)continue;
const t=distance/Math.max(.0001,state.brushRadius);
const weight=t<=hardCore?1:1-smoothstep01((t-hardCore)/Math.max(.0001,1-hardCore));
const alpha=clamp01(state.strength*state.flow*weight);
const values=[attribute.getX(i),attribute.getY(i),attribute.getZ(i),attribute.getW(i)];
if(erase)values[state.activeLayer]*=(1-alpha);
else{
for(let c=0;c<4;c++){
if(c===state.activeLayer)values[c]+=(1-values[c])*alpha;
else values[c]*=(1-alpha);
}
}
let sum=values.reduce((a,b)=>a+b,0);
if(sum<.0001){values[0]=1;values[1]=values[2]=values[3]=0;sum=1;}
if(sum>1)for(let c=0;c<4;c++)values[c]/=sum;
attribute.setXYZW(i,...values);
changed=true;
}
if(changed){
attribute.needsUpdate=true;
data.strokeVersion++;
syncUniforms(mesh);
}
return changed;
}
function paintHit(hit,event={}){
if(!state.active||!hit?.object?.isMesh)return false;
const data=prepareMaterial(hit.object);
if(!data)return false;
const erase=state.operation==="erase"||event.shiftKey===true;
const changed=data.backend==="uv"?paintUV(hit.object,hit,erase):paintVertex(hit.object,hit,erase);
if(changed){
if(global.renderer?.shadowMap)global.renderer.shadowMap.needsUpdate=true;
global.dispatchEvent(new CustomEvent("sm:material-painted",{detail:{mesh:hit.object,target:state.target,layer:state.activeLayer,erase,backend:data.backend,point:hit.point.clone()}}));
}
return changed;
}
function hitFromEvent(event){
if(!state.active||!state.target||!global.renderer)return null;
const canvas=global.renderer.domElement;
const rect=canvas.getBoundingClientRect();
state.pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
const camera=activeCamera();
if(!camera)return null;
state.raycaster.setFromCamera(state.pointer,camera);
return state.raycaster.intersectObjects(meshList(state.target),false)[0]||null;
}
function ensurePreview(){
if(state.preview)return state.preview;
const geometry=new THREE.RingGeometry(.92,1,64);
const material=new THREE.MeshBasicMaterial({color:0x4ea1ff,transparent:true,opacity:.9,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
const preview=new THREE.Mesh(geometry,material);
preview.name="SM_MaterialBrushPreview";
preview.userData.isSystemObject=true;
preview.userData.excludeFromShadows=true;
preview.renderOrder=10000;
preview.visible=false;
global.scene?.add?.(preview);
state.preview=preview;
return preview;
}
function updatePreview(hit){
const preview=ensurePreview();
if(!preview||!hit)return;
const normal=hit.face?.normal?.clone?.().transformDirection(hit.object.matrixWorld)||new THREE.Vector3(0,1,0);
preview.visible=state.active;
preview.position.copy(hit.point).addScaledVector(normal,.01);
preview.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal.normalize());
preview.scale.setScalar(state.brushRadius);
}
function hidePreview(){if(state.preview)state.preview.visible=false;}
function setCursor(active){
const canvas=global.renderer?.domElement;
if(!canvas)return;
if(active){
if(canvas.dataset.smMaterialPaintPreviousCursor===undefined)canvas.dataset.smMaterialPaintPreviousCursor=canvas.style.cursor||"";
canvas.style.cursor="crosshair";
}else{
canvas.style.cursor=canvas.dataset.smMaterialPaintPreviousCursor||"";
delete canvas.dataset.smMaterialPaintPreviousCursor;
}
}
function emergencyStop(reason="manual"){
state.active=false;
state.painting=false;
state.lastStopReason=reason;
hidePreview();
setCursor(false);
if(global.controls)global.controls.enabled=true;
const canvas=state.eventCanvas||global.renderer?.domElement;
if(canvas&&state.pointerId!==null){
try{if(canvas.hasPointerCapture?.(state.pointerId))canvas.releasePointerCapture(state.pointerId);}catch(_){}
}
state.pointerId=null;
emitState();
return true;
}
function activate(){
if(!state.target){
console.warn("[Material Paint] Select a target first.");
emergencyStop("missing-target");
return false;
}
if(!hasMaterialLayer()){
console.warn("[Material Paint] Assign at least one PBR material layer before enabling the brush.");
emergencyStop("missing-material-layer");
return false;
}
state.active=true;
state.painting=false;
state.lastStopReason="";
bindEvents();
ensurePreview();
setCursor(true);
emitState();
return true;
}
function deactivate(){return emergencyStop("deactivate");}
function bindEvents(){
const canvas=global.renderer?.domElement;
if(!canvas)return false;
if(state.eventsBound&&state.eventCanvas===canvas)return true;
state.eventsBound=true;
state.eventCanvas=canvas;
canvas.addEventListener("pointerdown",event=>{
if(!state.active||event.button!==0||!state.target)return;
const hit=hitFromEvent(event);
if(!hit)return;
state.painting=true;
state.pointerId=event.pointerId;
try{canvas.setPointerCapture?.(event.pointerId);}catch(_){}
if(global.controls)global.controls.enabled=false;
updatePreview(hit);
paintHit(hit,event);
event.preventDefault();
});
canvas.addEventListener("pointermove",event=>{
if(!state.active){hidePreview();return;}
const hit=hitFromEvent(event);
if(!hit){hidePreview();return;}
updatePreview(hit);
if(state.painting)paintHit(hit,event);
});
const endStroke=event=>{
state.painting=false;
if(global.controls)global.controls.enabled=true;
if(event?.pointerId!==undefined&&state.pointerId===event.pointerId){
try{if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId);}catch(_){}
state.pointerId=null;
}
};
canvas.addEventListener("pointerup",endStroke);
canvas.addEventListener("pointercancel",endStroke);
canvas.addEventListener("lostpointercapture",endStroke);
canvas.addEventListener("pointerleave",event=>{if(!state.painting)hidePreview();});
global.addEventListener("pointerup",endStroke,true);
global.addEventListener("blur",()=>emergencyStop("window-blur"));
document.addEventListener("visibilitychange",()=>{if(document.hidden)emergencyStop("document-hidden");});
global.addEventListener("keydown",event=>{
if(event.key==="Escape"&&state.active){
event.preventDefault();
event.stopPropagation();
emergencyStop("escape");
}
},true);
global.addEventListener("sm-workspace-changed",()=>emergencyStop("workspace-change"));
global.addEventListener("sm:workspace-changed",()=>emergencyStop("workspace-change"));
return true;
}
function clearWeights(root=state.target){
for(const mesh of meshList(root)){
const data=ensurePaintData(mesh);
if(!data)continue;
if(data.backend==="uv"){
for(let i=0;i<data.weight.data.length;i+=4){
data.weight.data[i]=255;
data.weight.data[i+1]=0;
data.weight.data[i+2]=0;
data.weight.data[i+3]=0;
}
data.weight.texture.needsUpdate=true;
}else{
const attr=data.vertexWeights||ensureVertexWeights(mesh);
for(let i=0;i<attr.count;i++)attr.setXYZW(i,1,0,0,0);
attr.needsUpdate=true;
}
data.strokeVersion++;
syncUniforms(mesh);
}
emitState();
return true;
}
function fillLayer(layer=state.activeLayer,root=state.target){
const selected=Math.max(0,Math.min(3,layer|0));
for(const mesh of meshList(root)){
const data=ensurePaintData(mesh);
if(!data)continue;
if(data.backend==="uv"){
const bytes=data.weight.data;
for(let i=0;i<bytes.length;i+=4){
bytes[i]=bytes[i+1]=bytes[i+2]=bytes[i+3]=0;
bytes[i+selected]=255;
}
data.weight.texture.needsUpdate=true;
}else{
const attr=data.vertexWeights||ensureVertexWeights(mesh);
for(let i=0;i<attr.count;i++){
const value=[0,0,0,0];
value[selected]=1;
attr.setXYZW(i,...value);
}
attr.needsUpdate=true;
}
data.strokeVersion++;
syncUniforms(mesh);
}
emitState();
return true;
}
function restoreOriginalMaterials(root=state.target,options={}){
emergencyStop("restore-original");
for(const mesh of meshList(root)){
const data=mesh.userData?.smUniversalMaterialPaint;
if(!data)continue;
if(data.originalMaterial)mesh.material=data.originalMaterial;
if(data.originalVisible!==undefined)mesh.visible=data.originalVisible;
data.material=null;
data.shader=null;
if(options.clearData===true){
delete mesh.userData.smUniversalMaterialPaint;
if(mesh.userData.smMaterialPaintDummyUV){
mesh.geometry?.deleteAttribute?.("uv");
delete mesh.userData.smMaterialPaintDummyUV;
}
}
}
if(global.renderer?.shadowMap)global.renderer.shadowMap.needsUpdate=true;
emitState();
return true;
}
function setBrush(options={}){
if(options.radius!==undefined)state.brushRadius=Math.max(.01,Number(options.radius)||.01);
if(options.strength!==undefined)state.strength=clamp01(options.strength);
if(options.flow!==undefined)state.flow=clamp01(options.flow);
if(options.falloff!==undefined)state.falloff=clamp01(options.falloff);
if(state.preview)state.preview.scale.setScalar(state.brushRadius);
emitState();
}
function handleAssetsMaterialApplied(event){
const mesh=event?.detail?.mesh;
const asset=event?.detail?.asset;
if(!mesh||!asset?.id)return;
if(state.target&&meshList(state.target).includes(mesh)){
state.layerAssetIds[state.activeLayer]=asset.id;
emitState();
}
}
function diagnostics(){
const targets=meshList(state.target);
return{
active:state.active,
painting:state.painting,
target:state.target?.name||state.target?.uuid||null,
meshCount:targets.length,
activeLayer:state.activeLayer,
layerAssetIds:[...state.layerAssetIds],
hasMaterialLayer:hasMaterialLayer(),
previewVisible:!!state.preview?.visible,
controlsEnabled:global.controls?.enabled,
lastStopReason:state.lastStopReason,
meshes:targets.map(mesh=>{
const data=mesh.userData?.smUniversalMaterialPaint;
return{name:mesh.name||mesh.uuid,visible:mesh.visible,material:mesh.material?.name||mesh.material?.type,backend:data?.backend||null,compileVersion:data?.compileVersion||0,hasShader:!!data?.shader};
})
};
}
function emitState(){
global.dispatchEvent(new CustomEvent("sm:material-painter-state",{detail:{
active:state.active,
painting:state.painting,
target:state.target,
activeLayer:state.activeLayer,
layerAssetIds:[...state.layerAssetIds],
brushRadius:state.brushRadius,
strength:state.strength,
flow:state.flow,
falloff:state.falloff,
operation:state.operation,
lastStopReason:state.lastStopReason
}}));
}
global.SMUniversalMaterialPainter={
state,
MAX_LAYERS,
CHANNELS,
meshList,
selectedObject,
isTerrainObject,
hasMaterialLayer,
ensurePaintData,
prepareMaterial,
setTarget,
useSelection,
setLayerAsset,
setActiveLayer,
setOperation,
setBrush,
activate,
deactivate,
emergencyStop,
clearWeights,
fillLayer,
restoreOriginalMaterials,
paintHit,
decodeAssetPayload,
diagnostics,
get target(){return state.target;},
get active(){return state.active;}
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{ensureNeutralTextures();bindEvents();},{once:true});
else{ensureNeutralTextures();bindEvents();}
global.addEventListener("sm:assets-material-applied",handleAssetsMaterialApplied);
console.log("[SMUniversalMaterialPainter] v4.1 ready - AssetsPanel is the material source; brush starts OFF.");
})(window);
