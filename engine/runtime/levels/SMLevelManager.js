(function(){
    'use strict';
    class SMLevelManager{
        constructor(options={}){
            this.registry=options.registry||window.SMLevelRegistry||null;
            this.world=null;
            this.session=null;
            this.loadedLevels=new Map();
            this.assetResolvers=[];
            this._transition=Promise.resolve();
        }
        setRuntimeContext(world,session=null){
            this.world=world||null;
            this.session=session||world?.session||null;
            return this;
        }
        clearRuntimeContext(){
            this.world=null;
            this.session=null;
            return this;
        }
        registerAssetResolver(resolver){
            if(typeof resolver!=='function')throw new TypeError('registerAssetResolver(resolver) expects a function.');
            this.assetResolvers.push(resolver);
            return()=>{
                const index=this.assetResolvers.indexOf(resolver);
                if(index>=0)this.assetResolvers.splice(index,1);
            };
        }
        createFromScene(scene,options={}){
            const level=window.SMLevelSerializer.fromScene(scene,options);
            if(options.register!==false)this.registry.register(level,{override:options.override===true,active:options.active===true,persistent:options.persistent!==false&&level.type==='persistent'});
            if(options.active===true)this.registry.setActive(level);
            return level;
        }
        register(levelOrData,options={}){
            return this.registry.register(levelOrData,options);
        }
        get(levelOrId){
            return this.registry.get(levelOrId);
        }
        getActive(){
            return this.registry.getActive();
        }
        getPersistent(){
            return this.registry.getPersistent();
        }
        isLoaded(levelOrId){
            const level=this.registry.get(levelOrId);
            return Boolean(level&&this.loadedLevels.has(level.id));
        }
        getLoaded(levelOrId){
            const level=this.registry.get(levelOrId);
            return level?this.loadedLevels.get(level.id)||null:null;
        }
        listLoaded(){
            return Array.from(this.loadedLevels.values());
        }
        bindEditorLevel(levelOrId,options={}){
            const level=this.registry.get(levelOrId);
            if(!level)throw new Error(`Unknown level "${levelOrId}".`);
            const world=options.world||this.world||window.SMRuntime?.getWorld?.();
            if(!world?.scene)throw new Error('bindEditorLevel() requires an active Runtime World scene.');
            if(this.loadedLevels.has(level.id))return this.loadedLevels.get(level.id);
            level.state='loading';
            const objects=[];
            for(const child of world.scene.children||[]){
                if(this._isEditorOnly(child))continue;
                objects.push(child);
                this._registerTree(child,level,{runtimeOwned:false,spawned:false});
            }
            const record={level,root:world.scene,objects,mode:'editor-bound',loadedAt:performance.now(),parentId:level.parentId||null};
            this.loadedLevels.set(level.id,record);
            level.runtimeRoot=world.scene;
            level.state='loaded';
            if(level.type==='persistent'&&!this.registry.persistentLevelId)this.registry.persistentLevelId=level.id;
            if(options.active!==false)this._activateRecord(record,{applyWorldSettings:options.applyWorldSettings!==false});
            this._emit('level:loaded',{manager:this,world,level,record});
            return record;
        }
        load(levelOrId,options={}){
            return this._enqueue(()=>this._loadNow(levelOrId,options));
        }
        unload(levelOrId,options={}){
            return this._enqueue(()=>this._unloadNow(levelOrId,options));
        }
        setActive(levelOrId,options={}){
            return this._enqueue(()=>this._setActiveNow(levelOrId,options));
        }
        loadSublevel(parentOrId,sublevelOrId,options={}){
            return this._enqueue(async()=>{
                const parent=this.registry.get(parentOrId);
                const sublevel=this.registry.get(sublevelOrId);
                if(!parent)throw new Error(`Unknown parent level "${parentOrId}".`);
                if(!sublevel)throw new Error(`Unknown sublevel "${sublevelOrId}".`);
                if(sublevel.type!=='sublevel')sublevel.setType('sublevel');
                sublevel.parentId=parent.id;
                if(!parent.hasSublevel(sublevel.id))parent.addSublevel(sublevel.id);
                const parentRecord=this.loadedLevels.get(parent.id);
                return await this._loadNow(sublevel,{...options,parentRoot:parentRecord?.root?.isScene?null:parentRecord?.root||options.parentRoot,active:false});
            });
        }
        unloadSublevel(sublevelOrId,options={}){
            return this.unload(sublevelOrId,options);
        }
        async unloadAll(options={}){
            const records=Array.from(this.loadedLevels.values()).sort((a,b)=>{
                if(a.level.type!==b.level.type)return a.level.type==='sublevel'?-1:1;
                return 0;
            });
            for(const record of records)await this._unloadNow(record.level,{...options,allowActive:true});
            return true;
        }
        resolvePlayerStart(levelOrId=null){
            const level=levelOrId?this.registry.get(levelOrId):this.registry.getActive();
            const record=level?this.loadedLevels.get(level.id):null;
            const config=level?.playerStart||{};
            const root=record?.root;
            let found=null;
            const match=object=>{
                if(!object||found)return;
                const data=object.userData||{};
                const tags=Array.isArray(data.tags)?data.tags.map(tag=>String(tag).toLowerCase()):[];
                if(config.nodeId&&data.prefabNodeId===config.nodeId){found=object;return;}
                if(config.name&&object.name===config.name){found=object;return;}
                if(config.tag&&tags.includes(String(config.tag).toLowerCase())){found=object;return;}
                if(config.type&&String(data.runtimeType||data.type||'').toLowerCase()===String(config.type).toLowerCase()){found=object;return;}
            };
            if(root?.traverse)root.traverse(match);
            if(!found&&record?.mode==='editor-bound'){
                for(const object of record.objects){
                    object.traverse?.(match);
                    if(found)break;
                }
            }
            if(!found&&this.world?.findPlayerStart)found=this.world.findPlayerStart();
            if(found&&this.world)this.world.playerStart=found;
            return found;
        }
        applyWorldSettings(levelOrId=null){
            const level=levelOrId?this.registry.get(levelOrId):this.registry.getActive();
            if(!level||!this.world?.settings)return false;
            this.world.settings.merge(level.worldSettings||{});
            this.world.playerStart=this.resolvePlayerStart(level);
            this._emit('level:world-settings-applied',{manager:this,world:this.world,level,settings:this.world.settings});
            return true;
        }
        async _loadNow(levelOrId,options={}){
            const level=this.registry.get(levelOrId);
            if(!level)throw new Error(`Unknown level "${levelOrId}".`);
            if(this.loadedLevels.has(level.id)){
                const existing=this.loadedLevels.get(level.id);
                if(options.active===true)await this._setActiveNow(level,{load:false,applyWorldSettings:options.applyWorldSettings!==false});
                return existing;
            }
            const world=options.world||this.world||window.SMRuntime?.getWorld?.();
            if(!world?.scene)throw new Error(`Cannot load level "${level.id}" without an active Runtime World.`);
            if(level.sourceMode==='editor-bound'&&level.templateScene===world.scene&&options.forceInstantiate!==true)return this.bindEditorLevel(level,{world,active:options.active!==false,applyWorldSettings:options.applyWorldSettings!==false});
            level.state='loading';
            this._emit('level:loading',{manager:this,world,level});
            const root=new THREE.Group();
            root.name=`SM_Level_${level.name}`;
            root.userData={...(root.userData||{}),runtimeType:'level-root',levelId:level.id,levelType:level.type,runtimeOwned:true};
            const parent=options.parentRoot?.add?options.parentRoot:world.scene;
            parent.add(root);
            const objects=[];
            try{
                for(const entry of level.objects){
                    const object=await window.SMLevelSerializer.instantiateEntry(entry,{assetResolvers:[...this.assetResolvers,...(options.assetResolvers||[])],preferTemplate:options.preferTemplate!==false});
                    if(!object)continue;
                    root.add(object);
                    objects.push(object);
                    this._registerTree(object,level,{runtimeOwned:true,spawned:true});
                }
            }catch(error){
                root.parent?.remove?.(root);
                level.state='error';
                this._emit('level:error',{manager:this,world,level,error});
                throw error;
            }
            const record={level,root,objects,mode:'instantiated',loadedAt:performance.now(),parentId:level.parentId||null};
            this.loadedLevels.set(level.id,record);
            level.runtimeRoot=root;
            level.state='loaded';
            world.registerObject?.(root,{type:'level-root',tags:['level-root',level.type],runtimeOwned:true,spawned:true,metadata:{levelId:level.id,levelType:level.type}});
            if(level.type==='persistent'&&!this.registry.persistentLevelId)this.registry.persistentLevelId=level.id;
            if(options.active===true||(!this.registry.activeLevelId&&level.type==='persistent'))await this._setActiveNow(level,{load:false,applyWorldSettings:options.applyWorldSettings!==false});
            this._emit('level:loaded',{manager:this,world,level,record});
            return record;
        }
        async _unloadNow(levelOrId,options={}){
            const level=this.registry.get(levelOrId);
            if(!level)return false;
            const record=this.loadedLevels.get(level.id);
            if(!record)return false;
            if(this.registry.activeLevelId===level.id&&options.allowActive!==true){
                const persistent=this.registry.getPersistent();
                if(persistent&&persistent.id!==level.id&&this.loadedLevels.has(persistent.id))await this._setActiveNow(persistent,{load:false});
                else this.registry.activeLevelId=null;
            }
            level.state='unloading';
            this._emit('level:unloading',{manager:this,world:this.world,level,record});
            if(record.mode==='instantiated'){
                for(const object of record.objects)this._unregisterTree(object);
                this._unregisterTree(record.root);
                record.root?.parent?.remove?.(record.root);
                if(options.dispose===true)this._disposeTree(record.root);
            }else{
                for(const object of record.objects)this._clearLevelMetadata(object,level.id);
            }
            this.loadedLevels.delete(level.id);
            level.runtimeRoot=null;
            level.state='unloaded';
            this._emit('level:unloaded',{manager:this,world:this.world,level,record});
            return true;
        }
        async _setActiveNow(levelOrId,options={}){
            const level=this.registry.get(levelOrId);
            if(!level)throw new Error(`Unknown level "${levelOrId}".`);
            if(options.load!==false&&!this.loadedLevels.has(level.id))await this._loadNow(level,{...options,active:false});
            const record=this.loadedLevels.get(level.id);
            if(!record&&options.load===false)throw new Error(`Level "${level.id}" is not loaded.`);
            return this._activateRecord(record,{applyWorldSettings:options.applyWorldSettings!==false});
        }
        _activateRecord(record,options={}){
            if(!record)return null;
            const level=record.level;
            const previous=this.registry.getActive();
            this.registry.setActive(level);
            if(options.applyWorldSettings!==false)this.applyWorldSettings(level);
            this._emit('level:activated',{manager:this,world:this.world,level,record,previous});
            window.dispatchEvent(new CustomEvent('sm:level-activated',{detail:{manager:this,world:this.world,level,record,previous}}));
            return level;
        }
        _registerTree(object,level,options={}){
            if(!object||!this.world?.registry)return;
            object.traverse?.(child=>{
                if(this._isEditorOnly(child))return;
                child.userData=child.userData||{};
                child.userData.levelId=child.userData.levelId||level.id;
                const existing=this.world.registry.getRecord(child);
                if(existing)this.world.registry.updateMetadata(child,{metadata:{levelId:level.id,levelType:level.type}});
                else this.world.registerObject(child,{type:child.userData.runtimeType||child.userData.type||undefined,tags:child.userData.tags||[],runtimeOwned:options.runtimeOwned===true,spawned:options.spawned===true,metadata:{levelId:level.id,levelType:level.type}});
            });
        }
        _unregisterTree(object){
            if(!object||!this.world?.registry)return;
            const nodes=[];
            object.traverse?.(child=>nodes.push(child));
            for(const child of nodes.reverse())this.world.unregisterObject?.(child);
        }
        _clearLevelMetadata(object,levelId){
            object?.traverse?.(child=>{
                if(child.userData?.levelId===levelId)delete child.userData.levelId;
                const record=this.world?.registry?.getRecord?.(child);
                if(record?.metadata?.levelId===levelId)delete record.metadata.levelId;
            });
        }
        _disposeTree(root){
            root?.traverse?.(child=>{
                child.geometry?.dispose?.();
                const materials=Array.isArray(child.material)?child.material:child.material?[child.material]:[];
                for(const material of materials)material?.dispose?.();
            });
        }
        _isEditorOnly(object){
            const data=object?.userData||{};
            if(data.editorOnly===true||data.runtimeIgnore===true||object?.isHelper===true)return true;
            const name=String(object?.name||'').toLowerCase();
            return name.startsWith('__editor')||name.includes('transformcontrols')||name.includes('gridhelper')||name.includes('axeshelper');
        }
        _emit(event,payload){
            window.SMRuntimeEventBus?.emit?.(event,payload);
        }
        _enqueue(task){
            const run=this._transition.then(task,task);
            this._transition=run.catch(()=>{});
            return run;
        }
        debug(){
            const state={registered:this.registry?.levels?.size||0,loaded:this.loadedLevels.size,activeLevelId:this.registry?.activeLevelId||null,persistentLevelId:this.registry?.persistentLevelId||null,world:this.world?.id||null,assetResolvers:this.assetResolvers.length,loadedLevels:Array.from(this.loadedLevels.keys())};
            console.log('[SMLevelManager]',state);
            return state;
        }
    }
    const manager=new SMLevelManager();
    window.SMLevelManagerClass=SMLevelManager;
    window.SMLevelManager=manager;
    window.smLevelManager=manager;
})();