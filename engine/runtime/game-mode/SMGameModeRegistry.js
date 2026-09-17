(function(){
    'use strict';
    class SMGameModeRegistry{
        constructor(){
            this.entries=new Map();
            this.aliases=new Map();
            this.defaultId='default';
        }
        register(idOrClass,GameModeClass=null,metadata={}){
            let id=idOrClass;
            let ctor=GameModeClass;
            if(typeof idOrClass==='function'){
                ctor=idOrClass;
                id=metadata.id||ctor.gameModeId||ctor.name;
            }
            if(typeof ctor!=='function')throw new TypeError('SMGameModeRegistry.register(id, GameModeClass) expects a class/function.');
            if(!(ctor.prototype instanceof window.SMGameMode)&&ctor!==window.SMGameMode)throw new TypeError('Registered GameMode must extend SMGameMode.');
            const key=this._normalize(id);
            this.entries.set(key,{id:String(id),key,GameModeClass:ctor,metadata:{...(metadata||{})}});
            this.aliases.set(this._normalize(metadata.displayName||id),key);
            for(const alias of metadata.aliases||[])this.aliases.set(this._normalize(alias),key);
            if(metadata.default===true)this.defaultId=key;
            window.SMRuntimeEventBus?.emit?.('game-mode:registered',{registry:this,id:key,GameModeClass:ctor,metadata});
            return ctor;
        }
        unregister(id){
            const key=this._resolveKey(id);
            if(!key)return false;
            this.entries.delete(key);
            for(const[alias,target]of Array.from(this.aliases))if(target===key)this.aliases.delete(alias);
            return true;
        }
        has(id){
            return Boolean(this._resolveKey(id));
        }
        get(id){
            const key=this._resolveKey(id);
            return key?this.entries.get(key)?.GameModeClass||null:null;
        }
        getMetadata(id){
            const key=this._resolveKey(id);
            return key?this.entries.get(key)?.metadata||null:null;
        }
        create(id='default',options={}){
            const key=this._resolveKey(id)||this._resolveKey(this.defaultId);
            const entry=key?this.entries.get(key):null;
            const Ctor=entry?.GameModeClass||window.SMGameMode;
            return new Ctor({...options,id:options.id||entry?.id||String(id||'default')});
        }
        setDefault(id){
            const key=this._resolveKey(id);
            if(!key)throw new Error(`Unknown GameMode "${id}".`);
            this.defaultId=key;
            return key;
        }
        list(){
            return Array.from(this.entries.values()).map(entry=>({id:entry.id,key:entry.key,GameModeClass:entry.GameModeClass,metadata:{...entry.metadata}}));
        }
        _resolveKey(id){
            if(!id)return this.entries.has(this.defaultId)?this.defaultId:null;
            const key=this._normalize(id);
            if(this.entries.has(key))return key;
            return this.aliases.get(key)||null;
        }
        _normalize(value){
            return String(value||'').trim().toLowerCase();
        }
        debug(){
            const state={defaultId:this.defaultId,count:this.entries.size,modes:this.list().map(entry=>entry.id)};
            console.log('[SMGameModeRegistry]',state);
            return state;
        }
    }
    const registry=new SMGameModeRegistry();
    window.SMGameModeRegistryClass=SMGameModeRegistry;
    window.SMGameModeRegistry=registry;
    window.smGameModeRegistry=registry;
    if(window.SMGameMode&&!registry.has('default'))registry.register('default',window.SMGameMode,{displayName:'Default GameMode',default:true});
})();