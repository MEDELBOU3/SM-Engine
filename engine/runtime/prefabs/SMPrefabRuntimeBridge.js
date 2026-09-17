(function(){
    'use strict';
    class SMPrefabRuntimeBridge{
        constructor(){
            this.id='runtime-prefabs';
            this.priority=840;
            this.session=null;
            this.world=null;
            this.active=false;
            this.instances=new Map();
            this._registered=false;
            this._spawnerUnregister=null;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            if(!this.world)throw new Error('SMPrefabRuntimeBridge requires an active Runtime World.');
            this.active=true;
            this._connectSpawner();
            this._patchRuntimeAPI();
            window.SMRuntimeEventBus?.emit?.('prefabs:started',{bridge:this,world:this.world,session});
        }
        pause(){}
        resume(){}
        update(){}
        fixedUpdate(){}
        stop(session,reason='runtime-stop'){
            this._disconnectSpawner();
            this.instances.clear();
            this.active=false;
            this.world=null;
            this.session=null;
            window.SMRuntimeEventBus?.emit?.('prefabs:stopped',{bridge:this,session,reason});
        }
        createPrefabFromObject(object,options={}){
            const prefab=window.SMPrefabSerializer.fromObject(object,options);
            if(options.register!==false)window.SMPrefabRegistry.register(prefab,{override:options.override===true});
            return prefab;
        }
        registerPrefab(prefabOrData,options={}){
            return window.SMPrefabRegistry.register(prefabOrData,options);
        }
        async instantiate(prefabOrId,options={}){
            const world=this.world||window.SMRuntime?.getWorld?.()||null;
            const instance=await window.SMPrefabInstantiator.instantiate(prefabOrId,{...options,scene:options.scene||world?.scene,addToScene:options.addToScene!==false});
            const prefab=window.SMPrefabRegistry.get(prefabOrId)||(prefabOrId instanceof window.SMPrefab?prefabOrId:null);
            const instanceId=instance.userData?.prefabInstanceId||instance.uuid;
            this.instances.set(instanceId,{instance,prefabId:prefab?.id||instance.userData?.prefabId||null,createdAt:Date.now()});
            if(world){
                const rootRecord=world.registry?.getRecord?.(instance);
                if(!rootRecord)world.registerObject?.(instance,{type:options.type||instance.userData?.runtimeType||'prefab',tags:options.tags||instance.userData?.tags||[],runtimeOwned:true,spawned:true,metadata:{prefabId:prefab?.id||null,prefabInstanceId:instanceId}});
                instance.traverse?.(child=>{
                    if(child===instance)return;
                    if(!world.registry?.getRecord?.(child))world.registerObject?.(child,{type:child.userData?.runtimeType||'object',tags:child.userData?.tags||[],runtimeOwned:true,spawned:true,metadata:{prefabId:prefab?.id||null,prefabInstanceId:instanceId}});
                });
            }
            window.SMRuntime?.trackRuntimeObject?.(instance);
            window.SMRuntimeEventBus?.emit?.('prefabs:instance-created',{bridge:this,world,prefab,instance,instanceId});
            return instance;
        }
        async spawnPrefab(prefabOrId,options={}){
            if(!this.active&&!window.SMRuntime?.getWorld?.())throw new Error('spawnPrefab() requires an active Runtime World.');
            return await this.instantiate(prefabOrId,options);
        }
        destroyInstance(instanceOrId,options={}){
            let record=null;
            if(typeof instanceOrId==='string')record=this.instances.get(instanceOrId)||null;
            else{
                for(const value of this.instances.values())if(value.instance===instanceOrId){record=value;break;}
            }
            const instance=record?.instance||(typeof instanceOrId==='object'?instanceOrId:null);
            if(!instance)return false;
            const instanceId=instance.userData?.prefabInstanceId||instance.uuid;
            if(this.world?.destroy)this.world.destroy(instance,{dispose:options.dispose===true});
            else instance.parent?.remove?.(instance);
            this.instances.delete(instanceId);
            window.SMRuntimeEventBus?.emit?.('prefabs:instance-destroyed',{bridge:this,instance,instanceId});
            return true;
        }
        getInstance(id){
            return this.instances.get(String(id))?.instance||null;
        }
        getInstancesByPrefab(prefabId){
            return Array.from(this.instances.values()).filter(record=>record.prefabId===prefabId).map(record=>record.instance);
        }
        applyOverrides(instance,overrides={}){
            if(!instance)return false;
            window.SMPrefabInstantiator.applyOverrides(instance,overrides);
            const id=instance.userData?.prefabInstanceId||instance.uuid;
            const record=this.instances.get(id);
            if(record)record.overrides=structuredClone?structuredClone(overrides):JSON.parse(JSON.stringify(overrides));
            window.SMRuntimeEventBus?.emit?.('prefabs:overrides-applied',{bridge:this,instance,overrides});
            return true;
        }
        _connectSpawner(){
            if(!this.world?.spawner||this._spawnerUnregister)return;
            this._spawnerUnregister=this.world.spawner.registerResolver(async(source,context)=>{
                const prefab=window.SMPrefabRegistry.get(source);
                if(!prefab)return null;
                const instance=await window.SMPrefabInstantiator.instantiate(prefab,{...context.options,scene:this.world.scene,addToScene:false});
                return instance;
            });
        }
        _disconnectSpawner(){
            try{this._spawnerUnregister?.();}catch{}
            this._spawnerUnregister=null;
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime)return false;
            if(typeof runtime.createPrefabFromObject!=='function')runtime.createPrefabFromObject=(object,options={})=>this.createPrefabFromObject(object,options);
            if(typeof runtime.registerPrefab!=='function')runtime.registerPrefab=(prefab,options={})=>this.registerPrefab(prefab,options);
            if(typeof runtime.spawnPrefab!=='function')runtime.spawnPrefab=(prefabOrId,options={})=>this.spawnPrefab(prefabOrId,options);
            if(typeof runtime.destroyPrefabInstance!=='function')runtime.destroyPrefabInstance=(instanceOrId,options={})=>this.destroyInstance(instanceOrId,options);
            if(typeof runtime.getPrefabRegistry!=='function')runtime.getPrefabRegistry=()=>window.SMPrefabRegistry;
            return true;
        }
        _autoRegister(){
            const register=()=>{
                if(this._registered||!window.SMRuntime?.registerSystem)return false;
                window.SMRuntime.registerSystem(this.id,this,{priority:this.priority});
                this._registered=true;
                this._patchRuntimeAPI();
                return true;
            };
            if(!register())window.addEventListener('sm:runtime-ready',register,{once:true});
        }
        debug(){
            const state={registered:this._registered,active:this.active,priority:this.priority,world:this.world?.id||null,prefabs:window.SMPrefabRegistry?.prefabs?.size||0,instances:this.instances.size,spawnerConnected:!!this._spawnerUnregister};
            console.log('[SMPrefabRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMPrefabRuntimeBridge();
    window.SMPrefabRuntimeBridge=bridge;
    window.smPrefabRuntimeBridge=bridge;
    window.SMPrefabRuntimeBridgeClass=SMPrefabRuntimeBridge;
})();