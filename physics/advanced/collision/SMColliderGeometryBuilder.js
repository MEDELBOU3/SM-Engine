(function(global){
    'use strict';
    class SMColliderGeometryBuilder{
        constructor(){
            this._bodyPosition=new THREE.Vector3();
            this._bodyQuaternion=new THREE.Quaternion();
            this._bodyMatrix=new THREE.Matrix4();
            this._inverseBodyMatrix=new THREE.Matrix4();
            this._localMatrix=new THREE.Matrix4();
            this._point=new THREE.Vector3();
        }
        _prepareBodySpace(owner){
            owner.updateWorldMatrix?.(true,true);
            owner.getWorldPosition(this._bodyPosition);
            owner.getWorldQuaternion(this._bodyQuaternion);
            this._bodyMatrix.compose(this._bodyPosition,this._bodyQuaternion,new THREE.Vector3(1,1,1));
            this._inverseBodyMatrix.copy(this._bodyMatrix).invert();
        }
        build(owner,options={}){
            if(!owner?.isObject3D)return null;
            const source=options.source||owner;
            const weld=options.weld!==false;
            const tolerance=Math.max(1e-7,Number(options.weldTolerance)||1e-5);
            const maxTriangles=Math.max(1,Number(options.maxTriangles)||250000);
            this._prepareBodySpace(owner);
            source.updateWorldMatrix?.(true,true);
            const positions=[];
            const indices=[];
            const vertexMap=new Map();
            let triangleCount=0;
            let sourceMeshes=0;
            let truncated=false;
            const addVertex=(mesh,index)=>{
                const attribute=mesh.geometry.attributes.position;
                this._point.set(attribute.getX(index),attribute.getY(index),attribute.getZ(index));
                this._localMatrix.multiplyMatrices(this._inverseBodyMatrix,mesh.matrixWorld);
                this._point.applyMatrix4(this._localMatrix);
                if(!weld){
                    const next=positions.length/3;
                    positions.push(this._point.x,this._point.y,this._point.z);
                    return next;
                }
                const qx=Math.round(this._point.x/tolerance);
                const qy=Math.round(this._point.y/tolerance);
                const qz=Math.round(this._point.z/tolerance);
                const key=`${qx}:${qy}:${qz}`;
                if(vertexMap.has(key))return vertexMap.get(key);
                const next=positions.length/3;
                positions.push(this._point.x,this._point.y,this._point.z);
                vertexMap.set(key,next);
                return next;
            };
            const processMesh=(mesh)=>{
                if(truncated||!mesh?.isMesh||!mesh.geometry?.attributes?.position)return;
                if(mesh.userData?.excludeFromCollision===true||mesh.userData?.isSystemObject===true)return;
                sourceMeshes++;
                const geometry=mesh.geometry;
                const index=geometry.index;
                const triangleTotal=index?Math.floor(index.count/3):Math.floor(geometry.attributes.position.count/3);
                for(let triangle=0;triangle<triangleTotal;triangle++){
                    if(triangleCount>=maxTriangles){truncated=true;break;}
                    const base=triangle*3;
                    const ia=index?index.getX(base):base;
                    const ib=index?index.getX(base+1):base+1;
                    const ic=index?index.getX(base+2):base+2;
                    indices.push(addVertex(mesh,ia),addVertex(mesh,ib),addVertex(mesh,ic));
                    triangleCount++;
                }
            };
            if(source.isMesh)processMesh(source);
            else source.traverse?.(processMesh);
            if(!positions.length||!indices.length)return null;
            const bounds=new THREE.Box3();
            const point=new THREE.Vector3();
            for(let i=0;i<positions.length;i+=3){
                point.set(positions[i],positions[i+1],positions[i+2]);
                bounds.expandByPoint(point);
            }
            const size=bounds.getSize(new THREE.Vector3());
            const center=bounds.getCenter(new THREE.Vector3());
            const radius=Math.max(0.001,size.length()*0.5);
            return{
                positions:new Float32Array(positions),
                indices:new Uint32Array(indices),
                bounds,
                size,
                center,
                radius,
                triangleCount,
                vertexCount:positions.length/3,
                sourceMeshes,
                truncated
            };
        }
        buildLineGeometry(data){
            if(!data?.positions||!data?.indices)return null;
            const line=[];
            const p=data.positions;
            const idx=data.indices;
            const pushEdge=(a,b)=>{
                line.push(p[a*3],p[a*3+1],p[a*3+2],p[b*3],p[b*3+1],p[b*3+2]);
            };
            for(let i=0;i<idx.length;i+=3){
                pushEdge(idx[i],idx[i+1]);
                pushEdge(idx[i+1],idx[i+2]);
                pushEdge(idx[i+2],idx[i]);
            }
            const geometry=new THREE.BufferGeometry();
            geometry.setAttribute('position',new THREE.Float32BufferAttribute(line,3));
            return geometry;
        }
    }
    global.SMColliderGeometryBuilder=SMColliderGeometryBuilder;
})(window);