(function(){
    'use strict';
    class SMLevelSerializer{
        static fromScene(scene,options={}){
            if(!scene||typeof scene!=='object')throw new TypeError('SMLevelSerializer.fromScene(scene) requires a scene.');
            const objects=[];
            for(const child of scene.children||[]){
                if(options.filter&&typeof options.filter==='function'&&!options.filter(child))continue;
                if(options.includeEditorOnly!==true&&this._isEditorOnly(child))continue;
                objects.push(this.serializeEntry(child,options));
            }
            const sceneSettings=scene.userData?.worldSettings||{};
            const level=new window.SMLevel({id:String(options.id||scene.userData?.levelId||this._slug(scene.name||'main-level')),name:String(options.name||scene.userData?.levelName||scene.name||'Main Level'),description:options.description||'',type:options.type||'persistent',parentId:options.parentId||null,sourceMode:options.editorBound===false?'serialized':'editor-bound',objects,sublevels:options.sublevels||scene.userData?.sublevels||[],worldSettings:{...this._clone(sceneSettings),...(options.worldSettings||{})},playerStart:options.playerStart||scene.userData?.playerStart||{},streaming:options.streaming||{},tags:options.tags||scene.userData?.levelTags||[],metadata:{sourceSceneUUID:scene.uuid||null,sourceSceneName:scene.name||'',createdFromEditor:true,...(options.metadata||{})},dependencies:this.collectDependencies(objects)});
            if(options.editorBound!==false)level.templateScene=scene;
            return level;
        }
        static fromRoot(root,options={}){
            if(!root||typeof root!=='object')throw new TypeError('SMLevelSerializer.fromRoot(root) requires an Object3D-like root.');
            const objects=[];
            if(options.includeRoot===true)objects.push(this.serializeEntry(root,options));
            else for(const child of root.children||[]){
                if(options.filter&&typeof options.filter==='function'&&!options.filter(child))continue;
                if(options.includeEditorOnly!==true&&this._isEditorOnly(child))continue;
                objects.push(this.serializeEntry(child,options));
            }
            return new window.SMLevel({id:String(options.id||root.userData?.levelId||this._slug(root.name||'level')),name:String(options.name||root.name||'Level'),description:options.description||'',type:options.type||'persistent',parentId:options.parentId||null,sourceMode:'serialized',objects,sublevels:options.sublevels||[],worldSettings:options.worldSettings||{},playerStart:options.playerStart||{},streaming:options.streaming||{},tags:options.tags||root.userData?.tags||[],metadata:{sourceRootUUID:root.uuid||null,...(options.metadata||{})},dependencies:this.collectDependencies(objects)});
        }
        static serializeEntry(object,options={}){
            const data=object.userData||{};
            if(data.prefabId&&options.preservePrefabInstances!==false){
                return{kind:'prefab',prefabId:String(data.prefabId),name:String(object.name||''),runtimeType:data.runtimeType||null,tags:Array.isArray(data.tags)?[...data.tags]:[],transform:this._transform(object),overrides:this._clone(data.prefabOverrides||{}),userData:this._sanitizeUserData(data,['components','prefabOverrides']),enabled:object.visible!==false};
            }
            if(!window.SMPrefabSerializer?.serializeNode)throw new Error('SMLevelSerializer requires SMPrefabSerializer.');
            return{kind:'object',node:window.SMPrefabSerializer.serializeNode(object,{includeChildren:true,includeEditorOnly:options.includeEditorOnly===true,resourceMode:options.resourceMode,inlineResources:options.inlineResources===true})};
        }
        static async instantiateEntry(entry,context={}){
            if(!entry)return null;
            if(entry.kind==='prefab'){
                const prefab=window.SMPrefabRegistry?.get?.(entry.prefabId);
                if(!prefab){
                    console.warn(`[SMLevelSerializer] Missing prefab "${entry.prefabId}".`);
                    return null;
                }
                const object=await window.SMPrefabInstantiator.instantiate(prefab,{addToScene:false,preferTemplate:context.preferTemplate!==false,name:entry.name||undefined,position:entry.transform?.position,quaternion:entry.transform?.quaternion,scale:entry.transform?.scale,overrides:entry.overrides||{},assetResolvers:context.assetResolvers||[]});
                if(entry.userData&&typeof entry.userData==='object')Object.assign(object.userData||(object.userData={}),this._clone(entry.userData));
                if(entry.runtimeType)object.userData.runtimeType=entry.runtimeType;
                if(Array.isArray(entry.tags))object.userData.tags=[...entry.tags];
                object.visible=entry.enabled!==false;
                return object;
            }
            if(entry.kind==='object'&&entry.node){
                const transient=new window.SMPrefab({id:`level-node-${entry.node.nodeId||Math.random().toString(36).slice(2,8)}`,name:entry.node.name||'Level Object',root:entry.node});
                return await window.SMPrefabInstantiator.instantiate(transient,{addToScene:false,preferTemplate:false,assetResolvers:context.assetResolvers||[]});
            }
            return null;
        }
        static collectDependencies(entries=[]){
            const map=new Map();
            for(const entry of entries){
                if(entry.kind==='prefab'&&entry.prefabId)map.set(`prefab:${entry.prefabId}`,{type:'prefab',id:entry.prefabId});
                if(entry.kind==='object'&&entry.node&&window.SMPrefabSerializer?.collectDependencies){
                    for(const dep of window.SMPrefabSerializer.collectDependencies(entry.node)){
                        const key=dep.id||dep.path||dep.uuid||JSON.stringify(dep);
                        if(!map.has(key))map.set(key,dep);
                    }
                }
            }
            return Array.from(map.values());
        }
        static serialize(levelOrData){
            const level=levelOrData instanceof window.SMLevel?levelOrData:new window.SMLevel(levelOrData||{});
            return level.serialize();
        }
        static toJSON(levelOrData,options={}){
            const data=this.serialize(levelOrData);
            return options.pretty===false?JSON.stringify(data):JSON.stringify(data,null,2);
        }
        static fromJSON(json){
            const data=typeof json==='string'?JSON.parse(json):json;
            return new window.SMLevel(data);
        }
        static _transform(object){
            return{position:object.position?.toArray?.()||[0,0,0],quaternion:object.quaternion?.toArray?.()||[0,0,0,1],scale:object.scale?.toArray?.()||[1,1,1]};
        }
        static _sanitizeUserData(data,exclude=[]){
            const ignored=new Set(exclude);
            const output={};
            for(const[key,value]of Object.entries(data||{})){
                if(ignored.has(key)||typeof value==='function'||typeof value==='undefined')continue;
                try{output[key]=this._clone(value);}catch{}
            }
            return output;
        }
        static _isEditorOnly(object){
            const data=object.userData||{};
            if(data.editorOnly===true||data.runtimeIgnore===true||object.isHelper===true)return true;
            const name=String(object.name||'').toLowerCase();
            return name.startsWith('__editor')||name.includes('transformcontrols')||name.includes('gridhelper')||name.includes('axeshelper');
        }
        static _clone(value){
            if(value===undefined)return undefined;
            try{return structuredClone(value);}catch{}
            try{return JSON.parse(JSON.stringify(value));}catch{return value;}
        }
        static _slug(value){
            return String(value||'level').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'level';
        }
    }
    window.SMLevelSerializer=SMLevelSerializer;
    window.SMLevelSerializerClass=SMLevelSerializer;
})();