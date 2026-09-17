(function () {
    'use strict';
    class SMStandaloneRuntime {
        constructor(options = {}) {
            this.options = { manifestURL: 'game.manifest.json', preloadAssets: false, assetConcurrency: 4, autoPlay: true, openStartLevel: true, ...options };
            this.manifestLoader = options.manifestLoader || new window.SMGameManifestLoader({ manifestURL: this.options.manifestURL, baseURL: options.baseURL || './' });
            this.assetLoader = options.assetLoader || new window.SMGameAssetLoader({ manifestLoader: this.manifestLoader, baseURL: options.baseURL || './' });
            this.levelLoader = options.levelLoader || new window.SMGameLevelLoader({ manifestLoader: this.manifestLoader, assetLoader: this.assetLoader });
            this.manifest = null;
            this.initialized = false;
            this.started = false;
            this.starting = null;
            this.stopping = null;
        }
        static getDefaultScriptPaths() {
            return [
                'engine/runtime/SMRuntimeEventBus.js',
                'engine/runtime/SMRuntimeStateSnapshot.js',
                'engine/runtime/SMGameSession.js',
                'engine/runtime/SMPlayModeController.js',
                'engine/runtime/SMRuntimeManager.js',
                'engine/runtime/world/SMRuntimeObjectRegistry.js',
                'engine/runtime/world/SMRuntimeWorldSettings.js',
                'engine/runtime/world/SMRuntimeSpawner.js',
                'engine/runtime/world/SMRuntimeWorld.js',
                'engine/runtime/world/SMRuntimeWorldBridge.js',
                'engine/runtime/components/SMComponent.js',
                'engine/runtime/components/SMBehaviour.js',
                'engine/runtime/components/SMComponentRegistry.js',
                'engine/runtime/components/SMComponentContainer.js',
                'engine/runtime/components/SMComponentRuntimeBridge.js',
                'engine/runtime/components/builtin/SMHealthComponent.js',
                'engine/runtime/components/builtin/SMDamageableComponent.js',
                'engine/runtime/components/builtin/SMCharacterComponent.js',
                'engine/runtime/components/builtin/SMTriggerComponent.js',
                'engine/runtime/components/builtin/SMSpawnPointComponent.js',
                'engine/runtime/components/builtin/SMLifetimeComponent.js',
                'engine/runtime/components/builtin/SMRotatorComponent.js',
                'engine/runtime/prefabs/SMPrefab.js',
                'engine/runtime/prefabs/SMPrefabRegistry.js',
                'engine/runtime/prefabs/SMPrefabSerializer.js',
                'engine/runtime/prefabs/SMPrefabInstantiator.js',
                'engine/runtime/prefabs/SMPrefabRuntimeBridge.js',
                'engine/runtime/levels/SMLevel.js',
                'engine/runtime/levels/SMLevelRegistry.js',
                'engine/runtime/levels/SMLevelSerializer.js',
                'engine/runtime/levels/SMLevelManager.js',
                'engine/runtime/levels/SMLevelRuntimeBridge.js',
                'engine/runtime/streaming/SMLevelStreamingVolume.js',
                'engine/runtime/streaming/SMDistanceStreaming.js',
                'engine/runtime/streaming/SMLevelStreamingManager.js',
                'engine/runtime/streaming/SMStreamingRuntimeBridge.js',
                'engine/runtime/game-mode/SMGameState.js',
                'engine/runtime/game-mode/SMPlayerController.js',
                'engine/runtime/game-mode/SMGameMode.js',
                'engine/runtime/game-mode/SMGameModeRegistry.js',
                'engine/runtime/game-mode/SMGameModeRuntimeBridge.js',
                'engine/runtime/input/SMInputAction.js',
                'engine/runtime/input/SMInputMap.js',
                'engine/runtime/input/SMInputContext.js',
                'engine/runtime/input/SMInputManager.js',
                'engine/runtime/input/SMInputRuntimeBridge.js',
                'engine/runtime/player/SMPawn.js',
                'engine/runtime/player/SMPlayerRuntime.js',
                'engine/runtime/player/SMPlayerSpawnManager.js',
                'engine/runtime/player/SMPlayerPossessionManager.js',
                'engine/runtime/player/SMPlayerRuntimeBridge.js',
                'engine/runtime/integration/SMRuntimePhysicsBridge.js',
                'engine/runtime/physics/SMColliderComponent.js',
                'engine/runtime/physics/SMRigidBodyComponent.js',
                'engine/runtime/physics/SMCharacterBodyComponent.js',
                'engine/runtime/physics/SMTriggerVolumeComponent.js',
                'engine/runtime/physics/SMPhysicsComponentBridge.js',
                'engine/runtime/gameplay/SMGameplayTags.js',
                'engine/runtime/gameplay/SMGameplayEvent.js',
                'engine/runtime/gameplay/SMGameplayEventManager.js',
                'engine/runtime/gameplay/SMTeamManager.js',
                'engine/runtime/gameplay/SMGameplayRuntimeBridge.js',
                'engine/runtime/integration/SMRuntimeScriptBridge.js',
                'engine/runtime/ai/SMBlackboard.js',
                'engine/runtime/ai/SMBehaviorTree.js',
                'engine/runtime/ai/SMNavigationAgent.js',
                'engine/runtime/ai/SMAIController.js',
                'engine/runtime/ai/SMAIPawnComponent.js',
                'engine/runtime/ai/SMAIRuntimeBridge.js',
                'engine/runtime/animation/SMAnimationParameterSet.js',
                'engine/runtime/animation/SMAnimationStateMachine.js',
                'engine/runtime/animation/SMAnimatorComponent.js',
                'engine/runtime/animation/SMAnimationRuntime.js',
                'engine/runtime/animation/SMAnimationRuntimeBridge.js',
                'engine/runtime/integration/SMRuntimeAudioBridge.js',
                'engine/runtime/save/SMSaveGame.js',
                'engine/runtime/save/SMSaveGameSerializer.js',
                'engine/runtime/save/SMSaveGameManager.js',
                'engine/runtime/save/SMSaveGameRuntimeBridge.js',
                'engine/runtime/integration/SMRuntimeUIBridge.js'
            ];
        }
        static getPlayerRuntimeScriptPaths() {
            return ['engine/player-runtime/SMGameManifestLoader.js', 'engine/player-runtime/SMGameAssetLoader.js', 'engine/player-runtime/SMGameLevelLoader.js', 'engine/player-runtime/SMStandaloneRuntime.js', 'engine/player-runtime/SMGameBootstrap.js'];
        }
        static getDefaultExternalScripts() {
            return ['https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js', 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/FBXLoader.js', 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/OBJLoader.js', 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/RGBELoader.js', 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/EXRLoader.js', 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/utils/SkeletonUtils.js', 'https://cdn.jsdelivr.net/npm/ammo.js@0.0.10/ammo.js'];
        }
        async initialize(options = {}) {
            const merged = { ...this.options, ...options };
            this.manifest = await this.manifestLoader.load(merged.manifestURL || this.options.manifestURL);
            this.assetLoader.setManifestLoader(this.manifestLoader);
            this.levelLoader.setContext({ manifestLoader: this.manifestLoader, assetLoader: this.assetLoader, levelRegistry: window.SMLevelRegistry, prefabRegistry: window.SMPrefabRegistry, levelManager: window.SMLevelManager });
            await this.levelLoader.registerManifestContent({ failFast: merged.failFast === true });
            if (merged.preloadAssets === true) await this.assetLoader.preload({ concurrency: merged.assetConcurrency || 4, failFast: merged.failFast === true, onProgress: merged.onAssetProgress });
            this.initialized = true;
            window.dispatchEvent(new CustomEvent('sm:standalone-initialized', { detail: { runtime: this, manifest: this.manifest } }));
            return this;
        }
        async start(options = {}) {
            if (this.starting) return await this.starting;
            if (this.started) return this;
            this.starting = (async () => {
                const merged = { ...this.options, ...options };
                if (!this.initialized) await this.initialize(merged);
                const startLevel = this.manifestLoader.getStartLevel();
                if (startLevel) this._prepareStartLevel(startLevel);
                if (merged.autoPlay !== false && window.SMRuntime?.play) await window.SMRuntime.play();
                if (merged.openStartLevel !== false && startLevel) {
                    const active = window.SMRuntime?.getActiveLevel?.();
                    if (!active || String(active.id) !== String(startLevel)) await this.levelLoader.openStartLevel({ unloadCurrent: true });
                }
                if (window.SMRuntime?.whenLevelReady) try { await window.SMRuntime.whenLevelReady(); } catch { }
                if (window.SMRuntime?.whenGameModeReady) try { await window.SMRuntime.whenGameModeReady(); } catch { }
                this.started = true;
                window.dispatchEvent(new CustomEvent('sm:standalone-started', { detail: { runtime: this, manifest: this.manifest } }));
                return this;
            })().finally(() => { this.starting = null; });
            return await this.starting;
        }
        _prepareStartLevel(id) {
            const level = window.SMLevelRegistry?.get?.(id) || null;
            const manager = window.SMLevelManager;
            if (level) {
                for (const method of ['setActive', 'setActiveLevel']) {
                    if (typeof manager?.[method] !== 'function') continue;
                    try { manager[method](level); break; } catch { }
                }
            }
            if (window.scene) {
                window.scene.userData = window.scene.userData || {};
                window.scene.userData.worldSettings = { ...(window.scene.userData.worldSettings || {}), startLevel: id };
            }
            return level;
        }
        async stop(reason = 'standalone-stop') {
            if (this.stopping) return await this.stopping;
            this.stopping = (async () => {
                if (window.SMRuntime?.stop) await window.SMRuntime.stop({ reason });
                this.assetLoader.clear({ dispose: true });
                this.started = false;
                window.dispatchEvent(new CustomEvent('sm:standalone-stopped', { detail: { runtime: this, reason } }));
                return true;
            })().finally(() => { this.stopping = null; });
            return await this.stopping;
        }
        debug() {
            const state = { initialized: this.initialized, started: this.started, startLevel: this.manifestLoader.getStartLevel(), manifest: this.manifestLoader.debug(), assets: this.assetLoader.debug(), levels: this.levelLoader.debug() };
            console.log('[SMStandaloneRuntime]', state);
            return state;
        }
    }
    window.SMStandaloneRuntime = SMStandaloneRuntime;
    window.SMStandaloneRuntimeClass = SMStandaloneRuntime;
})();