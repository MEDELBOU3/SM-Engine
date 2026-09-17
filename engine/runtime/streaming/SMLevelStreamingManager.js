(function(){
    'use strict';
    class SMLevelStreamingManager{
        constructor(options={}){
            this.levelManager=options.levelManager||window.SMLevelManager||null;
            this.world=options.world||null;
            this.enabled=options.enabled!==false;
            this.updateInterval=Math.max(0.05,Number(options.updateInterval??0.25));
            this.maxLoadsPerTick=Math.max(1,Number(options.maxLoadsPerTick??2));
            this.maxUnloadsPerTick=Math.max(1,Number(options.maxUnloadsPerTick??2));
            this.distance=new window.SMDistanceStreaming({levelManager:this.levelManager,loadDistance:options.loadDistance,unloadDistance:options.unloadDistance});
            this.volumes=new Map();
            this.targets=[];
            this.pendingLoads=new Map();
            this.pendingUnloads=new Map();
            this._elapsed=0;
            this._tick=0;
            this._lastDecisions=new Map();
            this._processing=false;
        }
        setRuntimeContext(world,levelManager=null){
            this.world=world||null;
            if(levelManager)this.levelManager=levelManager;
            this.distance.setLevelManager(this.levelManager);
            return this;
        }
        addTarget(target){
            if(target&&!this.targets.includes(target))this.targets.push(target);
            this.distance.setTargets(this.targets);
            return target;
        }
        removeTarget(target){
            const index=this.targets.indexOf(target);
            if(index<0)return false;
            this.targets.splice(index,1);
            this.distance.setTargets(this.targets);
            return true;
        }
        clearTargets(){
            this.targets.length=0;
            this.distance.setTargets([]);
            return true;
        }
        addVolume(volumeOrOptions){
            const volume=volumeOrOptions instanceof window.SMLevelStreamingVolume?volumeOrOptions:new window.SMLevelStreamingVolume(volumeOrOptions||{});
            this.volumes.set(volume.id,volume);
            return volume;
        }
        removeVolume(volumeOrId){
            const id=String(volumeOrId?.id||volumeOrId||'');
            const volume=this.volumes.get(id)||null;
            if(!volume)return false;
            volume.reset();
            this.volumes.delete(id);
            return true;
        }
        getVolume(id){
            return this.volumes.get(String(id))||null;
        }
        scanSceneVolumes(scene=null){
            const root=scene||this.world?.scene||window.scene;
            if(!root?.traverse)return 0;
            let count=0;
            root.traverse(object=>{
                const data=object.userData||{};
                const config=data.streamingVolume||data.levelStreamingVolume;
                if(!config)return;
                const id=String(config.id||object.uuid);
                if(this.volumes.has(id))return;
                this.addVolume({...config,id,object});
                count+=1;
            });
            return count;
        }
        update(delta){
            if(!this.enabled)return false;
            this._elapsed+=Math.max(0,Number(delta)||0);
            if(this._elapsed<this.updateInterval)return false;
            const dt=this._elapsed;
            this._elapsed=0;
            this._tick+=1;
            this._resolveDefaultTargets();
            this._evaluateVolumes();
            this._evaluateDistance();
            this._processQueues();
            window.SMRuntimeEventBus?.emit?.('streaming:tick',{manager:this,delta:dt,tick:this._tick});
            return true;
        }
        requestLoad(levelOrId,reason='manual',priority=0){
            const level=this.levelManager?.get?.(levelOrId);
            if(!level||this.levelManager?.isLoaded?.(level))return false;
            const existing=this.pendingLoads.get(level.id);
            const request={level,reason:String(reason),priority:Number(priority||0),requestedAt:performance.now?.()||Date.now()};
            if(!existing||request.priority>existing.priority)this.pendingLoads.set(level.id,request);
            this.pendingUnloads.delete(level.id);
            return true;
        }
        requestUnload(levelOrId,reason='manual',priority=0){
            const level=this.levelManager?.get?.(levelOrId);
            if(!level||!this.levelManager?.isLoaded?.(level)||level.streaming?.alwaysLoaded===true)return false;
            const active=this.levelManager?.getActive?.();
            const persistent=this.levelManager?.getPersistent?.();
            if(level.id===active?.id||level.id===persistent?.id)return false;
            const existing=this.pendingUnloads.get(level.id);
            const request={level,reason:String(reason),priority:Number(priority||0),requestedAt:performance.now?.()||Date.now()};
            if(!existing||request.priority>existing.priority)this.pendingUnloads.set(level.id,request);
            this.pendingLoads.delete(level.id);
            return true;
        }
        async loadNow(levelOrId,options={}){
            const level=this.levelManager?.get?.(levelOrId);
            if(!level)return null;
            if(this.levelManager.isLoaded(level))return this.levelManager.getLoaded(level);
            const parent=level.parentId?this.levelManager.get(level.parentId):null;
            const record=parent?await this.levelManager.loadSublevel(parent,level,{...options,active:false}):await this.levelManager.load(level,{...options,active:false});
            window.SMRuntimeEventBus?.emit?.('streaming:level-loaded',{manager:this,level,record,reason:options.reason||'manual'});
            return record;
        }
        async unloadNow(levelOrId,options={}){
            const level=this.levelManager?.get?.(levelOrId);
            if(!level||!this.levelManager.isLoaded(level))return false;
            const result=level.type==='sublevel'?await this.levelManager.unloadSublevel(level,{...options,allowActive:false}):await this.levelManager.unload(level,{...options,allowActive:false});
            if(result)window.SMRuntimeEventBus?.emit?.('streaming:level-unloaded',{manager:this,level,reason:options.reason||'manual'});
            return result;
        }
        async loadAlwaysLoaded(){
            const levels=this.levelManager?.registry?.list?.({type:'sublevel'})||[];
            for(const level of levels)if(level.streaming?.alwaysLoaded===true)this.requestLoad(level,'always-loaded',1000+Number(level.streaming.priority||0));
            await this._processQueues(true);
            return true;
        }
        reset(){
            this.pendingLoads.clear();
            this.pendingUnloads.clear();
            this._lastDecisions.clear();
            this._elapsed=0;
            this._tick=0;
            for(const volume of this.volumes.values())volume.reset();
            return this;
        }
        _resolveDefaultTargets(){
            if(this.targets.length)return;
            const localPlayer=window.SMRuntime?.getLocalPlayer?.();
            const pawnObject=localPlayer?.pawn?.object||null;
            if(pawnObject)this.addTarget(pawnObject);
            else if(window.camera)this.addTarget(window.camera);
        }
        _evaluateVolumes(){
            if(!this.targets.length)return;
            const sorted=Array.from(this.volumes.values()).filter(volume=>volume.enabled).sort((a,b)=>b.priority-a.priority);
            for(const volume of sorted){
                for(const target of this.targets){
                    if(!volume.matchesTarget(target))continue;
                    const result=volume.evaluate(target);
                    if(result.entered){
                        for(const levelId of volume.levelIds)this.requestLoad(levelId,`volume-enter:${volume.id}`,500+volume.priority);
                        window.SMRuntimeEventBus?.emit?.('streaming:volume-enter',{manager:this,volume,target});
                    }
                    if(result.exited&&volume.unloadOnExit){
                        for(const levelId of volume.levelIds){
                            if(!this._isLevelRequiredByAnyVolume(levelId,target,volume.id))this.requestUnload(levelId,`volume-exit:${volume.id}`,400+volume.priority);
                        }
                        window.SMRuntimeEventBus?.emit?.('streaming:volume-exit',{manager:this,volume,target});
                    }
                }
            }
        }
        _evaluateDistance(){
            const levels=this.levelManager?.registry?.list?.({type:'sublevel'})||[];
            for(const level of levels){
                const config=level.streaming||{};
                if(config.enabled!==true)continue;
                if(config.alwaysLoaded===true){
                    this.requestLoad(level,'always-loaded',1000+Number(config.priority||0));
                    continue;
                }
                if(String(config.mode||'manual')!=='distance')continue;
                const result=this.distance.evaluate(level);
                this._lastDecisions.set(level.id,result);
                if(result.shouldLoad)this.requestLoad(level,'distance-load',Number(config.priority||0));
                else if(result.shouldUnload&&!this._isLevelRequiredByAnyVolume(level.id))this.requestUnload(level,'distance-unload',Number(config.priority||0));
            }
        }
        _isLevelRequiredByAnyVolume(levelId,target=null,excludeVolumeId=null){
            for(const volume of this.volumes.values()){
                if(volume.id===excludeVolumeId||!volume.enabled||!volume.levelIds.includes(String(levelId)))continue;
                const targets=target?[target]:this.targets;
                for(const item of targets)if(volume.matchesTarget(item)&&volume.contains(item))return true;
            }
            return false;
        }
        async _processQueues(forceAll=false){
            if(this._processing)return false;
            this._processing=true;
            try{
                const loads=Array.from(this.pendingLoads.values()).sort((a,b)=>b.priority-a.priority||a.requestedAt-b.requestedAt);
                const unloads=Array.from(this.pendingUnloads.values()).sort((a,b)=>b.priority-a.priority||a.requestedAt-b.requestedAt);
                const loadLimit=forceAll?loads.length:this.maxLoadsPerTick;
                const unloadLimit=forceAll?unloads.length:this.maxUnloadsPerTick;
                for(const request of loads.slice(0,loadLimit)){
                    this.pendingLoads.delete(request.level.id);
                    if(this.levelManager.isLoaded(request.level))continue;
                    try{await this.loadNow(request.level,{reason:request.reason});}catch(error){console.error(`[SMLevelStreamingManager] Failed to stream in "${request.level.id}".`,error);}
                }
                for(const request of unloads.slice(0,unloadLimit)){
                    this.pendingUnloads.delete(request.level.id);
                    if(!this.levelManager.isLoaded(request.level))continue;
                    if(this._isLevelRequiredByAnyVolume(request.level.id))continue;
                    try{await this.unloadNow(request.level,{reason:request.reason});}catch(error){console.error(`[SMLevelStreamingManager] Failed to stream out "${request.level.id}".`,error);}
                }
                return true;
            }finally{
                this._processing=false;
            }
        }
        debug(){
            const state={enabled:this.enabled,tick:this._tick,updateInterval:this.updateInterval,targets:this.targets.map(target=>target?.name||target?.id||target?.uuid||'target'),volumes:this.volumes.size,pendingLoads:Array.from(this.pendingLoads.keys()),pendingUnloads:Array.from(this.pendingUnloads.keys()),loadedLevels:this.levelManager?.listLoaded?.().map(record=>record.level.id)||[],distance:this.distance.debug?.()};
            console.log('[SMLevelStreamingManager]',state);
            return state;
        }
    }
    const manager=new SMLevelStreamingManager();
    window.SMLevelStreamingManagerClass=SMLevelStreamingManager;
    window.SMLevelStreamingManager=manager;
    window.smLevelStreamingManager=manager;
})();