(function(){
    'use strict';
    class SMDamageableComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:options.type||'Damageable'});
            this.damageMultiplier=Math.max(0,Number(options.damageMultiplier??1));
            this.minimumDamage=Math.max(0,Number(options.minimumDamage??0));
            this.maximumDamage=Number.isFinite(Number(options.maximumDamage))?Math.max(0,Number(options.maximumDamage)):Infinity;
            this.acceptedDamageTypes=this._normalizeSet(options.acceptedDamageTypes);
            this.ignoredDamageTypes=this._normalizeSet(options.ignoredDamageTypes);
            this.resistances={...(options.resistances||{})};
            this.invulnerable=options.invulnerable===true;
        }
        applyDamage(amount,context={}){
            if(this.invulnerable)return this._result(0,amount,context,'invulnerable');
            const damageType=String(context.damageType||context.type||'generic').toLowerCase();
            if(this.ignoredDamageTypes.has(damageType))return this._result(0,amount,context,'ignored-type');
            if(this.acceptedDamageTypes.size&&!this.acceptedDamageTypes.has(damageType))return this._result(0,amount,context,'not-accepted');
            const requested=Math.max(0,Number(amount)||0);
            const resistance=this._clamp(Number(this.resistances[damageType]??0),0,1);
            let final=requested*this.damageMultiplier*(1-resistance);
            final=this._clamp(final,this.minimumDamage,this.maximumDamage);
            const health=this.getComponent('Health');
            let applied=final;
            let healthResult=null;
            if(health?.damage){
                healthResult=health.damage(final,{...context,damageType,damageable:this});
                applied=Number(healthResult?.applied??final);
            }
            const result=this._result(applied,requested,{...context,damageType},health?'health':'no-health');
            result.health=healthResult;
            this.emit('damage-received',result);
            this.onDamageReceived?.(result);
            return result;
        }
        canReceiveDamage(context={}){
            if(this.invulnerable)return false;
            const type=String(context.damageType||context.type||'generic').toLowerCase();
            if(this.ignoredDamageTypes.has(type))return false;
            if(this.acceptedDamageTypes.size&&!this.acceptedDamageTypes.has(type))return false;
            return true;
        }
        setResistance(type,value){
            this.resistances[String(type||'generic').toLowerCase()]=this._clamp(Number(value)||0,0,1);
            return this;
        }
        getResistance(type){
            return this._clamp(Number(this.resistances[String(type||'generic').toLowerCase()]??0),0,1);
        }
        serializeState(){
            return{...super.serializeState(),damageMultiplier:this.damageMultiplier,minimumDamage:this.minimumDamage,maximumDamage:Number.isFinite(this.maximumDamage)?this.maximumDamage:null,acceptedDamageTypes:Array.from(this.acceptedDamageTypes),ignoredDamageTypes:Array.from(this.ignoredDamageTypes),resistances:{...this.resistances},invulnerable:this.invulnerable};
        }
        deserializeState(data={}){
            super.deserializeState(data);
            if(data.damageMultiplier!==undefined)this.damageMultiplier=Math.max(0,Number(data.damageMultiplier)||0);
            if(data.minimumDamage!==undefined)this.minimumDamage=Math.max(0,Number(data.minimumDamage)||0);
            if(data.maximumDamage!==undefined)this.maximumDamage=data.maximumDamage===null?Infinity:Math.max(0,Number(data.maximumDamage)||0);
            if(data.acceptedDamageTypes!==undefined)this.acceptedDamageTypes=this._normalizeSet(data.acceptedDamageTypes);
            if(data.ignoredDamageTypes!==undefined)this.ignoredDamageTypes=this._normalizeSet(data.ignoredDamageTypes);
            if(data.resistances&&typeof data.resistances==='object')this.resistances={...data.resistances};
            if(data.invulnerable!==undefined)this.invulnerable=Boolean(data.invulnerable);
            return this;
        }
        _result(applied,requested,context,reason){
            return{applied:Number(applied)||0,requested:Math.max(0,Number(requested)||0),context,reason,owner:this.owner,component:this};
        }
        _normalizeSet(value){
            if(value===undefined||value===null)return new Set();
            const list=Array.isArray(value)?value:String(value).split(',');
            return new Set(list.map(item=>String(item).trim().toLowerCase()).filter(Boolean));
        }
        _clamp(value,min,max){
            return Math.max(min,Math.min(max,value));
        }
        onDamageReceived(){}
    }
    SMDamageableComponent.componentType='Damageable';
    SMDamageableComponent.executionOrder=-90;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(!window.SMComponentRegistry.has('Damageable'))window.SMComponentRegistry.register('Damageable',SMDamageableComponent,{category:'Gameplay',displayName:'Damageable',allowMultiple:false,aliases:['SMDamageableComponent'],executionOrder:-90});
        return true;
    };
    register();
    queueMicrotask(register);
    window.addEventListener('sm:runtime-ready',register,{once:true});
    window.SMDamageableComponent=SMDamageableComponent;
    window.SMDamageableComponentClass=SMDamageableComponent;
})();