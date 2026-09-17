(function(){
    'use strict';
    class SMPrefabSerializer{
        static fromObject(object,options={}){
            if(!object||typeof object!=='object')throw new TypeError('SMPrefabSerializer.fromObject(object) requires an Object3D-like object.');
            const root=this.serializeNode(object,options);
            const id=String(options.id||object.userData?.prefabId||this._slug(object.name||object.uuid||'prefab'));
            const prefab=new window.SMPrefab({id,name:options.name||object.name||id,description:options.description||'',category:options.category||object.userData?.prefabCategory||'Gameplay',tags:options.tags||object.userData?.prefabTags||object.userData?.tags||[],root,metadata:{sourceName:object.name||'',sourceUUID:object.uuid||null,createdFromEditor:true,...(options.metadata||{})},dependencies:this.collectDependencies(root),defaultOverrides:options.defaultOverrides||{},sourceObjectUUID:object.uuid||null});
            if(options.keepTemplateObject!==false)prefab.templateObject=object;
            return prefab;
        }
        static serializeNode(object,options={}){
            const userData=this._sanitizeUserData(object.userData||{});
            const node={nodeId:String(userData.prefabNodeId||object.uuid||`node-${Math.random().toString(36).slice(2,8)}`),name:String(object.name||''),objectType:String(object.type||'Object3D'),runtimeType:userData.runtimeType||userData.type||null,tags:Array.isArray(userData.tags)?[...userData.tags]:[],visible:object.visible!==false,castShadow:object.castShadow===true,receiveShadow:object.receiveShadow===true,renderOrder:Number(object.renderOrder||0),layers:object.layers?.mask??1,transform:{position:this._vector(object.position,[0,0,0]),quaternion:this._quaternion(object.quaternion,[0,0,0,1]),scale:this._vector(object.scale,[1,1,1])},userData,components:this._serializeComponents(object),assetRef:this._assetRef(object),geometry:this._serializeGeometry(object.geometry,options),material:this._serializeMaterial(object.material,options),children:[]};
            if(options.includeChildren!==false&&Array.isArray(object.children))for(const child of object.children)if(options.includeEditorOnly===true||!this._isEditorOnly(child))node.children.push(this.serializeNode(child,options));
            return node;
        }
        static collectDependencies(root){
            const map=new Map();
            const walk=node=>{
                if(!node)return;
                for(const ref of [node.assetRef,node.geometry?.assetRef,...(Array.isArray(node.material)?node.material.map(item=>item?.assetRef):[node.material?.assetRef])]){
                    if(!ref)continue;
                    const key=ref.id||ref.path||ref.uuid||JSON.stringify(ref);
                    if(!map.has(key))map.set(key,{...ref});
                }
                for(const child of node.children||[])walk(child);
            };
            walk(root);
            return Array.from(map.values());
        }
        static toJSON(prefab,options={}){
            const value=prefab instanceof window.SMPrefab?prefab.serialize():new window.SMPrefab(prefab).serialize();
            return options.pretty===false?JSON.stringify(value):JSON.stringify(value,null,2);
        }
        static fromJSON(json){
            const data=typeof json==='string'?JSON.parse(json):json;
            return new window.SMPrefab(data);
        }
        static _serializeComponents(object){
            if(object.components?.serialize){
                try{return object.components.serialize();}catch{}
            }
            if(Array.isArray(object.userData?.components)){
                try{return structuredClone(object.userData.components);}catch{return JSON.parse(JSON.stringify(object.userData.components));}
            }
            return[];
        }
        static _assetRef(object){
            const data=object.userData||{};
            const path=data.assetPath||data.sourcePath||data.modelPath||null;
            const id=data.assetId||data.sourceAssetId||null;
            if(!path&&!id)return null;
            return{id:id||null,path:path||null,type:data.assetType||'object'};
        }
        static _serializeGeometry(geometry,options){
            if(!geometry)return null;
            const data=geometry.userData||{};
            const assetRef=(data.assetId||data.assetPath)?{id:data.assetId||null,path:data.assetPath||null,type:'geometry'}:null;
            if(assetRef)return{mode:'reference',assetRef,type:geometry.type||null,uuid:geometry.uuid||null};
            if(options.resourceMode==='reference')return{mode:'reference',assetRef:null,type:geometry.type||null,uuid:geometry.uuid||null,name:geometry.name||''};
            if(options.inlineResources===true||options.resourceMode==='inline'){
                try{return{mode:'inline',data:geometry.toJSON?.()||null,type:geometry.type||null,uuid:geometry.uuid||null};}catch{}
            }
            const parameters=geometry.parameters?this._safeClone(geometry.parameters):null;
            // Imported assets should resolve through stable asset references,
            // while primitives remain compact parameter descriptors. For an
            // authored/procedural BufferGeometry without either, keep a
            // deduplicated inline fallback so save/load never destroys work.
            if(!parameters&&options.inlineFallback!==false){
                try{return{mode:'inline',data:geometry.toJSON?.()||null,type:geometry.type||null,uuid:geometry.uuid||null,fallback:true};}catch{}
            }
            return{mode:'descriptor',type:geometry.type||null,uuid:geometry.uuid||null,name:geometry.name||'',parameters};
        }
        static _serializeMaterial(material,options){
            if(!material)return null;
            const materials=Array.isArray(material)?material:[material];
            const serialized=materials.map(mat=>{
                const data=mat?.userData||{};
                const assetRef=(data.assetId||data.assetPath)?{id:data.assetId||null,path:data.assetPath||null,type:'material'}:null;
                if(assetRef)return{mode:'reference',assetRef,type:mat.type||null,uuid:mat.uuid||null,name:mat.name||''};
                if(options.resourceMode==='reference')return{mode:'reference',assetRef:null,type:mat.type||null,uuid:mat.uuid||null,name:mat.name||''};
                if(options.inlineResources===true||options.resourceMode==='inline'){
                    try{return{mode:'inline',data:mat.toJSON?.()||null,type:mat.type||null,uuid:mat.uuid||null};}catch{}
                }
                return{mode:'descriptor',type:mat.type||'MeshStandardMaterial',uuid:mat.uuid||null,name:mat.name||'',properties:this._materialProperties(mat)};
            });
            return Array.isArray(material)?serialized:serialized[0];
        }
        static _materialProperties(material){
            const keys=['color','emissive','roughness','metalness','opacity','transparent','side','depthTest','depthWrite','wireframe','flatShading','visible','alphaTest'];
            const output={};
            for(const key of keys){
                const value=material?.[key];
                if(value===undefined)continue;
                if(value?.isColor)output[key]=`#${value.getHexString()}`;
                else if(typeof value!=='object'&&typeof value!=='function')output[key]=value;
            }
            return output;
        }
        static _sanitizeUserData(data){
            const clone={};
            for(const[key,value]of Object.entries(data||{})){
                if(key==='components')continue;
                if(typeof value==='function'||typeof value==='undefined')continue;
                try{clone[key]=this._safeClone(value);}catch{}
            }
            return clone;
        }
        static _isEditorOnly(object){
            const data=object.userData||{};
            if(data.editorOnly===true||data.runtimeIgnore===true||object.isHelper===true)return true;
            const name=String(object.name||'').toLowerCase();
            return name.startsWith('__editor')||name.includes('transformcontrols')||name.includes('gridhelper')||name.includes('axeshelper');
        }
        static _vector(value,fallback){
            if(value?.toArray)return value.toArray();
            return[Number(value?.x??fallback[0]),Number(value?.y??fallback[1]),Number(value?.z??fallback[2])];
        }
        static _quaternion(value,fallback){
            if(value?.toArray)return value.toArray();
            return[Number(value?.x??fallback[0]),Number(value?.y??fallback[1]),Number(value?.z??fallback[2]),Number(value?.w??fallback[3])];
        }
        static _safeClone(value){
            try{return structuredClone(value);}catch{}
            return JSON.parse(JSON.stringify(value));
        }
        static _slug(value){
            return String(value||'prefab').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'prefab';
        }
    }
    window.SMPrefabSerializer=SMPrefabSerializer;
    window.SMPrefabSerializerClass=SMPrefabSerializer;
})();
