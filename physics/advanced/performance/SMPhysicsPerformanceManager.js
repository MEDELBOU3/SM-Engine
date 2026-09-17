(function(global){
    'use strict';
    class SMPhysicsPerformanceManager{
        constructor(physics,options={}){
            this.physics=physics;
            this.enabled=options.enabled!==false;
            this.sleepDistance=Number(options.sleepDistance)||120;
            this.wakeDistance=Number(options.wakeDistance)||90;
            this.scanInterval=Math.max(0.1,Number(options.scanInterval)||0.5);
            this.accumulator=0;
            this.camera=options.camera||null;
            this.stats={dynamic:0,sleeping:0,active:0,culledByDistance:0};
            this._position=new THREE.Vector3();
            this._cameraPosition=new THREE.Vector3();
        }
        update(delta){
            if(!this.enabled)return;
            this.accumulator+=Number(delta)||0;
            if(this.accumulator<this.scanInterval)return;
            this.accumulator=0;
            const camera=this.camera||global.camera||global._gameRenderCamera;
            if(!camera)return;
            camera.getWorldPosition(this._cameraPosition);
            const stats={dynamic:0,sleeping:0,active:0,culledByDistance:0};
            for(const [mesh,body] of this.physics?.meshToBodyMap||[]){
                if(!global.SMPhysicsMath.isDynamic(mesh))continue;
                stats.dynamic++;
                mesh.getWorldPosition(this._position);
                const distance=this._position.distanceTo(this._cameraPosition);
                const active=body.isActive?.()??true;
                if(distance>this.sleepDistance&&active){
                    body.setActivationState?.(this.physics.ammo?.ISLAND_SLEEPING??2);
                    stats.culledByDistance++;
                }else if(distance<this.wakeDistance&&!active){
                    body.activate?.(true);
                }
                if(body.isActive?.()??true)stats.active++;
                else stats.sleeping++;
            }
            this.stats=stats;
        }
        getStats(){
            return{...this.stats};
        }
    }
    global.SMPhysicsPerformanceManager=SMPhysicsPerformanceManager;
})(window);
