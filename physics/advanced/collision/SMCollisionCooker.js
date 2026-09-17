(function(global){
    'use strict';
    class SMCollisionCooker{
        constructor(physics,builder=null){
            this.physics=physics;
            this.builder=builder||new global.SMColliderGeometryBuilder();
        }
        _destroy(object){this.physics?._destroy?.(object);}
        _margin(shape,config,radius=1){
            if(!shape?.setMargin)return;
            const requested=Number(config.margin??config.collisionMargin);
            const value=Number.isFinite(requested)?requested:Math.min(0.04,Math.max(0.002,radius*0.02));
            shape.setMargin(THREE.MathUtils.clamp(value,0.001,0.1));
        }
        _descriptor(shape,extras,data,config={}){
            const size=data?.size||new THREE.Vector3(1,1,1);
            const radius=data?.radius||Math.max(0.001,size.length()*0.5);
            this._margin(shape,config,radius);
            return{
                shape,
                extras:extras||[],
                volume:Math.max(0.000001,size.x*size.y*size.z),
                halfExtentY:Math.max(0.0005,size.y*0.5),
                radius
            };
        }
        cook(owner,config={},props={}){
            const mode=String(config.mode||config.complexity||'exact').toLowerCase();
            if(mode==='exact'||mode==='trimesh'||mode==='complexassimple')return this.cookExact(owner,config,props);
            if(mode==='convex'||mode==='autoconvex')return this.cookConvex(owner,config,props);
            if(mode==='decomposition'||mode==='clusteredconvex')return this.cookDecomposition(owner,config,props);
            if(mode==='compound')return this.cookCompound(owner,config,props);
            if(mode==='custom')return this.cookCustom(owner,config,props);
            return null;
        }
        _build(owner,config,source=null){
            return this.builder.build(owner,{
                source:source||owner,
                weld:config.weld!==false,
                weldTolerance:config.weldTolerance??1e-5,
                maxTriangles:config.maxTriangles??250000
            });
        }
        cookExact(owner,config={},props={}){
            const dynamic=Number(props.mass)>0&&!props.isKinematic;
            if(dynamic&&config.allowDynamicTriangleMesh!==true){
                console.warn('[ColliderAuthoring] Exact triangle collision is static/kinematic only. Falling back to clustered convex for dynamic body:',owner.name);
                return this.cookDecomposition(owner,{...config,mode:'decomposition'},props);
            }
            const data=this._build(owner,config);
            const A=this.physics?.ammo;
            if(!data||!A?.btTriangleMesh||!A?.btBvhTriangleMeshShape)return null;
            const triangleMesh=new A.btTriangleMesh(true,true);
            const a=new A.btVector3(0,0,0);
            const b=new A.btVector3(0,0,0);
            const c=new A.btVector3(0,0,0);
            const p=data.positions;
            const idx=data.indices;
            const set=(target,index)=>target.setValue(p[index*3],p[index*3+1],p[index*3+2]);
            try{
                for(let i=0;i<idx.length;i+=3){
                    set(a,idx[i]);set(b,idx[i+1]);set(c,idx[i+2]);
                    triangleMesh.addTriangle(a,b,c,true);
                }
            }finally{
                this._destroy(a);this._destroy(b);this._destroy(c);
            }
            const shape=new A.btBvhTriangleMeshShape(triangleMesh,true,true);
            const descriptor=this._descriptor(shape,[triangleMesh],data,config);
            descriptor.authoringStats={mode:'exact',triangles:data.triangleCount,vertices:data.vertexCount,truncated:data.truncated};
            return descriptor;
        }
        cookConvex(owner,config={},props={},source=null){
            const data=this._build(owner,config,source);
            const A=this.physics?.ammo;
            if(!data||!A?.btConvexHullShape)return null;
            const hull=new A.btConvexHullShape();
            const temp=new A.btVector3(0,0,0);
            try{
                for(let i=0;i<data.positions.length;i+=3){
                    temp.setValue(data.positions[i],data.positions[i+1],data.positions[i+2]);
                    hull.addPoint(temp,i+3>=data.positions.length);
                }
            }finally{this._destroy(temp);}
            hull.recalcLocalAabb?.();
            const descriptor=this._descriptor(hull,[],data,config);
            descriptor.authoringStats={mode:'convex',triangles:data.triangleCount,vertices:data.vertexCount};
            return descriptor;
        }
        _triangleClusters(data,maxHulls,iterations=5){
            const idx=data.indices;
            const p=data.positions;
            const triangleCount=Math.floor(idx.length/3);
            if(triangleCount<=1)return[[0]];
            const targetPerHull=Math.max(32,Math.floor(Number(data.targetTrianglesPerHull)||128));
            const k=Math.max(1,Math.min(Number(maxHulls)||8,Math.ceil(triangleCount/targetPerHull),triangleCount));
            if(k===1)return[Array.from({length:triangleCount},(_,i)=>i)];
            const centers=new Array(triangleCount);
            for(let t=0;t<triangleCount;t++){
                const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
                centers[t]=new THREE.Vector3(
                    (p[a*3]+p[b*3]+p[c*3])/3,
                    (p[a*3+1]+p[b*3+1]+p[c*3+1])/3,
                    (p[a*3+2]+p[b*3+2]+p[c*3+2])/3
                );
            }
            const centroids=[];
            for(let i=0;i<k;i++)centroids.push(centers[Math.floor((i/(k-1||1))*(triangleCount-1))].clone());
            let assignments=new Int32Array(triangleCount);
            for(let iteration=0;iteration<iterations;iteration++){
                const sums=Array.from({length:k},()=>new THREE.Vector3());
                const counts=new Int32Array(k);
                for(let t=0;t<triangleCount;t++){
                    let best=0,bestDistance=Infinity;
                    for(let j=0;j<k;j++){
                        const distance=centers[t].distanceToSquared(centroids[j]);
                        if(distance<bestDistance){bestDistance=distance;best=j;}
                    }
                    assignments[t]=best;
                    sums[best].add(centers[t]);
                    counts[best]++;
                }
                for(let j=0;j<k;j++)if(counts[j]>0)centroids[j].copy(sums[j]).divideScalar(counts[j]);
            }
            const clusters=Array.from({length:k},()=>[]);
            for(let t=0;t<triangleCount;t++)clusters[assignments[t]].push(t);
            return clusters.filter(cluster=>cluster.length);
        }
        cookDecomposition(owner,config={},props={}){
            const data=this._build(owner,config);
            const A=this.physics?.ammo;
            if(!data||!A?.btCompoundShape||!A?.btConvexHullShape)return this.cookConvex(owner,config,props);
            data.targetTrianglesPerHull=Number(config.targetTrianglesPerHull)||128;
            const clusters=this._triangleClusters(data,Math.max(1,Number(config.maxHulls)||8),Math.max(2,Number(config.clusterIterations)||5));
            const compound=new A.btCompoundShape();
            const extras=[];
            const identity=new A.btTransform();
            identity.setIdentity();
            const temp=new A.btVector3(0,0,0);
            try{
                for(const cluster of clusters){
                    const hull=new A.btConvexHullShape();
                    const unique=new Set();
                    for(const triangle of cluster){
                        for(let corner=0;corner<3;corner++)unique.add(data.indices[triangle*3+corner]);
                    }
                    const vertices=Array.from(unique);
                    for(let i=0;i<vertices.length;i++){
                        const index=vertices[i];
                        temp.setValue(data.positions[index*3],data.positions[index*3+1],data.positions[index*3+2]);
                        hull.addPoint(temp,i===vertices.length-1);
                    }
                    hull.recalcLocalAabb?.();
                    this._margin(hull,config,data.radius);
                    compound.addChildShape(identity,hull);
                    extras.push(hull);
                }
            }finally{
                this._destroy(temp);
                this._destroy(identity);
            }
            const descriptor=this._descriptor(compound,extras,data,config);
            descriptor.authoringStats={mode:'decomposition',hulls:clusters.length,triangles:data.triangleCount,vertices:data.vertexCount};
            return descriptor;
        }
        _createPrimitivePart(part){
            const A=this.physics.ammo;
            const scale=new THREE.Vector3().fromArray(part.scale||[1,1,1]).set(Math.abs((part.scale||[1,1,1])[0]||1),Math.abs((part.scale||[1,1,1])[1]||1),Math.abs((part.scale||[1,1,1])[2]||1));
            const size=new THREE.Vector3().fromArray(part.size||[1,1,1]).multiply(scale);
            const type=String(part.type||'box').toLowerCase();
            if(type==='sphere')return new A.btSphereShape(Math.max(0.001,(Number(part.radius)||0.5)*Math.max(scale.x,scale.y,scale.z)));
            if(type==='capsule')return new A.btCapsuleShape(Math.max(0.001,(Number(part.radius)||0.5)*Math.max(scale.x,scale.z)),Math.max(0.001,(Number(part.height)||1)*scale.y));
            if(type==='cylinder'){
                const half=new A.btVector3(Math.max(0.001,size.x*0.5),Math.max(0.001,size.y*0.5),Math.max(0.001,size.z*0.5));
                const shape=new A.btCylinderShape(half);this._destroy(half);return shape;
            }
            const half=new A.btVector3(Math.max(0.001,size.x*0.5),Math.max(0.001,size.y*0.5),Math.max(0.001,size.z*0.5));
            const shape=new A.btBoxShape(half);this._destroy(half);return shape;
        }
        cookCompound(owner,config={},props={}){
            const A=this.physics?.ammo;
            if(!A?.btCompoundShape)return null;
            const compound=new A.btCompoundShape();
            const extras=[];
            const parts=Array.isArray(config.parts)?config.parts:[];
            for(const part of parts){
                if(part?.enabled===false)continue;
                let shape=null;
                if(part.type==='convex'&&Array.isArray(part.points)&&part.points.length>=4){
                    shape=new A.btConvexHullShape();
                    const temp=new A.btVector3(0,0,0);
                    try{
                        part.points.forEach((point,index)=>{
                            temp.setValue(Number(point[0])||0,Number(point[1])||0,Number(point[2])||0);
                            shape.addPoint(temp,index===part.points.length-1);
                        });
                    }finally{this._destroy(temp);}
                    shape.recalcLocalAabb?.();
                }else shape=this._createPrimitivePart(part);
                if(!shape)continue;
                this._margin(shape,config,1);
                const transform=new A.btTransform();
                transform.setIdentity();
                const position=part.position||[0,0,0];
                const quaternion=part.quaternion||[0,0,0,1];
                const origin=new A.btVector3(Number(position[0])||0,Number(position[1])||0,Number(position[2])||0);
                const rotation=new A.btQuaternion(Number(quaternion[0])||0,Number(quaternion[1])||0,Number(quaternion[2])||0,Number(quaternion[3])||1);
                transform.setOrigin(origin);transform.setRotation(rotation);
                compound.addChildShape(transform,shape);
                this._destroy(origin);this._destroy(rotation);this._destroy(transform);
                extras.push(shape);
            }
            if(!extras.length){this._destroy(compound);return null;}
            const bounds=this._build(owner,{...config,maxTriangles:100000});
            const descriptor=this._descriptor(compound,extras,bounds,config);
            descriptor.authoringStats={mode:'compound',parts:extras.length};
            return descriptor;
        }
        cookCustom(owner,config={},props={}){
            const source=config.sourceUuid?global.scene?.getObjectByProperty?.('uuid',config.sourceUuid):null;
            if(!source){console.warn('[ColliderAuthoring] Custom collider source was not found.');return null;}
            const customMode=String(config.customMode||'convex').toLowerCase();
            if(customMode==='exact'){
                const dynamic=Number(props.mass)>0&&!props.isKinematic;
                if(dynamic)return this.cookConvex(owner,config,props,source);
                const data=this._build(owner,config,source);
                const A=this.physics.ammo;
                if(!data||!A?.btTriangleMesh||!A?.btBvhTriangleMeshShape)return null;
                const triangleMesh=new A.btTriangleMesh(true,true);
                const a=new A.btVector3(0,0,0),b=new A.btVector3(0,0,0),c=new A.btVector3(0,0,0);
                const set=(target,index)=>target.setValue(data.positions[index*3],data.positions[index*3+1],data.positions[index*3+2]);
                try{for(let i=0;i<data.indices.length;i+=3){set(a,data.indices[i]);set(b,data.indices[i+1]);set(c,data.indices[i+2]);triangleMesh.addTriangle(a,b,c,true);}}finally{this._destroy(a);this._destroy(b);this._destroy(c);}
                const shape=new A.btBvhTriangleMeshShape(triangleMesh,true,true);
                return this._descriptor(shape,[triangleMesh],data,config);
            }
            return this.cookConvex(owner,config,props,source);
        }
    }
    global.SMCollisionCooker=SMCollisionCooker;
})(window);