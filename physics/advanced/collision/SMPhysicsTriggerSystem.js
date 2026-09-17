(function(global){
    'use strict';
    class SMPhysicsTriggerSystem{
        constructor(physics,contacts,layers,eventBus){
            this.physics=physics;
            this.contacts=contacts;
            this.layers=layers;
            this.eventBus=eventBus;
            this.triggers=new Map();
            this._disposeContact=this.contacts?.onAny?.((event)=>this._handleContact(event))||null;
        }
        create(mesh,options={}){
            if(!mesh||!this.physics?.isReady)return null;
            if(this.triggers.has(mesh))return this.triggers.get(mesh);
            const layer=options.layer||'sensor';
            const body=this.physics.addBody(mesh,{
                mass:0,
                isKinematic:false,
                shapeType:options.shapeType||'box',
                friction:0,
                restitution:0,
                collisionGroup:this.layers.get(layer),
                collisionMask:this.layers.mask(options.mask||'all'),
                flags:{
                    enableGravity:false,
                    ccd:false,
                    noSleep:true,
                    windAffected:false
                }
            });
            if(!body)return null;
            const A=this.physics.ammo;
            const noResponse=A?.CF_NO_CONTACT_RESPONSE??4;
            body.setCollisionFlags?.((body.getCollisionFlags?.()||0)|noResponse);
            body.activate?.(true);
            mesh.userData.physicsTrigger={
                enabled:true,
                layer,
                mask:options.mask||'all',
                tag:options.tag||'trigger'
            };
            const record={mesh,body,options:{...options},inside:new Set()};
            this.triggers.set(mesh,record);
            return record;
        }
        remove(mesh,options={}){
            const record=this.triggers.get(mesh);
            if(!record)return false;
            if(options.keepBody!==true)this.physics.removeBody?.(mesh,{silent:true});
            delete mesh.userData.physicsTrigger;
            this.triggers.delete(mesh);
            return true;
        }
        _handleContact(event){
            const a=this.triggers.get(event.meshA);
            const b=this.triggers.get(event.meshB);
            if(!a&&!b)return;
            if(a)this._emitTrigger(a,event.meshB,event);
            if(b)this._emitTrigger(b,event.meshA,event);
        }
        _emitTrigger(record,other,event){
            const type=event.type;
            if(type==='enter')record.inside.add(other);
            if(type==='exit')record.inside.delete(other);
            const payload={trigger:record.mesh,other,contact:event};
            record.mesh.dispatchEvent?.({type:`trigger${type}`,detail:payload});
            this.eventBus?.emit?.(`trigger:${type}`,payload);
        }
        contains(triggerMesh,object){
            return this.triggers.get(triggerMesh)?.inside.has(object)||false;
        }
        dispose(){
            this._disposeContact?.();
            for(const mesh of Array.from(this.triggers.keys()))this.remove(mesh);
        }
    }
    global.SMPhysicsTriggerSystem=SMPhysicsTriggerSystem;
})(window);
