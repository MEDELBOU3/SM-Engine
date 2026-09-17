(function(){
    'use strict';
    class SMRuntimeObjectRegistry{
        constructor(world=null){
            this.world=world;
            this.records=new Map();
            this.byUUID=new Map();
            this.byType=new Map();
            this.byTag=new Map();
            this._sequence=0;
        }
        register(object,options={}){
            if(!object||typeof object!=='object')throw new TypeError('SMRuntimeObjectRegistry.register(object) requires an object.');
            const existing=this.getRecord(object);
            if(existing){
                this.updateMetadata(object,options);
                return existing;
            }
            // Editor and runtime share the same stable entity identity. UUID
            // remains a compatibility fallback for legacy scene objects.
            const id=String(options.id||object.userData?.smEntity?.id||object.userData?.runtimeId||object.uuid||`runtime-object-${++this._sequence}`);
            const type=String(options.type||object.userData?.runtimeType||object.userData?.type||this._inferType(object)||'object').toLowerCase();
            const tags=this._normalizeTags(options.tags!==undefined?options.tags:object.userData?.tags);
            const record={id,uuid:object.uuid||null,object,type,tags:new Set(tags),name:object.name||'',runtimeOwned:options.runtimeOwned===true,spawned:options.spawned===true,enabled:options.enabled!==false&&object.userData?.smEntity?.active!==false,metadata:{...(options.metadata||{})},registeredAt:Date.now()};
            this.records.set(id,record);
            if(record.uuid)this.byUUID.set(record.uuid,id);
            this._indexType(record,type);
            for(const tag of record.tags)this._indexTag(record,tag);
            window.SMRuntimeEventBus?.emit?.('world:object-registered',{registry:this,world:this.world,record});
            return record;
        }
        unregister(objectOrId){
            const record=this.getRecord(objectOrId);
            if(!record)return false;
            this.records.delete(record.id);
            if(record.uuid)this.byUUID.delete(record.uuid);
            this._unindexType(record,record.type);
            for(const tag of record.tags)this._unindexTag(record,tag);
            window.SMRuntimeEventBus?.emit?.('world:object-unregistered',{registry:this,world:this.world,record});
            return true;
        }
        updateMetadata(objectOrId,options={}){
            const record=this.getRecord(objectOrId);
            if(!record)return null;
            if(options.type!==undefined){
                const nextType=String(options.type||'object').toLowerCase();
                if(nextType!==record.type){
                    this._unindexType(record,record.type);
                    record.type=nextType;
                    this._indexType(record,nextType);
                }
            }
            if(options.tags!==undefined)this.setTags(record.id,options.tags);
            if(options.enabled!==undefined)record.enabled=Boolean(options.enabled);
            if(options.runtimeOwned!==undefined)record.runtimeOwned=Boolean(options.runtimeOwned);
            if(options.spawned!==undefined)record.spawned=Boolean(options.spawned);
            if(options.metadata&&typeof options.metadata==='object')Object.assign(record.metadata,options.metadata);
            record.name=record.object?.name||record.name;
            return record;
        }
        getRecord(objectOrId){
            if(!objectOrId)return null;
            if(typeof objectOrId==='string'){
                if(this.records.has(objectOrId))return this.records.get(objectOrId);
                const id=this.byUUID.get(objectOrId);
                return id?this.records.get(id)||null:null;
            }
            if(objectOrId.uuid){
                const id=this.byUUID.get(objectOrId.uuid);
                if(id)return this.records.get(id)||null;
            }
            for(const record of this.records.values())if(record.object===objectOrId)return record;
            return null;
        }
        get(objectOrId){
            return this.getRecord(objectOrId)?.object||null;
        }
        getById(id){
            return this.records.get(String(id))?.object||null;
        }
        getByUUID(uuid){
            const id=this.byUUID.get(String(uuid));
            return id?this.records.get(id)?.object||null:null;
        }
        findByType(type,options={}){
            const ids=this.byType.get(String(type||'').toLowerCase())||new Set();
            const records=Array.from(ids).map(id=>this.records.get(id)).filter(Boolean);
            return options.records===true?records:records.map(record=>record.object);
        }
        findFirstByType(type){
            const ids=this.byType.get(String(type||'').toLowerCase());
            if(!ids?.size)return null;
            const id=ids.values().next().value;
            return this.records.get(id)?.object||null;
        }
        findByTag(tag,options={}){
            const ids=this.byTag.get(String(tag||'').toLowerCase())||new Set();
            const records=Array.from(ids).map(id=>this.records.get(id)).filter(Boolean);
            return options.records===true?records:records.map(record=>record.object);
        }
        findFirstByTag(tag){
            const ids=this.byTag.get(String(tag||'').toLowerCase());
            if(!ids?.size)return null;
            const id=ids.values().next().value;
            return this.records.get(id)?.object||null;
        }
        findByName(name,options={}){
            const target=String(name||'').toLowerCase();
            const exact=options.exact!==false;
            const records=Array.from(this.records.values()).filter(record=>{
                const current=String(record.object?.name||record.name||'').toLowerCase();
                return exact?current===target:current.includes(target);
            });
            return options.records===true?records:records.map(record=>record.object);
        }
        query(query={}){
            let records=Array.from(this.records.values());
            if(query.type)records=records.filter(record=>record.type===String(query.type).toLowerCase());
            if(query.tag){
                const tag=String(query.tag).toLowerCase();
                records=records.filter(record=>record.tags.has(tag));
            }
            if(Array.isArray(query.tags)&&query.tags.length){
                const tags=this._normalizeTags(query.tags);
                records=records.filter(record=>tags.every(tag=>record.tags.has(tag)));
            }
            if(query.enabled!==undefined)records=records.filter(record=>record.enabled===Boolean(query.enabled));
            if(query.runtimeOwned!==undefined)records=records.filter(record=>record.runtimeOwned===Boolean(query.runtimeOwned));
            if(typeof query.filter==='function')records=records.filter(record=>query.filter(record.object,record));
            return query.records===true?records:records.map(record=>record.object);
        }
        addTag(objectOrId,tag){
            const record=this.getRecord(objectOrId);
            if(!record)return false;
            const normalized=String(tag||'').trim().toLowerCase();
            if(!normalized||record.tags.has(normalized))return false;
            record.tags.add(normalized);
            this._indexTag(record,normalized);
            return true;
        }
        removeTag(objectOrId,tag){
            const record=this.getRecord(objectOrId);
            if(!record)return false;
            const normalized=String(tag||'').trim().toLowerCase();
            if(!record.tags.has(normalized))return false;
            record.tags.delete(normalized);
            this._unindexTag(record,normalized);
            return true;
        }
        setTags(objectOrId,tags){
            const record=this.getRecord(objectOrId);
            if(!record)return false;
            for(const tag of record.tags)this._unindexTag(record,tag);
            record.tags=new Set(this._normalizeTags(tags));
            for(const tag of record.tags)this._indexTag(record,tag);
            return true;
        }
        hasTag(objectOrId,tag){
            const record=this.getRecord(objectOrId);
            return Boolean(record?.tags.has(String(tag||'').trim().toLowerCase()));
        }
        scanScene(scene=this.world?.scene||window.scene,options={}){
            if(!scene?.traverse)return{registered:0,skipped:0};
            let registered=0;
            let skipped=0;
            const filter=typeof options.filter==='function'?options.filter:null;
            scene.traverse(object=>{
                if(object===scene)return;
                if(options.includeEditorOnly!==true&&this._isEditorOnly(object)){skipped+=1;return;}
                if(filter&&!filter(object)){skipped+=1;return;}
                if(this.getRecord(object))return;
                this.register(object,{type:object.userData?.runtimeType||object.userData?.type,tags:object.userData?.tags,runtimeOwned:false,spawned:false});
                registered+=1;
            });
            window.SMRuntimeEventBus?.emit?.('world:registry-scanned',{registry:this,world:this.world,registered,skipped});
            return{registered,skipped};
        }
        clear(options={}){
            const records=Array.from(this.records.values());
            this.records.clear();
            this.byUUID.clear();
            this.byType.clear();
            this.byTag.clear();
            if(options.emit!==false)window.SMRuntimeEventBus?.emit?.('world:registry-cleared',{registry:this,world:this.world,count:records.length});
            return records.length;
        }
        getStats(){
            const types={};
            const tags={};
            for(const[type,ids]of this.byType)types[type]=ids.size;
            for(const[tag,ids]of this.byTag)tags[tag]=ids.size;
            return{objects:this.records.size,types,tags};
        }
        _indexType(record,type){
            if(!this.byType.has(type))this.byType.set(type,new Set());
            this.byType.get(type).add(record.id);
        }
        _unindexType(record,type){
            const set=this.byType.get(type);
            if(!set)return;
            set.delete(record.id);
            if(!set.size)this.byType.delete(type);
        }
        _indexTag(record,tag){
            if(!this.byTag.has(tag))this.byTag.set(tag,new Set());
            this.byTag.get(tag).add(record.id);
        }
        _unindexTag(record,tag){
            const set=this.byTag.get(tag);
            if(!set)return;
            set.delete(record.id);
            if(!set.size)this.byTag.delete(tag);
        }
        _normalizeTags(tags){
            if(tags===undefined||tags===null)return[];
            const values=Array.isArray(tags)?tags:String(tags).split(',');
            return Array.from(new Set(values.map(tag=>String(tag).trim().toLowerCase()).filter(Boolean)));
        }
        _inferType(object){
            if(object.userData?.runtimeType)return object.userData.runtimeType;
            if(object.isCamera)return'camera';
            if(object.isLight)return'light';
            if(object.isAudio)return'audio';
            if(object.isMesh)return'mesh';
            if(object.isGroup)return'group';
            return'object';
        }
        _isEditorOnly(object){
            if(object.userData?.editorOnly===true||object.userData?.runtimeIgnore===true)return true;
            if(object.isHelper===true)return true;
            const name=String(object.name||'').toLowerCase();
            return name.startsWith('__editor')||name.includes('transformcontrols')||name.includes('gridhelper')||name.includes('axeshelper');
        }
        debug(){
            const stats=this.getStats();
            console.log('[SMRuntimeObjectRegistry]',stats);
            return stats;
        }
    }
    window.SMRuntimeObjectRegistry=SMRuntimeObjectRegistry;
    window.SMRuntimeObjectRegistryClass=SMRuntimeObjectRegistry;
})();
