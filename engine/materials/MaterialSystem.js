// engine/materials/MaterialSystem.js
(function(global){
"use strict";
if(global.SMEditorMaterialSystem)return;
const THREE=global.THREE;
class SMEditorMaterialSystem{
constructor(){
this.library=global.SMMaterialLibrary||null;
this.textureCache=new Map();
this.materialCache=new Map();
this.initialized=false;
}
init(){
if(this.initialized)return this;
this.initialized=true;
this.library=global.SMMaterialLibrary||this.library;
this.library?.init?.();
global.addEventListener?.("sm:material-library-changed",()=>this.invalidate());
global.addEventListener?.("sm:material-instance-changed",event=>this.invalidate(event.detail?.instance?.parentMaterialId));
console.log("[SMEditorMaterialSystem] Initialized.");
return this;
}
invalidate(materialId=null){
if(materialId)this.materialCache.delete(materialId);
else this.materialCache.clear();
return this;
}
async _loadTexture(assetId,{color=false}={}){
if(!assetId||!THREE)return null;
const key=`${assetId}:${color?"srgb":"linear"}`;
if(this.textureCache.has(key))return this.textureCache.get(key);
const bridge=global.SMMaterialAssetBridge;
const promise=bridge?.loadTextureAsset?.(assetId,{color})||Promise.resolve(null);
this.textureCache.set(key,promise);
return await promise;
}
async createThreeMaterial(materialOrInstanceId,options={}){
if(!THREE)throw new Error("THREE is unavailable.");
const definition=this.library?.resolveDefinition?.(materialOrInstanceId)||{};
const cacheKey=`${materialOrInstanceId}:${JSON.stringify(options)}`;
if(!options.noCache&&this.materialCache.has(cacheKey))return this.materialCache.get(cacheKey);
const type=definition.type||"MeshPhysicalMaterial";
const Ctor=THREE[type]||THREE.MeshPhysicalMaterial||THREE.MeshStandardMaterial;
const params={
color:new THREE.Color(definition.color||"#ffffff"),
roughness:Number.isFinite(Number(definition.roughness))?Number(definition.roughness):1,
metalness:Number.isFinite(Number(definition.metalness))?Number(definition.metalness):0
};
if("clearcoat"in Ctor.prototype||type==="MeshPhysicalMaterial"){
params.clearcoat=Number(definition.clearcoat)||0;
params.clearcoatRoughness=Number.isFinite(Number(definition.clearcoatRoughness))?Number(definition.clearcoatRoughness):1;
}
const material=new Ctor(params);
material.name=definition.displayName||definition.name||`SM Material ${materialOrInstanceId||""}`;
const [map,normalMap,roughnessMap,metalnessMap,aoMap,alphaMap,emissiveMap]=await Promise.all([
this._loadTexture(definition.map,{color:true}),
this._loadTexture(definition.normalMap,{color:false}),
this._loadTexture(definition.roughnessMap,{color:false}),
this._loadTexture(definition.metalnessMap,{color:false}),
this._loadTexture(definition.aoMap,{color:false}),
this._loadTexture(definition.opacityMap||definition.alphaMap,{color:false}),
this._loadTexture(definition.emissiveMap,{color:true})
]);
if(map)material.map=map;
if(normalMap){
material.normalMap=normalMap;
material.normalScale=new THREE.Vector2(1,String(definition.normalConvention||"gl").toLowerCase()==="dx"?-1:1).multiplyScalar(Number(definition.normalStrength)||1);
}
if(roughnessMap)material.roughnessMap=roughnessMap;
if(metalnessMap)material.metalnessMap=metalnessMap;
if(aoMap)material.aoMap=aoMap;
if(alphaMap){material.alphaMap=alphaMap;material.transparent=true;}
if(emissiveMap){material.emissiveMap=emissiveMap;material.emissive=new THREE.Color(definition.emissiveColor||"#ffffff");}
const tiling=Math.max(.001,Number(definition.tiling)||1);
for(const texture of [map,normalMap,roughnessMap,metalnessMap,aoMap,alphaMap,emissiveMap]){
if(texture?.repeat)texture.repeat.set(tiling,tiling);
}
material.userData.smMaterialAssetId=materialOrInstanceId;
material.userData.smMaterialDefinition={...definition};
material.needsUpdate=true;
if(!options.noCache)this.materialCache.set(cacheKey,material);
return material;
}
async applyToObject(root,materialOrInstanceId,options={}){
if(!root)return false;
const meshes=[];
if(root.isMesh)meshes.push(root);
else root.traverse?.(object=>{if(object.isMesh)meshes.push(object);});
if(!meshes.length)return false;
for(const mesh of meshes){
const material=await this.createThreeMaterial(materialOrInstanceId,{...options,noCache:true});
if(options.preserveSide&&mesh.material?.side!==undefined)material.side=mesh.material.side;
mesh.material=material;
mesh.castShadow=options.castShadow??true;
mesh.receiveShadow=options.receiveShadow??true;
}
global.dispatchEvent?.(new CustomEvent("sm:material-applied",{detail:{root,materialOrInstanceId,meshes}}));
return true;
}
createInstance(materialId,options={}){
return this.library?.createInstance?.(materialId,options)||null;
}
diagnostics(){
return{
initialized:this.initialized,
materials:this.library?.materials?.size||0,
instances:this.library?.instances?.size||0,
textureCache:this.textureCache.size,
materialCache:this.materialCache.size,
rendererMaterialSystem:!!global.SMMaterialSystem,
paintSystem:!!global.SMUniversalMaterialPainter
};
}
}
global.SMEditorMaterialSystem=new SMEditorMaterialSystem();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>global.SMEditorMaterialSystem.init(),{once:true});
else global.SMEditorMaterialSystem.init();
console.log("[SMEditorMaterialSystem] Authoring system ready. Rendering SMMaterialSystem ownership untouched.");
})(window);