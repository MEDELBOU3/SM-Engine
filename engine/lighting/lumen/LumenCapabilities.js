class LumenCapabilities {
    constructor(renderer) {
        this.renderer = renderer;
        this.gl = renderer?.getContext?.() || null;
        this.isWebGL2 = !!renderer?.capabilities?.isWebGL2;
        this.maxTextures = renderer?.capabilities?.maxTextures || 0;
        this.maxTextureSize = renderer?.capabilities?.maxTextureSize || 0;
        this.maxCubemapSize = renderer?.capabilities?.maxCubemapSize || 0;
        this.maxSamples = renderer?.capabilities?.maxSamples || 0;
        this.maxVertexTextures = renderer?.capabilities?.maxVertexTextures || 0;
        this.floatColorBuffer = false;
        this.halfFloatColorBuffer = false;
        this.depthTexture = typeof THREE.DepthTexture !== 'undefined';
        this.multipleRenderTargets = typeof THREE.WebGLRenderTarget !== 'undefined';
        this.texture3D = typeof THREE.Data3DTexture !== 'undefined';
        this.timerQuery = false;
        this.extensions = {};
        this.detect();
    }
    detect() {
        if (!this.gl) return this;
        const names = [
            'EXT_color_buffer_float',
            'EXT_color_buffer_half_float',
            'OES_texture_float_linear',
            'OES_texture_half_float_linear',
            'EXT_disjoint_timer_query_webgl2',
            'WEBGL_depth_texture'
        ];
        for (const name of names) {
            try {
                this.extensions[name] = this.gl.getExtension(name);
            } catch (error) {
                this.extensions[name] = null;
            }
        }
        this.floatColorBuffer = !!this.extensions.EXT_color_buffer_float;
        this.halfFloatColorBuffer = !!this.extensions.EXT_color_buffer_half_float || this.floatColorBuffer;
        this.timerQuery = !!this.extensions.EXT_disjoint_timer_query_webgl2;
        return this;
    }
    supportsDeferredLumen() {
        return !!(this.renderer && this.isWebGL2 && this.depthTexture && this.multipleRenderTargets);
    }
    supportsVoxelScene() {
        return !!(this.isWebGL2 && this.texture3D);
    }
    getRecommendedTextureType() {
        if (this.halfFloatColorBuffer && typeof THREE.HalfFloatType !== 'undefined') return THREE.HalfFloatType;
        if (this.floatColorBuffer && typeof THREE.FloatType !== 'undefined') return THREE.FloatType;
        return THREE.UnsignedByteType;
    }
    getRecommendedInternalFormat() {
        if (this.halfFloatColorBuffer) return 'RGBA16F';
        return 'RGBA8';
    }
    getReport() {
        return {
            webgl2: this.isWebGL2,
            maxTextures: this.maxTextures,
            maxTextureSize: this.maxTextureSize,
            maxCubemapSize: this.maxCubemapSize,
            maxSamples: this.maxSamples,
            floatColorBuffer: this.floatColorBuffer,
            halfFloatColorBuffer: this.halfFloatColorBuffer,
            depthTexture: this.depthTexture,
            multipleRenderTargets: this.multipleRenderTargets,
            texture3D: this.texture3D,
            timerQuery: this.timerQuery,
            deferredLumen: this.supportsDeferredLumen(),
            voxelScene: this.supportsVoxelScene()
        };
    }
    logReport() {
        const report = this.getReport();
        console.group('[Lumen] GPU Capabilities');
        console.table(report);
        console.groupEnd();
        return report;
    }
}
window.LumenCapabilities = LumenCapabilities;