(function(){
    'use strict';
    class SMInputContext{
        constructor(name,map=null,options={}){
            this.name=String(name||'InputContext');
            this.map=map instanceof window.SMInputMap?map:new window.SMInputMap(`${this.name}Map`);
            this.priority=Number(options.priority??0);
            this.enabled=options.enabled!==false;
            this.consumeInput=options.consumeInput!==false;
            this.blockLowerContexts=options.blockLowerContexts===true;
            this.tags=this._normalizeTags(options.tags);
            this.metadata={...(options.metadata||{})};
            this.owner=options.owner||null;
        }
        setEnabled(enabled){
            this.enabled=Boolean(enabled);
            if(!this.enabled)this.map.resetActions();
            return this.enabled;
        }
        setPriority(priority){
            this.priority=Number(priority)||0;
            return this.priority;
        }
        setOwner(owner){
            this.owner=owner||null;
            return this.owner;
        }
        addTag(tag){
            const value=String(tag||'').trim().toLowerCase();
            if(value&&!this.tags.includes(value))this.tags.push(value);
            return this;
        }
        removeTag(tag){
            const value=String(tag||'').trim().toLowerCase();
            this.tags=this.tags.filter(item=>item!==value);
            return this;
        }
        hasTag(tag){
            return this.tags.includes(String(tag||'').trim().toLowerCase());
        }
        getAction(name){
            return this.map.getAction(name);
        }
        serialize(){
            return{name:this.name,priority:this.priority,enabled:this.enabled,consumeInput:this.consumeInput,blockLowerContexts:this.blockLowerContexts,tags:[...this.tags],metadata:{...this.metadata},map:this.map.serialize()};
        }
        _normalizeTags(tags){
            if(tags===undefined||tags===null)return[];
            const list=Array.isArray(tags)?tags:String(tags).split(',');
            return Array.from(new Set(list.map(value=>String(value).trim().toLowerCase()).filter(Boolean)));
        }
        debug(){
            const state={name:this.name,priority:this.priority,enabled:this.enabled,consumeInput:this.consumeInput,blockLowerContexts:this.blockLowerContexts,tags:[...this.tags],map:this.map.name};
            console.log('[SMInputContext]',state);
            return state;
        }
    }
    window.SMInputContext=SMInputContext;
    window.SMInputContextClass=SMInputContext;
})();