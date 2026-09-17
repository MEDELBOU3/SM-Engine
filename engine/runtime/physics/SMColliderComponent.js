(function(){
    'use strict';
    class SMColliderComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:'Collider'});
            this.shape=String(options.shape||'box').toLowerCase();
            this.size=this._vector(options.size,[1,1,1]);
            this.radius=Math.max(0,Number(options.radius??0.5));
            this.height=Math.max(0,Number(options.height??1.8));
            this.center=this._vector(options.center,[0,0,0]);
            this.rotation=this._vector(options.rotation,[0,0,0]);
            this.isTrigger=options.isTrigger===true;
            this.layer=String(options.layer||'default');
            this.mask=Array.isArray(options.mask)?options.mask.map(String):['default'];
            this.friction=Math.max(0,Number(options.friction??0.5));
            this.restitution=Math.max(0,Number(options.restitution??0));
            this.enabled=options.enabled!==false;
            this.autoFit=options.autoFit===true;
            this.backendShape=null;
            this.physicsBody=null;
            this.managedByPhysicsBridge=false;
            this._registered=false;
            this._contactCount=0;
        }
        onAttach(){
            if(this.autoFit)this.fitToOwner();
            this._markOwner();
        }
        onStart(){
            window.SMPhysicsComponentBridge?.registerCollider?.(this);
        }
        onStop(){
            window.SMPhysicsComponentBridge?.unregisterCollider?.(this);
        }
        onDestroy(){
            window.SMPhysicsComponentBridge?.unregisterCollider?.(this);
            this.backendShape=null;
            this.physicsBody=null;
        }
        setShape(shape,options={}){
            this.shape=String(shape||'box').toLowerCase();
            if(options.size!==undefined)this.size=this._vector(options.size,this.size);
            if(options.radius!==undefined)this.radius=Math.max(0,Number(options.radius)||0);
            if(options.height!==undefined)this.height=Math.max(0,Number(options.height)||0);
            window.SMPhysicsComponentBridge?.refreshCollider?.(this);
            return this;
        }
        setTrigger(enabled){
            this.isTrigger=Boolean(enabled);
            this._markOwner();
            window.SMPhysicsComponentBridge?.refreshCollider?.(this);
            return this.isTrigger;
        }
        setLayer(layer,mask=null){
            this.layer=String(layer||'default');
            if(mask!==null)this.mask=Array.isArray(mask)?mask.map(String):[String(mask)];
            window.SMPhysicsComponentBridge?.refreshCollider?.(this);
            return this.layer;
        }
        fitToOwner(){
            if(!this.owner||!window.THREE?.Box3||!window.THREE?.Vector3)return false;
            try{
                const box=new THREE.Box3().setFromObject(this.owner);
                if(box.isEmpty())return false;
                const size=box.getSize(new THREE.Vector3());
                const center=box.getCenter(new THREE.Vector3());
                this.size=[Math.max(0.001,size.x),Math.max(0.001,size.y),Math.max(0.001,size.z)];
                const worldPos=this.owner.getWorldPosition?.(new THREE.Vector3())||new THREE.Vector3();
                this.center=[center.x-worldPos.x,center.y-worldPos.y,center.z-worldPos.z];
                this.radius=Math.max(this.size[0],this.size[2])*0.5;
                this.height=this.size[1];
                return true;
            }catch(error){
                console.warn('[SMColliderComponent] Auto-fit failed.',error);
                return false;
            }
        }
        getDescriptor(){
            return{shape:this.shape,size:[...this.size],radius:this.radius,height:this.height,center:[...this.center],rotation:[...this.rotation],isTrigger:this.isTrigger,layer:this.layer,mask:[...this.mask],friction:this.friction,restitution:this.restitution,enabled:this.enabled};
        }
        onCollisionEnter(other,contact){
            this._contactCount+=1;
            this.emit('collision-enter',{other,contact,collider:this});
        }
        onCollisionStay(other,contact){
            this.emit('collision-stay',{other,contact,collider:this});
        }
        onCollisionExit(other,contact){
            this._contactCount=Math.max(0,this._contactCount-1);
            this.emit('collision-exit',{other,contact,collider:this});
        }
        onTriggerEnter(other,contact){
            this._contactCount+=1;
            this.emit('trigger-enter',{other,contact,collider:this});
        }
        onTriggerStay(other,contact){
            this.emit('trigger-stay',{other,contact,collider:this});
        }
        onTriggerExit(other,contact){
            this._contactCount=Math.max(0,this._contactCount-1);
            this.emit('trigger-exit',{other,contact,collider:this});
        }
        serializeState(){
            return this.getDescriptor();
        }
        deserializeState(data={}){
            if(data.shape!==undefined)this.shape=String(data.shape).toLowerCase();
            if(data.size!==undefined)this.size=this._vector(data.size,this.size);
            if(data.radius!==undefined)this.radius=Math.max(0,Number(data.radius)||0);
            if(data.height!==undefined)this.height=Math.max(0,Number(data.height)||0);
            if(data.center!==undefined)this.center=this._vector(data.center,this.center);
            if(data.rotation!==undefined)this.rotation=this._vector(data.rotation,this.rotation);
            if(data.isTrigger!==undefined)this.isTrigger=Boolean(data.isTrigger);
            if(data.layer!==undefined)this.layer=String(data.layer);
            if(data.mask!==undefined)this.mask=Array.isArray(data.mask)?data.mask.map(String):[String(data.mask)];
            if(data.friction!==undefined)this.friction=Math.max(0,Number(data.friction)||0);
            if(data.restitution!==undefined)this.restitution=Math.max(0,Number(data.restitution)||0);
            if(data.enabled!==undefined)this.enabled=Boolean(data.enabled);
            this._markOwner();
            return this;
        }
        _markOwner(){
            if(!this.owner)return;
            this.owner.userData=this.owner.userData||{};
            this.owner.userData.collisionEnabled=this.enabled;
            this.owner.userData.isTrigger=this.isTrigger;
            this.owner.userData.collisionLayer=this.layer;
        }
        _vector(value,fallback=[0,0,0]){
            if(Array.isArray(value))return[Number(value[0]??fallback[0]),Number(value[1]??fallback[1]),Number(value[2]??fallback[2])];
            if(value&&typeof value==='object')return[Number(value.x??fallback[0]),Number(value.y??fallback[1]),Number(value.z??fallback[2])];
            return[...fallback];
        }
        debug(){
            const state={owner:this.owner?.name||this.owner?.uuid||null,shape:this.shape,size:[...this.size],radius:this.radius,height:this.height,isTrigger:this.isTrigger,layer:this.layer,mask:[...this.mask],registered:this._registered,contacts:this._contactCount,backendShape:!!this.backendShape};
            console.log('[SMColliderComponent]',state);
            return state;
        }
    }
    SMColliderComponent.componentType='Collider';
    SMColliderComponent.executionOrder=5;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(window.SMComponentRegistry.has?.('Collider'))return true;
        window.SMComponentRegistry.register('Collider',SMColliderComponent,{displayName:'Collider',category:'Physics',description:'Physics collision shape descriptor and runtime bridge.',allowMultiple:true,aliases:['SMColliderComponent'],executionOrder:5});
        return true;
    };
    window.SMColliderComponent=SMColliderComponent;
    window.SMColliderComponentClass=SMColliderComponent;
    if(!register())queueMicrotask(register);
    window.addEventListener?.('sm:runtime-ready',register,{once:true});
})();