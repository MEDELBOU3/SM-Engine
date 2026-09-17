(function(){
    'use strict';
    class SMPhysicsComponentBridge{
        constructor(){
            this.id='runtime-physics-components';
            this.priority=845;
            this.session=null;
            this.world=null;
            this.backend=null;
            this.active=false;
            this.rigidBodies=new Set();
            this.colliders=new Set();
            this.characterBodies=new Set();
            this.triggerVolumes=new Set();
            this.bodyRecords=new Map();
            this.colliderRecords=new Map();
            this.characterRecords=new Map();
            this._registered=false;
            this._runtimePatched=false;
            this._scanFrame=0;
            this._lastAdvancedCollisionFrame=-1;
            this._windowCollisionHandler=null;
            this._layerBits=new Map([['default',1],['ground',2],['kinematic',4],['liquid',8],['sensor',16]]);
            this._nextLayerBit=32;
            this._autoRegister();
            this._patchRuntimeAPI();
        }
        start(session){
            this.session=session;
            this.world=session?.getData?.('world')||window.SMRuntime?.getWorld?.()||null;
            this.backend=this._resolveBackend();
            this.active=true;
            this._scanComponents();
            this._installContactForwarding();
            session?.setData?.('physicsComponentBridge',this);
            window.SMRuntimeEventBus?.emit?.('physics-components:started',{bridge:this,backend:this.backend});
        }
        update(){
            if(!this.active)return;
            this._scanFrame+=1;
            if(this._scanFrame===1||this._scanFrame%30===0)this._scanComponents();
            this._syncDynamicBodiesFromBackend();
            this._forwardAdvancedBackendStays();
        }
        fixedUpdate(delta){
            if(!this.active)return;
            for(const character of this.characterBodies)this.updateCharacterBody(character,delta);
            this._syncKinematicBodiesToBackend();
        }
        pause(){}
        resume(){}
        stop(session,reason='runtime-stop'){
            this._uninstallContactForwarding();
            for(const component of Array.from(this.characterBodies))this.unregisterCharacterBody(component);
            for(const component of Array.from(this.colliders))this.unregisterCollider(component);
            for(const component of Array.from(this.rigidBodies))this.unregisterRigidBody(component);
            this.triggerVolumes.clear();
            this.bodyRecords.clear();
            this.colliderRecords.clear();
            this.characterRecords.clear();
            session?.deleteData?.('physicsComponentBridge');
            this.active=false;
            this.backend=null;
            this.world=null;
            this.session=null;
            this._scanFrame=0;
            window.SMRuntimeEventBus?.emit?.('physics-components:stopped',{bridge:this,reason});
        }
        registerRigidBody(component){
            if(!component)return null;
            if(!this.rigidBodies.has(component))this.rigidBodies.add(component);
            component._registered=true;
            if(this.active&&!component.backendBody)this._createRigidBody(component);
            this._bindOwnerColliders(component.owner,component);
            return component;
        }
        unregisterRigidBody(component){
            if(!component)return false;
            this._destroyRigidBody(component);
            component._registered=false;
            return this.rigidBodies.delete(component);
        }
        refreshRigidBody(component){
            if(!component)return false;
            this._destroyRigidBody(component);
            if(this.active)this._createRigidBody(component);
            return true;
        }
        registerCollider(component){
            if(!component||this.colliders.has(component))return component;
            this.colliders.add(component);
            component._registered=true;
            if(this.active)this._createCollider(component);
            return component;
        }
        unregisterCollider(component){
            if(!component)return false;
            this._destroyCollider(component);
            component._registered=false;
            return this.colliders.delete(component);
        }
        refreshCollider(component){
            if(!component)return false;
            const rigidBody=this._findRigidBodyForOwner(component.owner);
            this._destroyCollider(component);
            if(rigidBody&&this.active){
                this.refreshRigidBody(rigidBody);
                this._bindColliderToRigidBody(component,rigidBody);
                return true;
            }
            if(this.active)this._createCollider(component);
            return true;
        }
        registerCharacterBody(component){
            if(!component||this.characterBodies.has(component))return component;
            this.characterBodies.add(component);
            component._registered=true;
            if(this.active)this._createCharacterBody(component);
            return component;
        }
        unregisterCharacterBody(component){
            if(!component)return false;
            this._destroyCharacterBody(component);
            component._registered=false;
            return this.characterBodies.delete(component);
        }
        registerTriggerVolume(component){
            if(!component)return false;
            this.triggerVolumes.add(component);
            component._ensureCollider?.();
            return component;
        }
        unregisterTriggerVolume(component){
            return this.triggerVolumes.delete(component);
        }
        updateCharacterBody(component,delta){
            if(!component?.enabled)return false;
            const record=this.characterRecords.get(component);
            const backend=this._resolveBackend();
            const desired=component.desiredVelocity||[0,0,0];
            if(backend?.updateCharacterController){
                try{
                    const result=backend.updateCharacterController(record?.handle||component.backendController,component,{delta,desiredVelocity:desired,jumpRequested:component.jumpRequested});
                    component.jumpRequested=false;
                    if(result?.velocity)component.velocity=this._vector(result.velocity,component.velocity);
                    if(typeof result?.grounded==='boolean')component.grounded=result.grounded;
                    if(result?.groundNormal)component.groundNormal=this._vector(result.groundNormal,component.groundNormal);
                    return true;
                }catch(error){console.warn('[SMPhysicsComponentBridge] Character backend update failed.',error);}
            }
            const owner=component.owner;
            if(!owner)return false;
            const dt=Math.max(0,Number(delta)||0);
            component.velocity[0]=desired[0];
            component.velocity[2]=desired[2];
            if(!component.grounded)component.velocity[1]+=-9.81*component.gravityScale*dt;
            if(component.jumpRequested&&component.grounded){
                component.velocity[1]=5;
                component.grounded=false;
            }
            component.jumpRequested=false;
            owner.position.x+=component.velocity[0]*dt;
            owner.position.y+=component.velocity[1]*dt;
            owner.position.z+=component.velocity[2]*dt;
            if(owner.position.y<=0){
                owner.position.y=0;
                component.velocity[1]=0;
                component.grounded=true;
                component.groundNormal=[0,1,0];
            }
            owner.updateMatrixWorld?.(true);
            return true;
        }
        characterJump(component,force=5){
            const backend=this._resolveBackend();
            const record=this.characterRecords.get(component);
            if(backend?.characterJump){
                try{return backend.characterJump(record?.handle||component.backendController,Number(force)||5,component)!==false;}catch{}
            }
            if(component.grounded){
                component.velocity[1]=Number(force)||5;
                component.grounded=false;
            }
            component.jumpRequested=true;
            return true;
        }
        characterTeleport(component,position,quaternion=null){
            const backend=this._resolveBackend();
            const record=this.characterRecords.get(component);
            if(backend?.teleportCharacter){
                try{return backend.teleportCharacter(record?.handle||component.backendController,position,quaternion,component)!==false;}catch{}
            }
            return component._fallbackTeleport?.(position,quaternion)||false;
        }
        characterGrounded(component){
            const backend=this._resolveBackend();
            const record=this.characterRecords.get(component);
            if(backend?.isCharacterGrounded){
                try{return Boolean(backend.isCharacterGrounded(record?.handle||component.backendController,component));}catch{}
            }
            return component.grounded;
        }
        characterVelocity(component){
            const backend=this._resolveBackend();
            const record=this.characterRecords.get(component);
            if(backend?.getCharacterVelocity){
                try{return backend.getCharacterVelocity(record?.handle||component.backendController,component);}catch{}
            }
            return component.velocity;
        }
        setMass(component,mass){
            const record=this.bodyRecords.get(component);
            const backend=this._resolveBackend();
            for(const name of['setMass','setBodyMass'])if(typeof backend?.[name]==='function')try{return backend[name](record?.handle||component.backendBody,mass,component);}catch{}
            return false;
        }
        setLinearVelocity(component,value){
            component.linearVelocity=this._vector(value,component.linearVelocity);
            const body=this.bodyRecords.get(component)?.handle||component?.backendBody;
            const backend=this._resolveBackend();
            const A=backend?.ammo;
            if(!body||!A)return false;
            const v=new A.btVector3(component.linearVelocity[0],component.linearVelocity[1],component.linearVelocity[2]);
            try{body.setLinearVelocity?.(v);body.activate?.(true);return true;}finally{try{A.destroy(v);}catch{}}
        }
        getLinearVelocity(component){
            const body=this.bodyRecords.get(component)?.handle||component?.backendBody;
            const v=body?.getLinearVelocity?.();
            return v?[v.x(),v.y(),v.z()]:component?.linearVelocity||[0,0,0];
        }
        setAngularVelocity(component,value){
            component.angularVelocity=this._vector(value,component.angularVelocity);
            const body=this.bodyRecords.get(component)?.handle||component?.backendBody;
            const backend=this._resolveBackend();
            const A=backend?.ammo;
            if(!body||!A)return false;
            const v=new A.btVector3(component.angularVelocity[0],component.angularVelocity[1],component.angularVelocity[2]);
            try{body.setAngularVelocity?.(v);body.activate?.(true);return true;}finally{try{A.destroy(v);}catch{}}
        }
        getAngularVelocity(component){
            const body=this.bodyRecords.get(component)?.handle||component?.backendBody;
            const v=body?.getAngularVelocity?.();
            return v?[v.x(),v.y(),v.z()]:component?.angularVelocity||[0,0,0];
        }
        addForce(component,force,mode='force'){
            const body=this.bodyRecords.get(component)?.handle||component?.backendBody;
            const backend=this._resolveBackend();
            const A=backend?.ammo;
            if(!body||!A)return false;
            const f=this._vector(force,[0,0,0]);
            const v=new A.btVector3(f[0],f[1],f[2]);
            try{if(mode==='impulse')body.applyCentralImpulse?.(v);else body.applyCentralForce?.(v);body.activate?.(true);return true;}finally{try{A.destroy(v);}catch{}}
        }
        addTorque(component,torque,mode='force'){
            const body=this.bodyRecords.get(component)?.handle||component?.backendBody;
            const backend=this._resolveBackend();
            const A=backend?.ammo;
            if(!body||!A)return false;
            const t=this._vector(torque,[0,0,0]);
            const v=new A.btVector3(t[0],t[1],t[2]);
            try{if(mode==='impulse')body.applyTorqueImpulse?.(v);else body.applyTorque?.(v);body.activate?.(true);return true;}finally{try{A.destroy(v);}catch{}}
        }
        wake(component){
            const record=this.bodyRecords.get(component);
            const backend=this._resolveBackend();
            for(const name of['wake','wakeBody','activateBody'])if(typeof backend?.[name]==='function')try{return backend[name](record?.handle||component.backendBody,component)!==false;}catch{}
            return false;
        }
        sleep(component){
            const record=this.bodyRecords.get(component);
            const backend=this._resolveBackend();
            for(const name of['sleep','sleepBody','deactivateBody'])if(typeof backend?.[name]==='function')try{return backend[name](record?.handle||component.backendBody,component)!==false;}catch{}
            return false;
        }
        teleport(component,position,quaternion=null){
            const record=this.bodyRecords.get(component);
            const backend=this._resolveBackend();
            const body=record?.handle||component?.backendBody||null;
            const owner=component?.owner||null;
            if(!body||!owner)return component?._fallbackTeleport?.(position,quaternion)||false;
            for(const name of['teleport','teleportBody','setBodyTransform'])if(typeof backend?.[name]==='function'){
                try{return backend[name](body,position,quaternion,component)!==false;}catch{}
            }
            if(typeof backend?._writeTransformFromObject==='function'){
                const p=this._vector(position,[owner.position?.x||0,owner.position?.y||0,owner.position?.z||0]);
                owner.position?.set?.(p[0],p[1],p[2]);
                if(quaternion){
                    const q=Array.isArray(quaternion)?quaternion:[quaternion.x||0,quaternion.y||0,quaternion.z||0,quaternion.w??1];
                    owner.quaternion?.set?.(Number(q[0])||0,Number(q[1])||0,Number(q[2])||0,Number(q[3])||1);
                }
                owner.updateWorldMatrix?.(true,false);
                try{
                    backend._writeTransformFromObject(owner,body);
                    if(typeof body.setInterpolationWorldTransform==='function'&&typeof body.getWorldTransform==='function')body.setInterpolationWorldTransform(body.getWorldTransform());
                    body.activate?.(true);
                    backend.physicsWorld?.updateSingleAabb?.(body);
                    const ptr=backend._ptr?.(body)||body.ptr||0;
                    if(backend._collisionPairs?.size&&ptr){
                        for(const key of Array.from(backend._collisionPairs.keys())){
                            const parts=String(key).split(':').map(Number);
                            if(parts.includes(Number(ptr)))backend._collisionPairs.delete(key);
                        }
                    }
                    return true;
                }catch(error){
                    console.warn('[SMPhysicsComponentBridge] Advanced PhysicsSystem teleport failed.',error);
                }
            }
            return component?._fallbackTeleport?.(position,quaternion)||false;
        }
        forwardCollision(type,selfObject,otherObject,contact={}){
            const selfContainer=window.SMComponentRuntimeBridge?.getContainer?.(selfObject)||selfObject?.components||null;
            const otherContainer=window.SMComponentRuntimeBridge?.getContainer?.(otherObject)||otherObject?.components||null;
            const selfCollider=selfContainer?.get?.('Collider')||null;
            const otherCollider=otherContainer?.get?.('Collider')||null;
            const trigger=Boolean(selfCollider?.isTrigger||otherCollider?.isTrigger);
            const normalized=String(type||'enter').toLowerCase();
            const suffix=normalized.includes('exit')?'Exit':normalized.includes('stay')?'Stay':'Enter';
            if(trigger){
                const forwarder=window.SMComponentRuntimeBridge?.[`onTrigger${suffix}`];
                if(typeof forwarder==='function')forwarder.call(window.SMComponentRuntimeBridge,selfObject,otherObject,contact);
                else{
                    selfContainer?.dispatch?.(`onTrigger${suffix}`,otherObject,contact);
                    otherContainer?.dispatch?.(`onTrigger${suffix}`,selfObject,contact);
                }
            }else{
                const forwarder=window.SMComponentRuntimeBridge?.[`onCollision${suffix}`];
                if(typeof forwarder==='function')forwarder.call(window.SMComponentRuntimeBridge,selfObject,otherObject,contact);
                else{
                    selfContainer?.dispatch?.(`onCollision${suffix}`,otherObject,contact);
                    otherContainer?.dispatch?.(`onCollision${suffix}`,selfObject,contact);
                }
            }
            return true;
        }
        _createRigidBody(component){
            const backend=this._resolveBackend();
            const collider=this._findColliderForOwner(component.owner,component.container);
            const colliderDescriptor=collider?.getDescriptor?.()||null;
            const descriptor={...component.getDescriptor(),object:component.owner,collider:colliderDescriptor};
            if(colliderDescriptor){
                descriptor.shapeType=colliderDescriptor.shape;
                descriptor.size=[...colliderDescriptor.size];
                descriptor.radius=colliderDescriptor.radius;
                descriptor.height=colliderDescriptor.height;
                descriptor.center=[...colliderDescriptor.center];
                descriptor.rotation=[...colliderDescriptor.rotation];
                descriptor.isTrigger=colliderDescriptor.isTrigger;
                descriptor.layer=colliderDescriptor.layer;
                descriptor.mask=[...colliderDescriptor.mask];
                descriptor.friction=colliderDescriptor.friction;
                descriptor.restitution=colliderDescriptor.restitution;
            }
            let handle=null;
            for(const name of['createRigidBody','createBody','addBody'])if(typeof backend?.[name]==='function'){
                try{
                    handle=backend[name](component.owner,descriptor);
                    if(handle===undefined||handle===null)handle=backend[name](descriptor);
                    if(handle!==undefined&&handle!==null)break;
                }catch(error){console.warn(`[SMPhysicsComponentBridge] ${name} failed.`,error);}
            }
            component.backendBody=handle||component.backendBody||null;
            this.bodyRecords.set(component,{component,handle:component.backendBody,object:component.owner});
            if(collider)this._bindColliderToRigidBody(collider,component);
            return component.backendBody;
        }
        _destroyRigidBody(component){
            const record=this.bodyRecords.get(component);
            const backend=this._resolveBackend();
            for(const collider of this._findCollidersForOwner(component.owner)){
                const colliderRecord=this.colliderRecords.get(collider);
                if(colliderRecord?.borrowedFromBody){
                    collider.backendShape=null;
                    collider.physicsBody=null;
                    this.colliderRecords.delete(collider);
                }
            }
            if(record)for(const name of['removeRigidBody','removeBody','destroyBody'])if(typeof backend?.[name]==='function')try{backend[name](record.handle||component.backendBody,component.owner);break;}catch{}
            this.bodyRecords.delete(component);
            component.backendBody=null;
        }
        _createCollider(component){
            const rigidBody=this._findRigidBodyForOwner(component.owner);
            if(rigidBody?.backendBody)return this._bindColliderToRigidBody(component,rigidBody);
            const backend=this._resolveBackend();
            const descriptor={...component.getDescriptor(),object:component.owner};
            let handle=null;
            for(const name of['createCollider','addCollider','createShape'])if(typeof backend?.[name]==='function'){
                try{
                    handle=backend[name](component.owner,descriptor);
                    if(handle===undefined||handle===null)handle=backend[name](descriptor);
                    if(handle!==undefined&&handle!==null)break;
                }catch(error){console.warn(`[SMPhysicsComponentBridge] ${name} failed.`,error);}
            }
            component.backendShape=handle||component.backendShape||null;
            this.colliderRecords.set(component,{component,handle:component.backendShape,object:component.owner,borrowedFromBody:false});
            return component.backendShape;
        }
        _destroyCollider(component){
            const record=this.colliderRecords.get(component);
            const backend=this._resolveBackend();
            if(record&&!record.borrowedFromBody)for(const name of['removeCollider','destroyCollider','removeShape'])if(typeof backend?.[name]==='function')try{backend[name](record.handle||component.backendShape,component.owner);break;}catch{}
            this.colliderRecords.delete(component);
            component.backendShape=null;
            component.physicsBody=null;
        }
        _findColliderForOwner(owner,container=null){
            if(!owner)return null;
            const source=container||window.SMComponentRuntimeBridge?.getContainer?.(owner)||owner?.components||null;
            const fromContainer=source?.get?.('Collider')||(source?.getAll?.('Collider')||[])[0]||null;
            if(fromContainer)return fromContainer;
            for(const collider of this.colliders)if(collider?.owner===owner)return collider;
            return null;
        }
        _findCollidersForOwner(owner){
            if(!owner)return[];
            const source=window.SMComponentRuntimeBridge?.getContainer?.(owner)||owner?.components||null;
            const list=source?.getAll?.('Collider');
            if(Array.isArray(list)&&list.length)return list;
            return Array.from(this.colliders).filter(collider=>collider?.owner===owner);
        }
        _findRigidBodyForOwner(owner){
            if(!owner)return null;
            const source=window.SMComponentRuntimeBridge?.getContainer?.(owner)||owner?.components||null;
            const fromContainer=source?.get?.('RigidBody')||(source?.getAll?.('RigidBody')||[])[0]||null;
            if(fromContainer)return fromContainer;
            for(const rigidBody of this.rigidBodies)if(rigidBody?.owner===owner)return rigidBody;
            return null;
        }
        _bindColliderToRigidBody(collider,rigidBody){
            if(!collider||!rigidBody?.backendBody)return null;
            let shape=null;
            try{shape=rigidBody.backendBody.getCollisionShape?.()||null;}catch{}
            collider.backendShape=shape;
            collider.physicsBody=rigidBody.backendBody;
            collider.managedByPhysicsBridge=true;
            this.colliderRecords.set(collider,{component:collider,handle:shape,object:collider.owner,body:rigidBody.backendBody,borrowedFromBody:true});
            return shape;
        }
        _bindOwnerColliders(owner,rigidBody=null){
            const rb=rigidBody||this._findRigidBodyForOwner(owner);
            if(!rb?.backendBody)return 0;
            let count=0;
            for(const collider of this._findCollidersForOwner(owner)){
                this._bindColliderToRigidBody(collider,rb);
                count+=1;
            }
            return count;
        }
        _createCharacterBody(component){
            const backend=this._resolveBackend();
            let handle=null;
            for(const name of['createCharacterController','createCharacterBody','addCharacterController'])if(typeof backend?.[name]==='function'){
                try{
                    handle=backend[name](component.owner,component.getDescriptor());
                    if(handle===undefined||handle===null)handle=backend[name](component.getDescriptor());
                    if(handle!==undefined&&handle!==null)break;
                }catch{}
            }
            component.backendController=handle||component.backendController||null;
            this.characterRecords.set(component,{component,handle:component.backendController,object:component.owner});
            return component.backendController;
        }
        _destroyCharacterBody(component){
            const record=this.characterRecords.get(component);
            const backend=this._resolveBackend();
            if(record)for(const name of['removeCharacterController','destroyCharacterController','removeCharacterBody'])if(typeof backend?.[name]==='function')try{backend[name](record.handle||component.backendController,component.owner);break;}catch{}
            this.characterRecords.delete(component);
            component.backendController=null;
        }
        _scanComponents(){
            const containers=window.SMComponentRuntimeBridge?.containers;
            if(!containers?.values)return 0;
            let count=0;
            for(const container of containers.values()){
                for(const component of container.getAll?.('RigidBody')||[]){this.registerRigidBody(component);count+=1;}
                for(const component of container.getAll?.('Collider')||[]){this.registerCollider(component);count+=1;}
                for(const component of container.getAll?.('CharacterBody')||[]){this.registerCharacterBody(component);count+=1;}
                for(const component of container.getAll?.('TriggerVolume')||[]){this.registerTriggerVolume(component);count+=1;}
            }
            return count;
        }
        _installContactForwarding(){
            this._uninstallContactForwarding();
            const backend=this._resolveBackend();
            const handler=(type,a,b,contact)=>this.forwardCollision(type,a?.object||a,b?.object||b,contact||{});
            if(typeof backend?.setContactListener==='function'){
                try{backend.setContactListener(handler);window.SMPhysicsContactForwarder=handler;return true;}catch{}
            }
            if(typeof backend?.onContact==='function'){
                try{backend.onContact(handler);window.SMPhysicsContactForwarder=handler;return true;}catch{}
            }
            this._windowCollisionHandler=event=>{
                const detail=event?.detail||{};
                const a=detail.meshA||detail.a?.object||detail.a||null;
                const b=detail.meshB||detail.b?.object||detail.b||null;
                if(!a||!b)return;
                handler(detail.type||'enter',a,b,{point:detail.point||null,normal:detail.normal||null,impulse:detail.impulse??0,penetration:detail.penetration??0,bodyA:detail.bodyA||null,bodyB:detail.bodyB||null});
            };
            window.addEventListener?.('sm:physics-collision',this._windowCollisionHandler);
            window.SMPhysicsContactForwarder=handler;
            return true;
        }
        _uninstallContactForwarding(){
            if(this._windowCollisionHandler){
                window.removeEventListener?.('sm:physics-collision',this._windowCollisionHandler);
                this._windowCollisionHandler=null;
            }
            return true;
        }
        _runtimeLayerBit(layer){
            const key=String(layer||'default').toLowerCase();
            if(this._layerBits.has(key))return this._layerBits.get(key);
            if(this._nextLayerBit>16384)return 1;
            const bit=this._nextLayerBit;
            this._nextLayerBit<<=1;
            this._layerBits.set(key,bit);
            return bit;
        }
        _runtimeMaskBits(mask){
            const values=Array.isArray(mask)?mask:[mask??'default'];
            if(values.some(value=>String(value).toLowerCase()==='all'))return-1;
            let bits=0;
            for(const value of values)bits|=this._runtimeLayerBit(value);
            return bits||1;
        }
        _forwardAdvancedBackendStays(){
            const backend=this._resolveBackend();
            const frame=Number(backend?._frame??-1);
            if(frame<0||frame===this._lastAdvancedCollisionFrame)return false;
            this._lastAdvancedCollisionFrame=frame;
            const pairs=backend?._collisionPairs;
            if(!pairs?.values)return false;
            for(const info of pairs.values()){
                if(!info?.meshA||!info?.meshB)continue;
                this.forwardCollision('stay',info.meshA,info.meshB,info);
            }
            return true;
        }
        _syncDynamicBodiesFromBackend(){
            const backend=this._resolveBackend();
            if(typeof backend?.syncBodyToObject!=='function')return;
            for(const component of this.rigidBodies){
                if(component.bodyType!=='dynamic'||!component.backendBody)continue;
                try{backend.syncBodyToObject(component.backendBody,component.owner,component);}catch{}
            }
        }
        _syncKinematicBodiesToBackend(){
            const backend=this._resolveBackend();
            if(typeof backend?.syncObjectToBody!=='function')return;
            for(const component of this.rigidBodies){
                if(component.bodyType!=='kinematic'||!component.backendBody)continue;
                try{backend.syncObjectToBody(component.owner,component.backendBody,component);}catch{}
            }
        }
        _resolveBackend(){
            if(this.backend)return this.backend;
            const bridge=window.SMRuntimePhysicsBridge||window.smRuntimePhysicsBridge;
            const candidates=[bridge?.getBackend?.(),bridge?.backend,window.physicsSystem,window.smPhysicsSystem,window.SMPhysicsSystem,window.physicsWorld];
            for(const candidate of candidates)if(candidate&&typeof candidate==='object'){this.backend=candidate;break;}
            return this.backend;
        }
        _vector(value,fallback=[0,0,0]){
            if(Array.isArray(value))return[Number(value[0]??fallback[0]),Number(value[1]??fallback[1]),Number(value[2]??fallback[2])];
            if(value&&typeof value==='object')return[Number(value.x??fallback[0]),Number(value.y??fallback[1]),Number(value.z??fallback[2])];
            return[...fallback];
        }
        _patchRuntimeAPI(){
            const runtime=window.SMRuntime;
            if(!runtime||this._runtimePatched)return false;
            if(typeof runtime.getPhysicsComponentBridge!=='function')runtime.getPhysicsComponentBridge=()=>this;
            if(typeof runtime.forwardPhysicsContact!=='function')runtime.forwardPhysicsContact=(type,a,b,contact={})=>this.forwardCollision(type,a,b,contact);
            this._runtimePatched=true;
            return true;
        }
        _autoRegister(){
            const register=()=>{
                if(this._registered||!window.SMRuntime?.registerSystem)return false;
                window.SMRuntime.registerSystem(this.id,this,{priority:this.priority});
                this._registered=true;
                this._patchRuntimeAPI();
                return true;
            };
            if(!register())window.addEventListener('sm:runtime-ready',register,{once:true});
        }
        debug(){
            const state={registered:this._registered,active:this.active,priority:this.priority,backend:this.backend?.constructor?.name||null,rigidBodies:this.rigidBodies.size,colliders:this.colliders.size,characterBodies:this.characterBodies.size,triggerVolumes:this.triggerVolumes.size};
            console.log('[SMPhysicsComponentBridge]',state);
            return state;
        }
    }
    const bridge=new SMPhysicsComponentBridge();
    window.SMPhysicsComponentBridge=bridge;
    window.smPhysicsComponentBridge=bridge;
    window.SMPhysicsComponentBridgeClass=SMPhysicsComponentBridge;
})();