(function(){
    'use strict';
    class SMNavigationAgent{
        constructor(owner,options={}){
            this.owner=owner?.object||owner||null;
            this.speed=Math.max(0,Number(options.speed??3.5));
            this.acceleration=Math.max(0,Number(options.acceleration??12));
            this.stoppingDistance=Math.max(0,Number(options.stoppingDistance??0.35));
            this.turnSpeed=Math.max(0,Number(options.turnSpeed??10));
            this.enabled=options.enabled!==false;
            this.autoRotate=options.autoRotate!==false;
            this.fallbackMode=String(options.fallbackMode||'transform');
            this.destination=null;
            this.velocity={x:0,y:0,z:0};
            this.path=[];
            this.pathIndex=0;
            this.arrived=true;
            this.backend=options.backend||null;
            this.character=options.character||null;
        }
        setOwner(owner){
            this.owner=owner?.object||owner||null;
            return this.owner;
        }
        setDestination(destination){
            const value=this._toVector(destination);
            if(!value)return false;
            this.destination=value;
            this.arrived=false;
            this.path=[];
            this.pathIndex=0;
            const backend=this._resolveBackend();
            try{
                const result=backend?.setDestination?.(this,value);
                if(Array.isArray(result))this.setPath(result);
            }catch(error){console.warn('[SMNavigationAgent] Backend setDestination failed.',error);}
            return true;
        }
        setPath(points=[]){
            this.path=points.map(point=>this._toVector(point)).filter(Boolean);
            this.pathIndex=0;
            this.destination=this.path[this.path.length-1]||this.destination;
            this.arrived=!this.destination;
            return this.path;
        }
        stop(){
            this.destination=null;
            this.path=[];
            this.pathIndex=0;
            this.velocity={x:0,y:0,z:0};
            this.arrived=true;
            this._resolveBackend()?.stopAgent?.(this);
            return true;
        }
        hasDestination(){
            return Boolean(this.destination)&&!this.arrived;
        }
        hasArrived(){
            return this.arrived;
        }
        distanceToDestination(){
            if(!this.owner||!this.destination)return Infinity;
            const position=this._worldPosition();
            return Math.hypot(this.destination.x-position.x,this.destination.y-position.y,this.destination.z-position.z);
        }
        update(delta){
            if(!this.enabled||!this.owner||!this.destination||this.arrived)return false;
            const dt=Math.max(0,Number(delta)||0);
            const backend=this._resolveBackend();
            if(backend?.updateAgent){
                try{
                    const result=backend.updateAgent(this,dt);
                    if(result!==undefined)return result;
                }catch(error){console.warn('[SMNavigationAgent] Backend update failed.',error);}
            }
            return this._fallbackUpdate(dt);
        }
        teleport(position){
            const value=this._toVector(position);
            if(!value||!this.owner?.position)return false;
            this.owner.position.set?.(value.x,value.y,value.z);
            this.owner.updateMatrixWorld?.(true);
            this._resolveBackend()?.teleportAgent?.(this,value);
            return true;
        }
        _fallbackUpdate(dt){
            const target=this.path[this.pathIndex]||this.destination;
            if(!target)return false;
            const position=this._worldPosition();
            const dx=target.x-position.x;
            const dy=target.y-position.y;
            const dz=target.z-position.z;
            const distance=Math.hypot(dx,dy,dz);
            if(distance<=this.stoppingDistance){
                if(this.path.length&&this.pathIndex<this.path.length-1){
                    this.pathIndex+=1;
                    return true;
                }
                this.arrived=true;
                this.velocity={x:0,y:0,z:0};
                window.SMRuntimeEventBus?.emit?.('ai:navigation-arrived',{agent:this,owner:this.owner,destination:this.destination});
                return true;
            }
            const inv=distance>1e-6?1/distance:0;
            const desired={x:dx*inv*this.speed,y:dy*inv*this.speed,z:dz*inv*this.speed};
            const blend=Math.min(1,this.acceleration*dt/Math.max(this.speed,0.0001));
            this.velocity.x+=(desired.x-this.velocity.x)*blend;
            this.velocity.y+=(desired.y-this.velocity.y)*blend;
            this.velocity.z+=(desired.z-this.velocity.z)*blend;
            const character=this.character||this.owner.getComponent?.('Character')||this.owner.components?.get?.('Character')||null;
            if(character?.adapter?.setDesiredVelocity){
                character.adapter.setDesiredVelocity(this.velocity);
            }else if(character?.adapter?.moveTo){
                character.adapter.moveTo(target,this.speed);
            }else if(this.fallbackMode==='transform'){
                const step=Math.min(distance,this.speed*dt);
                this.owner.position.x+=dx*inv*step;
                this.owner.position.y+=dy*inv*step;
                this.owner.position.z+=dz*inv*step;
                if(this.autoRotate&&window.THREE&&Math.hypot(dx,dz)>1e-5){
                    const targetYaw=Math.atan2(dx,dz);
                    const current=this.owner.rotation?.y||0;
                    let diff=((targetYaw-current+Math.PI)%(Math.PI*2))-Math.PI;
                    if(diff<-Math.PI)diff+=Math.PI*2;
                    this.owner.rotation.y=current+diff*Math.min(1,this.turnSpeed*dt);
                }
                this.owner.updateMatrixWorld?.(true);
            }
            return true;
        }
        _resolveBackend(){
            if(this.backend)return this.backend;
            const candidates=[window.smNavigationSystem,window.SMNavigationSystem,window.navMeshSystem,window.navigationSystem];
            for(const candidate of candidates)if(candidate&&typeof candidate==='object'){this.backend=candidate;break;}
            return this.backend;
        }
        _worldPosition(){
            if(this.owner?.getWorldPosition&&window.THREE?.Vector3){
                const value=this.owner.getWorldPosition(new THREE.Vector3());
                return{x:value.x,y:value.y,z:value.z};
            }
            return{x:Number(this.owner?.position?.x||0),y:Number(this.owner?.position?.y||0),z:Number(this.owner?.position?.z||0)};
        }
        _toVector(value){
            if(!value)return null;
            if(value.isObject3D){
                if(value.getWorldPosition&&window.THREE?.Vector3){
                    const point=value.getWorldPosition(new THREE.Vector3());
                    return{x:point.x,y:point.y,z:point.z};
                }
                value=value.position;
            }
            if(Array.isArray(value))return{x:Number(value[0]||0),y:Number(value[1]||0),z:Number(value[2]||0)};
            if(typeof value==='object')return{x:Number(value.x||0),y:Number(value.y||0),z:Number(value.z||0)};
            return null;
        }
        serialize(){
            return{speed:this.speed,acceleration:this.acceleration,stoppingDistance:this.stoppingDistance,turnSpeed:this.turnSpeed,enabled:this.enabled,autoRotate:this.autoRotate,fallbackMode:this.fallbackMode};
        }
        debug(){
            const state={owner:this.owner?.name||this.owner?.uuid||null,enabled:this.enabled,speed:this.speed,destination:this.destination,arrived:this.arrived,pathPoints:this.path.length,pathIndex:this.pathIndex,backend:this.backend?.constructor?.name||null,fallbackMode:this.fallbackMode};
            console.log('[SMNavigationAgent]',state);
            return state;
        }
    }
    window.SMNavigationAgent=SMNavigationAgent;
    window.SMNavigationAgentClass=SMNavigationAgent;
})();