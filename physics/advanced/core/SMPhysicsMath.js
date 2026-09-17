(function(global){
    'use strict';
    const api={
        toVector3(value,fallback=new THREE.Vector3()){
            if(value?.isVector3)return value.clone();
            if(Array.isArray(value))return new THREE.Vector3(Number(value[0])||0,Number(value[1])||0,Number(value[2])||0);
            if(value&&typeof value==='object')return new THREE.Vector3(Number(value.x)||0,Number(value.y)||0,Number(value.z)||0);
            return fallback.clone();
        },
        getBodyPosition(body,target=new THREE.Vector3()){
            if(!body)return target.set(0,0,0);
            const transform=body.getWorldTransform?.();
            const origin=transform?.getOrigin?.();
            if(origin)return target.set(origin.x(),origin.y(),origin.z());
            return target.set(0,0,0);
        },
        getBodyQuaternion(body,target=new THREE.Quaternion()){
            if(!body)return target.identity();
            const transform=body.getWorldTransform?.();
            const rotation=transform?.getRotation?.();
            if(rotation)return target.set(rotation.x(),rotation.y(),rotation.z(),rotation.w()).normalize();
            return target.identity();
        },
        getLinearVelocity(body,target=new THREE.Vector3()){
            const value=body?.getLinearVelocity?.();
            return value?target.set(value.x(),value.y(),value.z()):target.set(0,0,0);
        },
        getAngularVelocity(body,target=new THREE.Vector3()){
            const value=body?.getAngularVelocity?.();
            return value?target.set(value.x(),value.y(),value.z()):target.set(0,0,0);
        },
        bodyMass(mesh){
            const value=Number(mesh?.userData?.physics?.mass);
            return Number.isFinite(value)?Math.max(0,value):0;
        },
        isDynamic(mesh){
            const props=mesh?.userData?.physics;
            return !!props&&props.type!=='soft'&&!props.isKinematic&&Number(props.mass)>0;
        },
        pairKey(a,b){
            const aa=String(a?.uuid||a?.id||a?.ptr||'a');
            const bb=String(b?.uuid||b?.id||b?.ptr||'b');
            return aa<bb?`${aa}:${bb}`:`${bb}:${aa}`;
        },
        clamp01(value){
            return Math.max(0,Math.min(1,Number(value)||0));
        }
    };
    global.SMPhysicsMath=api;
})(window);
