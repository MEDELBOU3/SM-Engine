class ProbeTracePass {
    constructor(renderer, camera, targets, config, probeGrid, probeAtlas) {
        this.renderer = renderer;
        this.camera = camera;
        this.targets = targets;
        this.config = config;
        this.probeGrid = probeGrid;
        this.probeAtlas = probeAtlas;
        this.enabled = true;
        this.scene = new THREE.Scene();
        this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.material = new THREE.ShaderMaterial({
            name: 'LumenProbeTracePass',
            vertexShader: window.LumenProbeTraceVertexShader,
            fragmentShader: window.LumenProbeTraceFragmentShader,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            uniforms: {
                tScreenGI: { value: null },
                tDepth: { value: null },
                tNormal: { value: null },
                tProbeAtlas: { value: null },
                projectionMatrixInverse: { value: new THREE.Matrix4() },
                viewMatrixInverse: { value: new THREE.Matrix4() },
                probeOrigin: { value: new THREE.Vector3() },
                probeDimensions: { value: new THREE.Vector3(1, 1, 1) },
                probeSpacing: { value: 1 },
                fallbackStrength: { value: 1 }
            }
        });
        this.quad = new THREE.Mesh(this.geometry, this.material);
        this.quad.frustumCulled = false;
        this.quad.userData.isSystemObject = true;
        this.scene.add(this.quad);
        this.lastOutput = null;
    }
    setCamera(camera) {
        if (camera) this.camera = camera;
    }
    render(screenGITexture = null) {
        if (!this.enabled || !this.targets?.giFallback) return screenGITexture;
        const screenGI = screenGITexture || this.targets?.giCurrent?.texture;
        const depth = this.targets?.gBuffer?.depthTexture;
        if (!screenGI || !depth || !this.probeGrid || !this.probeAtlas) return screenGITexture;
        const atlasTexture = this.probeAtlas.update();
        const dim = this.probeGrid.getDimensions();
        this.camera.updateMatrixWorld?.();
        this.material.uniforms.tScreenGI.value = screenGI;
        this.material.uniforms.tDepth.value = depth;
        this.material.uniforms.tNormal.value = this.targets?.gBuffer?.texture || null;
        this.material.uniforms.tProbeAtlas.value = atlasTexture;
        this.material.uniforms.projectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
        this.material.uniforms.viewMatrixInverse.value.copy(this.camera.matrixWorld);
        this.material.uniforms.probeOrigin.value.copy(this.probeGrid.origin);
        this.material.uniforms.probeDimensions.value.copy(dim);
        this.material.uniforms.probeSpacing.value = this.probeGrid.getSpacing();
        this.material.uniforms.fallbackStrength.value = this.config?.probeFallbackStrength ?? 1;
        const previousTarget = this.renderer.getRenderTarget();
        const previousAutoClear = this.renderer.autoClear;
        this.renderer.autoClear = true;
        this.renderer.setRenderTarget(this.targets.giFallback);
        this.renderer.clear(true, false, false);
        this.renderer.render(this.scene, this.orthoCamera);
        this.renderer.setRenderTarget(previousTarget);
        this.renderer.autoClear = previousAutoClear;
        this.lastOutput = this.targets.giFallback.texture;
        return this.lastOutput;
    }
    get texture() {
        return this.lastOutput || this.targets?.giFallback?.texture || null;
    }
    dispose() {
        this.geometry?.dispose?.();
        this.material?.dispose?.();
        this.scene.clear();
    }
}
window.ProbeTracePass = ProbeTracePass;