// engine/workspace/core/SMWorkspaceVisibilityAuthority.js
// SM Engine — final visibility authority for workspace-owned scene roots.
//
// Goals:
// - Terrain can NEVER leak into another workspace.
// - Async objects are corrected after they appear.
// - Only roots are gated; child visibility is preserved.
// - Terrain isolation stores/restores exact pre-isolation visibility.
// - Cheap continuous enforcement prevents late legacy callbacks from winning.
(function () {
    'use strict';

    class SMWorkspaceVisibilityAuthority {
        constructor() {
            this.activeMode = 'FILM';
            this.transitionId = 0;

            this.records =
                new Map();

            this.terrainIsolation =
                new Map();

            this.scene =
                null;

            this._frame =
                0;

            this._lastSceneChildCount =
                -1;

            this._installed =
                false;

            this._lastAudit =
                null;
        }

        get ownership() {
            return (
                window.smWorkspaceOwnership ||
                null
            );
        }

        normalizeMode(mode) {
            const value =
                String(mode || 'FILM')
                    .trim()
                    .toUpperCase();

            return [
                'FILM',
                'GAME_DEV',
                'GAMEPLAY_SAMPLE',
                'TERRAIN'
            ].includes(value)
                ? value
                : 'FILM';
        }

        register(
            root,
            scope = null
        ) {
            if (
                !root ||
                root.isScene
            ) {
                return null;
            }

            const resolvedScope =
                scope ||
                this.ownership
                    ?.classify?.(
                        root
                    );

            if (
                !resolvedScope ||
                resolvedScope ===
                    this.ownership
                        ?.SCOPE
                        ?.GLOBAL
            ) {
                return null;
            }

            let record =
                this.records.get(
                    root
                );

            if (!record) {
                record = {
                    root,
                    scope:
                        resolvedScope,

                    baselineVisible:
                        root.visible !==
                        false,

                    hiddenByWorkspace:
                        false,

                    registeredAt:
                        performance.now?.() ||
                        Date.now()
                };

                this.records.set(
                    root,
                    record
                );
            } else {
                record.scope =
                    resolvedScope;
            }

            root.userData ||= {};

            root.userData
                .smWorkspaceScope =
                resolvedScope;

            return record;
        }

        unregister(root) {
            if (!root) {
                return false;
            }

            return this.records.delete(
                root
            );
        }

        scan(
            scene =
                window.scene
        ) {
            if (
                !scene ||
                !this.ownership
            ) {
                return 0;
            }

            this.scene =
                scene;

            let registered = 0;

            scene.traverse(
                object => {
                    if (
                        !object ||
                        object === scene
                    ) {
                        return;
                    }

                    const scope =
                        this.ownership
                            .classify(
                                object
                            );

                    if (
                        !scope ||
                        scope ===
                            this.ownership
                                .SCOPE
                                .GLOBAL
                    ) {
                        return;
                    }

                    if (
                        !this.ownership
                            .isScopeRoot(
                                object,
                                scope
                            )
                    ) {
                        return;
                    }

                    if (
                        !this.records.has(
                            object
                        )
                    ) {
                        registered += 1;
                    }

                    this.register(
                        object,
                        scope
                    );
                }
            );

            this._cleanupRecords();

            this._lastSceneChildCount =
                scene.children.length;

            return registered;
        }

        _cleanupRecords() {
            for (
                const [
                    root
                ] of this.records
            ) {
                if (
                    !root ||
                    !root.parent
                ) {
                    this.records.delete(
                        root
                    );
                }
            }

            for (
                const [
                    root
                ] of this.terrainIsolation
            ) {
                if (
                    !root ||
                    !root.parent
                ) {
                    this.terrainIsolation
                        .delete(
                            root
                        );
                }
            }
        }

        _applyRecord(record) {
            const root =
                record?.root;

            if (
                !root ||
                !root.parent
            ) {
                return;
            }

            const allowed =
                this.ownership
                    ?.isAllowed?.(
                        record.scope,
                        this.activeMode
                    ) !== false;

            if (!allowed) {
                if (
                    !record
                        .hiddenByWorkspace
                ) {
                    record.baselineVisible =
                        root.visible !==
                        false;
                }

                root.visible =
                    false;

                record.hiddenByWorkspace =
                    true;

                root.userData ||= {};
                root.userData
                    .__smWorkspaceHidden =
                    true;

                return;
            }

            if (
                record.hiddenByWorkspace
            ) {
                root.visible =
                    record.baselineVisible !==
                    false;

                record.hiddenByWorkspace =
                    false;

                if (root.userData) {
                    delete root.userData
                        .__smWorkspaceHidden;
                }
            }
        }

        setScopeVisible(
            scope,
            visible,
            scene =
                window.scene
        ) {
            this.scan(scene);

            for (
                const record of
                this.records.values()
            ) {
                if (
                    record.scope !==
                    scope
                ) {
                    continue;
                }

                const root =
                    record.root;

                if (!root) continue;

                if (!visible) {
                    if (
                        !record
                            .hiddenByWorkspace
                    ) {
                        record.baselineVisible =
                            root.visible !==
                            false;
                    }

                    root.visible =
                        false;

                    record.hiddenByWorkspace =
                        true;

                    root.userData ||= {};
                    root.userData
                        .__smWorkspaceHidden =
                        true;
                } else {
                    root.visible =
                        record.baselineVisible !==
                        false;

                    record.hiddenByWorkspace =
                        false;

                    if (root.userData) {
                        delete root.userData
                            .__smWorkspaceHidden;
                    }
                }
            }

            return true;
        }

        _isTerrainPlayerRoot(
            root
        ) {
            const manager =
                window.workspaceManager;

            if (
                manager
                    ?._hasTerrainPlayerAdded?.() !==
                true
            ) {
                return false;
            }

            return !!manager
                ?._isTerrainPlayerObject?.(
                    root
                );
        }

        _shouldTerrainIsolate(
            root
        ) {
            if (
                !root ||
                root.isScene
            ) {
                return false;
            }

            const ownership =
                this.ownership;

            const scope =
                ownership
                    ?.classify?.(
                        root
                    );

            if (
                scope ===
                    ownership
                        ?.SCOPE
                        ?.TERRAIN ||
                scope ===
                    ownership
                        ?.SCOPE
                        ?.GLOBAL
            ) {
                return false;
            }

            if (
                ownership
                    ?.isEnvironmentObject?.(
                        root
                    ) ||
                ownership
                    ?.isWaterObject?.(
                        root
                    ) ||
                ownership
                    ?.isEditorSystemObject?.(
                        root
                    ) ||
                this._isTerrainPlayerRoot(
                    root
                )
            ) {
                return false;
            }

            /*
             * Managed roots from other modes are already hidden by their own
             * scope records. Unclassified roots are user-authored scene
             * content (a rock, prop, mesh, imported asset, etc.) and must stay
             * visible while sculpting terrain. Hiding every unclassified root
             * is what made newly added objects disappear in Terrain mode.
             */
            return false;
        }

        enterTerrainIsolation(
            scene =
                window.scene
        ) {
            if (!scene) {
                return false;
            }

            this.scene =
                scene;

            // Restore any snapshot left by older Terrain sessions. Visibility
            // is now governed by explicit workspace ownership only; arbitrary
            // user objects are never Terrain-isolated.
            if (
                this.terrainIsolation.size >
                0
            ) {
                this.leaveTerrainIsolation(
                    scene
                );
            }

            scene.children
                .slice()
                .forEach(
                    root => {
                        if (
                            !this
                                ._shouldTerrainIsolate(
                                    root
                                )
                        ) {
                            return;
                        }

                        if (
                            !this.terrainIsolation
                                .has(
                                    root
                                )
                        ) {
                            this.terrainIsolation
                                .set(
                                    root,
                                    {
                                        visible:
                                            root.visible !==
                                            false
                                    }
                                );
                        }

                        root.visible =
                            false;

                        root.userData ||= {};
                        root.userData
                            .__smTerrainIsolated =
                            true;
                    }
                );

            return true;
        }

        enforceTerrainIsolation(
            scene =
                window.scene
        ) {
            if (
                this.activeMode !==
                    'TERRAIN' ||
                !scene
            ) {
                return;
            }

            /*
             * Catch async scene roots created after Terrain mode entered.
             */
            scene.children
                .slice()
                .forEach(
                    root => {
                        if (
                            !this
                                ._shouldTerrainIsolate(
                                    root
                                )
                        ) {
                            return;
                        }

                        if (
                            !this.terrainIsolation
                                .has(
                                    root
                                )
                        ) {
                            this.terrainIsolation
                                .set(
                                    root,
                                    {
                                        visible:
                                            root.visible !==
                                            false
                                    }
                                );
                        }

                        root.visible =
                            false;

                        root.userData ||= {};
                        root.userData
                            .__smTerrainIsolated =
                            true;
                    }
                );
        }

        leaveTerrainIsolation(
            scene =
                window.scene
        ) {
            for (
                const [
                    root,
                    state
                ] of this.terrainIsolation
            ) {
                if (
                    !root ||
                    !root.parent
                ) {
                    continue;
                }

                root.visible =
                    state.visible !==
                    false;

                if (root.userData) {
                    delete root.userData
                        .__smTerrainIsolated;
                }
            }

            this.terrainIsolation
                .clear();

            return true;
        }

        setMode(
            mode,
            {
                scene =
                    window.scene,
                transitionId =
                    this.transitionId
            } = {}
        ) {
            const next =
                this.normalizeMode(
                    mode
                );

            const previous =
                this.activeMode;

            this.transitionId =
                transitionId;

            if (
                previous ===
                    'TERRAIN' &&
                next !==
                    'TERRAIN'
            ) {
                this.leaveTerrainIsolation(
                    scene
                );
            }

            this.activeMode =
                next;

            this.scene =
                scene ||
                this.scene;

            this.scan(
                this.scene
            );

            if (
                next ===
                'TERRAIN'
            ) {
                this
                    .enterTerrainIsolation(
                        this.scene
                    );
            }

            this.enforce(
                this.scene,
                {
                    scan: false
                }
            );

            return next;
        }

        enforce(
            scene =
                this.scene ||
                window.scene,
            {
                scan = false
            } = {}
        ) {
            if (!scene) {
                return false;
            }

            this.scene =
                scene;

            const childCountChanged =
                scene.children.length !==
                this._lastSceneChildCount;

            if (
                scan ||
                childCountChanged
            ) {
                this.scan(
                    scene
                );
            }

            for (
                const record of
                this.records.values()
            ) {
                this._applyRecord(
                    record
                );
            }

            if (
                this.activeMode ===
                    'TERRAIN'
            ) {
                this
                    .enforceTerrainIsolation(
                        scene
                    );
            }

            return true;
        }

        audit(
            scene =
                window.scene
        ) {
            this.scan(scene);

            const leaks = [];

            for (
                const record of
                this.records.values()
            ) {
                const expected =
                    this.ownership
                        .isAllowed(
                            record.scope,
                            this.activeMode
                        );

                if (
                    !expected &&
                    record.root?.visible
                ) {
                    leaks.push({
                        name:
                            record.root.name ||
                            record.root.uuid,

                        scope:
                            record.scope,

                        mode:
                            this.activeMode,

                        visible:
                            record.root.visible
                    });
                }
            }

            const result = {
                mode:
                    this.activeMode,

                registeredRoots:
                    this.records.size,

                terrainIsolationRoots:
                    this.terrainIsolation.size,

                leaks
            };

            this._lastAudit =
                result;

            if (leaks.length) {
                console.warn(
                    '[WorkspaceVisibility] leaks detected:',
                    leaks
                );
            } else {
                console.info(
                    '[WorkspaceVisibility] audit clean:',
                    result
                );
            }

            return result;
        }

        _installFrameAuthority() {
            if (this._installed) {
                return;
            }

            this._installed =
                true;

            const tick = () => {
                this._frame += 1;

                /*
                 * Root gating is tiny, so run every ~6 frames.
                 * Full discovery runs much less frequently or when root count
                 * changes.
                 */
                if (
                    this._frame %
                        6 !==
                    0
                ) {
                    return;
                }

                const scene =
                    window.scene ||
                    this.scene;

                if (!scene) {
                    return;
                }

                const fullScan =
                    this._frame %
                        120 ===
                    0;

                this.enforce(
                    scene,
                    {
                        scan:
                            fullScan
                    }
                );
            };

            if (
                Array.isArray(
                    window.engineFrameCallbacks
                )
            ) {
                window.engineFrameCallbacks
                    .push(
                        tick
                    );

                return;
            }

            const raf = () => {
                tick();

                requestAnimationFrame(
                    raf
                );
            };

            requestAnimationFrame(
                raf
            );
        }

        init(
            scene =
                window.scene
        ) {
            this.scene =
                scene ||
                this.scene;

            this.activeMode =
                this.normalizeMode(
                    window.workspaceManager
                        ?.currentMode ||
                    localStorage.getItem(
                        'sm_workspace_mode'
                    ) ||
                    'FILM'
                );

            this.scan(
                this.scene
            );

            if (
                this.activeMode ===
                    'TERRAIN'
            ) {
                this
                    .enterTerrainIsolation(
                        this.scene
                    );
            }

            this.enforce(
                this.scene
            );

            this
                ._installFrameAuthority();

            return true;
        }
    }

    window.SMWorkspaceVisibilityAuthority =
        SMWorkspaceVisibilityAuthority;

    window.smWorkspaceVisibilityAuthority =
        window.smWorkspaceVisibilityAuthority ||
        new SMWorkspaceVisibilityAuthority();
})();
