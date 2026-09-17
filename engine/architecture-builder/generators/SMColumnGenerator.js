// engine/architecture/generators/SMColumnGenerator.js
(function (global) {
    'use strict';

    class SMColumnGenerator {
        constructor(context) {
            this.context = context;
        }

        generate(column, floor) {
            const THREE = global.THREE;
            const material = this.context.materials.resolve(
                column.material,
                this.context.map.materials
            );

            let geometry;
            if (column.shape === 'square' || column.shape === 'rect' || column.shape === 'rectangle') {
                geometry = new THREE.BoxGeometry(column.width, column.height, column.depth);
            } else {
                geometry = new THREE.CylinderGeometry(
                    column.radius,
                    column.radius,
                    column.height,
                    column.segments
                );
            }

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = column.id;
            mesh.position.set(
                column.position[0],
                floor.elevation + column.elevation + column.height * 0.5,
                column.position[1]
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.smArchitectureType = 'column';
            mesh.userData.smColumnId = column.id;
            mesh.userData.smFloorId = floor.id;
            return mesh;
        }
    }

    global.SMColumnGenerator = SMColumnGenerator;
})(typeof window !== 'undefined' ? window : globalThis);
