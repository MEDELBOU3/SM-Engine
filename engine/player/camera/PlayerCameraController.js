class SMPlayerCameraController {
    constructor({
        scene = window.scene,
        character = null,
        renderer = window.renderer,
        editorCamera = window.camera,
        config = window.SMPlayerConfig
    } = {}) {
        this.scene = scene;
        this.character = character;
        this.renderer = renderer;
        this.editorCamera = editorCamera;
        this.config = config || {};
        this.camera = null;
        this.active = false;
        this.yaw = 0;
        this.pitch = 0.18;
        this.distance = this.config.cameraDistance ?? 4.5;
        this.height = this.config.cameraHeight ?? 1.55;
        this.shoulderOffset = this.config.cameraShoulderOffset ?? 0.45;
        this.lookAhead = this.config.cameraLookAhead ?? 0.35;
        this.sensitivity = this.config.cameraSensitivity ?? 0.0025;
        this.smoothing = this.config.cameraSmoothing ?? 16;
        this.minPitch = this.config.cameraMinPitch ?? -0.35;
        this.maxPitch = this.config.cameraMaxPitch ?? 0.85;
        this.dragging = false;
        this.currentPosition = new THREE.Vector3();
        this.currentTarget = new THREE.Vector3();
        this.desiredPosition = new THREE.Vector3();
        this.desiredTarget = new THREE.Vector3();
        this.forward = new THREE.Vector3();
        this.right = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);
        this._initialized = false;
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onPointerLockChange = this._onPointerLockChange.bind(this);
        this._onResize = this._onResize.bind(this);
        this._createCamera();
        this._bindEvents();
    }
    _createCamera() {
        const canvas = this.renderer?.domElement;
        const width = Math.max(1, canvas?.clientWidth || window.innerWidth);
        const height = Math.max(1, canvas?.clientHeight || window.innerHeight);
        this.camera = new THREE.PerspectiveCamera(
            this.config.playerCameraFov ?? 65,
            width / height,
            this.config.playerCameraNear ?? 0.05,
            this.config.playerCameraFar ?? 1500
        );
        this.camera.name = 'SMPlayerCamera';
        this.camera.userData = {
            isPlayerCamera: true,
            isRuntimeCamera: true,
            isSystemObject: true,
            ignoreInHierarchy: true,
            ignoreInTimeline: true,
            excludeFromNanite: true,
            workspaceOnly: 'PLAYER'
        };
        this.scene?.add?.(this.camera);
        window.SMPlayerCamera = this.camera;
    }
    _bindEvents() {
        const canvas = this.renderer?.domElement;
        if (canvas) {
            canvas.addEventListener('mousemove', this._onMouseMove);
            canvas.addEventListener('mousedown', this._onMouseDown);
            canvas.addEventListener('mouseup', this._onMouseUp);
        }
        document.addEventListener('pointerlockchange', this._onPointerLockChange);
        window.addEventListener('resize', this._onResize);
    }
    _onMouseDown(event) {
        if (!this.active) return;
        if (event.button === 2) {
            this.dragging = true;
        }
    }
    _onMouseUp(event) {
        if (event.button === 2) {
            this.dragging = false;
        }
    }
    _onMouseMove(event) {
        if (!this.active) return;
        const canvas = this.renderer?.domElement;
        const pointerLocked =
            document.pointerLockElement === canvas;
        if (!pointerLocked && !this.dragging) return;
        this.yaw -= event.movementX * this.sensitivity;
        this.pitch -= event.movementY * this.sensitivity;
        this.pitch = THREE.MathUtils.clamp(
            this.pitch,
            this.minPitch,
            this.maxPitch
        );
    }
    _onPointerLockChange() {
        if (!this.active) return;
    }
    _onResize() {
        if (!this.camera) return;
        const canvas = this.renderer?.domElement;
        const width = Math.max(1, canvas?.clientWidth || window.innerWidth);
        const height = Math.max(1, canvas?.clientHeight || window.innerHeight);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
    _syncInitialYaw() {
        const root = this.character?.model;
        if (!root) return;
        const visualOffset =
            Number(this.config.visualYawOffset) || 0;
        this.yaw = root.rotation.y + visualOffset;
    }
    _getPlayerTarget() {
        const root = this.character?.model;
        if (!root) return null;
        const target = this.desiredTarget;
        target.copy(root.position);
        const characterHeight =
            this.character?.height ||
            this.config.targetHeight ||
            1.8;
        const targetHeight =
            Math.min(
                this.height,
                characterHeight * 0.82
            );
        target.y += targetHeight;
        return target;
    }
    update(delta) {
        if (!this.active || !this.camera) return;
        const root = this.character?.model;
        if (!root) return;
        const target = this._getPlayerTarget();
        if (!target) return;
        this.forward.set(
            Math.sin(this.yaw),
            0,
            Math.cos(this.yaw)
        ).normalize();
        this.right.crossVectors(
            this.up,
            this.forward
        ).normalize();
        const horizontalDistance =
            Math.cos(this.pitch) * this.distance;
        const verticalDistance =
            Math.sin(this.pitch) * this.distance;
        this.desiredPosition.copy(target);
        this.desiredPosition.addScaledVector(
            this.forward,
            -horizontalDistance
        );
        this.desiredPosition.addScaledVector(
            this.right,
            this.shoulderOffset
        );
        this.desiredPosition.y += verticalDistance;
        const lookTarget = this.desiredTarget;
        lookTarget.copy(target);
        lookTarget.addScaledVector(
            this.forward,
            this.lookAhead
        );
        if (!this._initialized) {
            this.currentPosition.copy(
                this.desiredPosition
            );
            this.currentTarget.copy(
                lookTarget
            );
            this._initialized = true;
        } else {
            const alpha =
                1 - Math.exp(
                    -this.smoothing * delta
                );
            this.currentPosition.lerp(
                this.desiredPosition,
                alpha
            );
            this.currentTarget.lerp(
                lookTarget,
                alpha
            );
        }
        this.camera.position.copy(
            this.currentPosition
        );
        this.camera.lookAt(
            this.currentTarget
        );
        this.camera.updateMatrixWorld(true);
    }
    activate({
        pointerLock = false
    } = {}) {
        if (!this.camera) {
            console.error('[PlayerCamera] Cannot activate: camera does not exist.');
            return false;
        }
        if (this.active) {
            window._playerCameraActive = true;
            window._playerCamera = this.camera;
            window._activeRenderCamera = this.camera;
            return true;
        }
        this.active = true;
        this._initialized = false;
        this._syncInitialYaw();
        window._playerCameraActive = true;
        window._playerCamera = this.camera;
        window._activeRenderCamera = this.camera;
        if (window.SMEngineRenderer) {
            window.SMEngineRenderer.activeRenderCamera = this.camera;
        }
        if (window.controls) {
            window.controls.enabled = false;
        }
        if (window.transformControls) {
            window.transformControls.visible = false;
        }
        if (pointerLock) {
            this.requestPointerLock();
        }
        window.dispatchEvent(
            new CustomEvent(
                'sm:player-camera-enter',
                {
                    detail: {
                        camera: this.camera
                    }
                }
            )
        );
        console.log('[PlayerCamera] Activated', {
            camera: this.camera.name,
            active: this.active,
            renderCamera: window._activeRenderCamera?.name
        });
        return true;
    }
    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.dragging = false;
        if (
            document.pointerLockElement ===
            this.renderer?.domElement
        ) {
            document.exitPointerLock?.();
        }
        window._playerCameraActive = false;
        if (window._playerCamera === this.camera) {
            window._playerCamera = null;
        }
        if (window._activeRenderCamera === this.camera) {
            window._activeRenderCamera = null;
        }
        if (
            window.controls &&
            !window._isInsideCamera
        ) {
            window.controls.object =
                this.editorCamera ||
                window.cameraSystem?.camera ||
                window.camera;
            window.controls.enabled = true;
            window.controls.update?.();
        }
        window.dispatchEvent(
            new CustomEvent(
                'sm:player-camera-exit',
                {
                    detail: {
                        camera: this.camera
                    }
                }
            )
        );
        console.log('[PlayerCamera] Deactivated');
    }
    requestPointerLock() {
        const canvas = this.renderer?.domElement;
        if (!canvas) return false;
        try {
            canvas.requestPointerLock?.();
            return true;
        } catch (error) {
            console.warn(
                '[PlayerCamera] Pointer lock failed:',
                error
            );
            return false;
        }
    }
    setDistance(distance) {
        this.distance = THREE.MathUtils.clamp(
            Number(distance) || 4.5,
            1,
            12
        );
    }
    setShoulderOffset(offset) {
        this.shoulderOffset = THREE.MathUtils.clamp(
            Number(offset) || 0,
            -2,
            2
        );
    }
    setFov(fov) {
        if (!this.camera) return;
        this.camera.fov = THREE.MathUtils.clamp(
            Number(fov) || 65,
            30,
            110
        );
        this.camera.updateProjectionMatrix();
    }
    getForward(target = new THREE.Vector3()) {
        if (!this.camera) {
            return target.set(0, 0, 1);
        }
        this.camera.getWorldDirection(target);
        target.y = 0;
        if (target.lengthSq() < 0.0001) {
            return target.set(0, 0, 1);
        }
        return target.normalize();
    }
    getRight(target = new THREE.Vector3()) {
        this.getForward(target);
        return target.set(
            -target.z,
            0,
            target.x
        ).normalize();
    }
    dispose() {
        this.deactivate();
        const canvas = this.renderer?.domElement;
        if (canvas) {
            canvas.removeEventListener(
                'mousemove',
                this._onMouseMove
            );
            canvas.removeEventListener(
                'mousedown',
                this._onMouseDown
            );
            canvas.removeEventListener(
                'mouseup',
                this._onMouseUp
            );
        }
        document.removeEventListener(
            'pointerlockchange',
            this._onPointerLockChange
        );
        window.removeEventListener(
            'resize',
            this._onResize
        );
        this.camera?.parent?.remove?.(
            this.camera
        );
        if (window.SMPlayerCamera === this.camera) {
            window.SMPlayerCamera = null;
        }
        this.camera = null;
    }
}
window.SMPlayerCameraController =
    SMPlayerCameraController;