// engine/architecture/generators/SMRoofGenerator.js
(function (global) {
    'use strict';

    class SMRoofGenerator {
        constructor(context) {
            this.context = context;
        }

        _resolveFootprint(map) {
            if (map.roof?.footprint?.length >= 3) return map.roof.footprint;
            const topFloor = map.floors?.[map.floors.length - 1];
            if (topFloor?.footprint?.length >= 3) return topFloor.footprint;

            const points = [];
            for (const wall of topFloor?.walls || []) {
                points.push(wall.from, wall.to);
            }
            if (!points.length) return [];

            const xs = points.map((p) => p[0]);
            const zs = points.map((p) => p[1]);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minZ = Math.min(...zs), maxZ = Math.max(...zs);
            return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
        }

        _topElevation(map) {
            const topFloor = map.floors?.[map.floors.length - 1];
            if (!topFloor) return 0;

            let wallHeight = map.defaults.wallHeight;
            for (const wall of topFloor.walls || []) {
                wallHeight = Math.max(wallHeight, wall.height + wall.elevation);
            }
            return topFloor.elevation + wallHeight;
        }

        _flat(roof, footprint, elevation) {
            const floorGen = new global.SMFloorGenerator(this.context);
            const mesh = floorGen.generateFromPolygon(footprint, {
                thickness: roof.thickness,
                material: roof.material,
                elevation,
                name: 'Roof:flat',
                type: 'roof'
            });
            return mesh;
        }

        _gable(roof, footprint, elevation) {
            const THREE = global.THREE;
            if (footprint.length !== 4) return this._flat(roof, footprint, elevation);

            const xs = footprint.map((p) => p[0]);
            const zs = footprint.map((p) => p[1]);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minZ = Math.min(...zs), maxZ = Math.max(...zs);
            const width = maxX - minX;
            const depth = maxZ - minZ;
            const ridgeAlongX = width >= depth;
            const group = new THREE.Group();
            group.name = 'Roof:gable';

            const material = this.context.materials.resolve(
                roof.material,
                this.context.map.materials
            );

            const halfSpan = ridgeAlongX ? depth * 0.5 : width * 0.5;
            const roofHeight = Math.max(0.01, roof.height);
            const slopeLength = Math.hypot(halfSpan + roof.overhang, roofHeight);
            const pitch = Math.atan2(roofHeight, halfSpan + roof.overhang);

            for (const side of [-1, 1]) {
                const panelWidth = ridgeAlongX ? width + roof.overhang * 2 : depth + roof.overhang * 2;
                const panel = new THREE.Mesh(
                    new THREE.BoxGeometry(panelWidth, roof.thickness, slopeLength),
                    material
                );
                panel.name = `Roof:gable:${side < 0 ? 'A' : 'B'}`;

                if (ridgeAlongX) {
                    panel.rotation.x = side * pitch;
                    panel.position.set(
                        (minX + maxX) * 0.5,
                        elevation + roofHeight * 0.5,
                        (minZ + maxZ) * 0.5 + side * halfSpan * 0.5
                    );
                } else {
                    panel.rotation.z = -side * pitch;
                    panel.rotation.y = Math.PI * 0.5;
                    panel.position.set(
                        (minX + maxX) * 0.5 + side * halfSpan * 0.5,
                        elevation + roofHeight * 0.5,
                        (minZ + maxZ) * 0.5
                    );
                }

                panel.castShadow = true;
                panel.receiveShadow = true;
                panel.userData.smArchitectureType = 'roof-panel';
                group.add(panel);
            }

            return group;
        }

        generate(map) {
            const THREE = global.THREE;
            const roof = map.roof;
            if (!roof?.enabled) return null;

            const footprint = this._resolveFootprint(map);
            if (footprint.length < 3) return null;

            const elevation = this._topElevation(map);
            let object;

            switch (String(roof.type).toLowerCase()) {
                case 'gable':
                    object = this._gable(roof, footprint, elevation);
                    break;
                case 'hip':
                    // Conservative fallback: current v1 uses a flat structural slab for
                    // arbitrary hip polygons; a dedicated hip tessellator can replace it later.
                    object = this._flat(roof, footprint, elevation);
                    object.userData.smRequestedRoofType = 'hip';
                    break;
                case 'flat':
                default:
                    object = this._flat(roof, footprint, elevation);
                    break;
            }

            if (object) {
                object.userData = object.userData || {};
                object.userData.smArchitectureType = 'roof';
                object.userData.smRoofType = roof.type;
            }
            return object;
        }
    }

    global.SMRoofGenerator = SMRoofGenerator;
})(typeof window !== 'undefined' ? window : globalThis);
