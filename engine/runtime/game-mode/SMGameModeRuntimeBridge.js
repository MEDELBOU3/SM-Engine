(function(){
    'use strict';
    class SMGameModeRuntimeBridge{
        constructor(){
            this.id='runtime-game-mode';
            this.priority=920;
            this.session=null;
            this.world=null;
            this.level=null;
            this.gameMode=null;
            this.gameState=null;
            this.active=false;
            this.ready=Promise.resolve(null);
            this._registered=false;
            this._runtimePatched=false;
            this._bootstrapToken=0;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            if(!this.world)throw new Error('SMGameModeRuntimeBridge requires an active Runtime World.');
            this.level=session?.getData?.('activeLevel')||window.SMRuntime?.getActiveLevel?.()||null;
            this.gameState=new window.SMGameState();
            const modeId=this._resolveGameModeId();
            this.gameMode=window.SMGameModeRegistry.create(modeId,{world:this.world,session,level:this.level,gameState:this.gameState,...this._resolveGameModeOptions()});
            this.active=true;
            const token=++this._bootstrapToken;
            const levelReady=session?.getData?.('levelReady')||window.SMRuntime?.whenLevelReady?.()||Promise.resolve(null);
            this.ready=Promise.resolve(levelReady).then(()=>new Promise(resolve=>queueMicrotask(resolve))).then(async()=>{
                if(!this.active||token!==this._bootstrapToken)return null;
                this.level=session?.getData?.('activeLevel')||window.SMRuntime?.getActiveLevel?.()||this.level;
                this.gameMode.level=this.level;
                await this.gameMode.start({world:this.world,session:this.session,level:this.level,gameState:this.gameState});
                session?.setData?.('gameMode',this.gameMode);
                session?.setData?.('gameState',this.gameState);
                window.smActiveGameMode=this.gameMode;
                window.smGameState=this.gameState;
                window.SMRuntimeEventBus?.emit?.('game-mode:ready',{bridge:this,gameMode:this.gameMode,gameState:this.gameState,level:this.level});
                window.dispatchEvent(new CustomEvent('sm:game-mode-ready',{detail:{bridge:this,gameMode:this.gameMode,gameState:this.gameState,level:this.level}}));
                return this.gameMode;
            }).catch(error=>{
                console.error('[SMGameModeRuntimeBridge] GameMode bootstrap failed.',error);
                window.SMRuntimeEventBus?.emit?.('game-mode:error',{bridge:this,error,gameMode:this.gameMode});
                throw error;
            });
            session?.setData?.('gameModeReady',this.ready);
            return this.ready;
        }
        update(delta,time){
            if(this.active&&this.gameMode?.started)this.gameMode.update(delta,time);
        }
        fixedUpdate(delta,time){
            if(this.active&&this.gameMode?.started)this.gameMode.fixedUpdate(delta,time);
        }
        pause(){
            this.gameMode?.pause?.();
        }
        resume(){
            this.gameMode?.resume?.();
        }
        stop(session,reason='runtime-stop'){
            this._bootstrapToken+=1;
            const mode=this.gameMode;
            Promise.resolve(mode?.stop?.(reason)).catch(error=>console.warn('[SMGameModeRuntimeBridge] GameMode stop failed.',error));
            session?.deleteData?.('gameMode');
            session?.deleteData?.('gameState');
            session?.deleteData?.('gameModeReady');
            if(window.smActiveGameMode===mode)window.smActiveGameMode=null;
            if(window.smGameState===this.gameState)window.smGameState=null;
            this.active=false;
            this.gameMode=null;
            this.gameState=null;
            this.level=null;
            this.world=null;
            this.session=null;
            this.ready=Promise.resolve(null);
            window.SMRuntimeEventBus?.emit?.('game-mode:runtime-stopped',{bridge:this,reason});
        }
        whenReady(){
            return this.ready;
        }
        getGameMode(){
            return this.gameMode;
        }
        getGameState(){
            return this.gameState;
        }
        _resolveGameModeId(){
            const levelSettings=this.level?.worldSettings||{};
            const worldSettings=this.world?.settings?.state||this.world?.settings||{};
            return levelSettings.gameMode||worldSettings.gameMode||this.world?.scene?.userData?.gameMode||'default';
        }
        _resolveGameModeOptions(){
            const levelSettings=this.level?.worldSettings||{};
            const worldSettings=this.world?.settings?.state||this.world?.settings||{};
            return{defaultPlayerPrefab:levelSettings.defaultPlayerPrefab||levelSettings.defaultPawnPrefab||worldSettings.defaultPlayerPrefab||worldSettings.defaultPawnPrefab||null,autoSpawnPlayer:levelSettings.gameModeAutoSpawnPlayer??worldSettings.gameModeAutoSpawnPlayer??true,respawnEnabled:levelSettings.respawnEnabled??worldSettings.respawnEnabled??true,respawnDelay:levelSettings.respawnDelay??worldSettings.respawnDelay??0,startMatchAutomatically:levelSettings.startMatchAutomatically??worldSettings.startMatchAutomatically??true};
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getGameMode!=='function')runtime.getGameMode=()=>this.gameMode;
            if(typeof runtime.getGameState!=='function')runtime.getGameState=()=>this.gameState;
            if(typeof runtime.whenGameModeReady!=='function')runtime.whenGameModeReady=()=>this.whenReady();
            if(typeof runtime.startMatch!=='function')runtime.startMatch=options=>this.gameMode?.startMatch?.(options);
            if(typeof runtime.endMatch!=='function')runtime.endMatch=result=>this.gameMode?.endMatch?.(result);
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
            const state={registered:this._registered,active:this.active,priority:this.priority,gameMode:this.gameMode?.id||null,gameState:this.gameState?.state||null,level:this.level?.id||null,ready:!!this.gameMode?.started};
            console.log('[SMGameModeRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMGameModeRuntimeBridge();
    window.SMGameModeRuntimeBridge=bridge;
    window.smGameModeRuntimeBridge=bridge;
    window.SMGameModeRuntimeBridgeClass=SMGameModeRuntimeBridge;
})();