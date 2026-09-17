(function(){
    'use strict';class SMRuntimeManager{
        constructor(){
            this.eventBus=window.SMRuntimeEventBus||null;this.playModeController=null;this._systems=new Map();this._initialized=false;this._rafCallbacksBound=false;this._lastTick=performance.now();this._fixedAccumulator=0;this.fixedDelta=1/60;this.maxFixedSteps=5;
        }
        init(){
            if(this._initialized)return this;const missing=[];if(!window.SMRuntimeEventBus)missing.push('SMRuntimeEventBus.js');if(!window.SMRuntimeStateSnapshot)missing.push('SMRuntimeStateSnapshot.js');if(!window.SMGameSession)missing.push('SMGameSession.js');if(!window.SMPlayModeController)missing.push('SMPlayModeController.js');if(missing.length)throw new Error(`SMRuntimeManager missing dependencies: ${missing.join(', ')}`);this.eventBus=window.SMRuntimeEventBus;this.playModeController=new window.SMPlayModeController({
                eventBus:this.eventBus
            });this._initialized=true;this._bindGlobalRuntimeEvents();this.eventBus.emit('runtime:ready',{
                runtime:this
            });window.dispatchEvent(new CustomEvent('sm:runtime-ready',{
                detail:{
                    runtime:this
                }
            }));return this;
        }
        async play(options={
        }){
            this.init();const systems=Array.from(this._systems.values()).map(record=>({
                id:record.id,system:record.system,options:{
                    priority:record.priority,enabled:record.enabled
                }
            }));return await this.playModeController.play({
                ...options,systems
            });
        }
        async pause(){
            this.init();return await this.playModeController.pause();
        }
        async resume(){
            this.init();return await this.playModeController.resume();
        }
        async togglePause(){
            this.init();return await this.playModeController.togglePause();
        }
        async stop(options={
        }){
            this.init();return await this.playModeController.stop(options);
        }
        update(delta=null,time=null){
            if(!this._initialized||!this.playModeController?.isPlaying||this.playModeController.isPaused)return false;const now=time!==null?Number(time):performance.now();let dt=delta!==null?Number(delta):(now-this._lastTick)/1000;if(!Number.isFinite(dt))dt=0;dt=Math.max(0,Math.min(dt,0.1));this._lastTick=now;this.playModeController.update(dt,now);this._fixedAccumulator+=dt;let steps=0;while(this._fixedAccumulator>=this.fixedDelta&&steps<this.maxFixedSteps){
                this.playModeController.fixedUpdate(this.fixedDelta);this._fixedAccumulator-=this.fixedDelta;steps+=1;
            }
            if(steps>=this.maxFixedSteps)this._fixedAccumulator=0;return true;
        }
        registerSystem(id,system,options={
        }){
            if(!id||!system)throw new Error('SMRuntime.registerSystem(id, system) requires both values.');const key=String(id);const record={
                id:key,system,priority:Number(options.priority||0),enabled:options.enabled!==false
            };this._systems.set(key,record);if(this.playModeController?.session)this.playModeController.session.registerSystem(key,system,{
                priority:record.priority,enabled:record.enabled
            });this.eventBus?.emit?.('runtime:system-registered',{
                runtime:this,record
            });return()=>this.unregisterSystem(key);
        }
        unregisterSystem(id){
            const key=String(id);const existed=this._systems.delete(key);this.playModeController?.session?.unregisterSystem?.(key);if(existed)this.eventBus?.emit?.('runtime:system-unregistered',{
                runtime:this,id:key
            });return existed;
        }
        setSystemEnabled(id,enabled){
            const record=this._systems.get(String(id));if(!record)return false;record.enabled=Boolean(enabled);this.playModeController?.session?.setSystemEnabled?.(String(id),record.enabled);return true;
        }
        getSystem(id){
            return this._systems.get(String(id))?.system||null;
        }
        getSession(){
            return this.playModeController?.session||null;
        }
        getState(){
            return this.playModeController?.state||'editor';
        }
        isPlaying(){
            return Boolean(this.playModeController?.isPlaying);
        }
        isPaused(){
            return Boolean(this.playModeController?.isPaused);
        }
        trackRuntimeObject(object){
            return this.playModeController?.session?.trackRuntimeObject?.(object)||object;
        }
        setFixedDelta(seconds){
            const value=Number(seconds);if(Number.isFinite(value)&&value>0)this.fixedDelta=Math.max(1/240,Math.min(value,1/10));return this.fixedDelta;
        }
        attachToEngineFrameCallbacks(){
            if(this._rafCallbacksBound)return true;if(!Array.isArray(window.engineFrameCallbacks))return false;const callback=(delta,time)=>this.update(delta,time);callback.__smRuntimeCallback=true;window.engineFrameCallbacks.push(callback);this._rafCallbacksBound=true;this.eventBus?.emit?.('runtime:frame-attached',{
                runtime:this
            });return true;
        }
        detachFromEngineFrameCallbacks(){
            if(!Array.isArray(window.engineFrameCallbacks))return false;window.engineFrameCallbacks=window.engineFrameCallbacks.filter(callback=>!callback?.__smRuntimeCallback);this._rafCallbacksBound=false;return true;
        }
        _bindGlobalRuntimeEvents(){
            window.addEventListener('sm:runtime-play-request',()=>this.play().catch(error=>console.error(error)));window.addEventListener('sm:runtime-pause-request',()=>this.pause());window.addEventListener('sm:runtime-resume-request',()=>this.resume());window.addEventListener('sm:runtime-stop-request',event=>this.stop(event.detail||{
            }).catch(error=>console.error(error)));
        }
        _debugSystems(){
            return Array.from(this._systems.values()).map(record=>({
                id:record.id,priority:record.priority,enabled:record.enabled
            }));
        }
        debug(){
            const state={
                initialized:this._initialized,state:this.getState(),playing:this.isPlaying(),paused:this.isPaused(),fixedDelta:this.fixedDelta,systems:this._debugSystems(),session:this.getSession()?.getStats?.()||null
            };console.log('[SMRuntimeManager]',state);return state;
        }
    }
    const runtime=new SMRuntimeManager();window.SMRuntimeManagerClass=SMRuntimeManager;window.SMRuntime=runtime;window.smRuntime=runtime;window.SMRuntimeManager=runtime;try{
        runtime.init();
    } catch(error){
        console.warn('[SMRuntimeManager] Runtime will initialize when dependencies are available.',error.message);
    }
})();