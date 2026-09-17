(function(){
    'use strict';
    class SMGameMode{
        constructor(options={}){
            this.id=String(options.id||options.name||'default');
            this.name=String(options.name||this.id);
            this.world=options.world||null;
            this.session=options.session||null;
            this.level=options.level||null;
            this.gameState=options.gameState instanceof window.SMGameState?options.gameState:new window.SMGameState(options.gameState||{});
            this.defaultPlayerPrefab=options.defaultPlayerPrefab||options.defaultPawnPrefab||null;
            this.defaultPawnType=String(options.defaultPawnType||'character');
            this.autoSpawnPlayer=options.autoSpawnPlayer!==false;
            this.respawnEnabled=options.respawnEnabled!==false;
            this.respawnDelay=Math.max(0,Number(options.respawnDelay??0));
            this.startMatchAutomatically=options.startMatchAutomatically!==false;
            this.controllers=new Map();
            this.started=false;
            this.matchStarted=false;
            this.matchEnded=false;
            this.paused=false;
            this.metadata={...(options.metadata||{})};
        }
        async initialize(context={}){
            this.world=context.world||this.world||window.SMRuntime?.getWorld?.()||null;
            this.session=context.session||this.session||this.world?.session||null;
            this.level=context.level||this.level||window.SMRuntime?.getActiveLevel?.()||null;
            if(context.gameState instanceof window.SMGameState)this.gameState=context.gameState;
            this._applyLevelSettings();
            await this.onInitialize?.(context);
            window.SMRuntimeEventBus?.emit?.('game-mode:initialized',{gameMode:this,world:this.world,session:this.session,level:this.level});
            return this;
        }
        async start(context={}){
            if(this.started)return this;
            await this.initialize(context);
            this.started=true;
            this.matchEnded=false;
            this.gameState.setState('starting');
            await this.onStart?.(context);
            if(this.autoSpawnPlayer)await this.ensureLocalPlayer(context);
            if(this.startMatchAutomatically)await this.startMatch(context);
            window.SMRuntimeEventBus?.emit?.('game-mode:started',{gameMode:this,gameState:this.gameState});
            return this;
        }
        async stop(reason='runtime-stop'){
            if(!this.started)return false;
            if(this.matchStarted&&!this.matchEnded)await this.endMatch({reason});
            for(const controller of this.controllers.values()){
                try{controller.unpossess?.({reason});}catch{}
            }
            this.controllers.clear();
            await this.onStop?.(reason);
            this.started=false;
            this.paused=false;
            window.SMRuntimeEventBus?.emit?.('game-mode:stopped',{gameMode:this,reason});
            return true;
        }
        update(delta,time){
            if(!this.started)return;
            this.gameState.update(delta);
            this.onUpdate?.(delta,time);
        }
        fixedUpdate(delta,time){
            if(!this.started)return;
            this.onFixedUpdate?.(delta,time);
        }
        async startMatch(context={}){
            if(this.matchStarted&&!this.matchEnded)return false;
            this.matchStarted=true;
            this.matchEnded=false;
            this.gameState.setState('playing');
            await this.onMatchStart?.(context);
            window.SMRuntimeEventBus?.emit?.('game-mode:match-started',{gameMode:this,gameState:this.gameState});
            return true;
        }
        async endMatch(result={}){
            if(this.matchEnded)return false;
            this.matchEnded=true;
            this.matchStarted=false;
            this.gameState.end(result);
            await this.onMatchEnd?.(result);
            window.SMRuntimeEventBus?.emit?.('game-mode:match-ended',{gameMode:this,gameState:this.gameState,result});
            return true;
        }
        pause(){
            if(this.paused)return false;
            this.paused=true;
            this.gameState.setState('paused');
            for(const controller of this.controllers.values())controller.setInputEnabled?.(false);
            this.onPause?.();
            return true;
        }
        resume(){
            if(!this.paused)return false;
            this.paused=false;
            this.gameState.setState(this.matchStarted?'playing':'waiting');
            for(const controller of this.controllers.values())controller.setInputEnabled?.(true);
            this.onResume?.();
            return true;
        }
        requestPause(){
            if(this.paused)this.resume();
            else this.pause();
            return this.paused;
        }
        createPlayerController(player,options={}){
            const controller=new window.SMPlayerController({...options,player,inputManager:options.inputManager||window.SMInputManager,gameMode:this});
            this.controllers.set(player?.id||controller.id,controller);
            if(player)window.SMRuntime?.setPlayerController?.(player,controller);
            return controller;
        }
        getPlayerController(playerOrId){
            const id=String(playerOrId?.id||playerOrId||'');
            return this.controllers.get(id)||null;
        }
        async ensureLocalPlayer(options={}){
            const runtime=window.SMRuntime;
            let player=runtime?.getLocalPlayer?.()||null;
            if(!player&&runtime?.createPlayer)player=runtime.createPlayer({id:'local-player',displayName:'Player',local:true});
            if(!player)return null;
            this.gameState.addPlayer(player);
            let controller=player.controller||this.getPlayerController(player);
            if(!controller)controller=this.createPlayerController(player,{inputContext:player.inputContext||window.SMInputManager?.getDefaultContext?.()||null});
            if(player.pawn){
                if(!controller.pawn)window.SMRuntime?.possess?.(controller,player.pawn,{player});
                await this.onPlayerSpawned?.(player,player.pawn,controller,{existing:true});
                return player.pawn;
            }
            const prefab=this._resolvePlayerPrefab(options);
            const pawn=await runtime?.spawnLocalPlayer?.({prefabId:prefab||undefined,defaultPawnPrefab:prefab||undefined,pawnType:this.defaultPawnType,spawnTag:options.spawnTag||this.level?.playerStart?.tag||undefined,position:options.position,quaternion:options.quaternion,overrides:options.overrides||{}});
            if(pawn){
                window.SMRuntime?.possess?.(controller,pawn,{player});
                await this.onPlayerSpawned?.(player,pawn,controller,{existing:false});
            }
            return pawn||null;
        }
        async respawnPlayer(playerOrId,options={}){
            if(!this.respawnEnabled)return null;
            const runtime=window.SMRuntime;
            const player=typeof playerOrId==='object'&&playerOrId?.id?playerOrId:runtime?.getPlayerRuntime?.()?.getPlayer?.(playerOrId)||runtime?.getLocalPlayer?.();
            if(!player)return null;
            await this.onPlayerRespawnRequested?.(player,options);
            if(this.respawnDelay>0)await new Promise(resolve=>setTimeout(resolve,this.respawnDelay*1000));
            const controller=player.controller||this.getPlayerController(player);
            const prefab=this._resolvePlayerPrefab(options);
            const pawn=await runtime?.respawnPlayer?.(player,{prefabId:prefab||undefined,defaultPawnPrefab:prefab||undefined,pawnType:this.defaultPawnType,spawnTag:options.spawnTag||this.level?.playerStart?.tag||undefined,overrides:options.overrides||{}});
            if(controller&&pawn)window.SMRuntime?.possess?.(controller,pawn,{player});
            await this.onPlayerRespawned?.(player,pawn,controller);
            return pawn||null;
        }
        async handlePlayerDeath(player,pawn,info={}){
            await this.onPlayerDied?.(player,pawn,info);
            window.SMRuntimeEventBus?.emit?.('game-mode:player-died',{gameMode:this,player,pawn,info});
            if(this.respawnEnabled&&info.respawn!==false)return await this.respawnPlayer(player,info.respawnOptions||{});
            return null;
        }
        _resolvePlayerPrefab(options={}){
            const levelSettings=this.level?.worldSettings||{};
            const worldSettings=this.world?.settings?.state||this.world?.settings||{};
            return options.prefabId||options.defaultPlayerPrefab||this.defaultPlayerPrefab||levelSettings.defaultPlayerPrefab||levelSettings.defaultPawnPrefab||worldSettings.defaultPlayerPrefab||worldSettings.defaultPawnPrefab||null;
        }
        _applyLevelSettings(){
            const settings=this.level?.worldSettings||this.world?.settings?.state||this.world?.settings||{};
            if(settings.defaultPlayerPrefab!==undefined&&!this.defaultPlayerPrefab)this.defaultPlayerPrefab=settings.defaultPlayerPrefab;
            if(settings.defaultPawnPrefab!==undefined&&!this.defaultPlayerPrefab)this.defaultPlayerPrefab=settings.defaultPawnPrefab;
            if(settings.respawnEnabled!==undefined)this.respawnEnabled=Boolean(settings.respawnEnabled);
            if(settings.respawnDelay!==undefined)this.respawnDelay=Math.max(0,Number(settings.respawnDelay)||0);
            if(settings.gameModeAutoSpawnPlayer!==undefined)this.autoSpawnPlayer=Boolean(settings.gameModeAutoSpawnPlayer);
            return settings;
        }
        serialize(){
            return{id:this.id,name:this.name,defaultPlayerPrefab:this.defaultPlayerPrefab,defaultPawnType:this.defaultPawnType,autoSpawnPlayer:this.autoSpawnPlayer,respawnEnabled:this.respawnEnabled,respawnDelay:this.respawnDelay,startMatchAutomatically:this.startMatchAutomatically,metadata:{...this.metadata}};
        }
        onInitialize(){}
        onStart(){}
        onStop(){}
        onUpdate(){}
        onFixedUpdate(){}
        onMatchStart(){}
        onMatchEnd(){}
        onPause(){}
        onResume(){}
        onPlayerSpawned(){}
        onPlayerDied(){}
        onPlayerRespawnRequested(){}
        onPlayerRespawned(){}
        debug(){
            const state={id:this.id,name:this.name,started:this.started,matchStarted:this.matchStarted,matchEnded:this.matchEnded,paused:this.paused,defaultPlayerPrefab:this.defaultPlayerPrefab,respawnEnabled:this.respawnEnabled,respawnDelay:this.respawnDelay,controllers:this.controllers.size,gameState:this.gameState.debug?.()};
            console.log('[SMGameMode]',state);
            return state;
        }
    }
    window.SMGameMode=SMGameMode;
    window.SMGameModeClass=SMGameMode;
})();