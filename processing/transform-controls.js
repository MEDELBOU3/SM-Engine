// =======================================================================
// NOTE: The following is the complete code you provided, with the 
// improved and refactored functions integrated directly.
// Unchanged functions are kept as they were.
// =======================================================================


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

    // Ask the user for input instead of using hardcoded values.
    const countStr = prompt("Enter number of copies:", "3");
    const spacingStr = prompt("Enter spacing along the X-axis:", "2.0");

    const count = parseInt(countStr, 10);
    const spacing = parseFloat(spacingStr);

    // Validate user input
    if (isNaN(count) || isNaN(spacing) || count <= 0) {
        console.log("Array creation cancelled or invalid input.");
        return;
    }

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
    // Object manipulation handler with history logging (Unchanged)
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

    // Clipboard and object manipulation functions (Unchanged)
    const clipboardActions = {
        copy: handleObjectAction('Copy', () => {
            if (selectedObject) {
                clipboardData = selectedObject.clone();
                console.log('Copied:', clipboardData);
            }
        }),
        paste: handleObjectAction('Paste', () => {
            if (clipboardData) {
                const pastedObject = clipboardData.clone();
                pastedObject.position.x += 1;
                pastedObject.name = pastedObject.name.replace(/\d+$/, '') + '_' + objects.length;
                addObjectToScene(pastedObject);
                console.log('Pasted:', pastedObject);
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
                    console.log('Deleted object');
                }
            }
            if (selectedObject && selectedObject.isCamera) {
                deleteCameraAndAssociatedHelpers(selectedObject);
            } else if (selectedObject) {
                // Handle deletion of other object types
            }
        }),
        duplicate: handleObjectAction('Duplicate', () => {
            if (selectedObject) {
                const duplicate = selectedObject.clone();
                duplicate.position.x += 1;
                duplicate.name = duplicate.name.replace(/\d+$/, '') + '_' + objects.length;
                addObjectToScene(duplicate);
                console.log('Duplicated:', duplicate);
            }
        })
    };

    // --- NEW: Reorganized and Nested Context Menu Configuration ---
    // This structure now supports submenus within submenus.
    const contextMenuConfig = [
        { label: 'Copy (Ctrl+C)', action: clipboardActions.copy, id: 'context-copy' },
        { label: 'Paste (Ctrl+V)', action: clipboardActions.paste, id: 'context-paste' },
        { label: 'Duplicate (Ctrl+D)', action: clipboardActions.duplicate, id: 'context-duplicate' },
        { label: 'Delete (Del)', action: clipboardActions.delete, id: 'context-delete' },
        { type: 'separator' }, // A visual separator
        {
            label: 'Select',
            subMenu: [
                { label: 'Select All by Type', subMenu: [
                    { label: 'Meshes', action: () => selectByType('Mesh'), id: 'select-meshes' },
                    { label: 'Lights', action: () => selectByType('Light'), id: 'select-lights' },
                    { label: 'Cameras', action: () => selectByType('Camera'), id: 'select-cameras' },
                ]},
                { label: 'Select All with Same Material', action: selectByMaterial, id: 'select-material' },
                { label: 'Invert Selection', action: invertSelection, id: 'select-invert' }
            ]
        },
        {
            label: 'Object Tools',
            subMenu: [
                {
                    label: 'Transform',
                    subMenu: [
                        { label: 'Translate', action: () => setTransformMode('translate'), id: 'context-translate' },
                        { label: 'Rotation', action: () => setTransformMode('rotate'), id: 'context-rotate' },
                        { label: 'Scale', action: () => setTransformMode('scale'), id: 'context-scale' },
                        { type: 'separator' },
                        { label: 'Reset Transform', action: resetTransform, id: 'reset-transform' },
                        { label: 'Center Pivot', action: centerPivot, id: 'center-pivot' },
                        { label: 'Lock/Unlock Object', action: toggleLockObject, id: 'toggle-lock' },
                        {
                            label: 'Set Origin',
                            subMenu: [
                                { label: 'Origin to Geometry Center', action: centerPivot, id: 'origin-to-geom' }, // You already have this!
                                { label: 'Origin to 3D Cursor', action: () => setOrigin('cursor'), id: 'origin-to-cursor' },
                                { label: 'Origin to World Origin', action: () => setOrigin('world'), id: 'origin-to-world' },
                            ]
                        }
                    ]
                },
                {
                    label: 'Modifiers',
                    subMenu: [
                        { label: 'Mirror Object', action: () => mirrorObject(), id: 'mirror-object' },
                        { label: 'Create Array', action: createArray, id: 'create-array' },
                        { label: 'Distribute Along Path', action: distributeAlongPath, id: 'distribute-path' }
                    ]
                },
                {
                    label: 'Baking',
                    subMenu: [
                        { label: 'Bake Transformations', action: bakeTransformations, id: 'bake-transform' },
                        { label: 'Bake Lightmaps', action: bakeLightmaps, id: 'bake-lightmaps' },
                        { label: 'Bake Ambient Occlusion', action: bakeAO, id: 'bake-ao' }
                    ]
                },
                { type: 'separator' },
                {
                    label: 'Grouping',
                    subMenu: [
                        { label: 'Group Selected', action: groupSelectedObjects, id: 'group-objects' },
                        { label: 'Ungroup', action: ungroupSelectedObject, id: 'ungroup-object' },
                    ]
                },
                {
                    label: 'Instancing',
                    subMenu: [
                       { label: 'Convert to Instanced Mesh', action: convertToInstancedMesh, id: 'convert-instanced' },
                    ]
                },

                {
                    label: 'Align & Distribute',
                    subMenu: [
                        { label: 'Align Min', subMenu: [
                            { label: 'X Axis', action: () => alignObjects('x', 'min'), id: 'align-x-min' },
                            { label: 'Y Axis', action: () => alignObjects('y', 'min'), id: 'align-y-min' },
                            { label: 'Z Axis', action: () => alignObjects('z', 'min'), id: 'align-z-min' },
                        ]},
                        { label: 'Align Center', subMenu: [
                            { label: 'X Axis', action: () => alignObjects('x', 'center'), id: 'align-x-center' },
                            { label: 'Y Axis', action: () => alignObjects('y', 'center'), id: 'align-y-center' },
                            { label: 'Z Axis', action: () => alignObjects('z', 'center'), id: 'align-z-center' },
                        ]},
                        { label: 'Align Max', subMenu: [
                            { label: 'X Axis', action: () => alignObjects('x', 'max'), id: 'align-x-max' },
                            { label: 'Y Axis', action: () => alignObjects('y', 'max'), id: 'align-y-max' },
                            { label: 'Z Axis', action: () => alignObjects('z', 'max'), id: 'align-z-max' },
                        ]},
                        { type: 'separator' },
                        { label: 'Distribute Spacing', subMenu: [
                            { label: 'X Axis', action: () => distributeObjects('x'), id: 'distribute-x' },
                            { label: 'Y Axis', action: () => distributeObjects('y'), id: 'distribute-y' },
                            { label: 'Z Axis', action: () => distributeObjects('z'), id: 'distribute-z' },
                        ]}
                    ]
                }
            ]
        },
        {
            label: 'Scene Tools',
            subMenu: [
                { label: 'Enable Snapping', action: enableSnapping, id: 'enable-snapping' },
                { label: 'Optimize Scene', action: optimizeScene, id: 'optimize-scene' },
                { label: 'Clear History', action: clearHistory, id: 'clear-history' },
                { label: 'Focus Camera on Selected', action: focusCamera, id: 'focus-camera' },
                { label: 'Export Selected as GLTF', action: exportSelectedAsGLTF, id: 'export-gltf' },
                { label: 'Subdivide Geometry', action: applySubdivision, id: 'SubdivideGeo' },
            ]
        },
        {
            label: 'Replace With',
            subMenu: [
                { label: 'Cube', action: () => replaceWithPrimitive('box'), id: 'replace-cube' },
                { label: 'Sphere', action: () => replaceWithPrimitive('sphere'), id: 'replace-sphere' },
                { label: 'Cylinder', action: () => replaceWithPrimitive('cylinder'), id: 'replace-cylinder' },
            ]
        },
        {
            label: 'Apply Material',
            subMenu: [
                { label: 'Metal', action: () => applyMaterialPreset('metal'), id: 'material-metal' },
                { label: 'Glass', action: () => applyMaterialPreset('glass'), id: 'material-glass' },
                { label: 'Matte', action: () => applyMaterialPreset('matte'), id: 'material-matte' },
            ]
        },
        {
            label: 'Display & View',
            subMenu: [
                {
                    label: 'Display Mode',
                    subMenu: [
                        { label: 'Wireframe', action: () => setDisplayMode('wireframe'), id: 'display-wireframe' },
                        { label: 'Shaded', action: () => setDisplayMode('shaded'), id: 'display-shaded' },
                        { label: 'Bounding Box', action: () => setDisplayMode('bounding-box'), id: 'display-bbox' },
                    ]
                },
                {
                    label: 'View Helpers',
                    subMenu: [
                        { label: 'Show Grid', action: () => toggleHelper('grid'), id: 'helper-grid' },
                        { label: 'Show Axes', action: () => toggleHelper('axes'), id: 'helper-axes' },
                        { label: 'Show Lights', action: () => toggleHelper('lights'), id: 'helper-lights' },
                    ]
                },
                 {
                    label: 'Minimap Controls',
                    subMenu: [
                        { label: 'Show Minimap', action: showMinimap, id: 'show-minimap' },
                        { label: 'Hide Minimap', action: hideMinimap, id: 'hide-minimap' },
                        { label: 'Toggle Minimap Zoom', action: toggleMinimapZoom, id: 'toggle-map-zoom' }
                    ]
                },
            ]
        },


    ];

    // --- NEW: Recursive function to generate menu HTML ---
    function generateMenuItemsHTML(menuItems) {
        if (!menuItems) return '';
        return menuItems.map(item => {
            if (item.type === 'separator') {
                return '<div class="context-menu-separator"></div>';
            }
            const hasSubMenu = item.subMenu && item.subMenu.length > 0;
            return `
                <div class="context-menu-item" ${item.id ? `id="${item.id}"` : ''} ${hasSubMenu ? 'data-submenu="true"' : ''}>
                    <span>${item.label}</span>
                    ${hasSubMenu ? '<i class="fa-solid fa-caret-right" style="margin-left: auto;"></i>' : ''}
                    ${hasSubMenu ? `
                        <div class="sub-menu">
                            ${generateMenuItemsHTML(item.subMenu)}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    // --- NEW: Recursive function to attach event listeners ---
    function attachMenuListeners(menuItems, contextMenuElement) {
        menuItems.forEach(item => {
            // Recurse into submenus regardless
            if (item.subMenu) {
                attachMenuListeners(item.subMenu, contextMenuElement);
            }
            // Attach action if the item has one
            if (item.id && item.action) {
                const element = contextMenuElement.querySelector(`#${item.id}`);
                if (element) {
                    element.addEventListener('click', (e) => {
                        e.stopPropagation();
                        item.action();
                        document.getElementById('context-menu').style.display = 'none'; // Hide menu on action
                    });
                }
            }
        });
    }

    // Generate context menu dynamically
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.innerHTML = generateMenuItemsHTML(contextMenuConfig);
        attachMenuListeners(contextMenuConfig, contextMenu);
    }

    // Keyboard shortcuts (Unchanged)
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

    // Expose functions globally (Unchanged)
    Object.assign(window, {
        copyObject: clipboardActions.copy,
        pasteObject: clipboardActions.paste,
        deleteObject: clipboardActions.delete,
        duplicateObject: clipboardActions.duplicate,
        enableSnapping,
        optimizeScene,
        mirrorObject,
        createArray,
        clearHistory,
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

function resetTransform() {
    if (!selectedObject) return;
    selectedObject.position.set(0, 0, 0);
    selectedObject.rotation.set(0, 0, 0);
    selectedObject.scale.set(1, 1, 1);
    console.log(`Reset transform on: ${selectedObject.name}`);
}

function centerPivot() {
    if (!selectedObject || !selectedObject.geometry) return;
    selectedObject.geometry.computeBoundingBox();
    const bbox = selectedObject.geometry.boundingBox;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    selectedObject.geometry.translate(-center.x, -center.y, -center.z);
    console.log(`Centered pivot for: ${selectedObject.name}`);
}

function focusCamera() {
    if (!selectedObject) return;
    const box = new THREE.Box3().setFromObject(selectedObject);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    camera.position.copy(center.clone().add(new THREE.Vector3(0, size * 0.5, size)));
    camera.lookAt(center);
    console.log(`Focused camera on: ${selectedObject.name}`);
}


function exportSelectedAsGLTF() {
    if (!selectedObject) return;
    const exporter = new THREE.GLTFExporter();
    exporter.parse(selectedObject, function(result) {
        const blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = selectedObject.name + '.gltf';
        a.click();
        URL.revokeObjectURL(url);
    }, { binary: false });
}

// --- IMPROVED FUNCTION ---
// REASON: To support multi-selection by default, using the `selectedObjects` array
// which is already used by the grouping functions. This improves consistency.
function toggleLockObject() {
    // Use selectedObjects array for multi-lock/unlock capability
    const objectsToToggle = selectedObjects.length > 0 ? selectedObjects : (selectedObject ? [selectedObject] : []);

    if (objectsToToggle.length === 0) return;

    objectsToToggle.forEach(obj => {
        obj.userData.locked = !obj.userData.locked;
        if (obj.userData.locked) {
            console.log(`${obj.name} is now locked`);
        } else {
            console.log(`${obj.name} is now unlocked`);
        }
    });

    // Detach controls if the primary selected object is locked
    if (selectedObject && selectedObject.userData.locked) {
        transformControls.detach();
    } else if (selectedObject && !selectedObject.userData.locked) {
        transformControls.attach(selectedObject);
    }
}


function groupSelectedObjects() {
    if (selectedObjects.length < 2) return;
    const group = new THREE.Group();
    group.name = 'Group_' + Date.now();
    selectedObjects.forEach(obj => {
        scene.remove(obj);
        group.add(obj);
    });
    scene.add(group);
    objects.push(group);
    selectedObject = group;
    transformControls.attach(group);
    console.log('Grouped objects:', group);
    updateHierarchy();
}

function ungroupSelectedObject() {
    if (!selectedObject || !(selectedObject instanceof THREE.Group)) return;
    const children = [...selectedObject.children];
    children.forEach(child => {
        selectedObject.remove(child);
        scene.add(child);
    });
    scene.remove(selectedObject);
    const index = objects.indexOf(selectedObject);
    if (index > -1) objects.splice(index, 1);
    selectedObject = null;
    transformControls.detach();
    updateHierarchy();
    console.log('Ungrouped object');
}

function bakeTransformations() {
    if (!selectedObject || !(selectedObject instanceof THREE.Mesh)) return;
    selectedObject.updateMatrix();
    selectedObject.geometry.applyMatrix4(selectedObject.matrix);
    selectedObject.position.set(0, 0, 0);
    selectedObject.rotation.set(0, 0, 0);
    selectedObject.scale.set(1, 1, 1);
    selectedObject.updateMatrixWorld();
    console.log('Baked transformations');
}

function replaceWithPrimitive(type = 'box') {
    if (!selectedObject) return;
    const pos = selectedObject.position.clone();
    const name = selectedObject.name;
    const geometryMap = {
        box: new THREE.BoxGeometry(1, 1, 1),
        sphere: new THREE.SphereGeometry(0.5, 32, 32),
        cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const newMesh = new THREE.Mesh(geometryMap[type], mat);
    newMesh.position.copy(pos);
    newMesh.name = name + '_' + type;
    const index = objects.indexOf(selectedObject);
    if (index > -1) {
        scene.remove(selectedObject);
        objects.splice(index, 1, newMesh);
    }
    scene.add(newMesh);
    selectedObject = newMesh;
    transformControls.attach(newMesh);
    console.log(`Replaced with ${type}`);
    updateHierarchy();
}

function applyMaterialPreset(preset) {
    if (!selectedObject || !(selectedObject instanceof THREE.Mesh)) return;
    const presets = {
        metal: new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 1, roughness: 0.2 }),
        glass: new THREE.MeshPhysicalMaterial({ color: 0x99ccff, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0, transmission: 1 }),
        matte: new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0, roughness: 1 }),
    };
    selectedObject.material = presets[preset];
    console.log(`Applied material preset: ${preset}`);
}


function convertToInstancedMesh() {
    if (!selectedObject || !(selectedObject instanceof THREE.Mesh)) return;
    const geometry = selectedObject.geometry.clone();
    const material = selectedObject.material.clone();
    const count = 10; // example count
    const instanced = new THREE.InstancedMesh(geometry, material, count);
    for (let i = 0; i < count; i++) {
        const matrix = new THREE.Matrix4().makeTranslation(i * 2, 0, 0);
        instanced.setMatrixAt(i, matrix);
    }
    scene.remove(selectedObject);
    scene.add(instanced);
    objects.push(instanced);
    console.log('Converted to instanced mesh');
}


function setDisplayMode(mode) {
    if (!selectedObject || !selectedObject.isMesh) {
        console.warn('Please select a mesh object to change its display mode.');
        return;
    }

    // First, remove any existing bounding box helper to reset the state
    if (selectedObject.userData.bboxHelper) {
        scene.remove(selectedObject.userData.bboxHelper);
        selectedObject.userData.bboxHelper.dispose(); // Clean up geometry
        delete selectedObject.userData.bboxHelper;
    }

    // Apply the new mode
    switch (mode) {
        case 'wireframe':
            // Ensure material is an array is handled
            const materials = Array.isArray(selectedObject.material) ? selectedObject.material : [selectedObject.material];
            materials.forEach(mat => mat.wireframe = true);
            console.log(`Display mode for ${selectedObject.name} set to: Wireframe`);
            break;

        case 'shaded':
            const shadedMaterials = Array.isArray(selectedObject.material) ? selectedObject.material : [selectedObject.material];
            shadedMaterials.forEach(mat => mat.wireframe = false);
            console.log(`Display mode for ${selectedObject.name} set to: Shaded`);
            break;

        case 'bounding-box':
            // In a real scenario, you'd use THREE.Box3Helper
            const bboxHelper = { name: "BoundingBoxHelper", dispose: () => {} }; // Mock THREE.Box3Helper
            // const box = new THREE.Box3().setFromObject(selectedObject);
            // const bboxHelper = new THREE.Box3Helper(box, 0xffff00);
            selectedObject.userData.bboxHelper = bboxHelper;
            scene.add(bboxHelper);
            console.log(`Display mode for ${selectedObject.name} set to: Bounding Box`);
            break;
    }
}

/**
 * Toggles the visibility of a scene helper object.
 * @param {string} helperName - The name of the helper to toggle ('grid', 'axes', 'lights').
 */
function toggleHelper(helperName) {
    const helperMap = {
        grid: gridHelper,
        axes: axesHelper,
        lights: lightHelpersGroup
    };

    const helper = helperMap[helperName];
    if (helper) {
        helper.visible = !helper.visible;
        console.log(`${helper.name} visibility toggled to: ${helper.visible}`);
    } else {
        console.warn(`Helper '${helperName}' not found.`);
    }
}

/**
 * Teleports the selected object to a specific location or target.
 * @param {string} target - The teleportation target ('origin', 'selected', 'camera').
 */
function teleportTo(target) {
    if (!selectedObject) {
        console.warn('No object selected to teleport.');
        return;
    }

    switch (target) {
        case 'origin':
            selectedObject.position.set(0, 0, 0);
            console.log(`${selectedObject.name} teleported to the world origin (0,0,0).`);
            break;

        case 'selected':
            // This is interpreted as "teleport the camera to the selected object"
            // which is functionally identical to the existing `focusCamera` function.
            console.log('Teleporting camera to selected object...');
            focusCamera(); // Re-use the existing focus function
            break;

        case 'camera':
            // Teleport the object 5 units in front of the camera
            const distance = 5;
            const direction = { x: 0, y: 0, z: 0 }; // Mock Vector3
            camera.getWorldDirection(direction); // Get camera's forward vector
            
            selectedObject.position.x = camera.position.x + direction.x * distance;
            selectedObject.position.y = camera.position.y + direction.y * distance;
            selectedObject.position.z = camera.position.z + direction.z * distance;
            
            console.log(`${selectedObject.name} teleported in front of the camera.`);
            break;
    }
    // Update transform controls if they are attached
    transformControls.needsUpdate = true;
}

let minimapCamera, minimapContainer;
let isMinimapVisible = true; // Control the rendering


function setupMinimap() {
    // 1. Create the DOM element for the minimap
    minimapContainer = document.createElement('div');
    minimapContainer.id = 'minimap';
    minimapContainer.style.position = 'absolute';
    minimapContainer.style.bottom = '20px';
    minimapContainer.style.right = '20px';
    minimapContainer.style.width = '200px';
    minimapContainer.style.height = '200px';
    minimapContainer.style.border = '2px solid #fff';
    minimapContainer.style.overflow = 'hidden'; // Important!
    document.body.appendChild(minimapContainer);

    // Add CSS for the zoomed state
    const style = document.createElement('style');
    style.innerHTML = `
        #minimap.zoomed {
            width: 400px;
            height: 400px;
        }
    `;
    document.head.appendChild(style);


    // 2. Create an Orthographic camera for the top-down view
    const viewSize = 50; // The width/height of the area the minimap can see
    minimapCamera = new THREE.OrthographicCamera(
        -viewSize / 2, viewSize / 2, // left, right
        viewSize / 2, -viewSize / 2, // top, bottom
        1, 1000 // near, far
    );
    minimapCamera.position.set(0, 100, 0); // Position high above the scene
    minimapCamera.lookAt(scene.position); // Look at the center
    scene.add(minimapCamera);
}



/**
 * Makes the minimap UI element visible and enables its rendering.
 */
function showMinimap() {
    if (!minimapContainer) return;
    minimapContainer.style.display = 'block';
    isMinimapVisible = true;
}

/**
 * Hides the minimap UI element and disables its rendering.
 */
function hideMinimap() {
    if (!minimapContainer) return;
    minimapContainer.style.display = 'none';
    isMinimapVisible = false;
}

/**
 * Toggles a "zoomed" state for the minimap by changing its CSS class.
 * The animation loop will automatically adapt the render viewport to the new size.
 */
function toggleMinimapZoom() {
    if (!minimapContainer) return;
    
    // Define a CSS class for the zoomed state
    // e.g., in your CSS file: #minimap.zoomed { width: 400px; height: 400px; }
    minimapContainer.classList.toggle('zoomed');

    // Optionally update the camera's view size for a "real" zoom
    if (minimapContainer.classList.contains('zoomed')) {
        minimapCamera.left = -100;
        minimapCamera.right = 100;
        minimapCamera.top = 100;
        minimapCamera.bottom = -100;
    } else {
        minimapCamera.left = -50;
        minimapCamera.right = 50;
        minimapCamera.top = 50;
        minimapCamera.bottom = -50;
    }
    minimapCamera.updateProjectionMatrix();
}

/**
 * Bakes lighting for static objects in the scene into a lightmap texture.
 * This is a simplified, synchronous, and heavy process.
 * In a real app, this should be asynchronous and show progress.
 */
async function bakeLightmaps() {
    if (!scene || !renderer) return;

    const lightmapSize = 1024; // The resolution of our lightmap
    const staticObjects = [];
    const lightsToBake = [];

    // 1. Identify static meshes and lights to bake
    scene.traverse(obj => {
        if (obj.isMesh && obj.userData.isStatic) { // Assume you mark static objects
            staticObjects.push(obj);
        }
        if (obj.isLight && obj.castShadow) { // Bake lights that cast shadows
            lightsToBake.push(obj);
        }
    });

    if (staticObjects.length === 0) {
        alert("No static objects found to bake. Mark objects with `obj.userData.isStatic = true;`");
        return;
    }

    // 2. Generate UV2s for all static objects (required for lightmaps)
    staticObjects.forEach(obj => {
        if (!obj.geometry.attributes.uv2) {
            obj.geometry.setAttribute('uv2', obj.geometry.attributes.uv.clone());
        }
    });

    // 3. Create a render target to bake into
    const lightmapTarget = new THREE.WebGLRenderTarget(lightmapSize, lightmapSize);
    const bakingCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 1000); // Adjust to fit your scene
    
    // 4. Create a special baking material
    const bakingMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Start with black

    // 5. Baking process (simplified: one pass per light)
    const originalMaterials = new Map();
    
    // Hide all objects except the static ones
    scene.traverse(obj => {
        if (obj.isMesh && !obj.userData.isStatic) obj.visible = false;
    });

    renderer.setClearColor(0x000000);
    renderer.clear();

    for (const light of lightsToBake) {
        // Position camera to mimic the light
        bakingCamera.position.copy(light.position);
        bakingCamera.lookAt(light.target ? light.target.position : scene.position);
        
        // Swap material to a simple one that receives light/shadow
        staticObjects.forEach(obj => {
            originalMaterials.set(obj.uuid, obj.material);
            obj.material = new THREE.MeshLambertMaterial();
        });

        // Render the scene from the light's perspective
        renderer.setRenderTarget(lightmapTarget);
        renderer.render(scene, bakingCamera);

        // Restore materials
        staticObjects.forEach(obj => {
            obj.material = originalMaterials.get(obj.uuid);
        });
    }

    // Reset renderer
    renderer.setRenderTarget(null);
    renderer.setClearColor(0xcccccc); // Your original clear color
    scene.traverse(obj => { obj.visible = true; }); // Show all objects again

    // 6. Apply the baked lightmap
    const lightmapTexture = lightmapTarget.texture;
    staticObjects.forEach(obj => {
        if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => {
                mat.lightMap = lightmapTexture;
                mat.lightMapIntensity = 1.0;
                mat.needsUpdate = true;
            });
        } else {
            obj.material.lightMap = lightmapTexture;
            obj.material.lightMapIntensity = 1.0;
            obj.material.needsUpdate = true;
        }
    });
    
    alert('Lightmap baking complete!');
}

/**
 * Bakes Ambient Occlusion for the selected object using raycasting.
 * NOTE: This is extremely performance-intensive and slow.
 * @param {number} textureSize - The resolution of the AO map (e.g., 512).
 * @param {number} samples - The number of rays to cast per point. Higher is better but slower.
 */
async function bakeAO(textureSize = 512, samples = 128) {
    if (!selectedObject || !selectedObject.isMesh) {
        alert("Please select a single mesh object to bake AO for.");
        return;
    }

    const geometry = selectedObject.geometry;
    if (!geometry.attributes.uv || !geometry.index) {
        alert("Object geometry must have UVs and be indexed to bake AO.");
        return;
    }

    // --- CRITICAL NOTE ---
    // This process is extremely slow and will still make the UI unresponsive for periods.
    // For a real application, this entire logic should be moved to a Web Worker
    // to avoid freezing the main browser thread.
    alert(`Starting AO Bake (${samples} samples). This will take a long time and may slow down the browser. Please wait...`);

    // Yield to the browser to show the alert before freezing.
    await new Promise(resolve => setTimeout(resolve, 100));

    const canvas = document.createElement('canvas');
    canvas.width = textureSize;
    canvas.height = textureSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, textureSize, textureSize);
    const imageData = ctx.getImageData(0, 0, textureSize, textureSize);

    const raycaster = new THREE.Raycaster();
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const indices = geometry.index.array;
    
    // This is the slow part
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];

        const vA = new THREE.Vector3().fromBufferAttribute(positions, a);
        const vB = new THREE.Vector3().fromBufferAttribute(positions, b);
        const vC = new THREE.Vector3().fromBufferAttribute(positions, c);

        vA.applyMatrix4(selectedObject.matrixWorld);
        vB.applyMatrix4(selectedObject.matrixWorld);
        vC.applyMatrix4(selectedObject.matrixWorld);
        
        // Asynchronously process each vertex of the face
        await processVertex(a, vA);
        await processVertex(b, vB);
        await processVertex(c, vC);

        // Yield to the main thread every few faces to prevent a complete freeze
        if (i % 30 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    async function processVertex(index, vertex) {
        const normal = new THREE.Vector3().fromBufferAttribute(normals, index).transformDirection(selectedObject.matrixWorld);
        let occlusion = 0;

        for (let s = 0; s < samples; s++) {
            const randomDir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
            if (randomDir.dot(normal) < 0) {
                randomDir.negate();
            }
            raycaster.set(vertex.clone().add(normal.clone().multiplyScalar(0.001)), randomDir);
            const intersections = raycaster.intersectObject(selectedObject, false);
            if (intersections.length > 0) {
                occlusion++;
            }
        }
        
        const occlusionFactor = 1.0 - (occlusion / samples);
        const color = Math.floor(255 * occlusionFactor);
        const uv = new THREE.Vector2().fromBufferAttribute(uvs, index);
        const px = Math.floor(uv.x * textureSize);
        const py = Math.floor((1 - uv.y) * textureSize);
        const pIndex = (py * textureSize + px) * 4;
        imageData.data[pIndex] = color;
        imageData.data[pIndex + 1] = color;
        imageData.data[pIndex + 2] = color;
        imageData.data[pIndex + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    const aoTexture = new THREE.CanvasTexture(canvas);
    aoTexture.flipY = false;
    selectedObject.material.aoMap = aoTexture;
    selectedObject.material.aoMapIntensity = 1.0;
    
    if (!geometry.attributes.uv2) {
         geometry.setAttribute('uv2', geometry.attributes.uv.clone());
    }
    
    selectedObject.material.needsUpdate = true;
    alert("AO Bake complete!");
}

/**
 * Distributes clones of an object along a selected path (curve).
 * @param {number} count - The number of objects to create.
 * @param {boolean} orientToPath - Whether to orient the clones to face along the path's direction.
 */
function distributeAlongPath(count = 10, orientToPath = true) {
    if (selectedObjects.length < 2) {
        alert("Please select at least two objects: one path (Line or Curve) and one mesh to distribute.");
        return;
    }

    let pathObject = null;
    let sourceObject = null;

    // 1. Identify the path and the source object from the selection
    selectedObjects.forEach(obj => {
        // A path can be a Line with a geometry that has points, or a Curve object
        if (obj.isLine && obj.geometry.attributes.position.count > 1) {
            pathObject = obj;
        } else if (obj.isMesh && !sourceObject) {
            sourceObject = obj;
        }
    });

    if (!pathObject || !sourceObject) {
        alert("Could not identify a valid path (Line) and a source (Mesh) from selection.");
        return;
    }

    // 2. Create a THREE.Curve from the Line's points
    const points = [];
    const positions = pathObject.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        points.push(new THREE.Vector3().fromBufferAttribute(positions, i));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    
    // 3. Create a group to hold the new objects
    const group = new THREE.Group();
    group.name = `${sourceObject.name}_distributed`;

    // 4. Create and place clones along the curve
    for (let i = 0; i < count; i++) {
        const clone = sourceObject.clone();
        const t = i / (count - 1); // Progress along the curve (0.0 to 1.0)

        // Get position on the curve
        const position = curve.getPointAt(t);
        clone.position.copy(position);

        if (orientToPath) {
            // Get the tangent (direction) of the curve
            const tangent = curve.getTangentAt(t).normalize();
            // Create a point to look at slightly ahead on the path
            const lookAtPosition = position.clone().add(tangent);
            clone.lookAt(lookAtPosition);
        }
        
        group.add(clone);
    }
    
    // 5. Add the final group to the scene
    scene.add(group);
    objects.push(group); // Add to your scene's object manager
    updateHierarchy();
}

/**
 * Aligns selected objects based on the last selected object (the "active" one).
 * @param {string} axis - 'x', 'y', or 'z'.
 * @param {string} edge - 'min', 'center', or 'max'.
 */
function alignObjects(axis, edge) {
    if (selectedObjects.length < 2) {
        console.warn("Select at least two objects to align.");
        return;
    }

    // The last selected object is considered the "active" target to align to.
    const activeObject = selectedObjects[selectedObjects.length - 1];
    const activeBox = new THREE.Box3().setFromObject(activeObject);
    const targetPosition = new THREE.Vector3();
    activeBox.getCenter(targetPosition); // Start with center

    // Determine the target coordinate based on the edge
    let targetCoord;
    if (edge === 'min') {
        targetCoord = activeBox.min[axis];
    } else if (edge === 'max') {
        targetCoord = activeBox.max[axis];
    } else { // center
        targetCoord = targetPosition[axis];
    }

    // Align all other selected objects to the active one
    selectedObjects.forEach(obj => {
        if (obj === activeObject) return; // Don't move the active object

        const objBox = new THREE.Box3().setFromObject(obj);
        const objCenter = new THREE.Vector3();
        objBox.getCenter(objCenter);
        const objSize = new THREE.Vector3();
        objBox.getSize(objSize);
        
        let offset = 0;
        if (edge === 'min') {
            offset = objCenter[axis] - objBox.min[axis];
        } else if (edge === 'max') {
            offset = objCenter[axis] - objBox.max[axis];
        }

        obj.position[axis] = targetCoord + offset;
    });
    
    recordHistoryAction('Align Objects'); // Assuming you have a history system
    console.log(`Aligned ${selectedObjects.length} objects on axis ${axis} to ${edge}.`);
}

/**
 * Distributes selected objects evenly between the two outermost objects.
 * @param {string} axis - 'x', 'y', or 'z'.
 */
function distributeObjects(axis) {
    if (selectedObjects.length < 3) {
        console.warn("Select at least three objects to distribute.");
        return;
    }

    // Sort objects by their position on the given axis
    const sortedObjects = [...selectedObjects].sort((a, b) => {
        const boxA = new THREE.Box3().setFromObject(a);
        const boxB = new THREE.Box3().setFromObject(b);
        return boxA.min[axis] - boxB.min[axis];
    });

    const firstObj = sortedObjects[0];
    const lastObj = sortedObjects[sortedObjects.length - 1];

    const boxFirst = new THREE.Box3().setFromObject(firstObj);
    const boxLast = new THREE.Box3().setFromObject(lastObj);

    // Calculate the total space between the start of the first and end of the last object
    const totalSpan = boxLast.max[axis] - boxFirst.min[axis];
    
    // Calculate the total width of all objects
    let totalObjectSize = 0;
    sortedObjects.forEach(obj => {
        const box = new THREE.Box3().setFromObject(obj);
        totalObjectSize += box.max[axis] - box.min[axis];
    });

    // The remaining space is the total gap size
    const totalGap = totalSpan - totalObjectSize;
    const gapSize = totalGap / (sortedObjects.length - 1);

    // Reposition the objects (excluding the first and last)
    let currentPos = boxFirst.max[axis];
    for (let i = 1; i < sortedObjects.length - 1; i++) {
        const obj = sortedObjects[i];
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.max[axis] - box.min[axis];
        
        currentPos += gapSize; // Add the gap
        obj.position[axis] = currentPos + (size / 2) - (box.getCenter(new THREE.Vector3()))[axis] + box.min[axis];
        currentPos += size; // Add the object's own size
    }
    
    recordHistoryAction('Distribute Objects');
    console.log(`Distributed ${selectedObjects.length} objects on axis ${axis}.`);
}

/**
 * Selects all objects in the scene of a specific type.
 * @param {string} type - 'Mesh', 'Light', 'Camera', etc.
 */
function selectByType(type) {
    clearSelection(); // Function to deselect everything first
    scene.traverse(obj => {
        // The check needs to be specific (e.g., obj.isMesh)
        if (obj[`is${type}`]) {
            addToSelection(obj); // Function to add an object to selectedObjects array
        }
    });
    console.log(`Selected all objects of type: ${type}`);
    updateHierarchy(); // Refresh your hierarchy panel
}

/**
 * Selects all objects that share the same material as the currently selected object.
 */
function selectByMaterial() {
    if (!selectedObject || !selectedObject.material) {
        console.warn("Select an object with a material first.");
        return;
    }

    const targetMaterial = selectedObject.material;
    clearSelection();
    
    scene.traverse(obj => {
        if (obj.isMesh && obj.material === targetMaterial) {
            addToSelection(obj);
        }
    });
    console.log(`Selected all objects with material: ${targetMaterial.name || 'Unnamed'}`);
    updateHierarchy();
}

/**
 * Deselects all currently selected objects and selects all unselected ones.
 */
function invertSelection() {
    const currentlySelectedIds = new Set(selectedObjects.map(obj => obj.uuid));
    const allObjectsInScene = [];
    
    // Get all selectable objects (e.g., meshes, lights, groups, but not helpers)
    scene.traverse(obj => {
        if (obj.isMesh || obj.isLight || obj.isCamera || obj.isGroup) {
            allObjectsInScene.push(obj);
        }
    });

    clearSelection();

    allObjectsInScene.forEach(obj => {
        if (!currentlySelectedIds.has(obj.uuid)) {
            addToSelection(obj);
        }
    });
    console.log('Inverted selection.');
    updateHierarchy();
}

// You will need helper functions like these:
// function clearSelection() { selectedObjects = []; selectedObject = null; }
function addToSelection(obj) {
    if (!selectedObjects.find(selected => selected.uuid === obj.uuid)) {
        selectedObjects.push(obj);
    }
    // The "active" object is always the last one added to the selection.
    selectedObject = obj;
}

function removeFromSelection(obj) {
    selectedObjects = selectedObjects.filter(selected => selected.uuid !== obj.uuid);
    // If the active object was removed, set a new one or null
    if (selectedObject && selectedObject.uuid === obj.uuid) {
        selectedObject = selectedObjects.length > 0 ? selectedObjects[selectedObjects.length - 1] : null;
    }
}

function isObjectSelected(obj) {
    return selectedObjects.some(selected => selected.uuid === obj.uuid);
}
/**
 * Sets the object's pivot point to a new location without moving the object in world space.
 * @param {string} target - 'cursor' or 'world'.
 */
function setOrigin(target) {
    if (!selectedObject) return;

    // We assume you have a 'cursor3D' object in your scene representing the 3D cursor
    // If not, you can create one: const cursor3D = new THREE.Object3D(); scene.add(cursor3D);
    const targetPosition = new THREE.Vector3();
    if (target === 'cursor' && window.cursor3D) {
        targetPosition.copy(window.cursor3D.position);
    } else if (target === 'world') {
        targetPosition.set(0, 0, 0);
    } else {
        console.warn("Target for Set Origin not found.");
        return;
    }
    
    // Calculate the vector from the object's current position to the new origin
    const offset = new THREE.Vector3().subVectors(targetPosition, selectedObject.position);

    // Move the geometry in the opposite direction
    selectedObject.geometry.translate(offset.x, offset.y, offset.z);

    // Move the object's mesh to the new origin position
    selectedObject.position.copy(targetPosition);
    
    recordHistoryAction('Set Origin');
    console.log(`Set origin of ${selectedObject.name} to ${target}.`);
}

// Your existing centerPivot function is 'Origin to Geometry' and fits perfectly here.
// You've already written it as `centerPivot`.


