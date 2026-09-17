(function(){
    'use strict';
    class SMCharacterComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:options.type||'Character'});
            this.walkSpeed=Math.max(0,Number(options.walkSpeed??4.5));
            this.runSpeed=Math.max(0,Number(options.runSpeed??7.5));
            this.acceleration=Math.max(0,Number(options.acceleration??18));
            this.deceleration=Math.max(0,Number(options.deceleration??24));
            this.jumpForce=Math.max(0,Number(options.jumpForce??6));
            this.gravityScale=Math.max(0,Number(options.gravityScale??1));
            this.canMove=options.canMove!==false;
            this.canJump=options.canJump!==false;
            this.isGrounded=options.isGrounded===true;
            this.isRunning=false;
            this.moveInput={x:0,y:0,z:0};
            this.velocity={x:0,y:0,z:0};
            this.adapter=null;
            this.adapterName=options.adapterName||'auto';
            this.autoResolveAdapter=options.autoResolveAdapter!==false;
        }
        onStart(){
            if(this.autoResolveAdapter)this.resolveAdapter();
            this._notifyAdapter(['onCharacterStart','startCharacter'],this,this.owner,this.world);
        }
        onFixedUpdate(dt){
            if(!this.canMove)return;
            if(this.adapter?.fixedUpdate){
                this.adapter.fixedUpdate(dt,this);
                return;
            }
            this._notifyAdapter(['moveCharacter','move'],this.moveInput,dt,this);
        }
        onPause(){
            this._notifyAdapter(['onCharacterPause','pauseCharacter'],this);
        }
        onResume(){
            this._notifyAdapter(['onCharacterResume','resumeCharacter'],this);
        }
        onStop(){
            this._notifyAdapter(['onCharacterStop','stopCharacter'],this);
            this.clearInput();
        }
        setAdapter(adapter){
            if(adapter!==null&&typeof adapter!=='object')throw new TypeError('SMCharacterComponent.setAdapter(adapter) expects an object or null.');
            this.adapter=adapter;
            return this;
        }
        resolveAdapter(){
            const candidates=[
                window.playerPhysicsController,
                window.PlayerPhysicsController,
                window.characterController,
                window.CharacterController,
                window.smCharacterController,
                window.SMCharacterController,
                window.SMRuntimePhysicsBridge?.getBackend?.()
            ];
            this.adapter=candidates.find(candidate=>candidate&&typeof candidate==='object')||null;
            return this.adapter;
        }
        setMoveInput(x=0,z=0,y=0){
            if(typeof x==='object'&&x){
                this.moveInput.x=Number(x.x??0);
                this.moveInput.y=Number(x.y??0);
                this.moveInput.z=Number(x.z??x.y??0);
            }else{
                this.moveInput.x=Number(x)||0;
                this.moveInput.y=Number(y)||0;
                this.moveInput.z=Number(z)||0;
            }
            const length=Math.hypot(this.moveInput.x,this.moveInput.z);
            if(length>1){
                this.moveInput.x/=length;
                this.moveInput.z/=length;
            }
            return this.moveInput;
        }
        clearInput(){
            this.moveInput.x=0;
            this.moveInput.y=0;
            this.moveInput.z=0;
            this.isRunning=false;
            return this.moveInput;
        }
        setRunning(enabled){
            this.isRunning=Boolean(enabled);
            return this.isRunning;
        }
        getDesiredSpeed(){
            return this.isRunning?this.runSpeed:this.walkSpeed;
        }
        jump(context={}){
            if(!this.canJump||!this.isGrounded)return false;
            const result=this._callAdapter(['jump','requestJump'],this.jumpForce,this,context);
            if(result===false)return false;
            this.isGrounded=false;
            this.emit('character-jump',{jumpForce:this.jumpForce,context});
            return true;
        }
        setGrounded(grounded,context={}){
            const next=Boolean(grounded);
            if(next===this.isGrounded)return next;
            this.isGrounded=next;
            this.emit(next?'character-grounded':'character-airborne',{context});
            return next;
        }
        teleport(position,quaternion=null){
            if(this.adapter){
                const result=this._callAdapter(['teleport','setPosition'],position,quaternion,this);
                if(result!==undefined)return result;
            }
            this._setVector(this.owner?.position,position);
            if(quaternion&&this.owner?.quaternion)this._setQuaternion(this.owner.quaternion,quaternion);
            this.owner?.updateMatrixWorld?.(true);
            return true;
        }
        serializeState(){
            return{...super.serializeState(),walkSpeed:this.walkSpeed,runSpeed:this.runSpeed,acceleration:this.acceleration,deceleration:this.deceleration,jumpForce:this.jumpForce,gravityScale:this.gravityScale,canMove:this.canMove,canJump:this.canJump,adapterName:this.adapterName,autoResolveAdapter:this.autoResolveAdapter};
        }
        deserializeState(data={}){
            super.deserializeState(data);
            for(const key of ['walkSpeed','runSpeed','acceleration','deceleration','jumpForce','gravityScale'])if(data[key]!==undefined)this[key]=Math.max(0,Number(data[key])||0);
            if(data.canMove!==undefined)this.canMove=Boolean(data.canMove);
            if(data.canJump!==undefined)this.canJump=Boolean(data.canJump);
            if(data.adapterName!==undefined)this.adapterName=String(data.adapterName);
            if(data.autoResolveAdapter!==undefined)this.autoResolveAdapter=Boolean(data.autoResolveAdapter);
            return this;
        }
        _callAdapter(names,...args){
            if(!this.adapter)return undefined;
            for(const name of names){
                if(typeof this.adapter[name]==='function'){
                    try{return this.adapter[name](...args);}catch(error){
                        console.warn(`[SMCharacterComponent] Adapter ${name}() failed.`,error);
                        return undefined;
                    }
                }
            }
            return undefined;
        }
        _notifyAdapter(names,...args){
            this._callAdapter(names,...args);
        }
        _setVector(target,value){
            if(!target)return;
            if(Array.isArray(value))target.set?.(Number(value[0]||0),Number(value[1]||0),Number(value[2]||0));
            else if(value&&typeof value==='object')target.set?.(Number(value.x||0),Number(value.y||0),Number(value.z||0));
        }
        _setQuaternion(target,value){
            if(Array.isArray(value))target.set?.(Number(value[0]||0),Number(value[1]||0),Number(value[2]||0),Number(value[3]??1));
            else if(value&&typeof value==='object')target.set?.(Number(value.x||0),Number(value.y||0),Number(value.z||0),Number(value.w??1));
        }
    }
    SMCharacterComponent.componentType='Character';
    SMCharacterComponent.executionOrder=-50;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(!window.SMComponentRegistry.has('Character'))window.SMComponentRegistry.register('Character',SMCharacterComponent,{category:'Gameplay',displayName:'Character',allowMultiple:false,aliases:['SMCharacterComponent'],executionOrder:-50});
        return true;
    };
    register();
    queueMicrotask(register);
    window.addEventListener('sm:runtime-ready',register,{once:true});
    window.SMCharacterComponent=SMCharacterComponent;
    window.SMCharacterComponentClass=SMCharacterComponent;
})();