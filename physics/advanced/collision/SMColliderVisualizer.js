(function(global){
    'use strict';
    class SMColliderVisualizer{
        constructor(builder=null){
            this.builder=builder||new global.SMColliderGeometryBuilder();
            this.entries=new Map();
            this.material=new THREE.LineBasicMaterial({color:0x62d68b,transparent:true,opacity:0.92,depthTest:false,depthWrite:false,toneMapped:false});
            this.material.name='SM_ColliderWireMaterial';
            this._position=new THREE.Vector3();
            this._quaternion=new THREE.Quaternion();
        }
        _bodyRoot(owner){
            const root=new THREE.Group();
            root.name=`SM_ColliderPreview_${owner.name||owner.uuid}`;
            root.userData.isSystemObject=true;
            root.renderOrder=10000;
            global.scene?.add(root);
            return root;
        }
        _syncRoot(owner,root){
            owner.getWorldPosition(this._position);
            owner.getWorldQuaternion(this._quaternion);
            root.position.copy(this._position);
            root.quaternion.copy(this._quaternion);
            root.scale.set(1,1,1);
        }
        _lineFromData(data){
            const geometry=this.builder.buildLineGeometry(data);
            if(!geometry)return null;
            const line=new THREE.LineSegments(geometry,this.material);
            line.renderOrder=10000;
            line.userData.isSystemObject=true;
            return line;
        }
        _primitive(part){
            const type=String(part.type||'box').toLowerCase();
            const size=part.size||[1,1,1];
            let geometry=null;
            if(type==='sphere')geometry=new THREE.SphereGeometry(Number(part.radius)||0.5,18,12);
            else if(type==='capsule'&&THREE.CapsuleGeometry)geometry=new THREE.CapsuleGeometry(Number(part.radius)||0.5,Number(part.height)||1,6,12);
            else if(type==='cylinder')geometry=new THREE.CylinderGeometry(size[0]*0.5,size[0]*0.5,size[1],16,1,true);
            else geometry=new THREE.BoxGeometry(size[0],size[1],size[2]);
            const edges=new THREE.EdgesGeometry(geometry);
            geometry.dispose();
            const line=new THREE.LineSegments(edges,this.material);
            line.position.fromArray(part.position||[0,0,0]);
            line.quaternion.fromArray(part.quaternion||[0,0,0,1]);
            line.scale.fromArray(part.scale||[1,1,1]);
            line.renderOrder=10000;
            line.userData.isSystemObject=true;
            return line;
        }
        show(owner,config={}){
            if(!owner)return null;
            this.hide(owner);
            const root=this._bodyRoot(owner);
            const mode=String(config.mode||'exact').toLowerCase();
            if(mode==='compound'){
                for(const part of config.parts||[])if(part.enabled!==false)root.add(this._primitive(part));
            }else{
                const source=mode==='custom'&&config.sourceUuid?global.scene?.getObjectByProperty?.('uuid',config.sourceUuid):owner;
                const data=this.builder.build(owner,{source:source||owner,weld:config.weld!==false,maxTriangles:config.previewMaxTriangles||120000});
                const line=this._lineFromData(data);
                if(line)root.add(line);
            }
            this._syncRoot(owner,root);
            this.entries.set(owner,root);
            return root;
        }
        update(){
            for(const [owner,root] of this.entries)if(owner?.parent||owner===global.scene)this._syncRoot(owner,root);
        }
        hide(owner){
            const root=this.entries.get(owner);
            if(!root)return false;
            root.traverse(object=>object.geometry?.dispose?.());
            root.removeFromParent?.();
            this.entries.delete(owner);
            return true;
        }
        hideAll(){for(const owner of Array.from(this.entries.keys()))this.hide(owner);}
        dispose(){this.hideAll();this.material.dispose?.();}
    }
    global.SMColliderVisualizer=SMColliderVisualizer;
})(window);