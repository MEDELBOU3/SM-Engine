(function(){
    'use strict';
    class SMAIPawnComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:'AIPawn'});
            this.controllerId=options.controllerId||null;
            this.tickInterval=Math.max(0,Number(options.tickInterval??0.1));
            this.autoStart=options.autoStart!==false;
            this.behaviorTreeDefinition=options.behaviorTree||{type:'action',action:'Idle'};
            this.blackboardInitial={...(options.blackboard||{})};
            this.navigationOptions={...(options.navigation||{})};
            this.controller=null;
            this.managedByRuntime=false;
            this.fixedTickEnabled=false;
            this.lateTickEnabled=false;
        }
        onAttach(){
            if(this.owner){
                this.owner.userData=this.owner.userData||{};
                this.owner.userData.runtimeType=this.owner.userData.runtimeType||'ai-pawn';
                const tags=Array.isArray(this.owner.userData.tags)?this.owner.userData.tags.slice():[];
                if(!tags.includes('ai'))tags.push('ai');
                this.owner.userData.tags=tags;
            }
        }
        onStart(world,session){
            this.ensureController({world,session});
            window.SMAIRuntimeBridge?.registerComponent?.(this);
            if(this.autoStart&&!this.managedByRuntime)this.controller?.start?.({world,session});
        }
        onUpdate(delta,time){
            if(this.managedByRuntime)return;
            this.controller?.update?.(delta,time);
        }
        onStop(reason){
            window.SMAIRuntimeBridge?.unregisterComponent?.(this);
            if(!this.managedByRuntime)this.controller?.stop?.(reason);
        }
        onDestroy(){
            window.SMAIRuntimeBridge?.unregisterComponent?.(this);
            this.controller?.stop?.('component-destroy');
            this.controller=null;
        }
        ensureController(context={}){
            if(this.controller){
                if(context.world)this.controller.world=context.world;
                if(context.session)this.controller.session=context.session;
                return this.controller;
            }
            this.controller=new window.SMAIController({id:this.controllerId||undefined,pawn:this.owner,world:context.world||this.world,session:context.session||this.session,tickInterval:this.tickInterval,blackboard:this.blackboardInitial,behaviorTree:this.behaviorTreeDefinition,navigation:this.navigationOptions});
            this.controllerId=this.controller.id;
            return this.controller;
        }
        setBehaviorTree(treeOrDefinition){
            this.behaviorTreeDefinition=treeOrDefinition instanceof window.SMBehaviorTree?treeOrDefinition.serialize():treeOrDefinition;
            return this.ensureController().setBehaviorTree(treeOrDefinition);
        }
        setTarget(target){
            return this.ensureController().setTarget(target);
        }
        moveTo(destination){
            return this.ensureController().moveTo(destination);
        }
        stopMovement(){
            return this.ensureController().stopMovement();
        }
        get blackboard(){
            return this.ensureController().blackboard;
        }
        serializeState(){
            return{controllerId:this.controllerId,tickInterval:this.tickInterval,autoStart:this.autoStart,behaviorTree:this.controller?.behaviorTree?.serialize?.()||this.behaviorTreeDefinition,blackboard:this.controller?.blackboard?.serialize?.()||this.blackboardInitial,navigation:this.controller?.navigation?.serialize?.()||this.navigationOptions};
        }
        deserializeState(data={}){
            if(data.controllerId!==undefined)this.controllerId=data.controllerId||null;
            if(data.tickInterval!==undefined)this.tickInterval=Math.max(0,Number(data.tickInterval)||0);
            if(data.autoStart!==undefined)this.autoStart=Boolean(data.autoStart);
            if(data.behaviorTree!==undefined)this.behaviorTreeDefinition=data.behaviorTree;
            if(data.blackboard!==undefined)this.blackboardInitial={...(data.blackboard||{})};
            if(data.navigation!==undefined)this.navigationOptions={...(data.navigation||{})};
            if(this.controller){
                this.controller.tickInterval=this.tickInterval;
                this.controller.setBehaviorTree(this.behaviorTreeDefinition);
                this.controller.blackboard.deserialize(this.blackboardInitial);
            }
            return this;
        }
        debug(){
            const base=super.debug();
            const state={...base,controllerId:this.controllerId,managedByRuntime:this.managedByRuntime,controller:this.controller?.debug?.()};
            console.log('[SMAIPawnComponent]',state);
            return state;
        }
    }
    SMAIPawnComponent.componentType='AIPawn';
    SMAIPawnComponent.executionOrder=10;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(window.SMComponentRegistry.has?.('AIPawn'))return true;
        window.SMComponentRegistry.register('AIPawn',SMAIPawnComponent,{displayName:'AI Pawn',category:'AI',description:'AI controller, blackboard, behavior tree and navigation owner.',allowMultiple:false,aliases:['SMAIPawnComponent'],executionOrder:10});
        return true;
    };
    window.SMAIPawnComponent=SMAIPawnComponent;
    window.SMAIPawnComponentClass=SMAIPawnComponent;
    if(!register())queueMicrotask(register);
    window.addEventListener?.('sm:runtime-ready',register,{once:true});
})();