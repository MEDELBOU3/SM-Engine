(function(){
    'use strict';
    class SMGameplayEvent{
        constructor(type,payload={},options={}){
            this.id=String(options.id||`gameplay-event-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
            this.type=window.SMGameplayTags?.normalize?.(type)||String(type||'event');
            this.source=options.source||payload?.source||null;
            this.target=options.target||payload?.target||null;
            this.instigator=options.instigator||payload?.instigator||this.source||null;
            this.payload=payload&&typeof payload==='object'?payload:{value:payload};
            this.tags=window.SMGameplayTags?.toArray?.(options.tags||payload?.tags||[])||[];
            this.time=Number(options.time??performance.now?.()??Date.now());
            this.cancelable=options.cancelable!==false;
            this.cancelled=false;
            this.propagationStopped=false;
            this.metadata={...(options.metadata||{})};
        }
        cancel(reason=null){
            if(!this.cancelable)return false;
            this.cancelled=true;
            if(reason!==null)this.metadata.cancelReason=reason;
            return true;
        }
        stopPropagation(){
            this.propagationStopped=true;
            return true;
        }
        hasTag(tag,options={}){
            return window.SMGameplayTags?.any?.(this.tags,[tag],options)||false;
        }
        serialize(){
            return{id:this.id,type:this.type,sourceUUID:this.source?.uuid||this.source?.object?.uuid||null,targetUUID:this.target?.uuid||this.target?.object?.uuid||null,instigatorUUID:this.instigator?.uuid||this.instigator?.object?.uuid||null,payload:this._safePayload(this.payload),tags:[...this.tags],time:this.time,cancelable:this.cancelable,cancelled:this.cancelled,metadata:{...this.metadata}};
        }
        _safePayload(payload){
            const output={};
            for(const[key,value]of Object.entries(payload||{})){
                if(typeof value==='function'||typeof value==='undefined')continue;
                if(value?.isObject3D||value?.object?.isObject3D)output[key]={__objectUUID:value.uuid||value.object.uuid};
                else{
                    try{output[key]=structuredClone(value);}catch{
                        try{output[key]=JSON.parse(JSON.stringify(value));}catch{}
                    }
                }
            }
            return output;
        }
        debug(){
            const state={id:this.id,type:this.type,tags:[...this.tags],cancelled:this.cancelled,propagationStopped:this.propagationStopped,source:this.source?.name||this.source?.id||null,target:this.target?.name||this.target?.id||null,payload:this.payload};
            console.log('[SMGameplayEvent]',state);
            return state;
        }
    }
    window.SMGameplayEvent=SMGameplayEvent;
    window.SMGameplayEventClass=SMGameplayEvent;
})();