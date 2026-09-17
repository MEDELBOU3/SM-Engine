class ScreenSpaceGI {
    constructor(renderer, camera, targets, config) {
        this.renderer = renderer;
        this.camera = camera;
        this.targets = targets;
        this.config = config;
        this.enabled = true;
        this.scene = new THREE.Scene();
        this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.material = new THREE.ShaderMaterial({
            name: 'LumenScreenSpaceGI',
            vertexShader: window.LumenSSGIVertexShader,
            fragmentShader: window.LumenSSGIFragmentShader,
            depthTest: false,
            depthWrite: false,
            transparent: false,
            toneMapped: false,
            uniforms: {
                tSceneColor: { value: null },
                tNormal: { value: null },
                tDepth: { value: null },
                projectionMatrixInverse: { value: new THREE.Matrix4() },
                viewMatrixInverse: { value: new THREE.Matrix4() },
                viewMatrix: { value: new THREE.Matrix4() },
                projectionMatrix: { value: new THREE.Matrix4() },
                resolution: { value: new THREE.Vector2(1, 1) },
                cameraNear: { value: camera.near },
                cameraFar: { value: camera.far },
                giIntensity: { value: config.giIntensity },
                maxDistance: { value: 8.0 },
                thickness: { value: config.giThickness },
                frameIndex: { value: 0 },
                rayCount: { value: config.giRayCount },
                maxSteps: { value: config.giMaxSteps }
            }
        });
        this.quad = new THREE.Mesh(this.geometry, this.material);
        this.quad.frustumCulled = false;
        this.quad.userData.isSystemObject = true;
        this.scene.add(this.quad);
        this.lastOutput = null;
    }
    setCamera(camera) {
        if (!camera) return;
        this.camera = camera;
    }
    syncUniforms(buffers) {
        const camera = this.camera;
        camera.updateMatrixWorld?.();
        camera.updateProjectionMatrix?.();
        this.material.uniforms.tSceneColor.value = buffers?.sceneColor || this.targets?.sceneColor?.texture || null;
        this.material.uniforms.tNormal.value = buffers?.normal || this.targets?.gBuffer?.texture || null;
        this.material.uniforms.tDepth.value = buffers?.depth || this.targets?.gBuffer?.depthTexture || null;
        this.material.uniforms.projectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
        this.material.uniforms.viewMatrixInverse.value.copy(camera.matrixWorld);
        this.material.uniforms.viewMatrix.value.copy(camera.matrixWorldInverse);
        this.material.uniforms.projectionMatrix.value.copy(camera.projectionMatrix);
        this.material.uniforms.resolution.value.set(this.targets?.giWidth || 1, this.targets?.giHeight || 1);
        this.material.uniforms.cameraNear.value = camera.near;
        this.material.uniforms.cameraFar.value = camera.far;
        this.material.uniforms.giIntensity.value = this.config?.giIntensity ?? 1.0;
        this.material.uniforms.thickness.value = this.config?.giThickness ?? 0.2;
        this.material.uniforms.frameIndex.value = this.config?.frameIndex ?? 0;
        this.material.uniforms.rayCount.value = Math.min(16, Math.max(1, Math.floor(this.config?.giRayCount ?? 4)));
        this.material.uniforms.maxSteps.value = Math.min(96, Math.max(1, Math.floor(this.config?.giMaxSteps ?? 32)));
    }
    render(buffers) {
        if (!this.enabled || !this.targets?.giCurrent) return null;
        if (!buffers?.sceneColor || !buffers?.normal || !buffers?.depth) return null;
        this.syncUniforms(buffers);
        const previousTarget = this.renderer.getRenderTarget();
        const previousAutoClear = this.renderer.autoClear;
        this.renderer.autoClear = true;
        this.renderer.setRenderTarget(this.targets.giCurrent);
        this.renderer.clear(true, false, false);
        this.renderer.render(this.scene, this.orthoCamera);
        this.renderer.setRenderTarget(previousTarget);
        this.renderer.autoClear = previousAutoClear;
        this.lastOutput = this.targets.giCurrent.texture;
        return this.lastOutput;
    }
    get texture() {
        return this.lastOutput || this.targets?.giCurrent?.texture || null;
    }
    dispose() {
        this.geometry?.dispose?.();
        this.material?.dispose?.();
        this.scene.clear();
    }
}
window.ScreenSpaceGI = ScreenSpaceGI;