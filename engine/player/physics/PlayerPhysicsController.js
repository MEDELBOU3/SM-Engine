/**
 * PlayerPhysicsController.js
 *
 * Lightweight kinematic character collision used by the Gameplay Sample.
 * The movement body is a Y-up capsule (resolved against static broad-phase
 * boxes); downward ray tests provide accurate grounding on ramps and meshes.
 */
class SMPlayerCollisionRegistryClass {
    constructor() {
        this.meshes = new Set();
        this.traversalMeshes = new Set();
    }

    registerObject(root, options = {}) {
        if (!root?.traverse) return root;
        const traversalType = options.traversalType;
        root.traverse(object => {
            if (!object?.isMesh) return;
            object.userData = object.userData || {};
            object.userData.collisionEnabled = options.collisionEnabled !== false;
            object.userData.collisionLayer = options.collisionLayer || object.userData.collisionLayer || 'world-static';
            object.userData.bodyType = options.bodyType || object.userData.bodyType || 'static';
            object.userData.physicsShape = options.physicsShape || object.userData.physicsShape || 'box';
            if (options.horizontalBlocking !== undefined) {
                object.userData.horizontalBlocking = !!options.horizontalBlocking;
            }
            if (traversalType !== undefined && object.userData.traversalType == null) {
                object.userData.traversalType = traversalType;
                object.userData.noTraversal = traversalType === false || traversalType === null;
            }
            this.meshes.add(object);
            if (object.userData.noTraversal !== true && object.userData.traversalType) {
                this.traversalMeshes.add(object);
            }
        });
        return root;
    }

    unregisterObject(root) {
        if (!root?.traverse) return;
        root.traverse(object => {
            this.meshes.delete(object);
            this.traversalMeshes.delete(object);
        });
    }

    getMeshes() {
        return Array.from(this.meshes);
    }

    getTraversalMeshes() {
        return Array.from(this.traversalMeshes);
    }
}

window.SMPlayerCollisionRegistry = window.SMPlayerCollisionRegistry || new SMPlayerCollisionRegistryClass();

class SMPlayerPhysicsController {
    constructor({
        scene = window.scene,
        character,
        state,
        config = window.SMPlayerConfig,
        getWorld = () => window.gameplaySampleWorld || window.gameplaySampleEnvironment?.world || null
    } = {}) {
        this.scene = scene;
        this.character = character;
        this.state = state;
        this.config = config || {};
        this.getWorld = getWorld;

        this.enabled = false;
        this.radius = Math.max(0.12, Number(this.config.playerColliderRadius ?? 0.34));
        this.height = Math.max(this.radius * 2.2, Number(this.config.playerColliderHeight ?? character?.height ?? 1.8));
        this.skin = Math.max(0.005, Number(this.config.playerColliderSkin ?? 0.025));
        this.stepHeight = Math.max(0, Number(this.config.maxStepHeight ?? 0.45));
        this.groundOffset = Number(this.config.groundOffset ?? 0.025);
        this.groundSnapDistance = Math.max(0.05, Number(this.config.groundSnapDistance ?? 0.28));
        this.fallbackGroundY = Number(
            this.config.fallbackGroundY ?? this.config.spawnPosition?.[1] ?? this.groundOffset
        );
        this.gravity = Math.max(0, Number(this.config.gravity ?? 22));
        this.terminalVelocity = Math.max(1, Number(this.config.terminalVelocity ?? 28));
        this.minGroundNormalY = THREE.MathUtils.clamp(Number(this.config.minGroundNormalY ?? 0.42), 0.05, 1);
        this.cacheInterval = Math.max(0.05, Number(this.config.collisionCacheInterval ?? 0.20));

        this.verticalVelocity = 0;
        this.grounded = true;
        this.groundObject = null;
        this.groundNormal = new THREE.Vector3(0, 1, 0);
        this.entries = [];
        this.hitBodies = [];
        this._cacheAge = Infinity;

        // Collision cache lifecycle. Terrain deformation only marks the cache
        // dirty; rebuilding the entire world immediately for every brush event
        // can stall the renderer on large landscapes.
        this._worldDirty = true;
        this._refreshing = false;
        this._refreshCount = 0;
        this._lastRefreshDurationMs = 0;

        this._box = new THREE.Box3();
        this._expandedBox = new THREE.Box3();
        this._size = new THREE.Vector3();
        this._rayOrigin = new THREE.Vector3();
        this._rayDirection = new THREE.Vector3(0, -1, 0);
        this._raycaster = new THREE.Raycaster();
        this._normal = new THREE.Vector3();
        this._worldPosition = new THREE.Vector3();

        this._terrainChangedHandler = () => {
            // Do not synchronously rebuild broad-phase boxes from a sculpt
            // event. A drag can emit many terrain-deformed events per second.
            // Mark the cache dirty and let the normal physics update rebuild it
            // at most once per cache interval.
            this._worldDirty = true;
        };

        window.addEventListener(
            'sm:terrain-created',
            this._terrainChangedHandler
        );

        window.addEventListener(
            'sm:terrain-deformed',
            this._terrainChangedHandler
        );

        this._configureCharacterBodies();
    }

    _configureCharacterBodies() {
        const root = this.character?.model;
        if (!root) return;
        root.userData = root.userData || {};
        root.userData.collisionEnabled = true;
        root.userData.collisionLayer = 'player';
        root.userData.bodyType = 'kinematic';
        root.userData.physicsShape = 'capsule';
        root.userData.colliderBody = {
            type: 'capsule',
            radius: this.radius,
            height: this.height,
            centerY: this.height * 0.5
        };

        const classifyBone = name => {
            const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (key.includes('head')) return { region: 'head', radius: 0.15 };
            if (key.includes('neck')) return { region: 'neck', radius: 0.12 };
            if (key.includes('spine') || key.includes('chest')) return { region: 'torso', radius: 0.22 };
            if (key.includes('hips') || key.includes('pelvis')) return { region: 'pelvis', radius: 0.21 };
            if (key.includes('upleg') || key.includes('thigh')) return { region: 'upper-leg', radius: 0.14 };
            if (key.includes('leg') || key.includes('calf')) return { region: 'lower-leg', radius: 0.11 };
            if (key.includes('foot') || key.includes('toe')) return { region: 'foot', radius: 0.10 };
            if (key.includes('shoulder') || key.includes('arm')) return { region: 'arm', radius: 0.10 };
            if (key.includes('hand')) return { region: 'hand', radius: 0.08 };
            return null;
        };

        root.traverse(node => {
            node.userData = node.userData || {};
            if (node.isMesh || node.isSkinnedMesh) {
                node.userData.collisionLayer = 'player-hit';
                node.userData.bodyType = 'animated';
                node.userData.physicsShape = 'skinned-mesh';
                node.userData.isPlayerHitTarget = true;
            }
            if (!node.isBone) return;
            const body = classifyBone(node.name);
            if (!body) return;
            node.userData.collisionLayer = 'player-hit';
            node.userData.bodyType = 'animated';
            node.userData.physicsShape = 'sphere';
            node.userData.hitRegion = body.region;
            node.userData.hitRadius = body.radius;
            node.userData.isPlayerHitBody = true;
            this.hitBodies.push({ node, ...body });
        });
    }

    _belongsToScene(object) {
        let current = object;
        while (current) {
            if (current === this.scene) return true;
            current = current.parent;
        }
        return false;
    }

    _isWorldVisible(object) {
        let current = object;
        while (current && current !== this.scene) {
            if (current.visible === false) return false;
            current = current.parent;
        }
        return true;
    }

    _isCollisionMesh(object, forced = false) {
        if (!object?.isMesh || !object.geometry) return false;
        if (!this._belongsToScene(object) || !this._isWorldVisible(object)) return false;
        if (object.userData?.isPlayer || object.userData?.isPlayerPart) return false;
        if (object.userData?.collisionEnabled === false) return false;
        if (object.userData?.isEditorHelper || object.userData?.isTransformControlsChild) return false;
        return forced || object.userData?.collisionEnabled === true || object.userData?.isGameObstaclePart === true || object.userData?.isCityObject === true;
    }

    invalidateWorld() {
        this._worldDirty = true;
        return true;
    }

    refreshWorld(force = false) {
        if (this._refreshing) {
            return this.entries;
        }

        const hasCache = this.entries.length > 0;

        // Static collision data should stay cached indefinitely until something
        // explicitly invalidates it. When terrain is dirty, throttle the rebuild
        // so sculpt drags cannot trigger a full scene scan every frame.
        if (!force) {
            if (!this._worldDirty && hasCache) {
                return this.entries;
            }

            if (
                this._worldDirty &&
                hasCache &&
                this._cacheAge < this.cacheInterval
            ) {
                return this.entries;
            }
        }

        this._refreshing = true;
        const refreshStartedAt =
            typeof performance !== 'undefined' && performance.now
                ? performance.now()
                : Date.now();

        try {
            const meshes = new Map();
            const add = (object, forced = false) => {
                if (!this._isCollisionMesh(object, forced)) return;
                meshes.set(object.uuid, object);
            };

            const world = this.getWorld?.();
            (world?.collidableMeshes || []).forEach(object => add(object, true));
            (window.SMPlayerCollisionRegistry?.getMeshes?.() || []).forEach(object => add(object));

            const terrainQuery =
                window.TerrainSculpting?.surfaceQuery ||
                window.TerrainSurfaceQuery ||
                null;

            (terrainQuery?.getRaycastMeshes?.() || []).forEach(object => {
                object.userData = object.userData || {};
                object.userData.collisionEnabled = true;
                object.userData.collisionSurface = true;
                object.userData.horizontalBlocking = false;
                object.userData.physicsShape = 'mesh';
                object.userData.bodyType = 'static';
                add(object, true);
            });

            // Compatibility fallback for colliders that have not yet been
            // registered with SMPlayerCollisionRegistry. This is intentionally
            // performed only when the cache is dirty/forced, not every 0.2 s.
            this.scene?.traverse?.(object => {
                if (
                    object?.userData?.collisionEnabled === true ||
                    object?.userData?.isGameObstaclePart === true ||
                    object?.userData?.isCityObject === true
                ) add(object);
            });

            const nextEntries = [];
            meshes.forEach(object => {
                object.updateWorldMatrix?.(true, false);
                const box = new THREE.Box3().setFromObject(object);
                if (box.isEmpty()) return;
                const data = object.userData || {};
                nextEntries.push({
                    object,
                    box,
                    horizontalBlocking:
                        data.horizontalBlocking !== false &&
                        data.collisionSurface !== true,
                    traversalType: data.traversalType || null
                });
                data.collider = box.clone();
                data.colliderBody = data.colliderBody || {
                    type: data.physicsShape || 'box',
                    bodyType: data.bodyType || 'static',
                    layer: data.collisionLayer || 'world-static'
                };
            });

            this.entries = nextEntries;
            this._cacheAge = 0;
            this._worldDirty = false;
            this._refreshCount += 1;

            const refreshEndedAt =
                typeof performance !== 'undefined' && performance.now
                    ? performance.now()
                    : Date.now();
            this._lastRefreshDurationMs = Math.max(
                0,
                refreshEndedAt - refreshStartedAt
            );

            if (this._lastRefreshDurationMs > 20) {
                console.warn('[SMPlayerPhysics] Slow collision refresh:', {
                    durationMs: Number(this._lastRefreshDurationMs.toFixed(2)),
                    entries: this.entries.length,
                    refreshCount: this._refreshCount
                });
            }

            return this.entries;
        } finally {
            this._refreshing = false;
        }
    }

    _isIgnoredObject(object, ignored) {
        if (!ignored?.size) return false;
        let current = object;
        while (current) {
            if (ignored.has(current) || ignored.has(current.uuid)) return true;
            current = current.parent;
        }
        return false;
    }

    _verticalOverlap(startY, endY, box) {
        const footY = Math.min(startY, endY) + this.skin;
        const headY = Math.max(startY, endY) + this.height - this.skin;
        return box.max.y > footY && box.min.y < headY;
    }

    _sweepPointAgainstExpandedBox(start, end, box, radius) {
        const minX = box.min.x - radius;
        const maxX = box.max.x + radius;
        const minZ = box.min.z - radius;
        const maxZ = box.max.z + radius;
        const dx = end.x - start.x;
        const dz = end.z - start.z;

        const inside = start.x >= minX && start.x <= maxX && start.z >= minZ && start.z <= maxZ;
        if (inside) {
            const candidates = [
                { distance: start.x - minX, normal: new THREE.Vector3(-1, 0, 0) },
                { distance: maxX - start.x, normal: new THREE.Vector3(1, 0, 0) },
                { distance: start.z - minZ, normal: new THREE.Vector3(0, 0, -1) },
                { distance: maxZ - start.z, normal: new THREE.Vector3(0, 0, 1) }
            ].sort((a, b) => a.distance - b.distance);
            return { time: 0, normal: candidates[0].normal, penetration: candidates[0].distance + this.skin };
        }

        let enter = 0;
        let exit = 1;
        let normal = null;
        const axes = [
            { origin: start.x, delta: dx, min: minX, max: maxX, negative: new THREE.Vector3(-1, 0, 0), positive: new THREE.Vector3(1, 0, 0) },
            { origin: start.z, delta: dz, min: minZ, max: maxZ, negative: new THREE.Vector3(0, 0, -1), positive: new THREE.Vector3(0, 0, 1) }
        ];

        for (const axis of axes) {
            if (Math.abs(axis.delta) < 1e-8) {
                if (axis.origin <= axis.min || axis.origin >= axis.max) return null;
                continue;
            }
            const inverse = 1 / axis.delta;
            let near = (axis.min - axis.origin) * inverse;
            let far = (axis.max - axis.origin) * inverse;
            let nearNormal = axis.negative;
            if (near > far) {
                [near, far] = [far, near];
                nearNormal = axis.positive;
            }
            if (near > enter) {
                enter = near;
                normal = nearNormal;
            }
            exit = Math.min(exit, far);
            if (enter > exit) return null;
        }

        if (!normal || enter < 0 || enter > 1) return null;
        return { time: enter, normal, penetration: 0 };
    }

    _resolveHorizontal(start, desired, velocity, options = {}) {
        const ignored = new Set(options.ignoreObjects || []);
        const allowSteps = options.allowSteps !== false;
        const radius = this.radius + this.skin;
        const current = start.clone();
        const remaining = new THREE.Vector3(desired.x - start.x, 0, desired.z - start.z);
        const target = new THREE.Vector3();
        let collided = false;
        let hitObject = null;

        for (let iteration = 0; iteration < 4 && remaining.lengthSq() > 1e-10; iteration++) {
            target.copy(current).add(remaining);
            target.y = desired.y;
            let best = null;

            for (const entry of this.entries) {
                if (!entry.horizontalBlocking || this._isIgnoredObject(entry.object, ignored)) continue;
                const box = entry.box;
                if (!this._verticalOverlap(current.y, target.y, box)) continue;

                const stepDelta = box.max.y - current.y;
                if (
                    allowSteps &&
                    stepDelta >= -this.groundSnapDistance &&
                    stepDelta <= this.stepHeight
                ) continue;

                const hit = this._sweepPointAgainstExpandedBox(current, target, box, radius);
                if (!hit || (best && hit.time >= best.time)) continue;
                best = { ...hit, entry };
            }

            if (!best) {
                current.add(remaining);
                remaining.set(0, 0, 0);
                break;
            }

            collided = true;
            hitObject = best.entry.object;
            if (best.penetration > 0) {
                current.addScaledVector(best.normal, best.penetration);
            } else {
                const distance = Math.sqrt(remaining.x * remaining.x + remaining.z * remaining.z);
                const skinTime = distance > 1e-8 ? this.skin / distance : 0;
                const travel = THREE.MathUtils.clamp(best.time - skinTime, 0, 1);
                current.addScaledVector(remaining, travel);
                remaining.multiplyScalar(1 - travel);
            }

            const intoSurface = remaining.dot(best.normal);
            if (intoSurface < 0) remaining.addScaledVector(best.normal, -intoSurface);
            if (velocity) {
                const velocityIntoSurface = velocity.dot(best.normal);
                if (velocityIntoSurface < 0) velocity.addScaledVector(best.normal, -velocityIntoSurface);
            }
        }

        desired.x = current.x;
        desired.z = current.z;
        return { collided, hitObject, position: current };
    }

    isCapsulePositionFree(position, { ignoreObjects = [] } = {}) {
        if (!position) return false;
        this.refreshWorld();
        const ignored = new Set(ignoreObjects);
        const radius = this.radius + this.skin;
        const footY = position.y + this.skin;
        const headY = position.y + this.height - this.skin;

        for (const entry of this.entries) {
            if (!entry.horizontalBlocking || this._isIgnoredObject(entry.object, ignored)) continue;
            const box = entry.box;
            if (box.max.y <= footY || box.min.y >= headY) continue;
            const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
            const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
            const dx = position.x - closestX;
            const dz = position.z - closestZ;
            if (dx * dx + dz * dz < radius * radius) return false;
        }
        return true;
    }

    constrainTraversalMovement(start, desired, { ignoreObjects = [] } = {}) {
        this.refreshWorld();
        const constrained = desired.clone();
        const result = this._resolveHorizontal(start, constrained, null, {
            ignoreObjects,
            allowSteps: false
        });
        constrained.y = desired.y;
        return {
            position: constrained,
            blocked: result.collided && constrained.distanceToSquared(desired) > this.skin * this.skin,
            hitObject: result.hitObject
        };
    }

    probeGround(position, currentY = position?.y ?? 0, fallingDistance = 0) {
        if (!position) return null;
        this.refreshWorld();
        return this._findGround(position, currentY, fallingDistance);
    }

    validateTraversalLanding(position, { ignoreObjects = [], requireGround = true } = {}) {
        if (!position || !this.isCapsulePositionFree(position, { ignoreObjects })) return false;
        if (!requireGround) return true;
        const hit = this.probeGround(position, position.y + this.stepHeight, this.height);
        if (!hit) return Math.abs(position.y - this.fallbackGroundY) <= this.stepHeight + this.groundSnapDistance;
        const landingY = hit.point.y + this.groundOffset;
        return Math.abs(landingY - position.y) <= Math.max(this.stepHeight, this.groundSnapDistance) + this.skin;
    }

    _findGround(position, currentY, fallingDistance = 0) {
        const originY = currentY + this.stepHeight + 0.35;
        const probeDown = Math.max(1.5, this.groundSnapDistance + fallingDistance + 0.75);
        const candidates = [];

        for (const entry of this.entries) {
            const box = entry.box;
            if (position.x < box.min.x - this.radius || position.x > box.max.x + this.radius) continue;
            if (position.z < box.min.z - this.radius || position.z > box.max.z + this.radius) continue;
            if (box.min.y > originY || box.max.y < originY - probeDown) continue;
            candidates.push(entry.object);
        }
        if (!candidates.length) return null;

        this._rayOrigin.set(position.x, originY, position.z);
        this._raycaster.set(this._rayOrigin, this._rayDirection);
        this._raycaster.near = 0;
        this._raycaster.far = probeDown;
        const hits = this._raycaster.intersectObjects(candidates, false);

        for (const hit of hits) {
            if (!hit?.object || !Number.isFinite(hit.point?.y)) continue;
            if (hit.face?.normal) {
                this._normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
                if (this._normal.y < this.minGroundNormalY) continue;
                hit.smGroundNormal = this._normal.clone();
            }
            return hit;
        }
        return null;
    }

    resolveMovement(start, desired, velocity, delta) {
        if (!this.enabled || !start || !desired) {
            return { grounded: this.grounded, groundObject: this.groundObject };
        }
        this._cacheAge += Math.max(0, Number(delta) || 0);
        this.refreshWorld();
        this._resolveHorizontal(start, desired, velocity);

        const dt = Math.min(0.05, Math.max(0.001, Number(delta) || 0.016));
        if (!this.grounded) {
            this.verticalVelocity = Math.max(-this.terminalVelocity, this.verticalVelocity - this.gravity * dt);
        } else {
            this.verticalVelocity = Math.min(0, this.verticalVelocity);
        }
        desired.y = start.y + this.verticalVelocity * dt;

        const fallingDistance = Math.max(0, start.y - desired.y);
        const groundHit = this._findGround(desired, start.y, fallingDistance);

        const hasTerrainSurface = !!(
            window.TerrainSculpting?.surfaceQuery?.hasTerrain?.() ||
            window.TerrainSurfaceQuery?.hasTerrain?.()
        );

        // A synthetic flat fallback floor is useful in old sample scenes, but
        // it must never keep the player floating over a sculpted hole.
        const useFallbackGround = !groundHit && !hasTerrainSurface && (
            start.y <= this.fallbackGroundY + this.stepHeight ||
            desired.y <= this.fallbackGroundY
        );
        const groundRootY = groundHit
            ? groundHit.point.y + this.groundOffset
            : (useFallbackGround ? this.fallbackGroundY : Number.NEGATIVE_INFINITY);
        const stepDelta = groundRootY - start.y;
        const hasGround = !!groundHit || useFallbackGround;
        const canSnap = hasGround && stepDelta <= this.stepHeight + this.skin && stepDelta >= -this.groundSnapDistance;
        const crossedGround = hasGround && start.y >= groundRootY - this.skin && desired.y <= groundRootY;

        if (canSnap || crossedGround) {
            desired.y = groundRootY;
            this.verticalVelocity = 0;
            this.grounded = true;
            this.groundObject = groundHit?.object || null;
            this.groundNormal.copy(groundHit?.smGroundNormal || this._rayDirection).multiplyScalar(
                groundHit?.smGroundNormal ? 1 : -1
            );
        } else {
            this.grounded = false;
            this.groundObject = null;
            this.groundNormal.set(0, 1, 0);
        }

        if (this.state) {
            this.state.grounded = this.grounded;
            this.state.airborne = !this.grounded;
        }
        return {
            grounded: this.grounded,
            groundObject: this.groundObject,
            groundNormal: this.groundNormal,
            verticalVelocity: this.verticalVelocity
        };
    }

    setSlopeLimitDegrees(degrees = 48) {
        const angle = THREE.MathUtils.clamp(
            Number(degrees) || 48,
            1,
            89
        );

        this.minGroundNormalY =
            Math.cos(
                THREE.MathUtils.degToRad(angle)
            );

        return angle;
    }

    getHitBodiesWorld() {
        return this.hitBodies.map(body => ({
            node: body.node,
            region: body.region,
            radius: body.radius,
            center: body.node.getWorldPosition(new THREE.Vector3())
        }));
    }

    setEnabled(enabled) {
        const nextState = !!enabled;

        // Idempotent by design: visibility/workspace repair code may request
        // the same state repeatedly. Re-enabling an already-enabled controller
        // must never rebuild every collider in the scene.
        if (this.enabled === nextState) {
            return this.enabled;
        }

        this.enabled = nextState;
        this.verticalVelocity = 0;

        if (this.enabled) {
            this._worldDirty = true;
            this._cacheAge = Infinity;
            this.refreshWorld(true);
        }

        return this.enabled;
    }

    syncAfterTeleport() {
        this.verticalVelocity = 0;
        this.grounded = true;
        this.groundObject = null;

        // Teleport changes the player, not the static world. Keep the existing
        // collision cache. If no cache exists yet, build it lazily.
        if (!this.entries.length) {
            this._worldDirty = true;
            this._cacheAge = Infinity;
            this.refreshWorld(false);
        }

        return true;
    }

    getDebugStats() {
        return {
            enabled: this.enabled,
            entries: this.entries.length,
            worldDirty: this._worldDirty,
            cacheAge: this._cacheAge,
            refreshCount: this._refreshCount,
            lastRefreshDurationMs: this._lastRefreshDurationMs
        };
    }

    dispose() {
        this.enabled = false;

        window.removeEventListener(
            'sm:terrain-created',
            this._terrainChangedHandler
        );

        window.removeEventListener(
            'sm:terrain-deformed',
            this._terrainChangedHandler
        );

        this.entries.length = 0;
        this.hitBodies.length = 0;
    }
}

window.SMPlayerPhysicsController = SMPlayerPhysicsController;
window.getSMPlayerHitBodies = function getSMPlayerHitBodies() {
    return window.playerSystem?.playerPhysics?.getHitBodiesWorld?.() || [];
};