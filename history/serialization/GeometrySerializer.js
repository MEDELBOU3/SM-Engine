(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class GeometrySerializer {
        static serialize(geometry) {
            if (!geometry) return null;

            // Pass-through if already serialized
            if (geometry.positions) {
                return {
                    positions: Array.from(geometry.positions),
                    index: geometry.index ? Array.from(geometry.index) : null,
                    uv: geometry.uv ? Array.from(geometry.uv) : null,
                    topology: geometry.topology ? JSON.parse(JSON.stringify(geometry.topology)) : null,
                    smoothAngle: geometry.smoothAngle
                };
            }

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

        static deserialize(data, targetObject = null) {
            if (!data || !data.positions || typeof THREE === 'undefined') return null;

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

                if (targetObject) {
                    const oldGeo = targetObject.geometry;
                    targetObject.geometry = geometry;
                    if (oldGeo && oldGeo !== geometry) {
                        try { oldGeo.dispose(); } catch (e) { }
                    }
                }

                return geometry;
            } catch (e) {
                console.warn("[GeometrySerializer] Deserialization error:", e);
                return null;
            }
        }
    }

    H.GeometrySerializer = GeometrySerializer;
})();