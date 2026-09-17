/**
 * SM Engine - PerformanceManager
 * Classic non-module build.
 *
 * Central orchestrator for the optimization subsystem.
 * Coordinates monitoring, polygon budgets, visibility, occlusion, adaptive LOD,
 * clustering, instancing, dynamic resolution, shadows and memory diagnostics.
 *
 * IMPORTANT:
 * - DynamicResolutionManager is the ONLY subsystem allowed to change pixel ratio.
 * - Automatic clustering / instancing stay opt-in because they change scene structure.
 * - Skinned, dynamic, editor-helper and Nanite-internal meshes are not manually
 *   visibility/occlusion culled by this manager.
 */
class PerformanceManager {
    constructor(scene, camera, renderer, options = {}) {
        if (!scene || !camera || !renderer) {
            throw new Error("PerformanceManager: scene, camera and renderer are required.");
        }
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.options = {
            enabled: true,
            targetFPS: 60,
            autoRegisterScene: true,
            sceneScanIntervalMs: 5000,
            autoOptimize: true,
            qualityChangeCooldownMs: 1500,
            autoClusterHeavyMeshes: false,
            autoBuildInstances: false,

            /*
             * AUTHORING SAFETY
             * ----------------
             * Camera-dependent VisibilityManager/OcclusionManager culling must
             * not mutate Object3D.visible while the editor is in Edit mode.
             * This is false by default; view culling becomes active only in
             * Play/Simulate/standalone runtime.
             */
            allowEditorViewCulling: false,

            clusterThresholdTriangles: 250000,
            instanceMinCount: 5,
            ...options
        };
        this.monitor = new PerformanceMonitor(
            renderer,
            options.performanceMonitor || {}
        );
        this.geometryBudget = new GeometryBudgetManager(
            scene,
            renderer,
            options.geometryBudget || {}
        );
        // Central manager owns registration. This avoids VisibilityManager
        // automatically registering editor helpers, SkinnedMesh and Nanite LODs.
        this.visibility = new VisibilityManager(
            scene,
            camera,
            {
                ...(options.visibility || {}),
                autoRegister: false,

                // Three.js owns ordinary frustum rejection. Do not flip
                // authored Object3D.visible just because the editor camera turns.
                manualFrustumVisibility:
                    options.visibility?.manualFrustumVisibility === true
            }
        );
        this.occlusion = new OcclusionManager(
            scene,
            camera,
            options.occlusion || {}
        );
        this.lod = new AdaptiveLODManager(
            camera,
            options.lod || {}
        );
        this.clusters = new MeshClusterManager(
            scene,
            options.clusters || {}
        );
        this.instances = new InstanceManager(
            scene,
            options.instances || {}
        );
        this.dynamicResolution = new DynamicResolutionManager(
            renderer,
            {
                targetFPS: this.options.targetFPS,
                ...(options.dynamicResolution || {})
            }
        );
        this.shadows = new ShadowBudgetManager(
            scene,
            {
                targetFPS: this.options.targetFPS,
                ...(options.shadows || {})
            }
        );
        this.shadows.setCamera(camera);
        this.memory = new MemoryBudgetManager(
            renderer,
            scene,
            options.memory || {}
        );
        this.qualityLevel = "ultra";
        this._lastSceneScan = 0;
        this._lastQualityChangeTime = 0;
        this._registeredObjectUUIDs = new Set();
        this._registeredLightUUIDs = new Set();
        this._sceneRescanRequested = false;
        this._sceneRescanRoot = null;
        this._lastMetrics = null;
        // Requested state and applied state are intentionally separate.
        // The editor may request culling, but Edit mode still refuses it unless
        // allowEditorViewCulling was explicitly enabled.
        this._viewCullingRequested = true;
        this._viewCullingEnabled = false;
        this.stats = {
            fps: 60,
            averageFPS: 60,
            frameTimeMs: 16.67,
            drawCalls: 0,
            triangles: 0,
            visibleTriangles: 0,
            totalTriangles: 0,
            geometryPressure: "LOW",
            qualityLevel: "ultra"
        };
        if (this.options.autoRegisterScene) {
            this.registerScene();
        }
        console.log("✅ SM PerformanceManager initialized.");
    }

    _hasOptimizationExclusion(object) {
        let current = object;
        while (current) {
            const data = current.userData || {};
            if (
                data.excludeFromOptimization ||
                data.ignoreInOptimization ||
                data.isEditorHelper ||
                data.isTransformControlsChild ||
                data.isGuideHandle ||
                data.isNaniteLOD ||
                data.isNaniteOriginal
            ) {
                return true;
            }
            // System objects are editor/runtime infrastructure. Do not let
            // manual visibility culling fight their owning systems.
            if (data.isSystemObject) return true;
            current = current.parent;
        }
        const excludedNames = new Set([
            "axesHelper",
            "advancedGrid",
            "blenderGrid",
            "NaniteDebugGroup",
            "DistanceMarkers"
        ]);
        return excludedNames.has(object.name);
    }

    _isDynamicObject(object) {
        if (!object) return true;
        if (object.isSkinnedMesh || object.isBone) return true;
        let current = object;
        while (current) {
            const data = current.userData || {};
            if (
                data.isDynamicMesh ||
                data.hasSkeleton ||
                data.hasRig ||
                data.isPlayer ||
                data.isPlayerRoot ||
                data.isPlayerVisual ||
                data.isRuntimeCharacter ||
                data.ragdoll
            ) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    registerScene(root = this.scene) {
        let count = 0;
        root.traverse(object => {
            if (!object) return;
            if (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh) {
                if (this.registerObject(object)) count++;
            }
            if (object.isLight && object.shadow) {
                if (!this._registeredLightUUIDs.has(object.uuid)) {
                    this.shadows.registerLight(object);
                    this._registeredLightUUIDs.add(object.uuid);
                }
            }
        });
        return count;
    }

    registerObjectTree(root, options = {}) {
        if (!root?.isObject3D) return 0;
        let count = 0;
        root.traverse(object => {
            if (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh) {
                if (this.registerObject(object, options)) count++;
            }
            if (object.isLight && object.shadow) {
                if (!this._registeredLightUUIDs.has(object.uuid)) {
                    this.shadows.registerLight(object, options.shadow || {});
                    this._registeredLightUUIDs.add(object.uuid);
                }
            }
        });
        return count;
    }

    registerObject(object, options = {}) {
        if (!object || !object.geometry) return false;
        if (
            this._registeredObjectUUIDs.has(object.uuid) &&
            options.forceReregister !== true
        ) {
            return false;
        }
        if (this._hasOptimizationExclusion(object) && options.force !== true) {
            return false;
        }
        // Geometry monitoring is safe even for animated meshes.
        this.geometryBudget.registerObject(object);
        const dynamic = this._isDynamicObject(object);
        const viewCullingAllowed =
            options.allowViewCulling !== false &&
            !dynamic &&
            !object.isInstancedMesh;
        if (viewCullingAllowed) {
            this.visibility.registerObject(object, options.visibility || {});
            this.occlusion.addCandidate(object);
        }
        if (
            viewCullingAllowed &&
            (options.isOccluder === true || object.userData?.isOccluder === true)
        ) {
            this.occlusion.addOccluder(object);
        }
        if (
            options.allowLOD !== false &&
            !dynamic &&
            (Array.isArray(options.lodLevels) ||
                Array.isArray(object.userData?.lodLevels) ||
                object.isLOD)
        ) {
            this.lod.register(
                object,
                options.lodLevels || object.userData?.lodLevels || null,
                options.lod || {}
            );
        }
        this._registeredObjectUUIDs.add(object.uuid);
        return true;
    }

    unregisterObjectTree(root, restore = true) {
        if (!root?.isObject3D) return 0;
        let count = 0;
        root.traverse(object => {
            if (object.isMesh || object.isSkinnedMesh || object.isInstancedMesh) {
                if (this.unregisterObject(object, restore)) count++;
            }
            if (object.isLight && object.shadow) {
                this.shadows.unregisterLight(object, restore);
                this._registeredLightUUIDs.delete(object.uuid);
            }
        });
        return count;
    }

    unregisterObject(object, restore = true) {
        if (!object) return false;
        this.geometryBudget.unregisterObject(object);
        this.visibility.unregisterObject(object, restore);
        this.occlusion.removeCandidate(object, restore);
        this.occlusion.removeOccluder(object);
        this.lod.unregister(object, restore);
        return this._registeredObjectUUIDs.delete(object.uuid);
    }

    markAsOccluder(object, enabled = true) {
        if (!object?.geometry) return false;
        if (this._hasOptimizationExclusion(object)) return false;
        if (this._isDynamicObject(object) || object.isInstancedMesh) return false;
        if (enabled) {
            object.userData ||= {};
            object.userData.isOccluder = true;
            this.visibility.registerObject(object);
            this.occlusion.addCandidate(object);
            return this.occlusion.addOccluder(object);
        }
        if (object.userData) object.userData.isOccluder = false;
        return this.occlusion.removeOccluder(object);
    }

    registerLOD(object, levels, options = {}) {
        return this.lod.register(object, levels, options);
    }

    setCamera(camera) {
        if (!camera?.isCamera) return false;
        if (this.camera === camera) return true;
        this.camera = camera;
        this.visibility.camera = camera;
        this.occlusion.camera = camera;
        this.lod.camera = camera;
        this.shadows.setCamera(camera);
        return true;
    }

    _isRuntimeViewCullingAllowed() {
        if (this.options.allowEditorViewCulling === true) {
            return true;
        }

        const pieMode =
            String(
                window.PlayOrchestrator?.mode ||
                window.playOrchestrator?.mode ||
                window.smViewport?.modeBridge?.pieMode ||
                window.smViewport?.modeBridge?.mode ||
                "edit"
            )
                .trim()
                .toLowerCase();

        if (
            pieMode === "play" ||
            pieMode === "simulate" ||
            pieMode === "runtime"
        ) {
            return true;
        }

        if (
            window.SMStandaloneRuntime?.running === true ||
            window.smRuntimeManager?.running === true ||
            window.__SM_STANDALONE_RUNTIME__ === true
        ) {
            return true;
        }

        return false;
    }

    _applyViewCullingPolicy(force = false) {
        const runtimeAllowed =
            this._isRuntimeViewCullingAllowed();

        const state =
            this._viewCullingRequested === true &&
            runtimeAllowed;

        if (
            !force &&
            this._viewCullingEnabled === state &&
            this.visibility.options.enabled === state &&
            this.occlusion.options.enabled === state
        ) {
            return state;
        }

        this._viewCullingEnabled = state;

        if (this.visibility.options.enabled !== state) {
            this.visibility.setEnabled(state);
        }

        if (this.occlusion.options.enabled !== state) {
            this.occlusion.setEnabled(state);
        }

        /*
         * Turning culling off restores only manager-owned temporary visibility.
         * Authored/workspace visibility remains represented by baseVisible.
         */
        if (!state) {
            this.visibility.restoreAll?.();
            this.occlusion.restoreAll?.();
        }

        return state;
    }

    setViewCullingEnabled(enabled) {
        this._viewCullingRequested =
            !!enabled;

        return this._applyViewCullingPolicy(true);
    }

    requestSceneRescan(root = this.scene) {
        this._sceneRescanRequested = true;
        this._sceneRescanRoot = root || this.scene;
        return true;
    }

    _pressureRank(level) {
        const ranks = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
        return ranks[String(level || "LOW").toUpperCase()] ?? 0;
    }

    _maxPressure(a, b) {
        return this._pressureRank(a) >= this._pressureRank(b) ? a : b;
    }

    _qualityLODPressure() {
        return {
            ultra: "LOW",
            high: "MEDIUM",
            medium: "HIGH",
            low: "CRITICAL"
        }[this.qualityLevel] || "LOW";
    }

    update(frameDelta) {
        if (!this.options.enabled) return this.stats;
        if (!Number.isFinite(frameDelta) || frameDelta <= 0) return this.stats;
        const now = performance.now();
        if (this.options.autoRegisterScene) {
            const fallbackScanDue =
                now - this._lastSceneScan >= this.options.sceneScanIntervalMs;
            if (this._sceneRescanRequested || fallbackScanDue) {
                this._lastSceneScan = now;
                const scanRoot = this._sceneRescanRoot || this.scene;
                this._sceneRescanRequested = false;
                this._sceneRescanRoot = null;
                this.registerScene(scanRoot);
            }
        }
        const metrics = this.monitor.update(frameDelta);
        this._lastMetrics = metrics;
        const geometryStats = this.geometryBudget.update();
        const memoryStats = this.memory.update();
        const effectiveLODPressure = this._maxPressure(
            geometryStats.pressureLevel,
            this._qualityLODPressure()
        );
        this.lod.setGeometryPressure(effectiveLODPressure);

        /*
         * Re-evaluate every frame because Edit <-> Play can change without
         * reconstructing PerformanceManager.
         */
        const viewCullingActive =
            this._applyViewCullingPolicy();

        if (viewCullingActive) {
            this.visibility.update();
            this.occlusion.update();
        }

        this.lod.update();
        this.dynamicResolution.update(metrics);
        this.shadows.update(metrics);
        if (this.options.autoOptimize) {
            this._updateQualityState(metrics, geometryStats, memoryStats);
        }
        this.stats.fps = metrics.fps;
        this.stats.averageFPS = metrics.averageFPS;
        this.stats.frameTimeMs = metrics.frameTimeMs;
        this.stats.drawCalls = metrics.drawCalls;
        this.stats.triangles = metrics.triangles;
        this.stats.visibleTriangles = geometryStats.visibleTriangles;
        this.stats.totalTriangles = geometryStats.totalTriangles;
        this.stats.geometryPressure = geometryStats.pressureLevel;
        this.stats.qualityLevel = this.qualityLevel;
        return this.stats;
    }

    _updateQualityState(metrics, geometryStats, memoryStats) {
        const fps = metrics.averageFPS;
        const pressure = geometryStats.pressureLevel;
        let nextLevel = "ultra";
        if (
            fps < 35 ||
            pressure === "CRITICAL" ||
            memoryStats.texturePressure === "CRITICAL" ||
            memoryStats.geometryPressure === "CRITICAL"
        ) {
            nextLevel = "low";
        } else if (
            fps < 48 ||
            pressure === "HIGH" ||
            memoryStats.texturePressure === "HIGH" ||
            memoryStats.geometryPressure === "HIGH"
        ) {
            nextLevel = "medium";
        } else if (
            fps < this.options.targetFPS - 3 ||
            pressure === "MEDIUM"
        ) {
            nextLevel = "high";
        }
        const now = performance.now();
        if (
            nextLevel !== this.qualityLevel &&
            now - this._lastQualityChangeTime >= this.options.qualityChangeCooldownMs
        ) {
            this.setQualityLevel(nextLevel);
        }
    }

    setQualityLevel(level) {
        const normalized = String(level || "").toLowerCase();
        const allowed = ["ultra", "high", "medium", "low"];
        if (!allowed.includes(normalized)) return false;
        if (this.qualityLevel === normalized) return true;
        this.qualityLevel = normalized;
        this._lastQualityChangeTime = performance.now();
        const profiles = {
            ultra: {
                lodPressure: "LOW",
                shadowQuality: "ultra",
                maxShadowLights: 4
            },
            high: {
                lodPressure: "MEDIUM",
                shadowQuality: "high",
                maxShadowLights: 4
            },
            medium: {
                lodPressure: "HIGH",
                shadowQuality: "medium",
                maxShadowLights: 3
            },
            low: {
                lodPressure: "CRITICAL",
                shadowQuality: "low",
                maxShadowLights: 2
            }
        };
        const profile = profiles[normalized];
        this.lod.setGeometryPressure(profile.lodPressure);
        this.shadows.setMaxShadowLights(profile.maxShadowLights);
        this.shadows.setQualityLevel(profile.shadowQuality);
        console.log(`⚙️ SM Optimization quality: ${normalized.toUpperCase()}`);
        return true;
    }

    optimizeScene(options = {}) {
        const result = {
            clustered: 0,
            instanceBatches: 0,
            registered: 0
        };
        result.registered = this.registerScene();
        const shouldCluster =
            options.clusterHeavyMeshes ?? this.options.autoClusterHeavyMeshes;
        const shouldInstance =
            options.buildInstances ?? this.options.autoBuildInstances;
        if (shouldCluster) {
            const heavy = this.geometryBudget.getHeavyMeshes(100);
            for (const item of heavy) {
                const mesh = item.object;
                if (!mesh || mesh.userData?.__smDoNotCluster) continue;
                if (this._hasOptimizationExclusion(mesh)) continue;
                if (this._isDynamicObject(mesh)) continue;
                if (item.triangles < this.options.clusterThresholdTriangles) continue;
                const group = this.clusters.clusterMesh(
                    mesh,
                    options.clusterOptions || {}
                );
                if (!group) continue;
                result.clustered++;
                this.registerObjectTree(group);
            }
        }
        if (shouldInstance) {
            const batches = this.instances.buildFromScene(this.scene, {
                minInstances:
                    options.instanceMinCount || this.options.instanceMinCount,
                ...(options.instanceOptions || {})
            });
            result.instanceBatches = batches.length;
            for (const batch of batches) {
                this.registerObject(batch);
            }
        }
        this.geometryBudget.update(true);
        return result;
    }

    getHeavyMeshes(limit = 10) {
        return this.geometryBudget.getHeavyMeshes(limit);
    }

    getReport() {
        return {
            qualityLevel: this.qualityLevel,
            performance: this.monitor.getSnapshot(),
            geometry: this.geometryBudget.getStats(),
            visibility: {
                ...this.visibility.getStats(),
                requested:
                    this._viewCullingRequested === true,
                active:
                    this._viewCullingEnabled === true,
                runtimeAllowed:
                    this._isRuntimeViewCullingAllowed()
            },
            occlusion: this.occlusion.getStats(),
            lod: this.lod.getStats(),
            clusters: this.clusters.getStats(),
            instances: this.instances.getStats(),
            dynamicResolution: this.dynamicResolution.getStats(),
            shadows: this.shadows.getStats(),
            memory: this.memory.getStats()
        };
    }

    setEnabled(enabled) {
        this.options.enabled =
            !!enabled;

        if (!this.options.enabled) {
            this.visibility.setEnabled(false);
            this.occlusion.setEnabled(false);
            this._viewCullingEnabled = false;
            return;
        }

        this._applyViewCullingPolicy(true);
    }

    resetOptimizations() {
        this.qualityLevel = "ultra";
        this._lastQualityChangeTime = performance.now();
        this.dynamicResolution.reset();
        this.shadows.restoreAll();
        this.visibility.restoreAll();
        this.occlusion.restoreAll();
        this.lod.setGeometryPressure("LOW");
        this.memory.resetHistory();

        // Re-apply Edit/Play visibility policy after reset.
        this._applyViewCullingPolicy(true);

        console.log("↻ SM PerformanceManager reset to baseline quality.");
    }

    destroy() {
        this.monitor.destroy();
        this.geometryBudget.destroy();
        this.visibility.destroy();
        this.occlusion.destroy();
        this.lod.destroy();
        this.clusters.destroy({
            restoreSources: true,
            disposeClusters: true
        });
        this.instances.destroy({
            restoreOriginals: true,
            disposeBatches: true
        });
        this.dynamicResolution.destroy({
            restorePixelRatio: true
        });
        this.shadows.destroy({
            restore: true
        });
        this.memory.destroy();
        this._registeredObjectUUIDs.clear();
        this._registeredLightUUIDs.clear();
    }
}

window.PerformanceManager = PerformanceManager;