
/**
 * NodeTerrainEditor.js
 * Manages the node graph, UI, and applies procedural operations to a target terrain mesh.
 */
class NodeTerrainEditor {
    constructor() {
        // All existing properties remain the same...
        this.nodes = [];
        this.targetTerrain = null;
        this.activeNode = null;
        this.originalHeightData = null;
        this.isPainting = false;
        this.paintMode = 'paint';
        this.brush = { size: 2.5, strength: 0.5, preview: null };

        // DOM element references also remain the same...
        this.panel = document.getElementById('node-editor-panel');
        this.graphContainer = document.getElementById('node-graph-container');
        this.paramsContainer = document.getElementById('node-params-container');
        this.brushSizeSlider = document.getElementById('node-brush-size');
        this.brushStrengthSlider = document.getElementById('node-brush-strength');
        
        this.bindCoreEvents();
        this.bindMaskControlEvents();

        console.log("Node Terrain Editor initialized with toggleable paint mode.");
    }

     // Method to handle material switching
    setTerrainMaterial(materialType) {
        if (!this.targetTerrain) return;

        let materialParams = {};
        switch(materialType) {
            case 'desert':
                // Create a sandy material
                materialParams = { color: 0xD2B48C, roughness: 0.9, metalness: 0.1 };
                break;
            case 'arctic':
                // Create a snowy/icy material
                materialParams = { color: 0xF0F8FF, roughness: 0.6, metalness: 0.2 };
                break;
            case 'volcanic':
                // Create a dark, rocky material
                materialParams = { color: 0x36454F, roughness: 0.8, metalness: 0.4 };
                break;
            case 'realistic':
            default:
                // This would ideally use a complex shader with splatmaps based on height/slope.
                // For now, we'll revert to a basic green/brown.
                materialParams = { color: 0x556B2F, roughness: 0.85, metalness: 0.05 };
                break;
        }

        // We can create a new material or, more efficiently, just update the properties.
        // Let's update properties for better performance.
        const material = this.targetTerrain.material;
        if (material.isMeshStandardMaterial) {
            material.color.set(materialParams.color);
            material.roughness = materialParams.roughness;
            material.metalness = materialParams.metalness;
            
            // Important: We're replacing the procedural grid texture.
            // You might want to toggle this, but for presets, this is better.
            if(material.map) {
                material.map = null;
                material.normalMap = null;
                material.needsUpdate = true;
            }
        }
    }

    // Method to apply a full node stack preset
    applyPreset(presetType) {
        // Clear any existing nodes
        this.nodes = [];
        this.activeNode = null;
        
        switch(presetType) {
            case 'mountains':
                this.addNode(new RidgedNoiseNode({ amplitude: 30, frequency: 2.0, octaves: 7, lacunarity: 2.1, persistence: 0.55 }));
                this.addNode(new SmoothNode({ iterations: 2, strength: 0.3 }));
                this.addNode(new HydraulicErosionNode({ iterations: 40000, solubility: 0.02 }));
                break;
            case 'hills':
                this.addNode(new NoiseNode({ additive: false, amplitude: 12, frequency: 0.8, octaves: 6, persistence: 0.4 }));
                this.addNode(new SmoothNode({ iterations: 3, strength: 0.6 }));
                break;
            case 'canyon':
                this.addNode(new NoiseNode({ additive: false, amplitude: 15, frequency: 1.2, octaves: 5, persistence: 0.6 }));
                this.addNode(new CanyonNode({ depth: 30, frequency: 1.0, roughness: 10.0 }));
                this.addNode(new HydraulicErosionNode({ iterations: 10000 }));
                break;
            case 'volcano':
                this.addNode(new NoiseNode({ additive: false, amplitude: 5, frequency: 2.0, octaves: 5 })); // Base island noise
                // We create the volcano cone manually instead of a dedicated node
                this.nodes.push(new (class VolcanoCone extends BaseNode {
                    constructor() { super('Volcano Cone', {}); }
                    process(h, c, p) {
                        const res = c.resolution + 1;
                        for(let i=0; i<h.length; i++) {
                            const x = (i % res) - res/2;
                            const z = Math.floor(i / res) - res/2;
                            const dist = Math.sqrt(x*x + z*z);
                            const coneHeight = Math.max(0, 30 - dist * 1.2); // Main cone
                            const rim = Math.max(0, 5 - Math.abs(dist - 5)); // Crater rim
                            h[i] = p[i] + coneHeight + rim;
                        }
                    }
                })());
                this.addNode(new SmoothNode({ iterations: 2, strength: 0.4 }));
                break;
            case 'desert':
                this.addNode(new NoiseNode({ additive: false, amplitude: 8, frequency: 0.5, octaves: 3 }));
                this.addNode(new NoiseNode({ additive: true, amplitude: 4, frequency: 2.5, octaves: 5, persistence: 0.4 })); // Dune ripples
                break;
        }

        // After adding all nodes for the preset, update the graph
        this.updateGraphUI();
        // Automatically select the last added node
        if (this.nodes.length > 0) {
            this.selectNode(this.nodes[this.nodes.length - 1]);
        }
        // Finally, apply the full stack
        this.applyGraph();
    }

    // This method is unchanged
    bindCoreEvents() {
    // Basic Nodes
    document.getElementById('node-add-noise').addEventListener('click', () => this.addNode(new NoiseNode()));
    document.getElementById('node-add-terrace').addEventListener('click', () => this.addNode(new TerraceNode()));
    document.getElementById('node-add-height-mask').addEventListener('click', () => this.addNode(new HeightMaskNode()));
    document.getElementById('node-add-invert').addEventListener('click', () => this.addNode(new InvertNode()));
    document.getElementById('node-add-smooth').addEventListener('click', () => this.addNode(new SmoothNode()));
    document.getElementById('node-add-erosion').addEventListener('click', () => this.addNode(new HydraulicErosionNode()));

    // --- NEW: Advanced Node Listeners ---
    document.getElementById('node-add-ridged').addEventListener('click', () => this.addNode(new RidgedNoiseNode()));
    document.getElementById('node-add-voronoi').addEventListener('click', () => this.addNode(new VoronoiCellsNode()));
    document.getElementById('node-add-plateau').addEventListener('click', () => this.addNode(new PlateauNode()));
    document.getElementById('node-add-canyon').addEventListener('click', () => this.addNode(new CanyonNode()));

    // --- NEW: Material Control Listener ---
    document.getElementById('material-select').addEventListener('change', (e) => this.setTerrainMaterial(e.target.value));

    // --- NEW: Preset Listeners ---
    document.getElementById('preset-mountains').addEventListener('click', () => this.applyPreset('mountains'));
    document.getElementById('preset-hills').addEventListener('click', () => this.applyPreset('hills'));
    document.getElementById('preset-canyon').addEventListener('click', () => this.applyPreset('canyon'));
    document.getElementById('preset-volcano').addEventListener('click', () => this.applyPreset('volcano'));
    document.getElementById('preset-desert').addEventListener('click', () => this.applyPreset('desert'));

    // Main control
    document.getElementById('node-apply-graph').addEventListener('click', () => this.applyGraph());
}

    // --- MODIFIED: This now uses the new toggle function ---
    bindMaskControlEvents() {
        // The 'Paint' and 'Erase' buttons now call the new toggle function
        document.getElementById('node-paint-mask-btn').addEventListener('click', () => this.togglePaintMode('paint'));
        document.getElementById('node-erase-mask-btn').addEventListener('click', () => this.togglePaintMode('erase'));
        
        // These listeners are unchanged
        document.getElementById('node-clear-mask-btn').addEventListener('click', () => this.clearMask());
        this.brushSizeSlider.addEventListener('input', (e) => { this.brush.size = parseFloat(e.target.value); document.getElementById('node-brush-size-value').textContent = this.brush.size.toFixed(2); this.updateBrushPreview(); });
        this.brushStrengthSlider.addEventListener('input', (e) => { this.brush.strength = parseFloat(e.target.value); document.getElementById('node-brush-strength-value').textContent = this.brush.strength.toFixed(2); });
        renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        renderer.domElement.addEventListener('pointerup', (e) => this.onPointerUp(e));
        renderer.domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    }

    // --- NEW: The core toggle logic ---

    togglePaintMode(newMode) {
        const isCurrentlyActive = this.brush.preview && this.brush.preview.visible;
        const isSameMode = this.paintMode === newMode;

        if (isCurrentlyActive && isSameMode) {
            // If we click the button for the mode that is already active, turn it off.
            this.deactivatePaintMode();
        } else {
            // Otherwise, turn on the requested mode (this will also handle switching modes).
            this.activatePaintMode(newMode);
        }
    }
    
    // This function is now a "helper" for the toggle logic. It only handles activation. (Unchanged)
    activatePaintMode(mode) {
        this.paintMode = mode;
        if (window.controls) window.controls.enabled = false;
        if (!this.brush.preview) this.createBrushPreview();
        this.brush.preview.visible = true;
        // Update button styles to show which is active
        const paintBtn = document.getElementById('node-paint-mask-btn');
        const eraseBtn = document.getElementById('node-erase-mask-btn');
        if (paintBtn) paintBtn.style.border = (mode === 'paint') ? '2px solid #4fc3f7' : '1px solid #555';
        if (eraseBtn) eraseBtn.style.border = (mode === 'erase') ? '2px solid #4fc3f7' : '1px solid #555';
    }

    // This function is also a "helper" for deactivation. (Unchanged)
    deactivatePaintMode() {
        this.isPainting = false;
        if (window.controls) window.controls.enabled = true;
        if (this.brush.preview) this.brush.preview.visible = false;
        // Reset button styles
        const paintBtn = document.getElementById('node-paint-mask-btn');
        const eraseBtn = document.getElementById('node-erase-mask-btn');
        if(paintBtn) paintBtn.style.border = '1px solid #555';
        if(eraseBtn) eraseBtn.style.border = '1px solid #555';
    }

    // All other methods from here on are UNCHANGED.
    // They are included for completeness so you can copy-paste the entire class.
    
    onPointerDown(event) { if (this.brush.preview && this.brush.preview.visible) { this.isPainting = true; this.paintAt(event); } }
    onPointerUp(event) { this.isPainting = false; }
    onPointerMove(event) {
        if (!this.targetTerrain) return;
        const mouse = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(this.targetTerrain);
        if (intersects.length > 0) {
            if (this.brush.preview && this.brush.preview.visible) { this.brush.preview.position.copy(intersects[0].point); }
            if(this.isPainting) { this.paintAt(event); }
        }
    }
    paintAt(event) {
        if (!this.targetTerrain) return;
        const mouse = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(this.targetTerrain);
        if (intersects.length > 0) {
            const intersectionPoint = intersects[0].point;
            const positions = this.targetTerrain.geometry.attributes.position;
            const maskData = this.targetTerrain.userData.maskData;
            for (let i = 0; i < positions.count; i++) {
                const vertex = new THREE.Vector3().fromBufferAttribute(positions, i);
                const distance = vertex.distanceTo(intersectionPoint);
                if (distance < this.brush.size) {
                    const falloff = 1.0 - (distance / this.brush.size);
                    const changeAmount = falloff * this.brush.strength * 0.1;
                    let newMaskValue = (this.paintMode === 'paint') ? maskData[i] + changeAmount : maskData[i] - changeAmount;
                    maskData[i] = Math.max(0, Math.min(1, newMaskValue));
                }
            }
            this.visualizeMask();
        }
    }
    createBrushPreview() {
        const geometry = new THREE.SphereGeometry(1, 32, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, wireframe: true, transparent: true, opacity: 0.5 });
        this.brush.preview = new THREE.Mesh(geometry, material);
        this.brush.preview.visible = false;
        scene.add(this.brush.preview);
        this.updateBrushPreview();
    }
    updateBrushPreview() { if (this.brush.preview) { this.brush.preview.scale.set(this.brush.size, this.brush.size, this.brush.size); } }
    visualizeMask() {
        if (!this.targetTerrain) return;
        const colors = this.targetTerrain.geometry.attributes.color;
        const maskData = this.targetTerrain.userData.maskData;
        const tempColor = new THREE.Color();
        for (let i = 0; i < colors.count; i++) {
            tempColor.setHSL(0.7 - (maskData[i] * 0.7), 1.0, 0.5);
            colors.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
        }
        colors.needsUpdate = true;
        this.targetTerrain.material.vertexColors = true;
        this.targetTerrain.material.needsUpdate = true;
    }
    clearMask() { if(this.targetTerrain) { this.targetTerrain.userData.maskData.fill(0); this.visualizeMask(); } }
    handleKeyUp(event) { if (event.key === "Escape") { this.deactivatePaintMode(); } }
    setTarget(terrainMesh) {
        if (!terrainMesh || !terrainMesh.geometry) { return; }
        this.targetTerrain = terrainMesh;
        const positions = this.targetTerrain.geometry.attributes.position.array;
        this.originalHeightData = new Float32Array(positions.length / 3);
        for (let i = 0; i < this.originalHeightData.length; i++) { this.originalHeightData[i] = positions[i * 3 + 1]; }
        this.panel.style.display = 'block';
        this.applyGraph();
    }
    clearTarget() { this.deactivatePaintMode(); this.targetTerrain = null; this.originalHeightData = null; this.panel.style.display = 'none'; }
    addNode(node) { this.nodes.push(node); this.updateGraphUI(); this.selectNode(node); this.applyGraph(); }
    removeNode(nodeId) {
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
        if (this.activeNode && this.activeNode.id === nodeId) { this.paramsContainer.innerHTML = ''; this.activeNode = null; }
        this.updateGraphUI();
        this.applyGraph();
    }
    selectNode(node) {
        this.activeNode = node;
        this.paramsContainer.innerHTML = node.getParamsHTML();
        node.getParamKeys().forEach(key => {
            const inputElement = document.getElementById(`param-${node.id}-${key}`);
            if (inputElement) {
                inputElement.addEventListener('input', (e) => {
                    const value = e.target.type === 'checkbox' ? e.target.checked : parseFloat(e.target.value);
                    node.params[key] = value;
                    const valueDisplay = document.getElementById(`value-${node.id}-${key}`);
                    if (valueDisplay) valueDisplay.textContent = value.toFixed(2);
                    this.applyGraph();
                });
            }
        });
        this.updateGraphUI();
    }
    applyGraph() {
        if (!this.targetTerrain || !this.originalHeightData) { return; }
        console.time("Node Graph Processing");
        let inputData = new Float32Array(this.originalHeightData);
        const { config } = this.targetTerrain.userData;
        this.nodes.forEach(node => {
            const outputData = new Float32Array(inputData);
            node.process(outputData, config, inputData);
            inputData = outputData;
        });
        const positions = this.targetTerrain.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) { positions.setY(i, inputData[i]); }
        positions.needsUpdate = true;
        this.targetTerrain.geometry.computeVertexNormals();
        console.timeEnd("Node Graph Processing");
    }
    updateGraphUI() {
        this.graphContainer.innerHTML = '';
        if (this.nodes.length === 0) { this.graphContainer.innerHTML = '<p style="color: #777; text-align: center;">Add nodes to begin.</p>'; return; }
        this.nodes.forEach(node => {
            const isSelected = this.activeNode && this.activeNode.id === node.id;
            const nodeEl = document.createElement('div');
            nodeEl.className = 'node-item';
            nodeEl.style.cssText = `background:${isSelected ? '#4a4a4a' : '#333'};border:1px solid ${isSelected ? '#4fc3f7' : '#555'};padding:8px;margin-bottom:5px;border-radius:4px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;`;
            nodeEl.innerHTML = `<span>${node.name}</span>`;
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '×';
            removeBtn.style.cssText = 'background:#e74c3c;color:white;border:none;border-radius:50%;width:20px;height:20px;line-height:18px;text-align:center;cursor:pointer;';
            removeBtn.onclick = (e) => { e.stopPropagation(); this.removeNode(node.id); };
            nodeEl.appendChild(removeBtn);
            nodeEl.onclick = () => this.selectNode(node);
            this.graphContainer.appendChild(nodeEl);
        });
    }
}


const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

// Simplex Noise (You can use a library, but this is fine for a self-contained example)
class SimplexNoise {
    // ... (Paste the SimplexNoise class from your example here) ...
    // Note: It's better to use a well-tested library like 'simplex-noise' in a real project.
    constructor(){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];this.p=[];for(let i=0;i<256;i++)this.p[i]=Math.floor(Math.random()*256);this.perm=[];for(let i=0;i<512;i++)this.perm[i]=this.p[i&255]}dot(g,x,y){return g[0]*x+g[1]*y}noise2D(xin,yin){const F2=0.5*(Math.sqrt(3.0)-1.0),s=(xin+yin)*F2,i=Math.floor(xin+s),j=Math.floor(yin+s),G2=(3.0-Math.sqrt(3.0))/6.0,t=(i+j)*G2,X0=i-t,Y0=j-t,x0=xin-X0,y0=yin-Y0;let i1,j1;if(x0>y0){i1=1;j1=0}else{i1=0;j1=1}const x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1.0+2.0*G2,y2=y0-1.0+2.0*G2,ii=i&255,jj=j&255,gi0=this.perm[ii+this.perm[jj]]%12,gi1=this.perm[ii+i1+this.perm[jj+j1]]%12,gi2=this.perm[ii+1+this.perm[jj+1]]%12;let n0,n1,n2;let t0=0.5-x0*x0-y0*y0;if(t0<0)n0=0.0;else{t0*=t0;n0=t0*t0*this.dot(this.grad3[gi0],x0,y0)}let t1=0.5-x1*x1-y1*y1;if(t1<0)n1=0.0;else{t1*=t1;n1=t1*t1*this.dot(this.grad3[gi1],x1,y1)}let t2=0.5-x2*x2-y2*y2;if(t2<0)n2=0.0;else{t2*=t2;n2=t2*t2*this.dot(this.grad3[gi2],x2,y2)}return 70.0*(n0+n1+n2)}}
const simplex = new SimplexNoise();


// --- Base Class for all Nodes ---
class BaseNode {
    constructor(name, defaultParams) {
        this.id = generateId();
        this.name = name;
        this.params = defaultParams;
    }

    process(heightData, config) {
        throw new Error("Process method must be implemented by child node.");
    }
    
    getParamKeys() {
        return Object.keys(this.params);
    }

    // Generates HTML for the node's parameters
    getParamsHTML() {
        let html = `<h4>${this.name} Parameters</h4>`;
        for (const key in this.params) {
            const value = this.params[key];
            const type = typeof value;
            const id = `param-${this.id}-${key}`;
            const valueId = `value-${this.id}-${key}`;

            if (type === 'number') {
                // Heuristic for range and step
                const max = key.includes('amplitude') || key.includes('strength') ? 20 : (key.includes('frequency') ? 5 : 1);
                const step = max > 10 ? 0.5 : 0.01;
                html += `
                    <label for="${id}">${key}: <span id="${valueId}">${value.toFixed(2)}</span></label>
                    <input type="range" id="${id}" min="0" max="${max}" step="${step}" value="${value}">
                `;
            } else if (type === 'boolean') {
                 html += `
                    <label for="${id}">${key}</label>
                    <input type="checkbox" id="${id}" ${value ? 'checked' : ''}>
                `;
            }
        }
        return html;
    }
}

// --- Specific Node Implementations ---
/*
class NoiseNode extends BaseNode {
    constructor() {
        super('Perlin Noise', {
            amplitude: 5.0,
            frequency: 0.5,
            octaves: 4,
            persistence: 0.5
        });
    }

    process(heightData, config) {
        const res = config.resolution + 1;
        for (let i = 0; i < heightData.length; i++) {
            const x = i % res;
            const z = Math.floor(i / res);
            
            let total = 0;
            let freq = this.params.frequency;
            let amp = this.params.amplitude;
            let maxValue = 0;

            for(let o = 0; o < this.params.octaves; o++) {
                total += simplex.noise2D(x / res * freq, z / res * freq) * amp;
                maxValue += amp;
                amp *= this.params.persistence;
                freq *= 2;
            }
            
            heightData[i] += (total / maxValue) * this.params.amplitude;
        }
    }
}*/ 

class NoiseNode extends BaseNode {
    constructor() {
        super('Perlin Noise', {
            amplitude: 5.0,
            frequency: 0.5,
            octaves: 4,
            persistence: 0.5,
            additive: true // NEW: Additive mode toggle
        });
    }

    /*process(heightData, config) {
        const res = config.resolution + 1;
        for (let i = 0; i < heightData.length; i++) {
            const x = i % res;
            const z = Math.floor(i / res);
            
            let total = 0;
            let freq = this.params.frequency;
            let amp = 1; // Start with amp 1 for normalization
            let maxValue = 0;

            for(let o = 0; o < this.params.octaves; o++) {
                total += simplex.noise2D(x / res * freq, z / res * freq) * amp;
                maxValue += amp;
                amp *= this.params.persistence;
                freq *= 2;
            }
            
            const noiseValue = (total / maxValue) * this.params.amplitude;

            if (this.params.additive) {
                heightData[i] += noiseValue; // The old behavior
            } else {
                heightData[i] = noiseValue; // NEW: Replaces the height entirely
            }
        }
    }*/ 

        
/**
 * Processes the noise calculation.
 * This method is now non-destructive. It reads from `previousHeightData`
 * and writes the final result into `currentHeightData`.
 *
 * @param {Float32Array} currentHeightData - The output buffer to write the new heights into.
 * @param {object} config - The terrain's configuration object (e.g., { resolution, width, length }).
 * @param {Float32Array} previousHeightData - The height data from the previous node in the chain.
 */
process(currentHeightData, config, previousHeightData) {
    // The resolution here refers to the number of vertices on one edge, which is resolution + 1.
    const res = config.resolution + 1;

    // Loop through every vertex in the height map.
    for (let i = 0; i < currentHeightData.length; i++) {
        // Calculate the 2D coordinates (x, z) from the 1D array index (i).
        const x = i % res;
        const z = Math.floor(i / res);

        let totalNoise = 0;
        let frequency = this.params.frequency;
        let amplitude = 1; // Start with amp 1 for normalization before applying the final amplitude.
        let maxAmplitude = 0; // Used to normalize the result to a range of [-1, 1].

        // This is the core of Fractional Brownian Motion (fBm).
        // We layer multiple "octaves" of noise at different frequencies and amplitudes.
        for (let o = 0; o < this.params.octaves; o++) {
            // Calculate the noise value for the current octave.
            // We scale the coordinates by frequency to "zoom" in or out of the noise field.
            const noiseSample = simplex.noise2D(x / res * frequency, z / res * frequency);
            
            totalNoise += noiseSample * amplitude;

            // Keep track of the maximum possible amplitude to normalize later.
            maxAmplitude += amplitude;

            // For the next octave, increase the frequency and decrease the amplitude.
            amplitude *= this.params.persistence;
            frequency *= 2; // Typically, frequency doubles each octave (lacunarity).
        }

        // Normalize the noise to ensure it's in the [-1, 1] range, then scale by the final desired amplitude.
        const normalizedNoise = (totalNoise / maxAmplitude);
        const finalNoiseValue = normalizedNoise * this.params.amplitude;

        // --- Non-Destructive Logic ---
        // Decide whether to add to the previous terrain shape or replace it entirely.
        if (this.params.additive) {
            // ADDITIVE MODE: Take the height from the previous node and add our new noise value.
            // This is for layering details on top of an existing shape.
            currentHeightData[i] = previousHeightData[i] + finalNoiseValue;
        } else {
            // OVERWRITE MODE: Ignore the previous node's height and set it directly to our noise value.
            // This is for creating the initial base shape of the terrain.
            currentHeightData[i] = finalNoiseValue;
        }
    }
}
}

class InvertNode extends BaseNode {
    constructor() {
        super('Invert Height', {
            strength: 1.0,
        });
    }

    process(heightData, config) {
        let min = Infinity, max = -Infinity;
        for(let i = 0; i < heightData.length; i++) {
            if(heightData[i] < min) min = heightData[i];
            if(heightData[i] > max) max = heightData[i];
        }
        
        const range = max - min;
        if (range === 0) return; // Avoid division by zero

        for (let i = 0; i < heightData.length; i++) {
            const originalY = heightData[i];
            // Invert the value relative to its min/max range
            const invertedY = max - (originalY - min);
            
            // Lerp based on strength
            heightData[i] = originalY * (1 - this.params.strength) + invertedY * this.params.strength;
        }
    }
}

class TerraceNode extends BaseNode {
    constructor() {
        super('Terrace', {
            count: 10,
            strength: 1.0,
        });
    }

    process(heightData, config) {
        for (let i = 0; i < heightData.length; i++) {
            const originalY = heightData[i];
            const terracedY = Math.round(originalY * this.params.count) / this.params.count;
            // Lerp between original and terraced value based on strength
            heightData[i] = originalY * (1 - this.params.strength) + terracedY * this.params.strength;
        }
    }
}

class HeightMaskNode extends BaseNode {
    constructor() {
        super('Height Mask Modify', {
            minHeight: 2.0,
            maxHeight: 10.0,
            strength: 1.0,
        });
    }
    
    // Override HTML to make min/max ranges more sensible
    getParamsHTML() {
        return `
            <h4>${this.name} Parameters</h4>
            <label>minHeight: <span id="value-${this.id}-minHeight">${this.params.minHeight.toFixed(2)}</span></label>
            <input type="range" id="param-${this.id}-minHeight" min="-10" max="20" step="0.1" value="${this.params.minHeight}">
            <label>maxHeight: <span id="value-${this.id}-maxHeight">${this.params.maxHeight.toFixed(2)}</span></label>
            <input type="range" id="param-${this.id}-maxHeight" min="-10" max="20" step="0.1" value="${this.params.maxHeight}">
            <label>strength: <span id="value-${this.id}-strength">${this.params.strength.toFixed(2)}</span></label>
            <input type="range" id="param-${this.id}-strength" min="0" max="1" step="0.01" value="${this.params.strength}">
        `;
    }

    process(heightData, config) {
        for (let i = 0; i < heightData.length; i++) {
            const y = heightData[i];
            if (y >= this.params.minHeight && y <= this.params.maxHeight) {
                // This is a simple "add" operation; could be multiply, set, etc.
                heightData[i] = y * this.params.strength;
            }
        }
    }
}

class HydraulicErosionNode extends BaseNode {
    constructor() {
        super('Hydraulic Erosion', {
            iterations: 25000,
            rainAmount: 0.01,
            solubility: 0.01,
            evaporation: 0.5,
            capacity: 0.01
        });
    }
    
    // Override HTML for better ranges
    getParamsHTML() {
        return `
            <h4>${this.name} Parameters</h4>
            <label>iterations: <span id="value-${this.id}-iterations">${this.params.iterations}</span></label>
            <input type="range" id="param-${this.id}-iterations" min="1000" max="100000" step="1000" value="${this.params.iterations}">
            <label>rainAmount: <span id="value-${this.id}-rainAmount">${this.params.rainAmount.toFixed(3)}</span></label>
            <input type="range" id="param-${this.id}-rainAmount" min="0.001" max="0.1" step="0.001" value="${this.params.rainAmount}">
            <label>solubility: <span id="value-${this.id}-solubility">${this.params.solubility.toFixed(3)}</span></label>
            <input type="range" id="param-${this.id}-solubility" min="0.001" max="0.1" step="0.001" value="${this.params.solubility}">
            <label>evaporation: <span id="value-${this.id}-evaporation">${this.params.evaporation.toFixed(2)}</span></label>
            <input type="range" id="param-${this.id}-evaporation" min="0.01" max="1" step="0.01" value="${this.params.evaporation}">
            <label>capacity: <span id="value-${this.id}-capacity">${this.params.capacity.toFixed(3)}</span></label>
            <input type="range" id="param-${this.id}-capacity" min="0.001" max="0.1" step="0.001" value="${this.params.capacity}">
        `;
    }

    process(heightData, config) {
        const res = config.resolution + 1;
        
        for (let iter = 0; iter < this.params.iterations; iter++) {
            // Spawn a droplet at a random position
            let x = Math.floor(Math.random() * (res - 1));
            let z = Math.floor(Math.random() * (res - 1));
            
            let water = this.params.rainAmount;
            let sediment = 0;
            
            for (let step = 0; step < 32; step++) { // Droplet lifetime
                const currentIndex = z * res + x;
                const currentHeight = heightData[currentIndex];

                // Calculate gradient to find the downhill direction
                const nx = Math.max(0, Math.min(res - 1, x - 1));
                const px = Math.max(0, Math.min(res - 1, x + 1));
                const nz = Math.max(0, Math.min(res - 1, z - 1));
                const pz = Math.max(0, Math.min(res - 1, z + 1));

                const gradX = heightData[z * res + px] - heightData[z * res + nx];
                const gradZ = heightData[pz * res + x] - heightData[nz * res + x];
                const dirX = -gradX;
                const dirZ = -gradZ;
                
                // Normalize direction
                const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
                if (len === 0) break;
                const moveX = dirX / len;
                const moveZ = dirZ / len;

                // Move to the next point (interpolated)
                const nextX = x + moveX;
                const nextZ = z + moveZ;

                const nextIndex = Math.floor(nextZ) * res + Math.floor(nextX);
                if (nextIndex < 0 || nextIndex >= heightData.length) break;

                const nextHeight = heightData[nextIndex];
                const heightDiff = currentHeight - nextHeight;
                
                // Erode or deposit sediment
                const sedimentCapacity = Math.max(0, heightDiff) * water * this.params.capacity;
                const sedimentToMove = Math.min(sediment, sedimentCapacity);
                const sedimentToDeposit = sediment - sedimentToMove;
                const sedimentToErode = Math.min(this.params.solubility * heightDiff, sedimentCapacity - sediment);

                // Apply changes
                if (sedimentToErode > 0) {
                    heightData[currentIndex] -= sedimentToErode;
                    sediment += sedimentToErode;
                }
                if (sedimentToDeposit > 0) {
                    heightData[currentIndex] += sedimentToDeposit;
                    sediment -= sedimentToDeposit;
                }

                // Evaporate water
                water *= (1 - this.params.evaporation);
                if (water <= 0.001) break;

                // Update droplet position
                x = nextX;
                z = nextZ;

                if (x < 1 || x > res - 2 || z < 1 || z > res - 2) break;
            }
        }
    }
}


class SmoothNode extends BaseNode {
    constructor() {
        super('Thermal Smooth', {
            iterations: 1,
            strength: 0.5
        });
    }
    
    getParamsHTML() {
        return `
            <h4>${this.name} Parameters</h4>
            <label>iterations: <span id="value-${this.id}-iterations">${this.params.iterations}</span></label>
            <input type="range" id="param-${this.id}-iterations" min="1" max="10" step="1" value="${this.params.iterations}">
            <label>strength: <span id="value-${this.id}-strength">${this.params.strength.toFixed(2)}</span></label>
            <input type="range" id="param-${this.id}-strength" min="0.01" max="1" step="0.01" value="${this.params.strength}">
        `;
    }

    process(heightData, config) {
        const res = config.resolution + 1;
        const tempHeight = new Float32Array(heightData); // Work on a copy
        
        for(let iter = 0; iter < this.params.iterations; iter++) {
            for (let z = 1; z < res - 1; z++) {
                for (let x = 1; x < res - 1; x++) {
                    const i = z * res + x;
                    
                    // Simple box blur
                    let total = tempHeight[i];
                    total += tempHeight[i - 1]; // left
                    total += tempHeight[i + 1]; // right
                    total += tempHeight[i - res]; // top
                    total += tempHeight[i + res]; // bottom
                    total += tempHeight[i - res - 1]; // top-left
                    total += tempHeight[i - res + 1]; // top-right
                    total += tempHeight[i + res - 1]; // bottom-left
                    total += tempHeight[i + res + 1]; // bottom-right

                    const average = total / 9.0;
                    heightData[i] = tempHeight[i] * (1 - this.params.strength) + average * this.params.strength;
                }
            }
            // After each iteration, copy the processed data back to the temp array for the next pass
            if(iter < this.params.iterations - 1) {
                tempHeight.set(heightData);
            }
        }
    }
}


///===========================================================================================

// --- NEW ADVANCED NODE IMPLEMENTATIONS ---
// Add these to your main script file (e.g., NodeEditorSystem.js) with the other nodes.

class RidgedNoiseNode extends BaseNode {
    constructor() {
        super('Ridged Mountains', { amplitude: 15.0, frequency: 1.5, octaves: 6, persistence: 0.6, lacunarity: 2.2 });
    }
    
    // Override getParamsHTML for more specific ranges if needed
    getParamsHTML() {
        let html = `<h4>${this.name} Parameters</h4>`;
        const params = { amplitude: 50, frequency: 5, octaves: 8, persistence: 1, lacunarity: 4 };
        for (const key in this.params) {
            const value = this.params[key];
            const id = `param-${this.id}-${key}`;
            const valueId = `value-${this.id}-${key}`;
            html += `<label for="${id}">${key}: <span id="${valueId}">${value.toFixed(2)}</span></label><input type="range" id="${id}" min="0.1" max="${params[key]}" step="0.1" value="${value}">`;
        }
        return html;
    }

    process(currentHeightData, config, previousHeightData) {
        const res = config.resolution + 1;
        const maskData = window.terrain.userData.maskData;

        for (let i = 0; i < currentHeightData.length; i++) {
            const maskInfluence = maskData[i];
            if (maskInfluence === 0) {
                currentHeightData[i] = previousHeightData[i];
                continue;
            }

            const x = i % res;
            const z = Math.floor(i / res);
            let totalNoise = 0, frequency = this.params.frequency, amplitude = 1;
            
            for (let o = 0; o < this.params.octaves; o++) {
                // The core of ridged noise: take the absolute value of standard noise and invert it.
                let noiseSample = simplex.noise2D(x / res * frequency, z / res * frequency);
                noiseSample = 1.0 - Math.abs(noiseSample);
                
                // Square the result to sharpen the ridges
                noiseSample *= noiseSample;
                
                totalNoise += noiseSample * amplitude;
                
                frequency *= this.params.lacunarity;
                amplitude *= this.params.persistence;
            }
            
            const modifiedHeight = previousHeightData[i] + totalNoise * this.params.amplitude;
            currentHeightData[i] = previousHeightData[i] * (1 - maskInfluence) + modifiedHeight * maskInfluence;
        }
    }
}

class VoronoiCellsNode extends BaseNode {
    constructor() {
        super('Voronoi Cells', { amplitude: 5.0, density: 5.0, blending: 0.5 });
    }

    process(currentHeightData, config, previousHeightData) {
        const res = config.resolution + 1;
        const maskData = window.terrain.userData.maskData;

        // Generate a set of random feature points
        const numPoints = Math.floor(this.params.density);
        const points = [];
        for (let i = 0; i < numPoints; i++) {
            points.push({
                x: Math.random() * res,
                y: Math.random() * res,
                height: (Math.random() - 0.5) * 2 // Random height for each point
            });
        }
        if (numPoints === 0) { currentHeightData.set(previousHeightData); return; }

        for (let i = 0; i < currentHeightData.length; i++) {
            const maskInfluence = maskData[i];
            if (maskInfluence === 0) {
                currentHeightData[i] = previousHeightData[i];
                continue;
            }

            const x = i % res;
            const z = Math.floor(i / res);

            let minDist1 = Infinity;
            let minDist2 = Infinity;
            let closestPointHeight = 0;

            for (const p of points) {
                const dist = Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(z - p.y, 2));
                if (dist < minDist1) {
                    minDist2 = minDist1;
                    minDist1 = dist;
                    closestPointHeight = p.height;
                } else if (dist < minDist2) {
                    minDist2 = dist;
                }
            }

            // F2 - F1 calculation creates distinct cell walls
            const voronoiValue = (minDist2 - minDist1) * this.params.blending + closestPointHeight * (1 - this.params.blending);
            const modifiedHeight = previousHeightData[i] + voronoiValue * this.params.amplitude;

            currentHeightData[i] = previousHeightData[i] * (1 - maskInfluence) + modifiedHeight * maskInfluence;
        }
    }
}

class PlateauNode extends BaseNode {
    constructor() {
        super('Plateau', { level: 10.0, falloff: 0.2, strength: 1.0 });
    }
    
    getParamsHTML() { /* Override for better ranges */ return `<h4>${this.name} Parameters</h4><label>level: <span id="value-${this.id}-level">${this.params.level.toFixed(2)}</span></label><input type="range" id="param-${this.id}-level" min="-20" max="50" step="0.5" value="${this.params.level}"><label>falloff: <span id="value-${this.id}-falloff">${this.params.falloff.toFixed(2)}</span></label><input type="range" id="param-${this.id}-falloff" min="0.01" max="1" step="0.01" value="${this.params.falloff}"><label>strength: <span id="value-${this.id}-strength">${this.params.strength.toFixed(2)}</span></label><input type="range" id="param-${this.id}-strength" min="0" max="1" step="0.01" value="${this.params.strength}">`; }

    process(currentHeightData, config, previousHeightData) {
        const maskData = window.terrain.userData.maskData;
        
        for (let i = 0; i < currentHeightData.length; i++) {
            const maskInfluence = maskData[i];
            if (maskInfluence === 0) {
                currentHeightData[i] = previousHeightData[i];
                continue;
            }
            
            const originalY = previousHeightData[i];
            const diff = this.params.level - originalY;
            
            // Smoothly clamp the height to the plateau level using a falloff
            let plateauY = originalY;
            if (diff > 0) {
                 plateauY = this.params.level - (diff * Math.exp(-this.params.falloff * diff));
            }

            const modifiedHeight = originalY * (1 - this.params.strength) + plateauY * this.params.strength;
            currentHeightData[i] = previousHeightData[i] * (1 - maskInfluence) + modifiedHeight * maskInfluence;
        }
    }
}

class CanyonNode extends BaseNode {
    constructor() {
        super('Canyon Carve', { depth: 20.0, frequency: 0.8, octaves: 4, roughness: 0.5 });
    }
    
    process(currentHeightData, config, previousHeightData) {
        const res = config.resolution + 1;
        const maskData = window.terrain.userData.maskData;
        
        // Create a winding path for the canyon using noise
        const pathPoints = [];
        for (let i = 0; i < res; i++) {
            const xOffset = simplex.noise2D(i / res * 0.1, 0) * (res / 4);
            pathPoints.push({ x: res / 2 + xOffset, z: i });
        }
        
        for (let i = 0; i < currentHeightData.length; i++) {
            const maskInfluence = maskData[i];
            if (maskInfluence === 0) {
                currentHeightData[i] = previousHeightData[i];
                continue;
            }
            
            const x = i % res;
            const z = Math.floor(i / res);
            
            // Find distance to the closest point on the canyon path
            let minDist = Infinity;
            for (const p of pathPoints) {
                const dist = Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(z - p.z, 2));
                if (dist < minDist) {
                    minDist = dist;
                }
            }
            
            // Carve the canyon based on distance, using an inverted curve
            const carveFactor = Math.pow(1.0 - Math.min(1.0, minDist / (res / 4)), 2);
            let carveAmount = carveFactor * this.params.depth;

            // Add roughness to the canyon walls
            let roughNoise = 0;
            let freq = this.params.frequency;
            let amp = 1;
            for(let o = 0; o < this.params.octaves; o++) {
                roughNoise += simplex.noise2D(x/res * freq, z/res * freq) * amp;
                freq *= 2;
                amp *= 0.5;
            }
            carveAmount += roughNoise * this.params.roughness;

            const modifiedHeight = previousHeightData[i] - carveAmount;
            currentHeightData[i] = previousHeightData[i] * (1 - maskInfluence) + modifiedHeight * maskInfluence;
        }
    }
}