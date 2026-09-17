(function(){
    'use strict';
    class SMPlayerSpawnManager{
        constructor(options={}){
            this.world=options.world||null;
            this.levelManager=options.levelManager||window.SMLevelManager||null;
            this.spawnedPawns=new Map();
            this.sequence=0;
        }
        setWorld(world){
            this.world=world||null;
            return this;
        }
        resolvePlayerStart(options={}){
            if(options.spawnPoint?.isObject3D)return options.spawnPoint;
            const levelManager=options.levelManager||this.levelManager||window.SMLevelManager;
            if(options.spawnTag&&this.world?.registry){
                const tagged=this.world.registry.findFirstByTag?.(options.spawnTag)||this.world.registry.findByTag?.(options.spawnTag)?.[0]?.object||null;
                if(tagged)return tagged.object||tagged;
            }
            const fromLevel=levelManager?.resolvePlayerStart?.(options.levelId||null);
            if(fromLevel)return fromLevel;
            if(this.world?.playerStart)return this.world.playerStart;
            return this.world?.findPlayerStart?.()||null;
        }
        async spawn(player,options={}){
            const world=options.world||this.world||window.SMRuntime?.getWorld?.();
            if(!world)throw new Error('SMPlayerSpawnManager.spawn() requires an active Runtime World.');
            this.world=world;
            const start=this.resolvePlayerStart(options);
            const source=this._resolveSource(options,world);
            let object=null;
            if(options.object?.isObject3D)object=options.object;
            else if(typeof source==='string'&&window.SMPrefabRegistry?.has?.(source)){
                object=await(window.SMRuntime?.spawnPrefab?.(source,{addToScene:true,position:this._position(start,options),quaternion:this._quaternion(start,options),name:options.name||`${player?.displayName||'Player'} Pawn`,overrides:options.overrides||{}})||window.SMPrefabRuntimeBridge?.instantiate?.(source,{position:this._position(start,options),quaternion:this._quaternion(start,options),name:options.name,overrides:options.overrides||{}}));
            }else if(source!==null&&source!==undefined&&world.spawn){
                object=await world.spawn(source,{position:this._position(start,options),quaternion:this._quaternion(start,options),name:options.name,type:'player',tags:['player','pawn',...(options.tags||[])]});
            }
            if(!object)object=this._createFallbackPawn(start,options);
            if(!object)throw new Error('SMPlayerSpawnManager could not create a player pawn.');
            if(!object.parent)world.scene?.add?.(object);
            object.userData=object.userData||{};
            object.userData.runtimeType=options.runtimeType||'player';
            object.userData.playerId=player?.id||null;
            object.userData.runtimeOwned=options.runtimeOwned!==false;
            const tags=Array.isArray(object.userData.tags)?object.userData.tags.slice():[];
            for(const tag of ['player','pawn',...(options.tags||[])])if(!tags.includes(tag))tags.push(tag);
            object.userData.tags=tags;
            const pawn=object instanceof window.SMPawn?object:new window.SMPawn(object,{id:options.pawnId||`pawn-${++this.sequence}`,type:options.pawnType||'character'});
            pawn.player=player||null;
            if(player){
                player.setPawn?.(pawn);
                player.incrementSpawn?.();
            }
            this.spawnedPawns.set(pawn.id,{pawn,player,object,spawnPoint:start,createdAt:performance.now?.()||Date.now(),runtimeOwned:options.runtimeOwned!==false});
            if(!world.registry?.getRecord?.(object))world.registerObject?.(object,{type:'player',tags,spawned:true,runtimeOwned:options.runtimeOwned!==false,metadata:{playerId:player?.id||null,pawnId:pawn.id}});
            window.SMRuntime?.trackRuntimeObject?.(object);
            window.SMRuntimeEventBus?.emit?.('player:spawned',{manager:this,player,pawn,object,spawnPoint:start});
            return pawn;
        }
        despawn(pawnOrId,options={}){
            const record=this._recordFor(pawnOrId);
            if(!record)return false;
            const{pawn,player,object}=record;
            if(pawn.controller)window.SMPlayerPossessionManager?.unpossess?.(pawn.controller);
            if(player?.pawn===pawn)player.clearPawn?.();
            if(record.runtimeOwned&&options.keepObject!==true){
                if(this.world?.destroy)this.world.destroy(object,{dispose:options.dispose===true});
                else object.parent?.remove?.(object);
            }
            this.spawnedPawns.delete(pawn.id);
            window.SMRuntimeEventBus?.emit?.('player:despawned',{manager:this,player,pawn,object});
            return true;
        }
        async respawn(player,options={}){
            if(player?.pawn)this.despawn(player.pawn,{dispose:false});
            return await this.spawn(player,options);
        }
        getPawn(id){
            return this.spawnedPawns.get(String(id))?.pawn||null;
        }
        clear(options={}){
            for(const record of Array.from(this.spawnedPawns.values()))this.despawn(record.pawn,options);
            return true;
        }
        _resolveSource(options,world){
            if(options.prefabId!==undefined)return options.prefabId;
            if(options.source!==undefined)return options.source;
            const activeLevel=this.levelManager?.getActive?.();
            const levelSettings=activeLevel?.worldSettings||{};
            const worldSettings=world.settings?.state||world.settings||{};
            return options.defaultPawnPrefab??levelSettings.defaultPlayerPrefab??levelSettings.defaultPawnPrefab??worldSettings.defaultPlayerPrefab??worldSettings.defaultPawnPrefab??null;
        }
        _position(start,options){
            if(options.position!==undefined)return options.position;
            return start?.getWorldPosition&&window.THREE?.Vector3?start.getWorldPosition(new THREE.Vector3()).toArray():start?.position?.toArray?.()||[0,0,0];
        }
        _quaternion(start,options){
            if(options.quaternion!==undefined)return options.quaternion;
            return start?.getWorldQuaternion&&window.THREE?.Quaternion?start.getWorldQuaternion(new THREE.Quaternion()).toArray():start?.quaternion?.toArray?.()||[0,0,0,1];
        }
        _createFallbackPawn(start,options){
            if(!window.THREE?.Group)return null;
            const object=new THREE.Group();
            object.name=options.name||'RuntimePlayerPawn';
            const position=this._position(start,options);
            const quaternion=this._quaternion(start,options);
            object.position.fromArray(position);
            object.quaternion.fromArray(quaternion);
            return object;
        }
        _recordFor(pawnOrId){
            if(typeof pawnOrId==='string')return this.spawnedPawns.get(pawnOrId)||null;
            for(const record of this.spawnedPawns.values())if(record.pawn===pawnOrId||record.object===pawnOrId)return record;
            return null;
        }
        debug(){
            const state={world:this.world?.id||null,count:this.spawnedPawns.size,pawns:Array.from(this.spawnedPawns.values()).map(record=>({pawnId:record.pawn.id,playerId:record.player?.id||null,object:record.object?.name||record.object?.uuid||null}))};
            console.log('[SMPlayerSpawnManager]',state);
            return state;
        }
    }
    window.SMPlayerSpawnManager=SMPlayerSpawnManager;
    window.SMPlayerSpawnManagerClass=SMPlayerSpawnManager;
})();