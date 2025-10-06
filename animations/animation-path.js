/**
 * @file path_animation_system.js
 * Implements the PathAnimationSystem class for creating, editing, and animating
 * Three.js objects along Catmull-Rom curves.
 *
 * NOTE: This system relies on global variables defined in app.js or timeline.js
 * (e.g., THREE, scene, camera, renderer, currentTime, controls, keyframes, playAnimation, bakePathToKeyframes).
 */

class PathAnimationSystem {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.paths = new Map();
        this.selectedObject = null;
        
        this.isDrawing = false;
        this.currentPath = null;
        this.previewLine = null;
        this.currentPoints = [];
        
        this.pathColors = [0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0xffff00, 0x00ffff];
        this.colorIndex = 0;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.animatingObjects = new Map();
        this.isPaused = false;
        
        this.pathEditMode = false;
        this.controlPoints = [];
        this.selectedControlPoint = null;
        
        this.pathsContainer = new THREE.Group();
        this.pathsContainer.name = "Animation Paths";
        this.scene.add(this.pathsContainer);
        
        this.previousControlsState = true;
        this.previousTransformState = true; 

        this.initUI();
        this.setupEventListeners();
    }

    // --- UI Initialization ---

    initUI() {
        const container = document.createElement('div');
        container.id = 'path-animation-container';
        container.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; background: rgba(30, 30, 30, 0.8);
            border-radius: 8px; padding: 10px; color: white; font-family: Arial, sans-serif;
            z-index: 1000; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            transition: background 0.3s;
        `;
        container.addEventListener('mouseenter', () => container.style.background = 'rgba(40, 40, 40, 0.9)');
        container.addEventListener('mouseleave', () => container.style.background = 'rgba(30, 30, 30, 0.8)');
        
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `display: flex; gap: 10px; margin-bottom: 10px;`;
        
        const drawButton = this.createButton('Draw Path', () => this.togglePathDrawing());
        drawButton.id = 'draw-path-button';
        const editButton = this.createButton('Edit Path', () => this.togglePathEditing());
        editButton.id = 'edit-path-button';
        const playButton = this.createButton('Play Animation', () => this.playSelectedAnimation());
        playButton.id = 'play';
        const stopButton = this.createButton('Stop All', () => this.stopAllAnimations());
        stopButton.id = 'stop-animations-button';
        const showPathsButton = this.createButton('Show Paths List', () => this.togglePathsList());
        showPathsButton.id = 'show-paths-button';
        
        buttonsContainer.appendChild(drawButton);
        buttonsContainer.appendChild(editButton);
        buttonsContainer.appendChild(playButton);
        buttonsContainer.appendChild(stopButton);
        buttonsContainer.appendChild(showPathsButton);
        
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'path-status-indicator';
        statusIndicator.style.cssText = `padding: 5px; margin-top: 5px; border-radius: 4px; text-align: center; font-size: 14px; background: #333;`;
        statusIndicator.textContent = 'Ready';
        
        container.appendChild(buttonsContainer);
        container.appendChild(statusIndicator);
        this.createPathsListModal();
        
        // Handle external toggle button state
        const toggleButton = document.getElementById('toggleContainerButton');
        if (toggleButton) {
            container.classList.add('hidden');
        }

        document.body.appendChild(container);
    }
    
    createButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            background: #444; border: none; color: white; padding: 8px 12px;
            border-radius: 4px; cursor: pointer; transition: background 0.2s; font-size: 14px;`;
        button.addEventListener('click', onClick);
        button.addEventListener('mouseenter', () => { button.style.background = '#555'; });
        button.addEventListener('mouseleave', () => { button.style.background = '#444'; });
        return button;
    }

    createPathsListModal() {
        const modal = document.createElement('div');
        modal.id = 'paths-list-modal';
        modal.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(40, 40, 40, 0.95); border-radius: 8px; padding: 20px;
            color: white; font-family: Arial, sans-serif; z-index: 2000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); min-width: 400px;
            max-height: 80vh; overflow-y: auto; display: none;`;
            
        const header = document.createElement('div');
        header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #555; padding-bottom: 10px;`;
        
        const title = document.createElement('h3');
        title.textContent = 'Animation Paths';
        title.style.margin = '0';
        
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `background: none; border: none; color: white; font-size: 24px; cursor: pointer;`;
        closeButton.addEventListener('click', () => { modal.style.display = 'none'; });
        
        header.appendChild(title);
        header.appendChild(closeButton);
        
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
            container.innerHTML = `<p style="text-align: center; color: #aaa;">No animation paths created yet.</p>`;
            return;
        }
        
        this.paths.forEach((pathData, object) => {
            const pathItem = document.createElement('div');
            pathItem.style.cssText = `background: rgba(60, 60, 60, 0.7); border-radius: 4px; padding: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;`;
            
            const colorIndicator = document.createElement('div');
            colorIndicator.style.cssText = `width: 15px; height: 15px; border-radius: 50%; background-color: #${pathData.color.toString(16).padStart(6, '0')}; margin-right: 10px;`;
            
            const objectInfo = document.createElement('div');
            objectInfo.style.flex = '1';
            objectInfo.innerHTML = `<div style="font-weight: bold;">${object.name || `Object_${object.uuid.substring(0, 8)}`}</div><div style="font-size: 12px; color: #aaa;">${pathData.points.length} control points</div>`;
            
            const actions = document.createElement('div');
            actions.style.cssText = `display: flex; gap: 8px;`;
            
            const createActionBtn = (text, onClick, color = '#444') => {
                const btn = this.createButton(text, onClick);
                btn.style.padding = '5px 10px';
                btn.style.fontSize = '12px';
                btn.style.background = color;
                return btn;
            };
            
            actions.appendChild(createActionBtn('Play', () => { this.playAnimation(object); document.getElementById('paths-list-modal').style.display = 'none'; }));
            actions.appendChild(createActionBtn('Edit', () => { this.editPath(object); document.getElementById('paths-list-modal').style.display = 'none'; }));
            actions.appendChild(createActionBtn('Delete', () => { this.deletePath(object); this.updatePathsList(); }, '#993333'));
            
            pathItem.appendChild(colorIndicator);
            pathItem.appendChild(objectInfo);
            pathItem.appendChild(actions);
            container.appendChild(pathItem);
        });
    }

    setupEventListeners() {
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event), false);
        canvas.addEventListener('pointermove', (event) => this.onPointerMove(event), false);
        canvas.addEventListener('pointerup', (event) => this.onPointerUp(event), false);

        if (typeof window.selectObject === 'function') {
            const originalSelectObject = window.selectObject;
            window.selectObject = (object) => {
                this.selectedObject = object;
                originalSelectObject(object);
                this.updateStatus();
            };
        } else if (typeof window.selectedObject !== 'undefined') {
            this.selectedObject = window.selectedObject;
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (this.isDrawing) this.cancelPathDrawing();
                if (this.pathEditMode) this.exitEditMode();
            }
        });
    }

    updateMouse(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    onPointerDown(event) {
        if (!this.isDrawing && !this.pathEditMode) return;
        this.updateMouse(event);
        
        if (this.pathEditMode) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.controlPoints);
            
            if (intersects.length > 0) {
                this.selectedControlPoint = intersects[0].object;
                this.setExternalControlsEnabled(false);
                this.renderer.domElement.style.cursor = 'grabbing';
            }
        } else if (this.isDrawing) {
            const planeIntersect = this.getPlaneIntersection();
            if (planeIntersect) {
                this.currentPoints.push(planeIntersect.clone());
                this.updateCurrentPathVisualization();
            }
        }
    }

    onPointerMove(event) {
        this.updateMouse(event);
        
        if (this.pathEditMode && this.selectedControlPoint) {
            const planeIntersect = this.getPlaneIntersection();
            if (planeIntersect) {
                this.selectedControlPoint.position.copy(planeIntersect);
                const pathData = this.paths.get(this.selectedObject);
                
                if (pathData) {
                    const index = this.controlPoints.indexOf(this.selectedControlPoint);
                    if (index !== -1) {
                        pathData.points[index].copy(planeIntersect);
                        this.updatePathVisualization(this.selectedObject, pathData);
                    }
                }
            }
        } else if (this.isDrawing && this.currentPoints.length > 0) {
            const planeIntersect = this.getPlaneIntersection();
            if (planeIntersect) {
                const lastPoint = this.currentPoints[this.currentPoints.length - 1];
                const positions = new Float32Array([...lastPoint.toArray(), ...planeIntersect.toArray()]);
                
                if (!this.previewLine) {
                    const geometry = new THREE.BufferGeometry();
                    const material = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.2, gapSize: 0.1 });
                    this.previewLine = new THREE.Line(geometry, material);
                    this.pathsContainer.add(this.previewLine);
                }
                this.previewLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                this.previewLine.computeLineDistances();
                this.previewLine.geometry.attributes.position.needsUpdate = true;
            }
        }
    }

    onPointerUp(event) {
        if (this.pathEditMode) {
            this.selectedControlPoint = null;
            this.setExternalControlsEnabled(true);
            this.renderer.domElement.style.cursor = 'pointer';
        }
    }

    getPlaneIntersection() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const planeNormal = new THREE.Vector3().subVectors(this.camera.position, this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()))).normalize();
        const plane = new THREE.Plane();
        
        let referencePoint = new THREE.Vector3(0, 0, 0);
        if (this.selectedObject) {
            referencePoint = this.selectedObject.position;
        } else if (this.currentPoints.length > 0) {
            referencePoint = this.currentPoints[this.currentPoints.length - 1];
        }
        
        plane.setFromNormalAndCoplanarPoint(planeNormal, referencePoint);
        
        const intersection = new THREE.Vector3();
        return this.raycaster.ray.intersectPlane(plane, intersection) ? intersection : null;
    }
    
    setExternalControlsEnabled(enabled) {
        if (window.controls) {
            if (enabled) {
                window.controls.enabled = this.previousControlsState ?? true;
            } else {
                this.previousControlsState = window.controls.enabled;
                window.controls.enabled = false;
            }
        }
        if (window.transformControls) {
             if (enabled) {
                window.transformControls.enabled = this.previousTransformState ?? true;
            } else {
                this.previousTransformState = window.transformControls.enabled;
                window.transformControls.enabled = false;
            }
        }
    }

    togglePathDrawing() {
        if (this.pathEditMode) this.exitEditMode();
        if (!this.selectedObject) {
            alert("Please select an object first");
            return;
        }
        
        this.isDrawing = !this.isDrawing;
        const button = document.getElementById('draw-path-button');
        const statusIndicator = document.getElementById('path-status-indicator');
        
        if (this.isDrawing) {
            button.textContent = 'Finish Path';
            button.style.background = '#28a745';
            statusIndicator.textContent = `Drawing path for ${this.selectedObject.name || 'Selected Object'}`;
            this.currentPoints = [];
            this.setExternalControlsEnabled(false);
            this.renderer.domElement.style.cursor = 'crosshair';
        } else {
            button.textContent = 'Draw Path';
            button.style.background = '#444';
            this.finishPath();
            this.setExternalControlsEnabled(true);
            this.renderer.domElement.style.cursor = 'default';
        }
    }
    
    finishPath() {
        if (this.previewLine) {
            this.pathsContainer.remove(this.previewLine);
            this.previewLine.geometry.dispose();
            this.previewLine.material.dispose();
            this.previewLine = null;
        }
        if (this.currentPath) {
             this.pathsContainer.remove(this.currentPath);
             this.currentPath.geometry.dispose();
             this.currentPath.material.dispose();
             this.currentPath = null;
        }
        
        if (this.currentPoints.length < 2) {
            this.cancelPathDrawing(true);
            return;
        }
        
        const pathData = {
            points: [...this.currentPoints],
            color: this.pathColors[this.colorIndex++ % this.pathColors.length],
            curve: null,
            line: null,
            duration: 5 // Default duration
        };
        
        this.paths.set(this.selectedObject, pathData);
        this.updatePathVisualization(this.selectedObject, pathData);
        this.currentPoints = [];
        document.getElementById('path-status-indicator').textContent = `Path created for ${this.selectedObject.name || 'Selected Object'}`;
        this.updatePathsList();
    }
    
    cancelPathDrawing(isSilent = false) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        if (this.previewLine) {
            this.pathsContainer.remove(this.previewLine);
            this.previewLine.geometry.dispose();
            this.previewLine.material.dispose();
            this.previewLine = null;
        }
        if (this.currentPath) {
             this.pathsContainer.remove(this.currentPath);
             this.currentPath.geometry.dispose();
             this.currentPath.material.dispose();
             this.currentPath = null;
        }
        
        this.currentPoints = [];
        const button = document.getElementById('draw-path-button');
        button.textContent = 'Draw Path';
        button.style.background = '#444';
        
        if (!isSilent) {
            document.getElementById('path-status-indicator').textContent = 'Path drawing cancelled';
        }
        this.setExternalControlsEnabled(true);
        this.renderer.domElement.style.cursor = 'default';
    }
    
    createCurve(points) {
        if (points.length < 2) return null;
        return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
    }
    
    updatePathVisualization(object, pathData) {
        if (pathData.line) {
            this.pathsContainer.remove(pathData.line);
            pathData.line.geometry.dispose();
            pathData.line.material.dispose();
            pathData.line = null;
        }
        if (pathData.points.length < 2) return;
        
        pathData.curve = this.createCurve(pathData.points);
        if (!pathData.curve) return;
        
        const points = pathData.curve.getPoints(pathData.points.length * 10);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: pathData.color });
        pathData.line = new THREE.Line(geometry, material);
        pathData.line.userData.objectUUID = object.uuid;
        this.pathsContainer.add(pathData.line);
    }
    
    updateCurrentPathVisualization() {
        if (this.currentPath) {
            this.pathsContainer.remove(this.currentPath);
            this.currentPath.geometry.dispose();
            this.currentPath.material.dispose();
            this.currentPath = null;
        }
        if (this.currentPoints.length < 2) return;
        
        const curve = this.createCurve(this.currentPoints);
        if (!curve) return;
        
        const points = curve.getPoints(this.currentPoints.length * 10);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.7, transparent: true });
        this.currentPath = new THREE.Line(geometry, material);
        this.pathsContainer.add(this.currentPath);
    }
    
    togglePathEditing() {
        if (this.isDrawing) this.cancelPathDrawing();
        this.pathEditMode = !this.pathEditMode;
        const button = document.getElementById('edit-path-button');
        
        if (this.pathEditMode) {
            if (!this.selectedObject || !this.paths.has(this.selectedObject)) {
                alert("Please select an object with a path to edit.");
                this.pathEditMode = false;
                return;
            }
            button.textContent = 'Finish Editing';
            button.style.background = '#28a745';
            document.getElementById('path-status-indicator').textContent = `Editing path for ${this.selectedObject.name || 'Selected Object'}`;
            this.createControlPoints(this.paths.get(this.selectedObject).points);
            this.setExternalControlsEnabled(false);
            this.renderer.domElement.style.cursor = 'pointer';
        } else {
            this.exitEditMode();
        }
    }
    
    exitEditMode() {
        if (!this.pathEditMode) return;
        this.pathEditMode = false;
        document.getElementById('edit-path-button').textContent = 'Edit Path';
        document.getElementById('edit-path-button').style.background = '#444';
        document.getElementById('path-status-indicator').textContent = 'Ready';
        this.removeControlPoints();
        this.setExternalControlsEnabled(true);
        this.renderer.domElement.style.cursor = 'default';
        this.updatePathsList();
    }
    
    createControlPoints(points) {
        this.removeControlPoints();
        const geometry = new THREE.SphereGeometry(this.camera.position.length() * 0.05, 16, 16); 
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        
        points.forEach(point => {
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.copy(point);
            this.controlPoints.push(sphere);
            this.pathsContainer.add(sphere);
        });
    }
    
    removeControlPoints() {
        this.controlPoints.forEach(point => {
            this.pathsContainer.remove(point);
            point.geometry.dispose();
            point.material.dispose();
        });
        this.controlPoints = [];
        this.selectedControlPoint = null;
    }
    
    editPath(object) {
        if (window.selectObject) window.selectObject(object);
        else this.selectedObject = object;
        
        if (!this.pathEditMode || this.selectedObject !== object) {
            this.togglePathEditing();
        }
    }

    deletePath(object) {
        if (!this.paths.has(object)) return;
        const pathData = this.paths.get(object);
        
        if (pathData.line) {
            this.pathsContainer.remove(pathData.line);
            pathData.line.geometry.dispose();
            pathData.line.material.dispose();
        }
        this.stopAnimation(object);
        this.paths.delete(object);
        
        // Ensure associated keyframes are removed
        if (typeof keyframes !== 'undefined' && keyframes.has(object.uuid)) {
            keyframes.delete(object.uuid);
            if (typeof updateKeyframesUI === 'function') updateKeyframesUI();
            if (typeof updateLayersUI === 'function') updateLayersUI();
        }

        document.getElementById('path-status-indicator').textContent = `Path deleted for ${object.name || 'Selected Object'}`;
        this.updatePathsList();
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

    updateStatus() {
        const statusIndicator = document.getElementById('path-status-indicator');
        if (this.isDrawing || this.pathEditMode) return;
        if (this.selectedObject) {
            const hasPath = this.paths.has(this.selectedObject);
            statusIndicator.textContent = `Selected: ${this.selectedObject.name || 'Object'} (${hasPath ? 'has path' : 'no path'})`;
        } else {
            statusIndicator.textContent = 'No object selected';
        }
    }
    
    // --- Animation Playback Hooks ---

    playSelectedAnimation() {
        if (!this.selectedObject) {
            alert("Please select an object first");
            return;
        }
        // Calls the method injected by initializePathAnimationSystem
        this.hookedPlayAnimation(this.selectedObject);
    }

    // Placeholder for the critical hook logic injected in initPathAnimationSystem
    hookedPlayAnimation(object) {
        console.error("Path system not correctly initialized! Missing baking hook.");
    }
    
    playAnimation(object) {
        this.hookedPlayAnimation(object);
    }

    stopAnimation(object) {
        if (this.animatingObjects.has(object)) {
            this.animatingObjects.delete(object);
        }
    }

    stopAllAnimations() {
        this.animatingObjects.clear();
        this.isPaused = false;
        document.getElementById('path-status-indicator').textContent = 'All animations stopped';
        // Trigger global stop
        if (typeof stopAnimation === 'function') {
            stopAnimation();
        }
    }

    pauseAllAnimations() { this.isPaused = true; }
    resumeAllAnimations() { this.isPaused = false; }


    /**
     * Update function for rendering paths. 
     * Acts as a fallback, but is primarily needed so the timeline's stop/pause logic 
     * (which calls this system's pause/resume/stop methods) is respected.
     */
    update(deltaTime) {
        if (this.isPaused) return;

        if (typeof isPlaying !== 'undefined' && !isPlaying) return;
        
        const time = window.currentTime || 0; 
        if (this.animatingObjects.size === 0) return;

        this.animatingObjects.forEach((animData, object) => {
            // Check if keyframes exist (meaning it was successfully baked)
            const objectKeyframes = (typeof keyframes !== 'undefined') ? keyframes.get(object.uuid) : null;
            if (objectKeyframes && Object.keys(objectKeyframes).length > 0) {
                return; // The timeline is controlling this object.
            }
            
            // --- FALLBACK (Only executes if object has no keyframes) ---
            const pathData = this.paths.get(object);
            if (!pathData || !pathData.curve) return;
            
            let progress = time / (pathData.duration || 5); 
            if (progress > 1.0) progress = progress % 1.0; 
            
            const position = pathData.curve.getPointAt(progress);
            const tangent = pathData.curve.getTangentAt(progress);
            
            object.position.copy(position);
            
            if (object.userData.followPathOrientation !== false) {
                const lookAtPosition = new THREE.Vector3().addVectors(position, tangent);
                object.lookAt(lookAtPosition);
            }
        });
    }
}

// --- Global Integration Setup ---

function initializePathAnimationSystem(scene, camera, renderer) {
    // FIX: Check if the required THREE components are loaded first.
    if (typeof THREE === 'undefined' || typeof THREE.CatmullRomCurve3 === 'undefined') {
         console.error("PathAnimationSystem: THREE.js components required are missing.");
         return;
    }

    if (window.pathAnimator) return;
    
    // 1. Create the PathAnimationSystem instance
    window.pathAnimator = new PathAnimationSystem(scene, camera, renderer);
    
    // 2. Inject the critical baking/playing logic into the PathAnimator instance
    window.pathAnimator.hookedPlayAnimation = function(object) {
        if (typeof bakePathToKeyframes !== 'function' || typeof playAnimation !== 'function') {
             console.error("Path System: Timeline integration functions (bakePathToKeyframes, playAnimation) are missing. Ensure timeline.js is loaded and initialized.");
             return;
        }
        
        const pathData = this.paths.get(object);
        if (!pathData || !pathData.curve) {
             alert(`No path found for ${object.name || 'selected object'}`);
             return;
        }

        const duration = pathData.duration || 5; 

        // A. Perform the baking (Creates keyframes in the global `keyframes` map)
        bakePathToKeyframes(object, pathData, duration);
        
        // B. Update Global State
        window.selectedObject = object;
        if (typeof transformControls !== 'undefined') transformControls.attach(object);
        
        // C. Sync Timeline
        window.currentTime = 0;
        if (typeof updatePlayhead === 'function') updatePlayhead();
        if (typeof updateTimeDisplay === 'function') updateTimeDisplay();

        // D. Mark as animating and start global playback
        this.animatingObjects.set(object, { progress: 0, duration: duration });
        document.getElementById('path-status-indicator').textContent = `Path baked and playing for ${object.name}`;
        
        playAnimation(); // Start global timeline playback
    };
    
    console.log("Path Animation System initialized and hooked into timeline.");
    return window.pathAnimator;
}

// Global exposure
window.PathAnimationSystem = PathAnimationSystem;
window.initializePathAnimationSystem = initializePathAnimationSystem; // Use the standard name

// --- Toggle Button DOM Setup (Keep this at the end as you provided) ---
document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.getElementById('toggleContainerButton');
    const animationContainer = document.getElementById('path-animation-container');
    const iconPath = document.getElementById('icon-path');

    if (!toggleButton || !animationContainer || !iconPath) {
        // console.error("Required elements for toggle button not found.");
        return;
    }

    const showIconPath = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2z";
    const hideIconPath = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-3h-2v-6h2z";
    
    animationContainer.classList.add('hidden');
    iconPath.setAttribute('d', hideIconPath);
    let isVisible = false;

    toggleButton.addEventListener('click', function() {
        isVisible = !isVisible;
        animationContainer.classList.toggle('hidden');

        if (isVisible) {
            iconPath.setAttribute('d', showIconPath);
        } else {
            iconPath.setAttribute('d', hideIconPath);
        }
    });
});

/**
 * Converts a path animation into timeline keyframes.
 * Samples the path at regular intervals and creates keyframes for the root object.
 */
function bakePathToKeyframes(object, pathData, duration = 5, samplesPerSecond = 30) {
    if (!pathData || !pathData.curve) {
        console.warn("Cannot bake path: invalid path data");
        return;
    }
    
    const objectKeyframes = {};
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    
    // Ensure the animation target is identified (usually the object root)
    const animationTarget = object.userData.animationTarget || object;
    
    // Sample the path curve at regular intervals
    for (let i = 0; i <= totalSamples; i++) {
        const progress = i / totalSamples;
        const time = progress * duration;
        const frame = Math.round(time * fps);
        
        // 1. Calculate path position (for the root)
        const pathPosition = pathData.curve.getPointAt(progress);
        
        // 2. Calculate path rotation (for the root)
        let rotation = animationTarget.quaternion.clone();
        if (object.userData.followPathOrientation !== false) {
            const tangent = pathData.curve.getTangentAt(progress);
            const lookAtPosition = new THREE.Vector3().addVectors(pathPosition, tangent);
            
            // To properly calculate the rotation along the path, we need a lookAt matrix
            const tempUp = animationTarget.up.clone(); 
            const tempMatrix = new THREE.Matrix4().lookAt(pathPosition, lookAtPosition, tempUp); 
            rotation.setFromRotationMatrix(tempMatrix);
        }
        
        // 3. Convert rotation to Euler for graph editor
        const euler = new THREE.Euler().setFromQuaternion(rotation, 'XYZ');
        
        const kfData = {
            time: time,
            position: pathPosition.clone(), 
            rotation: rotation.clone(),
            rotationEuler: { x: euler.x, y: euler.y, z: euler.z },
            scale: animationTarget.scale.clone(),
            interpolation: 'bezier' 
        };
        
        // Initialize bezier handles (Important: even baked linear curves benefit from handles for manual tweaks)
        graphChannels.forEach(channel => {
            kfData[`handleIn_${channel.name}_x`] = -DEFAULT_BEZIER_HANDLE_X_OFFSET;
            kfData[`handleIn_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
            kfData[`handleOut_${channel.name}_x`] = DEFAULT_BEZIER_HANDLE_X_OFFSET;
            kfData[`handleOut_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
        });
        
        objectKeyframes[frame] = kfData;
    }
    
    keyframes.set(object.uuid, objectKeyframes);
    
    if (duration > timelineDuration) {
        timelineDuration = duration;
        initializeTimelineScale();
    }
    
    updateKeyframesUI();
    updateLayersUI();
    
    console.log(`✅ Baked path animation for ${object.name || 'object'} into ${Object.keys(objectKeyframes).length} keyframes`);
}
