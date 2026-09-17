/**
 * SM Engine - MeshClusterManager
 * Classic non-module build.
 * Splits very large STATIC BufferGeometry meshes into independently cullable triangle clusters.
 * Do not use automatic clustering on SkinnedMesh, morph-target meshes or meshes that require intact vertex topology.
 */
class MeshClusterManager {
    constructor(scene, options = {}) {
        if (!scene) throw new Error("MeshClusterManager: scene is required.");
        this.scene = scene;
        this.options = {
            enabled: true,
            trianglesPerCluster: 30000,
            minimumTrianglesToCluster: 120000,
            preserveOriginal: true,
            hideOriginalAfterCluster: true,
            computeBounds: true,
            ...options
        };
        this.clusteredMeshes = new Map();
        this.stats = {
            clusteredSources: 0,
            clusters: 0,
            sourceTriangles: 0,
            activeClusterTriangles: 0
        };
    }

    canCluster(mesh) {
        if (!mesh?.isMesh || !mesh.geometry?.isBufferGeometry) return false;
        if (mesh.isSkinnedMesh) return false;
        if (mesh.morphTargetInfluences || mesh.geometry.morphAttributes && Object.keys(mesh.geometry.morphAttributes).length > 0) return false;
        if (Array.isArray(mesh.material)) return false;
        const triangles = this._countTriangles(mesh.geometry);
        return triangles >= this.options.minimumTrianglesToCluster;
    }

    clusterMesh(mesh, options = {}) {
        if (!this.options.enabled || !this.canCluster(mesh)) return null;
        if (this.clusteredMeshes.has(mesh.uuid)) return this.clusteredMeshes.get(mesh.uuid).group;
        const trianglesPerCluster = Math.max(1000, Math.floor(options.trianglesPerCluster || this.options.trianglesPerCluster));
        const sourceGeometry = mesh.geometry;
        const nonIndexed = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry.clone();
        const position = nonIndexed.getAttribute("position");
        if (!position || position.count < 3) {
            nonIndexed.dispose();
            return null;
        }
        const totalTriangles = Math.floor(position.count / 3);
        const group = new THREE.Group();
        group.name = `${mesh.name || "Mesh"}__SMClusters`;
        group.userData.__smClusterGroup = true;
        group.userData.sourceMeshUUID = mesh.uuid;
        group.matrixAutoUpdate = true;
        mesh.updateWorldMatrix(true, false);
        const parent = mesh.parent || this.scene;
        const worldMatrix = mesh.matrixWorld.clone();
        parent.updateWorldMatrix?.(true, false);
        const inverseParentWorld = new THREE.Matrix4().copy(parent.matrixWorld).invert();
        const localMatrix = new THREE.Matrix4().multiplyMatrices(inverseParentWorld, worldMatrix);
        localMatrix.decompose(group.position, group.quaternion, group.scale);
        const clusterMeshes = [];
        for (let startTriangle = 0; startTriangle < totalTriangles; startTriangle += trianglesPerCluster) {
            const endTriangle = Math.min(totalTriangles, startTriangle + trianglesPerCluster);
            const clusterGeometry = this._sliceGeometry(nonIndexed, startTriangle, endTriangle);
            if (!clusterGeometry) continue;
            if (this.options.computeBounds) {
                clusterGeometry.computeBoundingBox();
                clusterGeometry.computeBoundingSphere();
            }
            const cluster = new THREE.Mesh(clusterGeometry, mesh.material);
            cluster.name = `${mesh.name || "Mesh"}__cluster_${clusterMeshes.length}`;
            cluster.castShadow = mesh.castShadow;
            cluster.receiveShadow = mesh.receiveShadow;
            cluster.frustumCulled = true;
            cluster.renderOrder = mesh.renderOrder;
            cluster.layers.mask = mesh.layers.mask;
            cluster.userData.__smCluster = {
                sourceMeshUUID: mesh.uuid,
                clusterIndex: clusterMeshes.length,
                triangles: endTriangle - startTriangle
            };
            group.add(cluster);
            clusterMeshes.push(cluster);
        }
        nonIndexed.dispose();
        if (clusterMeshes.length <= 1) {
            for (const child of clusterMeshes) child.geometry.dispose();
            return null;
        }
        parent.add(group);
        const preserveOriginal = options.preserveOriginal ?? this.options.preserveOriginal;
        const hideOriginal = options.hideOriginalAfterCluster ?? this.options.hideOriginalAfterCluster;
        const record = {
            source: mesh,
            group,
            clusters: clusterMeshes,
            sourceParent: parent,
            sourceVisible: mesh.visible,
            preserveOriginal,
            totalTriangles
        };
        this.clusteredMeshes.set(mesh.uuid, record);
        if (hideOriginal) mesh.visible = false;
        if (!preserveOriginal && mesh.parent) mesh.parent.remove(mesh);
        this._refreshStats();
        return group;
    }

    _sliceGeometry(nonIndexedGeometry, startTriangle, endTriangle) {
        const startVertex = startTriangle * 3;
        const endVertex = endTriangle * 3;
        const geometry = new THREE.BufferGeometry();
        const attributeNames = Object.keys(nonIndexedGeometry.attributes);
        for (const name of attributeNames) {
            const attribute = nonIndexedGeometry.getAttribute(name);
            if (!attribute || attribute.isInterleavedBufferAttribute) continue;
            const itemSize = attribute.itemSize;
            const sourceArray = attribute.array;
            const ctor = sourceArray.constructor;
            const start = startVertex * itemSize;
            const end = Math.min(endVertex * itemSize, sourceArray.length);
            const sliced = new ctor(end - start);
            sliced.set(sourceArray.subarray(start, end));
            geometry.setAttribute(name, new THREE.BufferAttribute(sliced, itemSize, attribute.normalized));
        }
        if (!geometry.getAttribute("position")) {
            geometry.dispose();
            return null;
        }
        return geometry;
    }

    restoreMesh(mesh, disposeClusters = false) {
        if (!mesh) return false;
        const record = this.clusteredMeshes.get(mesh.uuid);
        if (!record) return false;
        if (!mesh.parent) record.sourceParent.add(mesh);
        mesh.visible = record.sourceVisible;
        if (record.group.parent) record.group.parent.remove(record.group);
        if (disposeClusters) {
            record.clusters.forEach(cluster => cluster.geometry?.dispose?.());
        }
        this.clusteredMeshes.delete(mesh.uuid);
        this._refreshStats();
        return true;
    }

    setClusterGroupEnabled(mesh, enabled) {
        const record = mesh ? this.clusteredMeshes.get(mesh.uuid) : null;
        if (!record) return false;
        record.group.visible = !!enabled;
        return true;
    }

    getRecord(mesh) {
        return mesh ? this.clusteredMeshes.get(mesh.uuid) || null : null;
    }

    _countTriangles(geometry) {
        if (!geometry) return 0;
        if (geometry.index) return Math.floor(geometry.index.count / 3);
        const position = geometry.getAttribute("position");
        return position ? Math.floor(position.count / 3) : 0;
    }

    _refreshStats() {
        let clusters = 0;
        let sourceTriangles = 0;
        let activeClusterTriangles = 0;
        for (const record of this.clusteredMeshes.values()) {
            clusters += record.clusters.length;
            sourceTriangles += record.totalTriangles;
            if (record.group.visible) {
                for (const cluster of record.clusters) {
                    if (cluster.visible) activeClusterTriangles += cluster.userData.__smCluster?.triangles || 0;
                }
            }
        }
        this.stats.clusteredSources = this.clusteredMeshes.size;
        this.stats.clusters = clusters;
        this.stats.sourceTriangles = sourceTriangles;
        this.stats.activeClusterTriangles = activeClusterTriangles;
    }

    update() {
        this._refreshStats();
        return this.stats;
    }

    getStats() {
        return { ...this.stats };
    }

    destroy({ restoreSources = true, disposeClusters = true } = {}) {
        const records = Array.from(this.clusteredMeshes.values());
        for (const record of records) {
            if (restoreSources) {
                if (!record.source.parent) record.sourceParent.add(record.source);
                record.source.visible = record.sourceVisible;
            }
            if (record.group.parent) record.group.parent.remove(record.group);
            if (disposeClusters) record.clusters.forEach(cluster => cluster.geometry?.dispose?.());
        }
        this.clusteredMeshes.clear();
        this._refreshStats();
    }
}

window.MeshClusterManager = MeshClusterManager;