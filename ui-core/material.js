let materialEditorDatGUI;
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
// IMPORTANT: Ensure 'ior' is set for MeshPhysicalMaterial where applicable
const textures = {
    glass: new THREE.MeshPhysicalMaterial({
        color: 0xA0D8EF, roughness: 0.1, metalness: 0.1, clearcoat: 1.0, clearcoatRoughness: 0.1,
        transmission: 0.95, thickness: 0.5, reflectivity: 1.0, transparent: true, opacity: 1.0,
        attenuationColor: new THREE.Color(0xA0D8EF), attenuationDistance: 0.75, envMap: loadEnvironmentMap(),
        ior: 1.5, name: "GlassPreset" // Added ior
    }),

    metal: new THREE.MeshPhysicalMaterial({
        color: 0xAAAAAA, roughness: 0.05, metalness: 1.0, clearcoat: 0.7, clearcoatRoughness: 0.02,
        envMap: loadEnvironmentMap(), name: "MetalPreset"
    }),

    water: new THREE.MeshPhysicalMaterial({
        color: 0x1e90ff, roughness: 0.01, metalness: 0.0, transmission: 1, thickness: 0.1,
        transparent: true, opacity: 0.9, envMap: loadEnvironmentMap(), reflectivity: 0.9,
        ior: 1.33, name: "WaterPreset" // Added ior
    }),

    crystal: new THREE.MeshPhysicalMaterial({
        color: 0x7F7FFF, roughness: 0.01, metalness: 0.0, transmission: 1.0, thickness: 1.0,
        transparent: true, opacity: 0.95, envMap: loadEnvironmentMap(), clearcoat: 1.0,
        clearcoatRoughness: 0.01, attenuationColor: new THREE.Color(0x7F7FFF), attenuationDistance: 1.0,
        iridescence: 0.8, iridescenceIOR: 2.0, iridescenceThicknessRange: [200, 500], ior: 1.5, name: "CrystalPreset" // Added ior
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
        iridescence: 1.0, iridescenceIOR: 2.0, iridescenceThicknessRange: [100, 400], ior: 1.3, name: "HolographicPreset" // Added ior
    }),

    matte: new THREE.MeshStandardMaterial({
        color: 0x808080, roughness: 1.0, metalness: 0.0, name: "MattePreset"
    })
};

// --- UI SETUP FUNCTION (called once on init) ---
function setupMaterialEditor() {
    // 1. Setup dat.GUI instance
    if (materialEditorDatGUI) { // Dispose existing GUI if called multiple times
        materialEditorDatGUI.destroy();
    }

    // Set WIDTH here. Folders will inherit this width.
    materialEditorDatGUI = new dat.GUI({
        autoPlace: false,
        width: 280
    });

    // Style positioning
    materialEditorDatGUI.domElement.style.position = 'relative';
    materialEditorDatGUI.domElement.style.marginTop = '10px';

    // --- APPLY CUSTOM BACKGROUND COLOR ---
    // dat.GUI uses specific CSS classes (.dg). We inject styles to override the default opaque black.
    const customCss = `
        .dg.main, .dg .c, .dg .close-button { background-color: rgba(0,0,0,0.5) !important; }
        .dg .cr.number input[type=text], .dg .cr.string input[type=text] { background: rgba(0,0,0,0.3); color: #fff; }
        .dg li.title { background: rgba(0,0,0,0.8) !important; }
    `;
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = customCss;
    materialEditorDatGUI.domElement.appendChild(style);

    const datGuiContainer = document.getElementById('dat-gui-container');
    if (datGuiContainer) {
        datGuiContainer.appendChild(materialEditorDatGUI.domElement);
    } else {
        console.error("Material editor: #dat-gui-container not found. dat.GUI will not be displayed.");
        return;
    }

    // A shared object for dat.GUI to bind to.
    const materialGuiProps = {
        color: '#ffffff',
        metalness: 0.0,
        roughness: 1.0,
        opacity: 1.0,
        emissive: '#000000',
        emissiveIntensity: 1.0,
        clearcoat: 0.0,
        clearcoatRoughness: 0.0,
        transmission: 0.0,
        thickness: 0.0,
        reflectivity: 0.5,
        iridescence: 0.0,
        iridescenceIOR: 1.3,
        ior: 1.5,
        sheen: 0.0,
        sheenRoughness: 0.0,
        sheenColor: '#000000'
    };

    // 2. Add folders and controllers to dat.GUI

    // --- GENERAL PROPERTIES FOLDER ---
    const generalFolder = materialEditorDatGUI.addFolder('General Properties');

    generalFolder.addColor(materialGuiProps, 'color').onChange(value => updateMaterialFromUI('color', value));
    generalFolder.add(materialGuiProps, 'metalness', 0, 1, 0.01).onChange(value => updateMaterialFromUI('metalness', value));
    generalFolder.add(materialGuiProps, 'roughness', 0, 1, 0.01).onChange(value => updateMaterialFromUI('roughness', value));
    generalFolder.add(materialGuiProps, 'opacity', 0, 1, 0.01).onChange(value => updateMaterialFromUI('opacity', value));
    generalFolder.addColor(materialGuiProps, 'emissive').onChange(value => updateMaterialFromUI('emissive', value));
    generalFolder.add(materialGuiProps, 'emissiveIntensity', 0, 5, 0.01).onChange(value => updateMaterialFromUI('emissiveIntensity', value));

    generalFolder.open(); // Default to open

    // --- PHYSICAL PROPERTIES FOLDER ---
    const physicalFolder = materialEditorDatGUI.addFolder('Physical Properties');

    physicalFolder.add(materialGuiProps, 'clearcoat', 0, 1, 0.01).onChange(value => updateMaterialFromUI('clearcoat', value));
    physicalFolder.add(materialGuiProps, 'clearcoatRoughness', 0, 1, 0.01).onChange(value => updateMaterialFromUI('clearcoatRoughness', value));
    physicalFolder.add(materialGuiProps, 'transmission', 0, 1, 0.01).onChange(value => updateMaterialFromUI('transmission', value));
    physicalFolder.add(materialGuiProps, 'thickness', 0, 1, 0.01).onChange(value => updateMaterialFromUI('thickness', value));
    physicalFolder.add(materialGuiProps, 'reflectivity', 0, 1, 0.01).onChange(value => updateMaterialFromUI('reflectivity', value));
    physicalFolder.add(materialGuiProps, 'iridescence', 0, 1, 0.01).onChange(value => updateMaterialFromUI('iridescence', value));
    physicalFolder.add(materialGuiProps, 'iridescenceIOR', 1, 2.5, 0.01).onChange(value => updateMaterialFromUI('iridescenceIOR', value));
    physicalFolder.add(materialGuiProps, 'ior', 1, 2.5, 0.01).name('IOR (Refraction)').onChange(value => updateMaterialFromUI('ior', value));
    physicalFolder.add(materialGuiProps, 'sheen', 0, 1, 0.01).onChange(value => updateMaterialFromUI('sheen', value));
    physicalFolder.add(materialGuiProps, 'sheenRoughness', 0, 1, 0.01).onChange(value => updateMaterialFromUI('sheenRoughness', value));
    physicalFolder.addColor(materialGuiProps, 'sheenColor').onChange(value => updateMaterialFromUI('sheenColor', value));

    physicalFolder.close(); // Default to closed


    // 3. Custom Texture Upload/Clear
    const materialTextureUpload = document.getElementById('materialTextureUpload');
    const clearCustomTextureButton = document.getElementById('clearCustomTexture');

    if (materialTextureUpload) materialTextureUpload.addEventListener('change', uploadCustomTexture);
    if (clearCustomTextureButton) clearCustomTextureButton.addEventListener('click', () => updateMaterialFromUI('map', null));


    // 4. Setup dat.GUI for Presets
    const presetSettings = {
        texturePreset: 'plastic'
    };

    const presetNames = Object.keys(textures);
    // Adding this to main GUI (it will be at the bottom)
    materialEditorDatGUI.add(presetSettings, 'texturePreset', presetNames).name('Material Preset').onChange((value) => {
        applyPresetMaterial(value);
    });


    // 5. Expose an update function globally
    window.updateMaterialEditorUI = function () {
        const materialEditorPanel = document.getElementById('material-editor');
        if (!materialEditorPanel) return;

        if (!activeObject || !activeObject.isMesh) {
            materialEditorPanel.style.display = 'none';
            return;
        }

        const material = activeObject.material;
        const firstMaterial = Array.isArray(material) ? material[0] : material;

        if (!firstMaterial || (!firstMaterial.isMeshStandardMaterial && !firstMaterial.isMeshPhysicalMaterial)) {
            materialEditorPanel.style.display = 'none';
            console.warn("Material Editor: Unsupported material type for activeObject. Hiding panel.");
            return;
        }
        materialEditorPanel.style.display = 'block';

        // --- Update materialGuiProps values ---
        materialGuiProps.color = '#' + firstMaterial.color.getHexString();
        materialGuiProps.metalness = firstMaterial.metalness;
        materialGuiProps.roughness = firstMaterial.roughness;
        materialGuiProps.opacity = firstMaterial.opacity;
        materialGuiProps.emissive = '#' + (firstMaterial.emissive?.getHexString() || '000000');
        materialGuiProps.emissiveIntensity = firstMaterial.emissiveIntensity;

        materialGuiProps.clearcoat = firstMaterial.clearcoat || 0;
        materialGuiProps.clearcoatRoughness = firstMaterial.clearcoatRoughness || 0;
        materialGuiProps.transmission = firstMaterial.transmission || 0;
        materialGuiProps.thickness = firstMaterial.thickness || 0;
        materialGuiProps.reflectivity = firstMaterial.reflectivity || 0.5;
        materialGuiProps.iridescence = firstMaterial.iridescence || 0;
        materialGuiProps.iridescenceIOR = firstMaterial.iridescenceIOR || 1.3;
        materialGuiProps.ior = firstMaterial.ior || 1.5;
        materialGuiProps.sheen = firstMaterial.sheen || 0;
        materialGuiProps.sheenRoughness = firstMaterial.sheenRoughness || 0;
        materialGuiProps.sheenColor = '#' + (firstMaterial.sheenColor?.getHexString() || '000000');

        // --- Refresh UI ---
        // Iterate over controllers to force update visual sliders
        for (var i in materialEditorDatGUI.__controllers) {
            materialEditorDatGUI.__controllers[i].updateDisplay();
        }
        for (var f in materialEditorDatGUI.__folders) {
            for (var i in materialEditorDatGUI.__folders[f].__controllers) {
                materialEditorDatGUI.__folders[f].__controllers[i].updateDisplay();
            }
        }

        // --- Toggle Physical Folder Visibility ---
        if (firstMaterial.isMeshPhysicalMaterial) {
            physicalFolder.domElement.parentElement.style.display = ''; // Show
        } else {
            physicalFolder.domElement.parentElement.style.display = 'none'; // Hide
        }

        // --- Update Preset Dropdown ---
        const currentPresetName = Object.keys(textures).find(key => {
            const preset = textures[key];
            return firstMaterial.name === preset.name;
        });
        presetSettings.texturePreset = currentPresetName ? currentPresetName : 'plastic';

        // Reset file input
        materialTextureUpload.value = '';
    };

    // Initial call
    window.updateMaterialEditorUI();
}

// --- MATERIAL UPDATE LOGIC --- (These functions remain largely the same, but now called by dat.GUI)

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
        // Check for specific material types if a property is exclusive (e.g., transmission for Physical)
        if (mat[propName] !== undefined || (mat.color && propName === 'color') || (mat.emissive && propName === 'emissive') || (mat.sheenColor && propName === 'sheenColor')) {
            if (propName === 'color' || propName === 'emissive' || propName === 'sheenColor' || propName === 'attenuationColor') {
                mat[propName].set(value);
            } else if (propName === 'map') {
                if (mat.map && mat.map !== value) {
                    mat.map.dispose();
                }
                mat.map = value;
            } else {
                mat[propName] = value;
            }
            if (propName === 'opacity') {
                mat.transparent = value < 1;
            }
            mat.needsUpdate = true;
        }
    });

    const archElement = architecturalElements.find(el => el.uuid === activeObject.uuid);
    if (archElement) {
        archElement.userData.originalColor = currentMaterialArray[0].color.clone();
    }

    if (window.historyManager) {
        const newMaterialClones = currentMaterialArray.map(m => m.clone());
        window.historyManager.recordMaterialChange(activeObject, oldMaterialClones, newMaterialClones);
    }
    // No need to call window.updateMaterialEditorUI() here; dat.GUI automatically updates its UI.
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

    const oldMaterialClones = currentMaterialArray.map(m => m.clone());
    currentMaterialArray.forEach(m => m.dispose()); // Dispose old materials

    if (Array.isArray(activeObject.material)) {
        activeObject.material = activeObject.material.map(() => presetMaterial.clone());
    } else {
        activeObject.material = presetMaterial.clone();
    }

    if (Array.isArray(activeObject.material)) {
        activeObject.material.forEach(m => m.name = presetMaterial.name);
    } else {
        activeObject.material.name = presetMaterial.name;
    }

    activeObject.material.needsUpdate = true;

    const archElement = architecturalElements.find(el => el.uuid === activeObject.uuid);
    if (archElement) {
        archElement.userData.originalColor = (Array.isArray(activeObject.material) ? activeObject.material[0] : activeObject.material).color.clone();
    }

    if (window.historyManager) {
        const newMaterialClones = (Array.isArray(activeObject.material) ? activeObject.material : [activeObject.material]).map(m => m.clone());
        window.historyManager.recordMaterialChange(activeObject, oldMaterialClones, newMaterialClones);
    }

    // Crucial: Update UI to reflect the newly applied preset material properties
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
    const oldMaterialClones = currentMaterialArray.map(m => m.clone());

    const reader = new FileReader();
    reader.onload = function (e) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(e.target.result, (loadedTexture) => {
            loadedTexture.encoding = THREE.sRGBEncoding;
            loadedTexture.wrapS = THREE.RepeatWrapping;
            loadedTexture.wrapT = THREE.RepeatWrapping;
            loadedTexture.repeat.set(1, 1);

            currentMaterialArray.forEach(m => {
                if (m.map && m.map !== loadedTexture) {
                    m.map.dispose();
                }
                m.map = loadedTexture;
                m.needsUpdate = true;
            });

            if (window.historyManager) {
                const newMaterialClones = currentMaterialArray.map(m => m.clone());
                window.historyManager.recordMaterialChange(activeObject, oldMaterialClones, newMaterialClones);
            }
            // Update the GUI's preset selector if needed, might set to 'Custom' or first preset
            window.updateMaterialEditorUI();
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
    const oldMaterialClones = currentMaterialArray.map(m => m.clone());

    currentMaterialArray.forEach(m => {
        if (m.map) {
            m.map.dispose();
            m.map = null;
            m.needsUpdate = true;
        }
    });

    if (window.historyManager) {
        const newMaterialClones = currentMaterialArray.map(m => m.clone());
        window.historyManager.recordMaterialChange(activeObject, oldMaterialClones, newMaterialClones);
    }
    // Update the GUI display to reflect no map (e.g., reset relevant controls)
    window.updateMaterialEditorUI();
}
