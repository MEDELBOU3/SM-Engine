(function(){
    'use strict';
    class SMLifetimeComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:options.type||'Lifetime'});
            this.lifetime=Math.max(0,Number(options.lifetime??5));
            this.remaining=this.lifetime;
            this.autoStart=options.autoStart!==false;
            this.destroyOwner=options.destroyOwner!==false;
            this.disposeOnExpire=options.disposeOnExpire===true;
            this.running=false;
            this.expired=false;
        }
        onStart(){
            this.remaining=this.lifetime;
            this.expired=false;
            this.running=this.autoStart;
        }
        onUpdate(dt){
            if(!this.running||this.expired)return;
            this.remaining=Math.max(0,this.remaining-Math.max(0,Number(dt)||0));
            if(this.remaining<=0)this.expire();
        }
        startTimer(seconds=null){
            if(seconds!==null)this.lifetime=Math.max(0,Number(seconds)||0);
            this.remaining=this.lifetime;
            this.expired=false;
            this.running=true;
            return this;
        }
        pauseTimer(){
            this.running=false;
            return this;
        }
        resumeTimer(){
            if(!this.expired)this.running=true;
            return this;
        }
        reset(seconds=null){
            if(seconds!==null)this.lifetime=Math.max(0,Number(seconds)||0);
            this.remaining=this.lifetime;
            this.expired=false;
            this.running=this.autoStart;
            return this;
        }
        expire(context={}){
            if(this.expired)return false;
            this.expired=true;
            this.running=false;
            this.remaining=0;
            const payload={component:this,owner:this.owner,context};
            this.emit('lifetime-expired',payload);
            this.onExpired?.(payload);
            if(this.destroyOwner&&this.owner)this.destroyObject(this.owner,{dispose:this.disposeOnExpire,reason:'lifetime-expired'});
            return true;
        }
        serializeState(){
            return{...super.serializeState(),lifetime:this.lifetime,autoStart:this.autoStart,destroyOwner:this.destroyOwner,disposeOnExpire:this.disposeOnExpire};
        }
        deserializeState(data={}){
            super.deserializeState(data);
            if(data.lifetime!==undefined)this.lifetime=Math.max(0,Number(data.lifetime)||0);
            if(data.autoStart!==undefined)this.autoStart=Boolean(data.autoStart);
            if(data.destroyOwner!==undefined)this.destroyOwner=Boolean(data.destroyOwner);
            if(data.disposeOnExpire!==undefined)this.disposeOnExpire=Boolean(data.disposeOnExpire);
            this.remaining=this.lifetime;
            return this;
        }
        onExpired(){}
    }
    SMLifetimeComponent.componentType='Lifetime';
    SMLifetimeComponent.executionOrder=100;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(!window.SMComponentRegistry.has('Lifetime'))window.SMComponentRegistry.register('Lifetime',SMLifetimeComponent,{category:'Utility',displayName:'Lifetime',allowMultiple:false,aliases:['SMLifetimeComponent'],executionOrder:100});
        return true;
    };
    register();
    queueMicrotask(register);
    window.addEventListener('sm:runtime-ready',register,{once:true});
    window.SMLifetimeComponent=SMLifetimeComponent;
    window.SMLifetimeComponentClass=SMLifetimeComponent;
})();