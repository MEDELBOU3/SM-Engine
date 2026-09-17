// engine/architecture/generators/SMWindowGenerator.js
(function (global) {
    'use strict';

    class SMWindowGenerator {
        constructor(context) {
            this.context = context;
        }

        generate(windowDef, wall, floor) {
            const THREE = global.THREE;
            const Geo = global.SMArchitecturalGeometry;
            const group = new THREE.Group();
            group.name = windowDef.id;
            group.userData.smArchitectureType = 'window';
            group.userData.smWindowId = windowDef.id;
            group.userData.smWallId = wall.id;

            const frame = Geo.wallFrame(
                wall.from,
                wall.to,
                wall.thickness,
                wall.height,
                floor.elevation + wall.elevation
            );

            const frameMaterial = this.context.materials.resolve(
                windowDef.frameMaterial || 'windowFrame',
                this.context.map.materials
            );
            const glassMaterial = this.context.materials.resolve(
                windowDef.glassMaterial || 'window',
                this.context.map.materials
            );

            const border = Math.min(0.07, windowDef.width * 0.07, windowDef.height * 0.07);
            const depth = wall.thickness * 1.05;
            const baseY = floor.elevation + wall.elevation + windowDef.sillHeight;

            const piece = (name, width, height, xOffset, y, material) => {
                const mesh = new THREE.Mesh(
                    Geo.createBox(width, height, depth),
                    material
                );
                mesh.name = `${windowDef.id}:${name}`;
                const pos = Geo.pointOnWall(frame, windowDef.offset + xOffset, y);
                mesh.position.copy(pos);
                Geo.orientAlongWall(mesh, frame);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                group.add(mesh);
            };

            piece('left', border, windowDef.height, -windowDef.width * 0.5 - border * 0.5, baseY + windowDef.height * 0.5, frameMaterial);
            piece('right', border, windowDef.height, windowDef.width * 0.5 + border * 0.5, baseY + windowDef.height * 0.5, frameMaterial);
            piece('top', windowDef.width + border * 2, border, 0, baseY + windowDef.height + border * 0.5, frameMaterial);
            piece('bottom', windowDef.width + border * 2, border, 0, baseY - border * 0.5, frameMaterial);

            const glassThickness = Math.min(0.018, wall.thickness * 0.2);
            const glass = new THREE.Mesh(
                Geo.createBox(Math.max(0.01, windowDef.width - 0.02), Math.max(0.01, windowDef.height - 0.02), glassThickness),
                glassMaterial
            );
            glass.name = `${windowDef.id}:glass`;
            const pos = Geo.pointOnWall(frame, windowDef.offset, baseY + windowDef.height * 0.5);
            glass.position.copy(pos);
            Geo.orientAlongWall(glass, frame);
            glass.renderOrder = 1;
            glass.userData.smWindowGlass = true;
            group.add(glass);

            return group;
        }
    }

    global.SMWindowGenerator = SMWindowGenerator;
})(typeof window !== 'undefined' ? window : globalThis);
