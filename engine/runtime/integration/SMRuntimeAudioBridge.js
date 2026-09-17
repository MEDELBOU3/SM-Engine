(function(){
    'use strict';
    class SMRuntimeAudioBridge{
        constructor(){
            this.id='runtime-audio';
            this.priority=700;
            this.session=null;
            this.active=false;
            this.paused=false;
            this.adapter=null;
            this.runtimeSources=new Set();
            this._registered=false;
            this._autoRegister();
        }
        setAdapter(adapter){
            if(adapter!==null&&typeof adapter!=='object')throw new TypeError('SMRuntimeAudioBridge.setAdapter(adapter) expects an object or null.');
            this.adapter=adapter;
            return this;
        }
        getBackend(){
            if(this.adapter)return this.adapter;
            const candidates=[
                window.smAudioSceneRuntime,
                window.SMAudioSceneRuntime,
                window.smAudioSystem,
                window.SMAudioSystem,
                window.audioSystem,
                window.audioManager
            ];
            return candidates.find(candidate=>candidate&&typeof candidate==='object')||null;
        }
        start(session){
            this.session=session;
            this.active=true;
            this.paused=false;
            const backend=this.getBackend();
            this._resumeAudioContext(backend);
            this._callFirst(backend,['onRuntimeStart','startRuntime','startScene','start','play'],session);
            window.SMRuntimeEventBus?.emit?.('audio:started',{bridge:this,session,backend});
            window.dispatchEvent(new CustomEvent('sm:runtime-audio-started',{detail:{bridge:this,session,backend}}));
        }
        pause(session){
            if(!this.active)return;
            this.paused=true;
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimePause','pauseRuntime','pauseScene','pause'],session);
            for(const record of this.runtimeSources){
                if(record.pauseOnRuntimePause!==false)this._callFirst(record.source,['pause','suspend']);
            }
            window.SMRuntimeEventBus?.emit?.('audio:paused',{bridge:this,session,backend});
        }
        resume(session){
            if(!this.active)return;
            this.paused=false;
            const backend=this.getBackend();
            this._resumeAudioContext(backend);
            this._callFirst(backend,['onRuntimeResume','resumeRuntime','resumeScene','resume'],session);
            for(const record of this.runtimeSources){
                if(record.resumeOnRuntimeResume!==false)this._callFirst(record.source,['resume','play']);
            }
            window.SMRuntimeEventBus?.emit?.('audio:resumed',{bridge:this,session,backend});
        }
        update(delta,time,session){
            if(!this.active||this.paused)return;
            const backend=this.getBackend();
            if(typeof this.adapter?.update==='function')this.adapter.update(delta,time,session);
            else if(this.adapter&&this.adapter.driveUpdate===true&&typeof backend?.update==='function')backend.update(delta,time,session);
        }
        stop(session,reason='user'){
            const backend=this.getBackend();
            for(const record of Array.from(this.runtimeSources)){
                if(record.stopOnRuntimeStop!==false)this._callFirst(record.source,['stop','disconnect']);
                if(record.disposeOnRuntimeStop===true)this._callFirst(record.source,['dispose','destroy']);
            }
            this.runtimeSources.clear();
            this._callFirst(backend,['onRuntimeStop','stopRuntime','stopScene','stop'],session,reason);
            this.active=false;
            this.paused=false;
            this.session=null;
            window.SMRuntimeEventBus?.emit?.('audio:stopped',{bridge:this,session,backend,reason});
            window.dispatchEvent(new CustomEvent('sm:runtime-audio-stopped',{detail:{bridge:this,session,backend,reason}}));
        }
        registerRuntimeSource(source,options={}){
            if(!source)return source;
            this.runtimeSources.add({source,stopOnRuntimeStop:options.stopOnRuntimeStop!==false,pauseOnRuntimePause:options.pauseOnRuntimePause!==false,resumeOnRuntimeResume:options.resumeOnRuntimeResume!==false,disposeOnRuntimeStop:options.disposeOnRuntimeStop===true});
            return source;
        }
        unregisterRuntimeSource(source){
            for(const record of Array.from(this.runtimeSources)){
                if(record.source===source){
                    this.runtimeSources.delete(record);
                    return true;
                }
            }
            return false;
        }
        _resumeAudioContext(backend){
            const contexts=[
                backend?.context,
                backend?.audioContext,
                window.THREE?.AudioContext?.getContext?.()
            ].filter(Boolean);
            for(const context of contexts){
                if(context.state==='suspended')context.resume?.().catch?.(()=>{});
            }
        }
        _callFirst(target,names,...args){
            if(!target)return false;
            for(const name of names){
                if(typeof target[name]==='function'){
                    try{
                        target[name](...args);
                        return true;
                    }catch(error){
                        console.warn(`[SMRuntimeAudioBridge] ${name}() failed.`,error);
                        return false;
                    }
                }
            }
            return false;
        }
        _autoRegister(){
            const register=()=>{
                if(this._registered||!window.SMRuntime?.registerSystem)return false;
                window.SMRuntime.registerSystem(this.id,this,{priority:this.priority});
                this._registered=true;
                return true;
            };
            if(!register())window.addEventListener('sm:runtime-ready',register,{once:true});
        }
        debug(){
            const backend=this.getBackend();
            const state={registered:this._registered,active:this.active,paused:this.paused,backend:backend?.constructor?.name||typeof backend,runtimeSources:this.runtimeSources.size};
            console.log('[SMRuntimeAudioBridge]',state);
            return state;
        }
    }
    const bridge=new SMRuntimeAudioBridge();
    window.SMRuntimeAudioBridge=bridge;
    window.smRuntimeAudioBridge=bridge;
    window.SMRuntimeAudioBridgeClass=SMRuntimeAudioBridge;
})();