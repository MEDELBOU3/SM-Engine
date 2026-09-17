(function(global){
    'use strict';
    let timer=0;
    const install=()=>{
        if(global.smColliderAuthoring)return true;
        const physics=global.physicsSystem||global.smPhysicsSystem||null;
        if(!physics?.isReady)return false;
        const required=['SMColliderGeometryBuilder','SMCompoundCollider','SMCollisionCooker','SMColliderSerializer','SMColliderVisualizer','SMColliderGizmo','SMColliderAuthoringSystem'];
        if(required.some(name=>!global[name]))return false;
        const system=new global.SMColliderAuthoringSystem(physics);
        if(!system.install())return false;
        global.smColliderAuthoring=system;
        global.SMColliderAuthoring=system;
        global.SMPhysics=Object.assign(global.SMPhysics||{},{colliderAuthoring:system,collisionCooker:system.cooker,colliderVisualizer:system.visualizer});
        if(global.smAdvancedPhysics){global.smAdvancedPhysics.colliderAuthoring=system;global.smAdvancedPhysics.collisionCooker=system.cooker;}
        global.addEventListener?.('sm:advanced-physics-ready',()=>{
            if(global.smAdvancedPhysics){global.smAdvancedPhysics.colliderAuthoring=system;global.smAdvancedPhysics.collisionCooker=system.cooker;}
            global.SMPhysics=Object.assign(global.SMPhysics||{},{colliderAuthoring:system,collisionCooker:system.cooker,colliderVisualizer:system.visualizer});
        });
        const previousFrame=global.engineFrameCallbacks;
        if(Array.isArray(previousFrame))previousFrame.push((delta)=>system.update(delta));
        else{
            const loop=()=>{if(global.smColliderAuthoring===system)system.update();requestAnimationFrame(loop);};
            requestAnimationFrame(loop);
        }
        clearInterval(timer);
        global.dispatchEvent(new CustomEvent('sm:collider-authoring-ready',{detail:{system,physics}}));
        console.log('[ColliderAuthoring] v1 ready.');
        return true;
    };
    if(!install())timer=setInterval(install,120);
    global.installSMColliderAuthoring=install;
})(window);