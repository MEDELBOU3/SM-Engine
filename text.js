
class WaterSystem {
    constructor(scene, camera, renderer) {
        // --- Properties ---
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.terrain = null;
        this.waterBodies = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.textureLoader = new THREE.TextureLoader();
        this.waterNormalMap = this.textureLoader.load('https://threejs.org/examples/textures/waternormals.jpg', t => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
        });
        this.waterContainer = new THREE.Group();
        this.waterContainer.name = "WaterBodies";
        this.scene.add(this.waterContainer);

        // --- Water Settings (Enhanced Controls) ---
        this.waterSettings = {
            deepColor: '#001122',
            surfaceColor: '#4da6ff',
            transparency: 0.7,
            waveHeight: 0.15,
            waveSpeed: 0.8,
            waveFrequencyX: 4.0,
            waveFrequencyZ: 2.0,
            colorIntensity: 3.0,
            normalIntensity: 1.5,
            fresnelPower: 2.0,
            reflectionColor: '#87ceeb'
        };

        // --- State Management ---
        this.isDrawing = false;
        this.isEditing = false;
        this.isWaitingToSelect = false;

        // --- State-Specific Data ---
        this.currentPoints = [];
        this.previewLine = null;
        this.selectedWaterBody = null;
        this.controlPoints = [];
        this.selectedControlPoint = null;

        this.initShaders();
        this.initUI();
        this.setupEventListeners();
        console.log("Enhanced WaterSystem Initialized and waiting for terrain.");
    }

    // Enhanced shaders with better visibility and color
    initShaders() {
        if (!document.getElementById('waterVertexShader')) {
            const vertexShader = document.createElement('script');
            vertexShader.id = 'waterVertexShader';
            vertexShader.type = 'x-shader/x-vertex';
            vertexShader.textContent = `
                uniform float uTime;
                uniform float uWaveElevation;
                uniform vec2 uWaveFrequency;
                uniform float uWaveSpeed;

                varying vec2 vUv;
                varying float vElevation;
                varying vec3 vWorldPosition;
                varying vec3 vNormal;

                // Enhanced noise function for more realistic waves
                float hash(float n) { return fract(sin(n) * 1e4); }
                float noise(vec3 x) {
                    const vec3 step = vec3(110, 241, 171);
                    vec3 i = floor(x);
                    vec3 f = fract(x);
                    float n = dot(i, step);
                    vec3 u = f * f * (3.0 - 2.0 * f);
                    return mix(mix(mix( hash(n + dot(step, vec3(0, 0, 0))), hash(n + dot(step, vec3(1, 0, 0))), u.x),
                                   mix( hash(n + dot(step, vec3(0, 1, 0))), hash(n + dot(step, vec3(1, 1, 0))), u.x), u.y),
                               mix(mix( hash(n + dot(step, vec3(0, 0, 1))), hash(n + dot(step, vec3(1, 0, 1))), u.x),
                                   mix( hash(n + dot(step, vec3(0, 1, 1))), hash(n + dot(step, vec3(1, 1, 1))), u.x), u.y), u.z);
                }

                void main() {
                    vUv = uv;
                    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    
                    // Fix normal calculation for proper lighting from both sides
                    vec3 objectNormal = normal;
                    vNormal = normalize(normalMatrix * objectNormal);

                    // Multiple wave layers for more realistic water
                    float wave1 = noise(vec3(vWorldPosition.x * uWaveFrequency.x * 0.5 + uTime * uWaveSpeed, 
                                            vWorldPosition.z * uWaveFrequency.y * 0.5 + uTime * uWaveSpeed * 0.8, 
                                            uTime * 0.1)) * 0.6;
                    
                    float wave2 = noise(vec3(vWorldPosition.x * uWaveFrequency.x * 1.2 + uTime * uWaveSpeed * 1.5, 
                                            vWorldPosition.z * uWaveFrequency.y * 1.2 + uTime * uWaveSpeed * 1.2, 
                                            uTime * 0.15)) * 0.3;
                    
                    float wave3 = noise(vec3(vWorldPosition.x * uWaveFrequency.x * 2.0 + uTime * uWaveSpeed * 2.0, 
                                            vWorldPosition.z * uWaveFrequency.y * 2.0 + uTime * uWaveSpeed * 1.8, 
                                            uTime * 0.2)) * 0.1;
                    
                    float elevation = (wave1 + wave2 + wave3) * uWaveElevation;
                    vElevation = elevation;

                    vec3 newPosition = position;
                    newPosition.y += elevation;

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                }
            `;
            document.head.appendChild(vertexShader);
        }

        if (!document.getElementById('waterFragmentShader')) {
            const fragmentShader = document.createElement('script');
            fragmentShader.id = 'waterFragmentShader';
            fragmentShader.type = 'x-shader/x-fragment';
            fragmentShader.textContent = `
                uniform float uTime;
                uniform vec3 uDeepColor;
                uniform vec3 uSurfaceColor;
                uniform vec3 uReflectionColor;
                uniform float uColorIntensity;
                uniform float uNormalIntensity;
                uniform float uFresnelPower;
                uniform sampler2D uNormalMap;

                varying vec2 vUv;
                varying float vElevation;
                varying vec3 vWorldPosition;
                varying vec3 vNormal;

                void main() {
                    // Enhanced animated surface ripples
                    vec2 uv1 = vUv * 8.0 + vec2(uTime * 0.03, uTime * 0.05);
                    vec2 uv2 = vUv * 12.0 - vec2(uTime * 0.04, uTime * 0.03);
                    vec2 uv3 = vUv * 16.0 + vec2(uTime * 0.02, -uTime * 0.04);
                    
                    vec3 normal1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
                    vec3 normal2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;
                    vec3 normal3 = texture2D(uNormalMap, uv3).rgb * 2.0 - 1.0;
                    
                    vec3 surfaceNormal = normalize(normal1 + normal2 * 0.5 + normal3 * 0.3) * uNormalIntensity;

                    // Enhanced Fresnel effect - works from both sides
                    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
                    vec3 worldNormal = normalize(vNormal);
                    
                    // Handle both front and back faces
                    if (!gl_FrontFacing) {
                        worldNormal = -worldNormal;
                    }
                    
                    float fresnel = 1.0 - max(0.0, dot(viewDirection, worldNormal));
                    fresnel = pow(fresnel, uFresnelPower);

                    // Enhanced depth-based color mixing
                    float depthFactor = smoothstep(-0.2, 0.2, vElevation);
                    vec3 waterColor = mix(uDeepColor, uSurfaceColor, depthFactor);
                    
                    // Add foam/surface effects
                    float foam = smoothstep(0.1, 0.2, vElevation);
                    waterColor = mix(waterColor, vec3(1.0, 1.0, 1.0), foam * 0.3);
                    
                    // Apply reflection based on fresnel
                    vec3 finalColor = mix(waterColor * uColorIntensity, uReflectionColor, fresnel * 0.6);
                    
                    // Add subtle caustic-like effects
                    float caustic = sin(vWorldPosition.x * 20.0 + uTime * 3.0) * sin(vWorldPosition.z * 20.0 + uTime * 2.5) * 0.1;
                    finalColor += caustic * vec3(0.2, 0.4, 0.6);

                    // Ensure water is always visible and blue-tinted from both sides
                    finalColor = max(finalColor, vec3(0.1, 0.3, 0.6));
                    
                    // Higher alpha for better visibility
                    gl_FragColor = vec4(finalColor, 0.9);
                }
            `;
            document.head.appendChild(fragmentShader);
        }
    }

    setTerrain(newTerrain) {
        if (newTerrain && newTerrain.isMesh) {
            this.terrain = newTerrain;
            document.getElementById('water-status-indicator').textContent = 'Terrain Ready. Add water.';
            console.log("Water system: Terrain set successfully!");
        }
    }

    createWaterBody(points) {
        console.log("Attempting to create water body...");
        try {
            const uniforms = {
                uTime: { value: 0.0 },
                uDeepColor: { value: new THREE.Color(this.waterSettings.deepColor) },
                uSurfaceColor: { value: new THREE.Color(this.waterSettings.surfaceColor) },
                uReflectionColor: { value: new THREE.Color(this.waterSettings.reflectionColor) },
                uColorIntensity: { value: this.waterSettings.colorIntensity },
                uNormalIntensity: { value: this.waterSettings.normalIntensity },
                uFresnelPower: { value: this.waterSettings.fresnelPower },
                uWaveElevation: { value: this.waterSettings.waveHeight },
                uWaveFrequency: { value: new THREE.Vector2(this.waterSettings.waveFrequencyX, this.waterSettings.waveFrequencyZ) },
                uWaveSpeed: { value: this.waterSettings.waveSpeed },
                uNormalMap: { value: this.waterNormalMap }
            };

            const material = new THREE.ShaderMaterial({
                vertexShader: document.getElementById('waterVertexShader').textContent,
                fragmentShader: document.getElementById('waterFragmentShader').textContent,
                uniforms: uniforms,
                transparent: true,
                side: THREE.DoubleSide, // Make visible from both sides
                depthWrite: false, // Better transparency handling
                blending: THREE.NormalBlending,
                alphaTest: 0.1 // Ensure alpha testing for proper rendering
            });

            const shape = new THREE.Shape();
            shape.moveTo(points[0].x, points[0].z);
            for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
            shape.closePath();

            const geometry = new THREE.ShapeGeometry(shape);
            geometry.rotateX(-Math.PI / 2); // Rotate to lay flat
            
            // Ensure proper normals for double-sided visibility
            geometry.computeVertexNormals();
            
            const waterMesh = new THREE.Mesh(geometry, material);
            const avgHeight = points.reduce((acc, p) => acc + p.y, 0) / points.length;
            waterMesh.position.y = avgHeight + 0.05; // Better offset
            waterMesh.name = `WaterBody_${this.waterBodies.length}`;
            waterMesh.userData.points = points.map(p => p.clone());
            waterMesh.userData.settings = { ...this.waterSettings }; // Store settings with each water body
            
            console.log("✅ Water mesh created successfully!", waterMesh);
            return waterMesh;
        } catch (error) {
            console.error("❌ FAILED TO CREATE WATER MESH:", error);
            alert("Failed to create water. Check console (F12) for shader compilation errors.");
            return null;
        }
    }

    // Update water settings for selected water body
    updateWaterSettings() {
        if (this.selectedWaterBody && this.selectedWaterBody.material.uniforms) {
            const uniforms = this.selectedWaterBody.material.uniforms;
            uniforms.uDeepColor.value.set(this.waterSettings.deepColor);
            uniforms.uSurfaceColor.value.set(this.waterSettings.surfaceColor);
            uniforms.uReflectionColor.value.set(this.waterSettings.reflectionColor);
            uniforms.uColorIntensity.value = this.waterSettings.colorIntensity;
            uniforms.uNormalIntensity.value = this.waterSettings.normalIntensity;
            uniforms.uFresnelPower.value = this.waterSettings.fresnelPower;
            uniforms.uWaveElevation.value = this.waterSettings.waveHeight;
            uniforms.uWaveFrequency.value.set(this.waterSettings.waveFrequencyX, this.waterSettings.waveFrequencyZ);
            uniforms.uWaveSpeed.value = this.waterSettings.waveSpeed;
            
            // Update stored settings
            this.selectedWaterBody.userData.settings = { ...this.waterSettings };
        }
    }

    // Apply settings to all water bodies
    updateAllWaterSettings() {
        this.waterBodies.forEach(waterBody => {
            if (waterBody.material.uniforms) {
                const uniforms = waterBody.material.uniforms;
                uniforms.uDeepColor.value.set(this.waterSettings.deepColor);
                uniforms.uSurfaceColor.value.set(this.waterSettings.surfaceColor);
                uniforms.uReflectionColor.value.set(this.waterSettings.reflectionColor);
                uniforms.uColorIntensity.value = this.waterSettings.colorIntensity;
                uniforms.uNormalIntensity.value = this.waterSettings.normalIntensity;
                uniforms.uFresnelPower.value = this.waterSettings.fresnelPower;
                uniforms.uWaveElevation.value = this.waterSettings.waveHeight;
                uniforms.uWaveFrequency.value.set(this.waterSettings.waveFrequencyX, this.waterSettings.waveFrequencyZ);
                uniforms.uWaveSpeed.value = this.waterSettings.waveSpeed;
                
                waterBody.userData.settings = { ...this.waterSettings };
            }
        });
    }

    update(deltaTime) {
        for (const waterBody of this.waterBodies) {
            if (waterBody.material.uniforms) {
                waterBody.material.uniforms.uTime.value += deltaTime;
            }
        }
    }


    // In your WaterSystem class...
    /*initUI() {
        const container = document.createElement('div');
        container.id = 'water-system-container';
        container.style.cssText = `
            position: fixed; 
            bottom: 20px; 
            left: 20px; 
            background: rgba(20, 40, 80, 0.95); 
            border-radius: 12px; 
            padding: 15px; 
            color: white; 
            font-family: Arial, sans-serif; 
            z-index: 1000; 
            display: flex; 
            flex-direction: column; 
            gap: 10px; 
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4); 
            border: 2px solid #4a90e2;
            max-width: 300px;
            max-height: 80vh;
            overflow-y: auto;
        `;

        const title = document.createElement('div');
        title.innerHTML = `<strong>🌊 Enhanced Water System</strong>`;
        title.style.cssText = `
            text-align: center; 
            border-bottom: 2px solid #4a90e2; 
            padding-bottom: 8px; 
            margin-bottom: 8px;
            font-size: 16px;
        `;

        // Main action buttons
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `display: flex; gap: 8px; flex-wrap: wrap;`;

        const drawButton = this.createButton('Add Water Body', () => this.toggleDrawingMode());
        drawButton.id = 'draw-water-button';

        const editButton = this.createButton('Edit Water', () => this.toggleEditMode());
        editButton.id = 'edit-water-button';

        const deleteButton = this.createButton('Delete Water', () => this.deleteSelectedWater());
        deleteButton.id = 'delete-water-button';
        deleteButton.style.background = '#dc3545';

        buttonsContainer.appendChild(drawButton);
        buttonsContainer.appendChild(editButton);
        buttonsContainer.appendChild(deleteButton);

        // Controls toggle
        const controlsToggle = this.createButton('Show Controls', () => this.toggleControls());
        controlsToggle.id = 'controls-toggle-button';

        // Controls panel
        const controlsPanel = document.createElement('div');
        controlsPanel.id = 'water-controls-panel';
        controlsPanel.style.cssText = `
            display: none; 
            border-top: 1px solid #4a90e2; 
            padding-top: 10px; 
            margin-top: 5px;
        `;

        // Add all the control sliders
        controlsPanel.appendChild(this.createControlGroup('Colors', [
            this.createColorControl('Deep Color', 'deepColor'),
            this.createColorControl('Surface Color', 'surfaceColor'),
            this.createColorControl('Reflection Color', 'reflectionColor')
        ]));

        controlsPanel.appendChild(this.createControlGroup('Waves', [
            this.createSliderControl('Wave Height', 'waveHeight', 0, 1, 0.01),
            this.createSliderControl('Wave Speed', 'waveSpeed', 0, 3, 0.1),
            this.createSliderControl('Frequency X', 'waveFrequencyX', 0.1, 10, 0.1),
            this.createSliderControl('Frequency Z', 'waveFrequencyZ', 0.1, 10, 0.1)
        ]));

        controlsPanel.appendChild(this.createControlGroup('Appearance', [
            this.createSliderControl('Color Intensity', 'colorIntensity', 0.1, 8, 0.1),
            this.createSliderControl('Normal Intensity', 'normalIntensity', 0.1, 3, 0.1),
            this.createSliderControl('Fresnel Power', 'fresnelPower', 0.5, 5, 0.1)
        ]));

        // Apply buttons
        const applyContainer = document.createElement('div');
        applyContainer.style.cssText = `display: flex; gap: 5px; margin-top: 10px;`;

        const applyToSelected = this.createButton('Apply to Selected', () => this.updateWaterSettings());
        applyToSelected.style.fontSize = '12px';
        applyToSelected.style.padding = '6px 10px';

        const applyToAll = this.createButton('Apply to All', () => this.updateAllWaterSettings());
        applyToAll.style.fontSize = '12px';
        applyToAll.style.padding = '6px 10px';
        applyToAll.style.background = '#28a745';

        applyContainer.appendChild(applyToSelected);
        applyContainer.appendChild(applyToAll);
        controlsPanel.appendChild(applyContainer);

        // Status indicator
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'water-status-indicator';
        statusIndicator.style.cssText = `
            padding: 8px; 
            margin-top: 8px; 
            border-radius: 6px; 
            text-align: center; 
            font-size: 14px; 
            background: #1a2a4a;
            border: 1px solid #4a90e2;
        `;
        statusIndicator.textContent = 'Add a terrain to begin.';

        container.appendChild(title);
        container.appendChild(buttonsContainer);
        container.appendChild(controlsToggle);
        container.appendChild(controlsPanel);
        container.appendChild(statusIndicator);
        document.body.appendChild(container);
    }*/

        // In your WaterSystem class...

initUI() {
    // --- 1. Find the target container in your HTML ---
    // Note: Using the ID 'water-containre-html' exactly as you provided it.
    const targetContainer = document.getElementById('water-containre-html');

    // --- 2. Safety Check ---
    // If the div doesn't exist, stop and log an error.
    if (!targetContainer) {
        console.error("Water System UI Error: The container div with id 'water-containre-html' was not found.");
        return;
    }

    // Clear any old content from the container, just in case.
    targetContainer.innerHTML = '';

    // --- 3. Create the UI content ---
    // This div will hold all the buttons and controls.
    // Notice it no longer has any positioning or background styles.
    const panelContent = document.createElement('div');
    panelContent.style.cssText = `
        display: flex; 
        flex-direction: column; 
        gap: 10px; 
        width: 100%;
        height: 100%;
    `;

    const title = document.createElement('div');
    title.innerHTML = `<strong>🌊 Enhanced Water System</strong>`;
    title.style.cssText = `
        text-align: center; 
        border-bottom: 2px solid #4a90e2; 
        padding-bottom: 8px; 
        margin-bottom: 8px;
        font-size: 16px;
    `;

    // Main action buttons
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `display: flex; gap: 8px; flex-wrap: wrap;`;

    const drawButton = this.createButton('Add Water Body', () => this.toggleDrawingMode());
    drawButton.id = 'draw-water-button';

    const editButton = this.createButton('Edit Water', () => this.toggleEditMode());
    editButton.id = 'edit-water-button';

    const deleteButton = this.createButton('Delete Water', () => this.deleteSelectedWater());
    deleteButton.id = 'delete-water-button';
    deleteButton.style.background = '#dc3545';

    buttonsContainer.appendChild(drawButton);
    buttonsContainer.appendChild(editButton);
    buttonsContainer.appendChild(deleteButton);

    // Controls toggle
    const controlsToggle = this.createButton('Show Controls', () => this.toggleControls());
    controlsToggle.id = 'controls-toggle-button';

    // Controls panel
    const controlsPanel = document.createElement('div');
    controlsPanel.id = 'water-controls-panel';
    controlsPanel.style.cssText = `
        display: none; 
        border-top: 1px solid #4a90e2; 
        padding-top: 10px; 
        margin-top: 5px;
    `;

    // Add all the control sliders (your existing functions are called here)
    controlsPanel.appendChild(this.createControlGroup('Colors', [
        this.createColorControl('Deep Color', 'deepColor'),
        this.createColorControl('Surface Color', 'surfaceColor'),
        this.createColorControl('Reflection Color', 'reflectionColor')
    ]));
    controlsPanel.appendChild(this.createControlGroup('Waves', [
        this.createSliderControl('Wave Height', 'waveHeight', 0, 1, 0.01),
        this.createSliderControl('Wave Speed', 'waveSpeed', 0, 3, 0.1),
        this.createSliderControl('Frequency X', 'waveFrequencyX', 0.1, 10, 0.1),
        this.createSliderControl('Frequency Z', 'waveFrequencyZ', 0.1, 10, 0.1)
    ]));
    controlsPanel.appendChild(this.createControlGroup('Appearance', [
        this.createSliderControl('Color Intensity', 'colorIntensity', 0.1, 8, 0.1),
        this.createSliderControl('Normal Intensity', 'normalIntensity', 0.1, 3, 0.1),
        this.createSliderControl('Fresnel Power', 'fresnelPower', 0.5, 5, 0.1)
    ]));

    // Apply buttons
    const applyContainer = document.createElement('div');
    applyContainer.style.cssText = `display: flex; gap: 5px; margin-top: 10px;`;
    const applyToSelected = this.createButton('Apply to Selected', () => this.updateWaterSettings());
    applyToSelected.style.fontSize = '12px';
    applyToSelected.style.padding = '6px 10px';
    const applyToAll = this.createButton('Apply to All', () => this.updateAllWaterSettings());
    applyToAll.style.fontSize = '12px';
    applyToAll.style.padding = '6px 10px';
    applyToAll.style.background = '#28a745';
    applyContainer.appendChild(applyToSelected);
    applyContainer.appendChild(applyToAll);
    controlsPanel.appendChild(applyContainer);

    // Status indicator
    const statusIndicator = document.createElement('div');
    statusIndicator.id = 'water-status-indicator';
    statusIndicator.style.cssText = `
        padding: 8px; 
        margin-top: 8px; 
        border-radius: 6px; 
        text-align: center; 
        font-size: 14px; 
        background: #1a2a4a;
        border: 1px solid #4a90e2;
    `;
    statusIndicator.textContent = 'Add a terrain to begin.';

    // --- 4. Append all the created elements to our new content wrapper ---
    panelContent.appendChild(title);
    panelContent.appendChild(buttonsContainer);
    panelContent.appendChild(controlsToggle);
    panelContent.appendChild(controlsPanel);
    panelContent.appendChild(statusIndicator);
    
    // --- 5. Finally, append the entire content panel to your target div ---
    targetContainer.appendChild(panelContent);
}

    createControlGroup(title, controls) {
        const group = document.createElement('div');
        group.style.cssText = `margin-bottom: 15px;`;

        const groupTitle = document.createElement('div');
        groupTitle.textContent = title;
        groupTitle.style.cssText = `
            font-weight: bold; 
            margin-bottom: 8px; 
            color: #87ceeb;
            border-bottom: 1px solid #4a90e2;
            padding-bottom: 4px;
        `;

        group.appendChild(groupTitle);
        controls.forEach(control => group.appendChild(control));
        return group;
    }

    createSliderControl(label, property, min, max, step) {
        const container = document.createElement('div');
        container.style.cssText = `margin-bottom: 8px;`;

        const labelEl = document.createElement('label');
        labelEl.textContent = `${label}: ${this.waterSettings[property]}`;
        labelEl.style.cssText = `display: block; font-size: 12px; margin-bottom: 3px;`;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = this.waterSettings[property];
        slider.style.cssText = `width: 100%; height: 6px; border-radius: 5px; background: #4a90e2; outline: none;`;

        slider.addEventListener('input', (e) => {
            this.waterSettings[property] = parseFloat(e.target.value);
            labelEl.textContent = `${label}: ${this.waterSettings[property]}`;
        });

        container.appendChild(labelEl);
        container.appendChild(slider);
        return container;
    }

    createColorControl(label, property) {
        const container = document.createElement('div');
        container.style.cssText = `margin-bottom: 8px; display: flex; align-items: center; gap: 8px;`;

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.style.cssText = `font-size: 12px; flex: 1;`;

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = this.waterSettings[property];
        colorInput.style.cssText = `width: 40px; height: 25px; border: none; border-radius: 4px; cursor: pointer;`;

        colorInput.addEventListener('change', (e) => {
            this.waterSettings[property] = e.target.value;
        });

        container.appendChild(labelEl);
        container.appendChild(colorInput);
        return container;
    }

    toggleControls() {
        const panel = document.getElementById('water-controls-panel');
        const button = document.getElementById('controls-toggle-button');
        const isVisible = panel.style.display === 'block';
        
        panel.style.display = isVisible ? 'none' : 'block';
        button.textContent = isVisible ? 'Show Controls' : 'Hide Controls';
    }

    deleteSelectedWater() {
        if (this.selectedWaterBody) {
            // Remove from scene and arrays
            this.waterContainer.remove(this.selectedWaterBody);
            const index = this.waterBodies.indexOf(this.selectedWaterBody);
            if (index > -1) {
                this.waterBodies.splice(index, 1);
            }
            
            // Cleanup
            this.selectedWaterBody.geometry.dispose();
            this.selectedWaterBody.material.dispose();
            
            // Reset selection
            this.selectedWaterBody = null;
            this.exitEditMode();
            
            document.getElementById('water-status-indicator').textContent = 'Water body deleted.';
        } else {
            alert('Please select a water body to delete first.');
        }
    }

    createButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            background: #2a6a9a; 
            border: none; 
            color: white; 
            padding: 8px 12px; 
            border-radius: 6px; 
            cursor: pointer; 
            transition: all 0.2s; 
            font-size: 13px;
            font-weight: 500;
        `;
        button.addEventListener('click', onClick);
        button.addEventListener('mouseenter', () => { 
            button.style.background = '#3a8acb'; 
            button.style.transform = 'translateY(-1px)';
        });
        button.addEventListener('mouseleave', () => { 
            button.style.background = button.style.background.includes('#dc3545') ? '#dc3545' : '#2a6a9a';
            button.style.transform = 'translateY(0)';
        });
        return button;
    }

    setupEventListeners() {
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown.bind(this), false);
        canvas.addEventListener('pointermove', this.onPointerMove.bind(this), false);
        canvas.addEventListener('pointerup', this.onPointerUp.bind(this), false);
        
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (this.isDrawing) this.cancelDrawing();
                if (this.isEditing || this.isWaitingToSelect) this.exitEditMode();
            }
            if (event.key === 'Delete' && this.selectedWaterBody) {
                this.deleteSelectedWater();
            }
        });
    }

    updateMouse(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    getTerrainIntersection() {
        if (!this.terrain) return null;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.terrain);
        return intersects.length > 0 ? intersects[0].point : null;
    }

    toggleDrawingMode() {
        if (!this.terrain) {
            alert("Please create a terrain first before adding water.");
            return;
        }
        
        if (this.isEditing || this.isWaitingToSelect) this.exitEditMode();
        
        this.isDrawing = !this.isDrawing;
        const button = document.getElementById('draw-water-button');
        const status = document.getElementById('water-status-indicator');
        
        if (this.isDrawing) {
            button.textContent = 'Finish & Create Water';
            button.style.background = '#28a745';
            status.textContent = `Click on the terrain to draw. Press ESC to cancel.`;
            this.currentPoints = [];
            if (window.controls) window.controls.enabled = false;
            this.renderer.domElement.style.cursor = 'crosshair';
        } else {
            this.finishDrawing();
        }
    }

    toggleEditMode() {
        if (this.isEditing || this.isWaitingToSelect) {
            this.exitEditMode();
        } else {
            if (!this.terrain) {
                alert("Please create a terrain first.");
                return;
            }
            this.isWaitingToSelect = true;
            document.getElementById('edit-water-button').textContent = 'Cancel Selection';
            document.getElementById('edit-water-button').style.background = '#d9534f';
            document.getElementById('water-status-indicator').textContent = 'Click on a water body to select it.';
            this.renderer.domElement.style.cursor = 'help';
        }
    }

    enterEditMode(waterBody) {
        this.isWaitingToSelect = false;
        this.isEditing = true;
        this.selectedWaterBody = waterBody;

        // Load the settings from the selected water body
        if (waterBody.userData.settings) {
            this.waterSettings = { ...waterBody.userData.settings };
            this.updateControlsUI();
        }

        document.getElementById('edit-water-button').textContent = 'Finish Editing';
        document.getElementById('edit-water-button').style.background = '#28a745';
        document.getElementById('water-status-indicator').textContent = `Editing ${this.selectedWaterBody.name}`;

        this.createControlPoints(this.selectedWaterBody.userData.points);
        if (window.controls) window.controls.enabled = false;
        this.renderer.domElement.style.cursor = 'default';
    }

    updateControlsUI() {
        // Update all sliders and color inputs with current settings
        const panel = document.getElementById('water-controls-panel');
        if (panel) {
            const sliders = panel.querySelectorAll('input[type="range"]');
            const colorInputs = panel.querySelectorAll('input[type="color"]');
            
            sliders.forEach(slider => {
                const container = slider.parentElement;
                const label = container.querySelector('label');
                const property = Object.keys(this.waterSettings).find(key => 
                    label.textContent.includes(key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()))
                );
                if (property) {
                    slider.value = this.waterSettings[property];
                    label.textContent = `${label.textContent.split(':')[0]}: ${this.waterSettings[property]}`;
                }
            });

            colorInputs.forEach(input => {
                const container = input.parentElement;
                const label = container.querySelector('label');
                const property = Object.keys(this.waterSettings).find(key => 
                    label.textContent.toLowerCase().includes(key.toLowerCase().replace(/color/i, '').trim())
                );
                if (property) {
                    input.value = this.waterSettings[property];
                }
            });
        }
    }

    exitEditMode() {
        this.isWaitingToSelect = false;
        this.isEditing = false;
        this.selectedWaterBody = null;
        this.selectedControlPoint = null;

        document.getElementById('edit-water-button').textContent = 'Edit Water';
        document.getElementById('edit-water-button').style.background = '#2a6a9a';
        document.getElementById('water-status-indicator').textContent = this.terrain ? 'Ready' : 'Add a terrain to begin.';
        
        this.removeControlPoints();
        if (window.controls) window.controls.enabled = true;
        this.renderer.domElement.style.cursor = 'default';
    }

    onPointerDown(event) {
        this.updateMouse(event);
        
        // State 1: Waiting to select a water body to edit
        if (this.isWaitingToSelect) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.waterBodies);

            if (intersects.length > 0) {
                console.log("SUCCESS: Raycast hit a water body. Entering edit mode.");
                this.enterEditMode(intersects[0].object);
            } else {
                console.log("INFO: Click missed. Still waiting for selection.");
            }
            return;
        }

        // State 2: Drawing a new water body
        if (this.isDrawing) {
            const intersectionPoint = this.getTerrainIntersection();
            if (intersectionPoint) {
                this.currentPoints.push(intersectionPoint.clone());
                this.updatePreviewLine(true);
                console.log(`Added point ${this.currentPoints.length}:`, intersectionPoint);
            }
            return;
        }

        // State 3: Dragging a control point
        if (this.isEditing) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.controlPoints);
            if (intersects.length > 0) {
                this.selectedControlPoint = intersects[0].object;
                if (window.controls) window.controls.enabled = false;
                this.renderer.domElement.style.cursor = 'grabbing';
            }
        }
    }

    onPointerMove(event) {
        this.updateMouse(event);
        if (this.isEditing && this.selectedControlPoint) {
            const intersectionPoint = this.getTerrainIntersection();
            if (intersectionPoint) {
                this.selectedControlPoint.position.copy(intersectionPoint);
                const index = this.controlPoints.indexOf(this.selectedControlPoint);
                if (index !== -1 && this.selectedWaterBody) {
                    this.selectedWaterBody.userData.points[index].copy(intersectionPoint);
                    this.updateWaterBodyMesh(this.selectedWaterBody);
                }
            }
        } else if (this.isDrawing && this.currentPoints.length > 0) {
            this.updatePreviewLine();
        }
    }

    onPointerUp(event) {
        if (this.isEditing) {
            this.selectedControlPoint = null;
            if (window.controls) window.controls.enabled = true;
            this.renderer.domElement.style.cursor = 'pointer';
        }
    }

    finishDrawing() {
        console.log(`Finishing drawing with ${this.currentPoints.length} points.`);
        this.isDrawing = false;
        document.getElementById('draw-water-button').textContent = 'Add Water Body';
        document.getElementById('draw-water-button').style.background = '#2a6a9a';
        if (window.controls) window.controls.enabled = true;
        this.renderer.domElement.style.cursor = 'default';

        if (this.previewLine) {
            this.waterContainer.remove(this.previewLine);
            this.previewLine.geometry.dispose();
            this.previewLine.material.dispose();
            this.previewLine = null;
        }

        if (this.currentPoints.length < 3) {
            console.warn("Water body cancelled. Need at least 3 points.");
            document.getElementById('water-status-indicator').textContent = 'Cancelled: Not enough points.';
            this.currentPoints = [];
            return;
        }

        const newWaterBody = this.createWaterBody(this.currentPoints);
        if (newWaterBody) {
            this.waterContainer.add(newWaterBody);
            this.waterBodies.push(newWaterBody);
            document.getElementById('water-status-indicator').textContent = `Water body created! Total: ${this.waterBodies.length}`;
            console.log("Water body added successfully!");
        } else {
            document.getElementById('water-status-indicator').textContent = `Failed to create water.`;
        }
        this.currentPoints = [];
    }

    cancelDrawing() {
        this.isDrawing = false;
        document.getElementById('draw-water-button').textContent = 'Add Water Body';
        document.getElementById('draw-water-button').style.background = '#2a6a9a';
        document.getElementById('water-status-indicator').textContent = 'Drawing cancelled.';
        if (window.controls) window.controls.enabled = true;
        this.renderer.domElement.style.cursor = 'default';
        if (this.previewLine) {
            this.waterContainer.remove(this.previewLine);
            this.previewLine.geometry.dispose();
            this.previewLine.material.dispose();
            this.previewLine = null;
        }
        this.currentPoints = [];
    }

    updatePreviewLine(isFinalizing = false) {
        if (this.previewLine) {
            this.waterContainer.remove(this.previewLine);
            this.previewLine.geometry.dispose();
            this.previewLine.material.dispose();
            this.previewLine = null;
        }
        
        let pointsToDraw = [...this.currentPoints];
        if (!isFinalizing && this.isDrawing) {
            const intersection = this.getTerrainIntersection();
            if (intersection) pointsToDraw.push(intersection);
        }
        
        if (pointsToDraw.length < 1) return;
        
        // Close the shape for preview
        if (pointsToDraw.length > 2) {
            pointsToDraw.push(pointsToDraw[0]);
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(pointsToDraw);
        const material = new THREE.LineDashedMaterial({ 
            color: 0x00ffff, 
            dashSize: 0.3, 
            gapSize: 0.2, 
            linewidth: 3 
        });
        this.previewLine = new THREE.Line(geometry, material);
        this.previewLine.computeLineDistances();
        this.waterContainer.add(this.previewLine);
    }

    updateWaterBodyMesh(waterBody) {
        if (waterBody.geometry) waterBody.geometry.dispose();
        const points = waterBody.userData.points;
        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, points[0].z);
        for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
        shape.closePath();
        const newGeometry = new THREE.ShapeGeometry(shape);
        newGeometry.rotateX(-Math.PI / 2); // Correct rotation for top view
        newGeometry.computeVertexNormals(); // Ensure proper normals
        waterBody.geometry = newGeometry;
        const avgHeight = points.reduce((acc, p) => acc + p.y, 0) / points.length;
        waterBody.position.y = avgHeight + 0.05;
    }

    createControlPoints(points) {
        this.removeControlPoints();
        const geometry = new THREE.SphereGeometry(0.15, 16, 16);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xffff00,
            transparent: true,
            opacity: 0.8
        });
        points.forEach((point, index) => {
            const sphere = new THREE.Mesh(geometry, material.clone());
            sphere.position.copy(point);
            sphere.userData.index = index;
            this.controlPoints.push(sphere);
            this.scene.add(sphere);
        });
        console.log(`Created ${this.controlPoints.length} control points for editing.`);
    }

    removeControlPoints() {
        this.controlPoints.forEach(point => {
            this.scene.remove(point);
            point.geometry.dispose();
            point.material.dispose();
        });
        this.controlPoints = [];
        this.selectedControlPoint = null;
    }

    // Utility method to get water body count
    getWaterBodyCount() {
        return this.waterBodies.length;
    }

    // Method to clear all water bodies
    clearAllWater() {
        if (confirm('Are you sure you want to delete all water bodies?')) {
            this.waterBodies.forEach(waterBody => {
                this.waterContainer.remove(waterBody);
                waterBody.geometry.dispose();
                waterBody.material.dispose();
            });
            this.waterBodies = [];
            this.exitEditMode();
            document.getElementById('water-status-indicator').textContent = 'All water bodies cleared.';
        }
    }

    // Export water configuration
    exportWaterConfig() {
        const config = {
            waterSettings: this.waterSettings,
            waterBodies: this.waterBodies.map(waterBody => ({
                name: waterBody.name,
                points: waterBody.userData.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
                settings: waterBody.userData.settings
            }))
        };
        
        const dataStr = JSON.stringify(config, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'water_config.json';
        link.click();
        
        URL.revokeObjectURL(url);
        console.log('Water configuration exported successfully!');
    }
}

// Helper function for shaders
function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}
// --- UI BINDINGS ---
/**
 * Sets up all the event listeners for the HTML user interface.
 * This function should be called once from init().
 */

function setupUIEventListeners() {
    const addTerrainBtn = document.getElementById('addTerrain');
    const sculptingTools = document.getElementById('sculpting-tools');
    const nodeEditorPanel = document.getElementById('node-editor-panel-terrain');
    const nodeEditorToggleBtn = document.getElementById('node-editor-toggle');

    if (nodeEditorToggleBtn && nodeEditorPanel) {
        nodeEditorToggleBtn.addEventListener('click', () => {
            const isVisible = nodeEditorPanel.style.display === 'block';
            nodeEditorPanel.style.display = isVisible ? 'none' : 'block';
        });
    }

    // --- SIMPLIFIED AND CORRECTED LOGIC ---
    addTerrainBtn.addEventListener("click", function() {
        // Always show the tools when the button is clicked.
        sculptingTools.style.display = "block";
        if (nodeEditorPanel) {
            nodeEditorPanel.style.display = "block";
        }
        
        // The ONLY job of this button is to call createTerrain.
        // The createTerrain function itself will handle if a terrain already exists.
        console.log("Add Terrain button clicked, calling createTerrain...");
        createTerrain({ width: 50, length: 50, resolution: 256 });
    });
};




/*function setupUIEventListeners() {
    const addTerrainBtn = document.getElementById('addTerrain');
    const sculptingTools = document.getElementById('sculpting-tools');
    const nodeEditorPanel = document.getElementById('node-editor-panel-terrain');
    
    // --- NEW: The dedicated toggle button for the Node Editor ---
    const nodeEditorToggleBtn = document.getElementById('node-editor-toggle');

    if (nodeEditorToggleBtn && nodeEditorPanel) {
        nodeEditorToggleBtn.addEventListener('click', () => {
            // Check if the panel is currently visible
            const isVisible = nodeEditorPanel.style.display === 'block';
            
            // Set the display to the opposite state
            nodeEditorPanel.style.display = isVisible ? 'none' : 'block';
        });
    } else {
        if (!nodeEditorToggleBtn) console.error("Node Editor Toggle Button (#node-editor-toggle) not found!");
        if (!nodeEditorPanel) console.error("Node Editor Panel (#node-editor-panel) not found!");
    }
    // --- END NEW ---


    // MODIFIED: This listener now only *shows* the panels when creating terrain,
    // but doesn't hide them, allowing the new toggle button to manage closing.
    addTerrainBtn.addEventListener("click", function() {
        // Show the sculpting tools when the button is clicked
        sculptingTools.style.display = "block";
        if (!terrain) {
            console.log("Creating terrain for the first time.");
            // When terrain is first created, also ensure the node panel is visible
            if (nodeEditorPanel) {
                nodeEditorPanel.style.display = "block";
            }
            //createTerrain({ width: 50, length: 50, resolution: 256 });
            createTerrain({ width: 50, length: 50, resolution: 256 });
            if (window.waterSystem && newTerrain) {
                window.waterSystem.activate(newTerrain);
            }
        }
    });

};*/

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

