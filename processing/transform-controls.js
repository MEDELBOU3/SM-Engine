// Snapping System
let snappingEnabled = true;
let snappingHandler = null;
function enableSnapping() {
    snappingEnabled = !snappingEnabled;

    const menuItem = document.getElementById('enable-snapping');

    if (snappingEnabled) {
        const gridSize = 1; // Set your grid size here
        snappingHandler = () => {
            if (selectedObject) {
                selectedObject.position.x = Math.round(selectedObject.position.x / gridSize) * gridSize;
                selectedObject.position.y = Math.round(selectedObject.position.y / gridSize) * gridSize;
                selectedObject.position.z = Math.round(selectedObject.position.z / gridSize) * gridSize;
            }
        };
        transformControls.addEventListener('change', snappingHandler);
        console.log('Snapping Enabled');
        if (menuItem) menuItem.textContent = 'Disable Snapping';
    } else {
        if (snappingHandler) {
            transformControls.removeEventListener('change', snappingHandler);
            snappingHandler = null;
        }
        console.log('Snapping Disabled');
        if (menuItem) menuItem.textContent = 'Enable Snapping';
    }
}


// Advanced Object Manipulation
function mirrorObject(axis = 'x') {
    if (!selectedObject) return;
    const clone = selectedObject.clone();
    clone.scale[axis] *= -1;
    addObjectToScene(clone);
    recordHistoryAction('Mirror', clone.name);
}

function createArray() {
    if (!selectedObject) return;
    const count = 3; // Can be made configurable
    const spacing = 2;

    for (let i = 1; i <= count; i++) {
        const clone = selectedObject.clone();
        clone.position.x += spacing * i;
        addObjectToScene(clone);
        recordHistoryAction('Array', clone.name);
    }
}

// Clipboard Operations
let clipboardData = null;

function setupClipboardOperations() {
    // Object manipulation handler with history logging
    function handleObjectAction(type, callback) {
        return () => {
            if (!selectedObject && type !== 'Paste') return;
            const objectName = type === 'Paste' ? clipboardData?.name : selectedObject.name;
            let undoAction = null;
            let redoAction = null;

            if (type === 'Delete') {
                const index = objects.indexOf(selectedObject);
                undoAction = () => {
                    if (index > -1) {
                        objects.splice(index, 0, selectedObject);
                        scene.add(selectedObject);
                    }
                };
                redoAction = () => {
                    if (index > -1) {
                        objects.splice(index, 1);
                        scene.remove(selectedObject);
                    }
                };
            }

            callback();
            recordHistoryAction(type, objectName, undoAction, redoAction);
        };
    }

    // Clipboard and object manipulation functions
    const clipboardActions = {
        copy: handleObjectAction('Copy', () => {
            if (selectedObject) {
                clipboardData = selectedObject.clone();
                console.log('Copied:', clipboardData); // Debug
            }
        }),
        paste: handleObjectAction('Paste', () => {
            if (clipboardData) {
                const pastedObject = clipboardData.clone();
                pastedObject.position.x += 1;
                pastedObject.name = pastedObject.name.replace(/\d+$/, '') + '_' + objects.length;
                addObjectToScene(pastedObject);
                console.log('Pasted:', pastedObject); // Debug
            }
        }),
        delete: handleObjectAction('Delete', () => {
            if (selectedObject) {
                const index = objects.indexOf(selectedObject);
                if (index > -1) {
                    if (selectedObject.helper) {
                        scene.remove(selectedObject.helper);
                        selectedObject.helper.dispose();
                    }
                    selectedObject.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.geometry.dispose();
                            child.material.dispose();
                        }
                    });
                    objects.splice(index, 1);
                    scene.remove(selectedObject);
                    transformControls.detach();
                    if (selectedObject instanceof THREE.Camera && activeCamera === selectedObject) {
                        activeCamera = null;
                    }
                    selectedObject = null;
                    updateHierarchy();
                    console.log('Deleted object'); // Debug
                }
            }
        }),
        duplicate: handleObjectAction('Duplicate', () => {
            if (selectedObject) {
                const duplicate = selectedObject.clone();
                duplicate.position.x += 1;
                duplicate.name = duplicate.name.replace(/\d+$/, '') + '_' + objects.length;
                addObjectToScene(duplicate);
                console.log('Duplicated:', duplicate); // Debug
            }
        })
    };

    // Context menu configuration
    const contextMenuConfig = [
        { label: 'Copy (Ctrl+C)', action: clipboardActions.copy, id: 'context-copy' },
        { label: 'Paste (Ctrl+V)', action: clipboardActions.paste, id: 'context-paste' },
        { label: 'Delete (Del)', action: clipboardActions.delete, id: 'context-delete' },
        { label: 'Duplicate (Ctrl+D)', action: clipboardActions.duplicate, id: 'context-duplicate' },
        {
            label: 'Transform Controls',
            subMenu: [
                { label: 'Translate', action: () => setTransformMode('translate'), id: 'context-translate' },
                { label: 'Rotation', action: () => setTransformMode('rotate'), id: 'context-rotate' },
                { label: 'Scale', action: () => setTransformMode('scale'), id: 'context-scale' }
            ]
        },
        {
            label: 'Utility Tools',
            subMenu: [
                { label: 'Enable Snapping', action: enableSnapping, id: 'enable-snapping' },
                { label: 'Optimize Scene', action: optimizeScene, id: 'optimize-scene' },
                { label: 'Mirror Object', action: () => mirrorObject(), id: 'mirror-object' },
                { label: 'Create Array', action: createArray, id: 'create-array' },
                { label: 'Clear History', action: clearHistory, id: 'clear-history' }
            ]
        }
    ];

    // Generate context menu dynamically
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.innerHTML = contextMenuConfig.map(item => `
            <div class="context-menu-item" ${item.id ? `id="${item.id}"` : ''} ${item.subMenu ? 'data-submenu="true"' : ''}>
                ${item.label}
                ${item.subMenu ? '<i class="fa-solid fa-caret-right" style="margin-left: 20px;"></i>' : ''}
                ${item.subMenu ? `
                    <div class="sub-menu">
                        ${item.subMenu.map(subItem => `
                            <div class="context-menu-item" id="${subItem.id}">${subItem.label}</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Attach event listeners for all items
        contextMenuConfig.forEach(item => {
            if (item.id) {
                const element = document.getElementById(item.id);
                if (element) {
                    element.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent click from hiding menu immediately
                        item.action();
                    });
                }
            }
            if (item.subMenu) {
                item.subMenu.forEach(subItem => {
                    const subElement = document.getElementById(subItem.id);
                    if (subElement) {
                        subElement.addEventListener('click', (e) => {
                            e.stopPropagation();
                            subItem.action();
                        });
                    }
                });
            }
        });
    }

    // Keyboard shortcuts (unchanged)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'c': e.preventDefault(); clipboardActions.copy(); break;
                case 'v': e.preventDefault(); clipboardActions.paste(); break;
                case 'd': e.preventDefault(); clipboardActions.duplicate(); break;
            }
        }
        if (e.key === 'Delete') {
            clipboardActions.delete();
        }
    });

    // Expose functions globally (unchanged)
    Object.assign(window, {
        copyObject: clipboardActions.copy,
        pasteObject: clipboardActions.paste,
        deleteObject: clipboardActions.delete,
        duplicateObject: clipboardActions.duplicate,
        enableSnapping,
        optimizeScene,
        mirrorObject,
        createArray,
        clearHistory
    });
}



// During initialization
function optimizeScene() {
    // Track performance stats
    const stats = {
        originalVertexCount: 0,
        optimizedVertexCount: 0,
        mergedObjects: 0,
        lodObjects: 0,
        instancedObjects: 0
    };
    
    // Object pool for efficient object reuse
    const objectPool = {
        geometries: {},
        materials: {},
        instancedMeshes: {}
    };

    // Store objects by material for intelligent merging
    const objectsByMaterial = new Map();
    const staticObjects = [];
    const dynamicObjects = [];
    
    // Frustum culling optimization
    function setupFrustumCulling() {
        const frustum = new THREE.Frustum();
        const projScreenMatrix = new THREE.Matrix4();
        
        return function updateFrustumCulling() {
            camera.updateMatrixWorld();
            projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(projScreenMatrix);
            
            scene.traverse((object) => {
                if (object.isMesh && object.userData.enableFrustumCulling !== false) {
                    if (!object.geometry.boundingSphere) {
                        object.geometry.computeBoundingSphere();
                    }
                    
                    // Only update visibility if object is potentially visible
                    const boundingSphere = object.geometry.boundingSphere.clone();
                    boundingSphere.applyMatrix4(object.matrixWorld);
                    
                    object.visible = frustum.intersectsSphere(boundingSphere);
                }
            });
        };
    }
    
    // Setup occlusion culling
    function setupOcclusionCulling() {
        const occlusionComposer = new THREE.EffectComposer(renderer);
        const occlusionPass = new THREE.OcclusionPass(scene, camera);
        occlusionComposer.addPass(occlusionPass);
        
        return function updateOcclusionCulling() {
            occlusionComposer.render();
            // Objects are automatically culled by the occlusion pass
        };
    }
    
    // Intelligent geometry merging function
    function mergeGeometries() {
        console.log("Analyzing scene for merge opportunities...");
        
        // Identify static meshes that can be merged
        scene.traverse((object) => {
            if (!object.isMesh || object.userData.preventMerge) return;
            
            // Skip objects that need individual manipulation
            if (object.userData.interactive || object.userData.physicsBody) {
                dynamicObjects.push(object);
                return;
            }
            
            // Group by material for efficient merging
            const materialId = object.material.uuid;
            if (!objectsByMaterial.has(materialId)) {
                objectsByMaterial.set(materialId, []);
            }
            objectsByMaterial.get(materialId).push(object);
            staticObjects.push(object);
            
            // Track original vertex count
            if (object.geometry.attributes.position) {
                stats.originalVertexCount += object.geometry.attributes.position.count;
            }
        });
        
        // Only merge objects sharing the same material
        objectsByMaterial.forEach((objects, materialId) => {
            // Skip if there's only one object with this material
            if (objects.length <= 1) return;
            
            // Skip small groups where merging won't help much
            if (objects.length < 3) return;
            
            console.log(`Merging ${objects.length} objects with material ${materialId}`);
            
            const geometries = [];
            const matrices = [];
            
            objects.forEach(object => {
                const clonedGeometry = object.geometry.clone();
                geometries.push(clonedGeometry);
                matrices.push(object.matrixWorld.clone());
                
                // Hide original but don't remove yet (in case merge fails)
                object.visible = false;
            });
            
            try {
                // Apply transformations to geometries before merging
                for (let i = 0; i < geometries.length; i++) {
                    geometries[i].applyMatrix4(matrices[i]);
                }
                
                // Merge geometries
                const mergedGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
                if (!mergedGeometry) {
                    console.warn("Failed to merge geometries, reverting to originals");
                    objects.forEach(obj => obj.visible = true);
                    return;
                }
                
                // Create merged mesh
                const mergedMesh = new THREE.Mesh(mergedGeometry, objects[0].material.clone());
                mergedMesh.userData.merged = true;
                mergedMesh.userData.originalCount = objects.length;
                mergedMesh.castShadow = objects[0].castShadow;
                mergedMesh.receiveShadow = objects[0].receiveShadow;
                
                // Optimize the merged geometry
                mergedGeometry.attributes.position.needsUpdate = true;
                if (mergedGeometry.attributes.normal) {
                    mergedGeometry.attributes.normal.needsUpdate = true;
                }
                mergedGeometry.computeBoundingSphere();
                mergedGeometry.computeBoundingBox();
                
                // Add merged mesh to scene
                scene.add(mergedMesh);
                
                // Now remove original objects
                objects.forEach(obj => {
                    if (obj.parent) obj.parent.remove(obj);
                    if (obj.geometry) obj.geometry.dispose();
                });
                
                stats.mergedObjects += objects.length;
                stats.optimizedVertexCount += mergedGeometry.attributes.position.count;
            } catch (error) {
                console.error("Error during geometry merging:", error);
                objects.forEach(obj => obj.visible = true);
            }
        });
        
        console.log(`Merged ${stats.mergedObjects} objects into ${objectsByMaterial.size} groups`);
    }
    
    // Advanced LOD implementation with geometry simplification
    function implementLOD(object) {
        if (!object.isMesh || object.userData.preventLOD) return;
        
        // Skip already processed or merged objects
        if (object.isLOD || object.parent?.isLOD || object.userData.merged) return;
        
        try {
            const geometry = object.geometry;
            const vertexCount = geometry.attributes.position.count;
            
            // Only apply LOD for complex geometries
            if (vertexCount < 1000) return;
            
            console.log(`Creating LOD for object with ${vertexCount} vertices`);
            
            const lod = new THREE.LOD();
            lod.position.copy(object.position);
            lod.rotation.copy(object.rotation);
            lod.scale.copy(object.scale);
            
            // Original high quality mesh (level 0)
            object.geometry = geometry.clone(); // Clone to prevent issues
            lod.addLevel(object, 0);
            
            // Create medium quality level (50% reduction)
            const mediumDetail = Math.max(100, Math.floor(vertexCount * 0.5));
            const mediumGeometry = geometry.clone();
            
            // Use more advanced decimation for high-poly models
            let modifier;
            if (window.THREE.SimplifyModifier) {
                modifier = new THREE.SimplifyModifier();
                const mediumSimplified = modifier.modify(mediumGeometry, mediumDetail);
                const mediumMesh = new THREE.Mesh(mediumSimplified, object.material.clone());
                mediumMesh.castShadow = object.castShadow;
                mediumMesh.receiveShadow = object.receiveShadow;
                lod.addLevel(mediumMesh, 50);
            }
            
            // Create low quality level (90% reduction)
            const lowDetail = Math.max(50, Math.floor(vertexCount * 0.1));
            const lowGeometry = geometry.clone();
            
            if (window.THREE.SimplifyModifier) {
                const lowSimplified = modifier.modify(lowGeometry, lowDetail);
                const lowMesh = new THREE.Mesh(lowSimplified, object.material.clone());
                lowMesh.castShadow = object.castShadow;
                lowMesh.receiveShadow = object.receiveShadow;
                lod.addLevel(lowMesh, 150);
            }
            
            // Add lowest level (billboard or very simplified)
            if (vertexCount > 10000) {
                const lowestDetail = Math.max(20, Math.floor(vertexCount * 0.01));
                const lowestGeometry = geometry.clone();
                
                if (window.THREE.SimplifyModifier) {
                    const lowestSimplified = modifier.modify(lowestGeometry, lowestDetail);
                    const lowestMesh = new THREE.Mesh(lowestSimplified, object.material.clone());
                    lowestMesh.castShadow = false; // Disable shadows for distant objects
                    lowestMesh.receiveShadow = false;
                    lod.addLevel(lowestMesh, 300);
                }
            }
            
            // Replace original object with LOD in scene
            if (object.parent) {
                object.parent.add(lod);
                object.parent.remove(object);
                stats.lodObjects++;
            }
        } catch (error) {
            console.error("Error creating LOD:", error);
        }
    }
   
    
    // Material optimization
    function optimizeMaterials() {
        const materialCache = new Map();
        
        scene.traverse((object) => {
            if (!object.isMesh || !object.material) return;
            
            // Handle material arrays
            if (Array.isArray(object.material)) {
                object.material = object.material.map(processMaterial);
            } else {
                object.material = processMaterial(object.material);
            }
        });
        
        // Process and optimize a single material
        function processMaterial(material) {
            const materialId = material.uuid;
            
            // Return cached instance if available
            if (materialCache.has(materialId)) {
                return materialCache.get(materialId);
            }
            
            // Clone to avoid modifying original
            const optimized = material.clone();
            
            // Optimize textures
            if (optimized.map) {
                optimized.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                optimized.map.needsUpdate = true;
            }
            
            // Reduce complexity of expensive materials
            if (optimized.type === 'MeshStandardMaterial' || optimized.type === 'MeshPhysicalMaterial') {
                // Consider downgrading distant or numerous objects to cheaper materials
                optimized.roughness = Math.max(0.1, optimized.roughness);
                optimized.metalness = Math.min(0.9, optimized.metalness);
            }
            
            // Cache and return
            materialCache.set(materialId, optimized);
            objectPool.materials[materialId] = optimized;
            return optimized;
        }
    }
    
    // Dynamic detail level control based on performance
    function setupAdaptiveDetail() {
        let frameTime = 0;
        let frameCount = 0;
        const targetFPS = 60;
        const minAcceptableFPS = 30;
        
        // Adjust detail level based on performance
        return function updateAdaptiveDetail() {
            const startTime = performance.now();
            
            // Measure frame time
            if (frameCount > 0) {
                frameTime = performance.now() - startTime;
                
                // Only adapt every 60 frames to avoid constant changes
                if (frameCount % 60 === 0) {
                    const currentFPS = 1000 / frameTime;
                    
                    // If performance is poor, reduce detail
                    if (currentFPS < minAcceptableFPS) {
                        scene.traverse((object) => {
                            if (object.isLOD) {
                                // Adjust LOD distances to show lower detail sooner
                                for (let i = 0; i < object.levels.length; i++) {
                                    object.levels[i].distance *= 0.8;
                                }
                            }
                        });
                    }
                    // If performance is good, gradually increase detail
                    else if (currentFPS > targetFPS * 0.9) {
                        scene.traverse((object) => {
                            if (object.isLOD) {
                                // Carefully increase detail
                                for (let i = 0; i < object.levels.length; i++) {
                                    object.levels[i].distance *= 1.05;
                                }
                            }
                        });
                    }
                    
                    // Log current performance status
                    console.log(`Current FPS: ${currentFPS.toFixed(1)}, Adjusting detail...`);
                }
            }
            
            frameCount++;
        };
    }
    
    // Setup worker threads for parallel processing if supported
    function setupWorkerProcessing() {
        if (window.Worker) {
            const physicWorker = new Worker('physics-worker.js');
            const geometryWorker = new Worker('geometry-worker.js');
            
            // Setup message handlers
            physicWorker.onmessage = function(e) {
                // Handle physics updates from worker
            };
            
            geometryWorker.onmessage = function(e) {
                // Handle geometry processing results
            };
            
            return {
                physicWorker,
                geometryWorker,
                
                // Method to offload physics calculations
                processPhysics: function(objects) {
                    physicWorker.postMessage({ type: 'update', objects });
                },
                
                // Method to offload heavy geometry operations
                processGeometry: function(geometry, operation) {
                    geometryWorker.postMessage({ type: operation, geometry });
                }
            };
        }
        
        return null;
    }
    
    // Apply all optimization techniques
    function applyOptimizations() {
        console.log("Starting scene optimization...");
        
        // 1. Optimize materials first (affects everything)
        optimizeMaterials();
        
        // 2. Merge static geometries
        mergeGeometries();
        
        // 3. Apply LOD to remaining complex objects
        scene.traverse(implementLOD);
        
        // 4. Create instanced meshes for repeating elements
        createInstancedMeshes();
        
        // 5. Setup pooling systems
        const getGeometry = setupGeometryPooling();
        
        // 6. Setup performance monitoring and adaptive detail
        const updateAdaptiveDetail = setupAdaptiveDetail();
        
        // 7. Setup frustum and occlusion culling
        const updateFrustumCulling = setupFrustumCulling();
        
        // 8. Setup worker processing if available
        const workers = setupWorkerProcessing();
        
        // Print optimization results
        console.log("Scene optimization complete:");
        console.log(`- Original vertex count: ${stats.originalVertexCount}`);
        console.log(`- Optimized vertex count: ${stats.optimizedVertexCount}`);
        console.log(`- Objects merged: ${stats.mergedObjects}`);
        console.log(`- Objects with LOD: ${stats.lodObjects}`);
        console.log(`- Objects instanced: ${stats.instancedObjects}`);
        
        // Return update function for render loop
        return function updateOptimizations() {
            updateFrustumCulling();
            updateAdaptiveDetail();
            
            // Process physics in worker if available
            if (workers && physicsEnabled) {
                const physicsObjects = [];
                scene.traverse((object) => {
                    if (object.userData.physicsBody) {
                        physicsObjects.push({
                            id: object.id,
                            position: object.position,
                            quaternion: object.quaternion,
                            velocity: object.userData.physicsBody.velocity
                        });
                    }
                });
                
                if (physicsObjects.length > 0) {
                    workers.processPhysics(physicsObjects);
                }
            }
        };
    }
        // Execute optimizations and return the update function
        const updateOptimizations = applyOptimizations();
    
    // Add optimization update to animation loop
    const originalAnimate = animate;
    animate = function() {
        updateOptimizations();
        originalAnimate();
    };
    
    // Return object pool for reuse
    return objectPool;
}
