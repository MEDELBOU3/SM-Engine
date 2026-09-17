// assets/addObject/scene-objects/camera-objects.js
// SM Engine — Optimized Camera Objects
//
// Goal:
// - Keep REAL camera projection untouched (near/far/FOV remain correct).
// - Remove heavyweight / huge THREE.CameraHelper frustum.
// - Show a compact camera wire-body + editor icon all the time.
// - Show a SHORT capped frustum all the time; selection only highlights it.
// - Keep helper attached to the camera so no per-frame transform updates.
// - Do not add helper as a separate hierarchy/scene object.

(function () {
    'use strict';

    const CAMERA_HELPER_CONFIG = {
        iconScale: 0.052,
        bodyScale: 0.42,
        frustumLength: 1.45,
        orthoFrustumLength: 1.35,
        showFrustumByDefault: true
    };

    // Dedicated Three.js editor-only render layer.
    // Main editor viewport camera can see it.
    // Managed scene cameras keep this layer disabled, so their own helper
    // can NEVER appear inside Camera View / cinematic render.
    const CAMERA_EDITOR_HELPER_LAYER = 31;

    function enableEditorHelperLayer(camera) {
        if (!camera?.isCamera) return false;

        camera.layers.enable(
            CAMERA_EDITOR_HELPER_LAYER
        );

        return true;
    }

    function disableEditorHelperLayer(camera) {
        if (!camera?.isCamera) return false;

        camera.layers.disable(
            CAMERA_EDITOR_HELPER_LAYER
        );

        return true;
    }

    function markAsEditorHelperLayer(object) {
        if (!object) return object;

        object.layers.set(
            CAMERA_EDITOR_HELPER_LAYER
        );

        return object;
    }

    function ensureMainEditorCameraLayer() {
        const editorCamera =
            window.camera;

        /*
         * window.camera is the normal SM Engine editor camera in the current
         * architecture. It needs to see layer 31 so camera helpers remain
         * visible while editing the scene.
         *
         * Managed scene cameras created by this file explicitly DISABLE 31.
         */
        if (
            editorCamera?.isCamera &&
            !editorCamera.userData?.smManagedSceneCamera
        ) {
            enableEditorHelperLayer(
                editorCamera
            );
        }
    }


    function makeEditorOnly(object, extra = {}) {
        if (!object) return object;

        object.userData = object.userData || {};

        Object.assign(
            object.userData,
            {
                isSystemObject: true,
                editorOnly: true,
                ignoreInHierarchy: true,
                ignoreInTimeline: true,
                ignoreSelection: true,
                ignoreRaycast: true,
                ...extra
            }
        );

        return object;
    }

    function createCameraSVGTexture() {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
                <rect x="18" y="24" width="78" height="78" rx="12"
                    fill="#262626" fill-opacity=".88"
                    stroke="#e1e1e1" stroke-width="6"/>
                <path d="M96 43 L113 35 L113 91 L96 83 Z"
                    fill="#262626" fill-opacity=".88"
                    stroke="#e1e1e1" stroke-width="6"
                    stroke-linejoin="round"/>
                <circle cx="57" cy="63" r="16"
                    fill="none" stroke="#e1e1e1" stroke-width="6"/>
                <circle cx="57" cy="63" r="5" fill="#66ccff"/>
            </svg>`;

        const texture = new THREE.TextureLoader().load(
            'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
        );

        if ('colorSpace' in texture && THREE.SRGBColorSpace) {
            texture.colorSpace = THREE.SRGBColorSpace;
        }

        texture.needsUpdate = true;
        return texture;
    }

    function createCameraIconSprite() {
        const texture = createCameraSVGTexture();

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.96,
            depthTest: false,
            depthWrite: false,
            sizeAttenuation: false
        });

        const sprite = new THREE.Sprite(material);

        sprite.name = 'CameraEditorIcon';

        makeEditorOnly(sprite, {
            smCameraIcon: true
        });

        markAsEditorHelperLayer(sprite);

        sprite.scale.set(
            CAMERA_HELPER_CONFIG.iconScale,
            CAMERA_HELPER_CONFIG.iconScale,
            1
        );

        sprite.renderOrder = 10000;

        return sprite;
    }

    function createCompactCameraBody() {
        /*
         * One tiny LineSegments object replaces a real camera mesh/helper.
         * It is intentionally simple: body box + lens hood + top marker.
         * No triangles, no shadows, no raycasting and no per-frame update.
         */
        const s =
            CAMERA_HELPER_CONFIG.bodyScale;

        const hx = 0.52 * s;
        const hy = 0.34 * s;
        const hz = 0.30 * s;

        const frontZ = -hz;
        const backZ = hz;

        const b0 = new THREE.Vector3(-hx, hy, backZ);
        const b1 = new THREE.Vector3(hx, hy, backZ);
        const b2 = new THREE.Vector3(hx, -hy, backZ);
        const b3 = new THREE.Vector3(-hx, -hy, backZ);

        const f0 = new THREE.Vector3(-hx, hy, frontZ);
        const f1 = new THREE.Vector3(hx, hy, frontZ);
        const f2 = new THREE.Vector3(hx, -hy, frontZ);
        const f3 = new THREE.Vector3(-hx, -hy, frontZ);

        // Short lens hood in local -Z camera-forward direction.
        const lensZ =
            frontZ -
            0.38 * s;

        const lensHalfW =
            0.34 * s;

        const lensHalfH =
            0.24 * s;

        const l0 = new THREE.Vector3(-lensHalfW, lensHalfH, lensZ);
        const l1 = new THREE.Vector3(lensHalfW, lensHalfH, lensZ);
        const l2 = new THREE.Vector3(lensHalfW, -lensHalfH, lensZ);
        const l3 = new THREE.Vector3(-lensHalfW, -lensHalfH, lensZ);

        const topY =
            hy +
            0.22 * s;

        const top0 =
            new THREE.Vector3(
                -0.18 * s,
                hy,
                0
            );

        const top1 =
            new THREE.Vector3(
                0,
                topY,
                -0.03 * s
            );

        const top2 =
            new THREE.Vector3(
                0.18 * s,
                hy,
                0
            );

        const vertices = [
            // Body box.
            b0, b1,
            b1, b2,
            b2, b3,
            b3, b0,

            f0, f1,
            f1, f2,
            f2, f3,
            f3, f0,

            b0, f0,
            b1, f1,
            b2, f2,
            b3, f3,

            // Lens hood.
            f0, l0,
            f1, l1,
            f2, l2,
            f3, l3,

            l0, l1,
            l1, l2,
            l2, l3,
            l3, l0,

            // Small top direction marker.
            top0, top1,
            top1, top2
        ];

        const geometry =
            new THREE.BufferGeometry()
                .setFromPoints(
                    vertices
                );

        const material =
            new THREE.LineBasicMaterial({
                color: 0xb7b7b7,
                transparent: true,
                opacity: 0.86,
                depthTest: false,
                depthWrite: false
            });

        const body =
            new THREE.LineSegments(
                geometry,
                material
            );

        body.name =
            'CameraCompactBody';

        makeEditorOnly(
            body,
            {
                smCameraBody: true
            }
        );

        markAsEditorHelperLayer(
            body
        );

        body.renderOrder =
            10001;

        return body;
    }

    function buildPerspectiveFrustumGeometry(camera) {
        const length = Math.max(
            0.25,
            CAMERA_HELPER_CONFIG.frustumLength
        );

        const fovRadians = THREE.MathUtils.degToRad(
            camera.fov || 50
        );

        // Clamp editor preview width. The REAL camera FOV is untouched.
        const halfHeight =
            Math.min(
                0.72,
                Math.tan(fovRadians * 0.5) *
                length
            );

        const halfWidth =
            Math.min(
                1.0,
                halfHeight *
                Math.max(
                    0.01,
                    camera.aspect || 1
                )
            );

        // Camera looks down local -Z.
        const p0 = new THREE.Vector3(0, 0, 0);

        const a = new THREE.Vector3(
            -halfWidth,
            halfHeight,
            -length
        );

        const b = new THREE.Vector3(
            halfWidth,
            halfHeight,
            -length
        );

        const c = new THREE.Vector3(
            halfWidth,
            -halfHeight,
            -length
        );

        const d = new THREE.Vector3(
            -halfWidth,
            -halfHeight,
            -length
        );

        const vertices = [
            // Rays.
            p0, a,
            p0, b,
            p0, c,
            p0, d,

            // Short far rectangle.
            a, b,
            b, c,
            c, d,
            d, a
        ];

        return new THREE.BufferGeometry()
            .setFromPoints(vertices);
    }

    function buildOrthographicFrustumGeometry(camera) {
        const length = Math.max(
            0.25,
            CAMERA_HELPER_CONFIG.orthoFrustumLength
        );

        const zoom = Math.max(
            0.0001,
            camera.zoom || 1
        );

        // Keep preview compact even when the actual orthographic camera
        // covers a very large area.
        const maxHalfSize = 0.78;

        const halfWidth = Math.min(
            maxHalfSize,
            Math.abs(
                (camera.right - camera.left) /
                (2 * zoom)
            )
        );

        const halfHeight = Math.min(
            maxHalfSize,
            Math.abs(
                (camera.top - camera.bottom) /
                (2 * zoom)
            )
        );

        const nearZ = -0.12;
        const farZ = -length;

        const n0 = new THREE.Vector3(-halfWidth, halfHeight, nearZ);
        const n1 = new THREE.Vector3(halfWidth, halfHeight, nearZ);
        const n2 = new THREE.Vector3(halfWidth, -halfHeight, nearZ);
        const n3 = new THREE.Vector3(-halfWidth, -halfHeight, nearZ);

        const f0 = new THREE.Vector3(-halfWidth, halfHeight, farZ);
        const f1 = new THREE.Vector3(halfWidth, halfHeight, farZ);
        const f2 = new THREE.Vector3(halfWidth, -halfHeight, farZ);
        const f3 = new THREE.Vector3(-halfWidth, -halfHeight, farZ);

        const vertices = [
            // Near.
            n0, n1,
            n1, n2,
            n2, n3,
            n3, n0,

            // Far.
            f0, f1,
            f1, f2,
            f2, f3,
            f3, f0,

            // Connections.
            n0, f0,
            n1, f1,
            n2, f2,
            n3, f3
        ];

        return new THREE.BufferGeometry()
            .setFromPoints(vertices);
    }

    function createCompactFrustum(camera) {
        const geometry =
            camera.isOrthographicCamera
                ? buildOrthographicFrustumGeometry(camera)
                : buildPerspectiveFrustumGeometry(camera);

        const material = new THREE.LineBasicMaterial({
            color: 0x989898,
            transparent: true,
            opacity: 0.60,
            depthTest: false,
            depthWrite: false
        });

        const lines = new THREE.LineSegments(
            geometry,
            material
        );

        lines.name = 'CameraCompactFrustum';

        makeEditorOnly(lines, {
            smCameraFrustum: true
        });

        markAsEditorHelperLayer(
            lines
        );

        lines.visible =
            CAMERA_HELPER_CONFIG.showFrustumByDefault;

        lines.renderOrder = 9999;

        return lines;
    }

    function disposeCompactCameraHelper(helper) {
        if (!helper) return;

        helper.traverse((object) => {
            object.geometry?.dispose?.();

            if (Array.isArray(object.material)) {
                object.material.forEach((material) => {
                    material.map?.dispose?.();
                    material.dispose?.();
                });
            } else {
                object.material?.map?.dispose?.();
                object.material?.dispose?.();
            }
        });

        helper.parent?.remove(helper);
    }

    function createCompactCameraHelper(camera) {
        const group = new THREE.Group();

        group.name =
            'Helper_' +
            (camera.name || 'Camera');

        makeEditorOnly(group, {
            smCameraHelper: true,
            cameraUuid: camera.uuid
        });

        markAsEditorHelperLayer(
            group
        );

        const body =
            createCompactCameraBody();

        const icon =
            createCameraIconSprite();

        // Keep icon as a small editor badge, not as the whole representation.
        icon.position.set(
            0,
            0.34,
            0
        );

        const frustum =
            createCompactFrustum(camera);

        group.add(body);
        group.add(icon);
        group.add(frustum);

        // Attach to camera itself.
        // No CameraHelper.update() and no world transform copy every frame.
        camera.add(group);

        camera.userData =
            camera.userData || {};

        camera.userData.helper = group;
        camera.userData.cameraEditorBody = body;
        camera.userData.cameraEditorIcon = icon;
        camera.userData.cameraCompactFrustum = frustum;

        return group;
    }

    function rebuildCompactFrustum(camera) {
        if (!camera?.isCamera) return false;

        const old =
            camera.userData?.cameraCompactFrustum;

        const helper =
            camera.userData?.helper;

        if (!helper) return false;

        const wasVisible =
            !!old?.visible;

        if (old) {
            old.geometry?.dispose?.();
            old.material?.dispose?.();
            helper.remove(old);
        }

        const next =
            createCompactFrustum(camera);

        next.visible = wasVisible;

        helper.add(next);

        camera.userData.cameraCompactFrustum =
            next;

        return true;
    }

    window.setManagedCameraHelperSelected = function (
        camera,
        selected = true
    ) {
        if (!camera?.isCamera) return false;

        const helper =
            camera.userData?.helper;

        const body =
            camera.userData?.cameraEditorBody;

        const frustum =
            camera.userData?.cameraCompactFrustum;

        if (!helper) return false;

        helper.visible = true;

        // Body and compact frustum remain visible all the time.
        // Selection only changes emphasis, so this does not depend on the
        // editor's exact selection-event implementation.
        if (body?.material?.color) {
            body.material.color.setHex(
                selected
                    ? 0xffa52b
                    : 0xb7b7b7
            );

            body.material.opacity =
                selected
                    ? 1.0
                    : 0.86;
        }

        if (frustum) {
            frustum.visible = true;

            if (frustum.material?.color) {
                frustum.material.color.setHex(
                    selected
                        ? 0xffa52b
                        : 0x989898
                );

                frustum.material.opacity =
                    selected
                        ? 0.82
                        : 0.60;
            }
        }

        return true;
    };

    window.setManagedCameraFrustumVisible = function (
        camera,
        visible
    ) {
        if (!camera?.isCamera) return false;

        const frustum =
            camera.userData?.cameraCompactFrustum;

        if (!frustum) return false;

        frustum.visible = !!visible;

        return true;
    };

    window.refreshManagedCameraHelper = function (
        camera
    ) {
        return rebuildCompactFrustum(camera);
    };

    window.disposeManagedCameraHelper = function (
        camera
    ) {
        if (!camera?.isCamera) return false;

        disposeCompactCameraHelper(
            camera.userData?.helper
        );

        if (camera.userData) {
            delete camera.userData.helper;
            delete camera.userData.cameraEditorBody;
            delete camera.userData.cameraEditorIcon;
            delete camera.userData.cameraCompactFrustum;
        }

        return true;
    };

    window.resolveManagedCamera = function (object) {
        if (!object) return null;

        if (object.isCamera) return object;

        if (
            object.userData?.smCubeCameraProxy &&
            object.userData.cubeCamera?.isCamera
        ) {
            return object.userData.cubeCamera;
        }

        return null;
    };

    // Supports normal cameras and Cube Camera proxy objects.
    window.possessCamera = function (cam) {
        if (!cam) return;

        const actualCamera = window.resolveManagedCamera(cam);

        if (!actualCamera?.isCamera) {
            console.warn('[Camera] Unsupported active-camera object:', cam);
            return;
        }

        if (
            window._isInsideCamera &&
            window._viewedCamera === cam
        ) {
            window._isInsideCamera = false;
            window._viewedCamera = null;
            window._activeSceneCamera = null;

            ensureMainEditorCameraLayer();

            if (cam.userData?.smCubeCameraProxy) {
                if (cam.userData.cubeCameraIcon) cam.userData.cubeCameraIcon.visible = true;
            }

            if (window.controls) {
                window.controls.object = window.camera;
                window.controls.enabled = true;
                window.controls.update?.();
            }

            return;
        }

        window._isInsideCamera = true;
        window._viewedCamera = cam;
        window._activeSceneCamera = actualCamera;

        // Camera view must never render editor helper layer 31.
        disableEditorHelperLayer(actualCamera);
        ensureMainEditorCameraLayer();

        if (cam.userData?.smCubeCameraProxy) {
            // Refresh the cubemap when activating the Cube Camera.
            cam.update?.();

            // Hide the editor icon while viewing/capturing.
            if (cam.userData.cubeCameraIcon) cam.userData.cubeCameraIcon.visible = false;
        }

        if (window.controls) {
            window.controls.object = actualCamera;

            const forward = new THREE.Vector3(0, 0, -1)
                .applyQuaternion(actualCamera.quaternion);

            window.controls.target
                .copy(actualCamera.position)
                .addScaledVector(forward, 5);

            window.controls.enabled = true;
            window.controls.update?.();
        }

        console.log(
            `Now possessing and piloting camera: ${cam.name || actualCamera.name}`
        );
    };

    window.setCubeCameraActive = function (proxy) {
        if (
            !proxy?.userData?.smCubeCameraProxy ||
            !proxy.userData.cubeCamera?.isCamera
        ) {
            return false;
        }

        window.possessCamera(proxy);
        return true;
    };

window.createManagedPerspectiveCamera = function () {
        const fov = 50;

        const aspect =
            Math.max(
                1,
                window.innerWidth
            ) /
            Math.max(
                1,
                window.innerHeight
            );

        const near = 0.1;
        const far = 1000;

        const camera =
            new THREE.PerspectiveCamera(
                fov,
                aspect,
                near,
                far
            );

        camera.position.set(
            0,
            5,
            10
        );

        camera.name =
            'Perspective Camera_' +
            camera.id;

        camera.userData =
            camera.userData || {};

        Object.assign(
            camera.userData,
            {
                type: 'Camera',
                mode: 'cinematic',
                smManagedSceneCamera: true,

                // Editor representation metadata.
                helperStyle: 'compact',
                helperFrustumLength:
                    CAMERA_HELPER_CONFIG.frustumLength
            }
        );

        // Scene camera renders world layer 0, NOT editor helper layer 31.
        // Therefore entering Camera View cannot render its own icon/body/frustum.
        disableEditorHelperLayer(
            camera
        );

        ensureMainEditorCameraLayer();

        createCompactCameraHelper(
            camera
        );

        if (
            typeof placeAndOffset ===
            'function'
        ) {
            placeAndOffset(
                camera
            );
        }

        if (
            typeof addObjectToScene ===
            'function'
        ) {
            // IMPORTANT:
            // Add ONLY the camera.
            // Helper is a lightweight child of camera and ignored by hierarchy.
            addObjectToScene(
                camera,
                'Perspective Camera'
            );
        } else {
            window.scene?.add?.(
                camera
            );
        }

        return camera;
    };

    window.createManagedOrthographicCamera = function () {
        const aspect =
            Math.max(
                1,
                window.innerWidth
            ) /
            Math.max(
                1,
                window.innerHeight
            );

        const d = 5;

        const left =
            -d * aspect;

        const right =
            d * aspect;

        const top = d;
        const bottom = -d;

        const near = 0.1;
        const far = 1000;

        const camera =
            new THREE.OrthographicCamera(
                left,
                right,
                top,
                bottom,
                near,
                far
            );

        camera.position.set(
            0,
            5,
            10
        );

        camera.name =
            'Orthographic Camera_' +
            camera.id;

        camera.userData =
            camera.userData || {};

        Object.assign(
            camera.userData,
            {
                type: 'Camera',
                mode: 'cinematic',
                smManagedSceneCamera: true,

                helperStyle: 'compact',
                helperFrustumLength:
                    CAMERA_HELPER_CONFIG
                        .orthoFrustumLength
            }
        );

        // Scene camera renders world layer 0, NOT editor helper layer 31.
        // Therefore entering Camera View cannot render its own icon/body/frustum.
        disableEditorHelperLayer(
            camera
        );

        ensureMainEditorCameraLayer();

        createCompactCameraHelper(
            camera
        );

        if (
            typeof placeAndOffset ===
            'function'
        ) {
            placeAndOffset(
                camera
            );
        }

        if (
            typeof addObjectToScene ===
            'function'
        ) {
            addObjectToScene(
                camera,
                'Orthographic Camera'
            );
        } else {
            window.scene?.add?.(
                camera
            );
        }

        return camera;
    };

    // ============================================================================
// CUBE CAMERA — Environment Map Capture
// ============================================================================
// CubeCamera is NOT a normal camera. It's an editor/runtime helper used to
// bake environment reflections (metals, glass, PBR) into a cubemap.
//
// It has:
//   - 6 internal cameras (one per face)
//   - 1 WebGLCubeRenderTarget (the cubemap)
//   - A proxy Object3D we add to the scene for editing
// ============================================================================

    function createCubeCameraSVGIcon() {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
                <path d="M64 12 L108 36 L64 60 L20 36 Z"
                    fill="#66ccff" fill-opacity=".10"
                    stroke="#66ccff" stroke-width="6"
                    stroke-linejoin="round"/>
                <path d="M20 36 V88 L64 114 V60 Z"
                    fill="#66ccff" fill-opacity=".06"
                    stroke="#66ccff" stroke-width="6"
                    stroke-linejoin="round"/>
                <path d="M108 36 V88 L64 114 V60 Z"
                    fill="#66ccff" fill-opacity=".08"
                    stroke="#66ccff" stroke-width="6"
                    stroke-linejoin="round"/>
                <circle cx="64" cy="60" r="7" fill="#ffffff"/>
                <circle cx="64" cy="60" r="15"
                    fill="none" stroke="#66ccff" stroke-width="4"/>
            </svg>`;

        const texture = new THREE.TextureLoader().load(
            'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
        );

        if ('colorSpace' in texture && THREE.SRGBColorSpace) {
            texture.colorSpace = THREE.SRGBColorSpace;
        }

        texture.needsUpdate = true;

        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.98,
            depthTest: false,
            depthWrite: false,
            sizeAttenuation: false
        }));

        sprite.name = 'CubeCameraSVGIcon';

        makeEditorOnly(sprite, {
            smCubeCameraIcon: true,
            isCubeCameraHelper: true
        });

        markAsEditorHelperLayer(sprite);

        sprite.scale.set(0.075, 0.075, 1);
        sprite.position.set(0, 0.48, 0);
        sprite.renderOrder = 10003;

        return sprite;
    }

window.createManagedCubeCamera = function () {
    // ----------------------------------------
    // 1. Resolution & render target
    // ----------------------------------------
    const resolution = 256; // 128 / 256 / 512 / 1024

    const renderTarget = new THREE.WebGLCubeRenderTarget(resolution, {
        type: THREE.HalfFloatType,          // HDR-friendly
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        format: THREE.RGBAFormat,
    });

    // ----------------------------------------
    // 2. CubeCamera itself
    // ----------------------------------------
    const near = 0.1;
    const far = 1000;

    const cubeCamera = new THREE.CubeCamera(near, far, renderTarget);
    cubeCamera.name = "Cube Camera_" + cubeCamera.id;

    // ----------------------------------------
    // 3. Create a PROXY Object3D for the scene
    // ----------------------------------------
    // We don't add the CubeCamera directly because it contains 6 internal
    // PerspectiveCameras that shouldn't be visible as separate entities.
    // Instead we add a proxy Group that holds:
    //   - the CubeCamera (as a child)
    //   - an editor icon
    //
    const proxy = new THREE.Group();
    proxy.name = cubeCamera.name;
    proxy.userData = proxy.userData || {};

    Object.assign(proxy.userData, {
        type: "CubeCamera",
        mode: "reflection-probe",
        smManagedSceneCamera: true,
        smCubeCameraProxy: true,
        isCubeCameraProxy: true,

        // Store the actual cube camera
        cubeCamera: cubeCamera,
        resolution,
        near,
        far,

        // Editor helper meta
        helperStyle: "compact-cube",
    });

    // Attach the real CubeCamera as a child of the proxy
    proxy.add(cubeCamera);

    // ----------------------------------------
    // 4. Dedicated SVG editor icon
        // ----------------------------------------
        const iconGroup = new THREE.Group();
        iconGroup.name = "CubeCameraIcon";

        const svgIcon = createCubeCameraSVGIcon();
        iconGroup.add(svgIcon);

        iconGroup.traverse((obj) => {
            obj.userData = obj.userData || {};

            Object.assign(obj.userData, {
                isSystemObject: true,
                editorOnly: true,
                isCubeCameraHelper: true,
                ignoreInHierarchy: true,
                ignoreInTimeline: true,
                ignoreSelection: true,
                ignoreRaycast: true
            });
        });

        proxy.add(iconGroup);

        proxy.userData.cubeCameraSVGIcon = svgIcon;

    // ----------------------------------------
    // 5. Store references
    // ----------------------------------------
    proxy.userData.cubeCameraRenderTarget = renderTarget;
    proxy.userData.cubeCameraIcon = iconGroup;

    // ----------------------------------------
    // 6. Position + spawn
    // ----------------------------------------
    proxy.position.set(0, 2, 0);

    if (typeof placeAndOffset === "function") {
        placeAndOffset(proxy);
    }

    // ----------------------------------------
    // 7. Add to scene via the standard pipeline
    // ----------------------------------------
    if (typeof addObjectToScene === "function") {
        addObjectToScene(proxy, "Cube Camera");
    } else {
        window.scene?.add?.(proxy);
    }

    // ----------------------------------------
    // 8. Public API on the proxy
    // ----------------------------------------
    proxy.update = function () {
        if (!window.renderer || !window.scene) return false;

        const iconWasVisible = iconGroup.visible;
        const cameraWasVisible = cubeCamera.visible;

        iconGroup.visible = false;
        cubeCamera.visible = false;

        // CubeCamera is a child of the proxy.
        // Local origin therefore equals the proxy capture position.
        cubeCamera.position.set(0, 0, 0);
        cubeCamera.update(window.renderer, window.scene);

        cubeCamera.visible = cameraWasVisible;
        iconGroup.visible = iconWasVisible;

        return true;
    };

    proxy.dispose = function () {
        renderTarget.dispose?.();

        iconGroup.traverse((object) => {
            object.geometry?.dispose?.();

            if (Array.isArray(object.material)) {
                object.material.forEach((material) => {
                    material.map?.dispose?.();
                    material.dispose?.();
                });
            } else {
                object.material?.map?.dispose?.();
                object.material?.dispose?.();
            }
        });

        proxy.userData.cubeCameraIcon = null;
        proxy.userData.cubeCameraSVGIcon = null;
        proxy.userData.cubeCameraRenderTarget = null;
    };

    console.log("[CubeCamera] Created:", proxy.name, `@ ${resolution}px`);
    return proxy;
};

    /*
     * Optional selection integration.
     *
     * If your editor dispatches one of these events, the selected camera gets
     * a short frustum and the previous one returns to icon-only display.
     */
    let lastSelectedCamera = null;

    function syncCameraSelection(object) {
        if (
            lastSelectedCamera &&
            lastSelectedCamera !== object
        ) {
            window.setManagedCameraHelperSelected(
                lastSelectedCamera,
                false
            );
        }

        const selectableCamera =
            object?.isCamera
                ? object
                : object?.userData?.smCubeCameraProxy
                    ? object.userData.cubeCamera
                    : null;

        if (selectableCamera?.isCamera) {
            window.setManagedCameraHelperSelected(
                selectableCamera,
                true
            );

            lastSelectedCamera = selectableCamera;
        } else {
            lastSelectedCamera = null;
        }
    }

    [
        'selectionChanged',
        'objectSelected',
        'sm:selection-changed',
        'sm:object-selected'
    ].forEach((eventName) => {
        window.addEventListener(
            eventName,
            (event) => {
                const object =
                    event.detail?.object ||
                    event.detail?.selectedObject ||
                    event.detail?.selected ||
                    null;

                syncCameraSelection(
                    object
                );
            }
        );
    });

    
// ============================================================================
// CINEMATIC CAMERA
// ============================================================================
// A managed PerspectiveCamera with cinematic controls:
// - focal length / FOV
// - look-at target
// - focus distance
// - aperture metadata for DOF systems
// - smooth movement
// - editor-only cinematic helper
// ============================================================================

function createCinematicCameraHelper(camera) {
    const group = new THREE.Group();
    group.name = "CinematicCameraHelper";

    const bodyGeometry = new THREE.ConeGeometry(0.13, 0.28, 4);
    const bodyMaterial = new THREE.MeshBasicMaterial({
        wireframe: true,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false
    });

    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const ringGeometry = new THREE.RingGeometry(0.20, 0.22, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        wireframe: true,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
    });

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.z = -0.18;
    group.add(ring);

    makeEditorOnly(group, {
        smCinematicCameraHelper: true,
        ignoreInHierarchy: true,
        ignoreInTimeline: true
    });

    markAsEditorHelperLayer(group);

    camera.add(group);

    camera.userData = camera.userData || {};
    camera.userData.cinematicHelper = group;
    camera.userData.cinematicBody = body;
    camera.userData.cinematicRing = ring;

    return group;
}

window.createManagedCinematicCamera = function () {
    const camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / Math.max(1, window.innerHeight),
        0.1,
        2000
    );

    camera.name = "Cinematic Camera_" + camera.id;

    camera.userData = camera.userData || {};

    Object.assign(camera.userData, {
        type: "CinematicCamera",
        mode: "cinematic",
        smManagedSceneCamera: true,

        // Cinematic lens data
        focalLength: 50,
        sensorWidth: 36,
        aperture: 2.8,
        focusDistance: 10,

        // Runtime state
        target: null,
        smoothing: 0.12,
        shake: 0
    });

    // Focal length -> FOV conversion.
    camera.setFocalLength = function (focalLength) {
        const value = Math.max(12, Math.min(300, Number(focalLength) || 50));
        camera.userData.focalLength = value;
        camera.fov = THREE.MathUtils.radToDeg(
            2 * Math.atan(
                camera.userData.sensorWidth / (2 * value)
            )
        );
        camera.updateProjectionMatrix();
        return camera;
    };

    camera.getFocalLength = function () {
        return camera.userData.focalLength;
    };

    camera.setFocusDistance = function (distance) {
        camera.userData.focusDistance = Math.max(
            0.01,
            Number(distance) || 10
        );
        return camera;
    };

    camera.setAperture = function (aperture) {
        camera.userData.aperture = Math.max(
            0.1,
            Number(aperture) || 2.8
        );
        return camera;
    };

    camera.lookAtTarget = function (target) {
        if (!target) return false;

        camera.userData.target = target;
        camera.lookAt(target);
        return true;
    };

    camera.smoothLookAt = function (target, alpha = camera.userData.smoothing) {
        if (!target) return false;

        const position =
            target.isVector3
                ? target
                : target.getWorldPosition(new THREE.Vector3());

        const direction = position
            .clone()
            .sub(camera.position)
            .normalize();

        if (direction.lengthSq() === 0) return false;

        const desired = new THREE.Quaternion()
            .setFromUnitVectors(
                new THREE.Vector3(0, 0, -1),
                direction
            );

        camera.quaternion.slerp(
            desired,
            THREE.MathUtils.clamp(alpha, 0, 1)
        );

        return true;
    };

    camera.setShake = function (amount = 0) {
        camera.userData.shake = Math.max(0, Number(amount) || 0);
        return camera;
    };

    camera.updateCinematic = function (delta = 0.016) {
        const target = camera.userData.target;

        if (target) {
            camera.smoothLookAt(
                target,
                1 - Math.pow(
                    1 - camera.userData.smoothing,
                    delta * 60
                )
            );
        }

        return camera;
    };

    camera.setFocalLength(50);
    createCinematicCameraHelper(camera);

    if (typeof placeAndOffset === "function") {
        placeAndOffset(camera);
    }

    if (typeof addObjectToScene === "function") {
        addObjectToScene(camera, "Cinematic Camera");
    } else {
        window.scene?.add?.(camera);
    }

    console.log("[CinematicCamera] Created:", camera.name);

    return camera;
};

function addCinematicCameraMenu() {
    const creator = window.createManagedCinematicCamera;

    if (typeof creator === "function") {
        const panel = document.getElementById("Cameras");
        if (panel) panel.style.display = "block";

        return creator();
    }

    const fallback = document.getElementById("addCamera");
    if (fallback) {
        fallback.click();
        return true;
    }

    return false;
}

window.addCinematicCameraMenu = addCinematicCameraMenu;

// Keep cinematic cameras synchronized with renderer aspect ratio.
window.addEventListener("resize", () => {
    if (!window.scene) return;

    window.scene.traverse((object) => {
        if (
            object?.userData?.type === "CinematicCamera" &&
            object.isPerspectiveCamera
        ) {
            object.aspect =
                window.innerWidth /
                Math.max(1, window.innerHeight);

            object.updateProjectionMatrix();
        }
    });
});


window.SMManagedCameraHelpers = {
        config:
            CAMERA_HELPER_CONFIG,

        create:
            createCompactCameraHelper,

        refresh:
            rebuildCompactFrustum,

        setSelected:
            window
                .setManagedCameraHelperSelected,

        setFrustumVisible:
            window
                .setManagedCameraFrustumVisible,

        dispose:
            window
                .disposeManagedCameraHelper,

        editorLayer:
            CAMERA_EDITOR_HELPER_LAYER,

        enableEditorLayer:
            enableEditorHelperLayer,

        disableEditorLayer:
            disableEditorHelperLayer,

        ensureEditorCameraLayer:
            ensureMainEditorCameraLayer,

        setCubeCameraActive:
            window.setCubeCameraActive,

        resolve:
            window.resolveManagedCamera
    };

    // Initial editor viewport setup.
    ensureMainEditorCameraLayer();

    // Re-apply when the editor changes its viewport camera implementation.
    [
        'sm:camera-changed',
        'sm:editor-camera-changed',
        'cameraChanged',
        'viewportCameraChanged'
    ].forEach((eventName) => {
        window.addEventListener(
            eventName,
            () => {
                ensureMainEditorCameraLayer();

                if (
                    window._viewedCamera?.isCamera
                ) {
                    disableEditorHelperLayer(
                        window._viewedCamera
                    );
                }
            }
        );
    });
})();


