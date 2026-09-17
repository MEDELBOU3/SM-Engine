(function(){
    'use strict';
    class SMAnimationParameterSet{
        constructor(initial={}){
            this.parameters=new Map();
            this.listeners=new Map();
            if(Array.isArray(initial)){
                for(const descriptor of initial)this.define(descriptor.name,descriptor.type,descriptor.value);
            }else if(initial&&typeof initial==='object'){
                for(const[name,value]of Object.entries(initial)){
                    if(value&&typeof value==='object'&&'type'in value)this.define(name,value.type,value.value);
                    else this.define(name,this._inferType(value),value);
                }
            }
        }
        define(name,type='float',value=null){
            const key=String(name);
            const normalized=this._normalizeType(type);
            const next={name:key,type:normalized,value:this._coerce(normalized,value),triggered:false};
            if(normalized==='trigger')next.value=false;
            this.parameters.set(key,next);
            return next;
        }
        ensure(name,type='float',defaultValue=null){
            return this.parameters.get(String(name))||this.define(name,type,defaultValue);
        }
        has(name){
            return this.parameters.has(String(name));
        }
        get(name,fallback=null){
            const parameter=this.parameters.get(String(name));
            if(!parameter)return fallback;
            return parameter.type==='trigger'?parameter.triggered:parameter.value;
        }
        getType(name){
            return this.parameters.get(String(name))?.type||null;
        }
        set(name,value){
            const key=String(name);
            const parameter=this.parameters.get(key)||this.define(key,this._inferType(value),value);
            const previous=parameter.type==='trigger'?parameter.triggered:parameter.value;
            if(parameter.type==='trigger')parameter.triggered=Boolean(value);
            else parameter.value=this._coerce(parameter.type,value);
            const current=parameter.type==='trigger'?parameter.triggered:parameter.value;
            if(previous!==current)this._emit(key,current,previous,parameter);
            return current;
        }
        setFloat(name,value){
            this.ensure(name,'float',0);
            return this.set(name,Number(value)||0);
        }
        setInt(name,value){
            this.ensure(name,'int',0);
            return this.set(name,Math.trunc(Number(value)||0));
        }
        setBool(name,value){
            this.ensure(name,'bool',false);
            return this.set(name,Boolean(value));
        }
        setTrigger(name){
            const parameter=this.ensure(name,'trigger',false);
            const previous=parameter.triggered;
            parameter.triggered=true;
            if(!previous)this._emit(String(name),true,false,parameter);
            return true;
        }
        resetTrigger(name){
            const parameter=this.parameters.get(String(name));
            if(!parameter||parameter.type!=='trigger')return false;
            const previous=parameter.triggered;
            parameter.triggered=false;
            if(previous)this._emit(String(name),false,true,parameter);
            return true;
        }
        consumeTrigger(name){
            const parameter=this.parameters.get(String(name));
            if(!parameter||parameter.type!=='trigger'||!parameter.triggered)return false;
            parameter.triggered=false;
            return true;
        }
        remove(name){
            return this.parameters.delete(String(name));
        }
        clear(){
            this.parameters.clear();
            this.listeners.clear();
        }
        watch(name,handler){
            if(typeof handler!=='function')throw new TypeError('watch(name, handler) expects a function.');
            const key=String(name);
            if(!this.listeners.has(key))this.listeners.set(key,new Set());
            this.listeners.get(key).add(handler);
            return()=>this.unwatch(key,handler);
        }
        unwatch(name,handler){
            const set=this.listeners.get(String(name));
            if(!set)return false;
            const result=set.delete(handler);
            if(!set.size)this.listeners.delete(String(name));
            return result;
        }
        snapshot(){
            const output={};
            for(const[name,parameter]of this.parameters)output[name]=parameter.type==='trigger'?parameter.triggered:parameter.value;
            return output;
        }
        serialize(){
            return Array.from(this.parameters.values()).map(parameter=>({name:parameter.name,type:parameter.type,value:parameter.type==='trigger'?parameter.triggered:parameter.value}));
        }
        deserialize(data=[]){
            this.parameters.clear();
            if(Array.isArray(data))for(const descriptor of data||[])this.define(descriptor.name,descriptor.type,descriptor.value);
            else if(data&&typeof data==='object')for(const[name,value]of Object.entries(data))this.define(name,this._inferType(value),value);
            return this;
        }
        _emit(name,value,previous,parameter){
            for(const handler of this.listeners.get(name)||[]){
                try{handler({name,value,previous,parameter,set:this});}catch(error){console.error(`[SMAnimationParameterSet] Listener "${name}" failed.`,error);}
            }
            window.SMRuntimeEventBus?.emit?.('animation:parameter-changed',{parameters:this,name,value,previous,parameter});
        }
        _normalizeType(type){
            const value=String(type||'float').toLowerCase();
            return['float','int','bool','trigger'].includes(value)?value:'float';
        }
        _inferType(value){
            if(typeof value==='boolean')return'bool';
            if(Number.isInteger(value))return'int';
            return'float';
        }
        _coerce(type,value){
            if(type==='bool')return Boolean(value);
            if(type==='int')return Math.trunc(Number(value)||0);
            if(type==='trigger')return Boolean(value);
            return Number(value)||0;
        }
        debug(){
            const state=this.serialize();
            console.table(state);
            return state;
        }
    }
    window.SMAnimationParameterSet=SMAnimationParameterSet;
    window.SMAnimationParameterSetClass=SMAnimationParameterSet;
})();