(function(){
    'use strict';
    class SMAnimationRuntimeBridge{
        constructor(){
            this.id='runtime-animation';
            this.priority=780;
            this.runtime=window.SMAnimationRuntime||null;
            this.session=null;
            this.world=null;
            this.active=false;
            this._registered=false;
            this._runtimePatched=false;
            this._scanFrame=0;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            this.runtime=window.SMAnimationRuntime;
            this.runtime.start();
            this.active=true;
            this._scanComponents();
            session?.setData?.('animationRuntime',this.runtime);
            window.SMRuntimeEventBus?.emit?.('animation:runtime-started',{bridge:this,runtime:this.runtime,session});
        }
        update(delta){
            if(!this.active)return;
            this._scanFrame+=1;
            if(this._scanFrame===1||this._scanFrame%30===0)this._scanComponents();
            this.runtime.update(delta);
        }
        fixedUpdate(){}
        pause(){
            this.runtime?.pause?.();
        }
        resume(){
            this.runtime?.resume?.();
        }
        stop(session,reason='runtime-stop'){
            this.runtime?.stop?.();
            session?.deleteData?.('animationRuntime');
            this.active=false;
            this.world=null;
            this.session=null;
            this._scanFrame=0;
            window.SMRuntimeEventBus?.emit?.('animation:runtime-stopped',{bridge:this,session,reason});
        }
        register(animator){
            return this.runtime?.register?.(animator);
        }
        unregister(animator){
            return this.runtime?.unregister?.(animator);
        }
        _scanComponents(){
            const containers=window.SMComponentRuntimeBridge?.containers;
            if(!containers?.values)return 0;
            let count=0;
            for(const container of containers.values()){
                const animators=container.getAll?.('Animator')||[];
                for(const animator of animators){
                    this.runtime.register(animator);
                    animator.managedByRuntime=true;
                    count+=1;
                }
            }
            return count;
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getAnimationRuntime!=='function')runtime.getAnimationRuntime=()=>window.SMAnimationRuntime;
            if(typeof runtime.getAnimator!=='function')runtime.getAnimator=owner=>window.SMAnimationRuntime?.getByOwner?.(owner)||owner?.getComponent?.('Animator')||null;
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
            const state={registered:this._registered,active:this.active,priority:this.priority,runtime:this.runtime?.debug?.()};
            console.log('[SMAnimationRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMAnimationRuntimeBridge();
    window.SMAnimationRuntimeBridge=bridge;
    window.smAnimationRuntimeBridge=bridge;
    window.SMAnimationRuntimeBridgeClass=SMAnimationRuntimeBridge;
})();