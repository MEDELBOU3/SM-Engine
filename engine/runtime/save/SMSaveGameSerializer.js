(function(){
    'use strict';
    class SMSaveGameSerializer{
        static capture(options={}){
            const runtime=options.runtime||window.SMRuntime;
            const world=options.world||runtime?.getWorld?.()||null;
            const level=options.level||runtime?.getActiveLevel?.()||null;
            const gameMode=options.gameMode||runtime?.getGameMode?.()||null;
            const gameState=options.gameState||runtime?.getGameState?.()||null;
            const playerRuntime=runtime?.getPlayerRuntime?.()||null;
            const save=new window.SMSaveGame({slot:options.slot||'default',title:options.title||options.slot||'Save Game',playTime:Number(gameState?.elapsedTime||0),levelId:level?.id||null,gameModeId:gameMode?.id||null,gameState:gameState?.serialize?.()||{},worldState:this._captureWorldState(world,level),players:this._capturePlayers(playerRuntime),objects:this._captureObjects(world,options),custom:options.custom||{},metadata:{engine:'SM Engine',runtimeSave:true,...(options.metadata||{})},thumbnail:options.thumbnail||null});
            return save;
        }
        static async apply(saveOrData,options={}){
            const save=saveOrData instanceof window.SMSaveGame?saveOrData:new window.SMSaveGame(saveOrData||{});
            const runtime=options.runtime||window.SMRuntime;
            if(!runtime)throw new Error('SMSaveGameSerializer.apply() requires SMRuntime.');
            if(save.levelId&&runtime.getActiveLevel?.()?.id!==save.levelId&&runtime.openLevel){
                await runtime.openLevel(save.levelId,{unloadCurrent:true});
                await runtime.whenLevelReady?.();
            }
            const world=runtime.getWorld?.()||null;
            const playerRuntime=runtime.getPlayerRuntime?.()||null;
            this._applyWorldState(world,save.worldState);
            await this._applyPlayers(playerRuntime,save.players,options);
            this._applyObjects(world,save.objects,options);
            const gameState=runtime.getGameState?.();
            if(gameState&&save.gameState)this._applyGameState(gameState,save.gameState);
            window.SMRuntimeEventBus?.emit?.('save:applied',{save,world,playerRuntime});
            return save;
        }
        static toJSON(saveOrData,options={}){
            const save=saveOrData instanceof window.SMSaveGame?saveOrData:new window.SMSaveGame(saveOrData||{});
            return options.pretty===false?JSON.stringify(save.serialize()):JSON.stringify(save.serialize(),null,2);
        }
        static fromJSON(json){
            return new window.SMSaveGame(typeof json==='string'?JSON.parse(json):json);
        }
        static _captureWorldState(world,level){
            const settings=world?.settings?.serialize?.()||world?.settings?.state||world?.settings||{};
            return{settings:this._clone(settings),activeLevelId:level?.id||null,timeScale:world?.settings?.state?.timeScale??world?.settings?.timeScale??1,metadata:this._clone(world?.metadata||{})};
        }
        static _capturePlayers(playerRuntime){
            if(!playerRuntime?.players)return[];
            const players=[];
            for(const player of playerRuntime.players.values()){
                const pawn=player.pawn;
                const object=pawn?.object||null;
                players.push({id:player.id,displayName:player.displayName,local:player.local,spawnCount:player.spawnCount,metadata:this._clone(player.metadata||{}),pawn:pawn?{type:pawn.type,id:pawn.id,prefabId:object?.userData?.prefabId||null,position:object?.position?.toArray?.()||null,quaternion:object?.quaternion?.toArray?.()||null,scale:object?.scale?.toArray?.()||null,components:this._captureComponents(object)}:null});
            }
            return players;
        }
        static _captureObjects(world,options={}){
            const records=world?.registry?.records;
            if(!records?.values)return[];
            const output=[];
            for(const record of records.values()){
                const object=record?.object||record;
                if(!object||object.userData?.editorOnly===true||object.userData?.runtimeIgnore===true)continue;
                const shouldSave=options.saveAllRuntimeObjects===true||object.userData?.saveGame===true||object.userData?.persistent===true||window.SMGameplayTags?.has?.(object,'state.persistent');
                if(!shouldSave)continue;
                output.push({uuid:object.uuid,name:object.name||'',runtimeType:object.userData?.runtimeType||null,prefabId:object.userData?.prefabId||null,prefabInstanceId:object.userData?.prefabInstanceId||null,position:object.position?.toArray?.()||null,quaternion:object.quaternion?.toArray?.()||null,scale:object.scale?.toArray?.()||null,visible:object.visible!==false,userData:this._safeUserData(object.userData||{}),components:this._captureComponents(object)});
            }
            return output;
        }
        static _captureComponents(object){
            const container=object?.components||window.SMComponentRuntimeBridge?.getContainer?.(object);
            if(!container)return Array.isArray(object?.userData?.components)?this._clone(object.userData.components):[];
            const output=[];
            for(const component of container.components||[]){
                let state=null;
                try{state=component.serializeState?.()??component.serialize?.()??null;}catch{}
                output.push({type:component.type||component.constructor?.componentType||component.constructor?.name,state:this._clone(state)});
            }
            return output;
        }
        static _applyWorldState(world,state={}){
            if(!world)return;
            if(state.settings&&world.settings?.merge)world.settings.merge(state.settings);
            if(state.timeScale!==undefined&&world.settings?.set)try{world.settings.set('timeScale',state.timeScale);}catch{}
        }
        static async _applyPlayers(playerRuntime,players=[],options={}){
            if(!playerRuntime)return;
            for(const data of players||[]){
                let player=playerRuntime.getPlayer?.(data.id)||null;
                if(!player)player=playerRuntime.createPlayer?.({id:data.id,displayName:data.displayName,local:data.local,metadata:data.metadata||{}});
                if(!player)continue;
                player.displayName=data.displayName||player.displayName;
                player.spawnCount=Number(data.spawnCount||player.spawnCount||0);
                if(!data.pawn)continue;
                const current=player.pawn;
                const object=current?.object||null;
                if(object){
                    this._applyTransform(object,data.pawn);
                    this._applyComponents(object,data.pawn.components);
                }else if(options.spawnMissingPlayers!==false){
                    const pawn=await playerRuntime.spawnPlayer?.(player,{prefabId:data.pawn.prefabId||undefined,position:data.pawn.position||undefined,quaternion:data.pawn.quaternion||undefined,pawnType:data.pawn.type||'character'});
                    if(pawn?.object){
                        this._applyTransform(pawn.object,data.pawn);
                        this._applyComponents(pawn.object,data.pawn.components);
                    }
                }
            }
        }
        static _applyObjects(world,objects=[],options={}){
            if(!world)return;
            for(const data of objects||[]){
                let object=world.scene?.getObjectByProperty?.('uuid',data.uuid)||null;
                if(!object&&data.prefabInstanceId){
                    world.scene?.traverse?.(candidate=>{if(!object&&candidate.userData?.prefabInstanceId===data.prefabInstanceId)object=candidate;});
                }
                if(!object&&data.name){
                    world.scene?.traverse?.(candidate=>{if(!object&&candidate.name===data.name&&candidate.userData?.runtimeType===data.runtimeType)object=candidate;});
                }
                if(!object)continue;
                this._applyTransform(object,data);
                if(data.visible!==undefined)object.visible=Boolean(data.visible);
                if(data.userData&&options.restoreUserData!==false)Object.assign(object.userData||(object.userData={}),this._clone(data.userData));
                this._applyComponents(object,data.components);
            }
        }
        static _applyGameState(gameState,data={}){
            if(data.round!==undefined)gameState.round=Number(data.round)||0;
            if(data.maxRounds!==undefined)gameState.maxRounds=Number(data.maxRounds)||0;
            if(data.elapsedTime!==undefined)gameState.elapsedTime=Math.max(0,Number(data.elapsedTime)||0);
            if(data.scores&&typeof data.scores==='object')gameState.scores=new Map(Object.entries(data.scores));
            if(data.teams&&typeof data.teams==='object')gameState.teams=new Map(Object.entries(data.teams));
            if(data.result!==undefined)gameState.result=this._clone(data.result);
            if(data.winner!==undefined)gameState.winner=data.winner;
            if(data.state)gameState.setState(data.state,{source:'save-load'});
        }
        static _applyTransform(object,data){
            if(data.position&&object.position?.fromArray)object.position.fromArray(data.position);
            if(data.quaternion&&object.quaternion?.fromArray)object.quaternion.fromArray(data.quaternion);
            if(data.scale&&object.scale?.fromArray)object.scale.fromArray(data.scale);
            object.updateMatrixWorld?.(true);
        }
        static _applyComponents(object,components=[]){
            const container=object?.components||window.SMComponentRuntimeBridge?.ensureContainer?.(object);
            if(!container)return;
            for(const descriptor of components||[]){
                const type=descriptor.type;
                if(!type)continue;
                let component=container.get?.(type)||null;
                if(!component)try{component=container.add?.(type,descriptor.state||{});}catch{}
                if(!component)continue;
                try{
                    if(typeof component.deserializeState==='function')component.deserializeState(descriptor.state||{});
                    else if(typeof component.deserialize==='function')component.deserialize(descriptor.state||{});
                }catch(error){console.warn(`[SMSaveGameSerializer] Failed to restore component "${type}".`,error);}
            }
        }
        static _safeUserData(data){
            const output={};
            const excluded=new Set(['components']);
            for(const[key,value]of Object.entries(data||{})){
                if(excluded.has(key)||typeof value==='function'||typeof value==='undefined')continue;
                if(value?.isObject3D)continue;
                try{output[key]=this._clone(value);}catch{}
            }
            return output;
        }
        static _clone(value){
            if(value===undefined)return undefined;
            try{return structuredClone(value);}catch{}
            try{return JSON.parse(JSON.stringify(value));}catch{return value;}
        }
    }
    window.SMSaveGameSerializer=SMSaveGameSerializer;
    window.SMSaveGameSerializerClass=SMSaveGameSerializer;
})();