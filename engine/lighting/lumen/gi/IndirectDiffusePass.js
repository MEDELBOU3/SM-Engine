class IndirectDiffusePass {
    constructor(renderer, targets, config) {
        this.renderer = renderer;
        this.targets = targets;
        this.config = config;
        this.enabled = true;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.material = new THREE.ShaderMaterial({
            name: 'LumenIndirectDiffuse',
            vertexShader: window.LumenIndirectDiffuseVertexShader,
            fragmentShader: window.LumenIndirectDiffuseFragmentShader,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            uniforms: {
                tSceneColor: { value: null },
                tGI: { value: null },
                giIntensity: { value: 1 },
                indirectMix: { value: 1 }
            }
        });
        this.quad = new THREE.Mesh(this.geometry, this.material);
        this.quad.frustumCulled = false;
        this.quad.userData.isSystemObject = true;
        this.scene.add(this.quad);
        this.lastOutput = null;
    }
    render(sceneColorTexture = null, giTexture = null) {
        if (!this.enabled || !this.targets?.composite) return null;
        const sceneColor = sceneColorTexture || this.targets?.sceneColor?.texture;
        const gi = giTexture || this.targets?.giCurrent?.texture;
        if (!sceneColor || !gi) return null;
        this.material.uniforms.tSceneColor.value = sceneColor;
        this.material.uniforms.tGI.value = gi;
        this.material.uniforms.giIntensity.value = this.config?.giIntensity ?? 1;
        this.material.uniforms.indirectMix.value = 1;
        const previousTarget = this.renderer.getRenderTarget();
        const previousAutoClear = this.renderer.autoClear;
        this.renderer.autoClear = true;
        this.renderer.setRenderTarget(this.targets.composite);
        this.renderer.clear(true, false, false);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(previousTarget);
        this.renderer.autoClear = previousAutoClear;
        this.lastOutput = this.targets.composite.texture;
        return this.lastOutput;
    }
    get texture() {
        return this.lastOutput || this.targets?.composite?.texture || null;
    }
    dispose() {
        this.geometry?.dispose?.();
        this.material?.dispose?.();
        this.scene.clear();
    }
}
window.IndirectDiffusePass = IndirectDiffusePass;