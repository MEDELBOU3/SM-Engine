// ============================================================================
// assets/addObject/scene-objects/game-mode-meshes/SMShapeMaterialLibrary.js
// Game shapes use the EXISTING wall grid material from grid-materials-obstacles.
// No texture generator exists in this file.
// ============================================================================
(function (global) {
    "use strict";

    if (global.SMShapeMaterialLibrary) return;

    function requireWallMaterialFactory() {
        if (
            typeof global.SMGetGameDevWallMaterial ===
            "function"
        ) {
            return global.SMGetGameDevWallMaterial;
        }

        throw new Error(
            "[SMShapeMaterialLibrary] " +
            "SMGetGameDevWallMaterial() is missing. " +
            "Load engine/grid-materials-obstacles.js first."
        );
    }

    function createMaterial(options = {}) {
        const getWallMaterial =
            requireWallMaterialFactory();

        return getWallMaterial({
            repeatX:
                options.repeatX ?? 1,
            repeatY:
                options.repeatY ??
                options.repeatX ??
                1
        });
    }

    function materialForDimensions(
        width = 1,
        height = 1,
        depth = 1,
        options = {}
    ) {
        /*
         * Box-like game shapes use createBoxWithCustomUVs() from
         * grid-materials-obstacles.js, exactly like the arena walls.
         *
         * Therefore material repeat stays 1 by default.
         * UV world scaling is handled by the geometry itself.
         */
        return createMaterial({
            repeatX:
                options.repeatX ?? 1,
            repeatY:
                options.repeatY ?? 1
        });
    }

    function apply(
        root,
        options = {}
    ) {
        if (!root) return root;

        root.traverse?.(
            child => {
                if (!child.isMesh) {
                    return;
                }

                child.material =
                    createMaterial(options);

                child.castShadow = true;
                child.receiveShadow = true;
            }
        );

        if (root.isMesh) {
            root.material =
                createMaterial(options);

            root.castShadow = true;
            root.receiveShadow = true;
        }

        return root;
    }

    global.SMShapeMaterialLibrary = {
        createMaterial,
        materialForDimensions,
        apply,

        getWallTexture(options = {}) {
            if (
                typeof global.SMGetGameDevWallTexture !==
                "function"
            ) {
                return null;
            }

            return global.SMGetGameDevWallTexture(
                options
            );
        }
    };

    console.log(
        "[SMShapeMaterialLibrary] Ready - using existing GAME_DEV wall material."
    );
})(window);