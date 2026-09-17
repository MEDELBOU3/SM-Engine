(function(global){
    'use strict';
    class SMColliderAuthoringSystem{
        constructor(physics){
            this.physics=physics;
            this.builder=new global.SMColliderGeometryBuilder();
            this.cooker=new global.SMCollisionCooker(physics,this.builder);
            this.visualizer=new global.SMColliderVisualizer(this.builder);
            this.gizmo=new global.SMColliderGizmo(this,this.visualizer);
            this.version='1.0';
            this._installed=false;
            this._originalCreateShape=null;
        }
        defaultConfig(){
            return{
                version:1,
                enabled:true,
                mode:'exact',
                complexity:'complexAsSimple',
                margin:0.015,
                weld:true,
                weldTolerance:0.00001,
                maxTriangles:250000,
                maxHulls:8,
                targetTrianglesPerHull:128,
                clusterIterations:5,
                precision:0.85,
                allowDynamicTriangleMesh:false,
                customMode:'convex',
                sourceUuid:null,
                display:'wireframe',
                parts:[]
            };
        }
        getConfig(object,create=true){
            if(!object)return null;
            let config=global.SMColliderSerializer.load(object);
            if(!config&&create){config=this.defaultConfig();this.saveConfig(object,config);}
            return config;
        }
        saveConfig(object,config){return global.SMColliderSerializer.save(object,{...this.defaultConfig(),...config});}
        install(){
            if(this._installed||!this.physics)return this._installed;
            const physics=this.physics;
            const original=physics._createShape?.bind(physics);
            if(!original)return false;
            this._originalCreateShape=original;
            const system=this;
            physics._createShape=function(mesh,type,props={}){
                const config=props.colliderAuthoring||global.SMColliderSerializer.load(mesh);
                if(config?.enabled!==false&&config?.mode){
                    try{
                        const descriptor=system.cooker.cook(mesh,config,props);
                        if(descriptor?.shape){
                            props.colliderAuthoring=global.SMColliderSerializer.sanitize(config);
                            return descriptor;
                        }
                    }catch(error){console.warn('[ColliderAuthoring] Cook failed. Falling back to PhysicsSystem shape.',error);}
                }
                return original(mesh,type,props);
            };
            physics.colliderAuthoring=this;
            this._installed=true;
            return true;
        }
        setMode(object,mode,options={}){
            const config=this.getConfig(object,true);
            config.mode=String(mode||'exact');
            Object.assign(config,options);
            this.saveConfig(object,config);
            return config;
        }
        useExact(object,options={}){return this.setMode(object,'exact',{complexity:'complexAsSimple',...options});}
        useConvex(object,options={}){return this.setMode(object,'convex',{complexity:'autoConvex',...options});}
        useDecomposition(object,options={}){return this.setMode(object,'decomposition',{complexity:'autoConvex',...options});}
        useCompound(object,options={}){return this.setMode(object,'compound',{complexity:'compound',...options});}
        useCustom(object,source,options={}){
            const config=this.setMode(object,'custom',{sourceUuid:source?.uuid||null,...options});
            return config;
        }
        _bodyProps(object,overrides={}){
            const current=object?.userData?.physics||{};
            const config=this.getConfig(object,true);
            const props={
                mass:current.mass??1,
                material:current.material||'DEFAULT',
                friction:current.friction??0.5,
                restitution:current.restitution??0.1,
                linearDamping:current.linearDamping??0.05,
                angularDamping:current.angularDamping??0.05,
                gravityScale:current.gravityScale??1,
                isKinematic:current.isKinematic===true,
                collisionGroup:current.collisionGroup??global.COL?.DEFAULT??1,
                collisionMask:current.collisionMask??global.COL?.ALL??-1,
                collisionMargin:config.margin,
                flags:{enableGravity:true,ccd:false,noSleep:false,windAffected:true,...(current.flags||{})},
                ...overrides,
                colliderAuthoring:global.SMColliderSerializer.sanitize(config)
            };
            if(config.mode==='exact')props.shapeType='trimesh';
            else if(config.mode==='convex')props.shapeType='convex';
            else props.shapeType='authoring';
            return props;
        }
        rebuild(object,options={}){
            if(!object||!this.physics?.isReady)return null;
            const running=this.physics.simulationRunning;
            const props=this._bodyProps(object,options.props||{});
            const body=this.physics.addBody(object,props);
            if(options.preserveSimulation!==false)this.physics.simulationRunning=running;
            if(this.getConfig(object,false)?.display!=='hidden')this.visualizer.show(object,this.getConfig(object));
            return body;
        }
        generate(object,options={}){
            if(!object)return null;
            const config=this.getConfig(object,true);
            Object.assign(config,options.config||{});
            if(options.mode)config.mode=options.mode;
            this.saveConfig(object,config);
            return this.rebuild(object,{props:options.props||{},preserveSimulation:true});
        }
        addPrimitive(object,type='box',options={}){
            const config=this.useCompound(object);
            const compound=new global.SMCompoundCollider(object,config);
            if(compound.parts.length===0){
                const box=new THREE.Box3().setFromObject(object);
                const size=box.getSize(new THREE.Vector3());
                const worldCenter=box.getCenter(new THREE.Vector3());
                const ownerPosition=new THREE.Vector3();
                const ownerQuaternion=new THREE.Quaternion();
                object.getWorldPosition(ownerPosition);object.getWorldQuaternion(ownerQuaternion);
                const localCenter=worldCenter.sub(ownerPosition).applyQuaternion(ownerQuaternion.clone().invert());
                compound.add(type,{size:size.toArray(),position:localCenter.toArray(),...options});
            }else compound.add(type,options);
            config.parts=compound.toJSON();
            this.saveConfig(object,config);
            this.visualizer.show(object,config);
            return config.parts[config.parts.length-1];
        }
        removePart(object,indexOrId){
            const config=this.getConfig(object,false);
            if(!config)return false;
            const compound=new global.SMCompoundCollider(object,config);
            if(!compound.remove(indexOrId))return false;
            config.parts=compound.toJSON();
            this.saveConfig(object,config);
            this.visualizer.show(object,config);
            return true;
        }
        show(object){const config=this.getConfig(object,false);return config?this.visualizer.show(object,config):null;}
        hide(object){return this.visualizer.hide(object);}
        editPart(object,index=0,mode='translate'){return this.gizmo.begin(object,index,mode);}
        stopEditing(save=true){return this.gizmo.end(save);}
        update(){this.visualizer.update();}
        debug(object=global.selectedObject){
            const config=this.getConfig(object,false);
            const body=this.physics?.meshToBodyMap?.get(object)||null;
            const resources=this.physics?._bodyResources?.get(object)||null;
            const info={
                installed:this._installed,
                object:object?.name||null,
                mode:config?.mode||null,
                body:!!body,
                ammoShape:resources?.shape?.constructor?.name||typeof resources?.shape,
                authoringStats:object?.userData?.physics?.authoringStats||null,
                parts:config?.parts?.length||0,
                preview:this.visualizer.entries.has(object)
            };
            console.table(info);return info;
        }
    }
    global.SMColliderAuthoringSystem=SMColliderAuthoringSystem;
})(window);