/**
 * SM Engine - VisibilityManager
 * Classic non-module build.
 * Adds frustum, distance and tiny-screen-object culling while preserving external visibility state.
 */
class VisibilityManager {
    constructor(scene, camera, options = {}) {
        if (!scene || !camera) throw new Error("VisibilityManager: scene and camera are required.");
        this.scene = scene;
        this.camera = camera;
        this.options = {
            enabled: true,
            autoRegister: true,
            scanIntervalMs: 1000,
            updateIntervalMs: 50,
            maxDistance: Infinity,
            minProjectedRadiusPx: 0.75,

            /*
             * EDITOR-SAFE DEFAULT
             * -------------------
             * Three.js already performs renderer-side frustum culling without
             * mutating Object3D.visible. Keeping this false prevents camera
             * rotation from flipping Outliner visibility icons.
             *
             * Runtime code may opt in explicitly if it really needs manual
             * visible=false frustum gating.
             */
            manualFrustumVisibility: false,

            viewportHeightProvider: () => window.innerHeight || 1080,
            ...options
        };
        this.registry = new Map();
        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        this._cameraPosition = new THREE.Vector3();
        this._worldCenter = new THREE.Vector3();
        this._lastScan = 0;
        this._lastUpdate = 0;
        this.stats = {
            registered: 0,
            tested: 0,
            visible: 0,
            frustumCulled: 0,
            distanceCulled: 0,
            screenSizeCulled: 0
        };
        if (this.options.autoRegister) this.registerScene();
    }

    _isTerrainObject(object) {
        if (!object) return false;

        const data = object.userData || {};
        const name = String(object.name || "");

        if (
            object === window.terrain ||
            data.isTerrain === true ||
            data.isTerrainMesh === true ||
            data.isTerrainComponent === true ||
            data.terrainSurface === true ||
            data.workspaceOnly === "TERRAIN"
        ) {
            return true;
        }

        let parent = object.parent;

        while (parent) {
            const parentData = parent.userData || {};

            if (
                parent === window.terrain ||
                parentData.isTerrain === true ||
                parentData.isTerrainMesh === true ||
                parentData.isTerrainComponent === true ||
                parentData.terrainSurface === true ||
                parentData.workspaceOnly === "TERRAIN"
            ) {
                return true;
            }

            parent = parent.parent;
        }

        return (
            name === "Terrain" ||
            name === "Terrain_Mesh" ||
            name.startsWith("TerrainComponent_") ||
            name.startsWith("Terrain_")
        );
    }

    registerScene(root = this.scene) {
        root.traverse(object => {
            if (object && (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh)) this.registerObject(object);
        });
        this.stats.registered = this.registry.size;
        return this.registry.size;
    }

    registerObject(object, options = {}) {
        if (!object || !object.geometry) return false;

        this._ensureBoundingSphere(object.geometry);

        const meta = this._ensureOptimizationMeta(object);

        const isTerrain =
            this._isTerrainObject(object);

        const requestedMaxDistance =
            Number.isFinite(options.maxDistance)
                ? options.maxDistance
                : this.options.maxDistance;

        const requestedMinProjectedRadius =
            Number.isFinite(options.minProjectedRadiusPx)
                ? options.minProjectedRadiusPx
                : this.options.minProjectedRadiusPx;

        const requestedAlwaysVisible =
            options.alwaysVisible === true;

        /*
         * TERRAIN CONTRACT
         * ----------------
         * Terrain components are continuous landscape pieces, not disposable
         * props. Screen-size/distance culling individual components creates
         * visible holes in the landscape when the camera is far away.
         *
         * Three.js keeps its normal geometry frustum culling; this manager only
         * stops applying its extra per-component screen-size/distance/frustum
         * visibility reasons to terrain meshes.
         */
        const alwaysVisible =
            isTerrain ||
            requestedAlwaysVisible;

        const maxDistance =
            isTerrain
                ? Infinity
                : requestedMaxDistance;

        const minProjectedRadiusPx =
            isTerrain
                ? 0
                : requestedMinProjectedRadius;

        let record =
            this.registry.get(object.uuid);

        if (!record) {
            record = {
                object,
                maxDistance,
                minProjectedRadiusPx,
                alwaysVisible
            };

            this.registry.set(
                object.uuid,
                record
            );
        } else {
            /*
             * IMPORTANT:
             * autoRegister scans the scene repeatedly. Update an existing
             * record too, otherwise terrain meshes registered before their
             * terrain tags were added would stay stuck with the old culling
             * thresholds forever.
             */
            record.object = object;
            record.maxDistance = maxDistance;
            record.minProjectedRadiusPx =
                minProjectedRadiusPx;
            record.alwaysVisible =
                alwaysVisible;
        }

        /*
         * CRITICAL VISIBILITY OWNERSHIP FIX
         * ---------------------------------
         * autoRegister calls registerScene() repeatedly. A mesh may currently
         * have object.visible === false ONLY because this manager culled it on
         * the previous update (frustum/distance/screen-size/occlusion).
         *
         * Never promote that temporary managed false value into baseVisible.
         * Otherwise the object becomes permanently hidden after it spends one
         * scan interval outside the camera view.
         *
         * Only sample object.visible when no optimization reason currently owns
         * the hidden state. This keeps external/workspace visibility changes
         * working while allowing culled meshes to become visible again.
         */
        if (!this._isOptimizationHidden(object)) {
            meta.baseVisible =
                object.visible !== false;
        }

        if (isTerrain) {
            meta.reasons.frustum = false;
            meta.reasons.distance = false;
            meta.reasons.screenSize = false;

            this._syncVisibility(object);
        }

        this.stats.registered =
            this.registry.size;

        return true;
    }

    unregisterObject(object, restore = true) {
        if (!object) return false;
        const record = this.registry.get(object.uuid);
        if (!record) return false;
        if (restore) this._setReason(object, "frustum", false), this._setReason(object, "distance", false), this._setReason(object, "screenSize", false);
        const deleted = this.registry.delete(object.uuid);
        this.stats.registered = this.registry.size;
        return deleted;
    }

    update(force = false) {
        if (!this.options.enabled) {
            this.restoreAll();
            return this.stats;
        }
        const now = performance.now();
        if (this.options.autoRegister && now - this._lastScan >= this.options.scanIntervalMs) {
            this._lastScan = now;
            this.registerScene();
            this._removeDetachedObjects();
        }
        if (!force && now - this._lastUpdate < this.options.updateIntervalMs) return this.stats;
        this._lastUpdate = now;
        this.camera.updateMatrixWorld();
        this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
        this._cameraPosition.setFromMatrixPosition(this.camera.matrixWorld);
        let tested = 0;
        let visible = 0;
        let frustumCulled = 0;
        let distanceCulled = 0;
        let screenSizeCulled = 0;
        for (const record of this.registry.values()) {
            const object = record.object;
            if (!object || !object.parent || !object.geometry) continue;
            const meta = this._ensureOptimizationMeta(object);
            if (!this._isOptimizationHidden(object)) meta.baseVisible = object.visible !== false;
            if (!meta.baseVisible) {
                this._syncVisibility(object);
                continue;
            }
            if (record.alwaysVisible) {
                this._setReason(
                    object,
                    "frustum",
                    false
                );

                this._setReason(
                    object,
                    "distance",
                    false
                );

                this._setReason(
                    object,
                    "screenSize",
                    false
                );

                if (this._syncVisibility(object)) {
                    visible++;
                }

                continue;
            }
            tested++;
            object.updateWorldMatrix(true, false);
            const sphere = object.geometry.boundingSphere;
            if (!sphere) continue;
            this._worldCenter.copy(sphere.center).applyMatrix4(object.matrixWorld);
            const worldRadius = sphere.radius * this._maxWorldScale(object);
            const insideFrustum = this.frustum.intersectsSphere(new THREE.Sphere(this._worldCenter, worldRadius));
            const distance = this._cameraPosition.distanceTo(this._worldCenter);
            const distanceCulledNow = Number.isFinite(record.maxDistance) && distance - worldRadius > record.maxDistance;
            const projectedRadiusPx = this._estimateProjectedRadiusPx(worldRadius, distance);
            const tinyNow = projectedRadiusPx >= 0 && projectedRadiusPx < record.minProjectedRadiusPx;
            /*
             * Never use Object3D.visible as the default frustum-culling channel.
             * renderer/Three.js owns ordinary frustum rejection through
             * Object3D.frustumCulled. We still measure insideFrustum for stats.
             */
            this._setReason(
                object,
                "frustum",
                this.options.manualFrustumVisibility === true &&
                    !insideFrustum
            );
            this._setReason(object, "distance", distanceCulledNow);
            this._setReason(object, "screenSize", tinyNow);
            if (!insideFrustum) frustumCulled++;
            if (distanceCulledNow) distanceCulled++;
            if (tinyNow) screenSizeCulled++;
            if (this._syncVisibility(object)) visible++;
        }
        this.stats.tested = tested;
        this.stats.visible = visible;
        this.stats.frustumCulled = frustumCulled;
        this.stats.distanceCulled = distanceCulled;
        this.stats.screenSizeCulled = screenSizeCulled;
        return this.stats;
    }

    _estimateProjectedRadiusPx(radius, distance) {
        if (!Number.isFinite(distance) || distance <= 0) return Infinity;
        const viewportHeight = Math.max(1, Number(this.options.viewportHeightProvider()) || 1080);
        if (this.camera.isPerspectiveCamera) {
            const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
            const focalLengthPx = viewportHeight / (2 * Math.tan(fovRad * 0.5));
            return (radius / distance) * focalLengthPx;
        }
        if (this.camera.isOrthographicCamera) {
            const worldHeight = Math.abs(this.camera.top - this.camera.bottom) / Math.max(this.camera.zoom || 1, 0.0001);
            return worldHeight > 0 ? (radius / worldHeight) * viewportHeight : Infinity;
        }
        return Infinity;
    }

    _maxWorldScale(object) {
        const e = object.matrixWorld.elements;
        const sx = Math.hypot(e[0], e[1], e[2]);
        const sy = Math.hypot(e[4], e[5], e[6]);
        const sz = Math.hypot(e[8], e[9], e[10]);
        return Math.max(sx, sy, sz, 0.0001);
    }

    _ensureBoundingSphere(geometry) {
        if (geometry && !geometry.boundingSphere && typeof geometry.computeBoundingSphere === "function") geometry.computeBoundingSphere();
    }

    _ensureOptimizationMeta(object) {
        object.userData ||= {};

        object.userData.__smOptimization ||= {
            baseVisible:
                object.visible !== false,
            reasons: {
                frustum: false,
                distance: false,
                screenSize: false,
                occlusion: false
            }
        };

        const meta =
            object.userData.__smOptimization;

        meta.reasons ||= {};
        meta.reasons.frustum ??= false;
        meta.reasons.distance ??= false;
        meta.reasons.screenSize ??= false;
        meta.reasons.occlusion ??= false;

        if (typeof meta.baseVisible !== "boolean") {
            meta.baseVisible =
                object.visible !== false;
        }

        return meta;
    }

    _isOptimizationHidden(object) {
        const meta = this._ensureOptimizationMeta(object);
        return Object.values(meta.reasons).some(Boolean);
    }

    _setReason(object, reason, hidden) {
        const meta = this._ensureOptimizationMeta(object);
        meta.reasons[reason] = !!hidden;
        this._syncVisibility(object);
    }

    _syncVisibility(object) {
        const meta = this._ensureOptimizationMeta(object);
        const hidden = Object.values(meta.reasons).some(Boolean);
        object.visible = meta.baseVisible && !hidden;
        return object.visible;
    }

    _removeDetachedObjects() {
        for (const [uuid, record] of this.registry) {
            if (!record.object || (!record.object.parent && record.object !== this.scene)) this.registry.delete(uuid);
        }
        this.stats.registered = this.registry.size;
    }

    /**
     * Repairs objects that may have been permanently hidden by an older
     * VisibilityManager build. Call once after hot-replacing this file if the
     * current page session already contains poisoned baseVisible=false values.
     *
     * Workspace/system objects that are intentionally hidden remain untouched
     * when their optimization metadata is not currently culling them.
     */
    repairManagedVisibility() {
        let repaired = 0;

        for (const record of this.registry.values()) {
            const object = record?.object;

            if (!object) {
                continue;
            }

            const meta =
                this._ensureOptimizationMeta(object);

            const managedHidden =
                Object.values(meta.reasons)
                    .some(Boolean);

            /*
             * The characteristic poisoned state from the old bug is:
             * - baseVisible === false
             * - at least one optimization reason is/was active.
             *
             * If the manager currently owns the hidden state, restore the base
             * to true and let the active reasons decide present visibility.
             */
            if (
                meta.baseVisible === false &&
                managedHidden
            ) {
                meta.baseVisible = true;
                repaired++;
            }

            this._syncVisibility(object);
        }

        return repaired;
    }

    restoreAll() {
        for (const record of this.registry.values()) {
            const object = record.object;
            if (!object) continue;
            this._setReason(object, "frustum", false);
            this._setReason(object, "distance", false);
            this._setReason(object, "screenSize", false);
        }
    }

    setEnabled(enabled) {
        this.options.enabled = !!enabled;
        if (!this.options.enabled) this.restoreAll();
    }

    setManualFrustumVisibility(enabled) {
        this.options.manualFrustumVisibility =
            enabled === true;

        if (!this.options.manualFrustumVisibility) {
            for (const record of this.registry.values()) {
                const object = record?.object;
                if (!object) continue;
                this._setReason(object, "frustum", false);
            }
        }

        return this.options.manualFrustumVisibility;
    }

    getStats() {
        return {
            ...this.stats,
            manualFrustumVisibility:
                this.options.manualFrustumVisibility === true
        };
    }

    destroy() {
        this.restoreAll();
        this.registry.clear();
    }
}

window.VisibilityManager = VisibilityManager;