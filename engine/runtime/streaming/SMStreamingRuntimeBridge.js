(function(){
    'use strict';
    class SMStreamingRuntimeBridge{
        constructor(){
            this.id='runtime-streaming';
            this.priority=925;
            this.session=null;
            this.world=null;
            this.levelManager=null;
            this.manager=window.SMLevelStreamingManager||null;
            this.active=false;
            this.paused=false;
            this.ready=Promise.resolve(null);
            this._registered=false;
            this._runtimePatched=false;
            this._targetCheckFrame=0;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            this.levelManager=session?.getData?.('levelManager')||window.SMLevelManager||null;
            if(!this.world||!this.levelManager)throw new Error('SMStreamingRuntimeBridge requires Runtime World and Level Manager.');
            this.manager=window.SMLevelStreamingManager;
            this.manager.setRuntimeContext(this.world,this.levelManager);
            this.manager.reset();
            const settings=this.world?.settings?.state||this.world?.settings||{};
            this.manager.enabled=settings.streamingEnabled!==false;
            this.manager.updateInterval=Math.max(0.05,Number(settings.streamingUpdateInterval??0.25));
            this.manager.maxLoadsPerTick=Math.max(1,Number(settings.streamingMaxLoadsPerTick??2));
            this.manager.maxUnloadsPerTick=Math.max(1,Number(settings.streamingMaxUnloadsPerTick??2));
            this.manager.distance.defaultLoadDistance=Math.max(0,Number(settings.streamingLoadDistance??250));
            this.manager.distance.defaultUnloadDistance=Math.max(this.manager.distance.defaultLoadDistance,Number(settings.streamingUnloadDistance??300));
            this.manager.scanSceneVolumes(this.world.scene);
            this._registerLevelVolumes();
            this.active=true;
            this.paused=false;
            const levelReady=session?.getData?.('levelReady')||window.SMRuntime?.whenLevelReady?.()||Promise.resolve(null);
            this.ready=Promise.resolve(levelReady).then(async()=>{
                if(!this.active)return null;
                this._resolvePlayerTarget();
                await this.manager.loadAlwaysLoaded();
                window.SMRuntimeEventBus?.emit?.('streaming:ready',{bridge:this,manager:this.manager,world:this.world});
                return this.manager;
            });
            session?.setData?.('streamingManager',this.manager);
            session?.setData?.('streamingReady',this.ready);
            return this.ready;
        }
        update(delta){
            if(!this.active||this.paused)return;
            this._targetCheckFrame+=1;
            if(this._targetCheckFrame===1||this._targetCheckFrame%15===0)this._resolvePlayerTarget();
            this.manager?.update?.(delta);
        }
        fixedUpdate(){}
        pause(){
            this.paused=true;
        }
        resume(){
            this.paused=false;
        }
        stop(session,reason='runtime-stop'){
            this.manager?.reset?.();
            this.manager?.clearTargets?.();
            session?.deleteData?.('streamingManager');
            session?.deleteData?.('streamingReady');
            this.active=false;
            this.paused=false;
            this.world=null;
            this.levelManager=null;
            this.session=null;
            this.ready=Promise.resolve(null);
            this._targetCheckFrame=0;
            window.SMRuntimeEventBus?.emit?.('streaming:stopped',{bridge:this,reason});
        }
        whenReady(){
            return this.ready;
        }
        addVolume(options){
            return this.manager?.addVolume?.(options)||null;
        }
        removeVolume(volumeOrId){
            return this.manager?.removeVolume?.(volumeOrId)||false;
        }
        addTarget(target){
            return this.manager?.addTarget?.(target)||null;
        }
        async loadLevel(levelOrId,options={}){
            return await this.manager.loadNow(levelOrId,options);
        }
        async unloadLevel(levelOrId,options={}){
            return await this.manager.unloadNow(levelOrId,options);
        }
        _resolvePlayerTarget(){
            const player=window.SMRuntime?.getLocalPlayer?.();
            const pawn=player?.pawn?.object||null;
            if(pawn){
                if(this.manager.targets.length!==1||this.manager.targets[0]!==pawn){
                    this.manager.clearTargets();
                    this.manager.addTarget(pawn);
                }
                return pawn;
            }
            const fallback=window.camera||this.world?.player||null;
            if(fallback&&!this.manager.targets.length)this.manager.addTarget(fallback);
            return fallback;
        }
        _registerLevelVolumes(){
            const levels=this.levelManager?.registry?.list?.()||[];
            for(const level of levels){
                const configs=level.metadata?.streamingVolumes||level.streaming?.volumes||[];
                if(!Array.isArray(configs))continue;
                for(const config of configs){
                    const levelIds=Array.isArray(config.levelIds)?config.levelIds.map(String):config.levelId?[String(config.levelId)]:[level.id];
                    const volume=this.manager.addVolume({...config,levelIds});
                    if(!volume.levelIds.length)volume.addLevel(level.id);
                }
            }
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getStreamingManager!=='function')runtime.getStreamingManager=()=>window.SMLevelStreamingManager;
            if(typeof runtime.whenStreamingReady!=='function')runtime.whenStreamingReady=()=>this.whenReady();
            if(typeof runtime.addStreamingVolume!=='function')runtime.addStreamingVolume=options=>this.addVolume(options);
            if(typeof runtime.removeStreamingVolume!=='function')runtime.removeStreamingVolume=volume=>this.removeVolume(volume);
            if(typeof runtime.addStreamingTarget!=='function')runtime.addStreamingTarget=target=>this.addTarget(target);
            if(typeof runtime.streamLevelIn!=='function')runtime.streamLevelIn=(level,options={})=>this.loadLevel(level,options);
            if(typeof runtime.streamLevelOut!=='function')runtime.streamLevelOut=(level,options={})=>this.unloadLevel(level,options);
            this._runtimePatched=true;
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
            const state={registered:this._registered,active:this.active,paused:this.paused,priority:this.priority,world:this.world?.id||null,manager:this.manager?.debug?.()};
            console.log('[SMStreamingRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMStreamingRuntimeBridge();
    window.SMStreamingRuntimeBridge=bridge;
    window.smStreamingRuntimeBridge=bridge;
    window.SMStreamingRuntimeBridgeClass=SMStreamingRuntimeBridge;
})();