// engine/architecture/generators/SMBuildingGenerator.js
(function (global) {
    'use strict';

    class SMBuildingGenerator {
        constructor(options = {}) {
            if (!global.THREE) throw new Error('THREE is required by SMBuildingGenerator.');

            this.options = {
                generateWalls: true,
                generateFloors: true,
                generateRooms: true,
                generateDoors: true,
                generateDoorLeaves: true,
                generateWindows: true,
                generateColumns: true,
                generateStairs: true,
                generateRoof: true,
                optimize: false,
                markStatic: false,
                wallUVTileMeters: 1,
                ...options
            };

            this.materials = options.materialResolver ||
                new global.SMBuildingMaterialResolver(options);
            this.current = null;
            this.lastMap = null;
            this.lastGraph = null;
        }

        _context(map) {
            return {
                map,
                options: this.options,
                materials: this.materials,
                generator: this
            };
        }

        _makeFloorGroup(floor) {
            const THREE = global.THREE;
            const group = new THREE.Group();
            group.name = floor.name || floor.id;
            group.userData.smArchitectureType = 'floor-group';
            group.userData.smFloorId = floor.id;
            group.userData.smFloorLevel = floor.level;
            group.userData.smFloorElevation = floor.elevation;
            return group;
        }

        generate(input, options = {}) {
            const map = input?.format === 'SM_BUILDING_MAP'
                ? input
                : global.SMBuildingMapParser.parse(input);

            const THREE = global.THREE;
            const root = new THREE.Group();
            root.name = map.building.name;
            root.userData.smArchitectureType = 'building';
            root.userData.smBuildingMapVersion = map.version;
            root.userData.smBuildingId = map.building.id;
            root.userData.smGeneratedBuilding = true;

            const graph = new global.SMBuildingGraph(map);
            const context = this._context(map);
            const wallGen = new global.SMWallGenerator(context);
            const floorGen = new global.SMFloorGenerator(context);
            const roomGen = new global.SMRoomGenerator(context);
            const doorGen = new global.SMDoorGenerator(context);
            const windowGen = new global.SMWindowGenerator(context);
            const columnGen = new global.SMColumnGenerator(context);
            const stairGen = new global.SMStairGenerator(context);
            const roofGen = new global.SMRoofGenerator(context);

            const run = { ...this.options, ...options };

            for (const floor of map.floors) {
                const floorGroup = this._makeFloorGroup(floor);
                root.add(floorGroup);

                if (run.generateFloors !== false) {
                    floorGroup.add(floorGen.generate(floor));
                }

                if (run.generateRooms !== false) {
                    for (const room of floor.rooms || []) {
                        floorGroup.add(roomGen.generate(room, floor));
                    }
                }

                if (run.generateWalls !== false) {
                    const wallsGroup = new THREE.Group();
                    wallsGroup.name = `${floor.id}:walls`;
                    floorGroup.add(wallsGroup);

                    for (const wall of floor.walls || []) {
                        wallsGroup.add(wallGen.generate(wall, floor));
                    }
                }

                if (run.generateDoors !== false || run.generateWindows !== false) {
                    const openingsGroup = new THREE.Group();
                    openingsGroup.name = `${floor.id}:openings`;
                    floorGroup.add(openingsGroup);

                    for (const wall of floor.walls || []) {
                        if (run.generateDoors !== false) {
                            for (const door of wall.doors || []) {
                                openingsGroup.add(doorGen.generate(door, wall, floor));
                            }
                        }

                        if (run.generateWindows !== false) {
                            for (const windowDef of wall.windows || []) {
                                openingsGroup.add(windowGen.generate(windowDef, wall, floor));
                            }
                        }
                    }
                }

                if (run.generateColumns !== false) {
                    const columnsGroup = new THREE.Group();
                    columnsGroup.name = `${floor.id}:columns`;
                    floorGroup.add(columnsGroup);
                    for (const column of floor.columns || []) {
                        columnsGroup.add(columnGen.generate(column, floor));
                    }
                }

                if (run.generateStairs !== false) {
                    const stairsGroup = new THREE.Group();
                    stairsGroup.name = `${floor.id}:stairs`;
                    floorGroup.add(stairsGroup);
                    for (const stair of floor.stairs || []) {
                        stairsGroup.add(stairGen.generate(stair, floor));
                    }
                }
            }

            if (run.generateRoof !== false) {
                const roof = roofGen.generate(map);
                if (roof) root.add(roof);
            }

            root.updateMatrixWorld(true);

            if (run.optimize === true) {
                global.SMBuildingMeshOptimizer?.mergeByMaterial?.(root);
            }
            if (run.markStatic === true) {
                global.SMBuildingMeshOptimizer?.markStatic?.(root, true);
            }

            root.userData.smBuildingStats = {
                ...graph.getStats(),
                meshes: global.SMBuildingMeshOptimizer?.collectMeshes?.(root).length || 0
            };

            this.current = root;
            this.lastMap = map;
            this.lastGraph = graph;

            try {
                global.dispatchEvent?.(
                    new CustomEvent('sm-architecture-building-generated', {
                        detail: {
                            root,
                            map,
                            graph,
                            stats: root.userData.smBuildingStats
                        }
                    })
                );
            } catch (_) {}

            return root;
        }

        regenerate(input = this.lastMap, options = {}) {
            const previous = this.current;
            const parent = previous?.parent || null;
            const index = parent ? parent.children.indexOf(previous) : -1;

            if (previous) {
                this.disposeObject(previous);
                parent?.remove(previous);
            }

            const next = this.generate(input, options);
            if (parent) {
                parent.add(next);
                if (index >= 0 && index < parent.children.length - 1) {
                    parent.children.splice(parent.children.indexOf(next), 1);
                    parent.children.splice(index, 0, next);
                }
            }
            return next;
        }

        disposeObject(root) {
            const seenMaterials = new Set();
            root?.traverse?.((object) => {
                if (!object?.isMesh) return;
                object.geometry?.dispose?.();
                const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];
                for (const material of materials) {
                    if (!material || seenMaterials.has(material)) continue;
                    // Materials owned by the shared resolver are not disposed here.
                    if (!material.userData?.smArchitectureMaterial) {
                        material.dispose?.();
                    }
                    seenMaterials.add(material);
                }
            });
        }

        addToScene(input, scene = global.scene, options = {}) {
            if (!scene?.add) throw new Error('A THREE.Scene is required.');
            const root = this.generate(input, options);
            scene.add(root);

            if (typeof global.addObjectToScene === 'function') {
                // Avoid double-add: use editor helper only when it does not already own the scene.
                if (root.parent !== scene) {
                    global.addObjectToScene(root, root.name);
                } else {
                    global.updateHierarchy?.();
                }
            } else {
                global.updateHierarchy?.();
            }

            return root;
        }
    }

    global.SMBuildingGenerator = SMBuildingGenerator;
})(typeof window !== 'undefined' ? window : globalThis);
