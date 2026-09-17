// ============================================================================
// physics/RagdollSystem.js
//
// Character ragdoll physics for the SM Engine. Turns a skinned humanoid
// (Mixamo-style "mixamorig*" skeleton) into Ammo rigid bodies connected by
// btGeneric6DofConstraint joints on death, simulates them passively, and
// writes the physics transforms back into the skeleton's bones every frame
// so the skinned mesh follows the ragdoll exactly.
//
// Design notes:
//   * Loaded AFTER PhysicsSystem.js; consumes the active physicsSystem
//     instance (window.physicsSystem) and its raw Ammo module.
//   * Works with any THREE scene that contains a skinned mesh; the root
//     object follows the pelvis body so the whole character travels.
//   * Joints are created from the actual skeleton hierarchy (parent walks),
//     not from hard-coded pairs, so partial rigs (missing Spine/Spine1,
//     GLB rigs with different names) still ragdoll with what they have.
//   * Knee/elbow joints detect their hinge axis dynamically from the bone
//     direction so they flex naturally in any bind pose.
//   * Bone sync writes directly into bone.matrixWorld (Skeleton.update()
//     reads matrixWorld, see three.js Skeleton.update) and marks the bones
//     matrixWorldAutoUpdate=false so the renderer's scene.updateMatrixWorld()
//     cannot overwrite them while the ragdoll is active.
//
// API:
//   ragdollSystem.enableRagdoll(character|model, options?) -> this
//   ragdollSystem.disableRagdoll()                        -> bool
//   ragdollSystem.update()                                -> void
//   ragdollSystem.applyExplosionForce(origin, radius, strength) -> void
//   ragdollSystem.getRuntimeReport()                      -> object
//   ragdollSystem.isRagdolled(model)                      -> bool
//
// Options:
//   { massScale: 1, angularDamping: 0.25, bones: { partName: 'BoneName' } }
// ============================================================================
'use strict';
// ── Humanoid part definition table ─────────────────────────────────────────
// key:     internal part id (used for limits lookup + bone overrides)
// bone:    expected Mixamo-style bone token (case-insensitive, substring)
// fallback:alternate tokens tried when the primary bone is missing
// shape:   capsule | box | sphere
// mass:    kg
// optional: true → part is skipped silently if the bone is missing
const RAGDOLL_PARTS = {
    pelvis:         { bone: 'Hips',           shape: 'capsule', mass: 16 },
    spine:          { bone: 'Spine',          shape: 'capsule', mass: 6,  optional: true },
    chest:          { bone: 'Spine2',         shape: 'capsule', mass: 10, fallback: ['Spine1', 'Chest'] },
    neck:           { bone: 'Neck',           shape: 'capsule', mass: 2,  optional: true },
    head:           { bone: 'Head',           shape: 'sphere',  mass: 4,  optional: true },
    leftShoulder:   { bone: 'LeftShoulder',   shape: 'box',     mass: 2,  optional: true },
    rightShoulder:  { bone: 'RightShoulder',  shape: 'box',     mass: 2,  optional: true },
    leftUpperArm:   { bone: 'LeftArm',        shape: 'capsule', mass: 3 },
    rightUpperArm:  { bone: 'RightArm',       shape: 'capsule', mass: 3 },
    leftLowerArm:   { bone: 'LeftForeArm',    shape: 'capsule', mass: 2 },
    rightLowerArm:  { bone: 'RightForeArm',   shape: 'capsule', mass: 2 },
    leftHand:       { bone: 'LeftHand',       shape: 'sphere',  mass: 0.5, optional: true },
    rightHand:      { bone: 'RightHand',      shape: 'sphere',  mass: 0.5, optional: true },
    leftThigh:      { bone: 'LeftUpLeg',      shape: 'capsule', mass: 7 },
    rightThigh:     { bone: 'RightUpLeg',     shape: 'capsule', mass: 7 },
    leftShin:       { bone: 'LeftLeg',        shape: 'capsule', mass: 4 },
    rightShin:      { bone: 'RightLeg',       shape: 'capsule', mass: 4 },
    leftFoot:       { bone: 'LeftFoot',       shape: 'box',     mass: 1,  optional: true },
    rightFoot:      { bone: 'RightFoot',      shape: 'box',     mass: 1,  optional: true },
};
// Per-axis angular limits (radians) for each joint, applied in the CHILD
// bone's local frame (frameB is the child's identity frame).
// hinge: true → axis detected dynamically from the bone direction.
const RAGDOLL_JOINT_LIMITS = {
    spine:   { min: [-0.25, -0.15, -0.30], max: [0.25, 0.15, 0.30] },
    chest:   { min: [-0.35, -0.20, -0.45], max: [0.35, 0.20, 0.45] },
    neck:    { min: [-0.40, -0.30, -0.50], max: [0.40, 0.30, 0.50] },
    head:    { min: [-0.50, -0.30, -0.60], max: [0.50, 0.30, 0.60] },
    shoulder:{ min: [-0.70, -1.30, -1.30], max: [1.70, 0.50, 1.30] },
    arm:     { hinge: true },
    forearm: { hinge: true, twist: 0.35 },
    hand:    { min: [-0.40, -0.30, -0.40], max: [0.40, 0.30, 0.40] },
    thigh:   { min: [-0.90, -0.60, -1.10], max: [1.10, 0.70, 0.80] },
    shin:    { hinge: true },
    foot:    { min: [-0.50, -0.35, -0.40], max: [0.70, 0.40, 0.40] },
    generic: { min: [-0.50, -0.50, -0.50], max: [0.50, 0.50, 0.50] },
};
const RAGDOLL_HINGE_ANGLE = 2.4;   // rad ≈ 137°
const RAGDOLL_LOCKED_AXIS = 0.08;  // rad of slack on non-hinge axes
// Default segment lengths (m) for leaf bones that have no child joint.
const RAGDOLL_LEAF_LENGTHS = {
    head: 0.20, hand: 0.12, foot: 0.24, shoulder: 0.12, neck: 0.10,
};
// Shape radius scale factor per part type (relative to bone segment length).
const RAGDOLL_RADIUS_FACTORS = {
    pelvis: 0.42, spine: 0.42, chest: 0.50, neck: 0.50,
    arm: 0.28, forearm: 0.26, thigh: 0.32, shin: 0.28,
};
class RagdollSystem {
    constructor(physicsSystem) {
        this.physics = physicsSystem || null;
        this.active = false;
        this.character = null;
        this.model = null;
        this.mesh = null;
        this.parts = [];       // [{ key, bone, body, shape, motionState, radius, pos, quat }]
        this.joints = [];      // [{ constraint, parent, child }]
        this._owned = [];      // Ammo objects to destroy on disable
        this._skeletons = [];  // unique Skeleton instances to update()
        this._ragdollBones = []; // bones whose matrixWorldAutoUpdate we toggled
        this._options = {};
        this._bindHips = null;
        this._hipsToRoot = null; // Matrix4: rootWorld = hipsWorld * hipsToRoot
        this._tmpT = null;     // lazily created ammo btTransform scratch
        this._v = new THREE.Vector3();
        this._v2 = new THREE.Vector3();
        this._q = new THREE.Quaternion();
        this._q2 = new THREE.Quaternion();
        this._m = new THREE.Matrix4();
        this._m2 = new THREE.Matrix4();
        this._s = new THREE.Vector3();
        this._up = new THREE.Vector3(0, 1, 0);
        this._right = new THREE.Vector3(1, 0, 0);
        this._partByKey = new Map();
        this._partByBone = new Map();
        this._contactDisposers = [];
        this._lastImpulse = null;
    }
    // ── Internal plumbing ───────────────────────────────────────────────────
    _resolve() {
        if (!this.physics && typeof window !== 'undefined') {
            this.physics = window.physicsSystem || null;
        }
        return this.physics;
    }
    get ammo() {
        const p = this._resolve();
        return p?.ammo || null;
    }
    _destroy(obj) {
        if (!obj) return;
        const p = this._resolve();
        if (p && typeof p._destroy === 'function') {
            try { p._destroy(obj); return; } catch (_) {}
        }
        try { this.ammo?.destroy?.(obj); } catch (_) {}
    }
    _tmp() {
        if (!this._tmpT) {
            const A = this.ammo;
            this._tmpT = new A.btTransform();
            this._tmpT.setIdentity();
        }
        return this._tmpT;
    }
    // ── Public API ──────────────────────────────────────────────────────────
    isRagdolled(model) {
        return !!(model && model.userData && model.userData.ragdoll);
    }
    enableRagdoll(character, options = {}) {
        const physics = this._resolve();
        if (!physics || !physics.isReady || !physics.ammo || !physics.physicsWorld) {
            console.warn('[Ragdoll] Physics is not ready — cannot enable ragdoll.');
            return this;
        }
        if (this.active) return this;
        const model = character?.model || character;
        if (!model || typeof model.traverse !== 'function') {
            console.warn('[Ragdoll] Invalid character — expected an Object3D or { model }.');
            return this;
        }
        let skinnedMesh = null;
        model.traverse(child => {
            if (!skinnedMesh && child.isSkinnedMesh) skinnedMesh = child;
        });
        if (!skinnedMesh || !skinnedMesh.skeleton) {
            console.warn('[Ragdoll] No skinned skeleton found on the model — cannot ragdoll.');
            return this;
        }
        const skeleton = skinnedMesh.skeleton;
        if (!Array.isArray(skeleton.bones) || skeleton.bones.length === 0) {
            console.warn('[Ragdoll] Skeleton has no bones — cannot ragdoll.');
            return this;
        }
        model.updateMatrixWorld(true);
        this._options = {
            massScale: Number(options.massScale) > 0 ? Number(options.massScale) : 1,
            linearDamping: Number.isFinite(Number(options.linearDamping)) ? Number(options.linearDamping) : 0.05,
            angularDamping: Number.isFinite(Number(options.angularDamping)) ? Number(options.angularDamping) : 0.25,
            friction: Number.isFinite(Number(options.friction)) ? Number(options.friction) : 0.7,
            restitution: Number.isFinite(Number(options.restitution)) ? Number(options.restitution) : 0.05,
            collisionLayer: options.collisionLayer || 'ragdoll',
            collisionMask: options.collisionMask ?? 'all',
            selfCollision: options.selfCollision !== false,
            ccd: options.ccd !== false,
            bones: options.bones || null,
        };
        // 1. Take over from animation / player control.
        if (options.restoreCharacter !== false && character?.mixer?.stopAllAction) {
            try { character.mixer.stopAllAction(); } catch (_) {}
        }
        if (character?.setMotionMatchingEnabled) {
            try { character.setMotionMatchingEnabled(false); } catch (_) {}
        }
        if (character?.deactivate) {
            try { character.deactivate(); } catch (_) {}
        }
        model.userData.ragdoll = true;
        // 2. Remove the legacy single capsule body so it cannot fight the ragdoll.
        if (physics.meshToBodyMap?.has(model)) {
            try { physics.removeBody(model); } catch (error) {
                console.warn('[Ragdoll] Capsule body removal warning:', error);
            }
        }
        // 3. Collect parts (bones → bodies).
        const parts = this._collectParts(skeleton);
        if (parts.length < 3) {
            model.userData.ragdoll = false;
            console.warn('[Ragdoll] Too few matching bones (' + parts.length + ') — aborting.');
            return this;
        }
        // 4. Record bind transforms for the root-follow pass.
        this._bindHips = parts[0].bone.matrixWorld.clone();
        this._hipsToRoot = new THREE.Matrix4()
            .copy(this._bindHips)
            .invert()
            .multiply(model.matrixWorld);
        // 5. Create the rigid bodies.
        const A = physics.ammo;
        for (const part of parts) this._createBody(part, A);
        // 6. Create joints from the actual skeleton hierarchy.
        this._createJoints(parts, A);
        this.parts = parts;
        this.character = character;
        this.model = model;
        this.mesh = skinnedMesh;
        this._partByKey.clear();
        this._partByBone.clear();
        for (const part of parts) {
            this._partByKey.set(part.key, part);
            this._partByBone.set(part.bone, part);
        }
        this._skeletons = [];
        model.traverse(child => {
            if (child.isSkinnedMesh && child.skeleton && !this._skeletons.includes(child.skeleton)) {
                this._skeletons.push(child.skeleton);
            }
        });
        this.active = true;
        this._registerAdvancedContacts();
        this._emitAdvanced('ragdoll:enabled', { ragdoll: this, character, model, parts: this.parts, joints: this.joints });
        console.log('[Ragdoll] Enabled:', parts.length, 'parts,', this.joints.length, 'joints.');
        return this;
    }
    disableRagdoll(options = {}) {
        if (!this.active) return false;
        this._clearAdvancedContacts();
        const physics = this._resolve();
        const A = physics?.ammo;
        if (A && physics?.physicsWorld) {
            for (const joint of this.joints) {
                try { physics.physicsWorld.removeConstraint(joint.constraint); } catch (_) {}
            }
            for (const part of this.parts) {
                try { physics.physicsWorld.removeRigidBody(part.body); } catch (_) {}
                try { physics.bodyPtrToMesh?.delete?.(physics._ptr?.(part.body) || part.body?.ptr); } catch (_) {}
                if (part.bone?.userData) {
                    delete part.bone.userData.ragdollPart;
                    delete part.bone.userData.ragdollOwner;
                }
            }
        }
        for (const obj of this._owned) this._destroy(obj);
        for (const bone of this._ragdollBones) {
            bone.matrixWorldAutoUpdate = true;
            bone.matrixWorldNeedsUpdate = true;
        }
        const character = this.character;
        const model = this.model;
        this.parts = [];
        this.joints = [];
        this._owned = [];
        this._skeletons = [];
        this._ragdollBones = [];
        this._partByKey.clear();
        this._partByBone.clear();
        this._bindHips = null;
        this._hipsToRoot = null;
        this.active = false;
        this.character = null;
        this.model = null;
        this.mesh = null;
        if (model) {
            model.userData.ragdoll = false;
            try { model.updateMatrixWorld(true); } catch (_) {}
        }
        // Restore the standard player capsule + control unless explicitly disabled.
        if (options.restoreCharacter !== false && character?.model && physics?.addBody) {
            try {
                physics.addBody(character.model, {
                    mass: 1,
                    shapeType: 'capsule',
                    fixedRotation: true,
                    friction: 0.1,
                    restitution: 0,
                    pos: character.model.position.clone(),
                    size: [0.6, 1.8, 0.6],
                });
            } catch (error) {
                console.warn('[Ragdoll] Capsule re-add warning:', error);
            }
        }
        if (options.restoreCharacter !== false && character?.activate) {
            try { character.activate(); } catch (_) {}
        }
        if (character?.mixer?.stopAllAction) {
            try { character.mixer.stopAllAction(); } catch (_) {}
        }
        if (options.restoreCharacter !== false && typeof character?.fadeToAction === 'function') {
            try { character.fadeToAction('idle', 0.3, { syncState: true }); } catch (_) {}
        }
        this._emitAdvanced('ragdoll:disabled', { ragdoll: this, character, model });
        console.log('[Ragdoll] Disabled.');
        return true;
    }
    update() {
        if (!this.active) return;
        const physics = this._resolve();
        if (!physics?.isReady || !this.ammo || !this.model || !this.parts.length) return;
        const tmpT = this._tmp();
        // Sync every part body → bone.matrixWorld.
        for (const part of this.parts) {
            const ms = part.motionState;
            if (!ms) continue;
            try { ms.getWorldTransform(tmpT); } catch (_) { continue; }
            const o = tmpT.getOrigin();
            const r = tmpT.getRotation();
            this._v.set(o.x(), o.y(), o.z());
            this._q.set(r.x(), r.y(), r.z(), r.w()).normalize();
            part.bone.matrixWorld.makeRotationFromQuaternion(this._q).setPosition(this._v);
            part.bone.matrixWorldNeedsUpdate = false;
        }
        // Move the model root so the pelvis stays where the physics put it.
        const hips = this.parts[0];
        if (hips && this._hipsToRoot) {
            try { hips.motionState.getWorldTransform(tmpT); } catch (_) {}
            const o = tmpT.getOrigin();
            const r = tmpT.getRotation();
            this._m.makeRotationFromQuaternion(
                this._q.set(r.x(), r.y(), r.z(), r.w()).normalize()
            );
            this._m.setPosition(this._v.set(o.x(), o.y(), o.z()));
            this._m2.multiplyMatrices(this._m, this._hipsToRoot);
            this._m2.decompose(this._v, this._q, this._s);
            this.model.position.copy(this._v);
            this.model.quaternion.copy(this._q);
        }
        // Flatten bone matrices into the skinning buffers.
        for (const skeleton of this._skeletons) {
            try { skeleton.update(); } catch (_) {}
        }
    }
    applyExplosionForce(origin, radius, strength) {
        if (!this.active || !origin || !radius || radius <= 0) return;
        const A = this.ammo;
        if (!A) return;
        const tmpT = this._tmp();
        const strengthV = Number(strength) || 0;
        if (strengthV <= 0) return;
        for (const part of this.parts) {
            if (!part.body || part.mass <= 0) continue;
            part.body.getWorldTransform(tmpT);
            const p = tmpT.getOrigin();
            this._v.set(p.x() - origin.x, p.y() - origin.y, p.z() - origin.z);
            const distance = this._v.length();
            if (distance >= radius) continue;
            if (distance < 0.001) {
                this._v.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
            } else {
                this._v.divideScalar(distance);
            }
            const normalized = 1 - distance / radius;
            const impulse = new A.btVector3(
                this._v.x * strengthV * normalized * normalized,
                this._v.y * strengthV * normalized * normalized,
                this._v.z * strengthV * normalized * normalized
            );
            part.body.applyCentralImpulse(impulse);
            part.body.activate?.(true);
            this._destroy(impulse);
        }
        this._lastImpulse = { origin: origin.clone?.() || origin, radius, strength: strengthV, time: performance.now() };
        this._emitAdvanced('ragdoll:explosion', { ragdoll: this, origin, radius, strength: strengthV });
    }
    getRuntimeReport() {
        return {
            active: this.active,
            parts: this.parts.length,
            joints: this.joints.length,
            bones: this._ragdollBones.length,
            character: this.character?.name || this.model?.name || '',
            collisionLayer: this._options.collisionLayer || 'ragdoll',
            collisionMask: this._options.collisionMask ?? 'all',
            selfCollision: this._options.selfCollision !== false,
            advancedContacts: this._contactDisposers.length,
            lastImpulse: this._lastImpulse,
        };
    }
    _advanced() {
        return window.smAdvancedPhysics || window.SMAdvancedPhysicsRuntime || null;
    }
    _emitAdvanced(type, payload = {}) {
        const advanced = this._advanced();
        advanced?.events?.emit?.(type, payload);
        try {
            window.dispatchEvent(new CustomEvent(`sm:${type}`, { detail: payload }));
        } catch (_) {}
    }
    _resolveCollisionFilter() {
        const advanced = this._advanced();
        const layers = advanced?.layers || null;
        let group = window.COL?.DEFAULT ?? 1;
        let mask = window.COL?.ALL ?? -1;
        if (layers) {
            group = layers.get(this._options.collisionLayer || 'ragdoll');
            mask = layers.mask(this._options.collisionMask ?? 'all');
            if (this._options.selfCollision === false) mask &= ~group;
        }
        return { group, mask };
    }
    _registerAdvancedContacts() {
        this._clearAdvancedContacts();
        const contacts = this._advanced()?.contacts;
        if (!contacts?.on) return false;
        for (const part of this.parts) {
            const dispose = contacts.on(part.bone, 'enter', (contact) => {
                this._emitAdvanced('ragdoll:part-hit', {
                    ragdoll: this,
                    part,
                    bone: part.bone,
                    other: contact.other || null,
                    contact
                });
            });
            if (typeof dispose === 'function') this._contactDisposers.push(dispose);
        }
        return this._contactDisposers.length > 0;
    }
    _clearAdvancedContacts() {
        for (const dispose of this._contactDisposers.splice(0)) {
            try { dispose?.(); } catch (_) {}
        }
    }
    getPart(keyOrBone) {
        if (!keyOrBone) return null;
        if (typeof keyOrBone === 'string') return this._partByKey.get(keyOrBone) || null;
        return this._partByBone.get(keyOrBone) || null;
    }
    applyImpulseToPart(keyOrBone, impulse) {
        const part = this.getPart(keyOrBone);
        const A = this.ammo;
        if (!part?.body || !A || !impulse) return false;
        const value = impulse.isVector3 ? impulse : new THREE.Vector3(Number(impulse.x ?? impulse[0]) || 0, Number(impulse.y ?? impulse[1]) || 0, Number(impulse.z ?? impulse[2]) || 0);
        const ammoImpulse = new A.btVector3(value.x, value.y, value.z);
        try {
            part.body.applyCentralImpulse?.(ammoImpulse);
            part.body.activate?.(true);
            this._emitAdvanced('ragdoll:part-impulse', { ragdoll: this, part, impulse: value.clone() });
            return true;
        } finally {
            this._destroy(ammoImpulse);
        }
    }
    applyForceToPart(keyOrBone, force) {
        const part = this.getPart(keyOrBone);
        const A = this.ammo;
        if (!part?.body || !A || !force) return false;
        const value = force.isVector3 ? force : new THREE.Vector3(Number(force.x ?? force[0]) || 0, Number(force.y ?? force[1]) || 0, Number(force.z ?? force[2]) || 0);
        const ammoForce = new A.btVector3(value.x, value.y, value.z);
        try {
            part.body.applyCentralForce?.(ammoForce);
            part.body.activate?.(true);
            return true;
        } finally {
            this._destroy(ammoForce);
        }
    }
    setPartVelocity(keyOrBone, velocity) {
        const part = this.getPart(keyOrBone);
        const A = this.ammo;
        if (!part?.body || !A || !velocity) return false;
        const value = velocity.isVector3 ? velocity : new THREE.Vector3(Number(velocity.x ?? velocity[0]) || 0, Number(velocity.y ?? velocity[1]) || 0, Number(velocity.z ?? velocity[2]) || 0);
        const ammoVelocity = new A.btVector3(value.x, value.y, value.z);
        try {
            part.body.setLinearVelocity?.(ammoVelocity);
            part.body.activate?.(true);
            return true;
        } finally {
            this._destroy(ammoVelocity);
        }
    }
    wakeAll() {
        for (const part of this.parts) part.body?.activate?.(true);
        return this.parts.length;
    }
    sleepAll() {
        const sleeping = this.ammo?.ISLAND_SLEEPING ?? 2;
        for (const part of this.parts) part.body?.setActivationState?.(sleeping);
        return this.parts.length;
    }
    getCenterOfMass(target = new THREE.Vector3()) {
        target.set(0, 0, 0);
        if (!this.parts.length) return target;
        let totalMass = 0;
        const tmpT = this._tmp();
        for (const part of this.parts) {
            if (!part.body) continue;
            try { part.body.getWorldTransform(tmpT); } catch (_) { continue; }
            const origin = tmpT.getOrigin();
            const mass = Number(part.runtimeMass ?? part.mass) || 1;
            target.x += origin.x() * mass;
            target.y += origin.y() * mass;
            target.z += origin.z() * mass;
            totalMass += mass;
        }
        if (totalMass > 0) target.divideScalar(totalMass);
        return target;
    }
    // ── Part collection ─────────────────────────────────────────────────────
    _collectParts(skeleton) {
        const config = { ...RAGDOLL_PARTS, ...(this._options.bones || {}) };
        const bones = skeleton.bones;
        const findBone = (token) => {
            if (!token) return null;
            const lower = String(token).toLowerCase();
            for (const b of bones) {
                const raw = String(b.name || '');
                const n = raw.toLowerCase();
                if (n === lower) return b;
                const stripped = raw
                    .replace(/^mixamorig\s*\d*\s*/i, '')
                    .toLowerCase();
                if (stripped === lower) return b;
                if (n.includes(lower)) return b;
            }
            return null;
        };
        const parts = [];
        for (const [key, def] of Object.entries(config)) {
            if (typeof def === 'string') continue;
            let bone = findBone(def.bone);
            if (!bone && Array.isArray(def.fallback)) {
                for (const fb of def.fallback) {
                    bone = findBone(fb);
                    if (bone) break;
                }
            }
            if (!bone && def.optional) continue;
            if (!bone) continue;
            const worldPos = bone.getWorldPosition(new THREE.Vector3());
            parts.push({
                key,
                bone,
                def,
                mass: def.mass || 1,
                pos: worldPos,
                quat: bone.getWorldQuaternion(new THREE.Quaternion()),
                joint: null, // world position of the next joint down the chain
                body: null,
                motionState: null,
                shape: null,
                radius: 0.1,
            });
        }
        if (!parts.length) return parts;
        // Pelvis must come first (root-follow anchor).
        parts.sort((a, b) => {
            if (a.key === 'pelvis') return -1;
            if (b.key === 'pelvis') return 1;
            return 0;
        });
        // Resolve joint points (world position of the first child bone origin).
        for (const part of parts) {
            let joint = null;
            if (part.bone.children.length) {
                const child = part.bone.children.find(c => c.isBone) || part.bone.children[0];
                if (child) joint = child.getWorldPosition(new THREE.Vector3());
            }
            part.joint = joint;
        }
        // Compute shapes + radii.
        const physics = this._resolve();
        const A = physics.ammo;
        for (const part of parts) this._makeShape(part, A, parts);
        return parts;
    }
    _makeShape(part, A, allParts) {
        const bone = part.bone;
        const len = part.joint
            ? part.pos.distanceTo(part.joint)
            : (RAGDOLL_LEAF_LENGTHS[part.key] ?? 0.15);
        const def = part.def;
        let shape = null;
        let radius = 0.1;
        if (def.shape === 'sphere') {
            radius = THREE.MathUtils.clamp(len * 0.55, 0.06, 0.16);
            shape = new A.btSphereShape(radius);
        } else if (def.shape === 'box') {
            let size;
            if (part.key.includes('Foot')) {
                size = new THREE.Vector3(0.11, 0.07, THREE.MathUtils.clamp(len * 0.9, 0.14, 0.3));
            } else if (part.key.includes('Shoulder')) {
                size = new THREE.Vector3(0.1, 0.09, 0.07);
            } else {
                const r = THREE.MathUtils.clamp(len * 0.4, 0.06, 0.16);
                size = new THREE.Vector3(r, r, r);
            }
            const half = new A.btVector3(size.x * 0.5, size.y * 0.5, size.z * 0.5);
            shape = new A.btBoxShape(half);
            radius = Math.max(size.x, size.y, size.z) * 0.5;
            this._destroy(half);
        } else {
            // capsule
            const factor = RAGDOLL_RADIUS_FACTORS[part.key] ?? 0.3;
            if (part.key === 'pelvis') {
                // Widen the pelvis to the hip width when both thighs exist.
                const thighs = allParts.filter(p => p.key === 'leftThigh' || p.key === 'rightThigh');
                if (thighs.length === 2) {
                    radius = THREE.MathUtils.clamp(thighs[0].pos.distanceTo(thighs[1].pos) * 0.42, 0.1, 0.22);
                } else {
                    radius = THREE.MathUtils.clamp(len * factor, 0.1, 0.2);
                }
            } else {
                radius = THREE.MathUtils.clamp(len * factor, 0.05, 0.14);
            }
            const cylinder = Math.max(len - radius * 2, 0.04);
            shape = new A.btCapsuleShape(radius, cylinder);
        }
        part.shape = shape;
        part.radius = radius;
    }
    _createBody(part, A) {
        const mass = part.mass * this._options.massScale;
        part.runtimeMass = mass;
        const start = new A.btTransform();
        start.setIdentity();
        const origin = new A.btVector3(part.pos.x, part.pos.y, part.pos.z);
        const quat = new A.btQuaternion(part.quat.x, part.quat.y, part.quat.z, part.quat.w);
        start.setOrigin(origin);
        start.setRotation(quat);
        const motionState = new A.btDefaultMotionState(start);
        const inertia = new A.btVector3(0, 0, 0);
        part.shape.calculateLocalInertia(mass, inertia);
        const info = new A.btRigidBodyConstructionInfo(mass, motionState, part.shape, inertia);
        const body = new A.btRigidBody(info);
        this._destroy(info);
        this._destroy(inertia);
        this._destroy(start);
        this._destroy(origin);
        this._destroy(quat);
        body.setFriction(THREE.MathUtils.clamp(this._options.friction, 0, 10));
        body.setRestitution(THREE.MathUtils.clamp(this._options.restitution, 0, 2));
        body.setDamping(THREE.MathUtils.clamp(this._options.linearDamping, 0, 1), THREE.MathUtils.clamp(this._options.angularDamping, 0, 1));
        body.setSleepingThresholds(0.03, 0.05);
        if (this._options.ccd) {
            body.setCcdMotionThreshold?.(0.35);
            body.setCcdSweptSphereRadius?.(Math.max(part.radius * 0.8, 0.02));
        }
        const filter = this._resolveCollisionFilter();
        this.physics.physicsWorld.addRigidBody(body, filter.group, filter.mask);
        body.activate?.(true);
        part.body = body;
        part.motionState = motionState;
        if (!part.bone.userData) part.bone.userData = {};
        part.bone.userData.ragdollPart = part.key;
        part.bone.userData.ragdollOwner = this.model || null;
        try { this.physics.bodyPtrToMesh?.set?.(this.physics._ptr?.(body) || body.ptr, part.bone); } catch (_) {}
        this._owned.push(part.shape, motionState, body);
        this._ragdollBones.push(part.bone);
        part.bone.matrixWorldAutoUpdate = false;
    }
    // ── Joint creation ──────────────────────────────────────────────────────
    _createJoints(parts, A) {
        const partByBone = new Map(parts.map(p => [p.bone, p]));
        for (const child of parts) {
            if (child.key === 'pelvis') continue;
            let b = child.bone.parent;
            let parent = null;
            while (b && !parent) {
                if (partByBone.has(b)) parent = partByBone.get(b);
                b = b.parent;
            }
            if (!parent || !parent.body || !child.body) continue;
            this._createJoint(parent, child, A);
        }
    }
    _createJoint(parent, child, A) {
        const pivot = child.bone.getWorldPosition(new THREE.Vector3());
        const frameA = new A.btTransform();
        frameA.setIdentity();
        const localA = new THREE.Vector3()
            .copy(pivot)
            .applyMatrix4(this._m.copy(parent.bone.matrixWorld).invert());
        const oA = new A.btVector3(localA.x, localA.y, localA.z);
        frameA.setOrigin(oA);
        const frameB = new A.btTransform();
        frameB.setIdentity();
        const constraint = new A.btGeneric6DofConstraint(
            parent.body,
            child.body,
            frameA,
            frameB,
            true
        );
        const linLo = new A.btVector3(0, 0, 0);
        const linHi = new A.btVector3(0, 0, 0);
        constraint.setLinearLowerLimit(linLo);
        constraint.setLinearUpperLimit(linHi);
        const limits = this._jointLimits(child, pivot);
        const angLo = new A.btVector3(limits.min[0], limits.min[1], limits.min[2]);
        const angHi = new A.btVector3(limits.max[0], limits.max[1], limits.max[2]);
        constraint.setAngularLowerLimit(angLo);
        constraint.setAngularUpperLimit(angHi);
        this.physics.physicsWorld.addConstraint(constraint, true);
        parent.body.activate?.(true);
        child.body.activate?.(true);
        this.joints.push({ constraint, parent, child });
        this._owned.push(
            constraint, frameA, frameB, oA,
            linLo, linHi, angLo, angHi
        );
    }
    _jointLimits(child, pivotWorld) {
        const key = child.key;
        let cfg = RAGDOLL_JOINT_LIMITS[key] || RAGDOLL_JOINT_LIMITS.generic;
        if (!cfg.hinge) return cfg;
        // Dynamic hinge detection for knees/elbows:
        //   bone direction (parent→child), then pick the perpendicular world
        //   axis (lateral for vertical bones, forward for horizontal ones),
        //   expressed in the CHILD bone's local frame.
        const boneDir = this._v.copy(pivotWorld).sub(child.pos).normalize();
        const vertical = Math.abs(boneDir.dot(this._up)) > 0.6;
        const flex = this._v2
            .copy(boneDir)
            .cross(vertical ? this._right : this._up);
        if (flex.lengthSq() < 0.0001) flex.copy(this._right);
        flex.normalize();
        const invQuat = this._q2.copy(child.quat).invert();
        flex.applyQuaternion(invQuat);
        const min = [-RAGDOLL_LOCKED_AXIS, -RAGDOLL_LOCKED_AXIS, -RAGDOLL_LOCKED_AXIS];
        const max = [RAGDOLL_LOCKED_AXIS, RAGDOLL_LOCKED_AXIS, RAGDOLL_LOCKED_AXIS];
        const ax = Math.abs(flex.x), ay = Math.abs(flex.y), az = Math.abs(flex.z);
        let hingeAxis = ax >= ay && ax >= az ? 0 : (ay >= ax && ay >= az ? 1 : 2);
        min[hingeAxis] = -RAGDOLL_HINGE_ANGLE;
        max[hingeAxis] = RAGDOLL_HINGE_ANGLE;
        if (cfg.twist) {
            const boneLocal = this._v2.copy(boneDir).applyQuaternion(invQuat);
            const tx = Math.abs(boneLocal.x), ty = Math.abs(boneLocal.y), tz = Math.abs(boneLocal.z);
            const twistAxis = tx >= ty && tx >= tz ? 0 : (ty >= tx && ty >= tz ? 1 : 2);
            if (twistAxis !== hingeAxis) {
                min[twistAxis] = -cfg.twist;
                max[twistAxis] = cfg.twist;
            }
        }
        return { min, max };
    }
}
if (typeof window !== 'undefined') {
    window.RagdollSystem = RagdollSystem;
    window.ragdollSystem = window.ragdollSystem || new RagdollSystem(window.physicsSystem || null);
    window.ragdollSystem.version = '4.0';
    window.getRagdollSystem = () => window.ragdollSystem;
    window.addEventListener?.('sm:advanced-physics-ready', () => {
        if (window.ragdollSystem?.active) window.ragdollSystem._registerAdvancedContacts?.();
        if (window.SMPhysics) {
            window.SMPhysics.RagdollSystem = RagdollSystem;
            window.SMPhysics.ragdollSystem = window.ragdollSystem;
        }
    });
}