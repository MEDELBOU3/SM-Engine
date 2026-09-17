(function(global){
    'use strict';
    class SMPhysicsDiagnostics{
        constructor(advanced){
            this.advanced=advanced;
        }
        snapshot(){
            const physics=this.advanced.physics;
            const report=physics?.getRuntimeReport?.()||{};
            return{
                ready:!!physics?.isReady,
                simulationRunning:!!physics?.simulationRunning,
                backend:report.ammoBackend||null,
                softBodiesSupported:!!physics?.supportsSoftBodies,
                rigidBodies:report.rigidBodies??0,
                softBodies:report.softBodies??0,
                constraints:physics?.constraints?.length??0,
                windZones:physics?.windZones?.length??0,
                liquidZones:physics?.liquidZones?.length??0,
                forceFields:physics?.forceFields?.length??0,
                activeContacts:this.advanced.contacts?.activePairs?.size??0,
                triggers:this.advanced.triggers?.triggers?.size??0,
                vehicles:this.advanced.vehicles?.vehicles?.size??0,
                breakables:this.advanced.destruction?.breakables?.size??0,
                motors:this.advanced.characterMotors?.size??0,
                recordedFrames:this.advanced.recorder?.frames?.length??0,
                performance:this.advanced.performance?.getStats?.()||{}
            };
        }
        validate(){
            const physics=this.advanced.physics;
            const issues=[];
            if(!physics)issues.push('PhysicsSystem is missing.');
            if(physics&&!physics.isReady)issues.push('PhysicsSystem is not initialized.');
            if(physics?.meshToBodyMap){
                for(const [mesh,body] of physics.meshToBodyMap){
                    if(!mesh)issues.push('meshToBodyMap contains a null mesh.');
                    if(!body)issues.push(`Body missing for ${mesh?.name||mesh?.uuid||'unknown'}.`);
                }
            }
            for(const record of this.advanced.constraints?.records?.values?.()||[]){
                if(!record.meshA||!record.meshB)issues.push('Constraint record has a missing endpoint.');
            }
            return{
                ok:issues.length===0,
                issues,
                snapshot:this.snapshot()
            };
        }
        print(){
            const result=this.validate();
            console.table(result.snapshot);
            if(result.issues.length)console.warn('[SMPhysicsDiagnostics] Issues:',result.issues);
            else console.log('[SMPhysicsDiagnostics] Physics stack looks healthy.');
            return result;
        }
    }
    global.SMPhysicsDiagnostics=SMPhysicsDiagnostics;
})(window);
