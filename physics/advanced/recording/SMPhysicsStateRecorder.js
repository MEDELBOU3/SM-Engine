(function(global){
    'use strict';
    class SMPhysicsStateRecorder{
        constructor(physics,options={}){
            this.physics=physics;
            this.capacity=Math.max(2,Number(options.capacity)||300);
            this.frames=[];
            this.recording=false;
            this.frameIndex=0;
        }
        start(){
            this.recording=true;
            return this;
        }
        stop(){
            this.recording=false;
            return this;
        }
        clear(){
            this.frames.length=0;
            this.frameIndex=0;
        }
        capture(label=null){
            const bodies=[];
            for(const [mesh,body] of this.physics?.meshToBodyMap||[]){
                const props=mesh.userData?.physics||{};
                if(props.type==='soft')continue;
                const position=global.SMPhysicsMath.getBodyPosition(body,new THREE.Vector3());
                const quaternion=global.SMPhysicsMath.getBodyQuaternion(body,new THREE.Quaternion());
                const linear=global.SMPhysicsMath.getLinearVelocity(body,new THREE.Vector3());
                const angular=global.SMPhysicsMath.getAngularVelocity(body,new THREE.Vector3());
                bodies.push({
                    uuid:mesh.uuid,
                    mesh,
                    position:position.toArray(),
                    quaternion:quaternion.toArray(),
                    linear:linear.toArray(),
                    angular:angular.toArray(),
                    active:body.isActive?.()??true
                });
            }
            const frame={
                index:this.frameIndex++,
                time:performance.now(),
                label,
                bodies
            };
            this.frames.push(frame);
            if(this.frames.length>this.capacity)this.frames.shift();
            return frame;
        }
        update(){
            if(this.recording)this.capture();
        }
        restore(frameOrIndex){
            const frame=typeof frameOrIndex==='number'
                ?this.frames[Math.max(0,Math.min(this.frames.length-1,frameOrIndex))]
                :frameOrIndex;
            if(!frame)return false;
            const A=this.physics?.ammo;
            if(!A)return false;
            for(const state of frame.bodies){
                const mesh=state.mesh||this.physics.scene?.getObjectByProperty?.('uuid',state.uuid);
                const body=this.physics.meshToBodyMap?.get(mesh);
                if(!mesh||!body)continue;
                this.physics._applyWorldTransformToObject?.(
                    mesh,
                    new THREE.Vector3().fromArray(state.position),
                    new THREE.Quaternion().fromArray(state.quaternion)
                );
                this.physics._writeTransformFromObject?.(mesh,body);
                const lv=new A.btVector3(...state.linear);
                const av=new A.btVector3(...state.angular);
                try{
                    body.setLinearVelocity?.(lv);
                    body.setAngularVelocity?.(av);
                    body.activate?.(true);
                }finally{
                    this.physics._destroy?.(lv);
                    this.physics._destroy?.(av);
                }
            }
            return true;
        }
        rewind(framesBack=1){
            if(!this.frames.length)return false;
            const index=Math.max(0,this.frames.length-1-Math.max(0,Number(framesBack)||0));
            return this.restore(this.frames[index]);
        }
    }
    global.SMPhysicsStateRecorder=SMPhysicsStateRecorder;
})(window);
