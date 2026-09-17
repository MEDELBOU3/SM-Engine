(function(global){
    'use strict';
    class SMPhysicsMaterialLibrary{
        constructor(){
            this.materials=new Map();
            const source=global.PHYSICS_MATERIALS||{};
            for(const [key,value] of Object.entries(source))this.register(key,value);
        }
        register(name,definition={}){
            const key=String(name||'CUSTOM').toUpperCase();
            const material={
                name:key,
                label:definition.label||key,
                friction:Number.isFinite(Number(definition.friction))?Number(definition.friction):0.5,
                restitution:Number.isFinite(Number(definition.restitution))?Number(definition.restitution):0.1,
                density:Number.isFinite(Number(definition.density))?Number(definition.density):1000,
                rollingFriction:Number.isFinite(Number(definition.rollingFriction))?Number(definition.rollingFriction):0,
                spinningFriction:Number.isFinite(Number(definition.spinningFriction))?Number(definition.spinningFriction):0,
                linearDamping:Number.isFinite(Number(definition.linearDamping))?Number(definition.linearDamping):0.02,
                angularDamping:Number.isFinite(Number(definition.angularDamping))?Number(definition.angularDamping):0.05,
                surfaceType:definition.surfaceType||key.toLowerCase(),
                metadata:{...(definition.metadata||{})}
            };
            this.materials.set(key,material);
            return material;
        }
        get(name='DEFAULT'){
            return this.materials.get(String(name).toUpperCase())||this.materials.get('DEFAULT')||null;
        }
        applyToProps(props={},name='DEFAULT'){
            const material=this.get(name);
            if(!material)return{...props};
            return{
                ...props,
                material:material.name,
                friction:props.friction??material.friction,
                restitution:props.restitution??material.restitution,
                linearDamping:props.linearDamping??material.linearDamping,
                angularDamping:props.angularDamping??material.angularDamping,
                rollingFriction:props.rollingFriction??material.rollingFriction,
                spinningFriction:props.spinningFriction??material.spinningFriction
            };
        }
        estimateMassFromBox(size,name='DEFAULT'){
            const material=this.get(name);
            if(!material)return 1;
            const sx=Math.max(0,Number(size?.x??size?.[0])||0);
            const sy=Math.max(0,Number(size?.y??size?.[1])||0);
            const sz=Math.max(0,Number(size?.z??size?.[2])||0);
            return sx*sy*sz*material.density;
        }
        list(){
            return Array.from(this.materials.values()).map(item=>({...item}));
        }
    }
    global.SMPhysicsMaterialLibrary=SMPhysicsMaterialLibrary;
})(window);
