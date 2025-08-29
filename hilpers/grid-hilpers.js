// Function to create Blender-like grid system
/**
 * Create a Blender-like grid for Three.js
 * @param {number} size - Size of the grid
 * @param {number} divisions - Number of grid subdivisions
 * @returns {THREE.Group} Group containing grid and axes
 */
function createBlenderGrid(size = 100, divisions = 100) {
    const gridGroup = new THREE.Group();
    gridGroup.name = "blenderGrid";

    // Create the main grid
    const gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x888888);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.2;
    gridHelper.position.y = 0;
    gridGroup.add(gridHelper);

    // Create a smaller, more prominent grid at the center
    const centerGrid = new THREE.GridHelper(10, 10, 0x4444ff, 0xaaaaaa);
    centerGrid.material.transparent = true;
    centerGrid.material.opacity = 0.5;
    centerGrid.position.y = 0.001; // Slightly above the main grid to avoid z-fighting
    gridGroup.add(centerGrid);

    // Create axis lines that extend beyond the grid
    const axisLength = size / 2 * 1.2; // 20% longer than half the grid
    
    // X-axis (red)
    const xAxisGeometry = new THREE.BufferGeometry();
    xAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
        [-axisLength, 0, 0, axisLength, 0, 0], 3
    ));
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    gridGroup.add(xAxis);
    
    // Y-axis (green)
    const yAxisGeometry = new THREE.BufferGeometry();
    yAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
        [0, -axisLength, 0, 0, axisLength, 0], 3
    ));
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    gridGroup.add(yAxis);
    
    // Z-axis (blue)
    const zAxisGeometry = new THREE.BufferGeometry();
    zAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
        [0, 0, -axisLength, 0, 0, axisLength], 3
    ));
    const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 });
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
    gridGroup.add(zAxis);

    return gridGroup;
}

/**
 * Set up Blender-like camera controls
 * @param {THREE.Camera} camera - The camera to control
 * @param {HTMLElement} domElement - The DOM element for event listening
 */
function setupBlenderControls(camera, domElement) {
    // Remove any existing OrbitControls
    if (controls) {
        controls.dispose();
    }
    
    // Create enhanced camera controls
    controls = new THREE.OrbitControls(camera, domElement);
    
    // Blender-like settings
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.8;
    controls.panSpeed = 0.8;
    controls.zoomSpeed = 1.0;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 2000;
    
    // Keyboard navigation
    const handleKeyDown = function(event) {
        // Numpad view controls (like Blender)
        switch(event.key) {
            case '1':
            case 'End': // Front view
                controls.reset();
                camera.position.set(0, 0, 10);
                camera.lookAt(0, 0, 0);
                break;
            case '3':
            case 'PageDown': // Side view
                controls.reset();
                camera.position.set(10, 0, 0);
                camera.lookAt(0, 0, 0);
                break;
            case '7':
            case 'Home': // Top view
                controls.reset();
                camera.position.set(0, 10, 0);
                camera.lookAt(0, 0, 0);
                break;
            case '5': // Toggle perspective/orthographic
                if (camera.isPerspectiveCamera) {
                    // Current camera parameters
                    const aspect = camera.aspect;
                    const distance = camera.position.distanceTo(controls.target);
                    const size = distance * Math.tan(camera.fov * Math.PI / 360);
                    
                    // Create and switch to orthographic camera
                    const orthoCamera = new THREE.OrthographicCamera(
                        -size * aspect, size * aspect,
                        size, -size,
                        0.1, 1000
                    );
                    
                    orthoCamera.position.copy(camera.position);
                    orthoCamera.quaternion.copy(camera.quaternion);
                    camera = orthoCamera;
                    controls.object = camera;
                } else {
                    // Switch back to perspective
                    const perspCamera = new THREE.PerspectiveCamera(
                        75, window.innerWidth / window.innerHeight, 0.1, 1000
                    );
                    perspCamera.position.copy(camera.position);
                    perspCamera.quaternion.copy(camera.quaternion);
                    camera = perspCamera;
                    controls.object = camera;
                }
                break;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    return controls;
}

/**
 * Quick implementation to add to your init function
 */
function addBlenderGridToScene() {
    // Create and add the Blender-like grid
    const grid = createBlenderGrid(100, 100);
    
    // Remove existing grid if any
    scene.children.forEach(child => {
        if (child instanceof THREE.GridHelper || child.name === "blenderGrid") {
            scene.remove(child);
        }
    });
    
    scene.add(grid);
    
    // Setup camera controls
    setupBlenderControls(camera, renderer.domElement);
}

// Replace your createAdvancedGridHelper function with this
function createAdvancedGridHelper(size = 1000, divisions = 100) {
    const gridGroup = new THREE.Group();
    gridGroup.name = "blenderGrid";

    // Main grid (XZ plane - floor)
    const gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x888888);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.2;
    gridHelper.position.y = 0;
    gridGroup.add(gridHelper);

    // Center grid (more visible)
    const centerGrid = new THREE.GridHelper(10, 10, 0x4444ff, 0xaaaaaa);
    centerGrid.material.transparent = true;
    centerGrid.material.opacity = 0.5;
    centerGrid.position.y = 0.001; // Slightly above to prevent z-fighting
    gridGroup.add(centerGrid);

    // Create axis lines with colors matching Blender
    const axisLength = size / 2;
    
    // X-axis (red)
    const xAxisGeometry = new THREE.BufferGeometry();
    xAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
        [-axisLength, 0, 0, axisLength, 0, 0], 3
    ));
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    gridGroup.add(xAxis);
    
    // Y-axis (green) - in Three.js, Y is up, unlike Blender where Z is up
    const yAxisGeometry = new THREE.BufferGeometry();
    yAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
        [0, -axisLength, 0, 0, axisLength, 0], 3
    ));
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    gridGroup.add(yAxis);
    
    // Z-axis (blue)
    const zAxisGeometry = new THREE.BufferGeometry();
    zAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
        [0, 0, -axisLength, 0, 0, axisLength], 3
    ));
    const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 });
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
    gridGroup.add(zAxis);

    // Add axis labels
    function createAxisLabel(text, position, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.fillStyle = color;
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 32, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);
        sprite.scale.set(3, 3, 1);
        return sprite;
    }

    // Add axis labels at the end of each axis
    const xLabel = createAxisLabel('X', new THREE.Vector3(axisLength + 2, 0, 0), '#ff0000');
    const yLabel = createAxisLabel('Y', new THREE.Vector3(0, axisLength + 2, 0), '#00ff00');
    const zLabel = createAxisLabel('Z', new THREE.Vector3(0, 0, axisLength + 2), '#0000ff');
    
    gridGroup.add(xLabel);
    gridGroup.add(yLabel);
    gridGroup.add(zLabel);

    return gridGroup;
}

// Blender-like Camera Controls
class BlenderCameraControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        // Camera settings
        this.target = new THREE.Vector3(0, 0, 0);
        this.distance = 10;
        this.theta = Math.PI / 4;  // Horizontal angle
        this.phi = Math.PI / 3;    // Vertical angle
        
        // Control settings
        this.rotateSpeed = 0.003;
        this.zoomSpeed = 0.1;
        this.panSpeed = 0.001;
        this.damping = 0.05;
        
        // State tracking
        this.isRotating = false;
        this.isPanning = false;
        this.previousMousePosition = { x: 0, y: 0 };
        
        // Target values for smooth interpolation
        this.targetTheta = this.theta;
        this.targetPhi = this.phi;
        this.targetDistance = this.distance;
        this.targetTarget = this.target.clone();
        
        // Initialize
        this.updateCameraPosition();
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Mouse events
        this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.domElement.addEventListener('wheel', this.onMouseWheel.bind(this));
        
        // Key events
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        
        // Context menu
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    onMouseDown(event) {
        event.preventDefault();
        
        // Left click - Rotate
        if (event.button === 0) {
            this.isRotating = true;
            this.isPanning = false;
        }
        
        // Middle click or right click - Pan
        if (event.button === 1 || event.button === 2) {
            this.isRotating = false;
            this.isPanning = true;
        }
        
        this.previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }
    
    onMouseMove(event) {
        if (!this.isRotating && !this.isPanning) return;
        
        const deltaX = event.clientX - this.previousMousePosition.x;
        const deltaY = event.clientY - this.previousMousePosition.y;
        
        if (this.isRotating) {
            // Rotate camera
            this.targetTheta -= deltaX * this.rotateSpeed;
            this.targetPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.targetPhi + deltaY * this.rotateSpeed));
        } else if (this.isPanning) {
            // Pan camera
            const right = new THREE.Vector3();
            const up = new THREE.Vector3();
            const forward = new THREE.Vector3();
            
            forward.subVectors(this.camera.position, this.target).normalize();
            right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
            up.crossVectors(forward, right);
            
            right.multiplyScalar(-deltaX * this.panSpeed * this.distance);
            up.multiplyScalar(deltaY * this.panSpeed * this.distance);
            
            this.targetTarget.add(right);
            this.targetTarget.add(up);
        }
        
        this.previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }
    
    onMouseUp() {
        this.isRotating = false;
        this.isPanning = false;
    }
    
    onMouseWheel(event) {
        event.preventDefault();
        
        const delta = event.deltaY > 0 ? 1.1 : 0.9;
        this.targetDistance = Math.max(1, Math.min(100, this.targetDistance * delta));
    }
    
    onKeyDown(event) {
        // Handle special keys for camera views
        switch(event.key) {
            case 'NumPad1': 
            case '1':
                if (event.ctrlKey) {
                    // Front view (Ctrl+1)
                    this.setView(Math.PI / 2, Math.PI / 2);
                } else {
                    // Front view (1)
                    this.setView(0, Math.PI / 2);
                }
                break;
            case 'NumPad3':
            case '3':
                if (event.ctrlKey) {
                    // Right view (Ctrl+3)
                    this.setView(0, Math.PI / 2);
                } else {
                    // Right view (3)
                    this.setView(Math.PI / 2, Math.PI / 2);
                }
                break;
            case 'NumPad7':
            case '7':
                if (event.ctrlKey) {
                    // Bottom view (Ctrl+7)
                    this.setView(0, Math.PI);
                } else {
                    // Top view (7)
                    this.setView(0, 0);
                }
                break;
            case 'NumPad5':
            case '5':
                // Toggle perspective/orthographic
                if (this.camera.isPerspectiveCamera) {
                    // Switch to orthographic
                    const width = this.distance * Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect;
                    const height = this.distance * Math.tan(this.camera.fov * Math.PI / 360);
                    this.previousCamera = {
                        type: 'perspective',
                        fov: this.camera.fov,
                        aspect: this.camera.aspect,
                        near: this.camera.near,
                        far: this.camera.far
                    };
                    
                    this.camera = new THREE.OrthographicCamera(
                        -width, width, height, -height, 0.1, 1000
                    );
                } else {
                    // Switch back to perspective
                    this.camera = new THREE.PerspectiveCamera(
                        this.previousCamera.fov,
                        this.previousCamera.aspect,
                        this.previousCamera.near,
                        this.previousCamera.far
                    );
                }
                this.updateCameraPosition();
                break;
            case 'Home':
                // Reset view
                this.targetTheta = Math.PI / 4;
                this.targetPhi = Math.PI / 3;
                this.targetDistance = 10;
                this.targetTarget.set(0, 0, 0);
                break;
        }
    }
    
    setView(theta, phi) {
        this.targetTheta = theta;
        this.targetPhi = phi;
    }
    
    updateCameraPosition() {
        // Convert spherical to Cartesian coordinates
        const x = this.distance * Math.sin(this.phi) * Math.sin(this.theta);
        const y = this.distance * Math.cos(this.phi);
        const z = this.distance * Math.sin(this.phi) * Math.cos(this.theta);
        
        this.camera.position.set(
            this.target.x + x,
            this.target.y + y,
            this.target.z + z
        );
        
        this.camera.lookAt(this.target);
        this.camera.updateMatrix();
    }
    
    update() {
        // Smooth interpolation
        this.theta += (this.targetTheta - this.theta) * this.damping;
        this.phi += (this.targetPhi - this.phi) * this.damping;
        this.distance += (this.targetDistance - this.distance) * this.damping;
        
        this.target.x += (this.targetTarget.x - this.target.x) * this.damping;
        this.target.y += (this.targetTarget.y - this.target.y) * this.damping;
        this.target.z += (this.targetTarget.z - this.target.z) * this.damping;
        
        this.updateCameraPosition();
    }
    
    // Focus on a specific object
    focusOn(object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        
        this.targetTarget.copy(center);
        this.targetDistance = size * 2;
    }
    
    // Clean up event listeners
    dispose() {
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
        this.domElement.removeEventListener('mousemove', this.onMouseMove);
        this.domElement.removeEventListener('mouseup', this.onMouseUp);
        this.domElement.removeEventListener('wheel', this.onMouseWheel);
        window.removeEventListener('keydown', this.onKeyDown);
        this.domElement.removeEventListener('contextmenu', (e) => e.preventDefault());
    }
}

// Function to update your init() function to use the new grid and camera controls
function initWithBlenderControls() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Renderer setup
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
        powerPreference: "high-performance",
        stencil: true,
        depth: true,
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('renderer-container').appendChild(renderer.domElement);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    renderer.physicallyCorrectLights = true;
    renderer.setPixelRatio(window.devicePixelRatio);

    // Remove previous controls if any
    if (controls) {
        controls.dispose();
        controls = null;
    }

    // Add Blender-like grid
    const blenderGrid = createBlenderGrid(100, 100);
    scene.add(blenderGrid);

    // Setup Blender-like camera controls
    blenderControls = new BlenderCameraControls(camera, renderer.domElement);
    
    // Remove transform controls listener that may interfere
    if (transformControls) {
        transformControls.removeEventListener('mouseDown', function() {});
        transformControls.removeEventListener('mouseUp', function() {});
        transformControls.removeEventListener('dragging-changed', function() {});
    }

    // Set up transform controls again
    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    
    transformControls.addEventListener('mouseDown', function() {
        blenderControls.isRotating = false;
        blenderControls.isPanning = false;
    });

    transformControls.addEventListener('mouseUp', function() {
        // Do nothing, let the blenderControls handle this
    });

    // Add lighting
    setupLighting(scene);
    
    // Update the animation loop
    function animate() {
        requestAnimationFrame(animate);
        
        // Update Blender-like controls
        blenderControls.update();
        
        // Render the scene
        renderer.clear();
        renderer.render(scene, camera);
    }
    
    animate();
}

// Function to set up lighting
function setupLighting(scene) {
    // Clear existing lights
    scene.children.forEach(child => {
        if (child.isLight) {
            scene.remove(child);
        }
    });
    
    // 1. Ambient Light (soft global illumination)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    // 2. Hemisphere Light (sky + ground simulation)
    const hemiLight = new THREE.HemisphereLight(0xb1e1ff, 0x444444, 0.6);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    // 3. Directional Light (Sun-like main light)
    const sunLight = new THREE.DirectionalLight(0xfff2cc, 1);
    sunLight.position.set(40, 60, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    sunLight.shadow.camera.far = 350;
    sunLight.shadow.bias = -0.0001;
    scene.add(sunLight);
}

// GUI function for grid controls
function addGridGUI(gui, scene) {
    const gridFolder = gui.addFolder('Grid Settings');
    
    const gridParams = {
        visible: true,
        size: 100,
        divisions: 100,
        centerColor: '#444444',
        gridColor: '#888888'
    };
    
    gridFolder.add(gridParams, 'visible').name('Show Grid').onChange((value) => {
        const grid = scene.getObjectByName('blenderGrid');
        if (grid) grid.visible = value;
    });
    
    gridFolder.add(gridParams, 'size', 10, 500).name('Grid Size').onChange((value) => {
        updateGrid(scene, gridParams);
    });
    
    gridFolder.add(gridParams, 'divisions', 10, 500).name('Grid Divisions').onChange((value) => {
        updateGrid(scene, gridParams);
    });
    
    gridFolder.addColor(gridParams, 'centerColor').name('Center Color').onChange((value) => {
        updateGrid(scene, gridParams);
    });
    
    gridFolder.addColor(gridParams, 'gridColor').name('Grid Color').onChange((value) => {
        updateGrid(scene, gridParams);
    });
    
    gridFolder.open();
}

// Function to update the grid based on GUI settings
function updateGrid(scene, params) {
    // Remove existing grid
    const existingGrid = scene.getObjectByName('blenderGrid');
    if (existingGrid) scene.remove(existingGrid);
    
    // Create new grid with updated parameters
    const newGrid = createBlenderGrid(
        params.size,
        params.divisions,
        new THREE.Color(params.centerColor),
        new THREE.Color(params.gridColor)
    );
    newGrid.visible = params.visible;
    scene.add(newGrid);
}

// Actual implementation into your existing code
function updateInit() {
    // Keep your original init function but replace the grid and camera controls
    const originalInit = init;
    
    init = function() {
        // Call original init but skip the parts we're replacing
        originalInit();
        
        // Remove the existing grid helper
        scene.children.forEach(child => {
            if (child instanceof THREE.GridHelper) {
                scene.remove(child);
            }
        });
        
        // Add our Blender-like grid
        const blenderGrid = createBlenderGrid(100, 100);
        scene.add(blenderGrid);
        
        // Replace camera controls
        if (controls) {
            controls.dispose();
        }
        
        // Create new Blender-like controls
        blenderControls = new BlenderCameraControls(camera, renderer.domElement);
        
        // Update animation function to use our controls
        const originalAnimate = animate;
        animate = function() {
            if (blenderControls) blenderControls.update();
            originalAnimate();
        };
        
        // If you have a GUI, add grid controls
        if (typeof addGUI === 'function') {
            const gui = new THREE.GUI();
            addGridGUI(gui, scene);
        }
    };
}
