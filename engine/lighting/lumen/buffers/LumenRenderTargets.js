class LumenRenderTargets {
    constructor(renderer, config, capabilities) {
        this.renderer = renderer;
        this.config = config;
        this.capabilities = capabilities;
        this.width = 1;
        this.height = 1;
        this.giWidth = 1;
        this.giHeight = 1;
        this.ssrWidth = 1;
        this.ssrHeight = 1;
        this.textureType = capabilities?.getRecommendedTextureType?.() || THREE.UnsignedByteType;
        this.gBuffer = null;
        this.sceneColor = null;
        this.giCurrent = null;
        this.giFallback = null;
        this.giHistory = null;
        this.giDenoised = null;
        this.ssr = null;
        this.composite = null;
        this.create();
    }
    createTarget(width, height, options = {}) {
        const target = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
            minFilter: options.minFilter || THREE.LinearFilter,
            magFilter: options.magFilter || THREE.LinearFilter,
            format: options.format || THREE.RGBAFormat,
            type: options.type || this.textureType,
            depthBuffer: options.depthBuffer ?? false,
            stencilBuffer: options.stencilBuffer ?? false,
            generateMipmaps: options.generateMipmaps ?? false
        });
        target.texture.name = options.name || 'LumenRenderTarget';
        target.texture.colorSpace = options.colorSpace || THREE.NoColorSpace;
        return target;
    }
    create() {
        this.dispose();
        this.sceneColor = this.createTarget(this.width, this.height, { name: 'LumenSceneColor', depthBuffer: true });
        this.gBuffer = this.createTarget(this.width, this.height, { name: 'LumenGBuffer', depthBuffer: true, type: this.textureType });
        if (typeof THREE.DepthTexture !== 'undefined') {
            this.gBuffer.depthTexture = new THREE.DepthTexture(this.width, this.height);
            this.gBuffer.depthTexture.name = 'LumenDepth';
            this.gBuffer.depthTexture.type = THREE.UnsignedIntType;
            this.gBuffer.depthTexture.format = THREE.DepthFormat;
        }
        this.giCurrent = this.createTarget(this.giWidth, this.giHeight, { name: 'LumenGICurrent' });
        this.giFallback = this.createTarget(this.giWidth, this.giHeight, { name: 'LumenGIFallback' });
        this.giHistory = this.createTarget(this.giWidth, this.giHeight, { name: 'LumenGIHistory' });
        this.giDenoised = this.createTarget(this.giWidth, this.giHeight, { name: 'LumenGIDenoised' });
        this.ssr = this.createTarget(this.ssrWidth, this.ssrHeight, { name: 'LumenSSR' });
        this.composite = this.createTarget(this.width, this.height, { name: 'LumenComposite' });
        return this;
    }
    resize(width, height) {
        const w = Math.max(1, Math.floor(width));
        const h = Math.max(1, Math.floor(height));
        const giScale = THREE.MathUtils.clamp(this.config?.giResolutionScale ?? 0.5, 0.1, 1.0);
        const ssrScale = THREE.MathUtils.clamp(this.config?.ssrResolutionScale ?? 0.5, 0.1, 1.0);
        const giW = Math.max(1, Math.floor(w * giScale));
        const giH = Math.max(1, Math.floor(h * giScale));
        const ssrW = Math.max(1, Math.floor(w * ssrScale));
        const ssrH = Math.max(1, Math.floor(h * ssrScale));
        const changed = w !== this.width || h !== this.height || giW !== this.giWidth || giH !== this.giHeight || ssrW !== this.ssrWidth || ssrH !== this.ssrHeight;
        if (!changed) return false;
        this.width = w;
        this.height = h;
        this.giWidth = giW;
        this.giHeight = giH;
        this.ssrWidth = ssrW;
        this.ssrHeight = ssrH;
        this.create();
        return true;
    }
    swapGIHistory() {
        const temp = this.giHistory;
        this.giHistory = this.giFallback || this.giCurrent;
        this.giFallback = temp;
    }
    disposeTarget(target) {
        if (!target) return;
        target.depthTexture?.dispose?.();
        target.dispose?.();
    }
    dispose() {
        this.disposeTarget(this.sceneColor);
        this.disposeTarget(this.gBuffer);
        this.disposeTarget(this.giCurrent);
        this.disposeTarget(this.giFallback);
        this.disposeTarget(this.giHistory);
        this.disposeTarget(this.giDenoised);
        this.disposeTarget(this.ssr);
        this.disposeTarget(this.composite);
        this.sceneColor = null;
        this.gBuffer = null;
        this.giCurrent = null;
        this.giFallback = null;
        this.giHistory = null;
        this.giDenoised = null;
        this.ssr = null;
        this.composite = null;
    }
}
window.LumenRenderTargets = LumenRenderTargets;