class ScenePersistenceManager {
    constructor(scene, objectsArray) {
        this.scene = scene;
        this.objectsArray = objectsArray;
        this.lastSaveData = null;
        this.saveCount = 0;
        this.lastSaveTime = null;
        this.isAutoSaving = false;
        this.isLoading = false; // PREVENT DUPLICATE LOADS
        this.debounceTimer = null;
        this.storageKey = "scene-save-data";
    }

    /**
     * Runtime players are rebuilt by SMPlayerCharacter/SMPlayerSystem. Their
     * skinned meshes and bones must never be persisted as standalone meshes:
     * doing so loses the skeleton binding and makes the body appear detached
     * on the next engine reload.
     */
    _isPlayerRuntimeObject(obj) {
        if (!obj || obj === this.scene) return false;
        const data = obj.userData || {};
        const name = String(obj.name || '').trim().toLowerCase();
        if (
            data.isPlayer === true ||
            data.isPlayerRoot === true ||
            data.isPlayerVisual === true ||
            data.isPlayerPart === true ||
            data.isRuntimeCharacter === true ||
            name === 'player' ||
            name === 'player mesh'
        ) {
            return true;
        }

        // Legacy player saves may not have marked every node. Bones and
        // skinned meshes under a Player root are still runtime internals, but
        // ordinary assets attached to a bone (for example a weapon) are not.
        if (obj.isBone || obj.isSkinnedMesh) {
            let parent = obj.parent;
            while (parent && parent !== this.scene) {
                if (parent.userData?.isPlayerRoot || parent.userData?.isPlayerVisual) {
                    return true;
                }
                parent = parent.parent;
            }
        }

        // RigManager's temporary bone bodies/joints are children of the
        // actual bones. They are editor visuals, not scene assets, and must
        // not be serialized as detached meshes either.
        if (obj.userData?.targetBone || obj.userData?.isBoneVisual) {
            let parent = obj.parent;
            while (parent && parent !== this.scene) {
                if (parent.isBone) {
                    let owner = parent.parent;
                    while (owner && owner !== this.scene) {
                        if (owner.userData?.isPlayerRoot || owner.userData?.isPlayerVisual) {
                            return true;
                        }
                        owner = owner.parent;
                    }
                    break;
                }
                parent = parent.parent;
            }
        }
        return false;
    }

    // ✅ AUTO-SAVE with debounce (prevents saving too frequently)
    autoSave() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.save();
        }, 500);
    }

    // ✅ SERIALIZE: Convert scene to JSON with error handling
    async save() {
        try {
            if (!this.scene) {
                console.warn("⚠️ Scene not ready for saving.");
                return false;
            }

            // The persistence facade remains for old menu actions and saved
            // projects, but the entity manager owns all new scene captures.
            // This keeps one authoritative hierarchy/identity model instead
            // of maintaining a second mesh-only representation here.
            if (window.smSceneManager?.serialize && window.SMWorldSceneSerializer) {
                const data = window.smSceneManager.serialize({
                    includeSystem: false,
                    includeEditorOnly: false,
                    inlineFallback: true,
                    filter: (object) => !this._isPlayerRuntimeObject(object)
                });
                data.legacyPersistence = {
                    saveCount: ++this.saveCount,
                    savedBy: 'ScenePersistenceManagerAdapter'
                };
                data.vegetation = window.vegetationSystem?.serialize?.() || null;
                this.lastSaveData = data;
                this.lastSaveTime = new Date().toLocaleTimeString();

                try {
                    const result = await window.storage.set(this.storageKey, JSON.stringify(data));
                    if (result) {
                        console.log(`✅ World Saved (Save #${this.saveCount}) - ${data.entities.length} entities`);
                    } else {
                        console.warn("⚠️ Storage save failed, but in-memory backup exists");
                    }
                } catch (storageError) {
                    console.warn("⚠️ window.storage not available, using in-memory only:", storageError.message);
                }

                window.dispatchEvent(new CustomEvent('sm:scene-saved', {
                    detail: { format: data.format, entityCount: data.entities.length }
                }));
                return true;
            }

            const data = {
                metadata: {
                    timestamp: Date.now(),
                    version: "1.0",
                    saveCount: ++this.saveCount
                },
                entities: [],
                vegetation: window.vegetationSystem?.serialize?.() || null,
            };

            this.scene.traverse((obj) => {
                // SKIP: System objects, helpers, transform controls, scene root
                if (
                    obj.userData?.isSystemObject ||
                    obj.userData?.isHelper ||
                    obj.userData?.isVegetation ||
                    obj.userData?.isVegetationRoot ||
                    this._isPlayerRuntimeObject(obj) ||
                    obj.type === 'Scene' ||
                    obj === this.scene
                ) {
                    return;
                }
                
                // Only save Meshes and Lights that are actual objects
                if (!obj.isMesh && !obj.isLight) return;

                try {
                    const entity = {
                        uuid: obj.uuid,
                        name: obj.name || `${obj.type}_${Math.random().toString(36).substr(2, 9)}`,
                        type: obj.type,
                        position: obj.position.toArray(),
                        rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
                        scale: obj.scale.toArray(),
                        visible: obj.visible,
                        castShadow: obj.castShadow,
                        receiveShadow: obj.receiveShadow,
                        userData: this.serializeSafeUserData(obj.userData),
                        parentUuid: obj.userData?.isBoneAttachment
                            ? obj.userData.attachedBoneUuid
                            : null
                    };

                    if (obj.isMesh && obj.geometry && obj.material) {
                        entity.geometry = {
                            type: obj.geometry.type,
                            params: this.extractGeometryParams(obj.geometry)
                        };
                        
                        if (Array.isArray(obj.material)) {
                            entity.material = obj.material.map(m => this.extractMaterialData(m));
                        } else {
                            entity.material = this.extractMaterialData(obj.material);
                        }
                    } 
                    else if (obj.isLight) {
                        entity.light = {
                            type: obj.type,
                            color: obj.color?.getHex?.() || 0xffffff,
                            intensity: obj.intensity || 1,
                            distance: obj.distance || 0,
                            angle: obj.angle || 0,
                            decay: obj.decay || 1,
                            castShadow: obj.castShadow || false
                        };
                    }

                    data.entities.push(entity);
                } catch (entityError) {
                    console.warn(`⚠️ Failed to serialize entity "${obj.name}":`, entityError.message);
                }
            });

            // Store in memory for immediate use
            this.lastSaveData = data;
            this.lastSaveTime = new Date().toLocaleTimeString();

            // 🔑 PERSIST TO WINDOW.STORAGE (Claude.ai supported)
            try {
                const result = await window.storage.set(this.storageKey, JSON.stringify(data));
                if (result) {
                    console.log(`✅ Project Saved (Save #${this.saveCount}) - ${data.entities.length} entities - Persisted to Storage`);
                } else {
                    console.warn("⚠️ Storage save failed, but in-memory backup exists");
                }
            } catch (storageError) {
                console.warn("⚠️ window.storage not available, using in-memory only:", storageError.message);
            }

            return true;

        } catch (error) {
            console.error("❌ Failed to save project:", error.message);
            return false;
        }
    }

    // ✅ LOAD: Restore from persistent storage
    async load() {
        try {
            // PREVENT DUPLICATE LOADS
            if (this.isLoading) {
                console.warn("⚠️ Load already in progress, skipping duplicate load");
                return false;
            }
            this.isLoading = true;

            let data = null;

            // 🔑 TRY TO LOAD FROM PERSISTENT STORAGE FIRST
            try {
                const result = await window.storage.get(this.storageKey);
                if (result && result.value) {
                    data = JSON.parse(result.value);
                    console.log("📂 Loaded from persistent storage");
                }
            } catch (storageError) {
                console.warn("⚠️ Could not access window.storage:", storageError.message);
                // Fall back to in-memory
                if (this.lastSaveData) {
                    data = this.lastSaveData;
                    console.log("📂 Loaded from in-memory backup");
                }
            }

            if (!data) {
                console.log("📂 No saved data to load.");
                this.isLoading = false;
                return false;
            }

            console.log(`📂 Loading project (${data.entities.length} entities)...`);

            if (data.vegetation) {
                if (window.vegetationSystem?.deserialize) {
                    window.vegetationSystem.deserialize(data.vegetation);
                } else {
                    window.__pendingVegetationData = data.vegetation;
                }
            }

            // New saves use the canonical world serializer. Keep the legacy
            // loader below solely as an import/migration path for v1 data.
            if (data.format === 'SM_WORLD_SCENE' && window.smSceneManager?.load) {
                const result = await window.smSceneManager.load(data, {
                    clearExisting: true,
                    includeSystem: false
                });
                this.lastSaveData = data;
                this.lastSaveTime = new Date().toLocaleTimeString();
                this.isLoading = false;
                console.log(`✅ World Loaded (${result.entityCount}/${data.entities.length} entities restored).`);
                return result.loaded;
            }

            // Clear user objects (keep system objects)
            // IMPORTANT: Remove from scene first, THEN from array
            const objectsToRemove = [];
            for (let i = this.objectsArray.length - 1; i >= 0; i--) {
                const obj = this.objectsArray[i];
                if (!obj.userData?.isSystemObject) {
                    objectsToRemove.push(obj);
                }
            }

            // Remove all at once
            objectsToRemove.forEach(obj => {
                this.scene.remove(obj);
            });

            // Clear the array of user objects
            for (let i = this.objectsArray.length - 1; i >= 0; i--) {
                if (!this.objectsArray[i].userData?.isSystemObject) {
                    this.objectsArray.splice(i, 1);
                }
            }

            // Rebuild entities
            let loadedCount = 0;
            const pendingParentLinks = [];
            data.entities.forEach(entity => {
                try {
                    // Ignore old saves that contain player parts from before
                    // the runtime-player persistence guard was added.
                    const savedUserData = entity.userData || {};
                    const savedName = String(entity.name || '').trim().toLowerCase();
                    if (
                        savedUserData.isPlayer === true ||
                        savedUserData.isPlayerRoot === true ||
                        savedUserData.isPlayerVisual === true ||
                        savedUserData.isPlayerPart === true ||
                        savedUserData.isRuntimeCharacter === true ||
                        savedName === 'player' ||
                        savedName === 'player mesh'
                    ) {
                        return;
                    }
                    let obj = null;

                    if (entity.type === 'Mesh') {
                        const geometry = this.createGeometry(entity.geometry);
                        let material;

                        if (Array.isArray(entity.material)) {
                            material = entity.material.map(m => this.createMaterial(m));
                        } else {
                            material = this.createMaterial(entity.material);
                        }

                        obj = new THREE.Mesh(geometry, material);
                    } 
                    else if (entity.type.includes('Light')) {
                        obj = this.createLight(entity.light);
                    }

                    if (obj) {
                        obj.uuid = entity.uuid;
                        obj.name = entity.name;
                        obj.position.fromArray(entity.position);
                        obj.rotation.set(entity.rotation[0], entity.rotation[1], entity.rotation[2]);
                        obj.scale.fromArray(entity.scale);
                        obj.visible = entity.visible ?? true;
                        obj.castShadow = entity.castShadow ?? true;
                        obj.receiveShadow = entity.receiveShadow ?? true;
                        obj.userData = entity.userData;

                        if (typeof window.addObjectToScene === 'function') {
                            window.addObjectToScene(obj, entity.name);
                        } else {
                            this.scene.add(obj);
                            this.objectsArray.push(obj);
                        }
                        const parentUuid = entity.parentUuid || savedUserData.attachedBoneUuid;
                        if (parentUuid) {
                            pendingParentLinks.push({ obj, parentUuid });
                        }
                        loadedCount++;
                    }
                } catch (entityError) {
                    console.warn(`⚠️ Failed to load entity "${entity.name}":`, entityError.message);
                }
            });

            console.log(`✅ Project Loaded Successfully (${loadedCount}/${data.entities.length} entities restored).`);
            // Restore weapon/prop attachments after all runtime player bones
            // exist. Object3D.attach() keeps the saved world transform while
            // making the prop follow the bone again.
            if (pendingParentLinks.length) {
                this.scene.updateMatrixWorld?.(true);
                pendingParentLinks.forEach(({ obj, parentUuid }) => {
                    const parent = this.scene.getObjectByProperty?.('uuid', parentUuid);
                    if (!parent?.isBone || !obj) return;
                    parent.updateMatrixWorld?.(true);
                    parent.attach?.(obj);
                    obj.visible = true;
                    obj.updateMatrixWorld?.(true);
                });
            }

            this.isLoading = false; // RESET FLAG
            return true;

        } catch (error) {
            console.error("❌ Failed to load project:", error.message);
            this.isLoading = false; // RESET FLAG
            return false;
        }
    }

    // Helper: Safely serialize userData
    serializeSafeUserData(userData) {
        if (!userData) return {};
        
        const safe = {};
        for (const [key, value] of Object.entries(userData)) {
            try {
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
                    safe[key] = value;
                } else if (Array.isArray(value) && value.every(v => typeof v === 'number')) {
                    safe[key] = value;
                }
            } catch (e) {
                // Skip problematic properties
            }
        }
        return safe;
    }

    // Helper: Extract geometry parameters safely
    extractGeometryParams(geometry) {
        const params = geometry.parameters || {};
        const safe = {};
        
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
                safe[key] = value;
            }
        }
        return safe;
    }

    // Helper: Extract material data safely
    extractMaterialData(material) {
        try {
            return {
                type: material.type,
                color: material.color?.getHex?.() || 0xffffff,
                roughness: material.roughness ?? 0.5,
                metalness: material.metalness ?? 0,
                wireframe: material.wireframe ?? false,
                opacity: material.opacity ?? 1,
                transparent: material.transparent ?? false,
                emissive: material.emissive?.getHex?.() || 0x000000,
                emissiveIntensity: material.emissiveIntensity ?? 1,
                side: material.side ?? 2,
                depthWrite: material.depthWrite ?? true,
                depthTest: material.depthTest ?? true
            };
        } catch (e) {
            return {};
        }
    }

    // Helper: Create geometry from parameters
    createGeometry(geoData) {
        const p = geoData.params;
        switch (geoData.type) {
            case 'BoxGeometry': return new THREE.BoxGeometry(p.width || 1, p.height || 1, p.depth || 1);
            case 'SphereGeometry': return new THREE.SphereGeometry(p.radius || 1, p.widthSegments || 32, p.heightSegments || 32);
            case 'CylinderGeometry': return new THREE.CylinderGeometry(p.radiusTop || 1, p.radiusBottom || 1, p.height || 1, p.radialSegments || 32);
            case 'PlaneGeometry': return new THREE.PlaneGeometry(p.width || 1, p.height || 1);
            case 'TorusGeometry': return new THREE.TorusGeometry(p.radius || 1, p.tube || 0.4, p.radialSegments || 16, p.tubularSegments || 100);
            case 'ConeGeometry': return new THREE.ConeGeometry(p.radius || 1, p.height || 1, p.radialSegments || 32);
            default: return new THREE.BoxGeometry(1, 1, 1);
        }
    }

    // Helper: Create material from saved data
    createMaterial(matData) {
        const material = new THREE.MeshStandardMaterial({
            color: matData.color,
            roughness: matData.roughness,
            metalness: matData.metalness,
            wireframe: matData.wireframe,
            transparent: matData.transparent,
            opacity: matData.opacity,
            emissive: matData.emissive,
            emissiveIntensity: matData.emissiveIntensity,
            side: matData.side,
            depthWrite: matData.depthWrite,
            depthTest: matData.depthTest
        });
        return material;
    }

    // Helper: Create light from data
    createLight(lightData) {
        if (lightData.type === 'PointLight') {
            const light = new THREE.PointLight(lightData.color, lightData.intensity, lightData.distance);
            light.castShadow = lightData.castShadow;
            return light;
        }
        if (lightData.type === 'DirectionalLight') {
            const light = new THREE.DirectionalLight(lightData.color, lightData.intensity);
            light.castShadow = lightData.castShadow;
            return light;
        }
        if (lightData.type === 'SpotLight') {
            const light = new THREE.SpotLight(lightData.color, lightData.intensity, lightData.distance, lightData.angle);
            light.castShadow = lightData.castShadow;
            return light;
        }
        return null;
    }

    // ✅ RESET: Clear saved data
    async clear() {
        try {
            await window.storage.delete(this.storageKey);
        } catch (e) {
            console.warn("Could not delete from storage:", e.message);
        }
        this.lastSaveData = null;
        this.saveCount = 0;
        console.log("🗑️ Saved data cleared.");
    }

    // Get save status
    getStatus() {
        return {
            hasSavedData: !!this.lastSaveData,
            saveCount: this.saveCount,
            lastSaveTime: this.lastSaveTime,
            entityCount: this.lastSaveData?.entities.length || 0
        };
    }
}
