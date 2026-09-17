(function(){
    'use strict';
    class SMRuntimeFrameBridge{
        constructor(){
            this.attached=false;
            this.mode='manual';
            this.callback=null;
            this.lastTime=performance.now();
            this._retryTimers=[];
            this._boundVisibility=this._onVisibilityChange.bind(this);
            document.addEventListener('visibilitychange',this._boundVisibility);
            this._scheduleAutoAttach();
        }
        attach(){
            if(this.attached)return true;
            if(Array.isArray(window.engineFrameCallbacks)){
                this.callback=(delta,time)=>this.tick(delta,time);
                this.callback.__smRuntimeFrameBridge=true;
                const exists=window.engineFrameCallbacks.some(cb=>cb?.__smRuntimeFrameBridge===true);
                if(!exists)window.engineFrameCallbacks.push(this.callback);
                this.attached=true;
                this.mode='engineFrameCallbacks';
                this._emit('attached',{mode:this.mode});
                return true;
            }
            this.mode='manual';
            return false;
        }
        detach(){
            if(this.mode==='engineFrameCallbacks'&&Array.isArray(window.engineFrameCallbacks)){
                const index=window.engineFrameCallbacks.findIndex(cb=>cb===this.callback||cb?.__smRuntimeFrameBridge===true);
                if(index>=0)window.engineFrameCallbacks.splice(index,1);
            }
            this.attached=false;
            this.callback=null;
            this.mode='manual';
            this._emit('detached',{mode:this.mode});
            return true;
        }
        tick(delta=null,time=null){
            const runtime=window.SMRuntime;
            if(!runtime?.update)return false;
            const now=time!==null&&time!==undefined?Number(time):performance.now();
            let dt=delta!==null&&delta!==undefined?Number(delta):(now-this.lastTime)/1000;
            if(!Number.isFinite(dt))dt=0;
            dt=Math.max(0,Math.min(dt,0.1));
            this.lastTime=now;
            return runtime.update(dt,now);
        }
        isAttached(){
            return this.attached;
        }
        getMode(){
            return this.mode;
        }
        _scheduleAutoAttach(){
            const tryAttach=()=>this.attach();
            if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tryAttach,{once:true});
            queueMicrotask(tryAttach);
            for(const delay of [50,250,750,1500]){
                const timer=setTimeout(()=>{
                    if(!this.attached)tryAttach();
                },delay);
                this._retryTimers.push(timer);
            }
            window.addEventListener('sm:engine-frame-callbacks-ready',tryAttach);
            window.addEventListener('sm:runtime-ready',tryAttach);
        }
        _onVisibilityChange(){
            this.lastTime=performance.now();
        }
        _emit(name,detail){
            window.SMRuntimeEventBus?.emit?.(`frame:${name}`,{bridge:this,...detail});
            window.dispatchEvent(new CustomEvent(`sm:runtime-frame-${name}`,{detail:{bridge:this,...detail}}));
        }
        debug(){
            const state={attached:this.attached,mode:this.mode,hasEngineFrameCallbacks:Array.isArray(window.engineFrameCallbacks),callbackCount:Array.isArray(window.engineFrameCallbacks)?window.engineFrameCallbacks.length:0};
            console.log('[SMRuntimeFrameBridge]',state);
            return state;
        }
    }
    const bridge=new SMRuntimeFrameBridge();
    window.SMRuntimeFrameBridge=bridge;
    window.smRuntimeFrameBridge=bridge;
    window.SMRuntimeFrameBridgeClass=SMRuntimeFrameBridge;
})();