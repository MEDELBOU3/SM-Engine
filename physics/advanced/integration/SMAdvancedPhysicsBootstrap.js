(function(global){
    'use strict';
    let installed=false;
    let timer=0;
    const install=()=>{
        if(installed)return true;
        const physics=global.physicsSystem||global.smPhysicsSystem||null;
        if(!physics||!physics.isReady)return false;
        if(global.smAdvancedPhysics){
            installed=true;
            return true;
        }
        const advanced=new global.SMAdvancedPhysics(physics);
        global.smAdvancedPhysics=advanced;
        global.SMAdvancedPhysicsRuntime=advanced;
        physics.advanced=advanced;
        if(typeof physics.getAdvanced!=='function')physics.getAdvanced=()=>advanced;
        if(typeof physics.raycastAll!=='function')physics.raycastAll=(from,to,options={})=>advanced.queries.raycastAll(from,to,options);
        if(typeof physics.overlapSphere!=='function')physics.overlapSphere=(center,radius,options={})=>advanced.queries.overlapSphere(center,radius,options);
        if(typeof physics.overlapBox!=='function')physics.overlapBox=(center,halfExtents,options={})=>advanced.queries.overlapBox(center,halfExtents,options);
        if(typeof physics.sweepSphere!=='function')physics.sweepSphere=(from,to,radius,options={})=>advanced.queries.sweepSphere(from,to,radius,options);
        const originalUpdate=physics.update?.bind(physics);
        if(originalUpdate&&!physics.__smAdvancedUpdateWrapped){
            physics.update=function(delta,...args){
                const result=originalUpdate(delta,...args);
                advanced.update(delta);
                return result;
            };
            physics.__smAdvancedUpdateWrapped=true;
        }
        global.SMPhysics=Object.assign(global.SMPhysics||{},{
            advanced,
            events:advanced.events,
            layers:advanced.layers,
            materials:advanced.materials,
            queries:advanced.queries,
            contacts:advanced.contacts,
            triggers:advanced.triggers,
            constraints:advanced.constraints,
            vehicles:advanced.vehicles,
            destruction:advanced.destruction,
            softBodies:advanced.softBodies,
            recorder:advanced.recorder,
            performance:advanced.performance,
            diagnostics:advanced.diagnostics
        });
        installed=true;
        clearInterval(timer);
        global.dispatchEvent(new CustomEvent('sm:advanced-physics-ready',{detail:{advanced,physics}}));
        console.log('[SM Advanced Physics] v4 ready.',advanced.diagnostics.snapshot());
        return true;
    };
    if(!install()){
        timer=setInterval(install,120);
        global.addEventListener('sm:runtime-physics-started',install);
    }
    global.installSMAdvancedPhysics=install;
})(window);
