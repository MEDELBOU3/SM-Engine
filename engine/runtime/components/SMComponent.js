(function(){
    'use strict';
    class SMComponent{
        constructor(options={}){
            this.id=options.id||`component-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
            this.type=options.type||this.constructor.componentType||this.constructor.name||'SMComponent';
            this.owner=null;
            this.container=null;
            this.world=null;
            this.session=null;
            this.enabled=options.enabled!==false;
            this.started=false;
            this.destroyed=false;
            this.executionOrder=Number(options.executionOrder??this.constructor.executionOrder??0);
            this.tags=new Set(this._normalizeTags(options.tags));
            this.metadata={...(options.metadata||{})};
            this._attached=false;
            this._runtimePaused=false;
        }
        attach(owner,container=null,context={}){
            if(this.destroyed)throw new Error(`${this.type} has already been destroyed.`);
            if(!owner||typeof owner!=='object')throw new TypeError(`${this.type}.attach(owner) requires an object.`);
            if(this._attached&&this.owner===owner)return this;
            if(this._attached)this.detach();
            this.owner=owner;
            this.container=container||null;
            this.world=context.world||container?.world||window.SMRuntime?.getWorld?.()||null;
            this.session=context.session||this.world?.session||window.SMRuntime?.getSession?.()||null;
            this._attached=true;
            this._invokeLifecycle('onAttach',owner,this.world,this.session);
            window.SMRuntimeEventBus?.emit?.('component:attached',{component:this,owner,container:this.container,world:this.world});
            return this;
        }
        detach(){
            if(!this._attached)return false;
            const owner=this.owner;
            const container=this.container;
            this._invokeLifecycle('onDetach',owner,this.world,this.session);
            this.owner=null;
            this.container=null;
            this.world=null;
            this.session=null;
            this._attached=false;
            window.SMRuntimeEventBus?.emit?.('component:detached',{component:this,owner,container});
            return true;
        }
        start(context={}){
            if(this.destroyed||this.started||!this.enabled)return false;
            if(context.world)this.world=context.world;
            if(context.session)this.session=context.session;
            this.started=true;
            this._runtimePaused=false;
            this._invokeLifecycle('onStart',this.world,this.session);
            window.SMRuntimeEventBus?.emit?.('component:started',{component:this,owner:this.owner,world:this.world});
            return true;
        }
        update(delta,time){
            if(!this.enabled||!this.started||this.destroyed||this._runtimePaused)return false;
            this._invokeLifecycle('onUpdate',delta,time,this.world,this.session);
            return true;
        }
        fixedUpdate(delta){
            if(!this.enabled||!this.started||this.destroyed||this._runtimePaused)return false;
            this._invokeLifecycle('onFixedUpdate',delta,this.world,this.session);
            return true;
        }
        lateUpdate(delta,time){
            if(!this.enabled||!this.started||this.destroyed||this._runtimePaused)return false;
            this._invokeLifecycle('onLateUpdate',delta,time,this.world,this.session);
            return true;
        }
        pause(){
            if(!this.started||this.destroyed||this._runtimePaused)return false;
            this._runtimePaused=true;
            this._invokeLifecycle('onPause',this.world,this.session);
            return true;
        }
        resume(){
            if(!this.started||this.destroyed||!this._runtimePaused)return false;
            this._runtimePaused=false;
            this._invokeLifecycle('onResume',this.world,this.session);
            return true;
        }
        stop(reason='runtime-stop'){
            if(!this.started||this.destroyed)return false;
            this._invokeLifecycle('onStop',reason,this.world,this.session);
            this.started=false;
            this._runtimePaused=false;
            return true;
        }
        destroy(reason='destroy'){
            if(this.destroyed)return false;
            if(this.started)this.stop(reason);
            this._invokeLifecycle('onDestroy',reason,this.owner,this.world,this.session);
            const owner=this.owner;
            this.detach();
            this.destroyed=true;
            window.SMRuntimeEventBus?.emit?.('component:destroyed',{component:this,owner,reason});
            return true;
        }
        setEnabled(enabled){
            const next=Boolean(enabled);
            if(next===this.enabled)return this.enabled;
            this.enabled=next;
            this._invokeLifecycle(next?'onEnable':'onDisable',this.world,this.session);
            window.SMRuntimeEventBus?.emit?.('component:enabled-changed',{component:this,owner:this.owner,enabled:next});
            return this.enabled;
        }
        addTag(tag){
            const normalized=String(tag||'').trim().toLowerCase();
            if(!normalized)return false;
            this.tags.add(normalized);
            return true;
        }
        removeTag(tag){
            return this.tags.delete(String(tag||'').trim().toLowerCase());
        }
        hasTag(tag){
            return this.tags.has(String(tag||'').trim().toLowerCase());
        }
        getComponent(type){
            return this.container?.get?.(type)||null;
        }
        getComponents(type=null){
            if(!this.container)return[];
            return type?this.container.getAll(type):this.container.getAll();
        }
        requireComponent(type){
            const component=this.getComponent(type);
            if(!component)throw new Error(`${this.type} requires component "${typeof type==='string'?type:type?.name||'Unknown'}".`);
            return component;
        }
        emit(eventName,payload=null){
            const detail={component:this,owner:this.owner,world:this.world,payload};
            window.SMRuntimeEventBus?.emit?.(`component:${eventName}`,detail);
            this.owner?.dispatchEvent?.({type:`sm:${eventName}`,detail});
            return detail;
        }
        serialize(){
            const data={type:this.type,id:this.id,enabled:this.enabled,executionOrder:this.executionOrder,tags:Array.from(this.tags)};
            const state=this.serializeState();
            if(state&&typeof state==='object')Object.assign(data,state);
            if(Object.keys(this.metadata).length)data.metadata={...this.metadata};
            return data;
        }
        serializeState(){
            return{};
        }
        deserialize(data={}){
            if(data.id!==undefined)this.id=String(data.id);
            if(data.enabled!==undefined)this.enabled=Boolean(data.enabled);
            if(data.executionOrder!==undefined)this.executionOrder=Number(data.executionOrder)||0;
            if(data.tags!==undefined)this.tags=new Set(this._normalizeTags(data.tags));
            if(data.metadata&&typeof data.metadata==='object')this.metadata={...data.metadata};
            this.deserializeState(data);
            return this;
        }
        deserializeState(){
            return this;
        }
        _invokeLifecycle(method,...args){
            const fn=this[method];
            if(typeof fn!=='function'||fn===SMComponent.prototype[method])return false;
            try{
                fn.apply(this,args);
                return true;
            }catch(error){
                console.error(`[SMComponent:${this.type}] ${method}() failed.`,error);
                window.SMRuntimeEventBus?.emit?.('component:error',{component:this,owner:this.owner,method,error});
                return false;
            }
        }
        _normalizeTags(tags){
            if(tags===undefined||tags===null)return[];
            const values=Array.isArray(tags)?tags:String(tags).split(',');
            return Array.from(new Set(values.map(tag=>String(tag).trim().toLowerCase()).filter(Boolean)));
        }
        onAttach(){}
        onDetach(){}
        onStart(){}
        onUpdate(){}
        onFixedUpdate(){}
        onLateUpdate(){}
        onPause(){}
        onResume(){}
        onStop(){}
        onEnable(){}
        onDisable(){}
        onDestroy(){}
        debug(){
            const state={id:this.id,type:this.type,owner:this.owner?.name||this.owner?.uuid||null,enabled:this.enabled,started:this.started,destroyed:this.destroyed,executionOrder:this.executionOrder,tags:Array.from(this.tags)};
            console.log(`[SMComponent:${this.type}]`,state);
            return state;
        }
    }
    SMComponent.componentType='SMComponent';
    SMComponent.executionOrder=0;
    window.SMComponent=SMComponent;
    window.SMComponentClass=SMComponent;
})();