(function(global){
    'use strict';
    class SMSoftBodyController{
        constructor(physics,eventBus){
            this.physics=physics;
            this.eventBus=eventBus;
            this.records=new Map();
        }
        create(mesh,options={}){
            if(!mesh?.isMesh)return null;
            const props={
                type:'soft',
                mass:Number(options.mass)||1,
                velocityIterations:Number(options.velocityIterations)||20,
                positionIterations:Number(options.positionIterations)||20,
                dynamicFriction:options.dynamicFriction??0.5,
                softDamping:options.softDamping??0.02,
                pressure:options.pressure??0,
                linearStiffness:options.linearStiffness??0.6,
                angularStiffness:options.angularStiffness??0.6,
                bendingDistance:options.bendingDistance??2,
                collisionMargin:options.collisionMargin??0.03,
                collisionGroup:options.collisionGroup??global.COL?.DEFAULT??1,
                collisionMask:options.collisionMask??global.COL?.ALL??-1
            };
            if(Array.isArray(options.pinnedVertices))this.setPinnedVertices(mesh,options.pinnedVertices,false);
            const body=this.physics.addBody(mesh,props);
            if(!body)return null;
            const record={mesh,body,props};
            this.records.set(mesh,record);
            this.eventBus?.emit?.('softbody:created',record);
            return record;
        }
        setPinnedVertices(mesh,indices=[],rebuild=true){
            const count=mesh?.geometry?.attributes?.position?.count||0;
            if(!count)return false;
            const values=new Float32Array(count*3);
            const pinned=new Set(indices.map(Number));
            for(let i=0;i<count;i++){
                const pin=pinned.has(i)?1:0;
                values[i*3]=pin;
                values[i*3+1]=1-pin;
                values[i*3+2]=0;
            }
            mesh.userData.physicsMap=new THREE.BufferAttribute(values,3);
            if(rebuild&&this.physics.meshToBodyMap?.has(mesh)){
                const props={...(mesh.userData.physics||{}),type:'soft'};
                this.physics.removeBody(mesh,{silent:true});
                const body=this.physics.addBody(mesh,props);
                const record=this.records.get(mesh);
                if(record)record.body=body;
            }
            return true;
        }
        remove(mesh){
            const record=this.records.get(mesh);
            if(!record)return false;
            this.physics.removeBody?.(mesh,{silent:true});
            this.records.delete(mesh);
            this.eventBus?.emit?.('softbody:removed',record);
            return true;
        }
        dispose(){
            for(const mesh of Array.from(this.records.keys()))this.remove(mesh);
        }
    }
    global.SMSoftBodyController=SMSoftBodyController;
})(window);
