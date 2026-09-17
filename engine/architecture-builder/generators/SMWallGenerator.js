// engine/architecture/generators/SMWallGenerator.js
(function (global) {
    'use strict';

    class SMWallGenerator {
        constructor(context) {
            this.context = context;
        }

        generate(wall, floor) {
            const THREE = global.THREE;
            const Geo = global.SMArchitecturalGeometry;
            const Layout = global.SMOpeningLayout;
            if (!THREE || !Geo || !Layout) {
                throw new Error('SMWallGenerator dependencies are missing.');
            }

            const group = new THREE.Group();
            group.name = wall.id;
            group.userData.smArchitectureType = 'wall';
            group.userData.smWallId = wall.id;
            group.userData.smFloorId = floor.id;

            const frame = Geo.wallFrame(
                wall.from,
                wall.to,
                wall.thickness,
                wall.height,
                floor.elevation + wall.elevation
            );

            const rectangles = Layout.buildRectangles(wall);
            const material = this.context.materials.resolve(
                wall.material,
                this.context.map.materials
            );

            for (let i = 0; i < rectangles.length; i++) {
                const rect = rectangles[i];
                const width = rect.x1 - rect.x0;
                const height = rect.y1 - rect.y0;
                if (width <= 0.001 || height <= 0.001) continue;

                const geometry = Geo.createBox(width, height, wall.thickness);
                global.SMArchitecturalUV?.repeatByWorldSize?.(
                    geometry,
                    width,
                    height,
                    this.context.options.wallUVTileMeters || 1
                );

                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = `${wall.id}:segment_${i}`;
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                const localCenter = (rect.x0 + rect.x1) * 0.5;
                const y = floor.elevation + wall.elevation + (rect.y0 + rect.y1) * 0.5;
                const pos = Geo.pointOnWall(frame, localCenter, y);

                mesh.position.copy(pos);
                Geo.orientAlongWall(mesh, frame);
                mesh.userData.smArchitectureType = 'wall-segment';
                mesh.userData.smWallId = wall.id;
                group.add(mesh);
            }

            return group;
        }
    }

    global.SMWallGenerator = SMWallGenerator;
})(typeof window !== 'undefined' ? window : globalThis);
