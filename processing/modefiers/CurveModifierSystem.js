// ============================================
// CURVE MODIFIER SYSTEM (IMPROVED)
// ============================================
class CurveModifierSystem {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        // State
        this.targetObject = null;
        this.originalGeometry = null;
        this.curvePoints = [];
        this.curve = null;
        this.curveVisual = null;
        this.controlPointMeshes = [];
        this.isDrawingMode = false;
        this.isEditMode = false;
        this.selectedPoint = null;

        // Settings
        this.curveType = 'catmullrom';
        this.resolution = 50;
        this.twistAmount = 0;
        this.stretchToFit = true;
        this.followRotation = true;
        this.scaleAlongCurve = 1.0;

        // Raycaster for interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

        // Materials
        this.curveMaterial = new THREE.LineBasicMaterial({
            color: 0x4a9eff,
            linewidth: 3
        });
        this.pointMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00
        });
        this.selectedPointMaterial = new THREE.MeshBasicMaterial({
            color: 0xff00ff
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.renderer.domElement.addEventListener('click', this.onClick.bind(this));
        this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
    }

    setTargetObject(object) {
        if (!object || !object.geometry) {
            console.warn('Invalid object for curve modifier');
            return false;
        }

        this.targetObject = object;
        this.originalGeometry = object.geometry.clone();

        document.getElementById('status-dot').classList.add('active');
        document.getElementById('status-text').textContent = `Object: ${object.name || 'Unnamed'}`;

        return true;
    }

    startDrawing() {
        if (!this.targetObject) {
            alert('Please select an object first!');
            return;
        }

        this.isDrawingMode = true;
        this.isEditMode = false;
        this.curvePoints = [];
        this.clearVisuals();

        document.getElementById('curve-toolbar').classList.add('active');
        document.getElementById('instructions-overlay').classList.add('active');
        document.getElementById('btn-draw-curve').classList.add('active');
        document.getElementById('btn-edit-curve').classList.remove('active');
    }

    editMode() {
        if (this.curvePoints.length < 2) {
            alert('Create a curve first!');
            return;
        }

        this.isDrawingMode = false;
        this.isEditMode = true;

        document.getElementById('btn-edit-curve').classList.add('active');
        document.getElementById('btn-draw-curve').classList.remove('active');
        document.getElementById('curve-toolbar').classList.remove('active');
        document.getElementById('instructions-overlay').classList.remove('active');
    }

    onClick(event) {
        if (!this.isDrawingMode) return;

        this.updateMousePosition(event);

        // Cast ray to find 3D position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Use a ground plane for positioning
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(groundPlane, intersection);

        if (intersection) {
            this.addCurvePoint(intersection);
        }
    }

    addCurvePoint(position) {
        this.curvePoints.push(position.clone());

        // Create visual point
        const pointGeometry = new THREE.SphereGeometry(0.05, 16, 16);
        const pointMesh = new THREE.Mesh(pointGeometry, this.pointMaterial);
        pointMesh.position.copy(position);
        pointMesh.userData.isControlPoint = true;
        pointMesh.userData.pointIndex = this.curvePoints.length - 1;
        this.scene.add(pointMesh);
        this.controlPointMeshes.push(pointMesh);

        document.getElementById('point-count').textContent = this.curvePoints.length;

        if (this.curvePoints.length >= 2) {
            this.updateCurveVisual();
            this.applyDeformation();
        }
    }

    updateCurveVisual() {
        // Remove old curve visual
        if (this.curveVisual) {
            this.scene.remove(this.curveVisual);
        }

        if (this.curvePoints.length < 2) return;

        // Create curve based on type
        switch (this.curveType) {
            case 'catmullrom':
                this.curve = new THREE.CatmullRomCurve3(this.curvePoints);
                this.curve.tension = 0.5;
                break;
            case 'bezier':
                if (this.curvePoints.length === 2) {
                    this.curve = new THREE.LineCurve3(this.curvePoints[0], this.curvePoints[1]);
                } else if (this.curvePoints.length === 3) {
                    this.curve = new THREE.QuadraticBezierCurve3(
                        this.curvePoints[0],
                        this.curvePoints[1],
                        this.curvePoints[2]
                    );
                } else {
                    this.curve = new THREE.CubicBezierCurve3(
                        this.curvePoints[0],
                        this.curvePoints[1],
                        this.curvePoints[2],
                        this.curvePoints[3]
                    );
                }
                break;
            case 'linear':
                this.curve = new THREE.CatmullRomCurve3(this.curvePoints);
                this.curve.curveType = 'chordal';
                break;
        }

        // Create visual line
        const points = this.curve.getPoints(this.resolution);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.curveVisual = new THREE.Line(geometry, this.curveMaterial);
        this.scene.add(this.curveVisual);
    }

    applyDeformation() {
        if (!this.targetObject || !this.curve || this.curvePoints.length < 2) return;

        const geometry = this.targetObject.geometry;
        const positions = geometry.attributes.position;
        const originalPositions = this.originalGeometry.attributes.position;

        // Get bounding box of original mesh
        const bbox = new THREE.Box3().setFromBufferAttribute(originalPositions);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());

        const curveLength = this.curve.getLength();

        // Deform each vertex
        for (let i = 0; i < positions.count; i++) {
            const x = originalPositions.getX(i);
            const y = originalPositions.getY(i);
            const z = originalPositions.getZ(i);

            // Calculate position along curve (0 to 1)
            let t = (y - bbox.min.y) / size.y;

            if (!this.stretchToFit) {
                t = Math.min(1, (y - bbox.min.y) / curveLength);
            }

            t = Math.max(0, Math.min(1, t));

            // Get point on curve
            const curvePoint = this.curve.getPoint(t);
            const curveTangent = this.curve.getTangent(t);

            // Create rotation matrix to align with curve
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(up, curveTangent).normalize();
            const normal = new THREE.Vector3().crossVectors(curveTangent, binormal).normalize();

            // Apply twist
            const twist = (this.twistAmount * Math.PI / 180) * t;
            const cos = Math.cos(twist);
            const sin = Math.sin(twist);

            const rotatedNormal = normal.clone().multiplyScalar(cos).add(binormal.clone().multiplyScalar(sin));
            const rotatedBinormal = binormal.clone().multiplyScalar(cos).sub(normal.clone().multiplyScalar(sin));

            // Transform vertex
            const localX = (x - center.x) * this.scaleAlongCurve;
            const localZ = (z - center.z) * this.scaleAlongCurve;

            const newPos = curvePoint.clone();
            if (this.followRotation) {
                newPos.add(rotatedNormal.multiplyScalar(localX));
                newPos.add(rotatedBinormal.multiplyScalar(localZ));
            } else {
                newPos.x += localX;
                newPos.z += localZ;
            }

            positions.setXYZ(i, newPos.x, newPos.y, newPos.z);
        }

        positions.needsUpdate = true;
        geometry.computeVertexNormals();
    }

    updateMousePosition(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    onMouseMove(event) {
        if (!this.isEditMode) return;

        this.updateMousePosition(event);

        if (this.selectedPoint && this.isDragging) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const intersection = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(groundPlane, intersection);

            if (intersection) {
                const index = this.selectedPoint.userData.pointIndex;
                this.curvePoints[index].copy(intersection);
                this.selectedPoint.position.copy(intersection);
                this.updateCurveVisual();
                this.applyDeformation();
            }
        }
    }

    onMouseDown(event) {
        if (!this.isEditMode) return;

        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.controlPointMeshes);

        if (intersects.length > 0) {
            this.selectedPoint = intersects[0].object;
            this.selectedPoint.material = this.selectedPointMaterial;
            this.isDragging = true;
        }
    }

    onMouseUp() {
        if (this.selectedPoint) {
            this.selectedPoint.material = this.pointMaterial;
            this.selectedPoint = null;
        }
        this.isDragging = false;
    }

    onKeyDown(event) {
        if (this.isDrawingMode) {
            if (event.key === 'Enter') {
                this.finishDrawing();
            } else if (event.key === 'Escape') {
                this.cancelDrawing();
            } else if (event.key === 'z' && event.ctrlKey) {
                this.undoPoint();
            }
        }
    }

    finishDrawing() {
        if (this.curvePoints.length < 2) {
            alert('Add at least 2 points!');
            return;
        }

        this.isDrawingMode = false;
        document.getElementById('curve-toolbar').classList.remove('active');
        document.getElementById('instructions-overlay').classList.remove('active');
        document.getElementById('btn-draw-curve').classList.remove('active');

        console.log('Curve created with', this.curvePoints.length, 'points');
    }

    cancelDrawing() {
        this.isDrawingMode = false;
        this.clearVisuals();
        this.curvePoints = [];

        if (this.targetObject && this.originalGeometry) {
            this.targetObject.geometry = this.originalGeometry.clone();
        }

        document.getElementById('curve-toolbar').classList.remove('active');
        document.getElementById('instructions-overlay').classList.remove('active');
        document.getElementById('btn-draw-curve').classList.remove('active');
        document.getElementById('point-count').textContent = '0';
    }

    undoPoint() {
        if (this.curvePoints.length === 0) return;

        this.curvePoints.pop();

        const lastPoint = this.controlPointMeshes.pop();
        if (lastPoint) {
            this.scene.remove(lastPoint);
        }

        document.getElementById('point-count').textContent = this.curvePoints.length;

        if (this.curvePoints.length >= 2) {
            this.updateCurveVisual();
            this.applyDeformation();
        } else {
            if (this.curveVisual) {
                this.scene.remove(this.curveVisual);
                this.curveVisual = null;
            }
            if (this.targetObject && this.originalGeometry) {
                this.targetObject.geometry = this.originalGeometry.clone();
            }
        }
    }

    clearVisuals() {
        // Remove curve visual
        if (this.curveVisual) {
            this.scene.remove(this.curveVisual);
            this.curveVisual = null;
        }

        // Remove control points
        this.controlPointMeshes.forEach(mesh => {
            this.scene.remove(mesh);
        });
        this.controlPointMeshes = [];
    }

    clearCurve() {
        this.clearVisuals();
        this.curvePoints = [];
        this.curve = null;

        if (this.targetObject && this.originalGeometry) {
            this.targetObject.geometry = this.originalGeometry.clone();
        }

        document.getElementById('point-count').textContent = '0';
        this.isDrawingMode = false;
        this.isEditMode = false;

        document.getElementById('btn-draw-curve').classList.remove('active');
        document.getElementById('btn-edit-curve').classList.remove('active');
    }

    removeModifier() {
        this.clearCurve();
        this.targetObject = null;
        this.originalGeometry = null;

        document.getElementById('status-dot').classList.remove('active');
        document.getElementById('status-text').textContent = 'No object selected';

        closeCurveModifier();
    }

    applyModifierPermanent() {
        if (!this.targetObject || !this.curve) {
            alert('Create a curve first!');
            return;
        }

        // The current deformed geometry becomes the new base
        this.originalGeometry = this.targetObject.geometry.clone();
        alert('Modifier applied! The deformation is now permanent.');
    }

    updateSettings(settings) {
        if (settings.curveType !== undefined) {
            this.curveType = settings.curveType;
        }
        if (settings.resolution !== undefined) {
            this.resolution = settings.resolution;
        }
        if (settings.twistAmount !== undefined) {
            this.twistAmount = settings.twistAmount;
        }
        if (settings.stretchToFit !== undefined) {
            this.stretchToFit = settings.stretchToFit;
        }
        if (settings.followRotation !== undefined) {
            this.followRotation = settings.followRotation;
        }
        if (settings.scaleAlongCurve !== undefined) {
            this.scaleAlongCurve = settings.scaleAlongCurve;
        }

        if (this.curve && this.curvePoints.length >= 2) {
            this.updateCurveVisual();
            this.applyDeformation();
        }
    }
}

// ============================================
// GLOBAL INSTANCE & INTEGRATION
// ============================================

let curveModifierSystem = null;

// Initialize when scene is ready
function initCurveModifier(scene, camera, renderer) {
    curveModifierSystem = new CurveModifierSystem(scene, camera, renderer);
    window.curveModifierSystem = curveModifierSystem;
    console.log('✅ Curve Modifier System initialized');
}