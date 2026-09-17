class ProbeTextureAtlas {
    constructor(probeGrid) {
        this.probeGrid = probeGrid;
        this.texture = null;
        this.data = null;
        this.width = 1;
        this.height = 1;
        this.version = -1;
        this.create();
    }
    getDimensions() {
        return this.probeGrid?.getDimensions?.() || new THREE.Vector3(1, 1, 1);
    }
    create() {
        const dim = this.getDimensions();
        this.width = Math.max(1, Math.floor(dim.x));
        this.height = Math.max(1, Math.floor(dim.y * dim.z));
        this.data = new Float32Array(this.width * this.height * 4);
        this.texture?.dispose?.();
        this.texture = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat, THREE.FloatType);
        this.texture.name = 'LumenProbeIrradianceAtlas';
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.generateMipmaps = false;
        this.texture.colorSpace = THREE.NoColorSpace;
        this.texture.needsUpdate = true;
        this.version = this.probeGrid?.version ?? 0;
        return this.texture;
    }
    getIndex(x, y, z, dim) {
        const row = z * dim.y + y;
        return (row * dim.x + x) * 4;
    }
    update() {
        if (!this.probeGrid) return null;
        const dim = this.getDimensions();
        const width = Math.max(1, Math.floor(dim.x));
        const height = Math.max(1, Math.floor(dim.y * dim.z));
        if (!this.texture || width !== this.width || height !== this.height || this.version !== this.probeGrid.version) this.create();
        for (const probe of this.probeGrid.probes) {
            const x = Math.floor(probe.grid.x);
            const y = Math.floor(probe.grid.y);
            const z = Math.floor(probe.grid.z);
            const index = this.getIndex(x, y, z, dim);
            this.data[index] = probe.irradiance.r;
            this.data[index + 1] = probe.irradiance.g;
            this.data[index + 2] = probe.irradiance.b;
            this.data[index + 3] = probe.validity;
        }
        this.texture.needsUpdate = true;
        return this.texture;
    }
    dispose() {
        this.texture?.dispose?.();
        this.texture = null;
        this.data = null;
    }
}
window.ProbeTextureAtlas = ProbeTextureAtlas;