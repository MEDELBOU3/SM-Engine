(function(){
    'use strict';
    class SMCharacterBodyComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:'CharacterBody'});
            this.radius=Math.max(0.01,Number(options.radius??0.45));
            this.height=Math.max(this.radius*2,Number(options.height??1.8));
            this.stepHeight=Math.max(0,Number(options.stepHeight??0.35));
            this.slopeLimit=Math.max(0,Math.min(89,Number(options.slopeLimit??50)));
            this.skinWidth=Math.max(0,Number(options.skinWidth??0.03));
            this.gravityScale=Number(options.gravityScale??1);
            this.groundSnap=Math.max(0,Number(options.groundSnap??0.2));
            this.enabled=options.enabled!==false;
            this.backendController=null;
            this.grounded=false;
            this.groundNormal=[0,1,0];
            this.velocity=[0,0,0];
            this.desiredVelocity=[0,0,0];
            this.jumpRequested=false;
            this._registered=false;
        }
        onAttach(){
            if(this.owner){
                this.owner.userData=this.owner.userData||{};
                this.owner.userData.characterBody=true;
                this.owner.userData.physicsEnabled=true;
            }
        }
        onStart(){
            window.SMPhysicsComponentBridge?.registerCharacterBody?.(this);
            this._connectCharacterAdapter();
        }
        onStop(){
            window.SMPhysicsComponentBridge?.unregisterCharacterBody?.(this);
        }
        onDestroy(){
            window.SMPhysicsComponentBridge?.unregisterCharacterBody?.(this);
            this.backendController=null;
        }
        setDesiredVelocity(value){
            this.desiredVelocity=this._vector(value,this.desiredVelocity);
            return[...this.desiredVelocity];
        }
        move(direction,speed=1){
            const dir=this._vector(direction,[0,0,0]);
            this.desiredVelocity=[dir[0]*Number(speed||0),dir[1]*Number(speed||0),dir[2]*Number(speed||0)];
            return[...this.desiredVelocity];
        }
        jump(force=5){
            this.jumpRequested=true;
            return window.SMPhysicsComponentBridge?.characterJump?.(this,Number(force)||5)||true;
        }
        teleport(position,quaternion=null){
            return window.SMPhysicsComponentBridge?.characterTeleport?.(this,position,quaternion)||this._fallbackTeleport(position,quaternion);
        }
        isGrounded(){
            const value=window.SMPhysicsComponentBridge?.characterGrounded?.(this);
            if(typeof value==='boolean')this.grounded=value;
            return this.grounded;
        }
        getVelocity(){
            const value=window.SMPhysicsComponentBridge?.characterVelocity?.(this);
            if(value)this.velocity=this._vector(value,this.velocity);
            return[...this.velocity];
        }
        runtimeFixedUpdate(delta){
            if(!this.enabled)return false;
            return window.SMPhysicsComponentBridge?.updateCharacterBody?.(this,delta)||false;
        }
        getDescriptor(){
            return{radius:this.radius,height:this.height,stepHeight:this.stepHeight,slopeLimit:this.slopeLimit,skinWidth:this.skinWidth,gravityScale:this.gravityScale,groundSnap:this.groundSnap,enabled:this.enabled};
        }
        serializeState(){
            return this.getDescriptor();
        }
        deserializeState(data={}){
            if(data.radius!==undefined)this.radius=Math.max(0.01,Number(data.radius)||0.45);
            if(data.height!==undefined)this.height=Math.max(this.radius*2,Number(data.height)||1.8);
            if(data.stepHeight!==undefined)this.stepHeight=Math.max(0,Number(data.stepHeight)||0);
            if(data.slopeLimit!==undefined)this.slopeLimit=Math.max(0,Math.min(89,Number(data.slopeLimit)||0));
            if(data.skinWidth!==undefined)this.skinWidth=Math.max(0,Number(data.skinWidth)||0);
            if(data.gravityScale!==undefined)this.gravityScale=Number(data.gravityScale)||0;
            if(data.groundSnap!==undefined)this.groundSnap=Math.max(0,Number(data.groundSnap)||0);
            if(data.enabled!==undefined)this.enabled=Boolean(data.enabled);
            return this;
        }
        _connectCharacterAdapter(){
            const character=this.owner?.getComponent?.('Character')||this.owner?.components?.get?.('Character')||null;
            if(!character)return false;
            const adapter={
                setDesiredVelocity:value=>this.setDesiredVelocity(value),
                moveTo:(target,speed)=>{
                    if(!this.owner||!target)return false;
                    const p=this._position(target);
                    const o=this._position(this.owner);
                    const dx=p[0]-o[0];
                    const dz=p[2]-o[2];
                    const len=Math.hypot(dx,dz)||1;
                    this.setDesiredVelocity([dx/len*speed,0,dz/len*speed]);
                    return true;
                },
                teleport:(position,quaternion)=>this.teleport(position,quaternion),
                jump:force=>this.jump(force),
                isGrounded:()=>this.isGrounded(),
                getVelocity:()=>this.getVelocity()
            };
            character.adapter=adapter;
            return true;
        }
        _fallbackTeleport(position,quaternion){
            if(!this.owner)return false;
            const p=this._vector(position,[0,0,0]);
            this.owner.position?.set?.(p[0],p[1],p[2]);
            if(quaternion){
                const q=Array.isArray(quaternion)?quaternion:[quaternion.x||0,quaternion.y||0,quaternion.z||0,quaternion.w??1];
                this.owner.quaternion?.set?.(Number(q[0]),Number(q[1]),Number(q[2]),Number(q[3]));
            }
            this.owner.updateMatrixWorld?.(true);
            return true;
        }
        _position(value){
            const object=value?.object||value;
            if(object?.getWorldPosition&&window.THREE?.Vector3){
                const p=object.getWorldPosition(new THREE.Vector3());
                return[p.x,p.y,p.z];
            }
            if(Array.isArray(object))return this._vector(object,[0,0,0]);
            return[Number(object?.position?.x??object?.x??0),Number(object?.position?.y??object?.y??0),Number(object?.position?.z??object?.z??0)];
        }
        _vector(value,fallback=[0,0,0]){
            if(Array.isArray(value))return[Number(value[0]??fallback[0]),Number(value[1]??fallback[1]),Number(value[2]??fallback[2])];
            if(value&&typeof value==='object')return[Number(value.x??fallback[0]),Number(value.y??fallback[1]),Number(value.z??fallback[2])];
            return[...fallback];
        }
        debug(){
            const state={owner:this.owner?.name||this.owner?.uuid||null,radius:this.radius,height:this.height,grounded:this.isGrounded(),velocity:this.getVelocity(),desiredVelocity:[...this.desiredVelocity],registered:this._registered,backendController:!!this.backendController};
            console.log('[SMCharacterBodyComponent]',state);
            return state;
        }
    }
    SMCharacterBodyComponent.componentType='CharacterBody';
    SMCharacterBodyComponent.executionOrder=3;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(window.SMComponentRegistry.has?.('CharacterBody'))return true;
        window.SMComponentRegistry.register('CharacterBody',SMCharacterBodyComponent,{displayName:'Character Body',category:'Physics',description:'Capsule-like character movement body and Character adapter.',allowMultiple:false,aliases:['SMCharacterBodyComponent'],executionOrder:3});
        return true;
    };
    window.SMCharacterBodyComponent=SMCharacterBodyComponent;
    window.SMCharacterBodyComponentClass=SMCharacterBodyComponent;
    if(!register())queueMicrotask(register);
    window.addEventListener?.('sm:runtime-ready',register,{once:true});
})();