(function(){
    'use strict';
    class SMRuntimeWorld{
        constructor(options={}){
            this.id=options.id||`world-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
            this.session=options.session||null;
            this.scene=options.scene||this.session?.scene||window.scene||null;
            this.eventBus=options.eventBus||window.SMRuntimeEventBus||null;
            this.settings=options.settings instanceof window.SMRuntimeWorldSettings?options.settings:new window.SMRuntimeWorldSettings(options.settings||{});
            this.settings.loadFromScene(this.scene);
            this.registry=new window.SMRuntimeObjectRegistry(this);
            this.spawner=new window.SMRuntimeSpawner(this);
            this.state='created';
            this.elapsed=0;
            this.frame=0;
            this.player=null;
            this.playerStart=null;
            this.data=new Map();
            this._startedAt=0;
        }
        start(){
            if(this.state!=='created'&&this.state!=='stopped')return false;
            if(!this.scene)throw new Error('SMRuntimeWorld requires a scene.');
            this.state='starting';
            this._startedAt=performance.now();
            const scan=this.registry.scanScene(this.scene);
            this.playerStart=this.findPlayerStart();
            this.player=this.registry.findFirstByType('player')||this.registry.findFirstByTag('player')||null;
            this.state='running';
            this.eventBus?.emit?.('world:started',{world:this,session:this.session,scan,playerStart:this.playerStart,player:this.player});
            window.dispatchEvent(new CustomEvent('sm:runtime-world-started',{detail:{world:this,session:this.session,scan,playerStart:this.playerStart,player:this.player}}));
            return true;
        }
        pause(){
            if(this.state!=='running')return false;
            this.state='paused';
            this.eventBus?.emit?.('world:paused',{world:this,session:this.session});
            return true;
        }
        resume(){
            if(this.state!=='paused')return false;
            this.state='running';
            this.eventBus?.emit?.('world:resumed',{world:this,session:this.session});
            return true;
        }
        update(delta,time){
            if(this.state!=='running')return false;
            const scaledDelta=Math.max(0,Number(delta)||0)*this.settings.timeScale;
            this.elapsed+=scaledDelta;
            this.frame+=1;
            this.eventBus?.emit?.('world:update',{world:this,delta:scaledDelta,unscaledDelta:Number(delta)||0,time,frame:this.frame,elapsed:this.elapsed});
            return true;
        }
        fixedUpdate(delta){
            if(this.state!=='running')return false;
            const scaledDelta=Math.max(0,Number(delta)||0)*this.settings.timeScale;
            this.eventBus?.emit?.('world:fixed-update',{world:this,delta:scaledDelta,unscaledDelta:Number(delta)||0});
            return true;
        }
        stop(reason='user'){
            if(this.state==='stopped'||this.state==='stopping')return false;
            this.state='stopping';
            this.eventBus?.emit?.('world:stopping',{world:this,reason});
            this.spawner.destroyAll({dispose:false});
            const count=this.registry.clear();
            this.player=null;
            this.playerStart=null;
            this.data.clear();
            this.state='stopped';
            this.eventBus?.emit?.('world:stopped',{world:this,reason,clearedObjects:count});
            window.dispatchEvent(new CustomEvent('sm:runtime-world-stopped',{detail:{world:this,reason,clearedObjects:count}}));
            return true;
        }
        registerObject(object,options={}){
            return this.registry.register(object,options);
        }
        unregisterObject(objectOrId){
            return this.registry.unregister(objectOrId);
        }
        async spawn(source,options={}){
            return await this.spawner.spawn(source,options);
        }
        destroy(object,options={}){
            return this.spawner.destroy(object,options);
        }
        findPlayerStart(){
            const tag=this.settings.playerSpawnTag;
            if(tag){
                const tagged=this.registry.findFirstByTag(tag);
                if(tagged)return tagged;
            }
            const types=[this.settings.playerSpawnType,'player-start','playerstart','spawn-point'];
            for(const type of types){
                const object=this.registry.findFirstByType(type);
                if(object)return object;
            }
            const named=this.registry.findByName('PlayerStart',{exact:false});
            return named[0]||null;
        }
        getPlayerStartTransform(){
            const target=this.playerStart||this.findPlayerStart();
            if(!target)return null;
            const position=target.getWorldPosition&&window.THREE?.Vector3?target.getWorldPosition(new THREE.Vector3()).toArray():target.position?.toArray?.()||[0,0,0];
            const quaternion=target.getWorldQuaternion&&window.THREE?.Quaternion?target.getWorldQuaternion(new THREE.Quaternion()).toArray():target.quaternion?.toArray?.()||[0,0,0,1];
            const scale=target.getWorldScale&&window.THREE?.Vector3?target.getWorldScale(new THREE.Vector3()).toArray():target.scale?.toArray?.()||[1,1,1];
            return{position,quaternion,scale};
        }
        setPlayer(object,options={}){
            if(this.player&&this.player!==object)this.registry.removeTag(this.player,'player');
            this.player=object||null;
            if(object){
                if(!this.registry.getRecord(object))this.registry.register(object,{type:'player',tags:['player'],...options});
                else{
                    this.registry.updateMetadata(object,{type:'player'});
                    this.registry.addTag(object,'player');
                }
            }
            this.eventBus?.emit?.('world:player-changed',{world:this,player:this.player});
            return this.player;
        }
        async spawnPlayer(source,options={}){
            const transform=options.usePlayerStart===false?{}:this.getPlayerStartTransform()||{};
            const player=await this.spawner.spawn(source,{type:'player',tags:['player',...(Array.isArray(options.tags)?options.tags:[])],...transform,...options});
            this.setPlayer(player);
            return player;
        }
        setData(key,value){
            this.data.set(String(key),value);
            return value;
        }
        getData(key,fallback=null){
            return this.data.has(String(key))?this.data.get(String(key)):fallback;
        }
        deleteData(key){
            return this.data.delete(String(key));
        }
        getStats(){
            return{id:this.id,state:this.state,frame:this.frame,elapsed:this.elapsed,player:this.player?.uuid||null,playerStart:this.playerStart?.uuid||null,registry:this.registry.getStats(),spawned:this.spawner.spawned.size,settings:this.settings.serialize()};
        }
        debug(){
            const stats=this.getStats();
            console.log('[SMRuntimeWorld]',stats);
            return stats;
        }
    }
    window.SMRuntimeWorld=SMRuntimeWorld;
    window.SMRuntimeWorldClass=SMRuntimeWorld;
})();