class LumenLightingSystem {
    constructor(scene, renderer, camera, options = {}) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.enabled = true;
        this.frame = 0;
        this.initialized = false;
        this.lastCameraPosition = new THREE.Vector3();
        this.lastCameraQuaternion = new THREE.Quaternion();
        this.config = new LumenConfig(options);
        if (this.config.probeFallbackStrength == null) this.config.probeFallbackStrength = 1;
        this.capabilities = new LumenCapabilities(renderer);
        this.targets = new LumenRenderTargets(renderer, this.config, this.capabilities);
        this.gBuffer = new LumenGBuffer(renderer, scene, camera, this.targets, this.config);
        this.objectRegistry = new LumenObjectRegistry(scene);
        this.scheduler = new LumenFrameScheduler(this.config);
        this.screenGI = new ScreenSpaceGI(renderer, camera, this.targets, this.config);
        this.probeGrid = new RadianceProbeGrid(scene, camera, this.config, this.scheduler);
        this.radianceCache = new RadianceCache(scene, camera, this.config, this.probeGrid, this.scheduler, this.objectRegistry);
        this.emissiveInjection = new EmissiveInjection(scene, this.config, this.probeGrid, this.objectRegistry);
        this.probeAtlas = new ProbeTextureAtlas(this.probeGrid);
        this.probeTrace = new ProbeTracePass(renderer, camera, this.targets, this.config, this.probeGrid, this.probeAtlas);
        this.surfaceCache = new SurfaceCache(scene, renderer, this.config, this.scheduler, this.objectRegistry);
        this.voxelScene = this.capabilities.supportsVoxelScene() ? new VoxelScene(scene, renderer, camera, this.config, this.scheduler, this.objectRegistry) : null;
        this.indirectDiffuse = new IndirectDiffusePass(renderer, this.targets, this.config);
        this.ssr = null;
        this.temporal = null;
        this.denoiser = null;
        this.composite = null;
        this.debugView = null;
        this.initRenderer();
        this.init();
    }
    initRenderer() {
        if (!this.renderer) return;
        if ('physicallyCorrectLights' in this.renderer) this.renderer.physicallyCorrectLights = true;
        if ('useLegacyLights' in this.renderer) this.renderer.useLegacyLights = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    init() {
        if (!this.capabilities.supportsDeferredLumen()) {
            console.warn('[Lumen] Required WebGL2/depth/render-target features are unavailable. Lumen will stay disabled.');
            this.enabled = false;
            return false;
        }
        this.capabilities.logReport();
        this.lastCameraPosition.copy(this.camera.position);
        this.lastCameraQuaternion.copy(this.camera.quaternion);
        this.initialized = true;
        console.log('[Lumen] Screen GI + probes + Surface Cache + voxel foundation initialized.');
        return true;
    }
    setEnabled(state) {
        this.enabled = !!state;
        return this.enabled;
    }
    setQuality(level) {
        this.config.setQuality(level);
        const size = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(size);
        this.targets.resize(size.x, size.y);
        this.probeGrid.create();
        this.probeAtlas.create();
        this.radianceCache.invalidateAll();
        if (this.voxelScene) {
            this.voxelScene.createTexture();
            this.voxelScene.markAllDirty();
        }
        return this.config.quality;
    }
    setCamera(camera) {
        if (!camera || camera === this.camera) return;
        this.camera = camera;
        this.gBuffer.camera = camera;
        this.screenGI?.setCamera?.(camera);
        this.probeGrid?.setCamera?.(camera);
        this.probeTrace?.setCamera?.(camera);
        this.radianceCache.camera = camera;
        if (this.voxelScene) this.voxelScene.camera = camera;
        this.lastCameraPosition.copy(camera.position);
        this.lastCameraQuaternion.copy(camera.quaternion);
    }
    isWorkspaceAllowed() {
        const mode = window.workspaceManager?.currentMode;
        if (!mode) return true;
        return mode !== 'FILM';
    }
    updateCameraReference() {
        const activeCamera = window.camera || window.cameraSystem?.camera || this.camera;
        if (activeCamera && activeCamera !== this.camera) this.setCamera(activeCamera);
    }
    hasCameraMoved(positionThreshold = 0.02, rotationThreshold = 0.0005) {
        const positionMoved = this.camera.position.distanceToSquared(this.lastCameraPosition) > positionThreshold * positionThreshold;
        const rotationMoved = 1 - Math.abs(this.camera.quaternion.dot(this.lastCameraQuaternion)) > rotationThreshold;
        if (positionMoved || rotationMoved) {
            this.lastCameraPosition.copy(this.camera.position);
            this.lastCameraQuaternion.copy(this.camera.quaternion);
            return true;
        }
        return false;
    }
    captureBaseBuffers() {
        return this.gBuffer.render();
    }
    update(delta = 0) {
        if (!this.enabled || !this.initialized) return null;
        if (!this.isWorkspaceAllowed()) return null;
        this.updateCameraReference();
        this.frame++;
        this.config.nextFrame();
        const cameraMoved = this.hasCameraMoved();
        this.objectRegistry.update(delta);
        this.scheduler.beginFrame(this.frame, delta);
        const needsGBuffer =
            this.screenGI?.enabled ||
            this.probeTrace?.enabled ||
            this.ssr?.enabled ||
            this.debugView?.requiresGBuffer;

        const buffers = needsGBuffer
            ? this.captureBaseBuffers()
            : null;
        this.emissiveInjection.update(delta);
        this.probeGrid.update(delta, cameraMoved);
        const probeUpdates = this.radianceCache.update(delta);
        const surfaceUpdates = this.surfaceCache.update(delta);
        const voxelUpdates = this.voxelScene?.update?.(delta, cameraMoved) ?? 0;
        const screenGITexture = this.screenGI.render(buffers, delta);
        const hybridGITexture = this.probeTrace.render(screenGITexture);
        const indirectTexture = this.indirectDiffuse.render(buffers.sceneColor, hybridGITexture);
        if (this.ssr?.render && this.config.ssrEnabled) this.ssr.render(buffers, delta);
        if (this.temporal?.render && this.config.temporalEnabled) this.temporal.render(delta);
        if (this.denoiser?.render && this.config.denoiserEnabled) this.denoiser.render(delta);
        if (this.composite?.render) this.composite.render(delta);
        if (this.debugView?.update) this.debugView.update(delta);
        return {
            frame: this.frame,
            cameraMoved,
            buffers,
            screenGITexture,
            hybridGITexture,
            indirectTexture,
            probeUpdates,
            surfaceUpdates,
            voxelUpdates,
            quality: this.config.quality,
            registry: this.objectRegistry.getStats(),
            probes: this.probeGrid.getStats(),
            radiance: this.radianceCache.getStats(),
            emissive: this.emissiveInjection.getStats(),
            surfaceCache: this.surfaceCache.getStats(),
            voxel: this.voxelScene?.getStats?.() || null,
            scheduler: this.scheduler.getStats()
        };
    }
    resize(width, height) {
        return this.targets.resize(width, height);
    }
    registerObject(object) {
        const changed = this.objectRegistry.register(object);
        if (!changed) return false;
        const registerMesh = mesh => {
            if (!mesh?.isMesh) return;
            if (this.emissiveInjection.isEmissive(mesh)) this.emissiveInjection.register(mesh);
            this.surfaceCache.register(mesh);
            this.voxelScene?.markDirty?.(mesh);
        };
        if (object.isMesh) registerMesh(object);
        object.traverse?.(child => {
            if (child !== object) registerMesh(child);
        });
        return true;
    }
    unregisterObject(object) {
        const unregisterMesh = mesh => {
            if (!mesh?.isMesh) return;
            this.emissiveInjection.unregister(mesh);
            this.surfaceCache.unregister(mesh);
        };
        if (object?.isMesh) unregisterMesh(object);
        object?.traverse?.(child => {
            if (child !== object) unregisterMesh(child);
        });
        return this.objectRegistry.unregister(object);
    }
    markObjectDirty(object) {
        this.objectRegistry.markDirty(object);
        if (object?.getWorldPosition) {
            const position = object.getWorldPosition(new THREE.Vector3());
            this.radianceCache.invalidateAround(position, 12);
        }
        if (object?.isMesh) {
            this.surfaceCache.markDirty(object);
            this.voxelScene?.markDirty?.(object);
        }
        object?.traverse?.(child => {
            if (!child?.isMesh) return;
            this.surfaceCache.markDirty(child);
            this.voxelScene?.markDirty?.(child);
        });
    }
    getGITexture() {
        return this.probeTrace?.texture || this.screenGI?.texture || null;
    }
    getIndirectTexture() {
        return this.indirectDiffuse?.texture || null;
    }
    getDebugTextures() {
        return {
            sceneColor: this.targets.sceneColor?.texture || null,
            normal: this.targets.gBuffer?.texture || null,
            depth: this.targets.gBuffer?.depthTexture || null,
            screenGI: this.targets.giCurrent?.texture || null,
            hybridGI: this.targets.giFallback?.texture || null,
            giHistory: this.targets.giHistory?.texture || null,
            giDenoised: this.targets.giDenoised?.texture || null,
            probeAtlas: this.probeAtlas?.texture || null,
            voxelScene: this.voxelScene?.texture || null,
            ssr: this.targets.ssr?.texture || null,
            composite: this.targets.composite?.texture || null
        };
    }
    getStats() {
        return {
            enabled: this.enabled,
            initialized: this.initialized,
            frame: this.frame,
            quality: this.config.quality,
            objects: this.objectRegistry.getStats(),
            probes: this.probeGrid.getStats(),
            radiance: this.radianceCache.getStats(),
            emissive: this.emissiveInjection.getStats(),
            surfaceCache: this.surfaceCache.getStats(),
            voxel: this.voxelScene?.getStats?.() || null,
            scheduler: this.scheduler.getStats()
        };
    }
    dispose() {
        this.gBuffer?.dispose?.();
        this.targets?.dispose?.();
        this.screenGI?.dispose?.();
        this.objectRegistry?.dispose?.();
        this.scheduler?.dispose?.();
        this.probeGrid?.dispose?.();
        this.radianceCache?.dispose?.();
        this.emissiveInjection?.dispose?.();
        this.probeAtlas?.dispose?.();
        this.probeTrace?.dispose?.();
        this.surfaceCache?.dispose?.();
        this.voxelScene?.dispose?.();
        this.indirectDiffuse?.dispose?.();
        this.ssr?.dispose?.();
        this.temporal?.dispose?.();
        this.denoiser?.dispose?.();
        this.composite?.dispose?.();
        this.debugView?.dispose?.();
        this.initialized = false;
    }
}
window.LumenLightingSystem = LumenLightingSystem;