// engine/architecture/geometry/SMBuildingMeshOptimizer.js
(function (global) {
    'use strict';

    class SMBuildingMeshOptimizer {
        static collectMeshes(root) {
            const meshes = [];
            root?.traverse?.((object) => {
                if (object?.isMesh) meshes.push(object);
            });
            return meshes;
        }

        static markStatic(root, value = true) {
            root?.traverse?.((object) => {
                if (!object) return;
                object.userData = object.userData || {};
                object.userData.smStaticGeometry = !!value;
                if (object.isMesh) {
                    object.matrixAutoUpdate = !value;
                    if (value) object.updateMatrix();
                }
            });
            return root;
        }

        static mergeByMaterial(root, options = {}) {
            const THREE = global.THREE;
            const utils = THREE?.BufferGeometryUtils || global.BufferGeometryUtils;
            if (!utils?.mergeGeometries && !utils?.mergeBufferGeometries) {
                return { merged: 0, skipped: true, reason: 'BufferGeometryUtils unavailable' };
            }

            const mergeFn = utils.mergeGeometries || utils.mergeBufferGeometries;
            const meshes = this.collectMeshes(root).filter((m) => m.geometry && !m.isSkinnedMesh);
            const groups = new Map();

            for (const mesh of meshes) {
                const material = mesh.material;
                if (Array.isArray(material)) continue;
                const key = material?.uuid || 'no-material';
                if (!groups.has(key)) groups.set(key, { material, meshes: [] });
                groups.get(key).meshes.push(mesh);
            }

            let merged = 0;
            for (const group of groups.values()) {
                if (group.meshes.length < 2) continue;

                const geometries = [];
                for (const mesh of group.meshes) {
                    mesh.updateMatrixWorld(true);
                    const g = mesh.geometry.clone();
                    g.applyMatrix4(mesh.matrixWorld);
                    geometries.push(g);
                }

                const mergedGeometry = mergeFn(geometries, false);
                geometries.forEach((g) => g.dispose?.());
                if (!mergedGeometry) continue;

                const mergedMesh = new THREE.Mesh(mergedGeometry, group.material);
                mergedMesh.name = options.name || 'SMArchitectureMerged';
                mergedMesh.castShadow = true;
                mergedMesh.receiveShadow = true;
                mergedMesh.userData.smArchitectureMerged = true;

                const parent = group.meshes[0].parent || root;
                parent.add(mergedMesh);
                group.meshes.forEach((mesh) => {
                    mesh.parent?.remove(mesh);
                    mesh.geometry?.dispose?.();
                });
                merged++;
            }

            return { merged, skipped: false };
        }
    }

    global.SMBuildingMeshOptimizer = SMBuildingMeshOptimizer;
})(typeof window !== 'undefined' ? window : globalThis);
