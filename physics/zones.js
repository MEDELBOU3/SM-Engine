// ============================================================================
// physics/zones.js
//  WindZone + LiquidZone implementations for the SM Engine physics system.
//  Loaded BEFORE PhysicsSystem.js — defines the globals it consumes.
//  API surface (consumed by PhysicsSystem._applyEffects / PhysicsUI):
//    WindZone:  enabled, mode, strength, turbulence, frequency, radius,
//               airDrag, direction(Vector3), position(Vector3),
//               forceAt(point, mass, delta), contains(point), updateHelper(),
//               remove()
//    LiquidZone: enabled, liquidType, density, viscosity, waveHeight,
//                waveSpeed, halfW, halfD, depth, surfaceY, color, _mesh,
//                forceAt(point, mass, lv, av, halfExtentY, volume, delta),
//                contains(point), updateWaves(delta), remove()
// ============================================================================
'use strict';

const PhysicsZones = { init() {} };

let _zoneSeq = 0;
function _zoneId(prefix) {
    _zoneSeq++;
    return (prefix || 'zone') + '-' + _zoneSeq;
}

const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

function _disposeObject(object) {
    if (!object) return;
    object.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            const list = Array.isArray(child.material)
                ? child.material
                : [child.material];
            for (const m of list) m.dispose();
        }
    });
}

// ============================================================================
// WIND ZONE
// ============================================================================
class WindZone {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.id = options.id || _zoneId('wz');
        this.enabled = options.enabled !== false;
        this.mode = options.mode || 'directional';
        this.strength = Number(options.strength) || 25;
        this.turbulence = Number(options.turbulence) || 0.1;
        this.frequency = Number(options.frequency) || 1;
        this.radius = Number(options.radius) || 10;
        this.airDrag = Number(options.airDrag) || 0.05;
        if (options.direction && options.direction.isVector3) {
            this.direction = options.direction.clone();
        } else {
            this.direction = new THREE.Vector3(
                Number(options.dx) || 1,
                Number(options.dy) || 0,
                Number(options.dz) || 0
            );
        }
        if (this.direction.lengthSq() < 1e-8) {
            this.direction.set(1, 0, 0);
        }
        this.direction.normalize();
        if (options.position && options.position.isVector3) {
            this.position = options.position.clone();
        } else {
            this.position = new THREE.Vector3(
                Number(options.x) || 0,
                Number(options.y) || 5,
                Number(options.z) || 0
            );
        }
        this._time = 0;
        this.helper = null;
        this.updateHelper();
    }

    forceAt(point, mass, delta) {
        if (!this.enabled) return null;
        if (!mass || mass <= 0) return null;
        const radius = Number(this.radius) || 0;
        if (radius <= 0) return null;

        this._time += Number(delta) || 0;

        const offset = _tmpV1.copy(point).sub(this.position);
        const dist = offset.length();
        if (dist > radius) return null;

        const falloff = Math.max(0, 1 - dist / radius);
        const base = (Number(this.strength) || 0) * mass * falloff;
        const force = _tmpV2.set(0, 0, 0);

        if (this.mode === 'radial') {
            if (dist < 0.001) {
                force.set(0, base, 0);
            } else {
                force.copy(offset).normalize().multiplyScalar(base);
            }
        } else if (this.mode === 'vortex') {
            if (dist < 0.001) {
                force.set(base, 0, 0);
            } else {
                force.copy(_UP).cross(offset).normalize().multiplyScalar(base);
                force.y += base * 0.25;
            }
        } else {
            force.copy(this.direction).multiplyScalar(base);
        }

        if (Number(this.turbulence) > 0) {
            const t = Number(this.turbulence) * mass;
            const f = (Number(this.frequency) || 1) * this._time;
            force.x += Math.sin(f + point.y * 0.7) * t;
            force.y += Math.cos(f + point.z * 0.6) * t * 0.6;
            force.z += Math.sin(f + point.x * 0.8 + 1.3) * t;
        }

        return { x: force.x, y: force.y, z: force.z };
    }

    contains(point) {
        const radius = Number(this.radius) || 0;
        if (radius <= 0) return false;
        _tmpV1.copy(point).sub(this.position);
        return _tmpV1.lengthSq() <= radius * radius;
    }

    updateHelper() {
        if (this.helper) {
            this.scene.remove(this.helper);
            _disposeObject(this.helper);
            this.helper = null;
        }
        const group = new THREE.Group();
        group.name = 'WindZoneHelper';
        group.userData.isSystemObject = true;
        group.userData.physicsZone = true;

        const lineMat = new THREE.LineBasicMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.35
        });
        const solidMat = new THREE.MeshBasicMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.9
        });
        const solidMatDark = new THREE.MeshBasicMaterial({
            color: 0x4a7aa8,
            transparent: true,
            opacity: 0.9
        });

        if (this.mode === 'radial') {
            const sphere = new THREE.LineSegments(
                new THREE.EdgesGeometry(
                    new THREE.SphereGeometry(this.radius, 20, 14)
                ),
                lineMat
            );
            sphere.userData.isSystemObject = true;
            group.add(sphere);
        } else if (this.mode === 'vortex') {
            const cylinder = new THREE.LineSegments(
                new THREE.EdgesGeometry(
                    new THREE.CylinderGeometry(this.radius, this.radius, 2, 20, 1)
                ),
                lineMat
            );
            cylinder.userData.isSystemObject = true;
            group.add(cylinder);
        } else {
            const bounds = new THREE.LineSegments(
                new THREE.EdgesGeometry(
                    new THREE.SphereGeometry(this.radius, 16, 12)
                ),
                lineMat
            );
            bounds.userData.isSystemObject = true;
            group.add(bounds);
            const arrow = new THREE.ArrowHelper(
                this.direction,
                new THREE.Vector3(0, 0, 0),
                Math.max(1.5, this.radius * 0.7),
                0x88ccff,
                0.6,
                0.3
            );
            arrow.userData.isSystemObject = true;
            arrow.traverse((child) => {
                child.userData.isSystemObject = true;
            });
            group.add(arrow);
        }

        const core = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 0.7),
            this.mode === 'directional' ? solidMatDark : solidMat
        );
        core.userData.isSystemObject = true;
        group.add(core);

        group.position.copy(this.position);
        group.visible = this.enabled;
        this.scene.add(group);
        this.helper = group;
    }

    remove() {
        if (this.helper) {
            this.scene.remove(this.helper);
            _disposeObject(this.helper);
            this.helper = null;
        }
    }
}

// ============================================================================
// LIQUID ZONE
// ============================================================================
class LiquidZone {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.id = options.id || _zoneId('lz');
        this.enabled = options.enabled !== false;
        this.liquidType = options.liquidType || 'water';
        this.density = Number(options.density) || 1000;
        this.viscosity = Number.isFinite(Number(options.viscosity))
            ? Number(options.viscosity)
            : 0.9;
        this.waveHeight = Number.isFinite(Number(options.waveHeight))
            ? Number(options.waveHeight)
            : 0.15;
        this.waveSpeed = Number.isFinite(Number(options.waveSpeed))
            ? Number(options.waveSpeed)
            : 1;
        this.halfW = Number(options.halfW) || 8;
        this.halfD = Number(options.halfD) || 8;
        this.depth = Number(options.depth) || 4;
        this.surfaceY = Number.isFinite(
            Number(options.y ?? options.surfaceY)
        ) ? Number(options.y ?? options.surfaceY) : 0;
        this.color = Number(options.color) || 0x0055cc;
        if (options.position && options.position.isVector3) {
            this.x = Number(options.position.x) || 0;
            this.z = Number(options.position.z) || 0;
        } else {
            this.x = Number(options.x) || 0;
            this.z = Number(options.z) || 0;
        }
        this._time = 0;
        this._mesh = null;
        this._waveMesh = null;
        this._wavePositions = null;
        this._waveBase = null;
        this._buildVisual();
    }

    _buildVisual() {
        const color = new THREE.Color(this.color);

        const bodyMat = new THREE.MeshStandardMaterial({
            color,
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const boxGeo = new THREE.BoxGeometry(
            this.halfW * 2,
            this.depth,
            this.halfD * 2
        );
        this._mesh = new THREE.Mesh(boxGeo, bodyMat);
        this._mesh.name = 'LiquidZoneBody';
        this._mesh.position.set(this.x, this.surfaceY, this.z);
        this._mesh.userData.isSystemObject = true;
        this.scene.add(this._mesh);

        const waveGeo = new THREE.PlaneGeometry(
            this.halfW * 2,
            this.halfD * 2,
            32,
            32
        );
        waveGeo.rotateX(-Math.PI / 2);
        this._wavePositions = waveGeo.attributes.position;
        this._waveBase = new Float32Array(this._wavePositions.array);
        this._waveMesh = new THREE.Mesh(
            waveGeo,
            new THREE.MeshStandardMaterial({
                color,
                transparent: true,
                opacity: 0.55,
                depthWrite: false,
                side: THREE.DoubleSide
            })
        );
        this._waveMesh.name = 'LiquidZoneSurface';
        this._waveMesh.position.set(this.x, this.surfaceY, this.z);
        this._waveMesh.userData.isSystemObject = true;
        this.scene.add(this._waveMesh);
    }

    updateWaves(delta) {
        if (!this._waveMesh) return;
        this._time += Number(delta) || 0;
        if (this._mesh) {
            this.surfaceY = this._mesh.position.y;
            this.x = this._mesh.position.x;
            this.z = this._mesh.position.z;
        }
        this._waveMesh.position.set(this.x, this.surfaceY, this.z);
        const amp = Number(this.waveHeight) || 0;
        const speed = Number(this.waveSpeed) || 1;
        if (amp > 0 && this._wavePositions && this._waveBase) {
            const pos = this._wavePositions.array;
            const base = this._waveBase;
            const t = this._time * speed;
            for (let i = 0; i < pos.length; i += 3) {
                const px = base[i];
                const pz = base[i + 2];
                pos[i + 1] =
                    Math.sin(px * 1.2 + t) * amp * 0.6 +
                    Math.cos(pz * 1.1 + t * 1.4) * amp * 0.4;
            }
            this._wavePositions.needsUpdate = true;
        }
    }

    contains(point) {
        if (Math.abs(point.x - this.x) > this.halfW) return false;
        if (Math.abs(point.z - this.z) > this.halfD) return false;
        const below = this.surfaceY - point.y;
        return below >= -this.waveHeight && below <= this.depth;
    }

    forceAt(point, mass, linearVel, angularVel, halfExtentY, volume, delta) {
        if (!this.enabled) return null;
        if (!mass || mass <= 0) return null;
        if (Math.abs(point.x - this.x) > this.halfW) return null;
        if (Math.abs(point.z - this.z) > this.halfD) return null;

        const extentY = Number(halfExtentY) || 0.5;
        const vol = Number(volume) || 1;
        const surface = this.surfaceY + (Number(this.waveHeight) || 0) * 0.5;
        const deepest = point.y - extentY;
        if (deepest >= surface) return null;

        const depth = Math.max(0, Number(this.depth) || 0);
        const submerged = Math.max(
            0,
            Math.min(depth, surface - deepest)
        );
        const fraction = depth > 0 ? Math.min(1, submerged / depth) : 0;
        if (fraction <= 0) return null;

        const buoyancy = this.density * 9.81 * vol * fraction;

        const linear = { x: 0, y: buoyancy, z: 0 };
        const angular = { x: 0, y: 0, z: 0 };

        const drag = this.viscosity *
            Math.max(0.05, fraction) * mass * 16;
        if (linearVel) {
            linear.x -= (linearVel.x || 0) * drag;
            linear.y -= (linearVel.y || 0) * drag;
            linear.z -= (linearVel.z || 0) * drag;
        }
        if (angularVel) {
            const angularDrag = drag * 0.4;
            angular.x -= (angularVel.x || 0) * angularDrag;
            angular.y -= (angularVel.y || 0) * angularDrag;
            angular.z -= (angularVel.z || 0) * angularDrag;
        }
        const velSpeed = linearVel
            ? Math.sqrt(
                linearVel.x * linearVel.x +
                linearVel.y * linearVel.y +
                linearVel.z * linearVel.z
            )
            : 0;
        if (velSpeed > 0.01 && linearVel) {
            const quad = this.viscosity * fraction * mass * 5 * velSpeed;
            linear.x -= (linearVel.x / velSpeed) * quad * 0.3;
            linear.y -= (linearVel.y / velSpeed) * quad;
            linear.z -= (linearVel.z / velSpeed) * quad * 0.3;
        }

        const speed = Number(this.waveSpeed) || 1;
        const t = this._time * speed;
        const wavePush = (Number(this.waveHeight) || 0) * mass * 2;
        linear.x += Math.sin(t + point.z * 0.9) * wavePush;
        linear.z += Math.cos(t + point.x * 0.8) * wavePush;

        return { linear, angular };
    }

    remove() {
        if (this._mesh) {
            this.scene.remove(this._mesh);
            if (this._mesh.geometry) this._mesh.geometry.dispose();
            if (this._mesh.material) this._mesh.material.dispose();
            this._mesh = null;
        }
        if (this._waveMesh) {
            this.scene.remove(this._waveMesh);
            if (this._waveMesh.geometry) this._waveMesh.geometry.dispose();
            if (this._waveMesh.material) this._waveMesh.material.dispose();
            this._waveMesh = null;
        }
        this._wavePositions = null;
        this._waveBase = null;
    }
}

// --- Globals (consumed by PhysicsSystem / physics-compat / app-bootstrap) ---
if (typeof window !== 'undefined') {
    window.WindZone = WindZone;
    window.LiquidZone = LiquidZone;
    window.PhysicsZones = PhysicsZones;
}
