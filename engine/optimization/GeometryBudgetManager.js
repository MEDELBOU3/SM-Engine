/**
 * SM Engine - GeometryBudgetManager
 * Classic non-module build.
 * Tracks polygon cost, classifies heavy meshes and exposes geometry pressure.
 */
class GeometryBudgetManager {
    constructor(scene, renderer = null, options = {}) {
        if (!scene) throw new Error("GeometryBudgetManager: scene is required.");
        this.scene = scene;
        this.renderer = renderer;
        this.options = {
            scanIntervalMs: 750,
            maxHeavyMeshes: 20,
            triangleBudget: {
                ultra: 4_000_000,
                high: 2_500_000,
                medium: 1_500_000,
                low: 800_000
            },
            thresholds: {
                medium: 20_000,
                high: 100_000,
                veryHigh: 500_000,
                extreme: 2_000_000
            },
            ignoreEditorHelpers: true,
            ignoreGeneratedNaniteLODs: true,
            ...options
        };
        this.registry = new Map();
        this.stats = {
            meshCount: 0,
            visibleMeshCount: 0,
            totalTriangles: 0,
            visibleTriangles: 0,
            rendererTriangles: 0,
            highPolyMeshes: 0,
            veryHighPolyMeshes: 0,
            extremePolyMeshes: 0,
            pressure: 0,
            pressureLevel: "LOW"
        };
        this.heavyMeshes = [];
        this._lastScan = 0;
        this._scanVersion = 0;
        this.registerScene();
    }

    _shouldIgnore(object) {
        if (!object) return true;
        let current = object;
        while (current) {
            const data = current.userData || {};
            if (
                data.excludeFromOptimizationBudget ||
                data.isTransformControlsChild ||
                data.isGuideHandle
            ) {
                return true;
            }
            if (
                this.options.ignoreEditorHelpers &&
                (data.isEditorHelper || data.isSystemObject)
            ) {
                return true;
            }
            if (
                this.options.ignoreGeneratedNaniteLODs &&
                data.isNaniteLOD
            ) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    _isEffectivelyVisible(object) {
        let current = object;
        while (current) {
            if (current.visible === false) return false;
            current = current.parent;
        }
        return true;
    }

    registerScene(root = this.scene) {
        root.traverse(object => {
            if (
                object &&
                (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh)
            ) {
                this.registerObject(object);
            }
        });
        return this.registry.size;
    }

    registerObject(object) {
        if (
            !object ||
            !object.geometry ||
            !object.geometry.attributes ||
            !object.geometry.attributes.position ||
            this._shouldIgnore(object)
        ) {
            return false;
        }
        if (this.registry.has(object.uuid)) return true;
        const record = {
            object,
            triangles: this._countTriangles(object.geometry),
            classification: "LOW",
            lastSeenVersion: this._scanVersion
        };
        record.classification = this._classify(record.triangles);
        this.registry.set(object.uuid, record);
        return true;
    }

    unregisterObject(object) {
        if (!object) return false;
        return this.registry.delete(object.uuid);
    }

    update(force = false) {
        const now = performance.now();
        if (
            !force &&
            now - this._lastScan < this.options.scanIntervalMs
        ) {
            return this.stats;
        }
        this._lastScan = now;
        this._scanVersion++;
        this._scanScene();
        return this.stats;
    }

    _scanScene() {
        let meshCount = 0;
        let visibleMeshCount = 0;
        let totalTriangles = 0;
        let visibleTriangles = 0;
        let highPolyMeshes = 0;
        let veryHighPolyMeshes = 0;
        let extremePolyMeshes = 0;
        const heavy = [];
        const seen = new Set();
        this.scene.traverse(object => {
            if (
                !object ||
                !(object.isMesh || object.isSkinnedMesh || object.isInstancedMesh) ||
                !object.geometry ||
                this._shouldIgnore(object)
            ) {
                return;
            }
            seen.add(object.uuid);
            let record = this.registry.get(object.uuid);
            if (!record) {
                this.registerObject(object);
                record = this.registry.get(object.uuid);
            }
            if (!record) return;
            const baseTriangles = this._countTriangles(object.geometry);
            const instanceCount = object.isInstancedMesh
                ? Math.max(1, object.count || 1)
                : 1;
            const triangles = baseTriangles * instanceCount;
            record.triangles = triangles;
            record.classification = this._classify(triangles);
            record.lastSeenVersion = this._scanVersion;
            meshCount++;
            totalTriangles += triangles;
            if (this._isEffectivelyVisible(object)) {
                visibleMeshCount++;
                visibleTriangles += triangles;
            }
            if (record.classification === "HIGH") highPolyMeshes++;
            if (record.classification === "VERY_HIGH") veryHighPolyMeshes++;
            if (record.classification === "EXTREME") extremePolyMeshes++;
            if (
                record.classification !== "LOW" &&
                record.classification !== "MEDIUM"
            ) {
                heavy.push({
                    uuid: object.uuid,
                    name: object.name || "Unnamed Mesh",
                    triangles,
                    classification: record.classification,
                    object
                });
            }
        });
        for (const uuid of this.registry.keys()) {
            if (!seen.has(uuid)) this.registry.delete(uuid);
        }
        heavy.sort((a, b) => b.triangles - a.triangles);
        this.heavyMeshes = heavy.slice(
            0,
            Math.max(1, this.options.maxHeavyMeshes | 0)
        );
        const rendererTriangles = this.renderer?.info?.render?.triangles || 0;
        const budget = this.options.triangleBudget.high || 2_500_000;
        const pressure = budget > 0 ? visibleTriangles / budget : 0;
        this.stats.meshCount = meshCount;
        this.stats.visibleMeshCount = visibleMeshCount;
        this.stats.totalTriangles = totalTriangles;
        this.stats.visibleTriangles = visibleTriangles;
        this.stats.rendererTriangles = rendererTriangles;
        this.stats.highPolyMeshes = highPolyMeshes;
        this.stats.veryHighPolyMeshes = veryHighPolyMeshes;
        this.stats.extremePolyMeshes = extremePolyMeshes;
        this.stats.pressure = pressure;
        this.stats.pressureLevel = this._pressureLabel(pressure);
    }

    _countTriangles(geometry) {
        if (!geometry) return 0;
        if (geometry.index) return Math.floor(geometry.index.count / 3);
        const position = geometry.attributes?.position;
        return position ? Math.floor(position.count / 3) : 0;
    }

    _classify(triangles) {
        const t = this.options.thresholds;
        if (triangles >= t.extreme) return "EXTREME";
        if (triangles >= t.veryHigh) return "VERY_HIGH";
        if (triangles >= t.high) return "HIGH";
        if (triangles >= t.medium) return "MEDIUM";
        return "LOW";
    }

    _pressureLabel(pressure) {
        if (pressure >= 1.5) return "CRITICAL";
        if (pressure >= 1.0) return "HIGH";
        if (pressure >= 0.7) return "MEDIUM";
        return "LOW";
    }

    getBudget(quality = "high") {
        return this.options.triangleBudget[quality] ??
            this.options.triangleBudget.high;
    }

    setBudget(quality, triangles) {
        if (!(quality in this.options.triangleBudget)) return false;
        if (!Number.isFinite(triangles) || triangles <= 0) return false;
        this.options.triangleBudget[quality] = Math.floor(triangles);
        return true;
    }

    getObjectInfo(object) {
        if (!object) return null;
        return this.registry.get(object.uuid) || null;
    }

    getHeavyMeshes(limit = 10) {
        return this.heavyMeshes.slice(0, Math.max(1, limit | 0));
    }

    getStats() {
        return {
            ...this.stats,
            heavyMeshes: this.getHeavyMeshes(
                this.options.maxHeavyMeshes
            ).map(item => ({
                uuid: item.uuid,
                name: item.name,
                triangles: item.triangles,
                classification: item.classification
            }))
        };
    }

    destroy() {
        this.registry.clear();
        this.heavyMeshes.length = 0;
    }
}

window.GeometryBudgetManager = GeometryBudgetManager;