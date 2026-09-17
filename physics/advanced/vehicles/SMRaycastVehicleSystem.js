(function(global){
    'use strict';
    class SMRaycastVehicleSystem{
        constructor(physics,eventBus){
            this.physics=physics;
            this.eventBus=eventBus;
            this.vehicles=new Set();
        }
        create(chassisMesh,options={}){
            const physics=this.physics;
            const A=physics?.ammo;
            const world=physics?.physicsWorld;
            const chassisBody=physics?.meshToBodyMap?.get(chassisMesh);
            if(!A||!world||!chassisBody||!A.btRaycastVehicle||!A.btVehicleTuning||!A.btDefaultVehicleRaycaster)return null;
            const tuning=new A.btVehicleTuning();
            const raycaster=new A.btDefaultVehicleRaycaster(world);
            const vehicle=new A.btRaycastVehicle(tuning,chassisBody,raycaster);
            vehicle.setCoordinateSystem?.(0,1,2);
            world.addAction?.(vehicle);
            const record={
                chassisMesh,
                chassisBody,
                tuning,
                raycaster,
                vehicle,
                wheels:[],
                engineForce:0,
                brakeForce:0,
                steering:0,
                maxEngineForce:Number(options.maxEngineForce)||1800,
                maxBrakeForce:Number(options.maxBrakeForce)||120,
                maxSteering:Number(options.maxSteering)||0.55
            };
            const wheelDefs=options.wheels||[
                {position:[-0.9,-0.45,1.35],front:true},
                {position:[0.9,-0.45,1.35],front:true},
                {position:[-0.9,-0.45,-1.35],front:false},
                {position:[0.9,-0.45,-1.35],front:false}
            ];
            for(const def of wheelDefs)this.addWheel(record,def);
            this.vehicles.add(record);
            this.eventBus?.emit?.('vehicle:created',record);
            return record;
        }
        addWheel(record,definition={}){
            const A=this.physics.ammo;
            const position=definition.position||[0,0,0];
            const connection=new A.btVector3(position[0],position[1],position[2]);
            const direction=new A.btVector3(0,-1,0);
            const axle=new A.btVector3(-1,0,0);
            try{
                const index=record.vehicle.getNumWheels();
                const info=record.vehicle.addWheel(
                    connection,
                    direction,
                    axle,
                    Number(definition.suspensionRestLength)||0.35,
                    Number(definition.radius)||0.38,
                    record.tuning,
                    definition.front===true
                );
                info.set_m_suspensionStiffness?.(Number(definition.suspensionStiffness)||22);
                info.set_m_wheelsDampingRelaxation?.(Number(definition.dampingRelaxation)||2.3);
                info.set_m_wheelsDampingCompression?.(Number(definition.dampingCompression)||4.4);
                info.set_m_frictionSlip?.(Number(definition.frictionSlip)||1000);
                info.set_m_rollInfluence?.(Number(definition.rollInfluence)||0.1);
                record.wheels.push({
                    index,
                    front:definition.front===true,
                    mesh:definition.mesh||null,
                    info
                });
                return info;
            }finally{
                this.physics._destroy?.(connection);
                this.physics._destroy?.(direction);
                this.physics._destroy?.(axle);
            }
        }
        setControls(record,{throttle=0,brake=0,steering=0}={}){
            record.engineForce=THREE.MathUtils.clamp(Number(throttle)||0,-1,1)*record.maxEngineForce;
            record.brakeForce=THREE.MathUtils.clamp(Number(brake)||0,0,1)*record.maxBrakeForce;
            record.steering=THREE.MathUtils.clamp(Number(steering)||0,-1,1)*record.maxSteering;
        }
        update(){
            for(const record of this.vehicles){
                for(const wheel of record.wheels){
                    record.vehicle.applyEngineForce?.(record.engineForce,wheel.index);
                    record.vehicle.setBrake?.(record.brakeForce,wheel.index);
                    if(wheel.front)record.vehicle.setSteeringValue?.(record.steering,wheel.index);
                    record.vehicle.updateWheelTransform?.(wheel.index,true);
                    if(wheel.mesh){
                        const transform=record.vehicle.getWheelTransformWS?.(wheel.index);
                        const origin=transform?.getOrigin?.();
                        const rotation=transform?.getRotation?.();
                        if(origin)wheel.mesh.position.set(origin.x(),origin.y(),origin.z());
                        if(rotation)wheel.mesh.quaternion.set(rotation.x(),rotation.y(),rotation.z(),rotation.w());
                    }
                }
            }
        }
        remove(record){
            if(!record||!this.vehicles.has(record))return false;
            try{this.physics.physicsWorld.removeAction?.(record.vehicle);}catch{}
            this.physics._destroy?.(record.vehicle);
            this.physics._destroy?.(record.raycaster);
            this.physics._destroy?.(record.tuning);
            this.vehicles.delete(record);
            this.eventBus?.emit?.('vehicle:removed',record);
            return true;
        }
        dispose(){
            for(const record of Array.from(this.vehicles))this.remove(record);
        }
    }
    global.SMRaycastVehicleSystem=SMRaycastVehicleSystem;
})(window);
