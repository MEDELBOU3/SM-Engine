// engine/game-mode-environment/GameModeCollisionBridge.js
// SM Engine — Game Mode Arena Collision Bridge
//
// Registers the Arena in BOTH collision layers:
//
// 1) SMPlayerCollisionRegistry
//    Used by the lightweight kinematic PlayerPhysicsController.
//    This is what makes the player stand/walk on platforms, stairs,
//    the objective plaza and the sloped ramp.
//
// 2) physicsSystem (when available)
//    Static rigid bodies for other physics actors.
//
// The bridge is idempotent and survives asynchronous engine boot.
(function () {
    'use strict';

    class SMGameModeCollisionBridge {
        constructor() {
            this.root = null;
            this.colliders = [];

            this._registeredPlayerMeshes = new Set();
            this._rigidRegistered = new WeakSet();

            this._retryTimer = 0;
            this._retryCount = 0;
            this._maxRetries = 80;

            this._boundBuilt = event => {
                const root =
                    event.detail?.root ||
                    window.smGameModeArena ||
                    null;

                const colliders =
                    event.detail?.colliders ||
                    null;

                this.register(root, colliders);
            };

            this._boundWorkspace = event => {
                const mode =
                    String(
                        event.detail?.mode ||
                        window.workspaceManager?.currentMode ||
                        ''
                    ).toUpperCase();

                if (
                    mode === 'GAME_DEV'
                ) {
                    this.ensureRegistered();
                    this.refreshPlayerWorld();
                }
            };

            window.addEventListener(
                'sm:game-mode-arena-built',
                this._boundBuilt
            );

            window.addEventListener(
                'sm:workspace-mode-changed',
                this._boundWorkspace
            );

            window.addEventListener(
                'sm:workspace-manager-mode-applied',
                this._boundWorkspace
            );
        }

        collect(root = this.root) {
            const colliders = [];

            root?.traverse?.(object => {
                if (
                    !object?.isMesh ||
                    !object.geometry ||
                    object.userData?.collidable === false ||
                    object.userData?.editorOnly === true ||
                    object.userData?.isGameModeLabel === true
                ) {
                    return;
                }

                colliders.push(object);
            });

            this.colliders = colliders;

            return colliders;
        }

        prepareMesh(mesh) {
            if (!mesh?.isMesh) {
                return false;
            }

            mesh.userData ||= {};

            Object.assign(
                mesh.userData,
                {
                    collidable: true,
                    collisionEnabled: true,
                    collisionLayer:
                        mesh.userData.collisionLayer ||
                        'world-static',

                    bodyType:
                        mesh.userData.bodyType ||
                        'static',

                    horizontalBlocking:
                        mesh.userData.horizontalBlocking !== false,

                    isGameObstaclePart: true,
                    isGameModeArenaCollider: true
                }
            );

            /*
             * PlayerPhysicsController's downward raycaster intersects the
             * REAL render geometry. This gives accurate "stand on top"
             * behaviour even on the rotated slope ramp and cylinder tiers.
             */
            if (
                mesh.userData.gameplayCategory === 'ramp' ||
                mesh.userData.gameplayCategory === 'stair' ||
                mesh.userData.gameplayCategory === 'platform' ||
                mesh.userData.gameplayCategory === 'arena-floor' ||
                mesh.userData.gameplayCategory === 'objective'
            ) {
                mesh.userData.walkableSurface = true;
            }

            return true;
        }

        registerPlayerCollision(mesh) {
            if (
                !mesh ||
                this._registeredPlayerMeshes.has(mesh.uuid)
            ) {
                return false;
            }

            const registry =
                window.SMPlayerCollisionRegistry;

            if (!registry) {
                return false;
            }

            /*
             * Register each collider individually.
             * Do NOT register the whole root with collisionEnabled:true,
             * because that would accidentally make visual labels collidable.
             */
            if (
                typeof registry.registerObject === 'function'
            ) {
                registry.registerObject(
                    mesh,
                    {
                        collisionEnabled: true,
                        collisionLayer: 'world-static',
                        bodyType: 'static',
                        horizontalBlocking:
                            mesh.userData.horizontalBlocking !== false
                    }
                );
            } else if (
                registry.meshes instanceof Set
            ) {
                registry.meshes.add(mesh);
            } else {
                return false;
            }

            this._registeredPlayerMeshes.add(
                mesh.uuid
            );

            return true;
        }

        _scaledPhysicsSize(mesh) {
            let size;

            if (
                Array.isArray(
                    mesh.userData?.physicsSize
                )
            ) {
                size =
                    mesh.userData.physicsSize
                        .slice(0, 3)
                        .map(
                            value =>
                                Math.max(
                                    0.01,
                                    Number(value) || 0.01
                                )
                        );
            } else {
                const box =
                    new THREE.Box3()
                        .setFromObject(
                            mesh
                        );

                const boxSize =
                    box.getSize(
                        new THREE.Vector3()
                    );

                size = [
                    Math.max(0.01, boxSize.x),
                    Math.max(0.01, boxSize.y),
                    Math.max(0.01, boxSize.z)
                ];

                return size;
            }

            const worldScale =
                mesh.getWorldScale(
                    new THREE.Vector3()
                );

            return [
                size[0] * Math.abs(worldScale.x),
                size[1] * Math.abs(worldScale.y),
                size[2] * Math.abs(worldScale.z)
            ];
        }

        registerRigidBody(mesh) {
            if (
                !mesh ||
                this._rigidRegistered.has(mesh)
            ) {
                return false;
            }

            const physics =
                window.physicsSystem ||
                (
                    typeof physicsSystem !== 'undefined'
                        ? physicsSystem
                        : null
                );

            if (
                !physics ||
                typeof physics.addBody !== 'function'
            ) {
                return false;
            }

            mesh.updateWorldMatrix?.(
                true,
                false
            );

            const shape =
                mesh.userData?.physicsShape === 'cylinder' ||
                mesh.geometry?.type?.includes('Cylinder')
                    ? 'cylinder'
                    : 'box';

            const options = {
                mass: 0,
                shapeType: shape,

                friction:
                    mesh.userData?.friction ??
                    0.82,

                restitution:
                    mesh.userData?.restitution ??
                    0.02,

                size:
                    this._scaledPhysicsSize(mesh),

                pos:
                    mesh.getWorldPosition(
                        new THREE.Vector3()
                    ),

                quat:
                    mesh.getWorldQuaternion(
                        new THREE.Quaternion()
                    )
            };

            try {
                physics.addBody(
                    mesh,
                    options
                );

                this._rigidRegistered.add(
                    mesh
                );

                mesh.userData
                    .smRigidCollisionRegistered =
                    true;

                return true;
            } catch (error) {
                console.warn(
                    `[GameModeCollision] rigid body failed for ${mesh.name}:`,
                    error
                );

                return false;
            }
        }

        register(
            root,
            colliders = null
        ) {
            if (!root) {
                return false;
            }

            /*
             * Clean stale references when a rebuilt arena replaces the root.
             */
            if (
                this.root &&
                this.root !== root
            ) {
                this.unregisterPlayerCollision(
                    this.root
                );
            }

            this.root = root;

            const list =
                Array.isArray(colliders)
                    ? colliders.filter(Boolean)
                    : this.collect(root);

            this.colliders = list;

            let playerRegistered = 0;
            let rigidRegistered = 0;

            list.forEach(mesh => {
                this.prepareMesh(mesh);

                if (
                    this.registerPlayerCollision(
                        mesh
                    )
                ) {
                    playerRegistered += 1;
                }

                if (
                    this.registerRigidBody(
                        mesh
                    )
                ) {
                    rigidRegistered += 1;
                }
            });

            /*
             * Keep existing engine globals coherent.
             */
            window.gameDevCollidableMeshes =
                Array.from(
                    new Set([
                        ...(window.gameDevCollidableMeshes || []),
                        ...list
                    ])
                );

            if (
                window.SMUE5Environment
            ) {
                window.SMUE5Environment.collidableMeshes =
                    window.gameDevCollidableMeshes;
            }

            this.refreshPlayerWorld();

            if (
                playerRegistered <
                list.length
            ) {
                this._scheduleRetry();
            }

            console.log(
                `[GameModeCollision] ${list.length} arena colliders prepared | ` +
                `player registry +${playerRegistered} | rigid bodies +${rigidRegistered}`
            );

            window.dispatchEvent(
                new CustomEvent(
                    'sm:game-mode-arena-collision-ready',
                    {
                        detail: {
                            root,
                            colliders: list,
                            playerRegistered,
                            rigidRegistered
                        }
                    }
                )
            );

            return true;
        }

        unregisterPlayerCollision(root = this.root) {
            const registry =
                window.SMPlayerCollisionRegistry;

            if (!registry || !root) {
                return false;
            }

            root.traverse?.(object => {
                if (!object?.isMesh) return;

                registry.meshes?.delete?.(
                    object
                );

                registry.traversalMeshes?.delete?.(
                    object
                );

                this._registeredPlayerMeshes.delete(
                    object.uuid
                );
            });

            return true;
        }

        refreshPlayerWorld() {
            const candidates = [
                window.smPlayerSystem?.physicsController,
                window.SMPlayerSystem?.physicsController,
                window.playerPhysicsController,
                window.gameplaySamplePlayer?.physicsController,
                window.gameplaySamplePlayerSystem?.physicsController,
                window.playerSystem?.physicsController
            ].filter(Boolean);

            const unique =
                Array.from(
                    new Set(candidates)
                );

            unique.forEach(controller => {
                try {
                    controller.refreshWorld?.(
                        true
                    );

                    controller._cacheAge =
                        Infinity;
                } catch (_) {}
            });

            /*
             * Notify controllers that only listen to environment events.
             */
            window.dispatchEvent(
                new CustomEvent(
                    'sm:world-collision-changed',
                    {
                        detail: {
                            source:
                                'game-mode-arena',
                            colliders:
                                this.colliders
                        }
                    }
                )
            );

            return unique.length;
        }

        _scheduleRetry() {
            if (
                this._retryTimer ||
                this._retryCount >=
                    this._maxRetries
            ) {
                return;
            }

            this._retryTimer =
                setTimeout(
                    () => {
                        this._retryTimer = 0;
                        this._retryCount += 1;

                        this.ensureRegistered();

                        const missingPlayerRegistry =
                            !window.SMPlayerCollisionRegistry;

                        const missingPhysics =
                            !window.physicsSystem;

                        if (
                            (
                                missingPlayerRegistry ||
                                missingPhysics
                            ) &&
                            this._retryCount <
                                this._maxRetries
                        ) {
                            this._scheduleRetry();
                        }
                    },
                    150
                );
        }

        ensureRegistered() {
            const root =
                this.root ||
                window.smGameModeArena ||
                window.scene?.getObjectByName?.(
                    'SM_GameModeArena'
                );

            if (!root) {
                return false;
            }

            const colliders =
                this.collect(root);

            return this.register(
                root,
                colliders
            );
        }

        debug() {
            const registry =
                window.SMPlayerCollisionRegistry;

            const rows =
                this.colliders.map(mesh => ({
                    name: mesh.name,
                    category:
                        mesh.userData?.gameplayCategory,
                    collisionEnabled:
                        mesh.userData?.collisionEnabled,
                    playerRegistered:
                        registry?.meshes?.has?.(mesh) ||
                        this._registeredPlayerMeshes.has(mesh.uuid),
                    rigidRegistered:
                        this._rigidRegistered.has(mesh),
                    shape:
                        mesh.userData?.physicsShape ||
                        mesh.geometry?.type,
                    walkable:
                        mesh.userData?.walkableSurface === true
                }));

            console.table(rows);

            return rows;
        }
    }

    window.SMGameModeCollisionBridge =
        SMGameModeCollisionBridge;

    window.smGameModeCollisionBridge =
        window.smGameModeCollisionBridge ||
        new SMGameModeCollisionBridge();

    /*
     * Handles load orders where the Arena was already built before this
     * script executed.
     */
    const boot = () => {
        let attempts = 0;

        const tryRegister = () => {
            attempts += 1;

            const ok =
                window.smGameModeCollisionBridge
                    ?.ensureRegistered?.();

            if (
                !ok &&
                attempts < 80
            ) {
                setTimeout(
                    tryRegister,
                    150
                );
            }
        };

        tryRegister();
    };

    if (
        document.readyState === 'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            boot,
            { once: true }
        );
    } else {
        boot();
    }
})();