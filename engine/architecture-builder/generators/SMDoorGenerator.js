// engine/architecture/generators/SMDoorGenerator.js
(function (global) {
    'use strict';

    class SMDoorGenerator {
        constructor(context) {
            this.context = context;
        }

        generate(door, wall, floor) {
            const THREE = global.THREE;
            const Geo = global.SMArchitecturalGeometry;
            const group = new THREE.Group();
            group.name = door.id;
            group.userData.smArchitectureType = 'door';
            group.userData.smDoorId = door.id;
            group.userData.smWallId = wall.id;

            const frame = Geo.wallFrame(
                wall.from,
                wall.to,
                wall.thickness,
                wall.height,
                floor.elevation + wall.elevation
            );

            const frameMaterial = this.context.materials.resolve(
                door.frameMaterial || 'doorFrame',
                this.context.map.materials
            );
            const leafMaterial = this.context.materials.resolve(
                door.material || 'door',
                this.context.map.materials
            );

            const jamb = Math.min(0.08, door.width * 0.08);
            const depth = wall.thickness * 1.08;
            const baseY = floor.elevation + wall.elevation;

            const makePiece = (name, w, h, xOffset, yCenter, mat) => {
                const mesh = new THREE.Mesh(
                    Geo.createBox(w, h, depth),
                    mat
                );
                mesh.name = `${door.id}:${name}`;
                const pos = Geo.pointOnWall(frame, door.offset + xOffset, yCenter);
                mesh.position.copy(pos);
                Geo.orientAlongWall(mesh, frame);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                group.add(mesh);
                return mesh;
            };

            makePiece('jamb_left', jamb, door.height, -door.width * 0.5 - jamb * 0.5, baseY + door.height * 0.5, frameMaterial);
            makePiece('jamb_right', jamb, door.height, door.width * 0.5 + jamb * 0.5, baseY + door.height * 0.5, frameMaterial);
            makePiece('header', door.width + jamb * 2, jamb, 0, baseY + door.height + jamb * 0.5, frameMaterial);

            if (this.context.options.generateDoorLeaves !== false) {
                const leafThickness = Math.min(0.06, wall.thickness * 0.45);
                const leaf = new THREE.Mesh(
                    Geo.createBox(Math.max(0.01, door.width - 0.04), Math.max(0.01, door.height - 0.03), leafThickness),
                    leafMaterial
                );
                leaf.name = `${door.id}:leaf`;
                const lateral = wall.thickness * 0.5 - leafThickness * 0.5;
                const pos = Geo.pointOnWall(frame, door.offset, baseY + door.height * 0.5, lateral);
                leaf.position.copy(pos);
                Geo.orientAlongWall(leaf, frame);
                leaf.castShadow = true;
                leaf.receiveShadow = true;
                leaf.userData.smDoorLeaf = true;
                group.add(leaf);
            }

            return group;
        }
    }

    global.SMDoorGenerator = SMDoorGenerator;
})(typeof window !== 'undefined' ? window : globalThis);
