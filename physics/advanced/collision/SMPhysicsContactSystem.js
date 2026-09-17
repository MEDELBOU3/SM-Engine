(function(global){
    'use strict';
    class SMPhysicsContactSystem{
        constructor(physics,eventBus){
            this.physics=physics;
            this.eventBus=eventBus;
            this.activePairs=new Map();
            this.objectListeners=new WeakMap();
            this.anyListeners=new Set();
            this.impactThreshold=3;
            this._boundEvent=(event)=>this._onBackendEvent(event);
            this.running=false;
            this._lastFrame=-1;
        }
        start(){
            if(this.running)return this;
            this.running=true;
            global.addEventListener('sm:physics-collision',this._boundEvent);
            return this;
        }
        stop(){
            if(!this.running)return this;
            global.removeEventListener('sm:physics-collision',this._boundEvent);
            this.running=false;
            this.activePairs.clear();
            return this;
        }
        on(object,type,listener){
            if(!object||typeof listener!=='function')return()=>{};
            let map=this.objectListeners.get(object);
            if(!map){
                map=new Map();
                this.objectListeners.set(object,map);
            }
            const key=String(type||'enter').toLowerCase();
            if(!map.has(key))map.set(key,new Set());
            map.get(key).add(listener);
            return()=>map.get(key)?.delete(listener);
        }
        onAny(listener){
            if(typeof listener!=='function')return()=>{};
            this.anyListeners.add(listener);
            return()=>this.anyListeners.delete(listener);
        }
        _emitToObject(object,type,payload){
            const set=this.objectListeners.get(object)?.get(type);
            if(set)for(const listener of Array.from(set)){
                try{listener(payload);}catch(error){console.warn('[SMPhysicsContactSystem] listener failed.',error);}
            }
        }
        _emit(type,info){
            const payload={type,...info,time:performance.now()};
            this._emitToObject(info.meshA,type,{...payload,self:info.meshA,other:info.meshB});
            this._emitToObject(info.meshB,type,{...payload,self:info.meshB,other:info.meshA,normal:info.normal?.clone?.().negate?.()||info.normal});
            for(const listener of Array.from(this.anyListeners)){
                try{listener(payload);}catch(error){console.warn('[SMPhysicsContactSystem] any-listener failed.',error);}
            }
            this.eventBus?.emit?.(`contact:${type}`,payload);
            if((Number(info.impulse)||0)>=this.impactThreshold)this.eventBus?.emit?.('contact:impact',payload);
            return payload;
        }
        _onBackendEvent(event){
            const detail=event?.detail||{};
            const type=String(detail.type||'enter').toLowerCase();
            const info={
                key:detail.key||global.SMPhysicsMath.pairKey(detail.meshA,detail.meshB),
                meshA:detail.meshA||null,
                meshB:detail.meshB||null,
                bodyA:detail.bodyA||null,
                bodyB:detail.bodyB||null,
                point:detail.point||null,
                normal:detail.normal||null,
                impulse:Number(detail.impulse)||0,
                penetration:Number(detail.penetration)||0
            };
            if(!info.meshA&&!info.meshB)return;
            if(type==='enter'){
                this.activePairs.set(info.key,info);
                this._emit('enter',info);
            }else if(type==='exit'){
                const old=this.activePairs.get(info.key)||info;
                this.activePairs.delete(info.key);
                this._emit('exit',old);
            }
        }
        update(){
            const physics=this.physics;
            const frame=Number(physics?._frame??-1);
            if(frame===this._lastFrame)return;
            this._lastFrame=frame;
            const pairs=physics?._collisionPairs;
            if(!pairs?.values)return;
            for(const info of pairs.values()){
                const key=info.key||global.SMPhysicsMath.pairKey(info.meshA,info.meshB);
                const normalized={...info,key};
                this.activePairs.set(key,normalized);
                this._emit('stay',normalized);
            }
        }
        getContactsFor(object){
            const result=[];
            for(const info of this.activePairs.values()){
                if(info.meshA===object||info.meshB===object)result.push(info);
            }
            return result;
        }
    }
    global.SMPhysicsContactSystem=SMPhysicsContactSystem;
})(window);
