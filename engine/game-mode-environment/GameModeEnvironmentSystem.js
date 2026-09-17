// engine/game-mode-environment/GameModeEnvironmentSystem.js
(function () {
    'use strict';

    class SMGameModeEnvironmentSystem {
        constructor() {
            this.version = window.SMGameModeEnvironmentConfig?.version || 'sm-game-mode-arena-v3';
            this.root = null;
            this.colliders = [];
        }

        isReady() {
            return !!(
                window.SMGameModeEnvironmentConfig &&
                window.SMGameModeBuildingKit &&
                window.SMGameModeObstacleFactory &&
                window.SMGameModeFacilityLayout
            );
        }

        collectColliders(root = this.root) {
            const result = [];
            root?.traverse?.(object => {
                if (!object?.isMesh) return;
                if (object.userData?.collidable === false) return;
                if (object.userData?.editorOnly === true) return;
                result.push(object);
            });
            this.colliders = result;
            return result;
        }

        buildInto(parent, context = {}) {
            if (!parent || !this.isReady()) {
                console.warn('[GameModeArena] Missing arena modules.');
                return { root: null, colliders: [] };
            }

            const oldFacility = parent.getObjectByName?.('SM_GameModeFacility');
            const oldArena = parent.getObjectByName?.('SM_GameModeArena');
            [oldFacility, oldArena].filter(Boolean).forEach(old => {
                window.smGameModeCollisionBridge
                    ?.unregisterPlayerCollision?.(
                        old
                    );

                old.traverse?.(object => {
                    object.geometry?.dispose?.();
                    if (object.userData?.isGameModeLabel) {
                        object.material?.map?.dispose?.();
                    }
                });

                old.parent?.remove(old);
            });

            const root = new THREE.Group();
            root.name = 'SM_GameModeArena';
            root.userData = {
                isSystemObject: false,
                ignoreInHierarchy: false,
                ignoreInTimeline: true,
                workspaceOnly: 'GAME_DEV',
                isGameDevelopmentEnvironment: true,
                isGameModeArena: true,
                environmentVersion: this.version,
                static: true,
                excludeFromNanite: true,
                excludeFromStaticMerge: true
            };

            window.SMGameModeFacilityLayout.build(root, context);
            parent.add(root);
            root.updateMatrixWorld(true);

            this.root = root;
            const colliders = this.collectColliders(root);

            window.smGameModeArena = root;
            window.smGameModeFacility = root; // compatibility alias
            window.smGameModeArenaColliders = colliders;
            window.smGameModeFacilityColliders = colliders;

            /*
             * Register collision immediately when the collision bridge is
             * already loaded. The event below is kept as a second,
             * load-order-independent path.
             */
            window.smGameModeCollisionBridge
                ?.register?.(
                    root,
                    colliders
                );

            window.dispatchEvent(new CustomEvent('sm:game-mode-arena-built', {
                detail: { root, colliders, version: this.version }
            }));

            console.log(`[GameModeArena] Built ${colliders.length} collision meshes.`);
            return { root, colliders };
        }

        setVisible(visible) {
            if (!this.root) return false;
            this.root.visible = !!visible;
            return true;
        }
    }

    window.SMGameModeEnvironmentSystem =
        window.SMGameModeEnvironmentSystem ||
        new SMGameModeEnvironmentSystem();
})();