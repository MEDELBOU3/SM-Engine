(function(){
    'use strict';
    class SMBlackboard{
        constructor(initial={}){
            this.values=new Map();
            this.metadata=new Map();
            this.watchers=new Map();
            this.globalWatchers=new Set();
            this.revision=0;
            for(const[key,value]of Object.entries(initial||{}))this.set(key,value,{silent:true});
        }
        set(key,value,options={}){
            const name=String(key);
            const previous=this.values.get(name);
            this.values.set(name,value);
            if(options.metadata&&typeof options.metadata==='object')this.metadata.set(name,{...options.metadata});
            this.revision+=1;
            if(options.silent!==true&&previous!==value)this._emit(name,value,previous);
            return value;
        }
        get(key,fallback=null){
            const name=String(key);
            return this.values.has(name)?this.values.get(name):fallback;
        }
        has(key){
            return this.values.has(String(key));
        }
        delete(key){
            const name=String(key);
            if(!this.values.has(name))return false;
            const previous=this.values.get(name);
            this.values.delete(name);
            this.metadata.delete(name);
            this.revision+=1;
            this._emit(name,undefined,previous);
            return true;
        }
        clear(options={}){
            const entries=Array.from(this.values.entries());
            this.values.clear();
            this.metadata.clear();
            this.revision+=1;
            if(options.silent!==true)for(const[key,previous]of entries)this._emit(key,undefined,previous);
            return entries.length;
        }
        increment(key,amount=1){
            const value=Number(this.get(key,0))+(Number(amount)||0);
            return this.set(key,value);
        }
        toggle(key){
            return this.set(key,!Boolean(this.get(key,false)));
        }
        watch(key,handler){
            if(typeof handler!=='function')throw new TypeError('SMBlackboard.watch(key, handler) expects a function.');
            const name=String(key);
            if(!this.watchers.has(name))this.watchers.set(name,new Set());
            this.watchers.get(name).add(handler);
            return()=>this.unwatch(name,handler);
        }
        watchAll(handler){
            if(typeof handler!=='function')throw new TypeError('SMBlackboard.watchAll(handler) expects a function.');
            this.globalWatchers.add(handler);
            return()=>this.globalWatchers.delete(handler);
        }
        unwatch(key,handler){
            const set=this.watchers.get(String(key));
            if(!set)return false;
            const removed=set.delete(handler);
            if(!set.size)this.watchers.delete(String(key));
            return removed;
        }
        getMetadata(key){
            return this.metadata.get(String(key))||null;
        }
        snapshot(){
            return Object.fromEntries(this.values);
        }
        serialize(){
            const output={};
            for(const[key,value]of this.values){
                if(typeof value==='function'||typeof value==='undefined')continue;
                if(value?.isObject3D)output[key]={__objectUUID:value.uuid};
                else{
                    try{output[key]=this._clone(value);}catch{}
                }
            }
            return output;
        }
        deserialize(data={}){
            this.values.clear();
            for(const[key,value]of Object.entries(data||{}))this.set(key,value,{silent:true});
            this.revision+=1;
            return this;
        }
        _emit(key,value,previous){
            const payload={blackboard:this,key,value,previous,revision:this.revision};
            for(const handler of this.watchers.get(key)||[]){
                try{handler(payload);}catch(error){console.error(`[SMBlackboard] Watcher "${key}" failed.`,error);}
            }
            for(const handler of this.globalWatchers){
                try{handler(payload);}catch(error){console.error('[SMBlackboard] Global watcher failed.',error);}
            }
            window.SMRuntimeEventBus?.emit?.('ai:blackboard-changed',payload);
        }
        _clone(value){
            try{return structuredClone(value);}catch{}
            return JSON.parse(JSON.stringify(value));
        }
        debug(){
            const state={revision:this.revision,values:this.snapshot()};
            console.log('[SMBlackboard]',state);
            return state;
        }
    }
    window.SMBlackboard=SMBlackboard;
    window.SMBlackboardClass=SMBlackboard;
})();