class HistoryManager {
    constructor(scene, transformControls) {
        this.scene = scene;
        this.transformControls = transformControls;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 100;
        this.isExecutingHistory = false; // Prevent recording during undo/redo

        this.initListeners();
        this.setupUI();
    }

    // CRITICAL FIX 1: Method to explicitly tell the physics engine to update a body's transform.
    syncPhysics(object) {
        // This relies on the global 'physicsSystem' variable.
        if (window.physicsSystem && object && object.userData.physicsBody) {
            window.physicsSystem.updateBodyTransform(object);
        }
    }

    initListeners() {
        let lastTransform = null;

        this.transformControls.addEventListener('mouseDown', (event) => {
            const obj = event.target.object;
            if (obj) {
                lastTransform = {
                    position: obj.position.clone(),
                    rotation: obj.rotation.clone(),
                    scale: obj.scale.clone()
                };
            }
        });

        this.transformControls.addEventListener('mouseUp', (event) => {
            const obj = event.target.object;
            if (obj && lastTransform) {
                const hasChanged = !lastTransform.position.equals(obj.position) ||
                                   !lastTransform.rotation.equals(obj.rotation) ||
                                   !lastTransform.scale.equals(obj.scale);

                if (hasChanged) {
                    this.recordAction({
                        type: 'transformObject',
                        object: obj,
                        oldTransform: lastTransform,
                        newTransform: {
                            position: obj.position.clone(),
                            rotation: obj.rotation.clone(),
                            scale: obj.scale.clone()
                        }
                    });
                    // Also sync physics after a manual transform is complete.
                    this.syncPhysics(obj);
                }
            }
            lastTransform = null;
        });
    }

    recordAction(action) {
        if (this.isExecutingHistory) return;
        
        this.undoStack.push(action);
        if (this.undoStack.length > this.maxHistory) {
            const oldAction = this.undoStack.shift();
            // Memory cleanup for old actions
            if (oldAction.type === 'geometryChange') {
                oldAction.oldGeometry?.dispose();
                oldAction.newGeometry?.dispose();
            }
        }
        this.redoStack = []; // Clear redo stack on new action
        this.updateUI();
    }
    
    // CRITICAL FIX 2: Public method for recording geometry changes. This is the correct pattern.
    recordGeometryChange(object, oldGeometry) {
        if (!object || !object.geometry || !oldGeometry) return;

        // The "new" geometry is the one currently on the mesh.
        const newGeometry = object.geometry;

        this.recordAction({
            type: 'geometryChange',
            object: object,
            oldGeometry: oldGeometry,         // The clone from BEFORE the operation
            newGeometry: newGeometry.clone()  // A clone of the final result
        });
    }

    undo() {
        if (this.undoStack.length === 0) { console.log("History: Nothing to undo."); return; }
        this.isExecutingHistory = true;

        const action = this.undoStack.pop();
        this.executeUndo(action);
        this.redoStack.push(action);

        this.isExecutingHistory = false;
        this.updateUI();
        if (typeof window.updateHierarchy === 'function') window.updateHierarchy();
    }

    redo() {
        if (this.redoStack.length === 0) { console.log("History: Nothing to redo."); return; }
        this.isExecutingHistory = true;

        const action = this.redoStack.pop();
        this.executeRedo(action);
        this.undoStack.push(action);

        this.isExecutingHistory = false;
        this.updateUI();
        if (typeof window.updateHierarchy === 'function') window.updateHierarchy();
    }

    executeUndo(action) {
        switch (action.type) {
            case 'transformObject':
                action.object.position.copy(action.oldTransform.position);
                action.object.rotation.copy(action.oldTransform.rotation);
                action.object.scale.copy(action.oldTransform.scale);
                action.object.updateMatrixWorld(true);
                this.syncPhysics(action.object); // Sync physics on undo
                break;

            case 'geometryChange':
                action.object.geometry.dispose(); // Dispose the current ("new") geometry
                action.object.geometry = action.oldGeometry.clone(); // Restore the old one
                break;

            default:
                console.warn(`Undo not implemented for action type: ${action.type}`);
        }
    }

    executeRedo(action) {
        switch (action.type) {
            case 'transformObject':
                action.object.position.copy(action.newTransform.position);
                action.object.rotation.copy(action.newTransform.rotation);
                action.object.scale.copy(action.newTransform.scale);
                action.object.updateMatrixWorld(true);
                this.syncPhysics(action.object); // Sync physics on redo
                break;

            case 'geometryChange':
                action.object.geometry.dispose(); // Dispose the current ("old") geometry
                action.object.geometry = action.newGeometry.clone(); // Restore the new one
                break;
            
            default:
                console.warn(`Redo not implemented for action type: ${action.type}`);
        }
    }

    // --- UI and Serialization Methods (Restored from your original code) ---

    setupUI() {
        const historyBtn = document.getElementById('historyBtn');
        const historyPanel = document.getElementById('historyPanel');
        if (historyBtn && historyPanel) {
            historyBtn.addEventListener('click', () => {
                const isHidden = historyPanel.style.display === 'none' || historyPanel.style.display === '';
                historyPanel.style.display = isHidden ? 'block' : 'none';
                if (isHidden) this.updateUI();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            } else if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
                e.preventDefault();
                this.redo();
            }
        });
    }

    updateUI() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        historyList.innerHTML = '';
        // Show last 15 actions, for example
        this.undoStack.slice().reverse().slice(0, 15).forEach((action, index) => {
            const li = document.createElement('li');
            li.textContent = this.getActionName(action);
            if (index === 0) li.classList.add('current-history-item');
            historyList.appendChild(li);
        });
    }

    getActionName(action) {
        switch (action.type) {
            case 'transformObject': return `Transform ${action.object.name || 'Object'}`;
            case 'geometryChange': return `Modify Geometry on ${action.object.name || 'Object'}`;
            default: return action.type || 'Unknown Action';
        }
    }
}



/**
 * <div class="material-editor" id="material-editor"  style="display: none;">
                <div class="panel-header">Material Editor</div>
                <div class="property-group">
                    <div>
                        <label for="materialColor">Color:</label>
                        <input type="color" id="materialColor" value="#ffffff">
                    </div>
                    <div>
                        <label for="materialMetalness">Metalness:</label>
                        <input type="range" id="materialMetalness" min="0" max="1" step="0.01" value="0">
                        <span id="metalnessValue">0.00</span>
                    </div>
                    <div>
                        <label for="materialRoughness">Roughness:</label>
                        <input type="range" id="materialRoughness" min="0" max="1" step="0.01" value="1">
                        <span id="roughnessValue">1.00</span>
                    </div>
                    <div>
                        <label for="materialOpacity">Opacity:</label>
                        <input type="range" id="materialOpacity" min="0" max="1" step="0.01" value="1">
                        <span id="opacityValue">1.00</span>
                    </div>
                    <!-- NEW: Add more inputs for other MeshPhysicalMaterial properties -->
                    <div id="physicalMaterialProps" style="display:none;">
                        <div>
                            <label for="materialClearcoat">Clearcoat:</label>
                            <input type="range" id="materialClearcoat" min="0" max="1" step="0.01" value="0">
                            <span id="clearcoatValue">0.00</span>
                        </div>
                        <div>
                            <label for="materialClearcoatRoughness">Clearcoat Roughness:</label>
                            <input type="range" id="materialClearcoatRoughness" min="0" max="1" step="0.01" value="0">
                            <span id="clearcoatRoughnessValue">0.00</span>
                        </div>
                        <div>
                            <label for="materialTransmission">Transmission:</label>
                            <input type="range" id="materialTransmission" min="0" max="1" step="0.01" value="0">
                            <span id="transmissionValue">0.00</span>
                        </div>
                        <div>
                            <label for="materialThickness">Thickness:</label>
                            <input type="range" id="materialThickness" min="0" max="1" step="0.01" value="0">
                            <span id="thicknessValue">0.00</span>
                        </div>
                        <div>
                            <label for="materialReflectivity">Reflectivity:</label>
                            <input type="range" id="materialReflectivity" min="0" max="1" step="0.01" value="0.5">
                            <span id="reflectivityValue">0.50</span>
                        </div>
                        <div>
                           <label for="materialIridescence">Iridescence:</label>
                           <input type="range" id="materialIridescence" min="0" max="1" step="0.01" value="0">
                           <span id="iridescenceValue">0.00</span>
                        </div>
                        <div>
                           <label for="materialIridescenceIOR">Iridescence IOR:</label>
                           <input type="range" id="materialIridescenceIOR" min="1" max="2.5" step="0.01" value="1.3">
                            <span id="iridescenceIORValue">1.30</span>
                        </div>
                        <!-- Emissive properties from your updateMaterial, assuming they exist -->
                        <div>
                            <label for="materialEmissive">Emissive Color:</label>
                            <input type="color" id="materialEmissive" value="#000000">
                        </div>
                    <div>
                    <label for="materialEmissiveIntensity">Emissive Intensity:</label>
                    <input type="range" id="materialEmissiveIntensity" min="0" max="5" step="0.01" value="1">
                    <span id="emissiveIntensityValue">1.00</span>
                </div>
             </div>
             <!-- Existing texture upload -->
            <div style="margin-top:10px;">
                <label for="materialTextureUpload">Custom Map:</label>
                <input type="file" id="materialTextureUpload" accept="image/*">
                <button id="clearCustomTexture">Clear Map</button>
            </div>
            <!-- dat.GUI will be appended here -->
             <div id="materialPresets"></div>
                </div>
            </div>
       const cachedEnvironmentMap = {};
const cachedTextures = {}; 

function loadEnvironmentMap() {
    if (!cachedEnvironmentMap.default) {
        cachedEnvironmentMap.default = new THREE.CubeTextureLoader().load([
            'textures/skybox/px.jpg',
            'textures/skybox/nx.jpg',
            'textures/skybox/py.jpg',
            'textures/skybox/pz.jpg', 
            'textures/skybox/nz.jpg',
            'textures/skybox/ny.jpg' 
        ], (texture) => {
            console.log("Environment map loaded.");
        });
    }
    return cachedEnvironmentMap.default;
}

function loadWoodTexture() {
    if (!cachedTextures.woodgrain) {
        cachedTextures.woodgrain = new THREE.TextureLoader().load('textures/wood/woodgrain.jpg', (texture) => {
            texture.encoding = THREE.sRGBEncoding;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(2, 2); 
            console.log("Wood texture loaded.");
        });
    }
    return cachedTextures.woodgrain;
}

// --- ENHANCED TEXTURES/MATERIALS OBJECT (Global) ---
const textures = {
    glass: new THREE.MeshPhysicalMaterial({
        color: 0xA0D8EF, roughness: 0.1, metalness: 0.1, clearcoat: 1.0, clearcoatRoughness: 0.1,
        transmission: 0.95, thickness: 0.5, reflectivity: 1.0, transparent: true, opacity: 1.0, // Opacity to 1.0 for physical transparency
        attenuationColor: new THREE.Color(0xA0D8EF), attenuationDistance: 0.75, envMap: loadEnvironmentMap(),
        refractionRatio: 1.5, ior: 1.5, // ior property for MeshPhysicalMaterial
        name: "GlassPreset"
    }),

    metal: new THREE.MeshPhysicalMaterial({
        color: 0xAAAAAA, roughness: 0.05, metalness: 1.0, clearcoat: 0.7, clearcoatRoughness: 0.02,
        // anisotropy: 0.8, // anisotropy is not a direct property in MeshPhysicalMaterial, typically through maps
        envMap: loadEnvironmentMap(), name: "MetalPreset"
    }),

    water: new THREE.MeshPhysicalMaterial({
        color: 0x1e90ff, roughness: 0.01, metalness: 0.0, transmission: 1, thickness: 0.1,
        transparent: true, opacity: 0.9, envMap: loadEnvironmentMap(), reflectivity: 0.9,
        ior: 1.33, name: "WaterPreset"
    }),

    crystal: new THREE.MeshPhysicalMaterial({
        color: 0x7F7FFF, roughness: 0.01, metalness: 0.0, transmission: 1.0, thickness: 1.0,
        transparent: true, opacity: 0.95, envMap: loadEnvironmentMap(), clearcoat: 1.0,
        clearcoatRoughness: 0.01, attenuationColor: new THREE.Color(0x7F7FFF), attenuationDistance: 1.0,
        iridescence: 0.8, iridescenceIOR: 2.0, iridescenceThicknessRange: [200, 500], name: "CrystalPreset"
    }),

    plastic: new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.3, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.2,
        name: "PlasticPreset"
    }),

    ceramic: new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.1, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.1,
        sheen: 1.0, sheenRoughness: 0.3, sheenColor: new THREE.Color(0xffffff), name: "CeramicPreset"
    }),

    wood: new THREE.MeshStandardMaterial({
        color: 0x885533, roughness: 0.8, metalness: 0.0, map: loadWoodTexture(), name: "WoodPreset"
    }),

    marble: new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.15, metalness: 0.0, transmission: 0.5, thickness: 0.5,
        clearcoat: 0.8, clearcoatRoughness: 0.2, name: "MarblePreset"
    }),

    gold: new THREE.MeshPhysicalMaterial({
        color: 0xffd700, roughness: 0.1, metalness: 1.0, envMap: loadEnvironmentMap(),
        clearcoat: 0.5, clearcoatRoughness: 0.1, name: "GoldPreset"
    }),

    chrome: new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.0, metalness: 1.0, envMap: loadEnvironmentMap(),
        clearcoat: 1.0, clearcoatRoughness: 0.0, name: "ChromePreset"
    }),

    holographic: new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.2, metalness: 0.5, transmission: 0.5, thickness: 0.5,
        attenuationColor: new THREE.Color(0xff00ff), attenuationDistance: 0.5,
        iridescence: 1.0, iridescenceIOR: 2.0, iridescenceThicknessRange: [100, 400], name: "HolographicPreset"
    }),

    matte: new THREE.MeshStandardMaterial({
        color: 0x808080, roughness: 1.0, metalness: 0.0, name: "MattePreset"
    })
};


// --- UI SETUP FUNCTION (called once on init) ---
function setupMaterialEditor() {
    // 1. Get ALL DOM elements for direct input sliders and buttons
    const materialColor = document.getElementById('materialColor');
    const materialMetalness = document.getElementById('materialMetalness');
    const metalnessValue = document.getElementById('metalnessValue'); 
    const materialRoughness = document.getElementById('materialRoughness');
    const roughnessValue = document.getElementById('roughnessValue');
    const materialOpacity = document.getElementById('materialOpacity');
    const opacityValue = document.getElementById('opacityValue');

    const materialClearcoat = document.getElementById('materialClearcoat');
    const clearcoatValue = document.getElementById('clearcoatValue');
    const materialClearcoatRoughness = document.getElementById('materialClearcoatRoughness');
    const clearcoatRoughnessValue = document.getElementById('clearcoatRoughnessValue');
    const materialTransmission = document.getElementById('materialTransmission');
    const transmissionValue = document.getElementById('transmissionValue');
    const materialThickness = document.getElementById('materialThickness');
    const thicknessValue = document.getElementById('thicknessValue');
    const materialReflectivity = document.getElementById('materialReflectivity');
    const reflectivityValue = document.getElementById('reflectivityValue');
    const materialIridescence = document.getElementById('materialIridescence');
    const iridescenceValue = document.getElementById('iridescenceValue');
    const materialIridescenceIOR = document.getElementById('materialIridescenceIOR');
    const iridescenceIORValue = document.getElementById('iridescenceIORValue');

    const materialEmissive = document.getElementById('materialEmissive');
    const materialEmissiveIntensity = document.getElementById('materialEmissiveIntensity');
    const emissiveIntensityValue = document.getElementById('emissiveIntensityValue');
    
    const materialTextureUpload = document.getElementById('materialTextureUpload');
    const clearCustomTextureButton = document.getElementById('clearCustomTexture');
    const physicalMaterialPropsPanel = document.getElementById('physicalMaterialProps'); // Panel for MeshPhysicalMaterial specific properties


    // 2. Add Event Listeners for Direct Inputs
    const addInputListener = (element, propName, valueSpan = null, type = 'float') => {
        if (!element) {
            console.warn(`Material editor UI element for '${propName}' not found.`);
            return;
        }
        element.addEventListener('input', () => {
            let value;
            if (element.type === 'color') {
                value = element.value;
            } else if (type === 'int') {
                value = parseInt(element.value);
            } else { // float or range
                value = parseFloat(element.value);
            }
            updateMaterialFromUI(propName, value);
            if (valueSpan && element.type === 'range') {
                valueSpan.textContent = value.toFixed(2);
            }
        });
        // Initial update for span
        if (valueSpan && element.type === 'range') {
            valueSpan.textContent = parseFloat(element.value).toFixed(2);
        }
    };

    addInputListener(materialColor, 'color', null, 'color');
    addInputListener(materialMetalness, 'metalness', metalnessValue);
    addInputListener(materialRoughness, 'roughness', roughnessValue);
    addInputListener(materialOpacity, 'opacity', opacityValue);
    addInputListener(materialEmissive, 'emissive', null, 'color');
    addInputListener(materialEmissiveIntensity, 'emissiveIntensity', emissiveIntensityValue);
    
    addInputListener(materialClearcoat, 'clearcoat', clearcoatValue);
    addInputListener(materialClearcoatRoughness, 'clearcoatRoughness', clearcoatRoughnessValue);
    addInputListener(materialTransmission, 'transmission', transmissionValue);
    addInputListener(materialThickness, 'thickness', thicknessValue);
    addInputListener(materialReflectivity, 'reflectivity', reflectivityValue);
    addInputListener(materialIridescence, 'iridescence', iridescenceValue);
    addInputListener(materialIridescenceIOR, 'iridescenceIOR', iridescenceIORValue);


    materialTextureUpload.addEventListener('change', uploadCustomTexture);
    clearCustomTextureButton.addEventListener('click', () => updateMaterialFromUI('map', null));


    // 3. Setup dat.GUI for Presets
    const gui = new dat.GUI({ autoPlace: false });
    const settings = {
        texturePreset: 'plastic' // Default preset selection
    };

    const presetNames = Object.keys(textures);
    gui.add(settings, 'texturePreset', presetNames).name('Material Preset').onChange((value) => {
        applyPresetMaterial(value);
    });

    gui.domElement.style.position = 'relative';
    gui.domElement.style.marginTop = '10px';

    const materialPresetsDiv = document.getElementById('materialPresets');
    if (materialPresetsDiv) {
        materialPresetsDiv.appendChild(gui.domElement);
    }


    // 4. Expose an update function globally for external calls (e.g., on selection change)
    window.updateMaterialEditorUI = function() {
        // Find the main material editor panel and toggle its visibility
        const materialEditorPanel = document.getElementById('material-editor-panel');
        if (!materialEditorPanel) return; // Safeguard

        if (!activeObject || !activeObject.isMesh) {
            materialEditorPanel.style.display = 'none';
            return;
        }

        const material = activeObject.material;
        // Ensure material is an array (multi-material) or single object
        const firstMaterial = Array.isArray(material) ? material[0] : material;

        if (!firstMaterial || (!firstMaterial.isMeshStandardMaterial && !firstMaterial.isMeshPhysicalMaterial)) {
            materialEditorPanel.style.display = 'none';
            console.warn("Material Editor: Unsupported material type for activeObject. Hiding panel.");
            return;
        }
        materialEditorPanel.style.display = 'block';

        // Update UI inputs to reflect the activeObject's material properties (using firstMaterial for values)
        // General properties
        materialColor.value = '#' + firstMaterial.color.getHexString();
        materialMetalness.value = firstMaterial.metalness;
        metalnessValue.textContent = firstMaterial.metalness.toFixed(2);
        materialRoughness.value = firstMaterial.roughness;
        roughnessValue.textContent = firstMaterial.roughness.toFixed(2);
        materialOpacity.value = firstMaterial.opacity;
        opacityValue.textContent = firstMaterial.opacity.toFixed(2);

        // Emissive properties
        materialEmissive.value = '#' + (firstMaterial.emissive?.getHexString() || '000000');
        materialEmissiveIntensity.value = firstMaterial.emissiveIntensity || 1;
        emissiveIntensityValue.textContent = (firstMaterial.emissiveIntensity || 1).toFixed(2);

        // Conditional display and update for MeshPhysicalMaterial specific properties
        if (firstMaterial.isMeshPhysicalMaterial) {
            physicalMaterialPropsPanel.style.display = 'block';
            materialClearcoat.value = firstMaterial.clearcoat || 0;
            clearcoatValue.textContent = (firstMaterial.clearcoat || 0).toFixed(2);
            materialClearcoatRoughness.value = firstMaterial.clearcoatRoughness || 0;
            clearcoatRoughnessValue.textContent = (firstMaterial.clearcoatRoughness || 0).toFixed(2);
            materialTransmission.value = firstMaterial.transmission || 0;
            transmissionValue.textContent = (firstMaterial.transmission || 0).toFixed(2);
            materialThickness.value = firstMaterial.thickness || 0;
            thicknessValue.textContent = (firstMaterial.thickness || 0).toFixed(2);
            materialReflectivity.value = firstMaterial.reflectivity || 0.5;
            reflectivityValue.textContent = (firstMaterial.reflectivity || 0.5).toFixed(2);
            materialIridescence.value = firstMaterial.iridescence || 0;
            iridescenceValue.textContent = (firstMaterial.iridescence || 0).toFixed(2);
            materialIridescenceIOR.value = firstMaterial.iridescenceIOR || 1.3;
            iridescenceIORValue.textContent = (firstMaterial.iridescenceIOR || 1.3).toFixed(2);
        } else {
            physicalMaterialPropsPanel.style.display = 'none';
        }

        // Reset file input for security (cannot set value programmatically)
        materialTextureUpload.value = '';

        // Update dat.GUI selector to match current material if it's a preset clone
        const currentPresetName = Object.keys(textures).find(key => {
            const preset = textures[key];
            return firstMaterial.name === preset.name; // Compare by assigned preset name
        });
        if (currentPresetName) {
            settings.texturePreset = currentPresetName;
            gui.updateDisplay(); 
        } else {
            // If it's a custom or modified material, default to 'plastic' or 'Custom' option
            settings.texturePreset = 'plastic'; // Or add a 'Custom' entry
            gui.updateDisplay();
        }
    };
    
    // Initial call to hide or show based on current selection state
    window.updateMaterialEditorUI();
}
// --- MATERIAL UPDATE LOGIC ---

/**
 * Applies a specific property change to the active object's material(s).
 * Records the change in history. Handles multiple materials on an object.
 */
function updateMaterialFromUI(propName, value) {
    if (!activeObject || !activeObject.isMesh) return;

    const currentMaterialArray = Array.isArray(activeObject.material) ? activeObject.material : [activeObject.material];

    // Capture old material(s) for history. Deep clone for safety.
    const oldMaterialClones = currentMaterialArray.map(m => m.clone());

    currentMaterialArray.forEach(mat => {
        // Ensure material supports the property before trying to set it
        if (mat[propName] !== undefined || (mat.color && propName === 'color') || (mat.emissive && propName === 'emissive')) {
            if (propName === 'color' || propName === 'emissive' || propName === 'sheenColor' || propName === 'attenuationColor') {
                mat[propName].set(value);
            } else if (propName === 'map') {
                // If existing map, dispose it first.
                if (mat.map && mat.map !== value) {
                    mat.map.dispose(); 
                }
                mat.map = value; // value could be a Texture object or null
            } else {
                mat[propName] = value;
            }
            // Special handling for transparent property based on opacity
            if (propName === 'opacity') {
                mat.transparent = value < 1;
            }
            mat.needsUpdate = true;
        } else {
            // console.log(`Material property '${propName}' not found or not applicable to material type ${mat.type}. Skipping.`);
        }
    });
    
    // Update architecturalElements' originalColor if activeObject is one
    const archElement = architecturalElements.find(el => el.uuid === activeObject.uuid);
    if (archElement) {
        // Store the color of the first material for display/selection highlight
        archElement.userData.originalColor = currentMaterialArray[0].color.clone();
    }

    // Record action for undo/redo
    if (window.historyManager) {
        // Clone the material(s) *after* the change for the new state
        const newMaterialClones = currentMaterialArray.map(m => m.clone());
        window.historyManager.recordMaterialChange(activeObject, oldMaterialClones, newMaterialClones);
    }
    // No need to call window.updateMaterialEditorUI() here as this is the source of the change
}


/**
 * Applies a chosen material preset to the active object.
 * Updates the UI to reflect the new material.
 */
function applyPresetMaterial(textureName) {
    if (!activeObject || !activeObject.isMesh) return;

    const presetMaterial = textures[textureName];
    if (!presetMaterial) {
        console.warn(`Preset material '${textureName}' not found.`);
        return;
    }

    const currentMaterialArray = Array.isArray(activeObject.material) ? activeObject.material : [activeObject.material];

    // Capture old material(s) for history. Deep clone for safety.
    const oldMaterialClones = currentMaterialArray.map(m => m.clone());

    // Dispose old materials (if not reused)
    currentMaterialArray.forEach(m => m.dispose());

    // Apply the new preset material(s)
    if (Array.isArray(activeObject.material)) {
        // For multi-material objects, create a clone of the preset for each slot
        activeObject.material = activeObject.material.map(() => presetMaterial.clone());
    } else {
        activeObject.material = presetMaterial.clone(); // Apply a clone to single material
    }
    
    // Ensure the name is set on the new material instance for UI matching
    if (Array.isArray(activeObject.material)) {
        activeObject.material.forEach(m => m.name = presetMaterial.name);
    } else {
        activeObject.material.name = presetMaterial.name;
    }

    activeObject.material.needsUpdate = true;
    
    // Update architecturalElements' originalColor if activeObject is one
    const archElement = architecturalElements.find(el => el.uuid === activeObject.uuid);
    if (archElement) {
        archElement.userData.originalColor = (Array.isArray(activeObject.material) ? activeObject.material[0] : activeObject.material).color.clone();
    }

    // Record action for undo/redo
    if (window.historyManager) {
        const newMaterialClones = (Array.isArray(activeObject.material) ? activeObject.material : [activeObject.material]).map(m => m.clone());
        window.historyManager.recordMaterialChange(activeObject, oldMaterialClones, newMaterialClones);
    }

    // Update UI to reflect the newly applied preset material properties
    window.updateMaterialEditorUI(); 
}

/**
 * Uploads a custom texture image and applies it as a map to the active object's material.
 */
function uploadCustomTexture(event) {
    if (!activeObject || !activeObject.isMesh) return;

    const file = event.target.files[0];
    if (!file) return;

    const currentMaterialArray = Array.isArray(activeObject.material) ? activeObject.material : [activeObject.material];

    // Capture old material(s) for history.
    const oldMaterialClones = currentMaterialArray.map(m => m.clone());

    const reader = new FileReader();
    reader.onload = function(e) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(e.target.result, (loadedTexture) => {
            loadedTexture.encoding = THREE.sRGBEncoding;
            loadedTexture.wrapS = THREE.RepeatWrapping;
            loadedTexture.wrapT = THREE.RepeatWrapping;
            loadedTexture.repeat.set(1, 1); 

            currentMaterialArray.forEach(m => {
                // Dispose of previous map if it exists and is not the same texture object
                if (m.map && m.map !== loadedTexture) {
                    m.map.dispose();
                }
                m.map = loadedTexture;
                m.needsUpdate = true;
            });

             // Record action for undo/redo
            if (window.historyManager) {
                const newMaterialClones = currentMaterialArray.map(m => m.clone());
                window.historyManager.recordMaterialChange(activeObject, oldMaterialClones, newMaterialClones);
            }
            // Update UI to reflect material state (map will not be visible in sliders, but other properties might change)
            // No need to call window.updateMaterialEditorUI here unless other sliders need to be reset etc.
        }, 
        undefined, // onProgress callback
        (err) => {
            console.error("Error loading texture:", err);
            alert("Failed to load texture. Ensure it's a valid image file.");
        });
    };
    reader.readAsDataURL(file);
}

/**
 * Clears the custom texture map from the active object's material.
 */
function clearCustomTexture() {
    if (!activeObject || !activeObject.isMesh) return;

    const currentMaterialArray = Array.isArray(activeObject.material) ? activeObject.material : [activeObject.material];

    // Capture old material(s) for history.
    const oldMaterialClones = currentMaterialArray.map(m => m.clone());

    currentMaterialArray.forEach(m => {
        if (m.map) {
            m.map.dispose(); // Dispose the texture
            m.map = null;    // Remove reference
            m.needsUpdate = true;
        }
    });

    // Record action for undo/redo
    if (window.historyManager) {
        const newMaterialClones = currentMaterialArray.map(m => m.clone());
        window.historyManager.recordMaterialChange(activeObject, oldMaterialClones, newMaterialClones);
    }
    // Update UI (file input will already be cleared by click event)
}

 */

document.getElementById('sidebar-toggle').addEventListener('click', function () {
    const sidebar = document.getElementById('3D-Controls');
    if (sidebar.style.display === 'none') {
        sidebar.style.display = 'block';
    } else {
        sidebar.style.display = 'none';
    }
});

  
document.addEventListener("DOMContentLoaded", function() {
    // Get DOM elements
    const shapeButton = document.getElementById('shapeButton');
    const shapeMenu = document.getElementById('shapeMenu');
    
    // Toggle shape menu visibility
    function toggleShapeMenu() {
        shapeMenu.classList.toggle('show');
        
        // Close other open menus when this one opens
        if (shapeMenu.classList.contains('show')) {
            closeAllOtherMenus(shapeMenu);
        }
    }
    
    // Close all other open menus except the one passed in
    function closeAllOtherMenus(menuToKeepOpen) {
        document.querySelectorAll('.menu.show').forEach(menu => {
            if (menu !== menuToKeepOpen) {
                menu.classList.remove('show');
            }
        });
    }
    
    // Event listener for the shape button
    shapeButton.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleShapeMenu();
    });
    
    // Event listeners for all shape buttons
    const shapeButtons = shapeMenu.querySelectorAll('button');
    shapeButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Get the shape type from button id (remove "add" prefix)
            const shapeType = this.id.replace('add', '').toLowerCase();
            
            // Create the selected shape
            createShape(shapeType);
            
            // Close the menu after selection
            shapeMenu.classList.remove('show');
        });
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', function() {
        shapeMenu.classList.remove('show');
    });
    
    // Prevent menu from closing when clicking inside it
    shapeMenu.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    // Keyboard navigation support
    shapeMenu.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            shapeMenu.classList.remove('show');
            shapeButton.focus();
        }
    });
    
    // Function to create shapes (placeholder - implement your actual shape creation)
    function createShape(shapeType) {
        console.log(`Creating ${shapeType}`);
        // Implement your shape creation logic here
        // Example:
        // switch(shapeType) {
        //     case 'cube':
        //         addCubeToScene();
        //         break;
        //     case 'sphere':
        //         addSphereToScene();
        //         break;
        //     ... etc
        // }
    }
    
    // Add right-click to pin functionality
    shapeButtons.forEach(button => {
        button.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            pinButtonToToolbar(this);
        });
    });
    
    // Function to pin a button to the main toolbar
    function pinButtonToToolbar(button) {
        const toolbar = document.getElementById('toolBar');
        const clonedButton = button.cloneNode(true);
        
        // Add tool-button class if not already present
        clonedButton.classList.add('tool-button');
        
        // Insert before the shapes group
        const shapesGroup = document.getElementById('toolbar-group-shapes');
        toolbar.insertBefore(clonedButton, shapesGroup);
        
        // Add click handler to the pinned button
        clonedButton.addEventListener('click', function() {
            const shapeType = this.id.replace('add', '').toLowerCase();
            createShape(shapeType);
        });
        
        // Show feedback
        showPinnedFeedback(clonedButton);
    }
    
    // Visual feedback when pinning a button
    function showPinnedFeedback(button) {
        const originalBg = button.style.backgroundColor;
        button.style.backgroundColor = '#4CAF50';
        
        setTimeout(() => {
            button.style.backgroundColor = originalBg;
        }, 500);
    }
});


    document.addEventListener("DOMContentLoaded", function() {
    // Handle collapsible toolbar buttons
    const collapsibleGroups = document.querySelectorAll('.toolbar-collapsible');
    
    collapsibleGroups.forEach(group => {
        const button = group.querySelector('.tool-button');
        const content = group.querySelector('.toolbar-collapsible-content');
        
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Close all other open groups first
            document.querySelectorAll('.toolbar-collapsible').forEach(otherGroup => {
                if (otherGroup !== group) {
                    otherGroup.classList.remove('active');
                }
            });
            
            // Toggle this group
            group.classList.toggle('active');
        });
    });

    // Close all collapsible menus when clicking elsewhere
    document.addEventListener('click', function() {
        collapsibleGroups.forEach(group => {
            group.classList.remove('active');
        });
    });

    // Prevent closing when clicking inside the menu
    document.querySelectorAll('.toolbar-collapsible-content').forEach(content => {
        content.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
});

// Add this to your JavaScript
function setupPinnableButtons() {
    document.querySelectorAll('.toolbar-collapsible-content button').forEach(button => {
        button.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            
            // Get the parent collapsible group
            const group = this.closest('.toolbar-collapsible');
            const toolbar = document.getElementById('toolBar');
            
            // Create a new standalone button
            const newButton = this.cloneNode(true);
            newButton.classList.add('tool-button');
            newButton.style.margin = '0 2px';
            
            // Insert before the collapsible group
            toolbar.insertBefore(newButton, group);
            
            // Add click handler to the new button
            newButton.addEventListener('click', function() {
                this.dispatchEvent(new Event(button.id + 'Click'));
            });
            
            return false;
        });
    });
}

// Call this after DOM is loaded
setupPinnableButtons();
