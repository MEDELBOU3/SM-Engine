/**
 * SM Engine - OcclusionManager
 * Classic non-module build.
 * Time-sliced CPU occlusion checks designed to complement VisibilityManager.
 * Occluders should be large static meshes such as walls, buildings and terrain chunks.
 */
class OcclusionManager {
    constructor(scene, camera, options = {}) {
        if (!scene || !camera) throw new Error("OcclusionManager: scene and camera are required.");
        this.scene = scene;
        this.camera = camera;
        this.options = {
            enabled: true,
            updateIntervalMs: 80,
            maxChecksPerUpdate: 24,
            nearSkipDistance: 4,
            distanceMargin: 0.75,
            occludedFramesRequired: 2,
            visibleFramesRequired: 1,
            recursiveOccluders: false,
            ...options
        };
        this.candidates = [];
        this.occluders = [];
        this._candidateSet = new Set();
        this._occluderSet = new Set();
        this._cursor = 0;
        this._lastUpdate = 0;
        this.raycaster = new THREE.Raycaster();
        this._cameraPosition = new THREE.Vector3();
        this._targetCenter = new THREE.Vector3();
        this._direction = new THREE.Vector3();
        this._tmpSphere = new THREE.Sphere();
        this.state = new Map();
        this.stats = {
            candidates: 0,
            occluders: 0,
            checks: 0,
            occluded: 0,
            skipped: 0
        };
    }

    addCandidate(object) {
        if (!object || !object.geometry || this._candidateSet.has(object.uuid)) return false;
        this._ensureBoundingSphere(object.geometry);
        this._candidateSet.add(object.uuid);
        this.candidates.push(object);
        this.state.set(object.uuid, {
            occludedStreak: 0,
            visibleStreak: 0
        });
        this.stats.candidates = this.candidates.length;
        return true;
    }

    removeCandidate(object, restore = true) {
        if (!object || !this._candidateSet.has(object.uuid)) return false;
        this._candidateSet.delete(object.uuid);
        const index = this.candidates.indexOf(object);
        if (index >= 0) this.candidates.splice(index, 1);
        if (restore) this._setOcclusionHidden(object, false);
        this.state.delete(object.uuid);
        this.stats.candidates = this.candidates.length;
        this._cursor = Math.min(this._cursor, Math.max(0, this.candidates.length - 1));
        return true;
    }

    addOccluder(object) {
        if (!object || !object.geometry || this._occluderSet.has(object.uuid)) return false;
        this._ensureBoundingSphere(object.geometry);
        this._occluderSet.add(object.uuid);
        this.occluders.push(object);
        this.stats.occluders = this.occluders.length;
        return true;
    }

    removeOccluder(object) {
        if (!object || !this._occluderSet.has(object.uuid)) return false;
        this._occluderSet.delete(object.uuid);
        const index = this.occluders.indexOf(object);
        if (index >= 0) this.occluders.splice(index, 1);
        this.stats.occluders = this.occluders.length;
        return true;
    }

    add(object, { isOccluder = false, isCandidate = true } = {}) {
        let added = false;
        if (isCandidate) added = this.addCandidate(object) || added;
        if (isOccluder) added = this.addOccluder(object) || added;
        return added;
    }

    update(force = false) {
        if (!this.options.enabled) {
            this.restoreAll();
            return this.stats;
        }
        if (this.candidates.length === 0 || this.occluders.length === 0) return this.stats;
        const now = performance.now();
        if (!force && now - this._lastUpdate < this.options.updateIntervalMs) return this.stats;
        this._lastUpdate = now;
        this.camera.updateMatrixWorld();
        this._cameraPosition.setFromMatrixPosition(this.camera.matrixWorld);
        const maxChecks = Math.min(this.options.maxChecksPerUpdate, this.candidates.length);
        let checks = 0;
        let occluded = 0;
        let skipped = 0;
        for (let i = 0; i < maxChecks; i++) {
            if (this._cursor >= this.candidates.length) this._cursor = 0;
            const object = this.candidates[this._cursor++];
            if (!object || !object.parent || !object.geometry) {
                skipped++;
                continue;
            }
            const meta = this._ensureOptimizationMeta(object);
            if (!meta.baseVisible) {
                this._setOcclusionHidden(object, false);
                skipped++;
                continue;
            }
            const hiddenByNonOcclusion = meta.reasons.frustum || meta.reasons.distance || meta.reasons.screenSize;
            if (hiddenByNonOcclusion) {
                this._setOcclusionHidden(object, false);
                skipped++;
                continue;
            }
            object.updateWorldMatrix(true, false);
            const sphere = object.geometry.boundingSphere;
            if (!sphere) {
                skipped++;
                continue;
            }
            this._targetCenter.copy(sphere.center).applyMatrix4(object.matrixWorld);
            const targetDistance = this._cameraPosition.distanceTo(this._targetCenter);
            if (targetDistance <= this.options.nearSkipDistance) {
                this._registerResult(object, false);
                checks++;
                continue;
            }
            this._direction.copy(this._targetCenter).sub(this._cameraPosition);
            const rayLength = this._direction.length();
            if (rayLength <= 0.0001) {
                this._registerResult(object, false);
                checks++;
                continue;
            }
            this._direction.multiplyScalar(1 / rayLength);
            this.raycaster.set(this._cameraPosition, this._direction);
            this.raycaster.near = 0.01;
            this.raycaster.far = Math.max(0.01, targetDistance - this.options.distanceMargin);
            const intersections = this.raycaster.intersectObjects(this.occluders, this.options.recursiveOccluders);
            let isOccluded = false;
            if (intersections.length > 0) {
                for (let hitIndex = 0; hitIndex < intersections.length; hitIndex++) {
                    const hit = intersections[hitIndex];
                    if (!hit.object || hit.object === object || this._isDescendantOf(hit.object, object)) continue;
                    if (hit.distance < targetDistance - this.options.distanceMargin) {
                        isOccluded = true;
                        break;
                    }
                }
            }
            this._registerResult(object, isOccluded);
            if (isOccluded) occluded++;
            checks++;
        }
        this.stats.checks = checks;
        this.stats.occluded = occluded;
        this.stats.skipped = skipped;
        this.stats.candidates = this.candidates.length;
        this.stats.occluders = this.occluders.length;
        return this.stats;
    }

    _registerResult(object, isOccluded) {
        let state = this.state.get(object.uuid);
        if (!state) {
            state = { occludedStreak: 0, visibleStreak: 0 };
            this.state.set(object.uuid, state);
        }
        if (isOccluded) {
            state.occludedStreak++;
            state.visibleStreak = 0;
            if (state.occludedStreak >= this.options.occludedFramesRequired) {
                this._setOcclusionHidden(object, true);
            }
        } else {
            state.visibleStreak++;
            state.occludedStreak = 0;
            if (state.visibleStreak >= this.options.visibleFramesRequired) {
                this._setOcclusionHidden(object, false);
            }
        }
    }

    _ensureBoundingSphere(geometry) {
        if (geometry && !geometry.boundingSphere && typeof geometry.computeBoundingSphere === "function") geometry.computeBoundingSphere();
    }

    _ensureOptimizationMeta(object) {
        object.userData ||= {};
        object.userData.__smOptimization ||= {
            baseVisible: object.visible !== false,
            reasons: {
                frustum: false,
                distance: false,
                screenSize: false,
                occlusion: false
            }
        };
        object.userData.__smOptimization.reasons ||= {};
        object.userData.__smOptimization.reasons.frustum ??= false;
        object.userData.__smOptimization.reasons.distance ??= false;
        object.userData.__smOptimization.reasons.screenSize ??= false;
        object.userData.__smOptimization.reasons.occlusion ??= false;
        return object.userData.__smOptimization;
    }

    _setOcclusionHidden(object, hidden) {
        const meta = this._ensureOptimizationMeta(object);
        meta.reasons.occlusion = !!hidden;
        const shouldHide = Object.values(meta.reasons).some(Boolean);
        object.visible = meta.baseVisible && !shouldHide;
    }

    _isDescendantOf(object, parent) {
        let current = object;
        while (current) {
            if (current === parent) return true;
            current = current.parent;
        }
        return false;
    }

    restoreAll() {
        for (let i = 0; i < this.candidates.length; i++) {
            this._setOcclusionHidden(this.candidates[i], false);
        }
    }

    setEnabled(enabled) {
        this.options.enabled = !!enabled;
        if (!this.options.enabled) this.restoreAll();
    }

    getStats() {
        return { ...this.stats };
    }

    destroy() {
        this.restoreAll();
        this.candidates.length = 0;
        this.occluders.length = 0;
        this._candidateSet.clear();
        this._occluderSet.clear();
        this.state.clear();
    }
}

window.OcclusionManager = OcclusionManager;