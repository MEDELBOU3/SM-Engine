(function(){
    'use strict';
    class SMRuntimeSpawner{
        constructor(world){
            this.world=world;
            this.factories=new Map();
            this.resolvers=[];
            this.spawned=new Set();
            this._sequence=0;
        }
        registerFactory(type,factory){
            if(!type||typeof factory!=='function')throw new TypeError('registerFactory(type, factory) requires a function.');
            const key=String(type).toLowerCase();
            this.factories.set(key,factory);
            return()=>this.factories.delete(key);
        }
        registerResolver(resolver){
            if(typeof resolver!=='function')throw new TypeError('registerResolver(resolver) requires a function.');
            this.resolvers.push(resolver);
            return()=>{
                const index=this.resolvers.indexOf(resolver);
                if(index>=0)this.resolvers.splice(index,1);
            };
        }
        async spawn(source,options={}){
            if(!this.world?.scene)throw new Error('Cannot spawn without an active Runtime World scene.');
            const object=await this._createObject(source,options);
            if(!object||typeof object!=='object')throw new Error('Spawner source did not produce an object.');
            if(options.name!==undefined)object.name=String(options.name);
            this._applyTransform(object,options);
            const parent=this._resolveParent(options.parent);
            if(parent?.add&&object.parent!==parent)parent.add(object);
            const type=String(options.type||object.userData?.runtimeType||this._inferTypeFromSource(source)||'object').toLowerCase();
            const tags=options.tags!==undefined?options.tags:object.userData?.tags;
            const record=this.world.registry.register(object,{id:options.id||undefined,type,tags,runtimeOwned:options.runtimeOwned!==false,spawned:true,metadata:{sourceType:typeof source,spawnSequence:++this._sequence,...(options.metadata||{})}});
            const entry={object,record,disposeOnDestroy:options.disposeOnDestroy===true,createdAt:Date.now()};
            this.spawned.add(entry);
            window.SMRuntime?.trackRuntimeObject?.(object);
            window.SMRuntimeEventBus?.emit?.('world:spawned',{world:this.world,spawner:this,object,record,options});
            return object;
        }
        async spawnAt(source,target,options={}){
            const transform=this._extractTransform(target);
            return await this.spawn(source,{...options,...transform});
        }
        async spawnAtTag(source,tag,options={}){
            const target=this.world.registry.findFirstByTag(tag);
            if(!target)throw new Error(`No runtime object found with tag "${tag}".`);
            return await this.spawnAt(source,target,options);
        }
        async spawnAtType(source,type,options={}){
            const target=this.world.registry.findFirstByType(type);
            if(!target)throw new Error(`No runtime object found with type "${type}".`);
            return await this.spawnAt(source,target,options);
        }
        destroy(object,options={}){
            if(!object)return false;
            let entry=null;
            for(const candidate of this.spawned)if(candidate.object===object){entry=candidate;break;}
            this.world.registry.unregister(object);
            if(object.parent)object.parent.remove(object);
            const shouldDispose=options.dispose===true||(entry?.disposeOnDestroy===true&&options.dispose!==false);
            if(shouldDispose)this._disposeObject(object);
            if(entry)this.spawned.delete(entry);
            window.SMRuntimeEventBus?.emit?.('world:destroyed',{world:this.world,spawner:this,object});
            return true;
        }
        async respawn(object,options={}){
            const record=this.world.registry.getRecord(object);
            const source=options.source||record?.metadata?.source||object;
            const transform=this._extractTransform(options.transformSource||object);
            this.destroy(object,{dispose:options.disposeOld===true});
            return await this.spawn(source,{...options,...transform});
        }
        destroyAll(options={}){
            const entries=Array.from(this.spawned);
            for(const entry of entries)this.destroy(entry.object,{dispose:options.dispose===true});
            return entries.length;
        }
        getSpawned(){
            return Array.from(this.spawned).map(entry=>entry.object);
        }
        async _createObject(source,options){
            if(typeof source==='function'){
                const result=await source({world:this.world,spawner:this,options});
                return this._unwrapObject(result);
            }
            if(typeof source==='string'){
                const key=source.toLowerCase();
                if(this.factories.has(key)){
                    const result=await this.factories.get(key)({world:this.world,spawner:this,options,type:key});
                    return this._unwrapObject(result);
                }
                for(const resolver of this.resolvers){
                    const result=await resolver(source,{world:this.world,spawner:this,options});
                    if(result)return this._unwrapObject(result);
                }
                throw new Error(`No runtime spawn factory or resolver found for "${source}".`);
            }
            if(source&&typeof source.createInstance==='function'){
                return this._unwrapObject(await source.createInstance({world:this.world,options}));
            }
            if(source&&typeof source.instantiate==='function'){
                return this._unwrapObject(await source.instantiate({world:this.world,options}));
            }
            if(source?.object&&options.useObjectDirectly===true)return source.object;
            if(source?.clone&&typeof source.clone==='function')return source.clone(options.deepClone!==false);
            if(source&&typeof source==='object'&&options.useObjectDirectly===true)return source;
            throw new Error('Unsupported runtime spawn source.');
        }
        _unwrapObject(value){
            if(value?.object&&typeof value.object==='object')return value.object;
            return value;
        }
        _applyTransform(object,options){
            if(options.position!==undefined)this._setVector(object.position,options.position);
            if(options.scale!==undefined)this._setVector(object.scale,options.scale);
            if(options.quaternion!==undefined&&object.quaternion)this._setQuaternion(object.quaternion,options.quaternion);
            else if(options.rotation!==undefined&&object.rotation)this._setEuler(object.rotation,options.rotation);
            if(options.matrix&&object.matrix?.copy){
                object.matrix.copy(options.matrix);
                object.matrix.decompose?.(object.position,object.quaternion,object.scale);
            }
            object.updateMatrix?.();
            object.updateMatrixWorld?.(true);
        }
        _resolveParent(parent){
            if(!parent)return this.world.scene;
            if(typeof parent==='string')return this.world.registry.get(parent)||this.world.scene.getObjectByName?.(parent)||this.world.scene;
            return parent;
        }
        _extractTransform(target){
            if(!target)return{};
            const object=target.object||target;
            const position=object.getWorldPosition&&window.THREE?.Vector3?object.getWorldPosition(new THREE.Vector3()).toArray():object.position?.toArray?.();
            const quaternion=object.getWorldQuaternion&&window.THREE?.Quaternion?object.getWorldQuaternion(new THREE.Quaternion()).toArray():object.quaternion?.toArray?.();
            const scale=object.getWorldScale&&window.THREE?.Vector3?object.getWorldScale(new THREE.Vector3()).toArray():object.scale?.toArray?.();
            return{position,quaternion,scale};
        }
        _setVector(target,value){
            if(!target)return;
            if(Array.isArray(value))target.set?.(Number(value[0]||0),Number(value[1]||0),Number(value[2]||0));
            else if(value&&typeof value==='object')target.set?.(Number(value.x||0),Number(value.y||0),Number(value.z||0));
        }
        _setQuaternion(target,value){
            if(Array.isArray(value))target.set?.(Number(value[0]||0),Number(value[1]||0),Number(value[2]||0),Number(value[3]??1));
            else if(value&&typeof value==='object')target.set?.(Number(value.x||0),Number(value.y||0),Number(value.z||0),Number(value.w??1));
        }
        _setEuler(target,value){
            if(Array.isArray(value))target.set?.(Number(value[0]||0),Number(value[1]||0),Number(value[2]||0),value[3]||target.order);
            else if(value&&typeof value==='object')target.set?.(Number(value.x||0),Number(value.y||0),Number(value.z||0),value.order||target.order);
        }
        _inferTypeFromSource(source){
            if(typeof source==='string')return source;
            return source?.userData?.runtimeType||source?.userData?.type||'object';
        }
        _disposeObject(object){
            object.traverse?.(child=>{
                child.geometry?.dispose?.();
                const materials=Array.isArray(child.material)?child.material:child.material?[child.material]:[];
                for(const material of materials){
                    for(const value of Object.values(material||{}))if(value?.isTexture&&value.userData?.runtimeOwned===true)value.dispose?.();
                    material?.dispose?.();
                }
            });
        }
        debug(){
            const state={spawned:this.spawned.size,factories:Array.from(this.factories.keys()),resolvers:this.resolvers.length};
            console.log('[SMRuntimeSpawner]',state);
            return state;
        }
    }
    window.SMRuntimeSpawner=SMRuntimeSpawner;
    window.SMRuntimeSpawnerClass=SMRuntimeSpawner;
})();