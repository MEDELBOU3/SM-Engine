(function(global){
    'use strict';
    class SMDestructionSystem{
        constructor(physics,contacts,eventBus){
            this.physics=physics;
            this.contacts=contacts;
            this.eventBus=eventBus;
            this.breakables=new Map();
            this._disposeContact=contacts?.onAny?.((event)=>this._onContact(event))||null;
            this._center=new THREE.Vector3();
            this._piecePos=new THREE.Vector3();
        }
        register(root,options={}){
            if(!root)return null;
            const pieces=[];
            root.traverse((object)=>{
                if(object!==root&&object.isMesh&&object.userData?.destructionIgnore!==true)pieces.push(object);
            });
            const record={
                root,
                pieces,
                health:Number(options.health)||100,
                threshold:Number(options.impactThreshold)||8,
                fractured:false,
                mass:Number(options.totalMass)||Math.max(1,pieces.length*0.5),
                material:options.material||'CONCRETE',
                impulseScale:Number(options.impulseScale)||1,
                radialImpulse:Number(options.radialImpulse)||2,
                metadata:{...(options.metadata||{})}
            };
            root.userData.breakable=true;
            this.breakables.set(root,record);
            return record;
        }
        damage(root,amount,context={}){
            const record=this.breakables.get(root);
            if(!record||record.fractured)return false;
            record.health-=Math.max(0,Number(amount)||0);
            this.eventBus?.emit?.('destruction:damage',{record,amount,context});
            if(record.health<=0)this.fracture(root,context);
            return true;
        }
        fracture(root,context={}){
            const record=this.breakables.get(root);
            if(!record||record.fractured)return false;
            record.fractured=true;
            root.getWorldPosition(this._center);
            const pieceMass=record.mass/Math.max(1,record.pieces.length);
            for(const piece of record.pieces){
                piece.updateWorldMatrix(true,false);
                piece.getWorldPosition(this._piecePos);
                const parent=piece.parent;
                const worldPosition=this._piecePos.clone();
                const worldQuaternion=piece.getWorldQuaternion(new THREE.Quaternion());
                global.scene?.attach?.(piece);
                piece.position.copy(worldPosition);
                piece.quaternion.copy(worldQuaternion);
                const body=this.physics.addBody(piece,{
                    mass:pieceMass,
                    shapeType:piece.userData?.physicsShape||'convex',
                    material:record.material,
                    flags:{enableGravity:true,ccd:true,noSleep:false,windAffected:true}
                });
                if(!body)continue;
                const direction=worldPosition.clone().sub(this._center);
                if(direction.lengthSq()<0.0001)direction.set(Math.random()-0.5,Math.random()+0.2,Math.random()-0.5);
                direction.normalize();
                const strength=(Number(context.impulse)||record.radialImpulse)*record.impulseScale;
                const A=this.physics.ammo;
                const impulse=new A.btVector3(direction.x*strength,direction.y*strength,direction.z*strength);
                try{body.applyCentralImpulse?.(impulse);body.activate?.(true);}finally{this.physics._destroy?.(impulse);}
            }
            this.eventBus?.emit?.('destruction:fracture',{record,context});
            return true;
        }
        _findBreakable(object){
            let current=object;
            while(current){
                if(this.breakables.has(current))return this.breakables.get(current);
                current=current.parent;
            }
            return null;
        }
        _onContact(event){
            if(event.type!=='enter')return;
            const impulse=Number(event.impulse)||0;
            const records=[this._findBreakable(event.meshA),this._findBreakable(event.meshB)].filter(Boolean);
            for(const record of records){
                if(record.fractured||impulse<record.threshold)continue;
                this.damage(record.root,impulse,{contact:event,impulse});
            }
        }
        dispose(){
            this._disposeContact?.();
            this.breakables.clear();
        }
    }
    global.SMDestructionSystem=SMDestructionSystem;
})(window);
