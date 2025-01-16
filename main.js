let engine, scene, camera;
        let selectedMesh = null;
        let gizmoManager;
        let isPlaying = false;

        // Initialize Babylon Scene
        const createScene = async () => {
            engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
            scene = new BABYLON.Scene(engine);
            
            // Camera
            camera = new BABYLON.ArcRotateCamera("camera", 0, Math.PI / 3, 10, BABYLON.Vector3.Zero(), scene);
            camera.attachControl(canvas, true);
            camera.wheelPrecision = 50;
            camera.pinchPrecision = 50;
            
            // Default light
            const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
            
            // Ground
            const ground = BABYLON.MeshBuilder.CreateGround("ground", {width: 20, height: 20}, scene);
            ground.receiveShadows = true;
            
            // Initialize gizmo manager
            gizmoManager = new BABYLON.GizmoManager(scene);
            gizmoManager.positionGizmoEnabled = true;
            gizmoManager.rotationGizmoEnabled = false;
            gizmoManager.scaleGizmoEnabled = false;
            gizmoManager.attachableMeshes = [];

            // Enable physics
            const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
            const physicsPlugin = new BABYLON.HavokPlugin();
            scene.enablePhysics(gravityVector, physicsPlugin);
            
            return scene;
        };

        // Initialize
        const canvas = document.getElementById('renderCanvas');
        createScene().then(() => {
            engine.runRenderLoop(() => {
                scene.render();
                updateStats();
            });
        });

        // Utility Functions
        function updateStats() {
            document.getElementById('fpsCounter').textContent = `FPS: ${engine.getFps().toFixed()}`;
            document.getElementById('triangleCount').textContent = 
                `Triangles: ${scene.getActiveVertices()}`;
        }

        function selectMesh(mesh) {
            if (selectedMesh) {
                selectedMesh.showBoundingBox = false;
            }
            selectedMesh = mesh;
            if (mesh) {
                mesh.showBoundingBox = true;
                gizmoManager.attachToMesh(mesh);
                updateTransformPanel();
            } else {
                gizmoManager.attachToMesh(null);
            }
        }

        function updateTransformPanel() {
            if (selectedMesh) {
                document.getElementById('posX').value = selectedMesh.position.x.toFixed(2);
                document.getElementById('posY').value = selectedMesh.position.y.toFixed(2);
                document.getElementById('posZ').value = selectedMesh.position.z.toFixed(2);
                document.getElementById('rotX').value = (selectedMesh.rotation.x * 180 / Math.PI).toFixed(2);
                document.getElementById('rotY').value = (selectedMesh.rotation.y * 180 / Math.PI).toFixed(2);
                document.getElementById('rotZ').value = (selectedMesh.rotation.z * 180 / Math.PI).toFixed(2);
                document.getElementById('scaleX').value = selectedMesh.scaling.x.toFixed(2);
                document.getElementById('scaleY').value = selectedMesh.scaling.y.toFixed(2);
                document.getElementById('scaleZ').value = selectedMesh.scaling.z.toFixed(2);
            }
        }

        // Event Handlers
        window.addEventListener('resize', () => {
            engine.resize();
        });

        // Tool buttons
        document.getElementById('selectTool').addEventListener('click', () => {
            gizmoManager.positionGizmoEnabled = false;
            gizmoManager.rotationGizmoEnabled = false;
            gizmoManager.scaleGizmoEnabled = false;
        });

        document.getElementById('moveTool').addEventListener('click', () => {
            gizmoManager.positionGizmoEnabled = true;
            gizmoManager.rotationGizmoEnabled = false;
            gizmoManager.scaleGizmoEnabled = false;
        });

        document.getElementById('rotateTool').addEventListener('click', () => {
            gizmoManager.positionGizmoEnabled = false;
            gizmoManager.rotationGizmoEnabled = true;
            gizmoManager.scaleGizmoEnabled = false;
        });

        document.getElementById('scaleTool').addEventListener('click', () => {
            gizmoManager.positionGizmoEnabled = false;
            gizmoManager.rotationGizmoEnabled = false;
            gizmoManager.scaleGizmoEnabled = true;
        });

        // Shape creation
        document.getElementById('addBox').addEventListener('click', () => {
            const box = BABYLON.MeshBuilder.CreateBox("box", {}, scene);
            box.position.y = 1;
            selectMesh(box);
        });

        document.getElementById('addSphere').addEventListener('click', () => {
            const sphere = BABYLON.MeshBuilder.CreateSphere("sphere", {diameter: 2}, scene);
            sphere.position.y = 1;
            selectMesh(sphere);
        });

        document.getElementById('addCylinder').addEventListener('click', () => {
            const cylinder = BABYLON.MeshBuilder.CreateCylinder("cylinder", {height: 2, diameter: 1}, scene);
            cylinder.position.y = 1;
            selectMesh(cylinder);
        });

        // Import model
        document.getElementById('importModel').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (event) => {
            const file = event.target.files[0];
            const extension = file.name.split('.').pop().toLowerCase();
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const data = event.target.result;
                switch(extension) {
                    case 'glb':
                    case 'gltf':
                        BABYLON.SceneLoader.ImportMesh("", "", data, scene, (meshes) => {
                            selectMesh(meshes[0]);
                        });
                        break;
                    case 'obj':
                        BABYLON.SceneLoader.ImportMesh("", "", data, scene, (meshes) => {
                            selectMesh(meshes[0]);
                        });
                        break;
                }
            };
            reader.readAsArrayBuffer(file);
        });

        // Inspector toggle
        document.getElementById('toggleInspector').addEventListener('click', () => {
            if (scene.debugLayer.isVisible()) {
                scene.debugLayer.hide();
            } else {
                scene.debugLayer.show();
            }
        });

        // Scene interaction
        scene.onPointerDown = (evt, pickResult) => {
            if (evt.button === 0) {  // Left click
                if (pickResult.hit) {
                    selectMesh(pickResult.pickedMesh);
                } else {
                    selectMesh(null);
                }
            }
        };

        // Transform panel input handlers
        ['posX', 'posY', 'posZ'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                if (selectedMesh) {
                    const value = parseFloat(e.target.value);
                    const axis = id.charAt(3).toLowerCase();
                    selectedMesh.position[axis] = value;
                }
            });
        });

        ['rotX', 'rotY', 'rotZ'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                if (selectedMesh) {
                    const value = parseFloat(e.target.value) * Math.PI / 180;
                    const axis = id.charAt(3).toLowerCase();
                    selectedMesh.rotation[axis] = value;
                }
            });
        });

        ['scaleX', 'scaleY', 'scaleZ'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                if (selectedMesh) {
                    const value = parseFloat(e.target.value);
                    const axis = id.charAt(5).toLowerCase();
                    selectedMesh.scaling[axis] = value;
                }
            });
        });
