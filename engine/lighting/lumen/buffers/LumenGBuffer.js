class LumenGBuffer {
    constructor(renderer, scene, camera, targets, config) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.targets = targets;
        this.config = config;
        this.enabled = true;
        this.normalMaterial = new THREE.MeshNormalMaterial();
        this.normalMaterial.blending = THREE.NoBlending;
        this.normalMaterial.depthTest = true;
        this.normalMaterial.depthWrite = true;
        this.normalMaterial.side = THREE.DoubleSide;
        this.normalMaterial.name = 'LumenNormalMaterial';
        this.materialCache = new Map();
        this.lastRenderFrame = -1;
        this.frame = 0;
        this.updateRate = 4;
        this.lastResult = null;
    }
    resize(width, height) {
        return this.targets?.resize?.(width, height) || false;
    }
    getViewportSize() {
        const size = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(size);
        return size;
    }
    renderNormalsAndDepth() {
        if (!this.enabled || !this.targets?.gBuffer) return null;
        const previousTarget = this.renderer.getRenderTarget();
        const previousOverride = this.scene.overrideMaterial;
        const previousAutoClear = this.renderer.autoClear;
        this.renderer.autoClear = true;
        this.scene.overrideMaterial = this.normalMaterial;
        this.renderer.setRenderTarget(this.targets.gBuffer);
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, this.camera);
        this.scene.overrideMaterial = previousOverride;
        this.renderer.setRenderTarget(previousTarget);
        this.renderer.autoClear = previousAutoClear;
        this.lastRenderFrame = this.config?.frameIndex ?? this.lastRenderFrame + 1;
        return this.targets.gBuffer;
    }
    renderSceneColor() {
        if (!this.enabled || !this.targets?.sceneColor) return null;
        const previousTarget = this.renderer.getRenderTarget();
        const previousAutoClear = this.renderer.autoClear;
        this.renderer.autoClear = true;
        this.renderer.setRenderTarget(this.targets.sceneColor);
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(previousTarget);
        this.renderer.autoClear = previousAutoClear;
        return this.targets.sceneColor;
    }
    render() {
        if (!this.enabled) return this.lastResult;
        this.frame++;
        const size = this.getViewportSize();
        this.resize(size.x, size.y);
        if (this.frame % this.updateRate !== 0 && this.lastResult) {
            return this.lastResult;
        }
        this.renderNormalsAndDepth();
        this.lastResult = {
            sceneColor: this.targets.sceneColor?.texture || null,
            normal: this.targets.gBuffer?.texture || null,
            depth: this.targets.gBuffer?.depthTexture || null,
            width: this.targets.width,
            height: this.targets.height
        };
        return this.lastResult;
    }
    get sceneColorTexture() {
        return this.targets?.sceneColor?.texture || null;
    }
    get normalTexture() {
        return this.targets?.gBuffer?.texture || null;
    }
    get depthTexture() {
        return this.targets?.gBuffer?.depthTexture || null;
    }
    dispose() {
        this.normalMaterial?.dispose?.();
        this.materialCache.clear();
    }
}
window.LumenGBuffer = LumenGBuffer;