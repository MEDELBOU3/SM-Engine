// physics/physics-compat.js
'use strict';
(function(root){
    const safeGlobal=(name)=>root[name]??null;
    const sync=()=>{
        const api=root.SMPhysics=Object.assign(root.SMPhysics||{},{});
        const legacy={
            PHYSICS_MATERIALS:safeGlobal('PHYSICS_MATERIALS'),
            COL:safeGlobal('COL'),
            WindZone:safeGlobal('WindZone'),
            LiquidZone:safeGlobal('LiquidZone'),
            PhysicsUI:safeGlobal('PhysicsUI'),
            PhysicsSystem:safeGlobal('PhysicsSystem'),
            RagdollSystem:safeGlobal('RagdollSystem'),
            ragdollSystem:safeGlobal('ragdollSystem')
        };
        for(const [key,value] of Object.entries(legacy))if(value!==null&&value!==undefined)api[key]=value;
        const advanced=root.smAdvancedPhysics||root.SMAdvancedPhysicsRuntime||null;
        if(advanced){
            Object.assign(api,{
                advanced,
                events:advanced.events||null,
                layers:advanced.layers||null,
                materials:advanced.materials||null,
                queries:advanced.queries||null,
                contacts:advanced.contacts||null,
                triggers:advanced.triggers||null,
                constraints:advanced.constraints||null,
                vehicles:advanced.vehicles||null,
                destruction:advanced.destruction||null,
                softBodies:advanced.softBodies||null,
                recorder:advanced.recorder||null,
                performance:advanced.performance||null,
                diagnostics:advanced.diagnostics||null
            });
        }
        return api;
    };
    root.getPhysicsSystem=()=>root.physicsSystem||root.smPhysicsSystem||null;
    root.getAdvancedPhysics=()=>root.smAdvancedPhysics||root.SMAdvancedPhysicsRuntime||null;
    root.setPhysicsSelection=(object)=>{
        const system=root.getPhysicsSystem();
        if(!system)return false;
        system.setSelectedObject?.(object||null);
        system.ui?.updateObjectPanel?.(object||null);
        system.ui?.refreshWorkbench?.();
        return true;
    };
    root.physicsRaycast=(from,to,options={})=>root.getAdvancedPhysics()?.queries?.raycast?.(from,to,options)||root.getPhysicsSystem()?.raycast?.(from,to,options)||{hit:false};
    root.physicsRaycastAll=(from,to,options={})=>root.getAdvancedPhysics()?.queries?.raycastAll?.(from,to,options)||[];
    root.physicsOverlapSphere=(center,radius,options={})=>root.getAdvancedPhysics()?.queries?.overlapSphere?.(center,radius,options)||[];
    root.physicsOverlapBox=(center,halfExtents,options={})=>root.getAdvancedPhysics()?.queries?.overlapBox?.(center,halfExtents,options)||[];
    root.physicsSweepSphere=(from,to,radius,options={})=>root.getAdvancedPhysics()?.queries?.sweepSphere?.(from,to,radius,options)||{hit:false};
    sync();
    root.addEventListener?.('sm:advanced-physics-ready',()=>{
        const api=sync();
        console.log('[SMPhysics] Advanced compatibility API ready.',{
            Advanced:!!api.advanced,
            Queries:!!api.queries,
            Contacts:!!api.contacts,
            Triggers:!!api.triggers,
            Vehicles:!!api.vehicles,
            Destruction:!!api.destruction
        });
    });
    root.addEventListener?.('sm:runtime-physics-started',sync);
})(window);