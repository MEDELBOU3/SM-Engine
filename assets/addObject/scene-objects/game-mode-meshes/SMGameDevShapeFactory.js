// ============================================================================
// assets/addObject/scene-objects/game-mode-meshes/SMGameDevShapeFactory.js
// GAME_DEV shapes use the same wall grid material as grid-materials-obstacles.
// ============================================================================
(function (global) {
    "use strict";

    if (global.SMGameDevShapeFactory) return;

    function materials() {
        if (!global.SMShapeMaterialLibrary) {
            throw new Error(
                "[SMGameDevShapeFactory] " +
                "SMShapeMaterialLibrary is not loaded."
            );
        }

        return global.SMShapeMaterialLibrary;
    }

    function createBoxGeometry(
        width,
        height,
        depth
    ) {
        if (
            typeof global.createBoxWithCustomUVs ===
            "function"
        ) {
            return global.createBoxWithCustomUVs(
                width,
                height,
                depth
            );
        }

        return new THREE.BoxGeometry(
            width,
            height,
            depth
        );
    }

    function tag(
        object,
        type,
        label
    ) {
        object.name =
            label || type;

        object.userData = {
            ...(object.userData || {}),
            selectable: true,
            isSelectableRoot: true,
            isGameDevShape: true,
            isBlockout: true,
            primitiveType: type,
            workspaceOnly: "GAME_DEV",
            collidable: true
        };

        object.castShadow = true;
        object.receiveShadow = true;

        return object;
    }

    function addToScene(
        object,
        label
    ) {
        if (!object) return null;

        if (
            typeof global.addObjectToScene ===
            "function"
        ) {
            global.addObjectToScene(
                object,
                label ||
                object.name
            );
        } else {
            global.scene?.add?.(
                object
            );
        }

        global.updateHierarchy?.();

        return object;
    }

    function createBox(
        options = {}
    ) {
        const width =
            Number(options.width) || 4;

        const height =
            Number(options.height) || 3;

        const depth =
            Number(options.depth) || 4;

        const mesh =
            new THREE.Mesh(
                createBoxGeometry(
                    width,
                    height,
                    depth
                ),
                materials()
                    .materialForDimensions(
                        width,
                        height,
                        depth
                    )
            );

        mesh.position.set(
            Number(options.x) || 0,
            (Number(options.y) || 0) +
                height * 0.5,
            Number(options.z) || 0
        );

        return tag(
            mesh,
            "blockout_box",
            options.label ||
            "Blockout Box"
        );
    }

    function createFloor(
        options = {}
    ) {
        const width =
            Number(options.width) || 8;

        const height =
            Math.max(
                0.05,
                Number(options.height) ||
                0.25
            );

        const depth =
            Number(options.depth) || 8;

        /*
         * This is a USER-CREATED shape.
         * It intentionally uses the wall-grid material,
         * NOT the special scene floor material.
         */
        const mesh =
            new THREE.Mesh(
                createBoxGeometry(
                    width,
                    height,
                    depth
                ),
                materials()
                    .materialForDimensions(
                        width,
                        height,
                        depth
                    )
            );

        mesh.position.set(
            Number(options.x) || 0,
            (Number(options.y) || 0) +
                height * 0.5,
            Number(options.z) || 0
        );

        return tag(
            mesh,
            "blockout_floor",
            options.label ||
            "Blockout Floor"
        );
    }

    function createWall(
        options = {}
    ) {
        const width =
            Number(options.width) || 6;

        const height =
            Number(options.height) || 3;

        const depth =
            Math.max(
                0.05,
                Number(
                    options.thickness
                ) || 0.3
            );

        const mesh =
            new THREE.Mesh(
                createBoxGeometry(
                    width,
                    height,
                    depth
                ),
                materials()
                    .materialForDimensions(
                        width,
                        height,
                        depth
                    )
            );

        mesh.position.set(
            Number(options.x) || 0,
            (Number(options.y) || 0) +
                height * 0.5,
            Number(options.z) || 0
        );

        return tag(
            mesh,
            "blockout_wall",
            options.label ||
            "Blockout Wall"
        );
    }

    function createRampGeometry(
        width,
        height,
        depth
    ) {
        /*
         * Six vertices, five surfaces.
         * Duplicate vertices per triangle so UV mapping stays predictable.
         */
        const raw = [
            // bottom
            [-width/2,0,-depth/2, 0,0],
            [ width/2,0,-depth/2, 1,0],
            [ width/2,0, depth/2, 1,1],
            [-width/2,0,-depth/2, 0,0],
            [ width/2,0, depth/2, 1,1],
            [-width/2,0, depth/2, 0,1],

            // slope
            [-width/2,0,-depth/2, 0,0],
            [ width/2,0,-depth/2, 1,0],
            [ width/2,height,depth/2, 1,1],
            [-width/2,0,-depth/2, 0,0],
            [ width/2,height,depth/2, 1,1],
            [-width/2,height,depth/2, 0,1],

            // back
            [-width/2,0,depth/2, 0,0],
            [ width/2,0,depth/2, 1,0],
            [ width/2,height,depth/2, 1,1],
            [-width/2,0,depth/2, 0,0],
            [ width/2,height,depth/2, 1,1],
            [-width/2,height,depth/2, 0,1],

            // left
            [-width/2,0,-depth/2, 0,0],
            [-width/2,0, depth/2, 1,0],
            [-width/2,height,depth/2, 1,1],

            // right
            [width/2,0,-depth/2, 0,0],
            [width/2,height,depth/2, 1,1],
            [width/2,0,depth/2, 1,0]
        ];

        const positions =
            new Float32Array(
                raw.length * 3
            );

        const uvs =
            new Float32Array(
                raw.length * 2
            );

        raw.forEach(
            (v, i) => {
                positions[i * 3] =
                    v[0];

                positions[i * 3 + 1] =
                    v[1];

                positions[i * 3 + 2] =
                    v[2];

                uvs[i * 2] =
                    v[3];

                uvs[i * 2 + 1] =
                    v[4];
            }
        );

        const geometry =
            new THREE.BufferGeometry();

        geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(
                positions,
                3
            )
        );

        geometry.setAttribute(
            "uv",
            new THREE.BufferAttribute(
                uvs,
                2
            )
        );

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return geometry;
    }

    function createRamp(
        options = {}
    ) {
        const width =
            Number(options.width) || 4;

        const height =
            Number(options.height) || 2;

        const depth =
            Number(options.depth) || 6;

        const mesh =
            new THREE.Mesh(
                createRampGeometry(
                    width,
                    height,
                    depth
                ),
                materials()
                    .createMaterial({
                        repeatX:
                            Math.max(
                                1,
                                width / 4
                            ),
                        repeatY:
                            Math.max(
                                1,
                                depth / 4
                            )
                    })
            );

        mesh.position.set(
            Number(options.x) || 0,
            Number(options.y) || 0,
            Number(options.z) || 0
        );

        return tag(
            mesh,
            "blockout_ramp",
            options.label ||
            "Blockout Ramp"
        );
    }

    function createStairs(
        options = {}
    ) {
        const steps =
            Math.max(
                1,
                Math.floor(
                    Number(options.steps) ||
                    7
                )
            );

        const width =
            Number(options.width) || 4;

        const stepHeight =
            Number(
                options.stepHeight
            ) || 0.3;

        const stepDepth =
            Number(
                options.stepDepth
            ) || 0.45;

        const group =
            new THREE.Group();

        group.position.set(
            Number(options.x) || 0,
            Number(options.y) || 0,
            Number(options.z) || 0
        );

        for (
            let i = 0;
            i < steps;
            i++
        ) {
            const depth =
                stepDepth *
                (i + 1);

            const step =
                new THREE.Mesh(
                    createBoxGeometry(
                        width,
                        stepHeight,
                        depth
                    ),
                    materials()
                        .materialForDimensions(
                            width,
                            stepHeight,
                            depth
                        )
                );

            step.position.set(
                0,
                stepHeight * 0.5 +
                    stepHeight * i,
                stepDepth * 0.5 * i
            );

            step.castShadow = true;
            step.receiveShadow = true;

            step.userData = {
                ...(step.userData || {}),
                isGameDevShape: true,
                isBlockout: true,
                primitiveType:
                    "stair_step"
            };

            group.add(step);
        }

        return tag(
            group,
            "blockout_stairs",
            options.label ||
            "Blockout Stairs"
        );
    }

    function spawn(
        type,
        options = {}
    ) {
        let object = null;

        switch (
            String(type || "")
                .toLowerCase()
        ) {
            case "box":
                object =
                    createBox(options);
                break;

            case "floor":
                object =
                    createFloor(options);
                break;

            case "wall":
                object =
                    createWall(options);
                break;

            case "ramp":
                object =
                    createRamp(options);
                break;

            case "stairs":
                object =
                    createStairs(options);
                break;

            default:
                console.warn(
                    "[SMGameDevShapeFactory] Unknown shape:",
                    type
                );
                return null;
        }

        return addToScene(
            object,
            options.label
        );
    }

    global.SMGameDevShapeFactory = {
        createBox,
        createFloor,
        createWall,
        createRamp,
        createStairs,
        spawn
    };

    console.log(
        "[SMGameDevShapeFactory] Ready - shapes use arena wall texture."
    );
})(window);
