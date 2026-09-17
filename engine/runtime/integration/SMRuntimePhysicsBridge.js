(function(){
    'use strict';
    class SMRuntimePhysicsBridge{
        constructor(){
            this.id='runtime-physics';
            this.priority=900;
            this.session=null;
            this.active=false;
            this.paused=false;
            this.driveUpdate=false;
            this.fixedStep=true;
            this.adapter=null;
            this.runtimeBodies=new Set();
            this._registered=false;
            this._lastBackend=null;
            this._autoRegister();
        }
        setAdapter(adapter){
            if(adapter!==null&&typeof adapter!=='object')throw new TypeError('SMRuntimePhysicsBridge.setAdapter(adapter) expects an object or null.');
            this.adapter=adapter;
            return this;
        }
        setDriveUpdate(enabled){
            this.driveUpdate=Boolean(enabled);
            return this;
        }
        setFixedStep(enabled){
            this.fixedStep=Boolean(enabled);
            return this;
        }
        getBackend(){
            if(this.adapter)return this.adapter;
            const candidates=[
                window.physicsSystem,
                window.smPhysicsSystem,
                window.SMPhysicsSystem,
                window.playerPhysicsController,
                window.PlayerPhysicsController,
                window.physicsWorld
            ];
            return candidates.find(candidate=>candidate&&typeof candidate==='object')||null;
        }
        start(session){
            this.session=session;
            this.active=true;
            this.paused=false;
            const backend=this.getBackend();
            this._lastBackend=backend;
            this._callFirst(backend,['onRuntimeStart','startRuntime','startSimulation','resumeSimulation','resume'],session);
            if(backend&&'enabled'in backend)backend.enabled=true;
            window.SMRuntimeEventBus?.emit?.('physics:started',{bridge:this,session,backend});
            window.dispatchEvent(new CustomEvent('sm:runtime-physics-started',{detail:{bridge:this,session,backend}}));
        }
        pause(session){
            this.paused=true;
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimePause','pauseRuntime','pauseSimulation','pause'],session);
            window.SMRuntimeEventBus?.emit?.('physics:paused',{bridge:this,session,backend});
        }
        resume(session){
            this.paused=false;
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimeResume','resumeRuntime','resumeSimulation','resume'],session);
            window.SMRuntimeEventBus?.emit?.('physics:resumed',{bridge:this,session,backend});
        }
        update(delta,time,session){
            if(!this.active||this.paused||!this.driveUpdate||this.fixedStep)return;
            const backend=this.getBackend();
            if(!backend)return;
            if(typeof backend.update==='function')backend.update(delta,time,session);
            else if(typeof backend.step==='function')backend.step(delta);
        }
        fixedUpdate(delta,session){
            if(!this.active||this.paused||!this.driveUpdate||!this.fixedStep)return;
            const backend=this.getBackend();
            if(!backend)return;
            if(typeof backend.fixedUpdate==='function')backend.fixedUpdate(delta,session);
            else if(typeof backend.stepSimulation==='function')backend.stepSimulation(delta);
            else if(typeof backend.step==='function')backend.step(delta);
            else if(typeof backend.update==='function')backend.update(delta,performance.now(),session);
        }
        stop(session,reason='user'){
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimeStop','stopRuntime','stopSimulation','pauseSimulation'],session,reason);
            this._removeRuntimeBodies();
            this.active=false;
            this.paused=false;
            this.session=null;
            window.SMRuntimeEventBus?.emit?.('physics:stopped',{bridge:this,session,backend,reason});
            window.dispatchEvent(new CustomEvent('sm:runtime-physics-stopped',{detail:{bridge:this,session,backend,reason}}));
        }
        registerRuntimeBody(body,options={}){
            if(!body)return body;
            const record={body,remove:typeof options.remove==='function'?options.remove:null,owner:options.owner||null};
            this.runtimeBodies.add(record);
            return body;
        }
        unregisterRuntimeBody(body){
            for(const record of Array.from(this.runtimeBodies)){
                if(record.body===body){
                    this.runtimeBodies.delete(record);
                    return true;
                }
            }
            return false;
        }
        raycast(...args){
            const backend=this.getBackend();
            if(typeof this.adapter?.raycast==='function')return this.adapter.raycast(...args);
            if(typeof backend?.raycast==='function')return backend.raycast(...args);
            if(typeof backend?.rayTest==='function')return backend.rayTest(...args);
            return null;
        }
        overlapSphere(...args){
            const backend=this.getBackend();
            if(typeof this.adapter?.overlapSphere==='function')return this.adapter.overlapSphere(...args);
            if(typeof backend?.overlapSphere==='function')return backend.overlapSphere(...args);
            return [];
        }
        _removeRuntimeBodies(){
            const backend=this.getBackend();
            for(const record of Array.from(this.runtimeBodies)){
                try{
                    if(record.remove)record.remove(record.body,backend);
                    else if(typeof backend?.removeBody==='function')backend.removeBody(record.body);
                    else if(typeof backend?.removeRigidBody==='function')backend.removeRigidBody(record.body);
                    else if(typeof backend?.world?.removeBody==='function')backend.world.removeBody(record.body);
                }catch(error){
                    console.warn('[SMRuntimePhysicsBridge] Runtime body cleanup failed.',error);
                }
            }
            this.runtimeBodies.clear();
        }
        _callFirst(target,names,...args){
            if(!target)return false;
            for(const name of names){
                if(typeof target[name]==='function'){
                    try{
                        target[name](...args);
                        return true;
                    }catch(error){
                        console.warn(`[SMRuntimePhysicsBridge] ${name}() failed.`,error);
                        return false;
                    }
                }
            }
            return false;
        }
        _autoRegister(){
            const register=()=>{
                if(this._registered||!window.SMRuntime?.registerSystem)return false;
                window.SMRuntime.registerSystem(this.id,this,{priority:this.priority});
                this._registered=true;
                return true;
            };
            if(!register())window.addEventListener('sm:runtime-ready',register,{once:true});
        }
        debug(){
            const state={registered:this._registered,active:this.active,paused:this.paused,driveUpdate:this.driveUpdate,fixedStep:this.fixedStep,backend:this.getBackend()?.constructor?.name||typeof this.getBackend(),runtimeBodies:this.runtimeBodies.size};
            console.log('[SMRuntimePhysicsBridge]',state);
            return state;
        }
    }
    const bridge=new SMRuntimePhysicsBridge();
    window.SMRuntimePhysicsBridge=bridge;
    window.smRuntimePhysicsBridge=bridge;
    window.SMRuntimePhysicsBridgeClass=SMRuntimePhysicsBridge;
})();