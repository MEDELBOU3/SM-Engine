(function(){
    'use strict';
    class SMPrefabInstantiator{
        constructor(options={}){
            this.registry=options.registry||window.SMPrefabRegistry||null;
            this.assetResolvers=[];
            this.instanceSequence=0;
        }
        registerAssetResolver(resolver){
            if(typeof resolver!=='function')throw new TypeError('registerAssetResolver(resolver) expects a function.');
            this.assetResolvers.push(resolver);
            return()=>{
                const index=this.assetResolvers.indexOf(resolver);
                if(index>=0)this.assetResolvers.splice(index,1);
            };
        }
        async instantiate(prefabOrId,options={}){
            const prefab=this._resolvePrefab(prefabOrId);
            if(!prefab)throw new Error(`Prefab "${prefabOrId}" was not found.`);
            let root=null;
            if(prefab.templateObject&&options.preferTemplate!==false){
                root=this._cloneTemplate(prefab.templateObject);
                await this._prepareClonedTree(root,prefab.root,options);
            }else{
                root=await this._instantiateNode(prefab.root,options);
            }
            if(!root)throw new Error(`Prefab "${prefab.id}" could not create a root object.`);
            this._applyInstanceIdentity(root,prefab,options);
            this._applyTransformOverrides(root,options);
            const mergedOverrides=this._deepMerge(prefab.defaultOverrides||{},options.overrides||{});
            this.applyOverrides(root,mergedOverrides);
            if(options.parent?.add)options.parent.add(root);
            else if(options.addToScene!==false){
                const scene=options.scene||window.SMRuntime?.getWorld?.()?.scene||window.scene;
                scene?.add?.(root);
            }
            window.SMRuntimeEventBus?.emit?.('prefab:instantiated',{instantiator:this,prefab,instance:root,options});
            window.dispatchEvent(new CustomEvent('sm:prefab-instantiated',{detail:{prefab,instance:root,options}}));
            return root;
        }
        async _instantiateNode(node,options){
            if(!node)return null;
            let object=await this._resolveNodeAsset(node,options);
            if(!object)object=this._createNodeObject(node);
            if(!object)return null;
            this._applyNodeState(object,node);
            this._prepareComponents(object,node.components);
            for(const childNode of node.children||[]){
                const child=await this._instantiateNode(childNode,options);
                if(child)object.add?.(child);
            }
            return object;
        }
        async _resolveNodeAsset(node,options){
            if(!node.assetRef)return null;
            const resolvers=[...(Array.isArray(options.assetResolvers)?options.assetResolvers:[]),...this.assetResolvers];
            for(const resolver of resolvers){
                try{
                    const value=await resolver(node.assetRef,{node,options,instantiator:this});
                    if(value){
                        const object=value.object||value;
                        if(object?.clone)return this._cloneTemplate(object);
                        if(object&&typeof object==='object')return object;
                    }
                }catch(error){
                    console.warn('[SMPrefabInstantiator] Asset resolver failed.',node.assetRef,error);
                }
            }
            return null;
        }
        _createNodeObject(node){
            if(!window.THREE)return null;
            if(String(node.objectType).includes('Mesh')){
                const geometry=this._createGeometry(node.geometry);
                const material=this._createMaterial(node.material);
                if(node.objectType==='SkinnedMesh'&&THREE.SkinnedMesh)return new THREE.SkinnedMesh(geometry,material);
                return new THREE.Mesh(geometry,material);
            }
            if(node.objectType==='Group')return new THREE.Group();
            if(node.objectType==='PerspectiveCamera')return new THREE.PerspectiveCamera();
            if(node.objectType==='OrthographicCamera')return new THREE.OrthographicCamera();
            if(node.objectType==='DirectionalLight')return new THREE.DirectionalLight();
            if(node.objectType==='PointLight')return new THREE.PointLight();
            if(node.objectType==='SpotLight')return new THREE.SpotLight();
            if(node.objectType==='HemisphereLight')return new THREE.HemisphereLight();
            if(node.objectType==='AmbientLight')return new THREE.AmbientLight();
            return new THREE.Object3D();
        }
        _createGeometry(descriptor){
            if(!window.THREE)return null;
            if(!descriptor)return new THREE.BufferGeometry();
            if(descriptor.mode==='inline'&&descriptor.data){
                try{
                    const loader=new THREE.BufferGeometryLoader();
                    return loader.parse(descriptor.data);
                }catch(error){console.warn('[SMPrefabInstantiator] Inline geometry parse failed.',error);}
            }
            const p=descriptor.parameters||{};
            const constructors={BoxGeometry:()=>new THREE.BoxGeometry(p.width??1,p.height??1,p.depth??1,p.widthSegments??1,p.heightSegments??1,p.depthSegments??1),SphereGeometry:()=>new THREE.SphereGeometry(p.radius??1,p.widthSegments??32,p.heightSegments??16,p.phiStart??0,p.phiLength??Math.PI*2,p.thetaStart??0,p.thetaLength??Math.PI),PlaneGeometry:()=>new THREE.PlaneGeometry(p.width??1,p.height??1,p.widthSegments??1,p.heightSegments??1),CylinderGeometry:()=>new THREE.CylinderGeometry(p.radiusTop??1,p.radiusBottom??1,p.height??1,p.radialSegments??32,p.heightSegments??1,p.openEnded??false,p.thetaStart??0,p.thetaLength??Math.PI*2),ConeGeometry:()=>new THREE.ConeGeometry(p.radius??1,p.height??1,p.radialSegments??32,p.heightSegments??1,p.openEnded??false,p.thetaStart??0,p.thetaLength??Math.PI*2),TorusGeometry:()=>new THREE.TorusGeometry(p.radius??1,p.tube??0.4,p.radialSegments??12,p.tubularSegments??48,p.arc??Math.PI*2),CircleGeometry:()=>new THREE.CircleGeometry(p.radius??1,p.segments??32,p.thetaStart??0,p.thetaLength??Math.PI*2)};
            try{
                if(constructors[descriptor.type])return constructors[descriptor.type]();
            }catch(error){console.warn('[SMPrefabInstantiator] Geometry descriptor creation failed.',descriptor,error);}
            return new THREE.BufferGeometry();
        }
        _createMaterial(descriptor){
            if(!window.THREE)return null;
            if(Array.isArray(descriptor))return descriptor.map(item=>this._createMaterial(item));
            if(!descriptor)return new THREE.MeshStandardMaterial();
            if(descriptor.mode==='inline'&&descriptor.data){
                try{
                    const loader=new THREE.MaterialLoader();
                    return loader.parse(descriptor.data);
                }catch(error){console.warn('[SMPrefabInstantiator] Inline material parse failed.',error);}
            }
            const constructors={MeshStandardMaterial:THREE.MeshStandardMaterial,MeshPhysicalMaterial:THREE.MeshPhysicalMaterial,MeshBasicMaterial:THREE.MeshBasicMaterial,MeshLambertMaterial:THREE.MeshLambertMaterial,MeshPhongMaterial:THREE.MeshPhongMaterial,MeshNormalMaterial:THREE.MeshNormalMaterial};
            const MaterialClass=constructors[descriptor.type]||THREE.MeshStandardMaterial;
            const material=new MaterialClass();
            for(const[key,value]of Object.entries(descriptor.properties||{})){
                if(material[key]?.isColor&&typeof value==='string')material[key].set(value);
                else if(key in material)try{material[key]=value;}catch{}
            }
            material.needsUpdate=true;
            return material;
        }
        async _prepareClonedTree(object,node,options){
            if(!object||!node)return;
            this._applyNodeState(object,node);
            this._prepareComponents(object,node.components);
            const childCount=Math.min(object.children?.length||0,node.children?.length||0);
            for(let i=0;i<childCount;i++)await this._prepareClonedTree(object.children[i],node.children[i],options);
        }
        _applyNodeState(object,node){
            object.name=node.name||object.name||'';
            object.visible=node.visible!==false;
            if('castShadow'in object)object.castShadow=node.castShadow===true;
            if('receiveShadow'in object)object.receiveShadow=node.receiveShadow===true;
            object.renderOrder=Number(node.renderOrder||0);
            if(object.layers&&node.layers!==undefined)object.layers.mask=node.layers;
            if(object.position&&node.transform?.position)object.position.fromArray?.(node.transform.position);
            if(object.quaternion&&node.transform?.quaternion)object.quaternion.fromArray?.(node.transform.quaternion);
            if(object.scale&&node.transform?.scale)object.scale.fromArray?.(node.transform.scale);
            object.userData={...(object.userData||{}),...this._clone(node.userData||{})};
            object.userData.prefabNodeId=node.nodeId;
            if(node.runtimeType)object.userData.runtimeType=node.runtimeType;
            if(Array.isArray(node.tags))object.userData.tags=[...node.tags];
            object.updateMatrix?.();
            object.updateMatrixWorld?.(true);
        }
        _prepareComponents(object,components){
            if(!Array.isArray(components)||!components.length)return;
            object.userData=object.userData||{};
            object.userData.components=this._clone(components);
            if(window.SMComponentRuntimeBridge?.active)window.SMComponentRuntimeBridge.ensureContainer?.(object,{descriptors:components});
        }
        _applyInstanceIdentity(root,prefab,options){
            root.userData=root.userData||{};
            root.userData.prefabId=prefab.id;
            root.userData.prefabInstanceId=options.instanceId||`${prefab.id}-instance-${++this.instanceSequence}`;
            root.userData.prefabSourceUUID=prefab.sourceObjectUUID||null;
            root.userData.prefabOverrides=this._clone(options.overrides||{});
            if(options.name)root.name=String(options.name);
        }
        _applyTransformOverrides(root,options){
            if(options.position!==undefined)this._setVector(root.position,options.position);
            if(options.scale!==undefined)this._setVector(root.scale,options.scale);
            if(options.quaternion!==undefined)this._setQuaternion(root.quaternion,options.quaternion);
            else if(options.rotation!==undefined)this._setEuler(root.rotation,options.rotation);
            root.updateMatrix?.();
            root.updateMatrixWorld?.(true);
        }
        applyOverrides(root,overrides={}){
            if(!root||!overrides||typeof overrides!=='object')return root;
            if(overrides.root)this._applyObjectPatch(root,overrides.root);
            for(const patch of Array.isArray(overrides.nodes)?overrides.nodes:[]){
                const target=this._findNode(root,patch.nodeId||patch.name);
                if(target)this._applyObjectPatch(target,patch);
            }
            if(overrides.components&&typeof overrides.components==='object'){
                for(const[key,componentPatches]of Object.entries(overrides.components)){
                    const target=key==='root'?root:this._findNode(root,key);
                    if(!target)continue;
                    const list=Array.isArray(componentPatches)?componentPatches:[componentPatches];
                    for(const patch of list)this._applyComponentPatch(target,patch);
                }
            }
            root.userData=root.userData||{};
            root.userData.prefabOverrides=this._clone(overrides);
            return root;
        }
        _applyObjectPatch(object,patch){
            if(patch.name!==undefined)object.name=String(patch.name);
            if(patch.visible!==undefined)object.visible=Boolean(patch.visible);
            if(patch.position!==undefined)this._setVector(object.position,patch.position);
            if(patch.scale!==undefined)this._setVector(object.scale,patch.scale);
            if(patch.quaternion!==undefined)this._setQuaternion(object.quaternion,patch.quaternion);
            if(patch.rotation!==undefined)this._setEuler(object.rotation,patch.rotation);
            if(patch.userData&&typeof patch.userData==='object')Object.assign(object.userData||(object.userData={}),this._clone(patch.userData));
            if(patch.tags!==undefined){
                object.userData=object.userData||{};
                object.userData.tags=Array.isArray(patch.tags)?[...patch.tags]:String(patch.tags).split(',').map(value=>value.trim()).filter(Boolean);
            }
            object.updateMatrixWorld?.(true);
        }
        _applyComponentPatch(object,patch){
            if(!patch?.type)return false;
            const container=object.components||window.SMComponentRuntimeBridge?.ensureContainer?.(object);
            if(container){
                let component=container.get?.(patch.type);
                if(!component&&patch.addIfMissing!==false)component=container.add?.(patch.type,patch);
                if(component){
                    component.deserialize?.({...component.serialize?.(),...patch});
                    return true;
                }
            }
            const descriptors=Array.isArray(object.userData?.components)?object.userData.components:[];
            const index=descriptors.findIndex(item=>String(item.type).toLowerCase()===String(patch.type).toLowerCase());
            if(index>=0)descriptors[index]={...descriptors[index],...this._clone(patch)};
            else if(patch.addIfMissing!==false)descriptors.push(this._clone(patch));
            object.userData=object.userData||{};
            object.userData.components=descriptors;
            return true;
        }
        _findNode(root,key){
            if(!key)return null;
            let found=null;
            root.traverse?.(object=>{
                if(found)return;
                if(object.userData?.prefabNodeId===key||object.name===key||object.uuid===key)found=object;
            });
            return found;
        }
        _cloneTemplate(object){
            if(window.THREE?.SkeletonUtils?.clone){
                try{return THREE.SkeletonUtils.clone(object);}catch{}
            }
            try{return object.clone(true);}catch{return object;}
        }
        _resolvePrefab(prefabOrId){
            if(prefabOrId instanceof window.SMPrefab)return prefabOrId;
            if(prefabOrId&&typeof prefabOrId==='object'&&prefabOrId.root)return new window.SMPrefab(prefabOrId);
            return this.registry?.get?.(prefabOrId)||null;
        }
        _setVector(target,value){
            if(!target)return;
            if(Array.isArray(value))target.set?.(Number(value[0]??0),Number(value[1]??0),Number(value[2]??0));
            else if(value&&typeof value==='object')target.set?.(Number(value.x??0),Number(value.y??0),Number(value.z??0));
        }
        _setQuaternion(target,value){
            if(!target)return;
            if(Array.isArray(value))target.set?.(Number(value[0]??0),Number(value[1]??0),Number(value[2]??0),Number(value[3]??1));
            else if(value&&typeof value==='object')target.set?.(Number(value.x??0),Number(value.y??0),Number(value.z??0),Number(value.w??1));
        }
        _setEuler(target,value){
            if(!target)return;
            if(Array.isArray(value))target.set?.(Number(value[0]??0),Number(value[1]??0),Number(value[2]??0),value[3]||target.order);
            else if(value&&typeof value==='object')target.set?.(Number(value.x??0),Number(value.y??0),Number(value.z??0),value.order||target.order);
        }
        _deepMerge(base,patch){
            const output=this._clone(base)||{};
            for(const[key,value]of Object.entries(patch||{})){
                if(value&&typeof value==='object'&&!Array.isArray(value)&&output[key]&&typeof output[key]==='object'&&!Array.isArray(output[key]))output[key]=this._deepMerge(output[key],value);
                else output[key]=this._clone(value);
            }
            return output;
        }
        _clone(value){
            if(value===undefined)return undefined;
            try{return structuredClone(value);}catch{}
            try{return JSON.parse(JSON.stringify(value));}catch{return value;}
        }
        debug(){
            const state={registeredPrefabs:this.registry?.prefabs?.size||0,assetResolvers:this.assetResolvers.length,instancesCreated:this.instanceSequence};
            console.log('[SMPrefabInstantiator]',state);
            return state;
        }
    }
    const instantiator=new SMPrefabInstantiator();
    window.SMPrefabInstantiatorClass=SMPrefabInstantiator;
    window.SMPrefabInstantiator=instantiator;
    window.smPrefabInstantiator=instantiator;
})();
