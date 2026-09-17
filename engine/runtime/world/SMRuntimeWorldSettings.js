(function(){
    'use strict';
    class SMRuntimeWorldSettings{
        constructor(initial={}){
            this.defaults={name:'Runtime World',gameMode:'default',playerSpawnType:'player-start',playerSpawnTag:'',gravity:[0,-9.81,0],timeScale:1,physicsEnabled:true,audioEnabled:true,aiEnabled:true,runtimeUIEnabled:true,worldBounds:{enabled:false,min:[-5000,-1000,-5000],max:[5000,5000,5000]},metadata:{}};
            this.state=this._normalize({...this.defaults,...initial});
        }
        loadFromScene(scene){
            const stored=scene?.userData?.worldSettings;
            if(stored&&typeof stored==='object')this.merge(stored);
            return this;
        }
        saveToScene(scene){
            if(!scene?.userData)return false;
            scene.userData.worldSettings=this.serialize();
            window.SMRuntimeEventBus?.emit?.('world:settings-saved',{settings:this,scene});
            return true;
        }
        merge(values={}){
            this.state=this._normalize({...this.state,...values,worldBounds:{...this.state.worldBounds,...(values.worldBounds||{})},metadata:{...this.state.metadata,...(values.metadata||{})}});
            this._emit();
            return this;
        }
        set(key,value){
            if(!(key in this.state))throw new Error(`Unknown world setting "${key}".`);
            if(key==='worldBounds')this.state.worldBounds=this._normalizeBounds(value);
            else if(key==='gravity')this.state.gravity=this._normalizeVector3(value,[0,-9.81,0]);
            else if(key==='timeScale')this.state.timeScale=this._clamp(Number(value)||0,0,10);
            else if(['physicsEnabled','audioEnabled','aiEnabled','runtimeUIEnabled'].includes(key))this.state[key]=Boolean(value);
            else this.state[key]=value;
            this._emit(key);
            return this.state[key];
        }
        get(key){
            return this.state[key];
        }
        reset(){
            this.state=this._normalize({...this.defaults});
            this._emit();
            return this;
        }
        get gravity(){
            return this.state.gravity;
        }
        set gravity(value){
            this.set('gravity',value);
        }
        get timeScale(){
            return this.state.timeScale;
        }
        set timeScale(value){
            this.set('timeScale',value);
        }
        get gameMode(){
            return this.state.gameMode;
        }
        get playerSpawnType(){
            return this.state.playerSpawnType;
        }
        get playerSpawnTag(){
            return this.state.playerSpawnTag;
        }
        isFeatureEnabled(name){
            const map={physics:'physicsEnabled',audio:'audioEnabled',ai:'aiEnabled',ui:'runtimeUIEnabled',runtimeui:'runtimeUIEnabled'};
            const key=map[String(name||'').toLowerCase()];
            return key?Boolean(this.state[key]):false;
        }
        containsPosition(position){
            if(!this.state.worldBounds.enabled)return true;
            const p=this._normalizeVector3(position,[0,0,0]);
            const min=this.state.worldBounds.min;
            const max=this.state.worldBounds.max;
            return p[0]>=min[0]&&p[0]<=max[0]&&p[1]>=min[1]&&p[1]<=max[1]&&p[2]>=min[2]&&p[2]<=max[2];
        }
        clampPosition(position){
            const p=this._normalizeVector3(position,[0,0,0]);
            if(!this.state.worldBounds.enabled)return p;
            const min=this.state.worldBounds.min;
            const max=this.state.worldBounds.max;
            return[this._clamp(p[0],min[0],max[0]),this._clamp(p[1],min[1],max[1]),this._clamp(p[2],min[2],max[2])];
        }
        serialize(){
            return JSON.parse(JSON.stringify(this.state));
        }
        _normalize(input){
            return{name:String(input.name||'Runtime World'),gameMode:String(input.gameMode||'default'),playerSpawnType:String(input.playerSpawnType||'player-start').toLowerCase(),playerSpawnTag:String(input.playerSpawnTag||'').toLowerCase(),gravity:this._normalizeVector3(input.gravity,[0,-9.81,0]),timeScale:this._clamp(Number(input.timeScale??1),0,10),physicsEnabled:input.physicsEnabled!==false,audioEnabled:input.audioEnabled!==false,aiEnabled:input.aiEnabled!==false,runtimeUIEnabled:input.runtimeUIEnabled!==false,worldBounds:this._normalizeBounds(input.worldBounds||{}),metadata:{...(input.metadata||{})}};
        }
        _normalizeBounds(bounds={}){
            return{enabled:Boolean(bounds.enabled),min:this._normalizeVector3(bounds.min,[-5000,-1000,-5000]),max:this._normalizeVector3(bounds.max,[5000,5000,5000])};
        }
        _normalizeVector3(value,fallback){
            if(Array.isArray(value))return[Number(value[0]??fallback[0]),Number(value[1]??fallback[1]),Number(value[2]??fallback[2])];
            if(value&&typeof value==='object')return[Number(value.x??fallback[0]),Number(value.y??fallback[1]),Number(value.z??fallback[2])];
            return[...fallback];
        }
        _clamp(value,min,max){
            return Math.max(min,Math.min(max,value));
        }
        _emit(key=null){
            window.SMRuntimeEventBus?.emit?.('world:settings-changed',{settings:this,key,state:this.serialize()});
            window.dispatchEvent(new CustomEvent('sm:runtime-world-settings-changed',{detail:{settings:this,key,state:this.serialize()}}));
        }
        debug(){
            const state=this.serialize();
            console.log('[SMRuntimeWorldSettings]',state);
            return state;
        }
    }
    window.SMRuntimeWorldSettings=SMRuntimeWorldSettings;
    window.SMRuntimeWorldSettingsClass=SMRuntimeWorldSettings;
})();