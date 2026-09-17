/**
 * SM Engine - AdaptiveLODManager
 * Classic non-module build.
 * Screen-space LOD selection with hysteresis, update throttling and geometry-pressure bias.
 */
class AdaptiveLODManager {
    constructor(camera, options = {}) {
        if (!camera) throw new Error("AdaptiveLODManager: camera is required.");
        this.camera = camera;
        this.options = {
            enabled: true,
            updateIntervalMs: 80,
            hysteresis: 0.12,
            viewportHeightProvider: () => window.innerHeight || 1080,
            defaultLevels: [
                { minScreenRadiusPx: 180 },
                { minScreenRadiusPx: 70 },
                { minScreenRadiusPx: 24 },
                { minScreenRadiusPx: 0 }
            ],
            pressureBias: {
                LOW: 0,
                MEDIUM: 0,
                HIGH: 1,
                CRITICAL: 2
            },
            ...options
        };
        this.registry = new Map();
        this._lastUpdate = 0;
        this._cameraPosition = new THREE.Vector3();
        this._worldCenter = new THREE.Vector3();
        this._geometryPressureLevel = "LOW";
        this.stats = {
            registered: 0,
            tested: 0,
            switched: 0,
            lod0: 0,
            lod1: 0,
            lod2: 0,
            lod3Plus: 0
        };
    }

    register(object, levels = null, options = {}) {
        if (!object) return false;
        const normalizedLevels = this._normalizeLevels(object, levels);
        if (normalizedLevels.length === 0) return false;
        const boundsSource = options.boundsSource || this._findBoundsSource(object, normalizedLevels);
        if (!boundsSource?.geometry) return false;
        if (!boundsSource.geometry.boundingSphere && typeof boundsSource.geometry.computeBoundingSphere === "function") {
            boundsSource.geometry.computeBoundingSphere();
        }
        if (!boundsSource.geometry.boundingSphere) return false;
        const record = {
            object,
            levels: normalizedLevels,
            boundsSource,
            currentLevel: -1,
            lastScreenRadiusPx: Infinity,
            importance: Number.isFinite(options.importance) ? Math.max(0.1, options.importance) : 1,
            lodBias: Number.isFinite(options.lodBias) ? Math.round(options.lodBias) : 0,
            alwaysHighDetail: options.alwaysHighDetail === true,
            enabled: options.enabled !== false
        };
        this.registry.set(object.uuid, record);
        this._applyLevel(record, 0, true);
        this.stats.registered = this.registry.size;
        return true;
    }

    unregister(object, restoreHighest = true) {
        if (!object) return false;
        const record = this.registry.get(object.uuid);
        if (!record) return false;
        if (restoreHighest) this._applyLevel(record, 0, true);
        const removed = this.registry.delete(object.uuid);
        this.stats.registered = this.registry.size;
        return removed;
    }

    update(force = false) {
        if (!this.options.enabled) return this.stats;
        const now = performance.now();
        if (!force && now - this._lastUpdate < this.options.updateIntervalMs) return this.stats;
        this._lastUpdate = now;
        this.camera.updateMatrixWorld();
        this._cameraPosition.setFromMatrixPosition(this.camera.matrixWorld);
        let tested = 0;
        let switched = 0;
        let lod0 = 0;
        let lod1 = 0;
        let lod2 = 0;
        let lod3Plus = 0;
        for (const [uuid, record] of this.registry) {
            if (!record.object || (!record.object.parent && !record.object.isScene)) {
                this.registry.delete(uuid);
                continue;
            }
            if (!record.enabled) continue;
            tested++;
            if (record.alwaysHighDetail) {
                if (record.currentLevel !== 0) {
                    this._applyLevel(record, 0);
                    switched++;
                }
                lod0++;
                continue;
            }
            const screenRadiusPx = this._getProjectedRadiusPx(record);
            record.lastScreenRadiusPx = screenRadiusPx;
            let desiredLevel = this._selectLevel(record, screenRadiusPx);
            const pressureBias = this.options.pressureBias[this._geometryPressureLevel] || 0;
            desiredLevel += pressureBias + record.lodBias;
            desiredLevel = THREE.MathUtils.clamp(desiredLevel, 0, record.levels.length - 1);
            desiredLevel = this._applyHysteresis(record, desiredLevel, screenRadiusPx);
            if (desiredLevel !== record.currentLevel) {
                this._applyLevel(record, desiredLevel);
                switched++;
            }
            if (record.currentLevel <= 0) lod0++;
            else if (record.currentLevel === 1) lod1++;
            else if (record.currentLevel === 2) lod2++;
            else lod3Plus++;
        }
        this.stats.registered = this.registry.size;
        this.stats.tested = tested;
        this.stats.switched = switched;
        this.stats.lod0 = lod0;
        this.stats.lod1 = lod1;
        this.stats.lod2 = lod2;
        this.stats.lod3Plus = lod3Plus;
        return this.stats;
    }

    _normalizeLevels(object, levels) {
        let source = levels;
        if (!Array.isArray(source) || source.length === 0) {
            if (object.isLOD && Array.isArray(object.levels) && object.levels.length > 0) {
                source = object.levels.map((entry, index) => ({
                    object: entry.object,
                    minScreenRadiusPx: this.options.defaultLevels[index]?.minScreenRadiusPx ?? 0
                }));
            } else if (Array.isArray(object.userData?.lodLevels)) {
                source = object.userData.lodLevels;
            } else {
                source = [object];
            }
        }
        const normalized = source.map((entry, index) => {
            if (entry?.isObject3D) {
                return {
                    object: entry,
                    minScreenRadiusPx: this.options.defaultLevels[index]?.minScreenRadiusPx ?? 0
                };
            }
            return {
                object: entry.object,
                minScreenRadiusPx: Number.isFinite(entry.minScreenRadiusPx)
                    ? Math.max(0, entry.minScreenRadiusPx)
                    : (this.options.defaultLevels[index]?.minScreenRadiusPx ?? 0)
            };
        }).filter(entry => entry.object?.isObject3D);
        normalized.sort((a, b) => b.minScreenRadiusPx - a.minScreenRadiusPx);
        if (normalized.length > 0) normalized[normalized.length - 1].minScreenRadiusPx = 0;
        return normalized;
    }

    _findBoundsSource(object, levels) {
        if (object.isMesh && object.geometry) return object;
        for (const level of levels) {
            if (level.object?.isMesh && level.object.geometry) return level.object;
            let found = null;
            level.object?.traverse?.(child => {
                if (!found && child.isMesh && child.geometry) found = child;
            });
            if (found) return found;
        }
        let fallback = null;
        object.traverse?.(child => {
            if (!fallback && child.isMesh && child.geometry) fallback = child;
        });
        return fallback;
    }

    _getProjectedRadiusPx(record) {
        const source = record.boundsSource;
        const sphere = source.geometry.boundingSphere;
        source.updateWorldMatrix(true, false);
        this._worldCenter.copy(sphere.center).applyMatrix4(source.matrixWorld);
        const radius = sphere.radius * this._maxWorldScale(source) * record.importance;
        const distance = Math.max(0.0001, this._cameraPosition.distanceTo(this._worldCenter));
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

    _selectLevel(record, screenRadiusPx) {
        for (let i = 0; i < record.levels.length; i++) {
            if (screenRadiusPx >= record.levels[i].minScreenRadiusPx) return i;
        }
        return record.levels.length - 1;
    }

    _applyHysteresis(record, desiredLevel, screenRadiusPx) {
        if (record.currentLevel < 0 || desiredLevel === record.currentLevel) return desiredLevel;
        const hysteresis = Math.max(0, this.options.hysteresis);
        if (desiredLevel > record.currentLevel) {
            const next = record.levels[Math.min(desiredLevel, record.levels.length - 1)];
            const threshold = next.minScreenRadiusPx * (1 - hysteresis);
            if (screenRadiusPx > threshold) return record.currentLevel;
        } else {
            const current = record.levels[Math.max(record.currentLevel, 0)];
            const threshold = current.minScreenRadiusPx * (1 + hysteresis);
            if (screenRadiusPx < threshold) return record.currentLevel;
        }
        return desiredLevel;
    }

    _applyLevel(record, levelIndex, force = false) {
        if (!force && record.currentLevel === levelIndex) return;
        for (let i = 0; i < record.levels.length; i++) {
            record.levels[i].object.visible = i === levelIndex;
        }
        record.currentLevel = levelIndex;
        record.object.userData ||= {};
        record.object.userData.__smLODLevel = levelIndex;
    }

    _maxWorldScale(object) {
        const e = object.matrixWorld.elements;
        const sx = Math.hypot(e[0], e[1], e[2]);
        const sy = Math.hypot(e[4], e[5], e[6]);
        const sz = Math.hypot(e[8], e[9], e[10]);
        return Math.max(sx, sy, sz, 0.0001);
    }

    setGeometryPressure(level) {
        const normalized = String(level || "LOW").toUpperCase();
        this._geometryPressureLevel = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalized) ? normalized : "LOW";
    }

    setEnabled(enabled) {
        this.options.enabled = !!enabled;
    }

    getObjectState(object) {
        if (!object) return null;
        const record = this.registry.get(object.uuid);
        if (!record) return null;
        return {
            currentLevel: record.currentLevel,
            screenRadiusPx: record.lastScreenRadiusPx,
            levelCount: record.levels.length
        };
    }

    getStats() {
        return { ...this.stats, pressureLevel: this._geometryPressureLevel };
    }

    destroy() {
        for (const record of this.registry.values()) this._applyLevel(record, 0, true);
        this.registry.clear();
    }
}

window.AdaptiveLODManager = AdaptiveLODManager;