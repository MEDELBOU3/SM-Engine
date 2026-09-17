// engine/workspace/core/SMWorkspaceOwnership.js
// SM Engine — canonical workspace ownership/classification.
//
// Important:
// Workspace ownership is applied to ROOTS, not every mesh.
// This avoids destroying child visibility states when switching workspaces.
(function () {
    'use strict';

    const SCOPE = Object.freeze({
        GLOBAL: 'GLOBAL',
        TERRAIN: 'TERRAIN',
        GAME_DEV: 'GAME_DEV',
        GAMEPLAY_SAMPLE: 'GAMEPLAY_SAMPLE',
        FILM_GRID: 'FILM_GRID'
    });

    class SMWorkspaceOwnership {
        constructor() {
            this.SCOPE = SCOPE;
        }

        _data(object) {
            return object?.userData || {};
        }

        _name(object) {
            return String(object?.name || '');
        }

        _workspaceOnly(object) {
            return String(
                this._data(object).workspaceOnly || ''
            ).toUpperCase();
        }

        hasAncestor(object, predicate) {
            let current = object?.parent || null;

            while (current) {
                if (predicate(current)) {
                    return true;
                }

                current = current.parent;
            }

            return false;
        }

        isTerrainObject(object) {
            if (!object) return false;

            const data =
                this._data(object);

            const name =
                this._name(object);

            return !!(
                object === window.terrain ||
                data.isTerrain === true ||
                data.isTerrainMesh === true ||
                data.isTerrainComponent === true ||
                data.workspaceOnly === 'TERRAIN' ||
                name === 'Terrain' ||
                name === 'Terrain_Mesh' ||
                name.startsWith('Terrain_')
            );
        }

        isGameplaySampleObject(object) {
            if (!object) return false;

            const data =
                this._data(object);

            const name =
                this._name(object);

            return !!(
                data.workspaceOnly === 'GAMEPLAY_SAMPLE' ||
                data.isGameplaySample === true ||
                data.smGameProjectObject === true ||
                name === 'SMGameplaySampleEnvironment' ||
                name === 'SMGameplaySampleObstacles' ||
                name === 'SMGameplaySampleFloor' ||
                name === 'SMGameplaySampleLights' ||
                name === 'SMGameplaySampleFallbackLights'
            );
        }

        isGameDevObject(object) {
            if (!object) return false;

            const data =
                this._data(object);

            const name =
                this._name(object);

            const explicit =
                data.workspaceOnly === 'GAME_DEV' ||
                data.isGameDevelopmentEnvironment === true ||
                name === 'UnrealEngineFloor' ||
                name === 'ObstaclesGroup' ||
                name === 'DistanceMarkers' ||
                name === 'MotionMatchingSampleCourse' ||
                name === 'SM_GameModeArena' ||
                name === 'SM_GameModeFacility';

            if (explicit) {
                return true;
            }

            /*
             * Do NOT classify every arbitrary "isObstacle" mesh as GAME_DEV.
             * User-authored collision meshes can also be obstacles.
             *
             * A legacy obstacle is GameDev-owned only when it lives below a
             * known GameDev environment root.
             */
            if (data.isObstacle === true) {
                return this.hasAncestor(
                    object,
                    ancestor => {
                        const ancestorData =
                            this._data(ancestor);

                        const ancestorName =
                            this._name(ancestor);

                        return !!(
                            ancestorData.workspaceOnly === 'GAME_DEV' ||
                            ancestorData.isGameDevelopmentEnvironment === true ||
                            ancestorName === 'ObstaclesGroup' ||
                            ancestorName === 'SM_GameModeArena' ||
                            ancestorName === 'SM_GameModeFacility'
                        );
                    }
                );
            }

            return false;
        }

        isFilmGridObject(object) {
            if (!object) return false;

            const data =
                this._data(object);

            const name =
                this._name(object);

            return !!(
                data.workspaceOnly === 'WORKSPACE_GRID' ||
                data.ws_workspaceGrid === true ||
                name === 'advancedGrid' ||
                name === 'blenderGrid' ||
                name === 'infiniteGrid'
            );
        }

        isEnvironmentObject(object) {
            if (!object) return false;

            const data =
                this._data(object);

            const name =
                this._name(object);

            const hdr =
                window.smHDRSkySystem;

            const sun =
                window.smSunController;

            return !!(
                object === hdr?.root ||
                object === hdr?.hdriProxy ||
                object === hdr?.sunLight ||
                object === hdr?.sunTarget ||
                object === hdr?.hemiLight ||
                object === sun?.light ||
                object === sun?.targetObject ||
                object === sun?.rigProxy ||
                data.isHDRSkyRoot === true ||
                data.isHDRSkyProxy === true ||
                data.isHDRSkyLight === true ||
                data.isHDRSkyTarget === true ||
                data.isSMSunLight === true ||
                data.isSMSunTarget === true ||
                data.isSMSunRigProxy === true ||
                data.keepForSky === true ||
                data.isSkyLightingObject === true ||
                name === 'Environment' ||
                name === 'HDRI Sky' ||
                name.startsWith('HDRI Sky •') ||
                name === 'Sun Light' ||
                name === 'Sun Target' ||
                name === 'Sun Rig' ||
                name === 'HDRI Fill Light'
            );
        }

        isWaterObject(object) {
            if (!object) return false;

            const data =
                this._data(object);

            const name =
                this._name(object);

            return !!(
                data.isWater === true ||
                name === 'WaterBodies' ||
                name.startsWith('WaterBody_')
            );
        }

        isEditorSystemObject(object) {
            if (!object) return false;

            const data =
                this._data(object);

            return !!(
                data.isEditorHelper === true ||
                data.editorOnly === true ||
                data.workspaceGlobal === true ||
                object.isCamera ||
                object.isLight
            );
        }

        classify(object) {
            if (!object) {
                return null;
            }

            if (
                this.isEnvironmentObject(object) ||
                this.isWaterObject(object)
            ) {
                return SCOPE.GLOBAL;
            }

            if (this.isTerrainObject(object)) {
                return SCOPE.TERRAIN;
            }

            if (
                this.isGameplaySampleObject(object)
            ) {
                return SCOPE.GAMEPLAY_SAMPLE;
            }

            if (this.isGameDevObject(object)) {
                return SCOPE.GAME_DEV;
            }

            if (this.isFilmGridObject(object)) {
                return SCOPE.FILM_GRID;
            }

            return null;
        }

        isAllowed(scope, mode) {
            const active =
                String(mode || 'FILM')
                    .toUpperCase();

            switch (scope) {
                case SCOPE.TERRAIN:
                    return active === 'TERRAIN';

                case SCOPE.GAME_DEV:
                    return active === 'GAME_DEV';

                case SCOPE.GAMEPLAY_SAMPLE:
                    return active === 'GAMEPLAY_SAMPLE';

                case SCOPE.FILM_GRID:
                    return active === 'FILM';

                case SCOPE.GLOBAL:
                default:
                    return true;
            }
        }

        /**
         * Returns true when object is the highest useful ownership root.
         * If an ancestor already has the same scope, this object should not
         * receive a second visibility record.
         */
        isScopeRoot(object, scope) {
            if (!object || !scope) {
                return false;
            }

            let current =
                object.parent;

            while (
                current &&
                !current.isScene
            ) {
                if (
                    this.classify(current) ===
                    scope
                ) {
                    return false;
                }

                current =
                    current.parent;
            }

            return true;
        }
    }

    window.SMWorkspaceOwnership =
        SMWorkspaceOwnership;

    window.smWorkspaceOwnership =
        window.smWorkspaceOwnership ||
        new SMWorkspaceOwnership();
})();