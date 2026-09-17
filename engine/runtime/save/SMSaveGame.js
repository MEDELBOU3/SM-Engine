(function(){
    'use strict';
    class SMSaveGame{
        constructor(data={}){
            this.version=Number(data.version||1);
            this.id=String(data.id||`save-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
            this.slot=String(data.slot||'default');
            this.title=String(data.title||data.slot||'Save Game');
            this.createdAt=Number(data.createdAt||Date.now());
            this.updatedAt=Number(data.updatedAt||this.createdAt);
            this.playTime=Math.max(0,Number(data.playTime||0));
            this.levelId=data.levelId||null;
            this.gameModeId=data.gameModeId||null;
            this.gameState=data.gameState&&typeof data.gameState==='object'?this._clone(data.gameState):{};
            this.worldState=data.worldState&&typeof data.worldState==='object'?this._clone(data.worldState):{};
            this.players=Array.isArray(data.players)?this._clone(data.players):[];
            this.objects=Array.isArray(data.objects)?this._clone(data.objects):[];
            this.custom=data.custom&&typeof data.custom==='object'?this._clone(data.custom):{};
            this.metadata=data.metadata&&typeof data.metadata==='object'?this._clone(data.metadata):{};
            this.thumbnail=data.thumbnail||null;
        }
        setCustom(key,value){
            this.custom[String(key)]=value;
            this.touch();
            return value;
        }
        getCustom(key,fallback=null){
            return Object.prototype.hasOwnProperty.call(this.custom,String(key))?this.custom[String(key)]:fallback;
        }
        touch(){
            this.updatedAt=Date.now();
            return this;
        }
        serialize(){
            return{version:this.version,id:this.id,slot:this.slot,title:this.title,createdAt:this.createdAt,updatedAt:this.updatedAt,playTime:this.playTime,levelId:this.levelId,gameModeId:this.gameModeId,gameState:this._clone(this.gameState),worldState:this._clone(this.worldState),players:this._clone(this.players),objects:this._clone(this.objects),custom:this._clone(this.custom),metadata:this._clone(this.metadata),thumbnail:this.thumbnail};
        }
        toJSON(){
            return this.serialize();
        }
        static fromJSON(data){
            return new SMSaveGame(data);
        }
        _clone(value){
            if(value===undefined)return undefined;
            try{return structuredClone(value);}catch{}
            try{return JSON.parse(JSON.stringify(value));}catch{return value;}
        }
        debug(){
            const state={id:this.id,slot:this.slot,title:this.title,levelId:this.levelId,gameModeId:this.gameModeId,playTime:this.playTime,players:this.players.length,objects:this.objects.length,createdAt:this.createdAt,updatedAt:this.updatedAt};
            console.log('[SMSaveGame]',state);
            return state;
        }
    }
    window.SMSaveGame=SMSaveGame;
    window.SMSaveGameClass=SMSaveGame;
})();