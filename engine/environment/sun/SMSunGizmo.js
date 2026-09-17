// engine/environment/sun/SMSunGizmo.js
// SM Engine — compact professional Sun orbit gizmo.
//
// Editor-only layer 29.
// Visible when Sun Rig / Sun Light is selected.
// Drag the sun handle on the celestial sphere to edit azimuth/elevation.
(function () {
    'use strict';

    const GIZMO_LAYER = 29;

    const DEFAULTS = {
        radius: 6.0,
        ringSegments: 72,
        pathSegments: 48,

        ringOpacity: 0.38,
        pathOpacity: 0.55,

        handleRadius: 0.20,
        iconScale: 0.05,

        selectedOnly: true,

        // Unreal-style sun editing:
        // Hold Ctrl + L and drag anywhere in the viewport.
        ueDragSensitivity: 0.22,
        ueFineSensitivity: 0.055
    };

    function makeLineMaterial(
        color,
        opacity
    ) {
        return new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthTest: false,
            depthWrite: false
        });
    }

    function tagEditorObject(
        object,
        extra = {}
    ) {
        object.userData ||= {};

        Object.assign(
            object.userData,
            {
                isSystemObject: true,
                isEditorHelper: true,
                editorOnly: true,
                ignoreInHierarchy: true,
                ignoreInTimeline: true,
                excludeFromNanite: true,
                excludeFromStaticMerge: true,
                smSunGizmo: true,
                ...extra
            }
        );

        object.layers.set(
            GIZMO_LAYER
        );

        return object;
    }

    function createSunIconTexture() {
        const canvas =
            document.createElement(
                'canvas'
            );

        canvas.width =
            canvas.height =
            128;

        const ctx =
            canvas.getContext(
                '2d'
            );

        ctx.clearRect(
            0,
            0,
            128,
            128
        );

        ctx.strokeStyle =
            'rgba(255,206,92,1)';

        ctx.fillStyle =
            'rgba(255,174,46,0.98)';

        ctx.lineWidth =
            7;

        ctx.beginPath();

        ctx.arc(
            64,
            64,
            22,
            0,
            Math.PI * 2
        );

        ctx.fill();

        const rays = [
            [64, 10, 64, 28],
            [64, 100, 64, 118],
            [10, 64, 28, 64],
            [100, 64, 118, 64],
            [25, 25, 38, 38],
            [90, 90, 103, 103],
            [90, 38, 103, 25],
            [25, 103, 38, 90]
        ];

        ctx.beginPath();

        rays.forEach(ray => {
            ctx.moveTo(
                ray[0],
                ray[1]
            );

            ctx.lineTo(
                ray[2],
                ray[3]
            );
        });

        ctx.stroke();

        const texture =
            new THREE.CanvasTexture(
                canvas
            );

        texture.colorSpace =
            THREE.SRGBColorSpace;

        return texture;
    }

    class SMSunGizmo {
        constructor(options = {}) {
            this.options = {
                ...DEFAULTS,
                ...options
            };

            this.controller =
                null;

            this.root =
                null;

            this.compassRing =
                null;

            this.sunPath =
                null;

            this.directionLine =
                null;

            this.handle =
                null;

            this.icon =
                null;

            this.visible =
                false;

            this.dragging =
                false;

            // UE-style Ctrl+L drag state.
            this.ueOrbitDragging =
                false;

            this._keys = {
                ctrl: false,
                l: false,
                shift: false
            };

            this._ueDragStart = {
                x: 0,
                y: 0,
                azimuth: 0,
                elevation: 0
            };

            this._previousControlsEnabled =
                null;

            this._raycaster =
                new THREE.Raycaster();

            this._pointer =
                new THREE.Vector2();

            this._dragSphere =
                new THREE.Sphere(
                    new THREE.Vector3(),
                    this.options.radius
                );

            this._boundDown =
                event =>
                    this._onPointerDown(
                        event
                    );

            this._boundMove =
                event =>
                    this._onPointerMove(
                        event
                    );

            this._boundUp =
                event =>
                    this._onPointerUp(
                        event
                    );

            this._boundKeyDown =
                event =>
                    this._onKeyDown(
                        event
                    );

            this._boundKeyUp =
                event =>
                    this._onKeyUp(
                        event
                    );

            this._boundBlur =
                () =>
                    this._cancelUEOrbitDrag();

            this._boundSunChanged =
                () =>
                    this.update();

            this.initialized =
                false;
        }

        get camera() {
            return (
                window.camera ||
                window.cameraSystem
                    ?.camera ||
                null
            );
        }

        get canvas() {
            return (
                window.renderer
                    ?.domElement ||
                null
            );
        }

        init(
            controller =
                window.smSunController
        ) {
            if (
                this.initialized
            ) {
                this.update();
                return true;
            }

            if (
                !controller ||
                !window.scene
            ) {
                return false;
            }

            this.controller =
                controller;

            this._build();
            this._bindInput();
            this._ensureEditorLayer();

            window.addEventListener(
                'sm:sun-changed',
                this._boundSunChanged
            );

            window.addEventListener(
                'sm:pie-start',
                () =>
                    this.setVisible(
                        false
                    )
            );

            window.addEventListener(
                'sm:pie-stop',
                () =>
                    window
                        .smSunViewportBridge
                        ?.syncSelection?.()
            );

            this.initialized =
                true;

            this.update();

            return true;
        }

        _build() {
            const radius =
                this.options.radius;

            const root =
                new THREE.Group();

            root.name =
                'Sun_Gizmo';

            tagEditorObject(
                root
            );

            // Horizontal compass ring.
            const ringPoints = [];

            for (
                let i = 0;
                i <
                this.options
                    .ringSegments;
                i += 1
            ) {
                const angle =
                    (
                        i /
                        this.options
                            .ringSegments
                    ) *
                    Math.PI *
                    2;

                ringPoints.push(
                    new THREE.Vector3(
                        Math.sin(angle) *
                            radius,
                        0,
                        Math.cos(angle) *
                            radius
                    )
                );
            }

            const ringGeometry =
                new THREE.BufferGeometry()
                    .setFromPoints(
                        ringPoints
                    );

            this.compassRing =
                new THREE.LineLoop(
                    ringGeometry,
                    makeLineMaterial(
                        0x8ba8c0,
                        this.options
                            .ringOpacity
                    )
                );

            tagEditorObject(
                this.compassRing
            );

            root.add(
                this.compassRing
            );

            // Vertical east-west daylight path.
            const pathPoints = [];

            for (
                let i = 0;
                i <=
                this.options
                    .pathSegments;
                i += 1
            ) {
                const t =
                    i /
                    this.options
                        .pathSegments;

                const angle =
                    Math.PI *
                    t;

                pathPoints.push(
                    new THREE.Vector3(
                        -Math.cos(angle) *
                            radius,
                        Math.sin(angle) *
                            radius,
                        0
                    )
                );
            }

            const pathGeometry =
                new THREE.BufferGeometry()
                    .setFromPoints(
                        pathPoints
                    );

            this.sunPath =
                new THREE.Line(
                    pathGeometry,
                    makeLineMaterial(
                        0xe0b268,
                        this.options
                            .pathOpacity
                    )
                );

            tagEditorObject(
                this.sunPath
            );

            root.add(
                this.sunPath
            );

            // Direction line.
            const directionGeometry =
                new THREE.BufferGeometry()
                    .setFromPoints([
                        new THREE.Vector3(),
                        new THREE.Vector3(
                            0,
                            radius,
                            0
                        )
                    ]);

            this.directionLine =
                new THREE.Line(
                    directionGeometry,
                    makeLineMaterial(
                        0xf4bd4f,
                        0.85
                    )
                );

            tagEditorObject(
                this.directionLine
            );

            root.add(
                this.directionLine
            );

            // Draggable sun handle.
            this.handle =
                new THREE.Mesh(
                    new THREE.SphereGeometry(
                        this.options
                            .handleRadius,
                        16,
                        10
                    ),

                    new THREE.MeshBasicMaterial({
                        color:
                            0xffb52e,
                        depthTest:
                            false,
                        depthWrite:
                            false
                    })
                );

            tagEditorObject(
                this.handle,
                {
                    smSunGizmoHandle:
                        true
                }
            );

            this.handle.renderOrder =
                10030;

            root.add(
                this.handle
            );

            // Constant-screen sun icon.
            this.icon =
                new THREE.Sprite(
                    new THREE.SpriteMaterial({
                        map:
                            createSunIconTexture(),
                        transparent:
                            true,
                        depthTest:
                            false,
                        depthWrite:
                            false,
                        sizeAttenuation:
                            false
                    })
                );

            tagEditorObject(
                this.icon,
                {
                    smSunGizmoIcon:
                        true
                }
            );

            this.icon.scale.set(
                this.options
                    .iconScale,
                this.options
                    .iconScale,
                1
            );

            this.icon.renderOrder =
                10040;

            root.add(
                this.icon
            );

            root.visible =
                false;

            window.scene.add(
                root
            );

            this.root =
                root;
        }

        _bindInput() {
            const canvas =
                this.canvas;

            if (!canvas) {
                return;
            }

            canvas.addEventListener(
                'pointerdown',
                this._boundDown,
                {
                    capture: true
                }
            );

            window.addEventListener(
                'pointermove',
                this._boundMove,
                {
                    capture: true
                }
            );

            window.addEventListener(
                'pointerup',
                this._boundUp,
                {
                    capture: true
                }
            );

            window.addEventListener(
                'keydown',
                this._boundKeyDown,
                {
                    capture: true
                }
            );

            window.addEventListener(
                'keyup',
                this._boundKeyUp,
                {
                    capture: true
                }
            );

            window.addEventListener(
                'blur',
                this._boundBlur
            );
        }

        _ensureEditorLayer() {
            const camera =
                this.camera;

            camera?.layers
                ?.enable?.(
                    GIZMO_LAYER
                );

            const gameCamera =
                window._gameRenderCamera ||
                window.gameCamera;

            gameCamera?.layers
                ?.disable?.(
                    GIZMO_LAYER
                );
        }

        _onKeyDown(event) {
            if (
                event.key === 'Control'
            ) {
                this._keys.ctrl = true;
            }

            if (
                String(event.key)
                    .toLowerCase() ===
                'l'
            ) {
                this._keys.l = true;
            }

            if (
                event.key === 'Shift'
            ) {
                this._keys.shift = true;
            }
        }

        _onKeyUp(event) {
            if (
                event.key === 'Control'
            ) {
                this._keys.ctrl = false;
                this._cancelUEOrbitDrag();
            }

            if (
                String(event.key)
                    .toLowerCase() ===
                'l'
            ) {
                this._keys.l = false;
                this._cancelUEOrbitDrag();
            }

            if (
                event.key === 'Shift'
            ) {
                this._keys.shift = false;
            }
        }

        _canStartUEOrbitDrag(event) {
            if (
                event.button !== 0 ||
                !this.controller ||
                !this.visible
            ) {
                return false;
            }

            return !!(
                (
                    event.ctrlKey ||
                    this._keys.ctrl
                ) &&
                this._keys.l
            );
        }

        _beginUEOrbitDrag(event) {
            if (
                !this._canStartUEOrbitDrag(
                    event
                )
            ) {
                return false;
            }

            this.ueOrbitDragging =
                true;

            this._ueDragStart.x =
                event.clientX;

            this._ueDragStart.y =
                event.clientY;

            this._ueDragStart.azimuth =
                this.controller.azimuth;

            this._ueDragStart.elevation =
                this.controller.elevation;

            const controls =
                window.controls;

            if (controls) {
                this._previousControlsEnabled =
                    controls.enabled;

                controls.enabled =
                    false;
            }

            if (this.canvas) {
                this.canvas.style.cursor =
                    'crosshair';

                this.canvas
                    .setPointerCapture?.(
                        event.pointerId
                    );
            }

            window.smSunTimeOfDay
                ?.pause?.();

            window.dispatchEvent(
                new CustomEvent(
                    'sm:sun-ue-drag-start',
                    {
                        detail: {
                            azimuth:
                                this.controller
                                    .azimuth,
                            elevation:
                                this.controller
                                    .elevation
                        }
                    }
                )
            );

            event.preventDefault();
            event.stopPropagation();

            return true;
        }

        _updateUEOrbitDrag(event) {
            if (
                !this.ueOrbitDragging ||
                !this.controller
            ) {
                return false;
            }

            const fine =
                event.shiftKey ||
                this._keys.shift;

            const sensitivity =
                fine
                    ? this.options
                        .ueFineSensitivity
                    : this.options
                        .ueDragSensitivity;

            const dx =
                event.clientX -
                this._ueDragStart.x;

            const dy =
                event.clientY -
                this._ueDragStart.y;

            const azimuth =
                this._ueDragStart.azimuth +
                dx *
                sensitivity;

            const elevation =
                THREE.MathUtils.clamp(
                    this._ueDragStart.elevation -
                    dy *
                    sensitivity,
                    -12,
                    89
                );

            this.controller
                .setAngles(
                    azimuth,
                    elevation
                );

            event.preventDefault();
            event.stopPropagation();

            return true;
        }

        _cancelUEOrbitDrag(event = null) {
            if (
                !this.ueOrbitDragging
            ) {
                return false;
            }

            this.ueOrbitDragging =
                false;

            const controls =
                window.controls;

            if (
                controls &&
                this._previousControlsEnabled !==
                null
            ) {
                controls.enabled =
                    this._previousControlsEnabled;
            }

            this._previousControlsEnabled =
                null;

            if (this.canvas) {
                this.canvas.style.cursor =
                    '';

                if (event?.pointerId !== undefined) {
                    this.canvas
                        .releasePointerCapture?.(
                            event.pointerId
                        );
                }
            }

            window.dispatchEvent(
                new CustomEvent(
                    'sm:sun-ue-drag-end',
                    {
                        detail: {
                            azimuth:
                                this.controller
                                    ?.azimuth,
                            elevation:
                                this.controller
                                    ?.elevation
                        }
                    }
                )
            );

            return true;
        }

        _pointerToNDC(event) {
            const canvas =
                this.canvas;

            if (!canvas) {
                return false;
            }

            const rect =
                canvas.getBoundingClientRect();

            this._pointer.x =
                (
                    (
                        event.clientX -
                        rect.left
                    ) /
                    rect.width
                ) *
                2 -
                1;

            this._pointer.y =
                -(
                    (
                        event.clientY -
                        rect.top
                    ) /
                    rect.height
                ) *
                2 +
                1;

            return true;
        }

        _onPointerDown(event) {
            /*
             * Unreal-style interaction:
             * hold Ctrl + L and drag anywhere in the viewport.
             */
            if (
                this._beginUEOrbitDrag(
                    event
                )
            ) {
                return;
            }

            if (
                !this.visible ||
                !this.handle ||
                event.button !== 0
            ) {
                return;
            }

            const camera =
                this.camera;

            if (
                !camera ||
                !this._pointerToNDC(
                    event
                )
            ) {
                return;
            }

            this._raycaster
                .setFromCamera(
                    this._pointer,
                    camera
                );

            const hits =
                this._raycaster
                    .intersectObject(
                        this.handle,
                        false
                    );

            if (!hits.length) {
                return;
            }

            this.dragging =
                true;

            const controls =
                window.controls;

            if (controls) {
                this._previousControlsEnabled =
                    controls.enabled;

                controls.enabled =
                    false;
            }

            this.canvas
                ?.setPointerCapture?.(
                    event.pointerId
                );

            event.preventDefault();
            event.stopPropagation();
        }

        _onPointerMove(event) {
            if (
                this.ueOrbitDragging
            ) {
                this._updateUEOrbitDrag(
                    event
                );

                return;
            }

            if (
                !this.dragging ||
                !this.controller
            ) {
                return;
            }

            const camera =
                this.camera;

            if (
                !camera ||
                !this._pointerToNDC(
                    event
                )
            ) {
                return;
            }

            this._raycaster
                .setFromCamera(
                    this._pointer,
                    camera
                );

            this._dragSphere.center
                .copy(
                    this.controller
                        .target
                );

            this._dragSphere.radius =
                this.options.radius;

            const hit =
                new THREE.Vector3();

            const point =
                this._raycaster
                    .ray
                    .intersectSphere(
                        this._dragSphere,
                        hit
                    );

            if (!point) {
                return;
            }

            const direction =
                point.clone()
                    .sub(
                        this.controller
                            .target
                    )
                    .normalize();

            const angles =
                this.controller
                    .anglesFromDirection(
                        direction
                    );

            this.controller
                .setAngles(
                    angles.azimuth,
                    THREE.MathUtils.clamp(
                        angles.elevation,
                        -12,
                        89
                    )
                );

            /*
             * Manual gizmo dragging breaks the automatic time binding.
             * Keep the time system paused until the user explicitly plays it.
             */
            window.smSunTimeOfDay
                ?.pause?.();

            event.preventDefault();
            event.stopPropagation();
        }

        _onPointerUp(event) {
            if (
                this.ueOrbitDragging
            ) {
                this._cancelUEOrbitDrag(
                    event
                );

                return;
            }

            if (!this.dragging) {
                return;
            }

            this.dragging =
                false;

            const controls =
                window.controls;

            if (
                controls &&
                this._previousControlsEnabled !==
                null
            ) {
                controls.enabled =
                    this._previousControlsEnabled;
            }

            this._previousControlsEnabled =
                null;

            this.canvas
                ?.releasePointerCapture?.(
                    event.pointerId
                );
        }

        update() {
            if (
                !this.root ||
                !this.controller
            ) {
                return false;
            }

            this._ensureEditorLayer();

            this.root.position
                .copy(
                    this.controller
                        .target
                );

            const direction =
                this.controller
                    .directionFromAngles();

            const handlePosition =
                direction.multiplyScalar(
                    this.options.radius
                );

            this.handle.position
                .copy(
                    handlePosition
                );

            this.icon.position
                .copy(
                    handlePosition
                );

            /*
             * Rotate the sun path so its vertical plane follows the current
             * azimuth heading. This gives a readable orbit-plane cue.
             */
            const pathHeading =
                (
                    this.controller
                        .azimuth -
                    180
                ) *
                Math.PI /
                180;

            this.sunPath.rotation.y =
                pathHeading;

            const positions =
                this.directionLine
                    .geometry
                    .attributes
                    .position;

            positions.setXYZ(
                0,
                0,
                0,
                0
            );

            positions.setXYZ(
                1,
                handlePosition.x,
                handlePosition.y,
                handlePosition.z
            );

            positions.needsUpdate =
                true;

            return true;
        }

        setVisible(visible) {
            this.visible =
                !!visible;

            if (this.root) {
                this.root.visible =
                    this.visible;
            }

            return this.visible;
        }

        isSunSelection(object) {
            if (!object) {
                return false;
            }

            return !!(
                object ===
                    this.controller
                        ?.light ||
                object ===
                    this.controller
                        ?.rigProxy ||
                object.userData
                    ?.isSMSunLight ||
                object.userData
                    ?.isSMSunRigProxy
            );
        }

        syncSelection(object) {
            this.setVisible(
                this.isSunSelection(
                    object
                )
            );
        }

        dispose() {
            this.canvas
                ?.removeEventListener?.(
                    'pointerdown',
                    this._boundDown,
                    {
                        capture: true
                    }
                );

            window.removeEventListener(
                'pointermove',
                this._boundMove,
                {
                    capture: true
                }
            );

            window.removeEventListener(
                'pointerup',
                this._boundUp,
                {
                    capture: true
                }
            );

            window.removeEventListener(
                'keydown',
                this._boundKeyDown,
                {
                    capture: true
                }
            );

            window.removeEventListener(
                'keyup',
                this._boundKeyUp,
                {
                    capture: true
                }
            );

            window.removeEventListener(
                'blur',
                this._boundBlur
            );

            window.removeEventListener(
                'sm:sun-changed',
                this._boundSunChanged
            );

            this.root?.traverse?.(
                object => {
                    object.geometry
                        ?.dispose?.();

                    object.material
                        ?.map
                        ?.dispose?.();

                    object.material
                        ?.dispose?.();
                }
            );

            this.root?.parent
                ?.remove?.(
                    this.root
                );

            this.root =
                null;
        }
    }

    window.SMSunGizmo =
        SMSunGizmo;

    window.smSunGizmo =
        window.smSunGizmo ||
        new SMSunGizmo();
})();