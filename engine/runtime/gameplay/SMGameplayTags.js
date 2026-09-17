(function(){
    'use strict';
    class SMGameplayTags{
        constructor(){
            this.definitions=new Map();
        }
        define(tag,metadata={}){
            const value=this.normalize(tag);
            if(!value)throw new Error('Gameplay tag cannot be empty.');
            const definition={tag:value,parent:this.parent(value),description:String(metadata.description||''),category:String(metadata.category||value.split('.')[0]||'Gameplay'),metadata:{...(metadata.metadata||{})}};
            this.definitions.set(value,definition);
            return definition;
        }
        undefine(tag){
            return this.definitions.delete(this.normalize(tag));
        }
        hasDefinition(tag){
            return this.definitions.has(this.normalize(tag));
        }
        getDefinition(tag){
            return this.definitions.get(this.normalize(tag))||null;
        }
        normalize(tag){
            return String(tag||'').trim().replace(/\s+/g,'-').replace(/\/+/g,'.').replace(/\.+/g,'.').replace(/^\.+|\.+$/g,'').toLowerCase();
        }
        parent(tag){
            const value=this.normalize(tag);
            const index=value.lastIndexOf('.');
            return index>0?value.slice(0,index):null;
        }
        ancestors(tag){
            const values=[];
            let current=this.parent(tag);
            while(current){
                values.push(current);
                current=this.parent(current);
            }
            return values;
        }
        matches(tag,query,options={}){
            const value=this.normalize(tag);
            const target=this.normalize(query);
            if(!value||!target)return false;
            if(value===target)return true;
            if(options.exact===true)return false;
            return value.startsWith(`${target}.`);
        }
        any(tags,queries,options={}){
            const list=this.toArray(tags);
            const targets=this.toArray(queries);
            return targets.some(query=>list.some(tag=>this.matches(tag,query,options)));
        }
        all(tags,queries,options={}){
            const list=this.toArray(tags);
            const targets=this.toArray(queries);
            return targets.every(query=>list.some(tag=>this.matches(tag,query,options)));
        }
        add(target,tag){
            const value=this.normalize(tag);
            if(!value)return false;
            const list=this._targetList(target);
            if(!list.includes(value))list.push(value);
            this._assignTargetList(target,list);
            return value;
        }
        remove(target,tag,options={}){
            const query=this.normalize(tag);
            const list=this._targetList(target);
            const filtered=list.filter(value=>options.children===true?!this.matches(value,query):value!==query);
            this._assignTargetList(target,filtered);
            return list.length-filtered.length;
        }
        has(target,tag,options={}){
            return this._targetList(target).some(value=>this.matches(value,tag,options));
        }
        toArray(tags){
            if(tags===undefined||tags===null)return[];
            if(Array.isArray(tags))return Array.from(new Set(tags.map(tag=>this.normalize(tag)).filter(Boolean)));
            if(tags instanceof Set)return this.toArray(Array.from(tags));
            if(typeof tags==='string')return this.toArray(tags.split(','));
            if(tags?.userData)return this._targetList(tags);
            return[];
        }
        listDefinitions(){
            return Array.from(this.definitions.values()).sort((a,b)=>a.tag.localeCompare(b.tag));
        }
        _targetList(target){
            if(Array.isArray(target))return this.toArray(target);
            if(target instanceof Set)return this.toArray(target);
            const object=target?.object||target;
            if(!object)return[];
            object.userData=object.userData||{};
            return this.toArray(object.userData.gameplayTags||object.userData.tags||[]);
        }
        _assignTargetList(target,list){
            if(Array.isArray(target)){
                target.splice(0,target.length,...list);
                return;
            }
            if(target instanceof Set){
                target.clear();
                for(const item of list)target.add(item);
                return;
            }
            const object=target?.object||target;
            if(!object)return;
            object.userData=object.userData||{};
            object.userData.gameplayTags=[...list];
            const tags=Array.isArray(object.userData.tags)?this.toArray(object.userData.tags):[];
            for(const tag of list)if(!tags.includes(tag))tags.push(tag);
            object.userData.tags=tags;
        }
        debug(){
            const state={definitions:this.definitions.size,tags:this.listDefinitions().map(item=>item.tag)};
            console.log('[SMGameplayTags]',state);
            return state;
        }
    }
    const tags=new SMGameplayTags();
    window.SMGameplayTagsClass=SMGameplayTags;
    window.SMGameplayTags=tags;
    window.smGameplayTags=tags;
})();