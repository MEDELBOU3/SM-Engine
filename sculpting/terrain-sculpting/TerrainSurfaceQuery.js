// sculpting/terrain-sculpting/TerrainSurfaceQuery.js
// Runtime terrain surface queries shared by player grounding, spawning, AI, etc.
// Load AFTER TerrainSpatial.js and BEFORE TerrainBrushes.js.

(() => {
    const NS = window.TerrainSculpting = window.TerrainSculpting || {};

    const _raycaster = new THREE.Raycaster();
    const _origin = new THREE.Vector3();
    const _down = new THREE.Vector3(0, -1, 0);
    const _normal = new THREE.Vector3();
    const _box = new THREE.Box3();

    let activeTerrain = null;
    let deformationVersion = 0;
    let initialized = false;

    function _markMesh(mesh) {
        if (!mesh?.isMesh || !mesh.geometry) return mesh;

        mesh.userData = mesh.userData || {};
        mesh.userData.isTerrain = true;
        mesh.userData.collisionEnabled = true;
        mesh.userData.collisionLayer =
            mesh.userData.collisionLayer || 'world-static';
        mesh.userData.bodyType =
            mesh.userData.bodyType || 'static';
        mesh.userData.physicsShape = 'mesh';

        // Terrain is a walkable surface. Its whole AABB must NOT block the
        // capsule horizontally, otherwise a large landscape becomes one giant box.
        mesh.userData.collisionSurface = true;
        mesh.userData.horizontalBlocking = false;
        mesh.userData.terrainSurface = true;

        return mesh;
    }

    function getTerrain() {
        return window.terrain || activeTerrain || null;
    }

    function getRaycastMeshes() {
        const terrain = getTerrain();
        if (!terrain) return [];

        const manager =
            terrain.userData?.terrainComponentManager ||
            NS.activeComponentManager ||
            null;

        if (manager?.getRaycastMeshes) {
            return manager
                .getRaycastMeshes()
                .filter(mesh => mesh?.isMesh && mesh.geometry)
                .map(_markMesh);
        }

        if (terrain.isMesh && terrain.geometry) {
            return [_markMesh(terrain)];
        }

        const meshes = [];
        terrain.traverse?.(object => {
            if (
                object?.isMesh &&
                object.geometry &&
                (
                    object.userData?.isTerrain ||
                    object.userData?.isTerrainComponent ||
                    object.userData?.terrainSurface
                )
            ) {
                meshes.push(_markMesh(object));
            }
        });

        return meshes;
    }

    function registerTerrain(terrain = window.terrain) {
        if (!terrain) return null;

        activeTerrain = terrain;
        terrain.userData = terrain.userData || {};
        terrain.userData.isTerrain = true;
        terrain.userData.terrainSurface = true;

        const meshes = getRaycastMeshes();

        for (const mesh of meshes) {
            mesh.geometry?.computeBoundingBox?.();
            mesh.geometry?.computeBoundingSphere?.();
            mesh.updateWorldMatrix?.(true, false);
        }

        window.SMPlayerCollisionRegistry?.registerObject?.(
            terrain,
            {
                collisionEnabled: true,
                collisionLayer: 'world-static',
                bodyType: 'static',
                physicsShape: 'mesh',
                horizontalBlocking: false,
                traversalType: false
            }
        );

        // Registry helper writes properties on children. Reassert the terrain
        // surface contract afterward.
        meshes.forEach(_markMesh);

        return terrain;
    }

    function hasTerrain() {
        return getRaycastMeshes().length > 0;
    }

    function getTerrainBoundsWorld(target = new THREE.Box3()) {
        const meshes = getRaycastMeshes();
        target.makeEmpty();

        for (const mesh of meshes) {
            mesh.updateWorldMatrix?.(true, false);
            target.expandByObject(mesh);
        }

        return target;
    }

    function raycastDown(
        x,
        z,
        {
            originY = null,
            maxDistance = null,
            minNormalY = -1,
            recursive = false
        } = {}
    ) {
        const meshes = getRaycastMeshes();
        if (!meshes.length) return null;

        if (!Number.isFinite(originY) || !Number.isFinite(maxDistance)) {
            getTerrainBoundsWorld(_box);

            if (_box.isEmpty()) return null;

            if (!Number.isFinite(originY)) {
                originY = _box.max.y + 100;
            }

            if (!Number.isFinite(maxDistance)) {
                maxDistance =
                    Math.max(
                        10,
                        (_box.max.y - _box.min.y) + 200
                    );
            }
        }

        _origin.set(Number(x) || 0, originY, Number(z) || 0);
        _raycaster.set(_origin, _down);
        _raycaster.near = 0;
        _raycaster.far = Math.max(0.01, maxDistance);

        const hits = _raycaster.intersectObjects(meshes, recursive);

        for (const hit of hits) {
            if (!hit?.object || !Number.isFinite(hit.point?.y)) continue;

            if (hit.face?.normal) {
                _normal
                    .copy(hit.face.normal)
                    .transformDirection(hit.object.matrixWorld)
                    .normalize();
            } else {
                _normal.set(0, 1, 0);
            }

            if (_normal.y < minNormalY) continue;

            return {
                hit: true,
                object: hit.object,
                point: hit.point.clone(),
                normal: _normal.clone(),
                distance: hit.distance,
                faceIndex: hit.faceIndex ?? -1,
                slopeAngle:
                    THREE.MathUtils.radToDeg(
                        Math.acos(
                            THREE.MathUtils.clamp(
                                _normal.y,
                                -1,
                                1
                            )
                        )
                    ),
                terrain: getTerrain(),
                deformationVersion
            };
        }

        return null;
    }

    function getGroundInfo(
        position,
        {
            probeUp = 1,
            probeDown = 4,
            minNormalY = -1
        } = {}
    ) {
        if (!position) return null;

        const originY =
            Number(position.y || 0) +
            Math.max(0, Number(probeUp) || 0);

        const maxDistance =
            Math.max(
                0.01,
                Math.max(0, Number(probeUp) || 0) +
                Math.max(0.01, Number(probeDown) || 0.01)
            );

        return raycastDown(
            position.x,
            position.z,
            {
                originY,
                maxDistance,
                minNormalY
            }
        );
    }

    function getHeightAt(x, z, options = {}) {
        const hit = raycastDown(x, z, options);
        return hit ? hit.point.y : null;
    }

    function getNormalAt(x, z, options = {}) {
        const hit = raycastDown(x, z, options);
        return hit ? hit.normal : null;
    }

    function getSlopeAt(x, z, options = {}) {
        const hit = raycastDown(x, z, options);
        return hit ? hit.slopeAngle : null;
    }

    function notifyTerrainDeformed({
        terrain = window.terrain,
        vertices = null,
        region = null,
        reason = 'sculpt'
    } = {}) {
        if (!terrain) return false;

        registerTerrain(terrain);

        const meshes = getRaycastMeshes();

        for (const mesh of meshes) {
            const geometry = mesh.geometry;
            if (!geometry) continue;

            geometry.computeBoundingBox?.();
            geometry.computeBoundingSphere?.();
            mesh.updateWorldMatrix?.(true, false);
        }

        deformationVersion += 1;

        terrain.userData = terrain.userData || {};
        terrain.userData.terrainDeformationVersion = deformationVersion;
        terrain.userData.terrainCollisionDirty = false;

        window.dispatchEvent(
            new CustomEvent('sm:terrain-deformed', {
                detail: {
                    terrain,
                    meshes,
                    vertices,
                    region,
                    reason,
                    version: deformationVersion
                }
            })
        );

        return true;
    }

    function init() {
        if (initialized) {
            if (window.terrain) registerTerrain(window.terrain);
            return api;
        }

        initialized = true;

        window.addEventListener(
            'sm:terrain-created',
            event => {
                registerTerrain(
                    event.detail?.terrain ||
                    window.terrain
                );
            }
        );

        if (window.terrain) {
            registerTerrain(window.terrain);
        }

        return api;
    }

    const api = {
        init,
        registerTerrain,
        getTerrain,
        hasTerrain,
        getRaycastMeshes,
        getTerrainBoundsWorld,
        raycastDown,
        getGroundInfo,
        getHeightAt,
        getNormalAt,
        getSlopeAt,
        notifyTerrainDeformed,
        get deformationVersion() {
            return deformationVersion;
        }
    };

    NS.surfaceQuery = api;
    window.TerrainSurfaceQuery = api;

    init();
})();