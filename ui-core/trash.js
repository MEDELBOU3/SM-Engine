
        class TerrainBrushSystem {
            constructor(scene, camera, renderer, terrain) {
                this.scene = scene;
                this.camera = camera;
                this.renderer = renderer;
                this.terrain = terrain;

                // Brush states
                this.isActive = false;
                this.isPainting = false;
                this.lastPaintPosition = new THREE.Vector3();

                // Brush settings
                this.settings = {
                    radius: 2,
                    density: 5,
                    spacing: 0.5,
                    scaleMin: 0.8,
                    scaleMax: 1.2,
                    rotationMin: 0,
                    rotationMax: 360,
                    heightOffset: 0,
                    paintDelay: 50, // ms between paint operations
                };

                // Storage for models
                this.models = new Map();
                this.activeModel = null;

                // Initialize systems
                this.raycaster = new THREE.Raycaster();
                this.mouse = new THREE.Vector2();
                this.brushPreview = this.createBrushPreview2();
                this.scene.add(this.brushPreview);

                // Initialize event listeners
                this.initializeEventListeners();
                this.lastPaintTime = 0;

                // Undo/Redo system
                this.undoStack = [];
                this.redoStack = [];
                this.currentPaintOperation = [];
            }

            createBrushPreview2() {
                const group = new THREE.Group();

                // Main circle
                const circleGeometry = new THREE.CircleGeometry(1, 32);
                const circleMaterial = new THREE.MeshBasicMaterial({
                    color: 0xFF7F7F,
                    transparent: true,
                    opacity: 0.6,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const circle = new THREE.Mesh(circleGeometry, circleMaterial);
                circle.rotation.x = -Math.PI / 2;
                circle.renderOrder = 1;

                // Outer ring
                const ringGeometry = new THREE.RingGeometry(0.95, 1, 32);
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: 0xFFFFFF,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.rotation.x = -Math.PI / 2;
                ring.renderOrder = 2;

                // Center dot
                const dotGeometry = new THREE.CircleGeometry(0.05, 16);
                const dotMaterial = new THREE.MeshBasicMaterial({
                    color: 0xFFFFFF,
                    transparent: true,
                    opacity: 0.9,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const dot = new THREE.Mesh(dotGeometry, dotMaterial);
                dot.rotation.x = -Math.PI / 2;
                dot.position.y = 0.01;
                dot.renderOrder = 3;

                group.add(circle);
                group.add(ring);
                group.add(dot);
                group.visible = false;

                return group;
            }

            initializeEventListeners() {
                // Mouse events
                this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
                this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));

                // Keyboard shortcuts
                window.addEventListener('keydown', (e) => {
                    if (e.key === 'm' || e.key === 'M') {
                        this.toggleBrush();
                    }
                    if (e.key === 'z' && e.ctrlKey) {
                        this.undo();
                    }
                    if (e.key === 'y' && e.ctrlKey) {
                        this.redo();
                    }
                });

                // UI Controls
                this.setupUIControls();
            }

            setupUIControls() {
                // Brush size control
                const sizeSlider = document.getElementById('brush-size');
                if (sizeSlider) {
                    sizeSlider.addEventListener('input', (e) => {
                        this.settings.radius = parseFloat(e.target.value);
                        this.updateBrushPreview();
                    });
                }

                // Density control
                const densitySlider = document.getElementById('brush-density');
                if (densitySlider) {
                    densitySlider.addEventListener('input', (e) => {
                        this.settings.density = parseInt(e.target.value);
                    });
                }

                // Model upload
                const modelUpload = document.getElementById('model-upload');
                if (modelUpload) {
                    modelUpload.addEventListener('change', this.handleModelUpload.bind(this));
                }
            }

            handleModelUpload(event) {
                const file = event.target.files[0];
                if (!file) return;

                const loader = new THREE.GLTFLoader();
                const reader = new FileReader();

                reader.onload = (e) => {
                    loader.load(e.target.result, (gltf) => {
                        const model = gltf.scene;
                        const modelName = file.name.split('.')[0];

                        // Center and normalize model
                        const box = new THREE.Box3().setFromObject(model);
                        const center = box.getCenter(new THREE.Vector3());
                        const size = box.getSize(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z);

                        model.position.sub(center);
                        model.scale.multiplyScalar(1 / maxDim);

                        this.models.set(modelName, model);
                        this.activeModel = model;

                        console.log(`Model ${modelName} loaded successfully`);
                    });
                };

                reader.readAsDataURL(file);
            }

            onMouseMove(event) {
                if (!this.isActive) return;

                this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

                this.updateBrushPosition();

                if (this.isPainting) {
                    this.paint();
                }
            }

            onMouseDown(event) {
                if (event.button !== 0 || !this.isActive || !this.activeModel) return;
                this.isPainting = true;
                this.currentPaintOperation = [];
                this.paint();
            }

            onMouseUp() {
                if (this.isPainting && this.currentPaintOperation.length > 0) {
                    this.undoStack.push(this.currentPaintOperation);
                    this.redoStack = [];
                }
                this.isPainting = false;
            }

            updateBrushPosition() {
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObject(this.terrain);

                if (intersects.length > 0) {
                    const point = intersects[0].point;
                    this.brushPreview.position.copy(point);
                    this.brushPreview.scale.setScalar(this.settings.radius);
                    this.brushPreview.visible = true;
                } else {
                    this.brushPreview.visible = false;
                }
            }

            paint() {
                if (!this.activeModel || !this.isPainting) return;

                const now = Date.now();
                if (now - this.lastPaintTime < this.settings.paintDelay) return;
                this.lastPaintTime = now;

                const intersects = this.raycaster.intersectObject(this.terrain);
                if (intersects.length === 0) return;

                const center = intersects[0].point;
                const instanceCount = Math.floor(this.settings.density * (this.settings.radius * this.settings.radius));

                for (let i = 0; i < instanceCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.random() * this.settings.radius;

                    const position = new THREE.Vector3(
                        center.x + Math.cos(angle) * radius,
                        center.y + this.settings.heightOffset,
                        center.z + Math.sin(angle) * radius
                    );

                    // Check minimum distance from last placement
                    if (position.distanceTo(this.lastPaintPosition) < this.settings.spacing) {
                        continue;
                    }

                    const instance = this.activeModel.clone();
                    instance.position.copy(position);

                    // Random rotation
                    const rotation = THREE.MathUtils.degToRad(
                        this.settings.rotationMin +
                        Math.random() * (this.settings.rotationMax - this.settings.rotationMin)
                    );
                    instance.rotation.y = rotation;

                    // Random scale
                    const scale = this.settings.scaleMin +
                        Math.random() * (this.settings.scaleMax - this.settings.scaleMin);
                    instance.scale.setScalar(scale);

                    this.scene.add(instance);
                    this.currentPaintOperation.push(instance);
                    this.lastPaintPosition.copy(position);
                }
            }

            undo() {
                if (this.undoStack.length === 0) return;

                const objects = this.undoStack.pop();
                this.redoStack.push(objects);

                objects.forEach(obj => {
                    this.scene.remove(obj);
                });
            }

            redo() {
                if (this.redoStack.length === 0) return;

                const objects = this.redoStack.pop();
                this.undoStack.push(objects);

                objects.forEach(obj => {
                    this.scene.add(obj);
                });
            }

            toggleBrush() {
                this.isActive = !this.isActive;
                this.brushPreview.visible = this.isActive;
            }

            updateBrushPreview() {
                this.brushPreview.scale.setScalar(this.settings.radius);
            }
        }
    