(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};
    const BaseCommand = H.BaseCommand || window.BaseCommand;

    class GeometryCommand extends BaseCommand {
        constructor(object, beforeGeometry, afterGeometry, name = null) {
            // Handle flexible 3-arg signature: (object, beforeGeometry, "Operation Name")
            if (typeof afterGeometry === 'string' && !name) {
                name = afterGeometry;
                afterGeometry = null;
            }

            const objName = object?.name || 'Mesh';
            super(name || `Edit Mesh: ${objName}`, 'geometry');

            this.object = object;
            this.objectUuid = object?.uuid;
            this.objectName = object?.name;

            // Normalize and capture both states (supports live geometries or already-serialized snapshots)
            this.before = this.serializeGeometry(beforeGeometry);
            this.after = this.serializeGeometry(afterGeometry || object?.geometry);

            this.byteSize = ((this.before?.positions?.length || 0) + (this.after?.positions?.length || 0)) * 4;
        }

        resolveObject() {
            if (this.object && this.object.parent) return this.object;

            const scene = window.scene || window.historyManager?.scene;
            if (!scene) return this.object;

            if (this.objectUuid) {
                const found = scene.getObjectByProperty('uuid', this.objectUuid);
                if (found) {
                    this.object = found;
                    return found;
                }
            }

            if (this.objectName) {
                const found = scene.getObjectByName(this.objectName);
                if (found) {
                    this.object = found;
                    return found;
                }
            }

            return this.object;
        }

        serializeGeometry(geometry) {
            if (!geometry) return null;

            // 1. If it is already a serialized snapshot from the modeling system
            if (geometry.positions && (Array.isArray(geometry.positions) || ArrayBuffer.isView(geometry.positions))) {
                return {
                    positions: Array.from(geometry.positions),
                    index: geometry.index ? Array.from(geometry.index) : null,
                    uv: geometry.uv ? Array.from(geometry.uv) : null,
                    topology: geometry.topology
                        ? JSON.parse(JSON.stringify(geometry.topology))
                        : (geometry.editMeshTopology ? JSON.parse(JSON.stringify(geometry.editMeshTopology)) : null),
                    smoothAngle: geometry.smoothAngle
                };
            }

            // 2. If it is a live THREE.BufferGeometry
            if (!geometry.attributes || !geometry.attributes.position) return null;

            const serialized = {
                positions: Array.from(geometry.attributes.position.array),
                index: geometry.index ? Array.from(geometry.index.array) : null,
                topology: geometry.userData?.editMeshTopology
                    ? JSON.parse(JSON.stringify(geometry.userData.editMeshTopology))
                    : null,
                smoothAngle: geometry.userData?.smoothAngle
            };

            if (geometry.attributes.uv) {
                serialized.uv = Array.from(geometry.attributes.uv.array);
            }

            return serialized;
        }

        restore(data) {
            const object = this.resolveObject();
            if (!object || !data || !data.positions || typeof THREE === 'undefined') return false;

            try {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));

                if (data.index && data.index.length) {
                    geometry.setIndex(data.index);
                }

                if (data.uv && data.uv.length) {
                    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
                }

                if (data.topology) {
                    geometry.userData.editMeshTopology = JSON.parse(JSON.stringify(data.topology));
                }

                if (data.smoothAngle !== undefined) {
                    geometry.userData.smoothAngle = data.smoothAngle;
                }

                geometry.computeVertexNormals();
                geometry.computeBoundingBox();
                geometry.computeBoundingSphere();

                const oldGeometry = object.geometry;
                object.geometry = geometry;

                if (oldGeometry && oldGeometry !== geometry) {
                    try { oldGeometry.dispose(); } catch (e) { }
                }

                this.refreshModelingState(object);
                return true;
            } catch (e) {
                console.warn("[GeometryCommand] Restore failed:", e);
                return false;
            }
        }

        refreshModelingState(object) {
            try {
                const sys = window.UnifiedModelingSystem;
                if (!sys || !sys.isEditMode || sys.activeMesh !== object) return;

                if (typeof sys.refreshEditableMeshFromLiveGeometry === 'function') {
                    sys.refreshEditableMeshFromLiveGeometry();
                } else if (typeof sys.rebuildAllHelpers === 'function') {
                    sys.rebuildAllHelpers();
                }
            } catch (e) {
                console.warn("[GeometryCommand] Modeling refresh failed:", e);
            }
        }

        execute() {
            this.restore(this.after);
        }

        undo() {
            this.restore(this.before);
        }

        redo() {
            this.restore(this.after);
        }

        dispose() {
            this.before = null;
            this.after = null;
            this.object = null;
        }
    }

    H.GeometryCommand = GeometryCommand;
})();