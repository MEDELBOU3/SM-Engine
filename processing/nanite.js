// =========================================================================
// === NANITE-LIKE LOD SYSTEM (to be placed before your init() function) ===
// =========================================================================

// =========================================================================
// === NANITE-LIKE LOD SYSTEM (to be placed before your init() function) ===
// =========================================================================

// Ensure THREE is globally available, or import it if using modules
// The script tags you provided make these available on the global THREE object:
// THREE.BufferGeometryUtils
// THREE.SimplifyModifier
// THREE.SubdivisionModifier (not directly used by Nanite here, but available)

class NaniteSystem {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.meshes = new Map(); // Stores { uuid: naniteData }
        this.lodLevels = 4; // Number of LODs to generate (including original)
        this.baseLODDistance = 20; // Distance at which LOD 0 (full detail) switches to LOD 1
        this.lodDistanceMultiplier = 2.0; // Multiplier for subsequent LOD distances
        this.frustumCullLODs = true; // Enable frustum culling for LOD meshes
        this.debugMode = false; // Show debug info (e.g., wireframes, colors)
        this.enabled = true; // Toggle the entire Nanite system on/off

        // Internal helper for frustum culling
        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();

        this.simplifyModifier = null;
        if (typeof THREE.SimplifyModifier === 'undefined') {
            console.error("THREE.SimplifyModifier is not loaded. NaniteSystem requires it for LOD generation.");
        } else {
            this.simplifyModifier = new THREE.SimplifyModifier();
        }

        // Debug visualization colors for LOD levels
        this.debugLODColors = [
            new THREE.Color(0x00ff00), // LOD 0 (Green)
            new THREE.Color(0x0000ff), // LOD 1 (Blue)
            new THREE.Color(0xffff00), // LOD 2 (Yellow)
            new THREE.Color(0xff0000), // LOD 3 (Red)
            new THREE.Color(0x800080)  // LOD 4+ (Purple)
        ];
        this.originalMaterials = new Map(); // Stores original materials for debug toggle

        this.totalOriginalTriangles = 0; // Cumulative count of original triangles
        this.visibleTrianglesThisFrame = 0; // Triangles rendered this frame from Nanite meshes

        this.init();
    }

    init() {
        this.debugGroup = new THREE.Group();
        this.debugGroup.name = "NaniteDebugGroup";
        this.debugGroup.visible = this.debugMode;
        this.scene.add(this.debugGroup);
    }

    /**
     * Adds a mesh to be managed by the Nanite system.
     * @param {THREE.Mesh} originalMesh The mesh to add.
     * @param {object} options Configuration for this mesh's LODs.
     * @param {boolean} [options.autoGenerateLODs=true] Whether to automatically generate LODs.
     * @param {boolean} [options.isStatic=false] If true, LODs transforms are updated only when explicitly marked.
     * @param {boolean} [options.preserveMaterials=true] If true, clones original material; otherwise, uses a generic material.
     * @param {THREE.Mesh[]} [options.customLODs=null] Array of pre-made LOD meshes.
     * @param {number} [options.maxLODLevels=this.lodLevels] Override default number of LODs for this mesh.
     * @returns {object|null} The naniteData object or null if failed.
     */
    addMesh(originalMesh, options = {}) {
        if (!this.enabled || !originalMesh.geometry || !this.simplifyModifier) {
            if (!this.simplifyModifier) console.warn("NaniteSystem: SimplifyModifier not available, cannot add mesh:", originalMesh.name);
            return null;
        }
        if (originalMesh.userData.isNaniteOriginal || originalMesh.userData.isNaniteLOD || originalMesh.name === "NaniteDebugGroup") {
            return this.meshes.get(originalMesh.uuid) || null; // Already managed
        }

        const uuid = originalMesh.uuid;
        if (this.meshes.has(uuid)) {
            console.warn("NaniteSystem: Mesh already added.", originalMesh.name);
            return this.meshes.get(uuid);
        }

        // Pre-process geometry: merge duplicate vertices for better simplification results
        let processedGeometry = originalMesh.geometry;
        if (typeof THREE.BufferGeometryUtils !== 'undefined' && processedGeometry.isBufferGeometry) {
            // Apply mergeVertices, but ensure we don't modify the original geometry if it's shared
            if (originalMesh.geometry.userData.merged === true) {
                 // Already merged, or marked as such
            } else {
                console.log(`NaniteSystem: Merging vertices for ${originalMesh.name || originalMesh.uuid}...`);
                processedGeometry = THREE.BufferGeometryUtils.mergeVertices(processedGeometry);
                processedGeometry.userData.merged = true; // Mark as merged to avoid re-processing
            }
        }
        
        // Ensure geometry has bounding sphere for culling and LOD distance calculation
        if (!processedGeometry.boundingSphere) {
            processedGeometry.computeBoundingSphere();
        }
        
        // Count original triangles
        const originalTriangles = processedGeometry.index ? processedGeometry.index.count / 3 : processedGeometry.attributes.position.count / 3;
        this.totalOriginalTriangles += originalTriangles;


        // Scale radius by max scale factor to get a better effective size for LOD calculation
        const boundingSphereRadius = processedGeometry.boundingSphere.radius *
                                     Math.max(originalMesh.scale.x, originalMesh.scale.y, originalMesh.scale.z);

        const naniteData = {
            originalMesh: originalMesh,
            processedGeometry: processedGeometry, // Store the pre-processed geometry
            originalTriangles: originalTriangles,
            lods: [], // Array of { mesh, distanceThreshold, level }
            options: {
                autoGenerateLODs: options.autoGenerateLODs ?? true,
                isStatic: options.isStatic ?? false,
                preserveMaterials: options.preserveMaterials ?? true,
                customLODs: options.customLODs ?? null,
                maxLODLevels: options.maxLODLevels ?? this.lodLevels,
            },
            currentLODLevel: -1, // -1 means no LOD active, or original
            boundingSphereRadius: boundingSphereRadius,
            lastMatrixWorld: new THREE.Matrix4().copy(originalMesh.matrixWorld),
            needsTransformUpdate: true, // Force initial transform sync
            isLODGenerationComplete: false, // Flag for chunked generation
            lodGenerationStep: 0, // Current step for chunked generation
        };

        originalMesh.userData.isNaniteOriginal = true;
        
        // Store original materials for debug toggle
        this.originalMaterials.set(originalMesh.uuid, Array.isArray(originalMesh.material) ? originalMesh.material.map(m => m.clone()) : originalMesh.material.clone());

        if (naniteData.options.customLODs && Array.isArray(naniteData.options.customLODs)) {
            this.processCustomLODs(naniteData, naniteData.options.customLODs);
            naniteData.isLODGenerationComplete = true;
        } else if (naniteData.options.autoGenerateLODs) {
            // Initiate chunked LOD generation
            this.generateLODsChunked(naniteData);
        } else {
            // No custom LODs, no auto-gen, just add original as sole "LOD"
            originalMesh.userData.lodLevel = 0;
            naniteData.lods.push({
                mesh: originalMesh,
                distanceThreshold: this.baseLODDistance,
                level: 0,
                triangles: originalTriangles // Store triangle count for stats
            });
            originalMesh.visible = true; // Ensure original is visible if no LODs
            naniteData.isLODGenerationComplete = true;
        }
        
        // Initially hide the original mesh if LODs are expected to be generated.
        // The update loop will make the correct LOD visible.
        if (!naniteData.isLODGenerationComplete) { // If generation is ongoing
            originalMesh.visible = false;
        }

        this.meshes.set(uuid, naniteData);
        console.log(`NaniteSystem: Added mesh ${originalMesh.name || uuid}, initiated LOD processing.`);
        return naniteData;
    }

    /**
     * Removes a mesh and its generated LODs from the Nanite system and scene.
     * @param {THREE.Mesh} meshToRemove The original mesh to remove.
     */
    removeMesh(meshToRemove) {
        const naniteData = this.meshes.get(meshToRemove.uuid);
        if (naniteData) {
            // Deduct triangles from total
            this.totalOriginalTriangles -= naniteData.originalTriangles;

            // Restore original mesh visibility and clear user data
            naniteData.originalMesh.visible = true;
            naniteData.originalMesh.userData.isNaniteOriginal = false;
            if (naniteData.originalMesh.userData.lodLevel !== undefined) delete naniteData.originalMesh.userData.lodLevel;

            // Remove all LOD meshes (except original if it's the same object)
            naniteData.lods.forEach(lod => {
                if (lod.mesh !== naniteData.originalMesh) {
                    this.scene.remove(lod.mesh);
                    if (lod.mesh.geometry) lod.mesh.geometry.dispose();
                    if (lod.mesh.material) {
                        const materials = Array.isArray(lod.mesh.material) ? lod.mesh.material : [lod.mesh.material];
                        materials.forEach(m => m.dispose());
                    }
                } else {
                    lod.mesh.visible = true;
                }
                this.originalMaterials.delete(lod.mesh.uuid); // Clean up original materials map
            });
            
            this.meshes.delete(meshToRemove.uuid);
            console.log(`NaniteSystem: Removed mesh ${meshToRemove.name || meshToRemove.uuid} and its LODs.`);
        }
    }

    /**
     * Processes custom (pre-made) LOD meshes.
     */
    processCustomLODs(naniteData, customLODMeshes) {
        naniteData.lods.push({
            mesh: naniteData.originalMesh,
            distanceThreshold: this.baseLODDistance,
            level: 0,
            triangles: naniteData.originalTriangles
        });

        customLODMeshes.forEach((lodMesh, index) => {
            if (!lodMesh.geometry.boundingSphere) lodMesh.geometry.computeBoundingSphere();
            const distanceThreshold = this.baseLODDistance * Math.pow(this.lodDistanceMultiplier, index + 1);
            const triangles = lodMesh.geometry.index ? lodMesh.geometry.index.count / 3 : lodMesh.geometry.attributes.position.count / 3;

            lodMesh.visible = false;
            lodMesh.userData.isNaniteLOD = true;
            lodMesh.userData.lodLevel = index + 1;
            this.syncTransform(lodMesh, naniteData.originalMesh);
            this.scene.add(lodMesh);
            naniteData.lods.push({ mesh: lodMesh, distanceThreshold: distanceThreshold, level: index + 1, triangles: triangles });
            this.originalMaterials.set(lodMesh.uuid, Array.isArray(lodMesh.material) ? lodMesh.material.map(m => m.clone()) : lodMesh.material.clone());
        });
        naniteData.lods.sort((a, b) => a.distanceThreshold - b.distanceThreshold);
    }

    /**
     * Generates LODs in a chunked, non-blocking manner on the main thread.
     */
    generateLODsChunked(naniteData) {
        const originalMesh = naniteData.originalMesh;
        const processedGeometry = naniteData.processedGeometry; // Use pre-processed geometry
        const originalMaterial = originalMesh.material;
        const numLODsToGenerate = naniteData.options.maxLODLevels;

        // Add original mesh as LOD 0 immediately if not already added
        if (!naniteData.lods.some(lod => lod.mesh === originalMesh)) {
            naniteData.lods.push({
                mesh: originalMesh,
                distanceThreshold: this.baseLODDistance,
                level: 0,
                triangles: naniteData.originalTriangles
            });
            originalMesh.userData.lodLevel = 0;
            // The original mesh should be hidden if LODs are being generated for it
            originalMesh.visible = false;
        }


        const generateNextLOD = () => {
            if (naniteData.lodGenerationStep >= numLODsToGenerate) {
                naniteData.lods.sort((a, b) => a.distanceThreshold - b.distanceThreshold);
                naniteData.isLODGenerationComplete = true;
                console.log(`NaniteSystem: All LODs generated for ${originalMesh.name || originalMesh.uuid}.`);
                return;
            }

            const i = naniteData.lodGenerationStep;
            naniteData.lodGenerationStep++;

            // If it's LOD 0, it's already added. Continue to next step.
            if (i === 0) {
                 // Schedule next LOD generation in the next animation frame
                 setTimeout(generateNextLOD, 0);
                 return;
            }


            const targetTriangleCountOriginal = processedGeometry.index ? processedGeometry.index.count / 3 : processedGeometry.attributes.position.count / 3;
            const simplificationRatio = Math.pow(0.55, i); // Adjust for desired reduction
            const count = Math.max(20, Math.floor(targetTriangleCountOriginal * simplificationRatio));

            let simplifiedGeom;
            if (targetTriangleCountOriginal <= count * 1.2 && i > 0) {
                // If simplification target is too close to current, just clone previous LOD's geometry
                console.warn(`NaniteSystem: Skipping simplification for LOD ${i} on ${originalMesh.name || 'mesh'}, target count too high. Cloning previous LOD geometry.`);
                simplifiedGeom = naniteData.lods[i-1].mesh.geometry.clone();
            } else {
                try {
                    simplifiedGeom = this.simplifyModifier.modify(processedGeometry, count);
                    if (!simplifiedGeom) throw new Error("SimplifyModifier returned null");
                    // Recompute normals after simplification for correct lighting
                    simplifiedGeom.computeVertexNormals();
                } catch (error) {
                    console.error(`NaniteSystem: Error simplifying for LOD ${i} on ${originalMesh.name || 'mesh'}:`, error);
                    simplifiedGeom = processedGeometry.clone(); // Fallback to original
                }
            }

            if (!simplifiedGeom.boundingSphere) simplifiedGeom.computeBoundingSphere();
            const triangles = simplifiedGeom.index ? simplifiedGeom.index.count / 3 : simplifiedGeom.attributes.position.count / 3;
            const material = naniteData.options.preserveMaterials ?
                             (Array.isArray(originalMaterial) ? originalMaterial.map(m=>m.clone()) : originalMaterial.clone()) :
                             new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff }); // Use random color for default non-preserved

            const lodMesh = new THREE.Mesh(simplifiedGeom, material);
            lodMesh.name = `${originalMesh.name || 'NaniteObj'}_LOD${i}`;
            lodMesh.visible = false;
            lodMesh.userData.isNaniteLOD = true;
            lodMesh.userData.lodLevel = i;
            this.syncTransform(lodMesh, originalMesh);
            lodMesh.matrixAutoUpdate = naniteData.options.isStatic ? false : true;

            this.scene.add(lodMesh);
            naniteData.lods.push({
                mesh: lodMesh,
                distanceThreshold: this.baseLODDistance * Math.pow(this.lodDistanceMultiplier, i),
                level: i,
                triangles: triangles
            });
            this.originalMaterials.set(lodMesh.uuid, Array.isArray(lodMesh.material) ? lodMesh.material.map(m => m.clone()) : lodMesh.material.clone());

            // Schedule next LOD generation in the next animation frame
            setTimeout(generateNextLOD, 0);
        };

        // Start the generation process
        setTimeout(generateNextLOD, 0);
    }
    
    /**
     * Synchronizes the transform of a target mesh with a source mesh.
     * @param {THREE.Mesh} targetMesh The mesh to update.
     * @param {THREE.Mesh} sourceMesh The source of the transform.
     */
    syncTransform(targetMesh, sourceMesh) {
        targetMesh.position.copy(sourceMesh.position);
        targetMesh.quaternion.copy(sourceMesh.quaternion);
        targetMesh.scale.copy(sourceMesh.scale);
        targetMesh.updateMatrixWorld(true); // Force update matrixWorld
    }

    /**
     * Updates the LOD for all managed meshes based on camera distance and frustum.
     * @returns {object} Statistics about active LODs.
     */
    update() {
        if (!this.enabled || !this.camera) return { activeLODs: 0, visibleMeshesThisFrame: 0, processedMeshes: 0, totalOriginalTriangles: 0, visibleTriangles: 0 };

        const cameraPosition = this.camera.position;
        
        // Update frustum for culling
        this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

        let activeLODCount = 0;
        let visibleMeshesThisFrame = 0;
        this.visibleTrianglesThisFrame = 0; // Reset for this frame

        this.meshes.forEach(naniteData => {
            const original = naniteData.originalMesh;

            // Remove mesh if its original is no longer in the scene
            if (!original.parent) {
                this.removeMesh(original);
                return;
            }

            // Skip if LOD generation is not complete
            if (!naniteData.isLODGenerationComplete) {
                original.visible = false; // Keep original hidden while LODs are generating
                return;
            }

            // Update transforms for dynamic or moved static objects
            if (!naniteData.options.isStatic || naniteData.needsTransformUpdate) {
                if (!original.matrixWorld.equals(naniteData.lastMatrixWorld) || naniteData.needsTransformUpdate) {
                    naniteData.lods.forEach(lod => {
                        if (lod.mesh !== original) { // Only update LOD copies, original updates itself
                           this.syncTransform(lod.mesh, original);
                        }
                    });
                    naniteData.lastMatrixWorld.copy(original.matrixWorld);
                }
                naniteData.needsTransformUpdate = false;
            }

            const objectCenterWorld = new THREE.Vector3().setFromMatrixPosition(original.matrixWorld);
            const distanceToCamera = cameraPosition.distanceTo(objectCenterWorld);
            
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
                if (!selectedLOD) {
                    selectedLOD = naniteData.lods[naniteData.lods.length - 1];
                }
            }

            let anyLODVisibleThisFrame = false;
            naniteData.lods.forEach((lod) => {
                const shouldBeVisible = (lod === selectedLOD);
                let frustumVisible = true;

                if (shouldBeVisible && this.frustumCullLODs && lod.mesh.geometry.boundingSphere) {
                    const sphere = lod.mesh.geometry.boundingSphere.clone();
                    sphere.applyMatrix4(lod.mesh.matrixWorld);
                    frustumVisible = this.frustum.intersectsSphere(sphere);
                }

                const finalVisibility = shouldBeVisible && frustumVisible;

                if (lod.mesh.visible !== finalVisibility) {
                    lod.mesh.visible = finalVisibility;
                }
                if (finalVisibility) {
                    activeLODCount++;
                    visibleMeshesThisFrame++;
                    this.visibleTrianglesThisFrame += lod.triangles; // Accumulate triangles
                    anyLODVisibleThisFrame = true;
                }
            });
            
            if (!anyLODVisibleThisFrame && original.visible) {
                 original.visible = false;
            }
        });
        return {
            activeLODs: activeLODCount,
            visibleMeshesThisFrame: visibleMeshesThisFrame,
            processedMeshes: this.meshes.size,
            totalOriginalTriangles: this.totalOriginalTriangles,
            visibleTriangles: this.visibleTrianglesThisFrame
        };
    }

    /**
     * Toggles debug visualization for LODs.
     * @param {boolean} visible If true, enables debug mode.
     */
    toggleDebug(visible) {
        this.debugMode = visible;
        this.debugGroup.visible = visible;
        
        this.meshes.forEach(naniteData => {
            naniteData.lods.forEach(lod => {
                const mesh = lod.mesh;
                const originalMats = this.originalMaterials.get(mesh.uuid);
                
                if (!originalMats) return;

                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                const originalMaterialsArray = Array.isArray(originalMats) ? originalMats : [originalMats];

                materials.forEach((m, idx) => {
                    if (visible) {
                        m.emissive.copy(this.debugLODColors[lod.level % this.debugLODColors.length]);
                        m.emissiveIntensity = 0.8;
                        if (m.wireframe !== undefined) m.wireframe = true;
                    } else {
                        const originalMat = originalMaterialsArray[idx];
                        if (originalMat) {
                            m.copy(originalMat);
                        } else {
                            m.emissive.setHex(0x000000);
                            if (m.wireframe !== undefined) m.wireframe = false;
                        }
                    }
                    m.needsUpdate = true;
                });
            });
        });
    }

    /**
     * Enables or disables the Nanite system.
     * @param {boolean} state If true, enables the system.
     */
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

    /**
     * Marks a mesh for transform update in the next frame.
     * Use this if a static Nanite-managed mesh is moved externally (e.g., by TransformControls).
     * @param {THREE.Mesh} mesh The mesh to mark.
     */
    markForUpdate(mesh) {
        const naniteData = this.meshes.get(mesh.uuid);
        if (naniteData) {
            naniteData.needsTransformUpdate = true;
        }
    }
}
// === END NANITE-LIKE LOD SYSTEM ===

let simplifyModifier;

self.onmessage = (e) => {
    const { type, geometry, numLODs, simplifyModifierPath } = e.data;

    if (type === 'generateLODs') {
        if (!simplifyModifier) {
            // Dynamically import SimplifyModifier if not already loaded
            // This might require a build step for module workers depending on browser support
            try {
                importScripts(simplifyModifierPath); // For older worker setups
                simplifyModifier = new SimplifyModifier();
            } catch (error) {
                console.error("Worker failed to import SimplifyModifier:", error);
                self.postMessage({ type: 'error', message: 'Failed to load SimplifyModifier in worker.' });
                return;
            }
        }
        
        const originalGeom = new BufferGeometry().fromJSON(geometry);
        const targetTriangleCountOriginal = originalGeom.index ? originalGeom.index.count / 3 : originalGeom.attributes.position.count / 3;

        for (let i = 1; i < numLODs; i++) {
            const simplificationRatio = Math.pow(0.55, i);
            const count = Math.max(20, Math.floor(targetTriangleCountOriginal * simplificationRatio));

            let simplifiedGeom;
            try {
                simplifiedGeom = simplifyModifier.modify(originalGeom, count);
                if (!simplifiedGeom) throw new Error("SimplifyModifier returned null");
                
                self.postMessage({
                    type: 'lodGenerated',
                    lodLevel: i,
                    simplifiedGeometryData: simplifiedGeom.toJSON()
                });
            } catch (error) {
                console.error(`Worker: Error simplifying for LOD ${i}:`, error);
                self.postMessage({ type: 'error', message: `LOD ${i} simplification failed.` });
                // Attempt to continue with other LODs if possible, or break
                break; 
            }
        }
    }
};
/*class NaniteSystem {
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

    createClusters(naniteData) { }

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


            if (this.useClustering) { }
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
}*/
// === END NANITE-LIKE LOD SYSTEM ===