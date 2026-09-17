(function(){
    'use strict';class SMRuntimeEventBus{
        constructor(){
            this._listeners=new Map();this._anyListeners=new Set();this._sequence=0;
        }
        on(eventName,handler,options={
        }){
            if(!eventName||typeof handler!=='function')return()=>{
            };const event=String(eventName);const entry={
                id:++this._sequence,handler,once:Boolean(options.once),priority:Number(options.priority||0),signal:options.signal||null
            };if(!this._listeners.has(event))this._listeners.set(event,[]);const list=this._listeners.get(event);list.push(entry);list.sort((a,b)=>b.priority-a.priority||a.id-b.id);if(entry.signal){
                if(entry.signal.aborted){
                    this.off(event,handler);return()=>{
                    };
                }
                entry.signal.addEventListener('abort',()=>this.off(event,handler),{
                    once:true
                });
            }
            return()=>this.off(event,handler);
        }
        once(eventName,handler,options={
        }){
            return this.on(eventName,handler,{
                ...options,once:true
            });
        }
        onAny(handler){
            if(typeof handler!=='function')return()=>{
            };this._anyListeners.add(handler);return()=>this._anyListeners.delete(handler);
        }
        off(eventName,handler){
            const event=String(eventName||'');const list=this._listeners.get(event);if(!list)return false;if(typeof handler!=='function'){
                this._listeners.delete(event);return true;
            }
            const next=list.filter(entry=>entry.handler!==handler);if(next.length)this._listeners.set(event,next);else this._listeners.delete(event);return next.length!==list.length;
        }
        emit(eventName,payload=null,meta={
        }){
            const event=String(eventName||'');if(!event)return false;const packet={
                event,payload,meta:{
                    ...meta
                },timestamp:performance.now(),wallTime:Date.now()
            };const list=(this._listeners.get(event)||[]).slice();let handled=false;for(const entry of list){
                handled=true;try{
                    entry.handler(payload,packet);
                } catch(error){
                    console.error(`[SMRuntimeEventBus] Listener failed for "${event}".`,error);
                }
                if(entry.once)this.off(event,entry.handler);
            }
            for(const handler of Array.from(this._anyListeners)){
                handled=true;try{
                    handler(event,payload,packet);
                } catch(error){
                    console.error(`[SMRuntimeEventBus] Any-listener failed for "${event}".`,error);
                }
            }
            try{
                window.dispatchEvent(new CustomEvent(`sm:runtime:${event}`,{
                    detail:packet
                }));
            } catch{
            }
            return handled;
        }
        async emitAsync(eventName,payload=null,meta={
        }){
            const event=String(eventName||'');if(!event)return[];const packet={
                event,payload,meta:{
                    ...meta
                },timestamp:performance.now(),wallTime:Date.now()
            };const list=(this._listeners.get(event)||[]).slice();const results=[];for(const entry of list){
                try{
                    results.push(await entry.handler(payload,packet));
                } catch(error){
                    console.error(`[SMRuntimeEventBus] Async listener failed for "${event}".`,error);results.push(undefined);
                }
                if(entry.once)this.off(event,entry.handler);
            }
            for(const handler of Array.from(this._anyListeners)){
                try{
                    results.push(await handler(event,payload,packet));
                } catch(error){
                    console.error(`[SMRuntimeEventBus] Async any-listener failed for "${event}".`,error);results.push(undefined);
                }
            }
            try{
                window.dispatchEvent(new CustomEvent(`sm:runtime:${event}`,{
                    detail:packet
                }));
            } catch{
            }
            return results;
        }
        waitFor(eventName,options={
        }){
            const timeoutMs=Math.max(0,Number(options.timeoutMs||0));const predicate=typeof options.predicate==='function'?options.predicate:null;return new Promise((resolve,reject)=>{
                let timer=0;const off=this.on(eventName,(payload,packet)=>{
                    if(predicate&&!predicate(payload,packet))return;off();if(timer)clearTimeout(timer);resolve({
                        payload,packet
                    });
                });if(timeoutMs){
                    timer=setTimeout(()=>{
                        off();reject(new Error(`Timeout waiting for runtime event "${eventName}".`));
                    },timeoutMs);
                }
            });
        }
        clear(eventName=null){
            if(eventName===null||eventName===undefined){
                this._listeners.clear();this._anyListeners.clear();return;
            }
            this._listeners.delete(String(eventName));
        }
        listenerCount(eventName){
            return(this._listeners.get(String(eventName||''))||[]).length;
        }
        debug(){
            const rows=[];for(const[event,list]of this._listeners)rows.push({
                Event:event,Listeners:list.length
            });console.table(rows);return rows;
        }
    }
    const bus=window.SMRuntimeEventBus instanceof SMRuntimeEventBus?window.SMRuntimeEventBus:new SMRuntimeEventBus();window.SMRuntimeEventBusClass=SMRuntimeEventBus;window.SMRuntimeEventBus=bus;window.smRuntimeEventBus=bus;
})();