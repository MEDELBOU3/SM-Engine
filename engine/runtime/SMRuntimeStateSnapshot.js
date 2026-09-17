(function(){
    'use strict';class SMRuntimeStateSnapshot{
        constructor(scene,options={
        }){
            this.scene=scene||window.scene||null;this.options={
                captureUserData:options.captureUserData!==false,captureVisibility:options.captureVisibility!==false,captureLayers:options.captureLayers!==false,captureSelection:options.captureSelection!==false,captureCamera:options.captureCamera!==false,captureControls:options.captureControls!==false
            };this.createdAt=Date.now();this.objectStates=new Map();this.objectRefs=new Map();this.originalUUIDs=new Set();this.sceneState=null;this.selectionState=null;this.cameraState=null;this.controlsState=null;this.captured=false;
        }
        capture(){
            if(!this.scene?.traverse)throw new Error('SMRuntimeStateSnapshot requires a valid THREE.Scene.');this.objectStates.clear();this.objectRefs.clear();this.originalUUIDs.clear();this.sceneState=this._captureSceneState(this.scene);this.scene.traverse(object=>{
                if(object===this.scene)return;const state=this._captureObject(object);this.objectStates.set(object.uuid,state);this.objectRefs.set(object.uuid,object);this.originalUUIDs.add(object.uuid);
            });if(this.options.captureSelection)this.selectionState=this._captureSelection();if(this.options.captureCamera)this.cameraState=this._captureCamera();if(this.options.captureControls)this.controlsState=this._captureControls();this.captured=true;window.SMRuntimeEventBus?.emit?.('snapshot:capture',{
                snapshot:this,objectCount:this.objectStates.size
            });return this;
        }
        restore(){
            if(!this.captured||!this.scene)throw new Error('Runtime snapshot has not been captured.');const current=[];this.scene.traverse(object=>{
                if(object!==this.scene)current.push(object);
            });for(const object of current){
                if(!this.originalUUIDs.has(object.uuid)&&object.parent){
                    object.parent.remove(object);
                }
            }
            const states=Array.from(this.objectStates.values()).sort((a,b)=>a.depth-b.depth);for(const state of states){
                const object=this.objectRefs.get(state.uuid);if(!object)continue;const parent=state.parentUUID?this.objectRefs.get(state.parentUUID):this.scene;if(parent&&object.parent!==parent)parent.add(object);this._restoreObject(object,state);
            }
            for(const state of states){
                const object=this.objectRefs.get(state.uuid);const parent=state.parentUUID?this.objectRefs.get(state.parentUUID):this.scene;if(!object||!parent)continue;const desired=Math.max(0,Math.min(state.childIndex,parent.children.length-1));const currentIndex=parent.children.indexOf(object);if(currentIndex>=0&&currentIndex!==desired){
                    parent.children.splice(currentIndex,1);parent.children.splice(desired,0,object);
                }
            }
            this._restoreSceneState();this._restoreCamera();this._restoreControls();this._restoreSelection();this.scene.updateMatrixWorld?.(true);window.SMRuntimeEventBus?.emit?.('snapshot:restore',{
                snapshot:this,objectCount:this.objectStates.size
            });return true;
        }
        hasObject(objectOrUUID){
            const uuid=typeof objectOrUUID==='string'?objectOrUUID:objectOrUUID?.uuid;return Boolean(uuid&&this.originalUUIDs.has(uuid));
        }
        getObjectState(objectOrUUID){
            const uuid=typeof objectOrUUID==='string'?objectOrUUID:objectOrUUID?.uuid;return uuid?this.objectStates.get(uuid)||null:null;
        }
        getStats(){
            return{
                captured:this.captured,objects:this.objectStates.size,createdAt:this.createdAt
            };
        }
        _captureObject(object){
            const parent=object.parent;return{
                uuid:object.uuid,depth:this._depth(object),parentUUID:parent&&parent!==this.scene?parent.uuid:null,childIndex:parent?parent.children.indexOf(object):0,name:object.name,visible:this.options.captureVisibility?object.visible:undefined,position:object.position?.toArray?.()||null,quaternion:object.quaternion?.toArray?.()||null,scale:object.scale?.toArray?.()||null,up:object.up?.toArray?.()||null,matrixAutoUpdate:object.matrixAutoUpdate,renderOrder:object.renderOrder,frustumCulled:object.frustumCulled,castShadow:object.castShadow,receiveShadow:object.receiveShadow,layersMask:this.options.captureLayers?object.layers?.mask:undefined,userData:this.options.captureUserData?this._clone(object.userData):undefined
            };
        }
        _restoreObject(object,state){
            object.name=state.name;if(state.position&&object.position?.fromArray)object.position.fromArray(state.position);if(state.quaternion&&object.quaternion?.fromArray)object.quaternion.fromArray(state.quaternion);if(state.scale&&object.scale?.fromArray)object.scale.fromArray(state.scale);if(state.up&&object.up?.fromArray)object.up.fromArray(state.up);if(state.visible!==undefined)object.visible=state.visible;if(state.layersMask!==undefined&&object.layers)object.layers.mask=state.layersMask;if(state.matrixAutoUpdate!==undefined)object.matrixAutoUpdate=state.matrixAutoUpdate;if(state.renderOrder!==undefined)object.renderOrder=state.renderOrder;if(state.frustumCulled!==undefined)object.frustumCulled=state.frustumCulled;if(state.castShadow!==undefined)object.castShadow=state.castShadow;if(state.receiveShadow!==undefined)object.receiveShadow=state.receiveShadow;if(state.userData!==undefined)object.userData=this._clone(state.userData);object.updateMatrix?.();object.updateMatrixWorld?.(true);
        }
        _captureSceneState(scene){
            return{
                background:scene.background,fog:scene.fog,environment:scene.environment,backgroundBlurriness:scene.backgroundBlurriness,backgroundIntensity:scene.backgroundIntensity,environmentIntensity:scene.environmentIntensity,userData:this.options.captureUserData?this._clone(scene.userData):undefined
            };
        }
        _restoreSceneState(){
            const state=this.sceneState;if(!state)return;this.scene.background=state.background;this.scene.fog=state.fog;this.scene.environment=state.environment;if(state.backgroundBlurriness!==undefined)this.scene.backgroundBlurriness=state.backgroundBlurriness;if(state.backgroundIntensity!==undefined)this.scene.backgroundIntensity=state.backgroundIntensity;if(state.environmentIntensity!==undefined)this.scene.environmentIntensity=state.environmentIntensity;if(state.userData!==undefined)this.scene.userData=this._clone(state.userData);
        }
        _captureSelection(){
            const selected=window.selectedObject||window.currentSelectedObject||null;return{
                uuid:selected?.uuid||null
            };
        }
        _restoreSelection(){
            const uuid=this.selectionState?.uuid;const object=uuid?this.objectRefs.get(uuid)||null:null;if('selectedObject'in window)window.selectedObject=object;if('currentSelectedObject'in window)window.currentSelectedObject=object;window.dispatchEvent(new CustomEvent('sm:runtime-selection-restored',{
                detail:{
                    object
                }
            }));
        }
        _captureCamera(){
            const camera=window.activeCamera||window.camera||null;if(!camera)return null;return{
                ref:camera,position:camera.position?.toArray?.()||null,quaternion:camera.quaternion?.toArray?.()||null,scale:camera.scale?.toArray?.()||null,zoom:camera.zoom,fov:camera.fov,near:camera.near,far:camera.far
            };
        }
        _restoreCamera(){
            const state=this.cameraState;if(!state?.ref)return;const camera=state.ref;if(state.position&&camera.position?.fromArray)camera.position.fromArray(state.position);if(state.quaternion&&camera.quaternion?.fromArray)camera.quaternion.fromArray(state.quaternion);if(state.scale&&camera.scale?.fromArray)camera.scale.fromArray(state.scale);if(state.zoom!==undefined)camera.zoom=state.zoom;if(state.fov!==undefined)camera.fov=state.fov;if(state.near!==undefined)camera.near=state.near;if(state.far!==undefined)camera.far=state.far;camera.updateProjectionMatrix?.();camera.updateMatrixWorld?.(true);
        }
        _captureControls(){
            const controls=window.controls||window.cameraControls||null;if(!controls)return null;return{
                ref:controls,target:controls.target?.toArray?.()||null,enabled:controls.enabled
            };
        }
        _restoreControls(){
            const state=this.controlsState;if(!state?.ref)return;const controls=state.ref;if(state.target&&controls.target?.fromArray)controls.target.fromArray(state.target);if(state.enabled!==undefined)controls.enabled=state.enabled;controls.update?.();
        }
        _depth(object){
            let depth=0;let current=object.parent;while(current&&current!==this.scene){
                depth+=1;current=current.parent;
            }
            return depth;
        }
        _clone(value){
            if(value===undefined)return undefined;try{
                if(typeof structuredClone==='function')return structuredClone(value);
            } catch{
            }
            try{
                return JSON.parse(JSON.stringify(value));
            } catch{
                return value;
            }
        }
        debug(){
            const stats=this.getStats();console.log('[SMRuntimeStateSnapshot]',stats);return stats;
        }
    }
    window.SMRuntimeStateSnapshot=SMRuntimeStateSnapshot;window.smRuntimeStateSnapshot=SMRuntimeStateSnapshot;
})();