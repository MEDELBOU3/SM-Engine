(function(){
    'use strict';
    class SMAIRuntimeBridge{
        constructor(){
            this.id='runtime-ai';
            this.priority=790;
            this.session=null;
            this.world=null;
            this.active=false;
            this.paused=false;
            this.components=new Set();
            this.controllers=new Set();
            this._registered=false;
            this._runtimePatched=false;
            this._scanFrame=0;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            if(!this.world)throw new Error('SMAIRuntimeBridge requires an active Runtime World.');
            this.active=true;
            this.paused=false;
            this._scanComponents();
            for(const controller of this.controllers)if(!controller.started)controller.start({world:this.world,session});
            session?.setData?.('aiRuntime',this);
            window.SMRuntimeEventBus?.emit?.('ai:runtime-started',{bridge:this,session,world:this.world});
        }
        update(delta,time){
            if(!this.active||this.paused)return;
            this._scanFrame+=1;
            if(this._scanFrame===1||this._scanFrame%30===0)this._scanComponents();
            for(const controller of Array.from(this.controllers)){
                if(!controller){
                    this.controllers.delete(controller);
                    continue;
                }
                try{controller.update(delta,time);}catch(error){console.error('[SMAIRuntimeBridge] Controller update failed.',error);}
            }
        }
        fixedUpdate(){}
        pause(){
            this.paused=true;
        }
        resume(){
            this.paused=false;
        }
        stop(session,reason='runtime-stop'){
            for(const controller of this.controllers)try{controller.stop(reason);}catch{}
            for(const component of this.components)component.managedByRuntime=false;
            this.components.clear();
            this.controllers.clear();
            session?.deleteData?.('aiRuntime');
            this.active=false;
            this.paused=false;
            this.world=null;
            this.session=null;
            this._scanFrame=0;
            window.SMRuntimeEventBus?.emit?.('ai:runtime-stopped',{bridge:this,session,reason});
        }
        registerComponent(component){
            if(!component)return false;
            const controller=component.ensureController?.({world:this.world||component.world,session:this.session||component.session});
            this.components.add(component);
            if(controller)this.controllers.add(controller);
            if(this.active){
                component.managedByRuntime=true;
                if(controller&&!controller.started)controller.start({world:this.world,session:this.session});
            }
            return controller||component;
        }
        unregisterComponent(component){
            if(!component)return false;
            this.components.delete(component);
            component.managedByRuntime=false;
            if(component.controller){
                component.controller.stop?.('ai-component-unregister');
                this.controllers.delete(component.controller);
            }
            return true;
        }
        registerController(controller){
            if(!controller)return false;
            this.controllers.add(controller);
            if(this.active&&!controller.started)controller.start({world:this.world,session:this.session});
            return controller;
        }
        unregisterController(controller){
            if(!controller)return false;
            controller.stop?.('ai-controller-unregister');
            return this.controllers.delete(controller);
        }
        _scanComponents(){
            const containers=window.SMComponentRuntimeBridge?.containers;
            if(!containers?.values)return 0;
            let count=0;
            for(const container of containers.values()){
                const aiComponents=container.getAll?.('AIPawn')||[];
                for(const component of aiComponents){
                    this.registerComponent(component);
                    component.managedByRuntime=true;
                    count+=1;
                }
            }
            return count;
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getAIRuntime!=='function')runtime.getAIRuntime=()=>this;
            if(typeof runtime.getAIController!=='function')runtime.getAIController=owner=>{
                const object=owner?.object||owner;
                for(const controller of this.controllers)if(controller.object===object||controller.pawn===owner)return controller;
                return object?.getComponent?.('AIPawn')?.controller||null;
            };
            if(typeof runtime.createAIController!=='function')runtime.createAIController=options=>this.registerController(new window.SMAIController({...options,world:options?.world||this.world,session:options?.session||this.session}));
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
            const state={registered:this._registered,active:this.active,paused:this.paused,priority:this.priority,components:this.components.size,controllers:this.controllers.size,controllersData:Array.from(this.controllers).map(controller=>({id:controller.id,pawn:controller.object?.name||controller.object?.uuid||null,status:controller.blackboard?.get?.('behaviorStatus')}))};
            console.log('[SMAIRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMAIRuntimeBridge();
    window.SMAIRuntimeBridge=bridge;
    window.smAIRuntimeBridge=bridge;
    window.SMAIRuntimeBridgeClass=SMAIRuntimeBridge;
})();