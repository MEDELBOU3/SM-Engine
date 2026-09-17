(function(global){
    'use strict';
    class SMPhysicsEventBus{
        constructor(){
            this.listeners=new Map();
        }
        on(type,listener){
            if(typeof listener!=='function')return()=>{};
            const key=String(type);
            if(!this.listeners.has(key))this.listeners.set(key,new Set());
            this.listeners.get(key).add(listener);
            return()=>this.off(key,listener);
        }
        once(type,listener){
            let dispose=null;
            dispose=this.on(type,(payload)=>{
                dispose?.();
                listener(payload);
            });
            return dispose;
        }
        off(type,listener){
            const set=this.listeners.get(String(type));
            if(!set)return false;
            const removed=set.delete(listener);
            if(set.size===0)this.listeners.delete(String(type));
            return removed;
        }
        emit(type,payload){
            const set=this.listeners.get(String(type));
            if(!set)return 0;
            let count=0;
            for(const listener of Array.from(set)){
                try{
                    listener(payload);
                    count++;
                }catch(error){
                    console.warn(`[SMPhysicsEventBus] ${type} listener failed.`,error);
                }
            }
            return count;
        }
        clear(type=null){
            if(type===null)this.listeners.clear();
            else this.listeners.delete(String(type));
        }
    }
    global.SMPhysicsEventBus=SMPhysicsEventBus;
})(window);
