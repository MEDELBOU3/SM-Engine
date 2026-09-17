(function(){
    'use strict';
    class SMComponentRuntimeBridge{
        constructor(){
            this.id='runtime-components';
            this.priority=850;
            this.session=null;
            this.world=null;
            this.active=false;
            this.paused=false;
            this.containers=new Map();
            this._registered=false;
            this._unsubscribers=[];
            this._lateUpdateQueued=false;
            this._autoRegister();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            if(!this.world)throw new Error('SMComponentRuntimeBridge requires an active SMRuntimeWorld.');
            this.active=true;
            this.paused=false;
            this._bindWorldEvents();
            this._scanWorld();
            for(const container of this._orderedContainers())container.start({world:this.world,session:this.session});
            window.SMRuntimeEventBus?.emit?.('components:started',{bridge:this,world:this.world,containers:this.containers.size});
            window.dispatchEvent(new CustomEvent('sm:runtime-components-started',{detail:{bridge:this,world:this.world,containers:this.containers.size}}));
        }
        pause(){
            if(!this.active||this.paused)return;
            this.paused=true;
            for(const container of this._orderedContainers())container.pause();
            window.SMRuntimeEventBus?.emit?.('components:paused',{bridge:this,world:this.world});
        }
        resume(){
            if(!this.active||!this.paused)return;
            this.paused=false;
            for(const container of this._orderedContainers())container.resume();
            window.SMRuntimeEventBus?.emit?.('components:resumed',{bridge:this,world:this.world});
        }
        update(delta,time){
            if(!this.active||this.paused)return;
            const worldDelta=Math.max(0,Number(delta)||0)*(this.world?.settings?.timeScale??1);
            for(const container of this._orderedContainers())container.update(worldDelta,time);
            for(const container of this._orderedContainers())container.lateUpdate(worldDelta,time);
        }
        fixedUpdate(delta){
            if(!this.active||this.paused)return;
            const worldDelta=Math.max(0,Number(delta)||0)*(this.world?.settings?.timeScale??1);
            for(const container of this._orderedContainers())container.fixedUpdate(worldDelta);
        }
        stop(session,reason='runtime-stop'){
            for(const container of [...this._orderedContainers()].reverse())container.stop(reason);
            this._unbindWorldEvents();
            this.containers.clear();
            this.active=false;
            this.paused=false;
            this.world=null;
            this.session=null;
            window.SMRuntimeEventBus?.emit?.('components:stopped',{bridge:this,session,reason});
            window.dispatchEvent(new CustomEvent('sm:runtime-components-stopped',{detail:{bridge:this,session,reason}}));
        }
        ensureContainer(object,options={}){
            if(!object||typeof object!=='object')return null;
            const key=object.uuid||object;
            if(this.containers.has(key))return this.containers.get(key);
            let container=object.components instanceof window.SMComponentContainer?object.components:null;
            if(!container)container=new window.SMComponentContainer(object,{world:this.world,session:this.session});
            else{
                container.world=this.world;
                container.session=this.session;
            }
            this.containers.set(key,container);
            const descriptors=options.descriptors!==undefined?options.descriptors:object.userData?.components;
            if(Array.isArray(descriptors)&&descriptors.length&&!container.components.length)container.hydrate(descriptors);
            if(this.active&&!container.started)container.start({world:this.world,session:this.session});
            if(this.paused&&container.started)container.pause();
            window.SMRuntimeEventBus?.emit?.('components:container-ready',{bridge:this,world:this.world,object,container});
            return container;
        }
        removeContainer(object,options={}){
            if(!object)return false;
            const key=object.uuid||object;
            const container=this.containers.get(key)||object.components;
            if(!(container instanceof window.SMComponentContainer))return false;
            if(options.destroy===true)container.destroy(options.reason||'object-removed');
            else container.stop(options.reason||'object-removed');
            this.containers.delete(key);
            return true;
        }
        getContainer(object){
            if(!object)return null;
            return this.containers.get(object.uuid||object)||object.components||null;
        }
        addComponent(object,componentOrType,options={}){
            const container=this.ensureContainer(object);
            if(!container)throw new Error('Cannot add component without a valid owner.');
            return container.add(componentOrType,options);
        }
        removeComponent(object,componentOrType,options={}){
            return this.getContainer(object)?.remove?.(componentOrType,options)||false;
        }
        dispatchCollision(method,self,other,contact=null){
            const container=this.getContainer(self);
            if(!container)return 0;
            return container.dispatch(method,other,contact,self,this.world,this.session);
        }
        onCollisionEnter(self,other,contact=null){
            return this.dispatchCollision('onCollisionEnter',self,other,contact);
        }
        onCollisionStay(self,other,contact=null){
            return this.dispatchCollision('onCollisionStay',self,other,contact);
        }
        onCollisionExit(self,other,contact=null){
            return this.dispatchCollision('onCollisionExit',self,other,contact);
        }
        onTriggerEnter(self,other,contact=null){
            return this.dispatchCollision('onTriggerEnter',self,other,contact);
        }
        onTriggerStay(self,other,contact=null){
            return this.dispatchCollision('onTriggerStay',self,other,contact);
        }
        onTriggerExit(self,other,contact=null){
            return this.dispatchCollision('onTriggerExit',self,other,contact);
        }
        saveObjectComponents(object){
            return this.getContainer(object)?.saveToOwner?.()||[];
        }
        _scanWorld(){
            if(!this.world?.registry)return;
            for(const record of this.world.registry.records.values())this.ensureContainer(record.object);
        }
        _bindWorldEvents(){
            this._unbindWorldEvents();
            const bus=window.SMRuntimeEventBus;
            if(!bus?.on)return;
            this._unsubscribers.push(bus.on('world:object-registered',payload=>{
                if(payload?.world!==this.world)return;
                this.ensureContainer(payload.record?.object);
            }));
            this._unsubscribers.push(bus.on('world:object-unregistered',payload=>{
                if(payload?.world!==this.world)return;
                this.removeContainer(payload.record?.object,{destroy:payload.record?.runtimeOwned===true,reason:'world-unregistered'});
            }));
            this._unsubscribers.push(bus.on('world:destroyed',payload=>{
                if(payload?.world!==this.world)return;
                this.removeContainer(payload.object,{destroy:true,reason:'world-destroyed'});
            }));
        }
        _unbindWorldEvents(){
            for(const unsubscribe of this._unsubscribers.splice(0)){
                try{unsubscribe?.();}catch{}
            }
        }
        _orderedContainers(){
            return Array.from(this.containers.values()).sort((a,b)=>{
                const aName=String(a.owner?.name||a.owner?.uuid||'');
                const bName=String(b.owner?.name||b.owner?.uuid||'');
                return aName.localeCompare(bName);
            });
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
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime)return false;
            if(typeof runtime.getComponentContainer!=='function')runtime.getComponentContainer=object=>this.getContainer(object);
            if(typeof runtime.addComponent!=='function')runtime.addComponent=(object,componentOrType,options={})=>this.addComponent(object,componentOrType,options);
            if(typeof runtime.removeComponent!=='function')runtime.removeComponent=(object,componentOrType,options={})=>this.removeComponent(object,componentOrType,options);
            return true;
        }
        debug(){
            const state={registered:this._registered,active:this.active,paused:this.paused,priority:this.priority,world:this.world?.id||null,containers:this.containers.size,components:Array.from(this.containers.values()).reduce((sum,container)=>sum+container.components.length,0)};
            console.log('[SMComponentRuntimeBridge]',state);
            return state;
        }
    }
    const bridge=new SMComponentRuntimeBridge();
    window.SMComponentRuntimeBridge=bridge;
    window.smComponentRuntimeBridge=bridge;
    window.SMComponentRuntimeBridgeClass=SMComponentRuntimeBridge;
})();