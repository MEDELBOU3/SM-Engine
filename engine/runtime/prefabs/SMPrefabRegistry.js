(function(){
    'use strict';
    class SMPrefabRegistry{
        constructor(){
            this.prefabs=new Map();
            this.aliases=new Map();
            this.categories=new Map();
            this.tags=new Map();
        }
        register(prefabOrData,options={}){
            const prefab=prefabOrData instanceof window.SMPrefab?prefabOrData:new window.SMPrefab(prefabOrData||{});
            const id=String(prefab.id);
            if(this.prefabs.has(id)&&options.override!==true)throw new Error(`Prefab "${id}" is already registered.`);
            if(this.prefabs.has(id))this.unregister(id);
            this.prefabs.set(id,prefab);
            this._indexCategory(prefab);
            for(const tag of prefab.tags)this._indexTag(prefab,tag);
            const aliases=[prefab.name,...(Array.isArray(options.aliases)?options.aliases:[])].filter(Boolean);
            for(const alias of aliases)this.aliases.set(this._normalize(alias),id);
            window.SMRuntimeEventBus?.emit?.('prefab:registered',{registry:this,prefab});
            window.dispatchEvent(new CustomEvent('sm:prefab-registered',{detail:{registry:this,prefab}}));
            return prefab;
        }
        unregister(idOrPrefab){
            const prefab=this.get(idOrPrefab);
            if(!prefab)return false;
            this.prefabs.delete(prefab.id);
            this._unindexCategory(prefab);
            for(const tag of prefab.tags)this._unindexTag(prefab,tag);
            for(const[alias,id]of Array.from(this.aliases))if(id===prefab.id)this.aliases.delete(alias);
            window.SMRuntimeEventBus?.emit?.('prefab:unregistered',{registry:this,prefab});
            return true;
        }
        get(idOrAlias){
            if(!idOrAlias)return null;
            if(idOrAlias instanceof window.SMPrefab)return idOrAlias;
            const direct=this.prefabs.get(String(idOrAlias));
            if(direct)return direct;
            const id=this.aliases.get(this._normalize(idOrAlias));
            return id?this.prefabs.get(id)||null:null;
        }
        has(idOrAlias){
            return Boolean(this.get(idOrAlias));
        }
        findByCategory(category){
            const ids=this.categories.get(String(category||'').toLowerCase())||new Set();
            return Array.from(ids).map(id=>this.prefabs.get(id)).filter(Boolean);
        }
        findByTag(tag){
            const ids=this.tags.get(String(tag||'').toLowerCase())||new Set();
            return Array.from(ids).map(id=>this.prefabs.get(id)).filter(Boolean);
        }
        search(query=''){
            const text=String(query||'').trim().toLowerCase();
            if(!text)return this.list();
            return this.list().filter(prefab=>prefab.id.toLowerCase().includes(text)||prefab.name.toLowerCase().includes(text)||prefab.description.toLowerCase().includes(text)||prefab.category.toLowerCase().includes(text)||prefab.tags.some(tag=>tag.includes(text)));
        }
        list(options={}){
            let items=Array.from(this.prefabs.values());
            if(options.category)items=items.filter(prefab=>prefab.category.toLowerCase()===String(options.category).toLowerCase());
            if(options.tag)items=items.filter(prefab=>prefab.hasTag(options.tag));
            items.sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
            return items;
        }
        clear(){
            const count=this.prefabs.size;
            this.prefabs.clear();
            this.aliases.clear();
            this.categories.clear();
            this.tags.clear();
            window.SMRuntimeEventBus?.emit?.('prefab:registry-cleared',{registry:this,count});
            return count;
        }
        serialize(){
            return this.list().map(prefab=>prefab.serialize());
        }
        hydrate(prefabs=[],options={}){
            const created=[];
            for(const data of Array.isArray(prefabs)?prefabs:[]){
                try{created.push(this.register(data,{override:options.override===true}));}catch(error){console.error('[SMPrefabRegistry] Failed to hydrate prefab.',data,error);}
            }
            return created;
        }
        _indexCategory(prefab){
            const key=String(prefab.category||'Gameplay').toLowerCase();
            if(!this.categories.has(key))this.categories.set(key,new Set());
            this.categories.get(key).add(prefab.id);
        }
        _unindexCategory(prefab){
            const key=String(prefab.category||'Gameplay').toLowerCase();
            const set=this.categories.get(key);
            if(!set)return;
            set.delete(prefab.id);
            if(!set.size)this.categories.delete(key);
        }
        _indexTag(prefab,tag){
            const key=String(tag).toLowerCase();
            if(!this.tags.has(key))this.tags.set(key,new Set());
            this.tags.get(key).add(prefab.id);
        }
        _unindexTag(prefab,tag){
            const key=String(tag).toLowerCase();
            const set=this.tags.get(key);
            if(!set)return;
            set.delete(prefab.id);
            if(!set.size)this.tags.delete(key);
        }
        _normalize(value){
            return String(value||'').trim().toLowerCase();
        }
        debug(){
            const state={count:this.prefabs.size,categories:Object.fromEntries(Array.from(this.categories,([key,set])=>[key,set.size])),tags:Object.fromEntries(Array.from(this.tags,([key,set])=>[key,set.size]))};
            console.log('[SMPrefabRegistry]',state);
            return state;
        }
    }
    const registry=new SMPrefabRegistry();
    window.SMPrefabRegistryClass=SMPrefabRegistry;
    window.SMPrefabRegistry=registry;
    window.smPrefabRegistry=registry;
})();