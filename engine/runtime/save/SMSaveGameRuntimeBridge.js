(function(){
    'use strict';
    class SMSaveGameRuntimeBridge{
        constructor(){
            this.id='runtime-save-game';
            this.priority=610;
            this.session=null;
            this.world=null;
            this.manager=window.SMSaveGameManager||null;
            this.active=false;
            this.autosaveEnabled=false;
            this.autosaveInterval=0;
            this.autosaveSlot='autosave';
            this._autosaveElapsed=0;
            this._registered=false;
            this._runtimePatched=false;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        async start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            this.manager=window.SMSaveGameManager;
            await this.manager.init();
            const settings=this.world?.settings?.state||this.world?.settings||{};
            this.autosaveEnabled=settings.saveGameAutosave===true;
            this.autosaveInterval=Math.max(0,Number(settings.saveGameAutosaveInterval||0));
            this.autosaveSlot=String(settings.saveGameAutosaveSlot||'autosave');
            this._autosaveElapsed=0;
            this.active=true;
            session?.setData?.('saveGameManager',this.manager);
            window.SMRuntimeEventBus?.emit?.('save:runtime-started',{bridge:this,manager:this.manager});
        }
        update(delta){
            if(!this.active||!this.autosaveEnabled||this.autosaveInterval<=0)return;
            this._autosaveElapsed+=Math.max(0,Number(delta)||0);
            if(this._autosaveElapsed>=this.autosaveInterval){
                this._autosaveElapsed=0;
                this.manager.save(this.autosaveSlot,{title:'Autosave'}).catch(error=>console.warn('[SMSaveGameRuntimeBridge] Autosave failed.',error));
            }
        }
        fixedUpdate(){}
        pause(){}
        resume(){}
        stop(session,reason='runtime-stop'){
            session?.deleteData?.('saveGameManager');
            this.active=false;
            this.world=null;
            this.session=null;
            this._autosaveElapsed=0;
            window.SMRuntimeEventBus?.emit?.('save:runtime-stopped',{bridge:this,reason});
        }
        setAutosave(enabled,interval=null,slot=null){
            this.autosaveEnabled=Boolean(enabled);
            if(interval!==null)this.autosaveInterval=Math.max(0,Number(interval)||0);
            if(slot!==null)this.autosaveSlot=String(slot||'autosave');
            this._autosaveElapsed=0;
            return{enabled:this.autosaveEnabled,interval:this.autosaveInterval,slot:this.autosaveSlot};
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getSaveGameManager!=='function')runtime.getSaveGameManager=()=>window.SMSaveGameManager;
            if(typeof runtime.saveGame!=='function')runtime.saveGame=(slot='default',options={})=>window.SMSaveGameManager.save(slot,options);
            if(typeof runtime.loadGame!=='function')runtime.loadGame=(slot='default',options={})=>window.SMSaveGameManager.load(slot,options);
            if(typeof runtime.deleteSaveGame!=='function')runtime.deleteSaveGame=slot=>window.SMSaveGameManager.delete(slot);
            if(typeof runtime.listSaveGames!=='function')runtime.listSaveGames=()=>window.SMSaveGameManager.list();
            if(typeof runtime.quickSave!=='function')runtime.quickSave=options=>window.SMSaveGameManager.quickSave(options||{});
            if(typeof runtime.quickLoad!=='function')runtime.quickLoad=options=>window.SMSaveGameManager.quickLoad(options||{});
            if(typeof runtime.setSaveGameAutosave!=='function')runtime.setSaveGameAutosave=(enabled,interval=null,slot=null)=>this.setAutosave(enabled,interval,slot);
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
            const state={registered:this._registered,active:this.active,priority:this.priority,autosaveEnabled:this.autosaveEnabled,autosaveInterval:this.autosaveInterval,autosaveSlot:this.autosaveSlot,manager:this.manager?.debug?.()};
            console.log('[SMSaveGameRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMSaveGameRuntimeBridge();
    window.SMSaveGameRuntimeBridge=bridge;
    window.smSaveGameRuntimeBridge=bridge;
    window.SMSaveGameRuntimeBridgeClass=SMSaveGameRuntimeBridge;
})();