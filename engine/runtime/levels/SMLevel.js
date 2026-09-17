(function(){
    'use strict';
    class SMLevel{
        constructor(data={}){
            this.version=Number(data.version||1);
            this.id=String(data.id||`level-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
            this.name=String(data.name||this.id);
            this.description=String(data.description||'');
            this.type=this._normalizeType(data.type||'persistent');
            this.parentId=data.parentId?String(data.parentId):null;
            this.sourceMode=String(data.sourceMode||'serialized');
            this.objects=Array.isArray(data.objects)?this._clone(data.objects):[];
            this.sublevels=Array.isArray(data.sublevels)?Array.from(new Set(data.sublevels.map(id=>String(id)))):[];
            this.worldSettings=data.worldSettings&&typeof data.worldSettings==='object'?this._clone(data.worldSettings):{};
            this.playerStart=data.playerStart&&typeof data.playerStart==='object'?this._clone(data.playerStart):{};
            this.streaming=data.streaming&&typeof data.streaming==='object'?this._normalizeStreaming(data.streaming):this._normalizeStreaming({});
            this.tags=this._normalizeTags(data.tags);
            this.metadata={...(data.metadata||{})};
            this.dependencies=Array.isArray(data.dependencies)?this._clone(data.dependencies):[];
            this.createdAt=Number(data.createdAt||Date.now());
            this.updatedAt=Number(data.updatedAt||this.createdAt);
            this.state='unloaded';
            this.templateScene=data.templateScene||null;
            this.runtimeRoot=null;
        }
        setType(type){
            this.type=this._normalizeType(type);
            this.touch();
            return this.type;
        }
        setParent(levelOrId){
            this.parentId=levelOrId?String(levelOrId.id||levelOrId):null;
            this.touch();
            return this.parentId;
        }
        addSublevel(levelOrId){
            const id=String(levelOrId?.id||levelOrId||'');
            if(id&&!this.sublevels.includes(id))this.sublevels.push(id);
            this.touch();
            return this;
        }
        removeSublevel(levelOrId){
            const id=String(levelOrId?.id||levelOrId||'');
            this.sublevels=this.sublevels.filter(value=>value!==id);
            this.touch();
            return this;
        }
        hasSublevel(levelOrId){
            const id=String(levelOrId?.id||levelOrId||'');
            return this.sublevels.includes(id);
        }
        addTag(tag){
            const value=String(tag||'').trim().toLowerCase();
            if(value&&!this.tags.includes(value))this.tags.push(value);
            this.touch();
            return this;
        }
        removeTag(tag){
            const value=String(tag||'').trim().toLowerCase();
            this.tags=this.tags.filter(item=>item!==value);
            this.touch();
            return this;
        }
        hasTag(tag){
            return this.tags.includes(String(tag||'').trim().toLowerCase());
        }
        setWorldSettings(settings={}){
            this.worldSettings=this._deepMerge(this.worldSettings,settings);
            this.touch();
            return this.worldSettings;
        }
        setPlayerStart(config={}){
            this.playerStart={...this.playerStart,...this._clone(config)};
            this.touch();
            return this.playerStart;
        }
        setStreaming(config={}){
            this.streaming=this._normalizeStreaming({...this.streaming,...config});
            this.touch();
            return this.streaming;
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
            const level=new SMLevel(data);
            if(options.keepTemplateScene!==false)level.templateScene=this.templateScene;
            return level;
        }
        serialize(){
            return{version:this.version,id:this.id,name:this.name,description:this.description,type:this.type,parentId:this.parentId,sourceMode:this.sourceMode,objects:this._clone(this.objects),sublevels:[...this.sublevels],worldSettings:this._clone(this.worldSettings),playerStart:this._clone(this.playerStart),streaming:this._clone(this.streaming),tags:[...this.tags],metadata:this._clone(this.metadata),dependencies:this._clone(this.dependencies),createdAt:this.createdAt,updatedAt:this.updatedAt};
        }
        toJSON(){
            return this.serialize();
        }
        static fromJSON(data){
            return new SMLevel(data);
        }
        _normalizeType(type){
            const value=String(type||'persistent').trim().toLowerCase();
            return value==='sublevel'||value==='streaming'?'sublevel':'persistent';
        }
        _normalizeStreaming(config){
            return{enabled:config.enabled===true,mode:['manual','distance','volume'].includes(String(config.mode||'manual').toLowerCase())?String(config.mode||'manual').toLowerCase():'manual',loadDistance:Math.max(0,Number(config.loadDistance??250)),unloadDistance:Math.max(0,Number(config.unloadDistance??300)),priority:Number(config.priority??0),alwaysLoaded:config.alwaysLoaded===true};
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
            const state={id:this.id,name:this.name,type:this.type,parentId:this.parentId,sourceMode:this.sourceMode,state:this.state,objects:this.objects.length,sublevels:[...this.sublevels],tags:[...this.tags],streaming:{...this.streaming},hasTemplateScene:!!this.templateScene};
            console.log('[SMLevel]',state);
            return state;
        }
    }
    window.SMLevel=SMLevel;
    window.SMLevelClass=SMLevel;
})();