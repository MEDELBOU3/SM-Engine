(function(){
    'use strict';
    class SMPrefab{
        constructor(data={}){
            this.version=Number(data.version||1);
            this.id=String(data.id||`prefab-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
            this.name=String(data.name||this.id);
            this.description=String(data.description||'');
            this.category=String(data.category||'Gameplay');
            this.tags=this._normalizeTags(data.tags);
            this.root=data.root&&typeof data.root==='object'?this._clone(data.root):null;
            this.metadata={...(data.metadata||{})};
            this.dependencies=Array.isArray(data.dependencies)?this._clone(data.dependencies):[];
            this.defaultOverrides=data.defaultOverrides&&typeof data.defaultOverrides==='object'?this._clone(data.defaultOverrides):{};
            this.createdAt=Number(data.createdAt||Date.now());
            this.updatedAt=Number(data.updatedAt||this.createdAt);
            this.templateObject=data.templateObject||null;
            this.sourceObjectUUID=data.sourceObjectUUID||this.templateObject?.uuid||null;
        }
        setRoot(root){
            if(!root||typeof root!=='object')throw new TypeError('SMPrefab.setRoot(root) expects a serialized prefab root object.');
            this.root=this._clone(root);
            this.touch();
            return this;
        }
        setTemplateObject(object){
            this.templateObject=object||null;
            this.sourceObjectUUID=object?.uuid||null;
            this.touch();
            return this;
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
        setMetadata(key,value){
            this.metadata[String(key)]=value;
            this.touch();
            return value;
        }
        getMetadata(key,fallback=null){
            return Object.prototype.hasOwnProperty.call(this.metadata,String(key))?this.metadata[String(key)]:fallback;
        }
        addDependency(dependency){
            if(!dependency)return this;
            const normalized=typeof dependency==='string'?{ref:dependency}:{...dependency};
            const key=normalized.ref||normalized.id||normalized.path;
            if(!key)return this;
            const exists=this.dependencies.some(item=>(item.ref||item.id||item.path)===key);
            if(!exists)this.dependencies.push(normalized);
            this.touch();
            return this;
        }
        applyDefaultOverrides(overrides={}){
            this.defaultOverrides=this._deepMerge(this.defaultOverrides,overrides);
            this.touch();
            return this.defaultOverrides;
        }
        touch(){
            this.updatedAt=Date.now();
            return this;
        }
        clone(options={}){
            const data=this.serialize();
            if(options.newId!==false){
                data.id=options.id||`${this.id}-copy-${Math.random().toString(36).slice(2,6)}`;
                data.name=options.name||`${this.name} Copy`;
                data.createdAt=Date.now();
                data.updatedAt=data.createdAt;
            }
            const prefab=new SMPrefab(data);
            if(options.keepTemplateObject!==false)prefab.templateObject=this.templateObject;
            return prefab;
        }
        serialize(){
            return{version:this.version,id:this.id,name:this.name,description:this.description,category:this.category,tags:[...this.tags],root:this.root?this._clone(this.root):null,metadata:this._clone(this.metadata),dependencies:this._clone(this.dependencies),defaultOverrides:this._clone(this.defaultOverrides),createdAt:this.createdAt,updatedAt:this.updatedAt,sourceObjectUUID:this.sourceObjectUUID};
        }
        toJSON(){
            return this.serialize();
        }
        static fromJSON(data){
            return new SMPrefab(data);
        }
        _normalizeTags(tags){
            if(tags===undefined||tags===null)return[];
            const list=Array.isArray(tags)?tags:String(tags).split(',');
            return Array.from(new Set(list.map(tag=>String(tag).trim().toLowerCase()).filter(Boolean)));
        }
        _clone(value){
            if(value===undefined)return undefined;
            try{return structuredClone(value);}catch{}
            try{return JSON.parse(JSON.stringify(value));}catch{return value;}
        }
        _deepMerge(base,patch){
            const output=this._clone(base)||{};
            for(const[key,value]of Object.entries(patch||{})){
                if(value&&typeof value==='object'&&!Array.isArray(value)&&output[key]&&typeof output[key]==='object'&&!Array.isArray(output[key]))output[key]=this._deepMerge(output[key],value);
                else output[key]=this._clone(value);
            }
            return output;
        }
        debug(){
            const state={id:this.id,name:this.name,category:this.category,tags:[...this.tags],dependencies:this.dependencies.length,hasRoot:!!this.root,hasTemplateObject:!!this.templateObject,createdAt:this.createdAt,updatedAt:this.updatedAt};
            console.log('[SMPrefab]',state);
            return state;
        }
    }
    window.SMPrefab=SMPrefab;
    window.SMPrefabClass=SMPrefab;
})();