(function(){
    'use strict';
    class SMSpawnPointComponent extends window.SMBehaviour{
        constructor(options={}){
            super({...options,type:options.type||'SpawnPoint'});
            this.spawnType=String(options.spawnType||'generic').toLowerCase();
            this.spawnTag=String(options.spawnTag||'').toLowerCase();
            this.priority=Number(options.priority??0);
            this.active=options.active!==false;
            this.oneShot=options.oneShot===true;
            this.used=false;
            this.radius=Math.max(0,Number(options.radius??0));
            this._previousRuntimeType=null;
        }
        onAttach(){
            if(!this.owner.userData)this.owner.userData={};
            this._previousRuntimeType=this.owner.userData.runtimeType;
            if(!this.owner.userData.runtimeType||this.owner.userData.runtimeType==='object')this.owner.userData.runtimeType=this.spawnType==='player'?'player-start':'spawn-point';
            const tags=Array.isArray(this.owner.userData.tags)?this.owner.userData.tags.slice():[];
            if(!tags.includes('spawn-point'))tags.push('spawn-point');
            if(this.spawnType&&this.spawnType!=='generic'&&!tags.includes(`${this.spawnType}-spawn`))tags.push(`${this.spawnType}-spawn`);
            if(this.spawnTag&&!tags.includes(this.spawnTag))tags.push(this.spawnTag);
            this.owner.userData.tags=tags;
        }
        canSpawn(context={}){
            if(!this.active)return false;
            if(this.oneShot&&this.used)return false;
            if(context.spawnType&&String(context.spawnType).toLowerCase()!==this.spawnType&&this.spawnType!=='generic')return false;
            return true;
        }
        markUsed(context={}){
            this.used=true;
            this.emit('spawn-point-used',{spawnPoint:this,owner:this.owner,context});
            return this;
        }
        reset(){
            this.used=false;
            return this;
        }
        getTransform(){
            const object=this.owner;
            if(!object)return null;
            const position=object.getWorldPosition&&window.THREE?.Vector3?object.getWorldPosition(new THREE.Vector3()).toArray():object.position?.toArray?.()||[0,0,0];
            const quaternion=object.getWorldQuaternion&&window.THREE?.Quaternion?object.getWorldQuaternion(new THREE.Quaternion()).toArray():object.quaternion?.toArray?.()||[0,0,0,1];
            const scale=object.getWorldScale&&window.THREE?.Vector3?object.getWorldScale(new THREE.Vector3()).toArray():object.scale?.toArray?.()||[1,1,1];
            return{position,quaternion,scale};
        }
        async spawn(source,options={}){
            if(!this.canSpawn(options))return null;
            const transform=this.getTransform()||{};
            const object=await this.world?.spawn?.(source,{...transform,...options});
            if(object)this.markUsed({source,options,object});
            return object;
        }
        serializeState(){
            return{...super.serializeState(),spawnType:this.spawnType,spawnTag:this.spawnTag,priority:this.priority,active:this.active,oneShot:this.oneShot,radius:this.radius};
        }
        deserializeState(data={}){
            super.deserializeState(data);
            if(data.spawnType!==undefined)this.spawnType=String(data.spawnType||'generic').toLowerCase();
            if(data.spawnTag!==undefined)this.spawnTag=String(data.spawnTag||'').toLowerCase();
            if(data.priority!==undefined)this.priority=Number(data.priority)||0;
            if(data.active!==undefined)this.active=Boolean(data.active);
            if(data.oneShot!==undefined)this.oneShot=Boolean(data.oneShot);
            if(data.radius!==undefined)this.radius=Math.max(0,Number(data.radius)||0);
            return this;
        }
    }
    SMSpawnPointComponent.componentType='SpawnPoint';
    SMSpawnPointComponent.executionOrder=-80;
    const register=()=>{
        if(!window.SMComponentRegistry?.register)return false;
        if(!window.SMComponentRegistry.has('SpawnPoint'))window.SMComponentRegistry.register('SpawnPoint',SMSpawnPointComponent,{category:'Gameplay',displayName:'Spawn Point',allowMultiple:false,aliases:['SMSpawnPointComponent'],executionOrder:-80});
        return true;
    };
    register();
    queueMicrotask(register);
    window.addEventListener('sm:runtime-ready',register,{once:true});
    window.SMSpawnPointComponent=SMSpawnPointComponent;
    window.SMSpawnPointComponentClass=SMSpawnPointComponent;
})();