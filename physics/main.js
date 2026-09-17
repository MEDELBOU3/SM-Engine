// physics/main.js
'use strict';
(function(root){
    const ensureNamespace=()=>root.SMPhysics=Object.assign(root.SMPhysics||{},{});
    const legacyExports=()=>{
        const api=ensureNamespace();
        const add=(name,value)=>{if(value!==undefined&&value!==null){api[name]=value;root[name]=value;}};
        add('PHYSICS_MATERIALS',root.PHYSICS_MATERIALS||(typeof PHYSICS_MATERIALS!=='undefined'?PHYSICS_MATERIALS:null));
        add('COL',root.COL||(typeof COL!=='undefined'?COL:null));
        add('WindZone',root.WindZone||(typeof WindZone!=='undefined'?WindZone:null));
        add('LiquidZone',root.LiquidZone||(typeof LiquidZone!=='undefined'?LiquidZone:null));
        add('PhysicsUI',root.PhysicsUI||(typeof PhysicsUI!=='undefined'?PhysicsUI:null));
        add('PhysicsSystem',root.PhysicsSystem||(typeof PhysicsSystem!=='undefined'?PhysicsSystem:null));
        add('RagdollSystem',root.RagdollSystem||(typeof RagdollSystem!=='undefined'?RagdollSystem:null));
        if(root.ragdollSystem)api.ragdollSystem=root.ragdollSystem;
        return api;
    };
    const syncAdvanced=()=>{
        const api=legacyExports();
        const advanced=root.smAdvancedPhysics||root.SMAdvancedPhysicsRuntime||null;
        if(!advanced)return api;
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
        return api;
    };
    root.getPhysicsSystem=()=>root.physicsSystem||root.smPhysicsSystem||null;
    root.getAdvancedPhysics=()=>root.smAdvancedPhysics||root.SMAdvancedPhysicsRuntime||null;
    root.getPhysicsAPI=()=>syncAdvanced();
    legacyExports();
    syncAdvanced();
    root.addEventListener?.('sm:advanced-physics-ready',syncAdvanced);
    root.addEventListener?.('sm:runtime-physics-started',syncAdvanced);
})(window);