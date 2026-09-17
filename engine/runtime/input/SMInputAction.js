(function(){
    'use strict';
    class SMInputAction{
        constructor(name,options={}){
            if(!name)throw new Error('SMInputAction requires a name.');
            this.name=String(name);
            this.type=this._normalizeType(options.type||'button');
            this.enabled=options.enabled!==false;
            this.deadzone=Math.max(0,Number(options.deadzone??0.1));
            this.threshold=Math.max(0,Number(options.threshold??0.5));
            this.scale=Number(options.scale??1);
            this.metadata={...(options.metadata||{})};
            this.value=this._zeroValue();
            this.previousValue=this._zeroValue();
            this.active=false;
            this.wasActive=false;
            this.pressed=false;
            this.released=false;
            this.changed=false;
            this.holdTime=0;
            this._accumulator=this._zeroValue();
            this._listeners=new Map();
        }
        setEnabled(enabled){
            this.enabled=Boolean(enabled);
            if(!this.enabled)this.reset();
            return this.enabled;
        }
        setDeadzone(value){
            this.deadzone=Math.max(0,Number(value)||0);
            return this.deadzone;
        }
        setScale(value){
            this.scale=Number(value)||0;
            return this.scale;
        }
        getValue(){
            if(this.type==='axis2d')return{x:this.value.x,y:this.value.y};
            return this.value;
        }
        isPressed(){
            return this.pressed;
        }
        isReleased(){
            return this.released;
        }
        isActive(){
            return this.active;
        }
        on(event,handler){
            if(typeof handler!=='function')throw new TypeError('SMInputAction.on(event, handler) expects a function.');
            const key=String(event);
            if(!this._listeners.has(key))this._listeners.set(key,new Set());
            this._listeners.get(key).add(handler);
            return()=>this.off(key,handler);
        }
        off(event,handler){
            const set=this._listeners.get(String(event));
            if(!set)return false;
            const result=set.delete(handler);
            if(!set.size)this._listeners.delete(String(event));
            return result;
        }
        reset(){
            this.value=this._zeroValue();
            this.previousValue=this._zeroValue();
            this._accumulator=this._zeroValue();
            this.active=false;
            this.wasActive=false;
            this.pressed=false;
            this.released=false;
            this.changed=false;
            this.holdTime=0;
            return this;
        }
        _beginFrame(){
            this.previousValue=this.type==='axis2d'?{x:this.value.x,y:this.value.y}:this.value;
            this.wasActive=this.active;
            this._accumulator=this._zeroValue();
            this.pressed=false;
            this.released=false;
            this.changed=false;
        }
        _accumulate(value,axis=null,scale=1){
            if(!this.enabled)return;
            const factor=(Number(scale)||0)*this.scale;
            if(this.type==='axis2d'){
                if(value&&typeof value==='object'){
                    this._accumulator.x+=Number(value.x||0)*factor;
                    this._accumulator.y+=Number(value.y||0)*factor;
                }else if(axis==='x'||axis==='y'){
                    this._accumulator[axis]+=Number(value||0)*factor;
                }
                return;
            }
            if(this.type==='button')this._accumulator=Math.max(Number(this._accumulator)||0,Math.abs(Number(value)||0)*Math.abs(factor));
            else this._accumulator+=(Number(value)||0)*factor;
        }
        _commit(dt=0){
            if(!this.enabled){
                this.reset();
                return;
            }
            if(this.type==='axis2d'){
                let x=Number(this._accumulator.x)||0;
                let y=Number(this._accumulator.y)||0;
                const length=Math.hypot(x,y);
                if(length<this.deadzone){x=0;y=0;}
                else if(length>1){x/=length;y/=length;}
                this.value={x,y};
                this.active=Math.hypot(x,y)>=this.threshold;
                this.changed=Math.abs(x-this.previousValue.x)>1e-5||Math.abs(y-this.previousValue.y)>1e-5;
            }else{
                let value=Number(this._accumulator)||0;
                if(Math.abs(value)<this.deadzone)value=0;
                if(this.type==='button')value=value>=this.threshold?1:0;
                else value=Math.max(-1,Math.min(1,value));
                this.value=value;
                this.active=Math.abs(value)>=this.threshold;
                this.changed=Math.abs(value-Number(this.previousValue||0))>1e-5;
            }
            this.pressed=this.active&&!this.wasActive;
            this.released=!this.active&&this.wasActive;
            this.holdTime=this.active?(this.wasActive?this.holdTime+Math.max(0,Number(dt)||0):0):0;
            if(this.changed)this._emit('changed',this._payload());
            if(this.pressed)this._emit('pressed',this._payload());
            if(this.released)this._emit('released',this._payload());
            if(this.active)this._emit('active',this._payload());
        }
        serialize(){
            return{name:this.name,type:this.type,enabled:this.enabled,deadzone:this.deadzone,threshold:this.threshold,scale:this.scale,metadata:{...this.metadata}};
        }
        _payload(){
            return{action:this,name:this.name,type:this.type,value:this.getValue(),active:this.active,pressed:this.pressed,released:this.released,holdTime:this.holdTime};
        }
        _emit(event,payload){
            for(const handler of this._listeners.get(String(event))||[]){
                try{handler(payload);}catch(error){console.error(`[SMInputAction:${this.name}] Listener failed.`,error);}
            }
        }
        _zeroValue(){
            return this.type==='axis2d'?{x:0,y:0}:0;
        }
        _normalizeType(type){
            const value=String(type||'button').toLowerCase();
            return['button','axis1d','axis2d'].includes(value)?value:'button';
        }
    }
    window.SMInputAction=SMInputAction;
    window.SMInputActionClass=SMInputAction;
})();