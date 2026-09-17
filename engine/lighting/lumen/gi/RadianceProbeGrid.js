class RadianceProbeGrid {
    constructor(scene, camera, config, scheduler = null) {
        this.scene = scene;
        this.camera = camera;
        this.config = config;
        this.scheduler = scheduler;
        this.probes = [];
        this.probeMap = new Map();
        this.origin = new THREE.Vector3();
        this.gridOffset = new THREE.Vector3();
        this.lastCameraCell = new THREE.Vector3(Infinity, Infinity, Infinity);
        this.tempPosition = new THREE.Vector3();
        this.tempColor = new THREE.Color();
        this.enabled = true;
        this.version = 0;
        this.create();
    }
    getDimensions() {
        const g = this.config?.probeGrid;
        return new THREE.Vector3(Math.max(1, Math.floor(g?.x ?? 12)), Math.max(1, Math.floor(g?.y ?? 6)), Math.max(1, Math.floor(g?.z ?? 12)));
    }
    getSpacing() {
        return Math.max(0.1, this.config?.probeSpacing ?? 3.0);
    }
    getCellFromPosition(position, target = new THREE.Vector3()) {
        const spacing = this.getSpacing();
        target.set(Math.floor(position.x / spacing), Math.floor(position.y / spacing), Math.floor(position.z / spacing));
        return target;
    }
    create() {
        this.probes.length = 0;
        this.probeMap.clear();
        const dim = this.getDimensions();
        const spacing = this.getSpacing();
        const halfX = (dim.x - 1) * 0.5;
        const halfY = (dim.y - 1) * 0.5;
        const halfZ = (dim.z - 1) * 0.5;
        let index = 0;
        for (let z = 0; z < dim.z; z++) {
            for (let y = 0; y < dim.y; y++) {
                for (let x = 0; x < dim.x; x++) {
                    const localPosition = new THREE.Vector3((x - halfX) * spacing, (y - halfY) * spacing, (z - halfZ) * spacing);
                    const probe = {
                        index,
                        grid: new THREE.Vector3(x, y, z),
                        localPosition,
                        position: localPosition.clone(),
                        irradiance: new THREE.Color(0, 0, 0),
                        radiance: new THREE.Color(0, 0, 0),
                        skyRadiance: new THREE.Color(0, 0, 0),
                        emissiveRadiance: new THREE.Color(0, 0, 0),
                        validity: 0,
                        age: 999999,
                        lastUpdateFrame: -1,
                        dirty: true
                    };
                    this.probes.push(probe);
                    this.probeMap.set(`${x}:${y}:${z}`, probe);
                    index++;
                }
            }
        }
        this.updateOrigin(true);
        this.version++;
        return this.probes;
    }
    updateOrigin(force = false) {
        if (!this.camera) return false;
        const cell = this.getCellFromPosition(this.camera.position, new THREE.Vector3());
        if (!force && cell.equals(this.lastCameraCell)) return false;
        this.lastCameraCell.copy(cell);
        const spacing = this.getSpacing();
        this.origin.set(cell.x * spacing, cell.y * spacing, cell.z * spacing);
        for (const probe of this.probes) {
            probe.position.copy(probe.localPosition).add(this.origin);
            probe.dirty = true;
            probe.validity = Math.min(probe.validity, 0.25);
            probe.age = Math.max(probe.age, 1);
        }
        this.version++;
        return true;
    }
    setCamera(camera) {
        if (!camera) return;
        this.camera = camera;
        this.updateOrigin(true);
    }
    markAllDirty() {
        for (const probe of this.probes) probe.dirty = true;
    }
    markDirtyNear(position, radius = 8) {
        if (!position) return 0;
        const radiusSq = radius * radius;
        let count = 0;
        for (const probe of this.probes) {
            if (probe.position.distanceToSquared(position) <= radiusSq) {
                probe.dirty = true;
                count++;
            }
        }
        return count;
    }
    getPriority(probe) {
        if (!this.camera) return probe.dirty ? 1000 : 0;
        const distance = probe.position.distanceTo(this.camera.position);
        const dirtyBoost = probe.dirty ? 10000 : 0;
        const ageBoost = Math.min(probe.age, 300) * 4;
        return dirtyBoost + ageBoost - distance;
    }
    scheduleUpdates() {
        if (!this.scheduler) return 0;
        let count = 0;
        for (const probe of this.probes) {
            probe.age++;
            if (!probe.dirty && probe.age < 30) continue;
            this.scheduler.schedule('probeUpdates', probe, this.getPriority(probe));
            count++;
        }
        return count;
    }
    updateProbe(probe, frame = 0) {
        probe.lastUpdateFrame = frame;
        probe.age = 0;
        probe.dirty = false;
        probe.validity = Math.min(1, probe.validity + 0.25);
    }
    update(delta = 0, cameraMoved = false) {
        if (!this.enabled) return 0;
        if (this.config?.probeFollowCamera !== false && (cameraMoved || !Number.isFinite(this.lastCameraCell.x))) this.updateOrigin(false);
        this.scheduleUpdates();
        return this.probes.length;
    }
    getNearestProbe(position) {
        if (!position || !this.probes.length) return null;
        let best = null;
        let bestDistance = Infinity;
        for (const probe of this.probes) {
            const d = probe.position.distanceToSquared(position);
            if (d < bestDistance) {
                bestDistance = d;
                best = probe;
            }
        }
        return best;
    }
    sample(position, target = new THREE.Color()) {
        if (!position || !this.probes.length) return target.setRGB(0, 0, 0);
        const spacing = this.getSpacing();
        const dim = this.getDimensions();
        const local = this.tempPosition.copy(position).sub(this.origin);
        const halfX = (dim.x - 1) * 0.5;
        const halfY = (dim.y - 1) * 0.5;
        const halfZ = (dim.z - 1) * 0.5;
        const gx = local.x / spacing + halfX;
        const gy = local.y / spacing + halfY;
        const gz = local.z / spacing + halfZ;
        const x0 = THREE.MathUtils.clamp(Math.floor(gx), 0, dim.x - 1);
        const y0 = THREE.MathUtils.clamp(Math.floor(gy), 0, dim.y - 1);
        const z0 = THREE.MathUtils.clamp(Math.floor(gz), 0, dim.z - 1);
        const x1 = Math.min(x0 + 1, dim.x - 1);
        const y1 = Math.min(y0 + 1, dim.y - 1);
        const z1 = Math.min(z0 + 1, dim.z - 1);
        const tx = THREE.MathUtils.clamp(gx - x0, 0, 1);
        const ty = THREE.MathUtils.clamp(gy - y0, 0, 1);
        const tz = THREE.MathUtils.clamp(gz - z0, 0, 1);
        target.setRGB(0, 0, 0);
        let totalWeight = 0;
        for (let iz = 0; iz < 2; iz++) {
            for (let iy = 0; iy < 2; iy++) {
                for (let ix = 0; ix < 2; ix++) {
                    const x = ix ? x1 : x0;
                    const y = iy ? y1 : y0;
                    const z = iz ? z1 : z0;
                    const wx = ix ? tx : 1 - tx;
                    const wy = iy ? ty : 1 - ty;
                    const wz = iz ? tz : 1 - tz;
                    const probe = this.probeMap.get(`${x}:${y}:${z}`);
                    if (!probe) continue;
                    const weight = wx * wy * wz * probe.validity;
                    if (weight <= 0) continue;
                    target.r += probe.irradiance.r * weight;
                    target.g += probe.irradiance.g * weight;
                    target.b += probe.irradiance.b * weight;
                    totalWeight += weight;
                }
            }
        }
        if (totalWeight > 0) target.multiplyScalar(1 / totalWeight);
        return target;
    }
    getStats() {
        let valid = 0;
        let dirty = 0;
        for (const probe of this.probes) {
            if (probe.validity > 0.5) valid++;
            if (probe.dirty) dirty++;
        }
        return {
            total: this.probes.length,
            valid,
            dirty,
            origin: this.origin.toArray(),
            spacing: this.getSpacing(),
            version: this.version
        };
    }
    dispose() {
        this.probes.length = 0;
        this.probeMap.clear();
    }
}
window.RadianceProbeGrid = RadianceProbeGrid;