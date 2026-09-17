(function(){
    'use strict';
    class SMPlayerRuntimeBridge{
        constructor(){
            this.id='runtime-player';
            this.priority=910;
            this.session=null;
            this.world=null;
            this.levelManager=null;
            this.inputManager=null;
            this.spawnManager=null;
            this.possessionManager=window.SMPlayerPossessionManager||null;
            this.players=new Map();
            this.localPlayer=null;
            this.active=false;
            this._registered=false;
            this._runtimePatched=false;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            if(!this.world)throw new Error('SMPlayerRuntimeBridge requires an active Runtime World.');
            this.levelManager=session?.getData?.('levelManager')||window.SMLevelManager||null;
            this.inputManager=session?.getData?.('inputManager')||window.SMInputManager||null;
            this.spawnManager=new window.SMPlayerSpawnManager({world:this.world,levelManager:this.levelManager});
            this.possessionManager=window.SMPlayerPossessionManager;
            this.active=true;
            if(!this.localPlayer)this.localPlayer=this.createPlayer({id:'local-player',displayName:'Player',local:true});
            const context=this.inputManager?.getDefaultContext?.();
            if(context)this.localPlayer.setInputContext(context);
            session?.setData?.('playerRuntime',this);
            session?.setData?.('localPlayer',this.localPlayer);
            const settings=this.world.settings?.state||this.world.settings||{};
            if(settings.autoSpawnPlayer===true){
                const ready=session?.getData?.('levelReady')||Promise.resolve();
                Promise.resolve(ready).then(()=>this.spawnLocalPlayer({prefabId:settings.defaultPlayerPrefab||settings.defaultPawnPrefab||undefined})).catch(error=>console.error('[SMPlayerRuntimeBridge] Auto-spawn failed.',error));
            }
            window.SMRuntimeEventBus?.emit?.('player:runtime-started',{bridge:this,session,world:this.world,localPlayer:this.localPlayer});
        }
        update(){
            if(!this.active||!this.localPlayer?.pawn||!this.inputManager)return;
            const move=this.inputManager.getValue('Move')||{x:0,y:0};
            const look=this.inputManager.getValue('Look')||{x:0,y:0};
            const input={move,look,jumpPressed:this.inputManager.isPressed('Jump'),sprint:this.inputManager.isActive('Sprint'),crouchPressed:this.inputManager.isPressed('Crouch'),crouchReleased:this.inputManager.isReleased('Crouch'),interactPressed:this.inputManager.isPressed('Interact'),fireActive:this.inputManager.isActive('Fire'),aimActive:this.inputManager.isActive('Aim'),pausePressed:this.inputManager.isPressed('Pause')};
            this.localPlayer.pawn.applyInput(input);
            try{this.localPlayer.controller?.onInput?.(input);}catch(error){console.error('[SMPlayerRuntimeBridge] controller.onInput failed.',error);}
        }
        fixedUpdate(){}
        pause(){}
        resume(){}
        stop(session,reason='runtime-stop'){
            this.possessionManager?.clear?.();
            this.spawnManager?.clear?.({dispose:false});
            for(const player of this.players.values()){
                player.pawn=null;
                player.controller=null;
            }
            session?.deleteData?.('playerRuntime');
            session?.deleteData?.('localPlayer');
            this.active=false;
            this.world=null;
            this.levelManager=null;
            this.inputManager=null;
            this.spawnManager=null;
            window.SMRuntimeEventBus?.emit?.('player:runtime-stopped',{bridge:this,session,reason});
        }
        createPlayer(options={}){
            const player=options instanceof window.SMPlayerRuntime?options:new window.SMPlayerRuntime(options);
            this.players.set(player.id,player);
            if(player.local||!this.localPlayer)this.localPlayer=player;
            window.SMRuntimeEventBus?.emit?.('player:joined',{bridge:this,player});
            return player;
        }
        removePlayer(playerOrId,options={}){
            const player=playerOrId instanceof window.SMPlayerRuntime?playerOrId:this.players.get(String(playerOrId));
            if(!player)return false;
            if(player.controller)this.possessionManager?.unpossess?.(player.controller,{reason:'player-removed'});
            if(player.pawn)this.spawnManager?.despawn?.(player.pawn,{dispose:options.dispose===true});
            this.players.delete(player.id);
            if(this.localPlayer===player)this.localPlayer=null;
            player.setConnected(false);
            window.SMRuntimeEventBus?.emit?.('player:left',{bridge:this,player});
            return true;
        }
        async spawnPlayer(playerOrId,options={}){
            const player=playerOrId instanceof window.SMPlayerRuntime?playerOrId:this.players.get(String(playerOrId));
            if(!player)throw new Error(`Unknown player "${playerOrId}".`);
            const pawn=await this.spawnManager.spawn(player,options);
            if(player.controller)this.possessionManager.possess(player.controller,pawn,{player});
            return pawn;
        }
        async spawnLocalPlayer(options={}){
            if(!this.localPlayer)this.localPlayer=this.createPlayer({id:'local-player',displayName:'Player',local:true});
            return await this.spawnPlayer(this.localPlayer,options);
        }
        async respawnPlayer(playerOrId,options={}){
            const player=playerOrId instanceof window.SMPlayerRuntime?playerOrId:this.players.get(String(playerOrId));
            if(!player)throw new Error(`Unknown player "${playerOrId}".`);
            const controller=player.controller;
            if(controller)this.possessionManager.unpossess(controller,{reason:'respawn'});
            const pawn=await this.spawnManager.respawn(player,options);
            if(controller)this.possessionManager.possess(controller,pawn,{player});
            return pawn;
        }
        setPlayerController(playerOrId,controller){
            const player=playerOrId instanceof window.SMPlayerRuntime?playerOrId:this.players.get(String(playerOrId));
            if(!player)throw new Error(`Unknown player "${playerOrId}".`);
            if(player.controller&&player.controller!==controller)this.possessionManager.unpossess(player.controller,{reason:'controller-changed'});
            player.setController(controller);
            if(controller){
                controller.player=player;
                controller.inputManager=this.inputManager;
                if(player.pawn)this.possessionManager.possess(controller,player.pawn,{player});
            }
            return controller;
        }
        possess(controller,pawn,options={}){
            return this.possessionManager.possess(controller,pawn,options);
        }
        unpossess(controllerOrPawn,options={}){
            return this.possessionManager.unpossess(controllerOrPawn,options);
        }
        getPlayer(id){
            return this.players.get(String(id))||null;
        }
        getLocalPlayer(){
            return this.localPlayer;
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getPlayerRuntime!=='function')runtime.getPlayerRuntime=()=>this;
            if(typeof runtime.getLocalPlayer!=='function')runtime.getLocalPlayer=()=>this.getLocalPlayer();
            if(typeof runtime.createPlayer!=='function')runtime.createPlayer=options=>this.createPlayer(options);
            if(typeof runtime.spawnPlayer!=='function')runtime.spawnPlayer=(player,options={})=>this.spawnPlayer(player,options);
            if(typeof runtime.spawnLocalPlayer!=='function')runtime.spawnLocalPlayer=(options={})=>this.spawnLocalPlayer(options);
            if(typeof runtime.respawnPlayer!=='function')runtime.respawnPlayer=(player,options={})=>this.respawnPlayer(player,options);
            if(typeof runtime.setPlayerController!=='function')runtime.setPlayerController=(player,controller)=>this.setPlayerController(player,controller);
            if(typeof runtime.possess!=='function')runtime.possess=(controller,pawn,options={})=>this.possess(controller,pawn,options);
            if(typeof runtime.unpossess!=='function')runtime.unpossess=(controllerOrPawn,options={})=>this.unpossess(controllerOrPawn,options);
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
            const state={registered:this._registered,active:this.active,priority:this.priority,players:this.players.size,localPlayer:this.localPlayer?.id||null,localPawn:this.localPlayer?.pawn?.id||null,world:this.world?.id||null,spawnManager:this.spawnManager?.debug?.(),possessionManager:this.possessionManager?.debug?.()};
            console.log('[SMPlayerRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMPlayerRuntimeBridge();
    window.SMPlayerRuntimeBridge=bridge;
    window.smPlayerRuntimeBridge=bridge;
    window.SMPlayerRuntimeBridgeClass=SMPlayerRuntimeBridge;
})();