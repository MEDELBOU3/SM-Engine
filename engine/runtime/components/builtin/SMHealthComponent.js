(function(){
    'use strict';
    class SMHealthComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:options.type||'Health'});
            this.maxHealth=Math.max(0,Number(options.maxHealth??100));
            this.health=this._clamp(Number(options.health??this.maxHealth),0,this.maxHealth);
            this.invulnerable=options.invulnerable===true;
            this.allowOverheal=options.allowOverheal===true;
            this.autoDestroyOwner=options.autoDestroyOwner===true;
            this.destroyDelay=Math.max(0,Number(options.destroyDelay??0));
            this.dead=this.health<=0;
            this._destroyTimer=null;
        }
        get normalized(){
            return this.maxHealth>0?this.health/this.maxHealth:0;
        }
        get isDead(){
            return this.dead;
        }
        damage(amount,context={}){
            const value=Math.max(0,Number(amount)||0);
            if(!value||this.dead||this.invulnerable)return{applied:0,health:this.health,dead:this.dead};
            const before=this.health;
            this.health=this._clamp(this.health-value,0,this.allowOverheal?Infinity:this.maxHealth);
            const applied=before-this.health;
            this.emit('health-damaged',{amount:applied,requested:value,before,after:this.health,normalized:this.normalized,context});
            if(this.health<=0)this.kill(context);
            return{applied,health:this.health,dead:this.dead};
        }
        heal(amount,context={}){
            const value=Math.max(0,Number(amount)||0);
            if(!value||this.dead)return{applied:0,health:this.health};
            const before=this.health;
            const max=this.allowOverheal?Infinity:this.maxHealth;
            this.health=this._clamp(this.health+value,0,max);
            const applied=this.health-before;
            this.emit('health-healed',{amount:applied,requested:value,before,after:this.health,normalized:this.normalized,context});
            return{applied,health:this.health};
        }
        setHealth(value,context={}){
            const before=this.health;
            const max=this.allowOverheal?Infinity:this.maxHealth;
            this.health=this._clamp(Number(value)||0,0,max);
            this.emit('health-changed',{before,after:this.health,normalized:this.normalized,context});
            if(this.health<=0&&!this.dead)this.kill(context);
            return this.health;
        }
        setMaxHealth(value,options={}){
            this.maxHealth=Math.max(0,Number(value)||0);
            if(options.keepRatio===true){
                const ratio=options.previousMax>0?this.health/options.previousMax:this.normalized;
                this.health=this.maxHealth*ratio;
            }else if(!this.allowOverheal){
                this.health=Math.min(this.health,this.maxHealth);
            }
            return this.maxHealth;
        }
        kill(context={}){
            if(this.dead)return false;
            this.health=0;
            this.dead=true;
            this.emit('health-death',{context});
            this.onDeath?.(context);
            if(this.autoDestroyOwner)this._scheduleOwnerDestroy(context);
            return true;
        }
        revive(health=null,context={}){
            this._clearDestroyTimer();
            const next=health===null?this.maxHealth:Number(health);
            this.health=this._clamp(next,0,this.allowOverheal?Infinity:this.maxHealth);
            if(this.health<=0)this.health=Math.min(this.maxHealth,1);
            this.dead=false;
            this.emit('health-revived',{health:this.health,normalized:this.normalized,context});
            this.onRevive?.(context);
            return this.health;
        }
        onStop(){
            this._clearDestroyTimer();
        }
        onDestroy(){
            this._clearDestroyTimer();
        }
        serializeState(){
            return{...super.serializeState(),maxHealth:this.maxHealth,health:this.health,invulnerable:this.invulnerable,allowOverheal:this.allowOverheal,autoDestroyOwner:this.autoDestroyOwner,destroyDelay:this.destroyDelay};
        }
        deserializeState(data={}){
            super.deserializeState(data);
            if(data.maxHealth!==undefined)this.maxHealth=Math.max(0,Number(data.maxHealth)||0);
            if(data.health!==undefined)this.health=this._clamp(Number(data.health)||0,0,data.allowOverheal===true?Infinity:this.maxHealth);
            if(data.invulnerable!==undefined)this.invulnerable=Boolean(data.invulnerable);
            if(data.allowOverheal!==undefined)this.allowOverheal=Boolean(data.allowOverheal);
            if(data.autoDestroyOwner!==undefined)this.autoDestroyOwner=Boolean(data.autoDestroyOwner);
            if(data.destroyDelay!==undefined)this.destroyDelay=Math.max(0,Number(data.destroyDelay)||0);
            this.dead=this.health<=0;
            return this;
        }
        _scheduleOwnerDestroy(context){
            this._clearDestroyTimer();
            if(this.destroyDelay<=0){
                this.destroyObject(this.owner,{dispose:false,reason:'health-death',context});
                return;
            }
            this._destroyTimer=setTimeout(()=>{
                this._destroyTimer=null;
                if(this.dead&&this.owner)this.destroyObject(this.owner,{dispose:false,reason:'health-death',context});
            },this.destroyDelay*1000);
        }
        _clearDestroyTimer(){
            if(this._destroyTimer){
                clearTimeout(this._destroyTimer);
                this._destroyTimer=null;
            }
        }
        _clamp(value,min,max){
            return Math.max(min,Math.min(max,value));
        }
        onDeath(){}
        onRevive(){}
    }
    SMHealthComponent.componentType='Health';
    SMHealthComponent.executionOrder=-100;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(!window.SMComponentRegistry.has('Health'))window.SMComponentRegistry.register('Health',SMHealthComponent,{category:'Gameplay',displayName:'Health',allowMultiple:false,aliases:['SMHealthComponent'],executionOrder:-100});
        return true;
    };
    register();
    queueMicrotask(register);
    window.addEventListener('sm:runtime-ready',register,{once:true});
    window.SMHealthComponent=SMHealthComponent;
    window.SMHealthComponentClass=SMHealthComponent;
})();