(function(){
    'use strict';
    class SMTriggerComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:options.type||'Trigger'});
            this.once=options.once===true;
            this.enabledAfterTrigger=options.enabledAfterTrigger!==false;
            this.requiredTag=String(options.requiredTag||'').toLowerCase();
            this.requiredType=String(options.requiredType||'').toLowerCase();
            this.ignoredTags=new Set(this._normalize(options.ignoredTags));
            this.overlapping=new Map();
            this.triggerCount=0;
            this.hasTriggered=false;
        }
        accepts(object){
            if(!object)return false;
            const record=this.registry?.getRecord?.(object);
            if(this.requiredType&&String(record?.type||object.userData?.runtimeType||'').toLowerCase()!==this.requiredType)return false;
            if(this.requiredTag&&!this.registry?.hasTag?.(object,this.requiredTag)&&!this._objectHasTag(object,this.requiredTag))return false;
            for(const tag of this.ignoredTags)if(this.registry?.hasTag?.(object,tag)||this._objectHasTag(object,tag))return false;
            return true;
        }
        onTriggerEnter(other,contact=null){
            if(!this.enabled||!this.accepts(other))return false;
            const key=other.uuid||other;
            if(this.overlapping.has(key))return false;
            this.overlapping.set(key,{object:other,contact,enteredAt:performance.now()});
            this.triggerCount+=1;
            this.hasTriggered=true;
            const payload={trigger:this,owner:this.owner,other,contact,count:this.triggerCount};
            this.emit('trigger-enter',payload);
            this.onEnter?.(payload);
            if(this.once&&!this.enabledAfterTrigger)this.setEnabled(false);
            return true;
        }
        onTriggerStay(other,contact=null){
            if(!this.enabled||!this.accepts(other))return false;
            const key=other.uuid||other;
            if(!this.overlapping.has(key))this.overlapping.set(key,{object:other,contact,enteredAt:performance.now()});
            const payload={trigger:this,owner:this.owner,other,contact,count:this.triggerCount};
            this.emit('trigger-stay',payload);
            this.onStay?.(payload);
            return true;
        }
        onTriggerExit(other,contact=null){
            const key=other?.uuid||other;
            const existed=this.overlapping.delete(key);
            if(!existed)return false;
            const payload={trigger:this,owner:this.owner,other,contact,count:this.triggerCount};
            this.emit('trigger-exit',payload);
            this.onExit?.(payload);
            return true;
        }
        getOverlapping(){
            return Array.from(this.overlapping.values()).map(entry=>entry.object);
        }
        reset(){
            this.overlapping.clear();
            this.triggerCount=0;
            this.hasTriggered=false;
            if(this.once&&!this.enabled)this.setEnabled(true);
            return this;
        }
        onStop(){
            this.overlapping.clear();
        }
        serializeState(){
            return{...super.serializeState(),once:this.once,enabledAfterTrigger:this.enabledAfterTrigger,requiredTag:this.requiredTag,requiredType:this.requiredType,ignoredTags:Array.from(this.ignoredTags)};
        }
        deserializeState(data={}){
            super.deserializeState(data);
            if(data.once!==undefined)this.once=Boolean(data.once);
            if(data.enabledAfterTrigger!==undefined)this.enabledAfterTrigger=Boolean(data.enabledAfterTrigger);
            if(data.requiredTag!==undefined)this.requiredTag=String(data.requiredTag||'').toLowerCase();
            if(data.requiredType!==undefined)this.requiredType=String(data.requiredType||'').toLowerCase();
            if(data.ignoredTags!==undefined)this.ignoredTags=new Set(this._normalize(data.ignoredTags));
            return this;
        }
        _objectHasTag(object,tag){
            const tags=Array.isArray(object?.userData?.tags)?object.userData.tags:[];
            return tags.map(value=>String(value).toLowerCase()).includes(String(tag).toLowerCase());
        }
        _normalize(value){
            if(value===undefined||value===null)return[];
            const list=Array.isArray(value)?value:String(value).split(',');
            return list.map(item=>String(item).trim().toLowerCase()).filter(Boolean);
        }
        onEnter(){}
        onStay(){}
        onExit(){}
    }
    SMTriggerComponent.componentType='Trigger';
    SMTriggerComponent.executionOrder=50;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(!window.SMComponentRegistry.has('Trigger'))window.SMComponentRegistry.register('Trigger',SMTriggerComponent,{category:'Gameplay',displayName:'Trigger',allowMultiple:false,aliases:['SMTriggerComponent'],executionOrder:50});
        return true;
    };
    register();
    queueMicrotask(register);
    window.addEventListener('sm:runtime-ready',register,{once:true});
    window.SMTriggerComponent=SMTriggerComponent;
    window.SMTriggerComponentClass=SMTriggerComponent;
})();