// ============================================================================
// ADVANCED PHYSICS SYSTEM  v3.0
//  Full Ammo.js rigid + soft body simulation
//  Wind Zones with 3D helper gizmos & directional control
//  Liquid / Fluid simulation (SPH + buoyancy volumes)
//  Explosion, Force Fields, Attractors, Vortex
//  Per-object advanced properties (CCD, custom shapes, material presets)
//  Floating advanced UI panel with every control
// ============================================================================
'use strict';

// MATERIAL PRESETS
const PHYSICS_MATERIALS = {
    DEFAULT: { friction: 0.50, restitution: 0.10, density: 1000, label: 'Default' },
    ICE: { friction: 0.02, restitution: 0.05, density: 917, label: 'Ice' },
    WET_ICE: { friction: 0.01, restitution: 0.02, density: 920, label: 'Wet Ice' },
    WOOD: { friction: 0.60, restitution: 0.30, density: 600, label: 'Wood' },
    METAL: { friction: 0.40, restitution: 0.05, density: 7850, label: 'Steel' },
    ALUMINUM: { friction: 0.35, restitution: 0.08, density: 2700, label: 'Aluminum' },
    RUBBER: { friction: 1.00, restitution: 0.90, density: 1100, label: 'Rubber' },
    CONCRETE: { friction: 0.80, restitution: 0.10, density: 2400, label: 'Concrete' },
    GLASS: { friction: 0.40, restitution: 0.70, density: 2500, label: 'Glass' },
    PLASTIC: { friction: 0.50, restitution: 0.50, density: 950, label: 'Plastic' },
    SUPER_BOUNCE: { friction: 0.10, restitution: 1.20, density: 1000, label: 'Super Bounce' },
    FOAM: { friction: 0.70, restitution: 0.05, density: 30, label: 'Foam' },
    SAND: { friction: 0.90, restitution: 0.02, density: 1600, label: 'Sand' },
    CLAY: { friction: 0.80, restitution: 0.01, density: 1750, label: 'Clay' },
    STONE: { friction: 0.70, restitution: 0.15, density: 2700, label: 'Stone' },
};

// COLLISION GROUPS
const COL = {
    NONE: 0,
    DEFAULT: 1,
    GROUND: 2,
    KINEMATIC: 4,
    LIQUID: 8,
    SENSOR: 16,
    ALL: -1,
};

class PhysicsSystem {
    constructor(scene) {
        this.scene = scene;
        this.ammo = null;
        this.physicsWorld = null;
        this.isReady = false;
        this.supportsSoftBodies = false;
        this.simulationRunning = false;
        this.selectedObject = null;
        this.previousSelection = null;
        this.meshToBodyMap = new Map();
        this.bodyPtrToMesh = new Map();
        this._bodyResources = new Map();
        this._constraintMeta = new Map();
        this._collisionPairs = new Map();
        this._worldResources = null;
        this._groundResources = null;
        this.physicsGround = null;
        this.timeScale = 1;
        this.fixedTimeStep = 1 / 60;
        this.maxSubSteps = 8;
        this.solverIterations = 12;
        this.maxFrameDelta = 0.1;
        this._time = 0;
        this._frame = 0;
        this._uiAccumulator = 0;
        this.gravity = new THREE.Vector3(0, -9.81, 0);
        this.windZones = [];
        this.liquidZones = [];
        this.forceFields = [];
        this.constraints = [];
        this.debugMode = false;
        this.debugSleep = false;
        this.globalWind = new THREE.Vector3();
        this.globalAirDrag = 0.04;
        this.ui = null;
        this.localBridge = window.PhysicsWasmBridge || null;
        this.runtimeStatus = {
            ammoBackend: 'Unavailable',
            localBackend: 'Unavailable',
            localDetails: 'Not initialized'
        };
        this.solverProfiles = {
            RBD: { label: 'RBD Destruction', description: 'Stable rigid-body contacts and stacks.', iterations: 18, substeps: 8, hz: 60, drag: 0.03, timeScale: 1 },
            FLIP: { label: 'FLIP Water', description: 'Liquid-biased buoyancy profile.', iterations: 20, substeps: 10, hz: 90, drag: 0.08, timeScale: 1 },
            VELLUM: { label: 'Vellum Soft', description: 'Soft-body and cloth-biased profile.', iterations: 26, substeps: 12, hz: 120, drag: 0.12, timeScale: 1 },
            POP: { label: 'POP Motion', description: 'Fast force-field and particle-style motion.', iterations: 14, substeps: 6, hz: 60, drag: 0.02, timeScale: 1 },
            FEM: { label: 'FEM Heavy', description: 'High-stability deformation profile.', iterations: 32, substeps: 16, hz: 120, drag: 0.14, timeScale: 0.85 },
            PYRO: { label: 'Pyro Field', description: 'Field-driven turbulence profile.', iterations: 16, substeps: 8, hz: 90, drag: 0.04, timeScale: 1 }
        };
        this.activeSolverProfile = 'RBD';
        this._tmpTransform = null;
        this._tmpAmmoVector = null;
        this._tmpAmmoQuaternion = null;
        this._forceAmmoVector = null;
        this._worldPosition = new THREE.Vector3();
        this._worldQuaternion = new THREE.Quaternion();
        this._parentQuaternion = new THREE.Quaternion();
        this._localPosition = new THREE.Vector3();
        this._localQuaternion = new THREE.Quaternion();
        this._worldScale = new THREE.Vector3();
        this._scratchV1 = new THREE.Vector3();
        this._scratchV2 = new THREE.Vector3();
        this._scratchV3 = new THREE.Vector3();
        this._scratchQ = new THREE.Quaternion();
        this._liveLinear = new THREE.Vector3();
        this._liveAngular = new THREE.Vector3();
    }
    static get MATERIALS() {
        return PHYSICS_MATERIALS;
    }
    _ptr(object) {
        if (!object) return 0;
        if (Number.isFinite(object.ptr)) return object.ptr;
        if (this.ammo?.getPointer) {
            try { return this.ammo.getPointer(object) || 0; } catch (error) { }
        }
        return 0;
    }
    _destroy(object) {
        if (!object || !this.ammo) return;
        try { this.ammo.destroy(object); } catch (error) { }
    }
    _setAmmoVector(target, x, y, z) {
        target.setValue(Number(x) || 0, Number(y) || 0, Number(z) || 0);
        return target;
    }
    async _waitForAmmo(timeoutMs) {
        const start = Date.now();
        const timeout = Number(timeoutMs) || 8000;
        while (Date.now() - start < timeout) {
            const factory = window.Ammo ||
                (typeof Ammo !== 'undefined' ? Ammo : null);
            if (factory) return factory;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return null;
    }
    async init(uiContainerId) {
        if (this.isReady) return true;
        if (uiContainerId && typeof PhysicsUI !== 'undefined') {
            this.ui = new PhysicsUI(this, uiContainerId);
            this.ui.build();
        }
        try {
            if (this.localBridge?.init) {
                try { await this.localBridge.init(); } catch (error) {
                    console.warn('[Physics] Local bridge unavailable:', error);
                }
            }
            let factory = window.Ammo ||
                (typeof Ammo !== 'undefined' ? Ammo : null);
            if (!factory) {
                console.warn('[Physics] Ammo.js missing — waiting for it to load…');
                factory = await this._waitForAmmo(8000);
            }
            if (!factory) throw new Error('Ammo.js was not found.');
            this.ammo = typeof factory === 'function' ? await factory() : factory;
            const A = this.ammo;
            const supportsSoft = !!(
                A.btSoftBodyRigidBodyCollisionConfiguration &&
                A.btSoftRigidDynamicsWorld &&
                A.btDefaultSoftBodySolver
            );
            this.supportsSoftBodies = supportsSoft;
            let config;
            let dispatcher;
            let broadphase;
            let solver;
            let softSolver = null;
            if (supportsSoft) {
                config = new A.btSoftBodyRigidBodyCollisionConfiguration();
                dispatcher = new A.btCollisionDispatcher(config);
                broadphase = new A.btDbvtBroadphase();
                solver = new A.btSequentialImpulseConstraintSolver();
                softSolver = new A.btDefaultSoftBodySolver();
                this.physicsWorld = new A.btSoftRigidDynamicsWorld(
                    dispatcher,
                    broadphase,
                    solver,
                    config,
                    softSolver
                );
            } else {
                config = new A.btDefaultCollisionConfiguration();
                dispatcher = new A.btCollisionDispatcher(config);
                broadphase = new A.btDbvtBroadphase();
                solver = new A.btSequentialImpulseConstraintSolver();
                this.physicsWorld = new A.btDiscreteDynamicsWorld(
                    dispatcher,
                    broadphase,
                    solver,
                    config
                );
            }
            this._worldResources = { config, dispatcher, broadphase, solver, softSolver };
            this._dispatcher = dispatcher;
            this._tmpTransform = new A.btTransform();
            this._tmpTransform.setIdentity();
            this._tmpAmmoVector = new A.btVector3(0, 0, 0);
            this._tmpAmmoQuaternion = new A.btQuaternion(0, 0, 0, 1);
            this._forceAmmoVector = new A.btVector3(0, 0, 0);
        this._setWorldGravity();
        const solverInfo = this.physicsWorld.getSolverInfo?.();
        if (solverInfo && typeof solverInfo.set_m_numIterations === 'function') {
            solverInfo.set_m_numIterations(this.solverIterations);
        }
            this.runtimeStatus.ammoBackend = supportsSoft
                ? 'Browser Ammo WASM · Rigid + Soft'
                : 'Browser Ammo WASM · Rigid';
            if (this.localBridge?.getStatus) {
                const local = this.localBridge.getStatus();
                this.runtimeStatus.localBackend = local.ready
                    ? local.backend
                    : 'JS Fallback';
                this.runtimeStatus.localDetails = local.ready
                    ? 'Local SM physics helper active'
                    : (local.error || 'Local helper unavailable');
            }
            this.isReady = true;
            this.simulationRunning = true;
            this.ui?.refreshWorkbench?.();
            console.log('[Physics] Engine ready', this.getRuntimeReport());
            return true;
        } catch (error) {
            console.error('[Physics] Initialization failed:', error);
            this.runtimeStatus.ammoBackend = 'Unavailable';
            this.runtimeStatus.localDetails = error?.message || 'Initialization failed';
            this.ui?.refreshWorkbench?.();
            return false;
        }
    }
    _setWorldGravity() {
        if (!this.physicsWorld || !this.ammo) return;
        const g = new this.ammo.btVector3(
            this.gravity.x,
            this.gravity.y,
            this.gravity.z
        );
        this.physicsWorld.setGravity(g);
        if (this.physicsWorld.getWorldInfo) {
            try {
                this.physicsWorld.getWorldInfo().set_m_gravity(g);
            } catch (error) { }
        }
        this._destroy(g);
    }
    _applyGravityToBody(body, props) {
        if (!body || !props || props.type === 'soft') return;
        const enabled = props.flags?.enableGravity !== false;
        const scale = Number.isFinite(Number(props.gravityScale))
            ? Number(props.gravityScale)
            : 1;
        const x = enabled ? this.gravity.x * scale : 0;
        const y = enabled ? this.gravity.y * scale : 0;
        const z = enabled ? this.gravity.z * scale : 0;
        this._setAmmoVector(this._tmpAmmoVector, x, y, z);
        if (typeof body.setGravity === 'function') {
            body.setGravity(this._tmpAmmoVector);
        }
    }
    _getWorldTransform(object) {
        object.updateWorldMatrix(true, false);
        object.getWorldPosition(this._worldPosition);
        object.getWorldQuaternion(this._worldQuaternion);
        return {
            position: this._worldPosition,
            quaternion: this._worldQuaternion
        };
    }
    _writeTransformFromObject(object, body) {
        if (!object || !body) return;
        const world = this._getWorldTransform(object);
        this._tmpTransform.setIdentity();
        this._setAmmoVector(
            this._tmpAmmoVector,
            world.position.x,
            world.position.y,
            world.position.z
        );
        this._tmpAmmoQuaternion.setValue(
            world.quaternion.x,
            world.quaternion.y,
            world.quaternion.z,
            world.quaternion.w
        );
        this._tmpTransform.setOrigin(this._tmpAmmoVector);
        this._tmpTransform.setRotation(this._tmpAmmoQuaternion);
        body.setWorldTransform(this._tmpTransform);
        const motionState = body.getMotionState?.();
        motionState?.setWorldTransform?.(this._tmpTransform);
    }
    _applyWorldTransformToObject(object, position, quaternion) {
        if (!object.parent) {
            object.position.copy(position);
            object.quaternion.copy(quaternion);
            return;
        }
        object.parent.updateWorldMatrix(true, false);
        this._localPosition.copy(position);
        object.parent.worldToLocal(this._localPosition);
        object.parent.getWorldQuaternion(this._parentQuaternion);
        this._parentQuaternion.invert();
        this._localQuaternion
            .copy(this._parentQuaternion)
            .multiply(quaternion)
            .normalize();
        object.position.copy(this._localPosition);
        object.quaternion.copy(this._localQuaternion);
    }
    update(delta) {
        if (!this.isReady || !this.simulationRunning || !this.physicsWorld) return;
        let dt = Number(delta);
        if (!Number.isFinite(dt) || dt <= 0) return;
        dt = Math.min(dt, this.maxFrameDelta);
        const scaled = Math.min(
            dt * this.timeScale,
            this.fixedTimeStep * this.maxSubSteps
        );
        if (scaled <= 0) return;
        this._time += scaled;
        this._frame++;
        this._uiAccumulator += dt;
        for (const liquid of this.liquidZones) {
            if (liquid?.enabled !== false) {
                liquid.updateWaves?.(scaled);
            }
        }
        this._applyEffects(scaled);
        this.physicsWorld.stepSimulation(
            scaled,
            this.maxSubSteps,
            this.fixedTimeStep
        );
        try { this._processCollisions(); } catch (error) { }
        try { this._syncBodyTransforms(); } catch (error) { }
    }
    step(delta) {
        if (!this.isReady || !this.physicsWorld) return false;
        let dt = Number(delta);
        if (!Number.isFinite(dt) || dt <= 0) return false;
        dt = Math.min(dt, this.maxFrameDelta);
        const scaled = Math.min(
            dt * this.timeScale,
            this.fixedTimeStep * this.maxSubSteps
        );
        if (scaled <= 0) return false;
        this._time += scaled;
        this._frame++;
        for (const liquid of this.liquidZones) {
            if (liquid?.enabled !== false) {
                liquid.updateWaves?.(scaled);
            }
        }
        this._applyEffects(scaled);
        this.physicsWorld.stepSimulation(
            scaled,
            this.maxSubSteps,
            this.fixedTimeStep
        );
        try { this._processCollisions(); } catch (error) { }
        try { this._syncBodyTransforms(); } catch (error) { }
        return true;
    }
    _syncBodyTransforms() {
        for (const [mesh, body] of this.meshToBodyMap) {
            const props = mesh.userData.physics;
            if (!props) continue;
            if (props.type === 'soft') {
                this._syncSoftBody(mesh, body);
                continue;
            }
            if (props.isKinematic) {
                this._writeTransformFromObject(mesh, body);
                continue;
            }
            if ((props.mass ?? 0) <= 0) continue;
            const isActive = typeof body.isActive === 'function'
                ? body.isActive()
                : true;
            if (!isActive && mesh !== this.selectedObject) continue;
            const motionState = body.getMotionState?.();
            if (!motionState) continue;
            motionState.getWorldTransform(this._tmpTransform);
            const p = this._tmpTransform.getOrigin();
            const q = this._tmpTransform.getRotation();
            this._worldPosition.set(p.x(), p.y(), p.z());
            this._worldQuaternion.set(q.x(), q.y(), q.z(), q.w()).normalize();
            this._applyWorldTransformToObject(
                mesh,
                this._worldPosition,
                this._worldQuaternion
            );
            if (
                mesh === this.selectedObject &&
                this.ui &&
                this._uiAccumulator >= 0.08
            ) {
                const lv = body.getLinearVelocity();
                const av = body.getAngularVelocity();
                this._liveLinear.set(lv.x(), lv.y(), lv.z());
                this._liveAngular.set(av.x(), av.y(), av.z());
                this.ui.updateLiveState(
                    this._liveLinear,
                    this._liveAngular
                );
                this._uiAccumulator = 0;
            }
        }
    }
    resetVelocity(obj) {
        if (!this.isReady || !obj) return false;
        const body = this.meshToBodyMap.get(obj);
        if (!body) return false;
        try {
            this._setAmmoVector(this._tmpAmmoVector, 0, 0, 0);
            body.setLinearVelocity(this._tmpAmmoVector);
            body.setAngularVelocity(this._tmpAmmoVector);
            body.clearForces?.();
            body.activate?.(true);
            return true;
        } catch (error) {
            return false;
        }
    }
    getRuntimeReport() {
        let activeBodies = 0;
        let sleepingBodies = 0;
        for (const [mesh, body] of this.meshToBodyMap) {
            if (mesh.userData.physics?.type === 'soft') continue;
            const dynamic = (mesh.userData.physics?.mass ?? 0) > 0 && !mesh.userData.physics?.isKinematic;
            if (!dynamic) continue;
            if (body.isActive?.()) activeBodies++;
            else sleepingBodies++;
        }
        return {
            ammoBackend: this.runtimeStatus.ammoBackend,
            localBackend: this.runtimeStatus.localBackend,
            localDetails: this.runtimeStatus.localDetails,
            worldReady: this.isReady,
            simulationRunning: this.simulationRunning,
            supportsSoftBodies: this.supportsSoftBodies,
            rigidBodies: this._countPhysicsType('rigid'),
            softBodies: this._countPhysicsType('soft'),
            activeBodies,
            sleepingBodies,
            windZones: this.windZones.length,
            liquidZones: this.liquidZones.length,
            constraints: this.constraints.length,
            forceFields: this.forceFields.length,
            activeCollisions: this._collisionPairs.size,
            activePreset: this.activeSolverProfile,
            fixedHz: Math.round(1 / this.fixedTimeStep),
            substeps: this.maxSubSteps,
            iterations: this.solverIterations
        };
    }
    _countPhysicsType(kind) {
        let count = 0;
        for (const mesh of this.meshToBodyMap.keys()) {
            const type = mesh?.userData?.physics?.type || 'rigid';
            if (kind === 'rigid' && type !== 'soft') count++;
            if (kind === 'soft' && type === 'soft') count++;
        }
        return count;
    }
    applySolverProfile(key) {
        const profile = this.solverProfiles[key];
        if (!profile) return false;
        this.activeSolverProfile = key;
        this.setSolverIterations(profile.iterations);
        this.setMaxSubSteps(profile.substeps);
        this.setSolverHz(profile.hz);
        this.setTimeScale(profile.timeScale);
        this.globalAirDrag = profile.drag;
        this.ui?._set?.('ph-solver-iter', profile.iterations);
        this.ui?._set?.('ph-substeps', profile.substeps);
        this.ui?._set?.('ph-fixed-hz', profile.hz);
        this.ui?._set?.('ph-timescale', profile.timeScale);
        this.ui?._set?.('ph-env-drag', profile.drag);
        this.ui?.refreshWorkbench?.();
        return true;
    }
    _getShapeBounds(object) {
        object.updateWorldMatrix(true, true);
        object.getWorldScale(this._worldScale);
        const signedScale = this._worldScale.clone();
        const absScale = this._worldScale.clone().set(
            Math.abs(this._worldScale.x),
            Math.abs(this._worldScale.y),
            Math.abs(this._worldScale.z)
        );
        let size = new THREE.Vector3(1, 1, 1);
        let center = new THREE.Vector3();
        let radius = 0.5;
        if (object.isMesh && object.geometry?.attributes?.position) {
            const geometry = object.geometry;
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            if (!geometry.boundingSphere) geometry.computeBoundingSphere();
            if (geometry.boundingBox) {
                geometry.boundingBox.getSize(size);
                geometry.boundingBox.getCenter(center);
                size.multiply(absScale);
                center.multiply(signedScale);
            }
            if (geometry.boundingSphere) {
                radius = geometry.boundingSphere.radius * Math.max(
                    absScale.x,
                    absScale.y,
                    absScale.z
                );
            }
        } else {
            const box = new THREE.Box3().setFromObject(object);
            if (!box.isEmpty()) {
                box.getSize(size);
                const centerWorld = box.getCenter(new THREE.Vector3());
                const world = this._getWorldTransform(object);
                center.copy(centerWorld).sub(world.position);
                this._scratchQ.copy(world.quaternion).invert();
                center.applyQuaternion(this._scratchQ);
                radius = size.length() * 0.5;
            }
        }
        size.x = Math.max(size.x, 0.001);
        size.y = Math.max(size.y, 0.001);
        size.z = Math.max(size.z, 0.001);
        radius = Math.max(radius, 0.001);
        return { size, center, radius, scale: signedScale, absScale };
    }
    _wrapPrimitiveShape(shape, center) {
        if (
            !center ||
            center.lengthSq() < 1e-10 ||
            !this.ammo.btCompoundShape
        ) {
            return { shape, extras: [] };
        }
        const compound = new this.ammo.btCompoundShape();
        const localTransform = new this.ammo.btTransform();
        localTransform.setIdentity();
        const offset = new this.ammo.btVector3(
            center.x,
            center.y,
            center.z
        );
        localTransform.setOrigin(offset);
        compound.addChildShape(localTransform, shape);
        this._destroy(offset);
        this._destroy(localTransform);
        return {
            shape: compound,
            extras: [shape]
        };
    }
    _createConvexShape(mesh, bounds) {
        if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return null;
        const A = this.ammo;
        const hull = new A.btConvexHullShape();
        const position = mesh.geometry.attributes.position;
        const temp = new A.btVector3(0, 0, 0);
        for (let i = 0; i < position.count; i++) {
            temp.setValue(
                position.getX(i) * bounds.scale.x,
                position.getY(i) * bounds.scale.y,
                position.getZ(i) * bounds.scale.z
            );
            hull.addPoint(temp, i === position.count - 1);
        }
        this._destroy(temp);
        hull.recalcLocalAabb?.();
        return {
            shape: hull,
            extras: [],
            volume: bounds.size.x * bounds.size.y * bounds.size.z,
            halfExtentY: bounds.size.y * 0.5,
            radius: bounds.radius
        };
    }
    _createTriangleMeshShape(mesh, bounds, props) {
        if (
            !mesh.isMesh ||
            !mesh.geometry?.attributes?.position ||
            !this.ammo.btTriangleMesh ||
            !this.ammo.btBvhTriangleMeshShape
        ) return null;
        if ((props.mass ?? 0) > 0 && !props.isKinematic) {
            console.warn(
                '[Physics] Dynamic trimesh is not stable. Using Convex Hull instead:',
                mesh.name
            );
            return this._createConvexShape(mesh, bounds);
        }
        const A = this.ammo;
        const geometry = mesh.geometry;
        const position = geometry.attributes.position;
        const index = geometry.index;
        const triangleMesh = new A.btTriangleMesh(true, true);
        const a = new A.btVector3(0, 0, 0);
        const b = new A.btVector3(0, 0, 0);
        const c = new A.btVector3(0, 0, 0);
        const setVertex = (target, i) => {
            target.setValue(
                position.getX(i) * bounds.scale.x,
                position.getY(i) * bounds.scale.y,
                position.getZ(i) * bounds.scale.z
            );
        };
        if (index) {
            for (let i = 0; i < index.count; i += 3) {
                setVertex(a, index.getX(i));
                setVertex(b, index.getX(i + 1));
                setVertex(c, index.getX(i + 2));
                triangleMesh.addTriangle(a, b, c, true);
            }
        } else {
            for (let i = 0; i + 2 < position.count; i += 3) {
                setVertex(a, i);
                setVertex(b, i + 1);
                setVertex(c, i + 2);
                triangleMesh.addTriangle(a, b, c, true);
            }
        }
        this._destroy(a);
        this._destroy(b);
        this._destroy(c);
        const shape = new A.btBvhTriangleMeshShape(
            triangleMesh,
            true,
            true
        );
        return {
            shape,
            extras: [triangleMesh],
            volume: bounds.size.x * bounds.size.y * bounds.size.z,
            halfExtentY: bounds.size.y * 0.5,
            radius: bounds.radius
        };
    }
    _createShape(mesh, type, props = {}) {
        if (!mesh) return null;
        const A = this.ammo;
        const bounds = this._getShapeBounds(mesh);
        const { size, center, radius } = bounds;
        const hx = size.x * 0.5;
        const hy = size.y * 0.5;
        const hz = size.z * 0.5;
        let primitive = null;
        let volume = 1;
        let halfExtentY = hy;
        if (type === 'trimesh') {
            const descriptor = this._createTriangleMeshShape(
                mesh,
                bounds,
                props
            );
            if (descriptor) {
                this._applyShapeMargin(descriptor.shape, props, radius);
                return descriptor;
            }
        }
        if (type === 'convex') {
            const descriptor = this._createConvexShape(mesh, bounds);
            if (descriptor) {
                this._applyShapeMargin(descriptor.shape, props, radius);
                return descriptor;
            }
        }
        switch (type) {
            case 'sphere': {
                const r = Math.max(hx, hy, hz);
                primitive = new A.btSphereShape(r);
                volume = (4 / 3) * Math.PI * r * r * r;
                halfExtentY = r;
                break;
            }
            case 'capsule': {
                const r = Math.max(0.001, Math.min(hx, hz));
                const cylinderHeight = Math.max(0, size.y - 2 * r);
                primitive = new A.btCapsuleShape(r, cylinderHeight);
                volume = Math.PI * r * r * cylinderHeight + (4 / 3) * Math.PI * r * r * r;
                halfExtentY = hy;
                break;
            }
            case 'cylinder': {
                const r = Math.max(hx, hz);
                const extents = new A.btVector3(r, hy, r);
                primitive = new A.btCylinderShape(extents);
                this._destroy(extents);
                volume = Math.PI * r * r * size.y;
                break;
            }
            case 'cone': {
                const r = Math.max(hx, hz);
                primitive = new A.btConeShape(r, size.y);
                volume = (1 / 3) * Math.PI * r * r * size.y;
                break;
            }
            default: {
                const extents = new A.btVector3(hx, hy, hz);
                primitive = new A.btBoxShape(extents);
                this._destroy(extents);
                volume = size.x * size.y * size.z;
                break;
            }
        }
        const wrapped = this._wrapPrimitiveShape(
            primitive,
            center
        );
        const descriptor = {
            shape: wrapped.shape,
            extras: wrapped.extras,
            volume,
            halfExtentY,
            radius
        };
        this._applyShapeMargin(
            descriptor.shape,
            props,
            radius
        );
        return descriptor;
    }
    _applyShapeMargin(shape, props, radius) {
        if (!shape?.setMargin) return;
        const requested = Number(props.collisionMargin);
        const margin = Number.isFinite(requested)
            ? requested
            : Math.min(0.04, Math.max(0.002, radius * 0.02));
        shape.setMargin(
            THREE.MathUtils.clamp(margin, 0.001, 0.1)
        );
    }
    _configureActivation(body, props) {
        if (!body) return;
        const A = this.ammo;
        const disableDeactivation = A.DISABLE_DEACTIVATION ?? 4;
        const activeTag = A.ACTIVE_TAG ?? 1;
        if (props.isKinematic || props.flags?.noSleep === true) {
            body.setActivationState(disableDeactivation);
        } else {
            body.forceActivationState?.(activeTag);
            body.setActivationState?.(activeTag);
            body.setSleepingThresholds?.(
                props.linearSleepThreshold ?? 0.8,
                props.angularSleepThreshold ?? 1
            );
        }
    }
    _configureCCD(body, props, radius) {
        if (!body) return;
        if (props.flags?.ccd === true) {
            const r = Math.max(0.01, radius || 0.1);
            body.setCcdMotionThreshold?.(
                Math.max(0.001, r * 0.5)
            );
            body.setCcdSweptSphereRadius?.(
                Math.max(0.001, r * 0.2)
            );
        } else {
            body.setCcdMotionThreshold?.(0);
            body.setCcdSweptSphereRadius?.(0);
        }
    }
    addBody(mesh, inputProps = {}) {
        if (!this.isReady || !this.physicsWorld || !mesh) return null;
        if (this.meshToBodyMap.has(mesh)) {
            this.removeBody(mesh, { silent: true });
        }
        if (!mesh.userData) mesh.userData = {};
        if (!mesh.userData.physicsState) {
            mesh.userData.physicsState = {
                position: mesh.position.clone(),
                quaternion: mesh.quaternion.clone(),
                scale: mesh.scale.clone()
            };
        }
        const props = {
            mass: 1,
            shapeType: 'box',
            material: 'DEFAULT',
            friction: 0.5,
            restitution: 0.1,
            linearDamping: 0.05,
            angularDamping: 0.05,
            gravityScale: 1,
            isKinematic: false,
            collisionGroup: COL.DEFAULT,
            collisionMask: COL.ALL,
            flags: {
                enableGravity: true,
                ccd: false,
                noSleep: false,
                windAffected: true
            },
            ...inputProps,
            flags: {
                enableGravity: true,
                ccd: false,
                noSleep: false,
                windAffected: true,
                ...(inputProps.flags || {})
            }
        };
        const material = PHYSICS_MATERIALS[props.material];
        if (material) {
            props.friction = inputProps.friction ?? material.friction;
            props.restitution = inputProps.restitution ?? material.restitution;
        }
        props.mass = Math.max(0, Number(props.mass) || 0);
        props.gravityScale = Math.max(0, Number(props.gravityScale) ?? 1);
        if (
            props.type === 'soft' ||
            mesh.userData.physicsMap
        ) {
            if (!this.supportsSoftBodies) {
                console.warn('[Physics] Soft bodies are unavailable in this Ammo build.');
                return null;
            }
            props.type = 'soft';
            mesh.userData.physics = props;
            const body = this._createSoftBody(mesh, props);
            this.ui?.updateObjectPanel(mesh);
            this.ui?.refreshWorkbench?.();
            return body;
        }
        props.type = 'rigid';
        mesh.userData.physics = props;
        const descriptor = this._createShape(
            mesh,
            props.shapeType || 'box',
            props
        );
        if (!descriptor?.shape) {
            console.error('[Physics] Collider creation failed:', mesh.name);
            delete mesh.userData.physics;
            return null;
        }
        props.volume = descriptor.volume;
        props.halfExtentY = descriptor.halfExtentY;
        props.boundingRadius = descriptor.radius;
        const A = this.ammo;
        const world = this._getWorldTransform(mesh);
        this._tmpTransform.setIdentity();
        this._setAmmoVector(
            this._tmpAmmoVector,
            world.position.x,
            world.position.y,
            world.position.z
        );
        this._tmpAmmoQuaternion.setValue(
            world.quaternion.x,
            world.quaternion.y,
            world.quaternion.z,
            world.quaternion.w
        );
        this._tmpTransform.setOrigin(this._tmpAmmoVector);
        this._tmpTransform.setRotation(this._tmpAmmoQuaternion);
        const motionState = new A.btDefaultMotionState(
            this._tmpTransform
        );
        const inertia = new A.btVector3(0, 0, 0);
        const actualMass = props.isKinematic ? 0 : props.mass;
        if (actualMass > 0) {
            descriptor.shape.calculateLocalInertia(
                actualMass,
                inertia
            );
        }
        const info = new A.btRigidBodyConstructionInfo(
            actualMass,
            motionState,
            descriptor.shape,
            inertia
        );
        const body = new A.btRigidBody(info);
        this._destroy(info);
        this._destroy(inertia);
        body.setFriction(
            THREE.MathUtils.clamp(
                Number(props.friction) || 0,
                0,
                10
            )
        );
        body.setRestitution(
            THREE.MathUtils.clamp(
                Number(props.restitution) || 0,
                0,
                2
            )
        );
        body.setDamping(
            THREE.MathUtils.clamp(Number(props.linearDamping) || 0, 0, 1),
            THREE.MathUtils.clamp(Number(props.angularDamping) || 0, 0, 1)
        );
        if (props.isKinematic) {
            const staticFlag = A.CF_STATIC_OBJECT ?? 1;
            const kinematicFlag = A.CF_KINEMATIC_OBJECT ?? 2;
            body.setCollisionFlags(
                (body.getCollisionFlags() & ~staticFlag) | kinematicFlag
            );
        }
        this._configureActivation(
            body,
            props
        );
        this._configureCCD(
            body,
            props,
            descriptor.radius
        );
        const group = Number.isFinite(Number(props.collisionGroup))
            ? Number(props.collisionGroup)
            : (props.isKinematic ? COL.KINEMATIC : COL.DEFAULT);
        const mask = Number.isFinite(Number(props.collisionMask))
            ? Number(props.collisionMask)
            : COL.ALL;
        this.physicsWorld.addRigidBody(
            body,
            group,
            mask
        );
        this._bodyResources.set(mesh, {
            body,
            shape: descriptor.shape,
            motionState,
            extras: descriptor.extras || [],
            soft: false
        });
        this.meshToBodyMap.set(mesh, body);
        this.bodyPtrToMesh.set(
            this._ptr(body),
            mesh
        );
        this._applyGravityToBody(
            body,
            props
        );
        body.activate?.(true);
        this.ui?.updateObjectPanel(mesh);
        this.ui?.refreshWorkbench?.();
        return body;
    }
    _createSoftBody(mesh, props) {
        if (
            !mesh.isMesh ||
            !mesh.geometry?.attributes?.position
        ) {
            console.error('[Physics] Soft body requires a Mesh.');
            return null;
        }
        const geometry = mesh.geometry;
        if (!geometry.index) {
            console.error('[Physics] Soft body requires indexed geometry.');
            return null;
        }
        const A = this.ammo;
        const position = geometry.attributes.position;
        const index = geometry.index;
        mesh.getWorldScale(this._worldScale);
        const scaledPositions = new Float32Array(position.count * 3);
        for (let i = 0; i < position.count; i++) {
            scaledPositions[i * 3] = position.getX(i) * this._worldScale.x;
            scaledPositions[i * 3 + 1] = position.getY(i) * this._worldScale.y;
            scaledPositions[i * 3 + 2] = position.getZ(i) * this._worldScale.z;
        }
        const indices = new Uint32Array(index.count);
        for (let i = 0; i < index.count; i++) {
            indices[i] = index.getX(i);
        }
        const helpers = new A.btSoftBodyHelpers();
        const body = helpers.CreateFromTriMesh(
            this.physicsWorld.getWorldInfo(),
            scaledPositions,
            indices,
            indices.length / 3,
            true
        );
        this._destroy(helpers);
        if (!body) return null;
        const cfg = body.get_m_cfg();
        cfg.set_viterations(
            Math.max(1, Math.round(props.velocityIterations ?? 20))
        );
        cfg.set_piterations(
            Math.max(1, Math.round(props.positionIterations ?? 20))
        );
        cfg.set_kDF(
            THREE.MathUtils.clamp(props.dynamicFriction ?? 0.5, 0, 1)
        );
        cfg.set_kDP(
            THREE.MathUtils.clamp(props.softDamping ?? 0.02, 0, 1)
        );
        cfg.set_kPR(
            Math.max(0, props.pressure ?? 0)
        );
        cfg.set_collisions(
            props.softCollisions ?? 0x11
        );
        const softMaterial = body.appendMaterial();
        softMaterial.set_m_kLST(
            THREE.MathUtils.clamp(props.linearStiffness ?? 0.6, 0, 1)
        );
        softMaterial.set_m_kAST(
            THREE.MathUtils.clamp(props.angularStiffness ?? 0.6, 0, 1)
        );
        body.generateBendingConstraints?.(
            Math.max(1, Math.round(props.bendingDistance ?? 2)),
            softMaterial
        );
        const mass = Math.max(0.001, Number(props.mass) || 1);
        body.setTotalMass(mass, false);
        const nodes = body.get_m_nodes();
        const nodeCount = nodes.size();
        const physicsMap = mesh.userData.physicsMap;
        if (physicsMap && nodeCount === physicsMap.count) {
            const baseMass = mass / Math.max(1, nodeCount);
            for (let i = 0; i < nodeCount; i++) {
                const paint = THREE.MathUtils.clamp(
                    physicsMap.getX(i),
                    0,
                    1
                );
                const inverseMass = (1 - paint) / baseMass;
                nodes.at(i).set_m_im(
                    paint >= 0.999 ? 0 : inverseMass
                );
            }
        }
        const world = this._getWorldTransform(mesh);
        const transform = new A.btTransform();
        transform.setIdentity();
        const origin = new A.btVector3(
            world.position.x,
            world.position.y,
            world.position.z
        );
        const rotation = new A.btQuaternion(
            world.quaternion.x,
            world.quaternion.y,
            world.quaternion.z,
            world.quaternion.w
        );
        transform.setOrigin(origin);
        transform.setRotation(rotation);
        body.transform(transform);
        this._destroy(origin);
        this._destroy(rotation);
        this._destroy(transform);
        body.getCollisionShape?.().setMargin?.(
            props.collisionMargin ?? 0.03
        );
        this.physicsWorld.addSoftBody(
            body,
            props.collisionGroup ?? COL.DEFAULT,
            props.collisionMask ?? COL.ALL
        );
        const previousFrustumCulled = mesh.frustumCulled;
        mesh.frustumCulled = false;
        this._bodyResources.set(mesh, {
            body,
            shape: null,
            motionState: null,
            extras: [],
            soft: true,
            previousFrustumCulled
        });
        this.meshToBodyMap.set(mesh, body);
        this.bodyPtrToMesh.set(
            this._ptr(body),
            mesh
        );
        console.log('[Physics] Soft body created:', mesh.name);
        return body;
    }
    _syncSoftBody(mesh, body) {
        const geometry = mesh.geometry;
        const positionArray = geometry.attributes.position?.array;
        const normalArray = geometry.attributes.normal?.array;
        if (!positionArray) return;
        const nodes = body.get_m_nodes();
        const count = nodes.size();
        if (count !== geometry.attributes.position.count) return;
        mesh.updateMatrixWorld(true);
        const inverseMatrix = this._scratchV1;
        const worldInverse = new THREE.Matrix4()
            .copy(mesh.matrixWorld)
            .invert();
        mesh.getWorldQuaternion(this._scratchQ);
        this._scratchQ.invert();
        for (let i = 0; i < count; i++) {
            const node = nodes.at(i);
            const p = node.get_m_x();
            this._scratchV1
                .set(p.x(), p.y(), p.z())
                .applyMatrix4(worldInverse);
            positionArray[i * 3] = this._scratchV1.x;
            positionArray[i * 3 + 1] = this._scratchV1.y;
            positionArray[i * 3 + 2] = this._scratchV1.z;
            if (normalArray) {
                const n = node.get_m_n();
                this._scratchV2
                    .set(n.x(), n.y(), n.z())
                    .applyQuaternion(this._scratchQ)
                    .normalize();
                normalArray[i * 3] = this._scratchV2.x;
                normalArray[i * 3 + 1] = this._scratchV2.y;
                normalArray[i * 3 + 2] = this._scratchV2.z;
            }
        }
        geometry.attributes.position.needsUpdate = true;
        if (geometry.attributes.normal) {
            geometry.attributes.normal.needsUpdate = true;
        }
        if (this._frame % 10 === 0) {
            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();
        }
    }
    _applyForce(body, x, y, z) {
        const magnitudeSq = x * x + y * y + z * z;
        if (magnitudeSq < 1e-12) return false;
        this._forceAmmoVector.setValue(x, y, z);
        body.applyCentralForce(this._forceAmmoVector);
        body.activate?.(true);
        return true;
    }
    _applyTorque(body, x, y, z) {
        const magnitudeSq = x * x + y * y + z * z;
        if (magnitudeSq < 1e-12) return false;
        this._forceAmmoVector.setValue(x, y, z);
        body.applyTorque(this._forceAmmoVector);
        body.activate?.(true);
        return true;
    }
    _applyEffects(delta) {
        for (const [mesh, body] of this.meshToBodyMap) {
            const props = mesh.userData.physics;
            if (
                !props ||
                props.type === 'soft' ||
                props.mass <= 0 ||
                props.isKinematic
            ) continue;
            const transform = body.getWorldTransform();
            const origin = transform.getOrigin();
            this._scratchV1.set(
                origin.x(),
                origin.y(),
                origin.z()
            );
            let bodyWasForced = false;
            if (props.flags?.windAffected !== false) {
                if (this.globalWind.lengthSq() > 1e-10) {
                    bodyWasForced = this._applyForce(
                        body,
                        this.globalWind.x * props.mass,
                        this.globalWind.y * props.mass,
                        this.globalWind.z * props.mass
                    ) || bodyWasForced;
                }
                let localDrag = 0;
                for (const zone of this.windZones) {
                    if (!zone || zone.enabled === false) continue;
                    const force = zone.forceAt?.(
                        this._scratchV1,
                        props.mass,
                        delta
                    );
                    if (force) {
                        bodyWasForced = this._applyForce(
                            body,
                            force.x || 0,
                            force.y || 0,
                            force.z || 0
                        ) || bodyWasForced;
                    }
                    if (
                        typeof zone.contains === 'function' &&
                        zone.contains(this._scratchV1)
                    ) {
                        localDrag += Number(zone.airDrag) || 0;
                    }
                }
                const velocity = body.getLinearVelocity();
                const drag = Math.max(
                    0,
                    this.globalAirDrag + localDrag
                );
                if (drag > 0) {
                    bodyWasForced = this._applyForce(
                        body,
                        -velocity.x() * drag * props.mass,
                        -velocity.y() * drag * props.mass,
                        -velocity.z() * drag * props.mass
                    ) || bodyWasForced;
                }
            }
            for (const liquid of this.liquidZones) {
                if (!liquid || liquid.enabled === false) continue;
                const lv = body.getLinearVelocity();
                const av = body.getAngularVelocity();
                this._scratchV2.set(
                    lv.x(),
                    lv.y(),
                    lv.z()
                );
                this._scratchV3.set(
                    av.x(),
                    av.y(),
                    av.z()
                );
                const result = liquid.forceAt?.(
                    this._scratchV1,
                    props.mass,
                    this._scratchV2,
                    this._scratchV3,
                    props.halfExtentY ?? 0.5,
                    props.volume ?? 1,
                    delta
                );
                if (!result) continue;
                if (result.linear) {
                    bodyWasForced = this._applyForce(
                        body,
                        result.linear.x || 0,
                        result.linear.y || 0,
                        result.linear.z || 0
                    ) || bodyWasForced;
                }
                if (result.angular) {
                    bodyWasForced = this._applyTorque(
                        body,
                        result.angular.x || 0,
                        result.angular.y || 0,
                        result.angular.z || 0
                    ) || bodyWasForced;
                }
            }
            for (const field of this.forceFields) {
                if (!field?.origin) continue;
                this._scratchV2
                    .copy(this._scratchV1)
                    .sub(field.origin);
                const distance = this._scratchV2.length();
                if (distance < 0.001) continue;
                const radius = Number(field.radius) || Infinity;
                if (distance > radius) continue;
                const falloff = field.falloff === 'linear'
                    ? Math.max(0, 1 - distance / radius)
                    : 1 / (distance * distance + 0.5);
                const amount = (Number(field.strength) || 0) * falloff * props.mass;
                if (field.type === 'attractor') {
                    this._scratchV2.normalize().multiplyScalar(-amount);
                } else if (field.type === 'repulsor') {
                    this._scratchV2.normalize().multiplyScalar(amount);
                } else if (field.type === 'vortex') {
                    this._scratchV3
                        .set(0, 1, 0)
                        .cross(this._scratchV2)
                        .normalize()
                        .multiplyScalar(amount * 0.5);
                    this._scratchV2.copy(this._scratchV3);
                } else if (field.type === 'turbulence') {
                    this._scratchV2.set(
                        Math.sin(this._time * 2 + this._scratchV1.y * 0.5) * amount,
                        Math.cos(this._time * 1.5 + this._scratchV1.x * 0.4) * amount * 0.3,
                        Math.sin(this._time * 2.3 + this._scratchV1.z * 0.6) * amount
                    );
                } else {
                    continue;
                }
                bodyWasForced = this._applyForce(
                    body,
                    this._scratchV2.x,
                    this._scratchV2.y,
                    this._scratchV2.z
                ) || bodyWasForced;
            }
            if (
                bodyWasForced &&
                props.flags?.noSleep !== true
            ) {
                body.activate?.(true);
            }
        }
    }
    _findMeshForBody(body) {
        if (!body) return null;
        const ptr = this._ptr(body);
        if (ptr && this.bodyPtrToMesh.has(ptr)) {
            return this.bodyPtrToMesh.get(ptr) || null;
        }
        for (const [mesh, registered] of this.meshToBodyMap) {
            if (
                registered === body ||
                this._ptr(registered) === ptr
            ) return mesh;
        }
        return null;
    }
    _collisionPairKey(bodyA, bodyB) {
        const a = this._ptr(bodyA);
        const b = this._ptr(bodyB);
        return a < b ? `${a}:${b}` : `${b}:${a}`;
    }
    _dispatchCollision(type, mesh, detail) {
        if (!mesh) return;
        try {
            mesh.dispatchEvent?.({
                type,
                ...detail
            });
        } catch (error) { }
    }
    _processCollisions() {
        if (!this._dispatcher) return;
        const currentPairs = new Map();
        const manifoldCount = this._dispatcher.getNumManifolds();
        for (let i = 0; i < manifoldCount; i++) {
            const manifold = this._dispatcher.getManifoldByIndexInternal(i);
            if (!manifold) continue;
            const body0 = this.ammo.castObject(
                manifold.getBody0(),
                this.ammo.btRigidBody
            );
            const body1 = this.ammo.castObject(
                manifold.getBody1(),
                this.ammo.btRigidBody
            );
            let bestContact = null;
            let bestDistance = Infinity;
            let impulse = 0;
            const contactCount = manifold.getNumContacts();
            for (let j = 0; j < contactCount; j++) {
                const contact = manifold.getContactPoint(j);
                const distance = contact.getDistance();
                if (distance <= 0 && distance < bestDistance) {
                    bestDistance = distance;
                    bestContact = contact;
                }
                if (distance <= 0 && contact.getAppliedImpulse) {
                    impulse = Math.max(
                        impulse,
                        contact.getAppliedImpulse()
                    );
                }
            }
            if (!bestContact) continue;
            const meshA = this._findMeshForBody(body0);
            const meshB = this._findMeshForBody(body1);
            if (!meshA && !meshB) continue;
            const key = this._collisionPairKey(body0, body1);
            const pointAmmo = bestContact.getPositionWorldOnB();
            const normalAmmo = bestContact.get_m_normalWorldOnB();
            const point = new THREE.Vector3(
                pointAmmo.x(),
                pointAmmo.y(),
                pointAmmo.z()
            );
            const normal = new THREE.Vector3(
                normalAmmo.x(),
                normalAmmo.y(),
                normalAmmo.z()
            );
            const info = {
                key,
                bodyA: body0,
                bodyB: body1,
                meshA,
                meshB,
                point,
                normal,
                impulse,
                penetration: Math.max(0, -bestDistance)
            };
            currentPairs.set(key, info);
            const existed = this._collisionPairs.has(key);
            const type = existed ? 'collisionstay' : 'collisionenter';
            this._dispatchCollision(type, meshA, {
                other: meshB,
                body: body0,
                otherBody: body1,
                point,
                normal,
                impulse,
                penetration: info.penetration
            });
            this._dispatchCollision(type, meshB, {
                other: meshA,
                body: body1,
                otherBody: body0,
                point,
                normal: normal.clone().negate(),
                impulse,
                penetration: info.penetration
            });
            if (!existed) {
                window.dispatchEvent?.(
                    new CustomEvent('sm:physics-collision', {
                        detail: {
                            type: 'enter',
                            ...info
                        }
                    })
                );
            }
        }
        for (const [key, old] of this._collisionPairs) {
            if (currentPairs.has(key)) continue;
            this._dispatchCollision(
                'collisionexit',
                old.meshA,
                { other: old.meshB }
            );
            this._dispatchCollision(
                'collisionexit',
                old.meshB,
                { other: old.meshA }
            );
            window.dispatchEvent?.(
                new CustomEvent('sm:physics-collision', {
                    detail: {
                        type: 'exit',
                        ...old
                    }
                })
            );
        }
        this._collisionPairs = currentPairs;
    }
    createPhysicsGroundIfNotExists() {
        if (!this.isReady || this.physicsGround) return this.physicsGround;
        for (const [mesh, body] of this.meshToBodyMap) {
            const props = mesh.userData.physics;
            if (
                (props?.mass ?? 1) === 0 &&
                /ground|floor|terrain/i.test(mesh.name || '')
            ) {
                this.physicsGround = body;
                this._physicsGroundOwned = false;
                return body;
            }
        }
        const A = this.ammo;
        const normal = new A.btVector3(0, 1, 0);
        const shape = new A.btStaticPlaneShape(normal, 0);
        this._destroy(normal);
        const transform = new A.btTransform();
        transform.setIdentity();
        const origin = new A.btVector3(0, 0, 0);
        transform.setOrigin(origin);
        this._destroy(origin);
        const motionState = new A.btDefaultMotionState(transform);
        const inertia = new A.btVector3(0, 0, 0);
        const info = new A.btRigidBodyConstructionInfo(
            0,
            motionState,
            shape,
            inertia
        );
        const body = new A.btRigidBody(info);
        this._destroy(info);
        this._destroy(inertia);
        this._destroy(transform);
        body.setFriction(0.8);
        body.setRestitution(0.05);
        this.physicsWorld.addRigidBody(
            body,
            COL.GROUND,
            COL.ALL
        );
        this.physicsGround = body;
        this._physicsGroundOwned = true;
        this._groundResources = {
            body,
            shape,
            motionState
        };
        console.log('[Physics] Ground plane active');
        return body;
    }
    setSelectedObject(object) {
        if (object === this.selectedObject) {
            this.ui?.updateObjectPanel(object);
            return;
        }
        this.previousSelection = this.selectedObject;
        this.selectedObject = object;
        this.ui?.updateObjectPanel(object);
        this.ui?.refreshWorkbench?.();
    }
    enablePhysicsForSelection() {
        if (!this.selectedObject) {
            console.warn('[Physics] Select an object first.');
            return;
        }
        this.createPhysicsGroundIfNotExists();
        this.addBody(this.selectedObject, {
            mass: 1,
            shapeType: 'box',
            material: 'DEFAULT',
            linearDamping: 0.05,
            angularDamping: 0.05,
            gravityScale: 1,
            isKinematic: false,
            collisionGroup: COL.DEFAULT,
            collisionMask: COL.ALL,
            flags: {
                enableGravity: true,
                ccd: false,
                noSleep: false,
                windAffected: true
            }
        });
        this.toggleSimulation(true);
    }
    _readUIPhysicsProps() {
        const ui = this.ui;
        const object = this.selectedObject;
        if (!ui || !object) return null;
        const current = object.userData.physics || {};
        const bodyType = ui.getVal('ph-body-type') || 'dynamic';
        const materialKey = ui.getVal('ph-material') || 'DEFAULT';
        const material = PHYSICS_MATERIALS[materialKey] || {};
        return {
            ...current,
            type: current.type === 'soft' ? 'soft' : 'rigid',
            mass: bodyType === 'static'
                ? 0
                : Math.max(0.001, parseFloat(ui.getVal('ph-mass') ?? 1)),
            shapeType: ui.getVal('ph-shape') || 'box',
            material: materialKey,
            friction: parseFloat(ui.getVal('ph-friction') ?? material.friction ?? 0.5),
            restitution: parseFloat(ui.getVal('ph-bounce') ?? material.restitution ?? 0.1),
            linearDamping: parseFloat(ui.getVal('ph-ldamp') ?? 0.05),
            angularDamping: parseFloat(ui.getVal('ph-adamp') ?? 0.05),
            gravityScale: parseFloat(ui.getVal('ph-gravscale') ?? 1),
            isKinematic: bodyType === 'kinematic',
            collisionGroup: current.collisionGroup ?? COL.DEFAULT,
            collisionMask: current.collisionMask ?? COL.ALL,
            flags: {
                ...(current.flags || {}),
                enableGravity: ui.getVal('ph-flag-grav') ?? true,
                ccd: ui.getVal('ph-flag-ccd') ?? false,
                noSleep: ui.getVal('ph-flag-wake') ?? false,
                windAffected: ui.getVal('ph-flag-wind') ?? true
            }
        };
    }
    rebuildSelected() {
        this.updateBodyProps(true);
    }
    updateBodyProps(forceRebuild = false) {
        const mesh = this.selectedObject;
        if (!mesh || !this.ui) return;
        const next = this._readUIPhysicsProps();
        if (!next) return;
        const old = mesh.userData.physics;
        const body = this.meshToBodyMap.get(mesh);
        if (!old || !body) {
            this.addBody(mesh, next);
            return;
        }
        if (old.type === 'soft' || next.type === 'soft') {
            forceRebuild = true;
        }
        const oldMotion = old.isKinematic
            ? 'kinematic'
            : (old.mass === 0 ? 'static' : 'dynamic');
        const newMotion = next.isKinematic
            ? 'kinematic'
            : (next.mass === 0 ? 'static' : 'dynamic');
        if (
            oldMotion !== newMotion ||
            old.shapeType !== next.shapeType
        ) {
            forceRebuild = true;
        }
        if (forceRebuild) {
            const running = this.simulationRunning;
            this.removeBody(mesh, { silent: true });
            this.addBody(mesh, next);
            this.simulationRunning = running;
            return;
        }
        mesh.userData.physics = next;
        body.setFriction?.(
            THREE.MathUtils.clamp(next.friction, 0, 10)
        );
        body.setRestitution?.(
            THREE.MathUtils.clamp(next.restitution, 0, 2)
        );
        body.setDamping?.(
            THREE.MathUtils.clamp(next.linearDamping, 0, 1),
            THREE.MathUtils.clamp(next.angularDamping, 0, 1)
        );
        if (newMotion === 'dynamic') {
            const resources = this._bodyResources.get(mesh);
            const shape = resources?.shape;
            if (shape && Math.abs((old.mass ?? 1) - next.mass) > 1e-8) {
                const inertia = new this.ammo.btVector3(0, 0, 0);
                shape.calculateLocalInertia(next.mass, inertia);
                body.setMassProps?.(next.mass, inertia);
                body.updateInertiaTensor?.();
                this._destroy(inertia);
            }
        }
        this._configureActivation(body, next);
        this._configureCCD(
            body,
            next,
            next.boundingRadius ?? this._getShapeBounds(mesh).radius
        );
        this._applyGravityToBody(body, next);
        body.activate?.(true);
        this.ui?.updateObjectPanel(mesh);
        this.ui?.refreshWorkbench?.();
    }
    _removeConstraintsForBody(body) {
        const remaining = [];
        for (const constraint of this.constraints) {
            const meta = this._constraintMeta.get(constraint);
            const bodyA = meta?.bodyA || constraint.getRigidBodyA?.();
            const bodyB = meta?.bodyB || constraint.getRigidBodyB?.();
            if (bodyA === body || bodyB === body) {
                try {
                    this.physicsWorld.removeConstraint(constraint);
                } catch (error) { }
                this._constraintMeta.delete(constraint);
                this._destroy(constraint);
            } else {
                remaining.push(constraint);
            }
        }
        this.constraints = remaining;
    }
    removeBody(mesh, options = {}) {
        const body = this.meshToBodyMap.get(mesh);
        if (!body) return false;
        const resource = this._bodyResources.get(mesh);
        this._removeConstraintsForBody(body);
        try {
            if (resource?.soft) {
                if (this.physicsWorld.removeSoftBody) {
                    this.physicsWorld.removeSoftBody(body);
                } else {
                    this.physicsWorld.removeCollisionObject?.(body);
                }
            } else {
                this.physicsWorld.removeRigidBody(body);
            }
        } catch (error) {
            console.warn('[Physics] Body removal warning:', error);
        }
        this.bodyPtrToMesh.delete(
            this._ptr(body)
        );
        this.meshToBodyMap.delete(mesh);
        this._bodyResources.delete(mesh);
        if (resource?.soft && resource.previousFrustumCulled !== undefined) {
            mesh.frustumCulled = resource.previousFrustumCulled;
        }
        this._destroy(body);
        if (resource?.motionState) {
            this._destroy(resource.motionState);
        }
        if (resource?.shape) {
            this._destroy(resource.shape);
        }
        for (const extra of resource?.extras || []) {
            this._destroy(extra);
        }
        delete mesh.userData.physics;
        if (!options.silent) {
            this.ui?.updateObjectPanel(mesh);
            this.ui?.refreshWorkbench?.();
        }
        return true;
    }
    removePhysicsFromSelection() {
        if (this.selectedObject) {
            this.removeBody(this.selectedObject);
        }
    }
    _resetRigidBody(mesh, body, state) {
        mesh.position.copy(state.position);
        mesh.quaternion.copy(state.quaternion);
        if (state.scale) mesh.scale.copy(state.scale);
        mesh.updateWorldMatrix(true, false);
        this._writeTransformFromObject(mesh, body);
        this._setAmmoVector(
            this._tmpAmmoVector,
            0, 0, 0
        );
        body.setLinearVelocity(this._tmpAmmoVector);
        body.setAngularVelocity(this._tmpAmmoVector);
        body.clearForces?.();
        body.activate?.(true);
    }
    resetSelection() {
        const mesh = this.selectedObject;
        if (!mesh) return;
        const body = this.meshToBodyMap.get(mesh);
        const state = mesh.userData.physicsState;
        const props = mesh.userData.physics;
        if (!body || !state || !props) return;
        if (props.type === 'soft') {
            const cloned = {
                ...props,
                flags: { ...(props.flags || {}) }
            };
            this.removeBody(mesh, { silent: true });
            mesh.position.copy(state.position);
            mesh.quaternion.copy(state.quaternion);
            if (state.scale) mesh.scale.copy(state.scale);
            mesh.updateWorldMatrix(true, true);
            this.addBody(mesh, cloned);
            return;
        }
        this._resetRigidBody(mesh, body, state);
    }
    resetAll() {
        const softToRebuild = [];
        for (const [mesh, body] of this.meshToBodyMap) {
            const state = mesh.userData.physicsState;
            const props = mesh.userData.physics;
            if (!state || !props) continue;
            if (props.type === 'soft') {
                softToRebuild.push({
                    mesh,
                    props: {
                        ...props,
                        flags: { ...(props.flags || {}) }
                    },
                    state
                });
                continue;
            }
            this._resetRigidBody(mesh, body, state);
        }
        for (const item of softToRebuild) {
            this.removeBody(item.mesh, { silent: true });
            item.mesh.position.copy(item.state.position);
            item.mesh.quaternion.copy(item.state.quaternion);
            if (item.state.scale) {
                item.mesh.scale.copy(item.state.scale);
            }
            item.mesh.updateWorldMatrix(true, true);
            this.addBody(item.mesh, item.props);
        }
    }
    _worldPointToBodyLocal(mesh, worldPoint) {
        mesh.getWorldPosition(this._scratchV1);
        mesh.getWorldQuaternion(this._scratchQ);
        this._scratchQ.invert();
        return this._scratchV2
            .copy(worldPoint)
            .sub(this._scratchV1)
            .applyQuaternion(this._scratchQ)
            .clone();
    }
    linkSelected(type) {
        if (
            !this.selectedObject ||
            !this.previousSelection ||
            this.selectedObject === this.previousSelection
        ) {
            console.warn('[Physics] Select body A, then body B.');
            return null;
        }
        return this.createConstraint(
            this.previousSelection,
            this.selectedObject,
            type
        );
    }
    createConstraint(meshA, meshB, type) {
        const bodyA = this.meshToBodyMap.get(meshA);
        const bodyB = this.meshToBodyMap.get(meshB);
        if (!bodyA || !bodyB) {
            console.warn('[Physics] Both objects require physics bodies.');
            return null;
        }
        const A = this.ammo;
        const posA = meshA.getWorldPosition(new THREE.Vector3());
        const posB = meshB.getWorldPosition(new THREE.Vector3());
        const anchor = new THREE.Vector3()
            .addVectors(posA, posB)
            .multiplyScalar(0.5);
        const localA = this._worldPointToBodyLocal(meshA, anchor);
        const localB = this._worldPointToBodyLocal(meshB, anchor);
        const pivotA = new A.btVector3(
            localA.x, localA.y, localA.z
        );
        const pivotB = new A.btVector3(
            localB.x, localB.y, localB.z
        );
        let constraint = null;
        const temporary = [];
        try {
            if (type === 'hinge') {
                const axisWorld = new THREE.Vector3(0, 1, 0);
                meshA.getWorldQuaternion(this._scratchQ).invert();
                const axisA = axisWorld.clone().applyQuaternion(this._scratchQ);
                meshB.getWorldQuaternion(this._scratchQ).invert();
                const axisB = axisWorld.clone().applyQuaternion(this._scratchQ);
                const aa = new A.btVector3(axisA.x, axisA.y, axisA.z);
                const ab = new A.btVector3(axisB.x, axisB.y, axisB.z);
                temporary.push(aa, ab);
                constraint = new A.btHingeConstraint(
                    bodyA,
                    bodyB,
                    pivotA,
                    pivotB,
                    aa,
                    ab,
                    true
                );
            } else if (type === 'point') {
                constraint = new A.btPoint2PointConstraint(
                    bodyA,
                    bodyB,
                    pivotA,
                    pivotB
                );
            } else {
                const frameA = new A.btTransform();
                const frameB = new A.btTransform();
                frameA.setIdentity();
                frameB.setIdentity();
                frameA.setOrigin(pivotA);
                frameB.setOrigin(pivotB);
                temporary.push(frameA, frameB);
                if (type === 'slider') {
                    constraint = new A.btSliderConstraint(
                        bodyA,
                        bodyB,
                        frameA,
                        frameB,
                        true
                    );
                } else if (type === 'spring' && A.btGeneric6DofSpringConstraint) {
                    constraint = new A.btGeneric6DofSpringConstraint(
                        bodyA,
                        bodyB,
                        frameA,
                        frameB,
                        true
                    );
                    for (let i = 0; i < 6; i++) {
                        constraint.enableSpring(i, true);
                        constraint.setStiffness(i, 80);
                        constraint.setDamping(i, 0.3);
                    }
                } else {
                    constraint = new A.btGeneric6DofConstraint(
                        bodyA,
                        bodyB,
                        frameA,
                        frameB,
                        true
                    );
                    if (type === 'lock') {
                        const zero1 = new A.btVector3(0, 0, 0);
                        const zero2 = new A.btVector3(0, 0, 0);
                        const zero3 = new A.btVector3(0, 0, 0);
                        const zero4 = new A.btVector3(0, 0, 0);
                        constraint.setLinearLowerLimit(zero1);
                        constraint.setLinearUpperLimit(zero2);
                        constraint.setAngularLowerLimit(zero3);
                        constraint.setAngularUpperLimit(zero4);
                        temporary.push(zero1, zero2, zero3, zero4);
                    }
                }
            }
            if (!constraint) return null;
            this.physicsWorld.addConstraint(
                constraint,
                true
            );
            this.constraints.push(constraint);
            this._constraintMeta.set(constraint, {
                bodyA,
                bodyB,
                meshA,
                meshB,
                type
            });
            bodyA.activate?.(true);
            bodyB.activate?.(true);
            this.ui?.refreshWorkbench?.();
            console.log(`[Physics] ${type} constraint created`);
            return constraint;
        } finally {
            this._destroy(pivotA);
            this._destroy(pivotB);
            for (const object of temporary) {
                this._destroy(object);
            }
        }
    }
    removeConstraint(constraint) {
        if (!constraint) return false;
        const index = this.constraints.indexOf(constraint);
        if (index < 0) return false;
        try {
            this.physicsWorld.removeConstraint(constraint);
        } catch (error) { }
        this.constraints.splice(index, 1);
        this._constraintMeta.delete(constraint);
        this._destroy(constraint);
        this.ui?.refreshWorkbench?.();
        return true;
    }
    addWindZone(options = {}) {
        const ZoneClass = window.WindZone ||
            (typeof WindZone !== 'undefined' ? WindZone : null);
        if (!ZoneClass) {
            console.warn('[Physics] WindZone class is unavailable.');
            return null;
        }
        const zone = new ZoneClass(this.scene, options);
        this.windZones.push(zone);
        this.ui?.refreshWindList?.();
        this.ui?.refreshWorkbench?.();
        return zone;
    }
    removeWindZone(id) {
        const index = this.windZones.findIndex(
            zone => zone.id === id
        );
        if (index < 0) return false;
        this.windZones[index].remove?.();
        this.windZones.splice(index, 1);
        this.ui?.refreshWindList?.();
        this.ui?.refreshWorkbench?.();
        return true;
    }
    addLiquidZone(options = {}) {
        const ZoneClass = window.LiquidZone ||
            (typeof LiquidZone !== 'undefined' ? LiquidZone : null);
        if (!ZoneClass) {
            console.warn('[Physics] LiquidZone class is unavailable.');
            return null;
        }
        const zone = new ZoneClass(this.scene, options);
        this.liquidZones.push(zone);
        this.ui?.refreshLiquidList?.();
        this.ui?.refreshWorkbench?.();
        return zone;
    }
    removeLiquidZone(id) {
        const index = this.liquidZones.findIndex(
            zone => zone.id === id
        );
        if (index < 0) return false;
        this.liquidZones[index].remove?.();
        this.liquidZones.splice(index, 1);
        this.ui?.refreshLiquidList?.();
        this.ui?.refreshWorkbench?.();
        return true;
    }
    addForceField(type, origin, strength, options = {}) {
        if (!origin) return null;
        const field = {
            id: THREE.MathUtils.generateUUID(),
            type,
            origin: origin.clone(),
            strength: Number(strength) || 0,
            radius: Number(options.radius) || Infinity,
            falloff: options.falloff || 'inverseSquare',
            enabled: options.enabled !== false
        };
        this.forceFields.push(field);
        this.ui?.refreshWorkbench?.();
        return field;
    }
    clearForceFields() {
        this.forceFields.length = 0;
        this.ui?.refreshWorkbench?.();
    }
    applyExplosion(origin, radius, strength) {
        if (!origin || radius <= 0) return;
        for (const [mesh, body] of this.meshToBodyMap) {
            const props = mesh.userData.physics;
            if (
                !props ||
                props.type === 'soft' ||
                props.mass <= 0 ||
                props.isKinematic
            ) continue;
            const transform = body.getWorldTransform();
            const p = transform.getOrigin();
            this._scratchV1.set(
                p.x() - origin.x,
                p.y() - origin.y,
                p.z() - origin.z
            );
            const distance = this._scratchV1.length();
            if (distance >= radius) continue;
            if (distance < 0.001) {
                this._scratchV1.set(
                    Math.random() - 0.5,
                    1,
                    Math.random() - 0.5
                ).normalize();
            } else {
                this._scratchV1.divideScalar(distance);
            }
            const normalized = 1 - distance / radius;
            const impulseStrength =
                Math.max(0, strength) *
                normalized *
                normalized;
            const impulse = new this.ammo.btVector3(
                this._scratchV1.x * impulseStrength,
                this._scratchV1.y * impulseStrength,
                this._scratchV1.z * impulseStrength
            );
            body.applyCentralImpulse(impulse);
            body.activate?.(true);
            this._destroy(impulse);
        }
    }
    applyImpulseToSelected() {
        const mesh = this.selectedObject;
        const body = this.meshToBodyMap.get(mesh);
        if (!mesh || !body) return;
        const props = mesh.userData.physics;
        if (
            props?.type === 'soft' ||
            props?.mass <= 0 ||
            props?.isKinematic
        ) return;
        const x = parseFloat(
            document.getElementById('ph-imp-x')?.value ?? 0
        ) || 0;
        const y = parseFloat(
            document.getElementById('ph-imp-y')?.value ?? 5
        ) || 0;
        const z = parseFloat(
            document.getElementById('ph-imp-z')?.value ?? 0
        ) || 0;
        const impulse = new this.ammo.btVector3(x, y, z);
        body.applyCentralImpulse(impulse);
        body.activate?.(true);
        this._destroy(impulse);
    }
    setGravity(y) {
        const value = Number(y);
        if (!Number.isFinite(value)) return;
        this.gravity.set(0, THREE.MathUtils.clamp(value, -100, 100), 0);
        this._setWorldGravity();
        for (const [mesh, body] of this.meshToBodyMap) {
            this._applyGravityToBody(
                body,
                mesh.userData.physics
            );
            body.activate?.(true);
        }
    }
    setTimeScale(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return;
        this.timeScale = THREE.MathUtils.clamp(
            number,
            0.01,
            4
        );
    }
    setSolverIterations(value) {
        const number = Math.round(Number(value));
        if (!Number.isFinite(number)) return;
        this.solverIterations = THREE.MathUtils.clamp(
            number,
            1,
            128
        );
        this.physicsWorld
            ?.getSolverInfo?.()
            ?.set_m_numIterations?.(
                this.solverIterations
            );
    }
    setMaxSubSteps(value) {
        const number = Math.round(Number(value));
        if (!Number.isFinite(number)) return;
        this.maxSubSteps = THREE.MathUtils.clamp(
            number,
            1,
            32
        );
    }
    setSolverHz(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return;
        const hz = THREE.MathUtils.clamp(
            number,
            15,
            240
        );
        this.fixedTimeStep = 1 / hz;
    }
    updateGlobalEnv() {
        if (!this.ui) return;
        const readNumber = (id, fallback) => {
            const value = Number(this.ui.getVal(id));
            return Number.isFinite(value) ? value : fallback;
        };
        this.globalWind.set(
            readNumber('ph-env-wx', 0),
            readNumber('ph-env-wy', 0),
            readNumber('ph-env-wz', 0)
        );
        this.globalAirDrag = Math.max(
            0,
            readNumber('ph-env-drag', 0.04)
        );
    }
    toggleSimulation(run) {
        this.simulationRunning = !!run;
        if (this.simulationRunning) {
            for (const body of this.meshToBodyMap.values()) {
                body.activate?.(true);
            }
        }
        this.ui?.refreshWorkbench?.();
        console.log(
            `[Physics] ${this.simulationRunning ? 'RUNNING' : 'PAUSED'}`
        );
    }
    setDebug(value) {
        this.debugMode = !!value;
        window.dispatchEvent?.(
            new CustomEvent('sm:physics-debug-change', {
                detail: {
                    enabled: this.debugMode,
                    system: this
                }
            })
        );
    }
    wakeAll() {
        for (const body of this.meshToBodyMap.values()) {
            body.activate?.(true);
        }
    }
    dumpState() {
        const rows = [];
        for (const [mesh, body] of this.meshToBodyMap) {
            const transform = body.getWorldTransform();
            const p = transform.getOrigin();
            const props = mesh.userData.physics || {};
            let speed = 0;
            if (props.type !== 'soft' && body.getLinearVelocity) {
                const velocity = body.getLinearVelocity();
                speed = Math.sqrt(
                    velocity.x() * velocity.x() +
                    velocity.y() * velocity.y() +
                    velocity.z() * velocity.z()
                );
            }
            rows.push({
                name: mesh.name,
                type: props.type || 'rigid',
                motion: props.isKinematic
                    ? 'kinematic'
                    : (props.mass === 0 ? 'static' : 'dynamic'),
                mass: props.mass ?? 0,
                x: p.x().toFixed(2),
                y: p.y().toFixed(2),
                z: p.z().toFixed(2),
                speed: speed.toFixed(2),
                active: body.isActive?.() ?? true
            });
        }
        console.table(rows);
    }
    paintPhysicsProperty(mesh, hitPoint, radius, strength) {
        if (
            !mesh?.geometry?.attributes?.position ||
            !hitPoint ||
            radius <= 0
        ) return;
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;
        let colors = geometry.attributes.color;
        if (!colors || colors.count !== positions.count) {
            colors = new THREE.BufferAttribute(
                new Float32Array(positions.count * 3),
                3
            );
            geometry.setAttribute('color', colors);
        }
        const localPoint = mesh.worldToLocal(
            hitPoint.clone()
        );
        for (let i = 0; i < positions.count; i++) {
            this._scratchV1.fromBufferAttribute(
                positions,
                i
            );
            const distance = this._scratchV1.distanceTo(
                localPoint
            );
            if (distance >= radius) continue;
            const falloff = 1 - distance / radius;
            const paint = Math.max(
                0,
                strength * falloff
            );
            const current = colors.getX(i);
            const next = THREE.MathUtils.clamp(
                current + paint,
                0,
                1
            );
            colors.setXYZ(
                i,
                next,
                Math.max(0, 1 - next),
                0
            );
        }
        colors.needsUpdate = true;
        mesh.userData.physicsMap = colors;
    }
    raycast(from, to, options = {}) {
        if (!this.isReady || !from || !to) {
            return { hit: false };
        }
        const A = this.ammo;
        const start = new A.btVector3(
            from.x,
            from.y,
            from.z
        );
        const end = new A.btVector3(
            to.x,
            to.y,
            to.z
        );
        const callback = new A.ClosestRayResultCallback(
            start,
            end
        );
        if (
            options.group !== undefined &&
            callback.set_m_collisionFilterGroup
        ) {
            callback.set_m_collisionFilterGroup(
                options.group
            );
        }
        if (
            options.mask !== undefined &&
            callback.set_m_collisionFilterMask
        ) {
            callback.set_m_collisionFilterMask(
                options.mask
            );
        }
        this.physicsWorld.rayTest(
            start,
            end,
            callback
        );
        let result = { hit: false };
        if (callback.hasHit()) {
            const point = callback.get_m_hitPointWorld();
            const normal = callback.get_m_hitNormalWorld();
            const collisionObject = callback.get_m_collisionObject();
            const body = A.castObject(
                collisionObject,
                A.btRigidBody
            );
            result = {
                hit: true,
                point: new THREE.Vector3(
                    point.x(),
                    point.y(),
                    point.z()
                ),
                normal: new THREE.Vector3(
                    normal.x(),
                    normal.y(),
                    normal.z()
                ).normalize(),
                mesh: this._findMeshForBody(body),
                body,
                fraction: callback.get_m_closestHitFraction?.() ?? null
            };
        }
        this._destroy(callback);
        this._destroy(start);
        this._destroy(end);
        return result;
    }
    dispose() {
        this.simulationRunning = false;
        for (const constraint of [...this.constraints]) {
            this.removeConstraint(constraint);
        }
        for (const mesh of [...this.meshToBodyMap.keys()]) {
            this.removeBody(mesh, { silent: true });
        }
        for (const zone of this.windZones) {
            zone.remove?.();
        }
        for (const zone of this.liquidZones) {
            zone.remove?.();
        }
        this.windZones.length = 0;
        this.liquidZones.length = 0;
        this.forceFields.length = 0;
        this._collisionPairs.clear();
        if (this.physicsGround && this._physicsGroundOwned) {
            try {
                this.physicsWorld?.removeRigidBody?.(
                    this.physicsGround
                );
            } catch (error) { }
            this._destroy(this._groundResources?.body);
            this._destroy(this._groundResources?.motionState);
            this._destroy(this._groundResources?.shape);
        }
        this.physicsGround = null;
        this._groundResources = null;
        this._destroy(this._tmpTransform);
        this._destroy(this._tmpAmmoVector);
        this._destroy(this._tmpAmmoQuaternion);
        this._destroy(this._forceAmmoVector);
        this._tmpTransform = null;
        this._tmpAmmoVector = null;
        this._tmpAmmoQuaternion = null;
        this._forceAmmoVector = null;
        if (this.physicsWorld) {
            this._destroy(this.physicsWorld);
            this.physicsWorld = null;
        }
        if (this._worldResources) {
            this._destroy(this._worldResources.softSolver);
            this._destroy(this._worldResources.solver);
            this._destroy(this._worldResources.broadphase);
            this._destroy(this._worldResources.dispatcher);
            this._destroy(this._worldResources.config);
            this._worldResources = null;
        }
        this.localBridge?.dispose?.();
        this.isReady = false;
        this.ui?.refreshWorkbench?.();
    }
}
window.PhysicsSystem = PhysicsSystem;