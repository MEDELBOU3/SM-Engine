(function(){
    'use strict';
    class SMLevelStreamingVolume{
        constructor(options={}){
            this.id=String(options.id||`stream-volume-${Date.now()}-${Math.random().toString(36).slice(2,7)}`);
            this.name=String(options.name||this.id);
            this.levelIds=Array.isArray(options.levelIds)?options.levelIds.map(String):options.levelId?[String(options.levelId)]:[];
            this.shape=String(options.shape||'box').toLowerCase();
            this.center=this._vector(options.center,[0,0,0]);
            this.size=this._vector(options.size,[10,10,10]);
            this.radius=Math.max(0,Number(options.radius??5));
            this.enabled=options.enabled!==false;
            this.unloadOnExit=options.unloadOnExit!==false;
            this.priority=Number(options.priority??0);
            this.targetTags=window.SMGameplayTags?.toArray?.(options.targetTags||['player'])||['player'];
            this.metadata={...(options.metadata||{})};
            this.object=options.object||null;
            this.inside=new Set();
            this._lastState=new Map();
        }
        setObject(object){
            this.object=object||null;
            return this.object;
        }
        addLevel(levelOrId){
            const id=String(levelOrId?.id||levelOrId||'');
            if(id&&!this.levelIds.includes(id))this.levelIds.push(id);
            return this;
        }
        removeLevel(levelOrId){
            const id=String(levelOrId?.id||levelOrId||'');
            this.levelIds=this.levelIds.filter(value=>value!==id);
            return this;
        }
        contains(target){
            if(!this.enabled)return false;
            const position=this._position(target);
            if(!position)return false;
            const center=this.getWorldCenter();
            if(this.shape==='sphere'){
                const dx=position[0]-center[0];
                const dy=position[1]-center[1];
                const dz=position[2]-center[2];
                return dx*dx+dy*dy+dz*dz<=this.radius*this.radius;
            }
            const half=[Math.abs(this.size[0])*0.5,Math.abs(this.size[1])*0.5,Math.abs(this.size[2])*0.5];
            return Math.abs(position[0]-center[0])<=half[0]&&Math.abs(position[1]-center[1])<=half[1]&&Math.abs(position[2]-center[2])<=half[2];
        }
        evaluate(target){
            const key=this._targetKey(target);
            const previous=this._lastState.get(key)===true;
            const current=this.contains(target);
            this._lastState.set(key,current);
            if(current)this.inside.add(key);
            else this.inside.delete(key);
            return{inside:current,entered:current&&!previous,exited:!current&&previous,key,target,volume:this};
        }
        matchesTarget(target){
            if(!this.targetTags.length)return true;
            const object=target?.object||target;
            if(!object)return false;
            if(window.SMGameplayTags?.any&&window.SMGameplayTags.any(object,this.targetTags))return true;
            const tags=Array.isArray(object.userData?.tags)?object.userData.tags.map(tag=>String(tag).toLowerCase()):[];
            const runtimeType=String(object.userData?.runtimeType||'').toLowerCase();
            if(this.targetTags.some(tag=>tag==='actor.player')&&(runtimeType==='player'||tags.includes('player')))return true;
            return this.targetTags.some(tag=>tags.includes(String(tag).toLowerCase()));
        }
        getWorldCenter(){
            if(this.object?.localToWorld&&window.THREE?.Vector3){
                const value=new THREE.Vector3(this.center[0],this.center[1],this.center[2]);
                this.object.localToWorld(value);
                return[value.x,value.y,value.z];
            }
            if(this.object?.getWorldPosition&&window.THREE?.Vector3){
                const value=this.object.getWorldPosition(new THREE.Vector3());
                return[value.x+this.center[0],value.y+this.center[1],value.z+this.center[2]];
            }
            return[...this.center];
        }
        reset(){
            this.inside.clear();
            this._lastState.clear();
            return this;
        }
        serialize(){
            return{id:this.id,name:this.name,levelIds:[...this.levelIds],shape:this.shape,center:[...this.center],size:[...this.size],radius:this.radius,enabled:this.enabled,unloadOnExit:this.unloadOnExit,priority:this.priority,targetTags:[...this.targetTags],metadata:{...this.metadata},objectUUID:this.object?.uuid||null};
        }
        _position(target){
            const object=target?.object||target;
            if(!object)return null;
            if(object.getWorldPosition&&window.THREE?.Vector3){
                const value=object.getWorldPosition(new THREE.Vector3());
                return[value.x,value.y,value.z];
            }
            if(Array.isArray(object))return this._vector(object,[0,0,0]);
            if(object.position)return[Number(object.position.x||0),Number(object.position.y||0),Number(object.position.z||0)];
            if(typeof object==='object'&&('x'in object||'y'in object||'z'in object))return[Number(object.x||0),Number(object.y||0),Number(object.z||0)];
            return null;
        }
        _targetKey(target){
            return String(target?.id||target?.object?.uuid||target?.uuid||target?.name||'stream-target');
        }
        _vector(value,fallback=[0,0,0]){
            if(Array.isArray(value))return[Number(value[0]??fallback[0]),Number(value[1]??fallback[1]),Number(value[2]??fallback[2])];
            if(value&&typeof value==='object')return[Number(value.x??fallback[0]),Number(value.y??fallback[1]),Number(value.z??fallback[2])];
            return[...fallback];
        }
        debug(){
            const state={id:this.id,name:this.name,shape:this.shape,levelIds:[...this.levelIds],enabled:this.enabled,unloadOnExit:this.unloadOnExit,priority:this.priority,inside:this.inside.size,center:this.getWorldCenter(),size:[...this.size],radius:this.radius};
            console.log('[SMLevelStreamingVolume]',state);
            return state;
        }
    }
    window.SMLevelStreamingVolume=SMLevelStreamingVolume;
    window.SMLevelStreamingVolumeClass=SMLevelStreamingVolume;
})();