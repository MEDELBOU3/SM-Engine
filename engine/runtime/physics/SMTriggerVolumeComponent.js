(function(){
    'use strict';
    class SMTriggerVolumeComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:'TriggerVolume'});
            this.shape=String(options.shape||'box').toLowerCase();
            this.size=this._vector(options.size,[1,1,1]);
            this.radius=Math.max(0,Number(options.radius??1));
            this.height=Math.max(0,Number(options.height??2));
            this.center=this._vector(options.center,[0,0,0]);
            this.requiredTags=window.SMGameplayTags?.toArray?.(options.requiredTags||options.requiredTag||[])||[];
            this.blockedTags=window.SMGameplayTags?.toArray?.(options.blockedTags||[])||[];
            this.once=options.once===true;
            this.enabled=options.enabled!==false;
            this.overlaps=new Map();
            this.triggered=false;
            this.collider=null;
        }
        onAttach(){
            if(this.owner){
                this.owner.userData=this.owner.userData||{};
                this.owner.userData.runtimeType=this.owner.userData.runtimeType||'trigger-volume';
                this.owner.userData.isTrigger=true;
            }
        }
        onStart(){
            this._ensureCollider();
            window.SMPhysicsComponentBridge?.registerTriggerVolume?.(this);
        }
        onStop(){
            window.SMPhysicsComponentBridge?.unregisterTriggerVolume?.(this);
            this.overlaps.clear();
        }
        onDestroy(){
            window.SMPhysicsComponentBridge?.unregisterTriggerVolume?.(this);
            this.overlaps.clear();
            this.collider=null;
        }
        accepts(other){
            if(!this.enabled)return false;
            const object=other?.object||other;
            if(!object)return false;
            if(this.requiredTags.length&&!window.SMGameplayTags?.all?.(object,this.requiredTags))return false;
            if(this.blockedTags.length&&window.SMGameplayTags?.any?.(object,this.blockedTags))return false;
            return true;
        }
        onTriggerEnter(other,contact){
            if(this.once&&this.triggered)return;
            if(!this.accepts(other))return;
            const key=this._key(other);
            if(this.overlaps.has(key))return;
            this.overlaps.set(key,{other,contact,enteredAt:performance.now?.()||Date.now()});
            this.triggered=true;
            this.emit('trigger-enter',{other,contact,volume:this});
            window.SMRuntime?.emitGameplayEvent?.('event.trigger.enter',{volume:this,other,contact},{source:this.owner,target:other?.object||other,tags:['event.trigger']});
            if(this.once)this.setEnabled(false);
        }
        onTriggerStay(other,contact){
            if(!this.accepts(other))return;
            const key=this._key(other);
            if(!this.overlaps.has(key))this.overlaps.set(key,{other,contact,enteredAt:performance.now?.()||Date.now()});
            this.emit('trigger-stay',{other,contact,volume:this});
        }
        onTriggerExit(other,contact){
            const key=this._key(other);
            if(!this.overlaps.has(key))return;
            this.overlaps.delete(key);
            this.emit('trigger-exit',{other,contact,volume:this});
            window.SMRuntime?.emitGameplayEvent?.('event.trigger.exit',{volume:this,other,contact},{source:this.owner,target:other?.object||other,tags:['event.trigger']});
        }
        setEnabled(enabled){
            this.enabled=Boolean(enabled);
            if(this.collider)this.collider.enabled=this.enabled;
            if(!this.enabled)this.overlaps.clear();
            return this.enabled;
        }
        resetTrigger(){
            this.triggered=false;
            this.overlaps.clear();
            if(this.once)this.setEnabled(true);
            return true;
        }
        _ensureCollider(){
            let collider=this.owner?.getComponent?.('Collider')||this.owner?.components?.get?.('Collider')||null;
            if(!collider&&this.owner?.addComponent){
                try{collider=this.owner.addComponent('Collider',{shape:this.shape,size:this.size,radius:this.radius,height:this.height,center:this.center,isTrigger:true});}catch{}
            }
            if(collider){
                collider.isTrigger=true;
                collider.shape=this.shape;
                collider.size=[...this.size];
                collider.radius=this.radius;
                collider.height=this.height;
                collider.center=[...this.center];
                this.collider=collider;
            }
            return collider;
        }
        _key(other){
            return String(other?.id||other?.object?.uuid||other?.uuid||other?.owner?.uuid||Math.random());
        }
        _vector(value,fallback=[0,0,0]){
            if(Array.isArray(value))return[Number(value[0]??fallback[0]),Number(value[1]??fallback[1]),Number(value[2]??fallback[2])];
            if(value&&typeof value==='object')return[Number(value.x??fallback[0]),Number(value.y??fallback[1]),Number(value.z??fallback[2])];
            return[...fallback];
        }
        serializeState(){
            return{shape:this.shape,size:[...this.size],radius:this.radius,height:this.height,center:[...this.center],requiredTags:[...this.requiredTags],blockedTags:[...this.blockedTags],once:this.once,enabled:this.enabled};
        }
        debug(){
            const state={owner:this.owner?.name||this.owner?.uuid||null,shape:this.shape,once:this.once,enabled:this.enabled,triggered:this.triggered,overlaps:this.overlaps.size,requiredTags:[...this.requiredTags],blockedTags:[...this.blockedTags]};
            console.log('[SMTriggerVolumeComponent]',state);
            return state;
        }
    }
    SMTriggerVolumeComponent.componentType='TriggerVolume';
    SMTriggerVolumeComponent.executionOrder=6;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(window.SMComponentRegistry.has?.('TriggerVolume'))return true;
        window.SMComponentRegistry.register('TriggerVolume',SMTriggerVolumeComponent,{displayName:'Trigger Volume',category:'Physics',description:'Gameplay overlap volume backed by a trigger collider.',allowMultiple:false,aliases:['SMTriggerVolumeComponent'],executionOrder:6});
        return true;
    };
    window.SMTriggerVolumeComponent=SMTriggerVolumeComponent;
    window.SMTriggerVolumeComponentClass=SMTriggerVolumeComponent;
    if(!register())queueMicrotask(register);
    window.addEventListener?.('sm:runtime-ready',register,{once:true});
})();