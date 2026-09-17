// engine/environment/sun/SMSunOcclusion.js
// SM Engine — Sun visibility / occlusion.
//
// Raycasts from the active camera toward the directional sun.
// Expensive work is throttled and candidate meshes are cached.
(function () {
    'use strict';

    const DEFAULTS = {
        enabled: true,

        // Check visibility every N update calls.
        checkEveryFrames: 4,

        // Refresh scene occluder list occasionally.
        refreshCandidatesSeconds: 1.25,

        maxDistance: 3000,
        originOffset: 0.12,

        // Smooth transitions when the sun goes behind geometry.
        fadeIn: 0.22,
        fadeOut: 0.34,

        transparentOccludes: false
    };

    class SMSunOcclusion {
        constructor(options = {}) {
            this.options = {
                ...DEFAULTS,
                ...options
            };

            this.scene = null;
            this.controller = null;

            this.raycaster =
                new THREE.Raycaster();

            this.candidates = [];

            this.visibility = 1;
            this.targetVisibility = 1;

            this.blocked = false;
            this.lastHit = null;

            this._frame = 0;
            this._lastRefresh = 0;
            this._tmpOrigin =
                new THREE.Vector3();

            this.initialized = false;
        }

        init({
            scene =
                window.scene,
            controller =
                window.smSunController
        } = {}) {
            this.scene =
                scene ||
                this.scene;

            this.controller =
                controller ||
                this.controller;

            if (!this.scene) {
                return false;
            }

            this.refreshCandidates(
                true
            );

            this.initialized = true;

            return true;
        }

        setEnabled(enabled) {
            this.options.enabled =
                !!enabled;

            if (!enabled) {
                this.visibility = 1;
                this.targetVisibility = 1;
                this.blocked = false;
                this.lastHit = null;
            }

            return this.options.enabled;
        }

        _isHierarchyVisible(object) {
            let current =
                object;

            while (current) {
                if (
                    current.visible ===
                    false
                ) {
                    return false;
                }

                current =
                    current.parent;
            }

            return true;
        }

        _shouldIgnore(object) {
            if (
                !object?.isMesh ||
                !object.geometry ||
                !this._isHierarchyVisible(
                    object
                )
            ) {
                return true;
            }

            const data =
                object.userData ||
                {};

            if (
                data.sunOccluder ===
                    false ||
                data.isEditorHelper ===
                    true ||
                data.editorOnly ===
                    true ||
                data.smSunGizmo ===
                    true ||
                data.isHDRSkyProxy ===
                    true ||
                data.isHDRSkyRoot ===
                    true ||
                data.isSMSunRigProxy ===
                    true ||
                data.ignoreSunOcclusion ===
                    true
            ) {
                return true;
            }

            const material =
                object.material;

            const materials =
                Array.isArray(material)
                    ? material
                    : [material];

            const hasVisibleMaterial =
                materials.some(mat => {
                    if (!mat) {
                        return false;
                    }

                    if (
                        mat.visible ===
                        false
                    ) {
                        return false;
                    }

                    if (
                        mat.transparent ===
                            true &&
                        Number(
                            mat.opacity
                        ) <
                            0.35 &&
                        this.options
                            .transparentOccludes !==
                            true
                    ) {
                        return false;
                    }

                    return true;
                });

            return !hasVisibleMaterial;
        }

        refreshCandidates(force = false) {
            const now =
                performance.now() *
                0.001;

            if (
                !force &&
                now -
                    this._lastRefresh <
                    this.options
                        .refreshCandidatesSeconds
            ) {
                return this.candidates;
            }

            const scene =
                this.scene ||
                window.scene;

            if (!scene) {
                return this.candidates;
            }

            const next = [];

            scene.traverse(
                object => {
                    if (
                        !this._shouldIgnore(
                            object
                        )
                    ) {
                        next.push(
                            object
                        );
                    }
                }
            );

            this.candidates =
                next;

            this._lastRefresh =
                now;

            return next;
        }

        _sampleRay(
            camera,
            sunDirection
        ) {
            if (
                !camera ||
                !sunDirection
            ) {
                this.targetVisibility =
                    1;

                this.blocked =
                    false;

                this.lastHit =
                    null;

                return;
            }

            this.refreshCandidates();

            this._tmpOrigin
                .copy(
                    camera.position
                )
                .addScaledVector(
                    sunDirection,
                    this.options
                        .originOffset
                );

            this.raycaster.set(
                this._tmpOrigin,
                sunDirection
            );

            this.raycaster.near =
                0.02;

            this.raycaster.far =
                this.options
                    .maxDistance;

            if (
                camera.layers
            ) {
                this.raycaster.layers.mask =
                    camera.layers.mask;
            }

            const hits =
                this.raycaster
                    .intersectObjects(
                        this.candidates,
                        false
                    );

            const hit =
                hits.find(
                    candidate => {
                        const object =
                            candidate.object;

                        if (
                            !object ||
                            this._shouldIgnore(
                                object
                            )
                        ) {
                            return false;
                        }

                        return true;
                    }
                ) ||
                null;

            this.lastHit =
                hit;

            this.blocked =
                !!hit;

            this.targetVisibility =
                hit
                    ? 0
                    : 1;
        }

        update(
            camera,
            sunDirection,
            delta = 1 / 60
        ) {
            if (
                !this.options.enabled
            ) {
                this.visibility = 1;

                return {
                    visibility: 1,
                    blocked: false,
                    hit: null
                };
            }

            if (!this.initialized) {
                this.init({
                    scene:
                        window.scene,
                    controller:
                        window.smSunController
                });
            }

            this._frame += 1;

            if (
                this._frame %
                    Math.max(
                        1,
                        this.options
                            .checkEveryFrames
                    ) ===
                0
            ) {
                this._sampleRay(
                    camera,
                    sunDirection
                );
            }

            const speed =
                this.targetVisibility >
                this.visibility
                    ? this.options
                        .fadeIn
                    : this.options
                        .fadeOut;

            const alpha =
                1 -
                Math.pow(
                    1 -
                    Math.min(
                        0.98,
                        Math.max(
                            0.001,
                            speed
                        )
                    ),
                    Math.max(
                        1,
                        delta *
                        60
                    )
                );

            this.visibility +=
                (
                    this.targetVisibility -
                    this.visibility
                ) *
                alpha;

            this.visibility =
                Math.min(
                    1,
                    Math.max(
                        0,
                        this.visibility
                    )
                );

            return {
                visibility:
                    this.visibility,

                blocked:
                    this.blocked,

                hit:
                    this.lastHit,

                distance:
                    this.lastHit
                        ?.distance ??
                    Infinity
            };
        }

        debug() {
            console.table({
                Enabled:
                    this.options
                        .enabled,

                Candidates:
                    this.candidates
                        .length,

                Visibility:
                    Number(
                        this.visibility
                            .toFixed(3)
                    ),

                Blocked:
                    this.blocked,

                'Blocking object':
                    this.lastHit
                        ?.object
                        ?.name ||
                    'none',

                Distance:
                    Number.isFinite(
                        this.lastHit
                            ?.distance
                    )
                        ? Number(
                            this.lastHit
                                .distance
                                .toFixed(2)
                        )
                        : '∞'
            });
        }
    }

    window.SMSunOcclusion =
        SMSunOcclusion;

    window.smSunOcclusion =
        window.smSunOcclusion ||
        new SMSunOcclusion();
})();