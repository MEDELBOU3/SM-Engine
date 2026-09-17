(function(){
    'use strict';
    class SMComponentContainer{
        constructor(owner,options={}){
            if(!owner||typeof owner!=='object')throw new TypeError('SMComponentContainer requires an owner object.');
            this.owner=owner;
            this.world=options.world||window.SMRuntime?.getWorld?.()||null;
            this.session=options.session||this.world?.session||window.SMRuntime?.getSession?.()||null;
            this.components=[];
            this.started=false;
            this.paused=false;
            this.destroyed=false;
            this._attachOwnerAPI();
        }
        add(componentOrType,options={}){
            if(this.destroyed)throw new Error('Cannot add a component to a destroyed container.');
            let component=componentOrType;
            if(typeof componentOrType==='string'||typeof componentOrType==='function'){
                component=window.SMComponentRegistry?.create?.(componentOrType,options);
            }else if(componentOrType&&!(componentOrType instanceof window.SMComponent)&&componentOrType.type){
                component=window.SMComponentRegistry?.createFromDescriptor?.(componentOrType);
            }
            if(!(component instanceof window.SMComponent))throw new TypeError('SMComponentContainer.add() expects an SMComponent, registered type or descriptor.');
            const metadata=window.SMComponentRegistry?.getMetadata?.(component.type)||window.SMComponentRegistry?.getMetadata?.(component.constructor)||null;
            if(metadata?.allowMultiple===false||metadata?.singleton===true){
                const existing=this.get(component.type)||this.get(component.constructor);
                if(existing&&existing!==component){
                    if(options.replace===true)this.remove(existing,{destroy:true});
                    else return existing;
                }
            }
            if(this.components.includes(component))return component;
            component.attach(this.owner,this,{world:this.world,session:this.session});
            this.components.push(component);
            this._sort();
            if(this.started&&component.enabled)component.start({world:this.world,session:this.session});
            if(this.paused&&component.started)component.pause();
            window.SMRuntimeEventBus?.emit?.('component-container:added',{container:this,owner:this.owner,component});
            return component;
        }
        remove(componentOrType,options={}){
            const component=componentOrType instanceof window.SMComponent?componentOrType:this.get(componentOrType);
            if(!component)return false;
            const index=this.components.indexOf(component);
            if(index<0)return false;
            this.components.splice(index,1);
            if(component.started)component.stop(options.reason||'removed');
            if(options.destroy===true)component.destroy(options.reason||'removed');
            else component.detach();
            window.SMRuntimeEventBus?.emit?.('component-container:removed',{container:this,owner:this.owner,component});
            return true;
        }
        get(type){
            if(!type)return null;
            if(typeof type==='function')return this.components.find(component=>component instanceof type)||null;
            const target=window.SMComponentRegistry?.resolveType?.(type)||String(type).trim().toLowerCase();
            return this.components.find(component=>{
                const own=window.SMComponentRegistry?.resolveType?.(component.constructor)||window.SMComponentRegistry?.resolveType?.(component.type)||String(component.type).trim().toLowerCase();
                return own===target||String(component.type).toLowerCase()===String(type).toLowerCase()||component.constructor.name===type;
            })||null;
        }
        getAll(type=null){
            if(!type)return this.components.slice();
            if(typeof type==='function')return this.components.filter(component=>component instanceof type);
            const target=window.SMComponentRegistry?.resolveType?.(type)||String(type).trim().toLowerCase();
            return this.components.filter(component=>{
                const own=window.SMComponentRegistry?.resolveType?.(component.constructor)||window.SMComponentRegistry?.resolveType?.(component.type)||String(component.type).trim().toLowerCase();
                return own===target||String(component.type).toLowerCase()===String(type).toLowerCase()||component.constructor.name===type;
            });
        }
        has(type){
            return Boolean(this.get(type));
        }
        start(context={}){
            if(this.destroyed||this.started)return false;
            if(context.world)this.world=context.world;
            if(context.session)this.session=context.session;
            this.started=true;
            this.paused=false;
            for(const component of this.components){
                component.world=this.world;
                component.session=this.session;
                if(component.enabled)component.start({world:this.world,session:this.session});
            }
            window.SMRuntimeEventBus?.emit?.('component-container:started',{container:this,owner:this.owner,world:this.world});
            return true;
        }
        update(delta,time){
            if(!this.started||this.paused||this.destroyed||this.owner?.userData?.smEntity?.active===false)return false;
            for(const component of this.components)component.update(delta,time);
            return true;
        }
        fixedUpdate(delta){
            if(!this.started||this.paused||this.destroyed||this.owner?.userData?.smEntity?.active===false)return false;
            for(const component of this.components)component.fixedUpdate(delta);
            return true;
        }
        lateUpdate(delta,time){
            if(!this.started||this.paused||this.destroyed||this.owner?.userData?.smEntity?.active===false)return false;
            for(const component of this.components)component.lateUpdate(delta,time);
            return true;
        }
        pause(){
            if(!this.started||this.paused||this.destroyed)return false;
            this.paused=true;
            for(const component of this.components)component.pause();
            return true;
        }
        resume(){
            if(!this.started||!this.paused||this.destroyed)return false;
            this.paused=false;
            for(const component of this.components)component.resume();
            return true;
        }
        stop(reason='runtime-stop'){
            if(!this.started||this.destroyed)return false;
            for(const component of [...this.components].reverse())component.stop(reason);
            this.started=false;
            this.paused=false;
            return true;
        }
        destroy(reason='destroy'){
            if(this.destroyed)return false;
            if(this.started)this.stop(reason);
            for(const component of [...this.components].reverse())component.destroy(reason);
            this.components.length=0;
            this.destroyed=true;
            this._detachOwnerAPI();
            window.SMRuntimeEventBus?.emit?.('component-container:destroyed',{container:this,owner:this.owner,reason});
            return true;
        }
        hydrate(descriptors,options={}){
            if(!Array.isArray(descriptors))return[];
            const created=[];
            for(const descriptor of descriptors){
                try{
                    created.push(this.add(descriptor,options));
                }catch(error){
                    console.error('[SMComponentContainer] Failed to hydrate component.',descriptor,error);
                    window.SMRuntimeEventBus?.emit?.('component-container:hydrate-error',{container:this,owner:this.owner,descriptor,error});
                }
            }
            return created;
        }
        serialize(){
            return this.components.map(component=>window.SMComponentRegistry?.serialize?.(component)||component.serialize?.()).filter(Boolean);
        }
        saveToOwner(){
            if(!this.owner.userData)this.owner.userData={};
            this.owner.userData.components=this.serialize();
            return this.owner.userData.components;
        }
        dispatch(method,...args){
            let count=0;
            for(const component of this.components){
                if(!component.enabled||component.destroyed)continue;
                const fn=component[method];
                if(typeof fn!=='function'||fn===window.SMComponent.prototype[method])continue;
                try{
                    fn.apply(component,args);
                    count+=1;
                }catch(error){
                    console.error(`[SMComponentContainer] ${component.type}.${method}() failed.`,error);
                    window.SMRuntimeEventBus?.emit?.('component:error',{component,owner:this.owner,method,error});
                }
            }
            return count;
        }
        _sort(){
            this.components.sort((a,b)=>(a.executionOrder||0)-(b.executionOrder||0)||String(a.type).localeCompare(String(b.type)));
        }
        _attachOwnerAPI(){
            const owner=this.owner;
            try{
                if(!Object.getOwnPropertyDescriptor(owner,'components'))Object.defineProperty(owner,'components',{configurable:true,enumerable:false,get:()=>this});
                if(typeof owner.addComponent!=='function')Object.defineProperty(owner,'addComponent',{configurable:true,enumerable:false,value:(component,options={})=>this.add(component,options)});
                if(typeof owner.getComponent!=='function')Object.defineProperty(owner,'getComponent',{configurable:true,enumerable:false,value:type=>this.get(type)});
                if(typeof owner.getComponents!=='function')Object.defineProperty(owner,'getComponents',{configurable:true,enumerable:false,value:type=>this.getAll(type)});
                if(typeof owner.removeComponent!=='function')Object.defineProperty(owner,'removeComponent',{configurable:true,enumerable:false,value:(component,options={})=>this.remove(component,options)});
            }catch(error){
                console.warn('[SMComponentContainer] Could not attach convenience API to owner.',error);
            }
        }
        _detachOwnerAPI(){
            const owner=this.owner;
            if(!owner)return;
            for(const key of ['components','addComponent','getComponent','getComponents','removeComponent']){
                try{
                    const descriptor=Object.getOwnPropertyDescriptor(owner,key);
                    if(descriptor?.configurable)delete owner[key];
                }catch{}
            }
        }
        debug(){
            const state={owner:this.owner?.name||this.owner?.uuid||null,started:this.started,paused:this.paused,destroyed:this.destroyed,components:this.components.map(component=>({type:component.type,id:component.id,enabled:component.enabled,started:component.started,executionOrder:component.executionOrder}))};
            console.log('[SMComponentContainer]',state);
            return state;
        }
    }
    window.SMComponentContainer=SMComponentContainer;
    window.SMComponentContainerClass=SMComponentContainer;
})();
