(function(global){
    'use strict';
    class SMAdvancedPhysics{
        constructor(physics){
            if(!physics)throw new Error('SMAdvancedPhysics requires PhysicsSystem.');
            this.physics=physics;
            this.events=new global.SMPhysicsEventBus();
            this.layers=new global.SMPhysicsLayerManager();
            this.materials=new global.SMPhysicsMaterialLibrary();
            this.queries=new global.SMPhysicsQuerySystem(physics);
            this.contacts=new global.SMPhysicsContactSystem(physics,this.events);
            this.triggers=new global.SMPhysicsTriggerSystem(physics,this.contacts,this.layers,this.events);
            this.constraints=new global.SMConstraintManager(physics,this.events);
            this.vehicles=new global.SMRaycastVehicleSystem(physics,this.events);
            this.destruction=new global.SMDestructionSystem(physics,this.contacts,this.events);
            this.softBodies=new global.SMSoftBodyController(physics,this.events);
            this.recorder=new global.SMPhysicsStateRecorder(physics);
            this.performance=new global.SMPhysicsPerformanceManager(physics);
            this.characterMotors=new Set();
            this.diagnostics=new global.SMPhysicsDiagnostics(this);
            this.enabled=true;
            this._lastTime=performance.now();
            this.contacts.start();
        }
        createCharacterMotor(object,options={}){
            const motor=new global.SMCharacterMotor(this.physics,this.queries,object,options);
            this.characterMotors.add(motor);
            return motor;
        }
        removeCharacterMotor(motor){
            return this.characterMotors.delete(motor);
        }
        update(delta=null){
            if(!this.enabled)return;
            const now=performance.now();
            const dt=delta===null?Math.min(0.1,(now-this._lastTime)/1000):Math.min(0.1,Math.max(0,Number(delta)||0));
            this._lastTime=now;
            this.contacts.update(dt);
            this.constraints.update(dt);
            for(const motor of this.characterMotors)motor.update(dt);
            this.vehicles.update(dt);
            this.recorder.update(dt);
            this.performance.update(dt);
        }
        setEnabled(value){
            this.enabled=!!value;
            return this;
        }
        dispose(){
            this.enabled=false;
            this.contacts.stop();
            this.triggers.dispose();
            this.constraints.dispose();
            this.vehicles.dispose();
            this.destruction.dispose();
            this.softBodies.dispose();
            this.characterMotors.clear();
            this.events.clear();
        }
        debug(){
            return this.diagnostics.print();
        }
    }
    global.SMAdvancedPhysics=SMAdvancedPhysics;
})(window);
