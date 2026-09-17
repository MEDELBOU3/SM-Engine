// engine/materials/MaterialLibrary.js
(function(global){
"use strict";
if(global.SMMaterialLibrary)return;
class MaterialLibrary{
constructor(){
this.materials=new Map();
this.instances=new Map();
this.revision=0;
this._bound=false;
}
_normalizeAsset(asset){
if(!asset)return null;
return{
id:asset.id,
name:asset.definition?.displayName||String(asset.name||"Material").replace(/\.material\.json$/i,""),
asset,
definition:{...(asset.definition||{})},
provider:asset.definition?.provider||null,
thumbnail:asset.thumbnail||null,
tags:[...(asset.tags||[])]
};
}
registerMaterial(assetOrRecord){
const record=assetOrRecord?.asset?assetOrRecord:this._normalizeAsset(assetOrRecord);
if(!record?.id)return null;
this.materials.set(record.id,record);
this.revision++;
this._emit("register",record);
return record;
}
unregisterMaterial(id){
const record=this.materials.get(id);
if(!record)return false;
this.materials.delete(id);
this.revision++;
this._emit("unregister",record);
return true;
}
get(id){return this.materials.get(id)||null;}
has(id){return this.materials.has(id);}
list(options={}){
let values=[...this.materials.values()];
if(options.query){
const q=String(options.query).trim().toLowerCase();
values=values.filter(record=>`${record.name} ${record.provider||""} ${(record.tags||[]).join(" ")}`.toLowerCase().includes(q));
}
if(options.provider)values=values.filter(record=>record.provider===options.provider);
return values;
}
syncAssetsPanel(){
const panel=global.AssetsPanel;
if(!panel?.assets)return[];
const seen=new Set();
const registered=[];
for(const asset of panel.assets){
if(asset?.type!=="material"||asset?.isFolder)continue;
seen.add(asset.id);
registered.push(this.registerMaterial(asset));
}
for(const id of [...this.materials.keys()]){
if(!seen.has(id))this.materials.delete(id);
}
this.revision++;
this._emit("sync",{count:registered.length});
return registered;
}
createInstance(parentMaterialId,options={}){
if(!global.SMMaterialInstance)throw new Error("SMMaterialInstance is not loaded.");
const parent=this.get(parentMaterialId);
const instance=new global.SMMaterialInstance({
name:options.name||`${parent?.name||"Material"} Instance`,
parentMaterialId,
parameters:options.parameters||{},
textures:options.textures||{},
metadata:options.metadata||{}
});
this.instances.set(instance.id,instance);
this._emit("instance-created",instance);
return instance;
}
registerInstance(instance){
if(!instance?.id)return null;
this.instances.set(instance.id,instance);
this._emit("instance-register",instance);
return instance;
}
getInstance(id){return this.instances.get(id)||null;}
removeInstance(id){
const instance=this.instances.get(id);
if(!instance)return false;
this.instances.delete(id);
this._emit("instance-remove",instance);
return true;
}
resolveDefinition(materialOrInstanceId){
const instance=this.getInstance(materialOrInstanceId);
if(instance){
const parent=this.get(instance.parentMaterialId);
return instance.resolve(parent?.definition||{});
}
return{...(this.get(materialOrInstanceId)?.definition||{})};
}
_bindEvents(){
if(this._bound)return;
this._bound=true;
global.addEventListener?.("sm:material-library-changed",()=>this.syncAssetsPanel());
}
_emit(action,value){
global.dispatchEvent?.(new CustomEvent("sm:editor-material-library",{detail:{action,value,library:this}}));
}
init(){
this._bindEvents();
this.syncAssetsPanel();
return this;
}
}
global.SMMaterialLibrary=new MaterialLibrary();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>global.SMMaterialLibrary.init(),{once:true});
else global.SMMaterialLibrary.init();
console.log("[SMMaterialLibrary] Ready.");
})(window);