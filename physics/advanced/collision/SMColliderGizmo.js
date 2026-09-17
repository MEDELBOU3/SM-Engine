(function(global){
    'use strict';
    class SMColliderGizmo{
        constructor(authoring,visualizer){
            this.authoring=authoring;
            this.visualizer=visualizer;
            this.controls=null;
            this.proxy=null;
            this.owner=null;
            this.partIndex=-1;
            this._changeHandler=()=>this._syncConfig(false);
            this._finishHandler=()=>this._syncConfig(true);
        }
        _constructor(){
            return THREE.TransformControls||global.TransformControls||null;
        }
        _ensureControls(){
            if(this.controls)return true;
            const Ctor=this._constructor();
            const camera=global.camera||global._gameRenderCamera;
            const element=global.renderer?.domElement;
            if(!Ctor||!camera||!element)return false;
            try{
                this.controls=new Ctor(camera,element);
                this.controls.name='SM_ColliderTransformControls';
                this.controls.userData={isSystemObject:true};
                this.controls.addEventListener?.('objectChange',this._changeHandler);
                this.controls.addEventListener?.('mouseUp',this._finishHandler);
                this.controls.addEventListener?.('dragging-changed',event=>{if(global.controls)global.controls.enabled=!event.value;});
                global.scene?.add(this.controls);
                return true;
            }catch(error){console.warn('[ColliderGizmo] TransformControls unavailable.',error);return false;}
        }
        begin(owner,partIndex=0,mode='translate'){
            const config=this.authoring.getConfig(owner);
            const part=config?.parts?.[partIndex];
            if(!part||!this._ensureControls())return false;
            this.end(false);
            this.owner=owner;
            this.partIndex=partIndex;
            this.proxy=new THREE.Object3D();
            this.proxy.name='SM_ColliderEditProxy';
            this.proxy.userData.isSystemObject=true;
            const bodyPosition=new THREE.Vector3();
            const bodyQuaternion=new THREE.Quaternion();
            owner.getWorldPosition(bodyPosition);owner.getWorldQuaternion(bodyQuaternion);
            const localPosition=new THREE.Vector3().fromArray(part.position||[0,0,0]).applyQuaternion(bodyQuaternion).add(bodyPosition);
            const localQuaternion=new THREE.Quaternion().fromArray(part.quaternion||[0,0,0,1]);
            this.proxy.position.copy(localPosition);
            this.proxy.quaternion.copy(bodyQuaternion).multiply(localQuaternion);
            this.proxy.scale.fromArray(part.scale||[1,1,1]);
            global.scene?.add(this.proxy);
            this.controls.attach?.(this.proxy);
            this.controls.setMode?.(mode);
            this.controls.visible=true;
            return true;
        }
        setMode(mode){this.controls?.setMode?.(mode);}
        _syncConfig(rebuild){
            if(!this.owner||!this.proxy||this.partIndex<0)return;
            const config=this.authoring.getConfig(this.owner);
            const part=config?.parts?.[this.partIndex];
            if(!part)return;
            const bodyPosition=new THREE.Vector3();
            const bodyQuaternion=new THREE.Quaternion();
            this.owner.getWorldPosition(bodyPosition);this.owner.getWorldQuaternion(bodyQuaternion);
            const inverse=bodyQuaternion.clone().invert();
            const localPosition=this.proxy.position.clone().sub(bodyPosition).applyQuaternion(inverse);
            const localQuaternion=inverse.multiply(this.proxy.quaternion.clone()).normalize();
            part.position=localPosition.toArray();
            part.quaternion=localQuaternion.toArray();
            part.scale=this.proxy.scale.toArray();
            this.authoring.saveConfig(this.owner,config);
            this.visualizer?.show?.(this.owner,config);
            if(rebuild)this.authoring.rebuild(this.owner,{preserveSimulation:true});
        }
        end(save=true){
            if(save)this._syncConfig(false);
            this.controls?.detach?.();
            if(this.controls)this.controls.visible=false;
            this.proxy?.removeFromParent?.();
            this.proxy=null;this.owner=null;this.partIndex=-1;
        }
        dispose(){
            this.end(false);
            this.controls?.removeEventListener?.('objectChange',this._changeHandler);
            this.controls?.removeEventListener?.('mouseUp',this._finishHandler);
            this.controls?.dispose?.();
            this.controls?.removeFromParent?.();
            this.controls=null;
        }
    }
    global.SMColliderGizmo=SMColliderGizmo;
})(window);