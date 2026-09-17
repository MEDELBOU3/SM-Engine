(function(){
    'use strict';
    class SMLevelRegistry{
        constructor(){
            this.levels=new Map();
            this.aliases=new Map();
            this.tags=new Map();
            this.activeLevelId=null;
            this.persistentLevelId=null;
        }
        register(levelOrData,options={}){
            const level=levelOrData instanceof window.SMLevel?levelOrData:new window.SMLevel(levelOrData||{});
            if(this.levels.has(level.id)&&options.override!==true)throw new Error(`Level "${level.id}" is already registered.`);
            if(this.levels.has(level.id))this.unregister(level.id,{preserveActive:true});
            this.levels.set(level.id,level);
            this.aliases.set(this._normalize(level.name),level.id);
            for(const alias of Array.isArray(options.aliases)?options.aliases:[])this.aliases.set(this._normalize(alias),level.id);
            for(const tag of level.tags)this._indexTag(level,tag);
            if(level.type==='persistent'&&!this.persistentLevelId)this.persistentLevelId=level.id;
            if(options.persistent===true)this.persistentLevelId=level.id;
            if(options.active===true)this.activeLevelId=level.id;
            window.SMRuntimeEventBus?.emit?.('level:registered',{registry:this,level});
            window.dispatchEvent(new CustomEvent('sm:level-registered',{detail:{registry:this,level}}));
            return level;
        }
        unregister(levelOrId,options={}){
            const level=this.get(levelOrId);
            if(!level)return false;
            this.levels.delete(level.id);
            for(const[alias,id]of Array.from(this.aliases))if(id===level.id)this.aliases.delete(alias);
            for(const tag of level.tags)this._unindexTag(level,tag);
            if(options.preserveActive!==true&&this.activeLevelId===level.id)this.activeLevelId=null;
            if(this.persistentLevelId===level.id)this.persistentLevelId=this.list({type:'persistent'})[0]?.id||null;
            window.SMRuntimeEventBus?.emit?.('level:unregistered',{registry:this,level});
            return true;
        }
        get(levelOrId){
            if(!levelOrId)return null;
            if(levelOrId instanceof window.SMLevel)return levelOrId;
            const direct=this.levels.get(String(levelOrId));
            if(direct)return direct;
            const id=this.aliases.get(this._normalize(levelOrId));
            return id?this.levels.get(id)||null:null;
        }
        has(levelOrId){
            return Boolean(this.get(levelOrId));
        }
        setActive(levelOrId){
            const level=this.get(levelOrId);
            if(!level)throw new Error(`Unknown level "${levelOrId}".`);
            this.activeLevelId=level.id;
            window.SMRuntimeEventBus?.emit?.('level:active-changed',{registry:this,level});
            return level;
        }
        getActive(){
            return this.get(this.activeLevelId);
        }
        setPersistent(levelOrId){
            const level=this.get(levelOrId);
            if(!level)throw new Error(`Unknown level "${levelOrId}".`);
            if(level.type!=='persistent')level.setType('persistent');
            this.persistentLevelId=level.id;
            return level;
        }
        getPersistent(){
            return this.get(this.persistentLevelId);
        }
        findByTag(tag){
            const ids=this.tags.get(String(tag||'').toLowerCase())||new Set();
            return Array.from(ids).map(id=>this.levels.get(id)).filter(Boolean);
        }
        list(options={}){
            let levels=Array.from(this.levels.values());
            if(options.type)levels=levels.filter(level=>level.type===String(options.type).toLowerCase());
            if(options.parentId!==undefined)levels=levels.filter(level=>level.parentId===options.parentId);
            if(options.tag)levels=levels.filter(level=>level.hasTag(options.tag));
            levels.sort((a,b)=>{
                if(a.type!==b.type)return a.type==='persistent'?-1:1;
                return a.name.localeCompare(b.name);
            });
            return levels;
        }
        search(query=''){
            const text=String(query||'').trim().toLowerCase();
            if(!text)return this.list();
            return this.list().filter(level=>level.id.toLowerCase().includes(text)||level.name.toLowerCase().includes(text)||level.description.toLowerCase().includes(text)||level.tags.some(tag=>tag.includes(text)));
        }
        serialize(){
            return{activeLevelId:this.activeLevelId,persistentLevelId:this.persistentLevelId,levels:this.list().map(level=>level.serialize())};
        }
        hydrate(data={},options={}){
            const list=Array.isArray(data)?data:Array.isArray(data.levels)?data.levels:[];
            const levels=[];
            for(const item of list){
                try{levels.push(this.register(item,{override:options.override===true}));}catch(error){console.error('[SMLevelRegistry] Failed to hydrate level.',item,error);}
            }
            if(!Array.isArray(data)){
                if(data.persistentLevelId&&this.has(data.persistentLevelId))this.persistentLevelId=data.persistentLevelId;
                if(data.activeLevelId&&this.has(data.activeLevelId))this.activeLevelId=data.activeLevelId;
            }
            return levels;
        }
        clear(){
            const count=this.levels.size;
            this.levels.clear();
            this.aliases.clear();
            this.tags.clear();
            this.activeLevelId=null;
            this.persistentLevelId=null;
            return count;
        }
        _indexTag(level,tag){
            const key=String(tag).toLowerCase();
            if(!this.tags.has(key))this.tags.set(key,new Set());
            this.tags.get(key).add(level.id);
        }
        _unindexTag(level,tag){
            const key=String(tag).toLowerCase();
            const set=this.tags.get(key);
            if(!set)return;
            set.delete(level.id);
            if(!set.size)this.tags.delete(key);
        }
        _normalize(value){
            return String(value||'').trim().toLowerCase();
        }
        debug(){
            const state={count:this.levels.size,activeLevelId:this.activeLevelId,persistentLevelId:this.persistentLevelId,persistent:this.list({type:'persistent'}).length,sublevels:this.list({type:'sublevel'}).length};
            console.log('[SMLevelRegistry]',state);
            return state;
        }
    }
    const registry=new SMLevelRegistry();
    window.SMLevelRegistryClass=SMLevelRegistry;
    window.SMLevelRegistry=registry;
    window.smLevelRegistry=registry;
})();