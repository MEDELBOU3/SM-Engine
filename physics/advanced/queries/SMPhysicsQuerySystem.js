(function(global){
    'use strict';
    class SMPhysicsQuerySystem{
        constructor(physics){
            this.physics=physics;
            this._box=new THREE.Box3();
            this._tmp=new THREE.Vector3();
        }
        raycast(from,to,options={}){
            return this.physics?.raycast?.(from,to,options)||{hit:false};
        }
        raycastDirection(origin,direction,distance=100,options={}){
            const from=global.SMPhysicsMath.toVector3(origin);
            const dir=global.SMPhysicsMath.toVector3(direction).normalize();
            const to=from.clone().addScaledVector(dir,Math.max(0,Number(distance)||0));
            return this.raycast(from,to,options);
        }
        raycastAll(from,to,options={}){
            const physics=this.physics;
            const A=physics?.ammo;
            if(!physics?.isReady||!A||!physics.physicsWorld)return[];
            if(!A.AllHitsRayResultCallback){
                const closest=this.raycast(from,to,options);
                return closest?.hit?[closest]:[];
            }
            const start=new A.btVector3(from.x,from.y,from.z);
            const end=new A.btVector3(to.x,to.y,to.z);
            const callback=new A.AllHitsRayResultCallback(start,end);
            try{
                callback.set_m_collisionFilterGroup?.(options.group??1);
                callback.set_m_collisionFilterMask?.(options.mask??-1);
                physics.physicsWorld.rayTest(start,end,callback);
                if(!callback.hasHit())return[];
                const objects=callback.get_m_collisionObjects?.();
                const points=callback.get_m_hitPointWorld?.();
                const normals=callback.get_m_hitNormalWorld?.();
                const fractions=callback.get_m_hitFractions?.();
                const count=objects?.size?.()??0;
                const hits=[];
                for(let i=0;i<count;i++){
                    const collisionObject=objects.at(i);
                    const body=A.castObject(collisionObject,A.btRigidBody);
                    const point=points?.at?.(i);
                    const normal=normals?.at?.(i);
                    hits.push({
                        hit:true,
                        mesh:physics._findMeshForBody?.(body)||null,
                        body,
                        point:point?new THREE.Vector3(point.x(),point.y(),point.z()):null,
                        normal:normal?new THREE.Vector3(normal.x(),normal.y(),normal.z()).normalize():null,
                        fraction:fractions?.at?.(i)??null
                    });
                }
                hits.sort((a,b)=>(a.fraction??1)-(b.fraction??1));
                return hits;
            }finally{
                physics._destroy?.(callback);
                physics._destroy?.(start);
                physics._destroy?.(end);
            }
        }
        overlapSphere(center,radius,options={}){
            const physics=this.physics;
            if(!physics?.meshToBodyMap)return[];
            const c=global.SMPhysicsMath.toVector3(center);
            const r=Math.max(0,Number(radius)||0);
            const hits=[];
            for(const [mesh,body] of physics.meshToBodyMap){
                if(!mesh?.isObject3D)continue;
                const props=mesh.userData?.physics||{};
                if(options.dynamicOnly&&!(Number(props.mass)>0&&!props.isKinematic))continue;
                if(options.exclude?.has?.(mesh)||options.exclude===mesh)continue;
                this._box.setFromObject(mesh);
                this._box.clampPoint(c,this._tmp);
                const distanceSq=this._tmp.distanceToSquared(c);
                if(distanceSq<=r*r){
                    hits.push({
                        mesh,
                        body,
                        distance:Math.sqrt(distanceSq),
                        point:this._tmp.clone(),
                        props
                    });
                }
            }
            hits.sort((a,b)=>a.distance-b.distance);
            return hits;
        }
        overlapBox(center,halfExtents,options={}){
            const c=global.SMPhysicsMath.toVector3(center);
            const h=global.SMPhysicsMath.toVector3(halfExtents);
            const queryBox=new THREE.Box3(c.clone().sub(h),c.clone().add(h));
            const hits=[];
            for(const [mesh,body] of this.physics?.meshToBodyMap||[]){
                if(!mesh?.isObject3D)continue;
                const props=mesh.userData?.physics||{};
                if(options.dynamicOnly&&!(Number(props.mass)>0&&!props.isKinematic))continue;
                this._box.setFromObject(mesh);
                if(queryBox.intersectsBox(this._box))hits.push({mesh,body,props,box:this._box.clone()});
            }
            return hits;
        }
        sweepSphere(from,to,radius,options={}){
            const start=global.SMPhysicsMath.toVector3(from);
            const end=global.SMPhysicsMath.toVector3(to);
            const distance=start.distanceTo(end);
            const step=Math.max(0.02,Number(options.step)||Math.max(radius*0.5,0.1));
            const count=Math.max(1,Math.ceil(distance/step));
            for(let i=0;i<=count;i++){
                const alpha=i/count;
                const point=start.clone().lerp(end,alpha);
                const hits=this.overlapSphere(point,radius,options);
                if(hits.length)return{
                    hit:true,
                    fraction:alpha,
                    point,
                    hits,
                    mesh:hits[0].mesh,
                    body:hits[0].body,
                    approximate:true
                };
            }
            return{hit:false,approximate:true};
        }
    }
    global.SMPhysicsQuerySystem=SMPhysicsQuerySystem;
})(window);
