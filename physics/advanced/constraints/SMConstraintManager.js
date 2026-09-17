(function(global){
    'use strict';
    class SMConstraintManager{
        constructor(physics,eventBus){
            this.physics=physics;
            this.eventBus=eventBus;
            this.records=new Map();
            this._tmpA=new THREE.Vector3();
            this._tmpB=new THREE.Vector3();
            this._velA=new THREE.Vector3();
            this._velB=new THREE.Vector3();
        }
        create(meshA,meshB,type='fixed',options={}){
            const constraint=this.physics?.createConstraint?.(meshA,meshB,type);
            if(!constraint)return null;
            const record={
                constraint,
                meshA,
                meshB,
                type,
                enabled:true,
                breakDistance:Number(options.breakDistance)||Infinity,
                breakSpeed:Number(options.breakSpeed)||Infinity,
                metadata:{...(options.metadata||{})}
            };
            this.records.set(constraint,record);
            return record;
        }
        hinge(a,b,options={}){return this.create(a,b,'hinge',options);}
        point(a,b,options={}){return this.create(a,b,'point',options);}
        slider(a,b,options={}){return this.create(a,b,'slider',options);}
        spring(a,b,options={}){return this.create(a,b,'spring',options);}
        fixed(a,b,options={}){return this.create(a,b,'fixed',options);}
        remove(recordOrConstraint){
            const constraint=recordOrConstraint?.constraint||recordOrConstraint;
            const record=this.records.get(constraint);
            if(!constraint)return false;
            const removed=this.physics?.removeConstraint?.(constraint)??false;
            this.records.delete(constraint);
            if(record)this.eventBus?.emit?.('constraint:removed',record);
            return removed;
        }
        update(){
            for(const record of Array.from(this.records.values())){
                if(!record.enabled)continue;
                record.meshA?.getWorldPosition?.(this._tmpA);
                record.meshB?.getWorldPosition?.(this._tmpB);
                const distance=this._tmpA.distanceTo(this._tmpB);
                const bodyA=this.physics?.meshToBodyMap?.get(record.meshA);
                const bodyB=this.physics?.meshToBodyMap?.get(record.meshB);
                global.SMPhysicsMath.getLinearVelocity(bodyA,this._velA);
                global.SMPhysicsMath.getLinearVelocity(bodyB,this._velB);
                const relativeSpeed=this._velA.sub(this._velB).length();
                if(distance>record.breakDistance||relativeSpeed>record.breakSpeed){
                    this.eventBus?.emit?.('constraint:break',{...record,distance,relativeSpeed});
                    this.remove(record);
                }
            }
        }
        dispose(){
            for(const record of Array.from(this.records.values()))this.remove(record);
        }
    }
    global.SMConstraintManager=SMConstraintManager;
})(window);
