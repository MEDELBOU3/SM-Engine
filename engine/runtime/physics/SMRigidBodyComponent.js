(function(){
    'use strict';
    class SMRigidBodyComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:'RigidBody'});
            this.bodyType=this._normalizeBodyType(options.bodyType||options.typeMode||'dynamic');
            this.mass=Math.max(0,Number(options.mass??1));
            this.gravityScale=Number(options.gravityScale??1);
            this.linearDamping=Math.max(0,Number(options.linearDamping??0.01));
            this.angularDamping=Math.max(0,Number(options.angularDamping??0.05));
            this.lockPosition=this._axisFlags(options.lockPosition);
            this.lockRotation=this._axisFlags(options.lockRotation);
            this.continuous=options.continuous===true;
            this.allowSleep=options.allowSleep!==false;
            this.startAwake=options.startAwake!==false;
            this.enabled=options.enabled!==false;
            this.backendBody=null;
            this.linearVelocity=this._vector(options.linearVelocity,[0,0,0]);
            this.angularVelocity=this._vector(options.angularVelocity,[0,0,0]);
            this._registered=false;
        }
        onAttach(){
            this._markOwner();
        }
        onStart(){
            window.SMPhysicsComponentBridge?.registerRigidBody?.(this);
        }
        onStop(){
            window.SMPhysicsComponentBridge?.unregisterRigidBody?.(this);
        }
        onDestroy(){
            window.SMPhysicsComponentBridge?.unregisterRigidBody?.(this);
            this.backendBody=null;
        }
        setBodyType(type){
            this.bodyType=this._normalizeBodyType(type);
            this._markOwner();
            window.SMPhysicsComponentBridge?.refreshRigidBody?.(this);
            return this.bodyType;
        }
        setMass(mass){
            this.mass=Math.max(0,Number(mass)||0);
            window.SMPhysicsComponentBridge?.setMass?.(this,this.mass);
            return this.mass;
        }
        setLinearVelocity(value){
            this.linearVelocity=this._vector(value,this.linearVelocity);
            window.SMPhysicsComponentBridge?.setLinearVelocity?.(this,this.linearVelocity);
            return[...this.linearVelocity];
        }
        setAngularVelocity(value){
            this.angularVelocity=this._vector(value,this.angularVelocity);
            window.SMPhysicsComponentBridge?.setAngularVelocity?.(this,this.angularVelocity);
            return[...this.angularVelocity];
        }
        getLinearVelocity(){
            const value=window.SMPhysicsComponentBridge?.getLinearVelocity?.(this);
            if(value)this.linearVelocity=this._vector(value,this.linearVelocity);
            return[...this.linearVelocity];
        }
        getAngularVelocity(){
            const value=window.SMPhysicsComponentBridge?.getAngularVelocity?.(this);
            if(value)this.angularVelocity=this._vector(value,this.angularVelocity);
            return[...this.angularVelocity];
        }
        addForce(force,mode='force'){
            return window.SMPhysicsComponentBridge?.addForce?.(this,this._vector(force,[0,0,0]),mode)||false;
        }
        addImpulse(impulse){
            return this.addForce(impulse,'impulse');
        }
        addTorque(torque,mode='force'){
            return window.SMPhysicsComponentBridge?.addTorque?.(this,this._vector(torque,[0,0,0]),mode)||false;
        }
        wake(){
            return window.SMPhysicsComponentBridge?.wake?.(this)||false;
        }
        sleep(){
            return window.SMPhysicsComponentBridge?.sleep?.(this)||false;
        }
        teleport(position,quaternion=null){
            return window.SMPhysicsComponentBridge?.teleport?.(this,position,quaternion)||this._fallbackTeleport(position,quaternion);
        }
        getDescriptor(){
            return{bodyType:this.bodyType,mass:this.mass,gravityScale:this.gravityScale,linearDamping:this.linearDamping,angularDamping:this.angularDamping,lockPosition:{...this.lockPosition},lockRotation:{...this.lockRotation},continuous:this.continuous,allowSleep:this.allowSleep,startAwake:this.startAwake,enabled:this.enabled,linearVelocity:[...this.linearVelocity],angularVelocity:[...this.angularVelocity]};
        }
        serializeState(){
            return this.getDescriptor();
        }
        deserializeState(data={}){
            if(data.bodyType!==undefined)this.bodyType=this._normalizeBodyType(data.bodyType);
            if(data.mass!==undefined)this.mass=Math.max(0,Number(data.mass)||0);
            if(data.gravityScale!==undefined)this.gravityScale=Number(data.gravityScale)||0;
            if(data.linearDamping!==undefined)this.linearDamping=Math.max(0,Number(data.linearDamping)||0);
            if(data.angularDamping!==undefined)this.angularDamping=Math.max(0,Number(data.angularDamping)||0);
            if(data.lockPosition!==undefined)this.lockPosition=this._axisFlags(data.lockPosition);
            if(data.lockRotation!==undefined)this.lockRotation=this._axisFlags(data.lockRotation);
            if(data.continuous!==undefined)this.continuous=Boolean(data.continuous);
            if(data.allowSleep!==undefined)this.allowSleep=Boolean(data.allowSleep);
            if(data.startAwake!==undefined)this.startAwake=Boolean(data.startAwake);
            if(data.enabled!==undefined)this.enabled=Boolean(data.enabled);
            if(data.linearVelocity!==undefined)this.linearVelocity=this._vector(data.linearVelocity,this.linearVelocity);
            if(data.angularVelocity!==undefined)this.angularVelocity=this._vector(data.angularVelocity,this.angularVelocity);
            this._markOwner();
            return this;
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
        _markOwner(){
            if(!this.owner)return;
            this.owner.userData=this.owner.userData||{};
            this.owner.userData.physicsEnabled=this.enabled;
            this.owner.userData.bodyType=this.bodyType;
            this.owner.userData.mass=this.mass;
        }
        _normalizeBodyType(type){
            const value=String(type||'dynamic').toLowerCase();
            return['dynamic','static','kinematic'].includes(value)?value:'dynamic';
        }
        _axisFlags(value){
            if(value===true)return{x:true,y:true,z:true};
            if(Array.isArray(value))return{x:Boolean(value[0]),y:Boolean(value[1]),z:Boolean(value[2])};
            if(value&&typeof value==='object')return{x:Boolean(value.x),y:Boolean(value.y),z:Boolean(value.z)};
            return{x:false,y:false,z:false};
        }
        _vector(value,fallback=[0,0,0]){
            if(Array.isArray(value))return[Number(value[0]??fallback[0]),Number(value[1]??fallback[1]),Number(value[2]??fallback[2])];
            if(value&&typeof value==='object')return[Number(value.x??fallback[0]),Number(value.y??fallback[1]),Number(value.z??fallback[2])];
            return[...fallback];
        }
        debug(){
            const state={owner:this.owner?.name||this.owner?.uuid||null,bodyType:this.bodyType,mass:this.mass,gravityScale:this.gravityScale,registered:this._registered,backendBody:!!this.backendBody,linearVelocity:this.getLinearVelocity()};
            console.log('[SMRigidBodyComponent]',state);
            return state;
        }
    }
    SMRigidBodyComponent.componentType='RigidBody';
    SMRigidBodyComponent.executionOrder=4;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(window.SMComponentRegistry.has?.('RigidBody'))return true;
        window.SMComponentRegistry.register('RigidBody',SMRigidBodyComponent,{displayName:'Rigid Body',category:'Physics',description:'Dynamic, static and kinematic physics body component.',allowMultiple:false,aliases:['SMRigidBodyComponent'],executionOrder:4});
        return true;
    };
    window.SMRigidBodyComponent=SMRigidBodyComponent;
    window.SMRigidBodyComponentClass=SMRigidBodyComponent;
    if(!register())queueMicrotask(register);
    window.addEventListener?.('sm:runtime-ready',register,{once:true});
})();
