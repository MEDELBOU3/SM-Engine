// engine/architecture/geometry/SMArchitecturalGeometry.js
(function (global) {
    'use strict';

    class SMArchitecturalGeometry {
        static _THREE() {
            if (!global.THREE) throw new Error('THREE is required.');
            return global.THREE;
        }

        static wallFrame(from, to, thickness, height, elevation = 0) {
            const THREE = this._THREE();
            const ax = from[0], az = from[1];
            const bx = to[0], bz = to[1];
            const dx = bx - ax;
            const dz = bz - az;
            const length = Math.hypot(dx, dz);
            const angle = Math.atan2(dz, dx);
            const center = new THREE.Vector3(
                (ax + bx) * 0.5,
                elevation + height * 0.5,
                (az + bz) * 0.5
            );

            return {
                length,
                angle,
                center,
                dir: new THREE.Vector3(
                    length > 0 ? dx / length : 1,
                    0,
                    length > 0 ? dz / length : 0
                ),
                normal: new THREE.Vector3(
                    length > 0 ? -dz / length : 0,
                    0,
                    length > 0 ? dx / length : 1
                ),
                thickness,
                height,
                elevation
            };
        }

        static createBox(width, height, depth) {
            const THREE = this._THREE();
            return new THREE.BoxGeometry(
                Math.max(0.001, width),
                Math.max(0.001, height),
                Math.max(0.001, depth)
            );
        }

        static createPolygonPrism(points, thickness = 0.18) {
            const THREE = this._THREE();
            if (!Array.isArray(points) || points.length < 3) return null;

            const shape = new THREE.Shape();
            shape.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i++) {
                shape.lineTo(points[i][0], points[i][1]);
            }
            shape.closePath();

            const geometry = new THREE.ExtrudeGeometry(shape, {
                depth: Math.max(0.001, thickness),
                bevelEnabled: false,
                steps: 1,
                curveSegments: 1
            });

            // ExtrudeGeometry is XY + depth Z. Rotate so XZ is plan and Y is height.
            geometry.rotateX(Math.PI * 0.5);
            geometry.computeVertexNormals();
            return geometry;
        }

        static pointOnWall(frame, distance, y = 0, lateral = 0) {
            const THREE = this._THREE();
            const startX = frame.center.x - frame.dir.x * frame.length * 0.5;
            const startZ = frame.center.z - frame.dir.z * frame.length * 0.5;
            return new THREE.Vector3(
                startX + frame.dir.x * distance + frame.normal.x * lateral,
                y,
                startZ + frame.dir.z * distance + frame.normal.z * lateral
            );
        }

        static orientAlongWall(object, frame) {
            object.rotation.y = -frame.angle;
            return object;
        }
    }

    global.SMArchitecturalGeometry = SMArchitecturalGeometry;
})(typeof window !== 'undefined' ? window : globalThis);
