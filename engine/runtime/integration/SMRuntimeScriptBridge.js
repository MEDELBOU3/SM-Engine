(function(){
    'use strict';
    class SMRuntimeScriptBridge{
        constructor(){
            this.id='runtime-scripts';
            this.priority=800;
            this.session=null;
            this.active=false;
            this.paused=false;
            this.adapter=null;
            this.driveUpdate=false;
            this.scriptInstances=new Set();
            this._registered=false;
            this._autoRegister();
        }
        setAdapter(adapter){
            if(adapter!==null&&typeof adapter!=='object')throw new TypeError('SMRuntimeScriptBridge.setAdapter(adapter) expects an object or null.');
            this.adapter=adapter;
            return this;
        }
        setDriveUpdate(enabled){
            this.driveUpdate=Boolean(enabled);
            return this;
        }
        getBackend(){
            if(this.adapter)return this.adapter;
            const candidates=[
                window.scriptManager,
                window.smScriptManager,
                window.SMScriptManager,
                window.runtimeScriptManager,
                window.ScriptManager
            ];
            return candidates.find(candidate=>candidate&&typeof candidate==='object')||null;
        }
        start(session){
            this.session=session;
            this.active=true;
            this.paused=false;
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimeStart','startRuntime','startScripts','start'],session);
            for(const record of this.scriptInstances)this._invokeScript(record,'onStart',session);
            window.SMRuntimeEventBus?.emit?.('scripts:started',{bridge:this,session,backend});
            window.dispatchEvent(new CustomEvent('sm:runtime-scripts-started',{detail:{bridge:this,session,backend}}));
        }
        pause(session){
            if(!this.active)return;
            this.paused=true;
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimePause','pauseRuntime','pauseScripts','pause'],session);
            for(const record of this.scriptInstances)this._invokeScript(record,'onPause',session);
            window.SMRuntimeEventBus?.emit?.('scripts:paused',{bridge:this,session,backend});
        }
        resume(session){
            if(!this.active)return;
            this.paused=false;
            const backend=this.getBackend();
            this._callFirst(backend,['onRuntimeResume','resumeRuntime','resumeScripts','resume'],session);
            for(const record of this.scriptInstances)this._invokeScript(record,'onResume',session);
            window.SMRuntimeEventBus?.emit?.('scripts:resumed',{bridge:this,session,backend});
        }
        update(delta,time,session){
            if(!this.active||this.paused)return;
            const backend=this.getBackend();
            if(this.driveUpdate){
                if(typeof this.adapter?.update==='function')this.adapter.update(delta,time,session);
                else if(typeof backend?.update==='function')backend.update(delta,time,session);
            }
            for(const record of this.scriptInstances){
                if(record.enabled!==false)this._invokeScript(record,'onUpdate',delta,time,session);
            }
        }
        fixedUpdate(delta,session){
            if(!this.active||this.paused)return;
            const backend=this.getBackend();
            if(this.driveUpdate){
                if(typeof this.adapter?.fixedUpdate==='function')this.adapter.fixedUpdate(delta,session);
                else if(typeof backend?.fixedUpdate==='function')backend.fixedUpdate(delta,session);
            }
            for(const record of this.scriptInstances){
                if(record.enabled!==false)this._invokeScript(record,'onFixedUpdate',delta,session);
            }
        }
        stop(session,reason='user'){
            const backend=this.getBackend();
            for(const record of Array.from(this.scriptInstances)){
                this._invokeScript(record,'onStop',session,reason);
                if(record.destroyOnStop===true)this._invokeScript(record,'onDestroy',session,reason);
            }
            this._callFirst(backend,['onRuntimeStop','stopRuntime','stopScripts','stop'],session,reason);
            this.active=false;
            this.paused=false;
            this.session=null;
            window.SMRuntimeEventBus?.emit?.('scripts:stopped',{bridge:this,session,backend,reason});
            window.dispatchEvent(new CustomEvent('sm:runtime-scripts-stopped',{detail:{bridge:this,session,backend,reason}}));
        }
        registerScript(instance,options={}){
            if(!instance||typeof instance!=='object')throw new TypeError('registerScript(instance) expects an object.');
            const record={instance,enabled:options.enabled!==false,destroyOnStop:options.destroyOnStop===true,owner:options.owner||null};
            this.scriptInstances.add(record);
            if(this.active&&!this.paused)this._invokeScript(record,'onStart',this.session);
            return()=>this.unregisterScript(instance);
        }
        unregisterScript(instance){
            for(const record of Array.from(this.scriptInstances)){
                if(record.instance===instance){
                    if(this.active)this._invokeScript(record,'onStop',this.session,'unregister');
                    this.scriptInstances.delete(record);
                    return true;
                }
            }
            return false;
        }
        setScriptEnabled(instance,enabled){
            for(const record of this.scriptInstances){
                if(record.instance===instance){
                    record.enabled=Boolean(enabled);
                    return true;
                }
            }
            return false;
        }
        dispatchCollision(method,self,other,contact=null){
            for(const record of this.scriptInstances){
                if(record.enabled===false)continue;
                if(record.owner&&record.owner!==self)continue;
                this._invokeScript(record,method,other,contact,self,this.session);
            }
        }
        onCollisionEnter(self,other,contact=null){
            this.dispatchCollision('onCollisionEnter',self,other,contact);
        }
        onCollisionExit(self,other,contact=null){
            this.dispatchCollision('onCollisionExit',self,other,contact);
        }
        onTriggerEnter(self,other,contact=null){
            this.dispatchCollision('onTriggerEnter',self,other,contact);
        }
        onTriggerExit(self,other,contact=null){
            this.dispatchCollision('onTriggerExit',self,other,contact);
        }
        _invokeScript(record,method,...args){
            const instance=record?.instance||record;
            if(typeof instance?.[method]!=='function')return false;
            try{
                instance[method](...args);
                return true;
            }catch(error){
                console.error(`[SMRuntimeScriptBridge] ${method}() failed.`,error);
                window.SMRuntimeEventBus?.emit?.('scripts:error',{bridge:this,method,instance,error});
                return false;
            }
        }
        _callFirst(target,names,...args){
            if(!target)return false;
            for(const name of names){
                if(typeof target[name]==='function'){
                    try{
                        target[name](...args);
                        return true;
                    }catch(error){
                        console.warn(`[SMRuntimeScriptBridge] ${name}() failed.`,error);
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
            const backend=this.getBackend();
            const state={registered:this._registered,active:this.active,paused:this.paused,driveUpdate:this.driveUpdate,backend:backend?.constructor?.name||typeof backend,scripts:this.scriptInstances.size};
            console.log('[SMRuntimeScriptBridge]',state);
            return state;
        }
    }
    const bridge=new SMRuntimeScriptBridge();
    window.SMRuntimeScriptBridge=bridge;
    window.smRuntimeScriptBridge=bridge;
    window.SMRuntimeScriptBridgeClass=SMRuntimeScriptBridge;
})();