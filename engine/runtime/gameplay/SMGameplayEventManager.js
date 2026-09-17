(function(){
    'use strict';
    class SMGameplayEventManager{
        constructor(){
            this.listeners=new Map();
            this.anyListeners=new Set();
            this.queue=[];
            this.history=[];
            this.maxHistory=250;
            this.dispatching=false;
        }
        on(type,handler,options={}){
            if(typeof handler!=='function')throw new TypeError('SMGameplayEventManager.on(type, handler) expects a function.');
            const key=this._normalize(type);
            if(!this.listeners.has(key))this.listeners.set(key,new Set());
            const record={handler,priority:Number(options.priority||0),once:options.once===true,tagQuery:options.tagQuery||null};
            this.listeners.get(key).add(record);
            return()=>this.off(key,handler);
        }
        once(type,handler,options={}){
            return this.on(type,handler,{...options,once:true});
        }
        onAny(handler,options={}){
            if(typeof handler!=='function')throw new TypeError('onAny(handler) expects a function.');
            const record={handler,priority:Number(options.priority||0),once:options.once===true,tagQuery:options.tagQuery||null};
            this.anyListeners.add(record);
            return()=>this.anyListeners.delete(record);
        }
        off(type,handler){
            const key=this._normalize(type);
            const set=this.listeners.get(key);
            if(!set)return false;
            let removed=false;
            for(const record of Array.from(set))if(record.handler===handler){set.delete(record);removed=true;}
            if(!set.size)this.listeners.delete(key);
            return removed;
        }
        emit(type,payload={},options={}){
            const event=type instanceof window.SMGameplayEvent?type:new window.SMGameplayEvent(type,payload,options);
            return this.dispatch(event);
        }
        queueEvent(type,payload={},options={}){
            const event=type instanceof window.SMGameplayEvent?type:new window.SMGameplayEvent(type,payload,options);
            this.queue.push(event);
            return event;
        }
        flush(limit=Infinity){
            let count=0;
            while(this.queue.length&&count<limit){
                this.dispatch(this.queue.shift());
                count+=1;
            }
            return count;
        }
        dispatch(event){
            if(!(event instanceof window.SMGameplayEvent))throw new TypeError('dispatch(event) expects SMGameplayEvent.');
            this.dispatching=true;
            const records=[];
            for(const[key,set]of this.listeners){
                if(key===event.type||this._matchesHierarchy(event.type,key))for(const record of set)records.push({record,key,set});
            }
            for(const record of this.anyListeners)records.push({record,key:'*',set:this.anyListeners});
            records.sort((a,b)=>b.record.priority-a.record.priority);
            for(const item of records){
                if(event.propagationStopped)break;
                if(item.record.tagQuery&&!this._tagQueryMatches(event.tags,item.record.tagQuery))continue;
                try{
                    const result=item.record.handler(event);
                    if(result===false&&event.cancelable)event.cancel('listener-returned-false');
                }catch(error){console.error(`[SMGameplayEventManager] Listener "${item.key}" failed.`,error);}
                if(item.record.once)item.set.delete(item.record);
            }
            this.dispatching=false;
            this.history.push(event);
            if(this.history.length>this.maxHistory)this.history.splice(0,this.history.length-this.maxHistory);
            window.SMRuntimeEventBus?.emit?.('gameplay:event',{manager:this,event});
            window.dispatchEvent(new CustomEvent('sm:gameplay-event',{detail:{manager:this,event}}));
            return event;
        }
        clear(type=null){
            if(type===null){
                this.listeners.clear();
                this.anyListeners.clear();
                this.queue.length=0;
                return true;
            }
            return this.listeners.delete(this._normalize(type));
        }
        clearHistory(){
            const count=this.history.length;
            this.history.length=0;
            return count;
        }
        getHistory(type=null){
            if(type===null)return[...this.history];
            const key=this._normalize(type);
            return this.history.filter(event=>event.type===key||this._matchesHierarchy(event.type,key));
        }
        _tagQueryMatches(tags,query){
            if(typeof query==='string')return window.SMGameplayTags?.any?.(tags,[query])||false;
            if(Array.isArray(query))return window.SMGameplayTags?.all?.(tags,query)||false;
            if(query&&typeof query==='object'){
                if(query.all&&!window.SMGameplayTags?.all?.(tags,query.all,{exact:query.exact===true}))return false;
                if(query.any&&!window.SMGameplayTags?.any?.(tags,query.any,{exact:query.exact===true}))return false;
                if(query.none&&window.SMGameplayTags?.any?.(tags,query.none,{exact:query.exact===true}))return false;
                return true;
            }
            return true;
        }
        _matchesHierarchy(eventType,listenerType){
            return eventType.startsWith(`${listenerType}.`);
        }
        _normalize(type){
            return window.SMGameplayTags?.normalize?.(type)||String(type||'').trim().toLowerCase();
        }
        debug(){
            const state={listenerTypes:this.listeners.size,anyListeners:this.anyListeners.size,queued:this.queue.length,history:this.history.length,dispatching:this.dispatching};
            console.log('[SMGameplayEventManager]',state);
            return state;
        }
    }
    const manager=new SMGameplayEventManager();
    window.SMGameplayEventManagerClass=SMGameplayEventManager;
    window.SMGameplayEventManager=manager;
    window.smGameplayEventManager=manager;
})();