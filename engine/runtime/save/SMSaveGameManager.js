(function(){
    'use strict';
    class SMSaveGameManager{
        constructor(options={}){
            this.dbName=String(options.dbName||'SMEngineSaveGames');
            this.storeName=String(options.storeName||'saves');
            this.dbVersion=1;
            this.db=null;
            this.ready=null;
            this.cache=new Map();
            this.lastSlot=null;
            this.maxSlots=Math.max(1,Number(options.maxSlots||100));
            this.fallbackPrefix='sm-savegame:';
        }
        async init(){
            if(this.ready)return this.ready;
            this.ready=this._openDB().catch(error=>{
                console.warn('[SMSaveGameManager] IndexedDB unavailable, localStorage fallback will be used.',error);
                this.db=null;
                return null;
            });
            await this.ready;
            return this;
        }
        async save(slot='default',options={}){
            await this.init();
            const key=String(slot||'default');
            const save=options.save instanceof window.SMSaveGame?options.save:window.SMSaveGameSerializer.capture({...options,slot:key});
            save.slot=key;
            save.title=String(options.title||save.title||key);
            const existing=await this.load(key,{apply:false,cacheOnly:false,silent:true});
            if(existing?.createdAt)save.createdAt=existing.createdAt;
            save.touch();
            await this._put(save);
            this.cache.set(key,save);
            this.lastSlot=key;
            window.SMRuntimeEventBus?.emit?.('save:written',{manager:this,save,slot:key});
            window.dispatchEvent(new CustomEvent('sm:save-written',{detail:{manager:this,save,slot:key}}));
            return save;
        }
        async load(slot='default',options={}){
            await this.init();
            const key=String(slot||'default');
            let save=this.cache.get(key)||null;
            if(!save||options.cacheOnly===false){
                const data=await this._get(key);
                save=data?new window.SMSaveGame(data):null;
                if(save)this.cache.set(key,save);
            }
            if(!save){
                if(options.silent!==true)console.warn(`[SMSaveGameManager] Save slot "${key}" was not found.`);
                return null;
            }
            this.lastSlot=key;
            if(options.apply!==false)await window.SMSaveGameSerializer.apply(save,options);
            window.SMRuntimeEventBus?.emit?.('save:loaded',{manager:this,save,slot:key,applied:options.apply!==false});
            return save;
        }
        async delete(slot='default'){
            await this.init();
            const key=String(slot||'default');
            if(this.db){
                await new Promise((resolve,reject)=>{
                    const tx=this.db.transaction(this.storeName,'readwrite');
                    const request=tx.objectStore(this.storeName).delete(key);
                    request.onsuccess=()=>resolve(true);
                    request.onerror=()=>reject(request.error);
                });
            }else{
                try{localStorage.removeItem(this.fallbackPrefix+key);}catch{}
            }
            this.cache.delete(key);
            if(this.lastSlot===key)this.lastSlot=null;
            window.SMRuntimeEventBus?.emit?.('save:deleted',{manager:this,slot:key});
            return true;
        }
        async exists(slot='default'){
            const save=await this.load(slot,{apply:false,cacheOnly:false,silent:true});
            return Boolean(save);
        }
        async list(){
            await this.init();
            let values=[];
            if(this.db){
                values=await new Promise((resolve,reject)=>{
                    const tx=this.db.transaction(this.storeName,'readonly');
                    const request=tx.objectStore(this.storeName).getAll();
                    request.onsuccess=()=>resolve(request.result||[]);
                    request.onerror=()=>reject(request.error);
                });
            }else{
                try{
                    for(let i=0;i<localStorage.length;i++){
                        const key=localStorage.key(i);
                        if(!key?.startsWith(this.fallbackPrefix))continue;
                        const raw=localStorage.getItem(key);
                        if(raw)values.push(JSON.parse(raw));
                    }
                }catch{}
            }
            return values.map(data=>new window.SMSaveGame(data)).sort((a,b)=>b.updatedAt-a.updatedAt);
        }
        async quickSave(options={}){
            return await this.save(options.slot||'quicksave',{...options,title:options.title||'Quick Save'});
        }
        async quickLoad(options={}){
            return await this.load(options.slot||'quicksave',options);
        }
        async exportJSON(slot='default',options={}){
            const save=await this.load(slot,{apply:false,cacheOnly:false,silent:true});
            if(!save)return null;
            return window.SMSaveGameSerializer.toJSON(save,{pretty:options.pretty!==false});
        }
        async importJSON(json,options={}){
            const save=window.SMSaveGameSerializer.fromJSON(json);
            if(options.slot)save.slot=String(options.slot);
            save.touch();
            await this.init();
            await this._put(save);
            this.cache.set(save.slot,save);
            return save;
        }
        async clearAll(){
            await this.init();
            if(this.db){
                await new Promise((resolve,reject)=>{
                    const tx=this.db.transaction(this.storeName,'readwrite');
                    const request=tx.objectStore(this.storeName).clear();
                    request.onsuccess=()=>resolve(true);
                    request.onerror=()=>reject(request.error);
                });
            }else{
                try{
                    const keys=[];
                    for(let i=0;i<localStorage.length;i++){
                        const key=localStorage.key(i);
                        if(key?.startsWith(this.fallbackPrefix))keys.push(key);
                    }
                    for(const key of keys)localStorage.removeItem(key);
                }catch{}
            }
            this.cache.clear();
            this.lastSlot=null;
            return true;
        }
        async _openDB(){
            if(!window.indexedDB)throw new Error('IndexedDB is unavailable.');
            this.db=await new Promise((resolve,reject)=>{
                const request=indexedDB.open(this.dbName,this.dbVersion);
                request.onupgradeneeded=()=>{
                    const db=request.result;
                    if(!db.objectStoreNames.contains(this.storeName))db.createObjectStore(this.storeName,{keyPath:'slot'});
                };
                request.onsuccess=()=>resolve(request.result);
                request.onerror=()=>reject(request.error);
            });
            return this.db;
        }
        async _put(save){
            const data=save.serialize();
            if(this.db){
                return await new Promise((resolve,reject)=>{
                    const tx=this.db.transaction(this.storeName,'readwrite');
                    const request=tx.objectStore(this.storeName).put(data);
                    request.onsuccess=()=>resolve(save);
                    request.onerror=()=>reject(request.error);
                });
            }
            try{
                localStorage.setItem(this.fallbackPrefix+save.slot,JSON.stringify(data));
                return save;
            }catch(error){
                throw new Error(`Save storage failed: ${error?.message||error}`);
            }
        }
        async _get(slot){
            if(this.db){
                return await new Promise((resolve,reject)=>{
                    const tx=this.db.transaction(this.storeName,'readonly');
                    const request=tx.objectStore(this.storeName).get(slot);
                    request.onsuccess=()=>resolve(request.result||null);
                    request.onerror=()=>reject(request.error);
                });
            }
            try{
                const raw=localStorage.getItem(this.fallbackPrefix+slot);
                return raw?JSON.parse(raw):null;
            }catch{return null;}
        }
        debug(){
            const state={dbName:this.dbName,storeName:this.storeName,dbReady:!!this.db,cached:this.cache.size,lastSlot:this.lastSlot,maxSlots:this.maxSlots};
            console.log('[SMSaveGameManager]',state);
            return state;
        }
    }
    const manager=new SMSaveGameManager();
    window.SMSaveGameManagerClass=SMSaveGameManager;
    window.SMSaveGameManager=manager;
    window.smSaveGameManager=manager;
})();