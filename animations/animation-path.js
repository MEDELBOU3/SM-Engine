// Path Animation System for Three.js Objects
class PathAnimationSystem {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.paths = new Map(); // Map objects to their paths
        this.selectedObject = null;
        this.isDrawing = false;
        this.currentPath = null;
        this.currentPoints = [];
        this.pathColors = [0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0xffff00, 0x00ffff]; // Red, Green, Blue, Magenta, Yellow, Cyan
        this.colorIndex = 0;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.animatingObjects = new Map(); // Objects currently being animated
        this.clock = new THREE.Clock();
        this.pathEditMode = false;
        this.controlPoints = [];
        this.selectedControlPoint = null;

        // Create container for path visualization
        this.pathsContainer = new THREE.Group();
        this.pathsContainer.name = "Animation Paths";
        this.scene.add(this.pathsContainer);

        this.initUI();
        this.setupEventListeners();
    }

    initUI() {
        // Create main container
        const container = document.createElement('div');
        container.id = 'path-animation-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(30, 30, 30, 0.8);
            border-radius: 8px;
            padding: 10px;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        `;

        // Create buttons
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        `;

        const drawButton = this.createButton('Draw Path', () => this.togglePathDrawing());
        drawButton.id = 'draw-path-button';

        const editButton = this.createButton('Edit Path', () => this.togglePathEditing());
        editButton.id = 'edit-path-button';

        const playButton = this.createButton('Play Animation', () => this.playSelectedAnimation());
        playButton.id = 'play-animation-button';

        const stopButton = this.createButton('Stop All', () => this.stopAllAnimations());
        stopButton.id = 'stop-animations-button';

        const showPathsButton = this.createButton('Show Paths List', () => this.togglePathsList());
        showPathsButton.id = 'show-paths-button';

        buttonsContainer.appendChild(drawButton);
        buttonsContainer.appendChild(editButton);
        buttonsContainer.appendChild(playButton);
        buttonsContainer.appendChild(stopButton);
        buttonsContainer.appendChild(showPathsButton);

        // Status indicator
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'path-status-indicator';
        statusIndicator.style.cssText = `
            padding: 5px;
            margin-top: 5px;
            border-radius: 4px;
            text-align: center;
            font-size: 14px;
            background: #333;
        `;
        statusIndicator.textContent = 'Ready';

        // Add elements to container
        container.appendChild(buttonsContainer);
        container.appendChild(statusIndicator);

        // Create paths list modal (initially hidden)
        this.createPathsListModal();

        // Add container to the document
        document.body.appendChild(container);
    }

    createButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            background: #444;
            border: none;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 14px;
        `;
        button.addEventListener('click', onClick);
        button.addEventListener('mouseenter', () => {
            button.style.background = '#555';
        });
        button.addEventListener('mouseleave', () => {
            button.style.background = '#444';
        });
        return button;
    }

    createPathsListModal() {
        const modal = document.createElement('div');
        modal.id = 'paths-list-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(40, 40, 40, 0.95);
            border-radius: 8px;
            padding: 20px;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 2000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            min-width: 400px;
            max-height: 80vh;
            overflow-y: auto;
            display: none;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            border-bottom: 1px solid #555;
            padding-bottom: 10px;
        `;
        
        const title = document.createElement('h3');
        title.textContent = 'Animation Paths';
        title.style.margin = '0';
        
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
        `;
        closeButton.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        header.appendChild(title);
        header.appendChild(closeButton);
        
        // List container
        const listContainer = document.createElement('div');
        listContainer.id = 'paths-list-container';
        
        modal.appendChild(header);
        modal.appendChild(listContainer);
        
        document.body.appendChild(modal);
    }

    updatePathsList() {
        const container = document.getElementById('paths-list-container');
        container.innerHTML = '';
        
        if (this.paths.size === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'No animation paths created yet.';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.color = '#aaa';
            container.appendChild(emptyMessage);
            return;
        }
        
        this.paths.forEach((pathData, object) => {
            const pathItem = document.createElement('div');
            pathItem.style.cssText = `
                background: rgba(60, 60, 60, 0.7);
                border-radius: 4px;
                padding: 10px;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            
            // Color indicator
            const colorIndicator = document.createElement('div');
            colorIndicator.style.cssText = `
                width: 15px;
                height: 15px;
                border-radius: 50%;
                background-color: #${pathData.color.toString(16).padStart(6, '0')};
                margin-right: 10px;
            `;
            
            // Object info
            const objectInfo = document.createElement('div');
            objectInfo.style.flex = '1';
            
            const objectName = document.createElement('div');
            objectName.textContent = object.name || `Object_${object.id || object.uuid.substring(0, 8)}`;
            objectName.style.fontWeight = 'bold';
            
            const pointsInfo = document.createElement('div');
            pointsInfo.textContent = `${pathData.points.length} control points`;
            pointsInfo.style.fontSize = '12px';
            pointsInfo.style.color = '#aaa';
            
            objectInfo.appendChild(objectName);
            objectInfo.appendChild(pointsInfo);
            
            // Actions
            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '8px';
            
            const playButton = this.createButton('Play', () => {
                this.playAnimation(object);
                document.getElementById('paths-list-modal').style.display = 'none';
            });
            playButton.style.padding = '5px 10px';
            playButton.style.fontSize = '12px';
            
            const editButton = this.createButton('Edit', () => {
                this.editPath(object);
                document.getElementById('paths-list-modal').style.display = 'none';
            });
            editButton.style.padding = '5px 10px';
            editButton.style.fontSize = '12px';
            
            const deleteButton = this.createButton('Delete', () => {
                this.deletePath(object);
                this.updatePathsList();
            });
            deleteButton.style.padding = '5px 10px';
            deleteButton.style.fontSize = '12px';
            deleteButton.style.background = '#993333';
            
            actions.appendChild(playButton);
            actions.appendChild(editButton);
            actions.appendChild(deleteButton);
            
            // Assemble item
            pathItem.appendChild(colorIndicator);
            pathItem.appendChild(objectInfo);
            pathItem.appendChild(actions);
            
            container.appendChild(pathItem);
        });
    }

    setupEventListeners() {
        // Canvas event listeners for path drawing
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
        canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
        canvas.addEventListener('pointerup', () => this.onPointerUp());
        
        // Store a reference to the scene's selectObject function
        this.originalSelectObject = window.selectObject || function() {};
        
        // Override the scene's selectObject function to keep track of selected object
        window.selectObject = (object) => {
            this.selectedObject = object;
            // Call the original function if it exists
            if (typeof this.originalSelectObject === 'function') {
                this.originalSelectObject(object);
            }
            this.updateStatus();
        };

        // KeyDown event for canceling drawing
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (this.isDrawing) {
                    this.cancelPathDrawing();
                }
                if (this.pathEditMode) {
                    this.exitEditMode();
                }
            }
        });
    }

    onPointerDown(event) {
        if (!this.isDrawing && !this.pathEditMode) return;

        // Calculate mouse position
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (this.pathEditMode) {
            // Check if we clicked on a control point
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.controlPoints);
            
            if (intersects.length > 0) {
                this.selectedControlPoint = intersects[0].object;
                this.renderer.domElement.style.cursor = 'grabbing';
                return;
            }
            
            // If we didn't click a control point, add a new point
            const planeIntersect = this.getPlaneIntersection();
            if (planeIntersect) {
                const pathData = this.paths.get(this.selectedObject);
                if (pathData) {
                    pathData.points.push(planeIntersect.clone());
                    this.updatePathVisualization(this.selectedObject, pathData);
                    this.createControlPoints(pathData.points);
                }
            }
        } else if (this.isDrawing) {
            // Add point to current path
            const planeIntersect = this.getPlaneIntersection();
            if (planeIntersect) {
                this.currentPoints.push(planeIntersect.clone());
                this.updateCurrentPathVisualization();
            }
        }
    }

    onPointerMove(event) {
        // Calculate mouse position
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (this.pathEditMode && this.selectedControlPoint) {
            // Move the selected control point
            const planeIntersect = this.getPlaneIntersection();
            if (planeIntersect) {
                this.selectedControlPoint.position.copy(planeIntersect);
                
                // Update the path data
                const pathData = this.paths.get(this.selectedObject);
                if (pathData) {
                    const index = this.controlPoints.indexOf(this.selectedControlPoint);
                    if (index !== -1) {
                        pathData.points[index] = planeIntersect.clone();
                        this.updatePathVisualization(this.selectedObject, pathData);
                    }
                }
            }
        } else if (this.isDrawing) {
            // Preview the next point in the current path
            const planeIntersect = this.getPlaneIntersection();
            if (planeIntersect && this.currentPoints.length > 0) {
                const lastPoint = this.currentPoints[this.currentPoints.length - 1];
                
                // Update the preview line
                const positions = new Float32Array([
                    lastPoint.x, lastPoint.y, lastPoint.z,
                    planeIntersect.x, planeIntersect.y, planeIntersect.z
                ]);
                
                if (this.previewLine) {
                    this.previewLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    this.previewLine.geometry.attributes.position.needsUpdate = true;
                } else {
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    
                    const material = new THREE.LineBasicMaterial({
                        color: 0xffffff,
                        linewidth: 2,
                        linecap: 'round',
                        linejoin: 'round'
                    });
                    
                    this.previewLine = new THREE.Line(geometry, material);
                    this.pathsContainer.add(this.previewLine);
                }
            }
        }
    }

    onPointerUp() {
        if (this.pathEditMode && this.selectedControlPoint) {
            this.selectedControlPoint = null;
            this.renderer.domElement.style.cursor = 'pointer';
        }
    }

    getPlaneIntersection() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Create a plane aligned with the camera's view direction
        const planeNormal = new THREE.Vector3().copy(this.camera.position).normalize();
        let plane;
        
        if (this.selectedObject) {
            // If we have a selected object, use its position as the reference
            const objPos = this.selectedObject.position.clone();
            plane = new THREE.Plane(planeNormal, -planeNormal.dot(objPos));
        } else {
            // Otherwise, use a plane at origin perpendicular to camera
            plane = new THREE.Plane(planeNormal, 0);
        }
        
        const intersection = new THREE.Vector3();
        const hasIntersection = this.raycaster.ray.intersectPlane(plane, intersection);
        
        return hasIntersection ? intersection : null;
    }

    togglePathDrawing() {
        if (this.pathEditMode) {
            this.exitEditMode();
        }

        if (!this.selectedObject) {
            alert("Please select an object first");
            return;
        }

        this.isDrawing = !this.isDrawing;
        
        const button = document.getElementById('draw-path-button');
        const statusIndicator = document.getElementById('path-status-indicator');
        
        if (this.isDrawing) {
            // Start drawing mode
            button.textContent = 'Finish Path';
            button.style.background = '#5d5';
            statusIndicator.textContent = `Drawing path for ${this.selectedObject.name || 'Selected Object'}`;
            this.currentPoints = [];
            
            // Create a new path color
            const color = this.pathColors[this.colorIndex % this.pathColors.length];
            this.colorIndex++;
            
            // Create preview line geometry
            const geometry = new THREE.BufferGeometry();
            const material = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.7, transparent: true });
            this.previewLine = new THREE.Line(geometry, material);
            this.pathsContainer.add(this.previewLine);
            
            // Disable other controls while drawing
            if (window.controls) {
                this.previousControlsState = window.controls.enabled;
                window.controls.enabled = false;
            }
            if (window.transformControls) {
                this.previousTransformState = window.transformControls.enabled;
                window.transformControls.enabled = false;
            }
            
            this.renderer.domElement.style.cursor = 'crosshair';
        } else {
            // End drawing mode
            button.textContent = 'Draw Path';
            button.style.background = '#444';
            
            this.finishPath();
            
            // Re-enable controls
            if (window.controls && this.previousControlsState !== undefined) {
                window.controls.enabled = this.previousControlsState;
            }
            if (window.transformControls && this.previousTransformState !== undefined) {
                window.transformControls.enabled = this.previousTransformState;
            }
            
            this.renderer.domElement.style.cursor = 'default';
        }
    }
    
    finishPath() {
        if (this.currentPoints.length < 2) {
            this.cancelPathDrawing();
            return;
        }
        
        const color = this.pathColors[this.colorIndex % this.pathColors.length];
        
        // Create the path data
        const pathData = {
            points: [...this.currentPoints],
            color: color,
            curve: null,
            line: null
        };
        
        // Generate the curve
        pathData.curve = this.createCurve(pathData.points);
        
        // Store the path data for this object
        this.paths.set(this.selectedObject, pathData);
        
        // Create visual path
        this.updatePathVisualization(this.selectedObject, pathData);
        
        // Clean up temporary drawing objects
        if (this.previewLine) {
            this.pathsContainer.remove(this.previewLine);
            this.previewLine = null;
        }
        
        this.currentPoints = [];
        
        const statusIndicator = document.getElementById('path-status-indicator');
        statusIndicator.textContent = `Path created for ${this.selectedObject.name || 'Selected Object'}`;
    }
    
    cancelPathDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            
            // Clean up temporary drawing objects
            if (this.previewLine) {
                this.pathsContainer.remove(this.previewLine);
                this.previewLine = null;
            }
            
            this.currentPoints = [];
            
            // Update UI
            const button = document.getElementById('draw-path-button');
            button.textContent = 'Draw Path';
            button.style.background = '#444';
            
            const statusIndicator = document.getElementById('path-status-indicator');
            statusIndicator.textContent = 'Path drawing cancelled';
            
            // Re-enable controls
            if (window.controls && this.previousControlsState !== undefined) {
                window.controls.enabled = this.previousControlsState;
            }
            if (window.transformControls && this.previousTransformState !== undefined) {
                window.transformControls.enabled = this.previousTransformState;
            }
            
            this.renderer.domElement.style.cursor = 'default';
        }
    }
    
    createCurve(points) {
        if (points.length < 2) return null;
        
        // For simplicity, use CatmullRomCurve3 which creates a smooth curve through all points
        return new THREE.CatmullRomCurve3(points, true, 'centripetal');
    }
    
    updatePathVisualization(object, pathData) {
        // Remove existing visualization
        if (pathData.line) {
            this.pathsContainer.remove(pathData.line);
            pathData.line = null;
        }
        
        if (pathData.points.length < 2) return;
        
        // Create or update the curve
        pathData.curve = this.createCurve(pathData.points);
        
        // Sample the curve to create a smooth path
        const points = pathData.curve.getPoints(Math.max(50, pathData.points.length * 10));
        
        // Create the line geometry
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Create material with the assigned color
        const material = new THREE.LineBasicMaterial({
            color: pathData.color,
            linewidth: 2,
            linecap: 'round',
            linejoin: 'round'
        });
        
        // Create the line
        pathData.line = new THREE.Line(geometry, material);
        pathData.line.userData.objectUUID = object.uuid;
        this.pathsContainer.add(pathData.line);
    }
    
    updateCurrentPathVisualization() {
        if (this.currentPoints.length < 2) return;
        
        // Create a temporary curve
        const curve = this.createCurve(this.currentPoints);
        
        // Sample the curve
        const points = curve.getPoints(Math.max(50, this.currentPoints.length * 10));
        
        // Create or update the line geometry
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        if (this.currentPath) {
            this.currentPath.geometry.dispose();
            this.currentPath.geometry = geometry;
        } else {
            const material = new THREE.LineBasicMaterial({
                color: 0xffffff,
                opacity: 0.7,
                transparent: true,
                linewidth: 2
            });
            
            this.currentPath = new THREE.Line(geometry, material);
            this.pathsContainer.add(this.currentPath);
        }
    }
    
    togglePathEditing() {
        if (this.isDrawing) {
            this.cancelPathDrawing();
        }
        
        this.pathEditMode = !this.pathEditMode;
        
        const button = document.getElementById('edit-path-button');
        const statusIndicator = document.getElementById('path-status-indicator');
        
        if (this.pathEditMode) {
            if (!this.selectedObject) {
                alert("Please select an object first");
                this.pathEditMode = false;
                return;
            }
            
            const pathData = this.paths.get(this.selectedObject);
            if (!pathData) {
                alert("Selected object has no path to edit");
                this.pathEditMode = false;
                return;
            }
            
            // Enter edit mode
            button.textContent = 'Exit Edit Mode';
            button.style.background = '#5d5';
            statusIndicator.textContent = `Editing path for ${this.selectedObject.name || 'Selected Object'}`;
            
            // Create control points for editing
            this.createControlPoints(pathData.points);
            
            // Disable other controls while editing
            if (window.controls) {
                this.previousControlsState = window.controls.enabled;
                window.controls.enabled = false;
            }
            if (window.transformControls) {
                this.previousTransformState = window.transformControls.enabled;
                window.transformControls.enabled = false;
            }
            
            this.renderer.domElement.style.cursor = 'pointer';
        } else {
            this.exitEditMode();
        }
    }
    
    exitEditMode() {
        if (!this.pathEditMode) return;
        
        this.pathEditMode = false;
        
        // Update UI
        const button = document.getElementById('edit-path-button');
        button.textContent = 'Edit Path';
        button.style.background = '#444';
        
        const statusIndicator = document.getElementById('path-status-indicator');
        statusIndicator.textContent = 'Ready';
        
        // Remove control points
        this.removeControlPoints();
        
        // Re-enable controls
        if (window.controls && this.previousControlsState !== undefined) {
            window.controls.enabled = this.previousControlsState;
        }
        if (window.transformControls && this.previousTransformState !== undefined) {
            window.transformControls.enabled = this.previousTransformState;
        }
        
        this.renderer.domElement.style.cursor = 'default';
    }
    
    createControlPoints(points) {
        // Remove existing control points
        this.removeControlPoints();
        
        // Create new control points
        const geometry = new THREE.SphereGeometry(0.1, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        
        points.forEach((point) => {
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.copy(point);
            this.controlPoints.push(sphere);
            this.pathsContainer.add(sphere);
        });
    }
    
    removeControlPoints() {
        this.controlPoints.forEach((point) => {
            this.pathsContainer.remove(point);
            point.geometry.dispose();
            point.material.dispose();
        });
        
        this.controlPoints = [];
        this.selectedControlPoint = null;
    }
    
    playSelectedAnimation() {
        if (!this.selectedObject) {
            alert("Please select an object first");
            return;
        }
        
        this.playAnimation(this.selectedObject);
    }
    
    playAnimation(object) {
        const pathData = this.paths.get(object);
        if (!pathData || !pathData.curve) {
            alert(`No path found for ${object.name || 'selected object'}`);
            return;
        }
        
        // Stop any existing animation for this object
        if (this.animatingObjects.has(object)) {
            this.stopAnimation(object);
        }
        
        // Set up the animation data
        const animationData = {
            progress: 0,
            duration: 5, // seconds
            startPosition: object.position.clone(),
            startTime: this.clock.getElapsedTime()
        };
        
        this.animatingObjects.set(object, animationData);
        
        const statusIndicator = document.getElementById('path-status-indicator');
        statusIndicator.textContent = `Playing animation for ${object.name || 'Selected Object'}`;
    }
    
    stopAnimation(object) {
        if (this.animatingObjects.has(object)) {
            this.animatingObjects.delete(object);
        }
    }
    
    stopAllAnimations() {
        this.animatingObjects.clear();
        
        const statusIndicator = document.getElementById('path-status-indicator');
        statusIndicator.textContent = 'All animations stopped';
    }
    
    togglePathsList() {
        const modal = document.getElementById('paths-list-modal');
        
        if (modal.style.display === 'none' || modal.style.display === '') {
            this.updatePathsList();
            modal.style.display = 'block';
        } else {
            modal.style.display = 'none';
        }
    }
    
    editPath(object) {
        // Select the object
        if (window.selectObject) {
            window.selectObject(object);
        }
        
        // Enter edit mode
        this.pathEditMode = false; // Reset first to ensure toggle works
        this.togglePathEditing();
    }
    
    deletePath(object) {
        if (!this.paths.has(object)) return;
        
        const pathData = this.paths.get(object);
        
        // Remove visualization
        if (pathData.line) {
            this.pathsContainer.remove(pathData.line);
            pathData.line.geometry.dispose();
            pathData.line.material.dispose();
        }
        
        // Stop any active animation
        this.stopAnimation(object);
        
        // Remove from paths map
        this.paths.delete(object);
        
        const statusIndicator = document.getElementById('path-status-indicator');
        statusIndicator.textContent = `Path deleted for ${object.name || 'Selected Object'}`;
    }
    
    updateStatus() {
        const statusIndicator = document.getElementById('path-status-indicator');
        
        if (this.selectedObject) {
            const hasPath = this.paths.has(this.selectedObject);
            statusIndicator.textContent = hasPath ? 
                `Selected: ${this.selectedObject.name || 'Object'} (has path)` : 
                `Selected: ${this.selectedObject.name || 'Object'} (no path)`;
        } else {
            statusIndicator.textContent = 'No object selected';
        }
    }
    
    update(deltaTime) {
        // Update animations
        this.animatingObjects.forEach((animData, object) => {
            const pathData = this.paths.get(object);
            if (!pathData || !pathData.curve) return;
            
            const currentTime = this.clock.getElapsedTime();
            const elapsedTime = currentTime - animData.startTime;
            
            // Calculate progress along the curve (0 to 1)
            animData.progress = (elapsedTime % animData.duration) / animData.duration;
            
            // Get the position along the curve
            const position = pathData.curve.getPointAt(animData.progress);
            
            // Update object position
            object.position.copy(position);
            
            // Orient object to face tangent direction
            if (object.userData.followPathOrientation !== false) {
                const tangent = pathData.curve.getTangentAt(animData.progress);
                
                // Create a quaternion from the tangent
                const quaternion = new THREE.Quaternion();
                
                // Align the object's forward direction with the tangent
                const forward = new THREE.Vector3(0, 0, 1);
                quaternion.setFromUnitVectors(forward, tangent.normalize());
                
                // Apply the quaternion to the object
                object.quaternion.copy(quaternion);
            }
        });
    }
}

// Initialize and integrate the Path Animation System
function initPathAnimationSystem() {
    if (!window.pathAnimator) {
        window.pathAnimator = new PathAnimationSystem(scene, camera, renderer);
        
        // Add to the existing animation loop
        const originalAnimate = window.animate;
        
        window.animate = function() {
            // Call the original animate function
            originalAnimate();
            
            // Update the path animator
            if (window.pathAnimator) {
                window.pathAnimator.update();
            }
        };
        
        console.log("Path Animation System initialized");
    }
}

// Add CSS Styles
function addPathAnimationStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #path-animation-container {
            transition: background 0.3s, opacity 0.3s;
        }
        
        #path-animation-container:hover {
            background: rgba(40, 40, 40, 0.9);
        }
        
        .hierarchy-item {
            position: relative;
            margin-bottom: 4px;
        }
        
        .hierarchy-line {
            position: absolute;
            width: 2px;
            background: #555;
            top: 0;
            bottom: 0;
            z-index: 1;
        }
        
        .hierarchy-connector {
            position: absolute;
            height: 2px;
            background: #555;
            top: 50%;
            z-index: 1;
        }
        
        .hierarchy-context-menu {
            position: absolute;
            background: rgba(40, 40, 40, 0.95);
            border-radius: 4px;
            padding: 5px 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
            z-index: 2000;
            min-width: 150px;
        }
        
        .context-menu-item {
            padding: 8px 12px;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .context-menu-item:hover {
            background: rgba(60, 60, 60, 0.7);
        }
        
        .drop-indicator {
            position: absolute;
            height: 2px;
            background: #5d5;
            left: 0;
            right: 0;
            z-index: 10;
        }
        
        .drop-target {
            background: rgba(100, 220, 100, 0.2);
        }
        
        .search-match {
            background: rgba(255, 255, 100, 0.2);
        }
    `;
    
    document.head.appendChild(style);
}

// Initialize the Path Animation System when the document is ready

function integratePathAnimationSystem() {
    // Ensure this runs after the scene is initialized
    if (!window.scene || !window.camera || !window.renderer) {
        console.warn("Scene not fully initialized yet, waiting...");
        setTimeout(integratePathAnimationSystem, 500);
        return;
    }
    
    // Initialize the path animation system
    if (!window.pathAnimator) {
        window.pathAnimator = new PathAnimationSystem(window.scene, window.camera, window.renderer);
        console.log("Path Animation System initialized");
        
        // Register the update function in the animation loop
        const originalAnimateFunction = window.animate;
        
        window.animate = function() {
            // Call original animate function first
            if (typeof originalAnimateFunction === 'function') {
                originalAnimateFunction();
            }
            
            // Then update our path animations
            if (window.pathAnimator) {
                window.pathAnimator.update();
            }
        };
        
        // Add to the hierarchy update if it exists
        if (typeof updateHierarchy === 'function') {
            const originalUpdateHierarchy = window.updateHierarchy;
            
            window.updateHierarchy = function() {
                // Call original function
                if (typeof originalUpdateHierarchy === 'function') {
                    originalUpdateHierarchy();
                }
                
                // Update path animation status if object selected
                if (window.pathAnimator && window.selectedObject) {
                    window.pathAnimator.updateStatus();
                }
            };
        }
    }
}

// Add this to the init function
const originalInit = window.init;
window.init = function() {
    // Call the original init function
    if (typeof originalInit === 'function') {
        originalInit();
    }
    
    // Add our path animation system initialization
    setTimeout(integratePathAnimationSystem, 1000);
};

// If init has already run, initialize the path system directly
if (window.scene && window.camera && window.renderer) {
    integratePathAnimationSystem();
}

document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.getElementById('toggleContainerButton');
    const statusIndicator = document.getElementById('toggle-status');
    const iconPath = statusIndicator.querySelector('#icon-path');
    let isVisible = false;  // Set initial state to hidden

    // Icons for the 'show' and 'hide' states
    const showIcon = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2z";  // Show Icon
    const hideIcon = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-3h-2v-6h2z";  // Hide Icon

    // Function to update the icon based on visibility
    function updateIcon(isVisible) {
        if (isVisible) {
            iconPath.setAttribute('d', showIcon);
        } else {
            iconPath.setAttribute('d', hideIcon);
        }
    }

    // Function to show a temporary status message
    function showStatusMessage(message) {
        statusIndicator.textContent = message;  // Update message content
        statusIndicator.classList.add('visible');  // Show the status message
        setTimeout(() => {
            statusIndicator.classList.remove('visible');  // Hide after 2 seconds
        }, 2000);
    }

    // Toggle button click event
    toggleButton.addEventListener('click', function() {
        const container = document.getElementById('path-animation-container');
        if (!container) {
            console.error('Path animation container not found');
            return;
        }

        isVisible = !isVisible;  // Toggle visibility state
        if (isVisible) {
            container.classList.remove('hidden');
            showStatusMessage('Animation Panel Shown');
        } else {
            container.classList.add('hidden');
            showStatusMessage('Animation Panel Hidden');
        }

        updateIcon(isVisible);  // Update the icon when toggled
    });

    // Add keyboard shortcut (Alt + P) to toggle the panel
    document.addEventListener('keydown', function(event) {
        if (event.altKey && event.key.toLowerCase() === 'p') {
            toggleButton.click();
            event.preventDefault();
        }
    });

    // Observer to ensure the container exists and is initialized
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                const container = document.getElementById('path-animation-container');
                if (container && !container.dataset.initialized) {
                    container.dataset.initialized = 'true';
                    if (!isVisible) {
                        container.classList.add('hidden');
                    }
                }
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});
