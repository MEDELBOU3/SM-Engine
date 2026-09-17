(function(global){'use strict';
class SMMaterialRegistry{
 constructor(){this.materials=new Map();this.users=new Map();}
 register(material,mesh=null){if(!material?.uuid)return null;this.materials.set(material.uuid,material);if(mesh?.uuid){if(!this.users.has(material.uuid))this.users.set(material.uuid,new Set());this.users.get(material.uuid).add(mesh.uuid);}return material;}
 registerMesh(mesh){if(!mesh?.isMesh||!mesh.material)return;const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of list)this.register(m,mesh);}
 unregister(material){const id=typeof material==='string'?material:material?.uuid;if(!id)return false;this.users.delete(id);return this.materials.delete(id);}
 get(id){return this.materials.get(id)||null;}
 scanScene(scene){scene?.traverse?.(o=>{if(o?.isMesh)this.registerMesh(o);});return this.materials.size;}
 clear(){this.materials.clear();this.users.clear();}
 diagnostics(){return{materials:this.materials.size,trackedUserSets:this.users.size};}
}
global.SMMaterialRegistry=SMMaterialRegistry;})(window);
