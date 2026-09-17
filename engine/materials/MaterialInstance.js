// engine/materials/MaterialInstance.js
(function(global){
"use strict";
if(global.SMMaterialInstance)return;
function cloneValue(value){
if(value===null||value===undefined)return value;
if(Array.isArray(value))return value.map(cloneValue);
if(typeof value==="object"){
if(value.isColor)return"#"+value.getHexString();
if(value.isVector2)return[value.x,value.y];
if(value.isVector3)return[value.x,value.y,value.z];
if(value.isVector4)return[value.x,value.y,value.z,value.w];
try{return JSON.parse(JSON.stringify(value));}catch(_){return value;}
}
return value;
}
class SMMaterialInstance{
constructor(options={}){
this.version=1;
this.id=options.id||`sm_matinst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
this.name=options.name||"Material Instance";
this.parentMaterialId=options.parentMaterialId||options.parent||null;
this.parameters={...(options.parameters||{})};
this.textures={...(options.textures||{})};
this.metadata={...(options.metadata||{})};
this.createdAt=options.createdAt||Date.now();
this.updatedAt=options.updatedAt||this.createdAt;
}
setParameter(name,value){
if(!name)return this;
this.parameters[name]=cloneValue(value);
this.updatedAt=Date.now();
global.dispatchEvent?.(new CustomEvent("sm:material-instance-changed",{detail:{instance:this,kind:"parameter",name,value}}));
return this;
}
getParameter(name,fallback=undefined){
return Object.prototype.hasOwnProperty.call(this.parameters,name)?this.parameters[name]:fallback;
}
setTexture(slot,assetId){
if(!slot)return this;
if(assetId===null||assetId===undefined||assetId==="")delete this.textures[slot];
else this.textures[slot]=assetId;
this.updatedAt=Date.now();
global.dispatchEvent?.(new CustomEvent("sm:material-instance-changed",{detail:{instance:this,kind:"texture",slot,assetId}}));
return this;
}
getTexture(slot){return this.textures[slot]??null;}
clearOverride(name){
delete this.parameters[name];
delete this.textures[name];
this.updatedAt=Date.now();
return this;
}
resolve(parentDefinition={}){
return{...parentDefinition,...this.parameters,...this.textures,materialInstanceId:this.id,parentMaterialId:this.parentMaterialId};
}
clone(overrides={}){
return new SMMaterialInstance({
name:`${this.name} Copy`,
parentMaterialId:this.parentMaterialId,
parameters:cloneValue(this.parameters),
textures:cloneValue(this.textures),
metadata:cloneValue(this.metadata),
...overrides
});
}
toJSON(){
return{version:this.version,id:this.id,name:this.name,parentMaterialId:this.parentMaterialId,parameters:cloneValue(this.parameters),textures:cloneValue(this.textures),metadata:cloneValue(this.metadata),createdAt:this.createdAt,updatedAt:this.updatedAt};
}
static fromJSON(data={}){return new SMMaterialInstance(data);}
}
global.SMMaterialInstance=SMMaterialInstance;
console.log("[SMMaterialInstance] Ready.");
})(window);
