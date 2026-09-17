(function(){
    'use strict';
    class SMInputRuntimeBridge{
        constructor(){
            this.id='runtime-input';
            this.priority=915;
            this.manager=window.SMInputManager||null;
            this.session=null;
            this.world=null;
            this.active=false;
            this._registered=false;
            this._runtimePatched=false;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            this.manager=window.SMInputManager;
            const settings=this.world?.settings?.state||this.world?.settings||{};
            this.manager.start({createDefaultContext:settings.createDefaultInputContext!==false,gamepadIndex:settings.gamepadIndex??0});
            this.active=true;
            session?.setData?.('inputManager',this.manager);
            window.SMRuntimeEventBus?.emit?.('input:runtime-started',{bridge:this,manager:this.manager,session});
        }
        update(dt){
            if(this.active)this.manager?.update?.(dt);
        }
        fixedUpdate(){}
        pause(){
            this.manager?.setContextEnabled?.('Gameplay',false);
        }
        resume(){
            this.manager?.setContextEnabled?.('Gameplay',true);
        }
        stop(session,reason='runtime-stop'){
            this.manager?.stop?.();
            session?.deleteData?.('inputManager');
            this.active=false;
            this.session=null;
            this.world=null;
            window.SMRuntimeEventBus?.emit?.('input:runtime-stopped',{bridge:this,session,reason});
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getInputManager!=='function')runtime.getInputManager=()=>window.SMInputManager;
            if(typeof runtime.getInputAction!=='function')runtime.getInputAction=(name,context=null)=>window.SMInputManager?.getAction?.(name,context)||null;
            if(typeof runtime.getInputValue!=='function')runtime.getInputValue=(name,context=null)=>window.SMInputManager?.getValue?.(name,context);
            if(typeof runtime.addInputContext!=='function')runtime.addInputContext=(context,map=null,options={})=>window.SMInputManager?.addContext?.(context,map,options);
            if(typeof runtime.removeInputContext!=='function')runtime.removeInputContext=context=>window.SMInputManager?.removeContext?.(context);
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
            const state={registered:this._registered,active:this.active,priority:this.priority,manager:this.manager?.debug?.()};
            console.log('[SMInputRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMInputRuntimeBridge();
    window.SMInputRuntimeBridge=bridge;
    window.smInputRuntimeBridge=bridge;
    window.SMInputRuntimeBridgeClass=SMInputRuntimeBridge;
})();