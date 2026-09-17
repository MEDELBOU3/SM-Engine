(function(global){
    'use strict';
    class SMCharacterMotor{
        constructor(physics,queries,object,options={}){
            this.physics=physics;
            this.queries=queries;
            this.object=object;
            this.body=physics?.meshToBodyMap?.get(object)||null;
            this.enabled=true;
            this.maxSpeed=Number(options.maxSpeed)||6;
            this.acceleration=Number(options.acceleration)||24;
            this.airAcceleration=Number(options.airAcceleration)||6;
            this.jumpSpeed=Number(options.jumpSpeed)||5.5;
            this.groundProbe=Number(options.groundProbe)||0.8;
            this.groundMask=options.groundMask??-1;
            this.up=new THREE.Vector3(0,1,0);
            this.desiredVelocity=new THREE.Vector3();
            this.velocity=new THREE.Vector3();
            this._target=new THREE.Vector3();
            this._origin=new THREE.Vector3();
            this._end=new THREE.Vector3();
            this.grounded=false;
            this.groundHit=null;
            this.jumpQueued=false;
        }
        setMoveInput(x,z,cameraQuaternion=null){
            this.desiredVelocity.set(Number(x)||0,0,Number(z)||0);
            if(this.desiredVelocity.lengthSq()>1)this.desiredVelocity.normalize();
            if(cameraQuaternion){
                const yawEuler=new THREE.Euler().setFromQuaternion(cameraQuaternion,'YXZ');
                const q=new THREE.Quaternion().setFromAxisAngle(this.up,yawEuler.y);
                this.desiredVelocity.applyQuaternion(q);
            }
            this.desiredVelocity.multiplyScalar(this.maxSpeed);
            return this;
        }
        jump(){
            this.jumpQueued=true;
            return this;
        }
        _probeGround(){
            this.object.getWorldPosition(this._origin);
            this._end.copy(this._origin).addScaledVector(this.up,-this.groundProbe);
            const hit=this.queries.raycast(this._origin,this._end,{mask:this.groundMask});
            if(hit?.hit&&hit.mesh!==this.object){
                this.grounded=true;
                this.groundHit=hit;
            }else{
                this.grounded=false;
                this.groundHit=null;
            }
        }
        update(delta){
            if(!this.enabled)return;
            this.body=this.physics?.meshToBodyMap?.get(this.object)||this.body;
            if(!this.body)return;
            this._probeGround();
            global.SMPhysicsMath.getLinearVelocity(this.body,this.velocity);
            const accel=this.grounded?this.acceleration:this.airAcceleration;
            const blend=Math.min(1,Math.max(0,Number(delta)||0)*accel);
            this._target.set(this.desiredVelocity.x,this.velocity.y,this.desiredVelocity.z);
            this.velocity.x=THREE.MathUtils.lerp(this.velocity.x,this._target.x,blend);
            this.velocity.z=THREE.MathUtils.lerp(this.velocity.z,this._target.z,blend);
            if(this.jumpQueued&&this.grounded)this.velocity.y=this.jumpSpeed;
            this.jumpQueued=false;
            const A=this.physics.ammo;
            const v=new A.btVector3(this.velocity.x,this.velocity.y,this.velocity.z);
            try{
                this.body.setLinearVelocity(v);
                this.body.activate?.(true);
            }finally{
                this.physics._destroy?.(v);
            }
        }
    }
    global.SMCharacterMotor=SMCharacterMotor;
})(window);
