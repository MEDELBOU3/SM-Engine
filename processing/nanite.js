// =========================================================================
// === NANITE-LIKE LOD SYSTEM (to be placed before your init() function) ===
// =========================================================================
class NaniteSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.meshes = new Map();
        this.lodLevels = 4;
        this.baseLODDistance = 20;
        this.lodDistanceMultiplier = 2.0;
        this.frustumCullLODs = true;
        this.debugMode = false;
        this.enabled = true;

        // Conceptual clustering - not fully used for rendering optimization in this version
        this.clusterSize = 20;
        this.useClustering = false;

        // Ensure SimplifyModifier is available
        if (typeof THREE.SimplifyModifier === 'undefined') {
            console.error("THREE.SimplifyModifier is not loaded. NaniteSystem requires it for LOD generation.");
            this.simplifyModifier = null;
        } else {
            this.simplifyModifier = new THREE.SimplifyModifier();
        }

        this.init();
    }

    init() {
        this.debugGroup = new THREE.Group();
        this.debugGroup.name = "NaniteDebugGroup";
        this.debugGroup.visible = this.debugMode;
        this.scene.add(this.debugGroup);
    }

    addMesh(originalMesh, options = {}) {
        if (!this.enabled || !originalMesh.geometry || !this.simplifyModifier) {
            if (!this.simplifyModifier) console.warn("NaniteSystem: SimplifyModifier not available, cannot add mesh:", originalMesh.name);
            return null;
        }
        if (originalMesh.userData.isNaniteOriginal || originalMesh.userData.isNaniteLOD || originalMesh.name === "NaniteDebugGroup") {
            return this.meshes.get(originalMesh.uuid) || null;
        }

        const uuid = originalMesh.uuid;
        if (this.meshes.has(uuid)) {
            console.warn("NaniteSystem: Mesh already added.", originalMesh.name);
            return this.meshes.get(uuid);
        }

        if (!originalMesh.geometry.boundingSphere) {
            originalMesh.geometry.computeBoundingSphere();
        }
        const boundingSphereRadius = originalMesh.geometry.boundingSphere.radius *
                                     Math.max(originalMesh.scale.x, originalMesh.scale.y, originalMesh.scale.z);

        const naniteData = {
            originalMesh: originalMesh,
            lods: [],
            options: {
                autoGenerateLODs: options.autoGenerateLODs ?? true,
                isStatic: options.isStatic ?? false,
                preserveMaterials: options.preserveMaterials ?? true,
                customLODs: options.customLODs ?? null,
                maxLODLevels: options.maxLODLevels ?? this.lodLevels,
            },
            currentLODLevel: -1, // -1 means original, or no LOD active
            boundingSphereRadius: boundingSphereRadius,
            clusters: [],
            lastMatrixWorld: new THREE.Matrix4().copy(originalMesh.matrixWorld),
            needsTransformUpdate: true, // Force initial transform sync
        };

        originalMesh.userData.isNaniteOriginal = true;

        if (naniteData.options.customLODs && Array.isArray(naniteData.options.customLODs)) {
            this.processCustomLODs(naniteData, naniteData.options.customLODs);
        } else if (naniteData.options.autoGenerateLODs) {
            this.generateLODs(naniteData);
        }

        if (naniteData.lods.length > 0) {
            // Original mesh's visibility will be controlled by the update loop.
            // Initially, if LODs exist, original is hidden and an LOD is shown.
        } else {
            originalMesh.visible = true; // No LODs, ensure original is visible
        }

        if (this.useClustering) {
            this.createClusters(naniteData);
        }

        this.meshes.set(uuid, naniteData);
        console.log(`NaniteSystem: Added mesh ${originalMesh.name || uuid}, ${naniteData.lods.length} LODs processed.`);
        return naniteData;
    }

    removeMesh(meshToRemove) {
        const naniteData = this.meshes.get(meshToRemove.uuid);
        if (naniteData) {
            naniteData.originalMesh.visible = true;
            naniteData.originalMesh.userData.isNaniteOriginal = false;
            if (naniteData.originalMesh.userData.lodLevel !== undefined) delete naniteData.originalMesh.userData.lodLevel;


            naniteData.lods.forEach(lod => {
                if (lod.mesh !== naniteData.originalMesh) { // Don't remove the original from scene if it's part of LODs
                    this.scene.remove(lod.mesh);
                    if (lod.mesh.geometry) lod.mesh.geometry.dispose();
                    if (lod.mesh.material) {
                        (Array.isArray(lod.mesh.material) ? lod.mesh.material : [lod.mesh.material])
                        .forEach(m => m.dispose());
                    }
                } else {
                    lod.mesh.visible = true; // Ensure original is visible if it was an LOD
                }
            });
            naniteData.clusters.forEach(cluster => {
                if (cluster.debugMesh) this.debugGroup.remove(cluster.debugMesh);
            });
            this.meshes.delete(meshToRemove.uuid);
        }
    }

    processCustomLODs(naniteData, customLODMeshes) {
        // LOD 0 is the original mesh
        naniteData.originalMesh.userData.lodLevel = 0;
        naniteData.lods.push({
            mesh: naniteData.originalMesh,
            distanceThreshold: this.baseLODDistance,
            level: 0
        });

        customLODMeshes.forEach((lodMesh, index) => {
            if (!lodMesh.geometry.boundingSphere) lodMesh.geometry.computeBoundingSphere();
            const distanceThreshold = this.baseLODDistance * Math.pow(this.lodDistanceMultiplier, index + 1);
            lodMesh.visible = false;
            lodMesh.userData.isNaniteLOD = true;
            lodMesh.userData.lodLevel = index + 1;
            this.syncTransform(lodMesh, naniteData.originalMesh);
            this.scene.add(lodMesh);
            naniteData.lods.push({ mesh: lodMesh, distanceThreshold: distanceThreshold, level: index + 1 });
        });
        naniteData.lods.sort((a, b) => a.distanceThreshold - b.distanceThreshold);
    }

    generateLODs(naniteData) {
        const originalGeom = naniteData.originalMesh.geometry;
        const originalMaterial = naniteData.originalMesh.material;
        const numLODsToGenerate = naniteData.options.maxLODLevels;

        naniteData.originalMesh.userData.lodLevel = 0;
        naniteData.lods.push({
            mesh: naniteData.originalMesh,
            distanceThreshold: this.baseLODDistance,
            level: 0
        });

        for (let i = 1; i < numLODsToGenerate; i++) {
            const targetTriangleCountOriginal = originalGeom.index ? originalGeom.index.count / 3 : originalGeom.attributes.position.count / 3;
            const simplificationRatio = Math.pow(0.55, i); // Adjust for desired reduction
            const count = Math.max(20, Math.floor(targetTriangleCountOriginal * simplificationRatio));

            let simplifiedGeom;
            if (targetTriangleCountOriginal <= count * 1.2) { // Don't simplify if already low poly or target is too close
                console.warn(`NaniteSystem: Skipping LOD ${i} for ${naniteData.originalMesh.name || 'mesh'}, target count too high or original too low.`);
                simplifiedGeom = originalGeom.clone(); // Use a clone to avoid modifying original
            } else {
                try {
                    simplifiedGeom = this.simplifyModifier.modify(originalGeom, count);
                    if (!simplifiedGeom) throw new Error("SimplifyModifier returned null");
                } catch (error) {
                    console.error(`NaniteSystem: Error simplifying for LOD ${i} on ${naniteData.originalMesh.name || 'mesh'}:`, error);
                    simplifiedGeom = originalGeom.clone();
                }
            }

            if (!simplifiedGeom.boundingSphere) simplifiedGeom.computeBoundingSphere();
            const material = naniteData.options.preserveMaterials ?
                             (Array.isArray(originalMaterial) ? originalMaterial.map(m=>m.clone()) : originalMaterial.clone()) :
                             new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff, wireframe: true });

            const lodMesh = new THREE.Mesh(simplifiedGeom, material);
            lodMesh.name = `${naniteData.originalMesh.name || 'NaniteObj'}_LOD${i}`;
            lodMesh.visible = false;
            lodMesh.userData.isNaniteLOD = true;
            lodMesh.userData.lodLevel = i;
            this.syncTransform(lodMesh, naniteData.originalMesh);
            lodMesh.matrixAutoUpdate = naniteData.options.isStatic ? false : true;

            this.scene.add(lodMesh);
            naniteData.lods.push({
                mesh: lodMesh,
                distanceThreshold: this.baseLODDistance * Math.pow(this.lodDistanceMultiplier, i),
                level: i
            });
        }
        naniteData.lods.sort((a, b) => a.distanceThreshold - b.distanceThreshold);
    }
    
    syncTransform(targetMesh, sourceMesh) {
        targetMesh.position.copy(sourceMesh.position);
        targetMesh.quaternion.copy(sourceMesh.quaternion);
        targetMesh.scale.copy(sourceMesh.scale);
        targetMesh.updateMatrixWorld(true); // Force update matrixWorld
    }

    createClusters(naniteData) { /* ... Your conceptual clustering logic ... */ }

    update() {
        if (!this.enabled || !this.camera) return { activeLODs: 0, visibleMeshesThisFrame: 0, processedMeshes:0 };

        const cameraPosition = this.camera.position;
        const frustum = new THREE.Frustum();
        projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse); // projScreenMatrix should be global or member
        frustum.setFromProjectionMatrix(projScreenMatrix);

        let activeLODCount = 0;
        let visibleMeshesThisFrame = 0;


        this.meshes.forEach(naniteData => {
            const original = naniteData.originalMesh;

            if (!original.parent) { // Mesh was removed from scene externally
                this.removeMesh(original); // Clean up Nanite data
                return; // Skip further processing for this removed mesh
            }


            if (!naniteData.options.isStatic || naniteData.needsTransformUpdate) {
                if (!original.matrixWorld.equals(naniteData.lastMatrixWorld) || naniteData.needsTransformUpdate) {
                    naniteData.lods.forEach(lod => {
                        if (lod.mesh !== original) { // Only update LOD copies
                           this.syncTransform(lod.mesh, original);
                        }
                    });
                    naniteData.lastMatrixWorld.copy(original.matrixWorld);
                    // If using clusters, update cluster positions based on original.matrixWorld here
                }
                naniteData.needsTransformUpdate = false;
            }

            const objectCenterWorld = new THREE.Vector3().setFromMatrixPosition(original.matrixWorld);
            const distanceToCamera = cameraPosition.distanceTo(objectCenterWorld);
            // Adjust distance by object's scale/size for more consistent LOD switching
            const effectiveDistance = distanceToCamera / (naniteData.boundingSphereRadius * 0.1 + 1);


            let selectedLOD = null;
            if (naniteData.lods.length > 0) {
                for (let i = 0; i < naniteData.lods.length; i++) {
                    const lod = naniteData.lods[i];
                    if (effectiveDistance < lod.distanceThreshold) {
                        selectedLOD = lod;
                        break;
                    }
                }
                if (!selectedLOD) { // If farther than all thresholds, use the lowest detail LOD
                    selectedLOD = naniteData.lods[naniteData.lods.length - 1];
                }
            }


            let newlyVisibleLOD = false;
            naniteData.lods.forEach((lod, index) => {
                const shouldBeVisible = (lod === selectedLOD);
                let frustumVisible = true;

                if (shouldBeVisible) {
                    if (this.frustumCullLODs && lod.mesh.geometry.boundingSphere) {
                        const sphere = lod.mesh.geometry.boundingSphere.clone();
                        sphere.applyMatrix4(lod.mesh.matrixWorld);
                        frustumVisible = frustum.intersectsSphere(sphere);
                    }
                }

                const finalVisibility = shouldBeVisible && frustumVisible;
                if (lod.mesh.visible !== finalVisibility) {
                    lod.mesh.visible = finalVisibility;
                }
                if (finalVisibility) {
                    activeLODCount++;
                    visibleMeshesThisFrame++;
                    newlyVisibleLOD = true;
                }
            });
            
            // If no LOD became visible (e.g. all culled or error), ensure original is hidden if it's managed
             if (!newlyVisibleLOD && naniteData.lods.find(l => l.mesh === original)) {
                 original.visible = false;
             } else if (!newlyVisibleLOD && !naniteData.lods.find(l => l.mesh === original) && !selectedLOD) {
                 // This case should ideally not happen if logic is correct, means original is not an LOD
                 // and no other LOD was selected. Original should be visible.
                 original.visible = true; // Fallback, show original if nothing else
                 if (original.visible) visibleMeshesThisFrame++;
             }


            if (this.useClustering) { /* ... update cluster visibility ... */ }
        });
        return { activeLODs: activeLODCount, visibleMeshesThisFrame: visibleMeshesThisFrame, processedMeshes: this.meshes.size };
    }

    toggleDebug(visible) {
        this.debugMode = visible;
        this.debugGroup.visible = visible;
        this.meshes.forEach(naniteData => {
            naniteData.lods.forEach(lod => {
                if (!naniteData.options.preserveMaterials && lod.mesh !== naniteData.originalMesh) {
                     (Array.isArray(lod.mesh.material) ? lod.mesh.material : [lod.mesh.material])
                    .forEach(m => { if(m.wireframe !== undefined) m.wireframe = this.debugMode; });
                }
            });
            if (this.useClustering) {
                naniteData.clusters.forEach(c => {if(c.debugMesh) c.debugMesh.visible = this.debugMode;});
            }
        });
    }

    setEnabled(state) {
        this.enabled = state;
        if (!state) {
            this.meshes.forEach(naniteData => {
                naniteData.originalMesh.visible = true;
                naniteData.lods.forEach(lod => {
                    if (lod.mesh !== naniteData.originalMesh) lod.mesh.visible = false;
                });
            });
            this.debugGroup.visible = false;
        } else {
            this.debugGroup.visible = this.debugMode;
            this.update(); // Perform an initial update to set correct LODs
        }
    }

    markForUpdate(mesh) { // Call this if a 'static' nanite object is moved externally
        const naniteData = this.meshes.get(mesh.uuid);
        if (naniteData) {
            naniteData.needsTransformUpdate = true;
        }
    }
}
// === END NANITE-LIKE LOD SYSTEM ===
