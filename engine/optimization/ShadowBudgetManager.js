/**
 * SM Engine - ShadowBudgetManager
 * Classic non-module build.
 *
 * Adaptive shadow quality controller with per-light priorities.
 * FIXED:
 * - Respects live user-authored castShadow changes.
 * - Does not permanently force a light back to the state it had at registration.
 * - Adds setLightShadowEnabled() for LightingPanel / managed lights.
 */
class ShadowBudgetManager {
    constructor(scene, options = {}) {
        if (!scene) throw new Error("ShadowBudgetManager: scene is required.");

        this.scene = scene;

        this.options = {
            enabled: true,
            updateIntervalMs: 600,
            targetFPS: 60,
            minFPS: 40,
            maxShadowLights: 4,

            qualityLevels: {
                ultra: 2048,
                high: 2048,
                medium: 1024,
                low: 512
            },

            defaultPriority: 1,
            distanceWeight: 1,
            priorityWeight: 35,
            directionalBonus: 60,
            spotBonus: 25,
            pointPenalty: 20,

            ...options
        };

        this.registry = new Map();
        this._lastUpdate = 0;
        this._camera = null;

        this._cameraPosition = new THREE.Vector3();
        this._lightPosition = new THREE.Vector3();

        this._qualityLevel = "ultra";

        this.stats = {
            registeredLights: 0,
            requestedShadowLights: 0,
            activeShadowLights: 0,
            disabledByBudget: 0,
            shadowMapSize: this.options.qualityLevels.ultra,
            qualityLevel: "ultra"
        };

        this.registerScene();
    }

    setCamera(camera) {
        this._camera = camera || null;
    }

    registerScene(root = this.scene) {
        root.traverse((object) => {
            if (object?.isLight && object.shadow) {
                this.registerLight(object);
            }
        });

        this.stats.registeredLights = this.registry.size;
        return this.registry.size;
    }

    registerLight(light, options = {}) {
        if (!light?.isLight || !light.shadow) return false;

        const existing = this.registry.get(light.uuid);

        if (existing) {
            if (Number.isFinite(options.priority)) {
                existing.priority = options.priority;
            }

            if (options.forceShadow !== undefined) {
                existing.forceShadow = !!options.forceShadow;
            }

            if (options.allowBudgetDisable !== undefined) {
                existing.allowBudgetDisable = !!options.allowBudgetDisable;
            }

            return true;
        }

        light.userData = light.userData || {};

        const requestedCastShadow =
            typeof light.userData.shadowRequested === "boolean"
                ? light.userData.shadowRequested
                : !!light.castShadow;

        light.userData.shadowRequested = requestedCastShadow;

        const record = {
            light,

            original: {
                mapWidth: light.shadow.mapSize.width,
                mapHeight: light.shadow.mapSize.height,
                bias: light.shadow.bias,
                normalBias: light.shadow.normalBias,
                radius: light.shadow.radius
            },

            requestedCastShadow,

            // Used to distinguish a user/UI change from our own budget change.
            lastAppliedCastShadow: !!light.castShadow,

            priority: Number.isFinite(options.priority)
                ? options.priority
                : Number.isFinite(light.userData?.shadowPriority)
                    ? light.userData.shadowPriority
                    : this.options.defaultPriority,

            forceShadow:
                options.forceShadow === true ||
                light.userData?.forceShadow === true,

            allowBudgetDisable:
                options.allowBudgetDisable !== undefined
                    ? !!options.allowBudgetDisable
                    : light.userData?.allowShadowBudgetDisable !== false
        };

        this.registry.set(light.uuid, record);

        this.stats.registeredLights = this.registry.size;
        return true;
    }

    unregisterLight(light, restore = true) {
        if (!light) return false;

        const record = this.registry.get(light.uuid);
        if (!record) return false;

        if (restore) {
            this._restoreRecord(record);
        }

        const removed = this.registry.delete(light.uuid);

        this.stats.registeredLights = this.registry.size;
        return removed;
    }

    update(metrics = null, force = false) {
        if (!this.options.enabled) {
            this.restoreAll();
            return this.stats;
        }

        const now = performance.now();

        if (
            !force &&
            now - this._lastUpdate < this.options.updateIntervalMs
        ) {
            return this.stats;
        }

        this._lastUpdate = now;

        this.registerScene();
        this._removeDetachedLights();

        const fps = this._extractFPS(metrics);
        const desiredQuality = this._chooseQuality(fps);

        if (desiredQuality !== this._qualityLevel) {
            this._qualityLevel = desiredQuality;

            this._applyShadowMapSize(
                this.options.qualityLevels[desiredQuality]
            );
        }

        const ranked = [];

        if (this._camera) {
            this._camera.updateMatrixWorld();
            this._cameraPosition.setFromMatrixPosition(
                this._camera.matrixWorld
            );
        }

        let requestedShadowLights = 0;

        for (const record of this.registry.values()) {
            const light = record.light;

            if (!light) continue;

            // Detect direct changes made by LightingPanel or other engine code.
            // If castShadow differs from what this manager applied last time,
            // treat the new value as the user's desired state.
            const liveCastShadow = !!light.castShadow;

            if (liveCastShadow !== record.lastAppliedCastShadow) {
                record.requestedCastShadow = liveCastShadow;

                light.userData = light.userData || {};
                light.userData.shadowRequested = liveCastShadow;
            }

            if (
                record.requestedCastShadow ||
                record.forceShadow
            ) {
                requestedShadowLights++;
            }

            if (!light.visible) continue;

            const score = this._scoreLight(record);

            ranked.push({
                record,
                score
            });
        }

        ranked.sort((a, b) => b.score - a.score);

        let shadowSlots = Math.max(
            0,
            this.options.maxShadowLights | 0
        );

        let active = 0;
        let disabledByBudget = 0;

        for (const item of ranked) {
            const record = item.record;
            const light = record.light;

            const requested =
                record.forceShadow ||
                record.requestedCastShadow === true;

            if (!requested) {
                this._applyCastShadow(record, false);
                continue;
            }

            if (record.forceShadow) {
                this._applyCastShadow(record, true);
                active++;
                continue;
            }

            if (!record.allowBudgetDisable) {
                this._applyCastShadow(record, true);
                active++;
                continue;
            }

            if (shadowSlots > 0) {
                this._applyCastShadow(record, true);
                shadowSlots--;
                active++;
            } else {
                this._applyCastShadow(record, false);
                disabledByBudget++;
            }
        }

        this.stats.registeredLights = this.registry.size;
        this.stats.requestedShadowLights = requestedShadowLights;
        this.stats.activeShadowLights = active;
        this.stats.disabledByBudget = disabledByBudget;
        this.stats.shadowMapSize =
            this.options.qualityLevels[this._qualityLevel];
        this.stats.qualityLevel = this._qualityLevel;

        return this.stats;
    }

    _applyCastShadow(record, enabled) {
        const light = record?.light;
        if (!light) return;

        const state = !!enabled;

        if (light.castShadow !== state) {
            light.castShadow = state;

            if (light.shadow) {
                light.shadow.needsUpdate = true;
            }
        }

        record.lastAppliedCastShadow = state;
    }

    _scoreLight(record) {
        const light = record.light;

        let score =
            record.priority *
            this.options.priorityWeight;

        if (light.isDirectionalLight) {
            score += this.options.directionalBonus;
        }

        if (light.isSpotLight) {
            score += this.options.spotBonus;
        }

        if (light.isPointLight) {
            score -= this.options.pointPenalty;
        }

        if (this._camera) {
            light.updateMatrixWorld();

            this._lightPosition.setFromMatrixPosition(
                light.matrixWorld
            );

            const distance =
                this._cameraPosition.distanceTo(
                    this._lightPosition
                );

            score -=
                distance *
                this.options.distanceWeight;
        }

        if (record.forceShadow) {
            score += 100000;
        }

        return score;
    }

    _chooseQuality(fps) {
        if (!Number.isFinite(fps)) {
            return this._qualityLevel;
        }

        if (fps < this.options.minFPS) {
            return "low";
        }

        if (fps < this.options.targetFPS - 10) {
            return "medium";
        }

        if (fps < this.options.targetFPS - 3) {
            return "high";
        }

        return "ultra";
    }

    _applyShadowMapSize(size) {
        if (!Number.isFinite(size) || size <= 0) return;

        const safeSize = Math.max(
            256,
            Math.floor(size)
        );

        for (const record of this.registry.values()) {
            const light = record.light;

            if (!light?.shadow) continue;

            // PointLight uses a cube shadow map and is much more expensive.
            // Keep it one step below the common budget.
            let typeSize = light.isPointLight
                ? Math.max(256, Math.floor(safeSize * 0.5))
                : safeSize;

            // The single global sun is the visual anchor for contact shadows.
            // Keep its map readable even when adaptive quality reduces local
            // point/spot lights after an FPS dip.
            const minimumSize = Number(light.userData?.minShadowMapSize) ||
                (light.isDirectionalLight ? 2048 : 256);
            typeSize = Math.max(typeSize, minimumSize);

            if (
                light.shadow.mapSize.width === typeSize &&
                light.shadow.mapSize.height === typeSize
            ) {
                continue;
            }

            light.shadow.mapSize.set(
                typeSize,
                typeSize
            );

            light.shadow.map?.dispose?.();
            light.shadow.map = null;
            light.shadow.needsUpdate = true;
        }
    }

    _extractFPS(metrics) {
        if (typeof metrics === "number") {
            return metrics;
        }

        if (!metrics || typeof metrics !== "object") {
            return NaN;
        }

        if (Number.isFinite(metrics.averageFPS)) {
            return metrics.averageFPS;
        }

        if (Number.isFinite(metrics.fps)) {
            return metrics.fps;
        }

        if (
            Number.isFinite(metrics.frameTimeMs) &&
            metrics.frameTimeMs > 0
        ) {
            return 1000 / metrics.frameTimeMs;
        }

        return NaN;
    }

    setQualityLevel(level) {
        const normalized =
            String(level || "").toLowerCase();

        if (
            !(normalized in this.options.qualityLevels)
        ) {
            return false;
        }

        this._qualityLevel = normalized;

        this._applyShadowMapSize(
            this.options.qualityLevels[normalized]
        );

        return true;
    }

    setMaxShadowLights(count) {
        if (
            !Number.isFinite(count) ||
            count < 0
        ) {
            return false;
        }

        this.options.maxShadowLights =
            Math.floor(count);

        return true;
    }

    setLightPriority(light, priority) {
        if (!light || !Number.isFinite(priority)) {
            return false;
        }

        if (!this.registry.has(light.uuid)) {
            this.registerLight(light, {
                priority
            });
        }

        const record =
            this.registry.get(light.uuid);

        if (!record) return false;

        record.priority = priority;
        return true;
    }

    setLightShadowEnabled(light, enabled) {
        if (!light?.isLight || !light.shadow) {
            return false;
        }

        if (!this.registry.has(light.uuid)) {
            this.registerLight(light);
        }

        const record =
            this.registry.get(light.uuid);

        if (!record) return false;

        const state = !!enabled;

        record.requestedCastShadow = state;

        light.userData = light.userData || {};
        light.userData.shadowRequested = state;

        // Apply immediately. The next budget pass may disable it only if
        // the current shadow-light budget is exhausted.
        this._applyCastShadow(record, state);

        return true;
    }

    setLightForceShadow(light, enabled) {
        if (!light?.isLight || !light.shadow) {
            return false;
        }

        if (!this.registry.has(light.uuid)) {
            this.registerLight(light);
        }

        const record =
            this.registry.get(light.uuid);

        if (!record) return false;

        record.forceShadow = !!enabled;

        if (record.forceShadow) {
            record.requestedCastShadow = true;
            light.userData = light.userData || {};
            light.userData.shadowRequested = true;
            this._applyCastShadow(record, true);
        }

        return true;
    }

    _restoreRecord(record) {
        const light = record.light;
        if (!light?.shadow) return;

        // Restore authored desired state, not the stale registration-time state.
        light.castShadow =
            record.requestedCastShadow ||
            record.forceShadow;

        light.shadow.mapSize.set(
            record.original.mapWidth,
            record.original.mapHeight
        );

        light.shadow.bias =
            record.original.bias;

        light.shadow.normalBias =
            record.original.normalBias;

        if (
            record.original.radius !== undefined &&
            light.shadow.radius !== undefined
        ) {
            light.shadow.radius =
                record.original.radius;
        }

        light.shadow.map?.dispose?.();
        light.shadow.map = null;
        light.shadow.needsUpdate = true;

        record.lastAppliedCastShadow =
            !!light.castShadow;
    }

    restoreAll() {
        for (const record of this.registry.values()) {
            this._restoreRecord(record);
        }

        this._qualityLevel = "ultra";
    }

    _removeDetachedLights() {
        for (const [uuid, record] of this.registry) {
            if (
                !record.light ||
                (
                    !record.light.parent &&
                    record.light !== this.scene
                )
            ) {
                this.registry.delete(uuid);
            }
        }
    }

    setEnabled(enabled) {
        this.options.enabled = !!enabled;

        if (!this.options.enabled) {
            this.restoreAll();
        }
    }

    getStats() {
        return {
            ...this.stats
        };
    }

    destroy({ restore = true } = {}) {
        if (restore) {
            this.restoreAll();
        }

        this.registry.clear();
    }
}

window.ShadowBudgetManager = ShadowBudgetManager;
