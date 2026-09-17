// engine/architecture/generators/SMFloorGenerator.js
(function (global) {
    'use strict';

    class SMFloorGenerator {
        constructor(context) {
            this.context = context;
        }

        generateFromPolygon(points, options = {}) {
            const THREE = global.THREE;
            const Geo = global.SMArchitecturalGeometry;
            if (!THREE || !Geo || !Array.isArray(points) || points.length < 3) return null;

            const thickness = Math.max(0.001, Number(options.thickness || 0.18));
            const geometry = Geo.createPolygonPrism(points, thickness);
            if (!geometry) return null;

            const material = this.context.materials.resolve(
                options.material || 'floor',
                this.context.map.materials
            );

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = options.name || 'FloorSlab';
            mesh.position.y = Number(options.elevation || 0);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.smArchitectureType = options.type || 'floor';
            mesh.userData.smFloorId = options.floorId || null;
            mesh.userData.smRoomId = options.roomId || null;
            return mesh;
        }

        generate(floor) {
            const THREE = global.THREE;
            const group = new THREE.Group();
            group.name = `${floor.id}:slabs`;

            if (floor.footprint?.length >= 3) {
                const slab = this.generateFromPolygon(floor.footprint, {
                    thickness: this.context.map.defaults.floorThickness,
                    material: 'floor',
                    elevation: floor.elevation,
                    floorId: floor.id,
                    name: `${floor.id}:footprint`
                });
                if (slab) group.add(slab);
            }

            for (const room of floor.rooms || []) {
                if (!room.generateFloor || room.polygon.length < 3) continue;
                const slab = this.generateFromPolygon(room.polygon, {
                    thickness: room.floorThickness,
                    material: room.floorMaterial,
                    elevation: floor.elevation,
                    floorId: floor.id,
                    roomId: room.id,
                    name: `${room.id}:floor`
                });
                if (slab) group.add(slab);
            }

            return group;
        }
    }

    global.SMFloorGenerator = SMFloorGenerator;
})(typeof window !== 'undefined' ? window : globalThis);
