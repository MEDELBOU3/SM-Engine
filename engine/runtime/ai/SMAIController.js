(function(){
    'use strict';
    class SMAIController{
        constructor(options={}){
            this.id=String(options.id||`ai-controller-${Date.now()}-${Math.random().toString(36).slice(2,7)}`);
            this.enabled=options.enabled!==false;
            this.pawn=null;
            this.object=null;
            this.world=options.world||null;
            this.session=options.session||null;
            this.blackboard=options.blackboard instanceof window.SMBlackboard?options.blackboard:new window.SMBlackboard(options.blackboard||{});
            this.behaviorTree=options.behaviorTree instanceof window.SMBehaviorTree?options.behaviorTree:new window.SMBehaviorTree(options.behaviorTree||{type:'action',action:'Idle'});
            this.navigation=null;
            this.tickInterval=Math.max(0,Number(options.tickInterval??0.1));
            this._tickAccumulator=0;
            this.started=false;
            this.metadata={...(options.metadata||{})};
            if(options.pawn)this.possess(options.pawn,options);
        }
        possess(pawn,options={}){
            this.pawn=pawn||null;
            this.object=pawn?.object||pawn||null;
            this.world=options.world||this.world||window.SMRuntime?.getWorld?.()||null;
            this.session=options.session||this.session||this.world?.session||null;
            this.navigation=new window.SMNavigationAgent(this.object,{...(options.navigation||{}),character:this.object?.getComponent?.('Character')||null});
            if(this.object){
                this.object.userData=this.object.userData||{};
                this.object.userData.aiControllerId=this.id;
                if(!this.object.userData.runtimeType)this.object.userData.runtimeType='ai-pawn';
                const tags=Array.isArray(this.object.userData.tags)?this.object.userData.tags.slice():[];
                if(!tags.includes('ai'))tags.push('ai');
                this.object.userData.tags=tags;
            }
            this.blackboard.set('self',this.object,{silent:true});
            this.blackboard.set('controller',this,{silent:true});
            window.SMRuntimeEventBus?.emit?.('ai:possessed',{controller:this,pawn:this.pawn,object:this.object});
            return this.pawn;
        }
        unpossess(){
            const pawn=this.pawn;
            this.navigation?.stop?.();
            this.pawn=null;
            this.object=null;
            this.navigation=null;
            this.blackboard.delete('self');
            window.SMRuntimeEventBus?.emit?.('ai:unpossessed',{controller:this,pawn});
            return pawn;
        }
        start(context={}){
            this.world=context.world||this.world||window.SMRuntime?.getWorld?.()||null;
            this.session=context.session||this.session||this.world?.session||null;
            this.started=true;
            this._tickAccumulator=0;
            this.behaviorTree?.reset?.();
            window.SMRuntimeEventBus?.emit?.('ai:controller-started',{controller:this,pawn:this.pawn});
            return true;
        }
        stop(reason='runtime-stop'){
            this.started=false;
            this.navigation?.stop?.();
            this.behaviorTree?.reset?.();
            window.SMRuntimeEventBus?.emit?.('ai:controller-stopped',{controller:this,pawn:this.pawn,reason});
            return true;
        }
        update(delta,time=null){
            if(!this.enabled||!this.started)return false;
            const dt=Math.max(0,Number(delta)||0);
            this._tickAccumulator+=dt;
            if(this.tickInterval===0||this._tickAccumulator>=this.tickInterval){
                const behaviorDt=this._tickAccumulator;
                this._tickAccumulator=0;
                const status=this.behaviorTree?.tick?.({controller:this,pawn:this.pawn,object:this.object,world:this.world,session:this.session,blackboard:this.blackboard,time},behaviorDt);
                this.blackboard.set('behaviorStatus',status,{silent:true});
            }
            this.navigation?.update?.(dt);
            return true;
        }
        setBehaviorTree(treeOrDefinition){
            this.behaviorTree=treeOrDefinition instanceof window.SMBehaviorTree?treeOrDefinition:new window.SMBehaviorTree(treeOrDefinition||{type:'action',action:'Idle'});
            return this.behaviorTree;
        }
        moveTo(destination){
            this.blackboard.set('destination',this._destinationSnapshot(destination));
            return this.navigation?.setDestination?.(destination)||false;
        }
        stopMovement(){
            this.blackboard.delete('destination');
            return this.navigation?.stop?.()||false;
        }
        setTarget(target){
            this.blackboard.set('target',target);
            return target;
        }
        clearTarget(){
            this.blackboard.delete('target');
            return true;
        }
        getTarget(){
            return this.blackboard.get('target',null);
        }
        distanceTo(target){
            const object=target?.object||target;
            if(!this.object||!object)return Infinity;
            const a=this._position(this.object);
            const b=this._position(object);
            return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
        }
        findNearestByTag(tag,maxDistance=Infinity){
            const records=this.world?.registry?.findByTag?.(tag)||[];
            let best=null;
            let bestDistance=Number(maxDistance);
            for(const record of records){
                const object=record?.object||record;
                if(!object||object===this.object)continue;
                const distance=this.distanceTo(object);
                if(distance<bestDistance){best=object;bestDistance=distance;}
            }
            return best;
        }
        findNearestByType(type,maxDistance=Infinity){
            const records=this.world?.registry?.findByType?.(type)||[];
            let best=null;
            let bestDistance=Number(maxDistance);
            for(const record of records){
                const object=record?.object||record;
                if(!object||object===this.object)continue;
                const distance=this.distanceTo(object);
                if(distance<bestDistance){best=object;bestDistance=distance;}
            }
            return best;
        }
        _position(object){
            if(object?.getWorldPosition&&window.THREE?.Vector3){
                const value=object.getWorldPosition(new THREE.Vector3());
                return{x:value.x,y:value.y,z:value.z};
            }
            return{x:Number(object?.position?.x||0),y:Number(object?.position?.y||0),z:Number(object?.position?.z||0)};
        }
        _destinationSnapshot(value){
            const object=value?.object||value;
            if(object?.isObject3D)return this._position(object);
            if(Array.isArray(object))return{x:Number(object[0]||0),y:Number(object[1]||0),z:Number(object[2]||0)};
            if(object&&typeof object==='object')return{x:Number(object.x||0),y:Number(object.y||0),z:Number(object.z||0)};
            return null;
        }
        serialize(){
            return{id:this.id,enabled:this.enabled,tickInterval:this.tickInterval,metadata:{...this.metadata},blackboard:this.blackboard.serialize(),behaviorTree:this.behaviorTree.serialize(),navigation:this.navigation?.serialize?.()||null};
        }
        debug(){
            const state={id:this.id,enabled:this.enabled,started:this.started,pawn:this.pawn?.id||this.object?.name||null,tickInterval:this.tickInterval,target:this.getTarget()?.name||this.getTarget()?.uuid||null,behaviorStatus:this.blackboard.get('behaviorStatus'),navigation:this.navigation?.debug?.()};
            console.log('[SMAIController]',state);
            return state;
        }
    }
    window.SMAIController=SMAIController;
    window.SMAIControllerClass=SMAIController;
})();