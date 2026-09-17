(function(){
    'use strict';
    class SMGameplayRuntimeBridge{
        constructor(){
            this.id='runtime-gameplay';
            this.priority=805;
            this.session=null;
            this.world=null;
            this.active=false;
            this.paused=false;
            this.tags=window.SMGameplayTags||null;
            this.events=window.SMGameplayEventManager||null;
            this.teams=window.SMTeamManager||null;
            this._registered=false;
            this._runtimePatched=false;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            if(!this.world)throw new Error('SMGameplayRuntimeBridge requires an active Runtime World.');
            this.active=true;
            this.paused=false;
            this._registerDefaultTags();
            this._configureTeams();
            session?.setData?.('gameplayRuntime',this);
            session?.setData?.('gameplayEvents',this.events);
            session?.setData?.('teamManager',this.teams);
            window.SMRuntimeEventBus?.emit?.('gameplay:runtime-started',{bridge:this,session,world:this.world});
        }
        update(){
            if(!this.active||this.paused)return;
            this.events?.flush?.(128);
        }
        fixedUpdate(){}
        pause(){
            this.paused=true;
        }
        resume(){
            this.paused=false;
        }
        stop(session,reason='runtime-stop'){
            this.events?.flush?.(Infinity);
            this.events?.clearHistory?.();
            this.teams?.reset?.({keepTeams:false});
            session?.deleteData?.('gameplayRuntime');
            session?.deleteData?.('gameplayEvents');
            session?.deleteData?.('teamManager');
            this.active=false;
            this.paused=false;
            this.world=null;
            this.session=null;
            window.SMRuntimeEventBus?.emit?.('gameplay:runtime-stopped',{bridge:this,session,reason});
        }
        emit(type,payload={},options={}){
            return this.events.emit(type,payload,options);
        }
        queue(type,payload={},options={}){
            return this.events.queueEvent(type,payload,options);
        }
        _registerDefaultTags(){
            const defaults=[
                ['actor.player','Player-controlled actor'],
                ['actor.ai','AI-controlled actor'],
                ['actor.enemy','Enemy actor'],
                ['actor.npc','Non-player character'],
                ['state.alive','Alive gameplay state'],
                ['state.dead','Dead gameplay state'],
                ['state.stunned','Stunned gameplay state'],
                ['state.invulnerable','Invulnerable gameplay state'],
                ['action.attack','Attack gameplay action'],
                ['action.interact','Interaction gameplay action'],
                ['event.damage','Damage gameplay event'],
                ['event.death','Death gameplay event'],
                ['event.spawn','Spawn gameplay event'],
                ['event.respawn','Respawn gameplay event']
            ];
            for(const[tag,description]of defaults)if(!this.tags.hasDefinition(tag))this.tags.define(tag,{description});
        }
        _configureTeams(){
            const level=window.SMRuntime?.getActiveLevel?.();
            const config=level?.worldSettings?.teams||this.world?.settings?.state?.teams||this.world?.settings?.teams||[];
            if(Array.isArray(config)){
                for(const team of config){
                    if(!team?.id)continue;
                    this.teams.createTeam(team.id,team);
                }
            }
            const attitudes=level?.worldSettings?.teamAttitudes||this.world?.settings?.state?.teamAttitudes||this.world?.settings?.teamAttitudes||[];
            if(Array.isArray(attitudes))for(const relation of attitudes||[])if(relation?.a&&relation?.b)this.teams.setAttitude(relation.a,relation.b,relation.attitude||'neutral',{symmetric:relation.symmetric!==false});
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getGameplayRuntime!=='function')runtime.getGameplayRuntime=()=>this;
            if(typeof runtime.getGameplayTags!=='function')runtime.getGameplayTags=()=>window.SMGameplayTags;
            if(typeof runtime.getGameplayEvents!=='function')runtime.getGameplayEvents=()=>window.SMGameplayEventManager;
            if(typeof runtime.getTeamManager!=='function')runtime.getTeamManager=()=>window.SMTeamManager;
            if(typeof runtime.emitGameplayEvent!=='function')runtime.emitGameplayEvent=(type,payload={},options={})=>this.emit(type,payload,options);
            if(typeof runtime.queueGameplayEvent!=='function')runtime.queueGameplayEvent=(type,payload={},options={})=>this.queue(type,payload,options);
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
            const state={registered:this._registered,active:this.active,paused:this.paused,priority:this.priority,tags:this.tags?.definitions?.size||0,eventManager:this.events?.debug?.(),teams:this.teams?.debug?.()};
            console.log('[SMGameplayRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMGameplayRuntimeBridge();
    window.SMGameplayRuntimeBridge=bridge;
    window.smGameplayRuntimeBridge=bridge;
    window.SMGameplayRuntimeBridgeClass=SMGameplayRuntimeBridge;
})();