// engine/materials/material-painting/SMMaterialAssetBridge.js
(function(global){
"use strict";
if(global.SMMaterialAssetBridge)return;
const THREE=global.THREE;
function panel(){return global.AssetsPanel||null;}
function getAsset(id){return panel()?._findById?.(id)||panel()?.assets?.find?.(asset=>asset?.id===id)||null;}
function getAssetSource(asset){
if(!asset)return null;
if(panel()?._getAssetSourceUrl)return panel()._getAssetSourceUrl(asset);
return asset.data||asset.url||asset.src||null;
}
function isPaintReadyMaterial(asset){
if(!asset||asset.type!=="material"||asset.isFolder)return false;
const def=asset.definition||{};
const tags=new Set((asset.tags||[]).map(tag=>String(tag).toLowerCase()));
if(tags.has("paint-ready")||def.sourcePackage)return true;
const keys=["map","normalMap","roughnessMap","metalnessMap","aoMap","ormMap","displacementMap","opacityMap","alphaMap","emissiveMap"];
return keys.some(key=>!!def[key])||["MeshStandardMaterial","MeshPhysicalMaterial"].includes(def.type);
}
function listMaterials(options={}){
const all=(panel()?.assets||[]).filter(asset=>asset?.type==="material"&&!asset?.isFolder);
return options.all?all:all.filter(isPaintReadyMaterial);
}
function materialLabel(asset){
if(!asset)return"Material";
return String(asset.definition?.displayName||asset.definition?.name||asset.name||"Material")
.replace(/\.material\.json$/i,"")
.replace(/\.json$/i,"");
}
function thumbnailUrl(asset){
if(!asset)return null;
const thumb=asset.thumbnail;
if(typeof thumb==="string"&&thumb.trim()){
const value=thumb.trim();
if(/^data:image\//i.test(value)||/^blob:/i.test(value)||/^https?:\/\//i.test(value)||/^file:/i.test(value))return value;
if(/^<svg[\s>]/i.test(value)){
try{return`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(value)}`;}catch(_){}
}
}
const source=getAssetSource(getAsset(asset.definition?.map));
return typeof source==="string"&&source?source:null;
}
async function loadTextureAsset(assetId,{color=false}={}){
const asset=getAsset(assetId),src=getAssetSource(asset);
if(!src||!THREE)return null;
return await new Promise(resolve=>{
new THREE.TextureLoader().load(src,texture=>{
texture.wrapS=THREE.RepeatWrapping;
texture.wrapT=THREE.RepeatWrapping;
texture.anisotropy=Math.min(8,global.renderer?.capabilities?.getMaxAnisotropy?.()||4);
if("colorSpace"in texture){
texture.colorSpace=color?(THREE.SRGBColorSpace??texture.colorSpace):(THREE.NoColorSpace??texture.colorSpace);
}
texture.needsUpdate=true;
resolve(texture);
},undefined,()=>resolve(null));
});
}
async function imagePixelsFromAsset(assetId,size=512){
const src=getAssetSource(getAsset(assetId));
if(!src)return null;
return await new Promise(resolve=>{
const image=new Image();
image.onload=()=>{
const max=Math.max(image.naturalWidth||image.width||1,image.naturalHeight||image.height||1);
const scale=Math.min(1,size/max);
const w=Math.max(1,Math.round((image.naturalWidth||image.width||1)*scale));
const h=Math.max(1,Math.round((image.naturalHeight||image.height||1)*scale));
const canvas=document.createElement("canvas");
canvas.width=w;canvas.height=h;
const ctx=canvas.getContext("2d",{willReadFrequently:true});
ctx.drawImage(image,0,0,w,h);
try{resolve({data:ctx.getImageData(0,0,w,h).data,width:w,height:h});}catch(_){resolve(null);}
};
image.onerror=()=>resolve(null);
image.src=src;
});
}
async function buildORMTexture(definition,size=512){
if(!THREE)return null;
if(definition?.ormMap){
const packed=await loadTextureAsset(definition.ormMap,{color:false});
if(packed)return packed;
}
const[ao,rough,metal]=await Promise.all([
definition?.aoMap?imagePixelsFromAsset(definition.aoMap,size):null,
definition?.roughnessMap?imagePixelsFromAsset(definition.roughnessMap,size):null,
definition?.metalnessMap?imagePixelsFromAsset(definition.metalnessMap,size):null
]);
const width=Math.max(1,ao?.width||rough?.width||metal?.width||1);
const height=Math.max(1,ao?.height||rough?.height||metal?.height||1);
const data=new Uint8Array(width*height*4);
const sample=(src,x,y,fallback)=>{
if(!src)return fallback;
const sx=Math.min(src.width-1,Math.floor(x/width*src.width));
const sy=Math.min(src.height-1,Math.floor(y/height*src.height));
return src.data[(sy*src.width+sx)*4];
};
for(let y=0;y<height;y++){
for(let x=0;x<width;x++){
const i=(y*width+x)*4;
data[i]=sample(ao,x,y,255);
data[i+1]=sample(rough,x,y,Math.round((definition?.roughness??1)*255));
data[i+2]=sample(metal,x,y,Math.round((definition?.metalness??0)*255));
data[i+3]=255;
}
}
const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.UnsignedByteType);
texture.name="SM_Runtime_ORM";
texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
texture.generateMipmaps=true;
if("colorSpace"in texture&&THREE.NoColorSpace!==undefined)texture.colorSpace=THREE.NoColorSpace;
texture.needsUpdate=true;
return texture;
}
function importPBRPackage(files,options={}){
if(!panel()?.importMaterialPackage)throw new Error("AssetsPanel.importMaterialPackage is unavailable.");
return panel().importMaterialPackage(files,options);
}
function promptImportPBRPackage(options={}){
if(!panel()?.promptImportMaterialPackage)throw new Error("AssetsPanel.promptImportMaterialPackage is unavailable.");
return panel().promptImportMaterialPackage(options);
}
global.SMMaterialAssetBridge={
getAsset,getAssetSource,isPaintReadyMaterial,listMaterials,materialLabel,thumbnailUrl,
loadTextureAsset,buildORMTexture,
importPBRPackage,promptImportPBRPackage
};
console.log("[SMMaterialAssetBridge] Runtime material bridge ready; importing is owned by AssetsPanel.");
})(window);